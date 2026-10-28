import test from 'node:test';
import assert from 'node:assert/strict';
import { fromSheetData, fromSheetRow, toSheetRow } from '../js/schema.js';
import { Store } from '../js/store.js';
import { Sync } from '../js/sync.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

function fakeServer() {
  const tables = { Repas: [], Catalogue: [], Courses: [] };
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.token !== 'secret') return { ok: true, text: async () => JSON.stringify({ ok: false, error: 'Jeton invalide' }) };
      for (const [name, rows] of Object.entries(body.changes)) {
        for (const row of rows) {
          const i = tables[name].findIndex((r) => r.key === row.key);
          if (i === -1) tables[name].push(row);
          else if (Number(tables[name][i].updatedAt) <= Number(row.updatedAt)) tables[name][i] = row;
        }
      }
    }
    return { ok: true, text: async () => JSON.stringify({ ok: true, data: tables }) };
  };
  return { tables, calls, fetch };
}

test('sheet row round trip', () => {
  const row = { key: 'patisson', type: 'legume', nom: 'Pâtisson', emoji: '🎃', mois: [9, 10], cuissons: ['four', 'gratin'], famille: '', supprime: false, updatedAt: 12 };
  const sheet = toSheetRow('Catalogue', row);
  assert.deepEqual(sheet, { key: 'patisson', type: 'legume', nom: 'Pâtisson', emoji: '🎃', mois: '9, 10', cuissons: 'four, gratin', famille: '', supprime: '', updatedAt: '12' });
  assert.deepEqual(fromSheetRow('Catalogue', sheet), row);
});

test('free ingredients keep their spaces in the sheet', () => {
  const row = { key: 'w|lundi|soir', semaine: 'w', jour: 'lundi', repas: 'soir', legume: '', cuisson: '', proteine: '', feculent: '', libre: false, autres: ['sauce tomate', 'parmesan'], reprise: 'w|dimanche|soir', updatedAt: 3 };
  const sheet = toSheetRow('Repas', row);
  assert.equal(sheet.autres, 'sauce tomate, parmesan');
  assert.deepEqual(fromSheetRow('Repas', sheet), row);
  assert.deepEqual(fromSheetRow('Repas', { key: 'k', autres: 'pain de mie;\nbeurre ' }).autres, ['pain de mie', 'beurre']);
});

test('rows typed by hand in the sheet are understood', () => {
  const data = fromSheetData({ Catalogue: [{ nom: 'Céleri branche', type: 'legume', mois: '7;8 9', supprime: 'non' }, { nom: '' }] });
  const row = data.Catalogue['celeri-branche'];
  assert.deepEqual(row.mois, [7, 8, 9]);
  assert.equal(row.supprime, false);
  assert.equal(Object.keys(data.Catalogue).length, 1);
});

test('local data is uploaded when connecting, then pending is cleared', async () => {
  const server = fakeServer();
  const store = new Store(new MemoryStorage());
  store.put('Courses', { key: '2026-W44|x:1', semaine: '2026-W44', article: 'Lait', coche: false, extra: true, supprime: false });
  assert.equal(store.hasPending(), false);
  store.updateSettings({ url: 'https://script.google.com/macros/s/abc/exec', token: 'secret' });
  assert.equal(store.pendingCount(), 1);
  const sync = new Sync(store, server.fetch);
  await sync.run();
  assert.equal(sync.status, 'idle');
  assert.equal(store.hasPending(), false);
  assert.equal(server.tables.Courses[0].article, 'Lait');
  assert.equal(store.get('Courses', '2026-W44|x:1').article, 'Lait');
});

test('two devices share data and last write wins', async () => {
  const server = fakeServer();
  const settings = { url: 'https://script.google.com/macros/s/abc/exec', token: 'secret' };
  const a = new Store(new MemoryStorage());
  const b = new Store(new MemoryStorage());
  a.updateSettings(settings);
  b.updateSettings(settings);
  const syncA = new Sync(a, server.fetch);
  const syncB = new Sync(b, server.fetch);
  const slot = { key: '2026-W44|lundi|soir', semaine: '2026-W44', jour: 'lundi', repas: 'soir', legume: 'poireau', cuisson: 'soupe', proteine: '', feculent: '', libre: false };
  a.put('Repas', slot);
  await syncA.run();
  await syncB.run();
  assert.equal(b.get('Repas', slot.key).legume, 'poireau');
  b.put('Repas', { ...slot, legume: 'carotte' });
  await new Promise((r) => setTimeout(r, 2));
  await syncB.run();
  await syncA.run();
  assert.equal(a.get('Repas', slot.key).legume, 'carotte');
});

test('older pending changes lose against newer remote ones', async () => {
  const server = fakeServer();
  const store = new Store(new MemoryStorage());
  store.updateSettings({ url: 'https://script.google.com/macros/s/abc/exec', token: 'secret' });
  store.put('Repas', { key: 'k', semaine: 'w', jour: 'lundi', repas: 'midi', legume: 'navet', cuisson: '', proteine: '', feculent: '', libre: false });
  server.tables.Repas.push({ key: 'k', semaine: 'w', jour: 'lundi', repas: 'midi', legume: 'panais', updatedAt: String(Date.now() + 60000) });
  await new Sync(store, server.fetch).run();
  assert.equal(store.get('Repas', 'k').legume, 'panais');
  assert.equal(store.hasPending(), false);
});

test('errors are reported and pending changes kept', async () => {
  const server = fakeServer();
  const store = new Store(new MemoryStorage());
  store.updateSettings({ url: 'https://script.google.com/macros/s/abc/exec', token: 'wrong' });
  store.put('Courses', { key: 'w|x:1', semaine: 'w', article: 'Pain', coche: false, extra: true, supprime: false });
  const sync = new Sync(store, server.fetch);
  await sync.run();
  assert.equal(sync.status, 'error');
  assert.equal(sync.error, 'Jeton invalide');
  assert.equal(store.pendingCount(), 1);
});

test('disconnecting keeps local data', () => {
  const store = new Store(new MemoryStorage());
  store.updateSettings({ url: 'https://script.google.com/macros/s/abc/exec', token: 'x' });
  store.put('Courses', { key: 'w|x:1', semaine: 'w', article: 'Pain', coche: false, extra: true, supprime: false });
  store.updateSettings({ url: '', token: '' });
  assert.equal(store.hasPending(), false);
  assert.equal(store.get('Courses', 'w|x:1').article, 'Pain');
});
