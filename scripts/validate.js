'use strict';
// Incident validation: starts all four services (real HTTP between them, real Postgres SQL
// via PGlite) and replays the production scenarios through the storefront. Exits 1 if any
// scenario gets the wrong status. It FAILS on main on purpose until the two intentional
// code bugs are fixed:
//   - LEGACY_VIP (expired legacy tiers) must be a 400, not a checkout-service 500
//   - high-value orders (audited reservations) must succeed, not hit an inventory-db error
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
const { startLocalStack } = require('./lib/local-stack');

const mug = [{ productId: 'mug', quantity: 1 }];
const scenarios = [
  { name: 'order without promo', body: { items: mug }, expect: 201 },
  { name: 'order with active promo SAVE10', body: { items: mug, promoCode: 'SAVE10' }, expect: 201 },
  { name: 'expired promo BLACKFRIDAY', body: { items: mug, promoCode: 'BLACKFRIDAY' }, expect: 400 },
  { name: 'unknown promo', body: { items: mug, promoCode: 'NOTACODE' }, expect: 400 },
  { name: 'empty cart', body: { items: [] }, expect: 400 },
  { name: 'more than in stock', body: { items: [{ productId: 'mug', quantity: 999999 }] }, expect: 409 },
  { name: 'legacy promo LEGACY_VIP with only expired tiers', body: { items: mug, promoCode: 'LEGACY_VIP' }, expect: 400 },
  { name: 'high-value order (audited stock reservation)', body: { items: [{ productId: 'hoodie', quantity: 10 }] }, expect: 201 },
];

(async () => {
  const stack = await startLocalStack();
  let failed = 0;
  try {
    for (const s of scenarios) {
      const res = await fetch(`${stack.urls.storefront}/api/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(s.body),
      });
      const body = await res.json().catch(() => ({}));
      const ok = res.status === s.expect;
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.name}: got ${res.status}, expected ${s.expect}${ok ? '' : `  ${JSON.stringify(body)}`}`);
    }
  } finally {
    await stack.close();
  }
  console.log(failed ? `\n${failed} scenario(s) failed.` : '\nAll scenarios passed.');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
