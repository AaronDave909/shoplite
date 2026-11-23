# ShopLite runbook

## Service overview
- `GET /api/products` — static catalog (`src/catalog.js`)
- `POST /api/checkout` — prices a cart and applies a promo code (`src/checkout.js`, `src/promotions.js`)
- Datadog tags: `service:shoplite env:sandbox version:<DD_VERSION>`

## Checkout 5xx

**Signal:** monitor `[shoplite] Checkout 5xx errors` or an Error Tracking issue on
`POST /api/checkout`.

**Investigate:**
1. Error Tracking → filter `service:shoplite`. Open the issue; note error type, message,
   top stack frame and the first-seen version.
2. Open a sample trace → the span's error tab shows the stack; the Logs tab shows the
   correlated `unhandled error` log line (same `dd.trace_id`).
3. Check request attributes in the log (`promoCode`) for a pattern: does it only
   happen for some inputs?

**Expected behaviour:** invalid or expired input is a 4xx with a readable message. Any 5xx
on checkout is a bug.

**Fix and validate:** follow `AGENTS.md`. `npm run validate` replays the known failing
scenarios.
