/* Resolves the same client pack tools/generate.mjs used to produce
 * generated/ — CLIENT from .env / the process environment — so tests read
 * expected brand strings, emails, the demo password and storage keys from
 * the pack instead of hardcoding one client's values.
 *
 * The full spec suite is written against clients/mediterranea/ (that pack
 * reproduces the ORIGINAL demo data byte-for-byte), so `npm test` only
 * passes end to end with CLIENT=MEDITERRANEA. Business-specific fixtures in
 * the specs (seller names, quote counts, service points...) stay literal —
 * only what varies by client (brand text, email domain, password, storage
 * namespace) is read from here.
 */
import { resolveClient } from '../tools/env.mjs';
import { loadClientPack } from '../tools/client-pack.mjs';

export const { slug, client, seed } = loadClientPack(resolveClient());

export const ADMIN_EMAIL = seed.users.find(u => u.role === 'admin').email;
export const ADMIN_NAME = seed.users.find(u => u.role === 'admin').name;
export const DEMO_PASSWORD = client.demoPassword;
export const SESSION_KEY = client.storageNamespace + 'session';
export const PHOTOS_DB = client.photosDbName;

/* Look up a seeded user's email by id, e.g. userEmail('u-laura'). */
export function userEmail(id) {
  const u = seed.users.find(x => x.id === id);
  if (!u) throw new Error(`No seeded user with id "${id}" in shared/demo-users.json`);
  return u.email;
}

/* Builds an address on this client's domain for test-only accounts that the
 * seed doesn't define (e.g. a seller created during a test). */
export function emailFor(localPart) {
  return `${localPart}@${client.emailDomain}`;
}
