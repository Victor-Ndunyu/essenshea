import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase-admin';
import { checkRateLimit, getClientAddress } from '../../../lib/rate-limit';
import { secretsMatch } from '../../../lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanText(value: unknown, max: number): string {
  return String(value || '').trim().slice(0, max);
}

function authorized(req: NextRequest): boolean {
  const expected = process.env.ECO_REWARDS_ADMIN_KEY || '';
  const supplied = req.headers.get('x-eco-admin-key') || '';
  if (!expected || !supplied) return false;
  return secretsMatch(supplied, expected);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 0, 0), 100);
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('site_reviews')
    .select('id, author, role, text, created_at')
    .eq('is_visible', true)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: false });
  if (limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Could not load reviews' }, { status: 503 });
  return NextResponse.json({ reviews: data || [] });
}

export async function POST(req: NextRequest) {
  const ip = getClientAddress(req.headers);
  const allowed = await checkRateLimit({ key: `reviews-admin:${ip}`, limit: 30, windowSeconds: 60 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!authorized(req)) return NextResponse.json({ error: 'Owner access is required' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const body = raw as Record<string, unknown>;
  const action = cleanText(body.action, 30);

  if (action === 'add') {
    const author = cleanText(body.author, 120);
    const role = cleanText(body.role, 120);
    const text = cleanText(body.text, 2000);
    if (!author || !text) return NextResponse.json({ error: 'Author and text are required' }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('site_reviews')
      .insert({ author, role, text, source: 'telegram' })
      .select('id, author, role, text')
      .single();
    if (error) return NextResponse.json({ error: 'Could not save review' }, { status: 503 });
    return NextResponse.json({ review: data }, { status: 201 });
  }

  if (action === 'list') {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('site_reviews')
      .select('id, author, role, text, is_visible, order_index, created_at')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: 'Could not load reviews' }, { status: 503 });
    return NextResponse.json({ reviews: data || [] });
  }

  if (action === 'hide') {
    const id = cleanText(body.reviewId, 60);
    if (!id) return NextResponse.json({ error: 'Review ID is required' }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('site_reviews').update({ is_visible: false }).eq('id', id);
    if (error) return NextResponse.json({ error: 'Could not hide review' }, { status: 503 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
