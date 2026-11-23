'use strict';
// Test helper: a real, in-memory Postgres (PGlite = Postgres compiled to WebAssembly) behind
// the small slice of the pg.Pool interface the services use:
//   db.query(text, params) and db.connect() -> { query(text, params), release() }
// So tests and `npm run validate` hit real SQL (real errors for bad columns, casts, locks)
// without Docker. PGlite is a single connection, so clients take turns: connect() waits
// until the previous client is released.
const { PGlite } = require('@electric-sql/pglite');

async function createTestDb() {
  const pg = new PGlite();
  await pg.waitReady;

  let tail = Promise.resolve();
  const acquire = () => {
    let release;
    const held = new Promise((r) => (release = r));
    const ready = tail.then(() => release);
    tail = tail.then(() => held);
    return ready;
  };

  const run = async (text, params) => {
    if (params && params.length) return pg.query(text, params);
    const results = await pg.exec(text); // allows multi-statement files like db/schema.sql
    return results[results.length - 1] || { rows: [] };
  };

  return {
    options: { max: 1 },
    async query(text, params) {
      const release = await acquire();
      try {
        return await run(text, params);
      } finally {
        release();
      }
    },
    async connect() {
      const release = await acquire();
      let released = false;
      return {
        query: (text, params) => run(text, params),
        release: () => {
          if (!released) (released = true), release();
        },
      };
    },
    end: () => pg.close(),
  };
}

module.exports = { createTestDb };
