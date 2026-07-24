import { NextRequest, NextResponse } from 'next/server';
import { createOrderReference } from '../../../lib/order-reference';
import {
  MAX_REQUEST_BYTES,
  requestBodyIsTooLarge,
  validateOrderPayload,
  ValidationError,
} from '../../../lib/order-validation';
import { getClientAddress, checkRateLimit } from '../../../lib/rate-limit';
import { notifyOwnerOfOrder, sendOperationalAlert } from '../../../lib/notifications';
import { getSupabaseAdmin } from '../../../lib/supabase-admin';

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
    `New Essenshea ${order.type.replace(/_/g, ' ')} — ${reference}`,
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
    return response({ error: 'Ordering is temporarily unavailable. Please contact us on WhatsApp.' }, 503);
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

  const supabase = getSupabaseAdmin();
  const reference = createOrderReference();
  const retentionDate = new Date();
  retentionDate.setUTCMonth(retentionDate.getUTCMonth() + 4);

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
      eco_rewards_eligible_until: order.customer.ecoRewardsOptIn
        ? retentionDate.toISOString()
        : null,
      data_retention_until: retentionDate.toISOString(),
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
        error:
          'Your request was saved, but we could not alert the Essenshea team. Please contact us on WhatsApp and share this reference.',
      },
      503,
    );
  }

  return response(
    {
      success: true,
      reference,
      message: `Request received. Essenshea will confirm availability and payment before delivery. Your reference is ${reference}.`,
    },
    201,
  );
}
