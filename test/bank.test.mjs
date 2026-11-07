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

console.log('bank: all checks pass');
