'use strict';
const express = require('express');
const { listProducts, reserveStock, releaseReservation } = require('./inventory');
const { pingDatabase } = require('./db');
const { errorHandler, notFound } = require('./http');

function createApp({ db }) {
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

  app.get('/products', async (_req, res) => res.json(await listProducts(db)));

  // Body: { items: [{ productId, quantity }], audit?: boolean }
  app.post('/reservations', async (req, res) => {
    const { items, audit } = req.body || {};
    res.status(201).json(await reserveStock(db, { items, audit: audit === true }));
  });

  app.post('/reservations/:id/release', async (req, res) => {
    res.json(await releaseReservation(db, req.params.id));
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
