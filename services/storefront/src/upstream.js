'use strict';
// storefront-service talks to the backend only over HTTP. dd-trace instruments fetch,
// so each call continues the browser request's trace into the backend services.
const logger = require('./logger');

function serviceUrls(env = process.env) {
  return {
    'checkout-service': env.CHECKOUT_SERVICE_URL || 'http://checkout-service:3000',
    'promo-service': env.PROMO_SERVICE_URL || 'http://promo-service:3000',
    'inventory-service': env.INVENTORY_SERVICE_URL || 'http://inventory-service:3000',
  };
}

/** Calls a backend service and returns { status, body }. Never throws. */
async function callBackend(urls, service, path, { method = 'GET', body, timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(new URL(path, urls[service]), {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status >= 500) logger.warn({ service, path, status: res.status }, 'backend returned a server error');
    return { status: res.status, body: payload };
  } catch (err) {
    logger.warn({ service, path, err: err.message }, 'backend unreachable');
    return { status: 503, body: { error: `${service} is unavailable (${err.cause?.code || err.name})` } };
  }
}

/** Health of every service: up (200), degraded (answers but its database does not), down (no answer). */
async function checkAll(urls, { fetchImpl = fetch, timeoutMs = 1500 } = {}) {
  const checks = Object.keys(urls).map(async (service) => {
    const started = Date.now();
    const { status, body } = await callBackend(urls, service, '/health', { timeoutMs, fetchImpl });
    const state = status === 200 ? 'up' : status === 503 && body.status === 'degraded' ? 'degraded' : 'down';
    return { service, state, latencyMs: Date.now() - started, detail: body.database || body.error || null };
  });
  return [{ service: 'storefront-service', state: 'up', latencyMs: 0, detail: null }, ...(await Promise.all(checks))];
}

module.exports = { serviceUrls, callBackend, checkAll };
