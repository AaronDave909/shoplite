'use strict';
// Runs all four services in one Node process, each on its own port with its own
// in-memory Postgres (PGlite). Used by `npm run dev` (no Docker, no Datadog) and by
// `npm run validate`. The services talk to each other over real HTTP, as in Docker.
const { createTestDb } = require('../../test-support/pglite');

const services = (name) => `../../services/${name}/src`;
const load = (name, file) => require(`${services(name)}/${file}`);

function listen(app, port) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function startLocalStack({ basePort = 0, chaos = false, onCrash } = {}) {
  const port = (offset) => (basePort ? basePort + offset : 0);
  const chaosEnv = { CHAOS_ENABLED: String(chaos) };
  const urlOf = (server) => `http://127.0.0.1:${server.address().port}`;
  const dbs = {};

  for (const name of ['promo', 'inventory', 'checkout']) {
    dbs[name] = await createTestDb();
    await load(name, 'db').migrate(dbs[name]);
  }

  // promo-service. In Docker a crash kills the container; here it closes the port for a
  // few seconds and reopens it, so the storefront shows the same down -> up cycle.
  let promoServer;
  let promoPort = port(2);
  const startPromo = async () => {
    const crash = () => {
      promoServer.closeAllConnections?.();
      promoServer.close();
      onCrash?.('promo-service');
      setTimeout(startPromo, 8000).unref();
    };
    const app = load('promo', 'app').createApp({ db: dbs.promo, env: chaosEnv, crash });
    promoServer = await listen(app, promoPort);
    promoPort = promoServer.address().port; // keep the same port across simulated restarts
  };
  await startPromo();
  const promoUrl = `http://127.0.0.1:${promoPort}`;

  const inventory = await listen(load('inventory', 'app').createApp({ db: dbs.inventory }), port(3));

  const checkout = await listen(
    load('checkout', 'app').createApp({
      db: dbs.checkout,
      env: { ...chaosEnv, PROMO_SERVICE_URL: promoUrl, INVENTORY_SERVICE_URL: urlOf(inventory) },
    }),
    port(1),
  );

  const storefront = await listen(
    load('storefront', 'app').createApp({
      env: {
        ...chaosEnv,
        CHECKOUT_SERVICE_URL: urlOf(checkout),
        PROMO_SERVICE_URL: promoUrl,
        INVENTORY_SERVICE_URL: urlOf(inventory),
      },
    }),
    port(0),
  );

  return {
    urls: { storefront: urlOf(storefront), checkout: urlOf(checkout), promo: promoUrl, inventory: urlOf(inventory) },
    async close() {
      for (const s of [storefront, checkout, inventory, promoServer]) {
        s.closeAllConnections?.();
        s.close();
      }
      await Promise.all(Object.values(dbs).map((d) => d.end()));
    },
  };
}

module.exports = { startLocalStack };
