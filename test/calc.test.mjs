// Run: node test/calc.test.mjs
import assert from 'node:assert/strict';
import { Calc } from '../src/calc.js';
const plain = (v) => JSON.parse(JSON.stringify(v));

// One row of a month tab as getData() returns it.
let n = 0;
const row = (date, label, credit, debit, cat, sub, who = ['Foyer'], kind = '') => ({
  id: kind === 'env' ? `env:${cat}|${sub}` : (kind ? 'prev:' : '') + 'r' + n++, row: 0, date, means: '', label, credit, debit, cat, sub, who,
  forecast: !!kind, envelope: kind === 'env'
});

const data = {
  people: ['Foyer', 'Alex', 'Camille', 'Sam'],
  categories: [
    { cat: 'Alimentation', sub: 'Courses', emoji: '🛒', keywords: ['carrefour', 'super u'] },
    { cat: 'Alimentation', sub: 'Restaurants', emoji: '🛒', keywords: ['restaurant'] },
    { cat: 'Logement', sub: 'Loyer / crédit', emoji: '🏠', keywords: ['loyer'] },
    { cat: 'Énergie', sub: 'Électricité & gaz', emoji: '⚡', keywords: ['edf', 'totalenergies'] },
    { cat: 'Transport', sub: 'Carburant', emoji: '🚗', keywords: ['total'] },
  ],
  budgets: [
    { cat: 'Alimentation', sub: '', label: 'Alimentation', amount: 500, since: '2026-01' },
    { cat: 'Alimentation', sub: '', label: 'Alimentation', amount: 600, since: '2026-11' },
    { cat: 'Transport', sub: 'Carburant', label: 'Carburant', amount: 100, since: '' },
  ],
  months: [
    { ym: '2026-10', tab: 'Octobre 2026', opening: 2000, rows: [
      row('2026-10-10', 'Leclerc', 0, 300, 'Alimentation', 'Courses'),
      row('2026-10-28', 'Virement employeur A', 2500, 0, 'Revenus', 'Salaires'),
    ] },
    { ym: '2026-11', tab: 'Novembre 2026', opening: 1000, rows: [
      row('2026-11-02', 'Carrefour Market', 0, 100, 'Alimentation', 'Courses'),
      row('2026-11-03', 'Remboursement CPAM', 9, 0, 'Santé', 'Remboursements'),
      row('2026-11-05', 'Pizza', 0, 60, 'Alimentation', 'Restaurants', ['Alex', 'Camille']),
      row('2026-11-05', 'Prélèvement de Echéance Prêt', 0, 800, 'Logement', 'Loyer / crédit'),
      row('2026-11-06', 'Total', 0, 40, 'Transport', 'Carburant', ['Sam']),
      row('2026-11-20', 'Virement vers épargne', 0, 12, 'Divers', 'Virements internes'),
      row('', 'Prélèvement de DGFIP', 0, 346, 'Impôts & finances', 'Taxe foncière', ['Foyer'], 'prev'),
      row('', 'Virement employeur A', 2500, 0, 'Revenus', 'Salaires', ['Foyer'], 'prev'),
      row('', 'Alimentation', 0, 440, 'Alimentation', '', ['Foyer'], 'env'),
    ] },
  ],
};

// spending rows: real rows only, salaries and internal transfers left out, credits as negative spending
const ex = Calc.expenses(data);
assert.deepEqual(plain(ex.map((e) => e.label)), ['Leclerc', 'Carrefour Market', 'Remboursement CPAM', 'Pizza', 'Prélèvement de Echéance Prêt', 'Total']);
assert.equal(ex.find((e) => e.label === 'Remboursement CPAM').amount, -9);
assert.equal(ex[0].ym, '2026-10');

// one month, read the way the tab's running balance reads it
const m = Calc.month(data, '2026-11', '2026-11-07');
assert.equal(m.opening, 1000);
assert.equal(round(m.balanceToday), round(1000 - 100 + 9 - 60 - 800 - 40 - 12));
assert.equal(round(m.endOfMonth), round(m.balanceToday - 346 + 2500 - 440));
assert.equal(round(m.spent), round(100 - 9 + 60 + 800 + 40), 'the transfer to savings is not spending');
assert.equal(m.upcoming, 346 - 2500, 'forecasts outside envelopes, debits minus credits');
assert.equal(round(m.endWithoutIncome), round(m.endOfMonth - 2500), 'end of month if the salaries still to come did not arrive');
assert.equal(m.forecasts.length, 2);
assert.equal(m.envelopes[0].debit, 440);
assert.equal(m.expenses.length, 6, 'every real row is listed, salaries and transfers included');
assert.equal(Calc.month(data, '2026-07', '2026-11-07'), null, 'no tab, no month');

// Balance through the month: real line up to today, then a straight projection to the expected end of month.
const curve = Calc.balanceCurve(data, '2026-11', '2026-11-07');
assert.equal(curve.dim, 30);
assert.equal(curve.points.length, 7, 'one point per day up to today');
assert.equal(curve.points[0].v, 1000, 'day 1: the opening balance');
assert.equal(round(curve.points[6].v), round(m.balanceToday));
assert.deepEqual(plain(curve.projection.map((p) => [p.d, round(p.v)])), [[7, round(m.balanceToday)], [30, round(m.endOfMonth)]]);
assert.equal(Calc.balanceCurve(data, '2026-10', '2026-11-07').projection.length, 0, 'a past month has no projection');
assert.equal(Calc.balanceCurve(data, '2026-10', '2026-11-07').points.length, 31);
function round(x) { return Math.round(x * 100) / 100; }

// planned vs spent: envelope budgets per category or sub-category, latest "since" not after the month
const p = Calc.plan(data, '2026-11');
assert.deepEqual(plain(p.budgeted.map((r) => [r.label, r.budget, r.actual])), [['Alimentation', 600, 160], ['Carburant', 100, 40]]);
assert.deepEqual(plain(p.budgeted[0].items.map((e) => e.label)), ['Pizza', 'Carrefour Market'], 'the real lines behind a budget, newest first');
assert.deepEqual(plain(p.unbudgeted[0].items.map((e) => e.label)), ['Prélèvement de Echéance Prêt']);
assert.deepEqual(plain(p.unbudgeted.map((r) => [r.cat, round(r.actual)])), [['Logement', 800], ['Santé', -9]]);
assert.equal(Calc.plan(data, '2026-10').budgeted[0].budget, 500);

// dashboard: shared expense split equally, person filter
const d = Calc.dashboard(data, ['2026-11'], {});
assert.deepEqual(plain(d.byWho.map((w) => [w.key, round(w.amount)])), [['Foyer', 891], ['Sam', 40], ['Alex', 30], ['Camille', 30]]);
assert.equal(Calc.dashboard(data, ['2026-11'], { person: 'Alex' }).total, 30);
assert.equal(Calc.dashboard(data, ['2026-11'], { cat: 'Transport' }).total, 40);
assert.equal(Calc.evolution(data, ['2026-10', '2026-11'], {}, 'cat')[0].total, 300);

// periods
assert.deepEqual(plain(Calc.periodMonths('quarter', '2026-11')), ['2026-10', '2026-11', '2026-12']);
assert.equal(Calc.periodMonths('year', '2026-11').length, 12);
assert.equal(Calc.addMonths('2026-01', -1), '2025-12');

// suggestion: past label, prefix, then longest whole-word keyword
assert.deepEqual(plain(Calc.suggest(data, 'carrefour market')), { cat: 'Alimentation', sub: 'Courses' });
assert.deepEqual(plain(Calc.suggest(data, 'Carref')), { cat: 'Alimentation', sub: 'Courses' });
assert.deepEqual(plain(Calc.suggest(data, 'Super U Centre')), { cat: 'Alimentation', sub: 'Courses' });
assert.deepEqual(plain(Calc.suggest(data, 'TotalEnergies')), { cat: 'Énergie', sub: 'Électricité & gaz' });
assert.equal(Calc.suggest(data, 'boulangerie'), null);

// quick picks: most used first, none without history
assert.deepEqual(plain(Calc.topSubs(data, 2, '2026-11-10')), [{ cat: 'Alimentation', sub: 'Courses' }, { cat: 'Alimentation', sub: 'Restaurants' }]);
assert.deepEqual(plain(Calc.topSubs({ ...data, months: [] }, 6, '2026-11-10')), []);

// colour slots follow all-time spending
assert.equal(Calc.catSlots(data)['Logement'], 0);

// Where the money goes: five postes per month, the detail of each, averages over the complete months only.
{
  let k = 0;
  const r = (date, label, debit, cat, sub, credit = 0, forecast = false) => ({ id: 'w' + k++, row: 0, date, means: '', label, credit, debit, cat, sub, who: ['Foyer'], forecast, envelope: false });
  const w = Calc.where({ months: [
    { ym: '2026-09', opening: 0, rows: [r('2026-09-05', 'Prêt', 800, 'Logement', 'Loyer / crédit'), r('2026-09-06', 'Auchan', 300, 'Alimentation', 'Courses'),
      r('2026-09-07', 'Deliveroo', 40, 'Alimentation', 'Livraison & à emporter'), r('2026-09-08', 'Dr A', 30, 'Santé', 'Médecin'), r('2026-09-20', 'CPAM', 0, 'Santé', 'Remboursements', 20),
      r('2026-09-10', 'Boutique', 100, 'Shopping', 'Vêtements & chaussures'), r('2026-09-12', 'Leroy', 50, 'Logement', 'Travaux & entretien'),
      r('2026-09-28', 'Salaire', 0, 'Revenus', 'Salaires', 2000), r('2026-09-29', 'Vers livret', 100, 'Divers', 'Virements internes')] },
    { ym: '2026-10', opening: 0, rows: [r('2026-10-05', 'Prêt', 800, 'Logement', 'Loyer / crédit'), r('2026-10-06', 'Auchan', 500, 'Alimentation', 'Courses'),
      r('2026-10-09', 'Coiffeur', 30, 'Soins & beauté', 'Coiffeur'), r('2026-10-10', 'Boutique', 300, 'Shopping', 'Vêtements & chaussures'), r('2026-10-11', 'Kiabi', 20, 'Shopping', 'Vêtements & chaussures')] },
    { ym: '2026-11', opening: 0, rows: [r('2026-11-05', 'Prêt', 800, 'Logement', 'Loyer / crédit'), r('', 'Netflix', 15, 'Abonnements & télécoms', 'Streaming & musique', 0, true)] },
    { ym: '2026-12', opening: 0, rows: [r('', 'Prêt', 800, 'Logement', 'Loyer / crédit', 0, true)] },
  ] }, '2026-11-10');
  assert.deepEqual(plain(w.months), [{ ym: '2026-09', partial: false }, { ym: '2026-10', partial: false }, { ym: '2026-11', partial: true }], 'months up to today; the running one is partial');
  const g = (key) => w.groups.find((x) => x.key === key);
  assert.deepEqual(plain(w.groups.map((x) => [x.key, x.values, x.avg])),
    [['fixes', [800, 830, 800], 815], ['courses', [300, 500, 0], 400], ['livraison', [40, 0, 0], 20], ['sante', [10, 0, 0], 5], ['reste', [150, 320, 0], 235]]);
  assert.deepEqual(plain(g('fixes').subs.map((x) => x.name)), ['Loyer / crédit', 'Coiffeur'], 'the hairdresser is a fixed charge; biggest average first');
  assert.deepEqual(plain(g('sante').subs.map((x) => [x.name, x.avg])), [['Médecin', 15], ['Remboursements', -10]]);
  assert.deepEqual(plain(g('reste').subs.map((x) => [x.name, x.values, x.avg])), [['Vêtements & chaussures', [100, 320, 0], 210], ['Travaux & entretien', [50, 0, 0], 25]]);
  assert.deepEqual(plain(g('reste').subs[0].top), [['Boutique', 400, 2], ['Kiabi', 20, 1]], 'biggest payees of the line');
  assert.deepEqual(plain([w.total, w.totalAvg, w.income, w.incomeAvg]), [[1300, 1650, 800], 1475, [2000, 0, 0], 1000]);
}

// The budget plan against one month: each line with what was spent on its categories, what no line covers, the transfers.
{
  let k = 0;
  const r = (date, label, debit, cat, sub, credit = 0, forecast = false) => ({ id: 'b' + k++, row: 0, date, means: '', label, credit, debit, cat, sub, who: ['Foyer'], forecast, envelope: false });
  const data = { plan: [
    { type: 'Dépense', poste: 'Charges fixes', line: 'Logement', amount: 900, cats: ['Logement'] },
    { type: 'Dépense', poste: 'Le reste', line: 'Travaux', amount: 50, cats: ['Logement > Travaux & entretien'] },
    { type: 'Dépense', poste: 'Le reste', line: 'Vêtements', amount: 60, cats: ['Shopping > Vêtements & chaussures'] },
    { type: 'Virement', poste: 'Épargne', line: 'Livret', amount: 600, cats: [] },
    { type: 'Virement', poste: 'Épargne', line: 'Vacances', amount: 150, cats: [] }],
    months: [{ ym: '2026-11', opening: 0, rows: [r('2026-11-05', 'Prêt', 800, 'Logement', 'Loyer / crédit'), r('2026-11-06', 'Leroy', 70, 'Logement', 'Travaux & entretien'),
      r('2026-11-07', 'Boutique', 100, 'Shopping', 'Vêtements & chaussures'), r('2026-11-08', 'Retour', 0, 'Shopping', 'Vêtements & chaussures', 30),
      r('2026-11-09', 'Resto', 45, 'Alimentation', 'Restaurants'), r('2026-11-28', 'Salaire', 0, 'Revenus', 'Salaires', 2000), r('', 'Netflix', 15, 'Logement', 'Eau', 0, true)] },
      { ym: '2026-10', opening: 0, rows: [r('2026-10-05', 'Prêt', 800, 'Logement', 'Loyer / crédit')] }] };
  const b = Calc.budget(data, '2026-11');
  assert.deepEqual(plain(b.postes.map((p) => [p.name, p.budget, p.actual, p.lines.map((l) => [l.name, l.budget, l.actual])])), [
    ['Charges fixes', 900, 800, [['Logement', 900, 800]]],
    ['Le reste', 110, 140, [['Travaux', 50, 70], ['Vêtements', 60, 70]]]], 'the most precise line takes the expense; a return lowers what was spent');
  assert.deepEqual(plain(b.off), [{ name: 'Restaurants', actual: 45 }], 'spent on what no line covers');
  assert.deepEqual(plain([b.budget, b.actual, b.transfers, b.transferTotal, b.total]),
    [1010, 985, [{ name: 'Livret', amount: 600 }, { name: 'Vacances', amount: 150 }], 750, 1760]);
  assert.equal(Calc.budget({ months: [] }, '2026-11').postes.length, 0, 'no plan');
}

console.log('calc: all checks pass');
