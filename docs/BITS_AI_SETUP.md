# Wiring ShopLite to Datadog Bits AI

The goal: click a Chaos panel button → Datadog detects it → **Bits AI SRE** investigates and
names the root cause (even when it's in a different service from the one that errored) →
**Bits AI Dev Agent / Bits Code** opens a GitHub PR with the fix, a test and an entry in the
service's Incident & Fix Log → CI validates it.

> Bits AI products and their button labels change often, and some need to be enabled for
> your org (or are in preview). If a menu below doesn't match, check
> https://docs.datadoghq.com/bits_ai/ for the current names.

---

## 1. Put the code on GitHub (Bits AI needs it to read code and open PRs)

Already done: https://github.com/AaronDave909/shoplite. The `incident-validation` CI job is
**red on main**. That's intended: it replays the two code bugs.

## 2. Add your Datadog API key as a Codespaces secret

Nothing is installed on your own computer. The stack runs in a GitHub Codespace (a cloud
Linux machine with Docker).

1. In Datadog: **Organization Settings → API Keys → New Key**, name it `shoplite-codespace`.
   Use a dedicated key so you can revoke it on its own later.
2. On GitHub: your profile **Settings → Codespaces → Secrets → New secret**:
   - `DD_API_KEY` = the key. Under *Repository access*, pick only `shoplite`.
   - `DD_SITE` = your Datadog site (the domain in your Datadog URL, e.g. `datadoghq.com`,
     `us5.datadoghq.com`, `datadoghq.eu`). Same repo access.

Never put the key anywhere in the repo.

## 3. Start a Codespace

1. On the repo page: **Code → Codespaces → Create codespace on main** (4-core / 8 GB machine).
2. First start takes a few minutes. Setup installs packages, writes `.env` (with your repo URL
   for Source Code Integration), then `./scripts/stack.sh up` builds and starts the four
   services, three databases and the Datadog Agent.
3. Open the forwarded port **3000**: the ShopLite storefront. The port is private by default.
4. Check the Agent: `docker compose exec datadog-agent agent status`. You should see the APM
   Agent receiving traces, three `postgres` check instances (orders, promo, inventory) with
   DBM on, and container log sources. If the stack didn't start, run `./scripts/stack.sh up`
   and read the output.

Optional baseline traffic in a second terminal: `npm run traffic`.

Within a few minutes you should see the four services in **APM → Service Catalog**, the
three databases in **Database Monitoring**, and the containers in **Infrastructure →
Containers**, all under `env:staging`.

Codespaces stop after 30 minutes idle and use your free monthly hours while running. Stop or
delete the Codespace from github.com/codespaces when you're done.

(Prefer your own machine? With Docker: put `DD_API_KEY` in `.env` and run
`./scripts/stack.sh up`.)

## 4. Connect GitHub to Datadog

1. **Integrations → GitHub**: install the Datadog GitHub App on the `shoplite` repo. Give it
   read access to contents, and **write access to contents and pull requests** so Bits AI can
   open PRs.
2. **Source Code Integration** is already wired: every container gets `DD_GIT_REPOSITORY_URL`
   and `DD_GIT_COMMIT_SHA` (set by `scripts/stack.sh`). Commit and push before starting so
   the SHA exists on GitHub. Stack frames will then link to `services/<name>/src/...`.
3. Keep the GitHub App limited to the `shoplite` repo, and protect `main` (Settings → Branches)
   so changes land only through reviewed PRs with passing CI. Bits AI opens PRs; you merge.

## 5. Create the monitors and turn on Bits AI SRE

1. **Monitors → New Monitor → Import from JSON**, once for each file in `datadog/monitors/`.
2. Enable Bits AI SRE investigations for the two 5xx monitors (in the monitor's settings, or
   under **Bits AI → SRE Agent** settings). You can also start one by hand from an alert with
   **Investigate with Bits AI**.

## 6. Break it

Use the **Chaos & Crash Testing Panel** on the storefront. The README's
[Chaos panel table](../README.md#the-chaos--crash-testing-panel) and
[verification guide](../README.md#verify-the-telemetry-in-datadog) list what each button does
and where to look. For Bits AI the interesting ones are:

- **Button 1 (Trigger ×20):** Error Tracking shows a `TypeError` in `checkout-service`. A good
  investigation follows the trace downstream and blames `promo-service` returning
  `discount: null` with a 200 for `LEGACY_VIP`, whose legacy tiers have all expired.
- **Button 3 (Trigger ×20):** Error Tracking shows a `DatabaseError` (`42703`) in
  `inventory-service`, with a stack frame in `flagForAudit` and the failing SQL in DBM.

## 7. Let Bits AI fix it

From the Error Tracking issue (or the investigation's suggested next step), ask the
**Bits AI Dev Agent** to generate a fix and open a PR. Good prompts:

> Fix this error following AGENTS.md in the repo. Find the service that causes it (follow the
> trace downstream). A legacy promo code whose tiers have all expired must be rejected with
> 400, not crash checkout. Add a test, an entry in that service's README under
> "## Incident & Fix Log", and a CHANGELOG entry. Make `npm test` and `npm run validate` pass.

> Fix this database error following AGENTS.md. Audited stock reservations must succeed:
> the query must match the schema in services/inventory/db/schema.sql. Add a test using
> test-support/pglite.js, an Incident & Fix Log entry in services/inventory/README.md and a
> CHANGELOG entry. Make `npm test` and `npm run validate` pass.

`AGENTS.md` holds the same rules, so agents that read repo instructions pick them up anyway.
Keep each PR to one bug.

## 8. Validation

On the PR, CI runs:
- `npm test`: every service's tests plus the new one.
- `npm run validate`: replays the incidents through all four services. Each fix turns its
  scenario green; both fixes together make the job pass.
- `docker compose build`: every image still builds.

Merge, then in the Codespace: `git pull` and `./scripts/stack.sh up` (rebuilds the changed
service). Click the same button again. Button 1 should now return **HTTP 400 "Unknown or
expired promotion code: LEGACY_VIP"** (or similar); button 3 should return **201**. The
monitors recover.

## Resetting for another run

`git revert` the fix commit and push, or keep a `broken` branch to deploy from.
`./scripts/stack.sh reset` wipes the databases back to their seed data.
