# Instructions for coding agents (Datadog Bits Code / Bits AI Dev Agent, Claude Code, etc.)

ShopLite is four Node.js microservices run with Docker Compose. Each service has its own
folder, Dockerfile, `DD_SERVICE` name and (except storefront) its own Postgres database:

| Folder | `DD_SERVICE` | Database | Owns |
| --- | --- | --- | --- |
| `services/storefront` | `storefront-service` | none (HTTP only) | Web UI, catalog view, Chaos panel |
| `services/checkout` | `checkout-service` | `orders-db` | Order orchestration (calls promo + inventory) |
| `services/promo` | `promo-service` | `promo-db` | Promo code validation, discounts |
| `services/inventory` | `inventory-service` | `inventory-db` | Catalog, stock reservations |

Services talk to each other only over HTTP. No service reads another service's database.

## Find the right service first

An error is often *reported* by one service and *caused* by another. Before changing code,
follow the distributed trace downstream: a `TypeError` in `checkout-service` may come from a
malformed `200 OK` returned by `promo-service`. Fix the service that produced the bad data or
query. Add a defensive check upstream only in addition to that, never instead of it.

## Every automated pull request MUST include all of:

1. **Root-cause fix** in the affected service's `src/`. Fix the cause, not the symptom. Don't
   wrap code in a blanket try/catch or swallow the error. Bad user input must return a 4xx with
   a clear message (throw `ValidationError` from that service's `src/errors.js`); a 5xx means a bug.
   Database bugs are fixed in the query or in `db/schema.sql` (schema changes must be
   idempotent, e.g. `ADD COLUMN IF NOT EXISTS`).
2. **An automated test that proves the bug is fixed**, in the affected service's `test/`
   folder. It must fail on the code before the fix and pass after it. Database tests use the
   real Postgres engine via `test-support/pglite.js` (see the existing tests for the pattern).
   If the scenario is in `scripts/validate.js`, that scenario must also pass.
3. **An entry in the affected service's `README.md`**, appended under its
   `## Incident & Fix Log` section, with:
   - **Date** (YYYY-MM-DD) and a one-line title
   - **Root cause**: file and line, error type and message
   - **Affected service / database** (e.g. `promo-service`, `promo-db`), and any service that
     surfaced the error (e.g. `checkout-service` returned the 500)
   - **Datadog links**: Error Tracking issue, trace, or Bits investigation, if you have them
   - **Fix**: what changed and why it addresses the cause
   - **Validation steps**: the new test's name, `npm test`, `npm run validate`, and how to
     confirm in the running stack (which button or request, and the expected status)
4. **Changelog entry** under "Unreleased" in `CHANGELOG.md`.
5. **Validation**: `npm test` and `npm run validate` both pass. CI runs both, and builds every
   Docker image, on every PR.

## Conventions

- CommonJS, Node 20, Express 5, `pg`. No new dependencies unless needed.
- Money is integer cents.
- SQL goes through `query()` from the service's `src/db.js` so errors keep the caller's stack.
- Keep the PR to one incident and one root cause. Title it
  `fix(<service>): <what was broken>`, e.g. `fix(promo): reject expired legacy VIP rules`.
- Don't remove or "fix" the chaos endpoints (`/chaos/*`, the Chaos panel buttons 2 and 4).
  They are deliberate fault injection, gated by `CHAOS_ENABLED`. Buttons 1 and 3 trigger real
  bugs, which are fair game.
