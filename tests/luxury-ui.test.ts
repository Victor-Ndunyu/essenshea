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
    assert.match(html, /luxury-refinement\.css\?v=2/, `${page} is missing the current design layer`);
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

test('navigation keeps the original understated link treatment', async () => {
  const css = await readFile(
    new URL('../website/assets/css/luxury-refinement.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /\.topnav\s*\{[\s\S]*background:\s*transparent/);
  assert.match(css, /\.topnav a\s*\{[\s\S]*border-bottom:\s*1px solid transparent/);
  assert.match(css, /border-bottom-color:\s*var\(--gold\)/);
});

test('angel artwork and mobile assistant have deliberate detail', async () => {
  const [css, svg] = await Promise.all([
    readFile(new URL('../website/assets/css/luxury-refinement.css', import.meta.url), 'utf8'),
    readFile(new URL('../website/assets/images/angel-assistant.svg', import.meta.url), 'utf8'),
  ]);

  assert.match(svg, /id="robe"/);
  assert.match(svg, /gold halo, leafy wings/);
  const agent = await readFile(new URL('../website/assets/js/agent.js', import.meta.url), 'utf8');
  assert.match(agent, /angel-assistant\.svg\?v=2/);
  assert.match(css, /\.agent-launcher::after/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.agent-quick-actions\s*\{[\s\S]*overflow-x:\s*auto/);
});
