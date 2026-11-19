# Wiring ShopLite to Datadog Bits AI

The goal: click the red button → Datadog detects the 500s → **Bits AI SRE** investigates and
names the root cause → **Bits AI Dev Agent** opens a GitHub PR with the fix, a regression
test and an incident write-up → CI validates it.

> Bits AI products and their button labels change often, and some need to be enabled for
> your org (or are in preview). If a menu below doesn't match, check
> https://docs.datadoghq.com/bits_ai/ for the current names.

---

## 1. Put the code on GitHub (Bits AI needs it to read code and open PRs)

```bash
cd "datadogs environment"
git init -b main && git add . && git commit -m "Initial ShopLite sandbox"
```

Create an empty repo named `shoplite` on github.com, then:

```bash
git remote add origin https://github.com/YOUR_GITHUB_USER/shoplite.git
git push -u origin main
```

The `incident-validation` CI job will be **red on main**. That's intended: it replays the bug.

## 2. Install the Datadog Agent on your Mac

No Docker on this machine, so use the native Agent. In Datadog: **Integrations → Agent → macOS**
gives you a one-line installer with your API key filled in. Then:

1. Turn on log collection: edit `/opt/datadog-agent/etc/datadog.yaml` and set `logs_enabled: true`.
   (APM is on by default and listens on `localhost:8126`.)
2. Copy `datadog/conf.d/nodejs.d/conf.yaml` to `/opt/datadog-agent/etc/conf.d/nodejs.d/conf.yaml`
   and change `path:` to the absolute path of this project's `logs/shoplite.log`.
3. Restart the Agent (Datadog Agent menu-bar app → Restart) and check `datadog-agent status`
   shows the APM Agent and the `nodejs` log source.

(With Docker Desktop installed you can instead put `DD_API_KEY` in `.env` and run
`docker compose up --build`.)

## 3. Run the app

```bash
cp .env.example .env   # set DD_GIT_REPOSITORY_URL to your GitHub repo
npm install
npm start              # http://localhost:3000
```

Optional baseline traffic in another terminal: `npm run traffic`.

Within a couple of minutes you should see `service:shoplite` in **APM → Services** and logs in
**Logs** with a trace link on each line.

## 4. Connect GitHub to Datadog

1. **Integrations → GitHub**: install the Datadog GitHub App on the `shoplite` repo. Give it
   read access to contents, and **write access to contents and pull requests** so Bits AI can
   open PRs.
2. **Source Code Integration** is already wired: the app sends `DD_GIT_REPOSITORY_URL` and
   `DD_GIT_COMMIT_SHA` (set by `scripts/start.sh`). Commit and push before running so the SHA
   exists on GitHub. Stack frames in Error Tracking will then link to the exact line.

## 5. Create the monitor and turn on Bits AI SRE

1. **Monitors → New Monitor → Import from JSON** and paste `datadog/monitors/checkout-errors.json`.
2. Enable Bits AI SRE investigations for that monitor (in the monitor's settings, or under
   **Bits AI → SRE Agent** settings, choose to investigate alerts from this monitor). You can
   also start one by hand from an alert with **Investigate with Bits AI**.

## 6. Break it

Open http://localhost:3000 and click **Fire 20 broken checkouts** (or `npm run traffic -- http://localhost:3000 30`
for a sustained 30% error rate). The monitor should alert within ~5 minutes.

What you should see:
- **Error Tracking**: an issue `TypeError: Cannot read properties of undefined (reading 'percent')`
  at `src/promotions.js:24` in `calculateDiscount`.
- **Bits AI SRE investigation**: it should connect the alert → the error → the code, and point
  at the expired `BLACKFRIDAY` promo returning `undefined` from `findActivePromotion`.

## 7. Let Bits AI fix it

From the Error Tracking issue (or the investigation's suggested next step), ask the
**Bits AI Dev Agent** to generate a fix and open a PR. A good prompt to give it:

> Fix this error following AGENTS.md in the repo: root-cause fix, regression test, incident
> write-up in docs/incidents/, CHANGELOG entry. Expired or unknown promo codes should return
> 400, not 500. Make `npm test` and `npm run validate` pass.

`AGENTS.md` holds the same rules, so agents that read repo instructions pick them up anyway.

## 8. Validation

On the PR, CI runs:
- `npm test`: existing tests plus the new regression test.
- `npm run validate`: replays the incident (expired promo, unknown promo, valid promo, empty cart).
  It fails on today's code and should pass on the fix.

Merge, pull, restart `npm start`, click the red button again: it should now return
**HTTP 400 "Promo code is invalid or expired"** (or similar), and the monitor recovers.

## Resetting for another run

`git revert` the fix commit and push, or keep a `broken` branch to deploy from.
