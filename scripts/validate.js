'use strict';
// Incident validation: replays the production scenarios against a local server and
// fails if any of them returns a 5xx or the wrong status. A fix for the checkout
// incident is "validated" when this script exits 0 (it fails on the unfixed code).
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
const { createApp } = require('../src/app');

const scenarios = [
  { name: 'no promo', body: { items: [{ productId: 'mug', quantity: 1 }] }, expect: 201 },
  { name: 'active promo', body: { items: [{ productId: 'mug', quantity: 1 }], promoCode: 'SAVE10' }, expect: 201 },
  { name: 'expired promo BLACKFRIDAY', body: { items: [{ productId: 'mug', quantity: 1 }], promoCode: 'BLACKFRIDAY' }, expect: 400 },
  { name: 'unknown promo', body: { items: [{ productId: 'mug', quantity: 1 }], promoCode: 'NOTACODE' }, expect: 400 },
  { name: 'empty cart', body: { items: [] }, expect: 400 },
];

(async () => {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let failed = 0;

  for (const s of scenarios) {
    const res = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s.body),
    });
    const ok = res.status === s.expect;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.name}: got ${res.status}, expected ${s.expect}`);
  }

  server.close();
  console.log(failed ? `\n${failed} scenario(s) failed.` : '\nAll scenarios passed.');
  process.exit(failed ? 1 : 0);
})();
