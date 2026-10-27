import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const demo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const required = ['workflow.json', 'mock/server.mjs', 'tests/run-tests.mjs', 'scripts/sandbox-smoke.mjs', 'README.md', 'HANDOVER.md', 'VIDEO-SCRIPT.md', 'evidence/mock-test-run-v3.txt', 'evidence/execution-summaries-v3.json'];
for (const name of required) assert.equal(fs.existsSync(path.join(demo, name)), true, `missing ${name}`);
const workflow = JSON.parse(fs.readFileSync(path.join(demo, 'workflow.json'), 'utf8'));
assert.equal(workflow.nodes.some(node => node.type === 'n8n-nodes-base.webhook'), true);
assert.equal(workflow.nodes.some(node => /Contact Upsert/.test(node.name)), true);
assert.equal(workflow.nodes.some(node => /Opportunity/.test(node.name)), true);
assert.equal(workflow.nodes.some(node => /Dead Letter/.test(node.name)), true);
assert.equal(workflow.nodes.some(node => /Read Back/.test(node.name)), true);
assert.equal(workflow.nodes.some(node => /Workflow Watchdog/.test(node.name)), true);
const opportunityNode = workflow.nodes.find(node => /GHL Opportunity Search/.test(node.name));
assert.ok(opportunityNode, 'opportunity node is missing');
assert.equal(opportunityNode.parameters.jsCode.includes('location_id='), true, 'opportunity search does not use location_id');
assert.equal(opportunityNode.parameters.jsCode.includes('pipeline_id='), true, 'opportunity search does not use pipeline_id');
assert.equal(opportunityNode.parameters.jsCode.includes('contact_id='), true, 'opportunity search does not use contact_id');
assert.equal(opportunityNode.parameters.jsCode.includes("'/opportunities/' + encodeURIComponent"), true, 'opportunity read-back is not by ID');
const evidence = fs.readFileSync(path.join(demo, 'evidence/mock-test-run-v3.txt'), 'utf8');
assert.equal(evidence.includes('Result: 15/15 tests passed'), true, 'v3 evidence does not show 15/15');
const files = required.map(name => fs.readFileSync(path.join(demo, name), 'utf8')).join('\n');
assert.equal(/ghl_[A-Za-z0-9_-]{20,}/.test(files), false, 'token-shaped value found');
const prohibitedNames = [
  String.fromCharCode(67, 108, 97, 117, 100, 101),
  String.fromCharCode(67, 104, 97, 116, 71, 80, 84),
  String.fromCharCode(71, 80, 84),
  String.fromCharCode(67, 111, 100, 101, 120),
];
for (const name of prohibitedNames) assert.equal(files.toLowerCase().includes(name.toLowerCase()), false, 'prohibited public wording found');
console.log(`Artifact checks: ${required.length}/${required.length} required files present; workflow and public wording checks passed`);
