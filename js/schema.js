import { parseItems, slugify } from './planner.js';

export const TABLES = {
  Repas: {
    semaine: 'text', jour: 'text', repas: 'text',
    legume: 'text', cuisson: 'text', proteine: 'text', feculent: 'text',
    libre: 'bool', autres: 'items', reprise: 'text', nom: 'text',
  },
  Catalogue: {
    type: 'text', nom: 'text', emoji: 'text', mois: 'numbers', cuissons: 'list', famille: 'text', supprime: 'bool',
  },
  Courses: {
    semaine: 'text', article: 'text', coche: 'bool', extra: 'bool', supprime: 'bool',
  },
  Favoris: {
    nom: 'text', legume: 'text', cuisson: 'text', proteine: 'text', feculent: 'text', autres: 'items', supprime: 'bool',
  },
};

export const TABLE_NAMES = Object.keys(TABLES);

const TRUE_VALUES = new Set(['x', 'oui', 'true', 'vrai', '1', 'yes']);

const encoders = {
  text: (v) => (v == null ? '' : String(v)),
  bool: (v) => (v ? 'x' : ''),
  numbers: (v) => (Array.isArray(v) ? v.join(', ') : ''),
  list: (v) => (Array.isArray(v) ? v.join(', ') : ''),
  items: (v) => (Array.isArray(v) ? v.join(', ') : ''),
};

const decoders = {
  text: (v) => (v == null ? '' : String(v).trim()),
  bool: (v) => v === true || TRUE_VALUES.has(String(v ?? '').trim().toLowerCase()),
  numbers: (v) => String(v ?? '').split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 12),
  list: (v) => String(v ?? '').split(/[\s,;]+/).filter(Boolean),
  items: (v) => parseItems(v),
};

export function toSheetRow(table, row) {
  const out = { key: row.key };
  for (const [field, kind] of Object.entries(TABLES[table])) out[field] = encoders[kind](row[field]);
  out.updatedAt = String(row.updatedAt ?? 0);
  return out;
}

export function fromSheetRow(table, raw) {
  const row = {};
  for (const [field, kind] of Object.entries(TABLES[table])) row[field] = decoders[kind](raw[field]);
  row.key = String(raw.key ?? '').trim() || (table === 'Catalogue' && row.nom ? slugify(row.nom) : '');
  row.updatedAt = Number(raw.updatedAt) || 0;
  return row;
}

export function missingTables(data = {}) {
  return TABLE_NAMES.filter((table) => !Array.isArray(data?.[table]));
}

export function fromSheetData(data = {}) {
  const tables = {};
  for (const table of TABLE_NAMES) {
    tables[table] = {};
    for (const raw of data[table] ?? []) {
      const row = fromSheetRow(table, raw);
      if (row.key) tables[table][row.key] = row;
    }
  }
  return tables;
}
