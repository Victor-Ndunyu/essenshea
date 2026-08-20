import { NextRequest, NextResponse } from 'next/server';
import { createOrderReference } from '../../../lib/order-reference';
import {
  MAX_REQUEST_BYTES,
  requestBodyIsTooLarge,
  validateOrderPayload,
  ValidationError,
} from '../../../lib/order-validation';
import { getClientAddress, checkRateLimit } from '../../../lib/rate-limit';
import { checkMemoryRateLimit } from '../../../lib/memory-rate-limit';
import { notifyOwnerOfOrder, sendOperationalAlert } from '../../../lib/notifications';
import { getSupabaseAdmin } from '../../../lib/supabase-admin';
import {
  attachRefreshedCustomerSession,
  authenticateCustomer,
} from '../../../lib/customer-auth';
import { priceOrderForPayment } from '../../../lib/order-pricing';
import { initiateStkPush } from '../../../lib/mpesa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function response(body: Record<string, unknown>, status: number, retryAfter?: number) {
  const headers = retryAfter ? { 'Retry-After': String(retryAfter) } : undefined;
  return NextResponse.json(body, { status, headers });
}

function buildOwnerAlert(
  reference: string,
  order: ReturnType<typeof validateOrderPayload>,
): string {
  const lines = order.items.map(
    (item) => `- ${item.quantity} × ${item.title} (${item.priceText})`,
  );
  return [
    `New Essenshea ${order.type.replace(/_/g, ' ')} - ${reference}`,
    '',
    `Customer: ${order.customer.name}`,
    `Contact: ${order.customer.contact}`,
    `Preferred contact: ${order.customer.preferredContact}`,
    `Fulfilment: ${order.customer.fulfilmentMethod}`,
    order.customer.deliveryLocation ? `Location: ${order.customer.deliveryLocation}` : '',
    order.customer.notes ? `Notes: ${order.customer.notes}` : '',
    `Eco-Rewards: ${order.customer.ecoRewardsOptIn ? 'Opted in' : 'Not opted in'}`,
    '',
    'Items:',
    ...lines,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function POST(req: NextRequest) {
  if (requestBodyIsTooLarge(req.headers.get('content-length'))) {
    return response({ error: `Request exceeds the ${MAX_REQUEST_BYTES}-byte limit` }, 413);
  }

  let order: ReturnType<typeof validateOrderPayload>;
  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
      return response({ error: `Request exceeds the ${MAX_REQUEST_BYTES}-byte limit` }, 413);
    }
    order = validateOrderPayload(JSON.parse(rawBody));
  } catch (error) {
    if (error instanceof ValidationError) return response({ error: error.message }, 400);
    return response({ error: 'The order request is not valid JSON' }, 400);
  }

  let totalAmount: number | null = null;
  if (order.paymentMethod === 'mpesa') {
    if (!order.customer.phone) {
      return response({ error: 'A Safaricom phone number is required for M-Pesa payment' }, 400);
    }
    try {
      const priced = await priceOrderForPayment(order.items);
      order = { ...order, items: priced.items };
      totalAmount = priced.total;
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : 'This cart cannot be paid online yet' }, 400);
    }
  }

  const ip = getClientAddress(req.headers);
  try {
    const allowed = await checkRateLimit({
      key: `orders:${ip}`,
      limit: 8,
      windowSeconds: 15 * 60,
    });
    if (!allowed) {
      return response(
        { error: 'Too many requests. Please wait a few minutes or contact us on WhatsApp.' },
        429,
        900,
      );
    }
  } catch (error) {
    console.error('Order rate-limit error:', error);
    const allowed = checkMemoryRateLimit({
      key: `orders:${ip}`,
      limit: 8,
      windowSeconds: 15 * 60,
    });
    if (!allowed) {
      return response(
        { error: 'Too many requests. Please wait a few minutes or contact us on WhatsApp.' },
        429,
        900,
      );
    }
  }

  const customerAuth = await authenticateCustomer(req);
  const supabase = getSupabaseAdmin();
  const reference = createOrderReference();
  const { data: storedOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      reference,
      order_type: order.type,
      source: order.source,
      status: 'new',
      customer_name: order.customer.name,
      customer_phone: order.customer.phone,
      customer_email: order.customer.email,
      customer_contact: order.customer.contact,
      preferred_contact: order.customer.preferredContact,
      fulfilment_method: order.customer.fulfilmentMethod,
      delivery_location: order.customer.deliveryLocation,
      customer_notes: order.customer.notes,
      eco_rewards_opt_in: order.customer.ecoRewardsOptIn,
      total_amount: totalAmount,
      payment_method: order.paymentMethod,
      payment_status: order.paymentMethod === 'mpesa' ? 'awaiting_payment' : 'awaiting_confirmation',
      customer_user_id: customerAuth.user?.id || null,
      eco_rewards_eligible_until: null,
      data_retention_until: null,
      notification_status: 'pending',
    })
    .select('id, reference')
    .single();

  if (orderError || !storedOrder) {
    console.error('Order persistence failed:', orderError?.message);
    return response(
      { error: 'We could not safely save your request. Please contact Essenshea on WhatsApp.' },
      503,
    );
  }

  const { error: itemError } = await supabase.from('order_items').insert(
    order.items.map((item) => ({
      order_id: storedOrder.id,
      product_slug: item.productSlug,
      title: item.title,
      quantity: item.quantity,
      price_text: item.priceText,
      unit_price: item.unitPrice,
    })),
  );

  if (itemError) {
    console.error(`Order ${reference} item persistence failed:`, itemError.message);
    await supabase.from('orders').delete().eq('id', storedOrder.id);
    return response(
      { error: 'We could not safely save every item. Please contact Essenshea on WhatsApp.' },
      503,
    );
  }

  await supabase.from('analytics_events').insert({
    event_type: 'order_submitted',
    metadata: {
      source: order.source,
      itemCount: order.items.reduce((total, item) => total + item.quantity, 0),
      productSlugs: order.items.map((item) => item.productSlug).filter(Boolean).slice(0, 25),
      fulfilmentMethod: order.customer.fulfilmentMethod,
    },
  }).then(({ error }) => {
    if (error) console.error('Order analytics persistence failed:', error.message);
  });

  const alertText = buildOwnerAlert(reference, order);
  const attempts = await notifyOwnerOfOrder({
    orderId: storedOrder.id,
    reference,
    text: alertText,
  });
  const delivered = attempts.some((attempt) => attempt.delivered);

  await supabase
    .from('orders')
    .update({
      notification_status: delivered ? 'delivered' : 'failed',
      notified_at: delivered ? new Date().toISOString() : null,
    })
    .eq('id', storedOrder.id);

  let payment: null | { checkoutRequestId: string; customerMessage: string } = null;
  let paymentError: string | null = null;
  if (order.paymentMethod === 'mpesa' && totalAmount && order.customer.phone) {
    try {
      const stk = await initiateStkPush({
        amount: totalAmount,
        phone: order.customer.phone,
        reference,
      });
      const { error: paymentInsertError } = await supabase.from('mpesa_payments').insert({
        order_id: storedOrder.id,
        checkout_request_id: stk.checkoutRequestId,
        merchant_request_id: stk.merchantRequestId,
        amount: totalAmount,
        phone_number: order.customer.phone.replace(/\D/g, ''),
        status: 'pending',
      });
      if (paymentInsertError) throw new Error('The payment prompt was sent but its tracking record could not be saved');
      payment = { checkoutRequestId: stk.checkoutRequestId, customerMessage: stk.customerMessage };
    } catch (error) {
      paymentError = error instanceof Error ? error.message : 'M-Pesa could not start';
      console.error(`M-Pesa initiation failed for ${reference}:`, paymentError);
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', storedOrder.id);
      await sendOperationalAlert('Essenshea M-Pesa initiation failure', `Order ${reference}: ${paymentError}`);
    }
  }

  if (!delivered) {
    console.error(`All owner notification channels failed for ${reference}`);
    await sendOperationalAlert(
      'Essenshea order notification failure',
      `Order ${reference} is safely stored, but every configured owner notification channel failed.`,
    );
    return response(
      {
        saved: true,
        reference,
        payment,
        paymentError,
        error:
          'Your request was saved, but we could not alert the Essenshea team. Please contact us on WhatsApp and share this reference.',
      },
      503,
    );
  }

  const successResponse = response(
    {
      success: !paymentError,
      saved: true,
      reference,
      payment,
      paymentStatus: payment ? 'pending' : paymentError ? 'failed' : 'awaiting_confirmation',
      message: payment
        ? `Order ${reference} is saved. Check your phone and enter your M-Pesa PIN to pay KES ${totalAmount}.`
        : paymentError
          ? `Order ${reference} is saved, but the M-Pesa prompt could not start. Please try again later or contact Essenshea.`
          : `Request received. Essenshea will confirm availability and payment before delivery. Your reference is ${reference}.`,
      error: paymentError || undefined,
    },
    paymentError ? 502 : 201,
  );
  return attachRefreshedCustomerSession(successResponse, customerAuth);
}
