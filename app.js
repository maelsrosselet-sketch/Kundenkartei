import {
  parseVCards, formatAddress, parseNS, formatNS, dueLabel, isDue, monthKeyOfDate, monthKey,
} from './lib.js';

// ---------- Speicher ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('kk.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('kk.' + key, JSON.stringify(value)); } catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
  },
};

const DEFAULT_CATEGORIES = [
  { id: 'c1', name: 'Stammkunde', color: '#2e7d32' },
  { id: 'c2', name: 'Neukunde', color: '#1565c0' },
  { id: 'c3', name: 'Wichtig', color: '#c62828' },
  { id: 'c4', name: 'Konzertflügel', color: '#6a1b9a' },
];
const NO_CATEGORY_COLOR = '#9e9e9e';

const state = {
  contacts: store.get('contacts', []),
  categories: store.get('categories', DEFAULT_CATEGORIES),
  geocache: store.get('geocache', {}),
  prefs: Object.assign({ sort: 'name', colorFilter: [], period: '2', overdue: true, mapMode: 'all' }, store.get('prefs', {})),
  search: '',
  view: 'list',
};

const saveContacts = () => store.set('contacts', state.contacts);
const saveCategories = () => store.set('categories', state.categories);
const savePrefs = () => store.set('prefs', state.prefs);
const saveGeocache = () => store.set('geocache', state.geocache);

// ---------- Hilfen ----------

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
const nowKey = () => monthKeyOfDate(new Date());

const categoryOf = (c) => state.categories.find((k) => k.id === c.categoryId);
const colorOf = (c) => categoryOf(c)?.color || NO_CATEGORY_COLOR;
const nsOf = (c) => parseNS(c.note);
const addressKey = (a) => formatAddress(a).toLowerCase();
const geoOf = (c) => (c.address ? state.geocache[addressKey(c.address)] : null);

function contactKey(c) {
  return c.uid ? 'uid:' + c.uid : 'name:' + c.name.toLowerCase();
}

function dueRange() {
  const now = nowKey();
  const { period, overdue } = state.prefs;
  if (period === 'custom') {
    const parse = (v, fb) => {
      const m = /^(\d{4})-(\d{2})$/.exec(v || '');
      return m ? monthKey(+m[1], +m[2]) : fb;
    };
    return { nowKey: now, fromKey: parse(state.prefs.from, now), toKey: parse(state.prefs.to, now + 2), includeOverdue: overdue };
  }
  return { nowKey: now, fromKey: now, toKey: now + Number(period), includeOverdue: overdue };
}

function matchesFilters(c) {
  const cf = state.prefs.colorFilter;
  if (cf.length && !cf.includes(c.categoryId || 'none')) return false;
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [c.name, c.org, formatAddress(c.address), c.note, ...c.tels.map((t) => t.value), ...c.emails.map((e) => e.value)]
    .join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

const filteredContacts = () => state.contacts.filter(matchesFilters);
const dueContacts = () => {
  const r = dueRange();
  return filteredContacts().filter((c) => isDue(nsOf(c), r)).sort((a, b) => nsOf(a).key - nsOf(b).key || collator.compare(a.name, b.name));
};

// ---------- Farbfilter ----------

function renderColorFilter() {
  const cf = state.prefs.colorFilter;
  const count = (id) => state.contacts.filter((c) => (c.categoryId || 'none') === id).length;
  const chips = [...state.categories, { id: 'none', name: 'Ohne Farbe', color: NO_CATEGORY_COLOR }]
    .map((k) => `<button class="chip ${cf.includes(k.id) ? 'on' : ''}" data-cat="${esc(k.id)}">
      <i style="background:${esc(k.color)}"></i>${esc(k.name)} <small>${count(k.id)}</small></button>`).join('');
  $('#colorFilter').innerHTML = chips + (cf.length ? '<button class="chip clear" data-cat="">✕ Filter</button>' : '');
}

$('#colorFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const id = b.dataset.cat;
  const cf = state.prefs.colorFilter;
  state.prefs.colorFilter = id === '' ? [] : cf.includes(id) ? cf.filter((x) => x !== id) : [...cf, id];
  savePrefs();
  renderAll();
});

// ---------- Listen ----------

function contactRow(c, extra = '') {
  const ns = nsOf(c);
  const due = ns ? dueLabel(ns, nowKey()) : null;
  const addr = c.address ? [c.address.postal, c.address.city].filter(Boolean).join(' ') : '';
  return `<button class="item" data-id="${esc(c.id)}">
    <i class="dot" style="background:${esc(colorOf(c))}"></i>
    <span class="main"><b>${esc(c.name)}</b>${c.org && c.org !== c.name ? ` <small>${esc(c.org)}</small>` : ''}
      <span class="sub">${esc(addr || 'keine Adresse')}</span></span>
    ${ns ? `<span class="ns ${due.level}">${esc(formatNS(ns))}<small>${esc(due.text)}</small></span>` : ''}
    ${extra}
  </button>`;
}

const SORTS = {
  name: { cmp: (a, b) => collator.compare(a.name, b.name), group: (c) => (c.name[0] || '#').toUpperCase() },
  lastName: {
    cmp: (a, b) => collator.compare(a.lastName || a.name, b.lastName || b.name) || collator.compare(a.name, b.name),
    group: (c) => ((c.lastName || c.name)[0] || '#').toUpperCase(),
  },
  city: {
    cmp: (a, b) => collator.compare(a.address?.city || '￿', b.address?.city || '￿') || collator.compare(a.name, b.name),
    group: (c) => c.address?.city || 'Ohne Ort',
  },
  postal: {
    cmp: (a, b) => collator.compare(a.address?.postal || '￿', b.address?.postal || '￿') || collator.compare(a.name, b.name),
    group: (c) => (c.address?.postal ? c.address.postal.slice(0, 2) + '…' : 'Ohne PLZ'),
  },
  category: {
    cmp: (a, b) => {
      const ia = state.categories.findIndex((k) => k.id === a.categoryId);
      const ib = state.categories.findIndex((k) => k.id === b.categoryId);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || collator.compare(a.name, b.name);
    },
    group: (c) => categoryOf(c)?.name || 'Ohne Farbe',
  },
  ns: {
    cmp: (a, b) => (nsOf(a)?.key ?? 1e9) - (nsOf(b)?.key ?? 1e9) || collator.compare(a.name, b.name),
    group: (c) => (nsOf(c) ? formatNS(nsOf(c)) : 'Ohne NS-Angabe'),
  },
};

function renderList() {
  document.querySelectorAll('#sortTabs button').forEach((b) => b.classList.toggle('active', b.dataset.sort === state.prefs.sort));
  const el = $('#list');
  if (!state.contacts.length) {
    el.innerHTML = `<div class="empty">Noch keine Kunden.<br><button data-goto="settings" class="primary">Kontakte importieren</button></div>`;
    return;
  }
  const sort = SORTS[state.prefs.sort] || SORTS.name;
  const items = filteredContacts().sort(sort.cmp);
  if (!items.length) { el.innerHTML = '<div class="empty">Keine Treffer.</div>'; return; }
  let html = '';
  let lastGroup = null;
  for (const c of items) {
    const g = sort.group(c);
    if (g !== lastGroup) { html += `<h3 class="group">${esc(g)}</h3>`; lastGroup = g; }
    html += contactRow(c);
  }
  el.innerHTML = html;
}

$('#sortTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sort]');
  if (!b) return;
  state.prefs.sort = b.dataset.sort;
  savePrefs();
  renderList();
});

// ---------- Stimmung fällig ----------

function renderDue() {
  $('#duePeriod').value = state.prefs.period;
  $('#dueOverdue').checked = state.prefs.overdue;
  $('#dueCustom').hidden = state.prefs.period !== 'custom';
  const items = dueContacts();
  const withoutNS = filteredContacts().filter((c) => !nsOf(c)).length;
  $('#dueSummary').textContent = `${items.length} fällig` + (withoutNS ? ` · ${withoutNS} ohne NS-Angabe` : '');
  $('#dueList').innerHTML = items.length
    ? items.map((c) => contactRow(c)).join('')
    : '<div class="empty">Im gewählten Zeitraum ist keine Stimmung fällig.</div>';
}

$('#duePeriod').addEventListener('change', (e) => {
  state.prefs.period = e.target.value;
  if (e.target.value === 'custom' && !state.prefs.from) {
    const d = new Date();
    const ym = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    state.prefs.from = ym(d);
    state.prefs.to = ym(new Date(d.getFullYear(), d.getMonth() + 2, 1));
  }
  $('#dueFrom').value = state.prefs.from || '';
  $('#dueTo').value = state.prefs.to || '';
  savePrefs();
  renderDue();
  if (state.view === 'map') renderMap();
});
$('#dueOverdue').addEventListener('change', (e) => { state.prefs.overdue = e.target.checked; savePrefs(); renderDue(); });
$('#dueFrom').addEventListener('change', (e) => { state.prefs.from = e.target.value; savePrefs(); renderDue(); });
$('#dueTo').addEventListener('change', (e) => { state.prefs.to = e.target.value; savePrefs(); renderDue(); });
$('#dueToMap').addEventListener('click', () => { state.prefs.mapMode = 'due'; savePrefs(); showView('map'); });

// ---------- Karte ----------

let map = null;
let markerLayer = null;
let lastFitSignature = '';

function ensureMap() {
  if (map) return true;
  if (!window.L) {
    $('#map').innerHTML = '<div class="empty">Karte konnte nicht geladen werden (keine Internetverbindung?).</div>';
    return false;
  }
  map = L.map('map', { zoomControl: true }).setView([47.0, 8.3], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  markerLayer = L.featureGroup().addTo(map);
  return true;
}

function mapContacts() {
  return state.prefs.mapMode === 'due' ? dueContacts() : filteredContacts();
}

function renderMap() {
  document.querySelectorAll('#mapMode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.prefs.mapMode));
  if (!ensureMap()) return;
  map.invalidateSize();
  markerLayer.clearLayers();
  const items = mapContacts();
  const now = nowKey();
  let placed = 0;
  let missing = 0;
  for (const c of items) {
    const g = geoOf(c);
    if (!g || !g.lat) { missing++; continue; }
    placed++;
    const ns = nsOf(c);
    const due = ns ? dueLabel(ns, now) : null;
    const m = L.circleMarker([g.lat, g.lon], {
      radius: 9,
      color: due && (due.level === 'overdue' || due.level === 'now') ? '#000' : '#fff',
      weight: due && (due.level === 'overdue' || due.level === 'now') ? 3 : 2,
      fillColor: colorOf(c),
      fillOpacity: 0.95,
    });
    m.bindPopup(`<b>${esc(c.name)}</b><br>${esc(formatAddress(c.address))}
      ${ns ? `<br>NS: ${esc(formatNS(ns))} – ${esc(due.text)}` : ''}
      <br><a href="#" data-open="${esc(c.id)}">Details</a>`);
    m.bindTooltip(esc(c.name));
    markerLayer.addLayer(m);
  }
  const noAddr = items.filter((c) => !c.address).length;
  const pending = missing - noAddr;
  $('#mapInfo').textContent = `${placed} auf Karte` + (pending ? ` · ${pending} noch nicht verortet` : '') + (noAddr ? ` · ${noAddr} ohne Adresse` : '');
  const sig = state.prefs.mapMode + '|' + items.map((c) => c.id).join(',');
  if (placed && sig !== lastFitSignature) {
    map.fitBounds(markerLayer.getBounds(), { padding: [30, 30], maxZoom: 14 });
    lastFitSignature = sig;
  }
}

$('#mapMode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  state.prefs.mapMode = b.dataset.mode;
  savePrefs();
  renderMap();
});

$('#map').addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  if (!a) return;
  e.preventDefault();
  openDetail(a.dataset.open);
});

// ---------- Geokodierung (OpenStreetMap Nominatim, max. 1 Anfrage/Sekunde) ----------

let geocoding = false;

async function geocodeAddress(a) {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', 'accept-language': 'de' });
  if (a.street) params.set('street', a.street);
  if (a.city) params.set('city', a.city);
  if (a.postal) params.set('postalcode', a.postal);
  if (a.country) params.set('country', a.country);
  let res = await fetch('https://nominatim.openstreetmap.org/search?' + params);
  let data = res.ok ? await res.json() : [];
  if (!data.length) {
    // Freitextsuche als Rückfall (z. B. unübliche Schreibweisen)
    await sleep(1100);
    res = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      format: 'jsonv2', limit: '1', 'accept-language': 'de', q: formatAddress(a),
    }));
    data = res.ok ? await res.json() : [];
  }
  return data.length ? { lat: +data[0].lat, lon: +data[0].lon } : { failed: true, at: Date.now() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocodeAll({ retryFailed = false } = {}) {
  if (geocoding) return;
  const todo = [...new Map(state.contacts.filter((c) => c.address).map((c) => [addressKey(c.address), c.address])).entries()]
    .filter(([k]) => !state.geocache[k] || (retryFailed && state.geocache[k].failed));
  if (!todo.length) { $('#geocodeBtn').textContent = 'Alle Adressen verortet ✓'; return; }
  geocoding = true;
  const btn = $('#geocodeBtn');
  btn.disabled = true;
  let done = 0;
  try {
    for (const [key, addr] of todo) {
      btn.textContent = `Verorte … ${done}/${todo.length}`;
      try {
        state.geocache[key] = await geocodeAddress(addr);
      } catch {
        break; // offline o. Ä. – später erneut versuchen
      }
      done++;
      saveGeocache();
      if (state.view === 'map' && done % 5 === 0) renderMap();
      await sleep(1100);
    }
  } finally {
    geocoding = false;
    btn.disabled = false;
    btn.textContent = done < todo.length ? `Verorten fortsetzen (${todo.length - done} offen)` : 'Adressen verorten';
    if (state.view === 'map') renderMap();
  }
}

$('#geocodeBtn').addEventListener('click', () => geocodeAll({ retryFailed: true }));

// ---------- Detailansicht ----------

function openDetail(id) {
  const c = state.contacts.find((x) => x.id === id);
  if (!c) return;
  const ns = nsOf(c);
  const g = geoOf(c);
  const addr = formatAddress(c.address);
  const navUrl = g?.lat
    ? `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  const dlg = $('#detail');
  dlg.innerHTML = `<form method="dialog" class="detail">
    <header><i class="dot big" style="background:${esc(colorOf(c))}"></i><h2>${esc(c.name)}</h2><button class="close" value="close">✕</button></header>
    ${c.org && c.org !== c.name ? `<p class="muted">${esc(c.org)}</p>` : ''}
    <h4>Farbe / Kategorie</h4>
    <div class="swatches">
      ${state.categories.map((k) => `<button type="button" data-setcat="${esc(k.id)}" class="${c.categoryId === k.id ? 'on' : ''}"><i style="background:${esc(k.color)}"></i>${esc(k.name)}</button>`).join('')}
      <button type="button" data-setcat="" class="${!c.categoryId ? 'on' : ''}"><i style="background:${NO_CATEGORY_COLOR}"></i>Keine</button>
    </div>
    ${ns ? `<h4>Nächste Stimmung</h4><p><span class="ns ${dueLabel(ns, nowKey()).level}">${esc(formatNS(ns))}<small>${esc(dueLabel(ns, nowKey()).text)}</small></span></p>` : ''}
    ${c.tels.length ? `<h4>Telefon</h4>${c.tels.map((t) => `<p><a href="tel:${esc(t.value.replace(/[^\d+]/g, ''))}">${esc(t.value)}</a> <small class="muted">${esc(t.type)}</small></p>`).join('')}` : ''}
    ${c.emails.length ? `<h4>E-Mail</h4>${c.emails.map((m) => `<p><a href="mailto:${esc(m.value)}">${esc(m.value)}</a></p>`).join('')}` : ''}
    ${addr ? `<h4>Adresse</h4><p>${esc(formatAddress(c.address, { oneLine: false })).replace(/\n/g, '<br>')}</p>
      <p><a href="${esc(navUrl)}" target="_blank" rel="noopener">Route planen ↗</a>
      ${g?.failed ? ' · <span class="warn">Adresse nicht gefunden</span>' : ''}</p>` : ''}
    <h4>Notizen <small class="muted">(aus dem Adressbuch)</small></h4>
    <pre class="note">${esc(c.note || '–')}</pre>
    <p class="muted small">Notizen und NS-Angaben änderst du im Adressbuch des Geräts und importierst danach erneut.</p>
  </form>`;
  dlg.onclick = (e) => {
    if (e.target === dlg) { dlg.close(); return; }
    const b = e.target.closest('[data-setcat]');
    if (!b) return;
    c.categoryId = b.dataset.setcat || null;
    saveContacts();
    renderAll();
    openDetail(id);
  };
  if (!dlg.open) dlg.showModal();
}

document.addEventListener('click', (e) => {
  const item = e.target.closest('.item[data-id]');
  if (item) openDetail(item.dataset.id);
  const go = e.target.closest('[data-goto]');
  if (go) showView(go.dataset.goto);
});

// ---------- Import ----------

// full = true: Quelle enthält alle Felder inkl. Notizen (vCard) und darf leere Werte übernehmen.
function mergeContacts(incoming, { removeMissing, full }) {
  const byKey = new Map(state.contacts.map((c) => [contactKey(c), c]));
  // Kontakte ohne UID zusätzlich über den Namen finden (z. B. vorher per Picker importiert)
  const byName = new Map(state.contacts.map((c) => [c.name.toLowerCase(), c]));
  const seen = new Set();
  let added = 0;
  let updated = 0;
  for (const n of incoming) {
    const sameName = byName.get(n.name.toLowerCase());
    const existing = byKey.get(contactKey(n)) || (sameName && (!n.uid || !sameName.uid) ? sameName : null);
    if (existing) {
      Object.assign(existing, {
        uid: n.uid || existing.uid,
        name: n.name, firstName: n.firstName, lastName: n.lastName, org: n.org,
        tels: full || n.tels.length ? n.tels : existing.tels,
        emails: full || n.emails.length ? n.emails : existing.emails,
        address: full || n.address ? n.address : existing.address,
        note: full ? n.note : existing.note,
      });
      seen.add(existing.id);
      updated++;
    } else {
      const c = { id: crypto.randomUUID(), categoryId: null, ...n };
      state.contacts.push(c);
      byKey.set(contactKey(c), c);
      byName.set(c.name.toLowerCase(), c);
      seen.add(c.id);
      added++;
    }
  }
  let removed = 0;
  if (removeMissing) {
    const before = state.contacts.length;
    state.contacts = state.contacts.filter((c) => seen.has(c.id));
    removed = before - state.contacts.length;
  }
  saveContacts();
  return { added, updated, removed };
}

function reportImport(r) {
  const withNS = state.contacts.filter((c) => nsOf(c)).length;
  $('#importResult').textContent = `${r.added} neu, ${r.updated} aktualisiert${r.removed ? `, ${r.removed} entfernt` : ''}. ` +
    `${withNS} Kunden mit NS-Angabe. Adressen werden im Hintergrund verortet …`;
  renderAll();
  geocodeAll();
}

$('#vcfInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const cards = [];
  for (const f of files) cards.push(...parseVCards(await f.text()));
  e.target.value = '';
  if (!cards.length) { $('#importResult').textContent = 'Keine Kontakte in der Datei gefunden.'; return; }
  reportImport(mergeContacts(cards, { removeMissing: $('#removeMissing').checked, full: true }));
});

if ('contacts' in navigator && 'ContactsManager' in window) {
  $('#pickerBtn').hidden = false;
  $('#pickerBtn').addEventListener('click', async () => {
    try {
      const supported = await navigator.contacts.getProperties();
      const props = ['name', 'tel', 'email', 'address'].filter((p) => supported.includes(p));
      const picked = await navigator.contacts.select(props, { multiple: true });
      const cards = picked.filter((p) => p.name?.[0]).map((p) => {
        const a = p.address?.[0];
        return {
          uid: '', name: p.name[0], firstName: '', lastName: p.name[0].split(' ').slice(-1)[0], org: '',
          tels: (p.tel || []).map((value) => ({ value, type: '' })),
          emails: (p.email || []).map((value) => ({ value, type: '' })),
          address: a ? {
            street: (a.addressLine || []).join(', '), city: a.city || '', region: a.region || '',
            postal: a.postalCode || '', country: a.country || '', type: '',
          } : null,
          note: '',
        };
      });
      reportImport(mergeContacts(cards, { removeMissing: false, full: false }));
    } catch (err) {
      $('#importResult').textContent = 'Auswahl abgebrochen oder nicht möglich: ' + err.message;
    }
  });
}

// ---------- Kategorien ----------

function renderCategories() {
  $('#categoryEditor').innerHTML = state.categories.map((k) => `<div class="catrow" data-id="${esc(k.id)}">
    <input type="color" value="${esc(k.color)}" data-field="color" aria-label="Farbe">
    <input type="text" value="${esc(k.name)}" data-field="name" aria-label="Name">
    <small class="muted">${state.contacts.filter((c) => c.categoryId === k.id).length}</small>
    <button data-del title="Löschen">🗑</button>
  </div>`).join('');
}

$('#categoryEditor').addEventListener('change', (e) => {
  const row = e.target.closest('.catrow');
  const k = state.categories.find((x) => x.id === row?.dataset.id);
  if (!k || !e.target.dataset.field) return;
  k[e.target.dataset.field] = e.target.value;
  saveCategories();
  renderColorFilter();
});

$('#categoryEditor').addEventListener('click', (e) => {
  if (!e.target.closest('[data-del]')) return;
  const id = e.target.closest('.catrow').dataset.id;
  const used = state.contacts.filter((c) => c.categoryId === id).length;
  if (used && !confirm(`${used} Kunden verlieren diese Farbe. Trotzdem löschen?`)) return;
  state.categories = state.categories.filter((k) => k.id !== id);
  state.contacts.forEach((c) => { if (c.categoryId === id) c.categoryId = null; });
  state.prefs.colorFilter = state.prefs.colorFilter.filter((x) => x !== id);
  saveCategories(); saveContacts(); savePrefs();
  renderAll();
});

$('#addCategory').addEventListener('click', () => {
  const palette = ['#ef6c00', '#00838f', '#ad1457', '#558b2f', '#4527a0', '#f9a825', '#5d4037'];
  state.categories.push({ id: 'c' + Date.now(), name: 'Neue Kategorie', color: palette[state.categories.length % palette.length] });
  saveCategories();
  renderAll();
});

// ---------- Daten sichern ----------

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({
    version: 1, contacts: state.contacts, categories: state.categories, geocache: state.geocache,
  }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kundenkartei-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#restoreInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.contacts)) throw new Error('Ungültige Datei');
    if (!confirm(`${data.contacts.length} Kunden laden und aktuelle Daten ersetzen?`)) return;
    state.contacts = data.contacts;
    state.categories = data.categories || state.categories;
    state.geocache = data.geocache || {};
    saveContacts(); saveCategories(); saveGeocache();
    renderAll();
  } catch (err) { alert('Laden fehlgeschlagen: ' + err.message); }
});

$('#clearBtn').addEventListener('click', () => {
  if (!confirm('Alle Kunden, Farben und Kartenpositionen in dieser App löschen? (Das Adressbuch des Geräts bleibt unverändert.)')) return;
  state.contacts = [];
  state.geocache = {};
  saveContacts(); saveGeocache();
  renderAll();
});

// ---------- Navigation ----------

function showView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.body.dataset.view = view;
  renderCurrent();
}

function renderCurrent() {
  if (state.view === 'list') renderList();
  else if (state.view === 'due') renderDue();
  else if (state.view === 'map') renderMap();
  else if (state.view === 'settings') {
    renderCategories();
    const geo = Object.values(state.geocache).filter((g) => g.lat).length;
    $('#dataInfo').textContent = `${state.contacts.length} Kunden gespeichert, ${geo} Adressen verortet. Daten liegen nur lokal auf diesem Gerät.`;
  }
}

function renderAll() {
  renderColorFilter();
  renderCurrent();
}

$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) showView(b.dataset.view);
});

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value; renderCurrent(); }, 120);
});

$('#dueFrom').value = state.prefs.from || '';
$('#dueTo').value = state.prefs.to || '';
showView('list');
renderColorFilter();
geocodeAll();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
