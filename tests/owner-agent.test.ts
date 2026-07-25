import assert from 'node:assert/strict';
import test from 'node:test';

test('owner telegram chat id parsing is strict', () => {
  const configured = '12345, 777';
  const allowed = new Set(configured.split(',').map((id) => id.trim()).filter(Boolean));
  assert.equal(allowed.has(String(12345)), true);
  assert.equal(allowed.has(String(777)), true);
  assert.equal(allowed.has(String(999)), false);
});

test('owner catalog commands support product names with spaces', () => {
  const command = '/stock Wood & Spice Body Balm for Men | 5';
  const [, name, quantity] = command.match(/^\/stock\s+(.+?)\s*\|\s*(\d+)\s*$/i) || [];
  assert.equal(name, 'Wood & Spice Body Balm for Men');
  assert.equal(Number(quantity), 5);
});

test('catalog slug generation is stable for owner-added products', () => {
  const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  assert.equal(slugify('Wood & Spice Body Balm for Men'), 'wood-spice-body-balm-for-men');
  assert.equal(slugify('  New Glow Oil 100ml  '), 'new-glow-oil-100ml');
});
