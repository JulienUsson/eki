import { fromSheetData, missingTables, toSheetRow, TABLE_NAMES } from './schema.js';

export class Sync {
  constructor(store, fetchImpl = (...args) => globalThis.fetch(...args)) {
    this.store = store;
    this.fetch = fetchImpl;
    this.status = 'idle';
    this.error = '';
    this.running = null;
    this.again = false;
    this.timer = null;
    this.listeners = new Set();
    this.missing = [];
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setStatus(status, error = '') {
    this.status = status;
    this.error = error;
    for (const fn of this.listeners) fn(this);
  }

  async request(body) {
    const { url, token } = this.store.settings;
    const response = body
      ? await this.fetch(url, { method: 'POST', body: JSON.stringify({ token, ...body }) })
      : await this.fetch(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Réponse inattendue : vérifie l’URL du script et ses droits d’accès (« Tout le monde »).');
    }
    if (!json.ok) throw new Error(json.error || 'Erreur inconnue');
    return json.data;
  }

  schedule(delay = 1500) {
    clearTimeout(this.timer);
    if (!this.store.syncEnabled) return;
    this.timer = setTimeout(() => this.run(), delay);
  }

  run() {
    if (!this.store.syncEnabled) {
      this.setStatus('idle');
      return Promise.resolve();
    }
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.once()
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.run();
        }
      });
    return this.running;
  }

  async once() {
    this.setStatus('syncing');
    try {
      if (this.store.hasPending()) {
        const sent = this.store.snapshotPending();
        const changes = Object.fromEntries(
          TABLE_NAMES.map((t) => [t, sent[t].map((row) => toSheetRow(t, row))]).filter(([, rows]) => rows.length),
        );
        const data = await this.request({ changes });
        this.missing = missingTables(data);
        this.store.applyRemote(fromSheetData(data), sent, this.missing);
      } else {
        const data = await this.request();
        this.missing = missingTables(data);
        this.store.applyRemote(fromSheetData(data), null, this.missing);
      }
      this.setStatus('idle');
    } catch (err) {
      this.setStatus('error', err.message || String(err));
    }
  }
}
