// Run: node test/sheets.test.mjs — Code.gs against an in-memory spreadsheet laid out like hand-kept month tabs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Book, loadCodeFrom } from './fake-sheets.mjs';

const SRC = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const loadCode = (b, today = '2026-11-07') => loadCodeFrom(SRC, b, today);

const HEAD = ['Date', 'CB / Chèque', 'Libellé', 'Crédit', 'Débit', 'Solde', '', 'Catégorie', 'Sous-catégorie', 'Pour', 'ID'];
const d = (s) => new Date(s + 'T00:00:00');

// A spreadsheet with the settings tabs and November 2026 as kept by hand.
function book() {
  const b = new Book();
  b.add('Personnes', [['Nom'], ['Foyer'], ['Alex'], ['Camille'], ['Sam']]);
  b.add('Catégories', [['Catégorie', 'Sous-catégorie', 'Emoji', 'Mots-clés'], ['Alimentation', 'Courses', '🛒', 'auchan'],
    ['Transport', 'Carburant', '🚗', ''], ['Transport', 'Péage & parking', '🚗', ''], ['Revenus', 'Salaires', '💶', '']]);
  b.add('Budgets', [['Catégorie', 'Sous-catégorie', 'Libellé', 'Montant mensuel', 'Depuis'],
    ['Alimentation', '', 'Alimentation', 300, '2026-11'], ['Transport', 'Carburant', 'Carburant', 100, '2026-11']]);
  b.add('Charges fixes', [['Nom', 'CB / Chèque', 'Montant', 'Jour', 'Catégorie', 'Sous-catégorie', 'Pour', 'Mois', 'Début', 'Fin'],
    ['Prélèvement de Echéance Prêt', '', 800, 5, 'Logement', 'Loyer / crédit', 'Foyer', '', '', ''],
    ['Virement employeur A', '', 2500, 28, 'Revenus', 'Salaires', 'Foyer', '', '', ''],
    ['Taxe foncière', '', 346, 25, 'Impôts & finances', 'Taxe foncière', 'Foyer', '9', '', '']]);
  const nov = b.add('Novembre 2026', [
    [null, null, null, null, 'Report', 1500], [], HEAD, [],
    [d('2026-11-02'), null, 'Remboursement mutuelle', 9, null, null, null, 'Santé', 'Remboursements', 'Foyer', 'a1'],
    [d('2026-11-05'), 'CB du 03/11', 'Auchan', null, 82.12, null, null, 'Alimentation', 'Courses', 'Foyer', 'a2'],
    [], [],
    [null, null, '**Prélèvement de DGFIP', null, '**346', null, null, 'Impôts & finances', 'Taxe foncière'],
    [null, '**CB', '**Alimentation', null, '**300', null, null, 'Alimentation'],
    [null, null, '**Virement employeur A', '**2500', null, null, null, 'Revenus', 'Salaires']
  ]);
  for (let r = 5; r <= 100; r++) nov.getRange(r, 6).setFormula(r === 5 ? '=F1+D5-E5' : `=F${r - 1}+D${r}-E${r}`);
  nov.cell(9, 5).v = 346; nov.cell(10, 5).v = 300; nov.cell(11, 4).v = 2500; // '**' values were strings
  return b;
}

// ---------------------------------------------------------------- Task 1: reading
{
  const b = book(), code = loadCode(b);
  assert.equal(code.tabYm('Décembre 2026'), '2026-12');
  assert.equal(code.tabYm('Feuille 41'), '');
  assert.equal(code.tabName('2027-01'), 'Janvier 2027');

  const m = code.readMonth(b.getSheetByName('Novembre 2026'));
  assert.equal(m.ym, '2026-11');
  assert.equal(m.opening, 1500);
  const real = m.rows.filter((r) => !r.forecast), fc = m.rows.filter((r) => r.forecast);
  assert.deepEqual(real.map((r) => [r.date, r.credit, r.debit, r.cat]), [['2026-11-02', 9, 0, 'Santé'], ['2026-11-05', 0, 82.12, 'Alimentation']]);
  assert.equal(fc.length, 3);
  assert.equal(fc.find((r) => r.label === 'Alimentation').envelope, true, 'bold line named like a Budgets label is an envelope');
  assert.equal(fc.find((r) => r.label === 'Prélèvement de DGFIP').envelope, false);
  assert.ok(fc.every((r) => r.id.startsWith('prev:') || r.id.startsWith('env:')), 'forecasts get an id');
  assert.equal(b.getSheetByName('Novembre 2026').value(10, 11), 'env:Alimentation|', 'the id is written to column K');
  assert.deepEqual(real[0].who, ['Foyer']);
}
{
  // A normal line typed under the bold ones is a real operation; a line with no label but an amount is kept.
  const b = book(), nov = b.getSheetByName('Novembre 2026');
  nov.getRange(12, 1, 1, 5).setValues([[d('2026-11-06'), '', '', '', 12]]);
  const m = loadCode(b).readMonth(nov);
  const typed = m.rows.find((r) => r.debit === 12);
  assert.equal(typed.forecast, false);
  assert.equal(typed.cat, 'Divers');
  assert.equal(typed.sub, 'À classer');
}
{
  const b = book(), data = loadCode(b).getData();
  assert.deepEqual(data.months.map((x) => x.ym), ['2026-11']);
  assert.equal(data.today, '2026-11-07');
  assert.deepEqual(data.budgets[1], { cat: 'Transport', sub: 'Carburant', label: 'Carburant', amount: 100, since: '2026-11' });
}

// ---------------------------------------------------------------- Task 2: writing
const end = (b, name) => { const sh = b.getSheetByName(name); return Math.round(sh.value(100, 6) * 100) / 100; };
const realLabels = (b, name) => loadCode(b).readMonth(b.getSheetByName(name)).rows.filter((r) => !r.forecast).map((r) => r.label);
{
  // A new expense goes after the last real row, above the bold ones, and the running balance stays right.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  code.prepareMonth('2026-11'); // envelopes up to date first
  const before = end(b, 'Novembre 2026');
  const data = code.saveExpense({ date: '2026-11-06', amount: 12.5, cat: 'Loisirs', sub: 'Sport', label: 'Piscine', who: ['Foyer'] }); // no envelope here
  assert.ok(data.saved);
  assert.deepEqual(realLabels(b, 'Novembre 2026'), ['Remboursement mutuelle', 'Auchan', 'Piscine']);
  assert.equal(nov.value(7, 2), 'CB du 06/11');
  assert.equal(nov.peek(9, 3).bold, true, 'forecasts stay below, untouched');
  assert.equal(end(b, 'Novembre 2026'), Math.round((before - 12.5) * 100) / 100);
}
{
  // An earlier date is inserted among the real rows in date order.
  const b = book(), code = loadCode(b);
  code.saveExpense({ date: '2026-11-03', amount: 5, cat: 'Alimentation', sub: 'Courses', label: 'Pain', who: ['Foyer'] });
  assert.deepEqual(realLabels(b, 'Novembre 2026'), ['Remboursement mutuelle', 'Pain', 'Auchan']);
}
{
  // A refund is written as a credit; deleting gives the balance back.
  const b = book(), code = loadCode(b);
  code.prepareMonth('2026-11');
  const before = end(b, 'Novembre 2026');
  const id = code.saveExpense({ date: '2026-11-06', amount: -20, cat: 'Santé', sub: 'Remboursements', label: 'CPAM', who: ['Foyer'] }).saved;
  assert.equal(end(b, 'Novembre 2026'), Math.round((before + 20) * 100) / 100);
  code.deleteExpense(id);
  assert.equal(end(b, 'Novembre 2026'), before);
}
{
  // Editing the date into another month moves the row; the next month's report follows.
  const b = book(), code = loadCode(b);
  code.prepareMonth('2026-12');
  const id = code.saveExpense({ date: '2026-11-06', amount: 40, cat: 'Alimentation', sub: 'Courses', label: 'Lidl', who: ['Foyer'] }).saved;
  code.saveExpense({ id, date: '2026-12-02', amount: 40, cat: 'Alimentation', sub: 'Courses', label: 'Lidl', who: ['Foyer'] });
  assert.ok(!realLabels(b, 'Novembre 2026').includes('Lidl'));
  assert.ok(realLabels(b, 'Décembre 2026').includes('Lidl'));
  const dec = b.getSheetByName('Décembre 2026');
  assert.equal(dec.peek(1, 6).f, "='Novembre 2026'!F100");
  assert.equal(dec.value(1, 6), end(b, 'Novembre 2026'));
}
{
  // With 96 rows already used the new row lands on 101 and the report points at it.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  code.prepareMonth('2026-12');
  for (let r = 12; r <= 100; r++) nov.getRange(r, 1, 1, 5).setValues([[d('2026-11-06'), '', 'x' + r, '', 1]]);
  code.saveExpense({ date: '2026-11-07', amount: 3, cat: 'Alimentation', sub: 'Courses', label: 'Dernier', who: ['Foyer'] });
  assert.ok(nov.peek(101, 6).f, 'formula extended to the new last row');
  assert.equal(b.getSheetByName('Décembre 2026').peek(1, 6).f, "='Novembre 2026'!F101");
}
{
  // "C'est passé" turns a forecast into a real operation with the amount and date given.
  const b = book(), code = loadCode(b);
  const tax = code.readMonth(b.getSheetByName('Novembre 2026')).rows.find((r) => r.label === 'Prélèvement de DGFIP');
  code.markPassed(tax.id, 349, '2026-11-06');
  const m = code.readMonth(b.getSheetByName('Novembre 2026'));
  const passed = m.rows.find((r) => r.label === 'Prélèvement de DGFIP');
  assert.equal(passed.forecast, false);
  assert.equal(passed.debit, 349);
  assert.equal(passed.date, '2026-11-06');
  assert.equal(passed.cat, 'Impôts & finances');
  assert.equal(m.rows.filter((r) => r.label === 'Prélèvement de DGFIP').length, 1);
}

// ---------------------------------------------------------------- Task 3: months and envelopes
const env = (b, name, key) => loadCode(b).readMonth(b.getSheetByName(name)).rows.find((r) => r.id === 'env:' + key);
{
  const b = book(), code = loadCode(b);
  code.prepareMonth('2026-12');
  const dec = b.getSheetByName('Décembre 2026');
  assert.equal(b.getSheets().indexOf(dec), b.getSheets().indexOf(b.getSheetByName('Novembre 2026')) + 1, 'placed after November');
  assert.equal(dec.peek(1, 6).f, "='Novembre 2026'!F100");
  const m = code.readMonth(dec);
  assert.ok(m.rows.every((r) => r.forecast), 'a new month holds forecasts only');
  assert.deepEqual(m.rows.map((r) => r.label), ['Prélèvement de Echéance Prêt', 'Virement employeur A', 'Alimentation', 'Carburant'],
    'active fixed charges (not the September tax), then envelopes');
  assert.equal(m.rows[1].credit, 2500, 'incomes are credits');
  assert.equal(m.rows[2].debit, 300);
  assert.equal(code.ensureMonth(b, '2026-07'), null, 'no tab created for a past month');
  assert.equal(b.getSheetByName('Juillet 2026'), null);
}
{
  const b = book(), code = loadCode(b);
  code.prepareMonth('2026-11');
  assert.equal(env(b, 'Novembre 2026', 'Alimentation|').debit, 217.88, '300 − Auchan 82,12');
  const id = code.saveExpense({ date: '2026-11-06', amount: 400, cat: 'Alimentation', sub: 'Courses', label: 'Gros plein', who: ['Foyer'] }).saved;
  assert.equal(env(b, 'Novembre 2026', 'Alimentation|').debit, 0, 'never below zero');
  code.deleteExpense(id);
  assert.equal(env(b, 'Novembre 2026', 'Alimentation|').debit, 217.88, 'comes back up');
}
{
  // A sub-category envelope is only lowered by its own sub-category.
  const b = book(), code = loadCode(b);
  code.prepareMonth('2026-12');
  code.saveExpense({ date: '2026-12-03', amount: 30, cat: 'Transport', sub: 'Péage & parking', label: 'Péage', who: ['Foyer'] });
  assert.equal(env(b, 'Décembre 2026', 'Transport|Carburant').debit, 100);
  code.saveExpense({ date: '2026-12-03', amount: 30, cat: 'Transport', sub: 'Carburant', label: 'Esso', who: ['Foyer'] });
  assert.equal(env(b, 'Décembre 2026', 'Transport|Carburant').debit, 70);
}
{
  // Opening the app on a month without a tab creates it and brings envelopes up to date.
  const b = book(), data = loadCode(b, '2026-12-01').getData();
  assert.deepEqual(data.months.map((m) => m.ym), ['2026-11', '2026-12']);
}

// ---------------------------------------------------------------- final review fixes
{
  // C1: an envelope line un-bolded by hand is a real operation, and its amount stays put from one open to the next.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  code.getData();
  nov.getRange(10, 1, 1, 11).setFontWeight('normal');
  const first = code.getData(true), second = code.getData(true);
  const line = (d) => d.months[0].rows.find((r) => r.id === 'env:Alimentation|');
  assert.equal(line(first).envelope, false);
  assert.equal(line(first).forecast, false);
  assert.equal(line(second).debit, line(first).debit, 'not rewritten on every open');
}
{
  // I1: editing a cheque keeps its "CB / Chèque" cell.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  nov.getRange(6, 2).setValue('Chèque n° 0603045');
  code.saveExpense({ id: 'a2', date: '2026-11-05', amount: 82.12, cat: 'Santé', sub: 'Médecin', label: 'Auchan', who: ['Foyer'] });
  assert.equal(nov.value(6, 2), 'Chèque n° 0603045');
}
{
  // The payment mention chosen in the app wins, at creation and when editing.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  const id = code.saveExpense({ date: '2026-11-06', amount: 30, cat: 'Loisirs', sub: 'Sport', label: 'Club', who: ['Foyer'], means: 'Chèque n° 1234' }).saved;
  const row = () => code.readMonth(nov).rows.find((r) => r.id === id);
  assert.equal(row().means, 'Chèque n° 1234');
  code.saveExpense({ id, date: '2026-11-06', amount: 30, cat: 'Loisirs', sub: 'Sport', label: 'Club', who: ['Foyer'], means: 'CB du 06/11' });
  assert.equal(row().means, 'CB du 06/11');
  code.saveExpense({ id, date: '2026-11-06', amount: 30, cat: 'Loisirs', sub: 'Sport', label: 'Club', who: ['Foyer'], means: '' });
  assert.equal(row().means, '');
}
{
  // I2: rows typed by hand past row 100, or inserted mid-tab, are in the balance and the next report after an open.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  code.prepareMonth('2026-12');
  nov.getRange(101, 1, 1, 5).setValues([[d('2026-11-06'), '', 'Tapé à la main', '', 500]]);
  nov.insertRowAfter(5);
  nov.getRange(6, 1, 1, 5).setValues([[d('2026-11-03'), '', 'Inséré à la main', '', 10]]);
  const data = code.getData(true);
  const dec = b.getSheetByName('Décembre 2026'), nm = data.months.find((m) => m.ym === '2026-11');
  const expected = Math.round((nm.opening + nm.rows.reduce((s, r) => s + r.credit - r.debit, 0)) * 100) / 100;
  assert.equal(dec.peek(1, 6).f, "='Novembre 2026'!F102");
  assert.equal(Math.round(dec.value(1, 6) * 100) / 100, expected);
}
{
  // I3: months can be prepared up to a year ahead (with the months between); further is refused.
  const b = book(), code = loadCode(b), tabs = b.getSheets().length;
  assert.throws(() => code.saveExpense({ date: '2027-12-02', amount: 5, cat: 'Loisirs', sub: 'Sport', label: 'x', who: ['Foyer'] }), /trop loin/);
  assert.equal(b.getSheets().length, tabs);
  const data = code.prepareMonth('2027-02');
  assert.deepEqual(['Décembre 2026', 'Janvier 2027', 'Février 2027'].map((n) => !!b.getSheetByName(n)), [true, true, true]);
  assert.ok(data.months.some((m) => m.ym === '2027-02'));
}
{
  // Forecasts ("À venir") are added, edited and deleted from the app: bold lines without a date at the bottom of their month.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  const fc = (id) => code.readMonth(nov).rows.find((r) => r.id === id);
  const data = code.saveForecast({ id: 'prev:new1', ym: '2026-11', amount: 40, label: 'Vétérinaire', cat: 'Loisirs', sub: 'Sport', who: ['Foyer'] });
  assert.ok(data.months.some((m) => m.rows.some((r) => r.id === 'prev:new1')), 'fresh data comes back');
  assert.deepEqual([fc('prev:new1').forecast, fc('prev:new1').debit, fc('prev:new1').date], [true, 40, '']);
  const rows = code.readMonth(nov).rows;
  assert.equal(rows[rows.length - 1].id, 'prev:new1', 'at the bottom of the month');
  code.saveForecast({ id: 'prev:new1', ym: '2026-11', amount: -55, label: 'Mutuelle', cat: 'Loisirs', sub: 'Sport', who: ['Foyer'] });
  assert.deepEqual([fc('prev:new1').forecast, fc('prev:new1').credit, fc('prev:new1').debit, fc('prev:new1').label], [true, 55, 0, 'Mutuelle']);
  assert.equal(code.readMonth(nov).rows.length, rows.length, 'edited in place');
  code.deleteExpense('prev:new1', false);
  assert.equal(fc('prev:new1'), undefined);
  assert.throws(() => code.saveForecast({ id: 'a2', ym: '2026-11', amount: 5, label: 'x', cat: 'Loisirs', sub: 'Sport', who: ['Foyer'] }), /déjà passée/);
}
{
  // getData is served from the cache until a write, an edit by hand (onEdit) or a pull to refresh (fresh).
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  const label = (data) => data.months.find((m) => m.ym === '2026-11').rows.find((r) => r.row === 6).label;
  code.getData();
  nov.getRange(6, 3).setValue('Changé à la main');
  assert.notEqual(label(code.getData()), 'Changé à la main', 'served from the cache');
  assert.equal(label(code.getData(true)), 'Changé à la main', 'a pull reads the Sheets');
  nov.getRange(6, 3).setValue('Encore');
  code.onEdit({ range: nov.getRange(6, 3) });
  assert.equal(label(code.getData()), 'Encore', 'an edit by hand clears the cache');
  const id = code.saveExpense({ date: '2026-11-06', amount: 3, cat: 'Loisirs', sub: 'Sport', label: 'Écrit', who: ['Foyer'] }).saved;
  assert.ok(code.getData().months.some((m) => m.rows.some((r) => r.id === id)), 'a write clears the cache');
}
{
  // M5: "C'est passé" with a date in a past month without a tab is refused.
  const b = book(), code = loadCode(b);
  const tax = code.readMonth(b.getSheetByName('Novembre 2026')).rows.find((r) => r.label === 'Prélèvement de DGFIP');
  assert.throws(() => code.markPassed(tax.id, 346, '2026-07-10'), /Pas d'onglet/);
}

// ---------------------------------------------------------------- dropdowns typed by hand
{
  // Picking a category by hand narrows the sub-category dropdown to that category and clears a sub that no longer fits.
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  nov.getRange(5, 8).setValue('Transport');
  code.onEdit({ range: nov.getRange(5, 8) });
  assert.deepEqual(nov.getRange(5, 9).getDataValidation().list, ['Carburant', 'Péage & parking']);
  assert.equal(nov.getRange(5, 9).getDataValidation().allowInvalid, false);
  assert.equal(nov.value(5, 9), '', 'Remboursements is not a Transport sub-category');
  // A sub-category that fits is kept; an edit elsewhere does nothing.
  nov.getRange(6, 9).setValue('Courses');
  code.onEdit({ range: nov.getRange(6, 8) });
  assert.equal(nov.value(6, 9), 'Courses');
  code.onEdit({ range: nov.getRange(6, 3) });
  // Charges fixes: category in E, sub-category in F.
  const fx = b.getSheetByName('Charges fixes');
  fx.getRange(2, 5).setValue('Alimentation');
  code.onEdit({ range: fx.getRange(2, 5) });
  assert.deepEqual(fx.getRange(2, 6).getDataValidation().list, ['Courses']);
}

// ---------------------------------------------------------------- trash
{
  // A deleted line goes to a "Corbeille" tab and can be put back where it was.
  const b = book(), code = loadCode(b);
  code.prepareMonth('2026-11');
  const before = end(b, 'Novembre 2026');
  code.deleteExpense('a2');
  const trash = b.getSheetByName('Corbeille');
  assert.ok(trash, 'trash tab created');
  assert.equal(trash.value(1, 1), 'Supprimée le');
  assert.equal(trash.value(2, 2), 'Novembre 2026');
  assert.equal(trash.value(2, 5), 'Auchan');
  assert.ok(!realLabels(b, 'Novembre 2026').includes('Auchan'));
  const data = code.restoreExpense('a2');
  assert.ok(realLabels(b, 'Novembre 2026').includes('Auchan'));
  assert.equal(end(b, 'Novembre 2026'), before);
  assert.equal(trash.getLastRow(), 1, 'taken out of the trash');
  assert.equal(data.trash.length, 0);
}
{
  // Undoing an expense just added does not fill the trash; getData lists what is in it.
  const b = book(), code = loadCode(b);
  const id = code.saveExpense({ date: '2026-11-06', amount: 4, cat: 'Loisirs', sub: 'Sport', label: 'Piscine', who: ['Foyer'] }).saved;
  code.deleteExpense(id, false);
  assert.equal(b.getSheetByName('Corbeille'), null);
  code.deleteExpense('a1');
  const t = code.getData().trash;
  assert.deepEqual(t.map((x) => [x.id, x.label, x.tab]), [['a1', 'Remboursement mutuelle', 'Novembre 2026']]);
}

// ---------------------------------------------------------------- savings tabs
{
  const b = book();
  b.add('Epargne Alex', [['LA', 1200, 'Appart : 300 €'], ['LDDS', 10, 'Vacances : 0€'], [], ['Total ', 1210], [], [], ['Placement mensuel'], [],
    ['LA', 250], ['LDDS', 500], [], ['Total ', 750]]);
  b.add('Epargne Camille', [['LA', 0.73], [], ['Total', 0.73], [], [], ['Placement mensuel'], [], ['LA', 0], [], ['Total', 0]]);
  const s = loadCode(b).getData().savings;
  assert.deepEqual(s.map((x) => x.who), ['Alex', 'Camille']);
  assert.deepEqual(s[0].accounts, [{ name: 'LA', amount: 1200 }, { name: 'LDDS', amount: 10 }]);
  assert.equal(s[0].total, 1210);
  assert.deepEqual(s[0].monthly, [{ name: 'LA', amount: 250 }, { name: 'LDDS', amount: 500 }]);
  assert.equal(s[0].monthlyTotal, 750);
  assert.deepEqual(s[0].goals, [{ label: 'Appart', amount: 300 }, { label: 'Vacances', amount: 0 }]);
  assert.equal(s[1].total, 0.73);
}

// ---------------------------------------------------------------- bank import, in one go
{
  const b = book(), code = loadCode(b), nov = b.getSheetByName('Novembre 2026');
  const tax = code.readMonth(nov).rows.find((r) => r.label === 'Prélèvement de DGFIP');
  const data = code.importBank([
    { type: 'pass', id: tax.id, amount: 349, date: '2026-11-06' },
    { type: 'add', expense: { date: '2026-11-03', amount: 10.7, cat: 'Alimentation', sub: 'Restaurants', label: 'Papa Fries', who: ['Foyer'], means: 'CB du 03/11' } },
    { type: 'add', expense: { date: '2026-11-04', amount: -9, cat: 'Santé', sub: 'Remboursements', label: 'Virement de CPAM', who: ['Foyer'], means: '' } },
  ]);
  const m = data.months.find((x) => x.ym === '2026-11');
  assert.equal(m.rows.find((r) => r.label === 'Prélèvement de DGFIP').forecast, false);
  const fries = m.rows.find((r) => r.label === 'Papa Fries');
  assert.equal(fries.debit, 10.7);
  assert.equal(fries.means, 'CB du 03/11');
  assert.equal(m.rows.find((r) => r.label === 'Virement de CPAM').means, '', 'a transfer keeps an empty CB / Chèque cell');
  assert.deepEqual(realLabels(b, 'Novembre 2026'), ['Remboursement mutuelle', 'Papa Fries', 'Virement de CPAM', 'Auchan', 'Prélèvement de DGFIP']);
}

// ---------------------------------------------------------------- access: Google sign-in, for the people the Sheets is shared with
{
  const b = book(), code = loadCode(b);
  b.owner = 'owner@gmail.com'; b.editors = ['owner@gmail.com', 'alex@gmail.com'];
  const exp = String(Math.floor(Date.now() / 1000) + 3600), aud = code.GOOGLE_CLIENT_ID;
  const idt = (email, extra = {}) => ({ aud, iss: 'https://accounts.google.com', email, email_verified: 'true', exp, ...extra });
  b.idTokens = { good: idt('alex@gmail.com'), stranger: idt('bot@gmail.com'), otherApp: idt('alex@gmail.com', { aud: 'someone-else' }),
    unverified: idt('alex@gmail.com', { email_verified: 'false' }), old: idt('alex@gmail.com', { exp: '1000' }) };
  const post = (body) => JSON.parse(code.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  assert.deepEqual(post({ fn: 'getData', args: [] }), { error: 'auth' }, 'nothing without a key');
  assert.deepEqual(post({ fn: 'login', pw: 'anything' }), { error: 'auth' }, 'no password login any more');
  for (const t of ['stranger', 'otherApp', 'unverified', 'old', 'forged']) {
    assert.equal(post({ fn: 'googleLogin', credential: t }).error, t === 'stranger' ? 'denied' : 'auth', t);
  }
  const token = post({ fn: 'googleLogin', credential: 'good' }).data.token;
  assert.ok(token.length >= 32);
  assert.ok(post({ token, fn: 'getData', args: [] }).data.months, 'the key opens the data');
  assert.deepEqual(post({ token: token + 'x', fn: 'getData', args: [] }), { error: 'auth' });
  b.editors = ['owner@gmail.com'];
  code.forgetAccessCache();
  assert.deepEqual(post({ token, fn: 'getData', args: [] }), { error: 'auth' }, 'un-sharing the Sheets closes the app too');
  b.editors = ['owner@gmail.com', 'alex@gmail.com']; code.forgetAccessCache();
  const again = post({ fn: 'googleLogin', credential: 'good' }).data.token;
  code.logoutAll();
  assert.deepEqual(post({ token: again, fn: 'getData', args: [] }), { error: 'auth' }, 'revoked from the Sheets menu');
}

console.log('sheets: all checks pass');
