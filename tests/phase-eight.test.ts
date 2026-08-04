import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production headers protect every route and private owner desk', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const globalHeaders = config.headers.find((entry: { source: string }) => entry.source === '/(.*)').headers;
  const names = new Set(globalHeaders.map((header: { key: string }) => header.key));
  assert.ok(names.has('Content-Security-Policy'));
  assert.ok(names.has('X-Content-Type-Options'));
  assert.ok(names.has('Referrer-Policy'));
  assert.ok(names.has('Permissions-Policy'));
  assert.ok(config.headers.some((entry: { source: string; headers: Array<{ key: string; value: string }> }) =>
    entry.source === '/eco-rewards-admin'
      && entry.headers.some((header) => header.key === 'X-Robots-Tag' && header.value.includes('noindex'))));
});

test('crawler files expose public pages but exclude private and API routes', async () => {
  const [robots, sitemap] = await Promise.all([
    readFile(new URL('../website/robots.txt', import.meta.url), 'utf8'),
    readFile(new URL('../website/sitemap.xml', import.meta.url), 'utf8'),
  ]);
  assert.match(robots, /Disallow: \/eco-rewards-admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/essenshea\.vercel\.app\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/essenshea\.vercel\.app\/shop<\/loc>/);
  assert.doesNotMatch(sitemap, /eco-rewards-admin/);
});

test('Phase 8 reconciliation migration is idempotent and private', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/202608040001_phase_eight_production_readiness.sql', import.meta.url),
    'utf8',
  );
  for (const table of ['agent_conversation_messages', 'owner_agent_memory', 'owner_agent_events']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.match(sql, /if to_regclass\('cron\.job'\) is not null/);
});

test('health route checks every launch-critical data dependency', async () => {
  const route = await readFile(new URL('../app/api/health/route.ts', import.meta.url), 'utf8');
  for (const table of [
    'orders', 'order_items', 'operational_events', 'analytics_events',
    'agent_conversation_messages', 'owner_agent_memory', 'owner_agent_events',
    'catalog_overrides', 'eco_reward_accounts',
  ]) {
    assert.match(route, new RegExp(`'${table}'`));
  }
  assert.match(route, /status: ready \? 200 : 503/);
  assert.match(route, /'Cache-Control': 'no-store'/);
});
