import { NextRequest, NextResponse } from 'next/server';
import {
  attachRefreshedCustomerSession,
  authenticateCustomer,
  cleanCustomerText,
  requestHasSameOrigin,
} from '../../../../lib/customer-auth';
import { rewardLabel } from '../../../../lib/eco-rewards';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateCustomer(req);
  if (!auth.user) return unauthorized();
  const supabase = getSupabaseAdmin();

  const [{ data: profile }, { data: orders }, { data: rewardAccount }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('full_name, phone, preferred_contact, default_fulfilment_method, default_delivery_location, delivery_notes, marketing_consent')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, reference, status, payment_status, fulfilment_method, delivery_location, created_at, order_items(title, quantity, price_text)')
      .eq('customer_user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('eco_reward_accounts')
      .select('id, customer_name, current_punches, updated_at')
      .eq('customer_user_id', auth.user.id)
      .eq('active', true)
      .maybeSingle(),
  ]);

  let rewards = null;
  if (rewardAccount) {
    const [{ data: benefits }, { data: refills }] = await Promise.all([
      supabase
        .from('eco_reward_benefits')
        .select('id, reward_type, status, earned_at, redeemed_at')
        .eq('account_id', rewardAccount.id)
        .order('earned_at', { ascending: false })
        .limit(20),
      supabase
        .from('eco_reward_refills')
        .select('id, accepted_containers, status, product_name, created_at')
        .eq('account_id', rewardAccount.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    rewards = {
      name: rewardAccount.customer_name,
      currentPunches: rewardAccount.current_punches,
      updatedAt: rewardAccount.updated_at,
      benefits: (benefits || []).map((benefit) => ({
        ...benefit,
        label: rewardLabel(benefit.reward_type),
      })),
      refills: refills || [],
    };
  }

  const response = NextResponse.json({
    authenticated: true,
    email: auth.user.email,
    profile: profile || {
      full_name: cleanCustomerText(auth.user.user_metadata?.full_name, 120),
      phone: null,
      preferred_contact: 'whatsapp',
      default_fulfilment_method: 'delivery',
      default_delivery_location: null,
      delivery_notes: null,
      marketing_consent: false,
    },
    orders: orders || [],
    rewards,
  });
  return attachRefreshedCustomerSession(response, auth);
}

export async function PATCH(req: NextRequest) {
  if (!requestHasSameOrigin(req)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  const auth = await authenticateCustomer(req);
  if (!auth.user) return unauthorized();

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const fullName = cleanCustomerText(raw.fullName, 120);
  const phone = cleanCustomerText(raw.phone, 24);
  const preferredContact = cleanCustomerText(raw.preferredContact, 20).toLowerCase();
  const fulfilment = cleanCustomerText(raw.defaultFulfilmentMethod, 20).toLowerCase();
  const location = cleanCustomerText(raw.defaultDeliveryLocation, 200);
  const notes = cleanCustomerText(raw.deliveryNotes, 500);

  if (fullName.length < 2) {
    return NextResponse.json({ error: 'Enter your full name' }, { status: 400 });
  }
  if (phone && !/^\+?[0-9 ()-]{7,24}$/.test(phone)) {
    return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 });
  }
  if (!['phone', 'whatsapp', 'email'].includes(preferredContact)) {
    return NextResponse.json({ error: 'Choose a valid contact preference' }, { status: 400 });
  }
  if (!['delivery', 'pickup', 'discuss'].includes(fulfilment)) {
    return NextResponse.json({ error: 'Choose a valid fulfilment preference' }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from('customer_profiles').upsert({
    user_id: auth.user.id,
    full_name: fullName,
    phone: phone || null,
    preferred_contact: preferredContact,
    default_fulfilment_method: fulfilment,
    default_delivery_location: location || null,
    delivery_notes: notes || null,
    marketing_consent: raw.marketingConsent === true,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: 'We could not save your profile' }, { status: 503 });

  return attachRefreshedCustomerSession(
    NextResponse.json({ success: true, message: 'Your preferences are saved.' }),
    auth,
  );
}

