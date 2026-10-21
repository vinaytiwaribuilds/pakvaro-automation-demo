# Three-minute uncut walkthrough

Use only synthetic fixtures. Keep the terminal, n8n canvas, and mock state readable. Do not cut between scenarios.

## 0:00–0:25 — orient the viewer

“This is a local n8n lead-intake workflow. It validates and normalises a lead, applies visible scoring rules, writes idempotently to a mock CRM, alerts the owner, retries transient failures, and dead-letters an exhausted write. Nothing here needs a third-party account.”

Show the complete canvas, then point to the Error Trigger workflow tab.

## 0:25–0:55 — happy path

Run the valid-lead request with idempotency key `video-happy-0001`.

Show the HTTP 200 response: `ok`, CRM ID, `duplicate: false`, score, qualification, and `attempts: 1`. Open the mock state and show the normalised lowercase email, `+91` phone, one CRM lead, and one `lead_owner` alert.

## 0:55–1:20 — invalid input

Send the invalid fixture.

Show HTTP 400 with `VALIDATION_ERROR` and field-level messages. Refresh mock state and show zero CRM leads, alerts, and dead letters after resetting before the scenario.

## 1:20–2:00 — forced failure and recovery

Reset state, then configure two failures:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3001/admin/crm-failures" `
  -Headers @{ "x-demo-key" = "demo-local-key" } `
  -ContentType "application/json" `
  -Body '{"count":2}'
```

Submit the recovery fixture with `video-recovery-0001`. Narrate the 1-second then 2-second backoff. Show HTTP 200 with `attempts: 3`, one CRM record, no dead letter, and the owner alert.

## 2:00–2:40 — dead letter and action-needed alert

Reset state and configure three failures. Submit the dead-letter fixture with `video-dead-letter-0001`.

Show HTTP 502 with `CRM_WRITE_FAILED`, the dead-letter ID, and `attempts: 3`. Open state and show no CRM lead, one open dead letter, and one `action_needed` alert carrying the same idempotency key.

## 2:40–3:00 — close on operability

Open `RUNBOOK.md` at the replay steps, then `LIMITS.md`.

“The same idempotency key is used for safe replay after the CRM recovers. The repository also states its limits: synthetic data, local mocks, and no production SLA. The connector guide maps each mock to Google Sheets, Gmail or Slack, and HubSpot or Zoho without committing credentials.”
