# Incident: <title>

- **Date:** YYYY-MM-DD
- **Service / database / env:** <service> / <database> / staging
- **Datadog links:** Error Tracking issue, example trace, monitor
- **Severity:** SEV-?

## Summary
One or two sentences: what users saw and for how long.

## Root cause
What in the code caused it, with file and line. Include the error type, message and the
key stack frame.

## Evidence
What in Datadog showed it (traces, logs, error rate graph, first-seen version).

## Fix
What changed and why it addresses the cause.

## Validation
- Regression test: `test/...`
- `npm test`: pass
- `npm run validate`: pass
- After deploy: error rate on `POST /api/checkout` back to 0

## Follow-ups
Anything left to do to stop this class of bug coming back.
