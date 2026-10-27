import { AUTRE, DAYS, DEFAULT_CATALOG, MEALS, MONTHS, SHOPPING_GROUPS, SHORT_MONTHS, SLOT_FIELDS, TYPES, groupInfo } from './data.js';
import { dayLabel, shiftWeek, weekDates, weekId, weekLabel, weekMonth, weekNumber } from './dates.js';
import {
  buildCatalog, byType, cuissonCandidates, emptySlot, fillSlot, fillWeek, inSeason, isPlanned, parseItems,
  bringDeeplink, pendingLines, seasonalLegumes, shopKey, shoppingItems, shoppingText, slotContent, slugify, weekSlots, weekUsage,
} from './planner.js';
import { buildInvite, hasInvite, parseInvite } from './invite.js';
import { TABLE_NAMES } from './schema.js';
import { Store } from './store.js';
import { Sync } from './sync.js';

const store = new Store();
const sync = new Sync(store);

const ui = {
  tab: 'semaine',
  week: weekId(),
  month: new Date().getMonth() + 1,
  picker: null,
  reprise: null,
};

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $badge = document.getElementById('sync-badge');
const $toast = document.getElementById('toast');

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let catalogCache = null;
function catalog() {
  catalogCache ??= buildCatalog(store.table('Catalogue'));
  return catalogCache;
}

function itemById(id) {
  return catalog().find((item) => item.id === id);
}

function mealIds() {
  const enabled = store.settings.meals?.length ? store.settings.meals : ['midi', 'soir'];
  return MEALS.map((m) => m.id).filter((id) => enabled.includes(id));
}

function toast(message) {
  $toast.textContent = message;
  $toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

function commit(table, rows) {
  store.put(table, rows);
  sync.schedule();
}

function slotOf(key) {
  const [week, day, meal] = key.split('|');
  return store.get('Repas', key) ?? emptySlot(week, day, meal);
}

function cleanSlot(slot) {
  const { updatedAt, ...rest } = slot;
  return rest;
}

function isToday(d) {
  const now = new Date();
  return d.getUTCFullYear() === now.getFullYear() && d.getUTCMonth() === now.getMonth() && d.getUTCDate() === now.getDate();
}

function weekCounts(week) {
  const meals = store.table('Repas');
  return weekUsage(weekSlots(week, meals, mealIds()), meals);
}

function slotLabel(key) {
  const [, day, meal] = key.split('|');
  return `${capitalize(day)} ${MEALS.find((m) => m.id === meal)?.label.toLowerCase() ?? meal}`;
}

function slotSummary(slot) {
  const names = SLOT_FIELDS.map((f) => itemById(slot?.[f])?.name ?? slot?.[f]).filter(Boolean);
  return [...names, ...parseItems(slot?.autres)].join(' · ');
}

function reprisesOf(key) {
  return Object.values(store.table('Repas')).filter((row) => row.reprise === key && !row.libre);
}

function knownAutres() {
  const counts = new Map();
  for (const row of Object.values(store.table('Repas'))) {
    for (const name of parseItems(row.autres)) {
      const slug = slugify(name);
      const entry = counts.get(slug) ?? { name, count: 0 };
      entry.count += 1;
      counts.set(slug, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr')).map((e) => e.name);
}

function weekNav() {
  const current = ui.week === weekId();
  return `
    <section class="week-nav">
      <button type="button" class="icon-btn" data-action="week-shift" data-delta="-1" aria-label="Semaine précédente">‹</button>
      <button type="button" class="week-title" data-action="week-today" ${current ? 'disabled' : ''}>
        <strong>Semaine ${weekNumber(ui.week)}</strong>
        <small>${weekLabel(ui.week)}${current ? ' · cette semaine' : ' · revenir à aujourd’hui'}</small>
      </button>
      <button type="button" class="icon-btn" data-action="week-shift" data-delta="1" aria-label="Semaine suivante">›</button>
    </section>`;
}

function chip(slot, field) {
  const item = itemById(slot[field]);
  const month = weekMonth(slot.semaine);
  const off = item && field === 'legume' && !inSeason(item, month);
  const mismatch = item && field === 'cuisson' && slot.legume && !cuissonCandidates(catalog(), slot.legume).includes(item.id);
  const free = !item && slot[field];
  const cls = ['chip', `chip-${field}`, item || free ? '' : 'empty', off ? 'warn' : '', mismatch ? 'warn' : ''].join(' ');
  const label = item ? `${item.emoji} ${esc(item.name)}` : free ? `✏️ ${esc(slot[field])}` : `+ ${TYPES[field].label}`;
  const title = off ? ' title="Hors saison"' : mismatch ? ' title="Cuisson peu adaptée à ce légume"' : free ? ' title="Hors catalogue"' : '';
  return `<button type="button" class="${cls}" data-action="pick" data-slot="${esc(slot.key)}" data-field="${field}"${title}>${label}</button>`;
}

function renderWeek() {
  const meals = store.table('Repas');
  const ids = mealIds();
  const dates = weekDates(ui.week);
  const slots = weekSlots(ui.week, meals, ids);
  const holes = slots.filter((s) => !s.libre && !s.reprise && SLOT_FIELDS.some((f) => !s[f])).length;
  const days = DAYS.map((day, i) => {
    const mealsHtml = ids.map((mealId) => {
      const slot = slots.find((s) => s.jour === day && s.repas === mealId);
      const meal = MEALS.find((m) => m.id === mealId);
      const twins = slot.reprise ? [] : reprisesOf(slot.key).filter((r) => r.semaine === ui.week);
      let body;
      if (slot.libre) {
        body = `<p class="libre-note">Repas libre (resto, invités…)</p>`;
      } else if (slot.reprise) {
        const source = slotContent(slot, meals);
        body = `
          <button type="button" class="reprise" data-action="slot-menu" data-slot="${esc(slot.key)}">
            <span>🔁 Restes de ${esc(slotLabel(slot.reprise).toLowerCase())}</span>
            <small>${source ? esc(slotSummary(source)) || 'repas pas encore choisi' : 'repas d’origine introuvable'}</small>
          </button>`;
      } else {
        const autres = parseItems(slot.autres);
        body = `
          <div class="chips">${SLOT_FIELDS.map((f) => chip(slot, f)).join('')}
            <button type="button" class="chip chip-autre ${autres.length ? '' : 'empty'}" data-action="edit-autres" data-slot="${esc(slot.key)}">${autres.length ? `${AUTRE.emoji} ${esc(autres.join(', '))}` : `+ ${AUTRE.label}`}</button>
          </div>`;
      }
      return `
        <div class="meal ${slot.libre ? 'is-libre' : ''} ${slot.reprise ? 'is-reprise' : ''}">
          <div class="meal-head">
            <span class="meal-name">${meal.label}${twins.length ? `<span class="twin" title="Cuisiné en double">👯 aussi ${esc(twins.map((t) => slotLabel(t.key).toLowerCase()).join(', '))}</span>` : ''}</span>
            <span class="meal-tools">
              ${slot.libre || slot.reprise ? '' : `<button type="button" class="icon-btn small" data-action="slot-dice" data-slot="${esc(slot.key)}" aria-label="Compléter ce repas au hasard">🎲</button>`}
              <button type="button" class="icon-btn small" data-action="slot-menu" data-slot="${esc(slot.key)}" aria-label="Options du repas">⋯</button>
            </span>
          </div>
          ${body}
        </div>`;
    }).join('');
    return `
      <article class="day ${isToday(dates[i]) ? 'today' : ''}">
        <h2>${capitalize(day)} <small>${dayLabel(dates[i])}</small></h2>
        ${mealsHtml}
      </article>`;
  }).join('');
  return `
    ${weekNav()}
    <div class="toolbar">
      <button type="button" class="btn primary" data-action="fill-week" ${holes ? '' : 'disabled'}>🎲 Compléter les trous${holes ? ` (${holes})` : ''}</button>
      <button type="button" class="btn" data-action="clear-week">Vider</button>
    </div>
    <p class="hint">Les propositions utilisent les légumes de saison de ${MONTHS[weekMonth(ui.week) - 1]} et évitent les répétitions.</p>
    <div class="days">${days}</div>`;
}

function seasonBar(item) {
  return `<span class="season-bar" aria-label="Saison">${MONTHS.map((m, i) => `<i class="${item.months?.includes(i + 1) ? 'on' : ''}" title="${m}"></i>`).join('')}</span>`;
}

function legumeCard(item) {
  const cuissons = (item.cuissons ?? []).map((id) => itemById(id)).filter(Boolean);
  return `
    <button type="button" class="card-item" data-action="edit-item" data-id="${esc(item.id)}">
      <span class="emoji">${item.emoji || '🥬'}</span>
      <span class="name">${esc(item.name)}</span>
      <span class="cuissons">${cuissons.map((c) => `<span title="${esc(c.name)}">${c.emoji}</span>`).join('')}</span>
      ${seasonBar(item)}
    </button>`;
}

function renderSeason() {
  const month = ui.month;
  const legumes = byType(catalog(), 'legume');
  const seasonal = legumes.filter((item) => inSeason(item, month));
  const others = legumes.filter((item) => !inSeason(item, month));
  const deleted = Object.values(store.table('Catalogue')).filter((row) => row.supprime && DEFAULT_CATALOG.some((d) => d.id === row.key));
  const section = (type) => `
    <section class="block">
      <div class="block-head">
        <h2>${TYPES[type].emoji} ${TYPES[type].plural}</h2>
        <button type="button" class="btn small" data-action="new-item" data-type="${type}">+ Ajouter</button>
      </div>
      <div class="tags">${byType(catalog(), type).map((item) => `
        <button type="button" class="tag" data-action="edit-item" data-id="${esc(item.id)}">${item.emoji} ${esc(item.name)}</button>`).join('')}
      </div>
    </section>`;
  return `
    <div class="months" role="tablist">
      ${MONTHS.map((m, i) => `<button type="button" role="tab" class="month ${i + 1 === month ? 'active' : ''}" aria-selected="${i + 1 === month}" data-action="month" data-month="${i + 1}">${SHORT_MONTHS[i].replace('.', '')}</button>`).join('')}
    </div>
    <section class="block">
      <div class="block-head">
        <h2>🥕 De saison en ${MONTHS[month - 1]} <small>(${seasonal.length})</small></h2>
        <button type="button" class="btn small" data-action="new-item" data-type="legume">+ Ajouter</button>
      </div>
      <div class="grid">${seasonal.map(legumeCard).join('')}</div>
      ${others.length ? `
        <details class="more">
          <summary>Hors saison (${others.length})</summary>
          <div class="grid">${others.map(legumeCard).join('')}</div>
        </details>` : ''}
    </section>
    ${['cuisson', 'proteine', 'feculent'].map(section).join('')}
    ${deleted.length ? `
      <details class="more">
        <summary>Ingrédients masqués (${deleted.length})</summary>
        <div class="tags">${deleted.map((row) => {
          const d = DEFAULT_CATALOG.find((x) => x.id === row.key);
          return `<button type="button" class="tag" data-action="restore-item" data-id="${esc(row.key)}">↺ ${d.emoji} ${esc(d.name)}</button>`;
        }).join('')}</div>
      </details>` : ''}`;
}

function shoppingState(week) {
  const rows = Object.values(store.table('Courses')).filter((row) => row.semaine === week && !row.supprime);
  const checked = new Set(rows.filter((r) => !r.extra && r.coche).map((r) => r.key.slice(week.length + 1)));
  const extras = rows.filter((r) => r.extra).sort((a, b) => a.updatedAt - b.updatedAt);
  return { checked, extras };
}

function renderShopping() {
  const items = shoppingItems(ui.week, store.table('Repas'), catalog(), mealIds());
  const { checked, extras } = shoppingState(ui.week);
  const groups = SHOPPING_GROUPS.map((type) => {
    const group = items.filter((i) => i.type === type)
      .sort((a, b) => Number(checked.has(a.id)) - Number(checked.has(b.id)));
    if (!group.length) return '';
    return `
      <section class="block">
        <h2>${groupInfo(type).emoji} ${groupInfo(type).plural}</h2>
        <ul class="checklist">${group.map((item) => `
          <li class="${checked.has(item.id) ? 'done' : ''}">
            <label>
              <input type="checkbox" data-action="toggle-shop" data-id="${esc(item.id)}" data-name="${esc(item.name)}" ${checked.has(item.id) ? 'checked' : ''}>
              <span class="emoji">${item.emoji}</span>
              <span class="name">${esc(item.name)}</span>
              <span class="qty">${item.count} repas</span>
            </label>
          </li>`).join('')}
        </ul>
      </section>`;
  }).join('');
  return `
    ${weekNav()}
    <div class="toolbar">
      <button type="button" class="btn primary" data-action="share-list">📤 Partager</button>
      <button type="button" class="btn" data-action="copy-list">📋 Copier</button>
      <button type="button" class="btn" data-action="bring">🛒 Bring!</button>
      <button type="button" class="btn" data-action="uncheck-all">Tout décocher</button>
    </div>
    ${items.length ? groups : `
      <div class="empty">
        <p>Aucun ingrédient pour cette semaine.</p>
        <button type="button" class="btn primary" data-tab="semaine">📅 Planifier les repas</button>
      </div>`}
    <section class="block">
      <h2>🛒 Divers</h2>
      <ul class="checklist">${extras.map((row) => `
        <li class="${row.coche ? 'done' : ''}">
          <label>
            <input type="checkbox" data-action="toggle-extra" data-key="${esc(row.key)}" ${row.coche ? 'checked' : ''}>
            <span class="name">${esc(row.article)}</span>
          </label>
          <button type="button" class="icon-btn small" data-action="remove-extra" data-key="${esc(row.key)}" aria-label="Supprimer">✕</button>
        </li>`).join('')}
      </ul>
      <form class="inline-form" data-form="add-extra">
        <input name="article" placeholder="Ajouter un article (lait, pain…)" autocomplete="off" enterkeyhint="done">
        <button type="submit" class="btn">Ajouter</button>
      </form>
    </section>`;
}

function syncStatusText() {
  if (!store.syncEnabled) return 'Non connecté : les données restent sur cet appareil.';
  if (sync.status === 'syncing') return 'Synchronisation en cours…';
  if (sync.status === 'error') return `⚠️ ${esc(sync.error)}`;
  const pending = store.pendingCount();
  const last = store.lastSync ? new Date(store.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';
  return `✅ Connecté · dernière synchro : ${last}${pending ? ` · ${pending} modification(s) en attente` : ''}`;
}

function renderSettings() {
  const { url, token } = store.settings;
  const ids = mealIds();
  return `
    <section class="block card">
      <h2>☁️ Partage via Google Sheets</h2>
      <p class="status ${sync.status === 'error' ? 'error' : ''}" data-sync-status>${syncStatusText()}</p>
      <form class="stack" data-form="sync">
        <label>URL du script (…/exec) ou lien d’invitation
          <input name="url" type="text" inputmode="url" value="${esc(url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off">
        </label>
        <label>Jeton secret
          <input name="token" type="text" value="${esc(token)}" placeholder="le TOKEN défini dans le script" autocomplete="off">
        </label>
        <div class="toolbar">
          <button type="submit" class="btn primary">${url ? 'Enregistrer' : 'Connecter'}</button>
          ${url ? `
            <button type="button" class="btn" data-action="sync-now">🔄 Synchroniser</button>
            <button type="button" class="btn" data-action="share-access">🔗 Inviter</button>
            <button type="button" class="btn danger" data-action="disconnect">Déconnecter</button>` : ''}
        </div>
      </form>
      <details class="more">
        <summary>Comment créer la feuille partagée ?</summary>
        <ol class="steps">
          <li>Ouvre <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> (sur Android : Chrome en <b>version pour ordinateur</b>) et crée un <b>nouveau projet</b>.</li>
          <li>Remplace tout le contenu par le script :
            <button type="button" class="btn small" data-action="copy-script">📋 Copier le script</button></li>
          <li>Change la valeur de <code>TOKEN</code> en haut du script par un mot de passe à vous.</li>
          <li>Clique sur <b>Exécuter</b> (fonction <code>setup</code>) et autorise l’accès : la feuille « Eki · repas » est créée dans ton Drive.</li>
          <li><b>Déployer → Nouveau déploiement</b>, type <b>Application Web</b>, « Exécuter en tant que : <b>moi</b> », « Accès : <b>Tout le monde</b> ».</li>
          <li>Colle ici l’URL qui se termine par <code>/exec</code> et le jeton, puis <b>Connecter</b>.</li>
          <li>Sur le téléphone de ta compagne : scanne le QR code du bouton <b>🔗 Inviter</b> (ou envoie-lui le lien).</li>
        </ol>
        <p class="hint">Les onglets <b>Repas</b>, <b>Catalogue</b> et <b>Courses</b> sont créés automatiquement. « Impossible d’ouvrir le fichier » : plusieurs comptes Google sont connectés, utilise une fenêtre de navigation privée avec un seul compte.</p>
      </details>
    </section>
    <section class="block card">
      <h2>🍽️ Repas à planifier</h2>
      <div class="toggles">
        ${MEALS.map((m) => `
          <label class="toggle"><input type="checkbox" data-action="toggle-meal" data-meal="${m.id}" ${ids.includes(m.id) ? 'checked' : ''}> ${m.label}</label>`).join('')}
      </div>
    </section>
    <section class="block card">
      <h2>💾 Données</h2>
      <div class="toolbar">
        <button type="button" class="btn" data-action="export">Exporter (JSON)</button>
        <button type="button" class="btn" data-action="import">Importer…</button>
        <input type="file" accept="application/json,.json" data-input="import" hidden>
      </div>
    </section>
    <section class="block card">
      <h2>📱 Installer l’application</h2>
      <p>Sur iPhone : <b>Partager → Sur l’écran d’accueil</b>. Sur Android : menu <b>⋮ → Installer l’application</b>.</p>
      ${installPrompt ? '<button type="button" class="btn primary" data-action="install">Installer</button>' : ''}
    </section>`;
}

function renderBadge() {
  $badge.hidden = !store.syncEnabled;
  if (!store.syncEnabled) return;
  const pending = store.pendingCount();
  const map = {
    syncing: ['⟳', 'Synchronisation…', 'spin'],
    error: ['⚠️', `Erreur de synchro : ${sync.error}`, 'error'],
    idle: pending ? ['☁️', `${pending} en attente`, 'pending'] : ['☁️', 'Synchronisé', 'ok'],
  };
  const [icon, label, cls] = map[sync.status] ?? map.idle;
  $badge.className = `sync-badge ${cls}`;
  $badge.title = label;
  $badge.innerHTML = `<span aria-hidden="true">${icon}</span><span class="sr">${esc(label)}</span>`;
  const status = document.querySelector('[data-sync-status]');
  if (status) {
    status.innerHTML = syncStatusText();
    status.classList.toggle('error', sync.status === 'error');
  }
}

let deferredRender = false;

function typing() {
  const el = document.activeElement;
  return $view.contains(el) && el.matches('input:not([type="checkbox"]):not([type="file"]), textarea');
}

function render(force = false) {
  catalogCache = null;
  if (!force && typing()) {
    deferredRender = true;
    renderBadge();
    return;
  }
  deferredRender = false;
  const views = { semaine: renderWeek, saison: renderSeason, courses: renderShopping, reglages: renderSettings };
  $view.innerHTML = views[ui.tab]();
  for (const btn of document.querySelectorAll('.tabs [data-tab]')) {
    btn.classList.toggle('active', btn.dataset.tab === ui.tab);
    btn.setAttribute('aria-current', btn.dataset.tab === ui.tab ? 'page' : 'false');
  }
  renderBadge();
  const active = $view.querySelector('.month.active');
  if (active) active.parentElement.scrollLeft = active.offsetLeft - (active.parentElement.clientWidth - active.offsetWidth) / 2;
}

function openSheet(html) {
  $sheet.innerHTML = html;
  if (!$sheet.open) $sheet.showModal();
}

function closeSheet() {
  ui.picker = null;
  if ($sheet.open) $sheet.close();
}

function option(item, selected, extra = '') {
  return `<button type="button" class="option ${selected ? 'selected' : ''}" data-action="choose" data-id="${esc(item.id)}" data-search="${esc(slugify(item.name))}">
    <span class="emoji">${item.emoji}</span><span class="name">${esc(item.name)}</span>${extra}</button>`;
}

function renderPicker() {
  const { key, field } = ui.picker;
  const slot = slotOf(key);
  const counts = weekCounts(slot.semaine)[field];
  const month = weekMonth(slot.semaine);
  const used = (id) => (counts[id] ? `<span class="count">×${counts[id]}</span>` : '');
  const list = (items) => items.map((item) => option(item, slot[field] === item.id, used(item.id))).join('');
  let groups;
  if (field === 'legume') {
    const all = byType(catalog(), 'legume');
    const season = new Set(seasonalLegumes(catalog(), month));
    groups = [
      [`De saison en ${MONTHS[month - 1]}`, all.filter((i) => season.has(i.id))],
      ['Hors saison', all.filter((i) => !season.has(i.id))],
    ];
  } else if (field === 'cuisson' && slot.legume && itemById(slot.legume)) {
    const good = new Set(cuissonCandidates(catalog(), slot.legume));
    const all = byType(catalog(), 'cuisson');
    groups = [
      [`Adaptées : ${itemById(slot.legume).name}`, all.filter((i) => good.has(i.id))],
      ['Autres', all.filter((i) => !good.has(i.id))],
    ];
  } else {
    groups = [['', byType(catalog(), field)]];
  }
  const [, day, meal] = key.split('|');
  const mealLabel = MEALS.find((m) => m.id === meal)?.label.toLowerCase() ?? meal;
  openSheet(`
    <div class="sheet-head">
      <h3>${TYPES[field].emoji} ${TYPES[field].label} <small>${capitalize(day)} ${mealLabel}</small></h3>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button>
    </div>
    <input type="search" class="search" placeholder="Rechercher ou ajouter…" data-input="filter" autocomplete="off" enterkeyhint="done">
    <div class="toolbar">
      <button type="button" class="btn" data-action="choose-random">🎲 Au hasard</button>
      ${slot[field] ? '<button type="button" class="btn" data-action="choose" data-id="">Effacer</button>' : ''}
    </div>
    <div class="options-scroll">
      <div class="create-row" data-create hidden>
        <button type="button" class="option create" data-action="create-choose"><span></span></button>
        <button type="button" class="option create once" data-action="free-choose"><span></span></button>
      </div>
      ${groups.filter(([, items]) => items.length).map(([title, items]) => `
        ${title ? `<h4>${esc(title)}</h4>` : ''}
        <div class="options">${list(items)}</div>`).join('')}
    </div>`);
}

function slotMenu(key) {
  const slot = slotOf(key);
  const item = (action, label) => `<button type="button" class="menu-item" data-action="${action}" data-slot="${esc(key)}">${label}</button>`;
  const entries = [];
  if (slot.reprise) {
    entries.push(item('slot-clear', '✂️ Ne plus reprendre ce repas'));
  } else if (!slot.libre) {
    if (isPlanned(slot)) entries.push(item('twin-pick', '👯 Cuisiner double : reprendre sur un autre créneau…'));
    entries.push(item('source-pick', '🔁 Manger les restes d’un autre repas…'));
    entries.push(item('slot-reroll', '🎲 Tout re-tirer au hasard'));
    entries.push(item('slot-clear', '🧹 Vider ce repas'));
  }
  entries.push(item('slot-libre', slot.libre ? '🍽️ Planifier ce repas' : '🚫 Repas libre (resto, invités…)'));
  openSheet(`
    <div class="sheet-head">
      <h3>${slotLabel(key)}</h3>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button>
    </div>
    <div class="menu">${entries.join('')}</div>`);
}

function slotChoice(title, hint, action, from, candidates) {
  const meals = store.table('Repas');
  openSheet(`
    <div class="sheet-head">
      <h3>${title}</h3>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button>
    </div>
    <p class="hint">${hint}</p>
    <div class="menu options-scroll">${candidates.length ? candidates.map((slot) => {
      const content = slotContent(slot, meals);
      const detail = slot.libre ? 'repas libre' : slot.reprise ? `restes de ${slotLabel(slot.reprise).toLowerCase()}` : slotSummary(content) || 'vide';
      return `<button type="button" class="menu-item" data-action="${action}" data-from="${esc(from)}" data-to="${esc(slot.key)}">
        <b>${slotLabel(slot.key)}</b><small>${esc(detail)}</small></button>`;
    }).join('') : '<p class="hint">Aucun repas disponible cette semaine.</p>'}</div>`);
}

function twinPicker(key) {
  const slot = slotOf(key);
  const slots = weekSlots(slot.semaine, store.table('Repas'), mealIds());
  const at = slots.findIndex((s) => s.key === key);
  const sorted = [...slots.slice(at + 1), ...slots.slice(0, at).reverse()];
  slotChoice('👯 Cuisiner double', `On mange la même chose que ${esc(slotLabel(key).toLowerCase())} sur quel créneau ?`, 'twin-set', key, sorted);
}

function sourcePicker(key) {
  const slot = slotOf(key);
  const slots = weekSlots(slot.semaine, store.table('Repas'), mealIds());
  const at = slots.findIndex((s) => s.key === key);
  const candidates = [...slots.slice(0, at).reverse(), ...slots.slice(at + 1)].filter(isPlanned);
  slotChoice('🔁 Restes', `${esc(slotLabel(key))} : on mange les restes de quel repas ?`, 'twin-set', '', candidates);
}

function autresEditor(key) {
  const slot = slotOf(key);
  const current = parseItems(slot.autres);
  const suggestions = knownAutres().filter((name) => !current.some((c) => slugify(c) === slugify(name))).slice(0, 24);
  openSheet(`
    <div class="sheet-head">
      <h3>${AUTRE.emoji} Autres ingrédients <small>${slotLabel(key)}</small></h3>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button>
    </div>
    <form class="stack" data-form="autres" data-slot="${esc(key)}">
      <label>Séparés par des virgules (ils s’ajoutent à la liste de courses)
        <textarea name="autres" rows="2" placeholder="sauce tomate, parmesan, basilic…">${esc(current.join(', '))}</textarea>
      </label>
      ${suggestions.length ? `<div class="tags">${suggestions.map((name) => `
        <button type="button" class="tag" data-action="add-autre" data-name="${esc(name)}">+ ${esc(name)}</button>`).join('')}</div>` : ''}
      <div class="toolbar">
        <button type="submit" class="btn primary">Enregistrer</button>
        ${current.length ? '<button type="button" class="btn" data-action="clear-autres">Effacer</button>' : ''}
      </div>
    </form>`);
  if (!current.length) $sheet.querySelector('textarea').focus();
}

function editItem(item, type) {
  const isNew = !item;
  const t = item?.type ?? type;
  const base = item && DEFAULT_CATALOG.find((d) => d.id === item.id);
  const months = item?.months ?? [];
  const cuissonIds = item?.cuissons ?? [];
  openSheet(`
    <div class="sheet-head">
      <h3>${isNew ? `Nouveau : ${TYPES[t].label.toLowerCase()}` : `${item.emoji} ${esc(item.name)}`}</h3>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button>
    </div>
    <form class="stack" data-form="item" data-id="${esc(item?.id ?? '')}" data-type="${t}">
      <div class="row">
        <label class="emoji-field">Emoji<input name="emoji" value="${esc(item?.emoji ?? TYPES[t].emoji)}" maxlength="4"></label>
        <label class="grow">Nom<input name="nom" value="${esc(item?.name ?? '')}" required autocomplete="off"></label>
      </div>
      ${t === 'legume' ? `
        <fieldset>
          <legend>Mois de saison</legend>
          <div class="checks months-grid">${MONTHS.map((m, i) => `
            <label><input type="checkbox" name="mois" value="${i + 1}" ${months.includes(i + 1) ? 'checked' : ''}> ${SHORT_MONTHS[i].replace('.', '')}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Cuissons adaptées</legend>
          <div class="checks">${byType(catalog(), 'cuisson').map((c) => `
            <label><input type="checkbox" name="cuissons" value="${esc(c.id)}" ${cuissonIds.includes(c.id) ? 'checked' : ''}> ${c.emoji} ${esc(c.name)}</label>`).join('')}
          </div>
        </fieldset>` : ''}
      <div class="toolbar">
        <button type="submit" class="btn primary">Enregistrer</button>
        ${isNew ? '' : '<button type="button" class="btn danger" data-action="delete-item">Supprimer</button>'}
        ${base && !isNew ? '<button type="button" class="btn" data-action="reset-item">Valeurs par défaut</button>' : ''}
      </div>
    </form>`);
}

function newItemId(name) {
  const id = slugify(name) || 'item';
  const taken = catalog().some((i) => i.id === id) || store.get('Catalogue', id);
  return taken ? `${id}-${Math.random().toString(36).slice(2, 6)}` : id;
}

function catalogRow(item, patch = {}) {
  return {
    key: item.id,
    type: item.type,
    nom: item.name,
    emoji: item.emoji ?? '',
    mois: item.months ?? [],
    cuissons: item.cuissons ?? [],
    supprime: false,
    ...patch,
  };
}

async function shareText(text, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  await copyText(text);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié dans le presse-papiers');
  } catch {
    openSheet(`
      <div class="sheet-head"><h3>Copier</h3><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button></div>
      <textarea class="copy-area" readonly>${esc(text)}</textarea>`);
    $sheet.querySelector('textarea').select();
  }
}

function bringSheet() {
  const head = `
    <div class="sheet-head">
      <h3>🛒 Envoyer à Bring!</h3>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button>
    </div>`;
  if (!store.syncEnabled) {
    openSheet(`${head}
      <p>Bring! importe la liste depuis ton script Google : connecte d’abord l’app à Google Sheets.</p>
      <div class="toolbar"><button type="button" class="btn primary" data-tab="reglages">⚙️ Réglages</button></div>`);
    return;
  }
  const items = shoppingItems(ui.week, store.table('Repas'), catalog(), mealIds());
  const { checked, extras } = shoppingState(ui.week);
  const lines = pendingLines(items, extras, checked);
  if (!lines.length) {
    toast('Rien à envoyer : tout est coché');
    return;
  }
  const { page, deeplink } = bringDeeplink(store.settings.url, `Courses · semaine ${weekNumber(ui.week)}`, lines);
  openSheet(`${head}
    <p class="hint">${lines.length} article(s) non coché(s). Bring! s’ouvre et te laisse choisir ceux à ajouter à ta liste.</p>
    <p class="status" data-bring-status>Vérification du script…</p>
    <div class="toolbar">
      <a class="btn primary" href="${esc(deeplink)}" target="_blank" rel="noopener" data-bring-open>Ouvrir dans Bring!</a>
    </div>`);
  fetch(page)
    .then((response) => response.text())
    .then((text) => {
      const status = $sheet.querySelector('[data-bring-status]');
      if (!status) return;
      if (text.includes('application/ld+json')) {
        status.textContent = '✅ Prêt';
      } else {
        status.classList.add('error');
        $sheet.querySelector('[data-bring-open]').hidden = true;
        status.innerHTML = '⚠️ Ton script Google n’est pas à jour : remplace-le par le nouveau script puis <b>Déployer → Gérer les déploiements → Modifier → Nouvelle version</b>. <button type="button" class="btn small" data-action="copy-script">📋 Copier le script</button>';
      }
    })
    .catch(() => {
      const status = $sheet.querySelector('[data-bring-status]');
      if (status) status.textContent = '⚠️ Pas de connexion : Bring! a besoin d’Internet pour importer la liste.';
    });
}

function listText() {
  const items = shoppingItems(ui.week, store.table('Repas'), catalog(), mealIds());
  const { checked, extras } = shoppingState(ui.week);
  return shoppingText(`Courses · semaine ${weekNumber(ui.week)} (${weekLabel(ui.week)})`, items, extras, checked);
}

function inviteLink() {
  return buildInvite(`${location.origin}${location.pathname}`, store.settings);
}

function qrSvg(text) {
  const qr = globalThis.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true, alt: 'QR code d’invitation' });
}

function inviteSheet() {
  const link = inviteLink();
  openSheet(`
    <div class="sheet-head">
      <h3>🔗 Inviter</h3>
      <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">✕</button>
    </div>
    <p class="hint">Scanne ce QR code avec l’appareil photo de l’autre téléphone, ou envoie-lui le lien.</p>
    <div class="qr">${qrSvg(link)}</div>
    <input type="text" class="invite-link" value="${esc(link)}" readonly data-input="invite-link">
    <div class="toolbar">
      <button type="button" class="btn primary" data-action="copy-invite">📋 Copier le lien</button>
    </div>`);
}

let installPrompt = null;

const actions = {
  'week-shift': (el) => { ui.week = shiftWeek(ui.week, Number(el.dataset.delta)); render(); },
  'week-today': () => { ui.week = weekId(); render(); },
  'fill-week': () => {
    const changed = fillWeek(ui.week, store.table('Repas'), catalog(), mealIds());
    if (!changed.length) return toast('Rien à compléter');
    commit('Repas', changed.map(cleanSlot));
    toast(`${changed.length} repas complété(s) 🎲`);
  },
  'clear-week': () => {
    const slots = weekSlots(ui.week, store.table('Repas'), mealIds())
      .filter((s) => s.libre || s.reprise || isPlanned(s));
    if (!slots.length) return;
    if (!confirm('Vider tous les repas de cette semaine ?')) return;
    commit('Repas', slots.map((s) => emptySlot(s.semaine, s.jour, s.repas)));
  },
  pick: (el) => { ui.picker = { key: el.dataset.slot, field: el.dataset.field }; renderPicker(); },
  choose: (el) => {
    const { key, field } = ui.picker;
    commit('Repas', { ...cleanSlot(slotOf(key)), [field]: el.dataset.id });
    closeSheet();
  },
  'create-choose': () => {
    const { key, field } = ui.picker;
    const nom = $sheet.querySelector('[data-input="filter"]').value.trim();
    if (!nom) return;
    const id = newItemId(nom);
    commit('Catalogue', { key: id, type: field, nom, emoji: TYPES[field].emoji, mois: [], cuissons: [], supprime: false });
    commit('Repas', { ...cleanSlot(slotOf(key)), [field]: id });
    closeSheet();
    toast(`« ${nom} » ajouté au catalogue`);
  },
  'free-choose': () => {
    const { key, field } = ui.picker;
    const nom = $sheet.querySelector('[data-input="filter"]').value.trim();
    if (!nom) return;
    commit('Repas', { ...cleanSlot(slotOf(key)), [field]: nom });
    closeSheet();
  },
  'choose-random': () => {
    const { key, field } = ui.picker;
    const slot = cleanSlot(slotOf(key));
    const counts = weekCounts(slot.semaine);
    if (slot[field]) counts[field][slot[field]] -= 1;
    const filled = fillSlot({ ...slot, [field]: '' }, catalog(), weekMonth(slot.semaine), counts, { [field]: slot[field] });
    commit('Repas', { ...slot, [field]: filled[field] });
    closeSheet();
  },
  'slot-dice': (el) => {
    const slot = cleanSlot(slotOf(el.dataset.slot));
    const empty = SLOT_FIELDS.some((f) => !slot[f]);
    const counts = weekCounts(slot.semaine);
    const base = empty ? slot : { ...slot, legume: '', cuisson: '', proteine: '', feculent: '' };
    if (!empty) for (const f of SLOT_FIELDS) counts[f][slot[f]] -= 1;
    commit('Repas', fillSlot(base, catalog(), weekMonth(slot.semaine), counts, empty ? null : slot));
  },
  'slot-menu': (el) => slotMenu(el.dataset.slot),
  'twin-pick': (el) => twinPicker(el.dataset.slot),
  'source-pick': (el) => { ui.reprise = el.dataset.slot; sourcePicker(el.dataset.slot); },
  'twin-set': (el) => {
    const pickedSource = !el.dataset.from;
    const sourceKey = pickedSource ? el.dataset.to : el.dataset.from;
    const targetKey = pickedSource ? ui.reprise : el.dataset.to;
    const target = slotOf(targetKey);
    const moved = reprisesOf(targetKey).map((row) => ({ ...cleanSlot(row), reprise: sourceKey }));
    commit('Repas', [{ ...emptySlot(target.semaine, target.jour, target.repas), reprise: sourceKey }, ...moved]);
    closeSheet();
    toast(`👯 ${slotLabel(targetKey)} : restes de ${slotLabel(sourceKey).toLowerCase()}`);
  },
  'edit-autres': (el) => autresEditor(el.dataset.slot),
  'add-autre': (el) => {
    const area = $sheet.querySelector('textarea[name="autres"]');
    area.value = [...parseItems(area.value), el.dataset.name].join(', ');
    el.remove();
  },
  'clear-autres': () => {
    const form = $sheet.querySelector('form[data-form="autres"]');
    commit('Repas', { ...cleanSlot(slotOf(form.dataset.slot)), autres: [] });
    closeSheet();
  },
  'slot-libre': (el) => {
    const slot = cleanSlot(slotOf(el.dataset.slot));
    commit('Repas', { ...slot, libre: !slot.libre });
    closeSheet();
  },
  'slot-reroll': (el) => {
    const slot = cleanSlot(slotOf(el.dataset.slot));
    const counts = weekCounts(slot.semaine);
    for (const f of SLOT_FIELDS) if (slot[f]) counts[f][slot[f]] -= 1;
    commit('Repas', fillSlot({ ...slot, legume: '', cuisson: '', proteine: '', feculent: '' }, catalog(), weekMonth(slot.semaine), counts, slot));
    closeSheet();
  },
  'slot-clear': (el) => {
    const slot = slotOf(el.dataset.slot);
    commit('Repas', emptySlot(slot.semaine, slot.jour, slot.repas));
    closeSheet();
  },
  'close-sheet': () => closeSheet(),
  month: (el) => { ui.month = Number(el.dataset.month); render(); },
  'edit-item': (el) => editItem(itemById(el.dataset.id)),
  'new-item': (el) => editItem(null, el.dataset.type),
  'delete-item': () => {
    const form = $sheet.querySelector('form[data-form="item"]');
    const item = itemById(form.dataset.id);
    if (!item || !confirm(`Supprimer « ${item.name} » ?`)) return;
    commit('Catalogue', catalogRow(item, { supprime: true }));
    closeSheet();
  },
  'reset-item': () => {
    const form = $sheet.querySelector('form[data-form="item"]');
    const def = DEFAULT_CATALOG.find((d) => d.id === form.dataset.id);
    if (def) commit('Catalogue', catalogRow(def));
    closeSheet();
  },
  'restore-item': (el) => {
    const def = DEFAULT_CATALOG.find((d) => d.id === el.dataset.id);
    if (def) commit('Catalogue', catalogRow(def));
  },
  'toggle-shop': (el) => {
    commit('Courses', {
      key: shopKey(ui.week, el.dataset.id), semaine: ui.week, article: el.dataset.name || el.dataset.id,
      coche: el.checked, extra: false, supprime: false,
    });
  },
  'toggle-extra': (el) => {
    const row = store.get('Courses', el.dataset.key);
    if (row) commit('Courses', { ...row, coche: el.checked });
  },
  'remove-extra': (el) => {
    const row = store.get('Courses', el.dataset.key);
    if (row) commit('Courses', { ...row, supprime: true });
  },
  'uncheck-all': () => {
    const rows = Object.values(store.table('Courses')).filter((r) => r.semaine === ui.week && r.coche && !r.supprime);
    if (rows.length) commit('Courses', rows.map((r) => ({ ...r, coche: false })));
  },
  'share-list': () => shareText(listText(), 'Liste de courses'),
  'copy-list': () => copyText(listText()),
  bring: () => bringSheet(),
  'sync-now': () => {
    if (!store.syncEnabled) return;
    sync.run().then(() => toast(sync.status === 'error' ? `Erreur : ${sync.error}` : 'Synchronisé ✅'));
  },
  'share-access': () => {
    if (store.syncEnabled) inviteSheet();
  },
  'copy-invite': async () => {
    const input = $sheet.querySelector('[data-input="invite-link"]');
    try {
      await navigator.clipboard.writeText(input.value);
      toast('Lien copié');
    } catch {
      input.select();
      toast('Sélectionne le lien pour le copier');
    }
  },
  disconnect: () => {
    if (!confirm('Déconnecter cet appareil de la feuille Google ? Les données restent sur l’appareil.')) return;
    store.updateSettings({ url: '', token: '' });
    sync.setStatus('idle');
  },
  'copy-script': async () => {
    try {
      const text = await (await fetch('apps-script/Code.gs')).text();
      copyText(text);
    } catch {
      toast('Impossible de récupérer le script');
    }
  },
  export: () => {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eki-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => document.querySelector('[data-input="import"]').click(),
  install: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    render();
  },
};

const forms = {
  autres: (form) => {
    commit('Repas', { ...cleanSlot(slotOf(form.dataset.slot)), autres: parseItems(form.autres.value) });
    closeSheet();
  },
  'add-extra': (form) => {
    const article = form.article.value.trim();
    if (!article) return;
    const id = `x:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    commit('Courses', { key: shopKey(ui.week, id), semaine: ui.week, article, coche: false, extra: true, supprime: false });
    render(true);
    document.querySelector('[data-form="add-extra"] input')?.focus();
  },
  sync: (form) => {
    const url = form.url.value.trim();
    const token = form.token.value.trim();
    if (hasInvite(url)) {
      try {
        connectWith(parseInvite(url));
      } catch (err) {
        toast(`Lien d’invitation invalide : ${err.message}`);
      }
      return;
    }
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      toast('L’URL doit commencer par https://script.google.com/');
      return;
    }
    store.updateSettings({ url, token });
    if (url) {
      sync.run().then(() => toast(sync.status === 'error' ? `Erreur : ${sync.error}` : 'Connecté à Google Sheets ✅'));
    }
  },
  item: (form) => {
    const data = new FormData(form);
    const nom = String(data.get('nom') ?? '').trim();
    if (!nom) return;
    const type = form.dataset.type;
    let id = form.dataset.id;
    id ||= newItemId(nom);
    commit('Catalogue', {
      key: id, type, nom,
      emoji: String(data.get('emoji') ?? '').trim(),
      mois: data.getAll('mois').map(Number),
      cuissons: data.getAll('cuissons').map(String),
      supprime: false,
    });
    closeSheet();
  },
};

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    ui.tab = tab.dataset.tab;
    closeSheet();
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (event.target === $sheet) {
    closeSheet();
    return;
  }
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const action = actions[el.dataset.action];
  if (!action || el.matches('input[type="checkbox"]')) return;
  action(el, event);
});

document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.matches('input[type="checkbox"][data-action]')) {
    if (el.dataset.action === 'toggle-meal') {
      const checked = [...document.querySelectorAll('[data-action="toggle-meal"]:checked')].map((i) => i.dataset.meal);
      if (!checked.length) {
        el.checked = true;
        return toast('Garde au moins un repas');
      }
      store.updateSettings({ meals: checked });
      return;
    }
    actions[el.dataset.action]?.(el, event);
  }
  if (el.matches('[data-input="import"]') && el.files?.[0]) {
    el.files[0].text().then((text) => {
      const data = JSON.parse(text);
      if (!TABLE_NAMES.some((t) => data[t])) throw new Error('format');
      if (!confirm('Remplacer les données actuelles par celles du fichier ?')) return;
      store.replaceAll(Object.fromEntries(TABLE_NAMES.map((t) => [t, data[t] ?? {}])));
      sync.schedule(0);
      toast('Import terminé');
    }).catch(() => toast('Fichier invalide'));
  }
});

document.addEventListener('input', (event) => {
  if (!event.target.matches('[data-input="filter"]')) return;
  const q = slugify(event.target.value);
  const options = [...$sheet.querySelectorAll('.options .option')];
  for (const opt of options) opt.hidden = Boolean(q) && !opt.dataset.search.includes(q);
  const create = $sheet.querySelector('[data-create]');
  const name = event.target.value.trim();
  create.hidden = !q || options.some((opt) => opt.dataset.search === q);
  create.querySelector('[data-action="create-choose"] span').textContent = `➕ Ajouter « ${name} » au catalogue`;
  create.querySelector('[data-action="free-choose"] span').textContent = `✏️ « ${name} » juste pour ce repas`;
  for (const group of $sheet.querySelectorAll('.options')) {
    const visible = [...group.children].some((c) => !c.hidden);
    group.hidden = !visible;
    const title = group.previousElementSibling;
    if (title?.tagName === 'H4') title.hidden = !visible;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !event.target.matches('[data-input="filter"]')) return;
  event.preventDefault();
  const visible = [...$sheet.querySelectorAll('.options .option')].filter((opt) => !opt.hidden && !opt.closest('[hidden]'));
  if (visible.length === 1) visible[0].click();
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  document.activeElement?.blur?.();
  forms[form.dataset.form]?.(form);
});

$sheet.addEventListener('close', () => { ui.picker = null; });

$view.addEventListener('focusout', () => {
  setTimeout(() => {
    if (deferredRender && !typing()) render();
  });
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (ui.tab === 'reglages') render();
});

function connectWith(invite) {
  if (store.settings.url === invite.url && store.settings.token === invite.token) {
    toast('Cet appareil est déjà connecté à ce planning');
    return;
  }
  if (!confirm('Connecter cet appareil au planning partagé ?')) return;
  store.updateSettings(invite);
  ui.tab = 'semaine';
  render(true);
  toast('Connexion au planning partagé…');
  sync.run().then(() => {
    if (sync.status === 'error') toast(`Erreur de synchro : ${sync.error}`);
  });
}

function handleInvite() {
  const href = location.href;
  if (!hasInvite(href)) return;
  history.replaceState(null, '', location.pathname + location.search);
  let invite;
  try {
    invite = parseInvite(href);
  } catch (err) {
    toast(`Lien d’invitation invalide : ${err.message}`);
    return;
  }
  try {
    connectWith(invite);
  } catch (err) {
    toast(`Connexion impossible : ${err.message}`);
  }
}

store.subscribe(render);
sync.subscribe(renderBadge);

render();
handleInvite();
sync.run();
window.addEventListener('hashchange', handleInvite);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sync.run();
});
window.addEventListener('online', () => sync.run());
setInterval(() => {
  if (document.visibilityState === 'visible' && !$sheet.open) sync.run();
}, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
