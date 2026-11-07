// In-memory stand-in for the parts of SpreadsheetApp that Code.gs uses, so the month-tab logic runs under node.
// Formulas understood: =F<r>+D<r>-E<r> and ='Tab'!F<r> (and plain numbers), enough for the running balance.
const blank = () => ({ v: '', f: '', bold: false });

export class Sheet {
  constructor(book, name) { this.book = book; this.name = name; this.rows = []; this.hidden = new Set(); }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getIndex() { return this.book.sheets.indexOf(this) + 1; }
  cell(r, c) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c) row.push(blank());
    return row[c - 1];
  }
  peek(r, c) { return (this.rows[r - 1] || [])[c - 1] || blank(); }
  getLastRow() {
    for (let r = this.rows.length; r > 0; r--) if (this.rows[r - 1].some((x) => x.v !== '' || x.f)) return r;
    return 0;
  }
  getLastColumn() { return this.rows.reduce((m, row) => Math.max(m, row.reduce((k, x, i) => (x.v !== '' || x.f ? i + 1 : k), 0)), 0); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  // Like Sheets, inserting or deleting a row shifts the row numbers in formulas that point below it.
  insertRowAfter(r) { this.rows.splice(r, 0, []); this.shiftRefs(r, +1); return this; }
  deleteRow(r) { this.rows.splice(r - 1, 1); this.shiftRefs(r, -1); return this; }
  shiftRefs(from, by) {
    const fix = (f, local) => f.replace(/('([^']+)'!)?([A-K])(\d+)/g, (all, q, tab, col, row) => {
      const mine = tab ? tab === this.name : local;
      if (mine && by < 0 && +row === from) return '#REF!'; // reference to the deleted row, as Sheets does
      return mine && +row > from ? `${q || ''}${col}${+row + by}` : all;
    });
    this.book.sheets.forEach((s) => s.rows.forEach((row) => row.forEach((x) => { if (x.f) x.f = fix(x.f, s === this); })));
  }
  hideColumns(c) { this.hidden.add(c); }
  setFrozenRows() {}
  copyTo(book) {
    const s = new Sheet(book, 'Copie de ' + this.name);
    s.rows = this.rows.map((row) => row.map((x) => ({ ...x })));
    book.sheets.push(s);
    return s;
  }
  // Value of a cell with formulas evaluated.
  value(r, c) {
    const x = this.peek(r, c);
    if (!x.f) return x.v;
    if (x.f.includes('#REF!')) return '#REF!';
    let m = x.f.match(/^=F(\d+)\+D(\d+)-E(\d+)$/);
    if (m) return n(this.value(+m[1], 6)) + n(this.value(+m[2], 4)) - n(this.value(+m[3], 5));
    m = x.f.match(/^='(.+)'!F(\d+)$/);
    if (m) return this.book.getSheetByName(m[1]).value(+m[2], 6);
    throw new Error('fake: unknown formula ' + x.f);
  }
}
const n = (v) => (v === '' ? 0 : Number(v));

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getSheet() { return this.sh; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
  getNumColumns() { return this.nc; }
  offset(dr, dc) { return new Range(this.sh, this.r + dr, this.c + dc, this.nr, this.nc); }
  setDataValidation(rule) { this.each((r, c) => { this.sh.cell(r, c).rule = rule; }); return this; }
  getDataValidation() { return this.sh.peek(this.r, this.c).rule || null; }
  each(fn) { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(fn(this.r + i, this.c + j, i, j)); out.push(row); } return out; }
  getValues() { return this.each((r, c) => { const v = this.sh.value(r, c); return typeof v === 'number' ? Math.round(v * 100) / 100 : v; }); }
  getValue() { return this.getValues()[0][0]; }
  getFormulas() { return this.each((r, c) => this.sh.peek(r, c).f); }
  getFormula() { return this.getFormulas()[0][0]; }
  getFontWeights() { return this.each((r, c) => (this.sh.peek(r, c).bold ? 'bold' : 'normal')); }
  setValues(vals) { this.each((r, c, i, j) => { const x = this.sh.cell(r, c); const v = vals[i][j]; if (typeof v === 'string' && v.startsWith('=')) { x.f = v; x.v = ''; } else { x.v = v; x.f = ''; } }); return this; }
  setValue(v) { return this.setValues([[v]]); }
  setFormula(f) { return this.setValues([[f]]); }
  setFormulas(fs) { return this.setValues(fs); }
  setFontWeight(w) { this.each((r, c) => { this.sh.cell(r, c).bold = w === 'bold'; }); return this; }
  setFontWeights(ws) { this.each((r, c, i, j) => { this.sh.cell(r, c).bold = ws[i][j] === 'bold'; }); return this; }
  clearContent() { this.each((r, c) => { const x = this.sh.cell(r, c); x.v = ''; x.f = ''; }); return this; }
  setNumberFormat() { return this; }
  setNumberFormats() { return this; }
}

export class Book {
  constructor() { this.sheets = []; this.active = null; }
  getSheetByName(name) { return this.sheets.find((s) => s.name === name) || null; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(name) { const s = new Sheet(this, name); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets.splice(this.sheets.indexOf(s), 1); }
  getSpreadsheetTimeZone() { return 'Europe/Paris'; }
  setActiveSheet(s) { this.active = s; return s; }
  moveActiveSheet(pos) { this.sheets.splice(this.sheets.indexOf(this.active), 1); this.sheets.splice(pos - 1, 0, this.active); }
  // Test helper: a sheet from rows of values; a value starting with '**' is written bold.
  add(name, rows) {
    const s = this.insertSheet(name);
    rows.forEach((row, i) => row.forEach((v, j) => {
      if (v === undefined || v === null) return;
      const bold = typeof v === 'string' && v.startsWith('**');
      s.getRange(i + 1, j + 1).setValue(bold ? v.slice(2) : v);
      if (bold) s.cell(i + 1, j + 1).bold = true;
    }));
    return s;
  }
}

const pad = (x) => ('0' + x).slice(-2);
// Runs the source of Code.gs against a Book, with "today" pinned. Returns the script's global functions.
export function loadCodeFrom(src, book, today) {
  let uuid = 0;
  const globals = {
    SpreadsheetApp: {
      getActive: () => book, getUi: () => ({}), flush: () => {},
      newDataValidation: () => { const rule = { list: null, allowInvalid: true };
        const b = { requireValueInList: (l) => { rule.list = l; return b; }, setAllowInvalid: (x) => { rule.allowInvalid = x; return b; }, build: () => rule };
        return b; }
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => ('0000000' + (++uuid).toString(16)).slice(-8) + '-x',
      formatDate: (d, tz, f) => f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
  };
  const names = [...src.matchAll(/^function (\w+)/gm)].map((m) => m[1]).concat(['TABS', 'MONTHS_FR']);
  const body = src + `\nnow = function () { return new Date(${JSON.stringify(today + 'T12:00:00')}); };\nreturn { ${names.join(', ')} };`;
  return new Function(...Object.keys(globals), body)(...Object.values(globals));
}
