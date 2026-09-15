/* Tiny .env parser — no dependency pulled in just to read one variable.
 *
 * Reads KEY=VALUE lines from .env (missing file is fine: CLIENT can still
 * come from the real process environment). A value already set in
 * process.env wins over the same key in .env, matching how every other .env
 * loader behaves — the shell's environment is the more specific override.
 */
import { readFileSync } from 'node:fs';

export function loadDotEnv(path = '.env') {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }

  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/* Resolves which client to build for. process.env.CLIENT overrides .env,
 * which is the usual precedence: the shell invocation is more specific than
 * the committed default. */
export function resolveClient() {
  const fromDotEnv = loadDotEnv();
  const client = process.env.CLIENT || fromDotEnv.CLIENT;
  if (!client) {
    throw new Error('CLIENT is not set. Set it in .env (see .env.example) or pass it as an environment variable, e.g. CLIENT=MEDITERRANEA npm run generate');
  }
  return client;
}
