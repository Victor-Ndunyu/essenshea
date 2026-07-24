import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessCodeMatches,
  hashEcoAccessCode,
  normalizeKenyanPhone,
  planPunches,
} from '../lib/eco-rewards.ts';

test('normalizes common Kenyan phone formats', () => {
  assert.equal(normalizeKenyanPhone('0727 349 749'), '254727349749');
  assert.equal(normalizeKenyanPhone('+254 727 349 749'), '254727349749');
  assert.equal(normalizeKenyanPhone('727349749'), '254727349749');
});

test('rejects invalid phone numbers', () => {
  assert.throws(() => normalizeKenyanPhone('12345'), /valid Kenyan/);
});

test('awards milestones and resets after punch eight', () => {
  assert.deepEqual(planPunches(7, 3), {
    resultingPunches: 2,
    rewards: ['fifty_percent', 'five_percent'],
  });
});

test('multiple accepted containers each receive a punch', () => {
  assert.deepEqual(planPunches(1, 4), {
    resultingPunches: 5,
    rewards: ['five_percent', 'free_sample'],
  });
});

test('rejects unsafe punch inputs', () => {
  assert.throws(() => planPunches(8, 1));
  assert.throws(() => planPunches(0, 0));
  assert.throws(() => planPunches(0, 26));
});

test('access codes are phone-bound and timing-safe comparable', () => {
  const hash = hashEcoAccessCode('0727349749', 'ABCD-1234', 'test-secret');
  assert.equal(accessCodeMatches(hash, hashEcoAccessCode('+254727349749', 'abcd-1234', 'test-secret')), true);
  assert.equal(accessCodeMatches(hash, hashEcoAccessCode('+254727349749', 'wrong-code', 'test-secret')), false);
});
