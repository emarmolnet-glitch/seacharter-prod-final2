import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../netlify/functions/settings.mts', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
function harness(user = { id: 'tenant-a' }) {
  const calls = [];
  const tables = Object.fromEntries(['tenantProfiles', 'tenantBankAccounts', 'tenantContacts'].map(name => [name, { name, id: `${name}.id`, tenant_id: `${name}.tenant_id`, bank_name: 'bank_name', company_name: 'company_name' }]));
  const db = {
    select() { return { from(table) { return { where(condition) { calls.push({ action: 'select', table, condition }); const rows = []; rows.orderBy = () => []; return rows; } }; } }; },
    insert(table) { return { values(data) { calls.push({ action: 'insert', table, data }); return { onConflictDoNothing: async () => {}, onConflictDoUpdate() { return { returning: async () => [data] }; }, returning: async () => [data] }; } }; },
    update(table) { return { set(data) { return { where(condition) { calls.push({ action: 'update', table, data, condition }); return { returning: async () => [] }; } }; } }; },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, Response, URL, require(name) {
    if (name === '@netlify/identity') return { getUser: async () => user };
    if (name === 'drizzle-orm/netlify-db') return { drizzle: () => db };
    if (name === 'drizzle-orm') return { eq: (column, value) => ({ column, value }), and: (...conditions) => conditions };
    if (name.includes('schema')) return tables;
    return require(name);
  } });
  return { handler: module.exports.default, calls };
}
const request = (path = '', method = 'GET', data, extraHeaders = {}) => new Request(`https://example.com/api/settings${path}`, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, body: data ? JSON.stringify(data) : undefined });
const contact = { role: 'owner', company_name: 'Naviera del Estrecho', address: 'Cádiz', email: 'ops@example.com', pic_name: 'Operaciones' };
test('anonymous requests cannot read or write settings', async () => {
  const { handler, calls } = harness(null);
  for (const req of [request(), request('/contacts', 'POST', contact)]) assert.equal((await handler(req)).status, 401);
  assert.equal(calls.length, 0);
});
test('all settings queries are scoped to authenticated tenant', async () => {
  const { handler, calls } = harness();
  const response = await handler(request()); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(calls.length, 3); for (const call of calls) assert.equal(call.condition.value, 'tenant-a');
});
test('contact creation assigns tenant on server and rejects tenant overrides and invalid roles', async () => {
  const { handler, calls } = harness();
  assert.equal((await handler(request('/contacts', 'POST', { ...contact, tenant_id: 'tenant-b' }))).status, 400);
  assert.equal((await handler(request('/contacts', 'POST', { ...contact, role: 'admin' }))).status, 400);
  assert.equal(calls.length, 0);
  const response = await handler(request('/contacts', 'POST', contact)); assert.equal(response.status, 201);
  assert.equal((await response.json()).tenant_id, 'tenant-a');
});
test('updates require matching tenant and record ID; foreign or missing records return 404', async () => {
  const { handler, calls } = harness(); const id = '340e13d1-63ce-4058-9cc6-5be069282884';
  assert.equal((await handler(request(`/contacts/${id}`, 'PUT', contact))).status, 404);
  const update = calls.find(c => c.action === 'update');
  assert.equal(update.condition[0].value, 'tenant-a'); assert.equal(update.condition[1].value, id);
});
test('invalid routes, IDs, origins, and malformed bank accounts are rejected', async () => {
  const { handler } = harness();
  assert.equal((await handler(request('/contacts/no-id', 'PUT', contact))).status, 400);
  assert.equal((await handler(request('/contacts', 'POST', contact, { Origin: 'https://elsewhere.example' }))).status, 403);
  assert.equal((await handler(request('/other'))).status, 404);
  assert.equal((await handler(request('/bank-accounts', 'POST', { bank_name: 'Banco', iban: 'invalid', swift: '', currency: 'EUR', beneficiary: 'Naviera' }))).status, 400);
});

const frontendSource = readFileSync(new URL('../src/tenant-settings.js', import.meta.url), 'utf8');
function applySelection(kind, row) {
  const fields = Object.fromEntries(['gc-bank', 'gc-agent-load', 'gc-agent-disch', 'gc-owner-name', 'gc-owner-addr', 'gc-chart-name', 'gc-chart-addr'].map(id => [id, { value: '' }]));
  let onChange, synced = 0;
  const document = { addEventListener: (event, callback) => { onChange = callback; }, getElementById: id => fields[id] };
  const listener = frontendSource.slice(frontendSource.indexOf("document.addEventListener('change'"), frontendSource.indexOf('onAuthChange(()'));
  const data = { 'bank-accounts': kind === 'bank-accounts' ? [row] : [], contacts: kind === 'bank-accounts' ? [] : [row] };
  new Function('document', 'data', 'window', listener)(document, data, { syncGencon: () => synced++ });
  onChange({ target: { closest: () => ({ dataset: { tenantSelect: kind }, value: row.id }) } });
  return { fields, synced };
}
test('GENCON bank selection formats Box 14 and synchronizes policy', () => {
  const row = { id: 'bank-1', bank_name: 'Banco Atlántico', iban: 'ES9121000418450200051332', swift: 'CAIXESBBXXX', beneficiary: 'Naviera del Estrecho' };
  const { fields, synced } = applySelection('bank-accounts', row);
  assert.equal(fields['gc-bank'].value, `Banking details: ${row.bank_name}\nIBAN: ${row.iban}\nSWIFT: ${row.swift}\nBEN: ${row.beneficiary}`);
  assert.equal(synced, 1);
});
test('GENCON POL/POD and owner/charterer selections populate correct boxes', () => {
  for (const kind of ['agent_pol', 'agent_pod', 'owner', 'charterer']) {
    const row = { ...contact, id: 'contact-1', role: kind };
    const { fields, synced } = applySelection(kind, row);
    if (kind.startsWith('agent_')) {
      const target = kind === 'agent_pol' ? 'gc-agent-load' : 'gc-agent-disch';
      assert.equal(fields[target].value, [row.company_name, row.address, row.email, row.pic_name].join('\n'));
    } else {
      const prefix = kind === 'owner' ? 'gc-owner' : 'gc-chart';
      assert.equal(fields[`${prefix}-name`].value, row.company_name);
      assert.equal(fields[`${prefix}-addr`].value, row.address);
    }
    assert.equal(synced, 1);
  }
});
