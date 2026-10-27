# 90-second video script

**0:00–0:10** — Show the canvas. “This local order flow starts with a synthetic store webhook and uses no third-party accounts.”

**0:10–0:23** — Open **Validate Order**. “It rejects missing order IDs, malformed SKUs, invalid quantities, and bad customer email addresses before any write.”

**0:23–0:38** — Follow **Create Fulfilment Row** into **Decrement Inventory**. “The fulfilment row and stock movement share the order idempotency key. Replaying the same order leaves one row and one stock decrement.”

**0:38–0:52** — Point to the stock failure branch. “Unknown or insufficient stock produces a controlled response and a dead-letter record for manual follow-up.”

**0:52–1:05** — Follow the notification and retry. “The customer notice is simulated locally. A transient failure retries once. When remaining stock is below the threshold, a separate owner alert is recorded.”

**1:05–1:20** — Run `node demos/ecommerce-order-flow/test.js`. “The five tests cover normal fulfilment, low stock, duplicate replay, retry recovery, and stockout.”

**1:20–1:30** — Show the final pass line. “This proves the local orchestration and safeguards, not a live storefront, warehouse, courier, or production inventory guarantee.”
