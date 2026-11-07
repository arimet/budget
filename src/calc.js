// Pure calculations on the data returned by getData(). No DOM here: tested by test/calc.test.mjs.
export var Calc = (function () {
  function pad(n) { return ('0' + n).slice(-2); }
  function sum(items) { return items.reduce(function (s, i) { return s + i.amount; }, 0); }
  function daysIn(ym) { var p = ym.split('-'); return new Date(+p[0], +p[1], 0).getDate(); }
  function addMonths(ym, n) {
    var p = ym.split('-'), d = new Date(+p[0], +p[1] - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function range(from, count) { var out = []; for (var i = 0; i < count; i++) out.push(addMonths(from, i)); return out; }

  // Months covered by a period anchored on a month: 'month', 'quarter' or 'year'.
  function periodMonths(kind, anchor) {
    var y = anchor.slice(0, 4), m = +anchor.slice(5);
    if (kind === 'year') return range(y + '-01', 12);
    if (kind === 'quarter') return range(y + '-' + pad(m - (m - 1) % 3), 3);
    return [anchor];
  }

  // ---------------------------------------------------------- rows of the month tabs
  // Categories that move money without spending it.
  function notSpending(r) { return r.cat === 'Revenus' || r.sub === 'Virements internes'; }
  function signed(r) { return r.debit - r.credit; }
  function asExpense(ym) {
    return function (r) { return { id: r.id, ym: ym, date: r.date, amount: signed(r), cat: r.cat, sub: r.sub, label: r.label, who: r.who, means: r.means }; };
  }
  function tab(data, ym) { return data.months.filter(function (m) { return m.ym === ym; })[0] || null; }

  // Real operations that count as spending (credits as negative spending), every month.
  function expenses(data) {
    var out = [];
    data.months.forEach(function (m) {
      m.rows.filter(function (r) { return !r.forecast && !notSpending(r); }).map(asExpense(m.ym)).forEach(function (e) { out.push(e); });
    });
    return out;
  }

  // ---------------------------------------------------------- one month, read like the tab's running balance
  function month(data, ym) {
    var t = tab(data, ym);
    if (!t) return null;
    var real = t.rows.filter(function (r) { return !r.forecast; });
    var forecasts = t.rows.filter(function (r) { return r.forecast && !r.envelope; });
    var envelopes = t.rows.filter(function (r) { return r.envelope; });
    var net = function (rows) { return rows.reduce(function (s, r) { return s + r.credit - r.debit; }, 0); };
    var balanceToday = t.opening + net(real), endOfMonth = balanceToday + net(forecasts) + net(envelopes);
    var incomeToCome = forecasts.reduce(function (s, r) { return s + r.credit; }, 0);
    return {
      ym: ym, opening: t.opening, balanceToday: balanceToday, endOfMonth: endOfMonth, endWithoutIncome: endOfMonth - incomeToCome,
      spent: real.filter(function (r) { return !notSpending(r); }).reduce(function (s, r) { return s + signed(r); }, 0),
      upcoming: -net(forecasts), forecasts: forecasts, envelopes: envelopes, expenses: real.map(asExpense(ym))
    };
  }

  // Balance day by day: the running balance of real lines up to today (all of a past month), then for the current
  // month a straight line to the expected end of month (forecasts have no day, so no finer projection).
  function balanceCurve(data, ym, today) {
    var m = month(data, ym);
    if (!m) return null;
    var dim = daysIn(ym), cur = today.slice(0, 7), last = ym < cur ? dim : ym > cur ? 1 : +today.slice(8, 10);
    var byDay = {};
    tab(data, ym).rows.forEach(function (r) {
      if (r.forecast) return;
      var d = r.date ? +r.date.slice(8, 10) : 1;
      byDay[d] = (byDay[d] || 0) + r.credit - r.debit;
    });
    var points = [], v = m.opening;
    for (var d = 1; d <= last; d++) { v += byDay[d] || 0; points.push({ d: d, v: v }); }
    if (ym === cur) points[points.length - 1].v = m.balanceToday; // lines dated later than today are already in the balance
    var projection = ym >= cur && last < dim ? [{ d: last, v: points[points.length - 1].v }, { d: dim, v: m.endOfMonth }] : [];
    return { dim: dim, today: ym === cur ? last : null, points: points, projection: projection, end: m.endOfMonth, endWithoutIncome: m.endWithoutIncome };
  }

  // ---------------------------------------------------------- budgets (one envelope per category or sub-category)
  function activeBudgets(data, ym) {
    var best = {};
    data.budgets.forEach(function (b) {
      var k = b.cat + '|' + b.sub;
      if (b.since <= ym && (!best[k] || b.since >= best[k].since)) best[k] = b;
    });
    return data.budgets.filter(function (b) { return best[b.cat + '|' + b.sub] === b && b.amount > 0; });
  }

  // Planned vs spent for one month. A sub-category envelope takes its own spending; the category one takes the rest.
  function plan(data, ym) {
    var spending = expenses(data).filter(function (e) { return e.ym === ym; });
    var budgets = activeBudgets(data, ym), own = {};
    budgets.forEach(function (b) { if (b.sub) own[b.cat + '|' + b.sub] = true; });
    var covered = function (e, b) { return e.cat === b.cat && (b.sub ? e.sub === b.sub : !own[e.cat + '|' + e.sub]); };
    var budgeted = budgets.map(function (b) {
      var mine = spending.filter(function (e) { return covered(e, b); });
      return { cat: b.cat, sub: b.sub, label: b.label, budget: b.amount, actual: sum(mine), items: newestFirst(mine) };
    });
    var rest = spending.filter(function (e) { return !budgets.some(function (b) { return covered(e, b); }); });
    var unbudgeted = Object.keys(groupSum(rest, 'cat')).map(function (c) {
      var mine = rest.filter(function (e) { return e.cat === c; });
      return { cat: c, actual: sum(mine), items: newestFirst(mine) };
    }).sort(function (a, b) { return b.actual - a.actual; });
    return { budgeted: budgeted, unbudgeted: unbudgeted, budgetTotal: sum(budgets), actualTotal: sum(spending) };
  }

  function newestFirst(items) {
    return items.slice().reverse().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  // ---------------------------------------------------------- dashboard
  // Each expense split equally between the people it is for.
  function shares(item) {
    var n = item.who.length;
    return item.who.map(function (w) { return { who: w, amount: item.amount / n }; });
  }

  // Flat rows {ym, cat, sub, who, amount} for months, filtered by person and category.
  function flatten(data, months, opts) {
    var out = [];
    expenses(data).filter(function (e) { return months.indexOf(e.ym) >= 0; }).forEach(function (i) {
      if (opts.cat && i.cat !== opts.cat) return;
      shares(i).forEach(function (s) {
        if (opts.person && s.who !== opts.person) return;
        out.push({ ym: i.ym, date: i.date, cat: i.cat, sub: i.sub || '—', who: s.who, amount: s.amount });
      });
    });
    return out;
  }

  function dashboard(data, months, opts) {
    var rows = flatten(data, months, opts);
    var byCat = sorted(groupSum(rows, 'cat')).map(function (c) {
      return { key: c.key, amount: c.amount, subs: sorted(groupSum(rows.filter(function (r) { return r.cat === c.key; }), 'sub')) };
    });
    var byWho = sorted(groupSum(rows, 'who')).map(function (w) {
      return { key: w.key, amount: w.amount, cats: sorted(groupSum(rows.filter(function (r) { return r.who === w.key; }), 'cat')) };
    });
    return { total: sum(rows), byCat: byCat, byWho: byWho, rows: rows };
  }

  // Monthly stacks for the evolution chart; `key` is 'cat' or 'who'.
  function evolution(data, months, opts, key) {
    var rows = flatten(data, months, opts);
    return months.map(function (ym) {
      var mine = rows.filter(function (r) { return r.ym === ym; });
      return { ym: ym, total: sum(mine), parts: groupSum(mine, key) };
    });
  }

  // Stable colour slots: the 7 categories with the most spending ever get one, the rest share "Autres".
  function catSlots(data) {
    var slots = {};
    sorted(groupSum(expenses(data), 'cat')).slice(0, 7).forEach(function (c, i) { slots[c.key] = i; });
    return slots;
  }

  // ---------------------------------------------------------- category suggestion
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function exists(data, cat, sub) {
    return data.categories.some(function (c) { return c.cat === cat && c.sub === sub; });
  }
  // Same label typed before → its category; then a past label starting with it; then a keyword of the Catégories tab.
  function suggest(data, label) {
    var n = norm(label);
    if (n.length < 2) return null;
    var past = expenses(data).filter(function (e) { return exists(data, e.cat, e.sub) && norm(e.label); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var hit = past.filter(function (e) { return norm(e.label) === n; })[0]
      || (n.length >= 3 && past.filter(function (e) { return norm(e.label).indexOf(n) === 0; })[0]);
    if (hit) return { cat: hit.cat, sub: hit.sub };
    var padded = ' ' + n + ' ', best = null, bestLen = 0;
    data.categories.forEach(function (c) {
      c.keywords.forEach(function (k) {
        k = norm(k);
        if (k && k.length > bestLen && padded.indexOf(' ' + k + ' ') >= 0) { best = c; bestLen = k.length; }
      });
    });
    return best ? { cat: best.cat, sub: best.sub } : null;
  }

  // Most used sub-categories over the last 90 days; none until something has been typed.
  function topSubs(data, n, today) {
    var since = addMonths(today.slice(0, 7), -3) + today.slice(7);
    var counts = {};
    expenses(data).forEach(function (e) {
      if (e.date >= since && exists(data, e.cat, e.sub)) counts[e.cat + '|' + e.sub] = (counts[e.cat + '|' + e.sub] || 0) + 1;
    });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    return keys.slice(0, n).map(function (k) { var p = k.split('|'); return { cat: p[0], sub: p[1] }; });
  }

  // ---------------------------------------------------------- helpers
  function groupSum(items, key) {
    var out = {};
    items.forEach(function (i) { out[i[key]] = (out[i[key]] || 0) + i.amount; });
    return out;
  }
  function sorted(groups) {
    return Object.keys(groups).map(function (k) { return { key: k, amount: groups[k] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }
  function catOrder(data) {
    var out = [];
    data.categories.forEach(function (c) { if (out.indexOf(c.cat) < 0) out.push(c.cat); });
    return out;
  }

  return { daysIn: daysIn, addMonths: addMonths, periodMonths: periodMonths, expenses: expenses, month: month, balanceCurve: balanceCurve, plan: plan,
    shares: shares, dashboard: dashboard, evolution: evolution, catSlots: catSlots, suggest: suggest, topSubs: topSubs,
    catOrder: catOrder, norm: norm };
})();
