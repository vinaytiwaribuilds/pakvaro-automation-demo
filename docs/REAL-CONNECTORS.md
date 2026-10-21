# Swap the local mocks for real connectors

Make connector changes in a copy of the workflow. Keep **Lead Intake Webhook**, **Validate and Normalise**, **Input Valid?**, **Score and Qualify**, the response nodes, and the Error Trigger workflow. Never paste credentials into a Code node, expression, exported workflow, screenshot, or Git commit; create credentials in n8n’s credential manager.

The source fields available after **Score and Qualify** are:

| Field | Expression |
|---|---|
| Idempotency key | `{{$json.idempotencyKey}}` |
| Name | `{{$json.lead.name}}` |
| Company | `{{$json.lead.company}}` |
| Email | `{{$json.lead.email}}` |
| Phone | `{{$json.lead.phone}}` |
| Budget | `{{$json.lead.budget}}` |
| Timeline days | `{{$json.lead.timelineDays}}` |
| Source | `{{$json.lead.source}}` |
| Message | `{{$json.lead.message}}` |
| Score | `{{$json.lead.score}}` |
| Qualification | `{{$json.lead.qualification}}` |

## Google Sheets as the lead store

### Prepare the sheet

Create a sheet named `Leads` with this header row:

```text
idempotency_key,created_at,name,company,email,phone,budget,timeline_days,source,message,score,qualification
```

In n8n, create one Google Sheets OAuth2 credential. Grant only the access required for the chosen spreadsheet.

### Replace the CRM branch

1. Remove **CRM Write Attempt 1** through **CRM Success 3?**.
2. After **Score and Qualify**, add a **Google Sheets** node:
   - Resource: `Sheet Within Document`
   - Operation: `Get Row(s)`
   - Document: select the target spreadsheet
   - Sheet: `Leads`
   - Filter column: `idempotency_key`
   - Filter value: `{{$json.idempotencyKey}}`
   - Node setting **Always Output Data**: on
3. Add an **IF** node named **Sheet Row Exists?**. Test whether `idempotency_key` is non-empty.
4. Route `true` to a Code node that shapes the normal success object with `duplicate: true`; route that to the owner notification.
5. Route `false` to another **Google Sheets** node:
   - Resource: `Sheet Within Document`
   - Operation: `Append Row`
   - Mapping mode: `Map Each Column Manually`
   - Map each header to the expressions in the table above; use `{{$now}}` for `created_at`.
6. In the append node’s **Settings**, enable **Retry On Fail**, set **Max Tries** to `3`, and **Wait Between Tries** to the acceptable interval. If explicit 1-second/2-second backoff is required, retain the demo’s three-attempt shape and place one append node after each Wait node.
7. Set **On Error** to `Continue (using error output)`, and connect the final error output to **Prepare Dead Letter**.

Google Sheets does not provide a database uniqueness constraint. Two truly simultaneous submissions can both pass the lookup. For production concurrency, put a transactional store with a unique key before Sheets, or use a CRM property that enforces uniqueness.

## Gmail or Slack for owner alerts

Replace both **Alert Lead Owner** and **Send Action Needed Alert**. Keep the preceding preparation Code nodes; they provide a consistent `$json.alert` object.

### Gmail

1. Create a Gmail OAuth2 credential in n8n.
2. Add a **Gmail** node for each alert:
   - Resource: `Message`
   - Operation: `Send`
   - To: an operator address stored in n8n configuration
   - Subject: `{{$json.alert.title}}`
   - Email type: `Text`
   - Message: `{{ JSON.stringify($json.alert, null, 2) }}`
3. For the action-needed path, add a clear prefix such as `[ACTION NEEDED]` to the subject.
4. Preserve the workflow response across the Gmail node with an **Edit Fields** node before sending, or make the response node reference the preparation node directly.

### Slack

1. Create a Slack OAuth2 credential in n8n and restrict it to the intended workspace/channel.
2. Add a **Slack** node for each alert:
   - Resource: `Message`
   - Operation: `Send`
   - Send Message To: `Channel`
   - Channel: select the operator channel
   - Message Text: `*{{$json.alert.title}}*\nType: {{$json.alert.type}}\nKey: {{$json.alert.idempotencyKey}}\nScore: {{$json.alert.score || 'n/a'}}\nAttempts: {{$json.alert.attempts || 1}}`
3. Use an `:rotating_light:` prefix for `action_needed` alerts.
4. As with Gmail, preserve the webhook response before the Slack node.

For either channel, configure a separate fallback notification outside n8n if a total n8n outage must be detected.

## HubSpot CRM

### Prepare HubSpot

1. Create a single-line contact property named `pakvaro_idempotency_key`.
2. If the HubSpot plan supports unique-value properties, require unique values. Otherwise, keep the search-before-create step and document its concurrency limit.
3. Create a HubSpot credential in n8n using the supported OAuth2 or private-app method. Store it only in n8n.

### Replace the CRM requests

1. After **Score and Qualify**, add a **HubSpot** node that searches Contacts for `pakvaro_idempotency_key = {{$json.idempotencyKey}}`.
2. Add an **IF** node:
   - Found → shape a success result with the HubSpot contact ID and `duplicate: true`.
   - Not found → continue to a HubSpot Contact create node.
3. In **HubSpot → Contact → Create**, map:
   - Email ← normalised email
   - Phone ← normalised phone
   - Company ← company
   - Lead score/custom field ← score
   - Lead status/custom field ← qualification
   - `pakvaro_idempotency_key` ← idempotency key
4. Enable **Retry On Fail** with three tries. To preserve the demonstrated 1-second/2-second backoff exactly, use three HubSpot create nodes separated by the two Wait nodes and route each error output to the next attempt.
5. Set the final create node’s **On Error** to `Continue (using error output)` and connect it to **Prepare Dead Letter**.
6. Shape the successful node output into the same fields used by **Prepare Owner Alert**: `crmId`, `duplicate`, `attempt`, `lead`, and `idempotencyKey`.

HubSpot commonly treats email as a contact identity. Decide with the operator whether a new idempotency key for the same email should update the existing contact or create a separate lead object.

## Zoho CRM

### Prepare Zoho

1. Add a Lead field named `Pakvaro Idempotency Key` with API name such as `Pakvaro_Idempotency_Key`.
2. Mark it unique when the Zoho edition supports that control.
3. Create a Zoho OAuth2 credential in n8n with access limited to the required CRM modules.

### Replace the CRM requests

1. Add a **Zoho CRM** node after **Score and Qualify**.
2. Use resource `Lead` and the available search/get-many operation to find `Pakvaro_Idempotency_Key = {{$json.idempotencyKey}}`.
3. Add an **IF** node. Existing record routes to `duplicate: true`; no record routes to **Zoho CRM → Lead → Create** (or `Upsert` when the installed node exposes it).
4. Map the normalised contact fields, score, qualification, source, and idempotency key. Zoho requires `Last_Name`; map the complete demo `name` there unless the intake form separately captures first and last name.
5. Configure the same retry/error-output pattern as HubSpot and connect exhausted errors to **Prepare Dead Letter**.
6. Shape success output to `crmId`, `duplicate`, `attempt`, `lead`, and `idempotencyKey` before **Prepare Owner Alert**.

## Credential and cutover checklist

1. Use a dedicated least-privilege service identity where the provider supports one.
2. Keep development and production credentials separate.
3. Export the workflow and scan it before publication; credential references are acceptable, credential values are not.
4. Run the five scenarios against a sandbox account with synthetic leads.
5. Confirm idempotency under two near-simultaneous requests.
6. Confirm retry behavior using a controlled failure, not a production outage.
7. Confirm dead-letter ownership, response time, and replay authority.
8. Replace the local JSONL evidence with approved operational logging and retention.
9. Activate the real workflow only after the owner accepts the test results and rollback plan.
