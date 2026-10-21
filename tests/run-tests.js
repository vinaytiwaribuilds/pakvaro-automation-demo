'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./fixtures');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://127.0.0.1:5678/webhook/lead-intake';
const MOCK_URL = process.env.MOCK_URL || 'http://127.0.0.1:3001';
const API_KEY = process.env.MOCK_API_KEY || 'demo-local-key';
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 20000);
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || path.resolve(__dirname, '..', 'evidence');
const transcript = [];

function log(message = '') {
  console.log(message);
  transcript.push(message);
}

function logError(message) {
  console.error(message);
  transcript.push(message);
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function admin(path, method = 'GET', body) {
  return request(`${MOCK_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-demo-key': API_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function postLead(body, idempotencyKey) {
  const headers = { 'content-type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  return request(WEBHOOK_URL, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function state() {
  const response = await admin('/admin/state');
  assert.equal(response.status, 200);
  return response.body;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('valid lead is normalised, scored, written and alerted', async () => {
  await admin('/admin/reset', 'POST', {});
  const response = await postLead(fixtures.validLead, 'test-valid-0001');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.duplicate, false);
  assert.equal(response.body.attempts, 1);
  const snapshot = await state();
  assert.equal(snapshot.leads.length, 1);
  assert.equal(snapshot.leads[0].email, 'aarav@northstar.example');
  assert.equal(snapshot.leads[0].phone, '+919876543210');
  assert.equal(snapshot.leads[0].qualification, 'qualified');
  assert.equal(snapshot.alerts.length, 1);
  assert.equal(snapshot.alerts[0].type, 'lead_owner');
  assert.equal(snapshot.followUps.length, 1);
  assert.equal(snapshot.followUps[0].type, 'lead_follow_up');
  return { httpStatus: response.status, attempts: response.body.attempts, duplicate: response.body.duplicate, crmLeads: snapshot.leads.length, alerts: snapshot.alerts.map((item) => item.type), followUps: snapshot.followUps.length, deadLetters: snapshot.deadLetters.length };
});

test('invalid lead gets clear 400 and creates no side effects', async () => {
  await admin('/admin/reset', 'POST', {});
  const response = await postLead(fixtures.invalidLead);
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
  assert.ok(response.body.details.length >= 3);
  const snapshot = await state();
  assert.equal(snapshot.leads.length, 0);
  assert.equal(snapshot.alerts.length, 0);
  assert.equal(snapshot.followUps.length, 0);
  assert.equal(snapshot.deadLetters.length, 0);
  return { httpStatus: response.status, error: response.body.error, validationErrors: response.body.details.length, crmLeads: 0, alerts: [], followUps: 0, deadLetters: 0 };
});

test('duplicate idempotency key does not create a second CRM lead', async () => {
  await admin('/admin/reset', 'POST', {});
  const first = await postLead(fixtures.validLead, 'test-duplicate-0001');
  const second = await postLead(fixtures.validLead, 'test-duplicate-0001');
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  const snapshot = await state();
  assert.equal(snapshot.leads.length, 1);
  assert.equal(snapshot.alerts.length, 2);
  assert.equal(snapshot.followUps.length, 2);
  return { firstHttpStatus: first.status, secondHttpStatus: second.status, duplicate: second.body.duplicate, crmLeads: snapshot.leads.length, alerts: snapshot.alerts.map((item) => item.type), followUps: snapshot.followUps.length, deadLetters: 0 };
});

test('CRM fails twice, then succeeds on the third attempt', async () => {
  await admin('/admin/reset', 'POST', {});
  await admin('/admin/crm-failures', 'POST', { count: 2 });
  const started = Date.now();
  const response = await postLead(fixtures.recoveryLead, 'test-recovery-0001');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.attempts, 3);
  assert.ok(Date.now() - started >= 2500, 'backoff should take about 3 seconds');
  const snapshot = await state();
  assert.equal(snapshot.leads.length, 1);
  assert.equal(snapshot.deadLetters.length, 0);
  assert.equal(snapshot.alerts.at(-1).type, 'lead_owner');
  assert.equal(snapshot.followUps.length, 1);
  return { httpStatus: response.status, attempts: response.body.attempts, elapsedMs: Date.now() - started, crmLeads: snapshot.leads.length, alerts: snapshot.alerts.map((item) => item.type), followUps: snapshot.followUps.length, deadLetters: 0 };
});

test('CRM stays down, so lead is dead-lettered and owner is alerted', async () => {
  await admin('/admin/reset', 'POST', {});
  await admin('/admin/crm-failures', 'POST', { count: 3 });
  const response = await postLead(fixtures.deadLetterLead, 'test-dead-letter-0001');
  assert.equal(response.status, 502);
  assert.equal(response.body.error, 'CRM_WRITE_FAILED');
  assert.equal(response.body.attempts, 3);
  const snapshot = await state();
  assert.equal(snapshot.leads.length, 0);
  assert.equal(snapshot.deadLetters.length, 1);
  assert.equal(snapshot.deadLetters[0].idempotencyKey, 'test-dead-letter-0001');
  assert.equal(snapshot.alerts.length, 1);
  assert.equal(snapshot.alerts[0].type, 'action_needed');
  assert.equal(snapshot.followUps.length, 0);
  return { httpStatus: response.status, error: response.body.error, attempts: response.body.attempts, crmLeads: 0, alerts: snapshot.alerts.map((item) => item.type), followUps: 0, deadLetters: snapshot.deadLetters.length };
});

(async () => {
  log(`Webhook: ${WEBHOOK_URL}`);
  log(`Mocks:   ${MOCK_URL}`);
  let passed = 0;
  const summaries = [];
  for (const { name, fn } of tests) {
    try {
      const summary = await fn();
      passed += 1;
      log(`PASS ${name}`);
      summaries.push({ name, status: 'passed', ...summary });
    } catch (error) {
      logError(`FAIL ${name}`);
      logError(error.stack || error.message);
      summaries.push({ name, status: 'failed', error: error.message });
    }
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'execution-summaries.json'), `${JSON.stringify({ runAt: new Date().toISOString(), webhookUrl: WEBHOOK_URL, result: { passed, total: tests.length }, scenarios: summaries }, null, 2)}\n`, 'utf8');
  log(`\nResult: ${passed}/${tests.length} tests passed`);
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'test-run.txt'), `${transcript.join('\n')}\n`, 'utf8');
  process.exitCode = passed === tests.length ? 0 : 1;
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
