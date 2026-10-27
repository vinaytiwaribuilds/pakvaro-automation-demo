'use strict';

const path = require('node:path');
const fixtures = require('./fixtures');
const { assert, admin, postWebhook, reset, runSuite, state } = require('../_shared/test-helpers');

const demoDir = __dirname;

const suite = {
  name: 'missed-enquiry-rescue',
  demoDir,
  tests: [
    ['invalid event has no side effects', async () => {
      await reset();
      const response = await postWebhook('missed-enquiry-rescue', fixtures.invalid);
      assert.equal(response.status, 400);
      const snapshot = await state();
      assert.equal(snapshot.inquiryAcks.length, 0);
      return response;
    }],
    ['no reply creates acknowledgement, owner alert and reminder', async () => {
      await reset();
      const response = await postWebhook('missed-enquiry-rescue', fixtures.missedCall, fixtures.missedCall.eventId);
      assert.equal(response.status, 200);
      assert.equal(response.body.reminderCreated, true);
      const snapshot = await state();
      assert.equal(snapshot.inquiryAcks.length, 1);
      assert.equal(snapshot.inquiryAlerts.length, 1);
      assert.equal(snapshot.inquiryReminders.length, 1);
      return { response: response.body, counts: { acks: 1, alerts: 1, reminders: 1 } };
    }],
    ['recorded reply suppresses reminder', async () => {
      await reset();
      await admin('/admin/inquiry-reply', 'POST', { idempotencyKey: fixtures.enquiry.eventId });
      const response = await postWebhook('missed-enquiry-rescue', fixtures.enquiry, fixtures.enquiry.eventId);
      assert.equal(response.status, 200);
      assert.equal(response.body.replied, true);
      const snapshot = await state();
      assert.equal(snapshot.inquiryReminders.length, 0);
      return response.body;
    }],
    ['acknowledgement retries once after a transient failure', async () => {
      await reset();
      await admin('/admin/service-failures', 'POST', { service: 'inquiry-ack', count: 1 });
      const response = await postWebhook('missed-enquiry-rescue', fixtures.missedCall, 'missed-retry-0001');
      assert.equal(response.status, 200);
      const snapshot = await state();
      assert.equal(snapshot.inquiryAcks.length, 1);
      assert.equal(snapshot.deadLetters.length, 0);
      return { response: response.body, acknowledgements: snapshot.inquiryAcks.length };
    }],
    ['duplicate event does not duplicate actions', async () => {
      await reset();
      const key = 'missed-duplicate-0001';
      const first = await postWebhook('missed-enquiry-rescue', fixtures.missedCall, key);
      const second = await postWebhook('missed-enquiry-rescue', fixtures.missedCall, key);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      const snapshot = await state();
      assert.equal(snapshot.inquiryAcks.length, 1);
      assert.equal(snapshot.inquiryAlerts.length, 1);
      assert.equal(snapshot.inquiryReminders.length, 1);
      return { acks: 1, ownerAlerts: 1, reminders: 1 };
    }],
  ],
};

if (require.main === module) runSuite(suite).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = suite;
