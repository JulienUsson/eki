export const TYPES = {
  legume: { label: 'Légume', plural: 'Légumes', emoji: '🥕' },
  cuisson: { label: 'Cuisson', plural: 'Cuissons', emoji: '🔥' },
  proteine: { label: 'Protéine', plural: 'Protéines', emoji: '🍗' },
  feculent: { label: 'Féculent', plural: 'Féculents', emoji: '🍚' },
};

export const SLOT_FIELDS = ['legume', 'cuisson', 'proteine', 'feculent'];

export const SHOPPING_TYPES = ['legume', 'proteine', 'feculent'];

export const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export const SHORT_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export const MEALS = [
  { id: 'midi', label: 'Midi' },
  { id: 'soir', label: 'Soir' },
];

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WINTER = [10, 11, 12, 1, 2, 3];

const cuissons = [
  ['vapeur', 'Vapeur', '♨️'],
  ['four', 'Rôti au four', '🔥'],
  ['puree', 'Purée', '🥣'],
  ['soupe', 'Soupe / velouté', '🍲'],
  ['poelee', 'Poêlée', '🍳'],
  ['gratin', 'Gratin', '🧀'],
  ['wok', 'Wok', '🥢'],
  ['grille', 'Grillé / plancha', '🍢'],
  ['cru', 'Cru / salade', '🥗'],
  ['farci', 'Farci', '🫑'],
];

const legumes = [
  ['artichaut', 'Artichaut', '🌿', [5, 6, 7, 8, 9], ['vapeur', 'four', 'farci']],
  ['asperge', 'Asperge', '🌱', [4, 5, 6], ['vapeur', 'four', 'grille', 'soupe']],
  ['aubergine', 'Aubergine', '🍆', [6, 7, 8, 9, 10], ['four', 'grille', 'poelee', 'gratin', 'farci', 'puree']],
  ['betterave', 'Betterave', '🟣', [1, 2, 3, 7, 8, 9, 10, 11, 12], ['four', 'cru', 'soupe', 'vapeur']],
  ['blette', 'Blette', '🥬', [6, 7, 8, 9, 10, 11], ['vapeur', 'gratin', 'poelee']],
  ['brocoli', 'Brocoli', '🥦', [6, 7, 8, 9, 10, 11], ['vapeur', 'four', 'wok', 'gratin', 'soupe', 'puree']],
  ['butternut', 'Butternut', '🎃', [9, 10, 11, 12, 1, 2], ['four', 'puree', 'soupe', 'gratin']],
  ['carotte', 'Carotte', '🥕', ALL_YEAR, ['vapeur', 'four', 'puree', 'soupe', 'poelee', 'wok', 'cru']],
  ['celeri-rave', 'Céleri-rave', '🤍', [9, 10, 11, 12, 1, 2, 3], ['puree', 'soupe', 'four', 'cru', 'gratin']],
  ['champignon', 'Champignon', '🍄', ALL_YEAR, ['poelee', 'four', 'soupe', 'wok', 'farci', 'cru']],
  ['chou-bruxelles', 'Chou de Bruxelles', '🟢', [10, 11, 12, 1, 2], ['vapeur', 'four', 'poelee', 'gratin']],
  ['chou-fleur', 'Chou-fleur', '🥦', [9, 10, 11, 12, 1, 2, 3, 4], ['vapeur', 'four', 'gratin', 'puree', 'soupe']],
  ['chou-kale', 'Chou kale', '🥬', WINTER, ['four', 'poelee', 'soupe', 'cru']],
  ['chou-rouge', 'Chou rouge', '🟣', [9, 10, 11, 12, 1, 2, 3], ['cru', 'poelee', 'wok']],
  ['chou-vert', 'Chou vert', '🥬', WINTER, ['vapeur', 'soupe', 'poelee', 'farci']],
  ['concombre', 'Concombre', '🥒', [5, 6, 7, 8, 9], ['cru']],
  ['courgette', 'Courgette', '🥒', [6, 7, 8, 9], ['vapeur', 'four', 'poelee', 'gratin', 'soupe', 'grille', 'farci', 'wok', 'cru']],
  ['courge-spaghetti', 'Courge spaghetti', '🎃', [9, 10, 11, 12], ['four', 'gratin']],
  ['endive', 'Endive', '🥬', [10, 11, 12, 1, 2, 3, 4], ['cru', 'gratin', 'poelee']],
  ['epinard', 'Épinard', '🥬', [3, 4, 5, 9, 10, 11], ['poelee', 'gratin', 'soupe', 'cru']],
  ['fenouil', 'Fenouil', '🌿', [6, 7, 8, 9, 10, 11], ['four', 'vapeur', 'cru', 'gratin']],
  ['feve', 'Fève', '🫛', [5, 6], ['vapeur', 'poelee', 'puree']],
  ['haricot-vert', 'Haricot vert', '🫛', [6, 7, 8, 9], ['vapeur', 'poelee', 'cru']],
  ['mache', 'Mâche', '🥗', [10, 11, 12, 1, 2, 3], ['cru']],
  ['mais', 'Maïs', '🌽', [8, 9], ['grille', 'vapeur', 'cru']],
  ['navet', 'Navet', '⚪', WINTER, ['vapeur', 'four', 'puree', 'soupe', 'poelee']],
  ['panais', 'Panais', '🥕', WINTER, ['four', 'puree', 'soupe', 'poelee']],
  ['petits-pois', 'Petits pois', '🟢', [5, 6, 7], ['vapeur', 'poelee', 'puree', 'soupe']],
  ['poireau', 'Poireau', '🥬', [9, 10, 11, 12, 1, 2, 3, 4], ['vapeur', 'gratin', 'soupe', 'poelee']],
  ['poivron', 'Poivron', '🫑', [7, 8, 9, 10], ['four', 'grille', 'poelee', 'wok', 'farci', 'cru']],
  ['potimarron', 'Potimarron', '🎃', [9, 10, 11, 12, 1], ['four', 'puree', 'soupe', 'gratin']],
  ['potiron', 'Potiron', '🎃', [9, 10, 11, 12], ['soupe', 'puree', 'four', 'gratin']],
  ['radis', 'Radis', '🔴', [4, 5, 6, 7], ['cru', 'poelee']],
  ['salade', 'Salade verte', '🥗', [4, 5, 6, 7, 8, 9, 10], ['cru']],
  ['tomate', 'Tomate', '🍅', [6, 7, 8, 9], ['cru', 'four', 'farci', 'soupe', 'grille']],
  ['topinambour', 'Topinambour', '🥔', WINTER, ['four', 'puree', 'soupe', 'poelee']],
];

const proteines = [
  ['poulet', 'Poulet', '🍗'],
  ['dinde', 'Dinde', '🦃'],
  ['canard', 'Canard', '🦆'],
  ['boeuf', 'Bœuf', '🥩'],
  ['boeuf-hache', 'Steak haché', '🍔'],
  ['porc', 'Porc', '🐖'],
  ['jambon', 'Jambon', '🥓'],
  ['saucisse', 'Saucisse', '🌭'],
  ['veau', 'Veau', '🐄'],
  ['agneau', 'Agneau', '🐑'],
  ['saumon', 'Saumon', '🐟'],
  ['cabillaud', 'Cabillaud', '🐟'],
  ['colin', 'Colin', '🐟'],
  ['thon', 'Thon', '🐟'],
  ['sardine', 'Sardines', '🐟'],
  ['crevettes', 'Crevettes', '🦐'],
  ['oeufs', 'Œufs', '🥚'],
  ['tofu', 'Tofu', '⬜'],
  ['lentilles', 'Lentilles', '🟤'],
  ['pois-chiches', 'Pois chiches', '🟡'],
  ['haricots-rouges', 'Haricots rouges', '🔴'],
];

const feculents = [
  ['riz', 'Riz', '🍚'],
  ['riz-complet', 'Riz complet', '🍚'],
  ['pates', 'Pâtes', '🍝'],
  ['pommes-de-terre', 'Pommes de terre', '🥔'],
  ['patate-douce', 'Patate douce', '🍠'],
  ['quinoa', 'Quinoa', '🌾'],
  ['semoule', 'Semoule', '🌾'],
  ['boulgour', 'Boulgour', '🌾'],
  ['ble', 'Blé', '🌾'],
  ['sarrasin', 'Sarrasin', '🌾'],
  ['polenta', 'Polenta', '🌽'],
  ['gnocchis', 'Gnocchis', '🥟'],
  ['nouilles', 'Nouilles', '🍜'],
  ['pain', 'Pain', '🥖'],
];

export const DEFAULT_CATALOG = [
  ...cuissons.map(([id, name, emoji]) => ({ id, type: 'cuisson', name, emoji })),
  ...legumes.map(([id, name, emoji, months, cuissonIds]) => ({
    id, type: 'legume', name, emoji, months, cuissons: cuissonIds,
  })),
  ...proteines.map(([id, name, emoji]) => ({ id, type: 'proteine', name, emoji })),
  ...feculents.map(([id, name, emoji]) => ({ id, type: 'feculent', name, emoji })),
];
