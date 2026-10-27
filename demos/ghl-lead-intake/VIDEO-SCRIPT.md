# 90-second walkthrough

Use only synthetic fixtures. Hide account menus, login addresses and identifiers.

## 0:00-0:08 — outcome

“This self-initiated n8n reference build keeps a synthetic HighLevel lead from being lost or duplicated, then checks that the native follow-up workflow actually ran.”

Show the full workflow canvas.

## 0:08-0:16 — intake safety

“The request signature is checked in one step. The workflow then validates identity, normalises the lead and reads the contact back after upsert.”

Show the validation, upsert and read-back nodes without exposing configuration values.

## 0:16-0:38 — duplicate prevention under search lag

“Here the mock persists the opportunity but returns a 503 while its search index is behind. With no returned ID, the workflow does not guess, search for read-after-write proof or send a second create. It retains the event for review.”

Show test 8: one opportunity, one opportunity-create call, zero post-write searches and zero duplicates.

## 0:38-0:58 — Draft-workflow watchdog

“Now the native workflow switch is set to Draft. The contact and opportunity exist, but the expected evidence task never appears. After the bounded window, the watchdog sends one owner alert: ‘GHL workflow did not run - check if it was set to Draft’, and marks the event `needs_review`.”

Show test 11, the missing task, the single watchdog alert and the retained ledger state.

## 0:58-1:10 — normal evidence path

“With the native workflow published, its evidence task appears. The watchdog confirms it, the owner receives the completed-lead alert and the ledger completes.”

Show the valid local execution with redacted record IDs.

## 1:10-1:20 — failures that do not pretend success

“A silently ignored field fails read-back, while a 401 or 403 sends one immediate credential-or-scope alert without retry. Both retain a safe replay reference instead of reporting success.”

Show tests 9 and 10.

## 1:20-1:30 — boundary

“This walkthrough proves a tested workflow pattern against a local mock. It is not a client project or a production service-level claim. The repository contains a separate redacted sandbox smoke record; this walkthrough does not show the full workflow running against HighLevel.”

Show tests 13–15: camelCase opportunity search rejected with HTTP 422, duplicate replay during lag still leaves one opportunity, and contact/opportunity ID reads return 200 while search remains empty.

End on `Result: 15/15 tests passed` and `LIMITS.md`.
