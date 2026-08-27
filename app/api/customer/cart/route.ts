import { NextRequest, NextResponse } from 'next/server';
import {
  attachRefreshedCustomerSession,
  authenticateCustomer,
  cleanCustomerText,
  requestHasSameOrigin,
} from '../../../../lib/customer-auth';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanCartItems(value: unknown) {
  if (!Array.isArray(value)) return null;
  if (value.length > 50) return null;
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const id = cleanCustomerText(item.id, 180);
    const title = cleanCustomerText(item.title, 180);
    const quantity = Number(item.quantity);
    if (!id || !title || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
    return {
      id,
      slug: cleanCustomerText(item.slug, 180) || null,
      title,
      quantity,
      priceText: cleanCustomerText(item.priceText, 80) || 'Price on request',
      unitPrice: item.unitPrice !== null && item.unitPrice !== undefined && item.unitPrice !== '' && Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0
        ? Number(item.unitPrice)
        : null,
      available: item.available === true,
    };
  });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateCustomer(req);
  if (!auth.user) return NextResponse.json({ authenticated: false, items: [] }, { status: 401 });
  const { data } = await getSupabaseAdmin()
    .from('customer_carts')
    .select('items, updated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  return attachRefreshedCustomerSession(
    NextResponse.json({ authenticated: true, items: data?.items || [], updatedAt: data?.updated_at || null }),
    auth,
  );
}

export async function PUT(req: NextRequest) {
  if (!requestHasSameOrigin(req)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  const auth = await authenticateCustomer(req);
  if (!auth.user) return NextResponse.json({ error: 'Sign in to sync your cart' }, { status: 401 });
  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const items = cleanCartItems(raw.items);
  if (!items || items.some((item) => item === null)) {
    return NextResponse.json({ error: 'Cart data is invalid' }, { status: 400 });
  }
  const { error } = await getSupabaseAdmin().from('customer_carts').upsert({
    user_id: auth.user.id,
    items,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: 'We could not sync your cart' }, { status: 503 });
  return attachRefreshedCustomerSession(NextResponse.json({ success: true }), auth);
}
