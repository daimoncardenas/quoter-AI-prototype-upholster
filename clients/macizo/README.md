# Macizo — real design, placeholder demo data

Design/brand taken from macizocolombia.com (2026-09-14): `displayName`, `theme`,
`fonts` and `logo` in `client.json` are real, sourced from the live site with
Playwright (computed styles, loaded fonts, and the actual logo asset).

The service lines are **product data, not pack data**: they live in
`shared/service-lines.json` (`docs/journeys.md`, §8) and who is available is decided by
the business from the backoffice — a pack never declares lines, and the plan is not a
gate (ver `CLAUDE.md`). Before this pack is shown as Macizo's own, the lines must be
checked against what Macizo actually sells and what each one is called in their own
words.

The demo data is **not** a placeholder to fill: it is the shared seed
(`shared/demo-seed.json`) — the same fake catalogue, service points, sellers and quotes on every
client, on purpose, because the prototype demonstrates functionality and the client you render
must not change anything. `storageNamespace` stays per-pack only so each demo keeps its own
browser storage. Backoffice logins (emails, password) are **not** Macizo's to invent either:
every client shares the same demo users from `shared/demo-users.json`. What is still open for
this pack is its brand (below) and its real sender email.

## TODO before this client ships

- [x] Real display name — "Macizo Colombia" (site `<title>`: "Macizo – Fábrica de
      muebles modernos")
- [x] Real color palette (`client.json` → `theme`) — near-black ink (`#1a1a1a`,
      sampled from the site's own CTA bands), a deep-gold `accent` derived from the
      hero's mustard-gold heading (darkened to clear 4.5:1 contrast against white),
      and `gold`/`goldLight` taken from the logo's literal yellow (`#fef100`)
- [x] Real logo — `logo-light.png`, a light variant derived *from the real raster*
      (https://macizocolombia.com/wp-content/uploads/2026/04/Logo-Macizo-Colombia-nuevo-2026.webp,
      400×150, the only resolution the site serves). Produced with Playwright/canvas
      pixel-by-pixel: near-neutral pixels (the black wordmark + white background)
      became white with alpha = original darkness, so the black text turns solid
      white and the white background turns transparent, antialiasing preserved;
      saturated pixels (the logo's yellow square) were kept as-is; trimmed to the
      content bounding box. The source mark is black text on a transparent/white
      background; every place this pack's logo renders in the prototype (site
      header, admin topbar, and the sealed-delivery gate in `tools/build.mjs`) has
      a dark `--ink` background, so a light variant was produced instead of using
      the source colors directly.
- [x] Real typography (`client.json` → `fonts`) — the site loads only Roboto (no
      serif anywhere), so Macizo uses `Roboto` for both headings and body, unlike
      Mediterránea's Cormorant Garamond + Montserrat pairing.
- [x] No leftover Mediterránea teal anywhere — `theme.tints`/`theme.rgb` in
      `client.json` cover the 54 chrome colors (49 tints + 5 rgb: panel washes,
      captions on dark surfaces, borders, status pills, shadow tints, focus rings)
      that were hardcoded ad hoc in the shared templates instead of being
      pack-driven. The print-watermark SVG fill comes from the core
      `theme.inkSecondary`, not from tints. See CLAUDE.md's white-label section for
      the full breakdown.
- [ ] Real sender email (`client.json` → `senderEmail`) — the backoffice login
      domain/password stay the shared demo ones on purpose, this is only the "from"
      address on quote emails
- [x] Demo data: shared and identical for every client on purpose
      (`shared/demo-seed.json` + `shared/demo-users.json`). Only replace it if this
      stops being a prototype

See `../mediterranea/` for a fully populated reference pack, and
`README.md` / `CLAUDE.md` at the repo root for the pack file contract.
