# 90-second video script

**0:00–0:11** — Show both workflow canvases. “This demo routes form leads and sends a daily owner summary using only local endpoints.”

**0:11–0:25** — Open **Validate Lead**. “The lead needs a name, valid email, ISO received timestamp, and stable lead ID. Invalid data stops before routing.”

**0:25–0:41** — Open **Round-robin with Business Hours**. “On weekdays from nine to eighteen in Asia/Kolkata, new IDs alternate between owner A and owner B. Outside that window they enter the after-hours queue.”

**0:41–0:54** — Follow the CRM and notification nodes. “The stable ID protects the assignment, CRM record, and owner notice from duplicate form delivery. A CRM rejection is retained as a dead letter.”

**0:54–1:07** — Show the daily summary workflow. “A daily schedule fetches totals by owner and sends the summary. A second webhook trigger makes that same path testable on demand.”

**1:07–1:21** — Run `node demos/crm-lead-routing/test.js`. “Five tests cover round-robin order, after-hours routing, duplicate protection, summary totals, and validation.”

**1:21–1:30** — Show the final pass line. “This proves local routing logic, not production CRM uptime, holiday coverage, or lead conversion.”
