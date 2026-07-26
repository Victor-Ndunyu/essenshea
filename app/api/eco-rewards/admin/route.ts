import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashEcoAccessCode, normalizeKenyanPhone } from '../../../../lib/eco-rewards';
import { checkRateLimit, getClientAddress } from '../../../../lib/rate-limit';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const expected = process.env.ECO_REWARDS_ADMIN_KEY || '';
  const supplied = req.headers.get('x-eco-admin-key') || '';
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function guard(req: NextRequest) {
  const ip = getClientAddress(req.headers);
  const allowed = await checkRateLimit({ key: `eco-admin:${ip}`, limit: 60, windowSeconds: 15 * 60 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!authorized(req)) return NextResponse.json({ error: 'Owner access is required' }, { status: 401 });
  return null;
}

function cleanText(value: unknown, max: number): string {
  return String(value || '').trim().slice(0, max);
}

export async function GET(req: NextRequest) {
  const rejected = await guard(req);
  if (rejected) return rejected;
  const supabase = getSupabaseAdmin();
  const accountId = req.nextUrl.searchParams.get('accountId')?.trim();
  if (accountId) {
    const [{ data: account }, { data: benefits }, { data: refills }] = await Promise.all([
      supabase
        .from('eco_reward_accounts')
        .select('id, customer_name, phone, current_punches, active, consented_at, updated_at')
        .eq('id', accountId)
        .maybeSingle(),
      supabase
        .from('eco_reward_benefits')
        .select('id, reward_type, status, earned_at, redeemed_at, redeemed_on_product')
        .eq('account_id', accountId)
        .order('earned_at', { ascending: false }),
      supabase
        .from('eco_reward_refills')
        .select('id, submitted_containers, accepted_containers, status, rejection_reason, payment_confirmed, product_name, fulfilment_method, notes, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    if (!account) return NextResponse.json({ error: 'Eco-Rewards account not found' }, { status: 404 });
    return NextResponse.json({ account, benefits: benefits || [], refills: refills || [] });
  }
  const search = req.nextUrl.searchParams.get('search')?.trim() || '';
  let query = supabase
    .from('eco_reward_accounts')
    .select('id, customer_name, phone, current_punches, active, consented_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (search) {
    const safe = search.replace(/[%_,()]/g, '');
    query = query.or(`customer_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Could not load Eco-Rewards accounts' }, { status: 503 });
  return NextResponse.json({ accounts: data });
}

export async function POST(req: NextRequest) {
  const rejected = await guard(req);
  if (rejected) return rejected;
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const action = cleanText((raw as Record<string, unknown>).action, 30);
  const body = raw as Record<string, unknown>;
  const supabase = getSupabaseAdmin();

  if (action === 'create_account') {
    const customerName = cleanText(body.customerName, 120);
    if (customerName.length < 2) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    let phone: string;
    try {
      phone = normalizeKenyanPhone(cleanText(body.phone, 30));
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    if (body.consent !== true) {
      return NextResponse.json({ error: 'Customer consent must be recorded' }, { status: 400 });
    }
    const accessCode = randomBytes(5).toString('hex').toUpperCase();
    const secret = process.env.ECO_REWARDS_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const { data, error } = await supabase
      .from('eco_reward_accounts')
      .insert({
        customer_name: customerName,
        phone,
        access_code_hash: hashEcoAccessCode(phone, accessCode, secret),
        consented_at: new Date().toISOString(),
        consent_source: ['shop', 'website', 'whatsapp'].includes(String(body.consentSource))
          ? body.consentSource
          : 'shop',
      })
      .select('id, customer_name, phone, current_punches')
      .single();
    if (error) {
      const duplicate = error.code === '23505';
      return NextResponse.json(
        { error: duplicate ? 'This phone number already has an Eco-Rewards account' : 'Could not create account' },
        { status: duplicate ? 409 : 503 },
      );
    }
    return NextResponse.json({ account: data, accessCode }, { status: 201 });
  }

  if (action === 'record_refill') {
    const accountId = cleanText(body.accountId, 50);
    const submitted = Number(body.submittedContainers);
    const accepted = Number(body.acceptedContainers);
    const rejectionReason = cleanText(body.rejectionReason, 30) || null;
    const { data, error } = await supabase.rpc('record_eco_reward_refill', {
      p_account_id: accountId,
      p_submitted_containers: submitted,
      p_accepted_containers: accepted,
      p_payment_confirmed: body.paymentConfirmed === true,
      p_product_name: cleanText(body.productName, 160),
      p_fulfilment_method: body.fulfilmentMethod === 'delivery' ? 'delivery' : 'pickup',
      p_approved_by: 'brand_owner',
      p_rejection_reason: rejectionReason,
      p_notes: cleanText(body.notes, 500),
      p_order_id: null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  }

  if (action === 'redeem_reward') {
    const rewardId = cleanText(body.rewardId, 50);
    const product = cleanText(body.productName, 160);
    if (!product) return NextResponse.json({ error: 'Choose the refill product' }, { status: 400 });
    const { data, error } = await supabase
      .from('eco_reward_benefits')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_on_product: product })
      .eq('id', rewardId)
      .eq('status', 'available')
      .select('id')
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Reward is unavailable or already redeemed' }, { status: 409 });
    return NextResponse.json({ success: true });
  }

  if (action === 'delete_account') {
    const accountId = cleanText(body.accountId, 50);
    if (!accountId) return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    const { error: benefitsError } = await supabase
      .from('eco_reward_benefits')
      .delete()
      .eq('account_id', accountId);
    if (benefitsError) return NextResponse.json({ error: 'Could not remove benefits' }, { status: 503 });
    const { error: refillsError } = await supabase
      .from('eco_reward_refills')
      .delete()
      .eq('account_id', accountId);
    if (refillsError) return NextResponse.json({ error: 'Could not remove refills' }, { status: 503 });
    const { error: accountError } = await supabase
      .from('eco_reward_accounts')
      .delete()
      .eq('id', accountId);
    if (accountError) return NextResponse.json({ error: 'Could not delete account' }, { status: 503 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown Eco-Rewards action' }, { status: 400 });
}
