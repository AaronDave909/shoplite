# Instructions for coding agents (Bits AI Dev Agent, Claude Code, etc.)

ShopLite is a small Express app. Code lives in `src/`, the UI in `public/`, tests in `test/`.

## When fixing a production error, a fix is complete only when it includes all of:

1. **Root-cause fix** in `src/`. Fix the cause, not the symptom. Don't wrap code in a
   blanket try/catch or swallow the error. Bad user input must return a 4xx with a clear
   message (throw `ValidationError` from `src/checkout.js`); a 5xx means a bug.
2. **Regression test** in `test/` that fails before the fix and passes after.
3. **Incident write-up** in `docs/incidents/` named `YYYY-MM-DD-<short-slug>.md`, following
   `docs/incidents/TEMPLATE.md`. Link the Datadog Error Tracking issue or trace if you have it.
4. **Changelog entry** under "Unreleased" in `CHANGELOG.md`.
5. **Validation**: `npm test` and `npm run validate` both pass. CI runs both on every PR.

## Conventions

- CommonJS, Node 20, no new dependencies unless needed.
- Money is integer cents.
- Keep the PR to one incident. Title it `fix(<area>): <what was broken>`.
