// Run: node test/bank.test.mjs
import assert from 'node:assert/strict';
import { Bank } from '../src/bank.js';
const plain = (v) => JSON.parse(JSON.stringify(v));

// A La Banque Postale export: a few header lines, then "Date;Libellé;Montant(EUROS)".
const csv = [
  'Numéro Compte   ;0000000X000', 'Type         ;CCP', 'Compte tenu en  ;euros', 'Date            ;07/11/2026', 'Solde (EUROS)   ;109,25', '',
  'Date;Libellé;Montant(EUROS)',
  '06/11/2026;"ACHAT CB AUCHAN.FR      03.11.26 CARTE NUMERO                337 OC ";-82,12',
  '05/11/2026;"PRELEVEMENT DE FREE MOBILE REF : fmpmt-1 IDENT : FR07 MANDAT : FM-1";-19,98',
  '04/11/2026;"ACHAT CB PAPA FRIES     03.11.26 CARTE NUMERO                514  ";-10,70',
  '03/11/2026;"VIREMENT DE  C.P.A.M. DE MEURTHE 263060002543 REFERENCE : 0190307600023001";9,00',
  '28/10/2026;"ACHAT CB OLD SHOP       27.10.26 CARTE NUMERO                514  ";-5,00',
  ''
].join('\r\n');

const ops = Bank.parse(csv);
assert.equal(ops.length, 5);
assert.deepEqual(plain(ops[0]), { posted: '2026-11-06', date: '2026-11-03', label: 'ACHAT CB AUCHAN.FR 03.11.26 CARTE NUMERO 337 OC', amount: 82.12, card: true, merchant: 'Auchan.fr' });
assert.equal(ops[3].amount, -9, 'a credit is a negative spending');
assert.equal(ops[1].merchant, 'Free Mobile');
assert.equal(ops[3].merchant, 'C.P.A.M. De Meurthe');

let n = 0;
const row = (date, label, debit, cat, sub, extra = {}) => ({ id: 'r' + n++, row: 0, date, means: '', label, credit: 0, debit, cat, sub, who: ['Foyer'],
  forecast: false, envelope: false, ...extra });
const data = {
  categories: [{ cat: 'Alimentation', sub: 'Restaurants', emoji: '', keywords: ['fries'] }, { cat: 'Santé', sub: 'Remboursements', emoji: '', keywords: ['cpam'] }],
  months: [{ ym: '2026-11', tab: 'Novembre 2026', opening: 0, rows: [
    row('2026-11-03', 'Auchan', 82.12, 'Alimentation', 'Courses'),
    row('', 'Prélèvement de Free Mobile', 18.99, 'Abonnements & télécoms', 'Mobile', { id: 'prev:fm', forecast: true }),
    row('', 'Alimentation', 300, 'Alimentation', '', { id: 'env:Alimentation|', forecast: true, envelope: true }),
  ] }],
};
const r = Bank.reconcile(data, ops);
assert.deepEqual(plain(r.known.map((k) => k.op.merchant)), ['Auchan.fr'], 'already typed: same amount, close date');
assert.deepEqual(plain(r.toPass.map((p) => [p.op.merchant, p.forecast.id, p.op.amount])), [['Free Mobile', 'prev:fm', 19.98]], 'the forecast is passed at the real amount');
assert.deepEqual(plain(r.missing.map((m) => [m.op.merchant, m.cat, m.sub])), [['Papa Fries', 'Alimentation', 'Restaurants'], ['C.P.A.M. De Meurthe', 'Santé', 'Remboursements']]);
assert.equal(r.skipped, 1, 'October has no tab: left out');

// The diff of one month: lines that differ from the Sheets, missing ones, forecasts passed or still waiting.
const data2 = { categories: data.categories, months: [{ ym: '2026-11', tab: 'Novembre 2026', opening: 0, rows: [
  row('2026-11-03', 'Auchan', 82.12, 'Alimentation', 'Courses'),
  row('2026-11-04', 'Papa Fries', 10, 'Alimentation', 'Restaurants'),
  row('', 'Prélèvement de Free Mobile', 18.99, 'Abonnements & télécoms', 'Mobile', { id: 'prev:fm2', forecast: true }),
  row('', 'Loyer', 800, 'Logement', 'Loyer', { id: 'prev:loyer', forecast: true }),
  row('', 'Alimentation', 300, 'Alimentation', '', { id: 'env:Alimentation|', forecast: true, envelope: true }),
] }] };
const d2 = Bank.reconcile(data2, ops, '2026-11');
assert.deepEqual(plain(d2.known.map((k) => k.op.merchant)), ['Auchan.fr']);
assert.deepEqual(plain(d2.differs.map((x) => [x.op.merchant, x.row.debit, x.op.amount])), [['Papa Fries', 10, 10.7]], 'same shop, close date, other amount');
assert.deepEqual(plain(d2.toPass.map((p) => p.forecast.id)), ['prev:fm2']);
assert.deepEqual(plain(d2.missing.map((m) => m.op.merchant)), ['C.P.A.M. De Meurthe']);
assert.deepEqual(plain(d2.waiting.map((f) => f.id)), ['prev:loyer'], 'not passed yet; budgets are not forecasts');
assert.equal(d2.skipped, 1, 'October is outside the month');
const late = Bank.reconcile(data2, [{ posted: '2026-11-02', date: '2026-10-31', label: 'ACHAT CB X 31.10.26', amount: 4, card: true, merchant: 'X' }], '2026-11');
assert.equal(late.skipped, 1, 'paid on 31 October, booked in November: October\'s');

// Transactions from the bank connection (Enable Banking): same shape as the CSV lines; pending ones are left out.
const api = Bank.fromApi([
  { status: 'BOOK', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '12.40', currency: 'EUR' }, booking_date: '2026-11-05',
    remittance_information: ['ACHAT CB PAPA FRIES 03.11.26 EUR 12,40 CARTE NO 123'] },
  { status: 'BOOK', credit_debit_indicator: 'CRDT', transaction_amount: { amount: '2500.00', currency: 'EUR' }, booking_date: '2026-11-28',
    debtor: { name: 'EMPLOYEUR A' }, remittance_information: ['VIREMENT DE EMPLOYEUR A SALAIRE'] },
  { status: 'PDNG', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '5.00', currency: 'EUR' }, booking_date: '2026-11-29', remittance_information: ['EN COURS'] },
]);
assert.deepEqual(plain(api.map((o) => [o.posted, o.date, o.amount, o.card, o.merchant])),
  [['2026-11-05', '2026-11-03', 12.4, true, 'Papa Fries'], ['2026-11-28', '2026-11-28', -2500, false, 'Employeur A']]);

console.log('bank: all checks pass');
