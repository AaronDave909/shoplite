'use strict';
const { randomUUID } = require('node:crypto');
const { query } = require('./db');
const { ValidationError } = require('./errors');
const logger = require('./logger');

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError('Cart is empty');
  return items.map((item) => {
    const productId = item?.productId;
    const quantity = Number(item?.quantity);
    if (typeof productId !== 'string' || productId === '') throw new ValidationError('Each item needs a productId');
    if (!Number.isInteger(quantity) || quantity < 1) throw new ValidationError(`Invalid quantity for ${productId}`);
    return { productId, quantity };
  });
}

/** Persists an order in orders-db. The order number comes from a locked counter row. */
async function saveOrder(db, order) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await query(
      client,
      'UPDATE order_sequence SET last_number = last_number + 1 WHERE id = 1 RETURNING last_number AS "orderNumber"',
    );
    const { orderNumber } = rows[0];
    await query(
      client,
      `INSERT INTO orders (id, order_number, promo_code, subtotal_cents, discount_cents, total_cents, reservation_id, lines)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        order.orderId,
        orderNumber,
        order.promoCode,
        order.subtotalCents,
        order.discountCents,
        order.totalCents,
        order.reservationId,
        JSON.stringify(order.lines),
      ],
    );
    await client.query('COMMIT');
    return { ...order, orderNumber };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Places an order:
 *   1. price the cart from inventory-service's catalog
 *   2. validate the promo code with promo-service
 *   3. reserve stock with inventory-service (high-value carts are flagged for audit)
 *   4. save the order in orders-db (releasing the stock again if that fails)
 */
async function placeOrder({ db, clients, auditThresholdCents = 50_000 }, { items, promoCode } = {}) {
  const wanted = normalizeItems(items);

  const catalog = new Map((await clients.inventory.listProducts()).map((p) => [p.id, p]));
  const lines = wanted.map(({ productId, quantity }) => {
    const product = catalog.get(productId);
    if (!product) throw new ValidationError(`Unknown product: ${productId}`);
    return { productId, name: product.name, quantity, unitPriceCents: product.priceCents, lineTotalCents: product.priceCents * quantity };
  });
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  const code = typeof promoCode === 'string' ? promoCode.trim().toUpperCase() : '';
  let discountCents = 0;
  if (code) {
    const promo = await clients.promo.validate(code, subtotalCents);
    discountCents = promo.discount.amountCents;
  }

  const reservation = await clients.inventory.reserve(wanted, { audit: subtotalCents >= auditThresholdCents });

  const order = {
    orderId: randomUUID(),
    promoCode: code || null,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    reservationId: reservation.reservationId,
    lines,
  };
  try {
    return await saveOrder(db, order);
  } catch (err) {
    await clients.inventory.release(reservation.reservationId).catch((releaseErr) =>
      logger.error({ err: releaseErr, reservationId: reservation.reservationId }, 'could not release stock for failed order'),
    );
    throw err;
  }
}

module.exports = { placeOrder, saveOrder, normalizeItems };
