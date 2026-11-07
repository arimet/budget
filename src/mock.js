// `npm run mock`: the real Code.gs running against an in-memory spreadsheet laid out like a hand-kept ledger, with sample months.
import gs from '../apps-script/Code.gs?raw';
import { Book, loadCodeFrom } from '../test/fake-sheets.mjs';

const pad = (n) => ('0' + n).slice(-2);
const now = new Date();
const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
const ymOf = (back) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };

const book = new Book();
const code = loadCodeFrom(gs, book, today);
const DEF = new Function(gs + ';return { categories: DEFAULT_CATEGORIES, people: DEFAULT_PEOPLE };')();
book.add('Personnes', [['Nom']].concat(DEF.people.map((p) => [p])));
book.add('Catégories', [['Catégorie', 'Sous-catégorie', 'Emoji', 'Mots-clés']]
  .concat([['Revenus', '💶', [['Salaires', 'salaire, virement employeur']]]].concat(DEF.categories)
    .flatMap(([cat, emoji, subs]) => subs.map(([sub, kw]) => [cat, sub, emoji, kw]))));
book.add('Budgets', [['Catégorie', 'Sous-catégorie', 'Libellé', 'Montant mensuel', 'Depuis'],
  ['Alimentation', '', 'Alimentation', 450, ''], ['Transport', 'Carburant', 'Carburant', 100, ''], ['Soins & beauté', 'Coiffeur', 'Coiffeur', 35, '']]);
book.add('Charges fixes', [['Nom', 'CB / Chèque', 'Montant', 'Jour', 'Catégorie', 'Sous-catégorie', 'Pour', 'Mois', 'Début', 'Fin'],
  ['Prélèvement de Echéance Prêt', '', 800, 5, 'Logement', 'Loyer / crédit', 'Foyer', '', '', ''],
  ['Prélèvement électricité', '', 190, 8, 'Logement', 'Électricité & gaz', 'Foyer', '', '', ''],
  ['Prélèvement de Free Telecom', '', 39.99, 5, 'Abonnements & télécoms', 'Box internet', 'Foyer', '', '', ''],
  ['Netflix', 'CB', 14.99, 14, 'Abonnements & télécoms', 'Streaming & musique', 'Foyer', '', '', ''],
  ['Virement employeur A', '', 2500, 28, 'Revenus', 'Salaires', 'Foyer', '', '', ''],
  ['Virement employeur B', '', 1300, 30, 'Revenus', 'Salaires', 'Foyer', '', '', '']]);

book.add('Epargne Alex', [['LA', 4200, 'Appart : 3000 €'], ['LDDS', 1800, 'Vacances : 1200 €'], [], ['Total', 6000], [], [], ['Placement mensuel'], [], ['LA', 150], ['LDDS', 100], [], ['Total', 250]]);
book.add('Epargne Camille', [['LA', 640], [], ['Total', 640], [], [], ['Placement mensuel'], [], ['LA', 20], [], ['Total', 20]]);

// Past months: a tab with real rows only, like months kept by hand before the app.
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const HEAD = ['Date', 'CB / Chèque', 'Libellé', 'Crédit', 'Débit', 'Solde', '', 'Catégorie', 'Sous-catégorie', 'Pour', 'ID'];
function sample(ym) {
  const day = (x) => new Date(+ym.slice(0, 4), +ym.slice(5) - 1, x);
  const rows = [];
  const add = (x, label, amount, cat, sub, who = 'Foyer', means = 'CB du ' + pad(x) + '/' + ym.slice(5)) =>
    rows.push([day(x), means, label, amount < 0 ? -amount : '', amount > 0 ? Math.round(amount * 100) / 100 : '', '', '', cat, sub, who]);
  add(2, 'Auchan', 70 + rnd() * 80, 'Alimentation', 'Courses');
  add(5, 'Prélèvement de Echéance Prêt', 800, 'Logement', 'Loyer / crédit', 'Foyer', '');
  add(6, 'Boulangerie Cilla', 8 + rnd() * 10, 'Alimentation', 'Boulangerie & marché');
  add(8, 'Prélèvement électricité', 190, 'Logement', 'Électricité & gaz', 'Foyer', '');
  add(10, 'Esso', 55 + rnd() * 20, 'Transport', 'Carburant');
  add(13, 'Resto du quartier', 45 + rnd() * 40, 'Alimentation', 'Restaurants', 'Alex, Sam');
  add(15, 'Judo', 30 + rnd() * 30, 'Éducation & garde', 'Activités extrascolaires', 'Camille');
  add(17, 'Auchan', 70 + rnd() * 80, 'Alimentation', 'Courses');
  add(20, 'Kiabi', 20 + rnd() * 60, 'Shopping', 'Vêtements & chaussures', 'Camille');
  add(24, 'Lidl', 70 + rnd() * 80, 'Alimentation', 'Courses');
  add(28, 'Virement employeur A', -2500, 'Revenus', 'Salaires', 'Foyer', '');
  add(30, 'Virement employeur B', -1300, 'Revenus', 'Salaires', 'Foyer', '');
  return rows;
}
[3, 2, 1].forEach((back, i) => {
  const ym = ymOf(back);
  const sh = book.add(code.tabName(ym), [[null, null, null, null, 'Report', i ? null : 1840], [], HEAD, []].concat(sample(ym)));
  if (i) sh.getRange(1, 6).setFormula("='" + code.tabName(ymOf(back + 1)) + "'!F100");
  for (let r = 5; r <= 100; r++) sh.getRange(r, 6).setFormula(r === 5 ? '=F1+D5-E5' : `=F${r - 1}+D${r}-E${r}`);
});
// Current month: created by the app itself, then a few expenses typed so far.
code.getData();
const d = now.getDate();
[[1, 'Auchan', 82.12, 'Alimentation', 'Courses'], [2, 'Boulangerie Cilla', 6.4, 'Alimentation', 'Boulangerie & marché'],
 [3, 'EasyPark', 5.12, 'Transport', 'Péage & parking']].filter(([x]) => x <= d).forEach(([x, label, amount, cat, sub]) =>
  code.saveExpense({ date: today.slice(0, 8) + pad(x), amount, cat, sub, label, who: ['Foyer'] }));

const api = { getData: code.getData, saveExpense: code.saveExpense, deleteExpense: code.deleteExpense, restoreExpense: code.restoreExpense,
  markPassed: code.markPassed, prepareMonth: code.prepareMonth, importBank: code.importBank };

// Google sign-in in the preview: the fake button sends "mock", exchanged for a session key like on the real server.
const MOCK_TOKEN = 'mock-session-key-0000000000000000';
export function mockCall(body) {
  return new Promise((ok) => setTimeout(() => {
    if (body.fn === 'googleLogin') return ok(body.credential === 'mock' ? { data: { token: MOCK_TOKEN, email: 'alex@example.com' } } : { error: 'auth' });
    if (body.token !== MOCK_TOKEN) return ok({ error: 'auth' });
    try { ok({ data: JSON.parse(JSON.stringify(api[body.fn](...body.args))) }); } catch (e) { ok({ error: e.message }); }
  }, 300));
}
