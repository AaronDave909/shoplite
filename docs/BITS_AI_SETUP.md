# Wiring ShopLite to Datadog Bits AI

The goal: click the red button → Datadog detects the 500s → **Bits AI SRE** investigates and
names the root cause → **Bits AI Dev Agent** opens a GitHub PR with the fix, a regression
test and an incident write-up → CI validates it.

> Bits AI products and their button labels change often, and some need to be enabled for
> your org (or are in preview). If a menu below doesn't match, check
> https://docs.datadoghq.com/bits_ai/ for the current names.

---

## 1. Put the code on GitHub (Bits AI needs it to read code and open PRs)

Already done: https://github.com/AaronDave909/shoplite. The `incident-validation` CI job is
**red on main**. That's intended: it replays the bug.

## 2. Add your Datadog API key as a Codespaces secret

Nothing is installed on your own computer. The app and the Datadog Agent run in a GitHub
Codespace (a cloud Linux machine).

1. In Datadog: **Organization Settings → API Keys → New Key**, name it `shoplite-codespace`.
   Use a dedicated key so you can revoke it on its own later.
2. On GitHub: your profile **Settings → Codespaces → Secrets → New secret**:
   - `DD_API_KEY` = the key. Under *Repository access*, pick only `shoplite`.
   - `DD_SITE` = your Datadog site (the domain in your Datadog URL, e.g. `datadoghq.com`,
     `us5.datadoghq.com`, `datadoghq.eu`). Same repo access.

Never put the key in `.env` or anywhere in the repo.

## 3. Start a Codespace and run the app

1. On the repo page: **Code → Codespaces → Create codespace on main**.
2. First start takes a few minutes. Setup installs packages, writes `.env` (with your repo URL
   for Source Code Integration) and starts the Datadog Agent container.
3. In the Codespace terminal:

   ```bash
   npm start
   ```

   Codespaces pops up a link for port 3000. That's the ShopLite page. The port is private by
   default, so only you (signed in to GitHub) can open it.
4. Check the Agent: `docker compose exec datadog-agent agent status` should show the APM Agent
   receiving traces and a `nodejs` log source. If the Agent didn't start, run
   `bash .devcontainer/start-agent.sh` and read the message.

Optional baseline traffic in a second terminal: `npm run traffic`.

Within a couple of minutes you should see `service:shoplite` in **APM → Services** and logs in
**Logs** with a trace link on each line.

Codespaces stop after 30 minutes idle and use your free monthly hours while running. Stop or
delete the Codespace from github.com/codespaces when you're done.

(Prefer your own machine? With Docker Desktop: put `DD_API_KEY` in `.env`, run
`docker compose up -d datadog-agent`, then `npm start`.)

## 4. Connect GitHub to Datadog

1. **Integrations → GitHub**: install the Datadog GitHub App on the `shoplite` repo. Give it
   read access to contents, and **write access to contents and pull requests** so Bits AI can
   open PRs.
2. **Source Code Integration** is already wired: the app sends `DD_GIT_REPOSITORY_URL` and
   `DD_GIT_COMMIT_SHA` (set by `scripts/start.sh`). Commit and push before running so the SHA
   exists on GitHub. Stack frames in Error Tracking will then link to the exact line.
3. Keep the GitHub App limited to the `shoplite` repo, and protect `main` (Settings → Branches)
   so changes land only through reviewed PRs with passing CI. Bits AI opens PRs; you merge.

## 5. Create the monitor and turn on Bits AI SRE

1. **Monitors → New Monitor → Import from JSON** and paste `datadog/monitors/checkout-errors.json`.
2. Enable Bits AI SRE investigations for that monitor (in the monitor's settings, or under
   **Bits AI → SRE Agent** settings, choose to investigate alerts from this monitor). You can
   also start one by hand from an alert with **Investigate with Bits AI**.

## 6. Break it

Open the ShopLite page (the forwarded port 3000 link) and click **Fire 20 broken checkouts** (or `npm run traffic -- http://localhost:3000 30`
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

Merge, then in the Codespace `git pull` and restart `npm start`, click the red button again: it should now return
**HTTP 400 "Promo code is invalid or expired"** (or similar), and the monitor recovers.

## Resetting for another run

`git revert` the fix commit and push, or keep a `broken` branch to deploy from.
