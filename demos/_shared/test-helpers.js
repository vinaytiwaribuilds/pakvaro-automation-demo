'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.N8N_URL || 'http://127.0.0.1:5678';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:3001';
const API_KEY = process.env.MOCK_API_KEY || 'demo-local-key';
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 20000);

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function admin(route, method = 'GET', body) {
  return request(`${MOCK}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-demo-key': API_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function reset() {
  const response = await admin('/admin/reset', 'POST', {});
  assert.equal(response.status, 200);
}

async function state() {
  const response = await admin('/admin/state');
  assert.equal(response.status, 200);
  return response.body;
}

async function postWebhook(webhookPath, body, idempotencyKey) {
  const headers = { 'content-type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  return request(`${BASE}/webhook/${webhookPath}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function runSuite({ name, demoDir, tests }) {
  const lines = [`Demo: ${name}`, `n8n: ${BASE}`, `Mocks: ${MOCK}`];
  const scenarios = [];
  let passed = 0;
  for (const [testName, fn] of tests) {
    try {
      const output = await fn();
      passed += 1;
      lines.push(`PASS ${testName}`);
      scenarios.push({ name: testName, status: 'passed', output });
    } catch (error) {
      lines.push(`FAIL ${testName}`);
      lines.push(error.stack || error.message);
      scenarios.push({ name: testName, status: 'failed', error: error.message });
    }
  }
  lines.push('', `Result: ${passed}/${tests.length} tests passed`);
  for (const line of lines) console.log(line);
  const evidenceDir = path.join(demoDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidence = { runAt: new Date().toISOString(), n8nUrl: BASE, mockUrl: MOCK, result: { passed, total: tests.length }, scenarios };
  fs.writeFileSync(path.join(evidenceDir, 'real-n8n-output.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'test-run.txt'), `${lines.join('\n')}\n`, 'utf8');
  if (passed !== tests.length) process.exitCode = 1;
  return evidence.result;
}

module.exports = { assert, admin, postWebhook, request, reset, runSuite, state };
