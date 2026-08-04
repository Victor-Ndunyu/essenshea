import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTelegramOwnerIds, secretsMatch } from '../lib/security.ts';
import { ownerLowStockThreshold, parseNaturalOwnerMutation, parseOwnerActionApproval } from '../lib/owner-command.ts';
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

test('owner action approvals require an exact one-time token shape', () => {
  assert.deepEqual(parseOwnerActionApproval('/confirm A1B2C3D4'), { action: 'confirm', token: 'A1B2C3D4' });
  assert.deepEqual(parseOwnerActionApproval('/cancel a1b2c3d4'), { action: 'cancel', token: 'A1B2C3D4' });
  assert.equal(parseOwnerActionApproval('/confirm /stock Glow Oil | 5'), null);
  assert.equal(parseOwnerActionApproval('/confirm SHORT'), null);
});

test('natural owner edits translate to safe structured commands', () => {
  assert.equal(parseNaturalOwnerMutation('Change the stock of Glow Oil to 8'), '/stock Glow Oil | 8');
  assert.equal(parseNaturalOwnerMutation('Mark Vanilla Mist as available by order'), '/order Vanilla Mist');
  assert.equal(parseNaturalOwnerMutation('Hide product Rose Balm from the shop'), '/hide Rose Balm');
  assert.equal(parseNaturalOwnerMutation('Show me the description of Glow Oil'), null);
  assert.equal(parseNaturalOwnerMutation('Restore product Rose Balm'), '/show Rose Balm');
  assert.equal(parseNaturalOwnerMutation('Update the description of Glow Oil to A lighter daily oil'), '/setdesc Glow Oil | A lighter daily oil');
  assert.equal(parseNaturalOwnerMutation('Tell me about Glow Oil'), null);
});

test('low-stock threshold is bounded and defaults safely', () => {
  const previous = process.env.OWNER_LOW_STOCK_THRESHOLD;
  process.env.OWNER_LOW_STOCK_THRESHOLD = '8';
  assert.equal(ownerLowStockThreshold(), 8);
  process.env.OWNER_LOW_STOCK_THRESHOLD = '9999';
  assert.equal(ownerLowStockThreshold(), 3);
  if (previous === undefined) delete process.env.OWNER_LOW_STOCK_THRESHOLD;
  else process.env.OWNER_LOW_STOCK_THRESHOLD = previous;
});

test('owner insight trend labels are honest when the baseline is empty', () => {
  assert.equal(percentageChange(0, 0), 'no change');
  assert.equal(percentageChange(3, 0), 'new activity');
  assert.equal(percentageChange(4, 8), '-50%');
});
