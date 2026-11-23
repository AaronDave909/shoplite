'use strict';
const tracer = require('dd-trace'); // no-op unless started with --require dd-trace/init
const logger = require('./logger');

// Express 5 forwards both sync throws and rejected promises here.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  const log = { err, path: req.path, method: req.method, status };
  if (status >= 500) {
    // Attach the exception to the request span so it shows in APM and Error Tracking.
    tracer.scope().active()?.setTag('error', err);
    logger.error(log, 'unhandled error');
  } else {
    logger.warn(log, err.message);
  }
  const body = { error: status >= 500 && !err.expose ? 'Internal Server Error' : err.message };
  if (err.details) body.details = err.details;
  res.status(status).json(body);
}

function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

/** Chaos endpoints exist only when CHAOS_ENABLED=true (set in docker-compose.yml). */
function chaosEnabled(env = process.env) {
  return env.CHAOS_ENABLED === 'true';
}

module.exports = { errorHandler, notFound, chaosEnabled };
