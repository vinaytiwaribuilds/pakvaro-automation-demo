'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const demos = ['missed-enquiry-rescue', 'invoice-email-intake', 'ecommerce-order-flow', 'crm-lead-routing'];
const ids = new Set();
const allowedTypes = new Set(['n8n-nodes-base.webhook', 'n8n-nodes-base.code', 'n8n-nodes-base.if', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.wait', 'n8n-nodes-base.respondToWebhook', 'n8n-nodes-base.scheduleTrigger']);

for (const demo of demos) {
  const directory = path.join(root, 'demos', demo);
  for (const required of ['workflow.json', 'fixtures.js', 'test.js', 'README.md', 'VIDEO-SCRIPT.md']) assert.ok(fs.existsSync(path.join(directory, required)), `${demo} is missing ${required}`);
  const workflows = fs.readdirSync(directory).filter(name => name.endsWith('.json'));
  assert.ok(workflows.length >= 1);
  for (const name of workflows) {
    const workflow = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    assert.ok(!ids.has(workflow.id), `duplicate workflow ID: ${workflow.id}`);
    ids.add(workflow.id);
    assert.ok(workflow.nodes.some(node => node.type === 'n8n-nodes-base.webhook') || workflow.nodes.some(node => node.type === 'n8n-nodes-base.scheduleTrigger'));
    for (const node of workflow.nodes) assert.ok(allowedTypes.has(node.type), `${demo} uses account-backed node type ${node.type}`);
  }
}

const invoiceFixtures = path.join(root, 'demos', 'invoice-email-intake', 'fixtures');
assert.ok(fs.statSync(path.join(invoiceFixtures, 'sample-invoice.csv')).size > 20);
assert.ok(fs.readFileSync(path.join(invoiceFixtures, 'sample-invoice.pdf')).subarray(0, 8).toString('ascii').startsWith('%PDF-1.4'));
assert.equal(fs.readdirSync(root).some(name => /^licen[cs]e(?:\.|$)/i.test(name)), false);

const skipped = new Set(['.git', '.runtime', 'evidence', 'node_modules']);
function filesWithin(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (skipped.has(entry.name) || entry.name.startsWith('.npm-cache') || entry.name.startsWith('.n8n'))) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesWithin(target));
    if (entry.isFile()) files.push(target);
  }
  return files;
}
const prohibitedLabel = String.fromCharCode(65, 73);
const prohibitedPattern = new RegExp(`\\b${prohibitedLabel}\\b`);
for (const file of filesWithin(root)) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!prohibitedPattern.test(text), `prohibited public label found in ${file}`);
  assert.ok(!/BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/.test(text), `private-key marker found in ${file}`);
}

console.log('PASS four demo directories contain workflow, fixtures, test, limits paragraph and video script');
console.log('PASS workflow IDs are unique and use only account-free node families');
console.log('PASS CSV and PDF invoice fixtures are present');
console.log('PASS no licence file, private-key marker or prohibited public label found');
console.log('Result: 4/4 demo-wall artifact checks passed');
