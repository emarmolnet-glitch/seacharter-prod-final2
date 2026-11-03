import { getUser, login, logout, onAuthChange } from '@netlify/identity';
import './tenant-settings.css';

const roles = { agent_pol: 'Agente POL', agent_pod: 'Agente POD', charterer: 'Charterer', owner: 'Owner', broker: 'Broker' };
const definitions = {
  profile: { title: 'Perfil de Empresa', fields: { company_name: 'Razón social', nif: 'NIF', address: 'Dirección fiscal', email: 'Email', phone: 'Teléfono', logo_url: 'URL del logo' } },
  'bank-accounts': { title: 'Datos Bancarios', fields: { bank_name: 'Banco', iban: 'IBAN', swift: 'SWIFT', currency: 'Divisa', beneficiary: 'Beneficiario' } },
  contacts: { title: 'Directorio de Colaboradores', fields: { role: 'Rol', company_name: 'Empresa', address: 'Dirección', email: 'Email', pic_name: 'Persona de contacto' } },
};
let data = null, active = 'profile', editing = null, busy = false, generation = 0;
const modal = document.createElement('dialog');
modal.id = 'company-settings';
modal.className = 'bg-white border border-slate-200 rounded-xl text-slate-800';
modal.setAttribute('aria-labelledby', 'company-settings-title');
modal.innerHTML = `<header><div><h2 id="company-settings-title" class="text-blue-900 font-black uppercase">Configuración de Empresa</h2><p class="settings-description">Datos privados de tu empresa · Editor GENCON</p></div><button type="button" data-close aria-label="Cerrar configuración">✕</button></header><nav role="tablist" aria-label="Configuración"></nav><div class="settings-content"><p id="settings-message" role="status" aria-live="polite"></p><div id="settings-body"></div></div>`;
document.body.append(modal);
const body = modal.querySelector('#settings-body');
const message = modal.querySelector('#settings-message');
function notify(text, error = false) { message.textContent = text; message.setAttribute('role', error ? 'alert' : 'status'); }
modal.querySelector('[data-close]').onclick = () => modal.close();
modal.addEventListener('click', e => { if (e.target === modal && (e.clientX < modal.getBoundingClientRect().left || e.clientX > modal.getBoundingClientRect().right || e.clientY < modal.getBoundingClientRect().top || e.clientY > modal.getBoundingClientRect().bottom)) modal.close(); });
async function api(path = '', method = 'GET', values) {
  await getUser();
  const response = await fetch(`/api/settings${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: values ? { 'Content-Type': 'application/json' } : {}, body: values ? JSON.stringify(values) : undefined });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'No se pudo cargar la configuración'); error.status = response.status; throw error; }
  return result;
}
function updateSelectors() {
  for (const select of document.querySelectorAll('[data-tenant-select]')) {
    const kind = select.dataset.tenantSelect;
    const records = kind === 'bank-accounts' ? data?.['bank-accounts'] || [] : (data?.contacts || []).filter(c => c.role === kind);
    const previous = select.value;
    select.replaceChildren(new Option(!data ? 'Abre Configuración de Empresa para iniciar sesión o reintentar' : records.length ? 'Seleccionar de mi empresa…' : 'Sin registros · Configuración de Empresa', ''));
    for (const row of records) select.add(new Option(kind === 'bank-accounts' ? `${row.bank_name} · ${row.currency} · ${row.iban.slice(-4)}` : row.company_name, row.id));
    select.value = records.some(row => row.id === previous) ? previous : '';
  }
}
async function refresh() {
  const version = ++generation;
  const result = await api();
  if (version !== generation) return false;
  data = result; updateSelectors(); return true;
}
function renderLogin() {
  modal.querySelector('nav').replaceChildren();
  body.innerHTML = `<p class="settings-description">Inicia sesión con tu cuenta para consultar y guardar los datos de tu empresa.</p><form id="settings-login"><div class="settings-grid"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label></div><button class="settings-save bg-emerald-600 hover:bg-emerald-700 text-white">Iniciar sesión</button></form>`;
  body.querySelector('form').onsubmit = async e => {
    e.preventDefault(); const form = e.currentTarget; const button = form.querySelector('button'); button.disabled = true;
    try { const values = new FormData(form); await login(values.get('email'), values.get('password')); form.reset(); await load(); }
    catch { notify('No se pudo iniciar sesión. Comprueba tus credenciales y la confirmación de tu email.', true); }
    finally { button.disabled = false; }
  };
}
function render() {
  const nav = modal.querySelector('nav'); nav.replaceChildren();
  for (const [key, def] of Object.entries(definitions)) {
    const button = document.createElement('button'); button.type = 'button'; button.role = 'tab'; button.id = `settings-tab-${key}`; button.setAttribute('aria-controls', 'settings-panel'); button.setAttribute('aria-selected', String(active === key)); button.textContent = def.title;
    button.onclick = () => { if (!busy) { active = key; editing = null; notify(''); render(); } }; nav.append(button);
  }
  body.replaceChildren();
  const panel = document.createElement('section'); panel.id = 'settings-panel'; panel.role = 'tabpanel'; panel.setAttribute('aria-labelledby', `settings-tab-${active}`); body.append(panel);
  const description = document.createElement('p'); description.className = 'settings-description'; description.textContent = 'Selecciona un registro para editarlo. Los cambios se aplican a los desplegables del editor.'; panel.append(description);
  if (active !== 'profile') {
    const list = document.createElement('div'); list.className = 'settings-records';
    for (const record of data[active]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = active === 'contacts' ? `${record.company_name} · ${roles[record.role]}` : `${record.bank_name} · ${record.currency} · …${record.iban.slice(-4)}`;
      button.onclick = () => { if (!busy) { editing = record; render(); } }; list.append(button);
    }
    if (!data[active].length) { const empty = document.createElement('p'); empty.textContent = 'Todavía no hay registros. Añade el primero con el formulario.'; list.append(empty); }
    panel.append(list);
    const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Nuevo registro'; add.onclick = () => { if (!busy) { editing = null; render(); } }; panel.append(add);
  }
  const form = document.createElement('form'), grid = document.createElement('div'); grid.className = 'settings-grid';
  const record = active === 'profile' ? data.profile || {} : editing || {};
  for (const [key, labelText] of Object.entries(definitions[active].fields)) {
    const label = document.createElement('label'); label.textContent = labelText;
    const input = document.createElement(key === 'role' ? 'select' : key === 'address' ? 'textarea' : 'input'); input.name = key;
    if (key === 'role') for (const [value, title] of Object.entries(roles)) input.add(new Option(title, value));
    else input.type = key === 'email' ? 'email' : key === 'logo_url' ? 'url' : 'text';
    input.value = record[key] || (key === 'currency' ? 'EUR' : key === 'role' ? 'agent_pol' : '');
    input.required = ['company_name', 'bank_name', 'iban', 'beneficiary', 'currency'].includes(key); input.maxLength = 2000;
    if (key === 'currency') { input.maxLength = 3; input.pattern = '[A-Z]{3}'; }
    label.append(input); grid.append(label);
  }
  form.append(grid);
  const save = document.createElement('button'); save.type = 'submit'; save.className = 'settings-save bg-emerald-600 hover:bg-emerald-700 text-white'; save.textContent = editing ? 'Guardar cambios' : 'Guardar'; form.append(save); panel.append(form);
  form.onsubmit = async e => {
    e.preventDefault(); if (busy) return; busy = true; save.disabled = true; notify('Guardando…');
    try {
      const values = Object.fromEntries(new FormData(form));
      await api(`/${active}${editing ? `/${editing.id}` : ''}`, active === 'profile' || editing ? 'PUT' : 'POST', values);
      if (await refresh()) { editing = null; render(); notify('Configuración guardada. Los desplegables GENCON están actualizados.'); }
    } catch (error) { notify(error.message, true); }
    finally { busy = false; save.disabled = false; }
  };
  const signout = document.createElement('button'); signout.type = 'button'; signout.textContent = 'Cerrar sesión de empresa'; signout.style.marginTop = '20px'; signout.onclick = async () => { if (busy) return; await logout(); data = null; generation++; updateSelectors(); renderLogin(); notify('Sesión cerrada.'); }; panel.append(signout);
}
async function load() {
  notify('Cargando configuración…'); body.replaceChildren();
  try { if (await refresh()) { editing = null; render(); notify(''); } }
  catch (error) { if (error.status === 401) { data = null; updateSelectors(); renderLogin(); notify(''); } else { notify(error.message, true); const retry = document.createElement('button'); retry.textContent = 'Reintentar'; retry.onclick = load; body.append(retry); } }
}
document.getElementById('company-settings-open')?.addEventListener('click', () => { window.closeMobileSessionMenu?.(); modal.showModal(); load(); });
document.addEventListener('change', e => {
  const select = e.target.closest('[data-tenant-select]'); if (!select || !data || !select.value) return;
  const kind = select.dataset.tenantSelect;
  const row = (kind === 'bank-accounts' ? data['bank-accounts'] : data.contacts).find(r => r.id === select.value);
  if (!row) return;
  const set = (id, value) => { const element = document.getElementById(id); if (element) element.value = value; };
  if (kind === 'bank-accounts') set('gc-bank', `Banking details: ${row.bank_name}\nIBAN: ${row.iban}\nSWIFT: ${row.swift}\nBEN: ${row.beneficiary}`);
  else if (kind === 'owner' || kind === 'charterer') { const prefix = kind === 'owner' ? 'gc-owner' : 'gc-chart'; set(`${prefix}-name`, row.company_name); set(`${prefix}-addr`, row.address); }
  else set(kind === 'agent_pol' ? 'gc-agent-load' : 'gc-agent-disch', [row.company_name, row.address, row.email, row.pic_name].filter(Boolean).join('\n'));
  window.syncGencon?.();
});
onAuthChange(() => { data = null; generation++; updateSelectors(); if (modal.open && !busy) load(); else refresh().catch(() => {}); });
refresh().catch(() => { data = null; updateSelectors(); });
document.addEventListener('click', e => { if (e.target.closest('[onclick*="gencon"]') && !modal.open) refresh().catch(() => { data = null; updateSelectors(); }); });
