import { NextRequest, NextResponse } from 'next/server';
import {
  attachRefreshedCustomerSession,
  authenticateCustomer,
  requestHasSameOrigin,
} from '../../../../lib/customer-auth';
import {
  accessCodeMatches,
  hashEcoAccessCode,
  normalizeKenyanPhone,
} from '../../../../lib/eco-rewards';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { checkRateLimit, getClientAddress } from '../../../../lib/rate-limit';
import { checkMemoryRateLimit } from '../../../../lib/memory-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requestHasSameOrigin(req)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  const auth = await authenticateCustomer(req);
  if (!auth.user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const rateKey = `customer-rewards-link:${auth.user.id}:${getClientAddress(req.headers)}`;
  let allowed = false;
  try {
    allowed = await checkRateLimit({ key: rateKey, limit: 8, windowSeconds: 15 * 60 });
  } catch {
    allowed = checkMemoryRateLimit({ key: rateKey, limit: 8, windowSeconds: 15 * 60 });
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes.' }, { status: 429 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  let phone: string;
  try {
    phone = normalizeKenyanPhone(String(raw.phone || ''));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const code = String(raw.code || '').trim();
  if (code.length < 6 || code.length > 32) {
    return NextResponse.json({ error: 'Enter your Eco-Rewards access code' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: account } = await supabase
    .from('eco_reward_accounts')
    .select('id, access_code_hash, active, customer_user_id')
    .eq('phone', phone)
    .maybeSingle();
  const secret = process.env.ECO_REWARDS_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const suppliedHash = hashEcoAccessCode(phone, code, secret);
  if (!account || !account.active || !accessCodeMatches(account.access_code_hash, suppliedHash)) {
    return NextResponse.json({ error: 'Phone number or access code is incorrect' }, { status: 401 });
  }
  if (account.customer_user_id && account.customer_user_id !== auth.user.id) {
    return NextResponse.json({ error: 'This rewards card is already linked to another account' }, { status: 409 });
  }

  const { error } = await supabase
    .from('eco_reward_accounts')
    .update({ customer_user_id: auth.user.id })
    .eq('id', account.id);
  if (error) return NextResponse.json({ error: 'We could not link the rewards card' }, { status: 503 });

  return attachRefreshedCustomerSession(
    NextResponse.json({ success: true, message: 'Your Eco-Rewards card is now linked.' }),
    auth,
  );
}
