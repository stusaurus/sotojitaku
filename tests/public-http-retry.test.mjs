import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {fetchWithTransientRetry} = require('./public-http-retry.cjs');
const response = status => ({status: () => status});

test('temporary 502/503/504 responses are retried and 200 is required', async () => {
  const statuses = [503, 502, 504, 200];
  const warnings = [], delays = [];
  let calls = 0;
  const result = await fetchWithTransientRetry(async () => response(statuses[calls++]), {
    label: 'HOME',
    sleep: async ms => {delays.push(ms);},
    warn: message => {warnings.push(message);}
  });
  assert.equal(result.status(), 200);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [1500, 3000, 4500]);
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /HOME: HTTP 503/);
});

test('persistent 503 never becomes a false success', async () => {
  let calls = 0;
  const result = await fetchWithTransientRetry(async () => {calls++; return response(503);}, {
    attempts: 3, sleep: async () => {}, warn: () => {}
  });
  assert.equal(calls, 3);
  assert.equal(result.status(), 503);
});

test('ordinary 4xx and permanent non-200 responses are never retried', async () => {
  for (const status of [400, 403, 404, 500]) {
    let calls = 0;
    const result = await fetchWithTransientRetry(async () => {calls++; return response(status);}, {
      sleep: async () => {}, warn: () => {}
    });
    assert.equal(result.status(), status);
    assert.equal(calls, 1);
  }
});

test('browser exceptions still propagate and cannot be treated as a success', async () => {
  await assert.rejects(
    fetchWithTransientRetry(async () => {throw new Error('network unavailable');}),
    /network unavailable/
  );
});

test('retry budget is validated', async () => {
  await assert.rejects(fetchWithTransientRetry(async () => response(503), {attempts: 0}), RangeError);
});
