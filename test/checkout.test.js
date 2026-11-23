'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { priceCart, ValidationError } = require('../src/checkout');
const { calculateDiscount, findActivePromotion } = require('../src/promotions');

test('prices a cart with no promo', () => {
  const order = priceCart({ items: [{ productId: 'mug', quantity: 2 }] });
  assert.equal(order.subtotalCents, 3600);
  assert.equal(order.discountCents, 0);
  assert.equal(order.totalCents, 3600);
});

test('applies an active promo code (case-insensitive)', () => {
  const order = priceCart({ items: [{ productId: 'hoodie', quantity: 1 }], promoCode: 'save10' });
  assert.equal(order.discountCents, 550);
  assert.equal(order.totalCents, 4950);
});

test('rejects an empty cart', () => {
  assert.throws(() => priceCart({ items: [] }), ValidationError);
});

test('rejects unknown products', () => {
  assert.throws(() => priceCart({ items: [{ productId: 'nope', quantity: 1 }] }), /Unknown product/);
});

test('promo is valid through the end of its expiry day', () => {
  assert.ok(findActivePromotion('BLACKFRIDAY', new Date('2025-11-30T23:00:00Z')));
  assert.equal(calculateDiscount(10000, 'BLACKFRIDAY', new Date('2025-11-30T23:59:59.999Z')), 2500);
  assert.equal(findActivePromotion('BLACKFRIDAY', new Date('2025-12-01T00:00:00Z')), undefined);
});

test('rejects an unknown promo code as validation input', () => {
  assert.throws(
    () => calculateDiscount(10000, 'NOTACODE'),
    (error) => error instanceof ValidationError && error.status === 400 && /Unknown or expired/.test(error.message),
  );
});

test('rejects an expired promo code as validation input', () => {
  assert.throws(
    () => calculateDiscount(10000, 'BLACKFRIDAY', new Date('2025-12-01T00:00:00Z')),
    (error) => error instanceof ValidationError && error.status === 400 && /Unknown or expired/.test(error.message),
  );
});

test('keeps empty promo codes free of discount and validation errors', () => {
  assert.equal(calculateDiscount(10000, ''), 0);
});

test('discount math for an active code', () => {
  assert.equal(calculateDiscount(10000, 'WELCOME5'), 500);
});
