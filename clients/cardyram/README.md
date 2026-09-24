# Cardyram — institutional pack (real brand, shared demo data)

This is **CARDYRAM's own brand**, not a client's: the pack that shows the product
as CARDYRAM's, and the one to use when the demo must not look like any customer.
Design/brand taken from cardyram.com (2026-09-21): `displayName`, `theme`,
`fonts` and `logo` in `client.json` are real, read from the site's own CSS
(`:root` → `--bg: #01132b`, `--bg2: #071d3b`, `--panel: #0c2749`, `--panel2:
#103257`, `--text: #f8fbff`, `--muted: #a7b8cb`, `--accent: #3cd5d9`,
`--accent2: #62eff1`, `--accent3: #5d93ff`, `--green: #3cd5d9`, `--red:
#f06d78`), from the computed styles (header `rgba(1,18,41,.88)`, primary CTA = a
cyan→mint→blue gradient with dark navy label `#02142d`, radius 12 px) and from
the logo asset itself.

The service lines are **product data, not pack data**: they live in
`shared/service-lines.json` (`docs/journeys.md`, §8) and who is available is
decided by the business from the backoffice — a pack never declares lines, and
the plan is not a gate (ver `CLAUDE.md`).

The demo data is **not** a placeholder to fill: it is the shared seed
(`shared/demo-seed.json`) — the same fake catalogue, service points, sellers and
quotes on every client, on purpose, because the prototype demonstrates
functionality and the client you render must not change anything.
`storageNamespace` (`cdy.v1.`) stays per-pack only so each demo keeps its own
browser storage. Backoffice logins are the shared demo users
(`shared/demo-users.json`): `admin@demo.com` / `demo`.

## How the site's palette became this pack's theme

- **`ink` = `#001d42`, the logo's own navy.** Measured pixel by pixel in the
  asset: the mark ships a solid navy square (not transparency), so painting the
  header/sidebar/login with the *same* navy is what makes the icon sit on them
  with no visible box. It is the site's navy family (its page background is
  `#01132b`).
- **`gold` = `#3cd5d9`, the site's `--accent`.** In this prototype `--gold` is
  the highlight that lives ON the dark surfaces (active step circle, chat orb,
  help icon) and always carries `--ink` text — exactly the site's own CTA
  pattern (bright cyan surface, dark navy label). Contrast on `ink`: 9.34:1.
  `goldLight` = `#62eff1` (the site's `--accent2`) for the eyebrow and links on
  dark: 12.07:1.
- **`accent` = `#0d7d84`, derived.** `--accent` is a surface/border colour on the
  light workspace and also reads as text on white (notices, badges, the
  backoffice's `.button.gold` with white text), where the site's `#3cd5d9` only
  gives 1.79:1. Darkening that same hue gives **4.90:1 against white** — and
  white on it — so the pack ships a palette the backoffice's own contrast guard
  passes instead of warning about.
- **`red` = `#b8434f` (5.31:1) and `success` = `#0e7a68` (5.25:1), derived.** The
  site maps `--green` onto its cyan, and its `--red` (`#f06d78`, 2.93:1 on white)
  is made for dark surfaces; both semantic colours were darkened to stay legible
  on the light workspace while keeping the brand's cool family.
- **Typography**: `Inter` for headings and body — the only family the site
  loads (`Inter, system-ui, -apple-system, "Segoe UI", sans-serif`).
- **`theme.tints` / `theme.rgb`**: the 54 chrome colours of the shared templates
  (49 tints + 5 rgb) filled with the site's neutrals (`#a7b8cb`, `#bbc6d1`,
  `#9fb2c8`, `#f7fbff`, `#eef4f8`) and cyan/teal washes, with navy-tinted
  shadows (`0,29,66`). The print watermark's SVG fill comes from the core
  `theme.inkSecondary` (`#011127`), not from tints.

## TODO before this pack is used for anything real

- [ ] Real sender email (`client.json` → `senderEmail`) — today
      `cotizaciones@cardyram.example`, a PLACEHOLDER with the reserved
      `.example` domain, because no real sending address exists yet: replace it
      before any send. The backoffice login domain/password stay the shared demo
      ones on purpose; this is only the "from" address on quote emails.
- [x] Real colour palette, typography and logo, sourced from cardyram.com
      (2026-09-21) — logo: `logo.png` is the site's own `apple-touch-icon.png`
      (180×180, the same artwork as its `logo-84.png`, at a resolution that
      stays sharp at the 88 px the login screen draws).
- [x] Copy: the consent text names Cardyram Digital, and the demo banner keeps
      the pack name ("Esta no es la página oficial de Cardyram") — a prototype
      page, not the company's real site.
- [x] Demo data: shared and identical for every client on purpose
      (`shared/demo-seed.json` + `shared/demo-users.json`). Only replace it if
      this stops being a prototype.

See `../mediterranea/` for a fully populated reference pack, and `README.md` /
`CLAUDE.md` at the repo root for the pack file contract.
