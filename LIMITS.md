# What this demo does not prove

- All leads are synthetic. No personal or customer data is included.
- The mock CRM, alert endpoint, dead-letter store, and in-memory state are not production services.
- No Google, Gmail, Slack, HubSpot, or Zoho account is connected by default.
- Passing local tests is not evidence of a production service-level agreement, uptime, throughput, or recovery-time commitment.
- The demo does not load-test concurrent submissions or prove behavior across multiple n8n workers.
- Deterministic idempotency is demonstrated locally; production retention, locking, uniqueness constraints, and replay policy must be designed for the chosen CRM.
- The local mock loses in-memory state when restarted. Its JSONL log is demonstration evidence, not a production audit store.
- Alerts and follow-up tasks are recorded HTTP events, not delivered messages or production task records until real connectors are configured.
- The phone normaliser treats a bare 10-digit number as an Indian number (`+91`). Other markets need an explicit country rule.
- Scoring weights are illustrative and have not been calibrated against real conversion data.
- Security controls here are intentionally minimal and local. Production deployment still needs TLS, managed secrets, access control, data retention rules, monitoring, backups, and a privacy review.
- The Error Trigger workflow covers unexpected n8n execution failures only when n8n can run it. It cannot report a total n8n host outage through n8n itself.
- The repository provides a reproducible technical demonstration, not a claim about past customer outcomes.
