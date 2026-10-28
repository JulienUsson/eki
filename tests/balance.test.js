import test from 'node:test';
import assert from 'node:assert/strict';
import { weekBalance } from '../js/balance.js';
import { buildCatalog, emptySlot, fillWeek, guessFamily } from '../js/planner.js';

const week = '2026-W44';
const catalog = buildCatalog();

function plan(rows) {
  const days = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const meals = {};
  rows.forEach((fields, i) => {
    const slot = { ...emptySlot(week, days[Math.floor(i / 2)], i % 2 ? 'soir' : 'midi'), ...fields };
    meals[slot.key] = slot;
  });
  return meals;
}

const texts = (meals) => weekBalance(week, meals, catalog, ['midi', 'soir']).alerts.map((a) => `${a.level} ${a.text}`);

test('guesses the family of free-text proteins and starches', () => {
  assert.equal(guessFamily('Filet de maquereau', 'proteine'), 'poisson-gras');
  assert.equal(guessFamily('Rôti de dinde', 'proteine'), 'volaille');
  assert.equal(guessFamily('Chorizo', 'proteine'), 'charcuterie');
  assert.equal(guessFamily('Côte de porc', 'proteine'), 'viande');
  assert.equal(guessFamily('Lentilles corail', 'feculent'), 'legumineuse');
  assert.equal(guessFamily('Pain complet', 'feculent'), 'complet');
  assert.equal(guessFamily('Riz basmati', 'feculent'), '');
});

test('needs a few planned meals before giving advice', () => {
  const result = weekBalance(week, plan([{ legume: 'poireau', proteine: 'boeuf' }]), catalog, ['midi', 'soir']);
  assert.equal(result.planned, 1);
  assert.deepEqual(result.alerts, []);
});

test('flags missing fish, too much meat and deli, no pulses and meals without vegetables', () => {
  const meals = plan([
    { legume: 'poireau', proteine: 'boeuf', feculent: 'riz' },
    { legume: 'carotte', proteine: 'porc', feculent: 'pates' },
    { legume: 'navet', proteine: 'veau', feculent: 'riz' },
    { proteine: 'agneau', feculent: 'pates' },
    { legume: 'courgette', proteine: 'boeuf-hache', feculent: 'riz' },
    { legume: 'endive', proteine: 'jambon', feculent: 'pain' },
    { legume: 'epinard', proteine: 'saucisse', feculent: 'riz' },
    { legume: 'chou-vert', proteine: 'Chorizo', feculent: 'riz' },
  ]);
  const all = texts(meals);
  assert.ok(all[0].startsWith('warn'));
  assert.ok(all.some((t) => t.startsWith('warn 🐟 Pas de poisson')));
  assert.ok(all.some((t) => t.startsWith('warn 🥩 Viande') && t.includes('5 fois')));
  assert.ok(all.some((t) => t.startsWith('warn 🥓 Charcuterie 3 fois')));
  assert.ok(all.some((t) => t.startsWith('warn 🥦 1 repas sans légume')));
  assert.ok(all.some((t) => t.startsWith('info 🫘 Légumineuses 0 fois')));
  assert.ok(all.some((t) => t.startsWith('info 🌾 Pas de féculent complet')));
  assert.ok(all.some((t) => t.startsWith('info 🍂 Hors saison : Courgette')));
  assert.ok(all.some((t) => t.startsWith('info 🔁 Riz 5 fois')));
});

test('a balanced week gets positive feedback', () => {
  const meals = plan([
    { legume: 'poireau', proteine: 'saumon', feculent: 'riz-complet' },
    { legume: 'carotte', proteine: 'lentilles', feculent: 'pain-complet' },
    { legume: 'navet', proteine: 'poulet', feculent: 'quinoa' },
    { legume: 'brocoli', proteine: 'cabillaud', feculent: 'pates' },
    { legume: 'butternut', proteine: 'pois-chiches', feculent: 'sarrasin' },
    { legume: 'endive', proteine: 'oeufs', feculent: 'boulgour' },
  ]);
  const all = texts(meals);
  assert.ok(all.every((t) => !t.startsWith('warn')), all.join('\n'));
  assert.ok(all.includes('ok 🐟 Poisson 2 fois, dont du poisson gras.'));
  assert.ok(all.includes('ok 🫘 Légumineuses 2 fois.'));
  assert.ok(all.includes('ok 🥦 Un légume à chaque repas.'));
  assert.ok(all.includes('ok 🌾 Féculents complets 5 fois.'));
});

test('leftovers count as eaten meals, libre meals do not', () => {
  const meals = plan([
    { legume: 'poireau', proteine: 'sardine', feculent: 'riz' },
    { legume: 'carotte', proteine: 'poulet', feculent: 'riz' },
    { legume: 'navet', proteine: 'dinde', feculent: 'riz' },
    { libre: true, proteine: 'saumon' },
  ]);
  const leftover = { ...emptySlot(week, 'mercredi', 'midi'), reprise: `${week}|lundi|midi` };
  meals[leftover.key] = leftover;
  const all = texts(meals);
  assert.ok(all.some((t) => t.includes('Poisson 1 fois')) === false);
  assert.ok(all.includes('ok 🐟 Poisson 2 fois, dont du poisson gras.'));
});

test('filling the week follows the recommendations', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let s = seed;
    const rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (const mealIds of [['midi', 'soir'], ['soir']]) {
      const changed = fillWeek(week, {}, catalog, mealIds, rng);
      const meals = Object.fromEntries(changed.map((slot) => [slot.key, slot]));
      const { alerts } = weekBalance(week, meals, catalog, mealIds);
      const levels = alerts.filter((a) => a.level !== 'ok' && !a.text.startsWith('🔁')).map((a) => a.text);
      assert.deepEqual(levels, [], `seed ${seed} ${mealIds}: ${levels.join(' | ')}`);
    }
  }
});

test('filling respects what is already planned', () => {
  const meals = plan([
    { legume: 'poireau', proteine: 'saumon', feculent: 'riz' },
    { legume: 'carotte', proteine: 'cabillaud', feculent: 'riz' },
  ]);
  const changed = fillWeek(week, meals, catalog, ['midi', 'soir'], () => 0.3);
  const fishIds = new Set(['saumon', 'maquereau', 'sardine', 'cabillaud', 'colin', 'thon', 'crevettes']);
  assert.ok(changed.every((slot) => !fishIds.has(slot.proteine) || meals[slot.key]));
});
