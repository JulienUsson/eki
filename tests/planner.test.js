import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalog, byType, cuissonCandidates, fillWeek, inSeason, shoppingItems, shoppingText, slotKey, slugify,
} from '../js/planner.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test('slugify', () => {
  assert.equal(slugify('Bœuf haché'), 'boeuf-hache');
  assert.equal(slugify('  Pâtes  complètes '), 'pates-completes');
});

test('buildCatalog applies overrides and deletions', () => {
  const catalog = buildCatalog({
    carotte: { key: 'carotte', type: 'legume', nom: 'Carotte nouvelle', emoji: '', mois: [], cuissons: [], supprime: false },
    tofu: { key: 'tofu', type: 'proteine', nom: 'Tofu', supprime: true },
    patisson: { key: 'patisson', type: 'legume', nom: 'Pâtisson', emoji: '🎃', mois: [9, 10], cuissons: ['four'], supprime: false },
  });
  const carotte = catalog.find((i) => i.id === 'carotte');
  assert.equal(carotte.name, 'Carotte nouvelle');
  assert.equal(carotte.emoji, '🥕');
  assert.equal(carotte.months.length, 12);
  assert.ok(!catalog.some((i) => i.id === 'tofu'));
  assert.equal(catalog.find((i) => i.id === 'patisson').custom, true);
  assert.equal(carotte.custom, false);
});

test('seasonality', () => {
  const catalog = buildCatalog();
  const tomate = catalog.find((i) => i.id === 'tomate');
  assert.equal(inSeason(tomate, 8), true);
  assert.equal(inSeason(tomate, 12), false);
  assert.deepEqual(cuissonCandidates(catalog, 'concombre'), ['cru']);
  assert.equal(cuissonCandidates(catalog, '').length, byType(catalog, 'cuisson').length);
});

test('fillWeek fills only holes with seasonal, varied picks', () => {
  const catalog = buildCatalog();
  const week = '2026-W44';
  const meals = {
    [slotKey(week, 'lundi', 'midi')]: {
      key: slotKey(week, 'lundi', 'midi'), semaine: week, jour: 'lundi', repas: 'midi',
      legume: 'tomate', cuisson: '', proteine: 'poulet', feculent: '', libre: false,
    },
    [slotKey(week, 'mardi', 'soir')]: {
      key: slotKey(week, 'mardi', 'soir'), semaine: week, jour: 'mardi', repas: 'soir',
      legume: '', cuisson: '', proteine: '', feculent: '', libre: true,
    },
  };
  const changed = fillWeek(week, meals, catalog, ['midi', 'soir'], seeded(42));
  assert.equal(changed.length, 13);
  const lundi = changed.find((s) => s.jour === 'lundi' && s.repas === 'midi');
  assert.equal(lundi.legume, 'tomate');
  assert.equal(lundi.proteine, 'poulet');
  assert.ok(cuissonCandidates(catalog, 'tomate').includes(lundi.cuisson));
  assert.ok(!changed.some((s) => s.jour === 'mardi' && s.repas === 'soir'));
  const october = new Set(byType(catalog, 'legume').filter((i) => inSeason(i, 10)).map((i) => i.id));
  for (const slot of changed.filter((s) => s !== lundi)) {
    assert.ok(october.has(slot.legume), `${slot.legume} should be in season`);
    assert.ok(cuissonCandidates(catalog, slot.legume).includes(slot.cuisson));
    assert.ok(slot.proteine && slot.feculent);
  }
  const legumes = changed.map((s) => s.legume);
  assert.equal(new Set(legumes).size, legumes.length);
  for (let i = 1; i < changed.length; i++) {
    assert.notEqual(changed[i].proteine, changed[i - 1].proteine);
  }
});

test('fillWeek returns nothing when the week is full', () => {
  const catalog = buildCatalog();
  const week = '2026-W44';
  const first = fillWeek(week, {}, catalog, ['soir'], seeded(3));
  const meals = Object.fromEntries(first.map((s) => [s.key, s]));
  assert.deepEqual(fillWeek(week, meals, catalog, ['soir'], seeded(4)), []);
});

test('shopping list aggregates ingredients and skips libre meals', () => {
  const catalog = buildCatalog();
  const week = '2026-W44';
  const slot = (jour, repas, extra) => ({
    key: slotKey(week, jour, repas), semaine: week, jour, repas,
    legume: 'carotte', cuisson: 'vapeur', proteine: 'poulet', feculent: 'riz', libre: false, ...extra,
  });
  const rows = [slot('lundi', 'midi'), slot('lundi', 'soir', { proteine: 'oeufs' }), slot('mardi', 'midi', { libre: true })];
  const meals = Object.fromEntries(rows.map((r) => [r.key, r]));
  const items = shoppingItems(week, meals, catalog, ['midi', 'soir']);
  assert.deepEqual(items.map((i) => [i.id, i.count]), [['carotte', 2], ['oeufs', 1], ['poulet', 1], ['riz', 2]]);
  const text = shoppingText('Courses', items, [{ article: 'Lait', coche: false }, { article: 'Pain', coche: true }], new Set(['poulet']));
  assert.match(text, /Carotte \(×2\)/);
  assert.doesNotMatch(text, /Poulet/);
  assert.match(text, /- Lait/);
  assert.doesNotMatch(text, /Pain/);
});
