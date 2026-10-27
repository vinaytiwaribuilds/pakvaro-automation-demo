# Invoice/email intake

## Run

Generate the checked fixture when needed with `node demos/invoice-email-intake/fixtures/make-sample-pdf.js`, import `workflow.json`, activate workflow ID `pakvaroInvoiceEmailIntake`, start the shared mock server, then run `node demos/invoice-email-intake/test.js`.

## What it does / what it does not prove

This demo receives a synthetic email payload containing a generated CSV or PDF attachment, applies deterministic field extraction for invoice number, date, amount, and vendor, appends the result to a local sheet-like store, and flags repeated vendor-plus-invoice combinations or amounts over a configurable threshold; malformed attachments are dead-lettered, repeated email IDs are idempotent, and a transient sheet failure is retried once. It does not provide general document understanding, OCR, mailbox access, accounting approval, tax validation, fraud detection, or production-grade PDF coverage; its parser intentionally supports the documented fixture formats, its store is in memory, and passing tests proves only the local n8n flow against synthetic files.

Evidence is written to `evidence/real-n8n-output.json` and `evidence/test-run.txt`.
