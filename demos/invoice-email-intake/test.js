'use strict';

const fixtures = require('./fixtures');
const { assert, admin, postWebhook, reset, runSuite, state } = require('../_shared/test-helpers');

const suite = {
  name: 'invoice-email-intake',
  demoDir: __dirname,
  tests: [
    ['CSV attachment is parsed and appended', async () => {
      await reset();
      const response = await postWebhook('invoice-email-intake', fixtures.csvEmail, fixtures.csvEmail.emailId);
      assert.equal(response.status, 200);
      assert.equal(response.body.invoiceNumber, 'INV-CSV-1001');
      assert.equal(response.body.overThreshold, false);
      const snapshot = await state();
      assert.equal(snapshot.invoiceRows[0].vendor, 'SYNTHETIC FIXTURE - Northstar Demo Office Supplies');
      return { response: response.body, row: snapshot.invoiceRows[0] };
    }],
    ['PDF attachment is parsed and high amount is flagged', async () => {
      await reset();
      const response = await postWebhook('invoice-email-intake', fixtures.pdfEmail, fixtures.pdfEmail.emailId);
      assert.equal(response.status, 200);
      assert.equal(response.body.invoiceNumber, 'INV-PDF-2002');
      assert.equal(response.body.overThreshold, true);
      const snapshot = await state();
      assert.equal(snapshot.alerts.at(-1).type, 'invoice_review');
      return { response: response.body, alertType: snapshot.alerts.at(-1).type };
    }],
    ['same vendor and invoice number is flagged as duplicate', async () => {
      await reset();
      await postWebhook('invoice-email-intake', fixtures.csvEmail, 'invoice-original-0001');
      const response = await postWebhook('invoice-email-intake', { ...fixtures.csvEmail, emailId: 'invoice-copy-0002' }, 'invoice-copy-0002');
      assert.equal(response.status, 200);
      assert.equal(response.body.duplicate, true);
      const snapshot = await state();
      assert.equal(snapshot.invoiceRows.length, 2);
      return response.body;
    }],
    ['sheet write retries after a transient failure', async () => {
      await reset();
      await admin('/admin/service-failures', 'POST', { service: 'invoice-sheet', count: 1 });
      const response = await postWebhook('invoice-email-intake', fixtures.csvEmail, 'invoice-retry-0001');
      assert.equal(response.status, 200);
      const snapshot = await state();
      assert.equal(snapshot.invoiceRows.length, 1);
      return response.body;
    }],
    ['unparseable attachment is dead-lettered', async () => {
      await reset();
      const response = await postWebhook('invoice-email-intake', fixtures.invalidEmail, fixtures.invalidEmail.emailId);
      assert.equal(response.status, 422);
      const snapshot = await state();
      assert.equal(snapshot.deadLetters.length, 1);
      return { response: response.body, deadLetters: 1 };
    }],
  ],
};

if (require.main === module) runSuite(suite).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = suite;
