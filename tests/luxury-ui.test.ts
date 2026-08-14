import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pages = [
  'index.html',
  'shop.html',
  'catalog.html',
  'category.html',
  'fragrances.html',
  'about.html',
  'reviews.html',
  'eco-rewards.html',
  'account.html',
  'eco-rewards-admin.html',
];

test('every storefront surface loads the final calm-luxury design layer', async () => {
  for (const page of pages) {
    const html = await readFile(new URL(`../website/${page}`, import.meta.url), 'utf8');
    assert.match(html, /luxury-refinement\.css/, `${page} is missing the final design layer`);
  }
});

test('the final design layer keeps content visible and styles interactive controls', async () => {
  const css = await readFile(
    new URL('../website/assets/css/luxury-refinement.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /--font-display:\s*'Cormorant Garamond'/);
  assert.match(css, /\.section h2,[\s\S]*animation:\s*none !important/);
  assert.match(css, /\.filter-pill\s*\{/);
  assert.match(css, /\.contact-card\s*\{[\s\S]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
