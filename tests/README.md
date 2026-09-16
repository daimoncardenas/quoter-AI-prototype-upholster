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
- `review.spec.mjs` — step 4: that the checks report the photo's real
  dimensions and the measurement ranges per furniture type, and never claim to
  have recognised the furniture in the image.
- `wiring.spec.mjs` — the loop between the two pages: a tela created in the
  backoffice reaching the cotizador, a submitted quote (with its photo) reaching
  the backoffice, and the backoffice settings driving the estimate. Also covers
  the quote status cycle: the three non-final statuses moving freely in either
  direction, closing (Aceptada/Rechazada) only offered from Cotizada and only
  after a confirmation that a dismiss leaves untouched, the status lock holding
  once closed (no controls in the UI, and a direct `Store.put` refused), comments
  allowed at any status including closed and never editable/deletable, and the
  dashboard's funnel/closed/acceptance-rate/average-days/per-seller metrics
  matching what `Store` actually holds. Also covers the "Upgrade" page: exactly
  three plan cards in order (Essential/Professional/Business), each price built
  through `Store.money` rather than hand-typed, the exact Incluye/Límites item
  counts per plan, the integrations note below the cards, and the plan-change
  flow — the current plan (`Store.settings().plan`, default Essential) drives
  each card's label/CTA, a change asks for confirmation naming the plan and
  its price, dismissing leaves the plan untouched, and confirming saves the
  new plan, re-renders every card's state, shows a toast, and survives a
  reload. Also covers the Planes billing-period switch ("Año"/"Mes",
  `settings.billing`, default `'anual'`): Año selected by default with the
  three annual prices and "con contrato anual", clicking Mes swaps to the
  three monthly prices and "mes a mes" with `aria-checked` moving and
  surviving a reload, arrow keys moving AND activating the selection, the
  plan-change confirm dialog quoting whichever period is selected, and that
  switching the period never touches `Store.settings().plan`. Also covers
  Upgrade's two tabs: Planes is selected by default with
  its cards visible and Paquetes hidden, arrow keys switch tabs (and move
  focus), and the Paquetes panel — exactly five package cards in order with
  the exact price text built from `Store.money` (single/range, one-time/`/
  mes`), buying one asks for confirmation naming the package and its price,
  dismissing leaves its count at 0 (no "Comprados" label), and confirming
  increments the count (a purchase is a recharge — the button never disables),
  shows a toast, and survives a reload. Also covers the "Usage" page in a fresh
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
  that every one of them reaches the backoffice.
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
(accepting the confirmation dialog), then switches to the Paquetes tab and buys
one Sede adicional (accepting the confirmation dialog too), asserting
`Comprados: 1` — a short guard that both its styling (same `modes/inverted.css`
rules, reading correctly under `clients/intertelas/`'s inverted color mode) and
its plan-change/package-purchase flows hold on every pack. Then opens "Usage" and
asserts five progressbars plus the history card, every value well-formed
(`<x> de <y>`), and Sedes reading `de 4` (Professional's 3 + the Sede bought).
Then, per pack, it checks the brand layer end to end on that pack's own
design: with nothing saved there is nothing applied, the pack's own defaults pass
their own contrast checks, and a color saved in "Configuración de estilos" reaches
that pack's cotizador (the header in normal mode, the brand canvas in inverted).
Self-documented at its top.
