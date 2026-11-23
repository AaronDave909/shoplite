# storefront-service

Serves the ShopLite web UI: the product catalog, checkout form, live service status bar and
the **Chaos & Crash Testing Panel**. It has no database and talks to the backend only over
HTTP; dd-trace propagates the trace from each browser request into the backend services.

- **Datadog:** `service:storefront-service env:staging`
- **Port:** 3000 (the only port published by `docker-compose.yml`)

## API

| Route | Calls |
| --- | --- |
| `GET /health` | itself |
| `GET /api/status` | `GET /health` on checkout, promo and inventory (1.5 s timeout each) |
| `GET /api/products` | inventory-service `GET /products` |
| `POST /api/checkout` | checkout-service `POST /orders` |
| `POST /api/chaos/promo-null-error` | checkout-service `POST /orders` with `LEGACY_VIP` |
| `POST /api/chaos/promo-crash` | promo-service `POST /chaos/crash` |
| `POST /api/chaos/inventory-db-bug` | inventory-service `POST /reservations` with `audit: true` |
| `POST /api/chaos/orders-db-lock` | checkout-service `POST /chaos/orders-db-lock` |

The `/api/chaos/*` routes exist only when `CHAOS_ENABLED=true`. Backend status codes are
passed through unchanged; an unreachable backend becomes a 503 that names the service.

## Configuration

| Variable | Default |
| --- | --- |
| `CHECKOUT_SERVICE_URL` | `http://checkout-service:3000` |
| `PROMO_SERVICE_URL` | `http://promo-service:3000` |
| `INVENTORY_SERVICE_URL` | `http://inventory-service:3000` |
| `CHAOS_ENABLED` | unset (off) |

## Tests

```bash
npm test -w services/storefront
```

## Incident & Fix Log

<!-- Append one entry per incident (newest last). Format: see AGENTS.md. -->

_No incidents yet._
