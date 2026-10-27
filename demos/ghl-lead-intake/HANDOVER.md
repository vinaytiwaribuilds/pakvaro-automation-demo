# Lead-intake handover sheet

## What was built

A signed lead enters n8n, is validated and deduplicated, and is written to HighLevel as one contact and at most one open opportunity in the agreed pipeline. The workflow reads the contact back to catch silently ignored fields. It then waits for the native HighLevel workflow's `Native workflow evidence` task. Missing evidence, token/scope failures, data mismatches and exhausted dependencies create distinct owner alerts and retain a replay reference.

This repository uses synthetic fixtures and local mocks. It is a self-initiated reference build, not a client project or a claim of live results.

## Ownership before access is removed

| Item | Owner | Handover check |
|---|---|---|
| Domain and DNS | Customer | Registrar login, billing contact and recovery method remain customer-controlled. |
| Phone numbers and messaging registration | Customer | Number ownership, A2P/registration status, usage billing and forwarding destinations are documented. |
| Stripe and payment data | Customer | Customer creates and owns the account; no card or payout access is transferred to Pakvaro. |
| HighLevel agency/location and workflows | Customer | Customer admin can publish the native workflow, inspect history and remove Pakvaro access. |
| n8n runtime and alert destination | Customer | Customer owns hosting, backups, alert channel and recovery access. |
| Lead and CRM data | Customer | Retention, lawful basis, exports, deletion and access roles are approved by the customer. |
| Tokens, signing secrets and connected-app access | Customer | Stored in the customer's secret manager; rotate them and remove Pakvaro access after acceptance. |

## Safe rerun

1. Use only the local mock values in [README.md](README.md). Do not point `GHL_BASE_URL` at a live account.
2. Start the mock, import and activate `workflow.json` in the local n8n instance, then start n8n.
3. Run `node tests/run-tests.mjs`, followed by `node tests/check-artifacts.mjs`.
4. Accept the run only when `evidence/mock-test-run-v3.txt` ends with `Result: 15/15 tests passed` and the artifact check passes.
5. For replay, follow [RUNBOOK.md](RUNBOOK.md): read any retained contact or opportunity ID directly before using search, reuse confirmed IDs, and resume from the first unconfirmed step.

## Alerts and owner action

- `workflow_watchdog`: check whether the native workflow is Draft, then check filters, re-entry and wallet/messaging prerequisites. The event remains `needs_review`.
- `credential_scope`: restore the token or required scopes; do not retry until access is verified.
- `data_integrity`: compare the requested and stored contact fields; resolve the field rule before reporting success.
- `action_needed`: inspect the safe dead letter, confirm dependency health and replay with the original event ID.

Alerts contain reference IDs and safe next actions, not the full lead, bearer token, authorization header or webhook secret.
