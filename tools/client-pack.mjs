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

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

export function listAvailableClients() {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(path.join(CLIENTS_DIR, e.name, 'client.json')))
    .map(e => e.name)
    .sort();
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

  const logoPath = path.join(dir, client.logo.file);
  const ext = path.extname(client.logo.file).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`${dir}: unsupported logo extension "${ext}" (add it to MIME_BY_EXT in tools/client-pack.mjs)`);
  const logoDataUri = `data:${mime};base64,${readFileSync(logoPath).toString('base64')}`;

  const ns = client.storageNamespace;
  const demoPassword = client.demoPassword;
  const users = seed.users.map(u => ({
    ...u,
    hash: authHash(ns, u.id, u.password || demoPassword)
  })).map(({ password, ...u }) => u); // `password` was only ever an input to hashing, never shipped

  return { slug, client, seed: { ...seed, users }, logoDataUri };
}
