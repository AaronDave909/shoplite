'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const tracer = require('dd-trace'); // no-op unless started with --require dd-trace/init
const logger = require('./logger');
const { PRODUCTS } = require('./catalog');
const { priceCart } = require('./checkout');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/products', (_req, res) => res.json(PRODUCTS));

  app.post('/api/checkout', (req, res) => {
    const order = priceCart(req.body);
    const orderId = crypto.randomUUID();
    logger.info({ orderId, totalCents: order.totalCents, promoCode: order.promoCode }, 'order placed');
    res.status(201).json({ orderId, ...order });
  });

  // Express 5 forwards both sync throws and rejected promises here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const log = { err, path: req.path, method: req.method, status };
    if (status >= 500) {
      // Attach the exception to the active span so it shows in APM + Error Tracking.
      tracer.scope().active()?.setTag('error', err);
      logger.error(log, 'unhandled error');
    }
    else logger.warn(log, err.message);
    res.status(status).json({ error: status >= 500 ? 'Internal Server Error' : err.message });
  });

  return app;
}

module.exports = { createApp };
