// Reine Hilfsfunktionen ohne DOM-Zugriff (auch in Node testbar).

// ---------- vCard ----------

function decodeQuotedPrintable(str, charset) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(str.substr(i + 1, 2))) {
      bytes.push(parseInt(str.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(c));
    }
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}

function unescapeValue(v) {
  return v.replace(/\\([nN,;\\:])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// Trennt an ';' die nicht mit Backslash maskiert sind.
function splitStructured(v) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) { cur += v[i] + v[i + 1]; i++; continue; }
    if (v[i] === ';') { parts.push(cur); cur = ''; continue; }
    cur += v[i];
  }
  parts.push(cur);
  return parts.map(unescapeValue);
}

function unfoldLines(text) {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (const line of raw) {
    const prev = lines.length - 1;
    if (prev >= 0 && /^[ \t]/.test(line)) {
      lines[prev] += line.slice(1);
    } else if (prev >= 0 && /QUOTED-PRINTABLE/i.test(lines[prev].split(':')[0]) && lines[prev].endsWith('=')) {
      // Soft line break bei vCard 2.1 (Android-Export)
      lines[prev] = lines[prev].slice(0, -1) + line;
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseLine(line) {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  let value = line.slice(idx + 1);
  const [rawName, ...paramParts] = head.split(';');
  const name = rawName.replace(/^[^.]*\./, '').toUpperCase();
  const params = {};
  const types = [];
  for (const p of paramParts) {
    const [k, v] = p.includes('=') ? p.split('=') : ['TYPE', p];
    const key = k.toUpperCase();
    if (key === 'TYPE') types.push(...v.split(',').map((t) => t.replace(/"/g, '').toLowerCase()));
    else params[key] = v.replace(/"/g, '');
  }
  if (/QUOTED-PRINTABLE/i.test(head)) value = decodeQuotedPrintable(value, params.CHARSET);
  return { name, params, types, value };
}

export function parseVCards(text) {
  const contacts = [];
  let cur = null;
  for (const line of unfoldLines(text)) {
    if (/^BEGIN:VCARD/i.test(line)) { cur = { tels: [], emails: [], adrs: [], notes: [] }; continue; }
    if (/^END:VCARD/i.test(line)) {
      if (cur) contacts.push(finishCard(cur));
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'FN': cur.fn = unescapeValue(p.value).trim(); break;
      case 'N': cur.n = splitStructured(p.value); break;
      case 'ORG': cur.org = splitStructured(p.value).filter(Boolean).join(', '); break;
      case 'TEL': cur.tels.push({ value: p.value.trim(), type: p.types[0] || '' }); break;
      case 'EMAIL': cur.emails.push({ value: p.value.trim(), type: p.types[0] || '' }); break;
      case 'ADR': {
        const [, ext, street, city, region, postal, country] = splitStructured(p.value);
        cur.adrs.push({
          street: [street, ext].filter(Boolean).join(', ').trim(),
          city: (city || '').trim(), region: (region || '').trim(),
          postal: (postal || '').trim(), country: (country || '').trim(),
          type: p.types.find((t) => t !== 'pref') || '',
        });
        break;
      }
      case 'NOTE': cur.notes.push(unescapeValue(p.value)); break;
      case 'UID': cur.uid = p.value.trim(); break;
      case 'X-ABUID': cur.uid = cur.uid || p.value.trim(); break;
    }
  }
  return contacts.filter((c) => c.name);
}

function finishCard(c) {
  const [family = '', given = ''] = c.n || [];
  const name = c.fn || [given, family].filter(Boolean).join(' ') || c.org || '';
  return {
    uid: c.uid || '',
    name,
    firstName: given.trim(),
    lastName: family.trim(),
    org: c.org || '',
    tels: c.tels,
    emails: c.emails,
    address: pickAddress(c.adrs),
    note: c.notes.join('\n'),
  };
}

function pickAddress(adrs) {
  if (!adrs.length) return null;
  return adrs.find((a) => a.type === 'work') || adrs[0];
}

export function formatAddress(a, { oneLine = true } = {}) {
  if (!a) return '';
  const cityLine = [a.postal, a.city].filter(Boolean).join(' ');
  const parts = [a.street, cityLine, a.country].filter(Boolean);
  return parts.join(oneLine ? ', ' : '\n');
}

// ---------- Nächste Stimmung (NS) ----------

// Erkennt z. B. "NS26.08", "NS 26/8", "NS: 2026.08", "ns 26-08".
// Format ist Jahr.Monat. Bei mehreren Angaben zählt die späteste.
const NS_RE = /\bNS\s*[:.\-]?\s*(\d{4}|\d{2})\s*[./\-]\s*(\d{1,2})(?!\d)/gi;

export function parseNS(note) {
  if (!note) return null;
  let best = null;
  for (const m of note.matchAll(NS_RE)) {
    let year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (month < 1 || month > 12) continue;
    if (year < 100) year += 2000;
    const key = monthKey(year, month);
    if (!best || key > best.key) best = { year, month, key, raw: m[0] };
  }
  return best;
}

export function monthKey(year, month) {
  return year * 12 + (month - 1);
}

export function monthKeyOfDate(d) {
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function formatNS(ns) {
  return ns ? `${MONTHS[ns.month - 1]} ${ns.year}` : '';
}

export function dueLabel(ns, nowKey) {
  const diff = ns.key - nowKey;
  if (diff < 0) return { text: `überfällig (${-diff} Mt.)`, level: 'overdue' };
  if (diff === 0) return { text: 'diesen Monat', level: 'now' };
  if (diff === 1) return { text: 'nächsten Monat', level: 'soon' };
  return { text: `in ${diff} Mt.`, level: 'later' };
}

// range: { nowKey, fromKey, toKey, includeOverdue }
export function isDue(ns, range) {
  if (!ns) return false;
  if (ns.key < range.nowKey && range.includeOverdue) return true;
  return ns.key >= range.fromKey && ns.key <= range.toKey;
}
