import { DEFAULT_CATALOG, DAYS, SLOT_FIELDS, SHOPPING_GROUPS, SHOPPING_TYPES, groupInfo } from './data.js';
import { weekMonth } from './dates.js';

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseItems(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,;\n]+/);
  return list.map((item) => String(item).trim()).filter(Boolean);
}

const KEYWORDS = {
  proteine: [
    ['poisson-gras', ['saumon', 'sardine', 'maquereau', 'hareng', 'truite', 'anchois']],
    ['poisson', ['poisson', 'cabillaud', 'colin', 'merlu', 'lieu', 'dorade', 'daurade', 'bar', 'sole', 'thon', 'crevette', 'moule', 'calamar', 'seiche', 'saint-jacques', 'gambas', 'surimi', 'merlan', 'lotte']],
    ['charcuterie', ['jambon', 'saucisse', 'lardon', 'bacon', 'chorizo', 'saucisson', 'merguez', 'chipolata', 'knack', 'rillette', 'pate', 'boudin', 'andouille']],
    ['volaille', ['poulet', 'dinde', 'canard', 'pintade', 'volaille', 'caille', 'lapin']],
    ['viande', ['boeuf', 'porc', 'veau', 'agneau', 'mouton', 'steak', 'bavette', 'entrecote', 'roti', 'cote', 'hache', 'filet-mignon', 'abats', 'foie']],
    ['legumineuse', ['lentille', 'pois-chiche', 'haricot', 'flageolet', 'feve', 'pois-casse', 'soja', 'edamame', 'houmous']],
    ['vegetal', ['tofu', 'tempeh', 'seitan']],
    ['oeuf', ['oeuf', 'omelette']],
  ],
  feculent: [
    ['legumineuse', ['lentille', 'pois-chiche', 'haricot', 'flageolet', 'pois-casse']],
    ['complet', ['complet', 'quinoa', 'sarrasin', 'boulgour', 'epeautre', 'avoine', 'seigle', 'millet']],
  ],
};

export function guessFamily(name, type) {
  const slug = slugify(name);
  for (const [family, words] of KEYWORDS[type] ?? []) {
    if (words.some((word) => slug.includes(word))) return family;
  }
  return '';
}

export function familyOf(value, field, index) {
  if (!value) return '';
  const item = index.get(value);
  return item ? item.famille || guessFamily(item.name, field) : guessFamily(value, field);
}

export function buildCatalog(overrides = {}) {
  const items = new Map(DEFAULT_CATALOG.map((item) => [item.id, { ...item, custom: false }]));
  for (const row of Object.values(overrides)) {
    if (row.supprime) {
      items.delete(row.key);
      continue;
    }
    const base = items.get(row.key);
    items.set(row.key, {
      id: row.key,
      type: row.type || base?.type,
      name: row.nom || base?.name || row.key,
      emoji: row.emoji || base?.emoji || '',
      months: row.mois?.length ? row.mois : base?.months ?? [],
      cuissons: row.cuissons?.length ? row.cuissons : base?.cuissons ?? [],
      famille: row.famille || base?.famille || '',
      custom: !DEFAULT_CATALOG.some((d) => d.id === row.key),
    });
  }
  const list = [...items.values()].filter((item) => SLOT_FIELDS.includes(item.type));
  list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return list;
}

export function byType(catalog, type) {
  return catalog.filter((item) => item.type === type);
}

export function inSeason(item, month) {
  return item.type !== 'legume' || !item.months?.length || item.months.includes(month);
}

export function slotKey(week, day, meal) {
  return `${week}|${day}|${meal}`;
}

export function emptySlot(week, day, meal) {
  return {
    key: slotKey(week, day, meal), semaine: week, jour: day, repas: meal,
    legume: '', cuisson: '', proteine: '', feculent: '', libre: false, autres: [], reprise: '',
  };
}

export const MEAL_FIELDS = [...SLOT_FIELDS, 'autres'];

export function sameMeal(a, b) {
  const items = (value) => parseItems(value).map(slugify).sort().join('|');
  return SLOT_FIELDS.every((f) => (a?.[f] ?? '') === (b?.[f] ?? '')) && items(a?.autres) === items(b?.autres);
}

export function mealFrom(source) {
  return Object.fromEntries(MEAL_FIELDS.map((f) => [f, f === 'autres' ? parseItems(source?.autres) : source?.[f] ?? '']));
}

export function isPlanned(slot) {
  return !slot.libre && !slot.reprise && (SLOT_FIELDS.some((f) => slot[f]) || parseItems(slot.autres).length > 0);
}

export function slotContent(slot, meals) {
  if (!slot || slot.libre) return null;
  if (!slot.reprise) return slot;
  const source = meals[slot.reprise];
  return source && !source.libre && !source.reprise ? source : null;
}

export function weekUsage(slots, meals) {
  const counts = Object.fromEntries(SLOT_FIELDS.map((field) => [field, {}]));
  for (const slot of slots) {
    const content = slotContent(slot, meals);
    if (!content) continue;
    for (const field of SLOT_FIELDS) {
      if (content[field]) counts[field][content[field]] = (counts[field][content[field]] ?? 0) + 1;
    }
  }
  return counts;
}

export function weekSlots(week, meals, mealIds) {
  const slots = [];
  for (const day of DAYS) {
    for (const meal of mealIds) {
      slots.push(meals[slotKey(week, day, meal)] ?? emptySlot(week, day, meal));
    }
  }
  return slots;
}

function pickLeastUsed(candidates, counts, exclude, rng) {
  if (!candidates.length) return '';
  const filtered = candidates.filter((id) => id !== exclude);
  const pool = filtered.length ? filtered : candidates;
  const min = Math.min(...pool.map((id) => counts[id] ?? 0));
  const best = pool.filter((id) => (counts[id] ?? 0) === min);
  return best[Math.floor(rng() * best.length)];
}

export function cuissonCandidates(catalog, legumeId) {
  const cuissons = byType(catalog, 'cuisson').map((c) => c.id);
  const legume = catalog.find((item) => item.id === legumeId);
  const allowed = legume?.cuissons?.filter((id) => cuissons.includes(id)) ?? [];
  return allowed.length ? allowed : cuissons;
}

export function seasonalLegumes(catalog, month) {
  const legumes = byType(catalog, 'legume');
  const seasonal = legumes.filter((item) => inSeason(item, month));
  return (seasonal.length ? seasonal : legumes).map((item) => item.id);
}

function proteinFamily(id, index) {
  return familyOf(id, 'proteine', index) || 'autre';
}

export function proteinCandidates(catalog, counts, remaining = 1) {
  const index = new Map(catalog.map((item) => [item.id, item]));
  const items = byType(catalog, 'proteine');
  const done = {};
  for (const [id, n] of Object.entries(counts.proteine ?? {})) {
    const family = proteinFamily(id, index);
    done[family] = (done[family] ?? 0) + n;
  }
  const fish = (done.poisson ?? 0) + (done['poisson-gras'] ?? 0);
  const blocked = new Set();
  if (fish >= 2) blocked.add('poisson').add('poisson-gras');
  if ((done.viande ?? 0) >= 3) blocked.add('viande');
  if ((done.charcuterie ?? 0) >= 1) blocked.add('charcuterie');
  if ((done.legumineuse ?? 0) >= 3) blocked.add('legumineuse');
  const missingFat = Math.max(0, 1 - (done['poisson-gras'] ?? 0));
  const missingFish = Math.max(0, 2 - fish, missingFat);
  const missingPulses = Math.max(0, 2 - (done.legumineuse ?? 0));
  const needed = new Set();
  if (missingFat) needed.add('poisson-gras');
  else if (missingFish) needed.add('poisson').add('poisson-gras');
  if (missingPulses) needed.add('legumineuse');
  const family = (item) => proteinFamily(item.id, index);
  const forced = remaining <= missingFish + missingPulses ? items.filter((item) => needed.has(family(item))) : [];
  const allowed = items.filter((item) => !blocked.has(family(item)));
  return (forced.length ? forced : allowed.length ? allowed : items).map((item) => item.id);
}

export function fillSlot(slot, catalog, month, counts, previous, rng = Math.random, { remaining = 1, wantComplet = false } = {}) {
  const next = { ...slot };
  const ids = (type) => byType(catalog, type).map((item) => item.id);
  const take = (field, candidates) => {
    if (next[field]) return;
    next[field] = pickLeastUsed(candidates, counts[field], previous?.[field], rng);
    if (next[field]) counts[field][next[field]] = (counts[field][next[field]] ?? 0) + 1;
  };
  const complets = byType(catalog, 'feculent').filter((item) => item.famille === 'complet').map((item) => item.id);
  take('legume', seasonalLegumes(catalog, month));
  const cuissons = cuissonCandidates(catalog, next.legume);
  const light = cuissons.filter((id) => id !== 'gratin' || (counts.cuisson.gratin ?? 0) < 2);
  take('cuisson', light.length ? light : cuissons);
  take('proteine', proteinCandidates(catalog, counts, remaining));
  take('feculent', wantComplet && complets.length ? complets : ids('feculent'));
  return next;
}

export function fillWeek(week, meals, catalog, mealIds, rng = Math.random) {
  const slots = weekSlots(week, meals, mealIds);
  const month = weekMonth(week);
  const counts = weekUsage(slots, meals);
  const index = new Map(catalog.map((item) => [item.id, item]));
  const isComplet = (id) => familyOf(id, 'feculent', index) === 'complet';
  const dayComplet = new Set(slots.map((slot) => slotContent(slot, meals)).filter((c) => c && isComplet(c.feculent)).map((c) => c.jour));
  const fillable = slots.filter((slot) => !slot.libre && !slot.reprise);
  let remaining = fillable.filter((slot) => !slot.proteine).length;
  const changed = [];
  let previous = null;
  fillable.forEach((slot, i) => {
    const lastOfDay = !fillable.slice(i + 1).some((other) => other.jour === slot.jour && !other.feculent);
    const wantComplet = !slot.feculent && !dayComplet.has(slot.jour) && (lastOfDay || rng() < 0.5);
    const filled = fillSlot(slot, catalog, month, counts, previous, rng, { remaining: Math.max(remaining, 1), wantComplet });
    if (!slot.proteine) remaining -= 1;
    if (isComplet(filled.feculent)) dayComplet.add(slot.jour);
    if (SLOT_FIELDS.some((field) => filled[field] !== slot[field])) changed.push(filled);
    previous = filled;
  });
  return changed;
}

export function shoppingItems(week, meals, catalog, mealIds) {
  const index = new Map(catalog.map((item) => [item.id, item]));
  const totals = new Map();
  const add = (id, base) => {
    const entry = totals.get(id) ?? { ...base, id, count: 0 };
    entry.count += 1;
    totals.set(id, entry);
  };
  for (const slot of weekSlots(week, meals, mealIds)) {
    const content = slotContent(slot, meals);
    if (!content) continue;
    for (const type of SHOPPING_TYPES) {
      const value = content[type];
      const item = index.get(value);
      if (item) add(item.id, item);
      else if (value && slugify(value)) add(`t:${type}:${slugify(value)}`, { type, name: value, emoji: groupInfo(type).emoji });
    }
    for (const name of parseItems(content.autres)) {
      const slug = slugify(name);
      if (slug) add(`a:${slug}`, { type: 'autre', name, emoji: groupInfo('autre').emoji });
    }
  }
  const order = Object.fromEntries(SHOPPING_GROUPS.map((type, i) => [type, i]));
  return [...totals.values()].sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, 'fr'));
}

export function shopKey(week, id) {
  return `${week}|${id}`;
}

export function pendingLines(items, extras, checked) {
  return [
    ...items.filter((item) => !checked.has(item.id)).map((item) => `${item.name}${item.count > 1 ? ` (${item.count} repas)` : ''}`),
    ...extras.filter((row) => !row.coche).map((row) => row.article),
  ];
}

export function bringDeeplink(scriptUrl, title, lines) {
  const params = new URLSearchParams({ bring: '1', titre: title });
  for (const line of lines) params.append('i', line);
  const page = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}${params}`;
  const query = new URLSearchParams({ url: page, source: 'web', baseQuantity: '1', requestedQuantity: '1' });
  return { page, deeplink: `https://api.getbring.com/rest/bringrecipes/deeplink?${query}` };
}

export function shoppingText(title, items, extras, checked) {
  const lines = [title];
  for (const type of SHOPPING_GROUPS) {
    const group = items.filter((item) => item.type === type && !checked.has(item.id));
    if (!group.length) continue;
    lines.push('', `${groupInfo(type).emoji} ${groupInfo(type).plural}`);
    for (const item of group) lines.push(`- ${item.name}${item.count > 1 ? ` (×${item.count})` : ''}`);
  }
  const otherExtras = extras.filter((row) => !row.coche);
  if (otherExtras.length) {
    lines.push('', '🛒 Divers');
    for (const row of otherExtras) lines.push(`- ${row.article}`);
  }
  return lines.join('\n');
}
