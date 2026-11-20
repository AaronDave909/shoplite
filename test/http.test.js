'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

let server;
let base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const post = (body) =>
  fetch(`${base}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('GET /health', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
});

test('POST /api/checkout succeeds with a valid code', async () => {
  const res = await post({ items: [{ productId: 'stickers', quantity: 3 }], promoCode: 'SAVE10' });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.totalCents, 1620);
});

test('POST /api/checkout returns 400 for bad input', async () => {
  const res = await post({ items: [] });
  assert.equal(res.status, 400);
});

for (const [name, promoCode] of [['unknown', 'NOTACODE'], ['expired', 'BLACKFRIDAY']]) {
  test(`POST /api/checkout returns 400 for ${name} promo without creating an order`, async () => {
    const res = await post({ items: [{ productId: 'mug', quantity: 1 }], promoCode });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Unknown or expired promotion code/);
    assert.equal(body.orderId, undefined);
  });
}
