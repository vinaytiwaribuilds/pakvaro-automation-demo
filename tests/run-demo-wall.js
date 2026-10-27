'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runSuite } = require('../demos/_shared/test-helpers');

const root = path.resolve(__dirname, '..');
const demos = ['missed-enquiry-rescue', 'invoice-email-intake', 'ecommerce-order-flow', 'crm-lead-routing'];

(async () => {
  const results = [];
  for (const demo of demos) {
    console.log(`\n=== ${demo} ===`);
    const suite = require(path.join(root, 'demos', demo, 'test.js'));
    results.push({ demo, ...(await runSuite(suite)) });
  }
  const passed = results.filter(item => item.passed === item.total).length;
  const summary = `Demo suites: ${passed}/${demos.length} passed`;
  console.log(`\n${summary}`);
  fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(root, 'evidence', 'demo-wall-test-run.txt'), `${JSON.stringify({ runAt: new Date().toISOString(), summary, results }, null, 2)}\n`, 'utf8');
  process.exitCode = passed === demos.length ? 0 : 1;
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
