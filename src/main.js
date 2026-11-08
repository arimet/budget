// Interface: one state object, each screen rendered from it as an HTML string, clicks handled by delegation.
import './style.css';
import { Calc } from './calc.js';
import { Insights } from './insights.js';
import { Bank } from './bank.js';

// The Apps Script web app bound to the spreadsheet (apps-script/Code.gs, doPost).
var API_URL = 'https://script.google.com/macros/s/AKfycbxyr6VEJfNQ8ldL1vnc-MEFV6bQ4dYZ1qvTyeCMC5_x1lbwmCcbs2M36ITvcrTUSF0/exec';
var TOKEN_KEY = 'budget-token', OLD_PW_KEY = 'budget-pw', CACHE_KEY = 'budget-cache';
// OAuth client of the app (Google Cloud console); the same value is in apps-script/Code.gs.
var GOOGLE_CLIENT_ID = '756842922233-g99d6lg8buft7dbrfupom5ct0o1rjkrf.apps.googleusercontent.com';

var S = { token: '', data: null, tab: 'month', back: 'month', ym: null, edit: null, form: null, open: {}, undo: null, loadedAt: 0,
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
  prev: '<path d="M15 5l-7 7 7 7"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>', filter: '<path d="M4 6h16M7 12h10M10 18h4"/>', next: '<path d="M9 5l7 7-7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5 9-10"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
};
function icon(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'; }
// Same bar on every page: title, sync dot, and the month (or period) selector always at the same place.
function topbar(title, right) {
  return '<header class="topbar"><h1>' + esc(title) + '<span class="sync" title="Mise à jour depuis le Sheets"' + (S.syncing ? '' : ' hidden') + '></span></h1>' +
    '<div class="topright">' + themeButton() + (right === undefined ? stepper('month', S.tab === 'dash' ? periodLabel(S.dash.kind, S.ym) : monthName(S.ym), shortLabel()) : right) +
    '</div></header>';
}
function shortLabel() {
  if (S.tab === 'dash' && S.dash.kind !== 'month') return periodLabel(S.dash.kind, S.ym);
  var m = shortMonth(S.ym);
  return cap(m) + ' ' + S.ym.slice(2, 4);
}

// ------------------------------------------------------------ theme: auto (follows the phone), light, dark
var THEMES = ['auto', 'light', 'dark'], THEME_NAMES = { auto: 'Thème automatique', light: 'Thème clair', dark: 'Thème sombre' };
function theme() { try { return localStorage.getItem('budget-theme') || 'auto'; } catch (e) { return 'auto'; } }
function themeButton() {
  var t = theme();
  return '<button type="button" class="iconbtn themebtn" data-action="theme" aria-label="' + THEME_NAMES[t] + ' : changer" title="' + THEME_NAMES[t] + '">' +
    icon(t === 'auto' ? 'auto' : t === 'light' ? 'sun' : 'moon') + '</button>';
}
function applyTheme(t) {
  try { localStorage.setItem('budget-theme', t); } catch (e) { /* this visit only */ }
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  var dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(function (m) { m.setAttribute('content', dark ? '#1d1c25' : '#e7e5f0'); });
}
function stepper(prefix, label, short) {
  return '<div class="stepper"><button data-action="' + prefix + '-prev" aria-label="Précédent">' + icon('prev') + '</button><span><b class="long">' + esc(label) +
    '</b><b class="short">' + esc(short || label) + '</b></span><button data-action="' + prefix + '-next" aria-label="Suivant">' + icon('next') + '</button></div>';
}

// ------------------------------------------------------------ server
// The device keeps a session key, never the password (sent once, at login).
function token() {
  if (!S.token) try { S.token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* private mode */ }
  return S.token;
}
function keep(t) {
  S.token = t;
  try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* kept for this visit only */ }
}
function post(body) {
  if (import.meta.env.MODE === 'mock') return import('./mock.js').then(function (m) { return m.mockCall(body); });
  // text/plain keeps it a "simple" request: Apps Script answers no CORS preflight.
  return fetch(API_URL, { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
    if (!r.ok) throw new Error('Le serveur ne répond pas (' + r.status + ').');
    return r.json();
  }, function () { throw new Error('Pas de connexion. Réessaie dans un instant.'); });
}
function call(fn) {
  var args = [].slice.call(arguments, 1);
  return post({ token: token(), fn: fn, args: args }).then(function (res) {
    if (res.error === 'auth') { lock(); throw new Error('Connexion expirée : reconnecte-toi avec Google.'); }
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}
// The last data shown is kept on the device: the app opens on it at once, then refreshes from the Sheets.
function load() {
  S.syncing = true; paintSync();
  return call('getData').then(function (d) { setData(d); try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) { /* full or private */ } })
    .catch(fail).then(function () { S.syncing = false; paintSync(); });
}
function paintSync() { var el = $('.sync'); if (el) el.hidden = !S.syncing; }
function setData(d) {
  S.data = d;
  S.loadedAt = Date.now();
  if (!S.ym) S.ym = d.today.slice(0, 7);
  render(true);
}
// A button waiting on the Sheets: disabled, with a spinner in place of its label.
function busy(b, on) { b.disabled = on; if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); }
function fail(e) { toast((e && e.message) || String(e), { error: true }); }

// ------------------------------------------------------------ Google sign-in gate
function lock(message) {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(OLD_PW_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) { /* private mode: nothing stored */ }
  S.token = ''; S.data = null;
  document.body.classList.add('locked');
  view.innerHTML = '<div class="gate"><span class="mark big"><img src="./icon.svg?v=2" alt=""></span><h1>Budget du foyer</h1>' +
    '<p>Connecte-toi avec le compte Google avec lequel le Sheets du budget est partagé.</p>' +
    '<div id="gbtn" class="gbtn"></div><p class="gate-err" id="gate-err" role="alert">' + esc(message || '') + '</p></div>';
  renderGoogleButton();
}

function renderGoogleButton() {
  if (import.meta.env.MODE === 'mock') {
    $('#gbtn').innerHTML = '<button type="button" class="btn primary" id="mock-google">Se connecter avec Google (aperçu)</button>';
    $('#mock-google').onclick = function () { signIn('mock'); };
    return;
  }
  loadGoogle().then(function () {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: function (r) { signIn(r.credential); }, ux_mode: 'popup' });
    var dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    google.accounts.id.renderButton($('#gbtn'), { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'fr', width: 280 });
  }).catch(function () { $('#gate-err').textContent = 'Impossible de charger la connexion Google. Vérifie ta connexion internet.'; });
}

function loadGoogle() {
  if (window.google && google.accounts) return Promise.resolve();
  return new Promise(function (ok, ko) {
    var sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = ok; sc.onerror = ko;
    document.head.appendChild(sc);
  });
}

function signIn(credential) {
  $('#gate-err').textContent = 'Vérification…';
  post({ fn: 'googleLogin', credential: credential }).then(function (res) {
    if (res.error === 'denied') throw new Error('Ce compte Google n\'a pas accès au Sheets du budget. Demande qu\'on te le partage en modification.');
    if (res.error) throw new Error(res.error === 'auth' ? 'Connexion Google refusée. Réessaie.' : res.error);
    keep(res.data.token);
    document.body.classList.remove('locked');
    return load();
  }).catch(function (e) { var err = $('#gate-err'); if (err) err.textContent = e.message; });
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
var VIEWS = { add: viewAdd, month: viewMonth, insights: viewInsights, dash: viewDash, savings: viewSavings };

function render(fromData) {
  document.body.classList.toggle('adding', S.tab === 'add');
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
function newForm() { return { id: null, cat: '', sub: '', suggested: false, manual: false, who: [S.data.people[0]], means: { kind: 'cb', raw: '' }, refund: false }; }

function viewAdd() {
  var e = S.edit;
  if (!S.form) S.form = newForm();
  return '<form class="form" id="f" novalidate>' +
    topbar(e ? 'Modifier' : 'Ajouter', '<button type="button" class="iconbtn" data-action="cancel-edit" aria-label="' +
      (e ? 'Annuler la modification' : 'Fermer') + '">' + icon('close') + '</button>') +
    '<div class="seg wide kind" id="kind">' + kindButtons() + '</div>' +
    '<label class="amount" id="amountbox"><input id="amount" inputmode="decimal" enterkeyhint="next" placeholder="0,00" autocomplete="off" aria-label="Montant en euros" value="' +
    (e ? String(Math.abs(e.amount)).replace('.', ',') : '') + '"><span>€</span></label>' +
    '<div class="field"><label class="l" for="label">Libellé <span>facultatif</span></label>' +
    '<input id="label" class="input" list="labels" enterkeyhint="done" autocomplete="off" placeholder="Carrefour, pharmacie…" value="' + (e ? esc(e.label) : '') + '">' +
    '<datalist id="labels"></datalist></div>' +
    '<div class="field"><span class="l">Catégorie <em id="sugg"></em></span><button type="button" class="catbtn" id="catbtn" data-action="pick"></button></div>' +
    '<div class="field"><span class="l">Pour <span id="sharehint"></span></span><div class="pills" id="who"></div></div>' +
    '<div class="two"><div class="field"><label class="l" for="date">Date</label><input type="date" id="date" class="input" value="' + (e ? e.date : today()) + '"></div>' +
    '<div class="field"><span class="l">Paiement</span><div id="means"></div></div></div>' +
    '<div class="actions"><button class="btn primary" id="submit">' + (e ? 'Enregistrer' : 'Ajouter') + '</button>' +
    (e ? '<button type="button" class="btn danger" data-action="delete">Supprimer</button>' : '') + '</div></form>' +
    (e ? '' : '<section class="field"><h2>Dernières dépenses</h2><div class="well" id="recent"></div></section>');
}

// An expense goes in Débit, a refund in Crédit (sent as a negative amount).
function kindButtons() {
  return [[false, 'Dépense'], [true, 'Remboursement']].map(function (k) {
    return '<button type="button" data-action="kind" data-refund="' + k[0] + '" aria-pressed="' + (S.form.refund === k[0]) + '">' + k[1] + '</button>';
  }).join('');
}

function paintAdd() { paintCat(); paintWho(); paintMeans(); paintLists(); }

// "CB / Chèque" column: CB (dated "CB du jj/mm"), a cheque (number optional), nothing, or the text already there.
function meansOf(text) {
  if (!text) return { kind: 'none', raw: '' };
  if (/^CB\b/.test(text)) return { kind: 'cb', raw: '' };
  var m = text.match(/^Ch[eè]que(?:\s+n°\s*(.*))?$/i);
  if (m) return { kind: 'cheque', number: m[1] || '', raw: '' };
  return { kind: 'keep', raw: text };
}
function meansText(f, date) {
  var d = (date || today()).split('-');
  if (f.means.kind === 'cb') return 'CB du ' + d[2] + '/' + d[1];
  if (f.means.kind === 'cheque') return 'Chèque' + (f.means.number ? ' n° ' + f.means.number : '');
  if (f.means.kind === 'keep') return f.means.raw;
  return '';
}
function paintMeans() {
  var f = S.form, opts = [['cb', 'CB'], ['cheque', 'Chèque'], ['none', 'Aucun']];
  if (f.means.raw) opts.unshift(['keep', f.means.raw]);
  $('#means').innerHTML = '<div class="seg wide">' + opts.map(function (o) {
    return '<button type="button" data-action="means" data-kind="' + o[0] + '" aria-pressed="' + (f.means.kind === o[0]) + '">' + esc(o[1]) + '</button>';
  }).join('') + '</div>' + (f.means.kind === 'cheque' ? '<input id="chequeno" class="input chequeno" inputmode="numeric" autocomplete="off" placeholder="N° du chèque (facultatif)" value="' +
    esc(f.means.number || '') + '">' : '');
}

function paintCat() {
  var f = S.form, b = $('#catbtn');
  b.classList.toggle('none', !f.cat);
  b.classList.remove('bad');
  b.innerHTML = f.cat
    ? '<span class="emo">' + emojiOf(f.cat, f.sub) + '</span><span>' + esc(f.sub || f.cat) + '<small>' + esc(f.cat) + '</small></span>'
    : '<span class="emo">' + icon('plus') + '</span><span>Choisir une catégorie</span>';
  $('#sugg').textContent = f.suggested ? 'suggérée' : '';
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
  paintCat();
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
  if (ev.target.id !== 'f') return;
  ev.preventDefault();
  var f = S.form, amount = Math.abs(dec($('#amount').value)) * (f.refund ? -1 : 1);
  if (!isFinite(amount) || amount === 0) { $('#amountbox').setAttribute('aria-invalid', 'true'); $('#amount').focus(); return; }
  if (!f.cat) { $('#catbtn').classList.add('bad'); openPicker(); return; }
  if ($('#chequeno')) f.means.number = $('#chequeno').value.trim();
  var payload = { id: f.id, date: $('#date').value || today(), amount: amount, cat: f.cat, sub: f.sub, means: meansText(f, $('#date').value),
    label: $('#label').value.trim(), who: f.who };
  var btn = $('#submit');
  busy(btn, true);
  call('saveExpense', payload).then(function (d) {
    var wasEdit = !!S.edit;
    S.form = null;
    S.edit = null; S.tab = S.back;
    S.data = d; S.loadedAt = Date.now();
    render();
    if (wasEdit) toast(amount < 0 ? 'Remboursement modifié' : 'Dépense modifiée');
    else toast((amount < 0 ? '+' : '') + money(Math.abs(amount)) + ' · ' + (payload.sub || payload.cat), { undo: ['deleteExpense', d.saved, false], undone: 'Saisie annulée' });
  }).catch(function (e) { busy(btn, false); fail(e); });
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
  var out = topbar('Mois');
  if (!m) return out + noTab();
  var incomeToCome = m.endOfMonth - m.endWithoutIncome;
  out += '<div class="tiles">' +
    tile(past ? 'Solde en fin de mois' : 'Solde aujourd\'hui', past ? m.endOfMonth : m.balanceToday, 'report : ' + money0(m.opening), true) +
    (past ? '' : tile('Fin de mois prévue', m.endOfMonth, 'après tout ce qui est à venir')) +
    (past || !incomeToCome ? '' : tile('Sans les salaires', m.endWithoutIncome, 'si les ' + money0(incomeToCome) + ' à recevoir n\'arrivaient pas')) +
    tile('Dépensé', m.spent, '') + '</div>';

  var curve = Calc.balanceCurve(S.data, S.ym, today());
  out += acc('curve', 'Évolution du solde', curve.projection.length ? 'fin prévue ' + money0(curve.end) : 'fin ' + money0(curve.end), balanceChart(curve));

  if (m.forecasts.length) {
    var debit = m.forecasts.reduce(function (s, r) { return s + r.debit; }, 0);
    var credit = m.forecasts.reduce(function (s, r) { return s + r.credit; }, 0);
    out += acc('upcoming', 'À venir', money0(debit) + ' à sortir' + (credit ? ' · ' + money0(credit) + ' à recevoir' : ''),
      '<ul class="well">' + m.forecasts.map(forecastRow).join('') + '</ul>');
  }
  var plan = Calc.plan(S.data, S.ym);
  if (m.envelopes.length) {
    var left = m.envelopes.reduce(function (s, r) { return s + r.debit; }, 0);
    out += acc('left', 'Reste à dépenser', money0(left) + ' sur les budgets', '<ul class="bars">' + m.envelopes.map(function (r) {
      var b = plan.budgeted.filter(function (x) { return 'env:' + x.cat + '|' + x.sub === r.id; })[0] || { actual: 0, budget: r.debit, items: [] };
      return barHtml('up:' + r.id, ico(r.cat, r.sub) + esc(r.label), b.actual, b.budget,
        { right: 'reste ' + money0(r.debit), below: money0(b.actual) + ' dépensés sur un budget de ' + money0(b.budget) }, lines(b.items), b.actual > b.budget);
    }).join('') + '</ul>');
  }
  out += acc('plan', 'Prévu / réel', money0(plan.actualTotal) + ' dépensés · ' + money0(plan.budgetTotal) + ' de budgets', planBody(plan));

  var days = {};
  m.expenses.forEach(function (e) { (days[e.date] = days[e.date] || []).push(e); });
  var keys = Object.keys(days).sort().reverse();
  out += acc('ops', 'Opérations du mois', m.expenses.length + ' ligne' + (m.expenses.length > 1 ? 's' : ''), '<div class="well">' + (keys.length ? keys.map(function (k) {
    var total = days[k].reduce(function (s, e) { return s + e.amount; }, 0);
    return '<div class="day"><span>' + (k ? dayName(k) : 'Sans date') + '</span><span class="num">' + money(total) + '</span></div>' +
      days[k].map(function (e) { return rowHtml(e, false); }).join('');
  }).join('') : '<p class="empty">Aucune opération ce mois-ci.</p>') + '</div>');

  var trash = S.data.trash.filter(function (t) { return t.tab === tabLabel(S.ym); });
  if (trash.length) {
    out += acc('trash', 'Supprimées', trash.length + ' à récupérer', '<ul class="well">' + trash.map(function (t) {
      return '<li class="row static"><span class="emo">' + emojiOf(t.cat, t.sub) + '</span><span class="txt"><b>' + esc(t.label) + '</b><small>' +
        (t.date ? shortDate(t.date) + ' · ' : '') + money(Math.abs(t.amount)) + '</small></span>' +
        '<button type="button" class="pill passbtn" data-action="restore" data-id="' + esc(t.id) + '">Récupérer</button></li>';
    }).join('') + '</ul>');
  }
  return out + '<label class="btn importbtn">' + icon('upload') + 'Importer le relevé de la banque<input type="file" id="bankfile" accept=".csv,text/csv" hidden></label>' + installHtml();
}

// ------------------------------------------------------------ balance chart: real line to today, dashed projection to month end
var CH = { w: 640, h: 200, l: 52, r: 14, t: 14, b: 26 };
function balanceChart(c) {
  // Drawn at the size it is shown, so the axis labels stay readable on a phone.
  CH.w = Math.max(320, Math.min(640, view.clientWidth - 40)); CH.h = CH.w < 500 ? 190 : 210;
  var all = c.points.concat(c.projection), vals = all.map(function (p) { return p.v; });
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (lo > 0 && lo < hi * 0.25) lo = 0; // anchor at zero when it is close anyway
  var pad = (hi - lo) * 0.12 || 50; lo -= pad; hi += pad;
  var x = function (d) { return CH.l + (d - 1) / Math.max(1, c.dim - 1) * (CH.w - CH.l - CH.r); };
  var y = function (v) { return CH.t + (hi - v) / (hi - lo) * (CH.h - CH.t - CH.b); };
  var path = function (pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(''); };
  var ticks = [hi - pad, (hi + lo) / 2, lo + pad].map(function (v) { return Math.round(v / 10) * 10; });
  var grid = ticks.map(function (v) {
    return '<line class="grid" x1="' + CH.l + '" x2="' + (CH.w - CH.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
      '<text class="axis" x="' + (CH.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + money0(v) + '</text>';
  }).join('');
  var zero = lo < 0 && hi > 0 ? '<line class="zero" x1="' + CH.l + '" x2="' + (CH.w - CH.r) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>' : '';
  var days = [1, 10, 20, c.dim].map(function (d) { return '<text class="axis" x="' + x(d) + '" y="' + (CH.h - 6) + '" text-anchor="middle">' + d + '</text>'; }).join('');
  var lastReal = c.points[c.points.length - 1], end = c.projection[1];
  var marks = (c.today ? '<circle class="dot" cx="' + x(lastReal.d) + '" cy="' + y(lastReal.v) + '" r="5"/>' : '') +
    (end ? '<circle class="dot hollow" cx="' + x(end.d) + '" cy="' + y(end.v) + '" r="5"/>' : '');
  var data = c.points.map(function (p) { return [p.d, Math.round(p.v), 0]; }).concat(end ? [[end.d, Math.round(end.v), 1]] : []);
  return '<figure class="chart" data-points="' + esc(JSON.stringify(data)) + '" data-ym="' + S.ym + '">' +
    '<svg viewBox="0 0 ' + CH.w + ' ' + CH.h + '" role="img" aria-label="Solde du compte jour par jour' + (end ? ', puis projection jusqu\'à la fin du mois' : '') + '">' +
    grid + zero + days + '<path class="line" d="' + path(c.points) + '"/>' + (end ? '<path class="line proj" d="' + path(c.projection) + '"/>' : '') + marks +
    '<line class="cross" y1="' + CH.t + '" y2="' + (CH.h - CH.b) + '" hidden/><rect class="hit" x="' + CH.l + '" y="0" width="' + (CH.w - CH.l - CH.r) + '" height="' + CH.h + '"/></svg>' +
    '<figcaption>' + (c.today ? '<span class="k"><i class="sw"></i>solde réel</span>' : '') + (end ? '<span class="k"><i class="sw dash"></i>projection avec ce qui est à venir</span>' : '') +
    '</figcaption><div class="tip" hidden></div></figure>';
}
// Crosshair and tooltip: nearest day under the pointer.
document.addEventListener('pointermove', function (ev) {
  var fig = ev.target.closest && ev.target.closest('.chart');
  if (!fig) return;
  var svg = fig.querySelector('svg'), box = svg.getBoundingClientRect(), pts = JSON.parse(fig.dataset.points);
  var dim = Calc.daysIn(fig.dataset.ym), px = (ev.clientX - box.left) / box.width * CH.w;
  var d = Math.round((px - CH.l) / (CH.w - CH.l - CH.r) * (dim - 1) + 1);
  var p = pts.reduce(function (best, q) { return Math.abs(q[0] - d) < Math.abs(best[0] - d) ? q : best; }, pts[0]);
  var xpx = CH.l + (p[0] - 1) / Math.max(1, dim - 1) * (CH.w - CH.l - CH.r);
  var cross = fig.querySelector('.cross'), tip = fig.querySelector('.tip');
  cross.removeAttribute('hidden'); cross.setAttribute('x1', xpx); cross.setAttribute('x2', xpx);
  tip.hidden = false;
  tip.innerHTML = '<b>' + money0(p[1]) + '</b><span>' + (p[2] ? 'fin du mois prévue' : 'le ' + p[0] + ' ' + shortMonth(fig.dataset.ym)) + '</span>';
  tip.style.left = Math.min(box.width - 120, Math.max(0, xpx / CH.w * box.width - 60)) + 'px';
});
document.addEventListener('pointerleave', function (ev) {
  if (!ev.target.classList || !ev.target.classList.contains('chart')) return;
  ev.target.querySelector('.tip').hidden = true; ev.target.querySelector('.cross').setAttribute('hidden', '');
}, true);

// Sections of the month that fold; what is open is remembered on the device.
var ACC_DEFAULT = { curve: true, upcoming: true, left: true, plan: false, ops: true, trash: false };
function accState() {
  if (!S.acc) try { S.acc = JSON.parse(localStorage.getItem('budget-acc') || '{}'); } catch (e) { S.acc = {}; }
  return S.acc;
}
function acc(key, title, hint, body) {
  var open = key in accState() ? accState()[key] : ACC_DEFAULT[key];
  return '<details class="acc" data-acc="' + key + '"' + (open ? ' open' : '') + '><summary><span class="acc-t">' + esc(title) + '</span>' +
    '<span class="acc-h">' + esc(hint) + '</span>' + icon('next', 'chev') + '</summary><div class="acc-b">' + body + '</div></details>';
}
document.addEventListener('toggle', function (ev) {
  var d = ev.target;
  if (!d.dataset || !d.dataset.acc) return;
  accState()[d.dataset.acc] = d.open;
  try { localStorage.setItem('budget-acc', JSON.stringify(S.acc)); } catch (e) { /* this visit only */ }
}, true);

// Budgets of the month against what was spent, then what no budget covers.
function planBody(p) {
  var out = p.budgeted.length ? '<h3>Budgets</h3><ul class="bars">' + p.budgeted.map(function (r) {
    var over = r.actual > r.budget;
    return barHtml('plan:' + r.cat + '|' + r.sub, ico(r.cat, r.sub) + esc(r.label), r.actual, r.budget,
      { right: money0(r.actual) + ' <small>/ ' + money0(r.budget) + '</small>',
        below: over ? money0(r.actual - r.budget) + ' de dépassement' : 'reste ' + money0(r.budget - r.actual) }, lines(r.items), over);
  }).join('') + '</ul>' : '<p class="empty">Aucun budget pour ce mois : ajoute des lignes dans l\'onglet Budgets du Sheets.</p>';
  if (p.unbudgeted.length) {
    var max = p.unbudgeted[0].actual;
    out += '<h3>Hors budget</h3><ul class="bars">' + p.unbudgeted.map(function (r) {
      return barHtml('plan:' + r.cat, ico(r.cat) + esc(r.cat), r.actual, max, { right: money0(r.actual) }, lines(r.items));
    }).join('') + '</ul>';
  }
  return out;
}

function viewSavings() {
  return topbar('Épargne', '') + (savingsHtml() || '<p class="empty">Aucun onglet « Epargne … » dans le Sheets.</p>');
}

function tabLabel(ym) { return monthName(ym); }

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
    (extra.below ? '<span class="left' + (over ? ' over' : '') + (extra.cls ? ' ' + extra.cls : '') + '">' + extra.below + '</span>' : '') + '</button>' +
    (open && subs.length ? '<ul class="subs">' + subs.map(function (s) {
      return '<li><span>' + esc(s.left) + '</span><span>' + esc(s.right) + '</span></li>';
    }).join('') + '</ul>' : '') + '</li>';
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

// ------------------------------------------------------------ bank export: what is there, what went through, what is missing
function readBankFile(file) {
  file.arrayBuffer().then(function (buf) {
    var ops = Bank.parse(new TextDecoder('windows-1252').decode(buf));
    if (!ops.length) throw new Error('Ce fichier ne ressemble pas à un export CSV de La Banque Postale.');
    S.imp = Bank.reconcile(S.data, ops);
    openImport();
  }).catch(fail);
}

function openImport() {
  var r = S.imp, catOptions = function (cat, sub) {
    return S.data.categories.map(function (c) {
      var v = c.cat + '|' + c.sub;
      return '<option value="' + esc(v) + '"' + (c.cat === cat && c.sub === sub ? ' selected' : '') + '>' + esc(c.cat + ' · ' + c.sub) + '</option>';
    }).join('') + (cat === 'Divers' && sub === 'À classer' ? '' : '');
  };
  var line = function (kind, i, op, extra) {
    return '<li class="imp"><label class="impcheck"><input type="checkbox" data-imp="' + kind + ':' + i + '" checked>' +
      '<span class="txt"><b>' + esc(op.merchant) + '</b><small>' + shortDate(op.date) + ' · ' + (op.amount < 0 ? '+' + money(-op.amount) : money(op.amount)) +
      '</small></span></label>' + (extra || '') + '</li>';
  };
  var body = '<div class="confirm"><p>' + r.known.length + ' ligne' + (r.known.length > 1 ? 's' : '') + ' déjà dans le Sheets' +
    (r.skipped ? ', ' + r.skipped + ' d\'un mois sans onglet laissée' + (r.skipped > 1 ? 's' : '') + ' de côté' : '') + '.</p>';
  if (r.toPass.length) body += '<h3>Prévisions passées</h3><ul class="implist">' + r.toPass.map(function (p, i) {
    return line('pass', i, p.op, '<small class="impnote">« ' + esc(p.forecast.label) + ' »</small>');
  }).join('') + '</ul>';
  if (r.missing.length) body += '<h3>Pas encore saisies</h3><ul class="implist">' + r.missing.map(function (m, i) {
    return line('add', i, m.op, '<select class="input impcat" data-impcat="' + i + '">' + catOptions(m.cat, m.sub) + '</select>');
  }).join('') + '</ul>';
  var n = r.toPass.length + r.missing.length;
  body += n ? '<div class="actions"><button type="button" class="btn primary" data-action="import-yes">Mettre à jour le Sheets</button>' +
    '<button type="button" class="btn" data-action="close-sheet">Annuler</button></div>' : '<p>Tout est déjà à jour.</p>';
  openSheet('Relevé de la banque', body + '</div>');
}

function importActions() {
  var r = S.imp, out = [];
  document.querySelectorAll('[data-imp]').forEach(function (box) {
    if (!box.checked) return;
    var k = box.dataset.imp.split(':'), i = +k[1];
    if (k[0] === 'pass') {
      var p = r.toPass[i];
      out.push({ type: 'pass', id: p.forecast.id, amount: Math.abs(p.op.amount), date: p.op.date });
    } else {
      var m = r.missing[i], cs = $('[data-impcat="' + i + '"]').value.split('|');
      out.push({ type: 'add', expense: { date: m.op.date, amount: m.op.amount, cat: cs[0], sub: cs[1], label: m.op.merchant, who: [S.data.people[0]],
        means: m.op.card ? 'CB du ' + m.op.date.slice(8) + '/' + m.op.date.slice(5, 7) : '' } });
    }
  });
  return out;
}

document.addEventListener('change', function (ev) {
  if (ev.target.id === 'bankfile' && ev.target.files[0]) { readBankFile(ev.target.files[0]); ev.target.value = ''; }
});

// ------------------------------------------------------------ analyses: where the money goes, where it could go less
function viewInsights() {
  var ym = S.ym, out = topbar('Analyses');
  if (!S.data.months.some(function (m) { return m.ym === ym; })) return out + '<p class="empty">Pas d\'onglet « ' + esc(monthName(ym)) + ' » dans le Sheets.</p>';
  out += '<section class="card"><h2>Bilan du mois</h2><ul class="facts">' + Insights.summary(S.data, ym).map(function (t) {
    return '<li>' + esc(t) + '</li>';
  }).join('') + '</ul></section>';

  var cmp = Insights.compare(S.data, ym).filter(function (c) { return Math.max(c.now, c.avg) >= 10; });
  out += '<section class="card"><div class="head"><h2>Par rapport à d\'habitude</h2><span class="hint">moyenne des 3 mois précédents</span></div>' +
    '<ul class="cmp">' + cmp.map(function (c) {
      var key = 'cmp:' + c.cat, open = !!S.open[key];
      var subs = c.subs.filter(function (x) { return Math.max(x.now, x.avg) >= 1; });
      return '<li><button type="button" class="cmprow" data-action="toggle" data-key="' + esc(key) + '" aria-expanded="' + open + '">' +
        '<span class="c-name">' + ico(c.cat) + esc(c.cat) + (subs.length ? icon('next', 'chev') : '') + '</span><span class="c-now num">' + money0(c.now) + '</span>' +
        deltaHtml(c.delta) + '<small class="c-avg">d\'habitude ' + money0(c.avg) + '</small></button>' +
        (open && subs.length ? '<ul class="cmpsubs">' + subs.map(function (x) {
          return '<li><span>' + esc(x.sub || '—') + '</span><span class="num">' + money0(x.now) + '</span>' + deltaHtml(x.delta) + '</li>';
        }).join('') + '</ul>' : '') + '</li>';
    }).join('') + '</ul></section>';

  var r = Insights.recurring(S.data, ym);
  out += '<section class="card"><div class="head"><h2>Abonnements et prélèvements</h2><span class="hint">' + money0(r.totalYearly) + ' par an, ' +
    money0(r.totalYearly / 12) + ' par mois</span></div>';
  r.groups.forEach(function (g) {
    out += '<p class="lead">' + g.names.length + ' abonnements ' + esc(g.sub.toLowerCase()) + ' (' + esc(g.names.join(', ')) + ') : <b>' + money0(g.yearly) + ' par an</b>.</p>';
  });
  r.priceChanges.forEach(function (p) {
    out += '<p class="lead">' + esc(p.name) + ' est passé de ' + money(p.from) + ' à ' + money(p.to) + '.</p>';
  });
  out += '<ul class="bars">' + r.items.map(function (i) {
    return '<li class="kv"><span>' + ico(i.cat, i.sub) + esc(i.name) + (i.times !== 12 ? ' <small>' + i.times + ' fois par an</small>' : '') + '</span>' +
      '<span class="num">' + money0(i.yearly) + ' <small>/ an</small></span></li>';
  }).join('') + '</ul>';
  if (r.fees.total > 0) {
    out += '<p class="lead">Frais bancaires sur 12 mois : <b>' + money0(r.fees.total) + '</b>' +
      (r.fees.avoidable > 0 ? ', dont ' + money0(r.fees.avoidable) + ' évitables (intérêts de découvert, commissions)' : '') + '.</p>';
  }
  out += '</section>';

  var small = Insights.smallRepeated(S.data, ym);
  out += '<section class="card"><div class="head"><h2>Petites dépenses qui reviennent</h2><span class="hint">achats de moins de 30 €, sur 3 mois</span></div>' +
    (small.length ? '<ul class="bars">' + small.map(function (x) {
      return '<li class="kv"><span>' + ico(x.cat, x.sub) + esc(x.label) + ' <small>' + x.count + ' fois</small></span>' +
        '<span class="num">' + money0(x.perMonth) + ' <small>/ mois</small> · ' + money0(x.yearly) + ' <small>/ an</small></span></li>';
    }).join('') + '</ul>' : '<p class="empty">Rien qui revienne souvent.</p>') + '</section>';
  return out;
}

function deltaHtml(delta) {
  var up = delta > 0.5, down = delta < -0.5;
  return '<span class="c-delta num ' + (up ? 'up' : down ? 'down' : '') + '">' + (up ? '+' : down ? '−' : '') + money0(Math.abs(delta)) + '</span>';
}

// Savings tabs kept by hand: what each person has, puts aside every month, and what it is for.
function savingsHtml() {
  var sv = S.data.savings || [];
  if (!sv.length) return '';
  var total = sv.reduce(function (s, p) { return s + p.total; }, 0), monthly = sv.reduce(function (s, p) { return s + p.monthlyTotal; }, 0);
  return '<section class="card"><div class="head"><h2>Épargne</h2><span class="hint">' + money0(total) + ' en tout' +
    (monthly ? ' · ' + money0(monthly) + ' mis de côté par mois' : '') + '</span></div>' +
    (monthly ? '<p class="lead">Au même rythme, l\'épargne atteindra <b>' + money0(total + monthly * 12) + '</b> dans un an.</p>' : '') +
    '<div class="savings">' + sv.map(function (p) {
      return '<div class="saver"><div class="saver-head"><b>' + esc(p.who) + '</b><span class="num">' + money0(p.total) + '</span></div>' +
        '<ul>' + p.accounts.map(function (a) { return '<li><span>' + esc(a.name) + '</span><span class="num">' + money(a.amount) + '</span></li>'; }).join('') + '</ul>' +
        (p.monthlyTotal ? '<small>+ ' + money0(p.monthlyTotal) + ' par mois (' + p.monthly.filter(function (m) { return m.amount; }).map(function (m) {
          return esc(m.name) + ' ' + money0(m.amount); }).join(', ') + ')</small>' : '<small>Pas de versement mensuel</small>') +
        (p.goals.length ? '<div class="goals">' + p.goals.map(function (g) {
          return '<span class="pill static">' + esc(g.label) + ' · ' + money0(g.amount) + '</span>'; }).join('') + '</div>' : '') + '</div>';
    }).join('') + '</div></section>';
}

// Dashboard filters in a sheet: one tap per choice, applied at once behind it.
function openFilters() {
  var d = S.dash, chips = function (key, all, items) {
    return '<div class="pills">' + [['', all]].concat(items.map(function (x) { return [x, x]; })).map(function (x) {
      return '<button type="button" class="pill" data-action="set-filter" data-key="' + key + '" data-value="' + esc(x[0]) + '" aria-pressed="' + (d[key] === x[0]) + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div>';
  };
  var body = '<div class="confirm"><h3>Pour qui</h3>' + chips('person', 'Tout le monde', S.data.people) +
    '<h3>Catégorie</h3>' + chips('cat', 'Toutes', Calc.catOrder(S.data).filter(function (c) { return c !== 'Revenus'; })) +
    '<div class="actions"><button type="button" class="btn primary" data-action="close-sheet">Voir le résultat</button></div></div>';
  if (sheetEl.open) { sheetEl.querySelector('.sheet-body').innerHTML = body; return; }
  openSheet('Filtres', body);
}

// ------------------------------------------------------------ dashboard
function periodLabel(kind, anchor) {
  if (kind === 'year') return anchor.slice(0, 4);
  if (kind === 'quarter') return 'T' + Math.ceil(+anchor.slice(5) / 3) + ' ' + anchor.slice(0, 4);
  return monthName(anchor);
}

function viewDash() {
  var d = S.dash, months = Calc.periodMonths(d.kind, S.ym);
  var res = Calc.dashboard(S.data, months, d);
  var opt = function (v, label, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(label) + '</option>'; };
  var active = (d.person ? 1 : 0) + (d.cat ? 1 : 0);
  var out = topbar('Synthèse') + '<div class="toolbar"><div class="seg">' + [['month', 'Mois'], ['quarter', 'Trimestre'], ['year', 'Année']].map(function (k) {
      return '<button data-action="dash-kind" data-kind="' + k[0] + '" aria-pressed="' + (d.kind === k[0]) + '">' + k[1] + '</button>';
    }).join('') + '</div><button type="button" class="pill filterbtn' + (active ? ' on' : '') + '" data-action="filters">' + icon('filter') +
    (active ? [d.person, d.cat].filter(Boolean).join(' · ') : 'Filtres') + '</button></div>';

  // Same filters, period of the same length just before: what went up, what went down.
  var prevAnchor = Calc.addMonths(S.ym, -months.length), prev = Calc.periodMonths(d.kind, prevAnchor);
  // A period still running is compared with the previous one at the same point (same number of days in).
  var running = months.indexOf(today().slice(0, 7)) >= 0, upTo = null;
  if (running) {
    var into = Math.round((asDate(today()) - asDate(months[0] + '-01')) / 864e5);
    var cut = asDate(prev[0] + '-01'); cut.setDate(cut.getDate() + into);
    upTo = { now: today(), before: cut.getFullYear() + '-' + ('0' + (cut.getMonth() + 1)).slice(-2) + '-' + ('0' + cut.getDate()).slice(-2) };
  }
  var mv = Insights.movers(S.data, months, prev, d, upTo), prevName = periodLabel(d.kind, prevAnchor);
  var vs = 'par rapport à ' + prevName.toLowerCase() + (running ? ' à la même date' : '');
  var change = mv.total.now - mv.total.before;
  var byCatDelta = {};
  mv.byCat.forEach(function (r) { byCatDelta[r.cat] = r.delta; });
  out += '<div class="tiles">' +
    tile('Dépensé', res.total, months.length > 1 ? 'soit ' + money0(res.total / months.length) + ' par mois' : periodLabel(d.kind, S.ym), true) +
    '<div class="tile"><small>Écart</small><b class="num ' + (change > 0.5 ? 'up' : change < -0.5 ? 'down' : '') + '">' + (change > 0.5 ? '+' : change < -0.5 ? '−' : '') +
      money0(Math.abs(change)) + '</b><em>' + esc(vs) + ' (' + money0(mv.total.before) + ')</em></div></div>' +
    '<p class="hint">Dépensé = toutes les sorties, prélèvements compris, moins les remboursements. Les salaires et les virements entre vos comptes n\'y sont pas.</p>';
  if (mv.up.length || mv.down.length) {
    // Diverging bars around zero: more spent to the right (red), less to the left (violet), the value written beside.
    var rows = mv.up.slice(0, 5).concat(mv.down.slice(0, 5));
    var big = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.delta); }));
    out += '<section class="card"><div class="head"><h2>Ce qui a bougé</h2><span class="hint">' + esc(vs) + '</span></div><ul class="diverge">' +
      rows.map(function (r) {
        var up = r.delta > 0, w = Math.max(2, Math.abs(r.delta) / big * 100);
        return '<li title="' + esc(r.cat + ' : ' + money0(r.avg) + ' → ' + money0(r.now)) + '"><span class="dv-name">' + ico(r.cat) + esc(r.cat) + '</span>' +
          '<span class="dv-track"><span class="dv-half left">' + (up ? '' : '<i class="dv-bar down" style="width:' + w + '%"></i>') + '</span>' +
          '<span class="dv-half right">' + (up ? '<i class="dv-bar up" style="width:' + w + '%"></i>' : '') + '</span></span>' +
          '<b class="num ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '−') + money0(Math.abs(r.delta)) + '</b>' +
          '<small>' + money0(r.avg) + ' → ' + money0(r.now) + '</small></li>';
      }).join('') + '</ul><p class="legendline"><span class="k"><i class="sw down"></i>moins dépensé</span><span class="k"><i class="sw up"></i>plus dépensé</span></p></section>';
  }

  var maxCat = res.byCat.length ? res.byCat[0].amount : 0;
  out += '<section class="card"><h2>' + (d.cat ? esc(d.cat) + ' : sous-catégories' : 'Par catégorie') + '</h2>' + (res.byCat.length ? '<ul class="bars">' +
    (d.cat ? (res.byCat[0] ? res.byCat[0].subs : []).map(function (s, i, all) {
      return barHtml('dsub:' + s.key, esc(s.key), s.amount, all[0].amount, { right: money0(s.amount) + pct(s.amount, res.total) }, []);
    }) : res.byCat.map(function (c) {
      var dl = byCatDelta[c.key] || 0;
      return barHtml('dcat:' + c.key, ico(c.key) + esc(c.key), c.amount, maxCat, { right: money0(c.amount) + pct(c.amount, res.total),
        below: Math.abs(dl) >= 1 ? (dl > 0 ? '+' : '−') + money0(Math.abs(dl)) + ' ' + vs : '', cls: dl >= 1 ? 'up' : dl <= -1 ? 'down' : '' }, totals(c.subs));
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
    case 'means':
      if ($('#chequeno')) f.means.number = $('#chequeno').value.trim();
      f.means.kind = t.dataset.kind; paintMeans(); if ($('#chequeno')) $('#chequeno').focus(); break;
    case 'kind': f.refund = t.dataset.refund === 'true'; $('#kind').innerHTML = kindButtons(); break;
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
      S.form = { id: e.id, cat: e.cat, sub: e.sub, suggested: false, manual: true, who: e.who.slice(), means: meansOf(e.means), refund: e.amount < 0 };
      render(); window.scrollTo(0, 0); break;
    case 'cancel-edit': exitEdit(); break;
    case 'delete': confirmDelete(); break;
    case 'delete-yes':
      busy(t, true);
      var gone = S.edit.id;
      call('deleteExpense', gone).then(function (d) { closeSheet(); S.data = d; exitEdit(); toast('Dépense supprimée', { undo: ['restoreExpense', gone], undone: 'Ligne récupérée' }); })
        .catch(function (e) { busy(t, false); fail(e); }); break;
    case 'undo':
      var u = S.undo;
      $('#toast').className = '';
      call.apply(null, u.call).then(function (d) { setData(d); toast(u.msg); }).catch(fail); break;
    case 'add':
      if (S.tab === 'add') return;
      S.back = S.tab; S.edit = null; S.form = null; S.tab = 'add'; render(); window.scrollTo(0, 0); break;
    case 'restore':
      busy(t, true);
      call('restoreExpense', t.dataset.id).then(function (d) { setData(d); toast('Ligne récupérée'); }).catch(function (e) { busy(t, false); fail(e); }); break;
    case 'import-yes':
      var acts = importActions();
      if (!acts.length) { closeSheet(); return; }
      busy(t, true);
      call('importBank', acts).then(function (d) { closeSheet(); setData(d); toast(acts.length + ' ligne' + (acts.length > 1 ? 's' : '') + ' mise' + (acts.length > 1 ? 's' : '') + ' à jour'); })
        .catch(function (e) { busy(t, false); fail(e); }); break;
    case 'month-prev': case 'month-next':
      var step = S.tab === 'dash' ? { month: 1, quarter: 3, year: 12 }[S.dash.kind] : 1;
      S.ym = Calc.addMonths(S.ym, a === 'month-prev' ? -step : step); render(); break;
    case 'filters': openFilters(); break;
    case 'theme':
      applyTheme(THEMES[(THEMES.indexOf(theme()) + 1) % THEMES.length]); render(); toast(THEME_NAMES[theme()]); break;
    case 'install':
      if (S.install) S.install.prompt().then(function () { S.install = null; render(); }); break;
    case 'set-filter':
      S.dash[t.dataset.key] = t.dataset.value; render(); openFilters(); break;
    case 'dash-kind': S.dash.kind = t.dataset.kind; render(); break;
    case 'dash-evo': S.dash.evo = t.dataset.evo; render(); break;
    case 'toggle': S.open[t.dataset.key] = !S.open[t.dataset.key]; render(); break;
    case 'prepare-month':
      busy(t, true);
      call('prepareMonth', S.ym).then(function (d) { setData(d); toast(monthName(S.ym) + ' préparé'); }).catch(function (e) { busy(t, false); fail(e); });
      break;
    case 'passed': openPassed(t.dataset.id); break;
    case 'passed-yes':
      var amount = dec($('#ps-amount').value), date = $('#ps-date').value;
      if (!isFinite(amount) || amount <= 0) { $('#ps-amount').closest('.unit').setAttribute('aria-invalid', 'true'); $('#ps-amount').focus(); return; }
      busy(t, true);
      call('markPassed', t.dataset.id, amount, date).then(function (d) { closeSheet(); setData(d); toast('Passé en opération'); })
        .catch(function (e) { busy(t, false); fail(e); });
      break;
  }
});

applyTheme(theme());
if (/[?&]add\b/.test(location.search)) { S.tab = 'add'; S.back = 'month'; history.replaceState(null, '', location.pathname); }
if (token()) {
  document.body.classList.remove('locked');
  try { var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (cached && cached.months) setData(cached); } catch (e) { /* no cache */ }
  load();
} else lock();

// Install: Android/desktop Chrome offer a prompt we can trigger; iPhone needs Safari's Share → Sur l'écran d'accueil.
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.install = e; if (S.data && S.tab === 'month') render(); });
function standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function installHtml() {
  if (standalone()) return '';
  if (S.install) return '<button type="button" class="btn importbtn" data-action="install">' + icon('download') + 'Installer l\'appli sur cet appareil</button>';
  if (/iPhone|iPad/.test(navigator.userAgent)) return '<p class="hint">Pour l\'installer : Safari → Partager → « Sur l\'écran d\'accueil ».</p>';
  return '';
}

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(function () { /* install offer only */ });
