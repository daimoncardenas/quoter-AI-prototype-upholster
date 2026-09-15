/* Renders the shared templates (index.html, admin.html, store.js) for one
 * client, picked by the CLIENT env var / .env (see tools/env.mjs), into
 * generated/ — a self-contained, still file://-openable copy that both the
 * test suite and `npm run build` consume.
 *
 * generated/ is gitignored on purpose: prototypes are shared with clients,
 * and shipping every client's pack in one output would leak the others'
 * branding and demo data into a file meant for just one of them. Only the
 * SELECTED client's resolved values ever land in generated/ or dist/.
 *
 *   node tools/generate.mjs             -> uses CLIENT from .env / env var
 *   CLIENT=MACIZO node tools/generate.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { resolveClient } from './env.mjs';
import { loadClientPack } from './client-pack.mjs';

const MODES_DIR = 'modes';

function render(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Missing template value for {{${key}}}`);
    return values[key];
  });
}

/* JSON.stringify, not a template literal: this is how client-specific
 * strings and data reach the generated store.js as valid JS/JSON literals,
 * with quoting and escaping handled for free (accented names, apostrophes,
 * emails — anything a client pack might contain). */
const json = v => JSON.stringify(v);

/* camelCase -> SCREAMING_SNAKE_CASE, for turning client.theme.tints/rgb keys
 * into {{TOKEN}} names without hand-maintaining a second copy of every key. */
const screamingSnake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/* #rrggbb -> "r,g,b", for feeding a hex color into an rgba(...) literal. */
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_LIST = /^(\d{1,3}),(\d{1,3}),(\d{1,3})$/;

function hexToRgbList(hex) {
  if (!HEX_COLOR.test(hex)) throw new Error(`Invalid hex color "${hex}" (expected #rgb or #rrggbb)`);
  const h = hex.slice(1);
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/* A malformed color would otherwise render silently as broken CSS, so every
 * theme value is checked before any template is written. */
function validateTheme(theme, slug) {
  const bad = [];
  for (const [key, value] of Object.entries(theme)) {
    if (key === 'tints' || key === 'rgb') continue;
    if (!HEX_COLOR.test(value)) bad.push(`theme.${key} = ${JSON.stringify(value)} (expected #rgb or #rrggbb)`);
  }
  for (const [key, value] of Object.entries(theme.tints || {})) {
    if (!HEX_COLOR.test(value)) bad.push(`theme.tints.${key} = ${JSON.stringify(value)} (expected #rgb or #rrggbb)`);
  }
  for (const [key, value] of Object.entries(theme.rgb || {})) {
    const m = RGB_LIST.exec(value);
    if (!m || m.slice(1).some(c => Number(c) > 255)) bad.push(`theme.rgb.${key} = ${JSON.stringify(value)} (expected "r,g,b" with 0-255)`);
  }
  if (bad.length) throw new Error(`clients/${slug}/client.json has invalid colors:\n  ${bad.join('\n  ')}`);
}

/* Color mode CSS, appended right before the main stylesheet's closing
 * </style> so its rules land last in the cascade and win over the base
 * styles above without needing !important everywhere. "normal" has no file
 * (or an empty one), in which case {{MODE_CSS}} resolves to '' and the page
 * comes out byte-identical to having no hook at all — see modes/ for the
 * available modes (client-pack.mjs already validated client.colorMode is
 * one of them). */
function loadModeCss(colorMode) {
  const cssPath = path.join(MODES_DIR, `${colorMode}.css`);
  if (!existsSync(cssPath)) return '';
  const css = readFileSync(cssPath, 'utf8');
  if (css.includes('</style')) throw new Error(`modes/${colorMode}.css must not contain "</style" (would break the page's HTML)`);
  return css;
}

export function generate(clientEnvValue = resolveClient(), outDir = 'generated') {
  const { slug, client, seed, logoDataUri } = loadClientPack(clientEnvValue);

  const theme = client.theme;
  validateTheme(theme, slug);
  const htmlValues = {
    META_COPYRIGHT: client.meta.copyright,
    META_DESCRIPTION_INDEX: client.meta.descriptionIndex,
    TITLE_INDEX: client.meta.titleIndex,
    META_DESCRIPTION_ADMIN: client.meta.descriptionAdmin,
    TITLE_ADMIN: client.meta.titleAdmin,
    LOGO_SRC: logoDataUri,
    LOGO_ALT: client.logo.alt,
    MODE_CSS: loadModeCss(client.colorMode),
    ASSISTANT_NAME: client.assistantName,
    CONSENT_TEXT: client.copy.consent,
    NOT_OFFICIAL_INDEX: client.copy.notOfficialIndex,
    NOT_OFFICIAL_ADMIN: client.copy.notOfficialAdmin,
    LOGIN_EMAIL_PLACEHOLDER: client.copy.loginEmailPlaceholder,
    FONTS_HREF: client.fonts.href,
    FONT_HEADING_NAME: client.fonts.headingName,
    FONT_HEADING_FALLBACK: client.fonts.headingFallback,
    FONT_BODY: client.fonts.body,
    THEME_INK: theme.ink,
    THEME_INK_2: theme.inkSecondary,
    THEME_ACCENT: theme.accent,
    THEME_GOLD: theme.gold,
    THEME_GOLD_LIGHT: theme.goldLight,
    THEME_CREAM: theme.cream,
    THEME_PAPER: theme.paper,
    THEME_TEXT: theme.text,
    THEME_MUTED: theme.muted,
    THEME_LINE: theme.line,
    THEME_SUCCESS: theme.success,
    THEME_SOFT: theme.soft,
    THEME_AMBER: theme.amber,
    THEME_RED: theme.red,
    /* Colors used only inside rgba(...) literals (box-shadows, focus rings,
     * overlays): the accent and ink-secondary ones are derived here so a
     * pack only ever states its hex color once; the rest (theme.rgb.*) are
     * explicit per-pack "r,g,b" strings — see clients/mediterranea/client.json
     * for why (the original hand-authored shadow tints don't line up with
     * any single current theme color, so deriving them would drift Mediterránea's
     * generated bytes away from the pre-existing design). */
    ACCENT_RGB: hexToRgbList(theme.accent),
    THEME_INK_2_HEX: theme.inkSecondary.replace('#', ''),
    ...Object.fromEntries(Object.entries(theme.rgb).map(([k, v]) => [`RGB_${screamingSnake(k)}`, v])),
    /* Small ad-hoc chrome tints (panel washes, captions on dark surfaces,
     * borders, status pills...) that were hardcoded ad hoc throughout the
     * original design instead of reusing the core palette above — see
     * CLAUDE.md's white-label section for the full rationale. */
    ...Object.fromEntries(Object.entries(theme.tints).map(([k, v]) => [`TINT_${screamingSnake(k)}`, v]))
  };

  const storeValues = {
    STORAGE_NS: client.storageNamespace,
    FABRICS_JSON: json(seed.fabrics),
    USERS_JSON: json(seed.users),
    SERVICE_POINTS_JSON: json(seed.servicePoints),
    SELLERS_JSON: json(seed.sellers),
    QUOTES_JSON: json(seed.quotes),
    SENDER_EMAIL_JSON: json(seed.settings.senderEmail),
    BUDGETS_JSON: json(seed.settings.budgets),
    DEMO_PASSWORD_JSON: json(client.demoPassword)
  };

  mkdirSync(outDir, { recursive: true });

  writeFileSync(`${outDir}/index.html`, render(readFileSync('index.html', 'utf8'), htmlValues));
  writeFileSync(`${outDir}/admin.html`, render(readFileSync('admin.html', 'utf8'), htmlValues));
  writeFileSync(`${outDir}/store.js`, render(readFileSync('store.js', 'utf8'), storeValues));

  console.log(`Generated ${outDir}/ for CLIENT=${clientEnvValue} (pack: clients/${slug}/)`);
  return { slug, client, outDir };
}

// Only run when invoked directly (`node tools/generate.mjs`), not when
// imported by tools/build.mjs or a test's setup step.
if (import.meta.url === `file://${process.argv[1]}`) {
  generate();
}
