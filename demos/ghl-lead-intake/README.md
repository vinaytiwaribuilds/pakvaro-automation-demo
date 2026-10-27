# Resilient lead intake into HighLevel

This self-initiated reference build sends a signed synthetic lead through a real local n8n workflow, normalises and validates it, upserts and reads back a HighLevel contact, reuses or creates one open opportunity in a configured pipeline, verifies that the native HighLevel workflow ran, alerts the owner, and records safe failure evidence.

## What it does

```text
Signed webhook
  -> signature, timestamp, schema and identity checks
  -> idempotency claim
  -> exact email and phone lookups
  -> POST /contacts/upsert
  -> read back and compare the written contact fields
  -> open-opportunity search with snake_case query names
  -> POST /opportunities/ only for a newly created contact when no match exists
  -> read a returned opportunity ID directly; never verify a write through search
  -> bounded native-workflow evidence check
  -> owner alert and completed ledger, or a needs-review alert
```

The workflow uses `Authorization: Bearer ...`, `Version: 2021-07-28`, and JSON request headers for the tested HighLevel API surface. Contact upsert retries only 429, 500, 502, 503 and 504 responses. The default bounded delays are 2, 4 and 8 seconds after the first attempt; a received `Retry-After` value takes precedence. It does not retry 400, 401, 403, 404 or 422. A 401 or 403 raises one immediate credential-or-scope alert and retains the event for replay. After a successful upsert, the workflow reads the contact back by ID and compares name, email, phone, company and source.

An opportunity returned from create is read back through `GET /opportunities/{id}`. If a 5xx leaves the write outcome unknown and no ID is returned, the workflow does not search to verify the write and does not send a second create; it retains the event for review. Search is eventually consistent, so it is never used as read-after-write evidence.

Duplicate protection has three layers: the signed event ID and payload hash, the contact-upsert result, and the explicit rule of one open opportunity per contact in the configured pipeline. If upsert reports an existing contact while opportunity search is empty, the workflow treats that result as inconclusive and creates nothing. This deliberately favors review over a duplicate while the search index may be behind.

After the opportunity is confirmed, the watchdog looks for the `Native workflow evidence` task within a bounded window. If it does not appear, the ledger is marked `needs_review` and the owner receives: `GHL workflow did not run - check if it was set to Draft`. The window is a deployment value to measure and agree, not a claimed HighLevel timing guarantee.

## Local mock tests

Requirements: Node 20 or newer and n8n 1.121.3. All fixtures are synthetic. The local bearer and webhook values below are mock-only test values.

From this demo directory, use three PowerShell terminals.

Terminal 1:

```powershell
$env:MOCK_PORT = "3011"
$env:MOCK_GHL_BEARER = "mock-bearer-for-local-tests"
node mock/server.mjs
```

Terminal 2:

```powershell
$env:npm_config_cache = "$PWD\.npm-cache"
$env:N8N_USER_FOLDER = "$PWD\.n8n-ghl"
$env:N8N_PORT = "5688"
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = "false"
$env:NODE_FUNCTION_ALLOW_BUILTIN = "crypto,http,https,url"
$env:GHL_BASE_URL = "http://127.0.0.1:3011"
$env:STATE_BASE_URL = "http://127.0.0.1:3011"
$env:OWNER_ALERT_URL = "http://127.0.0.1:3011/state/alerts"
$env:GHL_PIT = "mock-bearer-for-local-tests"
$env:GHL_LOCATION_ID = "loc_reference_lab"
$env:GHL_PIPELINE_ID = "pipeline_reference_lead_intake"
$env:GHL_PIPELINE_STAGE_ID = "stage_new_api_intake"
$env:INTAKE_WEBHOOK_SECRET = "mock-webhook-signing-secret"
$env:GHL_RETRY_BASE_MS = "5"
$env:GHL_WATCHDOG_WINDOW_MS = "25"
$env:GHL_WATCHDOG_POLL_MS = "5"
npx --yes n8n@1.121.3 import:workflow --input=workflow.json
npx --yes n8n@1.121.3 update:workflow --id=pakvaroGhlLeadIntake --active=true
npx --yes n8n@1.121.3 start
```

Terminal 3:

```powershell
$env:N8N_URL = "http://127.0.0.1:5688"
$env:MOCK_URL = "http://127.0.0.1:3011"
$env:TEST_WEBHOOK_SECRET = "mock-webhook-signing-secret"
node tests/run-tests.mjs
node tests/check-artifacts.mjs
```

The expected final line is `Result: 15/15 tests passed`. The test runner writes the terminal summary to `evidence/mock-test-run-v3.txt` and structured scenario evidence to `evidence/execution-summaries-v3.json`. Every lead acceptance request goes through the active local n8n production webhook; direct mock calls are used only for API-contract assertions.

The v3 suite retains the v2 reliability cases and adds three local-mock regressions for API behaviors observed during development: camelCase opportunity-search names receive HTTP 422, an exact replay during simulated search lag creates no second opportunity, and contact/opportunity reads by ID succeed while both records remain absent from simulated search. The committed redacted smoke record does not independently establish those three observations.

## Mock API contract

The dependency-free mock implements only the response fields used by the workflow:

- `GET /contacts/lookup` -> `{ "contact": { ... } }`, or 404.
- `POST /contacts/upsert` -> `{ "contact": { ... }, "new": true|false }`.
- `GET /opportunities/pipelines` -> `{ "pipelines": [{ "stages": [...] }] }`.
- `GET /opportunities/search` -> `{ "opportunities": [...], "meta": { "total": ... } }`.
- `POST /opportunities/` -> HTTP 201 with `{ "opportunity": { ... } }`.
- `GET /contacts/:contactId`, `GET /opportunities/:opportunityId` and `GET /contacts/:contactId/tasks` for bounded verification.

It also returns representative 401, 403, 422, 429 and 5xx error bodies. `GET /opportunities/search` accepts `location_id`, `pipeline_id` and `contact_id`; camelCase alternatives receive the live-style HTTP 422 body. Newly created contacts and opportunities are immediately readable by ID but are hidden from lookup/search until the configurable `MOCK_SEARCH_LAG_MS` expires (3 seconds by default). A 429 includes `Retry-After` plus the documented rate-limit header names. The `/admin/scenario` switch can set the native workflow to `draft`, ignore one upsert field, change search lag, persist a create while returning a 5xx, or reject requests with 401/403. The `/state/*` routes stand in for the idempotency ledger, dead-letter store and alert sink; they are not HighLevel endpoints.

## Live sandbox smoke

The live script is intentionally separate from the deterministic suite. It is for a disposable HighLevel App Test sandbox, not a customer account. It creates exactly one clearly labelled synthetic contact and one opportunity, verifies both, and then deletes the opportunity followed by the contact.

On 23 October 2026, an authorised smoke run in a disposable HighLevel App Test sandbox created one clearly labelled synthetic contact and one opportunity, verified both through direct ID reads, and deleted both. The committed redacted summary records that pass and cleanup. It does not independently prove search-parameter rejection, search-index lag, production behavior, or the full n8n workflow.

Keep the credential file outside this repository. Set only its path in the shell:

```powershell
$env:GHL_ENV_FILE = "C:\private\pakvaro-ghl-sandbox.env"
node scripts/sandbox-smoke.mjs
```

The selected file must contain `GHL_PIT`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, and `GHL_PIPELINE_STAGE_ID`; `GHL_BASE_URL` is optional. The script does not load a default `.env`, does not print the token, and writes only a redacted result to `evidence/sandbox-run.txt`. Do not run it against production. If cleanup is incomplete, use the redacted label in that file to locate and remove only the synthetic record.

## Failure and replay

Exhausted retryable failures create one open dead letter and one classified alert. Token/scope failures use `credential_scope`; a read-back mismatch uses `data_integrity`; other dependency failures use `action_needed`. A missing native-workflow task uses `workflow_watchdog` and leaves the ledger at `needs_review`. Failure records contain event and payload hashes, the failed step, attempt count, last status, confirmed record IDs when available, timestamps and a safe next action. They do not contain the bearer token, authorization header, webhook secret or full lead body.

Before replaying, confirm the dependency is healthy. Read any contact or opportunity ID retained in the ledger directly before using pipeline search; treat an empty search result after a recent write as inconclusive. Reuse the original event ID and payload hash, and resume from the first unconfirmed step. See [RUNBOOK.md](RUNBOOK.md).

## What this does not prove

- This is a self-initiated reference build, not a client project, and it claims no client results.
- The automated v3 evidence covers a real local n8n run against a local mock. The separate redacted `evidence/sandbox-run.txt` records the authorised 23 October 2026 App Test smoke; it does not show this full n8n workflow running against HighLevel.
- A temporary sandbox and synthetic data do not prove production uptime, throughput, recovery time, rate limits or security certification.
- The local HighLevel mock is not the HighLevel service. Its failure modes are deterministic simulations.
- The local ledger, dead-letter store and alert sink are not production infrastructure.
- No Meta Lead Ads, OAuth installation, HighLevel webhook receiver, Slack, email, SMS, WhatsApp, calling, calendar or payment delivery is connected.
- The one-open-opportunity rule is a demo business rule, not a universal CRM rule.
- This build does not authorise real personal data, regulated data or customer-account use.

See [LIMITS.md](LIMITS.md) for the full boundary, [HANDOVER.md](HANDOVER.md) for ownership and safe reruns, and [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md) for the 90-second walkthrough.
