import http from 'node:http';
import { randomUUID } from 'node:crypto';

const host = process.env.MOCK_HOST || '127.0.0.1';
const port = Number(process.env.MOCK_PORT || 3011);
const expectedBearer = process.env.MOCK_GHL_BEARER || 'mock-bearer-for-local-tests';
const defaultSearchLagMs = Math.max(0, Number(process.env.MOCK_SEARCH_LAG_MS || '3000'));
const locationId = 'loc_reference_lab';
const pipelineId = 'pipeline_reference_lead_intake';
const stageId = 'stage_new_api_intake';

const state = {
  contacts: [], opportunities: [], tasks: [], ledgers: new Map(), deadLetters: [], alerts: [],
  calls: [], failures: new Map(), authMode: 'normal', nativeWorkflowMode: 'published',
  ignoredUpsertField: null, searchLagMs: defaultSearchLagMs, persistedCreateStatus: null, sequence: 0,
  contactSearchVisibleAt: new Map(), opportunitySearchVisibleAt: new Map(),
};

function reset() {
  state.contacts = [];
  state.opportunities = [];
  state.tasks = [];
  state.ledgers = new Map();
  state.deadLetters = [];
  state.alerts = [];
  state.calls = [];
  state.failures = new Map();
  state.authMode = 'normal';
  state.nativeWorkflowMode = 'published';
  state.ignoredUpsertField = null;
  state.searchLagMs = defaultSearchLagMs;
  state.persistedCreateStatus = null;
  state.sequence = 0;
  state.contactSearchVisibleAt = new Map();
  state.opportunitySearchVisibleAt = new Map();
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return null; }
}

function publicState() {
  return {
    contacts: state.contacts,
    opportunities: state.opportunities,
    tasks: state.tasks,
    ledgers: [...state.ledgers.values()],
    deadLetters: state.deadLetters,
    alerts: state.alerts,
    calls: state.calls,
    scenario: {
      authMode: state.authMode,
      nativeWorkflowMode: state.nativeWorkflowMode,
      ignoredUpsertField: state.ignoredUpsertField,
      searchLagMs: state.searchLagMs,
      persistedCreateStatus: state.persistedCreateStatus,
    },
  };
}

function callKey(method, pathname) {
  if (method === 'POST' && pathname === '/contacts/upsert') return 'contacts.upsert';
  if (method === 'POST' && pathname === '/opportunities/') return 'opportunities.create';
  if (method === 'GET' && pathname === '/opportunities/search') return 'opportunities.search';
  if (method === 'GET' && pathname === '/contacts/lookup') return 'contacts.lookup';
  return `${method} ${pathname}`;
}

function recordCall(req, pathname, status) {
  const authorization = req.headers.authorization || '';
  const url = new URL(req.url, `http://${req.headers.host}`);
  state.calls.push({
    method: req.method,
    path: pathname,
    status,
    query: Object.fromEntries(url.searchParams),
    headers: {
      authorizationPresent: authorization.startsWith('Bearer '),
      version: req.headers.version || null,
      accept: req.headers.accept || null,
      contentType: req.headers['content-type'] || null,
    },
  });
}

function errorShape(status, message) {
  if (status === 401) return { statusCode: 401, message: 'Invalid JWT', error: 'Unauthorized' };
  if (status === 403) return { statusCode: 403, message: 'Required scope is missing', error: 'Forbidden' };
  if (status === 422) return { statusCode: 422, message: Array.isArray(message) ? message : [message || 'request failed validation'], error: 'Unprocessable Entity' };
  if (status === 429) return { statusCode: 429, message: 'Too Many Requests', error: 'Too Many Requests' };
  return { statusCode: status, message: message || 'Temporary upstream failure', error: 'Service Unavailable' };
}

function rateHeaders(remaining = 24) {
  return {
    'x-ratelimit-limit-daily': '10000',
    'x-ratelimit-daily-remaining': '9999',
    'x-ratelimit-interval-milliseconds': '10000',
    'x-ratelimit-max': '25',
    'x-ratelimit-remaining': String(remaining),
  };
}

function requireGhlHeaders(req, res, pathname) {
  const rejectedStatus = state.authMode === 'reject403' ? 403 : state.authMode === 'reject401' || state.authMode === 'reject' ? 401 : null;
  const authorized = rejectedStatus === null && req.headers.authorization === `Bearer ${expectedBearer}`;
  const versioned = req.headers.version === '2021-07-28';
  if (!authorized) {
    const status = rejectedStatus || 401;
    recordCall(req, pathname, status);
    json(res, status, errorShape(status));
    return false;
  }
  if (!versioned) {
    recordCall(req, pathname, 422);
    json(res, 422, errorShape(422, 'Version header must be 2021-07-28'));
    return false;
  }
  return true;
}

function injectedFailure(req, res, pathname) {
  const key = callKey(req.method, pathname);
  const queue = state.failures.get(key) || [];
  if (!queue.length) return false;
  const status = Number(queue.shift());
  state.failures.set(key, queue);
  recordCall(req, pathname, status);
  if (status === 429) {
    json(res, status, errorShape(status), { ...rateHeaders(0), 'retry-after': '0' });
  } else {
    json(res, status, errorShape(status), rateHeaders());
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true, service: 'ghl-local-mock' });
  if (req.method === 'POST' && pathname === '/admin/reset') { reset(); return json(res, 200, { ok: true }); }
  if (req.method === 'GET' && pathname === '/admin/state') return json(res, 200, publicState());
  if (req.method === 'POST' && pathname === '/admin/scenario') {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: 'INVALID_JSON' });
    if (body.authMode) state.authMode = body.authMode;
    if (body.nativeWorkflowMode) state.nativeWorkflowMode = body.nativeWorkflowMode;
    if (Object.hasOwn(body, 'ignoredUpsertField')) state.ignoredUpsertField = body.ignoredUpsertField;
    if (Object.hasOwn(body, 'searchLagMs')) state.searchLagMs = Math.max(0, Number(body.searchLagMs) || 0);
    if (Object.hasOwn(body, 'persistedCreateStatus')) state.persistedCreateStatus = body.persistedCreateStatus === null ? null : Number(body.persistedCreateStatus);
    if (body.endpoint) state.failures.set(body.endpoint, Array.isArray(body.statuses) ? [...body.statuses] : []);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/state/claim') {
    const body = await readJson(req);
    const existing = state.ledgers.get(body?.eventId);
    if (existing && existing.payloadHash !== body.payloadHash) return json(res, 409, { claim: 'conflict', ledger: existing });
    if (existing?.status === 'completed') return json(res, 200, { claim: 'completed', ledger: existing, result: existing.result });
    if (existing) return json(res, 200, { claim: 'resume', ledger: existing });
    const now = new Date().toISOString();
    const ledger = { eventId: body.eventId, payloadHash: body.payloadHash, status: 'received', attempts: 0, lastStatus: null, createdAt: now, updatedAt: now };
    state.ledgers.set(body.eventId, ledger);
    return json(res, 201, { claim: 'new', ledger });
  }
  if (req.method === 'POST' && pathname === '/state/checkpoint') {
    const body = await readJson(req);
    const ledger = state.ledgers.get(body?.eventId);
    if (!ledger) return json(res, 404, { error: 'LEDGER_NOT_FOUND' });
    Object.assign(ledger, body.patch || {}, { updatedAt: new Date().toISOString() });
    return json(res, 200, { ok: true, ledger });
  }
  if (req.method === 'POST' && pathname === '/state/complete') {
    const body = await readJson(req);
    const ledger = state.ledgers.get(body?.eventId);
    if (!ledger) return json(res, 404, { error: 'LEDGER_NOT_FOUND' });
    Object.assign(ledger, { status: 'completed', result: body.result, updatedAt: new Date().toISOString() });
    return json(res, 200, { ok: true, workflowResponse: body.result });
  }
  if (req.method === 'POST' && pathname === '/state/dead-letters') {
    const body = await readJson(req);
    const existing = state.deadLetters.find(item => item.eventId === body?.eventId && item.status === 'open');
    const item = existing || { id: `dl_${String(++state.sequence).padStart(4, '0')}`, status: 'open', createdAt: new Date().toISOString(), ...body };
    if (!existing) state.deadLetters.push(item);
    const ledger = state.ledgers.get(body?.eventId);
    if (ledger) Object.assign(ledger, { status: 'dead_letter', attempts: body.attempts, lastStatus: body.lastStatus, updatedAt: new Date().toISOString() });
    return json(res, 201, { deadLetter: item, workflowResponse: body.workflowResponse });
  }
  if (req.method === 'POST' && pathname === '/state/alerts') {
    const body = await readJson(req);
    const key = `${body?.type}:${body?.eventId}`;
    let item = state.alerts.find(alert => alert.key === key);
    if (!item) {
      item = { id: `alert_${String(++state.sequence).padStart(4, '0')}`, key, createdAt: new Date().toISOString(), ...body };
      state.alerts.push(item);
    }
    return json(res, 201, { alert: item, workflowResponse: body?.workflowResponse });
  }

  const isGhl = pathname.startsWith('/contacts') || pathname.startsWith('/opportunities');
  if (isGhl && !requireGhlHeaders(req, res, pathname)) return;
  if (isGhl && injectedFailure(req, res, pathname)) return;

  if (req.method === 'GET' && pathname === '/opportunities/pipelines') {
    if (url.searchParams.get('locationId') !== locationId) { recordCall(req, pathname, 422); return json(res, 422, errorShape(422, 'locationId is invalid')); }
    recordCall(req, pathname, 200);
    return json(res, 200, { pipelines: [{ id: pipelineId, name: 'Reference Lead Intake', stages: [{ id: stageId, name: 'New - API Intake', position: 0, showInFunnel: true, showInPieChart: true }] }] }, rateHeaders());
  }

  if (req.method === 'GET' && pathname === '/contacts/lookup') {
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    const phone = (url.searchParams.get('phone') || '').trim();
    if ((!email && !phone) || (email && phone) || url.searchParams.get('locationId') !== locationId) {
      recordCall(req, pathname, 422);
      return json(res, 422, errorShape(422, 'provide exactly one of email or phone and a valid locationId'));
    }
    const now = Date.now();
    const contact = state.contacts.find(item =>
      (state.contactSearchVisibleAt.get(item.id) || 0) <= now &&
      ((email && item.email === email) || (phone && item.phone === phone)));
    recordCall(req, pathname, contact ? 200 : 404);
    if (!contact) return json(res, 404, { statusCode: 404, message: 'Contact not found' }, rateHeaders());
    return json(res, 200, { contact }, rateHeaders());
  }

  if (req.method === 'POST' && pathname === '/contacts/upsert') {
    const body = await readJson(req);
    if (!body || body.locationId !== locationId || !body.firstName || (!body.email && !body.phone) || body.createNewIfDuplicateAllowed !== false) {
      recordCall(req, pathname, 422);
      return json(res, 422, errorShape(422, 'invalid contact upsert payload'));
    }
    const email = (body.email || '').trim().toLowerCase();
    const phone = (body.phone || '').trim();
    let contact = state.contacts.find(item => (email && item.email === email) || (phone && item.phone === phone));
    const isNew = !contact;
    if (!contact) {
      contact = { id: `contact_${String(state.contacts.length + 1).padStart(4, '0')}` };
      state.contacts.push(contact);
      state.contactSearchVisibleAt.set(contact.id, Date.now() + state.searchLagMs);
    }
    const written = { locationId, firstName: body.firstName, lastName: body.lastName || '', email: email || null, phone: phone || null, companyName: body.companyName || '', source: body.source || '' };
    if (state.ignoredUpsertField && Object.hasOwn(written, state.ignoredUpsertField)) delete written[state.ignoredUpsertField];
    Object.assign(contact, written);
    recordCall(req, pathname, 200);
    return json(res, 200, { contact, new: isNew }, rateHeaders());
  }

  if (req.method === 'GET' && pathname === '/opportunities/search') {
    const queryNames = [
      ['locationId', 'location_id'],
      ['pipelineId', 'pipeline_id'],
      ['contactId', 'contact_id'],
    ];
    const messages = [];
    for (const [camel] of queryNames) if (url.searchParams.has(camel)) messages.push(`property ${camel} should not exist`);
    for (const [, snake] of queryNames) if (!url.searchParams.get(snake)) messages.push(`${snake} should not be empty`);
    if (messages.length) {
      recordCall(req, pathname, 422);
      return json(res, 422, errorShape(422, messages), rateHeaders());
    }
    if (url.searchParams.get('location_id') !== locationId) {
      recordCall(req, pathname, 422);
      return json(res, 422, errorShape(422, 'location_id is invalid'), rateHeaders());
    }
    const now = Date.now();
    const items = state.opportunities.filter(item =>
      (state.opportunitySearchVisibleAt.get(item.id) || 0) <= now &&
      item.locationId === url.searchParams.get('location_id') &&
      item.pipelineId === url.searchParams.get('pipeline_id') &&
      item.contactId === url.searchParams.get('contact_id') &&
      item.status === (url.searchParams.get('status') || 'open'));
    recordCall(req, pathname, 200);
    return json(res, 200, { opportunities: items, meta: { total: items.length, currentPage: 1, nextPage: null, prevPage: null } }, rateHeaders());
  }

  if (req.method === 'POST' && pathname === '/opportunities/') {
    const body = await readJson(req);
    if (!body || body.locationId !== locationId || body.pipelineId !== pipelineId || body.pipelineStageId !== stageId || !body.contactId || body.status !== 'open') {
      recordCall(req, pathname, 422);
      return json(res, 422, errorShape(422, 'invalid opportunity payload'));
    }
    const opportunity = { id: `opportunity_${String(state.opportunities.length + 1).padStart(4, '0')}`, locationId, pipelineId, pipelineStageId: stageId, contactId: body.contactId, name: body.name, status: 'open' };
    state.opportunities.push(opportunity);
    state.opportunitySearchVisibleAt.set(opportunity.id, Date.now() + state.searchLagMs);
    if (state.nativeWorkflowMode === 'published') {
      state.tasks.push({ id: `task_${String(state.tasks.length + 1).padStart(4, '0')}`, contactId: body.contactId, title: 'Native workflow evidence', completed: false });
    }
    const responseStatus = state.persistedCreateStatus || 201;
    state.persistedCreateStatus = null;
    recordCall(req, pathname, responseStatus);
    if (responseStatus >= 200 && responseStatus < 300) return json(res, responseStatus, { opportunity }, rateHeaders());
    return json(res, responseStatus, errorShape(responseStatus, 'Write outcome was not returned'), rateHeaders());
  }

  const contactMatch = pathname.match(/^\/contacts\/([^/]+)$/);
  if (req.method === 'GET' && contactMatch) {
    const contact = state.contacts.find(item => item.id === contactMatch[1]);
    recordCall(req, pathname, contact ? 200 : 404);
    return contact ? json(res, 200, { contact }, rateHeaders()) : json(res, 404, { statusCode: 404, message: 'Contact not found' });
  }
  const opportunityMatch = pathname.match(/^\/opportunities\/([^/]+)$/);
  if (req.method === 'GET' && opportunityMatch) {
    const opportunity = state.opportunities.find(item => item.id === opportunityMatch[1]);
    recordCall(req, pathname, opportunity ? 200 : 404);
    return opportunity ? json(res, 200, { opportunity }, rateHeaders()) : json(res, 404, { statusCode: 404, message: 'Opportunity not found' });
  }
  const taskMatch = pathname.match(/^\/contacts\/([^/]+)\/tasks$/);
  if (req.method === 'GET' && taskMatch) {
    const tasks = state.tasks.filter(item => item.contactId === taskMatch[1]);
    recordCall(req, pathname, 200);
    return json(res, 200, { tasks }, rateHeaders());
  }

  json(res, 404, { statusCode: 404, message: 'Not found' });
});

server.listen(port, host, () => console.log(`GHL local mock listening on http://${host}:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) signal && process.on(signal, () => server.close(() => process.exit(0)));
