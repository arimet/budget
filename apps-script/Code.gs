// Budget du foyer: the spreadsheet is the only source of truth.
// Columns are found by their header name, so they can be reordered or extended by hand.

// Settings tabs; the money itself lives in one tab per month, laid out like a hand-kept ledger.
var TABS = {
  'Charges fixes': ['Nom', 'CB / Chèque', 'Montant', 'Jour', 'Catégorie', 'Sous-catégorie', 'Pour', 'Mois', 'Début', 'Fin'],
  'Budgets': ['Catégorie', 'Sous-catégorie', 'Libellé', 'Montant mensuel', 'Depuis'],
  'Catégories': ['Catégorie', 'Sous-catégorie', 'Emoji', 'Mots-clés'],
  'Personnes': ['Nom']
};
// Columns that hold a month (AAAA-MM) or a list of months: kept as plain text so Sheets does not turn them into dates.
var TEXT_COLUMNS = { 'Charges fixes': ['Mois', 'Début', 'Fin'], 'Budgets': ['Depuis'] };

// A month tab ("Novembre 2026"): E1 "Report", F1 opening balance, headers on row 3, operations from row 5,
// real operations in normal font above the forecasts in bold, F = running balance down to row 100 at least.
var MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
var MONTH_HEAD = ['Date', 'CB / Chèque', 'Libellé', 'Crédit', 'Débit', 'Solde', '', 'Catégorie', 'Sous-catégorie', 'Pour', 'ID'];
var COL = { date: 1, means: 2, label: 3, credit: 4, debit: 5, balance: 6, ok: 7, cat: 8, sub: 9, who: 10, id: 11 };
var FIRST_ROW = 5, MIN_LAST_ROW = 100, WIDTH = 11;
var TRASH = 'Corbeille', TRASH_HEAD = ['Supprimée le', 'Onglet'].concat(MONTH_HEAD);

var DEFAULT_PEOPLE = ['Foyer'];
var DEFAULT_CATEGORIES = [
  ['Logement', '🏠', [
    ['Loyer / crédit', 'loyer, credit immo, pret immo'],
    ['Charges copro', 'syndic, copro, charges'],
    ['Électricité & gaz', 'edf, engie, totalenergies, ekwateur, gaz'],
    ['Eau', 'eau, veolia, suez, saur'],
    ['Assurance habitation', 'assurance habitation'],
    ['Travaux & entretien', 'leroy merlin, castorama, brico, bricomarche'],
    ['Équipement maison', 'ikea, darty, boulanger, conforama']]],
  ['Alimentation', '🛒', [
    ['Courses', 'carrefour, leclerc, lidl, auchan, intermarche, monoprix, franprix, super u, aldi, casino, picard, biocoop, courses'],
    ['Boulangerie & marché', 'boulangerie, marche, primeur, boucherie, fromagerie'],
    ['Restaurants', 'restaurant, resto, brasserie, cafe, mcdo, mcdonald, burger king, kfc'],
    ['Livraison & à emporter', 'deliveroo, uber eats, just eat, pizza, sushi, kebab'],
    ['Repas au travail', 'cantine, self, swile, ticket resto, sandwich']]],
  ['Transport', '🚗', [
    ['Carburant', 'carburant, essence, gasoil, esso, shell, station, total'],
    ['Transports en commun', 'ratp, navigo, tcl, tram, bus, metro, transilien'],
    ['Train', 'sncf, ouigo, tgv, trainline'],
    ['Péage & parking', 'peage, vinci, sanef, aprr, parking, indigo'],
    ['Entretien & réparations', 'garage, norauto, feu vert, speedy, midas, controle technique'],
    ['Assurance auto', 'assurance auto'],
    ['Crédit / LOA auto', 'loa, lld, credit auto'],
    ['Taxi & VTC', 'uber, taxi, bolt, heetch, g7']]],
  ['Abonnements & télécoms', '📱', [
    ['Box internet', 'box, freebox, livebox, bbox'],
    ['Mobile', 'forfait, mobile, free mobile, sosh, red by sfr'],
    ['Streaming & musique', 'netflix, spotify, deezer, disney, prime video, canal, apple music, youtube'],
    ['Presse & applis', 'journal, presse, icloud, google one, app store']]],
  ['Santé', '🩺', [
    ['Médecin', 'medecin, docteur, doctolib, kine, osteo, generaliste'],
    ['Pharmacie', 'pharmacie'],
    ['Mutuelle', 'mutuelle, alan, harmonie'],
    ['Optique & dentaire', 'opticien, optique, dentiste, krys, afflelou']]],
  ['Éducation & garde', '🎒', [
    ['Garde & périscolaire', 'creche, nounou, garderie, periscolaire, baby sitting'],
    ['École & cantine', 'ecole, college, lycee'],
    ['Activités extrascolaires', 'club, conservatoire, judo, danse, cours'],
    ['Fournitures', 'fournitures, papeterie']]],
  ['Loisirs', '🎭', [
    ['Sorties & culture', 'cinema, ugc, pathe, gaumont, theatre, concert, musee, expo'],
    ['Sport', 'salle de sport, basic fit, piscine, fitness, decathlon'],
    ['Livres & jeux', 'fnac, cultura, librairie, livre, steam, playstation, nintendo'],
    ['Hobbies', '']]],
  ['Vacances', '🏖️', [
    ['Hébergement', 'airbnb, booking, hotel, gite, camping'],
    ['Transport', 'air france, easyjet, ryanair, transavia, location voiture'],
    ['Sur place', '']]],
  ['Shopping', '🛍️', [
    ['Vêtements & chaussures', 'zara, h&m, kiabi, uniqlo, vinted, chaussures'],
    ['High-tech', 'ldlc, apple store, materiel'],
    ['Maison & déco', 'maisons du monde, hema, action, gifi, deco'],
    ['Cadeaux', 'cadeau']]],
  ['Soins & beauté', '💇', [
    ['Coiffeur', 'coiffeur, coiffure, barbier'],
    ['Hygiène & cosmétiques', 'sephora, nocibe, yves rocher, parapharmacie']]],
  ['Impôts & finances', '🏦', [
    ['Impôt sur le revenu', 'impot, dgfip, impots gouv'],
    ['Taxe foncière', 'taxe fonciere'],
    ['Crédit conso', 'cofidis, cetelem, sofinco, credit conso'],
    ['Frais bancaires', 'frais bancaires, cotisation carte, agios, commission'],
    ['Épargne (virements)', 'livret, epargne, pel, assurance vie']]],
  ['Divers', '📦', [
    ['Dons', 'don, association'],
    ['Imprévus', ''],
    ['À classer', '']]]
];

// ------------------------------------------------------------------ JSON API for the web app (hosted elsewhere)

// The web app runs as the owner and is open to anyone with the URL: the password is the only gate.
var API = { getData: getData, saveExpense: saveExpense, deleteExpense: deleteExpense, restoreExpense: restoreExpense, markPassed: markPassed, saveForecast: saveForecast, bankConnect: bankConnect, bankTransactions: bankTransactions, prepareMonth: prepareMonth, importBank: importBank };

// Access: Google sign-in on the web app; only people the spreadsheet is shared with (editors, owner) get in.
// A verified Google identity is exchanged for a long random session key; only its hash is kept, with the email,
// and the email must still be allowed on every call, so un-sharing the spreadsheet closes the app.
var GOOGLE_CLIENT_ID = '756842922233-g99d6lg8buft7dbrfupom5ct0o1rjkrf.apps.googleusercontent.com';
var TOKEN_MS = 180 * 24 * 3600 * 1000, MAX_TOKENS = 20;

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.fn === 'googleLogin') out = googleLogin(req.credential);
    else if (!tokenOk(req.token)) out = { error: 'auth' };
    else if (!API.hasOwnProperty(req.fn)) out = { error: 'Action inconnue.' };
    else out = { data: API[req.fn].apply(null, req.args || []) };
  } catch (err) {
    out = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function nowMs() {
  return Date.now();
}

function props() {
  return PropertiesService.getScriptProperties();
}

function readJson(key, fallback) {
  try { return JSON.parse(props().getProperty(key)) || fallback; } catch (e) { return fallback; }
}

// Asks Google whether the ID token is genuine, recent, for this app and for a verified address.
function googleEmail(credential) {
  if (typeof credential !== 'string' || !credential || credential.length > 4096) return '';
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return '';
  var t = JSON.parse(res.getContentText());
  var fresh = Number(t.exp) * 1000 > nowMs(), fromGoogle = t.iss === 'https://accounts.google.com' || t.iss === 'accounts.google.com';
  return t.aud === GOOGLE_CLIENT_ID && fromGoogle && fresh && String(t.email_verified) === 'true' ? String(t.email).toLowerCase() : '';
}

// Owner and editors of the spreadsheet, cached 30 minutes (un-sharing takes effect within that time).
function allowedEmails() {
  var cache = CacheService.getScriptCache(), hit = cache.get('ALLOWED');
  if (hit) return JSON.parse(hit);
  var ss = SpreadsheetApp.getActive();
  var emails = ss.getEditors().map(function (u) { return u.getEmail(); }).concat([ss.getOwner() ? ss.getOwner().getEmail() : ''])
    .filter(String).map(function (e) { return e.toLowerCase(); });
  cache.put('ALLOWED', JSON.stringify(emails), 1800);
  return emails;
}

function forgetAccessCache() {
  CacheService.getScriptCache().put('ALLOWED', '', 1);
}

function googleLogin(credential) {
  var email = googleEmail(credential);
  if (!email) return { error: 'auth' };
  if (allowedEmails().indexOf(email) < 0) return { error: 'denied' };
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var tokens = storedTokens(), kept = {};
  tokens[hashOf(token)] = { exp: nowMs() + TOKEN_MS, email: email };
  Object.keys(tokens).sort(function (a, b) { return tokens[b].exp - tokens[a].exp; }).slice(0, MAX_TOKENS)
    .forEach(function (k) { kept[k] = tokens[k]; });
  props().setProperty('TOKENS', JSON.stringify(kept));
  return { data: { token: token, email: email } };
}

// Valid session keys (hash → {exp, email}), expired ones dropped.
function storedTokens() {
  var tokens = readJson('TOKENS', {}), now = nowMs(), out = {};
  Object.keys(tokens).forEach(function (k) { if (tokens[k] && tokens[k].exp > now) out[k] = tokens[k]; });
  return out;
}

function tokenOk(token) {
  if (typeof token !== 'string' || token.length < 32) return false;
  var t = storedTokens()[hashOf(token)];
  return !!t && allowedEmails().indexOf(t.email) >= 0;
}

function hashOf(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'budget:' + text, Utilities.Charset.UTF_8));
}

function logoutAll() {
  props().deleteProperty('TOKENS');
}

function logoutAllMenu() {
  logoutAll();
  SpreadsheetApp.getUi().alert('Tous les appareils sont déconnectés : chacun devra se reconnecter avec Google.');
}

// Run once from the menu after an update: Google asks the owner to allow the script to check sign-ins.
function authorizeGoogle() {
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
  forgetAccessCache();
  SpreadsheetApp.getUi().alert('C\'est prêt : l\'appli accepte les comptes Google avec qui ce Sheets est partagé en modification.');
}

function onOpen() {
  var menu = SpreadsheetApp.getUi().createMenu('Budget')
    .addItem('Autoriser la connexion Google', 'authorizeGoogle')
    .addItem('Déconnecter tous les appareils', 'logoutAllMenu')
    .addItem('Créer les onglets manquants', 'setup')
    .addItem('Préparer le mois suivant', 'prepareNextMonth')
    .addItem('Configurer la banque', 'configureBank');
  // Import.gs exists only while a one-off import of bank statements is pending.
  if (typeof importReleves === 'function') menu.addItem('Importer les relevés', 'importReleves');
  menu.addToUi();
}

function prepareNextMonth() {
  var ss = SpreadsheetApp.getActive();
  withLock(function () { ensureMonth(ss, addMonths(currentYm(), 1)); refreshEnvelopes(ss); });
  ss.setActiveSheet(ss.getSheetByName(tabName(addMonths(currentYm(), 1))));
}

// ------------------------------------------------------------------ setup

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    (TEXT_COLUMNS[name] || []).forEach(function (col) {
      var c = headerIndex(sh)[col];
      if (c !== undefined) sh.getRange(2, c + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
  var people = ss.getSheetByName('Personnes');
  if (people.getLastRow() === 1) {
    people.getRange(2, 1, DEFAULT_PEOPLE.length, 1).setValues(DEFAULT_PEOPLE.map(function (p) { return [p]; }));
  }
  var cats = ss.getSheetByName('Catégories');
  if (cats.getLastRow() === 1) {
    var rows = [];
    DEFAULT_CATEGORIES.forEach(function (c) {
      c[2].forEach(function (s) { rows.push([c[0], s[0], c[1], s[1]]); });
    });
    cats.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  // A new spreadsheet comes with an empty first tab: drop it once ours exist.
  ss.getSheets().forEach(function (sh) {
    if (!TABS[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

// ------------------------------------------------------------------ reading

function now() {
  return new Date();
}

function tabName(ymStr) {
  return MONTHS_FR[+ymStr.slice(5) - 1] + ' ' + ymStr.slice(0, 4);
}

function tabYm(name) {
  var m = String(name).match(/^(\S+) (\d{4})$/);
  var i = m ? MONTHS_FR.indexOf(m[1]) : -1;
  return i < 0 ? '' : m[2] + '-' + pad(i + 1);
}

function monthTabs(ss) {
  return ss.getSheets().map(function (sh) { return { ym: tabYm(sh.getName()), sh: sh }; })
    .filter(function (t) { return t.ym; })
    .sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });
}

// Last row holding anything other than the running balance.
function contentLastRow(sh) {
  var last = sh.getLastRow();
  if (last < FIRST_ROW) return FIRST_ROW - 1;
  var values = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, WIDTH).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i].some(function (v, c) { return c !== COL.balance - 1 && c !== COL.ok - 1 && v !== ''; })) return FIRST_ROW + i;
  }
  return FIRST_ROW - 1;
}

// Rows of a month tab. Bold label = forecast. Rows without an ID get one written to column K.
function readMonth(sh, ctx) {
  ctx = ctx || readContext(SpreadsheetApp.getActive());
  var last = contentLastRow(sh), rowsOut = [];
  var month = { ym: tabYm(sh.getName()), tab: sh.getName(), opening: num(sh.getRange(1, COL.balance).getValue()), rows: rowsOut };
  if (last < FIRST_ROW) return month;
  var n = last - FIRST_ROW + 1;
  var values = sh.getRange(FIRST_ROW, 1, n, WIDTH).getValues();
  var bold = sh.getRange(FIRST_ROW, COL.label, n, 1).getFontWeights();
  values.forEach(function (v, i) {
    var credit = num(v[COL.credit - 1]), debit = num(v[COL.debit - 1]), label = str(v[COL.label - 1]);
    if (!label && !credit && !debit) return;
    var forecast = bold[i][0] === 'bold', id = str(v[COL.id - 1]);
    if (!id) {
      id = forecast ? (ctx.envelopes[label] ? 'env:' + ctx.envelopes[label] : 'prev:' + newId()) : newId();
      sh.getRange(FIRST_ROW + i, COL.id).setValue(id);
    }
    var cat = str(v[COL.cat - 1]);
    rowsOut.push({
      id: id, row: FIRST_ROW + i, date: ymd(v[COL.date - 1], ctx.tz), means: str(v[COL.means - 1]), label: label,
      credit: credit, debit: debit, cat: cat || 'Divers', sub: cat ? str(v[COL.sub - 1]) : 'À classer',
      who: list(v[COL.who - 1]).length ? list(v[COL.who - 1]) : [ctx.people[0]],
      forecast: forecast, envelope: forecast && id.indexOf('env:') === 0 // un-bolded by hand, it is a real line
    });
  });
  return month;
}

// What reading needs from the settings tabs.
function readContext(ss) {
  var people = rows(ss, 'Personnes').map(function (r) { return str(r['Nom']); }).filter(String);
  var tz = ss.getSpreadsheetTimeZone();
  var budgets = rows(ss, 'Budgets').filter(function (r) { return str(r['Catégorie']); }).map(function (r) {
    return { cat: str(r['Catégorie']), sub: str(r['Sous-catégorie']), label: str(r['Libellé']) || str(r['Sous-catégorie']) || str(r['Catégorie']),
      amount: num(r['Montant mensuel']), since: ym(r['Depuis'], tz) };
  });
  var envelopes = {};
  budgets.forEach(function (b) { envelopes[b.label] = b.cat + '|' + b.sub; });
  return { ss: ss, tz: tz, people: people.length ? people : ['Foyer'], budgets: budgets, envelopes: envelopes };
}

// `fresh` (pull to refresh) skips the cache.
function getData(fresh) {
  if (!fresh) { var hit = cachedData(); if (hit) return hit; }
  var ss = SpreadsheetApp.getActive();
  // Opening the app is when a new month gets its tab and envelopes catch up with lines typed in the Sheets.
  withLock(function () {
    ensureMonth(ss, currentYm());
    // Rows typed or inserted by hand in the Sheets may sit outside the running balance: lay it again where it drifted.
    // Only last month onwards: older months are rarely touched, and checking every tab slows every open.
    var from = addMonths(currentYm(), -1);
    monthTabs(ss).forEach(function (t) { if (t.ym >= from && !balanceOk(ss, t.sh)) relayBalance(ss, t.sh); });
    refreshEnvelopes(ss);
  });
  var gen = CacheService.getScriptCache().get('GEN'), ctx = readContext(ss);
  var data = {
    today: Utilities.formatDate(now(), ctx.tz, 'yyyy-MM-dd'),
    people: ctx.people,
    categories: rows(ss, 'Catégories').filter(function (r) { return str(r['Catégorie']); }).map(function (r) {
      return { cat: str(r['Catégorie']), sub: str(r['Sous-catégorie']), emoji: str(r['Emoji']), keywords: list(r['Mots-clés']) };
    }),
    budgets: ctx.budgets,
    fixed: readFixed(ss, ctx),
    trash: readTrash(ss, ctx.tz),
    savings: readSavings(ss),
    months: monthTabs(ss).map(function (t) { return readMonth(t.sh, ctx); }),
    bank: bankInfo()
  };
  if (CacheService.getScriptCache().get('GEN') === gen) cacheData(data); // no write slipped in while reading
  return data;
}

// getData's answer stays in the script cache until something changes: a write (withLock), an edit by hand (onEdit),
// a new day, or a pull to refresh. Changes that fire no onEdit (bold, inserted rows) show after a pull or within 6 h.
// Split in pieces: one cache value holds at most 100 KB.
var PIECE = 25000;
function cachedData() {
  var c = CacheService.getScriptCache(), head = c.get('DATA');
  if (!head) return null;
  head = JSON.parse(head);
  if (head.day !== Utilities.formatDate(now(), Session.getScriptTimeZone(), 'yyyy-MM-dd')) return null;
  var keys = [];
  for (var i = 0; i < head.n; i++) keys.push('DATA' + i);
  var parts = c.getAll(keys), text = '';
  for (i = 0; i < head.n; i++) { if (parts['DATA' + i] == null) return null; text += parts['DATA' + i]; }
  return JSON.parse(text);
}
function cacheData(data) {
  var text = JSON.stringify(data), all = {}, n = Math.ceil(text.length / PIECE);
  for (var i = 0; i < n; i++) all['DATA' + i] = text.slice(i * PIECE, (i + 1) * PIECE);
  all.DATA = JSON.stringify({ day: Utilities.formatDate(now(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), n: n });
  CacheService.getScriptCache().putAll(all, 21600);
}
function dropData() {
  var c = CacheService.getScriptCache();
  c.remove('DATA');
  c.put('GEN', String(Date.now()) + Math.random(), 21600);
}

function readFixed(ss, ctx) {
  return rows(ss, 'Charges fixes').filter(function (r) { return str(r['Nom']); }).map(function (r) {
    return { name: str(r['Nom']), means: str(r['CB / Chèque']), amount: num(r['Montant']), day: Math.round(num(r['Jour'])) || 1,
      cat: str(r['Catégorie']), sub: str(r['Sous-catégorie']), who: list(r['Pour']).length ? list(r['Pour']) : [ctx.people[0]],
      months: list(r['Mois']).map(Number).filter(Boolean), start: ym(r['Début'], ctx.tz), end: ym(r['Fin'], ctx.tz) };
  });
}

// ------------------------------------------------------------------ writing (each returns fresh data)

function saveExpense(e) {
  var id;
  withLock(function () {
    var ss = SpreadsheetApp.getActive();
    id = writeExpense(ss, e);
    refreshEnvelopes(ss);
  });
  var data = getData();
  data.saved = id; // lets the app offer "Annuler" right after adding
  return data;
}

// Writes one real line (new or edited) and returns its id. `e.means`, when given, is the "CB / Chèque" cell.
function writeExpense(ss, e) {
  var amount = Number(e.amount);
  if (!isFinite(amount) || amount === 0) throw new Error('Montant invalide.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error('Date invalide.');
  if (!e.cat) throw new Error('Choisis une catégorie.');
  if (!e.who || !e.who.length) throw new Error('Choisis pour qui.');
  var id = e.id || newId(), target = e.date.slice(0, 7);
  var sh = ensureMonth(ss, target);
  if (!sh) throw new Error('Pas d\'onglet « ' + tabName(target) + ' » dans le Sheets pour cette date.');
  var values = {}, d = e.date.split('-');
  values[COL.date] = new Date(+d[0], +d[1] - 1, +d[2]);
  values[COL.means] = typeof e.means === 'string' ? e.means : 'CB du ' + d[2] + '/' + d[1];
  values[COL.label] = e.label || e.sub || e.cat;
  values[COL.credit] = amount < 0 ? Math.round(-amount * 100) / 100 : '';
  values[COL.debit] = amount > 0 ? Math.round(amount * 100) / 100 : '';
  values[COL.cat] = e.cat;
  values[COL.sub] = e.sub || '';
  values[COL.who] = e.who.join(', ');
  values[COL.id] = id;
  var at = e.id ? findById(ss, e.id) : null;
  // Without a mention from the app, an edited line keeps how it was paid ("Chèque n° …", "Retrait …", an empty cell); card lines follow the date.
  var oldMeans = at ? str(at.sh.getRange(at.row, COL.means).getValue()) : '';
  if (at && typeof e.means !== 'string' && oldMeans.indexOf('CB') !== 0) values[COL.means] = oldMeans; // the app did not say: keep it
  if (at && tabYm(at.sh.getName()) === target && !isBold(at.sh, at.row)) {
    writeCells(at.sh, at.row, values);
  } else {
    if (at) removeRow(ss, at);
    insertReal(ss, sh, e.date, values);
  }
  return id;
}

// A forecast ("À venir"), new or edited: a bold line without a date, at the bottom of its month. Amount < 0 = to receive.
// Deleting one goes through deleteExpense(id, false).
function saveForecast(e) {
  withLock(function () {
    var ss = SpreadsheetApp.getActive(), amount = Number(e.amount);
    if (!isFinite(amount) || amount === 0) throw new Error('Montant invalide.');
    if (!/^\d{4}-\d{2}$/.test(e.ym)) throw new Error('Mois invalide.');
    if (!e.cat) throw new Error('Choisis une catégorie.');
    if (!e.who || !e.who.length) throw new Error('Choisis pour qui.');
    var at = e.id ? findById(ss, e.id) : null;
    if (at && !isBold(at.sh, at.row)) throw new Error('Cette opération est déjà passée : modifie-la dans les opérations du mois.');
    var sh = ensureMonth(ss, e.ym);
    if (!sh) throw new Error('On ne prévoit rien pour un mois passé.');
    var values = {};
    values[COL.means] = typeof e.means === 'string' ? e.means : at ? at.sh.getRange(at.row, COL.means).getValue() : '';
    values[COL.label] = e.label || e.sub || e.cat;
    values[COL.credit] = amount < 0 ? Math.round(-amount * 100) / 100 : '';
    values[COL.debit] = amount > 0 ? Math.round(amount * 100) / 100 : '';
    values[COL.cat] = e.cat;
    values[COL.sub] = e.sub || '';
    values[COL.who] = e.who.join(', ');
    values[COL.id] = e.id || 'prev:' + newId();
    var row;
    if (at && at.sh.getName() === sh.getName()) row = at.row;
    else { if (at) removeRow(ss, at); row = Math.max(contentLastRow(sh), FIRST_ROW - 1) + 1; }
    writeCells(sh, row, values);
    sh.getRange(row, 1, 1, WIDTH).setFontWeight('bold');
    relayBalance(ss, sh);
  });
  return getData();
}

// A deleted line is kept in the "Corbeille" tab so it can be put back (keep === false: undo of a line just added).
function deleteExpense(id, keep) {
  withLock(function () {
    var ss = SpreadsheetApp.getActive(), at = findById(ss, id);
    if (!at) throw new Error('Ligne introuvable : elle a peut-être été supprimée dans le Sheets.');
    if (keep !== false) {
      var trash = ss.getSheetByName(TRASH) || ss.insertSheet(TRASH);
      if (trash.getLastRow() === 0) trash.getRange(1, 1, 1, TRASH_HEAD.length).setValues([TRASH_HEAD]).setFontWeight('bold');
      var values = at.sh.getRange(at.row, 1, 1, WIDTH).getValues()[0];
      values[COL.balance - 1] = '';
      trash.getRange(trash.getLastRow() + 1, 1, 1, TRASH_HEAD.length).setValues([[now(), at.sh.getName()].concat(values)]);
    }
    removeRow(ss, at);
    refreshEnvelopes(ss);
  });
  return getData();
}

function restoreExpense(id) {
  withLock(function () {
    var ss = SpreadsheetApp.getActive(), trash = ss.getSheetByName(TRASH);
    var last = trash ? trash.getLastRow() : 0, found = 0;
    var all = last > 1 ? trash.getRange(2, 1, last - 1, TRASH_HEAD.length).getValues() : [];
    for (var i = 0; i < all.length; i++) if (String(all[i][2 + COL.id - 1]) === String(id)) { found = i + 2; break; }
    if (!found) throw new Error('Ligne introuvable dans la corbeille.');
    var row = all[found - 2], tab = str(row[1]), values = {};
    var sh = ss.getSheetByName(tab) || (tabYm(tab) ? ensureMonth(ss, tabYm(tab)) : null);
    if (!sh) throw new Error('L\'onglet « ' + tab + ' » n\'existe plus.');
    Object.keys(COL).forEach(function (k) { if (k !== 'balance' && k !== 'ok') values[COL[k]] = row[2 + COL[k] - 1]; });
    insertReal(ss, sh, ymd(row[2], ss.getSpreadsheetTimeZone()) || tabYm(tab) + '-01', values);
    trash.deleteRow(found);
    refreshEnvelopes(ss);
  });
  return getData();
}

// "Epargne <prénom>" tabs, kept by hand: balances per account (A/B) above "Placement mensuel", monthly transfers below,
// and what the savings are for in column C ("Vacances : 300 €").
function readSavings(ss) {
  return ss.getSheets().filter(function (sh) { return /^[ée]pargne\s/i.test(sh.getName()); }).map(function (sh) {
    var last = sh.getLastRow(), values = last ? sh.getRange(1, 1, last, 3).getValues() : [];
    var out = { who: sh.getName().replace(/^[ée]pargne\s+/i, ''), accounts: [], monthly: [], goals: [] }, list = out.accounts;
    values.forEach(function (v) {
      var name = str(v[0]);
      if (/placement/i.test(name)) list = out.monthly;
      else if (name && !/^total/i.test(name) && typeof v[1] === 'number') list.push({ name: name, amount: v[1] });
      var m = str(v[2]).match(/^(.*?)\s*:\s*([\d\s.,]+)\s*€?$/);
      if (m) out.goals.push({ label: m[1], amount: num(m[2]) });
    });
    out.total = Math.round(out.accounts.reduce(function (s, a) { return s + a.amount; }, 0) * 100) / 100;
    out.monthlyTotal = out.monthly.reduce(function (s, a) { return s + a.amount; }, 0);
    return out;
  });
}

function readTrash(ss, tz) {
  var trash = ss.getSheetByName(TRASH), last = trash ? trash.getLastRow() : 0;
  if (last < 2) return [];
  return trash.getRange(2, 1, last - 1, TRASH_HEAD.length).getValues().map(function (v) {
    var c = function (k) { return v[2 + COL[k] - 1]; };
    return { id: str(c('id')), tab: str(v[1]), deletedAt: ymd(v[0], tz), date: ymd(c('date'), tz), label: str(c('label')),
      amount: num(c('debit')) - num(c('credit')), cat: str(c('cat')), sub: str(c('sub')) };
  }).filter(function (t) { return t.id; }).reverse();
}

// A forecast (bold) line has gone through: it becomes a real operation with the actual amount and date.
function markPassed(id, amount, date) {
  withLock(function () {
    var ss = SpreadsheetApp.getActive();
    passForecast(ss, id, amount, date);
    refreshEnvelopes(ss);
  });
  return getData();
}

function passForecast(ss, id, amount, date) {
  amount = Number(amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Montant invalide.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide.');
  var at = findById(ss, id);
  if (!at || !isBold(at.sh, at.row)) throw new Error('Prévision introuvable : elle a peut-être déjà été passée.');
  var old = at.sh.getRange(at.row, 1, 1, WIDTH).getValues()[0], values = {}, d = date.split('-');
  var credit = num(old[COL.credit - 1]) > 0;
  values[COL.date] = new Date(+d[0], +d[1] - 1, +d[2]);
  values[COL.means] = str(old[COL.means - 1]) === 'CB' ? 'CB du ' + d[2] + '/' + d[1] : old[COL.means - 1];
  values[COL.label] = old[COL.label - 1];
  values[COL.credit] = credit ? Math.round(amount * 100) / 100 : '';
  values[COL.debit] = credit ? '' : Math.round(amount * 100) / 100;
  values[COL.cat] = old[COL.cat - 1];
  values[COL.sub] = old[COL.sub - 1];
  values[COL.who] = old[COL.who - 1];
  values[COL.id] = newId();
  var sh = ensureMonth(ss, date.slice(0, 7));
  if (!sh) throw new Error('Pas d\'onglet « ' + tabName(date.slice(0, 7)) + ' » dans le Sheets pour cette date.');
  removeRow(ss, at);
  insertReal(ss, sh, date, values);
}

// Lines from the bank export, validated in the app: forecasts that went through and missing lines, in one go.
function importBank(actions) {
  if (!actions || !actions.length) throw new Error('Rien à importer.');
  withLock(function () {
    var ss = SpreadsheetApp.getActive();
    actions.forEach(function (a) {
      if (a.type === 'pass') passForecast(ss, a.id, a.amount, a.date);
      else if (a.type === 'add') writeExpense(ss, { date: a.expense.date, amount: a.expense.amount, cat: a.expense.cat, sub: a.expense.sub,
        label: a.expense.label, who: a.expense.who, means: a.expense.means });
    });
    refreshEnvelopes(ss);
  });
  return getData();
}

function prepareMonth(ymStr) {
  if (!/^\d{4}-\d{2}$/.test(ymStr)) throw new Error('Mois invalide.');
  withLock(function () {
    var ss = SpreadsheetApp.getActive();
    if (!ensureMonth(ss, ymStr)) throw new Error('On ne crée pas d\'onglet pour un mois passé.');
    refreshEnvelopes(ss);
  });
  return getData();
}

// ------------------------------------------------------------------ month tab plumbing

function isBold(sh, row) {
  return sh.getRange(row, COL.label).getFontWeights()[0][0] === 'bold';
}

function findById(ss, id) {
  var tabs = monthTabs(ss);
  for (var t = 0; t < tabs.length; t++) {
    var last = contentLastRow(tabs[t].sh);
    if (last < FIRST_ROW) continue;
    var ids = tabs[t].sh.getRange(FIRST_ROW, COL.id, last - FIRST_ROW + 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return { sh: tabs[t].sh, row: FIRST_ROW + i };
  }
  return null;
}

function writeCells(sh, row, values) {
  Object.keys(values).forEach(function (c) { sh.getRange(row, +c).setValue(values[c]); });
  sh.getRange(row, 1, 1, WIDTH).setFontWeight('normal');
  // A row inserted at the top inherits the header area's format: set the ledger's date and amount formats explicitly.
  sh.getRange(row, COL.date).setNumberFormat('dd/mm/yyyy');
  sh.getRange(row, COL.credit, 1, 2).setNumberFormat('#,##0.00');
}

// A real operation goes after the last real row dated on or before it, so real rows stay in date order above
// the forecasts. An empty row there (a gap is often left before the forecasts) is used instead of inserting one.
function insertReal(ss, sh, date, values) {
  var last = contentLastRow(sh), after = FIRST_ROW - 1, lastReal = FIRST_ROW - 1;
  if (last >= FIRST_ROW) {
    var n = last - FIRST_ROW + 1, rowsV = sh.getRange(FIRST_ROW, 1, n, WIDTH).getValues();
    var bold = sh.getRange(FIRST_ROW, COL.label, n, 1).getFontWeights();
    var tz = ss.getSpreadsheetTimeZone();
    rowsV.forEach(function (v, i) {
      var used = str(v[COL.label - 1]) || num(v[COL.credit - 1]) || num(v[COL.debit - 1]);
      if (!used || bold[i][0] === 'bold') return;
      lastReal = FIRST_ROW + i;
      if (ymd(v[COL.date - 1], tz) <= date) after = FIRST_ROW + i;
    });
  }
  var row = after + 1;
  var free = after === lastReal && isEmptyRow(sh, row);
  if (!free) sh.insertRowAfter(after);
  writeCells(sh, row, values);
  relayBalance(ss, sh);
  return row;
}

function isEmptyRow(sh, row) {
  return sh.getRange(row, 1, 1, WIDTH).getValues()[0].every(function (v, c) { return c === COL.balance - 1 || v === ''; });
}

function removeRow(ss, at) {
  at.sh.deleteRow(at.row);
  relayBalance(ss, at.sh);
}

// Rewrites the running balance down to the last used row (100 at least) and points the next month's report at it.
function relayBalance(ss, sh) {
  var last = Math.max(MIN_LAST_ROW, contentLastRow(sh)), formulas = [];
  for (var r = FIRST_ROW; r <= last; r++) {
    formulas.push(['=F' + (r === FIRST_ROW ? 1 : r - 1) + '+D' + r + '-E' + r]);
  }
  sh.getRange(FIRST_ROW, COL.balance, formulas.length, 1).setFormulas(formulas);
  var next = ss.getSheetByName(tabName(addMonths(tabYm(sh.getName()), 1)));
  if (next) next.getRange(1, COL.balance).setFormula("='" + sh.getName() + "'!F" + last);
  return last;
}

function balanceOk(ss, sh) {
  var last = Math.max(MIN_LAST_ROW, contentLastRow(sh));
  var formulas = sh.getRange(FIRST_ROW, COL.balance, last - FIRST_ROW + 1, 1).getFormulas();
  for (var r = FIRST_ROW; r <= last; r++) {
    if (formulas[r - FIRST_ROW][0] !== '=F' + (r === FIRST_ROW ? 1 : r - 1) + '+D' + r + '-E' + r) return false;
  }
  var next = ss.getSheetByName(tabName(addMonths(tabYm(sh.getName()), 1)));
  return !next || next.getRange(1, COL.balance).getFormula() === "='" + sh.getName() + "'!F" + last;
}

function addMonths(ymStr, n) {
  var d = new Date(+ymStr.slice(0, 4), +ymStr.slice(5) - 1 + n, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

function currentYm() {
  return Utilities.formatDate(now(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM');
}

// The tab of a month, created for the current month or a later one (never for a past month).
function ensureMonth(ss, ymStr) {
  var name = tabName(ymStr), sh = ss.getSheetByName(name);
  if (sh) return sh;
  if (ymStr < currentYm()) return null;
  if (ymStr > addMonths(currentYm(), 12)) throw new Error('Date trop loin : on prépare au plus 12 mois à l\'avance (pas d\'onglet « ' + name + ' »).');
  var prevName = tabName(addMonths(ymStr, -1));
  var prev = ss.getSheetByName(prevName) || (addMonths(ymStr, -1) >= currentYm() ? ensureMonth(ss, addMonths(ymStr, -1)) : null);
  if (prev) {
    sh = prev.copyTo(ss).setName(name);
    var last = Math.max(MIN_LAST_ROW, sh.getLastRow());
    sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, WIDTH).clearContent().setFontWeight('normal');
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(prev.getIndex() + 1);
  } else {
    sh = ss.insertSheet(name);
    sh.getRange(1, 5).setValue('Report');
    sh.getRange(1, COL.balance).setValue(0);
    sh.getRange(3, 1, 1, WIDTH).setValues([MONTH_HEAD]);
    sh.hideColumns(COL.id);
  }
  writeForecasts(ss, sh, ymStr);
  relayBalance(ss, sh);
  if (prev) relayBalance(ss, prev);
  return sh;
}

// Bold lines of a new month: fixed charges active that month (incomes as credits), then one envelope per budget.
function writeForecasts(ss, sh, ymStr) {
  var ctx = readContext(ss), out = [];
  readFixed(ss, ctx).filter(function (f) { return fixedActive(f, ymStr); }).forEach(function (f) {
    var credit = f.cat === 'Revenus';
    out.push([f.means, f.name, credit ? f.amount : '', credit ? '' : f.amount, f.cat, f.sub, f.who.join(', '), 'prev:' + newId()]);
  });
  activeBudgets(ctx.budgets, ymStr).forEach(function (b) {
    out.push(['CB', b.label, '', b.amount, b.cat, b.sub, 'Foyer', 'env:' + b.cat + '|' + b.sub]);
  });
  out.forEach(function (o, i) {
    var row = FIRST_ROW + i;
    sh.getRange(row, COL.means, 1, 4).setValues([[o[0], o[1], o[2], o[3]]]);
    sh.getRange(row, COL.cat, 1, 4).setValues([[o[4], o[5], o[6], o[7]]]);
    sh.getRange(row, 1, 1, WIDTH).setFontWeight('bold');
  });
}

function fixedActive(f, ymStr) {
  if (f.start && f.start > ymStr) return false;
  if (f.end && f.end < ymStr) return false;
  return !f.months.length || f.months.indexOf(+ymStr.slice(5)) >= 0;
}

// For each envelope (category, or category + sub-category), the budget row in force that month.
function activeBudgets(budgets, ymStr) {
  var best = {};
  budgets.forEach(function (b) {
    var k = b.cat + '|' + b.sub;
    if (b.since <= ymStr && (!best[k] || b.since >= best[k].since)) best[k] = b;
  });
  return budgets.filter(function (b) { return best[b.cat + '|' + b.sub] === b && b.amount > 0; });
}

// Envelopes of the current and later months = budget − what was spent in their category, never below 0.
function refreshEnvelopes(ss) {
  var ctx = readContext(ss), cur = currentYm();
  monthTabs(ss).filter(function (t) { return t.ym >= cur; }).forEach(function (t) {
    var month = readMonth(t.sh, ctx), budgets = {};
    activeBudgets(ctx.budgets, t.ym).forEach(function (b) { budgets[b.cat + '|' + b.sub] = b.amount; });
    var envs = month.rows.filter(function (r) { return r.envelope; });
    var keys = envs.map(function (r) { return r.id.slice(4); }), spent = {};
    month.rows.forEach(function (r) {
      if (r.forecast) return;
      var k = keys.indexOf(r.cat + '|' + r.sub) >= 0 ? r.cat + '|' + r.sub : r.cat + '|';
      if (keys.indexOf(k) >= 0) spent[k] = (spent[k] || 0) + r.debit - r.credit;
    });
    envs.forEach(function (r) {
      var k = r.id.slice(4);
      if (!(k in budgets)) return;
      var left = Math.max(0, Math.round((budgets[k] - (spent[k] || 0)) * 100) / 100);
      if (left !== r.debit) t.sh.getRange(r.row, COL.debit).setValue(left);
    });
  });
}

// ------------------------------------------------------------------ dropdowns in the Sheets

// Simple trigger: a category picked by hand narrows the sub-category dropdown next to it to that category's
// sub-categories, and clears a sub-category that no longer fits. Writes made by the app do not fire it.
function onEdit(e) {
  dropData();
  var sh = e.range.getSheet(), name = sh.getName();
  var catCol = tabYm(name) ? COL.cat : name === 'Charges fixes' ? 5 : name === 'Budgets' ? 1 : 0;
  var first = tabYm(name) ? FIRST_ROW : 2;
  if (!catCol || e.range.getColumn() > catCol || e.range.getColumn() + e.range.getNumColumns() - 1 < catCol) return;
  var ss = SpreadsheetApp.getActive(), subsByCat = {};
  rows(ss, 'Catégories').forEach(function (r) {
    var c = str(r['Catégorie']), sub = str(r['Sous-catégorie']);
    if (c && sub) (subsByCat[c] = subsByCat[c] || []).push(sub);
  });
  for (var row = Math.max(first, e.range.getRow()); row < e.range.getRow() + e.range.getNumRows(); row++) {
    var subs = subsByCat[str(sh.getRange(row, catCol).getValue())] || [];
    var cell = sh.getRange(row, catCol + 1);
    if (subs.length) cell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(subs, true).setAllowInvalid(false).build());
    if (str(cell.getValue()) && subs.indexOf(str(cell.getValue())) < 0) cell.setValue('');
  }
}

// ------------------------------------------------------------------ helpers

function sheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Onglet « ' + name + ' » introuvable : menu Budget → Créer les onglets manquants.');
  return sh;
}

function headerIndex(sh) {
  var idx = {};
  if (sh.getLastColumn() === 0) return idx;
  sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].forEach(function (h, i) {
    h = String(h).trim();
    if (h && idx[h] === undefined) idx[h] = i;
  });
  return idx;
}

// Rows as objects keyed by header, with their sheet row number in _row; blank rows skipped.
function rows(ss, name) {
  var values = sheet(ss, name).getDataRange().getValues();
  var head = values.shift().map(function (h) { return String(h).trim(); });
  var out = [];
  values.forEach(function (v, i) {
    if (v.every(function (c) { return c === ''; })) return;
    var r = { _row: i + 2 };
    head.forEach(function (h, j) { if (h && r[h] === undefined) r[h] = v[j]; });
    out.push(r);
  });
  return out;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { fn(); SpreadsheetApp.flush(); } finally { dropData(); lock.releaseLock(); }
}

function newId() {
  return Utilities.getUuid().slice(0, 8);
}

function str(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function num(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/[\s €]/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function list(v) {
  return str(v).split(',').map(function (s) { return s.trim(); }).filter(String);
}

// Accepts a Date cell, "2026-11-05" or "05/11/2026".
function ymd(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = str(v), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  return '';
}

// Accepts a Date cell (Sheets turns "2026-11" into 1 Nov 2026), "2026-11" or "11/2026".
function ym(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
  var s = str(v), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]);
  if ((m = s.match(/^(\d{1,2})\/(\d{4})$/))) return m[2] + '-' + pad(m[1]);
  return '';
}

function pad(n) {
  return ('0' + n).slice(-2);
}

// ------------------------------------------------------------------ bank connection (Enable Banking, read only)
// The Enable Banking app's id and private key are set from the Sheets menu and stay in the Script Properties.
// The bank's consent lasts at most 180 days (PSD2): renewing it means signing in to the bank again.
var EB_API = 'https://api.enablebanking.com';
// The bank sends the user back here (doGet): this URL is registered as the redirect URL of the Enable Banking app.
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxyr6VEJfNQ8ldL1vnc-MEFV6bQ4dYZ1qvTyeCMC5_x1lbwmCcbs2M36ITvcrTUSF0/exec';

function configureBank() {
  var ui = SpreadsheetApp.getUi();
  var id = ui.prompt('Banque (1/2)', 'Application ID de l\'application Enable Banking :', ui.ButtonSet.OK_CANCEL);
  if (id.getSelectedButton() !== ui.Button.OK) return;
  var key = ui.prompt('Banque (2/2)', 'Tout le contenu du fichier .pem téléchargé à la création de l\'application :', ui.ButtonSet.OK_CANCEL);
  if (key.getSelectedButton() !== ui.Button.OK) return;
  // A paste into a one-line field loses the line breaks: keep the base64 body and lay the PEM out again.
  var body = key.getResponseText().replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+\/=]{200,}$/.test(body)) { ui.alert('Ce n\'est pas une clé privée : colle tout le fichier .pem.'); return; }
  props().setProperty('EB_APP', id.getResponseText().trim());
  props().setProperty('EB_KEY', '-----BEGIN PRIVATE KEY-----\n' + body.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n');
  try { lbp(); } catch (e) { ui.alert('La clé ne marche pas : ' + e.message); return; }
  dropData();
  ui.alert('C\'est prêt : connecte la banque depuis l\'appli (écran Mois, en bas).');
}

function bankInfo() {
  var p = props();
  return { configured: !!(p.getProperty('EB_APP') && p.getProperty('EB_KEY')), until: p.getProperty('EB_UNTIL') || '' };
}

function b64url(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function ebJwt() {
  var iat = Math.floor(nowMs() / 1000);
  var head = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: props().getProperty('EB_APP') }));
  var body = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: iat, exp: iat + 3600 }));
  return head + '.' + body + '.' + b64url(Utilities.computeRsaSha256Signature(head + '.' + body, props().getProperty('EB_KEY')));
}
function ebFetch(method, path, payload) {
  var opts = { method: method, headers: { Authorization: 'Bearer ' + ebJwt() }, muteHttpExceptions: true };
  if (payload) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(payload); }
  var res = UrlFetchApp.fetch(EB_API + path, opts), out = {};
  try { out = JSON.parse(res.getContentText()); } catch (e) { /* not JSON */ }
  if (res.getResponseCode() >= 300) throw new Error('Banque : ' + (out.message || out.error || 'erreur ' + res.getResponseCode()) + (out.detail ? ' (' + JSON.stringify(out.detail) + ')' : ''));
  return out;
}
// La Banque Postale as Enable Banking names it, with how long its consent can last.
function lbp() {
  var bank = (ebFetch('get', '/aspsps?country=FR').aspsps || []).filter(function (a) { return /banque postale/i.test(a.name); })[0];
  if (!bank) throw new Error('La Banque Postale n\'est pas dans la liste d\'Enable Banking.');
  return bank;
}

// Starts the bank's sign-in: the app opens the returned URL; the bank comes back to doGet.
function bankConnect() {
  if (!bankInfo().configured) throw new Error('Banque pas encore configurée : menu Budget → Configurer la banque, dans le Sheets.');
  var bank = lbp(), state = Utilities.getUuid(), secs = Math.min(bank.maximum_consent_validity || 7776000, 15552000);
  CacheService.getScriptCache().put('EB_STATE', state, 1800);
  var res = ebFetch('post', '/auth', { access: { valid_until: new Date(nowMs() + secs * 1000).toISOString() }, aspsp: { name: bank.name, country: 'FR' },
    state: state, redirect_url: WEB_APP_URL, psu_type: 'personal' });
  return { url: res.url };
}

// The bank's redirect after sign-in: the code becomes a session; only the current accounts are kept (not the savings).
function doGet(e) {
  var p = (e && e.parameter) || {}, msg;
  try {
    if (!p.code) throw new Error(p.error_description || p.error || 'rien à faire ici');
    var state = CacheService.getScriptCache().get('EB_STATE');
    if (!state || state !== p.state) throw new Error('le lien a expiré, relance « Connecter la banque » depuis l\'appli');
    CacheService.getScriptCache().remove('EB_STATE');
    var s = ebFetch('post', '/sessions', { code: p.code });
    var current = s.accounts.filter(function (a) { return a.cash_account_type === 'CACC'; });
    props().setProperty('EB_ACCOUNTS', JSON.stringify((current.length ? current : s.accounts).map(function (a) { return a.uid; })));
    props().setProperty('EB_UNTIL', s.access.valid_until);
    dropData();
    msg = 'Banque connectée jusqu\'au ' + Utilities.formatDate(new Date(s.access.valid_until), 'Europe/Paris', 'dd/MM/yyyy') + '. Tu peux revenir dans l\'appli Budget.';
  } catch (err) {
    msg = 'Connexion à la banque impossible : ' + err.message + '.';
  }
  var safe = msg.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  return HtmlService.createHtmlOutput('<div style="font:18px/1.5 system-ui,sans-serif;padding:32px;max-width:480px">' + safe +
    '<p><a href="https://arimet.github.io/budget/" target="_top">Ouvrir l\'appli</a></p></div>')
    .setTitle('Budget du foyer').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Booked and pending lines of the connected accounts since `from` (yyyy-mm-dd), as the bank sends them.
function bankTransactions(from) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('Date invalide.');
  var uids = readJson('EB_ACCOUNTS', []), until = props().getProperty('EB_UNTIL') || '';
  if (!uids.length) throw new Error('Banque pas encore connectée.');
  if (until < new Date(nowMs()).toISOString()) throw new Error('L\'accès à la banque a expiré : reconnecte-la.');
  var out = [];
  uids.forEach(function (uid) {
    var key = '';
    do {
      var r = ebFetch('get', '/accounts/' + encodeURIComponent(uid) + '/transactions?date_from=' + from + (key ? '&continuation_key=' + encodeURIComponent(key) : ''));
      (r.transactions || []).forEach(function (t) {
        out.push({ status: t.status, credit_debit_indicator: t.credit_debit_indicator, transaction_amount: t.transaction_amount,
          booking_date: t.booking_date, value_date: t.value_date, transaction_date: t.transaction_date, remittance_information: t.remittance_information,
          creditor: t.creditor && { name: t.creditor.name }, debtor: t.debtor && { name: t.debtor.name } });
      });
      key = r.continuation_key;
    } while (key);
  });
  return out;
}
