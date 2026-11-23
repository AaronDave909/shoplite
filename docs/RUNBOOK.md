# ShopLite runbook

## Service overview

| Service | Routes | Database |
| --- | --- | --- |
| `storefront-service` | UI, `/api/products`, `/api/checkout`, `/api/status`, `/api/chaos/*` | none |
| `checkout-service` | `POST /orders` (calls promo + inventory) | `orders-db` |
| `promo-service` | `POST /promotions/validate` | `promo-db` |
| `inventory-service` | `GET /products`, `POST /reservations`, `POST /reservations/:id/release` | `inventory-db` |

Datadog tags: `service:<name> env:staging version:<DD_VERSION>`. Databases are tagged
`service:orders-db` / `promo-db` / `inventory-db`.

Status of everything at a glance: the storefront's **Service status** bar, or
`docker compose ps`.

## Checkout 5xx

**Signal:** monitor `[shoplite] checkout-service 5xx errors`, or an Error Tracking issue on
`checkout-service` `POST /orders`.

**Investigate:**
1. Error Tracking → `service:checkout-service env:staging`. Note the error type, message, top
   stack frame and first-seen version.
2. Open a sample trace. **Look at every downstream span**, not only the one that errored: a
   `TypeError` in checkout often means promo-service or inventory-service returned a 200 with
   bad data. Compare the downstream response with the API contract in that service's README.
3. A `502` in checkout means a dependency returned a 5xx: go to that service's errors. A `503`
   means a dependency was unreachable: check its container (restarts, OOM).
4. Use the log attributes (`promoCode`, cart size) to find a pattern.

**Expected behaviour:** invalid input is a 4xx with a readable message. Any 5xx is a bug.

## Inventory 5xx

**Signal:** `[shoplite] inventory-service 5xx errors`.

1. Error Tracking → `service:inventory-service`. `DatabaseError` carries the Postgres SQLSTATE
   in `err.code` (`42703` = undefined column, `22P02` = invalid input syntax/cast).
2. DBM → `inventory-db` → the failing statement and its samples.
3. Compare the query with `services/inventory/db/schema.sql`.

## promo-service crash / restart

**Signal:** `[shoplite] promo-service container restarted`, or promo **down** in the status bar.

1. Infrastructure → Containers → `promo-service`: exit code (137 = OOM-killed) and restart count.
2. Logs → `service:promo-service`, the last lines before the restart.
3. Impact: promo-code checkouts return 503 while it's down. Orders without a code, the
   catalog, and inventory are unaffected.
4. A crash from the Chaos panel recovers on its own. Repeated restarts with no chaos request
   mean a real leak or crash loop.

## Orders DB saturation

**Signal:** `[shoplite] checkout-service order latency high`, errors with
`timeout exceeded when trying to connect`, checkout **degraded** in the status bar.

1. DBM → `orders-db`: active connections, blocking queries, sessions *idle in transaction*,
   lock waits on `order_sequence`.
2. Find the blocking session's `application_name` (`checkout-service`) and query.
3. A Chaos panel run releases itself after its hold time. To end it early:
   `docker compose restart checkout-service`.

## Fix and validate

Follow `AGENTS.md`. `npm test` runs every service's tests; `npm run validate` replays the
known incident scenarios through all four services.
