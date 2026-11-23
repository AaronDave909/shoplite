# checkout-service

Places orders. For each `POST /orders` it:

1. prices the cart from inventory-service's catalog (`GET /products`)
2. validates the promo code with promo-service (`POST /promotions/validate`)
3. reserves stock with inventory-service (`POST /reservations`; carts at or above
   `AUDIT_THRESHOLD_CENTS` ask for an audited reservation)
4. saves the order in **orders-db** inside a transaction that takes the next order number from
   the locked `order_sequence` row. If saving fails, it releases the reservation again.

- **Datadog:** `service:checkout-service env:staging`, database `service:orders-db`
- **Code:** `src/orders.js` (flow), `src/clients.js` (HTTP to promo/inventory), `src/chaos.js`
- **Schema:** `db/schema.sql`, applied on startup

## Status codes

| Status | When |
| --- | --- |
| 201 | Order placed |
| 400 | Bad cart or invalid promo code (passed through from promo-service) |
| 409 | Not enough stock (passed through from inventory-service) |
| 502 | A dependency returned a 5xx |
| 503 | A dependency is unreachable |
| 500 | A bug in this service |

## Chaos endpoint (`CHAOS_ENABLED=true` only)

`POST /chaos/orders-db-lock` `{ connections = PG_POOL_MAX, holdSeconds = 45 }` opens
`connections` transactions, each holding a pool connection, that wait on or hold a
`SELECT … FOR UPDATE` lock on `order_sequence`. Orders queue behind the lock and the pool,
then fail with `timeout exceeded when trying to connect`. Everything is rolled back after
`holdSeconds`. Only one run at a time (409 otherwise).

## Configuration

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | required |
| `PG_POOL_MAX` | `10` |
| `PG_CONNECTION_TIMEOUT_MS` | `3000` |
| `AUDIT_THRESHOLD_CENTS` | `50000` ($500) |
| `PROMO_SERVICE_URL` | `http://promo-service:3000` |
| `INVENTORY_SERVICE_URL` | `http://inventory-service:3000` |

## Tests

```bash
npm test -w services/checkout
```

## Incident & Fix Log

<!-- Append one entry per incident (newest last). Format: see AGENTS.md. -->

_No incidents yet._
