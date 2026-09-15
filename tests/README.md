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
  the backoffice, and the backoffice settings driving the estimate.

- `entities.spec.mjs` — that every option the cotizador shows comes from the
  store: furniture types with their consumption rules and measurement ranges,
  plus the needs, styles, colours, budgets and coverage multipliers.
- `recommend.spec.mjs` — that the step-5 ranking actually uses the needs,
  style, colour and budget the customer chose, explains each suggestion, and
  never overrides an explicit pick.
- `auth.spec.mjs` — the backoffice login: that the gate actually blocks, that an
  adviser sees only their own requests and none of the administration sections,
  and that passwords are never stored in the clear.
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
backoffice, and deactivating the fabric removes it. Self-documented at its top.
