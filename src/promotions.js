'use strict';

const { ValidationError } = require('./errors');

// Promotion codes. `expires` is the last day (UTC) the code is valid.
const PROMOTIONS = {
  SAVE10: { percent: 10, expires: '2099-12-31' },
  WELCOME5: { percent: 5, expires: '2099-12-31' },
  BLACKFRIDAY: { percent: 25, expires: '2025-11-30' },
};

function findActivePromotion(code, now = new Date()) {
  const promo = PROMOTIONS[String(code || '').toUpperCase()];
  if (!promo) return undefined;
  const endOfLastDay = new Date(`${promo.expires}T23:59:59.999Z`);
  return now <= endOfLastDay ? promo : undefined;
}

/**
 * Returns the discount in cents for a subtotal and promo code.
 * An empty code means no promotion.
 */
function calculateDiscount(subtotalCents, code, now = new Date()) {
  if (!code) return 0;
  const promo = findActivePromotion(code, now);
  if (!promo) throw new ValidationError(`Unknown or expired promotion code: ${code}`);
  return Math.round((subtotalCents * promo.percent) / 100);
}

module.exports = { PROMOTIONS, findActivePromotion, calculateDiscount };
