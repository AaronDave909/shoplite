'use strict';
const path = require('node:path');
const express = require('express');
const { serviceUrls, callBackend, checkAll } = require('./upstream');
const { errorHandler, notFound, chaosEnabled } = require('./http');

function createApp({ env = process.env, fetchImpl = fetch } = {}) {
  const urls = serviceUrls(env);
  const backend = (service, p, opts = {}) => callBackend(urls, service, p, { fetchImpl, ...opts });
  const relay = (res, { status, body }) => res.status(status).json(body);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/status', async (_req, res) => res.json({ services: await checkAll(urls, { fetchImpl }), at: new Date().toISOString() }));

  app.get('/api/products', async (_req, res) => relay(res, await backend('inventory-service', '/products')));
  app.post('/api/checkout', async (req, res) =>
    relay(res, await backend('checkout-service', '/orders', { method: 'POST', body: req.body || {} })),
  );

  // Chaos & Crash Testing Panel. Each route maps to one button in public/index.html.
  if (chaosEnabled(env)) {
    // 1. App cross-service bug: LEGACY_VIP flows storefront -> checkout -> promo.
    app.post('/api/chaos/promo-null-error', async (_req, res) =>
      relay(res, await backend('checkout-service', '/orders', {
        method: 'POST',
        body: { items: [{ productId: 'mug', quantity: 1 }], promoCode: 'LEGACY_VIP' },
      })),
    );
    // 2. App process crash: promo-service exhausts memory and exits.
    app.post('/api/chaos/promo-crash', async (_req, res) =>
      relay(res, await backend('promo-service', '/chaos/crash', { method: 'POST', body: {} })),
    );
    // 3. Database code bug: an audited stock reservation runs a broken SQL statement.
    app.post('/api/chaos/inventory-db-bug', async (_req, res) =>
      relay(res, await backend('inventory-service', '/reservations', {
        method: 'POST',
        body: { items: [{ productId: 'stickers', quantity: 1 }], audit: true },
      })),
    );
    // 4. Database resource crash: hold orders-db row locks and pool connections.
    app.post('/api/chaos/orders-db-lock', async (req, res) =>
      relay(res, await backend('checkout-service', '/chaos/orders-db-lock', { method: 'POST', body: req.body || {} })),
    );
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
