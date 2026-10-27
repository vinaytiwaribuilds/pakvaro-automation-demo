# Proof boundaries

- This is a self-initiated reference build, not client work, and it reports no client outcome.
- The committed evidence is a local n8n-to-mock run unless `evidence/sandbox-run.txt` separately records an authorised sandbox smoke.
- Synthetic fixtures and a temporary sandbox do not establish production uptime, throughput, recovery time, security certification or a service-level commitment.
- The mock implements only fields used by this workflow. It is not a complete HighLevel emulator.
- The local in-memory ledger, dead-letter store and alert sink are demonstration components, not durable production services.
- Failure injection is deterministic. It cannot reproduce every network, indexing, concurrency or partial-write behavior of the live service.
- The committed redacted App Test evidence records creation, direct-ID verification and cleanup of one synthetic contact and opportunity. It does not independently document opportunity-search parameter rejection or indexing lag.
- The local mock suite models snake_case query requirements and delayed search visibility. Passing those regressions proves the workflow's behavior under those simulations, not that every live or production HighLevel account behaves identically.
- The bounded local lag scenarios prove the workflow creates no second opportunity and uses ID read-back while search is behind. They do not reproduce every live indexing or concurrency pattern.
- API search may not find additional emails or phone numbers. An upsert may also promote or replace a secondary email, so those identities require an agreed review rule rather than blind merging.
- The watchdog's time window must be measured and agreed in the target account. A local evidence task does not prove that a live native workflow, filter, re-entry rule, wallet or messaging prerequisite is configured correctly.
- No public app, OAuth install, HighLevel webhook receiver, Meta connection, paid messaging or customer account is included.
- The one-open-opportunity rule must be confirmed for each real business process.
- Production handling would require managed secrets, durable uniqueness constraints, backups, retention rules, access control, monitoring and a privacy review.
