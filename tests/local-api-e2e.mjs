import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import nextEnv from '@next/env';

const projectDir = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const { loadEnvConfig } = nextEnv;
loadEnvConfig(projectDir);

const port = 3011;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
  {
    cwd: projectDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ORDERS_TELEGRAM_CHAT_ID: '',
      WHATSAPP_ACCESS_TOKEN: '',
      RESEND_API_KEY: '',
    },
  },
);

let serverErrors = '';
server.stderr.on('data', (chunk) => {
  serverErrors += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Local server did not start. ${serverErrors}`);
}

let createdReference = '';
try {
  await waitForServer();

  const invalid = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'cart',
      source: 'phase1_e2e',
      customer: {
        name: 'TEST Codex Phase One',
        phone: '+254700000001',
        preferredContact: 'whatsapp',
        fulfilmentMethod: 'delivery',
        deliveryLocation: 'Nairobi',
        ecoRewardsOptIn: true,
      },
      items: [
        {
          productSlug: 'raw-whipped-shea',
          title: 'TEST Raw Whipped Shea',
          quantity: 1,
          priceText: 'KES 850',
          unitPrice: 850,
        },
      ],
    }),
  });
  const result = await valid.json();
  assert.equal(valid.status, 503);
  assert.equal(result.saved, true);
  assert.match(result.reference, /^ESS-\d{8}-[A-HJ-NP-Z2-9]{4}$/);
  assert.match(result.error, /request was saved/i);
  createdReference = result.reference;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('id, notification_status, data_retention_until, order_items(quantity)')
    .eq('reference', createdReference)
    .single();
  assert.ifError(readError);
  assert.equal(order.notification_status, 'failed');
  assert.equal(order.order_items[0].quantity, 1);
  const retentionDays =
    (new Date(order.data_retention_until).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(retentionDays >= 120 && retentionDays <= 125);

  const { error: cleanupError } = await supabase.from('orders').delete().eq('id', order.id);
  assert.ifError(cleanupError);

  console.log(`Local API E2E passed (${createdReference}, test order removed)`);
} finally {
  server.kill();
}
