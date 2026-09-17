/* Loads a client pack (clients/<slug>/) and derives everything generation
 * needs from it: the resolved logo data URI and the seeded users' password
 * hashes (computed here, at generation time, with the exact same formula
 * Auth.hash() uses at runtime — see store.js — so a hand-copied hash can
 * never drift out of sync with a pack's storageNamespace/demoPassword).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const CLIENTS_DIR = 'clients';
const MODES_DIR = 'modes';
/* Every client shares the SAME backoffice demo logins (same emails, same
 * password, same seller identities) — see shared/demo-users.json. It lives
 * outside clients/ on purpose: loadClientPack() enumerates clients/*'s
 * subdirectories as client slugs, so a shared/ folder next to them would
 * otherwise be mistaken for one. */
const SHARED_USERS_FILE = path.join('shared', 'demo-users.json');

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

/* Color modes are the shared, client-agnostic layer between a client's
 * palette and the page surfaces: "normal" (today's look, no CSS needed) and
 * any file dropped in modes/ (e.g. "inverted"). "normal" is always valid
 * even with no modes/normal.css on disk. */
export function listAvailableModes() {
  if (!existsSync(MODES_DIR)) return ['normal'];
  const files = readdirSync(MODES_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.css'))
    .map(e => e.name.slice(0, -'.css'.length));
  return Array.from(new Set(['normal', ...files])).sort();
}

export function listAvailableClients() {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(path.join(CLIENTS_DIR, e.name, 'client.json')))
    .map(e => e.name)
    .sort();
}

/* The assistant presence every pack must declare (clients/<slug>/client.json
 * `assistant`): the DEFAULT the backoffice's "Presencia del asistente" edits.
 * Character ids mirror store.js's ASSISTANT_CHARACTERS; the name limit mirrors
 * Store.ASSISTANT_NAME_MAX. */
export const ASSISTANT_CHARACTERS = ['female', 'male'];
export const ASSISTANT_NAME_MAX = 40;

export function validateAssistant(assistant, slug) {
  const where = `clients/${slug}/client.json`;
  if (!assistant || typeof assistant !== 'object' || Array.isArray(assistant)) {
    throw new Error(`${where} needs an "assistant" object: { enabled, character, name, brandSuit }`);
  }
  const bad = [];
  if (typeof assistant.enabled !== 'boolean') bad.push(`assistant.enabled = ${JSON.stringify(assistant.enabled)} (expected true or false)`);
  if (!ASSISTANT_CHARACTERS.includes(assistant.character)) bad.push(`assistant.character = ${JSON.stringify(assistant.character)} (expected one of: ${ASSISTANT_CHARACTERS.join(', ')})`);
  const name = typeof assistant.name === 'string' ? assistant.name.trim() : '';
  if (!name || name.length > ASSISTANT_NAME_MAX || name !== assistant.name) bad.push(`assistant.name = ${JSON.stringify(assistant.name)} (expected a trimmed, non-empty string of at most ${ASSISTANT_NAME_MAX} characters)`);
  if (typeof assistant.brandSuit !== 'boolean') bad.push(`assistant.brandSuit = ${JSON.stringify(assistant.brandSuit)} (expected true or false)`);
  if (bad.length) throw new Error(`${where} has an invalid assistant:\n  ${bad.join('\n  ')}`);
}

/* Same formula as Auth.hash() in store.js: sha256(NS + userId + ':' + password). */
function authHash(ns, userId, password) {
  return createHash('sha256').update(ns + userId + ':' + password, 'utf8').digest('hex');
}

export function loadClientPack(clientEnvValue) {
  const slug = String(clientEnvValue || '').trim().toLowerCase();
  const dir = path.join(CLIENTS_DIR, slug);
  const available = listAvailableClients();

  if (!slug || !available.includes(slug)) {
    throw new Error(
      `Unknown CLIENT "${clientEnvValue}". Available clients: ${available.length ? available.map(s => s.toUpperCase()).join(', ') : '(none found under clients/)'}`
    );
  }

  const client = JSON.parse(readFileSync(path.join(dir, 'client.json'), 'utf8'));
  const seed = JSON.parse(readFileSync(path.join(dir, 'seed.json'), 'utf8'));
  const shared = JSON.parse(readFileSync(SHARED_USERS_FILE, 'utf8'));

  validateAssistant(client.assistant, slug);
  /* Ley 1581 de 2012: consent covers only the purposes it names, and the
   * assistant reads contact data once the box is checked, so every pack must
   * name that purpose (shown only while the presence is on). */
  if (typeof client.copy?.consentAssistant !== 'string' || !client.copy.consentAssistant.trim()) {
    throw new Error(`clients/${slug}/client.json needs copy.consentAssistant: the consent clause that names the virtual assistant's use of the customer's data`);
  }

  /* colorMode picks which modes/*.css gets appended to the pages (see
   * tools/generate.mjs). Missing means "normal" — today's look, unchanged. */
  const colorMode = client.colorMode || 'normal';
  const availableModes = listAvailableModes();
  if (!availableModes.includes(colorMode)) {
    throw new Error(`clients/${slug}/client.json has unknown colorMode "${colorMode}". Available modes: ${availableModes.join(', ')}`);
  }

  /* Inverted mode paints the header/sidebar/etc. white, so the brand logo
   * needs a variant that reads on a light background — logo.fileOnLight.
   * Normal mode keeps using logo.file (the logo made for the dark/brand
   * surfaces), same as before color modes existed. */
  const logoFile = colorMode === 'inverted' ? client.logo.fileOnLight : client.logo.file;
  if (colorMode === 'inverted' && !logoFile) {
    throw new Error(`clients/${slug}/client.json: colorMode "inverted" requires logo.fileOnLight (a logo variant that reads on a white background)`);
  }
  const toDataUri = file => {
    const ext = path.extname(file).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) throw new Error(`${dir}: unsupported logo extension "${ext}" (add it to MIME_BY_EXT in tools/client-pack.mjs)`);
    return `data:${mime};base64,${readFileSync(path.join(dir, file)).toString('base64')}`;
  };
  // The logo the pack's own color mode paints (what the pages embed today)...
  const logoDataUri = toDataUri(logoFile);
  /* ...and both variants, which become the runtime brand's DEFAULT logos
   * (store.js Store.brandDefaults().logos): onDark for normal mode's dark
   * surfaces, onLight for inverted mode's white ones (null when the pack
   * has none — an admin switching to "Invertido" must then upload one). */
  const logoOnDarkDataUri = client.logo.file ? toDataUri(client.logo.file) : null;
  const logoOnLightDataUri = client.logo.fileOnLight ? toDataUri(client.logo.fileOnLight) : null;

  const ns = client.storageNamespace;
  const demoPassword = shared.demoPassword;
  const users = shared.users.map(u => ({
    ...u,
    hash: authHash(ns, u.id, u.password || demoPassword)
  })).map(({ password, ...u }) => u); // `password` was only ever an input to hashing, never shipped

  /* Sellers are half-shared: their identity (name/email/active) is the same
   * demo person everywhere (shared/demo-users.json), but which service points
   * they cover and how many quotes they've racked up is genuinely per-client.
   * Both sides must agree on the same set of ids, or a client pack could
   * silently ship a seller with no login (or a login with no assignment). */
  const clientSellers = seed.sellers || [];
  const sharedIds = new Set(shared.sellers.map(s => String(s.id)));
  const clientIds = new Set(clientSellers.map(s => String(s.id)));
  const missingInClient = shared.sellers.filter(s => !clientIds.has(String(s.id))).map(s => s.id);
  const missingInShared = clientSellers.filter(s => !sharedIds.has(String(s.id))).map(s => s.id);
  if (missingInClient.length || missingInShared.length) {
    const lines = [];
    if (missingInClient.length) lines.push(`in ${SHARED_USERS_FILE} but missing from clients/${slug}/seed.json's sellers: ${missingInClient.join(', ')}`);
    if (missingInShared.length) lines.push(`in clients/${slug}/seed.json's sellers but missing from ${SHARED_USERS_FILE}: ${missingInShared.join(', ')}`);
    throw new Error(`clients/${slug}/seed.json's seller ids don't match ${SHARED_USERS_FILE}'s:\n  ${lines.join('\n  ')}`);
  }
  const clientSellersById = new Map(clientSellers.map(s => [String(s.id), s]));
  const sellers = shared.sellers.map(s => {
    const own = clientSellersById.get(String(s.id));
    return { id: s.id, name: s.name, email: s.email, servicePointIds: own.servicePointIds, active: s.active, quotes: own.quotes };
  });

  /* A seeded quote's `seller` field is a denormalised display label; deriving
   * it here from sellerId + the merged sellers above means it can never drift
   * from the shared name a client pack's seed.json happens to hand-type. */
  const sellersById = new Map(sellers.map(s => [String(s.id), s]));
  const quotes = (seed.quotes || []).map(q => {
    if (q.sellerId === undefined || q.sellerId === null || q.sellerId === '') return q;
    const seller = sellersById.get(String(q.sellerId));
    return seller ? { ...q, seller: seller.name } : q;
  });

  const emailDomain = shared.emailDomain;
  const mergedClient = {
    ...client,
    colorMode,
    demoPassword,
    emailDomain,
    copy: { ...client.copy, loginEmailPlaceholder: `nombre@${emailDomain}` }
  };

  return { slug, client: mergedClient, seed: { ...seed, users, sellers, quotes }, logoDataUri, logoOnDarkDataUri, logoOnLightDataUri };
}
