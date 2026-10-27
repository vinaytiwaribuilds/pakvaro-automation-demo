import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.dirname(here);
const evidencePath = path.join(demoDir, 'evidence', 'sandbox-run.txt');
const envPath = process.env.GHL_ENV_FILE;

if (!envPath) throw new Error('Set GHL_ENV_FILE to the credential file path. No default file is read.');

function parseEnv(text) {
  const values = {};
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('=');
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    let value = line.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const values = parseEnv(fs.readFileSync(envPath, 'utf8'));
const token = values.GHL_PIT;
const locationId = values.GHL_LOCATION_ID;
// Pipeline and stage IDs are not secrets, so they may also come from the process environment.
const pipelineId = values.GHL_PIPELINE_ID || process.env.GHL_PIPELINE_ID;
const stageId = values.GHL_PIPELINE_STAGE_ID || process.env.GHL_PIPELINE_STAGE_ID;
const baseUrl = values.GHL_BASE_URL || 'https://services.leadconnectorhq.com';
for (const [name, value] of Object.entries({ GHL_PIT: token, GHL_LOCATION_ID: locationId, GHL_PIPELINE_ID: pipelineId, GHL_PIPELINE_STAGE_ID: stageId })) {
  if (!value) throw new Error(`${name} is missing from the file selected by GHL_ENV_FILE`);
}

// 2021-07-28 is the API version verified against this sandbox on 23 Oct 2026 (GET /opportunities/pipelines -> 200).
const apiVersion = values.GHL_API_VERSION || process.env.GHL_API_VERSION || '2021-07-28';
const headers = { Authorization: `Bearer ${token}`, Version: apiVersion, Accept: 'application/json' };
async function api(method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { message: 'Non-JSON response' }; }
  if (!response.ok) throw new Error(`HighLevel ${method} ${route.split('?')[0]} returned HTTP ${response.status}: ${parsed?.message || parsed?.error || 'request failed'}`);
  return parsed;
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const label = `PAKVARO SYNTHETIC SANDBOX SMOKE ${suffix}`;
const syntheticEmail = `pakvaro-smoke-${suffix}@example.test`;
let contactId = null;
let opportunityId = null;
let verified = false;
let cleanup = { opportunity: 'not-created', contact: 'not-created' };
let failure = null;

console.log('Starting one synthetic HighLevel sandbox smoke record. Credential values are redacted.');
try {
  const contactResult = await api('POST', '/contacts/upsert', {
    locationId,
    firstName: 'Pakvaro',
    lastName: `Synthetic Smoke ${suffix}`,
    email: syntheticEmail,
    companyName: label,
    source: 'pakvaro-sandbox-smoke',
    createNewIfDuplicateAllowed: false,
  });
  const createdContactId = contactResult.contact?.id;
  if (!createdContactId || contactResult.new !== true) throw new Error('Smoke contact was not confirmed as newly created; no existing contact will be deleted.');
  contactId = createdContactId;

  const opportunityResult = await api('POST', '/opportunities/', {
    locationId,
    pipelineId,
    pipelineStageId: stageId,
    contactId,
    name: label,
    status: 'open',
  });
  opportunityId = opportunityResult.opportunity?.id;
  if (!opportunityId) throw new Error('Smoke opportunity creation did not return an ID.');

  const contactCheck = await api('GET', `/contacts/${encodeURIComponent(contactId)}`);
  // Read the opportunity back by its returned ID so verification does not depend on search-index visibility.
  const opportunityCheck = await api('GET', `/opportunities/${encodeURIComponent(opportunityId)}`);
  const created = opportunityCheck.opportunity || opportunityCheck;
  const exactOpportunity = created?.id === opportunityId && created?.pipelineStageId === stageId && created?.contactId === contactId;
  verified = contactCheck.contact?.id === contactId && exactOpportunity;
  if (!verified) throw new Error('Created records could not be verified in the configured pipeline and stage.');
} catch (error) {
  failure = error.message.replaceAll(token, '[REDACTED]');
} finally {
  if (opportunityId) {
    try { await api('DELETE', `/opportunities/${encodeURIComponent(opportunityId)}`); cleanup.opportunity = 'deleted'; }
    catch (error) { cleanup.opportunity = `delete-failed-http-safe: ${error.message.replaceAll(token, '[REDACTED]')}`; }
  }
  if (contactId) {
    try { await api('DELETE', `/contacts/${encodeURIComponent(contactId)}`); cleanup.contact = 'deleted'; }
    catch (error) { cleanup.contact = `delete-failed-http-safe: ${error.message.replaceAll(token, '[REDACTED]')}`; }
  }
}

const summary = [
  'HighLevel sandbox smoke (redacted)',
  `Run date: ${new Date().toISOString()}`,
  `Label: ${label}`,
  `Contact: ${contactId ? '[created-and-redacted]' : '[not-created]'}`,
  `Opportunity: ${opportunityId ? '[created-and-redacted]' : '[not-created]'}`,
  `Verified: ${verified}`,
  `Opportunity cleanup: ${cleanup.opportunity}`,
  `Contact cleanup: ${cleanup.contact}`,
  `Token: [REDACTED]`,
  `Location: [REDACTED]`,
  `Pipeline: [REDACTED]`,
  `Stage: [REDACTED]`,
  `Result: ${failure ? `FAIL - ${failure}` : cleanup.opportunity === 'deleted' && cleanup.contact === 'deleted' ? 'PASS' : 'FAIL - cleanup incomplete'}`,
  '',
];
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
fs.writeFileSync(evidencePath, summary.join('\n'), 'utf8');
console.log(`Redacted summary written to ${evidencePath}`);
if (failure || cleanup.opportunity !== 'deleted' || cleanup.contact !== 'deleted') process.exitCode = 1;
