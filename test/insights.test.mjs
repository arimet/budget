// Run: node test/insights.test.mjs
import assert from 'node:assert/strict';
import { Insights } from '../src/insights.js';
const plain = (v) => JSON.parse(JSON.stringify(v));
const round = (x) => Math.round(x * 100) / 100;

let n = 0;
const row = (date, label, debit, cat, sub, credit = 0) => ({ id: 'r' + n++, row: 0, date, means: '', label, credit, debit, cat, sub,
  who: ['Foyer'], forecast: false, envelope: false });
const fixed = (name, amount, cat, sub, months = []) => ({ name, means: 'CB', amount, day: 5, cat, sub, who: ['Foyer'], months, start: '', end: '' });

// Four months: restaurants climb in November, Spotify changes price, the bakery and parking come back every week.
const month = (ym, extra) => ({ ym, tab: ym, opening: 1000, rows: [
  row(ym + '-02', 'Auchan', 300, 'Alimentation', 'Courses'),
  row(ym + '-05', 'Netflix', 14.99, 'Abonnements & télécoms', 'Streaming & musique'),
  row(ym + '-28', 'Virement employeur A', 0, 'Revenus', 'Salaires', 2500),
  ...[3, 10, 17, 24].map((d) => row(ym + '-' + String(d).padStart(2, '0'), 'Boulangerie Cilla', 6, 'Alimentation', 'Boulangerie & marché')),
  ...[4, 11, 18].map((d) => row(ym + '-' + String(d).padStart(2, '0'), 'EasyPark', 3, 'Transport', 'Péage & parking')),
  ...extra
] });
const data = {
  people: ['Foyer'],
  categories: [],
  budgets: [{ cat: 'Alimentation', sub: '', label: 'Alimentation', amount: 400, since: '' }],
  fixed: [
    fixed('Netflix', 14.99, 'Abonnements & télécoms', 'Streaming & musique'),
    fixed('Spotify', 12.14, 'Abonnements & télécoms', 'Streaming & musique'),
    fixed('M6+', 5.99, 'Abonnements & télécoms', 'Streaming & musique'),
    fixed('Prélèvement assurance', 30, 'Assurances', 'Habitation'),
    fixed('Amazon Prime', 69.9, 'Abonnements & télécoms', 'Streaming & musique', [10]),
    fixed('Virement employeur A', 2500, 'Revenus', 'Salaires'),
  ],
  months: [
    month('2026-08', [row('2026-08-22', 'Spotify', 21.24, 'Abonnements & télécoms', 'Streaming & musique'), row('2026-08-14', 'Resto', 60, 'Alimentation', 'Restaurants')]),
    month('2026-09', [row('2026-09-22', 'Spotify', 21.24, 'Abonnements & télécoms', 'Streaming & musique'), row('2026-09-14', 'Resto', 60, 'Alimentation', 'Restaurants'),
      row('2026-09-30', 'Intérêts débiteurs', 17.59, 'Impôts & finances', 'Frais bancaires')]),
    month('2026-10', [row('2026-10-22', 'Spotify', 12.14, 'Abonnements & télécoms', 'Streaming & musique'), row('2026-10-14', 'Resto', 60, 'Alimentation', 'Restaurants'),
      row('2026-10-02', 'Cotisation trimestrielle', 52.05, 'Impôts & finances', 'Frais bancaires')]),
    month('2026-11', [row('2026-11-14', 'Resto', 200, 'Alimentation', 'Restaurants')]),
  ],
};

// Subscriptions and fees: yearly cost, groups of the same kind, price changes, avoidable bank fees.
const r = Insights.recurring(data, '2026-11');
assert.ok(!r.items.some((i) => i.cat === 'Revenus'), 'salaries are not a subscription');
assert.equal(r.items[0].name, 'Prélèvement assurance', 'most expensive per year first');
assert.equal(round(r.items.find((i) => i.name === 'Amazon Prime').yearly), 69.9, 'a yearly charge counts once');
assert.equal(round(r.totalYearly), round((14.99 + 12.14 + 5.99 + 30) * 12 + 69.9));
assert.deepEqual(plain(r.groups.map((g) => [g.sub, g.names.length])), [['Streaming & musique', 4]]);
assert.deepEqual(plain(r.priceChanges), [{ name: 'Spotify', from: 21.24, to: 12.14 }]);
assert.equal(round(r.fees.total), round(17.59 + 52.05));
assert.equal(round(r.fees.avoidable), 17.59, 'overdraft interest is avoidable, the account fee is not');

// Month against the average of the three before it.
const c = Insights.compare(data, '2026-11');
const { subs: _subs, ...first } = c[0];
assert.deepEqual(plain(first), { cat: 'Alimentation', now: 300 + 24 + 200, avg: 300 + 24 + 60, delta: 140, pct: round(140 / 384 * 100) });
assert.ok(c.every((x) => x.cat !== 'Revenus'));
assert.deepEqual(plain(c[0].subs.map((x) => [x.sub, x.now, x.avg, x.delta])), [['Restaurants', 200, 60, 140], ['Courses', 300, 300, 0], ['Boulangerie & marché', 24, 24, 0]],
  'a category unfolds into its sub-categories');

// Period against the period before it (dashboard): what went up, what went down.
const mv = Insights.movers(data, ['2026-11'], ['2026-10'], {});
assert.deepEqual(plain(mv.up.map((x) => [x.cat, x.delta])), [['Alimentation', 140]]);
assert.deepEqual(plain(mv.down.map((x) => [x.cat, round(x.delta)])), [['Impôts & finances', -52.05], ['Abonnements & télécoms', -12.14]]);
assert.equal(round(mv.total.before), round(300 + 24 + 60 + 14.99 + 12.14 + 52.05 + 9));
assert.equal(Insights.movers(data, ['2026-11'], ['2026-10'], { person: 'Personne' }).up.length, 0, 'filters apply');
// A month still running is compared with the month before at the same date, not with all of it.
const early = Insights.movers(data, ['2026-11'], ['2026-10'], {}, { now: '2026-11-03', before: '2026-10-03' });
assert.equal(round(early.total.now), 300 + 6, 'Auchan on the 2nd, bakery on the 3rd');
assert.equal(round(early.total.before), 300 + 52.05 + 6, 'October up to the 3rd only');

// Small purchases that come back: per month and per year, over the last three months.
const s = Insights.smallRepeated(data, '2026-11');
assert.deepEqual(plain(s.map((x) => [x.label, x.count, round(x.perMonth), round(x.yearly)])), [['Boulangerie Cilla', 12, 24, 288], ['EasyPark', 9, 9, 108]]);

// The month in plain words.
const b = Insights.summary(data, '2026-11');
assert.ok(b.some((t) => /Restaurants|Alimentation/.test(t) && /\+140/.test(t)), 'the biggest rise is named');
assert.ok(b.some((t) => /streaming/i.test(t) && /4 abonnements/.test(t)), 'the subscriptions of one kind are summed up');
assert.ok(b.some((t) => /Boulangerie Cilla/.test(t) && /288/.test(t)), 'the costliest small habit, per year');
assert.ok(b.length <= 6);

console.log('insights: all checks pass');
