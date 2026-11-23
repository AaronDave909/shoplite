'use strict';
const express = require('express');
const { validatePromotion } = require('./promotions');
const { exhaustMemoryAndExit } = require('./chaos');
const { pingDatabase } = require('./db');
const { errorHandler, notFound, chaosEnabled } = require('./http');

function createApp({ db, crash = exhaustMemoryAndExit, env = process.env }) {
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

  app.post('/promotions/validate', async (req, res) => {
    const { code, subtotalCents } = req.body || {};
    const result = await validatePromotion(db, code, subtotalCents);
    res.json({ valid: true, ...result });
  });

  if (chaosEnabled(env)) {
    app.post('/chaos/crash', (_req, res) => {
      res.status(202).json({ message: 'promo-service is crashing now; Docker will restart it.' });
      res.on('finish', () => crash({ targetMb: Number(env.CHAOS_CRASH_ALLOC_MB || 768) }));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
