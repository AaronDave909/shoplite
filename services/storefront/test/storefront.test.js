'use strict';
process.env.LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

const ENV = {
  CHAOS_ENABLED: 'true',
  CHECKOUT_SERVICE_URL: 'http://checkout',
  PROMO_SERVICE_URL: 'http://promo',
  INVENTORY_SERVICE_URL: 'http://inventory',
};

/** Fake backend: routes "METHOD host/path" to [status, body]; anything else is unreachable. */
function fakeFetch(routes, seen = []) {
  return async (url, init = {}) => {
    const key = `${init.method || 'GET'} ${url.host}${url.pathname}`;
    seen.push({ key, body: init.body && JSON.parse(init.body) });
    if (!(key in routes)) throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    const [status, body] = routes[key];
    return new Response(JSON.stringify(body), { status });
  };
}

async function withServer(fetchImpl, env, fn) {
  const server = createApp({ env, fetchImpl }).listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const post = (url, body = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('status shows each service as up, degraded or down', async () => {
  const fetchImpl = fakeFetch({
    'GET checkout/health': [200, { status: 'ok', database: 'ok' }],
    'GET inventory/health': [503, { status: 'degraded', database: 'database did not answer within 1000ms' }],
  });
  await withServer(fetchImpl, ENV, async (base) => {
    const { services } = await (await fetch(`${base}/api/status`)).json();
    const states = Object.fromEntries(services.map((s) => [s.service, s.state]));
    assert.deepEqual(states, {
      'storefront-service': 'up',
      'checkout-service': 'up',
      'promo-service': 'down',
      'inventory-service': 'degraded',
    });
  });
});

test('checkout is relayed to checkout-service with its status code', async () => {
  const seen = [];
  const fetchImpl = fakeFetch({ 'POST checkout/orders': [400, { error: 'Cart is empty' }] }, seen);
  await withServer(fetchImpl, ENV, async (base) => {
    const res = await post(`${base}/api/checkout`, { items: [] });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Cart is empty' });
    assert.deepEqual(seen[0].body, { items: [] });
  });
});

test('an unreachable backend is a 503 naming the service', async () => {
  await withServer(fakeFetch({}), ENV, async (base) => {
    const res = await fetch(`${base}/api/products`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /inventory-service is unavailable/);
  });
});

test('chaos buttons call the right backend endpoints', async () => {
  const seen = [];
  const fetchImpl = fakeFetch({
    'POST checkout/orders': [201, {}],
    'POST promo/chaos/crash': [202, {}],
    'POST inventory/reservations': [201, {}],
    'POST checkout/chaos/orders-db-lock': [202, {}],
  }, seen);
  await withServer(fetchImpl, ENV, async (base) => {
    for (const p of ['promo-null-error', 'promo-crash', 'inventory-db-bug']) await post(`${base}/api/chaos/${p}`);
    await post(`${base}/api/chaos/orders-db-lock`, { connections: 10, holdSeconds: 30 });
  });
  assert.deepEqual(seen.map((s) => s.key), [
    'POST checkout/orders',
    'POST promo/chaos/crash',
    'POST inventory/reservations',
    'POST checkout/chaos/orders-db-lock',
  ]);
  assert.equal(seen[0].body.promoCode, 'LEGACY_VIP');
  assert.equal(seen[2].body.audit, true);
  assert.deepEqual(seen[3].body, { connections: 10, holdSeconds: 30 });
});

test('chaos routes are off unless CHAOS_ENABLED=true', async () => {
  await withServer(fakeFetch({}), { ...ENV, CHAOS_ENABLED: 'false' }, async (base) => {
    assert.equal((await post(`${base}/api/chaos/promo-crash`)).status, 404);
  });
});
