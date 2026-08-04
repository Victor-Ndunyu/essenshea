import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Telegram is owner-only and never falls through to the customer agent', async () => {
  const route = await readFile(new URL('../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8');
  assert.match(route, /chatType === 'private'/);
  assert.match(route, /senderId === chatId/);
  assert.match(route, /private owner desk/);
  assert.match(route, /userMessage\.toLowerCase\(\) === '\/id'/);
  assert.doesNotMatch(route, /callBusinessAgent/);
  assert.doesNotMatch(route, /getOrCreateSession/);
});

test('owner configuration documents an allowlist and transfer-safe threshold', async () => {
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(env, /^OWNER_TELEGRAM_CHAT_IDS=$/m);
  assert.match(env, /^OWNER_LOW_STOCK_THRESHOLD=3$/m);
});

test('owner context covers live and static business data without customer contact fields', async () => {
  const source = await readFile(new URL('../lib/owner-data.ts', import.meta.url), 'utf8');
  for (const table of ['site_reviews', 'orders', 'eco_reward_accounts', 'eco_reward_benefits']) {
    assert.match(source, new RegExp(`'${table}'`));
  }
  assert.match(source, /getMergedCatalog\(\{ includeHidden: true \}\)/);
  assert.match(source, /loadPublicPageText/);
  assert.doesNotMatch(source, /customer_phone|customer_email|customer_contact/);
});

test('owner mutations use expiring one-time audit tokens', async () => {
  const source = await readFile(new URL('../lib/owner-agent.ts', import.meta.url), 'utf8');
  assert.match(source, /ACTION_TTL_MINUTES = 10/);
  assert.match(source, /owner_action_pending/);
  assert.match(source, /owner_action_applying/);
  assert.match(source, /owner_action_applied/);
  assert.match(source, /eq\('event_type', 'owner_action_pending'\)/);
});
