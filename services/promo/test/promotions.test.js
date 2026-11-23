'use strict';
process.env.LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('../../../test-support/pglite');
const { migrate } = require('../src/db');
const { validatePromotion, evaluateLegacyRules } = require('../src/promotions');
const { ValidationError } = require('../src/errors');
const { createApp } = require('../src/app');

let db;
let server;
let base;

test.before(async () => {
  db = await createTestDb();
  await migrate(db);
  server = createApp({ db, env: {} }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.close();
  await db.end();
});

const isInvalidCode = (err) => err instanceof ValidationError && err.status === 400 && /Unknown or expired/.test(err.message);

test('active percent code (case-insensitive)', async () => {
  const result = await validatePromotion(db, 'save10', 5500);
  assert.deepEqual(result, { code: 'SAVE10', ruleType: 'percent', discount: { percent: 10, amountCents: 550 } });
});

test('rejects an unknown code', async () => {
  await assert.rejects(validatePromotion(db, 'NOTACODE', 1000), isInvalidCode);
});

test('BLACKFRIDAY is valid through the end of its last day, then rejected', async () => {
  const last = await validatePromotion(db, 'BLACKFRIDAY', 10000, new Date('2025-11-30T23:59:59.999Z'));
  assert.equal(last.discount.amountCents, 2500);
  await assert.rejects(validatePromotion(db, 'BLACKFRIDAY', 10000, new Date('2025-12-01T00:00:00Z')), isInvalidCode);
});

test('rejects a missing code or bad subtotal', async () => {
  await assert.rejects(validatePromotion(db, '', 1000), ValidationError);
  await assert.rejects(validatePromotion(db, 'SAVE10', 10.5), ValidationError);
});

test('legacy tiers: best live tier the cart qualifies for', () => {
  const rules = [
    { minSubtotalCents: 0, percent: 15, validUntil: '2099-01-01' },
    { minSubtotalCents: 10000, percent: 20, validUntil: '2099-01-01' },
  ];
  assert.deepEqual(evaluateLegacyRules(rules, 5000, new Date('2026-01-01')), { percent: 15, amountCents: 750 });
  assert.deepEqual(evaluateLegacyRules(rules, 20000, new Date('2026-01-01')), { percent: 20, amountCents: 4000 });
});

test('rejects a legacy code when all of its tiers have expired', async () => {
  await db.query(
    `INSERT INTO promotions (code, rule_type, percent, legacy_rules, expires_on)
     VALUES ($1, 'legacy_tiered', NULL, $2::jsonb, $3)`,
    [
      'LEGACY_EXPIRED_TIERS',
      JSON.stringify([{ minSubtotalCents: 0, percent: 15, validUntil: '2024-06-30' }]),
      '2099-12-31',
    ],
  );
  await assert.rejects(
    validatePromotion(db, 'LEGACY_EXPIRED_TIERS', 1000, new Date('2026-01-01')),
    isInvalidCode,
  );
});

test('POST /promotions/validate returns the discount', async () => {
  const res = await fetch(`${base}/promotions/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'WELCOME5', subtotalCents: 10000 }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).discount, { percent: 5, amountCents: 500 });
});

test('POST /promotions/validate returns 400 for an expired code', async () => {
  const res = await fetch(`${base}/promotions/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'BLACKFRIDAY', subtotalCents: 10000 }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Unknown or expired promotion code/);
});

test('GET /health checks the database', async () => {
  const res = await fetch(`${base}/health`);
  assert.deepEqual(await res.json(), { status: 'ok', database: 'ok' });
});

test('chaos crash route exists only with CHAOS_ENABLED=true, and crashes after replying', async () => {
  assert.equal((await fetch(`${base}/chaos/crash`, { method: 'POST' })).status, 404);

  let crashedWith;
  const crashed = new Promise((resolve) => {
    const app = createApp({ db, env: { CHAOS_ENABLED: 'true', CHAOS_CRASH_ALLOC_MB: '128' }, crash: (opts) => resolve((crashedWith = opts)) });
    const s = app.listen(0, async () => {
      const res = await fetch(`http://127.0.0.1:${s.address().port}/chaos/crash`, { method: 'POST' });
      assert.equal(res.status, 202);
      s.close();
    });
  });
  await crashed;
  assert.deepEqual(crashedWith, { targetMb: 128 });
});
