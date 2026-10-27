'use strict';

module.exports = {
  validLead: {
    name: 'Aarav Demo',
    company: 'Northstar Kitchens',
    email: '  AARAV@NORTHSTAR.EXAMPLE ',
    phone: '+1 212 555 0101',
    budget: 125000,
    timelineDays: 21,
    source: 'website',
    message: 'Need workflow automation and CRM integration.',
  },
  invalidLead: {
    name: 'A',
    email: 'not-an-email',
    phone: '123',
    budget: -5,
  },
  recoveryLead: {
    name: 'Meera Demo',
    company: 'Lakeview Components',
    email: 'meera@lakeview.example',
    phone: '+1 212 555 0102',
    budget: 70000,
    timelineDays: 45,
    source: 'referral',
    message: 'Need an integration workflow.',
  },
  deadLetterLead: {
    name: 'Kabir Demo',
    company: 'Cedar Labs',
    email: 'kabir@cedar.example',
    phone: '+1-212-555-0103',
    budget: 50000,
    timelineDays: 60,
    source: 'demo',
    message: 'Need lead routing automation.',
  },
};
