'use strict';
const { randomUUID } = require('node:crypto');
const { query } = require('./db');
const { ValidationError, NotFoundError, ConflictError } = require('./errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listProducts(db) {
  const { rows } = await query(
    db,
    'SELECT id, name, price_cents AS "priceCents", stock FROM products ORDER BY price_cents DESC',
  );
  return rows;
}

/** Validates items and merges duplicate product lines. Sorted so row locks are taken in a stable order. */
function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError('items must be a non-empty array');
  const totals = new Map();
  for (const item of items) {
    const productId = item?.productId;
    const quantity = Number(item?.quantity);
    if (typeof productId !== 'string' || productId === '') throw new ValidationError('Each item needs a productId');
    if (!Number.isInteger(quantity) || quantity < 1) throw new ValidationError(`Invalid quantity for ${productId}`);
    totals.set(productId, (totals.get(productId) || 0) + quantity);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([productId, quantity]) => ({ productId, quantity }));
}

/** High-value reservations are flagged so the finance team can review them. */
async function flagForAudit(client, reservationId) {
  await query(
    client,
    `UPDATE reservations
        SET audit_flag = true
      WHERE id = $1`,
    [reservationId],
  );
}

async function inTransaction(db, fn) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deducts stock for every item in one transaction and records a reservation.
 * Throws ValidationError (400) for bad input or unknown products, ConflictError (409) when
 * there is not enough stock. Nothing is deducted unless every line succeeds.
 */
async function reserveStock(db, { items, audit = false } = {}) {
  const wanted = normalizeItems(items);

  return inTransaction(db, async (client) => {
    const lines = [];
    for (const { productId, quantity } of wanted) {
      const { rows } = await query(
        client,
        `UPDATE products SET stock = stock - $2
          WHERE id = $1 AND stock >= $2
          RETURNING id, name, price_cents, stock`,
        [productId, quantity],
      );
      if (rows.length === 0) {
        const { rows: found } = await query(client, 'SELECT stock FROM products WHERE id = $1', [productId]);
        if (found.length === 0) throw new ValidationError(`Unknown product: ${productId}`);
        throw new ConflictError(`Not enough stock for ${productId}`, {
          productId,
          requested: quantity,
          available: found[0].stock,
        });
      }
      const [p] = rows;
      lines.push({ productId, name: p.name, unitPriceCents: p.price_cents, quantity, remainingStock: p.stock });
    }

    const reservationId = randomUUID();
    await query(client, 'INSERT INTO reservations (id) VALUES ($1)', [reservationId]);
    for (const l of lines) {
      await query(
        client,
        'INSERT INTO reservation_items (reservation_id, product_id, quantity) VALUES ($1, $2, $3)',
        [reservationId, l.productId, l.quantity],
      );
    }
    if (audit) await flagForAudit(client, reservationId);

    return { reservationId, status: 'reserved', audit: Boolean(audit), lines };
  });
}

/** Puts a reservation's stock back. Releasing twice is a no-op. */
async function releaseReservation(db, reservationId) {
  if (!UUID.test(String(reservationId))) throw new NotFoundError(`No reservation ${reservationId}`);

  return inTransaction(db, async (client) => {
    const { rows } = await query(
      client,
      `UPDATE reservations SET status = 'released'
        WHERE id = $1 AND status = 'reserved'
        RETURNING id`,
      [reservationId],
    );
    if (rows.length === 0) {
      const { rows: found } = await query(client, 'SELECT status FROM reservations WHERE id = $1', [reservationId]);
      if (found.length === 0) throw new NotFoundError(`No reservation ${reservationId}`);
      return { reservationId, status: found[0].status };
    }
    await query(
      client,
      `UPDATE products p SET stock = p.stock + ri.quantity
         FROM reservation_items ri
        WHERE ri.reservation_id = $1 AND ri.product_id = p.id`,
      [reservationId],
    );
    return { reservationId, status: 'released' };
  });
}

module.exports = { listProducts, reserveStock, releaseReservation, normalizeItems };
