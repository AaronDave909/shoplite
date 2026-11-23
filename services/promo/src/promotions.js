'use strict';
const { query } = require('./db');
const { ValidationError } = require('./errors');

const endOfDayUtc = (isoDate) => new Date(`${isoDate}T23:59:59.999Z`);

async function findPromotion(db, code) {
  const { rows } = await query(
    db,
    `SELECT code, rule_type, percent, legacy_rules, to_char(expires_on, 'YYYY-MM-DD') AS expires_on
       FROM promotions
      WHERE code = $1`,
    [String(code).trim().toUpperCase()],
  );
  return rows[0];
}

const percentOff = (subtotalCents, percent) => ({
  percent,
  amountCents: Math.round((subtotalCents * percent) / 100),
});

/**
 * Legacy VIP codes carry several tiers. Picks the best tier the cart qualifies for.
 */
function evaluateLegacyRules(rules, subtotalCents, now) {
  const live = (rules || []).filter(
    (r) => subtotalCents >= r.minSubtotalCents && now <= endOfDayUtc(r.validUntil),
  );
  if (live.length === 0) return null;
  const best = live.reduce((a, b) => (b.percent > a.percent ? b : a));
  return percentOff(subtotalCents, best.percent);
}

/**
 * Validates a promo code against a cart subtotal (integer cents).
 * Returns { code, ruleType, discount: { percent, amountCents } }.
 * Throws ValidationError for unknown or expired codes.
 */
async function validatePromotion(db, code, subtotalCents, now = new Date()) {
  if (typeof code !== 'string' || code.trim() === '') throw new ValidationError('code is required');
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new ValidationError('subtotalCents must be a non-negative integer');
  }

  const promo = await findPromotion(db, code);
  if (!promo || now > endOfDayUtc(promo.expires_on)) {
    throw new ValidationError(`Unknown or expired promotion code: ${code}`);
  }

  const discount =
    promo.rule_type === 'legacy_tiered'
      ? evaluateLegacyRules(promo.legacy_rules, subtotalCents, now)
      : percentOff(subtotalCents, promo.percent);

  return { code: promo.code, ruleType: promo.rule_type, discount };
}

module.exports = { validatePromotion, evaluateLegacyRules };
