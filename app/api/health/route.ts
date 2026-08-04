import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUIRED_TABLES = [
  'orders',
  'order_items',
  'operational_events',
  'analytics_events',
  'agent_conversation_messages',
  'owner_agent_memory',
  'owner_agent_events',
  'catalog_overrides',
  'eco_reward_accounts',
] as const;

export async function GET() {
  const startedAt = Date.now();
  const envReady = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const checks: Record<string, boolean> = { environment: envReady };

  if (envReady) {
    const supabase = getSupabaseAdmin();
    await Promise.all(REQUIRED_TABLES.map(async (table) => {
      const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
      checks[table] = !error;
    }));
  } else {
    REQUIRED_TABLES.forEach((table) => { checks[table] = false; });
  }

  const ready = Object.values(checks).every(Boolean);
  console.info(JSON.stringify({
    level: ready ? 'info' : 'error',
    message: 'readiness_check',
    ready,
    checks,
    durationMs: Date.now() - startedAt,
  }));

  return NextResponse.json(
    { status: ready ? 'ready' : 'degraded', checks },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
