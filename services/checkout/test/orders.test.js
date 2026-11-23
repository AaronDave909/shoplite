'use strict';
process.env.LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('../../../test-support/pglite');
const { migrate } = require('../src/db');
const { placeOrder } = require('../src/orders');
const { lockOrdersDb } = require('../src/chaos');
const { callService, UpstreamError } = require('../src/clients');
const { HttpError, ValidationError, ConflictError } = require('../src/errors');
const { createApp } = require('../src/app');

const CATALOG = [
  { id: 'mug', name: 'Observability Mug', priceCents: 1800, stock: 10 },
  { id: 'hoodie', name: 'On-Call Hoodie', priceCents: 5500, stock: 10 },
];

/** In-memory stand-ins for promo-service and inventory-service. */
function fakeClients({ promo, reserve } = {}) {
  const calls = { reserve: [], release: [] };
  return {
    calls,
    promo: {
      validate: promo || (async (code, subtotalCents) => {
        if (code !== 'SAVE10') throw new HttpError(400, `Unknown or expired promotion code: ${code}`);
        return { code, discount: { percent: 10, amountCents: Math.round(subtotalCents / 10) } };
      }),
    },
    inventory: {
      listProducts: async () => CATALOG,
      reserve: reserve || (async (items, opts) => {
        calls.reserve.push({ items, opts });
        return { reservationId: '00000000-0000-4000-8000-000000000001', status: 'reserved' };
      }),
      release: async (id) => calls.release.push(id),
    },
  };
}

let db;
test.beforeEach(async () => {
  db = await createTestDb();
  await migrate(db);
});
test.afterEach(() => db.end());

test('places an order with a promo and stores it in orders-db', async () => {
  const clients = fakeClients();
  const order = await placeOrder({ db, clients }, { items: [{ productId: 'hoodie', quantity: 2 }], promoCode: ' save10 ' });
  assert.equal(order.subtotalCents, 11000);
  assert.equal(order.discountCents, 1100);
  assert.equal(order.totalCents, 9900);
  assert.equal(order.promoCode, 'SAVE10');
  assert.equal(order.orderNumber, 1001);
  const { rows } = await db.query('SELECT total_cents, order_number FROM orders');
  assert.deepEqual(rows, [{ total_cents: 9900, order_number: 1001 }]);
  assert.deepEqual(clients.calls.reserve[0].opts, { audit: false });
});

test('order numbers increase', async () => {
  const clients = fakeClients();
  const a = await placeOrder({ db, clients }, { items: [{ productId: 'mug', quantity: 1 }] });
  const b = await placeOrder({ db, clients }, { items: [{ productId: 'mug', quantity: 1 }] });
  assert.equal(b.orderNumber, a.orderNumber + 1);
});

test('high-value carts ask inventory for an audited reservation', async () => {
  const clients = fakeClients();
  await placeOrder({ db, clients, auditThresholdCents: 10000 }, { items: [{ productId: 'hoodie', quantity: 2 }] });
  assert.deepEqual(clients.calls.reserve[0].opts, { audit: true });
});

test('an invalid promo is a 400 and reserves nothing', async () => {
  const clients = fakeClients();
  await assert.rejects(
    placeOrder({ db, clients }, { items: [{ productId: 'mug', quantity: 1 }], promoCode: 'BLACKFRIDAY' }),
    (err) => err.status === 400 && /Unknown or expired/.test(err.message),
  );
  assert.equal(clients.calls.reserve.length, 0);
});

test('bad carts are a 400', async () => {
  const clients = fakeClients();
  await assert.rejects(placeOrder({ db, clients }, { items: [] }), ValidationError);
  await assert.rejects(placeOrder({ db, clients }, { items: [{ productId: 'nope', quantity: 1 }] }), /Unknown product/);
  await assert.rejects(placeOrder({ db, clients }, { items: [{ productId: 'mug', quantity: -1 }] }), ValidationError);
});

test('out of stock from inventory is passed through as 409', async () => {
  const clients = fakeClients({ reserve: async () => { throw new HttpError(409, 'Not enough stock for mug'); } });
  await assert.rejects(placeOrder({ db, clients }, { items: [{ productId: 'mug', quantity: 1 }] }), (err) => err.status === 409);
});

test('stock is released when the order cannot be saved', async () => {
  const clients = fakeClients();
  const brokenDb = { connect: async () => { throw new Error('timeout exceeded when trying to connect'); } };
  await assert.rejects(placeOrder({ db: brokenDb, clients }, { items: [{ productId: 'mug', quantity: 1 }] }), /timeout exceeded/);
  assert.deepEqual(clients.calls.release, ['00000000-0000-4000-8000-000000000001']);
});

test('callService maps dependency failures', async () => {
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });
  await assert.rejects(
    callService('promo-service', 'http://promo', '/x', { fetchImpl: reply(400, { error: 'bad code' }) }),
    (err) => err.status === 400 && err.message === 'bad code',
  );
  await assert.rejects(
    callService('promo-service', 'http://promo', '/x', { fetchImpl: reply(500, {}) }),
    (err) => err instanceof UpstreamError && err.status === 502,
  );
  await assert.rejects(
    callService('promo-service', 'http://promo', '/x', { fetchImpl: async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); } }),
    (err) => err instanceof UpstreamError && err.status === 503 && /promo-service is unavailable \(ECONNREFUSED\)/.test(err.message),
  );
});

test('chaos lock holds the order counter row and refuses a second run', async () => {
  const run = lockOrdersDb(db, { connections: 1, holdSeconds: 60 });
  assert.equal(run.connections, 1);
  assert.throws(() => lockOrdersDb(db, { connections: 1 }), ConflictError);
  await new Promise((r) => setTimeout(r, 50));
  await run.release();
  const again = lockOrdersDb(db, { connections: 1, holdSeconds: 60 });
  await again.release();
});

test('HTTP: POST /orders and chaos route gating', async () => {
  const server = createApp({ db, clients: fakeClients(), env: {} }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const res = await post('/orders', { items: [{ productId: 'mug', quantity: 1 }], promoCode: 'SAVE10' });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).totalCents, 1620);
    assert.equal((await post('/orders', { items: [{ productId: 'mug', quantity: 1 }], promoCode: 'NOPE' })).status, 400);
    assert.equal((await post('/chaos/orders-db-lock', {})).status, 404);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  } finally {
    server.close();
  }
});
