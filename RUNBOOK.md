# Operator runbook

## Service checks

1. Check n8n at <http://127.0.0.1:5678>.
2. Check the mocks with `Invoke-RestMethod http://127.0.0.1:3001/health`.
3. Check the main workflow is active.
4. Inspect recent n8n executions before replaying anything.

The local mock event history is appended to `app/data/events.jsonl`. The authenticated state view is `GET /admin/state` with the `x-demo-key` header.

## Handle a dead-lettered lead

An exhausted CRM write returns HTTP 502, stores one item with `status: open`, and sends an alert with `type: action_needed`.

1. Copy the `deadLetterId`, `idempotencyKey`, `lastStatus`, and `attempts` from the alert or state view.
2. Confirm the CRM is healthy. Do not replay while the cause is unknown.
3. Check the CRM for the same idempotency key. If a record already exists, update the operational record manually and do not submit again.
4. Inspect the dead-lettered `lead` for required fields. Correct source data only when there is a documented reason.
5. Replay using the exact stored lead and the exact same idempotency key.
6. Confirm the response is HTTP 200 and capture the returned `crmId`.
7. Confirm the CRM contains one record, not two, and that a `lead_owner` alert was sent.
8. Mark the incident resolved in the real operational system. The mock intentionally has no resolve endpoint; its append-only evidence remains visible.

### Replay example

```powershell
$state = Invoke-RestMethod `
  -Uri "http://127.0.0.1:3001/admin/state" `
  -Headers @{ "x-demo-key" = "demo-local-key" }

$item = $state.deadLetters | Select-Object -Last 1

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:5678/webhook/lead-intake" `
  -Headers @{ "x-idempotency-key" = $item.idempotencyKey } `
  -ContentType "application/json" `
  -Body ($item.lead | ConvertTo-Json -Depth 10)
```

The score is recomputed on replay. Existing score fields in the stored object are ignored by validation.

## Triage an unexpected workflow error

The separate Error Trigger workflow records the workflow name, execution ID, last node, and message, then creates a critical `action_needed` alert.

1. Open the execution URL from the alert when available.
2. Identify the last successful node and failing node.
3. Verify the mock service and environment configuration.
4. Fix the cause; do not edit past execution data.
5. Replay using the original idempotency key.
6. Confirm exactly one CRM record exists.

## Rotate the mock API key

The committed `demo-local-key` is for localhost demonstration only. To rotate it:

1. Stop n8n and the mock server.
2. Generate a long random value with an approved secret manager or password generator.
3. Set the same `MOCK_API_KEY` environment variable for both processes. Do not write the value into workflow JSON, shell history, screenshots, or this repository.
4. Keep `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` so the workflow expressions can read `MOCK_API_KEY` and `MOCK_BASE_URL`.
5. Restart the mock server and n8n.
6. Call `/admin/state` with the new key; confirm the old key receives HTTP 401.
7. Run all five tests with `MOCK_API_KEY` set to the new value.

For Docker Compose, place the replacement in an untracked `.env` file and change both service entries to `MOCK_API_KEY: ${MOCK_API_KEY}` before starting. Never commit `.env`.

## Restore after local failure

- Restarting the mock server clears its in-memory state.
- The JSONL event log remains until `/admin/reset` is called or the file is deliberately archived/removed.
- n8n state persists in `.n8n/` for the PowerShell route or the `n8n_data` volume for Compose.
- Before a clean re-import, export any workflow edits you intend to keep.
