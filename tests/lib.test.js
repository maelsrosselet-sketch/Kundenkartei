import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVCards, parseNS, isDue, monthKey, dueLabel, formatAddress } from '../lib.js';

const vcf = readFileSync(new URL('./beispiel.vcf', import.meta.url), 'utf8');

test('parst vCard 2.1, 3.0 und 4.0', () => {
  const cards = parseVCards(vcf);
  assert.equal(cards.length, 3);
  const [anna, juerg, clara] = cards;
  assert.equal(anna.uid, 'abc-1');
  assert.equal(anna.lastName, 'Muster');
  assert.equal(anna.org, 'Musikschule Bern');
  assert.equal(anna.tels[0].value, '+41 79 123 45 67');
  assert.equal(anna.note, 'Steinway B, 1998\nNS26.10 letzte Stimmung 25.10');
  assert.equal(formatAddress(anna.address), 'Bundesplatz 3, 3011 Bern, Schweiz');
  assert.equal(juerg.name, 'Jürg Müller');
  assert.equal(formatAddress(juerg.address), 'Hauptstrasse 1, 8001 Zürich, Schweiz');
  assert.equal(juerg.note, 'Yamaha U3 NS 26/8');
  assert.equal(clara.address.city, 'Lausanne');
});

test('erkennt NS-Angaben', () => {
  assert.deepEqual(parseNS('NS26.08'), { year: 2026, month: 8, key: monthKey(2026, 8), raw: 'NS26.08' });
  assert.equal(parseNS('ns 26/8').month, 8);
  assert.equal(parseNS('NS: 2027.3').year, 2027);
  assert.equal(parseNS('NS25.12 und neu NS 2027.03').key, monthKey(2027, 3));
  assert.equal(parseNS('letzte Stimmung 25.10'), null);
  assert.equal(parseNS('NS26.13'), null);
  assert.equal(parseNS('HNS26.08'), null);
  assert.equal(parseNS(''), null);
});

test('Fälligkeit im Zeitraum', () => {
  const now = monthKey(2026, 9);
  const next3 = { nowKey: now, fromKey: now, toKey: now + 2, includeOverdue: true };
  assert.equal(isDue(parseNS('NS26.08'), next3), true);
  assert.equal(isDue(parseNS('NS26.08'), { ...next3, includeOverdue: false }), false);
  assert.equal(isDue(parseNS('NS26.11'), next3), true);
  assert.equal(isDue(parseNS('NS26.12'), next3), false);
  assert.equal(isDue(null, next3), false);
  assert.equal(dueLabel(parseNS('NS26.08'), now).level, 'overdue');
  assert.equal(dueLabel(parseNS('NS26.09'), now).level, 'now');
});
