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

console.log('calc: all checks pass');
