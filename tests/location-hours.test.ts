import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicPages = [
  'index.html',
  'about.html',
  'reviews.html',
  'shop.html',
  'fragrances.html',
  'catalog.html',
  'category.html',
  'eco-rewards.html',
];

test('all published opening hours use the new schedule', async () => {
  for (const page of publicPages) {
    const html = await readFile(new URL(`../website/${page}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /8(?::00)?\s*(?:AM|am)?[–-]5(?::00)?\s*(?:PM|pm)?/);
    assert.match(html, /9:30 AM–6:00 PM/);
  }
});

test('contact section contains an accessible shop map and directions link', async () => {
  const html = await readFile(new URL('../website/index.html', import.meta.url), 'utf8');
  assert.match(html, /title="Map showing Essenshea at Kimathi House"/);
  assert.match(html, /google\.com\/maps\?q=Kimathi\+House/);
  assert.match(html, /google\.com\/maps\/search\/\?api=1/);
  assert.match(html, /loading="lazy"/);
});
