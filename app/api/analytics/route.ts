import { NextRequest, NextResponse } from 'next/server';
import { validateAnalyticsEvent } from '../../../lib/analytics';
import { checkMemoryRateLimit } from '../../../lib/memory-rate-limit';
import { checkRateLimit, getClientAddress } from '../../../lib/rate-limit';
import { getSupabaseAdmin } from '../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientAddress(req.headers);
  try {
    let allowed = false;
    try {
      allowed = await checkRateLimit({ key: `analytics:${ip}`, limit: 90, windowSeconds: 15 * 60 });
    } catch {
      allowed = checkMemoryRateLimit({ key: `analytics:${ip}`, limit: 90, windowSeconds: 15 * 60 });
    }
    if (!allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });

    const event = validateAnalyticsEvent(await req.json());
    const { error } = await getSupabaseAdmin().from('analytics_events').insert({
      event_type: event.eventType,
      product_slug: event.productSlug,
      category_slug: event.categorySlug,
      search_term: event.searchTerm,
      metadata: event.metadata,
    });
    if (error) throw error;
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /analytics event|search term/i.test(error.message))) {
      return NextResponse.json({ error: 'Invalid analytics event' }, { status: 400 });
    }
    console.error('Analytics event persistence failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Analytics unavailable' }, { status: 503 });
  }
}
