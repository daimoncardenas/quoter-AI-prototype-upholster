# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Client prototype for **Mediterránea Insumos** (Colombian upholstery fabric): a public
fabric quote wizard ("cotizador") plus the backoffice that configures it. It is a
proposal piece opened by the client with a double-click, not a deployed app.

## Commands

```
npm install && npx playwright install chromium   # tests only; the prototype has no deps
npm test                                          # all suites, stops at the first failing file
npm run test:wiring                               # one suite (also: node tests/wiring.spec.mjs)
npm run build                                     # writes dist/index.html + dist/admin.html
```

- Run everything from the repo root: suites build `file://` URLs from `process.cwd()`.
- There is no test runner. Each `tests/*.spec.mjs` is a plain Node script that drives
  Chromium via Playwright, prints `PASS`/`FAIL` per check, and exits non-zero on any
  failure. There is no way to run a single check — run its file.
- No linter, no bundler, no dev server. To look at the app, open `index.html` or
  `admin.html` directly in Chromium. Backoffice demo password for every seeded account
  is `mediterranea` (e.g. `maria@mediterraneacol.com` = admin).
- `tests/README.md` describes only 7 of the 10 suites; `billing`, `components` and
  `sealed` are missing from it.

## Architecture

Three source files, deliberately zero-dependency and double-clickable. Do not bundle,
split into modules, or add a framework unless asked.

- `store.js` — the shared data layer. A **classic script** (ES modules are
  CORS-blocked on `file://`) that exposes three globals:
  - `Store` — CRUD over entities (`fabrics`, `furniture`, `sellers`, `servicePoints`,
    `quotes`, `users`) stored as one JSON array each in `localStorage` under
    `med.v1.<entity>`, seeded from `SEEDS` on first read; `settings()`/`saveSettings()`
    merge over `DEFAULT_SETTINGS`. It also holds the domain logic: the fabric estimate
    (`estimateByComponents`, `quantities`), recommendation ranking (`recommend`),
    seller assignment by service point, and quote ids.
  - `Photos` — image blobs in IndexedDB (`med-photos`). Records store photo **ids**,
    never data URLs, because a handful of photos would exhaust `localStorage`.
  - `Auth` — the demo backoffice login (salted SHA-256 hashes, session in
    `sessionStorage`, role → visible sections).
- `index.html` — the 6-step public wizard. Reads catalogue, furniture types,
  questionnaire options and settings from `Store`; submitting writes a quote + photos.
- `admin.html` — the backoffice. Admins manage everything; sellers see only dashboard
  and their own quotes.

The two pages communicate **only through the browser storage they share** (Chromium
shares `localStorage`/IndexedDB across `file://` pages). The product claim is that
whatever is typed in the backoffice is exactly what the cotizador shows and quotes —
`tests/wiring.spec.mjs` and `tests/entities.spec.mjs` guard that loop. When adding a
configurable value, wire it end to end and test it from the backoffice side; seed
prices are placeholders, not facts to confirm.

Couplings that are easy to break:
- Quotes link to sellers by `sellerId`; the seller name on a quote is a refreshable
  label (`retagQuotes`). Editing a seller must also move their login account
  (`Auth.syncSellerAccount`).
- Sellers link to the wizard's "Punto de atención" catalogue (Mediterránea's real
  stores, grouped by city) by `servicePointIds`, never by text; the `city` on a
  quote is a refreshable `"{city} · {name}"` label (`retagQuotePoints`, resolved
  for display via `Store.pointName`). A browser with pre-`servicePoints` data
  migrates its sellers' free-text `zones` into ids on first read; the old demo
  placeholder zone names are dropped rather than turned into fake points.
- `settings.budgets` must span the fabric price range, or every fabric is flagged
  over budget.
- Backoffice list fields are chip/tag editors, not comma text. In tests use
  `setTags()` from `tests/helpers.mjs` (and `openAdmin()` to get past the login).

## Delivery build

Sources are unprotected on purpose; `tools/build.mjs` produces the client deliverable
by inlining `store.js` into each page. It can also wrap each page in AES-256-GCM
(PBKDF2-SHA256, 310k iterations, `--key=`, `--ttl=<hours>`), but **that gate is
currently disabled at the owner's request**: the `shell()`/`encrypt()` calls are
commented out and `dist/` ships in the clear. `tests/sealed.spec.mjs` exits 0 at the
top for the same reason. Re-enabling means uncommenting both together. `dist/` is
gitignored. The backoffice login is a demo gate, not security — see project memory.

## Conventions

- UI copy is Spanish (Colombian, `tú`). Code comments mix Spanish and English — match
  the surrounding file.
- Commit messages are Spanish conventional commits (`fix: …`, `feat: …`).
- Work on `main` directly; commit and push when the suite is green.
