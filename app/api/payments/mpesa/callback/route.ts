import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CallbackItem = { Name?: string; Value?: string | number };

export async function POST(req: NextRequest) {
  let callback: any;
  try {
    const body = await req.json();
    callback = body?.Body?.stkCallback;
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid callback' }, { status: 400 });
  }
  const checkoutRequestId = String(callback?.CheckoutRequestID || '');
  const merchantRequestId = String(callback?.MerchantRequestID || '');
  const resultCode = Number(callback?.ResultCode);
  if (!checkoutRequestId || !Number.isInteger(resultCode)) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid callback' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: payment, error } = await supabase
    .from('mpesa_payments')
    .select('id, order_id, amount, status')
    .eq('checkout_request_id', checkoutRequestId)
    .maybeSingle();
  if (error || !payment) {
    console.error('Unmatched M-Pesa callback:', checkoutRequestId, error?.message);
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
  if (payment.status === 'paid') return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const items: CallbackItem[] = callback?.CallbackMetadata?.Item || [];
  const metadata = Object.fromEntries(items.filter((item) => item?.Name).map((item) => [item.Name, item.Value]));
  const receivedAmount = Number(metadata.Amount);
  const amountMatches = resultCode !== 0 || (Number.isFinite(receivedAmount) && receivedAmount === Number(payment.amount));
  const paid = resultCode === 0 && amountMatches && typeof metadata.MpesaReceiptNumber === 'string';
  const status = paid ? 'paid' : 'failed';

  await supabase.from('mpesa_payments').update({
    merchant_request_id: merchantRequestId || null,
    status,
    result_code: resultCode,
    result_description: String(callback?.ResultDesc || ''),
    mpesa_receipt_number: paid ? metadata.MpesaReceiptNumber : null,
    transaction_date: metadata.TransactionDate ? String(metadata.TransactionDate) : null,
    phone_number: metadata.PhoneNumber ? String(metadata.PhoneNumber) : null,
    callback_payload: callback,
    completed_at: new Date().toISOString(),
  }).eq('id', payment.id).eq('status', 'pending');

  await supabase.from('orders').update({ payment_status: status }).eq('id', payment.order_id);
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

