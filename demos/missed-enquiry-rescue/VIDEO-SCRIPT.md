# 90-second video script

**0:00–0:10** — Show the n8n canvas. “This is a local missed-enquiry rescue. A new enquiry or missed call enters here, with no external account required.”

**0:10–0:23** — Open **Validate Event**. “The workflow checks the event type, customer name, international phone format, and idempotency key before doing any work.”

**0:23–0:38** — Follow the main branch. “A simulated WhatsApp endpoint sends the acknowledgement. A transient failure gets one short retry; a second failure is preserved in the dead-letter store.”

**0:38–0:51** — Point to **Alert Owner**, **Wait Test Interval**, and **Check for Reply**. “The owner is alerted immediately. For this recording the follow-up delay is one second. The production value would be longer and configurable.”

**0:51–1:03** — Show both reply branches. “If a reply has arrived, the workflow stops. If not, it creates exactly one reminder. Replaying the same event does not duplicate the acknowledgement, alert, or reminder.”

**1:03–1:18** — Run `node demos/missed-enquiry-rescue/test.js`. “These five tests hit the real local n8n webhook: validation, no reply, reply suppression, retry recovery, and duplicate protection.”

**1:18–1:30** — Show the final pass line and state endpoint. “This proves the local orchestration and failure paths. It does not claim live WhatsApp delivery, production uptime, or customer results.”
