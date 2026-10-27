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

export function fillSlot(slot, catalog, month, counts, previous, rng = Math.random) {
  const next = { ...slot };
  const ids = (type) => byType(catalog, type).map((item) => item.id);
  const take = (field, candidates) => {
    if (next[field]) return;
    next[field] = pickLeastUsed(candidates, counts[field], previous?.[field], rng);
    if (next[field]) counts[field][next[field]] = (counts[field][next[field]] ?? 0) + 1;
  };
  take('legume', seasonalLegumes(catalog, month));
  take('cuisson', cuissonCandidates(catalog, next.legume));
  take('proteine', ids('proteine'));
  take('feculent', ids('feculent'));
  return next;
}

export function fillWeek(week, meals, catalog, mealIds, rng = Math.random) {
  const slots = weekSlots(week, meals, mealIds);
  const month = weekMonth(week);
  const counts = weekUsage(slots, meals);
  const changed = [];
  let previous = null;
  for (const slot of slots) {
    if (slot.libre || slot.reprise) continue;
    const filled = fillSlot(slot, catalog, month, counts, previous, rng);
    if (SLOT_FIELDS.some((field) => filled[field] !== slot[field])) changed.push(filled);
    previous = filled;
  }
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
