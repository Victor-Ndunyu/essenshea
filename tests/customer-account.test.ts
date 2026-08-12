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

test('account page exposes saved cart, orders, rewards and preferences', async () => {
  const html = await readFile(path.join(root, 'website/account.html'), 'utf8');
  assert.match(html, /id="saved-cart"/);
  assert.match(html, /id="orders"/);
  assert.match(html, /id="rewards"/);
  assert.match(html, /id="preferences"/);
  assert.match(html, /noindex, nofollow/);
});

test('assistant uses the miniature angel image instead of an emoji glyph', async () => {
  const script = await readFile(path.join(root, 'website/assets/js/agent.js'), 'utf8');
  const icon = await readFile(path.join(root, 'website/assets/images/angel-assistant.svg'), 'utf8');
  assert.match(script, /angel-assistant\.svg/);
  assert.doesNotMatch(script, /&#128519;|😇/);
  assert.match(icon, /<svg/);
});
