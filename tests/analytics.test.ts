import assert from 'node:assert/strict';
import test from 'node:test';
import { percentageChange, validateAnalyticsEvent } from '../lib/analytics.ts';

test('analytics accepts only decision-useful non-identifying fields', () => {
  const event = validateAnalyticsEvent({
    eventType: 'search_no_results',
    searchTerm: '  Acne!!! Cream  ',
    metadata: { resultCount: 0, source: 'shop', email: 'private@example.com' },
  });
  assert.equal(event.searchTerm, 'acne cream');
  assert.deepEqual(event.metadata, { resultCount: 0, source: 'shop' });
  assert.equal('email' in event.metadata, false);
});

test('analytics rejects unknown events and blank searches', () => {
  assert.throws(() => validateAnalyticsEvent({ eventType: 'fingerprint_user' }), /Unsupported/);
  assert.throws(() => validateAnalyticsEvent({ eventType: 'search_no_results', searchTerm: '!' }), /search term/i);
});

test('analytics normalizes product lists and comparison labels', () => {
  const event = validateAnalyticsEvent({
    eventType: 'order_submitted',
    metadata: { productSlugs: ['Glow Oil', 'Hair Serum'], itemCount: 2 },
  });
  assert.deepEqual(event.metadata.productSlugs, ['glow-oil', 'hair-serum']);
  assert.equal(percentageChange(12, 8), '+50%');
  assert.equal(percentageChange(2, 0), 'new activity');
});
