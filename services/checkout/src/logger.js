'use strict';
// JSON logs to stdout. The Datadog Agent collects container stdout, and with
// DD_LOGS_INJECTION=true dd-trace adds dd.trace_id / dd.span_id to every line.
const pino = require('pino');

module.exports = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: process.env.DD_SERVICE || 'checkout-service' },
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({ sync: true }),
);
