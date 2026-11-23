'use strict';
process.env.LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('../../../test-support/pglite');
const { migrate } = require('../src/db');
const { listProducts, reserveStock, releaseReservation } = require('../src/inventory');
const { ValidationError, ConflictError, NotFoundError } = require('../src/errors');
const { createApp } = require('../src/app');

let db;

test.beforeEach(async () => {
  db = await createTestDb();
  await migrate(db);
});
test.afterEach(() => db.end());

const stockOf = async (id) => (await listProducts(db)).find((p) => p.id === id).stock;

test('lists the catalog with prices in cents', async () => {
  const products = await listProducts(db);
  assert.deepEqual(products.map((p) => [p.id, p.priceCents]), [['hoodie', 5500], ['mug', 1800], ['stickers', 600]]);
});

test('reserving deducts stock and returns priced lines', async () => {
  const r = await reserveStock(db, { items: [{ productId: 'mug', quantity: 2 }, { productId: 'mug', quantity: 1 }] });
  assert.equal(r.status, 'reserved');
  assert.deepEqual(r.lines.map((l) => [l.productId, l.quantity, l.unitPriceCents]), [['mug', 3, 1800]]);
  assert.equal(await stockOf('mug'), 9997);
});

test('not enough stock is a 409 and deducts nothing', async () => {
  await assert.rejects(
    reserveStock(db, { items: [{ productId: 'hoodie', quantity: 1 }, { productId: 'mug', quantity: 999999 }] }),
    (err) => err instanceof ConflictError && err.details.productId === 'mug',
  );
  assert.equal(await stockOf('hoodie'), 10000);
});

test('bad input is a 400', async () => {
  await assert.rejects(reserveStock(db, { items: [] }), ValidationError);
  await assert.rejects(reserveStock(db, { items: [{ productId: 'nope', quantity: 1 }] }), /Unknown product/);
  await assert.rejects(reserveStock(db, { items: [{ productId: 'mug', quantity: 0 }] }), ValidationError);
});

test('releasing restores stock once', async () => {
  const { reservationId } = await reserveStock(db, { items: [{ productId: 'stickers', quantity: 5 }] });
  assert.deepEqual(await releaseReservation(db, reservationId), { reservationId, status: 'released' });
  assert.deepEqual(await releaseReservation(db, reservationId), { reservationId, status: 'released' });
  assert.equal(await stockOf('stickers'), 10000);
  await assert.rejects(releaseReservation(db, 'not-a-uuid'), NotFoundError);
});

test('HTTP: products, reservations, 409 and 400', async () => {
  const server = createApp({ db }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) =>
    fetch(`${base}/reservations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await (await fetch(`${base}/products`)).json()).length, 3);
    assert.equal((await post({ items: [{ productId: 'mug', quantity: 1 }] })).status, 201);
    assert.equal((await post({ items: [{ productId: 'mug', quantity: 999999 }] })).status, 409);
    assert.equal((await post({ items: [] })).status, 400);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  } finally {
    server.close();
  }
});
