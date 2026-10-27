# Dead-letter and replay runbook

1. Confirm the dependency is healthy. Do not replay during an unexplained outage.
2. Inspect the dead letter for the event ID, payload hash, failed step, attempt count, last status and any confirmed contact or opportunity ID.
3. If the ledger contains a contact or opportunity ID, read that record directly by ID before using search; do not make replay safety depend on immediate search-index visibility.
4. This reference build uses `location_id`, `pipeline_id` and `contact_id` for opportunity search. Re-verify the current API contract and the target account before deployment.
5. Treat an empty search result after a recent write as inconclusive. If upsert reports an existing contact, create nothing until the index catches up or the intended opportunity is confirmed by ID. If one open opportunity is found, record and reuse it; if several exist, stop for human review.
6. Reuse the original event ID and payload hash. Resume from the first unconfirmed step instead of restarting blindly.
7. Confirm exactly one intended contact and one intended open opportunity.
8. Mark the operational incident resolved only after the final IDs and completion time are recorded.

Never put the bearer token, authorization header, webhook secret or full lead payload in the dead letter, alert, evidence file or support message.

For an incomplete sandbox-smoke cleanup, use only the unique `PAKVARO SYNTHETIC SANDBOX SMOKE ...` label in the redacted evidence to find the two generated records. Delete the opportunity first, then the contact. Do not delete by a broad search or pipeline-wide operation.
