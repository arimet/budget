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

function reconcile(data, ops) {
  var tabs = {}, used = {}, out = { known: [], toPass: [], missing: [], skipped: 0 };
  data.months.forEach(function (m) { tabs[m.ym] = m; });
  ops.forEach(function (op) {
    var m = tabs[op.date.slice(0, 7)] || tabs[op.posted.slice(0, 7)];
    if (!m) { out.skipped++; return; }
    var free = function (r) { return !used[r.id]; };
    var real = m.rows.filter(function (r) {
      return free(r) && !r.forecast && Math.abs(r.debit - r.credit - op.amount) < 0.005 && (days(r.date, op.date) <= 3 || days(r.date, op.posted) <= 3);
    })[0];
    if (real) { used[real.id] = 1; out.known.push({ op: op, row: real }); return; }
    var opWords = words(op.label);
    var fc = m.rows.filter(function (r) {
      if (!free(r) || !r.forecast || r.envelope || (op.amount > 0 ? !r.debit : !r.credit)) return false;
      var w = words(r.label);
      return (w.length && w.every(function (x) { return opWords.indexOf(x) >= 0; })) || Math.abs((r.debit || r.credit) - Math.abs(op.amount)) < 0.01;
    })[0];
    if (fc) { used[fc.id] = 1; out.toPass.push({ op: op, forecast: fc }); return; }
    var s = Calc.suggest(data, op.merchant.replace(/\./g, '')) || { cat: 'Divers', sub: 'À classer' };
    out.missing.push({ op: op, cat: s.cat, sub: s.sub });
  });
  return out;
}

export var Bank = { parse: parse, fromApi: fromApi, reconcile: reconcile, merchant: merchant };
