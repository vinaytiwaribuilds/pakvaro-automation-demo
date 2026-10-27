'use strict';

const fixtures = require('./fixtures');
const { assert, admin, postWebhook, reset, runSuite, state } = require('../_shared/test-helpers');

const suite = {
  name: 'ecommerce-order-flow',
  demoDir: __dirname,
  tests: [
    ['valid order creates fulfilment and customer notification', async () => {
      await reset();
      const response = await postWebhook('ecommerce-order-flow', fixtures.normal, fixtures.normal.orderId);
      assert.equal(response.status, 200);
      assert.equal(response.body.remainingStock, 9);
      const snapshot = await state();
      assert.equal(snapshot.fulfilmentRows.length, 1);
      assert.equal(snapshot.customerNotifications.length, 1);
      return response.body;
    }],
    ['low remaining quantity sends stock alert', async () => {
      await reset();
      const response = await postWebhook('ecommerce-order-flow', fixtures.lowStock, fixtures.lowStock.orderId);
      assert.equal(response.status, 200);
      assert.equal(response.body.lowStock, true);
      const snapshot = await state();
      assert.equal(snapshot.alerts.at(-1).type, 'low_stock');
      return { response: response.body, alertType: 'low_stock' };
    }],
    ['duplicate order does not decrement or notify twice', async () => {
      await reset();
      const key = 'order-duplicate-0004';
      await postWebhook('ecommerce-order-flow', fixtures.lowStock, key);
      await postWebhook('ecommerce-order-flow', fixtures.lowStock, key);
      const snapshot = await state();
      assert.equal(snapshot.inventory['SKU-TOTE'], 2);
      assert.equal(snapshot.fulfilmentRows.length, 1);
      assert.equal(snapshot.customerNotifications.length, 1);
      assert.equal(snapshot.alerts.filter(item => item.type === 'low_stock').length, 1);
      return { remaining: 2, fulfilmentRows: 1, notifications: 1, lowStockAlerts: 1 };
    }],
    ['customer notification retries after a transient failure', async () => {
      await reset();
      await admin('/admin/service-failures', 'POST', { service: 'customer-notification', count: 1 });
      const response = await postWebhook('ecommerce-order-flow', fixtures.normal, 'order-retry-0005');
      assert.equal(response.status, 200);
      const snapshot = await state();
      assert.equal(snapshot.customerNotifications.length, 1);
      return response.body;
    }],
    ['insufficient stock is dead-lettered', async () => {
      await reset();
      const response = await postWebhook('ecommerce-order-flow', fixtures.unavailable, fixtures.unavailable.orderId);
      assert.equal(response.status, 409);
      assert.equal(response.body.error, 'INSUFFICIENT_STOCK');
      const snapshot = await state();
      assert.equal(snapshot.deadLetters.length, 1);
      assert.equal(snapshot.customerNotifications.length, 0);
      return { response: response.body, deadLetters: 1 };
    }],
  ],
};

if (require.main === module) runSuite(suite).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = suite;
