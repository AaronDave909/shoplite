# Changelog

## Unreleased

<<<<<<< HEAD
- Fix audited inventory reservations failing because their SQL referenced a nonexistent column and passed a non-boolean audit value.
- Split the ShopLite monolith into four microservices run with Docker Compose:
  `storefront-service`, `checkout-service` (with `orders-db`), `promo-service` (with
  `promo-db`) and `inventory-service` (with `inventory-db`). Each has its own folder,
  Dockerfile, `DD_SERVICE` and Postgres database; services talk only over HTTP.
- Datadog: distributed tracing across services, Database Monitoring on all three databases,
  container metrics and logs, Unified Service Tagging with `env:staging`, and Source Code
  Integration that maps stack frames to `services/<name>/src`. New monitors for inventory
  errors, promo-service restarts and checkout latency.
- Chaos & Crash Testing Panel on the storefront (cascading promo null error, promo-service
  OOM crash, inventory DB query bug, orders-db lock and pool exhaustion) with a live service
  status bar.
- `npm run dev` runs the whole stack without Docker. Tests and `npm run validate` use PGlite
  (in-memory Postgres). CI also builds every Docker image.
- AGENTS.md: fix PRs must include a test and an entry in the affected service's
  "Incident & Fix Log".
=======
>>>>>>> parent of f71eb97 (feat: converted monolith to microservice environment)
- Return a validation error instead of a checkout 500 for unknown or expired promotion codes.
- Reject legacy promotions whose tiers have all expired instead of returning a null discount and causing a checkout 500.

## 1.0.0

- Initial ShopLite sample app with Datadog APM, log correlation and Error Tracking.
