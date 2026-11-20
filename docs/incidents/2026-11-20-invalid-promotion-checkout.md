# Incident: Invalid promotion codes caused checkout 500s

- **Date:** 2026-11-20
- **Service / env:** shoplite / sandbox
- **Datadog links:** [Bits AI investigation](https://app.datadoghq.com/bits-ai/investigations/1c6c9559-004a-4851-9a3b-29d63731217b?type=CONCLUSION)
- **Severity:** SEV-?

## Summary
Unknown or expired promotion codes caused `POST /api/checkout` to return HTTP 500
because checkout pricing dereferenced an absent promotion.

## Root cause
`findActivePromotion` in `src/promotions.js` intentionally returned `undefined` for
unknown or expired nonempty codes. `calculateDiscount` then read `promo.percent`
without checking that result, producing `TypeError: Cannot read properties of undefined
(reading 'percent')`. The error propagated through `priceCart` to the Express error
handler and was classified as a 500.

## Evidence
The investigation found 40 matching error logs, with sampled stacks pointing to
`src/promotions.js:24`, followed by `priceCart` and the checkout handler. The affected
telemetry referenced commit `509c1abc38656a16f01174dde922931e6665d07f`.

## Fix
Moved the shared `ValidationError` contract to `src/errors.js` and made
`calculateDiscount` throw it for unknown or expired nonempty codes. This preserves
empty-code and valid-code behavior while allowing the existing Express handler to
return HTTP 400 before order creation.

## Validation
- Regression tests: `test/checkout.test.js`, `test/http.test.js`
- `npm test`: pass
- `npm run validate`: pass
- After deploy: not performed in this change; the supplied investigation identified
  the sandbox telemetry and this change was validated locally.

## Follow-ups
Keep checkout 5xx monitoring enabled; invalid or expired promotion input should remain
a 4xx response.
