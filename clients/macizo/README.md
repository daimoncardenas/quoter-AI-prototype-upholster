# Macizo — real design, placeholder demo data

Design/brand taken from macizocolombia.com (2026-09-14): `displayName`, `theme`,
`fonts` and `logo` in `client.json` are real, sourced from the live site with
Playwright (computed styles, loaded fonts, and the actual logo asset).

`seed.json` and the rest of the operational fields (`emailDomain`, `demoPassword`,
`storageNamespace`) are still **invented placeholders** — nobody has provided
Macizo's real users, fabric catalog, sellers, service points or quotes yet.
Everything below that's still open only concerns that demo data.

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
      `client.json` cover the ~45 chrome colors (panel washes, captions on dark
      surfaces, borders, status pills, shadow tints, focus rings, a print-watermark
      SVG fill) that were hardcoded ad hoc in the shared templates instead of being
      pack-driven; see CLAUDE.md's white-label section for the full breakdown.
- [ ] Real email domain and sender email (`client.json` → `copy.loginEmailPlaceholder`,
      `seed.json` → `settings.senderEmail`, and every user/seller email)
- [ ] Real demo password (`client.json` → `demoPassword`)
- [ ] Real fabric catalog, users, sellers, service points, and quotes
      (`seed.json`)

See `../mediterranea/` for a fully populated reference pack, and
`README.md` / `CLAUDE.md` at the repo root for the pack file contract.
