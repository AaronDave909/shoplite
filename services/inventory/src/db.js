'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function createPool(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: Number(env.PG_POOL_MAX || 10),
    connectionTimeoutMillis: Number(env.PG_CONNECTION_TIMEOUT_MS || 3000),
    idleTimeoutMillis: 10_000,
    application_name: env.DD_SERVICE || 'inventory-service',
  });
}

class DatabaseError extends Error {
  constructor(cause) {
    super(cause.message, { cause });
    this.name = 'DatabaseError';
    this.code = cause.code; // Postgres SQLSTATE, e.g. 42703 = undefined column
  }
}

/**
 * Runs a query. Driver errors are rethrown from here so their stack trace includes the
 * service code that issued the query, not only frames inside the pg driver.
 */
async function query(db, text, params) {
  try {
    return await db.query(text, params);
  } catch (err) {
    throw new DatabaseError(err);
  }
}

/** Applies db/schema.sql then db/seed.sql. Both are idempotent. */
async function migrate(db) {
  for (const file of ['schema.sql', 'seed.sql']) {
    await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8'));
  }
}

async function waitForDatabase(db, logger, { attempts = 30, delayMs = 1000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      logger.warn({ attempt: i, err: err.message }, 'database not ready, retrying');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** Health check that fails fast instead of waiting on a saturated pool. */
async function pingDatabase(db, timeoutMs = 1000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`database did not answer within ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    await Promise.race([db.query('SELECT 1'), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { createPool, query, migrate, waitForDatabase, pingDatabase, DatabaseError };
