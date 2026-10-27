# 90-second video script

**0:00–0:11** — Show the CSV and PDF fixtures. “These are generated synthetic invoices. The demo needs no mailbox, accounting platform, or cloud document service.”

**0:11–0:27** — Show the workflow canvas and open **Validate and Parse Attachment**. “The email webhook accepts one CSV or PDF up to one mebibyte. Deterministic rules extract invoice number, ISO date, amount, and vendor.”

**0:27–0:41** — Point to the invalid branch. “An unsupported or malformed file is recorded in the dead-letter store and returns a clear 422 response instead of silently disappearing.”

**0:41–0:55** — Point to the sheet attempts. “The parsed row is appended to a local sheet-like endpoint with an idempotency key. One transient write failure gets a one-second retry.”

**0:55–1:08** — Show **Apply Review Rules**. “The workflow flags the same vendor and invoice number as a possible duplicate. It also flags amounts above the supplied threshold.”

**1:08–1:21** — Run `node demos/invoice-email-intake/test.js`. “Five real-webhook tests cover CSV, PDF, duplicate detection, retry recovery, and a bad attachment.”

**1:21–1:30** — Show the pass count. “This proves a narrow deterministic parser and workflow. It does not claim OCR, arbitrary invoice support, or accounting correctness.”
