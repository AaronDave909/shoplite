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

_No incidents yet._
