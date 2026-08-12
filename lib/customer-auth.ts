import { createClient, Session, User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const CUSTOMER_ACCESS_COOKIE = 'essenshea_customer_access';
export const CUSTOMER_REFRESH_COOKIE = 'essenshea_customer_refresh';

type CustomerAuthResult = {
  user: User | null;
  refreshedSession: Session | null;
};

export function createCustomerAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is incomplete');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function authenticateCustomer(req: NextRequest): Promise<CustomerAuthResult> {
  const accessToken = req.cookies.get(CUSTOMER_ACCESS_COOKIE)?.value || '';
  const refreshToken = req.cookies.get(CUSTOMER_REFRESH_COOKIE)?.value || '';
  if (!accessToken && !refreshToken) return { user: null, refreshedSession: null };
  const client = createCustomerAuthClient();

  if (accessToken) {
    const { data } = await client.auth.getUser(accessToken);
    if (data.user) return { user: data.user, refreshedSession: null };
  }

  if (!refreshToken) return { user: null, refreshedSession: null };
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return { user: null, refreshedSession: null };
  return { user: data.user, refreshedSession: data.session };
}

export function attachCustomerSession(response: NextResponse, session: Session) {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(CUSTOMER_ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60, session.expires_in || 3600),
  });
  response.cookies.set(CUSTOMER_REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export function attachRefreshedCustomerSession(
  response: NextResponse,
  auth: CustomerAuthResult,
) {
  return auth.refreshedSession ? attachCustomerSession(response, auth.refreshedSession) : response;
}

export function clearCustomerSession(response: NextResponse) {
  response.cookies.set(CUSTOMER_ACCESS_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  response.cookies.set(CUSTOMER_REFRESH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

export function requestHasSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export function cleanCustomerText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
