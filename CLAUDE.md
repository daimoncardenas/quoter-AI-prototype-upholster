# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Client prototype for **upholster-prototype-quoter** (Colombian upholstery fabric): a public
fabric quote wizard ("cotizador") plus the backoffice that configures it. It is a
proposal piece opened by the client with a double-click, not a deployed app.
`upholster-prototype-quoter` is the shared product name, not a client — the product is
**white-label**: one codebase, one `CLIENT` env var picks which client's brand and demo
data renders. See "White-label (multi-client) architecture" below before assuming
anything about branding, colors, emails, or demo data is fixed — almost none of it is.

## Commands

```
npm install && npx playwright install chromium   # tests only; the prototype has no deps
npm run dev                                       # dev server on 127.0.0.1:3000, re-renders + live reload
npm run generate                                  # renders generated/ for CLIENT (.env / env var)
npm test                                          # generates, then all suites (CLIENT=MEDITERRANEA only, see below)
npm run test:wiring                               # one suite (also: node tests/wiring.spec.mjs)
npm run test:clients                              # white-label pipeline smoke test, every non-Mediterránea pack
npm run build                                     # generates, then writes dist/index.html + dist/admin.html
```

- Run everything from the repo root: suites build `file://` URLs from `process.cwd()`.
- There is no test runner. Each `tests/*.spec.mjs` is a plain Node script that drives
  Chromium via Playwright, prints `PASS`/`FAIL` per check, and exits non-zero on any
  failure. There is no way to run a single check — run its file.
- The main suite (`npm test`) is written against `clients/mediterranea/`'s specific
  fixtures (seller names, quote counts, service points...), so it only passes end to
  end with `CLIENT=MEDITERRANEA` (the `.env.example` default). It reads brand-specific
  values (emails, demo password, storage keys) from the active pack via
  `tests/client.mjs` instead of hardcoding them — see `tests/README.md`.
- No linter, no bundler. To look at the app, `npm run dev` (`tools/dev.mjs`: serves
  `generated/` on `127.0.0.1:$PORT`, default 3000, watches templates, `clients/` and
  `.env`, re-renders and live-reloads; the reload script is injected into HTTP
  responses only, adds nothing visible, and is never written to `generated/`; the
  terminal prints which `CLIENT` is served). Without a
  server, `npm run generate` then open `generated/index.html` or
  `generated/admin.html` directly in Chromium — do
  **not** open the root `index.html`/`admin.html`/`store.js` directly, they are
  templates full of `{{PLACEHOLDER}}` tokens, not renderable pages. Backoffice demo
  logins are **shared across every client** (`shared/demo-users.json`, merged into
  each pack by `tools/client-pack.mjs`) — the admin is always `admin@demo.com` /
  `demo`, whichever `CLIENT` is active.
- `npm test` chains 11 suites, all described in `tests/README.md`. `clients.spec.mjs`
  is intentionally outside `npm test` (see White-label section) and self-documented
  at its top.

## Architecture

Three **template** sources, deliberately zero-dependency and double-clickable once
rendered. Do not bundle, split into modules, or add a framework unless asked.

- `store.js` — the shared data layer. A **classic script** (ES modules are
  CORS-blocked on `file://`) that exposes three globals:
  - `Store` — CRUD over entities (`fabrics`, `furniture`, `sellers`, `servicePoints`,
    `quotes`, `users`) stored as one JSON array each in `localStorage` under
    `<client's storageNamespace><entity>` (`med.v1.<entity>` for Mediterránea), seeded
    from `SEEDS` on first read; `settings()`/`saveSettings()` merge over
    `DEFAULT_SETTINGS`. It also holds the domain logic: the fabric estimate
    (`estimateByComponents`, `quantities`), recommendation ranking (`recommend`),
    seller assignment by service point, and quote ids. `furniture` and most of
    `DEFAULT_SETTINGS` are shared domain config, not client data; `fabrics`,
    `servicePoints`, `quotes`, `senderEmail` and `budgets` come from the active client
    pack (see below); `users` and the demo password come from `shared/demo-users.json`,
    the same for every client; `sellers` merges the two (shared name/email, per-client
    `servicePointIds`) — in the committed *template*
    `store.js` these are still `{{PLACEHOLDER}}` tokens, not literal arrays.
  - `Photos` — image blobs in IndexedDB (client's `photosDbName`, `med-photos` for
    Mediterránea). Records store photo **ids**, never data URLs, because a handful of
    photos would exhaust `localStorage`.
  - `Auth` — the demo backoffice login (salted SHA-256 hashes, session in
    `sessionStorage`, role → visible sections).
- `index.html` — the 6-step public wizard. Reads catalogue, furniture types,
  questionnaire options and settings from `Store`; submitting writes a quote + photos.
- `admin.html` — the backoffice. Admins manage everything; sellers see only dashboard
  and their own quotes.

`index.html` and `admin.html` also carry `{{PLACEHOLDER}}` tokens (brand text, theme
colors, logo) — `tools/generate.mjs` is what turns all three templates into an
openable, brand-resolved set of pages under `generated/`.

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
- Sellers link to the wizard's "Punto de atención" catalogue (the active client's real
  stores, grouped by city) by `servicePointIds`, never by text; the `city` on a
  quote is a refreshable `"{city} · {name}"` label (`retagQuotePoints`, resolved
  for display via `Store.pointName`). A browser with pre-`servicePoints` data
  migrates its sellers' free-text `zones` into ids on first read; the old demo
  placeholder zone names are dropped rather than turned into fake points.
- `settings.budgets` must span the fabric price range, or every fabric is flagged
  over budget.
- Backoffice list fields are chip/tag editors, not comma text. In tests use
  `setTags()` from `tests/helpers.mjs` (and `openAdmin()` to get past the login).

## White-label (multi-client) architecture

One codebase, many clients. `CLIENT=<SLUG>` (env var or `.env`, env var wins) selects
which `clients/<slug>/` pack `tools/generate.mjs` renders `index.html`/`admin.html`/
`store.js` against. A generated output only ever contains the **selected** client's
brand and data — never all clients at once, since these prototypes are shared with the
client they're for.

**Pack contract** — `clients/<slug>/` (slug lowercase, e.g. `mediterranea`, `macizo`):

| File | Contents |
|------|----------|
| `client.json` | Brand strings (`displayName`, `shortName`, `assistantName`, `meta.*` titles/descriptions, `copy.*` consent/disclaimer text), `theme` (CSS custom property values, plus `theme.tints`/`theme.rgb` — see below), `fonts` (`{href, headingName, headingFallback, body}` — see below), `logo` (`{file, alt}`), `storageNamespace`, `photosDbName` |
| `seed.json` | Client-specific demo data: `fabrics`, `servicePoints`, `sellers` (`id`, `servicePointIds`, `quotes` count only — identity comes from `shared/demo-users.json`, see below), `quotes`, `settings` (overrides onto `DEFAULT_SETTINGS`, at minimum `senderEmail` and `budgets`) |
| `logo.png` / `logo.svg` | Referenced by `client.json` → `logo.file`; either extension works (`tools/client-pack.mjs` → `MIME_BY_EXT`) |
| `README.md` | Only for placeholder/incomplete packs (see `clients/macizo/README.md`) — notes what's invented and needs replacing |

**Shared demo logins** — `shared/demo-users.json` (repo root, deliberately *outside* `clients/`,
since `loadClientPack()` enumerates `clients/*`'s subdirectories as client slugs) holds the ONE
set of backoffice demo users every client shares: `demoPassword`, `emailDomain` and `users`
(`{id, name, email, role, sellerId, active}`, no `hash`) plus `sellers` identity
(`{id, name, email, active}`). `tools/client-pack.mjs` merges this into each pack at load time:
`client.demoPassword`, `client.emailDomain` and `client.copy.loginEmailPlaceholder`
(`nombre@<emailDomain>`) are injected onto the returned `client`, and `seed.sellers` becomes
shared identity + the client's own `servicePointIds`/`quotes` count, keyed by seller `id` — both
sides' seller ids must match exactly, or `loadClientPack()` throws listing the mismatches. A
seeded quote's `seller` label is likewise derived from `sellerId` against the merged sellers, so
a client pack's `quotes` never has to hand-type (and can never drift from) the shared seller
name. Login emails and the password are therefore identical for every `CLIENT` — always
`admin@demo.com` / `demo` for the admin, same seller emails (`laura@demo.com`, etc.) everywhere.

**Injection mechanism**: `index.html`, `admin.html` and `store.js` at the repo root are
committed as **templates** containing `{{PLACEHOLDER}}` tokens (brand text, theme CSS
custom properties, logo data URI; `store.js` additionally has `{{FABRICS_JSON}}`,
`{{USERS_JSON}}`, `{{SERVICE_POINTS_JSON}}`, `{{SELLERS_JSON}}`, `{{QUOTES_JSON}}`,
`{{SENDER_EMAIL_JSON}}`, `{{BUDGETS_JSON}}`, `{{DEMO_PASSWORD_JSON}}`, `{{STORAGE_NS}}`).

**Fonts are pack-driven too** — `{{FONTS_HREF}}` (the Google Fonts `<link href>`, full
URL), `{{FONT_BODY}}` (a ready-to-use `font-family` value, e.g. `Montserrat,Arial,sans-serif`)
and `{{FONT_HEADING_NAME}}` / `{{FONT_HEADING_FALLBACK}}` (kept as two separate tokens,
not one, because `admin.html`'s heading declarations pre-date this change and mix
`'quoted'`/`"quoted"`/unquoted family-name styles across call sites — one shared token
would have had to pick a single quoting style and silently rewrite the others, breaking
`clients/mediterranea/`'s byte-for-byte output). `tools/build.mjs`'s `shell()` (the
sealed-delivery gate page, currently disabled) also takes `fonts`/`theme` from the pack
instead of hardcoding Cormorant Garamond/Montserrat and Mediterránea's old teal, so a
re-enabled sealed delivery matches whichever client is active.
**`theme.tints` / `theme.rgb`** — beyond the 14 core palette colors, both templates had
54 more colors hardcoded ad hoc (panel washes, captions on dark surfaces, borders,
status-pill backgrounds, shadow tints, focus rings...), almost all
of them a stale teal/green-blue drifted from Mediterránea's original ink/accent design
that never got swept into the core token set. `theme.tints.<name>` (hex colors,
`{{TINT_SCREAMING_SNAKE_NAME}}`) and `theme.rgb.<name>` (bare `"r,g,b"` strings for use
inside `rgba(...)`, `{{RGB_SCREAMING_SNAKE_NAME}}`) cover every one of them (49 tints +
5 rgb) — see `tools/generate.mjs` for the camelCase→`{{TOKEN}}` conversion. The print
watermark's SVG data-URI fill is NOT one of them: it is `{{THEME_INK_2_HEX}}`, computed
from the core `theme.inkSecondary`. `generate()` validates every `theme`, `theme.tints`
(hex `#rgb`/`#rrggbb`) and `theme.rgb` (`"r,g,b"`, 0-255) value and fails listing
each invalid one. Each is an **explicit**
per-pack value rather than derived from the core palette (e.g. via `color-mix()`),
because the original literals don't line up with any single current theme color closely
enough to derive losslessly — Mediterránea's `tints`/`rgb` values are the exact original
literals (so its generated output stays byte-for-byte identical), and Macizo's are
contrast-checked neutrals (chrome roles) or gold/green tints (accent- or
success-signaling roles). Two similarly hardcoded colors — `theme.rgb.shadowDeep` and
`theme.tints.shellLeadText`/`shellFootText` — are also used directly (as plain JS field
access, no `{{TOKEN}}`) by `tools/build.mjs`'s `shell()`. `theme.amber`/`theme.red`/
`theme.success` (the pre-existing core semantic colors) were left alone — they're
warning/error/success semantics shared across clients, not part of the ink/accent brand
hue, though a couple of pale washes tied to them (e.g. `statusSentBg`) still needed
their own explicit `tints` entry since the wash itself was never wired to the token.

`tools/generate.mjs` does one `String.replace(/\{\{(\w+)\}\}/g, ...)` pass per file,
throwing on any `{{TOKEN}}` left unresolved. User-seed **password hashes are computed
at generate time** (`tools/client-pack.mjs`, Node's `crypto`), never hand-copied — a
hash is `sha256hex(storageNamespace + userId + ':' + password)`, exactly what
`Auth.hash()` computes in the browser, so it can never drift from a pack's
`storageNamespace`/`demoPassword`.

**Scripts**: `npm run dev` serves and live-reloads the render (see Commands).
`npm run generate` renders `generated/` — a
self-contained, still `file://`-openable set of pages, gitignored, for whichever
`CLIENT` resolves. `npm test`'s `pretest` hook runs it first. `npm run build` re-runs
generate, then `tools/build.mjs` inlines `generated/store.js` into each `generated/*.html`
and writes `dist/` (the delivery build — see below). Both commands read `CLIENT`
through `tools/env.mjs` (tiny `.env` parser; a real env var overrides `.env`). An
unknown or missing `CLIENT` fails loudly and lists the available `clients/*/` slugs.

**Adding a client**: copy `clients/mediterranea/` (fully populated reference) to
`clients/<slug>/`, replace every value, run `CLIENT=<SLUG> npm run generate` and open
`generated/index.html`/`admin.html` to eyeball it. No template or tooling change
needed for a new client — only a new pack directory. Backoffice logins come from
`shared/demo-users.json` automatically; a new client's `seed.json` only needs to assign
each shared seller `id` its own `servicePointIds` (and starting `quotes` count) — see
"Shared demo logins" above.

**Mediterránea vs. everyone else**: `clients/mediterranea/` reproduces the *original*
pre-white-label product (brand, colors, logo, catalog, service points) exactly — it's
what the whole `npm test` suite is written against; its backoffice logins are the same
shared demo set every client uses, not part of that original reproduction.
Every other pack (`clients/macizo/`, `clients/intertelas/`, ...) has a **real design**
(`displayName`, `theme`, `fonts`, `logo`) sourced from that client's own live site with
Playwright, but **invented demo data** (`seed.json`'s fabrics/service points/quotes
assignments, `storageNamespace`) — see each pack's own `README.md` before treating
anything else in it as real. `tests/clients.spec.mjs` (`npm run test:clients`) checks
every one of these packs in isolation (looping over `clients/*` minus `mediterranea`),
generating each into its own `generated-<slug>/` so none of them collides with the
main suite's `generated/` or with each other.

## Delivery build

Sources are unprotected on purpose; `tools/build.mjs` (after regenerating
`generated/`) produces the client deliverable by inlining `generated/store.js` into
each `generated/*.html`. It can also wrap each page in AES-256-GCM (PBKDF2-SHA256,
310k iterations, `--key=`, `--ttl=<hours>`), but **that gate is currently disabled at
the owner's request**: the `shell()`/`encrypt()` calls are commented out and `dist/`
ships in the clear. `tests/sealed.spec.mjs` exits 0 at the top for the same reason.
Re-enabling means uncommenting both together. `dist/` is gitignored. The backoffice
login is a demo gate, not security — see project memory.

## Conventions

- UI copy is Spanish (Colombian, `tú`). Code comments mix Spanish and English — match
  the surrounding file.
- Commit messages are Spanish conventional commits (`fix: …`, `feat: …`).
- Work on `main` directly; commit and push when the suite is green.
