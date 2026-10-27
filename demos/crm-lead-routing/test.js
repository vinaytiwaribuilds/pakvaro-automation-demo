'use strict';

const fixtures = require('./fixtures');
const { assert, postWebhook, reset, runSuite, state } = require('../_shared/test-helpers');

const suite = {
  name: 'crm-lead-routing',
  demoDir: __dirname,
  tests: [
    ['business-hours leads are assigned round-robin', async () => {
      await reset();
      const first = await postWebhook('crm-lead-routing', fixtures.businessOne, fixtures.businessOne.leadId);
      const second = await postWebhook('crm-lead-routing', fixtures.businessTwo, fixtures.businessTwo.leadId);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(first.body.owner, 'owner-a');
      assert.equal(second.body.owner, 'owner-b');
      return { first: first.body, second: second.body };
    }],
    ['outside business hours routes to the after-hours queue', async () => {
      await reset();
      const response = await postWebhook('crm-lead-routing', fixtures.afterHours, fixtures.afterHours.leadId);
      assert.equal(response.status, 200);
      assert.equal(response.body.owner, 'after-hours-queue');
      assert.equal(response.body.businessHours, false);
      return response.body;
    }],
    ['duplicate lead keeps one assignment, CRM record and notification', async () => {
      await reset();
      const key = 'route-duplicate-0004';
      const first = await postWebhook('crm-lead-routing', fixtures.businessOne, key);
      const second = await postWebhook('crm-lead-routing', fixtures.businessOne, key);
      assert.equal(first.body.owner, second.body.owner);
      const snapshot = await state();
      assert.equal(snapshot.routeAssignments.length, 1);
      assert.equal(snapshot.crmDemoLeads.length, 1);
      assert.equal(snapshot.alerts.filter(item => item.type === 'routed_lead_owner').length, 1);
      return { owner: first.body.owner, assignments: 1, records: 1, notifications: 1 };
    }],
    ['daily summary reports totals by owner', async () => {
      await reset();
      await postWebhook('crm-lead-routing', fixtures.businessOne, fixtures.businessOne.leadId);
      await postWebhook('crm-lead-routing', fixtures.businessTwo, fixtures.businessTwo.leadId);
      await postWebhook('crm-lead-routing', fixtures.afterHours, fixtures.afterHours.leadId);
      const summary = await postWebhook('crm-daily-summary', {});
      assert.equal(summary.status, 200);
      assert.equal(summary.body.workflowResponse.total, 3);
      assert.deepEqual(summary.body.workflowResponse.byOwner, { 'owner-a': 1, 'owner-b': 1, 'after-hours-queue': 1 });
      return summary.body.workflowResponse;
    }],
    ['invalid lead is rejected before routing', async () => {
      await reset();
      const response = await postWebhook('crm-lead-routing', fixtures.invalid);
      assert.equal(response.status, 400);
      const snapshot = await state();
      assert.equal(snapshot.crmDemoLeads.length, 0);
      return response.body;
    }],
  ],
};

if (require.main === module) runSuite(suite).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = suite;
