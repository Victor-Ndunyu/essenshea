import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const reference = new URL(req.url).searchParams.get('reference')?.trim().slice(0, 40);
  if (!reference) return NextResponse.json({ error: 'Order reference is required' }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('orders').select('payment_status').eq('reference', reference).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({ reference, paymentStatus: data.payment_status }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

