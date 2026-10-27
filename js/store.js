import { TABLE_NAMES } from './schema.js';

const DATA_KEY = 'eki:data';
const SETTINGS_KEY = 'eki:settings';

const emptyTables = () => Object.fromEntries(TABLE_NAMES.map((t) => [t, {}]));

export const DEFAULT_SETTINGS = { url: '', token: '', meals: ['midi', 'soir'] };

export class Store {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.listeners = new Set();
    const data = this.read(DATA_KEY) ?? {};
    this.base = { ...emptyTables(), ...data.base };
    this.pending = { ...emptyTables(), ...data.pending };
    this.lastSync = data.lastSync ?? 0;
    this.settings = { ...DEFAULT_SETTINGS, ...this.read(SETTINGS_KEY) };
    this.cache = null;
  }

  read(key) {
    try {
      return JSON.parse(this.storage?.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  }

  write(key, value) {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {}
  }

  save() {
    this.cache = null;
    this.write(DATA_KEY, { base: this.base, pending: this.pending, lastSync: this.lastSync });
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  get syncEnabled() {
    return Boolean(this.settings.url);
  }

  table(name) {
    this.cache ??= {};
    this.cache[name] ??= { ...this.base[name], ...this.pending[name] };
    return this.cache[name];
  }

  get(name, key) {
    return this.table(name)[key];
  }

  put(name, rows) {
    const now = Date.now();
    const target = this.syncEnabled ? this.pending : this.base;
    for (const row of [].concat(rows)) target[name][row.key] = { ...row, updatedAt: now };
    this.save();
  }

  hasPending() {
    return TABLE_NAMES.some((t) => Object.keys(this.pending[t]).length);
  }

  pendingCount() {
    return TABLE_NAMES.reduce((n, t) => n + Object.keys(this.pending[t]).length, 0);
  }

  snapshotPending() {
    return Object.fromEntries(TABLE_NAMES.map((t) => [t, Object.values(this.pending[t])]));
  }

  applyRemote(tables, sent = null) {
    this.base = { ...emptyTables(), ...tables };
    if (sent) {
      for (const [table, rows] of Object.entries(sent)) {
        for (const row of rows) {
          if (this.pending[table][row.key]?.updatedAt === row.updatedAt) delete this.pending[table][row.key];
        }
      }
    }
    this.lastSync = Date.now();
    this.save();
  }

  adoptLocalAsPending() {
    for (const t of TABLE_NAMES) this.pending[t] = { ...this.base[t], ...this.pending[t] };
    this.save();
  }

  flattenPending() {
    for (const t of TABLE_NAMES) this.base[t] = { ...this.base[t], ...this.pending[t] };
    this.pending = emptyTables();
    this.save();
  }

  replaceAll(tables) {
    this.base = { ...emptyTables(), ...tables };
    this.pending = emptyTables();
    if (this.syncEnabled) this.adoptLocalAsPending();
    else this.save();
  }

  exportData() {
    return Object.fromEntries(TABLE_NAMES.map((t) => [t, this.table(t)]));
  }

  updateSettings(patch) {
    const wasEnabled = this.syncEnabled;
    const previousUrl = this.settings.url;
    this.settings = { ...this.settings, ...patch };
    this.write(SETTINGS_KEY, this.settings);
    if (this.syncEnabled && this.settings.url !== previousUrl) this.adoptLocalAsPending();
    else if (wasEnabled && !this.syncEnabled) this.flattenPending();
    else this.emit();
  }
}
