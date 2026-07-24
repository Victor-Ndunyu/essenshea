import { NextRequest, NextResponse } from 'next/server';
import { accessCodeMatches, hashEcoAccessCode, normalizeKenyanPhone, rewardLabel } from '../../../../lib/eco-rewards';
import { checkRateLimit, getClientAddress } from '../../../../lib/rate-limit';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientAddress(req.headers);
  if (!(await checkRateLimit({ key: `eco-customer:${ip}`, limit: 10, windowSeconds: 15 * 60 }))) {
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
    .select('id, customer_name, current_punches, access_code_hash, active, updated_at')
    .eq('phone', phone)
    .maybeSingle();

  const secret = process.env.ECO_REWARDS_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const suppliedHash = hashEcoAccessCode(phone, code, secret);
  if (!account || !account.active || !accessCodeMatches(account.access_code_hash, suppliedHash)) {
    return NextResponse.json({ error: 'Phone number or access code is incorrect' }, { status: 401 });
  }

  const [{ data: benefits }, { data: refills }] = await Promise.all([
    supabase
      .from('eco_reward_benefits')
      .select('id, reward_type, status, earned_at, redeemed_at, redeemed_on_product')
      .eq('account_id', account.id)
      .order('earned_at', { ascending: false })
      .limit(25),
    supabase
      .from('eco_reward_refills')
      .select('id, submitted_containers, accepted_containers, status, rejection_reason, product_name, fulfilment_method, created_at')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  return NextResponse.json({
    account: {
      name: account.customer_name,
      currentPunches: account.current_punches,
      nextMilestone: account.current_punches < 2 ? 2 : account.current_punches < 5 ? 5 : 8,
      updatedAt: account.updated_at,
    },
    benefits: (benefits || []).map((benefit) => ({
      ...benefit,
      label: rewardLabel(benefit.reward_type),
    })),
    refills: refills || [],
  });
}
