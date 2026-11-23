'use strict';
// Chaos: saturate the orders-db connection pool with open transactions that hold a
// FOR UPDATE lock on the order counter. Every new order needs that row (and a pool
// connection), so checkouts slow down and then fail with connection timeouts until the
// locks are released. Everything is rolled back after `holdSeconds`, so it heals itself.
const { ConflictError } = require('./errors');
const logger = require('./logger');

let active = null;

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function lockOrdersDb(db, { connections, holdSeconds } = {}) {
  if (active) throw new ConflictError('An orders-db lock test is already running', { endsAt: active.endsAt });

  const count = clamp(connections, 1, 50, db.options?.max || 10);
  const holdMs = clamp(holdSeconds, 1, 300, 45) * 1000;
  const run = { endsAt: new Date(Date.now() + holdMs).toISOString(), clients: [], released: false };
  active = run;

  const openOne = async () => {
    const client = await db.connect();
    if (run.released) return client.release();
    run.clients.push(client);
    await client.query('BEGIN');
    await client.query('SELECT last_number FROM order_sequence WHERE id = 1 FOR UPDATE');
  };
  for (let i = 0; i < count; i++) {
    openOne().catch((err) => logger.warn({ err: err.message }, 'chaos: could not open a locking transaction'));
  }
  logger.warn({ connections: count, holdMs }, 'chaos: holding orders-db row locks and pool connections');

  const release = async () => {
    run.released = true;
    await Promise.all(
      run.clients.map((c) => c.query('ROLLBACK').catch(() => {}).finally(() => c.release())),
    );
    if (active === run) active = null;
    logger.info({ connections: run.clients.length }, 'chaos: released orders-db locks');
  };
  setTimeout(release, holdMs).unref();

  return { connections: count, holdSeconds: holdMs / 1000, endsAt: run.endsAt, release };
}

module.exports = { lockOrdersDb };
