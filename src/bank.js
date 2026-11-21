// Bank export (La Banque Postale CSV) against the month tabs: what is already there, which forecasts went through,
// and what is missing. Pure functions, tested by test/bank.test.mjs.
import { Calc } from './calc.js';

var STOP = { prelevement: 1, de: 1, du: 1, virement: 1, cb: 1, achat: 1, pour: 1, a: 1, la: 1, le: 1, les: 1 };

function title(word) {
  return (word.match(/\./g) || []).length >= 2 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// The merchant or payee, readable: "ACHAT CB PAPA FRIES 03.11.26 …" → "Papa Fries".
function merchant(label) {
  var s = label.replace(/^\d?ACHAT CB\s+/, '').replace(/\s+\d\d\.\d\d\.\d\d.*$/, '')
    .replace(/^PRELEVEMENT DE\s+/, '').replace(/^VIREMENT (INSTANTANE )?(WERO )?(PERMANENT )?(DE|A|POUR)\s+/, '')
    .replace(/\s+(REF\b|REFERENCE\b|IDENT\b|MANDAT\b|EUR\b|CARTE\b).*$/, '').replace(/\s+\d{5,}.*$/, '').trim();
  return s.split(/\s+/).map(title).join(' ');
}

function parse(text) {
  var lines = text.split(/\r?\n/), start = lines.findIndex(function (l) { return /^Date;/.test(l); });
  return lines.slice(start + 1).filter(function (l) { return /^\d\d\/\d\d\/\d{4};/.test(l); }).map(function (l) {
    var m = l.match(/^(\d\d)\/(\d\d)\/(\d{4});"?(.*?)"?;(-?[\d\s]+,\d\d)\s*$/);
    var label = m[4].replace(/\s+/g, ' ').trim(), posted = m[3] + '-' + m[2] + '-' + m[1];
    var cb = label.match(/(\d\d)\.(\d\d)\.(\d\d)/), card = /ACHAT CB/.test(label);
    return { posted: posted, date: card && cb ? '20' + cb[3] + '-' + cb[2] + '-' + cb[1] : posted, label: label,
      amount: -Number(m[5].replace(/\s/g, '').replace(',', '.')), card: card, merchant: merchant(label) };
  });
}

// Transactions from the bank connection (Enable Banking, booked only), as the CSV lines above.
function fromApi(list) {
  return list.filter(function (t) { return t.status === 'BOOK'; }).map(function (t) {
    var label = (t.remittance_information || []).join(' ').replace(/\s+/g, ' ').trim();
    var who = t.credit_debit_indicator === 'CRDT' ? t.debtor : t.creditor;
    if (!label) label = (who && who.name) || '';
    var posted = t.booking_date || t.value_date, cb = label.match(/(\d\d)\.(\d\d)\.(\d\d)/), card = /ACHAT CB/.test(label);
    var amount = Number(t.transaction_amount.amount) * (t.credit_debit_indicator === 'CRDT' ? -1 : 1);
    return { posted: posted, date: card && cb ? '20' + cb[3] + '-' + cb[2] + '-' + cb[1] : t.transaction_date || posted, label: label,
      amount: Math.round(amount * 100) / 100, card: card, merchant: who && who.name ? merchant(who.name) : merchant(label) };
  });
}

function days(a, b) { return Math.abs((new Date(a) - new Date(b)) / 864e5); }
function words(s) { return Calc.norm(s).split(' ').filter(function (w) { return w && !STOP[w]; }); }

// Bank lines against the Sheets, in passes so a loose match never takes a row an exact one needs:
// known (same amount, close date), differs (probably the same line typed differently: same name, or only a close
// amount, which the app asks about), toPass (a forecast that went through), missing; then waiting = forecasts not
// passed, and orphans = real lines of the Sheets the bank does not show.
// The bank's date rules: a line belongs to the month the bank booked it. `ym` keeps only the lines booked that month
// (the others count as skipped). A card payment typed the month before is looked for there too, and listed in `shift`
// (a move to the bank's month is offered); every item carries `date`, the date to write.
function reconcile(data, ops, ym) {
  var tabs = {}, used = {}, out = { known: [], differs: [], shift: [], toPass: [], missing: [], waiting: [], orphans: [], skipped: 0 };
  var home = {};
  data.months.forEach(function (m) { tabs[m.ym] = m; m.rows.forEach(function (r) { home[r.id] = m.ym; }); });
  var todo = [], seen = {};
  ops.forEach(function (op) {
    var booked = tabs[op.posted.slice(0, 7)], made = tabs[op.date.slice(0, 7)];
    var m = ym ? (op.posted.slice(0, 7) === ym ? booked : null) : booked || made;
    if (!m) { out.skipped++; return; }
    seen[m.ym] = m;
    // Where the line is written: the bank's date when that month has a tab.
    todo.push({ op: op, m: m, date: booked ? op.posted : op.date, rows: made && made !== m ? m.rows.concat(made.rows) : m.rows });
  });
  var free = function (r) { return !used[r.id]; };
  var near = function (r, op, n) { return days(r.date, op.date) <= n || days(r.date, op.posted) <= n; };
  // `rank`, when given, picks the best candidate (lowest value) instead of the first.
  var pass = function (find, keep, rank) {
    todo = todo.filter(function (t) {
      var found = t.rows.filter(function (x) { return free(x) && find(x, t.op, t); });
      if (rank) found.sort(function (a, b) { return rank(a, t.op) - rank(b, t.op); });
      var r = found[0];
      if (!r) return true;
      used[r.id] = 1; keep(t.op, r, t); return false;
    });
  };
  var signed = function (r) { return r.debit - r.credit; };
  // A typo in the amount: within 1 €, or 3 % for bigger sums (5 € at most).
  var close = function (r, op) { return Math.abs(signed(r) - op.amount) <= Math.min(5, Math.max(1, Math.abs(op.amount) * 0.03)) + 0.005; };
  pass(function (r, op) { return !r.forecast && Math.abs(r.debit - r.credit - op.amount) < 0.005 && near(r, op, 3); },
    function (op, r, t) {
      out.known.push({ op: op, row: r });
      // Typed in another month than the one the bank booked it in: a move is offered.
      if (home[r.id] !== t.date.slice(0, 7)) out.shift.push({ op: op, row: r, from: home[r.id], date: t.date });
    });
  pass(function (r, op) {
    var w = words(r.label).filter(function (x) { return x.length >= 3; }), o = words(op.label + ' ' + op.merchant);
    return !r.forecast && near(r, op, 5) && (r.debit - r.credit > 0) === (op.amount > 0) && w.some(function (x) { return o.indexOf(x) >= 0; });
  }, function (op, r, t) { out.differs.push({ op: op, row: r, why: 'name', sure: close(r, op), date: t.date }); });
  // Another name but nearly the same amount a few days apart: maybe the same line, typed by hand. Asked, never assumed.
  pass(function (r, op) { return !r.forecast && near(r, op, 4) && (signed(r) > 0) === (op.amount > 0) && close(r, op); },
    function (op, r, t) { out.differs.push({ op: op, row: r, why: 'amount', sure: false, date: t.date }); },
    function (r, op) { return Math.abs(signed(r) - op.amount); });
  pass(function (r, op, t) {
    // A forecast only of the month the bank booked the line in.
    if (!r.forecast || r.envelope || home[r.id] !== t.m.ym || (op.amount > 0 ? !r.debit : !r.credit)) return false;
    var w = words(r.label), o = words(op.label);
    return (w.length && w.every(function (x) { return o.indexOf(x) >= 0; })) || Math.abs((r.debit || r.credit) - Math.abs(op.amount)) < 0.01;
  }, function (op, r, t) { out.toPass.push({ op: op, forecast: r, date: t.date }); });
  todo.forEach(function (t) {
    var s = Calc.suggest(data, t.op.merchant.replace(/\./g, '')) || { cat: 'Divers', sub: 'À classer' };
    out.missing.push({ op: t.op, cat: s.cat, sub: s.sub, date: t.date });
  });
  (ym ? [tabs[ym]].filter(Boolean) : Object.keys(seen).map(function (k) { return seen[k]; })).forEach(function (m) {
    m.rows.forEach(function (r) { if (r.forecast && !r.envelope && free(r)) out.waiting.push(r); });
  });
  // Typed in the Sheets, not at the bank: only up to the bank's last line (a card payment takes days to show).
  var lastSeen = ops.reduce(function (d, op) { return op.posted > d ? op.posted : d; }, '');
  Object.keys(seen).forEach(function (k) {
    seen[k].rows.forEach(function (r) { if (!r.forecast && free(r) && r.date && r.date <= lastSeen && (r.cat !== 'Divers' || r.sub !== 'Virements internes')) out.orphans.push(r); });
  });
  return out;
}

export var Bank = { parse: parse, fromApi: fromApi, reconcile: reconcile, merchant: merchant };
