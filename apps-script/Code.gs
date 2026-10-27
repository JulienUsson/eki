const TOKEN = 'change-moi';

const SHEET_ID = '';

const TABLES = ['Repas', 'Catalogue', 'Courses'];

function setup() {
  const ss = spreadsheet_();
  TABLES.forEach(sheet_);
  Logger.log('Feuille : ' + ss.getUrl());
}

function doGet(e) {
  if (e && e.parameter && e.parameter.bring) return bringPage_(e.parameters);
  return respond_(function () {
    checkToken_(e && e.parameter && e.parameter.token);
    return readAll_();
  });
}

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const changes = body.changes || {};
      Object.keys(changes).forEach(function (name) {
        if (TABLES.indexOf(name) !== -1) upsert_(name, changes[name] || []);
      });
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return readAll_();
  });
}

let spreadsheetCache_ = null;

function spreadsheet_() {
  if (spreadsheetCache_) return spreadsheetCache_;
  const props = PropertiesService.getScriptProperties();
  const id = SHEET_ID || props.getProperty('SHEET_ID');
  let ss = SpreadsheetApp.getActiveSpreadsheet() || (id && SpreadsheetApp.openById(id));
  if (!ss) {
    ss = SpreadsheetApp.create('Eki · repas');
    ss.getSheets()[0].setName(TABLES[0]);
    props.setProperty('SHEET_ID', ss.getId());
  }
  spreadsheetCache_ = ss;
  return ss;
}

function bringPage_(params) {
  const escape = function (text) {
    return String(text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  const title = String((params.titre || ['Courses'])[0]).slice(0, 200);
  const items = (params.i || []).map(String).filter(Boolean).slice(0, 300);
  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: title,
    author: { '@type': 'Person', name: 'Eki' },
    recipeYield: '1',
    recipeIngredient: items,
  };
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + escape(title) + '</title>'
    + '<script type="application/ld+json">' + JSON.stringify(recipe).replace(/</g, '\\u003c') + '</script></head>'
    + '<body><h1>' + escape(title) + '</h1><ul>'
    + items.map(function (item) { return '<li>' + escape(item) + '</li>'; }).join('')
    + '</ul></body></html>';
  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.TEXT);
}

function respond_(fn) {
  let payload;
  try {
    payload = { ok: true, data: fn() };
  } catch (err) {
    payload = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  if (String(token || '') !== TOKEN) throw new Error('Jeton invalide');
}

function sheet_(name) {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange('A:Z').setNumberFormat('@');
  }
  return sheet;
}

function readTable_(name) {
  const sheet = sheet_(name);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const header = values[0];
  return values.slice(1)
    .filter(function (row) { return row.some(function (cell) { return cell !== ''; }); })
    .map(function (row) {
      const obj = {};
      header.forEach(function (col, i) { if (col) obj[col] = row[i]; });
      return obj;
    });
}

function readAll_() {
  const data = {};
  TABLES.forEach(function (name) { data[name] = readTable_(name); });
  return data;
}

function upsert_(name, rows) {
  if (!rows.length) return;
  const sheet = sheet_(name);
  const values = sheet.getDataRange().getDisplayValues();
  let header = values.length && values[0].some(function (c) { return c !== ''; }) ? values[0].slice() : [];
  rows.forEach(function (row) {
    Object.keys(row).forEach(function (col) {
      if (header.indexOf(col) === -1) header.push(col);
    });
  });
  const keyCol = header.indexOf('key');
  const updatedCol = header.indexOf('updatedAt');
  const grid = values.length && values[0].some(function (c) { return c !== ''; }) ? values.slice(1) : [];
  const index = {};
  grid.forEach(function (line, i) { index[line[keyCol]] = i; });

  rows.forEach(function (row) {
    if (!row.key) return;
    const line = header.map(function (col) { return row[col] == null ? '' : String(row[col]); });
    const at = index[row.key];
    if (at === undefined) {
      index[row.key] = grid.length;
      grid.push(line);
    } else if (Number(grid[at][updatedCol] || 0) <= Number(row.updatedAt || 0)) {
      grid[at] = line;
    }
  });

  const out = [header].concat(grid.map(function (line) {
    const full = line.slice(0, header.length);
    while (full.length < header.length) full.push('');
    return full;
  }));
  const range = sheet.getRange(1, 1, out.length, header.length);
  range.setNumberFormat('@');
  range.setValues(out);
  sheet.setFrozenRows(1);
}
