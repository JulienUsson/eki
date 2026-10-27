import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fakeSheet() {
  let grid = [];
  const range = (r, c, rows, cols) => ({
    setNumberFormat() { return this; },
    setValues(values) {
      for (let i = 0; i < rows; i++) {
        grid[r - 1 + i] ??= [];
        for (let j = 0; j < cols; j++) grid[r - 1 + i][c - 1 + j] = String(values[i][j]);
      }
      return this;
    },
  });
  return {
    get grid() { return grid; },
    set grid(g) { grid = g; },
    getDataRange() {
      const width = Math.max(1, ...grid.map((row) => row.length));
      const rows = grid.length ? grid : [[]];
      return { getDisplayValues: () => rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? '')) };
    },
    getRange(a, b, c, d) { return typeof a === 'string' ? range(1, 1, 0, 0) : range(a, b, c, d); },
    setFrozenRows() {},
  };
}

function loadScript({ bound = true } = {}) {
  const sheets = {};
  const props = {};
  const created = [];
  const spreadsheet = {
    getSheetByName: (name) => sheets[name] ?? null,
    insertSheet: (name) => (sheets[name] = fakeSheet()),
    getSheets: () => Object.values(sheets),
    getId: () => 'sheet-123',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/sheet-123',
  };
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (bound ? spreadsheet : null),
      openById: (id) => (id === 'sheet-123' && created.length ? spreadsheet : null),
      create: (name) => {
        created.push(name);
        const first = fakeSheet();
        first.setName = (n) => { sheets[n] = first; };
        return { ...spreadsheet, getSheets: () => [first] };
      },
      flush() {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props[k] ?? null,
        setProperty: (k, v) => { props[k] = v; },
      }),
    },
    Logger: { log() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  const source = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  let ctx = { ...context };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const call = (fn, arg) => JSON.parse(ctx[fn](arg).text);
  return {
    sheets,
    props,
    created,
    reload() {
      ctx = { ...context };
      vm.createContext(ctx);
      vm.runInContext(source, ctx);
    },
    get: (token) => call('doGet', { parameter: { token } }),
    post: (body) => call('doPost', { postData: { contents: JSON.stringify(body) } }),
  };
}

test('rejects a wrong token', () => {
  const script = loadScript();
  assert.deepEqual(script.get('nope'), { ok: false, error: 'Jeton invalide' });
  assert.equal(script.post({ token: 'nope', changes: {} }).ok, false);
});

test('creates tables and upserts with last write wins', () => {
  const script = loadScript();
  const row = { key: 'w|lundi|soir', semaine: 'w', jour: 'lundi', repas: 'soir', legume: 'poireau', updatedAt: '10' };
  let res = script.post({ token: 'change-moi', changes: { Repas: [row] } });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.Repas, [row]);
  assert.deepEqual(res.data.Courses, []);

  res = script.post({ token: 'change-moi', changes: { Repas: [{ ...row, legume: 'navet', updatedAt: '5' }] } });
  assert.equal(res.data.Repas[0].legume, 'poireau');

  res = script.post({ token: 'change-moi', changes: { Repas: [{ ...row, legume: 'carotte', updatedAt: '20' }, { ...row, key: 'w|mardi|soir', jour: 'mardi', updatedAt: '20' }] } });
  assert.deepEqual(res.data.Repas.map((r) => r.legume), ['carotte', 'poireau']);
  assert.deepEqual(script.sheets.Repas.grid[0], ['key', 'semaine', 'jour', 'repas', 'legume', 'updatedAt']);
  assert.deepEqual(script.get('change-moi').data.Repas.length, 2);
});

test('keeps columns added by hand and adds new ones', () => {
  const script = loadScript();
  script.post({ token: 'change-moi', changes: { Courses: [{ key: 'a', article: 'Lait', updatedAt: '1' }] } });
  script.sheets.Courses.grid[0].push('note');
  script.sheets.Courses.grid[1].push('demi-écrémé');
  const res = script.post({ token: 'change-moi', changes: { Courses: [{ key: 'b', article: 'Pain', coche: 'x', updatedAt: '2' }] } });
  assert.deepEqual(script.sheets.Courses.grid[0], ['key', 'article', 'updatedAt', 'note', 'coche']);
  assert.equal(res.data.Courses[0].note, 'demi-écrémé');
  assert.equal(res.data.Courses[1].coche, 'x');
});

test('standalone script creates its spreadsheet once and reuses it', () => {
  const script = loadScript({ bound: false });
  const row = { key: 'a', article: 'Lait', updatedAt: '1' };
  assert.equal(script.post({ token: 'change-moi', changes: { Courses: [row] } }).data.Courses[0].article, 'Lait');
  assert.deepEqual(script.created, ['Eki · repas']);
  assert.equal(script.props.SHEET_ID, 'sheet-123');
  script.reload();
  assert.equal(script.get('change-moi').data.Courses[0].article, 'Lait');
  assert.deepEqual(script.created, ['Eki · repas']);
});
