# CRM lead routing

## Run

Import `workflow.json` and `daily-summary.workflow.json`, activate workflow IDs `pakvaroCrmLeadRouting` and `pakvaroCrmDailySummary`, start the shared mock server, then run `node demos/crm-lead-routing/test.js`.

## What it does / what it does not prove

This demo validates a synthetic lead form, assigns weekday 09:00–18:00 Asia/Kolkata submissions round-robin between two owners, sends other submissions to an after-hours queue, writes one idempotent CRM record, sends one owner notification, and builds a daily count by owner through both a scheduled trigger and a test webhook; duplicate lead IDs keep the original assignment and do not create a second record or notice, while an unexpected CRM rejection is dead-lettered. It does not connect to a production CRM, calendar, form, or notification channel; it does not model holidays, owner capacity, territories, consent, service levels, or conversion outcomes, and the local daily summary proves aggregation logic only, not scheduled delivery reliability during a host outage.

Evidence is written to `evidence/real-n8n-output.json` and `evidence/test-run.txt`.
