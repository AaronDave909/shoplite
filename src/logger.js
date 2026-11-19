'use strict';
// JSON logs. With DD_LOGS_INJECTION=true, dd-trace adds dd.trace_id / dd.span_id
// to every line so Datadog can link each log to its APM trace.
const fs = require('node:fs');
const path = require('node:path');
const pino = require('pino');

const logFile = process.env.LOG_FILE || path.join(__dirname, '..', 'logs', 'shoplite.log');
fs.mkdirSync(path.dirname(logFile), { recursive: true });

const streams = [{ stream: process.stdout }];
if (process.env.NODE_ENV !== 'test') {
  // The Datadog Agent tails this file (see datadog/conf.d/nodejs.d/conf.yaml).
  streams.push({ stream: pino.destination({ dest: logFile, sync: false }) });
}

module.exports = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: process.env.DD_SERVICE || 'shoplite' },
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream(streams),
);
