'use strict';
const { getProduct } = require('./catalog');
const { calculateDiscount } = require('./promotions');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

function priceCart({ items, promoCode } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Cart is empty');
  }

  const lines = items.map(({ productId, quantity }) => {
    const product = getProduct(productId);
    if (!product) throw new ValidationError(`Unknown product: ${productId}`);
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) throw new ValidationError(`Invalid quantity for ${productId}`);
    return { productId, name: product.name, quantity: qty, lineTotalCents: product.priceCents * qty };
  });

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const discountCents = calculateDiscount(subtotalCents, promoCode);

  return {
    lines,
    promoCode: promoCode || null,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}

module.exports = { priceCart, ValidationError };
