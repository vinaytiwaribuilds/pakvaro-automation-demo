'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = JSON.parse(fs.readFileSync(path.join(root, 'workflows', 'lead-intake.workflow.json'), 'utf8'));
const error = JSON.parse(fs.readFileSync(path.join(root, 'workflows', 'error-handler.workflow.json'), 'utf8'));
const fixtures = require('./fixtures');

assert.equal(main.nodes[0].type, 'n8n-nodes-base.webhook');
assert.ok(main.nodes.some((node) => node.type === 'n8n-nodes-base.respondToWebhook'));
assert.ok(main.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest').length >= 7);
assert.ok(main.nodes.filter((node) => node.type === 'n8n-nodes-base.wait').length === 2);
assert.ok(error.nodes.some((node) => node.type === 'n8n-nodes-base.errorTrigger'));
assert.equal(main.settings.errorWorkflow, error.id);

const allowedMainTypes = new Set([
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.code',
  'n8n-nodes-base.if',
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.wait',
  'n8n-nodes-base.respondToWebhook',
]);
const allowedErrorTypes = new Set([
  'n8n-nodes-base.errorTrigger',
  'n8n-nodes-base.code',
  'n8n-nodes-base.httpRequest',
]);
for (const node of main.nodes) assert.ok(allowedMainTypes.has(node.type), `account-backed node found: ${node.type}`);
for (const node of error.nodes) assert.ok(allowedErrorTypes.has(node.type), `account-backed error node found: ${node.type}`);

const nodeByName = new Map(main.nodes.map((node) => [node.name, node]));
for (const name of [
  'Validate and Normalise',
  'Score and Qualify',
  'CRM Write Attempt 1',
  'CRM Write Attempt 2',
  'CRM Write Attempt 3',
  'Backoff 1 Second',
  'Backoff 2 Seconds',
  'Record Dead Letter',
  'Send Action Needed Alert',
  'Alert Lead Owner',
  'Create Follow-up Task',
]) assert.ok(nodeByName.has(name), `required node missing: ${name}`);
assert.match(nodeByName.get('Validate and Normalise').parameters.jsCode, /VALIDATION_ERROR/);
assert.match(nodeByName.get('Validate and Normalise').parameters.jsCode, /idempotencyKey/);
assert.match(nodeByName.get('Score and Qualify').parameters.jsCode, /const SCORE_CONFIG =/);
assert.deepEqual(
  [nodeByName.get('Backoff 1 Second').parameters.amount, nodeByName.get('Backoff 2 Seconds').parameters.amount],
  [1, 2],
);
assert.equal(nodeByName.get('Respond Invalid').parameters.options.responseCode, 400);
assert.equal(nodeByName.get('Respond Dead Lettered').parameters.options.responseCode, 502);

for (const fixture of [fixtures.validLead, fixtures.recoveryLead, fixtures.deadLetterLead]) {
  assert.match(fixture.email.trim(), /\.example$/i, `fixture email is not synthetic: ${fixture.email}`);
}
assert.equal(
  fs.readdirSync(root).some((name) => /^licen[cs]e(?:\.|$)/i.test(name)),
  false,
  'licence decision is pending; do not add a licence file',
);

const skippedDirectories = new Set(['.git', '.runtime', 'evidence', 'node_modules']);
function filesWithin(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (skippedDirectories.has(entry.name) || entry.name.startsWith('.npm-cache') || entry.name.startsWith('.n8n'))) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesWithin(target));
    if (entry.isFile()) files.push(target);
  }
  return files;
}
const all = filesWithin(root);
const prohibitedAutomationLabel = String.fromCharCode(65, 73);
const prohibitedAutomationPattern = new RegExp(`\\b${prohibitedAutomationLabel}\\b`);
for (const file of all) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!/BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/.test(text), `private key marker found in ${file}`);
  assert.ok(!prohibitedAutomationPattern.test(text), `prohibited public automation label found in ${file}`);
}

console.log('PASS workflow JSON parses and uses only account-free demo node families');
console.log('PASS validation, idempotency, scoring, retry, dead-letter, alert and follow-up nodes are present');
console.log('PASS main workflow references the Error Trigger workflow');
console.log('PASS fixtures are synthetic and no licence file is present');
console.log('PASS no private-key marker or prohibited public automation label found');
console.log('Result: 5/5 artifact checks passed');
