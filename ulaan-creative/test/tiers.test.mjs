// Follower tiers: exact boundaries from the spec (NANO 1K–9,999 … MEGA 500K+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierOf } from '../lib/tiers.js';

test('follower tiers', () => {
  const id = (n) => tierOf(n)?.id ?? null;
  assert.equal(id(null), null);
  assert.equal(id(999), null);
  assert.equal(id(1000), 'nano');
  assert.equal(id(9999), 'nano');
  assert.equal(id(10000), 'micro');
  assert.equal(id(49999), 'micro');
  assert.equal(id(50000), 'mid');
  assert.equal(id(99999), 'mid');
  assert.equal(id(100000), 'macro');
  assert.equal(id(499999), 'macro');
  assert.equal(id(500000), 'mega');
  assert.equal(id(25e6), 'mega');
});
