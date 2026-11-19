# ShopLite: a Datadog + Bits AI sandbox

A small Express storefront instrumented with Datadog APM, trace-correlated logs and
Error Tracking. It has a **real, intentional bug**: checking out with the expired promo
code `BLACKFRIDAY` crashes with a 500. A red button in the UI triggers it.

Use it to watch Datadog's Bits AI find the root cause and open a fix PR, with
documentation and automated validation.

**Setup walkthrough: [docs/BITS_AI_SETUP.md](docs/BITS_AI_SETUP.md)**

## Quick start (no Datadog needed)

```bash
npm install
npm run start:no-dd      # http://localhost:3000
```

## With Datadog

```bash
cp .env.example .env     # edit DD_GIT_REPOSITORY_URL
npm start                # loads .env, adds git SHA, starts with dd-trace
```

Requires a Datadog Agent on `localhost:8126` (see the setup guide).

## Layout

| Path | What |
| --- | --- |
| `src/promotions.js` | Contains the bug (`calculateDiscount` assumes the promo exists) |
| `src/app.js` | Express routes; error handler tags the span and logs the stack |
| `public/` | UI with the "break it" buttons |
| `test/` | Unit + HTTP tests (`npm test`, pass today) |
| `scripts/validate.js` | Incident replay (`npm run validate`, **fails until fixed**) |
| `scripts/traffic.js` | Background traffic generator (`npm run traffic -- <url> <error%>`) |
| `datadog/` | Agent log config and an importable monitor |
| `AGENTS.md` | What a fix PR must include (fix, test, incident doc, changelog) |
| `docs/` | Runbook, incident template, Bits AI setup |
| `.github/workflows/ci.yml` | Runs tests and incident validation on every PR |

## Notes

- Uses `dd-trace` 5.x because this machine runs Node 20. dd-trace 6 needs Node 22+.
- Logs go to stdout and `logs/shoplite.log` (the file the Agent tails).
