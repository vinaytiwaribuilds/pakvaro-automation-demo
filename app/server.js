'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const HOST = process.env.MOCK_HOST || '127.0.0.1';
const PORT = Number(process.env.MOCK_PORT || 3001);
const API_KEY = process.env.MOCK_API_KEY || 'demo-local-key';
const DATA_DIR = process.env.MOCK_DATA_DIR || path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

fs.mkdirSync(DATA_DIR, { recursive: true });

const state = {
  leadsByKey: new Map(),
  alerts: [],
  alertsByKey: new Map(),
  followUps: [],
  deadLetters: [],
  workflowErrors: [],
  crmFailuresRemaining: 0,
  serviceFailures: new Map(),
  inquiryAcksByKey: new Map(),
  inquiryAlertsByKey: new Map(),
  inquiryReplies: new Set(),
  inquiryRemindersByKey: new Map(),
  invoiceRowsByKey: new Map(),
  invoiceBusinessKeys: new Set(),
  fulfilmentByKey: new Map(),
  customerNotificationsByKey: new Map(),
  inventory: new Map([['SKU-TOTE', 5], ['SKU-LAMP', 10], ['SKU-MUG', 3]]),
  inventoryUpdatesByKey: new Map(),
  crmDemoLeadsByKey: new Map(),
  routeAssignmentsByKey: new Map(),
  crmRouteIndex: 0,
  dailySummaries: [],
};

const INITIAL_INVENTORY = { 'SKU-TOTE': 5, 'SKU-LAMP': 10, 'SKU-MUG': 3 };

function idempotencyKey(req) {
  const value = req.headers['x-idempotency-key'];
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,100}$/.test(value) ? value : null;
}

function failIfConfigured(service, res, extra = {}) {
  const remaining = state.serviceFailures.get(service) || 0;
  if (remaining <= 0) return false;
  state.serviceFailures.set(service, remaining - 1);
  appendEvent('service.simulated_5xx', { service, failuresRemaining: remaining - 1 });
  send(res, 503, { ok: false, error: 'SIMULATED_SERVICE_UNAVAILABLE', service, failuresRemaining: remaining - 1, ...extra });
  return true;
}

function putIdempotent(map, key, factory) {
  const existing = map.get(key);
  if (existing) return { duplicate: true, record: existing };
  const record = factory();
  map.set(key, record);
  return { duplicate: false, record };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function appendEvent(type, data) {
  const event = { at: new Date().toISOString(), type, data };
  fs.appendFileSync(EVENTS_FILE, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) {
      const error = new Error('Request body exceeds 256 KiB');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function requireKey(req, res) {
  if (req.headers['x-demo-key'] !== API_KEY) {
    send(res, 401, { ok: false, error: 'UNAUTHORISED' });
    return false;
  }
  return true;
}

function publicState() {
  return {
    leads: [...state.leadsByKey.values()],
    alerts: state.alerts,
    followUps: state.followUps,
    deadLetters: state.deadLetters,
    workflowErrors: state.workflowErrors,
    crmFailuresRemaining: state.crmFailuresRemaining,
    serviceFailures: Object.fromEntries(state.serviceFailures),
    inquiryAcks: [...state.inquiryAcksByKey.values()],
    inquiryAlerts: [...state.inquiryAlertsByKey.values()],
    inquiryReplies: [...state.inquiryReplies],
    inquiryReminders: [...state.inquiryRemindersByKey.values()],
    invoiceRows: [...state.invoiceRowsByKey.values()],
    fulfilmentRows: [...state.fulfilmentByKey.values()],
    customerNotifications: [...state.customerNotificationsByKey.values()],
    inventory: Object.fromEntries(state.inventory),
    inventoryUpdates: [...state.inventoryUpdatesByKey.values()],
    crmDemoLeads: [...state.crmDemoLeadsByKey.values()],
    routeAssignments: [...state.routeAssignmentsByKey.values()],
    crmRouteIndex: state.crmRouteIndex,
    dailySummaries: state.dailySummaries,
  };
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, service: 'pakvaro-local-mocks' });
  }

  if (!requireKey(req, res)) return;

  if (req.method === 'POST' && url.pathname === '/admin/reset') {
    state.leadsByKey.clear();
    state.alerts.length = 0;
    state.alertsByKey.clear();
    state.followUps.length = 0;
    state.deadLetters.length = 0;
    state.workflowErrors.length = 0;
    state.crmFailuresRemaining = 0;
    state.serviceFailures.clear();
    state.inquiryAcksByKey.clear();
    state.inquiryAlertsByKey.clear();
    state.inquiryReplies.clear();
    state.inquiryRemindersByKey.clear();
    state.invoiceRowsByKey.clear();
    state.invoiceBusinessKeys.clear();
    state.fulfilmentByKey.clear();
    state.customerNotificationsByKey.clear();
    state.inventory = new Map(Object.entries(INITIAL_INVENTORY));
    state.inventoryUpdatesByKey.clear();
    state.crmDemoLeadsByKey.clear();
    state.routeAssignmentsByKey.clear();
    state.crmRouteIndex = 0;
    state.dailySummaries.length = 0;
    fs.writeFileSync(EVENTS_FILE, '', 'utf8');
    appendEvent('admin.reset', {});
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/admin/crm-failures') {
    const body = await readJson(req);
    const count = Number(body.count);
    if (!Number.isInteger(count) || count < 0 || count > 100) {
      return send(res, 400, { ok: false, error: 'count must be an integer from 0 to 100' });
    }
    state.crmFailuresRemaining = count;
    appendEvent('admin.crm_failures_configured', { count });
    return send(res, 200, { ok: true, count });
  }

  if (req.method === 'POST' && url.pathname === '/admin/service-failures') {
    const body = await readJson(req);
    const service = String(body.service || '');
    const count = Number(body.count);
    if (!/^[a-z-]{3,40}$/.test(service) || !Number.isInteger(count) || count < 0 || count > 10) {
      return send(res, 400, { ok: false, error: 'service and count (0..10) are required' });
    }
    state.serviceFailures.set(service, count);
    appendEvent('admin.service_failures_configured', { service, count });
    return send(res, 200, { ok: true, service, count });
  }

  if (req.method === 'POST' && url.pathname === '/admin/inquiry-reply') {
    const body = await readJson(req);
    if (typeof body.idempotencyKey !== 'string') return send(res, 400, { ok: false, error: 'idempotencyKey is required' });
    state.inquiryReplies.add(body.idempotencyKey);
    appendEvent('inquiry.reply_recorded', { idempotencyKey: body.idempotencyKey });
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/admin/state') {
    return send(res, 200, { ok: true, ...publicState() });
  }

  if (req.method === 'POST' && url.pathname === '/messages/acknowledgements') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    if (failIfConfigured('inquiry-ack', res, { input: body, idempotencyKey: key })) return;
    const result = putIdempotent(state.inquiryAcksByKey, key, () => ({ messageId: `msg_${randomUUID()}`, createdAt: new Date().toISOString(), ...body, idempotencyKey: key }));
    appendEvent(result.duplicate ? 'inquiry.ack_duplicate' : 'inquiry.ack_sent', { idempotencyKey: key });
    return send(res, result.duplicate ? 200 : 201, { ok: true, duplicate: result.duplicate, record: result.record, input: body, idempotencyKey: key });
  }

  if (req.method === 'POST' && url.pathname === '/inquiries/owner-alerts') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    const result = putIdempotent(state.inquiryAlertsByKey, key, () => ({ alertId: `inqalert_${randomUUID()}`, createdAt: new Date().toISOString(), ...body, idempotencyKey: key }));
    appendEvent(result.duplicate ? 'inquiry.owner_alert_duplicate' : 'inquiry.owner_alert_sent', { idempotencyKey: key });
    return send(res, result.duplicate ? 200 : 201, { ok: true, duplicate: result.duplicate, record: result.record, input: body, idempotencyKey: key });
  }

  if (req.method === 'GET' && url.pathname === '/inquiries/reply-status') {
    const key = url.searchParams.get('idempotencyKey');
    return send(res, 200, { ok: true, idempotencyKey: key, replied: state.inquiryReplies.has(key) });
  }

  if (req.method === 'POST' && url.pathname === '/inquiries/reminders') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    const result = putIdempotent(state.inquiryRemindersByKey, key, () => ({ reminderId: `rem_${randomUUID()}`, createdAt: new Date().toISOString(), ...body, idempotencyKey: key }));
    appendEvent(result.duplicate ? 'inquiry.reminder_duplicate' : 'inquiry.reminder_created', { idempotencyKey: key });
    return send(res, result.duplicate ? 200 : 201, { ok: true, duplicate: result.duplicate, record: result.record, workflowResponse: body.workflowResponse || null });
  }

  if (req.method === 'POST' && url.pathname === '/sheet/invoices') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    if (failIfConfigured('invoice-sheet', res, { input: body, idempotencyKey: key })) return;
    const businessKey = `${String(body.vendor || '').toLowerCase()}|${String(body.invoiceNumber || '').toLowerCase()}`;
    const businessDuplicate = state.invoiceBusinessKeys.has(businessKey);
    const result = putIdempotent(state.invoiceRowsByKey, key, () => ({ rowId: `invrow_${randomUUID()}`, createdAt: new Date().toISOString(), ...body, idempotencyKey: key, duplicate: businessDuplicate, overThreshold: Number(body.amount) > Number(body.threshold) }));
    if (!result.duplicate) state.invoiceBusinessKeys.add(businessKey);
    appendEvent(result.duplicate ? 'invoice.idempotent_duplicate' : 'invoice.row_appended', { idempotencyKey: key, businessDuplicate });
    return send(res, result.duplicate ? 200 : 201, { ok: true, duplicateRequest: result.duplicate, record: result.record, workflowResponse: { ok: true, rowId: result.record.rowId, invoiceNumber: result.record.invoiceNumber, duplicate: result.record.duplicate, overThreshold: result.record.overThreshold } });
  }

  if (req.method === 'POST' && url.pathname === '/fulfilment') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    const result = putIdempotent(state.fulfilmentByKey, key, () => ({ fulfilmentId: `ful_${randomUUID()}`, createdAt: new Date().toISOString(), status: 'ready', ...body, idempotencyKey: key }));
    appendEvent(result.duplicate ? 'order.fulfilment_duplicate' : 'order.fulfilment_created', { idempotencyKey: key });
    return send(res, result.duplicate ? 200 : 201, { ok: true, duplicate: result.duplicate, record: result.record, idempotencyKey: key });
  }

  if (req.method === 'POST' && url.pathname === '/inventory/decrement') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    const existing = state.inventoryUpdatesByKey.get(key);
    if (existing) return send(res, 200, { ok: true, duplicate: true, ...existing });
    const current = state.inventory.get(body.sku);
    if (!Number.isInteger(current)) return send(res, 404, { ok: false, error: 'SKU_NOT_FOUND', input: body, idempotencyKey: key });
    const remaining = current - Number(body.quantity);
    if (remaining < 0) return send(res, 409, { ok: false, error: 'INSUFFICIENT_STOCK', available: current, input: body, idempotencyKey: key });
    state.inventory.set(body.sku, remaining);
    const update = { idempotencyKey: key, sku: body.sku, quantity: Number(body.quantity), remaining, lowStock: remaining < Number(body.lowStockThreshold), order: body.order };
    state.inventoryUpdatesByKey.set(key, update);
    appendEvent('inventory.decremented', update);
    return send(res, 200, { ok: true, duplicate: false, ...update });
  }

  if (req.method === 'POST' && url.pathname === '/customer-notifications') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    if (failIfConfigured('customer-notification', res, { input: body, idempotencyKey: key })) return;
    const result = putIdempotent(state.customerNotificationsByKey, key, () => ({ notificationId: `notify_${randomUUID()}`, createdAt: new Date().toISOString(), ...body, idempotencyKey: key }));
    appendEvent(result.duplicate ? 'order.notification_duplicate' : 'order.customer_notified', { idempotencyKey: key });
    return send(res, result.duplicate ? 200 : 201, { ok: true, duplicate: result.duplicate, record: result.record, workflowResponse: body.workflowResponse });
  }

  if (req.method === 'POST' && url.pathname === '/routing/assign') {
    const body = await readJson(req);
    const existing = state.routeAssignmentsByKey.get(body.idempotencyKey);
    if (existing) return send(res, 200, { ok: true, duplicate: true, ...existing });
    const receivedAt = new Date(body.receivedAt);
    if (Number.isNaN(receivedAt.getTime())) return send(res, 400, { ok: false, error: 'INVALID_RECEIVED_AT' });
    const istHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(receivedAt));
    const istWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(receivedAt);
    const businessHours = !['Sat', 'Sun'].includes(istWeekday) && istHour >= 9 && istHour < 18;
    const owners = ['owner-a', 'owner-b'];
    const owner = businessHours ? owners[state.crmRouteIndex++ % owners.length] : 'after-hours-queue';
    const assignment = { owner, businessHours, receivedAt: body.receivedAt, lead: body.lead, idempotencyKey: body.idempotencyKey };
    state.routeAssignmentsByKey.set(body.idempotencyKey, assignment);
    appendEvent('crm.owner_assigned', { owner, businessHours, receivedAt: body.receivedAt });
    return send(res, 200, { ok: true, duplicate: false, ...assignment });
  }

  if (req.method === 'POST' && url.pathname === '/crm/demo-leads') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (!key) return send(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
    const result = putIdempotent(state.crmDemoLeadsByKey, key, () => ({ crmId: `routelead_${randomUUID()}`, createdAt: new Date().toISOString(), ...body, idempotencyKey: key }));
    appendEvent(result.duplicate ? 'crm.demo_lead_duplicate' : 'crm.demo_lead_created', { idempotencyKey: key });
    return send(res, result.duplicate ? 200 : 201, { ok: true, duplicate: result.duplicate, record: result.record, workflowResponse: { ok: true, duplicate: result.duplicate, crmId: result.record.crmId, owner: result.record.owner, businessHours: result.record.businessHours } });
  }

  if (req.method === 'GET' && url.pathname === '/crm/demo-summary') {
    const counts = {};
    for (const item of state.crmDemoLeadsByKey.values()) counts[item.owner] = (counts[item.owner] || 0) + 1;
    return send(res, 200, { ok: true, date: url.searchParams.get('date') || new Date().toISOString().slice(0, 10), total: state.crmDemoLeadsByKey.size, byOwner: counts });
  }

  if (req.method === 'POST' && url.pathname === '/crm/daily-summaries') {
    const body = await readJson(req);
    const summary = { summaryId: `summary_${randomUUID()}`, createdAt: new Date().toISOString(), ...body };
    state.dailySummaries.push(summary);
    appendEvent('crm.daily_summary_sent', summary);
    return send(res, 201, { ok: true, summary, workflowResponse: body.workflowResponse || body });
  }

  if (req.method === 'POST' && url.pathname === '/crm/leads') {
    const body = await readJson(req);
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
      return send(res, 400, {
        ok: false,
        error: 'INVALID_IDEMPOTENCY_KEY',
        input: body,
        idempotencyKey: idempotencyKey || null,
      });
    }

    if (state.crmFailuresRemaining > 0) {
      state.crmFailuresRemaining -= 1;
      appendEvent('crm.simulated_5xx', { idempotencyKey, failuresRemaining: state.crmFailuresRemaining });
      return send(res, 503, {
        ok: false,
        error: 'SIMULATED_CRM_UNAVAILABLE',
        failuresRemaining: state.crmFailuresRemaining,
        input: body,
        idempotencyKey,
      });
    }

    const existing = state.leadsByKey.get(idempotencyKey);
    if (existing) {
      appendEvent('crm.duplicate', { idempotencyKey, crmId: existing.crmId });
      return send(res, 200, {
        ok: true,
        duplicate: true,
        record: existing,
        input: body,
        idempotencyKey,
      });
    }

    const record = {
      crmId: `lead_${randomUUID()}`,
      idempotencyKey,
      createdAt: new Date().toISOString(),
      ...body,
    };
    state.leadsByKey.set(idempotencyKey, record);
    appendEvent('crm.created', { idempotencyKey, crmId: record.crmId });
    return send(res, 201, {
      ok: true,
      duplicate: false,
      record,
      input: body,
      idempotencyKey,
    });
  }

  if (req.method === 'POST' && url.pathname === '/alerts') {
    const body = await readJson(req);
    const key = idempotencyKey(req);
    if (key && state.alertsByKey.has(key)) {
      const existing = state.alertsByKey.get(key);
      appendEvent('alert.duplicate', { idempotencyKey: key, alertId: existing.alertId });
      return send(res, 200, { ok: true, duplicate: true, alertId: existing.alertId, workflowResponse: body.workflowResponse || null });
    }
    const alert = { alertId: `alert_${randomUUID()}`, createdAt: new Date().toISOString(), ...body };
    state.alerts.push(alert);
    if (key) state.alertsByKey.set(key, alert);
    appendEvent('alert.sent', alert);
    return send(res, 202, {
      ok: true,
      alertId: alert.alertId,
      workflowResponse: body.workflowResponse || null,
    });
  }

  if (req.method === 'POST' && url.pathname === '/follow-ups') {
    const body = await readJson(req);
    const followUp = { followUpId: `follow_${randomUUID()}`, createdAt: new Date().toISOString(), status: 'open', ...body };
    state.followUps.push(followUp);
    appendEvent('follow_up.created', followUp);
    return send(res, 201, {
      ok: true,
      followUpId: followUp.followUpId,
      workflowResponse: body.workflowResponse || null,
    });
  }

  if (req.method === 'POST' && url.pathname === '/dead-letters') {
    const body = await readJson(req);
    const deadLetter = {
      deadLetterId: `dlq_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      status: 'open',
      ...body,
    };
    state.deadLetters.push(deadLetter);
    appendEvent('dead_letter.recorded', deadLetter);
    return send(res, 201, {
      ok: true,
      deadLetter,
      workflowResponse: body.workflowResponse || {
        ok: false,
        error: 'CRM_WRITE_FAILED',
        message: 'The lead was saved to the dead-letter queue and the owner was alerted.',
        deadLetterId: deadLetter.deadLetterId,
        idempotencyKey: body.idempotencyKey,
        attempts: body.attempts,
      },
    });
  }

  if (req.method === 'POST' && url.pathname === '/workflow-errors') {
    const body = await readJson(req);
    const workflowError = {
      workflowErrorId: `wferr_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      ...body,
    };
    state.workflowErrors.push(workflowError);
    appendEvent('workflow_error.recorded', workflowError);
    return send(res, 201, { ok: true, workflowError });
  }

  return send(res, 404, { ok: false, error: 'NOT_FOUND' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    appendEvent('mock.unhandled_error', { message: error.message });
    send(res, error.statusCode || 500, { ok: false, error: error.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Mock CRM and alert server listening on http://${HOST}:${PORT}`);
  console.log(`Event log: ${EVENTS_FILE}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; stopping mock server.`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
