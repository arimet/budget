// Interface: one state object, each screen rendered from it as an HTML string, clicks handled by delegation.
import './style.css';
import { Calc } from './calc.js';

// The Apps Script web app bound to the spreadsheet (apps-script/Code.gs, doPost).
var API_URL = 'https://script.google.com/macros/s/AKfycbxyr6VEJfNQ8ldL1vnc-MEFV6bQ4dYZ1qvTyeCMC5_x1lbwmCcbs2M36ITvcrTUSF0/exec';
var PW_KEY = 'budget-pw';

var S = { pw: '', data: null, tab: 'month', back: 'month', ym: null, edit: null, form: null, open: {}, undo: null, loadedAt: 0,
  dash: { kind: 'month', anchor: null, person: '', cat: '', evo: 'cat' } };
var view = document.getElementById('view');
var eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
var eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

function $(sel) { return document.querySelector(sel); }
function money(n) { return eur.format(n); }
function money0(n) { return eur0.format(n); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function dec(v) { var s = String(v).replace(/[\s €]/g, '').replace(',', '.'); return s === '' ? NaN : Number(s); }
function today() { return S.data.today; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function asDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
function monthName(ym) { return cap(asDate(ym).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })); }
function shortMonth(ym) { return asDate(ym).toLocaleDateString('fr-FR', { month: 'short' }); }
function dayName(iso) { return asDate(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
function shortDate(iso) { return asDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
function emojiOf(cat, sub) {
  var c = S.data.categories.filter(function (c) { return c.cat === cat && c.sub === sub; })[0]
    || S.data.categories.filter(function (c) { return c.cat === cat; })[0];
  return (c && c.emoji) || '•';
}
function ico(cat, sub) { return '<span class="e">' + emojiOf(cat, sub) + '</span>'; }
var ICONS = {
  prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5 9-10"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
};
function icon(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'; }
function stepper(prefix, label) {
  return '<div class="stepper"><button data-action="' + prefix + '-prev" aria-label="Précédent">' + icon('prev') + '</button><span>' + esc(label) +
    '</span><button data-action="' + prefix + '-next" aria-label="Suivant">' + icon('next') + '</button></div>';
}

// ------------------------------------------------------------ server
function password() {
  if (!S.pw) try { S.pw = localStorage.getItem(PW_KEY) || ''; } catch (e) { /* private mode */ }
  return S.pw;
}
function post(pw, fn, args) {
  if (import.meta.env.MODE === 'mock') return import('./mock.js').then(function (m) { return m.mockCall(pw, fn, args); });
  // text/plain keeps it a "simple" request: Apps Script answers no CORS preflight.
  return fetch(API_URL, { method: 'POST', body: JSON.stringify({ pw: pw, fn: fn, args: args }) }).then(function (r) {
    if (!r.ok) throw new Error('Le serveur ne répond pas (' + r.status + ').');
    return r.json();
  }, function () { throw new Error('Pas de connexion. Réessaie dans un instant.'); });
}
function call(fn) {
  var args = [].slice.call(arguments, 1);
  return post(password(), fn, args).then(function (res) {
    if (res.error === 'auth') { lock(); throw new Error('Mot de passe à saisir de nouveau.'); }
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}
function load() { return call('getData').then(setData).catch(fail); }
function setData(d) {
  S.data = d;
  S.loadedAt = Date.now();
  if (!S.ym) { S.ym = d.today.slice(0, 7); S.dash.anchor = S.ym; }
  render(true);
}
function fail(e) { toast((e && e.message) || String(e), { error: true }); }

// ------------------------------------------------------------ password gate
function lock() {
  try { localStorage.removeItem(PW_KEY); } catch (e) { /* private mode: nothing stored */ }
  S.pw = ''; S.data = null;
  document.body.classList.add('locked');
  view.innerHTML = '<form class="gate" id="gate" novalidate><span class="mark big">€</span><h1>Budget du foyer</h1>' +
    '<p>Saisis le mot de passe du foyer. Il reste enregistré sur cet appareil.</p>' +
    '<label class="pwbox">' + icon('lock') + '<input id="pw" type="password" autocomplete="current-password" placeholder="Mot de passe" aria-label="Mot de passe" required></label>' +
    '<p class="gate-err" id="gate-err" role="alert"></p><button class="btn primary" id="gate-go">Entrer</button></form>';
  $('#pw').focus();
}
function unlock(ev) {
  ev.preventDefault();
  var pw = $('#pw').value, btn = $('#gate-go'), err = $('#gate-err');
  if (!pw) { $('#pw').focus(); return; }
  btn.disabled = true; btn.textContent = 'Vérification…'; err.textContent = '';
  post(pw, 'getData', []).then(function (res) {
    if (res.error) throw new Error(res.error === 'auth' ? 'Mot de passe incorrect.' : res.error);
    S.pw = pw;
    try { localStorage.setItem(PW_KEY, pw); } catch (e) { /* kept for this visit only */ }
    document.body.classList.remove('locked');
    setData(res.data);
  }).catch(function (e) {
    btn.disabled = false; btn.textContent = 'Entrer'; err.textContent = e.message;
    $('#pw').select();
  });
}
// Coming back to the app re-reads the spreadsheet, so edits made by hand show up.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && S.data && Date.now() - S.loadedAt > 20000) load();
});

function toast(msg, opts) {
  opts = opts || {};
  var t = $('#toast');
  t.className = 'on' + (opts.error ? ' err' : '');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.undo ? '<button data-action="undo">Annuler</button>' : '');
  S.undo = opts.undo ? { call: opts.undo, msg: opts.undone } : null;
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(function () { t.className = ''; }, opts.error ? 7000 : 4500);
}

// ------------------------------------------------------------ rendering
var VIEWS = { add: viewAdd, month: viewMonth, plan: viewPlan, dash: viewDash };

function render(fromData) {
  document.querySelectorAll('.nav [data-tab]').forEach(function (b) {
    if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  // A reload must not wipe an expense being typed.
  if (fromData && S.tab === 'add' && $('#f')) { paintAdd(); return; }
  view.innerHTML = VIEWS[S.tab]();
  if (S.tab === 'add') {
    paintAdd();
    if (!S.edit && window.matchMedia('(pointer:fine)').matches) $('#amount').focus();
  }
}

function rowHtml(e, withDate) {
  return '<button class="row" data-action="edit" data-id="' + esc(e.id) + '"><span class="emo">' + emojiOf(e.cat, e.sub) + '</span>' +
    '<span class="txt"><b>' + esc(e.label || e.sub || e.cat) + '</b><small>' + esc(e.sub || e.cat) + ' · ' + esc(e.who.join(', ')) +
    (withDate ? ' · ' + shortDate(e.date) : '') + '</small></span><span class="amt' + (e.amount < 0 ? ' refund' : '') + '">' +
    (e.amount < 0 ? '+' + money(-e.amount) : money(e.amount)) + '</span></button>';
}

// ------------------------------------------------------------ add / edit
function newForm() { return { id: null, cat: '', sub: '', suggested: false, manual: false, who: [S.data.people[0]] }; }

function viewAdd() {
  var e = S.edit;
  if (!S.form) S.form = newForm();
  return '<form class="form" id="f" novalidate>' +
    '<div class="head"><h1>' + (e ? 'Modifier la dépense' : 'Nouvelle dépense') + '</h1>' +
    '<button type="button" class="iconbtn" data-action="cancel-edit" aria-label="' + (e ? 'Annuler la modification' : 'Fermer') + '">' + icon('close') + '</button></div>' +
    '<label class="amount" id="amountbox"><input id="amount" inputmode="decimal" enterkeyhint="next" placeholder="0,00" autocomplete="off" aria-label="Montant en euros" value="' +
    (e ? String(e.amount).replace('.', ',') : '') + '"><span>€</span></label>' +
    '<div class="field"><label class="l" for="label">Libellé <span>facultatif</span></label>' +
    '<input id="label" class="input" list="labels" enterkeyhint="done" autocomplete="off" placeholder="Carrefour, pharmacie…" value="' + (e ? esc(e.label) : '') + '">' +
    '<datalist id="labels"></datalist></div>' +
    '<div class="field"><span class="l">Catégorie <em id="sugg"></em></span><button type="button" class="catbtn" id="catbtn" data-action="pick"></button>' +
    '<div class="pills scroller" id="quick"></div></div>' +
    '<div class="field"><span class="l">Pour <span id="sharehint"></span></span><div class="pills" id="who"></div></div>' +
    '<div class="field"><label class="l" for="date">Date</label><input type="date" id="date" class="input" value="' + (e ? e.date : today()) + '"></div>' +
    '<div class="actions"><button class="btn primary" id="submit">' + (e ? 'Enregistrer' : 'Ajouter') + '</button>' +
    (e ? '<button type="button" class="btn danger" data-action="delete">Supprimer</button>' : '') + '</div></form>' +
    (e ? '' : '<section class="field"><h2>Dernières dépenses</h2><div class="well" id="recent"></div></section>');
}

function paintAdd() { paintCat(); paintQuick(); paintWho(); paintLists(); }

function paintCat() {
  var f = S.form, b = $('#catbtn');
  b.classList.toggle('none', !f.cat);
  b.classList.remove('bad');
  b.innerHTML = f.cat
    ? '<span class="emo">' + emojiOf(f.cat, f.sub) + '</span><span>' + esc(f.sub || f.cat) + '<small>' + esc(f.cat) + '</small></span>'
    : '<span class="emo">' + icon('plus') + '</span><span>Choisir une catégorie</span>';
  $('#sugg').textContent = f.suggested ? 'suggérée' : '';
}

function paintQuick() {
  var f = S.form;
  $('#quick').innerHTML = Calc.topSubs(S.data, 6, today()).map(function (c) {
    return '<button type="button" class="pill" data-action="quick" data-cat="' + esc(c.cat) + '" data-sub="' + esc(c.sub) + '" aria-pressed="' +
      (f.cat === c.cat && f.sub === c.sub) + '">' + ico(c.cat, c.sub) + esc(c.sub || c.cat) + '</button>';
  }).join('');
}

function paintWho() {
  var f = S.form;
  $('#who').innerHTML = S.data.people.map(function (p) {
    return '<button type="button" class="pill" data-action="who" data-person="' + esc(p) + '" aria-pressed="' + (f.who.indexOf(p) >= 0) + '">' + esc(p) + '</button>';
  }).join('');
  $('#sharehint').textContent = f.who.length > 1 ? 'parts égales' : '';
}

function paintLists() {
  var labels = [], seen = {};
  sortedExpenses().forEach(function (e) {
    var k = e.label.toLowerCase();
    if (e.label && !seen[k] && labels.length < 300) { seen[k] = 1; labels.push(e.label); }
  });
  $('#labels').innerHTML = labels.map(function (l) { return '<option value="' + esc(l) + '">'; }).join('');
  var recent = $('#recent');
  if (recent) {
    var last = sortedExpenses().slice(0, 5);
    recent.innerHTML = last.length ? last.map(function (e) { return rowHtml(e, true); }).join('') : '<p class="empty">Rien pour l\'instant.</p>';
  }
}

// Every real operation of every month tab (salaries and transfers included).
function realRows() {
  return S.data.months.reduce(function (out, m) { return out.concat(Calc.month(S.data, m.ym).expenses); }, []);
}

// Spending, newest first: by date, then by position in the sheet.
function sortedExpenses() {
  return Calc.expenses(S.data).map(function (e, i) { return [e, i]; })
    .sort(function (a, b) { return a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : b[1] - a[1]; })
    .map(function (x) { return x[0]; });
}

function setCat(cat, sub, manual) {
  S.form.cat = cat; S.form.sub = sub; S.form.manual = manual; S.form.suggested = !manual && !!cat;
  paintCat(); paintQuick();
}

document.addEventListener('input', function (ev) {
  if (ev.target.id === 'label' && !S.form.manual) {
    var s = Calc.suggest(S.data, ev.target.value);
    if (s) setCat(s.cat, s.sub, false);
    else if (S.form.suggested) setCat('', '', false);
  }
  if (ev.target.id === 'amount') $('#amountbox').removeAttribute('aria-invalid');
});

document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && ev.target.id === 'amount') { ev.preventDefault(); $('#label').focus(); }
});

document.addEventListener('submit', function (ev) {
  if (ev.target.id === 'gate') return unlock(ev);
  if (ev.target.id !== 'f') return;
  ev.preventDefault();
  var f = S.form, amount = dec($('#amount').value);
  if (!isFinite(amount) || amount === 0) { $('#amountbox').setAttribute('aria-invalid', 'true'); $('#amount').focus(); return; }
  if (!f.cat) { $('#catbtn').classList.add('bad'); openPicker(); return; }
  var payload = { id: f.id, date: $('#date').value || today(), amount: amount, cat: f.cat, sub: f.sub,
    label: $('#label').value.trim(), who: f.who };
  var btn = $('#submit');
  btn.disabled = true;
  call('saveExpense', payload).then(function (d) {
    var wasEdit = !!S.edit;
    S.form = null;
    S.edit = null; S.tab = S.back;
    S.data = d; S.loadedAt = Date.now();
    render();
    if (wasEdit) toast('Dépense modifiée');
    else toast(money(amount) + ' · ' + (payload.sub || payload.cat), { undo: ['deleteExpense', d.saved, false], undone: 'Saisie annulée' });
  }).catch(function (e) { btn.disabled = false; fail(e); });
});

function exitEdit() { S.edit = null; S.form = null; S.tab = S.back; render(); }

// ------------------------------------------------------------ sheets (bottom sheet on a phone, centred on a computer)
var sheetEl = $('#sheet');
function openSheet(title, body, label) {
  sheetEl.setAttribute('aria-label', label || title);
  sheetEl.innerHTML = '<div class="grab" aria-hidden="true"></div><header class="sheet-head"><h2>' + esc(title) + '</h2>' +
    '<button type="button" class="iconbtn" data-action="close-sheet" aria-label="Fermer">' + icon('close') + '</button></header>' +
    '<div class="sheet-body">' + body + '</div>';
  sheetEl.showModal();
}
function closeSheet() {
  if (!sheetEl.open) return;
  sheetEl.classList.add('closing');
  setTimeout(function () { sheetEl.classList.remove('closing'); sheetEl.close(); }, 180);
}
// A click on the backdrop lands on the dialog itself.
sheetEl.addEventListener('click', function (ev) { if (ev.target === sheetEl) closeSheet(); });
sheetEl.addEventListener('cancel', function (ev) { ev.preventDefault(); closeSheet(); });

function openPicker() {
  var f = S.form;
  openSheet('Catégorie', '<div class="cats">' + Calc.catOrder(S.data).map(function (cat) {
    var subs = S.data.categories.filter(function (c) { return c.cat === cat; });
    return '<section class="cat"><h3><span class="emo">' + esc(subs[0].emoji || '•') + '</span>' + esc(cat) + '</h3><div class="pills">' +
      subs.map(function (c) {
        return '<button type="button" class="pill" data-action="choose" data-cat="' + esc(cat) + '" data-sub="' + esc(c.sub) + '" aria-pressed="' +
          (f.cat === cat && f.sub === c.sub) + '">' + esc(c.sub || cat) + '</button>';
      }).join('') + '</div></section>';
  }).join('') + '</div>', 'Choisir une catégorie');
}

function confirmDelete() {
  var e = S.edit;
  openSheet('Supprimer la dépense ?', '<div class="confirm"><div class="well">' + rowHtml(e, true).replace('<button class="row"', '<div class="row static"').replace(/<\/button>$/, '</div>') +
    '</div><p>Elle part dans l\'onglet Corbeille du Sheets : tu pourras la récupérer depuis l\'écran du mois.</p><div class="actions">' +
    '<button type="button" class="btn danger-fill" data-action="delete-yes">Supprimer</button>' +
    '<button type="button" class="btn" data-action="close-sheet">Garder</button></div></div>');
}

// ------------------------------------------------------------ month
// A month the Sheets has no tab for: the current or a later one can be prepared, a past one cannot.
function noTab() {
  return S.ym >= today().slice(0, 7)
    ? '<div class="note"><span>Pas encore d\'onglet « ' + esc(monthName(S.ym)) + ' » dans le Sheets.</span><div class="actions end">' +
      '<button type="button" class="btn small primary" data-action="prepare-month">Préparer ce mois</button></div></div>'
    : '<p class="empty">Pas d\'onglet « ' + esc(monthName(S.ym)) + ' » dans le Sheets.</p>';
}

function viewMonth() {
  var m = Calc.month(S.data, S.ym), past = S.ym < today().slice(0, 7);
  var out = '<div class="head"><h1>Mois</h1>' + stepper('month', monthName(S.ym)) + '</div>' +
    '<button type="button" class="btn primary addbtn" data-action="add">' + icon('plus') + 'Ajouter une dépense</button>';
  if (!m) return out + noTab();
  var incomeToCome = m.endOfMonth - m.endWithoutIncome;
  out += '<div class="tiles">' +
    tile(past ? 'Solde en fin de mois' : 'Solde aujourd\'hui', past ? m.endOfMonth : m.balanceToday, 'report : ' + money0(m.opening), true) +
    (past ? '' : tile('Fin de mois prévue', m.endOfMonth, 'après tout ce qui est à venir')) +
    (past || !incomeToCome ? '' : tile('Sans les salaires', m.endWithoutIncome, 'si les ' + money0(incomeToCome) + ' à recevoir n\'arrivaient pas')) +
    tile('Dépensé', m.spent, '') + '</div>';
  out += upcomingHtml(m);
  var days = {};
  m.expenses.forEach(function (e) { (days[e.date] = days[e.date] || []).push(e); });
  var keys = Object.keys(days).sort().reverse();
  out += '<section class="field"><h2>Opérations du mois</h2><div class="well">' + (keys.length ? keys.map(function (k) {
    var total = days[k].reduce(function (s, e) { return s + e.amount; }, 0);
    return '<div class="day"><span>' + (k ? dayName(k) : 'Sans date') + '</span><span class="num">' + money(total) + '</span></div>' +
      days[k].map(function (e) { return rowHtml(e, false); }).join('');
  }).join('') : '<p class="empty">Aucune opération ce mois-ci.</p>') + '</div></section>';
  var trash = S.data.trash.filter(function (t) { return t.tab === tabLabel(S.ym); });
  if (trash.length) {
    out += '<section class="field"><h2>Supprimées</h2><ul class="well">' + trash.map(function (t) {
      return '<li class="row static"><span class="emo">' + emojiOf(t.cat, t.sub) + '</span><span class="txt"><b>' + esc(t.label) + '</b><small>' +
        (t.date ? shortDate(t.date) + ' · ' : '') + money(Math.abs(t.amount)) + '</small></span>' +
        '<button type="button" class="pill passbtn" data-action="restore" data-id="' + esc(t.id) + '">Récupérer</button></li>';
    }).join('') + '</ul></section>';
  }
  return out;
}

function tabLabel(ym) { return monthName(ym); }

// The bold lines of the month: what is still to go out or come in, and what is left to spend in each budget.
function upcomingHtml(m) {
  if (!m.forecasts.length && !m.envelopes.length) return '';
  var out = '';
  if (m.forecasts.length) {
    var debit = m.forecasts.reduce(function (s, r) { return s + r.debit; }, 0);
    var credit = m.forecasts.reduce(function (s, r) { return s + r.credit; }, 0);
    out += '<section class="field"><div class="head"><h2>À venir</h2><span class="hint">' + money0(debit) + ' à sortir' +
      (credit ? ' · ' + money0(credit) + ' à recevoir' : '') + '</span></div><ul class="well">' + m.forecasts.map(forecastRow).join('') + '</ul></section>';
  }
  if (m.envelopes.length) {
    var plan = Calc.plan(S.data, S.ym), left = m.envelopes.reduce(function (s, r) { return s + r.debit; }, 0);
    out += '<section class="card"><div class="head"><h2>Reste à dépenser</h2><span class="hint">' + money0(left) + ' sur les budgets du mois</span></div>' +
      '<ul class="bars">' + m.envelopes.map(function (r) {
        var b = plan.budgeted.filter(function (x) { return 'env:' + x.cat + '|' + x.sub === r.id; })[0] || { actual: 0, budget: r.debit, items: [] };
        return barHtml('up:' + r.id, ico(r.cat, r.sub) + esc(r.label), b.actual, b.budget,
          { right: 'reste ' + money0(r.debit), below: money0(b.actual) + ' dépensés sur un budget de ' + money0(b.budget) }, lines(b.items), b.actual > b.budget);
      }).join('') + '</ul></section>';
  }
  return out;
}

// Real lines shown when a bar is unfolded.
function lines(items) {
  return items.map(function (e) { return { left: (e.date ? shortDate(e.date) + ' · ' : '') + e.label, right: money(e.amount) }; });
}
function totals(groups) {
  return groups.map(function (g) { return { left: g.key, right: money0(g.amount) }; });
}

function tile(label, value, sub, hero) {
  return '<div class="tile' + (hero ? ' hero' : '') + '"><small>' + esc(label) + '</small><b class="' + (value < 0 ? 'neg' : '') + '">' +
    money0(value) + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</div>';
}

// ------------------------------------------------------------ planned vs spent
function barHtml(key, title, value, max, extra, subs, over) {
  var open = !!S.open[key];
  return '<li><button class="bar" data-action="toggle" data-key="' + esc(key) + '" aria-expanded="' + open + '"><span class="top"><b>' + title +
    (subs.length ? icon('next', 'chev') : '') + '</b><span>' + extra.right + '</span></span>' +
    '<span class="track"><span class="fill' + (over ? ' over' : '') + '" style="display:block;width:' + Math.max(0, Math.min(100, max > 0 ? value / max * 100 : 0)) + '%"></span></span>' +
    (extra.below ? '<span class="left' + (over ? ' over' : '') + '">' + extra.below + '</span>' : '') + '</button>' +
    (open && subs.length ? '<ul class="subs">' + subs.map(function (s) {
      return '<li><span>' + esc(s.left) + '</span><span>' + esc(s.right) + '</span></li>';
    }).join('') + '</ul>' : '') + '</li>';
}

function viewPlan() {
  var p = Calc.plan(S.data, S.ym);
  var budgetedActual = p.budgeted.reduce(function (s, r) { return s + r.actual; }, 0);
  var out = '<div class="head"><h1>Prévu / réel</h1>' + stepper('month', monthName(S.ym)) + '</div><div class="tiles">' +
    tile('Dépensé sur les budgets', budgetedActual, 'sur ' + money0(p.budgetTotal) + ' prévus', true) +
    tile('Hors budget', p.actualTotal - budgetedActual, 'prélèvements, santé, loisirs…') + '</div>';
  out += '<section class="card"><h2>Budgets du mois</h2>' + (p.budgeted.length ? '<ul class="bars">' + p.budgeted.map(function (r) {
    var over = r.actual > r.budget;
    return barHtml('plan:' + r.cat + '|' + r.sub, ico(r.cat, r.sub) + esc(r.label), r.actual, r.budget,
      { right: money0(r.actual) + ' <small>/ ' + money0(r.budget) + '</small>',
        below: over ? money0(r.actual - r.budget) + ' de dépassement' : 'reste ' + money0(r.budget - r.actual) }, lines(r.items), over);
  }).join('') + '</ul>' : '<p class="empty">Aucun budget pour ce mois : ajoute des lignes dans l\'onglet Budgets du Sheets.</p>') + '</section>';
  if (p.unbudgeted.length) {
    var max = p.unbudgeted[0].actual;
    out += '<section class="card"><h2>Hors budget</h2><ul class="bars">' + p.unbudgeted.map(function (r) {
      return barHtml('plan:' + r.cat, ico(r.cat) + esc(r.cat), r.actual, max, { right: money0(r.actual) }, lines(r.items));
    }).join('') + '</ul></section>';
  }
  return out;
}

// ------------------------------------------------------------ upcoming (the bold lines of the month)
function forecastRow(r) {
  var credit = r.credit > 0;
  return '<li class="row static"><span class="emo">' + emojiOf(r.cat, r.sub) + '</span><span class="txt"><b>' + esc(r.label) + '</b><small>' +
    esc(r.sub || r.cat) + ' · ' + money(credit ? r.credit : r.debit) + (credit ? ' à recevoir' : '') + '</small></span>' +
    '<button type="button" class="pill passbtn" data-action="passed" data-id="' + esc(r.id) + '">C\'est passé</button></li>';
}

function openPassed(id) {
  var r = Calc.month(S.data, S.ym).forecasts.filter(function (x) { return x.id === id; })[0];
  if (!r) return;
  var date = S.ym === today().slice(0, 7) ? today() : S.ym + '-01';
  openSheet('C\'est passé', '<div class="confirm"><p><b>' + esc(r.label) + '</b> devient une opération du mois, au montant réellement passé.</p>' +
    '<div class="mform two-f"><label class="mf"><span>Montant</span><span class="unit"><input id="ps-amount" inputmode="decimal" autocomplete="off" value="' +
    String(r.credit || r.debit).replace('.', ',') + '"><em>€</em></span></label>' +
    '<label class="mf"><span>Date</span><span class="unit"><input id="ps-date" type="date" value="' + date + '"></span></label></div>' +
    '<div class="actions"><button type="button" class="btn primary" data-action="passed-yes" data-id="' + esc(id) + '">Valider</button>' +
    '<button type="button" class="btn" data-action="close-sheet">Annuler</button></div></div>');
}

// ------------------------------------------------------------ dashboard
function periodLabel(kind, anchor) {
  if (kind === 'year') return anchor.slice(0, 4);
  if (kind === 'quarter') return 'T' + Math.ceil(+anchor.slice(5) / 3) + ' ' + anchor.slice(0, 4);
  return monthName(anchor);
}

function viewDash() {
  var d = S.dash, months = Calc.periodMonths(d.kind, d.anchor);
  var res = Calc.dashboard(S.data, months, d);
  var opt = function (v, label, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(label) + '</option>'; };
  var out = '<div class="head"><h1>Tableau de bord</h1></div><div class="filters">' +
    '<div class="seg">' + [['month', 'Mois'], ['quarter', 'Trimestre'], ['year', 'Année']].map(function (k) {
      return '<button data-action="dash-kind" data-kind="' + k[0] + '" aria-pressed="' + (d.kind === k[0]) + '">' + k[1] + '</button>';
    }).join('') + '</div>' + stepper('dash', periodLabel(d.kind, d.anchor)) +
    '<select class="input" data-filter="person" aria-label="Personne">' + opt('', 'Tout le monde', d.person) +
    S.data.people.map(function (p) { return opt(p, p, d.person); }).join('') + '</select>' +
    '<select class="input" data-filter="cat" aria-label="Catégorie">' + opt('', 'Toutes les catégories', d.cat) +
    Calc.catOrder(S.data).filter(function (c) { return c !== 'Revenus'; }).map(function (c) { return opt(c, c, d.cat); }).join('') + '</select>' + '</div>';

  out += '<div class="tiles">' + tile('Total', res.total, months.length > 1 ? 'soit ' + money0(res.total / months.length) + ' par mois' : '', true) + '</div>';

  var maxCat = res.byCat.length ? res.byCat[0].amount : 0;
  out += '<section class="card"><h2>' + (d.cat ? esc(d.cat) + ' : sous-catégories' : 'Par catégorie') + '</h2>' + (res.byCat.length ? '<ul class="bars">' +
    (d.cat ? (res.byCat[0] ? res.byCat[0].subs : []).map(function (s, i, all) {
      return barHtml('dsub:' + s.key, esc(s.key), s.amount, all[0].amount, { right: money0(s.amount) + pct(s.amount, res.total) }, []);
    }) : res.byCat.map(function (c) {
      return barHtml('dcat:' + c.key, ico(c.key) + esc(c.key), c.amount, maxCat, { right: money0(c.amount) + pct(c.amount, res.total) }, totals(c.subs));
    })).join('') + '</ul>' : '<p class="empty">Aucune dépense sur cette période.</p>') + '</section>';

  var maxWho = res.byWho.length ? res.byWho[0].amount : 0;
  out += '<section class="card"><h2>Par personne</h2>' + (res.byWho.length ? '<ul class="bars">' + res.byWho.map(function (w) {
    return barHtml('dwho:' + w.key, esc(w.key), w.amount, maxWho, { right: money0(w.amount) + pct(w.amount, res.total) }, totals(w.cats));
  }).join('') + '</ul>' : '<p class="empty">Aucune dépense sur cette période.</p>') + '</section>';

  return out + evolutionCard(months);
}

function pct(v, total) { return total > 0 ? ' <small>' + Math.round(v / total * 100) + ' %</small>' : ''; }

function evolutionCard(months) {
  var d = S.dash;
  if (months.length === 1) months = [-5, -4, -3, -2, -1, 0].map(function (n) { return Calc.addMonths(months[0], n); });
  var evo = Calc.evolution(S.data, months, d, d.evo);
  // Colour follows the series, never its rank: categories by all-time spending, people by their order in the sheet.
  var slotOf = {};
  if (d.evo === 'cat') slotOf = Calc.catSlots(S.data);
  else S.data.people.slice(0, 8).forEach(function (p, i) { slotOf[p] = i; });
  var name = function (k) { return k in slotOf ? k : 'Autres'; };
  var color = function (k) { return k in slotOf ? 'var(--s' + (slotOf[k] + 1) + ')' : 'var(--other)'; };
  var present = {};
  var cols = evo.map(function (m) {
    var parts = {};
    Object.keys(m.parts).forEach(function (k) { if (m.parts[k] > 0) parts[name(k)] = (parts[name(k)] || 0) + m.parts[k]; });
    Object.keys(parts).forEach(function (k) { present[k] = true; });
    return { ym: m.ym, parts: parts, total: Object.keys(parts).reduce(function (s, k) { return s + parts[k]; }, 0) };
  });
  var max = Math.max.apply(null, cols.map(function (c) { return c.total; }).concat([1]));
  var order = function (a, b) { return (a in slotOf ? slotOf[a] : 99) - (b in slotOf ? slotOf[b] : 99); };
  return '<section class="card"><div class="head"><h2>Évolution</h2><div class="seg">' +
    [['cat', 'Catégories'], ['who', 'Personnes']].map(function (k) {
      return '<button data-action="dash-evo" data-evo="' + k[0] + '" aria-pressed="' + (d.evo === k[0]) + '">' + k[1] + '</button>';
    }).join('') + '</div></div><div class="evo' + (cols.length > 6 ? ' dense' : '') + '">' + cols.map(function (c) {
      return '<div class="col" title="' + esc(monthName(c.ym) + ' : ' + money0(c.total)) + '"><span class="tot">' + (c.total ? money0(c.total) : '') +
        '</span><div class="stack" style="height:' + (c.total / max * 100) + '%">' + Object.keys(c.parts).sort(order).map(function (k) {
          return '<i style="flex:' + c.parts[k] + ';background:' + color(k) + '" title="' + esc(k + ' · ' + money0(c.parts[k])) + '"></i>';
        }).join('') + '</div><span class="x">' + shortMonth(c.ym).replace('.', '').slice(0, cols.length > 6 ? 3 : 5) + '</span></div>';
    }).join('') + '</div><div class="baseline"></div><ul class="legend">' + Object.keys(present).sort(order).map(function (k) {
      return '<li><i style="background:' + color(k) + '"></i>' + esc(k) + '</li>';
    }).join('') + '</ul></section>';
}

document.addEventListener('change', function (ev) {
  var key = ev.target.dataset && ev.target.dataset.filter;
  if (key) { S.dash[key] = ev.target.value; render(); }
});

// ------------------------------------------------------------ clicks
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-action],[data-tab]');
  if (!t || !S.data) return;
  var a = t.dataset.action, f = S.form;
  if (t.dataset.tab) {
    if (S.edit) { S.edit = null; S.form = null; }
    S.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return;
  }
  switch (a) {
    case 'pick': openPicker(); break;
    case 'close-sheet': closeSheet(); break;
    case 'choose': setCat(t.dataset.cat, t.dataset.sub, true); closeSheet(); break;
    case 'quick': setCat(t.dataset.cat, t.dataset.sub, true); break;
    case 'who':
      // Toggle, keeping at least one person and the order of the Personnes tab.
      var p = t.dataset.person, on = f.who.indexOf(p) >= 0;
      if (on && f.who.length === 1) return;
      f.who = S.data.people.filter(function (x) { return x === p ? !on : f.who.indexOf(x) >= 0; });
      paintWho(); break;
    case 'edit':
      var e = realRows().filter(function (x) { return x.id === t.dataset.id; })[0];
      if (!e) return;
      S.back = S.tab; S.edit = e; S.tab = 'add';
      S.form = { id: e.id, cat: e.cat, sub: e.sub, suggested: false, manual: true, who: e.who.slice() };
      render(); window.scrollTo(0, 0); break;
    case 'cancel-edit': exitEdit(); break;
    case 'delete': confirmDelete(); break;
    case 'delete-yes':
      t.disabled = true;
      var gone = S.edit.id;
      call('deleteExpense', gone).then(function (d) { closeSheet(); S.data = d; exitEdit(); toast('Dépense supprimée', { undo: ['restoreExpense', gone], undone: 'Ligne récupérée' }); })
        .catch(function (e) { t.disabled = false; fail(e); }); break;
    case 'undo':
      var u = S.undo;
      $('#toast').className = '';
      call.apply(null, u.call).then(function (d) { setData(d); toast(u.msg); }).catch(fail); break;
    case 'add':
      S.back = S.tab; S.edit = null; S.form = null; S.tab = 'add'; render(); window.scrollTo(0, 0); break;
    case 'restore':
      t.disabled = true;
      call('restoreExpense', t.dataset.id).then(function (d) { setData(d); toast('Ligne récupérée'); }).catch(function (e) { t.disabled = false; fail(e); }); break;
    case 'month-prev': case 'month-next':
      S.ym = Calc.addMonths(S.ym, a === 'month-prev' ? -1 : 1); render(); break;
    case 'dash-prev': case 'dash-next':
      var step = { month: 1, quarter: 3, year: 12 }[S.dash.kind];
      S.dash.anchor = Calc.addMonths(S.dash.anchor, a === 'dash-prev' ? -step : step); render(); break;
    case 'dash-kind': S.dash.kind = t.dataset.kind; render(); break;
    case 'dash-evo': S.dash.evo = t.dataset.evo; render(); break;
    case 'toggle': S.open[t.dataset.key] = !S.open[t.dataset.key]; render(); break;
    case 'prepare-month':
      t.disabled = true;
      call('prepareMonth', S.ym).then(function (d) { setData(d); toast(monthName(S.ym) + ' préparé'); }).catch(function (e) { t.disabled = false; fail(e); });
      break;
    case 'passed': openPassed(t.dataset.id); break;
    case 'passed-yes':
      var amount = dec($('#ps-amount').value), date = $('#ps-date').value;
      if (!isFinite(amount) || amount <= 0) { $('#ps-amount').closest('.unit').setAttribute('aria-invalid', 'true'); $('#ps-amount').focus(); return; }
      t.disabled = true;
      call('markPassed', t.dataset.id, amount, date).then(function (d) { closeSheet(); setData(d); toast('Passé en opération'); })
        .catch(function (e) { t.disabled = false; fail(e); });
      break;
  }
});

if (password()) { document.body.classList.remove('locked'); load(); } else lock();

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(function () { /* install offer only */ });
