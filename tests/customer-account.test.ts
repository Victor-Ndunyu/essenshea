import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('every catalogue source product is published in its matching site category', async () => {
  const catalogueRoot = path.join(root, 'Essenshea_Catalogue');
  const payload = JSON.parse(await readFile(path.join(root, 'website/data/catalog.json'), 'utf8'));
  const published = new Map(
    payload.categories.map((category: { title: string; products: Array<{ name: string }> }) => [
      category.title,
      category.products.map((product) => product.name),
    ]),
  );

  const directories = await readdir(catalogueRoot, { withFileTypes: true });
  let sourceTotal = 0;
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    const files = (await readdir(path.join(catalogueRoot, directory.name))).filter((name) => name.endsWith('.md'));
    assert.equal(files.length, 1, `${directory.name} should have one catalogue source file`);
    const markdown = await readFile(path.join(catalogueRoot, directory.name, files[0]), 'utf8');
    const sourceTitle = markdown.match(/^# (.+)$/m)?.[1];
    const sourceProducts = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    assert.ok(sourceTitle, `${directory.name} needs a category title`);
    assert.deepEqual(
      [...(published.get(sourceTitle!) || [])].sort(),
      [...sourceProducts].sort(),
      `${sourceTitle} is out of sync with the public catalogue`,
    );
    sourceTotal += sourceProducts.length;
  }
  const publishedTotal = payload.categories.reduce(
    (total: number, category: { products: unknown[] }) => total + category.products.length,
    0,
  );
  assert.equal(sourceTotal, 91);
  assert.equal(publishedTotal, sourceTotal);
});

test('customer account storage is ownership-scoped and order history is linked safely', async () => {
  const migration = await readFile(
    path.join(root, 'supabase/migrations/202608120001_customer_accounts.sql'),
    'utf8',
  );
  assert.match(migration, /alter table public\.customer_profiles enable row level security/i);
  assert.match(migration, /alter table public\.customer_carts enable row level security/i);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/i);
  assert.match(migration, /orders\.customer_user_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /auth\.role\(\)/i);
  const lockdown = await readFile(
    path.join(root, 'supabase/migrations/202608120002_customer_auth_lockdown.sql'),
    'utf8',
  );
  assert.match(lockdown, /revoke all on table public\.customer_profiles from anon, authenticated/i);
  assert.match(lockdown, /insert into public\.customer_profiles \(user_id, full_name\)/i);
  assert.doesNotMatch(lockdown, /insert into public\.profiles/i);
  assert.match(lockdown, /set search_path = ''/i);
});

test('account page exposes saved cart, live orders, rewards, preferences and security', async () => {
  const html = await readFile(path.join(root, 'website/account.html'), 'utf8');
  assert.match(html, /id="saved-cart"/);
  assert.match(html, /id="orders"/);
  assert.match(html, /id="rewards"/);
  assert.match(html, /id="preferences"/);
  assert.match(html, /id="change-password-form"/);
  assert.match(html, /account-slideshow/);
  assert.equal((html.match(/data-account-section=/g) || []).length, 5);
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="account-cart-visual"/);
  assert.match(html, />Drop</);
  assert.match(html, />Inspect</);
  assert.match(html, />Sanitise</);
  assert.match(html, />Refill</);
  assert.match(html, /noindex, nofollow/);
  const accountScript = await readFile(path.join(root, 'website/assets/js/account.js'), 'utf8');
  assert.match(accountScript, /essenshea-order-submitted/);
  assert.match(accountScript, /refreshOrderHistory/);
  assert.match(accountScript, /activateAccountSection/);
  assert.match(accountScript, /renderCartVisual/);
  assert.match(accountScript, /\/api\/catalog/);
});

test('cart totals and quantities stay editable in the popup and saved account cart', async () => {
  const [shop, agent, account] = await Promise.all([
    readFile(new URL('../website/assets/js/shop.js', import.meta.url), 'utf8'),
    readFile(new URL('../website/assets/js/agent.js', import.meta.url), 'utf8'),
    readFile(new URL('../website/assets/js/account.js', import.meta.url), 'utf8'),
  ]);
  assert.match(shop, /product-quick-add/);
  assert.match(shop, /unitPrice/);
  assert.match(agent, /cart-popup-total/);
  assert.match(agent, /Estimated total: KSh/);
  assert.match(account, /data-account-cart-action/);
  assert.match(account, /updateSavedCartItem/);
  assert.match(account, /Estimated total: KSh/);
});

test('homepage daily edit covers every catalogue and opens shared shop details', async () => {
  const [html, script] = await Promise.all([
    readFile(path.join(root, 'website/index.html'), 'utf8'),
    readFile(path.join(root, 'website/assets/js/featured-care.js'), 'utf8'),
  ]);
  assert.equal((html.match(/class="collection-tile"/g) || []).length, 9);
  assert.match(html, /id="featured-care-grid"/);
  assert.match(script, /Africa\/Nairobi/);
  assert.match(script, /\/shop\?product=/);
  assert.match(script, /body-oils-and-tonics/);
});

test('friendly care wording replaces ritual language across the storefront', async () => {
  const files = [
    'website/index.html',
    'website/account.html',
    'website/assets/js/featured-care.js',
    'website/assets/js/shop.js',
  ];
  for (const file of files) {
    const content = await readFile(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, /\brituals?\b/i, `${file} still contains ritual wording`);
  }
});

test('About page centres its section copy and uses the botanical hero image', async () => {
  const [html, css] = await Promise.all([
    readFile(path.join(root, 'website/about.html'), 'utf8'),
    readFile(path.join(root, 'website/assets/css/luxury-refinement.css'), 'utf8'),
  ]);
  assert.match(html, /about-section-heading/);
  assert.match(html, /about-philosophy__support/);
  assert.match(html, /lavender_whipped_shea_butter_250ml\.jpg/);
  assert.match(css, /\.about-philosophy \.label,[\s\S]*margin-inline:\s*auto/);
  assert.match(css, /\.about-philosophy \.body,[\s\S]*text-align:\s*center/);
});

test('assistant uses the miniature angel image instead of an emoji glyph', async () => {
  const script = await readFile(path.join(root, 'website/assets/js/agent.js'), 'utf8');
  const icon = await readFile(path.join(root, 'website/assets/images/angel-assistant.svg'), 'utf8');
  assert.match(script, /angel-assistant\.svg/);
  assert.doesNotMatch(script, /&#128519;|😇/);
  assert.match(icon, /<svg/);
});
