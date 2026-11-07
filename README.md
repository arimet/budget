# Budget du foyer

A household budget app on top of a Google Sheets kept like a paper ledger: one tab per month
("Novembre 2026") with the opening balance in F1, one line per operation, a running balance in column F,
and forecasts (direct debits, salaries, monthly budgets) in bold. The app adds categories, a person and an ID
to each line, and lets you enter expenses from a phone, see the month, planned vs spent and where the money goes.
The Sheets stays the only source of truth: it can still be edited by hand, and the app re-reads it on every open.

## Layout

- `index.html`, `src/`: the web app (Vite, no framework). `calc.js` does the maths, `main.js` the screens, `style.css` the look.
- `apps-script/Code.gs`: the script bound to the Sheets. `doPost` answers the web app in JSON, behind a password;
  it reads and writes the month tabs, creates next month with its forecasts and keeps the running balance right.
- `test/`: `npm test` runs the maths and the script itself against an in-memory spreadsheet (`fake-sheets.mjs`).

## Sheets layout

| Tab | Content |
|---|---|
| `<Mois> <année>` | E1 `Report`, F1 opening balance; row 3 `Date · CB / Chèque · Libellé · Crédit · Débit · Solde · (OK) · Catégorie · Sous-catégorie · Pour · ID`; lines from row 5, bold = forecast |
| Catégories | Catégorie · Sous-catégorie · Emoji · Mots-clés (used to suggest a category) |
| Personnes | Nom (the first one is the default) |
| Charges fixes | forecasts written into each new month (`Mois` empty = every month, else month numbers) |
| Budgets | one bold "what is left to spend" line per category or sub-category, recomputed by the app |
| Corbeille | deleted lines, which the app can put back |

## Run locally

```bash
npm install
npm run mock   # fake spreadsheet in the browser, password "budget"
npm run dev    # real Sheets, real password
npm test
```

## Apps Script API

1. `npx @google/clasp push -f` sends `apps-script/` to the script bound to the Sheets.
2. In the Sheets: menu **Budget → Définir le mot de passe de l'appli** (at least 10 characters). Without it, every call is refused.
3. `npx @google/clasp deploy -i <deployment ID> --description "…"` updates the web app without changing its URL.
   The URL goes in `API_URL` at the top of `src/main.js`.

The web app runs as the Sheets owner and accepts anonymous calls: the password, checked on the server, is the only gate.

## Publish

Every push to `main` builds the site and publishes it on GitHub Pages (`.github/workflows/pages.yml`).
