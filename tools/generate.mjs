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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolveClient } from './env.mjs';
import { loadClientPack } from './client-pack.mjs';

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

export function generate(clientEnvValue = resolveClient(), outDir = 'generated') {
  const { slug, client, seed, logoDataUri } = loadClientPack(clientEnvValue);

  const theme = client.theme;
  const htmlValues = {
    META_COPYRIGHT: client.meta.copyright,
    META_DESCRIPTION_INDEX: client.meta.descriptionIndex,
    TITLE_INDEX: client.meta.titleIndex,
    META_DESCRIPTION_ADMIN: client.meta.descriptionAdmin,
    TITLE_ADMIN: client.meta.titleAdmin,
    LOGO_SRC: logoDataUri,
    LOGO_ALT: client.logo.alt,
    ASSISTANT_NAME: client.assistantName,
    CONSENT_TEXT: client.copy.consent,
    NOT_OFFICIAL_INDEX: client.copy.notOfficialIndex,
    NOT_OFFICIAL_ADMIN: client.copy.notOfficialAdmin,
    LOGIN_EMAIL_PLACEHOLDER: client.copy.loginEmailPlaceholder,
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
    THEME_RED: theme.red
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
