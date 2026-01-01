/* SkuldKoll – Release med förbättringar:
   - Per person-summering
   - Påminnelser/notiser för obetalda skulder
   - Kategorier
   - PIN-lås
   - Ingen geolokalisering (endast manuell plats-text)
*/

const $$ = (sel, root = document) => root.querySelector(sel);
const $$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const $ = $$;
const fmtCurrency = (n) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(Number(n || 0));
const fmtDateTime = (dateStr, timeStr) => {
  try {
    const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
    return d.toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return `${dateStr} ${timeStr || ''}`.trim(); }
};

// --- Tema ---
const themeBtn = $$('#toggle-theme');
const setTheme = (t) => { document.body.classList.toggle('light', t === 'light'); localStorage.setItem('skuldkoll-theme', t); };
setTheme(localStorage.getItem('skuldkoll-theme') || 'dark');
if (themeBtn) themeBtn.addEventListener('click', () => {
  const current = document.body.classList.contains('light') ? 'light' : 'dark';
  setTheme(current === 'light' ? 'dark' : 'light');
});

// --- PWA install ---
let deferredPrompt; const installBtn = $$('#install-btn');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false; });
installBtn?.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; installBtn.hidden = true; deferredPrompt = null; });

// --- Offline-indikator ---
const offlineBadge = $$('#offline-badge');
const updateOffline = () => { if (offlineBadge) offlineBadge.hidden = navigator.onLine; };
window.addEventListener('online', updateOffline); window.addEventListener('offline', updateOffline); updateOffline();

// --- IndexedDB ---
const DB_NAME = 'skuldkoll-db'; const DB_VERSION = 2; let db;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      let store;
      if (!db.objectStoreNames.contains('debts')) {
        store = db.createObjectStore('debts', { keyPath: 'id', autoIncrement: true });
      } else {
        store = req.transaction.objectStore('debts');
      }
      // Indexer
      if (!store.indexNames.contains('byName')) store.createIndex('byName', 'debtor', { unique: false });
      if (!store.indexNames.contains('byStatus')) store.createIndex('byStatus', 'paid', { unique: false });
      if (!store.indexNames.contains('byDate')) store.createIndex('byDate', 'date', { unique: false });
      // Nya fält stöds utan migrering (schemalöst) – endast index behövs
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function withStore(mode, cb) { if (!db) db = await openDB(); const tx = db.transaction('debts', mode); const store = tx.objectStore('debts'); const res = await cb(store); await tx.complete?.catch(()=>{}); return res; }

// --- CRUD ---
async function addDebt(debt) { return withStore('readwrite', (store) => new Promise((resolve, reject) => { const req = store.add(debt); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); })); }
async function updateDebt(id, updates) { return withStore('readwrite', (store) => new Promise((resolve, reject) => { const get = store.get(id); get.onsuccess = () => { const data = { ...get.result, ...updates }; const put = store.put(data); put.onsuccess = () => resolve(put.result); put.onerror = () => reject(put.error); }; get.onerror = () => reject(get.error); })); }
async function deleteDebt(id) { return withStore('readwrite', (store) => new Promise((resolve, reject) => { const req = store.delete(id); req.onsuccess = () => resolve(true); req.onerror = () => reject(req.error); })); }
async function getAllDebts() { return withStore('readonly', (store) => new Promise((resolve, reject) => { const req = store.getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); })); }

// --- UI refs ---
const form = $$('#debt-form');
const listEl = $$('#debt-list');
const searchEl = $$('#search');
const filterStatusEl = $$('#filter-status');
const filterCategoryEl = $$('#filter-category');
const sortEl = $$('#sort-by');
const totalUnpaidEl = $$('#total-unpaid');
const totalPaidEl = $$('#total-paid');
const totalAllEl = $$('#total-all');
const peopleListEl = $$('#people-list');

// --- Settings & PIN ---
const settingsDialog = $$('#settings-dialog');
const openSettingsBtn = $$('#open-settings');
const remindersEnabledEl = $$('#reminders-enabled');
const reminderDaysEl = $$('#reminder-days');
const notifPermBtn = $$('#request-permission');
const pinNewEl = $$('#pin-new');

const LS = {
  theme: 'skuldkoll-theme',
  remindersEnabled: 'skuldkoll-reminders-enabled',
  reminderDays: 'skuldkoll-reminder-days',
  pinHash: 'skuldkoll-pin-hash',
  pinSalt: 'skuldkoll-pin-salt'
};

openSettingsBtn?.addEventListener('click', () => settingsDialog.showModal());
settingsDialog?.addEventListener('close', saveSettings);

// Init settings UI
remindersEnabledEl.checked = localStorage.getItem(LS.remindersEnabled) === '1';
reminderDaysEl.value = localStorage.getItem(LS.reminderDays) || '14';
notifPermBtn?.addEventListener('click', requestNotifPermission);

$('#pin-set')?.addEventListener('click', async () => {
  const pin = pinNewEl.value.trim();
  if (!/^\d{4,8}$/.test(pin)) { alert('PIN måste vara 4–8 siffror.'); return; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await sha256(pin, salt);
  localStorage.setItem(LS.pinSalt, btoa(String.fromCharCode(...salt)));
  localStorage.setItem(LS.pinHash, btoa(String.fromCharCode(...new Uint8Array(hash))));
  pinNewEl.value = '';
  alert('PIN satt!');
});
$('#pin-remove')?.addEventListener('click', () => { localStorage.removeItem(LS.pinSalt); localStorage.removeItem(LS.pinHash); alert('PIN borttagen.'); });
$('#clear-data')?.addEventListener('click', async () => {
  if (!confirm('Rensa ALL lokal data (skulder, inställningar, PIN)?')) return;
  // Rensa IndexedDB
  const req = indexedDB.deleteDatabase(DB_NAME);
  req.onsuccess = req.onerror = req.onblocked = () => location.reload();
  // Rensa LS
  Object.values(LS).forEach(k => localStorage.removeItem(k));
});

function saveSettings() {
  localStorage.setItem(LS.remindersEnabled, remindersEnabledEl.checked ? '1' : '0');
  localStorage.setItem(LS.reminderDays, String(reminderDaysEl.value || '14'));
}

async function requestNotifPermission() {
  if (!('Notification' in window)) { alert('Notiser stöds inte i denna webbläsare.'); return; }
  const perm = await Notification.requestPermission();
  alert(perm === 'granted' ? 'Notiser tillåtna.' : 'Notiser nekades.');
}

// --- PIN Lock overlay ---
const lockOverlay = $$('#lock-overlay');
const pinInput = $$('#pin-input');
$('#pin-unlock')?.addEventListener('click', unlockWithPIN);
$('#pin-reset')?.addEventListener('click', () => { if (confirm('Detta rensar all lokal data för att återställa PIN. Fortsätt?')) $('#clear-data').click(); });

async function enforcePIN() {
  const saltB64 = localStorage.getItem(LS.pinSalt);
  const hashB64 = localStorage.getItem(LS.pinHash);
  if (!saltB64 || !hashB64) { lockOverlay.hidden = true; return; }
  lockOverlay.hidden = false;
  pinInput?.focus();
}
async function unlockWithPIN() {
  const pin = pinInput.value.trim();
  const saltB64 = localStorage.getItem(LS.pinSalt);
  const hashB64 = localStorage.getItem(LS.pinHash);
  if (!/^\d{4,8}$/.test(pin) || !saltB64 || !hashB64) { alert('Fel PIN'); return; }
  const salt = new Uint8Array(atob(saltB64).split('').map(c => c.charCodeAt(0)));
  const expected = new Uint8Array(atob(hashB64).split('').map(c => c.charCodeAt(0)));
  const hash = new Uint8Array(await sha256(pin, salt));
  const ok = hash.length === expected.length && hash.every((b, i) => b === expected[i]);
  if (ok) { lockOverlay.hidden = true; pinInput.value=''; } else { alert('Fel PIN'); }
}
async function sha256(pin, salt) {
  const enc = new TextEncoder();
  const data = new Uint8Array([...salt, ...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(pin)))]);
  return crypto.subtle.digest('SHA-256', data);
}

// --- Form submission ---
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const debtor = $$('#debtor').value.trim();
  const amount = parseFloat($$('#amount').value);
  const date = $$('#date').value;
  const time = $$('#time').value;
  const category = $$('#category').value;
  const place = $$('#place').value.trim();
  const note = $$('#note').value.trim();
  const paid = $$('#status').checked;

  if (!debtor || isNaN(amount) || !date || !time) {
    alert('Fyll i person, belopp, datum och tid.');
    return;
  }

  const debt = { debtor, amount, date, time, category, place, note, paid, createdAt: new Date().toISOString(), remindedAt: null };
  await addDebt(debt);
  form.reset();
  render();
});

function applyFilters(debts) {
  const q = searchEl.value.trim().toLowerCase();
  const status = filterStatusEl.value;
  const cat = filterCategoryEl.value;
  let filtered = debts.filter(d => {
    const text = `${d.debtor} ${d.place || ''} ${d.note || ''}`.toLowerCase();
    const matchesSearch = q ? text.includes(q) : true;
    const matchesStatus = status === 'all' ? true : (status === 'paid' ? d.paid : !d.paid);
    const matchesCat = cat === 'all' ? true : (d.category === cat);
    return matchesSearch && matchesStatus && matchesCat;
  });

  const sortBy = sortEl.value;
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date_desc': return `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`);
      case 'date_asc': return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
      case 'amount_desc': return b.amount - a.amount;
      case 'amount_asc': return a.amount - b.amount;
      case 'name_asc': return a.debtor.localeCompare(b.debtor, 'sv');
      case 'name_desc': return b.debtor.localeCompare(a.debtor, 'sv');
      default: return 0;
    }
  });

  return filtered;
}

function renderSummary(debts) {
  const totalPaid = debts.filter(d => d.paid).reduce((s, d) => s + Number(d.amount), 0);
  const totalUnpaid = debts.filter(d => !d.paid).reduce((s, d) => s + Number(d.amount), 0);
  totalPaidEl.textContent = fmtCurrency(totalPaid);
  totalUnpaidEl.textContent = fmtCurrency(totalUnpaid);
  totalAllEl.textContent = fmtCurrency(totalPaid + totalUnpaid);
}

function renderPeople(debts) {
  const byPerson = new Map();
  debts.forEach(d => {
    const key = d.debtor.trim() || 'Okänd';
    if (!byPerson.has(key)) byPerson.set(key, { unpaid: 0, paid: 0 });
    if (d.paid) byPerson.get(key).paid += Number(d.amount); else byPerson.get(key).unpaid += Number(d.amount);
  });
  const items = [...byPerson.entries()].sort((a,b)=> a[0].localeCompare(b[0], 'sv'));
  peopleListEl.innerHTML = '';
  items.forEach(([name, sums]) => {
    const li = document.createElement('li'); li.className = 'chip';
    const nameEl = document.createElement('span'); nameEl.className='name'; nameEl.textContent = name;
    const unpaidEl = document.createElement('span'); unpaidEl.className='amount'; unpaidEl.textContent = fmtCurrency(sums.unpaid);
    const paidEl = document.createElement('span'); paidEl.className='muted'; paidEl.textContent = `(${fmtCurrency(sums.paid)} betalt)`;
    const btn = document.createElement('button'); btn.className='ghost'; btn.textContent='Filtrera';
    btn.addEventListener('click', ()=> { searchEl.value = name; render(); });
    li.append(nameEl, unpaidEl, paidEl, btn);
    peopleListEl.appendChild(li);
  });
}

async function render() {
  const debts = await getAllDebts();
  const items = applyFilters(debts);
  renderSummary(debts);
  renderPeople(debts);

  listEl.innerHTML = '';
  const tpl = $$('#debt-item-template');

  items.forEach(d => {
    const node = tpl.content.cloneNode(true);
    $$('.name', node).textContent = d.debtor;
    $$('.amount', node).textContent = fmtCurrency(d.amount);
    const statusEl = $$('.status', node);
    statusEl.textContent = d.paid ? 'Betald' : 'Obetald';
    statusEl.classList.toggle('unpaid', !d.paid);
    const catEl = $$('.category', node); catEl.textContent = d.category || 'Annat';
    $$('.datetime', node).textContent = fmtDateTime(d.date, d.time);
    $$('.place', node).textContent = d.place ? `📍 ${d.place}` : '';
    $$('.note', node).textContent = d.note ? `📝 ${d.note}` : '';

    const li = node.children[0];
    $$('.mark-paid', li).addEventListener('click', async () => { await updateDebt(d.id, { paid: !d.paid }); render(); });
    $$('.delete', li).addEventListener('click', async () => { if (confirm('Ta bort skulden?')) { await deleteDebt(d.id); render(); } });
    $$('.edit', li).addEventListener('click', () => openEditDialog(d));

    listEl.appendChild(li);
  });
}

// Enkel inline-redigering
async function openEditDialog(d) {
  const debtor = prompt('Person:', d.debtor); if (debtor === null) return;
  const amountStr = prompt('Belopp (kr):', String(d.amount)); if (amountStr === null) return; const amount = parseFloat(amountStr); if (isNaN(amount)) { alert('Ogiltigt belopp'); return; }
  const date = prompt('Datum (YYYY-MM-DD):', d.date); if (date === null) return;
  const time = prompt('Tid (HH:MM):', d.time); if (time === null) return;
  const category = prompt('Kategori:', d.category || 'Annat'); if (category === null) return;
  const place = prompt('Plats:', d.place || ''); if (place === null) return;
  const note = prompt('Anteckning:', d.note || ''); if (note === null) return;
  await updateDebt(d.id, { debtor, amount, date, time, category, place, note });
  render();
}

// Filter events
[searchEl, filterStatusEl, filterCategoryEl, sortEl].forEach(el => el?.addEventListener('input', render));

// Export/Import
$('#export-json')?.addEventListener('click', async () => { const debts = await getAllDebts(); downloadFile('skuldkoll-export.json', JSON.stringify(debts, null, 2), 'application/json'); });
$('#export-csv')?.addEventListener('click', async () => { const debts = await getAllDebts(); const csv = toCSV(debts); downloadFile('skuldkoll-export.csv', csv, 'text/csv'); });
$('#import-file')?.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text(); let items = [];
  if (file.name.endsWith('.json')) items = JSON.parse(text); else items = fromCSV(text);
  for (const it of items) { const { id, ...rest } = it; await addDebt(rest); }
  alert(`Importerade ${items.length} poster`); render();
});

function downloadFile(filename, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function toCSV(items) { const headers = ['id','debtor','amount','date','time','category','place','note','paid','createdAt','remindedAt']; const lines = items.map(i => headers.map(h => { const v = i[h]; if (v === undefined || v === null) return ''; const s = String(v).replace(/"/g, '""'); return `"${s}"`; }).join(',')); return [headers.join(','), ...lines].join('
'); }
function fromCSV(text) { const rows = text.trim().split(/
?
/); const headers = rows.shift().split(',').map(h => h.replace(/^"|"$/g, '')); return rows.map(r => { const cols = r.match(/("([^"]|"")*"|[^,]+)/g) || []; const obj = {}; headers.forEach((h,i)=>{ let val = cols[i] ?? ''; val = val.replace(/^"|"$/g, '').replace(/""/g, '"'); obj[h] = h === 'amount' ? parseFloat(val) : h === 'paid' ? (val === 'true' || val === '1') : val; }); return obj; }); }

// --- Påminnelser (lokalt) ---
async function checkReminders() {
  if (localStorage.getItem(LS.remindersEnabled) !== '1') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const days = parseInt(localStorage.getItem(LS.reminderDays) || '14', 10);
  const ms = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const debts = await getAllDebts();
  for (const d of debts) {
    if (d.paid) continue;
    const due = new Date(`${d.date}T${d.time || '00:00'}`).getTime();
    const lastRem = d.remindedAt ? new Date(d.remindedAt).getTime() : 0;
    if ((now - due) >= ms && (now - lastRem) > ms/2) {
      // Visa notis via Service Worker om möjligt
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          reg.showNotification('SkuldKoll – påminnelse', {
            body: `${d.debtor} är skyldig ${fmtCurrency(d.amount)} (kategori: ${d.category || 'Annat'})`,
            icon: './icons/icon-192.png', badge: './icons/icon-192.png'
          });
        } else if (Notification) new Notification('SkuldKoll – påminnelse', { body: `${d.debtor} är skyldig ${fmtCurrency(d.amount)}` });
        await updateDebt(d.id, { remindedAt: new Date().toISOString() });
      } catch {}
    }
  }
}

// Init
(async function init() {
  // Fyll datum/tid med nu
  const now = new Date();
  $$('#date').value = now.toISOString().slice(0,10);
  $$('#time').value = now.toTimeString().slice(0,5);

  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('./sw.js'); } catch {} }
  await openDB();
  await enforcePIN();
  render();

  // Kör påminnelsekoll vid start och var 30:e minut
  checkReminders();
  setInterval(checkReminders, 30 * 60 * 1000);
})();
