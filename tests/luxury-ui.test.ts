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
    assert.match(html, /luxury-refinement\.css\?v=7/, `${page} is missing the current design layer`);
    assert.match(html, /design-system\.js\?v=1/, `${page} is missing the atelier interaction layer`);
    assert.match(html, /name="color-scheme" content="light only"/, `${page} can be auto-darkened`);
    if (page !== 'eco-rewards-admin.html') {
      assert.match(html, /agent\.js\?v=4/, `${page} is missing the current assistant bundle`);
    }
  }
});

test('fashion atelier system reaches forms, overlays, scrollbar and reduced motion', async () => {
  const [css, script] = await Promise.all([
    readFile(new URL('../website/assets/css/luxury-refinement.css', import.meta.url), 'utf8'),
    readFile(new URL('../website/assets/js/design-system.js', import.meta.url), 'utf8'),
  ]);

  assert.match(css, /--oxblood:\s*#4a1f27/);
  assert.match(css, /html::-webkit-scrollbar-thumb/);
  assert.match(css, /\.modal-card::before/);
  assert.match(css, /\.hero__badge\s*\{[\s\S]*left:\s*18px/);
  assert.match(css, /\.site-footer\s*\{[\s\S]*width:\s*100vw[\s\S]*margin:\s*28px 0 0 -50vw/);
  assert.match(css, /\.cart-popup\s*\{/);
  assert.match(css, /\.agent-panel\s*\{/);
  assert.match(css, /\.form-input,[\s\S]*border-width:\s*0 0 1px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.atelier-reveal/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /MutationObserver/);
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
  assert.match(css, /content:\s*'Explore Essenshea'/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
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
  assert.match(css, /--agent-viewport-bottom/);
  assert.match(agent, /window\.visualViewport/);
  assert.match(agent, /enhanceMobileNavigation\(\)/);
  assert.match(css, /color-scheme:\s*only light/);
  assert.match(css, /main \.section > \*[\s\S]*opacity:\s*1 !important/);
});

test('mobile Why Essenshea rail reveals a complete premium catalogue menu', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../website/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../website/assets/css/luxury-refinement.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /class="asymmetric craft-rail"/);
  assert.match(html, /class="craft-catalogue"/);
  assert.equal((html.match(/class="craft-catalogue__nav"[\s\S]*?<\/nav>/)?.[0].match(/<a href=/g) || []).length, 9);
  assert.match(html, /Swipe to explore catalogues/);
  assert.match(css, /#craft \.craft-rail\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /scroll-snap-type:\s*inline mandatory/);
  assert.match(css, /grid-auto-columns:\s*calc\(100% - 34px\)/);
});
