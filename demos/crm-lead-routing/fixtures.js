'use strict';

module.exports = {
  businessOne: { leadId: 'route-lead-0001', name: 'Aditi Demo', email: 'aditi@northstar.example', company: 'Northstar Demo', receivedAt: '2026-10-19T05:00:00.000Z' },
  businessTwo: { leadId: 'route-lead-0002', name: 'Dev Demo', email: 'dev@cedar.example', company: 'Cedar Demo', receivedAt: '2026-10-19T06:00:00.000Z' },
  afterHours: { leadId: 'route-lead-0003', name: 'Mira Demo', email: 'mira@lakeview.example', company: 'Lakeview Demo', receivedAt: '2026-10-19T15:00:00.000Z' },
  invalid: { leadId: 'x', name: '', email: 'bad', receivedAt: 'not-a-date' },
};
