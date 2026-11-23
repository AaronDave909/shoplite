# promo-service

Validates promo codes and calculates discounts, backed by **promo-db**.

- **Datadog:** `service:promo-service env:staging`, database `service:promo-db`
- **Code:** `src/promotions.js`, `src/chaos.js`
- **Schema / seed:** `db/schema.sql`, `db/seed.sql` (applied on startup)

## API

`POST /promotions/validate` `{ code, subtotalCents }`

- `200` `{ valid: true, code, ruleType, discount: { percent, amountCents } }`
- `400` `{ error: "Unknown or expired promotion code: X" }` for unknown or expired codes

Rule types: `percent` (flat percentage) and `legacy_tiered` (tiers migrated from the old
loyalty system, each with its own `validUntil`; the best live tier wins).

Seeded codes: `SAVE10`, `WELCOME5` (active), `BLACKFRIDAY` (expired 2025-11-30),
`LEGACY_VIP` (legacy tiers).

## Chaos endpoint (`CHAOS_ENABLED=true` only)

`POST /chaos/crash` replies `202`, then allocates memory in 64 MB chunks up to
`CHAOS_CRASH_ALLOC_MB` (768). The container's `mem_limit` is 256 MB, so the kernel OOM-kills
it (exit 137); if not, the process calls `process.exit(1)`. `restart: unless-stopped` brings
it back.

## Tests

```bash
npm test -w services/promo
```

## Incident & Fix Log

<!-- Append one entry per incident (newest last). Format: see AGENTS.md. -->

### 2026-11-20: Expired promo code crashed checkout

- **Root cause:** `calculateDiscount` assumed `findActivePromotion` always returned a promotion.
  For the expired `BLACKFRIDAY` code it returned `undefined`, so reading `.percent` threw a
  `TypeError` and checkout returned 500.
- **Affected service / database:** shoplite monolith (pre-split), now `promo-service`.
- **Datadog links:** see `docs/incidents/2026-11-20-invalid-promotion-checkout.md`.
- **Fix:** unknown or expired codes throw `ValidationError` (400). Carried over into
  `validatePromotion` in `src/promotions.js` during the microservices split.
- **Validation steps:** `test/promotions.test.js` ("BLACKFRIDAY is valid through the end of
  its last day, then rejected"); `npm run validate` scenario "expired promo BLACKFRIDAY" is 400.
