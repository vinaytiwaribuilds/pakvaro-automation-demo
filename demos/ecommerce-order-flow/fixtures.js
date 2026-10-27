'use strict';

module.exports = {
  normal: { orderId: 'order-normal-0001', sku: 'SKU-LAMP', quantity: 1, customerEmail: 'buyer@demo.example', lowStockThreshold: 3 },
  lowStock: { orderId: 'order-low-0002', sku: 'SKU-TOTE', quantity: 3, customerEmail: 'shopper@demo.example', lowStockThreshold: 3 },
  unavailable: { orderId: 'order-stockout-03', sku: 'SKU-MUG', quantity: 4, customerEmail: 'casey@demo.example', lowStockThreshold: 2 },
  invalid: { orderId: 'x', sku: 'bad', quantity: 0, customerEmail: 'invalid' },
};
