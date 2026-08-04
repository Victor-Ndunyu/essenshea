import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTelegramOwnerIds, secretsMatch } from '../lib/security.ts';
import { parseOwnerConfirmation } from '../lib/owner-command.ts';
import { percentageChange } from '../lib/analytics.ts';

test('owner telegram chat id parsing is strict', () => {
  const allowed = parseTelegramOwnerIds('12345, 777, -9, 12oops, 0');
  assert.equal(allowed.has(12345), true);
  assert.equal(allowed.has(777), true);
  assert.equal(allowed.has(999), false);
  assert.equal(allowed.has(-9), false);
  assert.equal(allowed.has(12), false);
});

test('shared secrets reject blanks and mismatches', () => {
  assert.equal(secretsMatch('correct-value', 'correct-value'), true);
  assert.equal(secretsMatch('wrong-value', 'correct-value'), false);
  assert.equal(secretsMatch('', ''), false);
});

test('owner catalog commands support product names with spaces', () => {
  const command = '/stock Wood & Spice Body Balm for Men | 5';
  const [, name, quantity] = command.match(/^\/stock\s+(.+?)\s*\|\s*(\d+)\s*$/i) || [];
  assert.equal(name, 'Wood & Spice Body Balm for Men');
  assert.equal(Number(quantity), 5);
});

test('catalog slug generation is stable for owner-added products', () => {
  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  assert.equal(slugify('Wood & Spice Body Balm for Men'), 'wood-spice-body-balm-for-men');
  assert.equal(slugify('  New Glow Oil 100ml  '), 'new-glow-oil-100ml');
});

test('owner live-site actions require an explicit confirmation wrapper', () => {
  assert.deepEqual(parseOwnerConfirmation('/stock Glow Oil | 5'), {
    confirmed: false,
    command: '/stock Glow Oil | 5',
  });
  assert.deepEqual(parseOwnerConfirmation('/confirm /stock Glow Oil | 5'), {
    confirmed: true,
    command: '/stock Glow Oil | 5',
  });
});

test('owner insight trend labels are honest when the baseline is empty', () => {
  assert.equal(percentageChange(0, 0), 'no change');
  assert.equal(percentageChange(3, 0), 'new activity');
  assert.equal(percentageChange(4, 8), '-50%');
});
