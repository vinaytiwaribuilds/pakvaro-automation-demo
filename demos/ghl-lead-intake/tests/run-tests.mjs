import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invalidLead, secondLead, validLead } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.dirname(here);
const evidenceDir = path.join(demoDir, 'evidence');
const n8nUrl = process.env.N8N_URL || 'http://127.0.0.1:5688';
const mockUrl = process.env.MOCK_URL || 'http://127.0.0.1:3011';
const signingSecret = process.env.TEST_WEBHOOK_SECRET || 'mock-webhook-signing-secret';
const webhook = `${n8nUrl}/webhook/ghl-lead-intake`;
const capturedResponses = [];

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  const result = { status: response.status, body, headers: Object.fromEntries(response.headers) };
  capturedResponses.push({ path: new URL(url).pathname, ...result });
  return result;
}

async function admin(route, method = 'GET', body) {
  return request(`${mockUrl}${route}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function reset() { assert.equal((await admin('/admin/reset', 'POST', {})).status, 200); }
async function state() { const response = await admin('/admin/state'); assert.equal(response.status, 200); return response.body; }
async function scenario(body) { assert.equal((await admin('/admin/scenario', 'POST', body)).status, 200); }
async function ghl(route) {
  return request(`${mockUrl}${route}`, { headers: { authorization: 'Bearer mock-bearer-for-local-tests', version: '2021-07-28', accept: 'application/json' } });
}

async function send(body, eventId, { timestamp = new Date().toISOString(), signature } = {}) {
  const raw = JSON.stringify(body);
  const signed = signature || `sha256=${crypto.createHmac('sha256', signingSecret).update(`${timestamp}.${raw}`).digest('hex')}`;
  return request(webhook, { method: 'POST', headers: { 'content-type': 'application/json', 'x-event-id': eventId, 'x-event-timestamp': timestamp, 'x-pakvaro-signature': signed }, body: raw });
}

const tests = [
  ['valid lead creates one normalised contact, opportunity and owner alert', async () => {
    await reset();
    const response = await send(validLead, 'lead_evt_valid_0001');
    assert.equal(response.status, 200);
    const snapshot = await state();
    assert.equal(snapshot.contacts.length, 1);
    assert.equal(snapshot.contacts[0].email, 'aarav@example.test');
    assert.equal(snapshot.opportunities.length, 1);
    assert.equal(snapshot.tasks.filter(item => item.title === 'Native workflow evidence').length, 1);
    assert.equal(snapshot.alerts.filter(item => item.type === 'lead_owner').length, 1);
    assert.equal(response.body.watchdogStatus, 'confirmed');
    return { httpStatus: 200, contacts: 1, opportunities: 1, workflowEvidenceTasks: 1, ownerAlerts: 1, watchdogStatus: 'confirmed' };
  }],
  ['invalid input returns field errors and causes no HighLevel calls', async () => {
    await reset();
    const response = await send(invalidLead, 'lead_evt_invalid_0002');
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'VALIDATION_ERROR');
    const snapshot = await state();
    assert.equal(snapshot.calls.length, 0);
    return { httpStatus: 400, ghlCalls: 0, fields: response.body.details.map(item => item.field) };
  }],
  ['exact replay returns the stored result without duplicate writes', async () => {
    await reset();
    const eventId = 'lead_evt_duplicate_0003';
    const first = await send(validLead, eventId);
    const second = await send(validLead, eventId);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    const snapshot = await state();
    assert.equal(snapshot.contacts.length, 1);
    assert.equal(snapshot.opportunities.length, 1);
    return { contacts: 1, opportunities: 1, duplicate: true };
  }],
  ['two 429 responses recover on the third contact upsert attempt', async () => {
    await reset();
    await scenario({ endpoint: 'contacts.upsert', statuses: [429, 429] });
    const response = await send(secondLead, 'lead_evt_rate_0004');
    assert.equal(response.status, 200);
    assert.equal(response.body.contactAttempts, 3);
    const snapshot = await state();
    assert.equal(snapshot.deadLetters.length, 0);
    assert.equal(snapshot.calls.filter(item => item.path === '/contacts/upsert').length, 3);
    return { httpStatus: 200, attempts: 3, deadLetters: 0 };
  }],
  ['persistent 5xx creates one dead letter and one action-needed alert', async () => {
    await reset();
    await scenario({ endpoint: 'contacts.upsert', statuses: [503, 503, 503, 503] });
    const response = await send(secondLead, 'lead_evt_outage_0005');
    assert.equal(response.status, 502);
    const snapshot = await state();
    assert.equal(snapshot.deadLetters.length, 1);
    assert.equal(snapshot.alerts.filter(item => item.type === 'action_needed').length, 1);
    assert.equal(snapshot.deadLetters[0].lead, undefined);
    return { httpStatus: 502, attempts: 4, deadLetters: 1, actionNeededAlerts: 1 };
  }],
  ['authentication failure is surfaced without retry', async () => {
    await reset();
    await scenario({ authMode: 'reject' });
    const response = await send(validLead, 'lead_evt_auth_0006');
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'GHL_AUTH_OR_SCOPE_FAILED');
    const snapshot = await state();
    assert.equal(snapshot.calls.filter(item => item.status === 401).length, 1);
    assert.equal(snapshot.alerts.filter(item => item.type === 'credential_scope').length, 1);
    return { httpStatus: 502, upstreamStatus: 401, attempts: 1, credentialScopeAlerts: 1 };
  }],
  ['opportunity is created in the configured pipeline and stage', async () => {
    await reset();
    const response = await send(validLead, 'lead_evt_stage_0007');
    assert.equal(response.status, 200);
    const snapshot = await state();
    assert.equal(snapshot.opportunities[0].pipelineId, 'pipeline_reference_lead_intake');
    assert.equal(snapshot.opportunities[0].pipelineStageId, 'stage_new_api_intake');
    return { pipelineId: 'pipeline_reference_lead_intake', pipelineStageId: 'stage_new_api_intake' };
  }],
  ['ambiguous opportunity create is not repeated or reconciled through search', async () => {
    await reset();
    await scenario({ searchLagMs: 10000, persistedCreateStatus: 503 });
    const eventId = 'lead_evt_search_lag_0008';
    const response = await send(secondLead, eventId);
    const replay = await send(secondLead, eventId);
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'GHL_OPPORTUNITY_WRITE_UNCONFIRMED');
    assert.equal(replay.status, 502);
    assert.equal(replay.body.error, 'GHL_OPPORTUNITY_WRITE_UNCONFIRMED');
    const snapshot = await state();
    assert.equal(snapshot.opportunities.length, 1);
    assert.equal(snapshot.calls.filter(item => item.path === '/opportunities/' && item.method === 'POST').length, 1);
    assert.equal(snapshot.calls.filter(item => item.path === '/opportunities/search').length, 1);
    assert.equal(snapshot.deadLetters.length, 1);
    return { httpStatus: 502, replayHttpStatus: 502, opportunities: 1, opportunityCreateCalls: 1, postWriteSearches: 0, duplicatesCreated: 0, retainedForReview: true };
  }],
  ['read-back after upsert detects a field silently ignored by the API', async () => {
    await reset();
    await scenario({ ignoredUpsertField: 'source' });
    const response = await send(validLead, 'lead_evt_readback_0009');
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'GHL_CONTACT_READBACK_MISMATCH');
    const snapshot = await state();
    assert.equal(snapshot.contacts.length, 1);
    assert.equal(snapshot.opportunities.length, 0);
    assert.equal(snapshot.alerts.filter(item => item.type === 'data_integrity').length, 1);
    assert.equal(snapshot.deadLetters[0].failingStep, 'contact_readback');
    return { httpStatus: 502, ignoredField: 'source', mismatchDetected: true, dataIntegrityAlerts: 1 };
  }],
  ['403 scope failure sends one immediate alert without retry and retains the event', async () => {
    await reset();
    await scenario({ authMode: 'reject403' });
    const response = await send(validLead, 'lead_evt_scope_0010');
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'GHL_AUTH_OR_SCOPE_FAILED');
    const snapshot = await state();
    assert.equal(snapshot.calls.filter(item => item.status === 403).length, 1);
    assert.equal(snapshot.calls.length, 1);
    assert.equal(snapshot.alerts.filter(item => item.type === 'credential_scope').length, 1);
    assert.equal(snapshot.deadLetters.length, 1);
    assert.equal(snapshot.ledgers[0].status, 'dead_letter');
    return { httpStatus: 502, upstreamStatus: 403, attempts: 1, credentialScopeAlerts: 1, retainedForReplay: true };
  }],
  ['watchdog alerts and marks the event needs-review when the native workflow is Draft', async () => {
    await reset();
    await scenario({ nativeWorkflowMode: 'draft' });
    const response = await send(secondLead, 'lead_evt_workflow_draft_0011');
    assert.equal(response.status, 202);
    assert.equal(response.body.error, 'GHL_NATIVE_WORKFLOW_MISSING');
    const snapshot = await state();
    assert.equal(snapshot.contacts.length, 1);
    assert.equal(snapshot.opportunities.length, 1);
    assert.equal(snapshot.tasks.length, 0);
    assert.equal(snapshot.alerts.filter(item => item.type === 'workflow_watchdog').length, 1);
    assert.equal(snapshot.alerts.find(item => item.type === 'workflow_watchdog').title, 'GHL workflow did not run - check if it was set to Draft');
    assert.equal(snapshot.alerts.filter(item => item.type === 'lead_owner').length, 0);
    assert.equal(snapshot.ledgers[0].status, 'needs_review');
    return { httpStatus: 202, workflowMode: 'draft', workflowEvidenceTasks: 0, watchdogAlerts: 1, ledgerStatus: 'needs_review' };
  }],
  ['workflow, state and captured output contain no credential values', async () => {
    const snapshot = await state();
    const workflow = fs.readFileSync(path.join(demoDir, 'workflow.json'), 'utf8');
    const savedEvidence = ['mock-test-run-v3.txt', 'execution-summaries-v3.json']
      .map(name => path.join(evidenceDir, name))
      .filter(name => fs.existsSync(name))
      .map(name => fs.readFileSync(name, 'utf8'))
      .join('\n');
    const material = `${workflow}\n${JSON.stringify(snapshot)}\n${JSON.stringify(capturedResponses)}\n${savedEvidence}`;
    for (const forbidden of ['mock-bearer-for-local-tests', signingSecret, 'Authorization: Bearer']) assert.equal(material.includes(forbidden), false);
    assert.equal(/ghl_[A-Za-z0-9_-]{20,}/.test(material), false);
    return { checked: ['workflow export', 'mock state', 'captured HTTP responses', 'saved evidence'], credentialValuesFound: 0 };
  }],
  ['camelCase opportunity-search query names receive the live-style 422 response', async () => {
    await reset();
    const response = await ghl('/opportunities/search?locationId=loc_reference_lab&pipelineId=pipeline_reference_lead_intake&contactId=contact_0001&status=open');
    assert.equal(response.status, 422);
    assert.deepEqual(response.body, {
      statusCode: 422,
      message: [
        'property locationId should not exist',
        'property pipelineId should not exist',
        'property contactId should not exist',
        'location_id should not be empty',
        'pipeline_id should not be empty',
        'contact_id should not be empty',
      ],
      error: 'Unprocessable Entity',
    });
    return { httpStatus: 422, rejected: ['locationId', 'pipelineId', 'contactId'], required: ['location_id', 'pipeline_id', 'contact_id'] };
  }],
  ['duplicate replay during search lag creates no second opportunity', async () => {
    await reset();
    await scenario({ searchLagMs: 10000 });
    const eventId = 'lead_evt_lag_replay_0014';
    const first = await send(validLead, eventId);
    const replay = await send(validLead, eventId);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true);
    const snapshot = await state();
    assert.equal(snapshot.opportunities.length, 1);
    assert.equal(snapshot.calls.filter(item => item.path === '/opportunities/' && item.method === 'POST').length, 1);
    assert.equal(snapshot.calls.filter(item => item.path === '/opportunities/search').length, 1);
    return { httpStatus: 200, searchLagMs: 10000, opportunities: 1, opportunityCreateCalls: 1, duplicate: true };
  }],
  ['contact and opportunity reads by ID succeed while search remains behind', async () => {
    await reset();
    await scenario({ searchLagMs: 10000 });
    const response = await send(secondLead, 'lead_evt_id_readback_0015');
    assert.equal(response.status, 200);
    const snapshot = await state();
    const contactId = snapshot.contacts[0].id;
    const opportunityId = snapshot.opportunities[0].id;
    assert.equal(snapshot.calls.some(item => item.method === 'GET' && item.path === `/contacts/${contactId}` && item.status === 200), true);
    assert.equal(snapshot.calls.some(item => item.method === 'GET' && item.path === `/opportunities/${opportunityId}` && item.status === 200), true);
    const contactSearch = await ghl('/contacts/lookup?locationId=loc_reference_lab&email=mira%40example.test');
    const opportunitySearch = await ghl(`/opportunities/search?location_id=loc_reference_lab&pipeline_id=pipeline_reference_lead_intake&contact_id=${contactId}&status=open`);
    const contactRead = await ghl(`/contacts/${contactId}`);
    const opportunityRead = await ghl(`/opportunities/${opportunityId}`);
    assert.equal(contactSearch.status, 404);
    assert.equal(opportunitySearch.status, 200);
    assert.equal(opportunitySearch.body.meta.total, 0);
    assert.equal(contactRead.status, 200);
    assert.equal(opportunityRead.status, 200);
    return { httpStatus: 200, searchLagMs: 10000, contactSearchVisible: false, opportunitySearchVisible: false, contactIdRead: 200, opportunityIdRead: 200 };
  }],
];

const lines = [
  'Demo: ghl-lead-intake',
  `Run date: ${new Date().toISOString()}`,
  `n8n: ${n8nUrl}`,
  `Mock: ${mockUrl}`,
  'Execution path: real local n8n production webhook',
];
const summaries = [];
let passed = 0;
for (const [name, test] of tests) {
  try {
    const output = await test();
    passed += 1;
    lines.push(`PASS ${name}`);
    summaries.push({ name, status: 'passed', ...output });
  } catch (error) {
    lines.push(`FAIL ${name}: ${error.message}`);
    summaries.push({ name, status: 'failed', error: error.message });
  }
}
lines.push('', `Result: ${passed}/${tests.length} tests passed`);
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, 'mock-test-run-v3.txt'), `${lines.join('\n')}\n`, 'utf8');
fs.writeFileSync(path.join(evidenceDir, 'execution-summaries-v3.json'), `${JSON.stringify({ runAt: new Date().toISOString(), result: { passed, total: tests.length }, scenarios: summaries }, null, 2)}\n`, 'utf8');
console.log(lines.join('\n'));
if (passed !== tests.length) process.exitCode = 1;
