import { SLOT_FIELDS } from './data.js';
import { weekMonth } from './dates.js';
import { familyOf, inSeason, parseItems, slotContent, weekSlots } from './planner.js';

function nameOf(value, index) {
  return index.get(value)?.name ?? value;
}

const times = (n) => `${n} fois`;

export const MIN_PLANNED = 4;

export function weekBalance(week, meals, catalog, mealIds) {
  const index = new Map(catalog.map((item) => [item.id, item]));
  const month = weekMonth(week);
  const eaten = [];
  for (const slot of weekSlots(week, meals, mealIds)) {
    const content = slotContent(slot, meals);
    if (!content || !(SLOT_FIELDS.some((f) => content[f]) || parseItems(content.autres).length)) continue;
    eaten.push({ slot, content, cooked: !slot.reprise });
  }
  const alerts = [];
  if (eaten.length < MIN_PLANNED) return { planned: eaten.length, alerts };

  const count = (test) => eaten.filter(({ content }) => test(content)).length;
  const protein = (content) => familyOf(content.proteine, 'proteine', index);
  const starch = (content) => familyOf(content.feculent, 'feculent', index);

  const fish = count((c) => protein(c).startsWith('poisson'));
  const fatFish = count((c) => protein(c) === 'poisson-gras');
  if (fish === 0) alerts.push({ level: 'warn', text: '🐟 Pas de poisson : visez 2 repas de poisson par semaine, dont un poisson gras (saumon, sardines, maquereau…).' });
  else if (fish === 1) alerts.push({ level: 'info', text: `🐟 Poisson 1 fois : visez 2 fois par semaine, dont un poisson gras.` });
  else if (fish > 4) alerts.push({ level: 'info', text: `🐟 Poisson ${times(fish)} : 2 fois suffisent, pensez à varier les espèces.` });
  else if (!fatFish) alerts.push({ level: 'info', text: `🐟 Poisson ${times(fish)}, mais aucun poisson gras : remplacez-en un par du saumon, des sardines ou du maquereau.` });
  else alerts.push({ level: 'ok', text: `🐟 Poisson ${times(fish)}, dont du poisson gras.` });

  const meat = count((c) => protein(c) === 'viande');
  if (meat > 4) alerts.push({ level: 'warn', text: `🥩 Viande (bœuf, porc, veau, agneau) ${times(meat)} : à limiter à 500 g par semaine, soit 3 à 4 repas. Privilégiez la volaille.` });

  const deli = count((c) => protein(c) === 'charcuterie');
  if (deli > 2) alerts.push({ level: 'warn', text: `🥓 Charcuterie ${times(deli)} : à limiter à 150 g par semaine.` });

  const pulses = count((c) => protein(c) === 'legumineuse' || starch(c) === 'legumineuse');
  if (pulses < 2) alerts.push({ level: 'info', text: `🫘 Légumineuses ${times(pulses)} : visez au moins 2 repas par semaine (lentilles, pois chiches, haricots…).` });
  else alerts.push({ level: 'ok', text: `🫘 Légumineuses ${times(pulses)}.` });

  const days = new Set(eaten.map(({ slot }) => slot.jour)).size;
  const whole = count((c) => starch(c) === 'complet');
  if (whole === 0) alerts.push({ level: 'info', text: '🌾 Pas de féculent complet : visez-en un par jour (riz complet, pâtes complètes, quinoa, pain complet…).' });
  else if (whole < days) alerts.push({ level: 'info', text: `🌾 Féculents complets ${times(whole)} sur ${days} jours : l’idéal est d’en manger un par jour.` });
  else alerts.push({ level: 'ok', text: `🌾 Féculents complets ${times(whole)}.` });

  const noVeg = count((c) => !c.legume);
  if (noVeg) alerts.push({ level: 'warn', text: `🥦 ${noVeg} repas sans légume : visez au moins 5 fruits et légumes par jour.` });
  else alerts.push({ level: 'ok', text: '🥦 Un légume à chaque repas.' });

  const outOfSeason = [...new Set(eaten
    .filter(({ content, cooked }) => cooked && index.get(content.legume) && !inSeason(index.get(content.legume), month))
    .map(({ content }) => nameOf(content.legume, index)))];
  if (outOfSeason.length) alerts.push({ level: 'info', text: `🍂 Hors saison : ${outOfSeason.join(', ')}.` });

  const gratins = count((c) => c.cuisson === 'gratin');
  if (gratins >= 3) alerts.push({ level: 'info', text: `🧀 Gratin ${times(gratins)} : plats riches en fromage et crème, à garder occasionnels.` });

  const limits = { proteine: 4, feculent: 5, legume: 4 };
  for (const [field, limit] of Object.entries(limits)) {
    const counts = new Map();
    for (const { content, cooked } of eaten) {
      if (cooked && content[field]) counts.set(content[field], (counts.get(content[field]) ?? 0) + 1);
    }
    for (const [value, n] of counts) {
      if (n >= limit) alerts.push({ level: 'info', text: `🔁 ${nameOf(value, index)} ${times(n)} : pensez à varier.` });
    }
  }

  const order = { warn: 0, info: 1, ok: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return { planned: eaten.length, alerts };
}
