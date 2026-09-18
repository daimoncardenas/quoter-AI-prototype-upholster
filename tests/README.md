# Tests

The prototypes are plain HTML with no build step and no runtime dependencies.
These tests are the only thing that needs `npm install`.

```
npm install
npx playwright install chromium   # first run only
npm test
```

`npm test` regenerates `generated/` for the active `CLIENT` first (see the
root `README.md`), then drives the real pages over `file://` from there. The
suite is written against `clients/mediterranea/`'s fixtures (seller names,
quote counts, service points...), so it only passes end to end with
`CLIENT=MEDITERRANEA` — the default in `.env.example`. Brand-specific values
(emails, the demo password, storage keys) are read from the active pack via
`tests/client.mjs` rather than hardcoded, so the suite still runs — just
without matching Mediterránea's fixtures — under a different `CLIENT`.

- `wizard.spec.mjs` — the public cotizador: fabric selection, the quantity
  estimate, step validation, and the furniture radiogroup's keyboard behaviour.
  It also walks a whole quote out the door (Retapizado, so the estimate is not
  just the fabric range) and asserts the record keeps the **estimate the customer
  saw**: same total, its `parts`, its `kind`, `engineVersion`, `calculatedAt` and
  the normalized `inputs` (see `docs/paquetes-y-precios.md` §14). It also pins the
  **copy per motivo** (`Store.lineCopy`: every line reaches the ESTIMATE step, the
  four `tela` lines do not share one artifact name, cleaning never reads about
  fabric) and walks Mantenimiento end to end — the line whose stored `price` used
  to be `null` — checking its estimate step, what it says is pending and the frozen
  `pieza` snapshot that travels with the request. The progress bar is measured at
  8 and 10 rows (`scrollHeight === clientHeight`, Lía's gap unmoved):
  `docs/journeys.md` §10 is the contract behind all of it.
- `review.spec.mjs` — step 4: that the checks report the photo's real
  dimensions and the measurement ranges per furniture type, and never claim to
  have recognised the furniture in the image.
- `wiring.spec.mjs` — the loop between the two pages: a tela created in the
  backoffice reaching the cotizador, a submitted quote (with its photo) reaching
  the backoffice, and the backoffice settings driving the estimate. The submitted
  quote also carries its **service line** — derived from the shared catalogue
  (`shared/service-lines.json`), never a hardcoded name — and the plan enables more than one, so
  the wizard's first step is the line itself (seven steps, the plan named in the note above the
  list). The quote detail is pinned to the FROZEN estimate (a hand-written
  `estimate` with an impossible number, so a live recompute would show something
  else) and to the legacy fallback: a quote without `estimate` still reads by its
  fabric range. Also covers
  the quote status cycle: the three non-final statuses moving freely in either
  direction, closing (Aceptada/Rechazada) only offered from Cotizada and only
  after a confirmation that a dismiss leaves untouched, the status lock holding
  once closed (no controls in the UI, and a direct `Store.put` refused), comments
  allowed at any status including closed and never editable/deletable, and the
  dashboard's funnel/closed/acceptance-rate/average-days/per-seller metrics
  matching what `Store` actually holds. Also covers the "Upgrade" page: exactly
  three plan cards in order, showing the plan's PACKAGE name (Taller / Empresa de
  muebles / Distribuidor — `Store.planLabel()`; the internal
  Essential/Professional/Business must not appear in any card), each price built
  through `Store.money` rather than hand-typed and equal to the price of the same
  package in "Configurar mi plan" (both read the catalog, Año and Mes), the exact Incluye/Límites item
  counts per plan, the integrations note below the cards, and the plan-change
  flow — the current plan (`Store.settings().plan`, default Essential) drives
  each card's label/CTA, a change asks for confirmation (an in-app `askConfirm()`
  modal, not a native `confirm()` — see below) naming the plan and its price.
  Confirming does NOT change the plan directly any more: it creates a
  `Pendiente` invoice (amount sourced from `PLANS`/`planPrice()`, never typed)
  and opens the SIMULATED payment modal (`#payModal`) — see "Simulated
  payment (Bold)" in the root `CLAUDE.md`. The invoice's stored `amount` is the
  catalog value (pre-IVA) and the modal/table show the total to pay with its
  breakdown (`Store.invoiceTotals()`: value + 19% IVA) — the plan cards' "+ IVA"
  says the same. The plan only changes once that
  payment is approved (`#payApprove`), with its own toast
  (`Pago aprobado. <concepto> activado.`) and re-rendered card state,
  surviving a reload; rejecting (`#payReject`) leaves the plan untouched and
  marks the invoice `Rechazada`; cancelling the payment modal (or the confirm
  itself) leaves the invoice `Pendiente` and the plan untouched, payable
  later from the new "Facturación" tab. Also covers the Planes billing-modality switch ("Año"/"Mes",
  radiogroup accessible name "Modalidad de contratación",
  `settings.billing`, default `'anual'`): Año selected by default with the
  three annual prices and "con contrato de arrendamiento a 12 meses",
  clicking Mes swaps to the three monthly prices and "mes a mes, sin
  contrato" with `aria-checked` moving and surviving a reload, arrow keys
  moving AND activating the selection, the plan-change confirm dialog
  quoting whichever period is selected (naming the same modality inline),
  and that switching the period never touches `Store.settings().plan`. Also covers
  Upgrade's two tabs: Planes is selected by default with
  its cards visible and Paquetes hidden, arrow keys switch tabs (and move
  focus), and the Paquetes panel — exactly five package cards in order with
  the exact price text built from `Store.money` (single/range, one-time/`/
  mes`), buying one asks for confirmation naming the package and its price,
  dismissing the confirm creates no invoice and leaves its count at 0 (no
  "Comprados" label). Confirming creates a `Pendiente` invoice (amount =
  `pkg.min`, the same source `packagePriceParts()` reads — never the range
  text or anything typed) and opens the payment modal; the count only
  increments once that payment is approved (a purchase is a recharge — the
  button never disables), with its own toast, and survives a reload. Also
  covers a third tab, "Facturación": invoices listed newest-first with date,
  concept, amount, modality, status pill and reference, a "Pagar" button on
  pending ones re-opening the same payment modal for that invoice (applying
  whichever plan/package it was created for), and the empty state
  ("Todavía no hay facturas.") in a fresh context. Also covers
  `Store.settleInvoice`: refusing to touch an invoice that isn't `Pendiente`,
  whichever status is requested. Separately, `askConfirm()` (the in-app modal
  replacing every native `confirm()` in `admin.html`, exercised here through
  the quote-closing flow, the first site in the suite to use it) is checked
  for opening with focus on the action button, the exact message text
  matching what the old `confirm()` used to say, Esc cancelling, a backdrop
  click cancelling, and focus returning to whatever triggered it — all
  without touching the underlying state. Also covers the "Usage" page in a fresh
  context: five meters in order plus the analytics-history card, default limits
  equal to Essential's through `effectiveLimits()`, each value matching `Store`
  (this month's quotes counted in the test with local dates, AI credits starting
  from that count, active users and points), an over-limit meter showing
  "Excedido por <n>" and "Comprar paquete" (which lands on Upgrade with Paquetes
  selected), "Ver planes" landing on Planes, Professional + one Usuario adicional
  reading `<used> de 4` with "Incluye 1 de paquetes", one wizard analysis spending
  exactly one AI credit, a submitted quote's photos showing up as real IndexedDB
  bytes on the storage meter, that the summary strip's price follows whichever
  billing period is selected on Planes (not always the annual one), and —
  pinned to 21:30 on Sept 30 in Bogotá, already
  October in UTC — all six seeded September quotes still counting.

- `entities.spec.mjs` — that every option the cotizador shows comes from the
  store: furniture types with their consumption rules and measurement ranges,
  plus the needs, styles, colours, budgets and coverage multipliers.
- `recommend.spec.mjs` — that the step-5 ranking actually uses the needs,
  style, colour and budget the customer chose, explains each suggestion, and
  never overrides an explicit pick.
- `auth.spec.mjs` — the backoffice login: that the gate actually blocks, that an
  adviser sees only their own requests and none of the administration sections
  (including the admin-only "Upgrade" plans page and "Usage" consumption page —
  both hidden from the nav and unreachable even by forcing a click on the hidden
  nav button), and that
  passwords are never stored in the clear.
- `photos.spec.mjs` — the 3-to-7 attachment range: that the wizard refuses to
  advance below the minimum, caps at the maximum, lets photos be removed, and
  that every one of them reaches the backoffice. It also covers the quote
  detail's gallery: each photo opens in the `#photoModal` viewer (click, ←/→
  keys, the counter, Esc closing the viewer and NOT the detail) and a photo that
  is gone from this browser keeps its place as a named gap plus the "N de M
  fotografías no están en este navegador" note — the case that used to render a
  broken `<img>` (see the `Photos.get()` contract in the root CLAUDE.md).
- `billing.spec.mjs` — the three fabric quantities (consumo/compra/facturable):
  that sale increments, supplier and order minimums, and a non-reusable
  remainder compute the right amount to bill, and explain why when it differs
  from the raw consumption estimate.
- `components.spec.mjs` — the per-piece consumption model: that a furniture
  type with a cutting template packs its pieces against the chosen fabric's
  roll width, and that types without a template still fall back to the
  furniture's baseline range.
- `points.spec.mjs` — the "Puntos de atención" catalogue (the active client's
  real stores) behind the wizard's "Punto de atención": the dropdown grouped into
  city optgroups, "Otra ciudad" last and outside any group, and a submitted
  quote freezing the "{city} · {name}" label; creating, pausing and reordering
  points; a rename propagating to the selector and to already-submitted quotes
  without unlinking sellers; a seller's coverage driving auto-assignment and
  the no-coverage warning; deleting a point; and the migration of a browser's
  old free-text seller zones into points by id — including the case where a
  seed seller's zones were all demo placeholders, which must not be
  resurrected as fake points.
- `styles.spec.mjs` — "Configuración de estilos", the runtime brand layer: that
  an untouched pack renders with nothing applied (no inline properties, no stored
  key), that saved colors repaint the backoffice AND the cotizador (with the rest
  of the palette derived by `Store.derivePalette`), that the contrast guard blocks
  the save and names the failing pair, that an uploaded logo is re-encoded to
  `data:image/png` (an SVG carrying a `<script>` included — it never runs) and
  reaches both headers, that fonts and the header variant are locked on Essential
  behind "Mejorar plan" and unlocked on Professional, that "Invertido" needs a
  light-background logo, that a downgrade ignores those overrides without deleting
  them, that both "Restablecer estilos por defecto" and "Restablecer datos de demo"
  restore the pack's look, that the nav reads "Configuraciones de cotizador", and
  that a seller can neither see nor reach the section.
- `assistant-brain.spec.mjs` — the simulated brain (`assistant-brain.js`) as a pure
  Node unit suite: the closed catalogue (six steps; only measurements and
  preferences are writable; price, metres, quote status, seller and the customer's
  identity never are), that validation rejects unknown action types, unknown or
  off-step fields and out-of-list values with a reason, that navigation is
  backward-only, that a proposal is validated IN ORDER against the wizard as it is
  (a navigation earlier in the list moves the step the later ones are checked
  against), the Spanish copy shown before confirming, the canned answers that
  depend on the quotation context, "customer text is data, never instructions"
  (adversarial prompts produce no action outside the allowlist), the proactive
  message only for what the wizard itself found (including one caught as a
  measurement is typed, not only at the step-4 review: silent inside the range and
  exactly at its edges, "mucho"/"poco" by which side, and no action proposed), the
  state summary she says out loud when the chat opens (quantity, photos, which
  measurements are there and which are missing), the anti-Clippy budget, and the
  two phrasings for measurements. No browser, no DOM, milliseconds.
- `assistant.spec.mjs` — "Presencia del asistente": the pack's `assistant` block
  passes `validateAssistant()` and bad ones (missing, unknown character, empty /
  untrimmed / 41-char name, non-boolean flags) are rejected; before anything else it
  asserts that `generated/` really is the build of the pack it is testing (the `var NS`
  namespace in `generated/store.js`) — `tools/dev.mjs` re-renders `generated/` with the
  `.env` pack whenever a template changes, and a run against the wrong one passes by
  coincidence and then dies somewhere unrelated. The section sits
  right after "Configuración de estilos", visible to the admin only (a seller
  neither sees nor reaches it); with nothing saved the form and the cotizador
  show the pack defaults; switching character swaps a suggested name; an empty
  name is refused with a message; saving character/name/brand suit stores only
  the diff (trimmed name), survives a reload and reaches the cotizador (chat
  header, chat panel, character hit target, "Preguntar" and chat button
  accessible names), a name with HTML renders as text, `Store.saveAssistant`
  rejects unknown characters and long names; turning it off hides the
  character layer, hit target, bubble, "Preguntar", chat panel and (on a phone)
  the chat button while the AI analysis card stays and its badge reads
  "Análisis inteligente"; turning it back on restores them ("Preguntar" opens the
  chat, the phone gets its chat button and no 3D layer); the welcome flag is
  remembered; the reset (after an `askConfirm()` that a cancel leaves untouched)
  and "Restablecer datos de demo" restore the defaults. Also covers the
  context-and-actions half, on events instead of heuristics: the wizard publishes
  what the customer does as window `aci:event` events (furniture, photos, step,
  measurements, preferences, consent — a click, never a cursor position),
  `ACI.context()` exposes the wizard's state and adds name/email/phone ONLY while
  the consent box is checked (unchecking takes them away again), the chat answers
  from the quotation context and returns ONE grouped proposal ("¿Aplico estos 2
  cambios?") that changes nothing until "Sí" — an accepted change writes through
  the same input+change path as a manual edit, so the cotizador publishes the same
  event — "Mantener" leaves the field as it was, asking for a price change proposes
  nothing, and a FOCUS_FIELD carries the customer to the empty field without asking.
  The context is also made VISIBLE: the first open of the chat says what she has in
  view ("Lo que tengo a la vista: …") once per load, and a measurement the cotizador
  considers out of the ordinary for the furniture is flagged as it is typed — once
  per field while it stays out of range, again if it is corrected and mistyped — with
  the plausible range read from the wizard itself. Field names in the events are the
  assistant's own (`measurements.width`),
  not the inputs' ids. Also covers where the conversation lives: the sidebar's entry
  point reads "Pregúntale a <name>", opening the chat replaces the progress list with
  the conversation (`.journey.chatting`, region relabelled "Conversación con <name>"),
  the panel's rect stays inside the sidebar's and never reaches the wizard's, "←
  Volver al progreso" brings the progress back without a reload, only the latest
  exchange is visible by default while the rest stays in the DOM ("Ver toda la
  conversación" reveals it), and on a phone the panel floats again while the sidebar
  draws nothing (height 0). And that the conversation never covers her: the panel's
  bottom edge stops above her head (`data-heady` + the `--chat-band` cap), it keeps a
  usable height, and she stays in front (fixed, `z-index:3`) of the static panel.
  The presence-side notice is checked there too: it appears as her card floating just
  above her crown (never far from her, never behind her body, never reaching the
  wizard) while the sidebar's intro and progress step aside for those seconds
  (`.journey.noticing`: opacity + `pointer-events:none`, so the relay is instant and
  nothing invisible takes a click), with her name, its "Ver en el chat" action and an
  unread mark on "Pregúntale a"; and it leaves the moment the customer goes on with the
  form.
  The 3D reaction hooks (`#assistantStage`
  `[data-reactions|data-reactions-suppressed|data-reaction|data-glance|data-chair-fabric|data-heady|data-crown|data-seat|data-hip|data-knee|data-foot|data-floor|data-hands|data-feet-flat|data-leg-reach|data-socket|data-sit-z|data-pose|data-sit-phase|data-travel|data-travel-peak|data-render|data-phys|data-pen|data-pen-peak|data-pen-frames|data-pen-phases|data-pen-part|data-pushes|data-push-root|data-shove]`)
  are asserted only when the layer actually starts, and reported as SKIP when it
  doesn't: they cover one reaction per customer action with the next one suppressed
  and counted, that she looks at what the customer touches (a click on a select, not
  the bare cursor / hover) and at the furniture card she just reacted to, that a new
  step clears that glance, and that the click which picked a fabric does not take her
  eyes off the armchair. Also, with the wait shortened through the writable
  `data-idle-ms` hook, that a quiet minute sends her to the armchair (`data-pose`
  goes `standing → to-chair → sitting`) and that she really lands on the seat — the
  distance between `data-hip` and `data-seat` stays within 14 px, and the seat's line
  sits between her crown and the floor, so she is neither floating above the cushion
  nor sunk into it — and that the first mouse move stands her back up, that every
  sign restarts the wait (she is still standing when the first deadline passes), and
  that she does not go while the conversation is open. The paseo itself is measured
  frame by frame through `data-sit-phase` + `data-travel`: every walking leg (both
  trips, four legs) keeps the angle between her facing and her displacement ≤45°
  (0° is walking forward, ±90° a side-step, ±180° the "moonwalk" of the old single
  leg), the return's phases come in order (`rise → turnback1 → walkback1 →
  turnback2 → walkback2 → face`), and — with the collision live — seated and
  undisturbed the resolver does not touch her at all (`data-push-root` empty and
  `data-pen` 0.00 over a 2.5 s sample; it used to push her ~3 px every ~0.5 s, the
  seated sway). Seated, three more things are asserted because all three were wrong in the
  render: that her feet land on the floor LINE (`data-foot` within 15 px of `data-floor`, the
  line the canvas hangs from — the hook publishes the tilted projection, the same one the
  render uses, so a foot placed "on the floor" in world units but drawn 23 px below it fails
  here instead of passing in silence) — and, next to it, that the canvas RESERVES room under
  that line: the canvas's bottom sits `floorRoom` px below it, derived in `place()` from the
  shoe's own forward reach in the model (measured over the whole cycle: the worst frame,
  `settle`, draws 32 px of shoe below the line, so a fixed 14 px left the tip 2 px from the
  edge and DPR rounding made it read as cut); that the SOLES are flat (`data-feet-flat` = each
  foot's tilt against
  the standing reference, ≤10° — the clip leaves a foot dangling with the toe down), and that
  both hands rest on the thighs (`data-hands` = each wrist's distance to its target on the
  thigh's surface, in px; the fixed gesture before the arm IK left 22 px on the left and
  33 px on the right). The legs are a two-bone IK per leg (`data-leg-reach` = how many px
  each one falls short of the floor, 0.0|0.0 here): with one angle for both, the clip's
  asymmetry put the shoe's mesh between two anchors 30-40 px apart and the feet were simply
  not visible — see `CLAUDE.md`. The asset side of that hunt is in
  `assets/assistant/README.md`: the feet mesh carried HALF its weight on the shins, so with
  the ankle bent the shoe collapsed into a stub; the builder now reweights it to 1.0 of its
  own foot bone (weights only — the clips stay valid; the walk's stubs are the retargeting
  that is still parked). Still no pixel assertions, the
  3D layer stays optional by
  design.
- `sealed.spec.mjs` — the encrypted delivery build: since that gate is
  currently disabled at the owner's request, this checks that `dist/` ships in
  the clear rather than encrypted. It tests the packaging, not the prototype.

All drive the real pages over `file://` from `generated/`, which is how the
prototypes are opened.

## `clients.spec.mjs` — white-label pipeline (`npm run test:clients`)

Outside the chain above (and outside `npm test`) because it isn't written against
Mediterránea's fixtures at all: it loops over every pack under `clients/` except
`mediterranea` (currently `macizo`, `intertelas`), generating each into its own
`generated-<slug>/` and checking generation succeeds with no leftover
`{{PLACEHOLDER}}` tokens, that pack's own brand/theme/logo show up, its shared demo
admin can log in, none of the OTHER packs' distinctive strings (display name,
storage namespace, sender email) leak into its output, and the product loop holds
on that pack's own demo data: a fabric, furniture type and budget brackets created
in the backoffice show up in the cotizador, a submitted quote lands in the
backoffice, deactivating the fabric removes it, and that same submitted quote can be
moved to Cotizada, closed as Aceptada (asking for confirmation, then locking) and
carry a visible comment — a short per-pack guard that the status cycle and its
color-mode styling (`modes/inverted.css`, exercised by `clients/intertelas/`) hold
on every pack's own seed, not only Mediterránea's. Also opens the admin-only
"Upgrade" plans page on each pack, switches the billing-period switch to "Mes"
and back (asserting at least one price and the caption actually change — a
short guard that the switch's styling holds under `clients/intertelas/`'s
inverted color mode too), then upgrades from Essential to Professional
(accepting the in-app confirm modal, then approving the simulated-payment
modal it opens), then switches to the Paquetes tab and buys one Sede
adicional (same confirm-then-approve path), asserting `Comprados: 1` — a
short guard that both its styling (same `modes/inverted.css` rules, reading
correctly under `clients/intertelas/`'s inverted color mode, now including the
payment modal too) and its plan-change/package-purchase/payment-approval
flows hold on every pack. Closing a quote as Aceptada also goes through the
same in-app confirm modal here. It also checks the **service lines** the plan
grants each pack (the shared catalogue in `shared/service-lines.json` — the pack declares no
lines at all): Essential enables the two `base` lines, so the line step is the wizard's first
step (active step 0, "Paso 1 de 7", the plan named in the note above the list). Then it turns a
line **off** from the backoffice's checkboxes (`#serviceLines input[data-line]`) and asserts the
cotizador stops offering it, that the choice is only a `disabledLines` entry (nothing deleted),
that turning off the LAST one is refused, and that re-enabling restores it. It then walks the
**per-line flow**: with `Suministro de tela` there is no damage step and "Continuar" lands on
Medidas (`Paso 3 de 7`), while `Reparación y restauración` opens its own step (`Paso 3 de 8`) where
"Continuar" without a single damage marked neither advances nor stays silent; with two damages
marked, `Store.lineEstimate` puts labour at 60 % and sums exactly `+$320.000` into the total, and
the recommendation's price block spells out material, labour and repairs. The chosen **motivo**
follows the customer through every step (`#journeyContext`) and its «cambiar» returns to the line
step. It then walks the **four motivos that don't go through fabric** (plan raised to Business in
that page): each asserts the exact steps it asks for, in order — `Mantenimiento y limpieza` shows
La línea · Tu mueble · Lo que necesita · Cómo llega al taller · Validación · Tu cotización, while
`Muebles a la medida` inserts Medidas BEFORE Materiales y acabados — plus its `pricing` kind and
its total from `Store.lineQuote` (mantenimiento `$320.000`, arquitectónica `$8.400.000`, a la
medida `$628.500`, proyecto `$9.070.000`, con las tarifas demo del catálogo), and that its first
question renders its controls. It then asserts that the **sidebar does not grow with the number of
steps**: with the plan on Business it measures the 7-step motivo (Suministro de tela) and the
9-step one (Muebles a la medida) in the same window and requires the same `.journey` box, no
internal scroll (`scrollHeight === clientHeight`), and an identical `#assistantStage` and canvas —
the band Lía and the armchair are drawn into. Then opens "Usage" and
asserts five progressbars plus the history card, every value well-formed
(`<x> de <y>`), and Sedes reading `de 4` (Professional's 3 + the Sede bought).
It also asserts the **service lines** of each pack: what `Store.services()`
returns (id, label, required plan, enabled) matches the pack's own
`client.json` → `services` filtered by the live journeys and the plan in force,
`Store.servicesEnabled()` narrows to exactly the plans the current plan covers,
and the backoffice's "Configuración de cotizador" page lists those lines with
their lock. Then, on that pack's cotizador, that **step 1 asks "¿Qué quieres
hacer?" only when more than one line is enabled** — with a single line the
question does not exist and the wizard enters that line directly (Macizo's three
lines at Professional show three cards; Intertelas' one line shows none). The
plan is set explicitly in that fresh browser context first, so the check is the
plan gate end to end, not a default.
Then, per pack, it checks the brand layer end to end on that pack's own
design: with nothing saved there is nothing applied, the pack's own defaults pass
their own contrast checks, and a color saved in "Configuración de estilos" reaches
that pack's cotizador (the header in normal mode, the brand canvas in inverted).
Self-documented at its top.
