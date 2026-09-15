# Intertelas — real design, placeholder demo data

Design/brand taken from intertelas.com (2026-09-15): `displayName`, `theme`,
`fonts` and `logo` in `client.json` are real, sourced from the live site with
Playwright (computed styles, loaded fonts, and the actual logo asset). Intertelas
is a prospective client of CARDYRAM — this is a private demo prototype prepared
for them, not a commissioned build.

`seed.json` and `storageNamespace` are still **invented placeholders** — nobody has
provided Intertelas' real fabric catalog, service points or quotes yet. Backoffice
logins (emails, password) are **not** Intertelas' to invent: every client shares the
same demo users from `shared/demo-users.json`, so there is nothing to replace there.
Everything below that's still open only concerns the fabric/service-point/quote
demo data.

## TODO before this client ships

- [x] Real display name — "Intertelas" (site `<title>`: "Intertelas - Tapicería y
      Restauración de Muebles del Hogar")
- [x] Real color palette (`client.json` → `theme`) — `ink` (`#aa1424`) is the site's
      own dark maroon band (the footer's bottom bar and several CTA backgrounds all
      use this exact color); `accent` (`#dd363a`) is the lighter brand red used for
      every `<h2>` and the "Solicitar una llamada" button (white text, confirmed
      4.5:1 on the live site itself); `gold` is white (there's no secondary
      brand hue — the real footer bar's caption text is literally white on the
      maroon `ink`, same pattern as Mediterránea). `cream` (`#ede8d0`) and `soft`
      (`#f0f0f0`) are sampled from two real section backgrounds (the "40 años"
      contact-info panel and the contact-form panel, respectively).
- [x] Real logo — `logo-light.png`, Intertelas' own official white/transparent
      variant (https://www.intertelas.com/wp-content/uploads/2025/03/logo-blanco-intertelas.png,
      443×79), used as-is — no hand-derivation needed. Confirmed via canvas pixel
      sampling that it's genuinely white artwork (~253,253,253) with real alpha
      transparency (values from 12 to 255 across the mark), i.e. a proper light
      variant the site itself ships for use on dark surfaces — unlike Macizo, whose
      site only had a dark-on-transparent mark and needed one derived by hand. The
      site's dark logo (`logo-intertelas-tapiceria-muebles.png`, 470×84) was used
      only to confirm the brand red (average visible pixel ≈ `#e04347`, matching
      `theme.accent` `#dd363a` within antialiasing).
- [x] Real typography (`client.json` → `fonts`) — the site loads Montserrat 700 for
      every heading and every button (`document.fonts` confirmed `Montserrat 600/700
      normal (loaded)`); body copy falls back to the system font stack, which isn't
      portable to a `<link>` tag, so `fonts.body` also uses Montserrat (matching
      Macizo's single-family approach) rather than inventing a second face the site
      never actually loads for body text.
- [x] No leftover Mediterránea teal or Macizo gold — `theme.tints`/`theme.rgb` in
      `client.json` cover the 54 chrome colors (49 tints + 5 rgb). Pure UI-chrome
      neutrals (panel washes, borders, table heads, etc.) are brand-agnostic grays,
      same values Macizo uses, since they were never hue-tied to begin with. Only
      the roles that ARE hue-tied were recomputed from Intertelas' own palette:
      `bannerBg` (darkened `ink`), `selectedTint` (pale `accent` wash), and the
      success-tied pale greens (`successIconBg`/`successBorder`/`availabilityRing`/
      `statusSentBg`, derived from `theme.success` `#237a00`, not Macizo's green).
      See CLAUDE.md's white-label section for the full breakdown.
- [ ] Real sender email (`seed.json` → `settings.senderEmail`) — the backoffice login
      domain/password stay the shared demo ones on purpose, this is only the "from"
      address on quote emails
- [ ] Real fabric catalog, service points, and quotes (`seed.json`) — sellers'
      identity (name/email/active) is shared across all clients
      (`shared/demo-users.json`); only their `servicePointIds`/`quotes` count in
      `seed.json` is Intertelas' to set. `servicePoints` addresses are explicit
      placeholders (`"Dirección por confirmar"`) — Intertelas' real service-point
      addresses were never provided, so nothing plausible-looking was invented.

## Contrast (WCAG, computed not eyeballed)

| Pair | Ratio |
|------|-------|
| text `#242424` / cream `#ede8d0` | 12.61:1 |
| text `#242424` / white | 15.52:1 |
| muted `#666666` / cream | 4.66:1 |
| muted `#666666` / white | 5.74:1 |
| white / accent `#dd363a` | 4.50:1 |
| gold (white) / ink `#aa1424` | 7.41:1 |
| goldLight `#eac4c8` / ink | 4.67:1 |
| white / ink | 7.41:1 |
| banner caption `#cfcfcf` / bannerBg `#4c0910` | 9.96:1 |
| amber `#96591b` / white | 5.61:1 |
| amber / cream | 4.56:1 |
| red `#a13f3f` / white | 6.37:1 |
| red / cream | 5.17:1 |
| success `#237a00` (as text) / white | 5.45:1 |

All pairs meet WCAG AA (≥4.5:1) for normal text.

See `../macizo/` for another real-design/placeholder-data pack, and
`README.md` / `CLAUDE.md` at the repo root for the pack file contract.
