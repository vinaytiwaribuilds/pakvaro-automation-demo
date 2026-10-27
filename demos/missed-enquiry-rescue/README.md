# Missed-enquiry rescue

## Run

Import `workflow.json`, activate workflow ID `pakvaroMissedEnquiryRescue`, start `node app/server.js` from the repository root, then run `node demos/missed-enquiry-rescue/test.js`.

## What it does / what it does not prove

This demo accepts a synthetic enquiry or missed-call event, validates and normalises it, sends an immediate acknowledgement to a simulated WhatsApp-style HTTP endpoint, alerts the owner, waits one second for the test, checks whether a reply exists, and creates one follow-up reminder only when no reply exists; idempotency prevents repeated events from duplicating actions, acknowledgement delivery retries once, and an exhausted delivery is dead-lettered. It does not connect to WhatsApp, a phone provider, or a production reminder system; it does not prove deliverability, consent, regulatory compliance, uptime, scale, or business outcomes, and the one-second interval is only a reproducible stand-in for a configurable production delay.

Evidence is written to `evidence/real-n8n-output.json` and `evidence/test-run.txt`.
