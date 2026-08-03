import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shop dialog exposes accessible naming and loading state', async () => {
  const html = await readFile(new URL('../website/shop.html', import.meta.url), 'utf8');
  assert.match(html, /aria-labelledby="modal-title"/);
  assert.match(html, /aria-describedby="modal-description"/);
  assert.match(html, /aria-busy="true"/);
});

test('shop interaction restores focus and handles broken images', async () => {
  const script = await readFile(new URL('../website/assets/js/shop.js', import.meta.url), 'utf8');
  assert.match(script, /trapModalFocus/);
  assert.match(script, /modalReturnFocus\.focus/);
  assert.match(script, /markImageUnavailable/);
  assert.match(script, /searchRenderTimer/);
  assert.match(script, /event\.target === productModal/);
});

test('static assets receive bounded browser caching', async () => {
  const route = await readFile(new URL('../app/[[...path]]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /stale-while-revalidate/);
  assert.match(route, /max-age=604800/);
  assert.match(route, /ext === '\.html'/);
});
