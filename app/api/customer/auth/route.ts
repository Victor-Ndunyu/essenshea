import { NextRequest, NextResponse } from 'next/server';
import {
  attachCustomerSession,
  clearCustomerSession,
  cleanCustomerText,
  createCustomerAuthClient,
  requestHasSameOrigin,
} from '../../../../lib/customer-auth';
import { checkMemoryRateLimit } from '../../../../lib/memory-rate-limit';
import { checkRateLimit, getClientAddress } from '../../../../lib/rate-limit';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validEmail(value: unknown) {
  const email = cleanCustomerText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

async function allowedAttempt(req: NextRequest) {
  const key = `customer-auth:${getClientAddress(req.headers)}`;
  try {
    return await checkRateLimit({ key, limit: 12, windowSeconds: 15 * 60 });
  } catch {
    return checkMemoryRateLimit({ key, limit: 12, windowSeconds: 15 * 60 });
  }
}

export async function POST(req: NextRequest) {
  if (!requestHasSameOrigin(req)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  if (!(await allowedAttempt(req))) {
    return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes.' }, { status: 429 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const action = cleanCustomerText(raw.action, 20).toLowerCase();
  if (action === 'signout') {
    return clearCustomerSession(NextResponse.json({ success: true }));
  }

  const email = validEmail(raw.email);
  if (!email) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });

  const authClient = createCustomerAuthClient();
  if (action === 'recover') {
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin}/account`;
    const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return NextResponse.json({ error: 'We could not send the reset email' }, { status: 400 });
    return NextResponse.json({ success: true, message: 'Check your email for a secure reset link.' });
  }

  const password = typeof raw.password === 'string' ? raw.password : '';
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'Password must be between 8 and 128 characters' }, { status: 400 });
  }

  if (action === 'signup') {
    const fullName = cleanCustomerText(raw.fullName, 120);
    if (fullName.length < 2) {
      return NextResponse.json({ error: 'Enter your full name' }, { status: 400 });
    }
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message || 'We could not create your account' }, { status: 400 });
    }

    await getSupabaseAdmin().from('customer_profiles').upsert({
      user_id: data.user.id,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    });

    if (!data.session) {
      return NextResponse.json({
        success: true,
        requiresConfirmation: true,
        message: 'Account created. Check your email to confirm it, then sign in.',
      });
    }
    return attachCustomerSession(
      NextResponse.json({ success: true, message: 'Welcome to your Essenshea account.' }),
      data.session,
    );
  }

  if (action !== 'signin') {
    return NextResponse.json({ error: 'Unsupported account action' }, { status: 400 });
  }

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return NextResponse.json({ error: 'Email or password is incorrect' }, { status: 401 });
  }
  return attachCustomerSession(
    NextResponse.json({ success: true, message: 'Welcome back.' }),
    data.session,
  );
}

