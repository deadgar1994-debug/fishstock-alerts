import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupportedState } from '../src/states.js';
import { matchesSubscription, formatNotification, sendExpoPushMessages } from '../src/notify.js';

const event = { id: 'test', state: 'UT', county: 'WASATCH', species: 'RAINBOW', water_name: 'DEER CREEK', quantity: 1500, date_stocked: '2026-10-31' };

test('state coverage is explicit, never silently falls back to Utah', () => {
  assert.equal(getSupportedState(undefined), 'UT');
  assert.equal(getSupportedState('co'), 'CO');
  assert.throws(() => getSupportedState('MT'), /not available/);
});
test('subscriptions require state and filter matches', () => {
  assert.equal(matchesSubscription(event, { states: ['UT'], counties: ['WASATCH'], species: ['RAINBOW'] }), true);
  assert.equal(matchesSubscription(event, { states: ['CO'] }), false);
  assert.equal(matchesSubscription(event, { states: ['UT'], waters: ['PROVO RIVER'] }), false);
  assert.equal(matchesSubscription(event, { states: ['UT'], waters: ['deer creek'] }), true);
});
test('Idaho forecasts are not reported as completed stock events', () => {
  const forecast = formatNotification({ ...event, state: 'ID' });
  assert.match(forecast.title, /^Forecast/);
  assert.match(forecast.body, /planned week/);
  assert.equal(forecast.data.forecast, true);
  assert.match(formatNotification(event).title, /^New stocking/);
});
test('Expo push messages are batched, and only accepted tickets are counted', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    const messages = JSON.parse(opts.body);
    calls.push(messages);
    return { ok: true, json: async () => ({ data: messages.map((_, i) => ({ status: i === 0 ? 'error' : 'ok', message: 'Rejected test token' })) }) };
  };
  try {
    const result = await sendExpoPushMessages(Array.from({ length: 101 }, (_, i) => ({ to: `ExpoPushToken[${i}]`, title: 'Test' })));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].length, 100);
    assert.equal(result.accepted, 99);
    assert.deepEqual(result.acceptedIndices.slice(0, 2), [1, 2]);
    assert.equal(result.errors.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
