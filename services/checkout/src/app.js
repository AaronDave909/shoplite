'use strict';
const express = require('express');
const { placeOrder } = require('./orders');
const { createClients } = require('./clients');
const { lockOrdersDb } = require('./chaos');
const { pingDatabase } = require('./db');
const { errorHandler, notFound, chaosEnabled } = require('./http');

function createApp({ db, clients, env = process.env }) {
  clients ||= createClients({
    promoUrl: env.PROMO_SERVICE_URL || 'http://promo-service:3000',
    inventoryUrl: env.INVENTORY_SERVICE_URL || 'http://inventory-service:3000',
  });
  const auditThresholdCents = Number(env.AUDIT_THRESHOLD_CENTS || 50_000);

  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await pingDatabase(db);
      res.json({ status: 'ok', database: 'ok' });
    } catch (err) {
      res.status(503).json({ status: 'degraded', database: err.message });
    }
  });

  // Body: { items: [{ productId, quantity }], promoCode?: string }
  app.post('/orders', async (req, res) => {
    res.status(201).json(await placeOrder({ db, clients, auditThresholdCents }, req.body));
  });

  if (chaosEnabled(env)) {
    app.post('/chaos/orders-db-lock', (req, res) => {
      const { release, ...run } = lockOrdersDb(db, req.body || {});
      res.status(202).json({ message: 'Holding orders-db locks and pool connections.', ...run });
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
