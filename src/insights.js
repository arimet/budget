// Where the money goes and where it could go less: pure functions on getData(), tested by test/insights.test.mjs.
import { Calc } from './calc.js';

var eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
function money(n) { return eur0.format(n); }
function sum(items, key) { return items.reduce(function (s, i) { return s + i[key || 'amount']; }, 0); }
function monthsBefore(ym, count) { var out = []; for (var i = count; i >= 1; i--) out.push(Calc.addMonths(ym, -i)); return out; }
function spendingIn(data, months) { return Calc.expenses(data).filter(function (e) { return months.indexOf(e.ym) >= 0; }); }
function withTab(data, months) { return months.filter(function (ym) { return data.months.some(function (m) { return m.ym === ym; }); }); }
// Merchant key: the label without digits, first two words ("Boulangerie Cilla", "EasyPark").
function key(label) { return Calc.norm(label).replace(/\d+/g, ' ').trim().split(/\s+/).slice(0, 2).join(' '); }

// Fixed charges still running at `ym` (incomes and internal transfers left out), their yearly cost, groups of the
// same kind, prices that moved in the real lines, and bank fees over the last 12 months.
function recurring(data, ym) {
  var items = data.fixed.filter(function (f) {
    return f.cat !== 'Revenus' && f.sub !== 'Virements internes' && (!f.start || f.start <= ym) && (!f.end || f.end >= ym);
  }).map(function (f) {
    var times = f.months.length || 12;
    return { name: f.name, cat: f.cat, sub: f.sub, amount: f.amount, times: times, yearly: f.amount * times, monthly: f.amount * times / 12 };
  }).sort(function (a, b) { return b.yearly - a.yearly; });

  var bySub = {};
  items.forEach(function (i) { (bySub[i.cat + '|' + i.sub] = bySub[i.cat + '|' + i.sub] || []).push(i); });
  var groups = Object.keys(bySub).filter(function (k) { return bySub[k].length >= 2 && bySub[k][0].cat === 'Abonnements & télécoms'; })
    .map(function (k) { var g = bySub[k]; return { cat: g[0].cat, sub: g[0].sub, names: g.map(function (i) { return i.name; }), yearly: sum(g, 'yearly') }; })
    .sort(function (a, b) { return b.yearly - a.yearly; });

  var all = Calc.expenses(data);
  var priceChanges = [];
  items.forEach(function (i) {
    var seen = all.filter(function (e) { return Calc.norm(e.label) === Calc.norm(i.name) && e.amount > 0; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (seen.length < 2) return;
    var last = seen[seen.length - 1].amount, before = seen[seen.length - 2].amount;
    if (Math.abs(last - before) > 0.5) priceChanges.push({ name: i.name, from: before, to: last });
  });

  var year = monthsBefore(ym, 11).concat([ym]);
  var fees = spendingIn(data, year).filter(function (e) { return e.sub === 'Frais bancaires'; });
  var avoidable = fees.filter(function (e) { return /int[eé]r[eê]ts|agios|commission|d[eé]couvert/i.test(e.label); });
  return { items: items, totalYearly: sum(items, 'yearly'), groups: groups, priceChanges: priceChanges,
    fees: { total: sum(fees), avoidable: sum(avoidable), lines: fees } };
}

// Spending per category this month against the average of the (up to) three months before that have a tab.
function compare(data, ym) {
  var before = withTab(data, monthsBefore(ym, 3));
  var now = {}, past = {};
  spendingIn(data, [ym]).forEach(function (e) { now[e.cat] = (now[e.cat] || 0) + e.amount; });
  spendingIn(data, before).forEach(function (e) { past[e.cat] = (past[e.cat] || 0) + e.amount; });
  return Object.keys(Object.assign({}, now, past)).map(function (cat) {
    var avg = before.length ? (past[cat] || 0) / before.length : 0, n = now[cat] || 0, delta = n - avg;
    return { cat: cat, now: round(n), avg: round(avg), delta: round(delta), pct: avg > 0 ? round(delta / avg * 100) : null };
  }).sort(function (a, b) { return b.delta - a.delta; });
}

// Purchases under `max` € that came back at least 4 times over the three months ending at `ym`.
function smallRepeated(data, ym, max) {
  max = max || 30;
  var months = withTab(data, monthsBefore(ym, 2).concat([ym]));
  var groups = {};
  spendingIn(data, months).filter(function (e) { return e.amount > 0 && e.amount < max && e.label; }).forEach(function (e) {
    var k = key(e.label);
    (groups[k] = groups[k] || []).push(e);
  });
  return Object.keys(groups).filter(function (k) { return groups[k].length >= 4; }).map(function (k) {
    var g = groups[k], perMonth = sum(g) / months.length;
    return { label: g[g.length - 1].label, cat: g[0].cat, sub: g[0].sub, count: g.length, perMonth: perMonth, yearly: perMonth * 12 };
  }).sort(function (a, b) { return b.yearly - a.yearly; }).slice(0, 8);
}

// The month in a few sentences: total against the usual, the biggest rise, budgets, and the clearest savings leads.
function summary(data, ym) {
  var out = [], name = monthLabel(ym);
  var cmp = compare(data, ym), total = sum(spendingIn(data, [ym]));
  var avg = cmp.reduce(function (s, c) { return s + c.avg; }, 0);
  out.push('En ' + name + ', ' + money(total) + ' dépensés' + (avg > 0 ? ', ' + signed(total - avg) + ' par rapport à la moyenne des mois précédents' : '') + '.');
  var rise = cmp.filter(function (c) { return c.delta >= 30; })[0];
  if (rise) out.push('Plus forte hausse : ' + rise.cat + ', ' + signed(rise.delta) + (rise.pct !== null ? ' (' + (rise.pct > 0 ? '+' : '') + Math.round(rise.pct) + ' %)' : '') + '.');
  var plan = Calc.plan(data, ym), over = plan.budgeted.filter(function (b) { return b.actual > b.budget; });
  if (over.length) out.push('Budget dépassé : ' + over.map(function (b) { return b.label + ' de ' + money(b.actual - b.budget); }).join(', ') + '.');
  else if (plan.budgeted.length) out.push('Tous les budgets du mois sont tenus.');
  var rec = recurring(data, ym), group = rec.groups[0];
  if (group) out.push(group.names.length + ' abonnements ' + group.sub.toLowerCase() + ' : ' + money(group.yearly) + ' par an. En garder moins ?');
  var habit = smallRepeated(data, ym)[0];
  if (habit) out.push('Petite dépense qui revient : ' + habit.label + ', ' + money(habit.perMonth) + ' par mois, soit ' + money(habit.yearly) + ' par an.');
  if (rec.fees.avoidable > 0) out.push('Frais évitables sur 12 mois : ' + money(rec.fees.avoidable) + ' (intérêts de découvert, commissions).');
  return out.slice(0, 6);
}

function round(x) { return Math.round(x * 100) / 100; }
function signed(x) { return (x >= 0 ? '+' : '−') + money(Math.abs(x)); }
function monthLabel(ym) {
  return new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export var Insights = { recurring: recurring, compare: compare, smallRepeated: smallRepeated, summary: summary };
