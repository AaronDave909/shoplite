'use strict';
// HTTP clients for promo-service and inventory-service. dd-trace instruments fetch, so
// every call carries the trace context and shows up as one distributed trace in APM.
const { HttpError } = require('./errors');

/** A dependency failed (502) or could not be reached (503). */
class UpstreamError extends HttpError {
  constructor(status, message, upstream) {
    super(status, message);
    this.upstream = upstream;
    this.expose = true; // the message names the failing service, which is safe to show
  }
}

async function callService(name, baseUrl, path, { method = 'GET', body, timeoutMs = 5000, fetchImpl = fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(new URL(path, baseUrl), {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(503, `${name} is unavailable (${err.cause?.code || err.name})`, name);
  }

  const payload = await res.json().catch(() => ({}));
  if (res.ok) return payload;
  // A 4xx from a dependency is the caller's input problem: pass it through unchanged.
  if (res.status < 500) throw new HttpError(res.status, payload.error || `${name} returned ${res.status}`, payload.details);
  throw new UpstreamError(502, `${name} failed with HTTP ${res.status}`, name);
}

function createClients({ promoUrl, inventoryUrl, fetchImpl } = {}) {
  const promo = (path, opts) => callService('promo-service', promoUrl, path, { fetchImpl, ...opts });
  const inventory = (path, opts) => callService('inventory-service', inventoryUrl, path, { fetchImpl, ...opts });
  return {
    promo: {
      validate: (code, subtotalCents) =>
        promo('/promotions/validate', { method: 'POST', body: { code, subtotalCents } }),
    },
    inventory: {
      listProducts: () => inventory('/products'),
      reserve: (items, { audit = false } = {}) =>
        inventory('/reservations', { method: 'POST', body: { items, audit } }),
      release: (reservationId) =>
        inventory(`/reservations/${encodeURIComponent(reservationId)}/release`, { method: 'POST', body: {} }),
    },
  };
}

module.exports = { createClients, callService, UpstreamError };
