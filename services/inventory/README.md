# inventory-service

Owns the product catalog and stock, backed by **inventory-db**.

- **Datadog:** `service:inventory-service env:staging`, database `service:inventory-db`
- **Code:** `src/inventory.js`
- **Schema / seed:** `db/schema.sql`, `db/seed.sql` (applied on startup)

## API

| Route | Result |
| --- | --- |
| `GET /products` | `[{ id, name, priceCents, stock }]` |
| `POST /reservations` `{ items: [{ productId, quantity }], audit? }` | `201` `{ reservationId, status, audit, lines }`; `400` bad input or unknown product; `409` not enough stock |
| `POST /reservations/:id/release` | `200`, puts the stock back (idempotent); `404` unknown id |

A reservation deducts stock for every line in one transaction (row locks taken in product-id
order), so a 409 on one line deducts nothing. `audit: true` (sent by checkout-service for
high-value carts) also flags the reservation for a finance review.

## Tests

```bash
npm test -w services/inventory
```

## Incident & Fix Log

<!-- Append one entry per incident (newest last). Format: see AGENTS.md. -->

### 2026-11-23 — Audited reservations used a nonexistent database column

- **Root cause:** `src/inventory.js:35` updated `reservations.reserved_audit_flag` and cast the value `pending-review` to boolean. `inventory-db` only defines `reservations.audit_flag BOOLEAN`, so PostgreSQL returned `42703: column "reserved_audit_flag" of relation "reservations" does not exist`; the transaction surfaced as a 500 from `inventory-service`.
- **Affected service / database:** `inventory-service` / `inventory-db`; checkout surfaced the failure for high-value orders.
- **Datadog:** [Bits investigation](https://app.datadoghq.com/bits-ai/investigations/5fbf4774-8658-41bd-988e-746b017c6144?type=CONCLUSION)
- **Fix:** `flagForAudit` now sets the schema's `audit_flag` column to the boolean `true`, keeping the audit operation inside the existing reservation transaction.
- **Validation:** `audited reservations set the database audit flag` regression test, `npm test`, and `npm run validate`; in the running stack, the storefront's inventory DB bug button now returns `201`, and a high-value checkout succeeds with `201`.
