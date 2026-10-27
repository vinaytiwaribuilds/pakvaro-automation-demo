# E-commerce order flow

## Run

Import `workflow.json`, activate workflow ID `pakvaroEcommerceOrderFlow`, start the shared mock server, then run `node demos/ecommerce-order-flow/test.js`.

## What it does / what it does not prove

This demo validates a synthetic order webhook, creates one idempotent fulfilment row, decrements a local inventory item exactly once, sends one simulated customer notification, and alerts when the remaining quantity falls below the supplied threshold; a transient notification failure is retried once, insufficient stock is dead-lettered, and replaying the same order does not repeat fulfilment, stock movement, notification, or alert. It does not connect to a storefront, warehouse, courier, payment processor, or messaging provider; it does not reserve stock concurrently, process refunds or split shipments, prove high-volume consistency, or establish delivery and revenue outcomes, and its in-memory inventory is only a deterministic local stand-in.

Evidence is written to `evidence/real-n8n-output.json` and `evidence/test-run.txt`.
