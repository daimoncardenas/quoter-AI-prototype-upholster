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
- `npm test` chains 12 suites, all described in `tests/README.md`. `clients.spec.mjs`
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
  - `Store.brand*` + the `Brand` global — the **runtime brand**: the client pack
    is only the DEFAULT look, and the backoffice's "Configuración de estilos"
    saves overrides (company name, logos, the two brand colors, fonts, header
    variant) under `<storageNamespace>brand`. `Brand.apply()` runs from each
    page's `<head>` and repaints both pages with no regeneration. See
    "Runtime brand layer" below.
- `index.html` — the 6-step public wizard. Reads catalogue, furniture types,
  questionnaire options and settings from `Store`; submitting writes a quote + photos.
- `admin.html` — the backoffice. Admins manage everything. The nav's
  "Configuraciones de cotizador" (`data-page="settings"`, renamed from
  "Configuración") holds the quoter's rules, and "Configuración de estilos"
  (`data-page="styles"`, right after it) edits the runtime brand — see the
  white-label section. Admin-only sections also include "Upgrade" (the
  `upgrade` section/page id) — CARDYRAM's own three subscription-plan cards for the
  quoter product, admin-only via the same `Auth.sections`/nav-hiding mechanism as
  every other admin section, with `go()` also refusing to switch to a page a role
  can't see even if something forces the click. That plan copy is static product
  copy (a `PLANS` constant inside `admin.html`), identical for every client — it is
  NOT client data, so it does not live in `clients/*/seed.json` or `Store`. What
  DOES belong in `Store` is which plan the client is currently on
  (`Store.settings().plan`, default `'Essential'` in `DEFAULT_SETTINGS` — same
  default for every client): each card's "Plan actual" label/CTA is derived from
  it, changing plan asks for confirmation (via `askConfirm()`, see "In-app confirm
  dialogs" below) naming the plan and its price — but confirming no longer applies
  the change directly. It creates a `Pendiente` invoice and opens the SIMULATED
  payment modal instead; the plan (or package count) only changes once that
  payment is approved. See "Simulated payment (Bold)" below. Each `PLANS` entry carries two monthly amounts — `price` (cheaper,
  under a yearly contract) and `priceMonthly` (month-to-month) — and an
  accessible `#billingSwitch` radiogroup ("Año"/"Mes", roving tabindex, arrow
  keys move AND activate) at the top of the Planes tab picks which one is
  shown/quoted, via `planPrice(plan, billing)`, the one place that resolves a
  plan+period into a number. The choice is `Store.settings().billing`
  (`'anual'`/`'mensual'`, default `'anual'` in `DEFAULT_SETTINGS`), so it
  persists and is shared with Usage's summary strip; switching it never
  touches `Store.settings().plan`. Each card also shows a caption under the
  price ("con contrato de arrendamiento a 12 meses" / "mes a mes, sin
  contrato") matching the selection, and the radiogroup's accessible name is
  "Modalidad de contratación" (the two button labels stay short: "Año"/"Mes").
  The plan-change confirm() names the same modality inline ("... COP / mes,
  con contrato de arrendamiento a 12 meses?" / "... COP / mes, mes a mes y
  sin contrato?"). The page
  has two ARIA tabs (`#tabPlanes`/`#tabPaquetes`, roving
  tabindex, arrow keys switch): "Planes" is the plan cards above; "Paquetes" is a
  second static constant, `PACKAGES` — one-off/recurring add-ons ("recarga
  funciones sin cambiar de plan") — with its own `Store.settings().packages`
  ({id: count} map, default `{}`), incremented (never reset or toggled) only once
  a purchase's simulated payment is approved (see below), so a package can be
  bought more than once. A third tab, "Facturación" (`#tabFacturacion`/
  `#panelFacturacion`, same roving-tabindex ARIA-tabs pattern), lists every
  invoice newest-first with a "Pagar" button on pending ones — see "Simulated
  payment (Bold)". Right after
  it, "Usage" (`usage` section/page id, admin-only through the same `Auth.sections`
  + `go()` gate) shows the company's CURRENT consumption against its current plan +
  purchased packages, re-rendered on every `go('usage')` so a change made in
  Upgrade shows immediately. Limits have ONE source of truth: numeric
  `PLANS[].quota` (`quotes`, `aiCredits`, `storageGB`, `users`, `locations`,
  `historyMonths`; the plan copy text is never parsed) and per-unit
  `PACKAGES[].adds`, combined only by `effectiveLimits(plan, packages)` (plan quota
  + Σ units × contribution), which the page and `tests/wiring.spec.mjs` both call.
  Usage values are real where the prototype has data: this month's quotes
  (`Store.quotesThisMonth()`), AI credits (`Store.aiCreditsUsed()`), real bytes in
  the photo IndexedDB (`Photos.totalBytes()`, async; base64 records count their
  decoded bytes), active users and active service points. Months are the LOCAL
  calendar month (`Store.monthKey()`): `q.date` is a local `YYYY-MM-DD`, compared by
  its `YYYY-MM` prefix, never `new Date('YYYY-MM-DD')` (UTC midnight). AI-credit
  rule: each completed "Revisar mi información" analysis in `index.html` calls
  `Store.spendAiCredit()`, stored in `settings.usage['YYYY-MM'].aiCredits`; a month
  with no entry starts from that month's quote count (each quote went through one
  analysis). Meter states: under 80% "Dentro del plan", 80–100% "Cerca del límite"
  (`--amber`), over 100% "Excedido por <n>" (`--red`); near/over offer "Comprar
  paquete" (→ Upgrade, Paquetes tab), and "Ver planes" opens the Planes tab.
  Sellers see only dashboard and their own quotes.

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
- A quote's status cycle is 5 values: `Nueva`, `En gestión`, `Cotizada` (non-final —
  `Store.QUOTE_NON_FINAL_STATUSES`, move freely in either direction) and `Aceptada`,
  `Rechazada` (final — `Store.QUOTE_FINAL_STATUSES`, only reachable from `Cotizada`,
  via `Store.setQuoteStatus`, which also stamps `closedAt` as an ISO timestamp). Once
  `closedAt` is set the status is locked for everyone, admin included — enforced in
  `Store.put` itself (it throws if a quote's `status` differs from what's stored and
  `closedAt` is already set), not only by the admin UI hiding the controls, so a
  closed quote can't be reopened through the one write path both pages share. The
  quote detail modal in `admin.html` (`renderQuoteStatus`) asks for confirmation
  before closing and renders no status control at all once closed. Comments
  (`Store.addComment`/`Store.quoteComments`, `{author, authorId, date, text}`) are
  append-only and allowed at any status, closed included, writing straight to
  storage rather than through `Store.put` since they never touch `status`; a quote
  from before comments existed has no `comments` field, which reads as `[]`. The
  dashboard's cycle metrics (funnel, closed %, acceptance rate, average days to
  close, the admin-only per-seller table) are all derived from these two fields —
  see `renderDashboard()`.

## Simulated payment (Bold)

The real product charges through **Bold** (Colombian PSP) via its Payment Link
API: the BACKEND creates the link (`POST https://integrations.api.bold.co/online/link/v1`,
API key in headers, amount taken from the stored invoice — never from anything
the browser sends — expiration in nanoseconds, `callback_url`), the frontend
only redirects, and a webhook signed with `x-bold-signature` (HMAC-SHA256)
confirms payment. This prototype has **no backend and no network**, so it
SIMULATES that flow instead of calling it: no real API call, no API key or
secret (not even a placeholder that looks like one), no Bold branding/logo/
colors, and no lookalike checkout domain — every invoice's `checkoutUrl` is an
obviously fake `simulado://pago/<reference>`. "Bold" appears only as plain
text naming the future provider (e.g. "Pasarela: Bold (simulado)"), never
styled as their brand.

- **`invoices`** — a real `Store` entity (`Store.all('invoices')`, array in
  localStorage under `<storageNamespace>invoices`), seeded EMPTY for every
  client pack (never added to `clients/*/seed.json` — it has no history to
  seed). A record: `{id (e.g. 'FAC-1042', same id style as quotes' 'COT-',
  via Store.nextInvoiceId()), date (local 'YYYY-MM-DD', same convention as
  quotes), concept, kind ('plan'|'package'), target (plan name or package
  id), amount (number), billing ('anual'|'mensual', plan invoices only),
  provider ('BOLD (simulado)'), reference ('QAI-<id>-<timestamp>'),
  checkoutUrl ('simulado://pago/<reference>'), status ('Pendiente'|'Pagada'|
  'Rechazada'), paidAt (ISO timestamp or null)}`.
- **`Store.createInvoice({kind, target, concept, amount, billing?})`** —
  the only way an invoice is created; throws on incomplete data. `amount` MUST
  come from the caller's `PLANS`/`PACKAGES`-sourced number (`planPrice()` for
  plans, `pkg.min` for packages — the same field `packagePriceParts()` reads),
  **never from the DOM or anything the user typed**: in the real integration
  the browser must not be able to change what the backend charges.
- **`Store.settleInvoice(id, 'Pagada'|'Rechazada')`** — the only door that
  settles an invoice. Same lock spirit as quotes: only a `Pendiente` invoice
  can be settled, and a settled one can never change again (throws
  `'Esta factura ya fue procesada; no se puede modificar.'`).
- **The flow**: confirming a plan change or package purchase (still asks via
  `askConfirm()`, same wording as before) calls `Store.createInvoice()` and
  opens the payment modal (`#payModal`), which shows the concept, the amount
  (via `Store.money`), the modality (plans only), the reference, and the
  mandatory label `Simulación de pago · este prototipo no procesa pagos
  reales.`, plus three actions: `Pagar (simular aprobación)`, `Simular
  rechazo`, `Cancelar`. **Pagar** settles the invoice `Pagada` (stamps
  `paidAt`) and ONLY THEN applies the change (`applyInvoiceChange()`: plan
  switch or package-count increment), with toast `Pago aprobado. <concept>
  activado.`. **Simular rechazo** settles it `Rechazada`; nothing else
  changes, toast `Pago rechazado. No se aplicó ningún cambio.`. **Cancelar**
  (or Esc/backdrop) leaves the invoice `Pendiente`, untouched — payable later
  from the Facturación tab's "Pagar" button, which reopens the same modal for
  that invoice id and applies whatever `kind`/`target` it was created with.

## In-app confirm dialogs

Every `confirm()` in `admin.html` (plan change, package purchase, closing a
quote as Aceptada/Rechazada, "Restablecer datos de demo", "Restablecer
estilos por defecto") was replaced by **`askConfirm({title, message,
confirmText?, cancelText?, danger?})`**, an in-app modal — the native
browser dialog can't be styled or color-moded and looks broken next to a
branded backoffice. It reuses the same `.modal-backdrop`/`.modal`/
`.modal-head`/`.modal-body`/`.modal-actions` markup every other modal already
has, so both color modes work with no extra CSS. Returns a `Promise<boolean>`,
so a call site reads like the old code: `if(!await askConfirm({...}))return`.
Accessibility: opens with focus on the action button, traps Tab/Shift+Tab
between `#confirmModal`'s own buttons, Esc and a backdrop click cancel (both
funnel through `closeModals()`, which resolves an open confirm as `false`),
and focus returns to whatever triggered it. Only one confirm can be open at a
time. Destructive actions (`Restablecer...`, closing a quote) use
`confirmText: 'Sí, continuar'` and a `.button.danger` action; the rest use the
default `Confirmar`/`Cancelar`. The confirm can open ON TOP of another modal
already open (e.g. "¿Eliminar este mueble?" while `#furnitureModal` is still
open) — its own ×/Cancel/backdrop dismiss ONLY `#confirmModal`, never every
open backdrop. `index.html` has no `confirm()` calls; its two `alert()` calls
(rare storage/network error paths) were left as native `alert()` — it has no
modal component to reuse and building one for two exceptional messages was
judged out of scope.

## White-label (multi-client) architecture

One codebase, many clients. `CLIENT=<SLUG>` (env var or `.env`, env var wins) selects
which `clients/<slug>/` pack `tools/generate.mjs` renders `index.html`/`admin.html`/
`store.js` against. A generated output only ever contains the **selected** client's
brand and data — never all clients at once, since these prototypes are shared with the
client they're for.

**Pack contract** — `clients/<slug>/` (slug lowercase, e.g. `mediterranea`, `macizo`):

| File | Contents |
|------|----------|
| `client.json` | Brand strings (`displayName`, `shortName`, `assistantName`, `meta.*` titles/descriptions, `copy.*` consent/disclaimer text), `theme` (CSS custom property values, plus `theme.tints`/`theme.rgb` — see below), `fonts` (`{href, headingName, headingFallback, body}` — see below), `logo` (`{file, alt, fileOnLight?}` — see Color modes), `colorMode` (`"normal"` \| `"inverted"`, optional, defaults to `"normal"` — see Color modes), `storageNamespace`, `photosDbName` |
| `seed.json` | Client-specific demo data: `fabrics`, `servicePoints`, `sellers` (`id`, `servicePointIds`, `quotes` count only — identity comes from `shared/demo-users.json`, see below), `quotes`, `settings` (overrides onto `DEFAULT_SETTINGS`, at minimum `senderEmail` and `budgets`) |
| `logo.png` / `logo.svg` | Referenced by `client.json` → `logo.file`; either extension works (`tools/client-pack.mjs` → `MIME_BY_EXT`). A second logo variant can be added for `colorMode: "inverted"` — see Color modes |
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
`{{SENDER_EMAIL_JSON}}`, `{{BUDGETS_JSON}}`, `{{DEMO_PASSWORD_JSON}}`, `{{STORAGE_NS}}`,
`{{BRAND_DEFAULTS_JSON}}`).

**Runtime brand layer (a pack is the DEFAULT look, not a fixed one)** — the
backoffice's admin-only "Configuración de estilos" (`data-page="styles"`) edits the
brand at runtime, and the change applies to BOTH pages with no regeneration. In
production this would be a tenant row plus cloud storage; here it is one
localStorage key, `<storageNamespace>brand`, holding **only what differs** from the
pack. With nothing saved, `Brand.apply()` is a no-op and both pages render exactly
what `tools/generate.mjs` wrote.

- **Tokens are CSS custom properties, never literals.** Every core theme color, all
  49 `theme.tints`, all 5 `theme.rgb` triples and both fonts reach the pages as one
  generated `:root{...}` block per page (`{{THEME_VARS}}`), and the rules read them
  through `var()`: `var(--tint-panel-wash)`, `rgba(var(--rgb-shadow),.15)`,
  `var(--font-heading)`. `theme.tints.<x>` becomes `--tint-<x>`, `theme.rgb.<x>`
  becomes `--rgb-<x>`; three core keys keep both historical spellings
  (`--ink-2`/`--ink2`, `--gold-light`/`--gold2`, `--success`/`--green`) because the
  two pages spell them differently. Never paste a theme literal into a rule again —
  it would be invisible to the runtime brand. The one place `var()` cannot reach is
  the print watermark's SVG data URI, so it lives in `--print-watermark` and
  `Brand.apply()` rewrites its `%23rrggbb` fill.
- **Where it is applied.** `store.js` is loaded from each page's `<head>` (not before
  `</body>`) followed by `<script>Brand.apply()</script>`, so CSS variables, the fonts
  `<link>`, the enabled color mode and `document.title` are correct before first
  paint. Logos and names live in the body, so they are swapped on `DOMContentLoaded`
  while `html[data-brand-pending]` keeps them `visibility:hidden` — no flash of the
  pack's default.
- **Mode embedding.** Every `modes/*.css` is now embedded in both pages
  (`{{MODE_STYLES}}`) as `<style data-color-mode="<name>" media="not all">`, with the
  pack's own mode enabled (`media="all"`); `Brand.apply()` switches the header variant
  by flipping `media`. `normal` has no file, so it means "none enabled". The
  `</style` guard still applies.
- **`data-brand-name`.** Visible brand copy that contains the company name is
  generated with that name wrapped in `<span data-brand-name>` (assistant name,
  consent text), and `alt`/`aria-label`/`<title>` are swapped in JS. **Exception:** the
  demo banner's legal disclaimer stays bound to the PACK name — an admin renaming the
  company must not make "Esta no es la página oficial de …" untruthful. Each template
  carries a comment saying so.
- **What is editable, and gating.** Company name, both logos (`onDark`/`onLight`) and
  the two brand colors on any plan; fonts (an approved Google Fonts list) and the
  header variant from Professional up (`Store.settings().plan`). A downgrade *ignores*
  gated overrides without deleting them. Overriding a color **derives** the rest of the
  palette with one documented sRGB function (`Store.derivePalette`); pack defaults are
  never derived, and `amber`/`red`/`success` never change. The **WCAG contrast guard is a
  UI gate**: the "Configuración de estilos" save button enforces it, while
  `Store.saveBrand()` validates only format (`#rrggbb`, PNG data URI, approved font,
  known variant) — a write from elsewhere (the console, a future caller) renders
  unchecked, unlike plan gating, which `Store.brand()` re-enforces on read. A check that
  fails on a value the admin did NOT touch warns instead of blocking, because some packs
  ship a failing default (Mediterránea's accent is 3.19:1 as text on white). Logos are
  re-encoded through a canvas to PNG (max 800 px —
  which is also what neutralises a script inside an uploaded SVG), and colors must be
  `#rrggbb`. "Restablecer datos de demo" clears the brand overrides too.


**Color modes** — a client-agnostic layer between a pack's palette and the page
surfaces, picked per-pack via `client.json` → `colorMode`. Every mode file lives at
`modes/<mode>.css` (repo root) and EVERY one of them is embedded in both pages via
the `{{MODE_STYLES}}` token, each in its own `<style data-color-mode="<name>">`
right after the main stylesheet, with only the pack's own mode enabled
(`media="all"`; the rest ship inert as `media="not all"`, which is what lets
`Brand.apply()` switch the header variant at runtime) — same specificity, later in the
cascade, so mode rules win over the base stylesheet without `!important` (except
where a rule collides with an inline `style=""`, which always wins on specificity
regardless of source order).
  - **`normal`** (default, `colorMode` omitted or `"normal"`) — today's look,
    unchanged. There is no `modes/normal.css` file; every mode file is still embedded (see the runtime brand layer below), but
    none of them is enabled, so the page renders exactly as it did before color
    modes existed.
  - **`inverted`** (`modes/inverted.css`) — swaps the light/dark relationship:
    surfaces normally painted with the pack's dark brand color (header, sidebars,
    primary buttons, chat bubbles...) become white with brand-colored text/icons;
    surfaces normally white (main content panel, cards, inputs, chat bubbles...)
    become brand-colored with white text/icons. It is **client-agnostic** — only
    the palette custom properties every template already defines in `:root`
    (`var(--ink)`, `var(--accent)`, `var(--line)`, `var(--muted)`...) are used, no
    client's hex is hardcoded. It defines its own role variables at the top
    (`--mode-frame-bg`, `--mode-canvas-bg`, `--mode-card-bg` — the last a
    `color-mix()` of `--accent`/`--ink` chosen to keep white text ≥4.5:1, so
    nested cards stay visually distinguishable from the big ink-colored panels
    behind them — `--mode-on-color`, etc.) and maps them onto the same selectors
    the base stylesheet already paints. `clients/intertelas/` is the first (and so
    far only) pack using it.
  - **Logo**: `logo.file` is the logo for dark/brand surfaces (used in `normal`
    mode, and still used for anything `inverted` mode doesn't touch). `inverted`
    mode paints the header/sidebar/login screen white, so it additionally
    **requires** `logo.fileOnLight` — a logo variant that reads on a white
    background; `tools/client-pack.mjs` throws if `colorMode: "inverted"` and
    `logo.fileOnLight` is missing.
  - **Adding a new mode**: drop `modes/<name>.css` using only the palette
    variables already in `:root` (no client hex), set `colorMode: "<name>"` in a
    pack's `client.json`, and `tools/client-pack.mjs`'s validation (`Available
    modes: ...` on an unknown value) picks it up automatically — no other code
    change needed. `tools/generate.mjs`'s `loadModeCss()` throws if a mode file
    contains `</style` (would break the page).

**Fonts are pack-driven too** — `{{FONTS_HREF}}` (the Google Fonts `<link href>`, full
URL), `{{FONT_BODY}}` (a ready-to-use `font-family` value, e.g. `Montserrat,Arial,sans-serif`)
and `{{FONT_HEADING_NAME}}` / `{{FONT_HEADING_FALLBACK}}` (kept as two separate tokens,
not one, because `admin.html`'s heading declarations pre-date this change and mix
`'quoted'`/`"quoted"`/unquoted family-name styles across call sites — one shared token
would have had to pick a single quoting style and silently rewrite the others). Both
now resolve to the single `--font-heading` custom property, whose DEFAULT value comes
from the pack. `tools/build.mjs`'s `shell()` (the
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
literals (so its rendering is unchanged — the generated bytes now differ, since these
values are emitted as `--tint-*`/`--rgb-*` custom properties instead of being pasted
into rules), and Macizo's are
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
