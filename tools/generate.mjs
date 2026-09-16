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
 * A client pack is the brand's DEFAULT look, not a fixed one: every theme
 * color, tint, rgb triple and font reaches the pages as a CSS custom property
 * (one generated :root block per page, {{THEME_VARS}}), never as a literal
 * pasted into a rule, so store.js's Brand.apply() can override any of them
 * at runtime from the backoffice's "Configuración de estilos" without
 * regenerating anything.
 *
 *   node tools/generate.mjs             -> uses CLIENT from .env / env var
 *   CLIENT=MACIZO node tools/generate.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { resolveClient } from './env.mjs';
import { loadClientPack, listAvailableModes } from './client-pack.mjs';

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

/* camelCase -> kebab-case, for turning client.theme keys into CSS custom
 * property names (theme.tints.panelWash -> --tint-panel-wash). store.js's
 * Brand.apply() derives the SAME names with the same rule — keep both in sync. */
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/* Three core palette keys predate this naming rule and are spelled
 * differently in each page (index.html says --ink-2/--gold-light/--success,
 * admin.html says --ink2/--gold2/--green); both spellings are emitted so
 * neither stylesheet (nor modes/*.css's fallback chains) has to change.
 * Mirrored in store.js (BRAND_VAR_ALIASES). */
const CORE_VAR_ALIASES = {
  inkSecondary: ['--ink-2', '--ink2'],
  goldLight: ['--gold-light', '--gold2'],
  success: ['--success', '--green']
};

const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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

/* The pack's palette and fonts as custom property declarations — the
 * DEFAULT values every page rule reads through var(). Core colors keep their
 * historical names (see CORE_VAR_ALIASES), theme.tints.<x> becomes
 * --tint-<x>, theme.rgb.<x> becomes --rgb-<x> (bare "r,g,b", used as
 * rgba(var(--rgb-x),.35)), and the accent also gets --rgb-accent. */
function themeCssVars(theme, fonts) {
  const decl = [];
  for (const [key, value] of Object.entries(theme)) {
    if (key === 'tints' || key === 'rgb') continue;
    for (const name of CORE_VAR_ALIASES[key] || [`--${kebab(key)}`]) decl.push(`${name}:${value}`);
  }
  decl.push(`--rgb-accent:${hexToRgbList(theme.accent)}`);
  for (const [key, value] of Object.entries(theme.tints || {})) decl.push(`--tint-${kebab(key)}:${value}`);
  for (const [key, value] of Object.entries(theme.rgb || {})) decl.push(`--rgb-${kebab(key)}:${value}`);
  decl.push(`--font-body:${fonts.body}`, `--font-heading:"${fonts.headingName}",${fonts.headingFallback}`);
  return decl.join(';') + ';';
}

function loadModeCss(mode) {
  const cssPath = path.join(MODES_DIR, `${mode}.css`);
  if (!existsSync(cssPath)) return '';
  const css = readFileSync(cssPath, 'utf8');
  if (css.includes('</style')) throw new Error(`modes/${mode}.css must not contain "</style" (would break the page's HTML)`);
  return css;
}

/* EVERY color mode file is embedded in both pages, each in its own
 * <style data-color-mode="<name>">, right after the main stylesheet so its
 * rules land last in the cascade and win over the base styles without
 * !important. Only the pack's own mode is enabled (media="all"); the rest
 * ship inert (media="not all") so Brand.apply() can switch the header
 * variant at runtime by flipping media. "normal" has no file: it means
 * "none enabled". */
function modeStyleTags(activeMode) {
  return listAvailableModes()
    .filter(mode => existsSync(path.join(MODES_DIR, `${mode}.css`)))
    .map(mode => `<style data-color-mode="${mode}" media="${mode === activeMode ? 'all' : 'not all'}">\n${loadModeCss(mode)}\n</style>`)
    .join('\n  ');
}

/* The assistant presence's 3D assets (built by tools/build-assistant-assets.mjs)
 * and its module script, embedded into index.html. Embedded, not linked: the
 * wizard opens from file://, where fetch() of a sibling file is blocked, so
 * the page hands these JSON blocks to GLTFLoader.parse(). A "</" inside a JSON
 * string is written as "<\/" (same string for JSON.parse) so no model can close
 * its <script> element early. */
const ASSISTANT_ASSETS = { female: 'lia.gltf', male: 'tomas.gltf', armchair: 'armchair.gltf' };

function assistantModelTags() {
  return Object.entries(ASSISTANT_ASSETS).map(([id, file]) => {
    const p = path.join('assets', 'assistant', file);
    if (!existsSync(p)) throw new Error(`${p} is missing — run: node tools/build-assistant-assets.mjs`);
    const text = readFileSync(p, 'utf8').replace(/<\//g, '<\\/');
    return `<script type="application/json" id="assistantModel-${id}">${text}</script>`;
  }).join('\n');
}

function assistantScriptTag() {
  const js = readFileSync('assistant-presence.js', 'utf8');
  if (/<\/script/i.test(js)) throw new Error('assistant-presence.js must not contain "</script" (would break the page\'s HTML)');
  return `<script type="module">\n${js}\n</script>`;
}

/* Visible brand copy that contains the company name gets that name wrapped
 * in <span data-brand-name>, so Brand.apply() can swap in the name saved in
 * the backoffice. displayName is tried first, then shortName (e.g. Macizo's
 * "Asistente Macizo"). The demo banner's legal disclaimer deliberately does
 * NOT go through here — see the comment next to it in each template. */
function brandNameHtml(text, client) {
  const name = [client.displayName, client.shortName].find(n => n && text.includes(n));
  if (!name) return escHtml(text);
  return text.split(name).map(escHtml).join(`<span data-brand-name>${escHtml(name)}</span>`);
}

export function generate(clientEnvValue = resolveClient(), outDir = 'generated') {
  const { slug, client, seed, logoDataUri, logoOnDarkDataUri, logoOnLightDataUri } = loadClientPack(clientEnvValue);

  const theme = client.theme;
  validateTheme(theme, slug);
  const htmlValues = {
    META_COPYRIGHT: client.meta.copyright,
    META_DESCRIPTION_INDEX: client.meta.descriptionIndex,
    TITLE_INDEX: client.meta.titleIndex,
    META_DESCRIPTION_ADMIN: client.meta.descriptionAdmin,
    TITLE_ADMIN: client.meta.titleAdmin,
    LOGO_SRC: logoDataUri,
    /* Which Store.brand().logos slot the embedded logo is: inverted mode
     * paints the header white, so it shows the on-light variant. */
    LOGO_SLOT: client.colorMode === 'inverted' ? 'onLight' : 'onDark',
    LOGO_ALT: client.logo.alt,
    MODE_STYLES: modeStyleTags(client.colorMode),
    ASSISTANT_NAME: client.assistantName,
    ASSISTANT_NAME_HTML: brandNameHtml(client.assistantName, client),
    CONSENT_HTML: brandNameHtml(client.copy.consent, client),
    /* The presence's DEFAULT name, for the first paint; Assistant.apply()
     * swaps in the one saved in the backoffice. */
    ASSISTANT_DEFAULT_NAME: escHtml(client.assistant.name),
    ASSISTANT_MODELS: assistantModelTags(),
    ASSISTANT_SCRIPT: assistantScriptTag(),
    NOT_OFFICIAL_INDEX: client.copy.notOfficialIndex,
    NOT_OFFICIAL_ADMIN: client.copy.notOfficialAdmin,
    LOGIN_EMAIL_PLACEHOLDER: client.copy.loginEmailPlaceholder,
    FONTS_HREF: client.fonts.href,
    THEME_VARS: themeCssVars(theme, client.fonts),
    /* The print watermark is an SVG data URI, where var() cannot reach, so
     * its fill is still a generate-time literal (inside --print-watermark in
     * each page's :root); Brand.apply() rewrites that property when an
     * override changes inkSecondary. */
    THEME_INK_2_HEX: theme.inkSecondary.replace('#', '')
  };

  /* The pack's look as the runtime brand's defaults (Store.brandDefaults()).
   * Overrides saved in the backoffice are merged over these in the browser;
   * with none saved the pages render exactly as the pack describes. */
  const brandDefaults = {
    companyName: client.displayName,
    shortName: client.shortName,
    colors: theme,
    fonts: client.fonts,
    logos: { onDark: logoOnDarkDataUri, onLight: logoOnLightDataUri },
    headerVariant: client.colorMode
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
    DEMO_PASSWORD_JSON: json(client.demoPassword),
    BRAND_DEFAULTS_JSON: json(brandDefaults),
    ASSISTANT_DEFAULTS_JSON: json(client.assistant)
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
