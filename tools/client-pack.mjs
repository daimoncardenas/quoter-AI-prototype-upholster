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
/* El catálogo de líneas de servicio es del PRODUCTO, no de cada cliente ni de cada paquete:
 * `minPlan` se conserva como dato de qué paquete lo traía, pero el plan no es la puerta (modelo
 * v2, ver CLAUDE.md y docs/paquetes-y-precios.md) — quién está disponible hoy lo decide el
 * negocio desde el backoffice, y el cotizador pregunta solo por esas líneas. Antes el paquete
 * declaraba su propia lista y el plan la recortaba; ese candado ya no existe. */
const SHARED_LINES_FILE = path.join('shared', 'service-lines.json');
/* El seed de demo es UNO para todos los clientes: telas, puntos, vendedores(asignaciones y
 * conteos), cotizaciones y presupuestos son datos falsos con apariencia de reales, iguales en los
 * tres paquetes (es un prototipo: lo que se demuestra es la funcionalidad, y el cliente con el que
 * corras no debe cambiar nada). Lo único que aporta el paquete es su MARCA: `senderEmail` vive en
 * client.json y se inyecta aquí en settings. */
const SHARED_SEED_FILE = path.join('shared', 'demo-seed.json');
/* La composición de paquetes (modelo v2, docs/paquetes-y-precios.md): el Core obligatorio, los
 * paquetes recomendados y el precio de cada servicio. Es DATO del producto — igual para los tres
 * paquetes de marca — y las cifras van marcadas como demo. */
const SHARED_PRESETS_FILE = path.join('shared', 'presets.json');

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

/* The service lines every pack must declare (clients/<slug>/client.json
 * `services`): what the tenant actually sells, and from which plan. The
 * wizard renders one question per enabled line and the quote records the
 * chosen one; see docs/journeys.md for the vocabulary (objeto / técnica /
 * alcance) and why the lines are grouped this way. */
export const SERVICE_JOURNEYS = ['suministro', 'existente', 'nueva', 'proyecto'];
export const SERVICE_PLANS = ['Essential', 'Professional', 'Business'];
/* Lo que una línea puede preguntar MÁS ALLÁ de la tela. Hoy solo «reparación» pregunta por los
 * daños: son suyos, no del cotizador, así que se declaran en la línea y no en el flujo. */
export const SERVICE_ASKS = ['danos', 'insumos', 'limpieza', 'traslado', 'superficie', 'acustica', 'materiales', 'tapizado', 'boq', 'obra'];
/* Cómo se cotiza cada línea. `tela` es el motor de siempre (metros × precio + mano de obra);
 * los otros cuatro son oficios que no se cotizan por metro de rollo. */
export const SERVICE_PRICINGS = ['tela', 'pieza', 'm2', 'fabricacion', 'unidad'];
/* Pasos del cotizador que un motivo puede saltarse: una superficie no tiene «tipo de mueble» y
 * una limpieza no elige tela. Los nombres son los ids del cerebro (`AssistantBrain.STEPS`). */
export const SERVICE_SKIPS = ['furniture', 'measurements', 'preferences', 'recommendation'];
/* Los daños que esa pregunta ofrece, con su valor: el total de la estimación los suma, así que un
 * id desconocido o un valor vacío descuadraría la cotización en silencio. */

/* El paquete ya NO declara líneas ni línea base: el catálogo y el plan de cada línea son del
 * producto (shared/service-lines.json). La validación de que nadie se quede sin oferta vive en
 * validateServiceLines(): el catálogo debe tener al menos una línea `base`. */

/* El catálogo compartido se valida a sí mismo: un id repetido, un plan desconocido o un
 * catálogo sin línea base rompería TODOS los clientes a la vez. */
export function validateServiceLines(lines) {
  const plans = ['base', ...SERVICE_PLANS];
  const bad = [];
  const seen = new Set();
  for (const [i, s] of lines.entries()) {
    const at = `lines[${i}]`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { bad.push(`${at} = ${JSON.stringify(s)} (expected an object)`); continue; }
    const id = typeof s.id === 'string' ? s.id.trim() : '';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) bad.push(`${at}.id = ${JSON.stringify(s.id)} (expected lowercase words separated by dashes)`);
    else if (seen.has(id)) bad.push(`${at}.id = ${JSON.stringify(id)} (duplicated)`);
    else seen.add(id);
    const label = typeof s.label === 'string' ? s.label.trim() : '';
    if (!label || label.length > 48 || label !== s.label) bad.push(`${at}.label = ${JSON.stringify(s.label)} (expected a trimmed, non-empty string of at most 48 characters)`);
    if (!SERVICE_JOURNEYS.includes(s.journey)) bad.push(`${at}.journey = ${JSON.stringify(s.journey)} (expected one of: ${SERVICE_JOURNEYS.join(', ')})`);
    if (!plans.includes(s.minPlan)) bad.push(`${at}.minPlan = ${JSON.stringify(s.minPlan)} (expected one of: ${plans.join(', ')})`);
    if ('hint' in s && (typeof s.hint !== 'string' || s.hint.trim() !== s.hint || s.hint.length > 120)) {
      bad.push(`${at}.hint = ${JSON.stringify(s.hint)} (expected a trimmed string of at most 120 characters)`);
    }
    if (!Number.isFinite(s.laborPct) || s.laborPct < 0 || s.laborPct > 200) {
      bad.push(`${at}.laborPct = ${JSON.stringify(s.laborPct)} (expected a number between 0 and 200: the share of the material this line adds as labour — 0 for material only)`);
    }
    if (!SERVICE_PRICINGS.includes(s.pricing)) {
      bad.push(`${at}.pricing = ${JSON.stringify(s.pricing)} (expected one of: ${SERVICE_PRICINGS.join(', ')})`);
    }
    if ('skips' in s && (!Array.isArray(s.skips) || s.skips.some(k => !SERVICE_SKIPS.includes(k)))) {
      bad.push(`${at}.skips = ${JSON.stringify(s.skips)} (expected an array drawn from: ${SERVICE_SKIPS.join(', ')})`);
    }
    if ('furniturePicker' in s && typeof s.furniturePicker !== 'boolean') {
      bad.push(`${at}.furniturePicker = ${JSON.stringify(s.furniturePicker)} (expected a boolean: false hides the furniture picker in the furniture step and keeps the step for its photos)`);
    }
    if ('asks' in s && (!Array.isArray(s.asks) || s.asks.some(a => !SERVICE_ASKS.includes(a)))) {
      bad.push(`${at}.asks = ${JSON.stringify(s.asks)} (expected an array drawn from: ${SERVICE_ASKS.join(', ')})`);
    }
  }
  if (!lines.some(s => s && s.minPlan === 'base')) bad.push('no line is marked minPlan "base": no client could run on Essential');
  if (bad.length) throw new Error(`shared/service-lines.json has invalid lines:\n  ${bad.join('\n  ')}`);
}

/* Los ítems de la pregunta por los daños (shared/service-lines.json → damageItems). */
export function validateDamageItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error(`${SHARED_LINES_FILE} needs "damageItems": the lines that ask (${SERVICE_ASKS.join(', ')}) quote them`);
  }
  const bad = [];
  const seen = new Set();
  items.forEach((it, i) => {
    const at = `damageItems[${i}]`;
    if (!it || typeof it !== 'object' || Array.isArray(it)) { bad.push(`${at} = ${JSON.stringify(it)} (expected an object)`); return; }
    const id = typeof it.id === 'string' ? it.id.trim() : '';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) bad.push(`${at}.id = ${JSON.stringify(it.id)} (expected lowercase words separated by dashes)`);
    else if (seen.has(id)) bad.push(`${at}.id = ${JSON.stringify(id)} (duplicated)`);
    else seen.add(id);
    const label = typeof it.label === 'string' ? it.label.trim() : '';
    if (!label || label !== it.label || label.length > 48) bad.push(`${at}.label = ${JSON.stringify(it.label)} (expected a trimmed, non-empty string of at most 48 characters)`);
    if (!Number.isFinite(it.cop) || it.cop < 0) bad.push(`${at}.cop = ${JSON.stringify(it.cop)} (expected a number of pesos, zero or more)`);
    if ('hint' in it && (typeof it.hint !== 'string' || it.hint.trim() !== it.hint || it.hint.length > 120)) {
      bad.push(`${at}.hint = ${JSON.stringify(it.hint)} (expected a trimmed string of at most 120 characters)`);
    }
  });
  if (bad.length) throw new Error(`${SHARED_LINES_FILE} has invalid damageItems:\n  ${bad.join('\n  ')}`);
}

/* Las preguntas de un motivo que no va por tela (shared/service-lines.json → asks). Una línea
 * declara `asks:["limpieza"]` y el cotizador pinta ese paso desde aquí: una pregunta sin spec no
 * se dibuja y el paso saldría vacío en silencio. */
export function validateAskSpecs(specs, lines) {
  const asked = new Set();
  for (const s of lines || []) for (const a of (s && s.asks) || []) asked.add(a);
  const bad = [];
  for (const [id, spec] of Object.entries(specs || {})) {
    const at = `asks.${id}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) bad.push(`${at} (expected lowercase words separated by dashes)`);
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) { bad.push(`${at} = ${JSON.stringify(spec)} (expected an object)`); continue; }
    for (const k of ['eyebrow', 'title', 'intro']) {
      if (typeof spec[k] !== 'string' || !spec[k].trim()) bad.push(`${at}.${k} = ${JSON.stringify(spec[k])} (expected non-empty text)`);
    }
    const groups = spec.groups || [];
    if (spec.type === 'rows') {
      if (!Array.isArray(spec.rowFields) || !spec.rowFields.length) bad.push(`${at}.rowFields (expected at least one field)`);
      (spec.rowFields || []).forEach((f, i) => {
        if (!f || typeof f.id !== 'string' || !f.label) bad.push(`${at}.rowFields[${i}] (expected {id,label,type,source?})`);
      });
    } else if (!Array.isArray(groups) || !groups.length) {
      bad.push(`${at} (expected "groups" or "type":"rows")`);
    }
    groups.forEach((g, i) => {
      const gat = `${at}.groups[${i}]`;
      if (!g || typeof g.id !== 'string' || !g.label) { bad.push(`${gat} (expected {id,label,type})`); return; }
      if (!['chips', 'select', 'fields'].includes(g.type)) { bad.push(`${gat}.type = ${JSON.stringify(g.type)} (expected chips, select or fields)`); return; }
      if (g.type === 'fields') {
        if (!Array.isArray(g.fields) || !g.fields.length) bad.push(`${gat}.fields (expected at least one field)`);
        (g.fields || []).forEach((f, j) => {
          if (!f || typeof f.id !== 'string' || !f.label || !Number.isFinite(f.min) || !Number.isFinite(f.max)) {
            bad.push(`${gat}.fields[${j}] (expected {id,label,unit,min,max})`);
          }
        });
      } else if (g.type === 'chips') {
        if (!Array.isArray(g.options) || !g.options.length) bad.push(`${gat}.options (expected at least one option)`);
        (g.options || []).forEach((o, j) => {
          if (!o || typeof o.id !== 'string' || !o.label) bad.push(`${gat}.options[${j}] (expected {id,label})`);
        });
      } else if (typeof g.source !== 'string' || !g.source) {
        bad.push(`${gat}.source (a select needs a rates table to read from)`);
      }
    });
  }
  for (const a of asked) if (!specs || !specs[a]) bad.push(`a line asks for "${a}" but asks.${a} does not exist`);
  /* `danos` y `insumos` se sirven con su propio paso (`#damageStep`, `#insumoStep`), no con el
   * render de `asks`: se validan aparte. Unificarlos queda pendiente. */
  if (asked.has('danos') && !(specs || {}).danos) bad.pop();
  if (asked.has('insumos') && !(specs || {}).insumos) bad.pop();
  if (bad.length) throw new Error(`${SHARED_LINES_FILE} has invalid asks:\n  ${bad.join('\n  ')}`);
}

/* Los textos que ve el cliente, por OFICIO y con la línea como override (ver Store.lineCopy):
 * `copyByEngine` trae el default completo de cada uno de los cinco oficios y `lines[].copy` solo lo
 * que cambia — la etiqueta del artefacto, sobre todo. Faltando un default el cotizador mostraría
 * huecos, así que aquí se exige entero: es el mismo trato que el resto del catálogo. */
export const COPY_KEYS = ['wizardTitle', 'wizardIntro', 'photoInstructions', 'analysisTitle', 'estimateTitle',
  'preliminaryNotice', 'confirmationMessage', 'artifactLabel', 'stepperLabel', 'pendingConfirm'];

export function validateCopyByEngine(byEngine, lines) {
  const bad = [];
  for (const engine of SERVICE_PRICINGS) {
    const c = byEngine[engine];
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      bad.push(`copyByEngine.${engine} (missing: every pricing engine needs its default copy)`);
      continue;
    }
    for (const key of COPY_KEYS) {
      const v = c[key];
      const ok = key === 'pendingConfirm'
        ? Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && x.trim() === x && x.length > 0)
        : typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 160;
      if (!ok) bad.push(`copyByEngine.${engine}.${key} = ${JSON.stringify(v)} (expected ${key === 'pendingConfirm' ? 'a non-empty array of trimmed, non-empty strings' : 'a trimmed, non-empty string of at most 160 characters'})`);
    }
  }
  for (const [i, s] of lines.entries()) {
    if (!s || !SERVICE_PRICINGS.includes(s.pricing)) continue; // validateServiceLines already flags it
    const copy = s.copy || {};
    const unknown = Object.keys(copy).filter(k => !COPY_KEYS.includes(k));
    if (unknown.length) bad.push(`lines[${i}] (${s.id}).copy has unknown key(s): ${unknown.join(', ')} (expected only: ${COPY_KEYS.join(', ')})`);
    const resolved = { ...(byEngine[s.pricing] || {}), ...copy };
    const missing = COPY_KEYS.filter(k => resolved[k] === undefined);
    if (missing.length) bad.push(`lines[${i}] (${s.id}): copy leaves ${missing.join(', ')} unresolved`);
  }
  if (bad.length) throw new Error('service catalogue copy is invalid:\n  - ' + bad.join('\n  - '));
}

/* Las tarifas de los oficios que no se cotizan por metro de rollo (valores demo, sujetos a las
 * anclas de precio): un bloque vacío dejaría la cotización en cero sin error. */
export function validatePricingRates(rates, lines) {
  const bad = [];
  const kinds = new Set((lines || []).map(s => s && s.pricing));
  for (const kind of kinds) {
    if (kind !== 'tela' && !(rates || {})[kind]) bad.push(`pricingRates.${kind} is missing (a line prices as "${kind}")`);
  }
  const block = (name, keys) => {
    const b = (rates || {})[name];
    if (!b) return;
    for (const k of keys) {
      if (!Number.isFinite(b[k]) || b[k] < 0) bad.push(`pricingRates.${name}.${k} = ${JSON.stringify(b[k])} (expected a number, zero or more)`);
    }
  };
  block('m2', ['materialPerM2', 'installPerM2']);
  block('fabricacion', ['fabricacionPct', 'entregaCop']);
  block('unidad', ['instalacionPorUnidad', 'logisticaCop', 'desmontajePorUnidad']);
  const table = (name, key) => {
    const b = (rates || {})[name];
    if (!b || !b[key]) return;
    for (const [id, cop] of Object.entries(b[key])) {
      if (!Number.isFinite(cop) || cop < 0) bad.push(`pricingRates.${name}.${key}.${id} = ${JSON.stringify(cop)} (expected a number, zero or more)`);
    }
  };
  ['pieza', 'fabricacion', 'unidad'].forEach(n => table(n, 'base'));
  const list = (name, key, fields) => {
    const b = (rates || {})[name];
    const arr = b && b[key];
    if (!arr) return;
    if (!Array.isArray(arr) || !arr.length) { bad.push(`pricingRates.${name}.${key} (expected at least one entry)`); return; }
    arr.forEach((o, i) => {
      const at = `pricingRates.${name}.${key}[${i}]`;
      if (!o || typeof o.id !== 'string' || !o.label) bad.push(`${at} (expected {id,label})`);
      for (const f of fields) if (o && o[f] !== undefined && !Number.isFinite(o[f])) bad.push(`${at}.${f} = ${JSON.stringify(o[f])} (expected a number)`);
    });
  };
  list('pieza', 'extras', ['cop', 'pct']);
  list('pieza', 'traslado', ['cop']);
  list('m2', 'papel', ['cop']);
  list('fabricacion', 'maderas', ['pct']);
  list('fabricacion', 'acabados', ['pct']);
  list('fabricacion', 'herrajes', ['cop']);
  list('fabricacion', 'firmezas', ['pct']);
  if (bad.length) throw new Error(`${SHARED_LINES_FILE} has invalid pricingRates:\n  ${bad.join('\n  ')}`);
}

/* Same formula as Auth.hash() in store.js: sha256(NS + userId + ':' + password). */
function authHash(ns, userId, password) {
  return createHash('sha256').update(ns + userId + ':' + password, 'utf8').digest('hex');
}

/* validatePresets(): los paquetes recomendados son la matriz que el producto ya vendía, así que un
 * id inventado o una línea mal escrita tiene que romper en `generate` en vez de quedarse como una
 * casilla que no habilita nada. */
export function validatePresets(presets, lines) {
  if (!presets || typeof presets !== 'object') throw new Error(`${SHARED_PRESETS_FILE} is missing or not an object`);
  const ids = lines.map(l => l.id);
  const bad = [];
  if (!presets.core || typeof presets.core.label !== 'string' || !presets.core.label.trim() || !(presets.core.price >= 0)) {
    bad.push('core needs { label, price >= 0 }');
  }
  if (!Array.isArray(presets.presets) || !presets.presets.length) bad.push('needs at least one preset');
  /* La cuota es lo que hoy diferencia de verdad a los planes: si se pierde al pasar a paquetes, el
   * paquete queda en «cuántos oficios». Se valida aquí para que no pueda faltar en silencio. */
  const QUOTA = ['quotes', 'aiCredits', 'storageGB', 'users', 'locations', 'historyMonths'];
  Object.entries(presets.plans || {}).forEach(([plan, id]) => {
    if (!['Essential', 'Professional', 'Business'].includes(plan)) bad.push(`plans has unknown plan "${plan}"`);
    if (!(presets.presets || []).some(p => p.id === id)) bad.push(`plans["${plan}"] points to unknown preset "${id}"`);
  });
  const vistos = new Set();
  (presets.presets || []).forEach(p => {
    if (!/^[a-z0-9-]+$/.test(String(p.id || ''))) bad.push(`preset id "${p.id}" must be a slug`);
    else if (vistos.has(p.id)) bad.push(`duplicate preset id "${p.id}"`);
    else vistos.add(p.id);
    if (typeof p.label !== 'string' || !p.label.trim()) bad.push(`preset "${p.id}" needs a label`);
    if (!Array.isArray(p.lines) || !p.lines.length) bad.push(`preset "${p.id}" needs lines`);
    (p.lines || []).forEach(id => { if (!ids.includes(id)) bad.push(`preset "${p.id}" lists unknown line "${id}"`); });
    (p.capabilities || []).forEach(id => { if (!(presets.capabilities || []).some(c => c.id === id)) bad.push(`preset "${p.id}" lists unknown capability "${id}"`); });
    QUOTA.forEach(k => { if (!(p.quota && p.quota[k] >= 0)) bad.push(`preset "${p.id}" needs quota.${k} >= 0`); });
  });
  Object.entries(presets.servicePrices || {}).forEach(([id, precio]) => {
    if (!ids.includes(id)) bad.push(`servicePrices has "${id}", which is not a line of the catalogue`);
    if (!(precio >= 0)) bad.push(`servicePrices["${id}"] must be >= 0`);
  });
  /* Cada capacidad lleva su propio valor: en el mercado se activan de a una y sin precio no se
   * pueden vender (el dueño lo pidió explícitamente). */
  const capIds = (presets.capabilities || []).map(c => c.id);
  (presets.capabilities || []).forEach(c => {
    if (!/^[a-z0-9-]+$/.test(String(c.id || ''))) bad.push(`capability id "${c.id}" must be a slug`);
    if (typeof c.label !== 'string' || !c.label.trim()) bad.push(`capability "${c.id}" needs a label`);
    if (!(c.price >= 0)) bad.push(`capability "${c.id}" needs price >= 0`);
  });
  if (bad.length) throw new Error(`${SHARED_PRESETS_FILE} is invalid:\n  ${bad.join('\n  ')}`);
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
  const shared = JSON.parse(readFileSync(SHARED_USERS_FILE, 'utf8'));
  const catalogue = JSON.parse(readFileSync(SHARED_LINES_FILE, 'utf8'));
  const serviceLines = catalogue.lines;
  const copyByEngine = catalogue.copyByEngine || {};
  const damageItems = catalogue.damageItems || [];
  const askSpecs = catalogue.asks || {};
  const pricingRates = catalogue.pricingRates || {};
  const presets = JSON.parse(readFileSync(SHARED_PRESETS_FILE, 'utf8'));
  const sharedSeed = JSON.parse(readFileSync(SHARED_SEED_FILE, 'utf8'));

  validateServiceLines(serviceLines);
  validateCopyByEngine(copyByEngine, serviceLines);
  validateDamageItems(damageItems);
  validateAskSpecs(askSpecs, serviceLines);
  validatePricingRates(pricingRates, serviceLines);
  validatePresets(presets, serviceLines);
  validateAssistant(client.assistant, slug);
  /* La marca sí se declara por paquete: el correo remitente del cotizador. */
  if (typeof client.senderEmail !== 'string' || !client.senderEmail.trim()) {
    throw new Error(`clients/${slug}/client.json needs "senderEmail": the address the cotizador sends from`);
  }
  const seed = { ...sharedSeed, settings: { ...sharedSeed.settings, senderEmail: client.senderEmail } };
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

  /* Sellers are half-shared: their identity (name/email/active) lives in
   * shared/demo-users.json and their coverage/quota in shared/demo-seed.json —
   * the same demo people with the same assignments on every client, because the
   * prototype demonstrates the flow, not a company's roster. Both sides must
   * agree on the same set of ids, or the shared pair could silently ship a
   * seller with no login (or a login with no assignment). */
  const clientSellers = seed.sellers || [];
  const sharedIds = new Set(shared.sellers.map(s => String(s.id)));
  const clientIds = new Set(clientSellers.map(s => String(s.id)));
  const missingInClient = shared.sellers.filter(s => !clientIds.has(String(s.id))).map(s => s.id);
  const missingInShared = clientSellers.filter(s => !sharedIds.has(String(s.id))).map(s => s.id);
  if (missingInClient.length || missingInShared.length) {
    const lines = [];
    if (missingInClient.length) lines.push(`in ${SHARED_USERS_FILE} but missing from ${SHARED_SEED_FILE}'s sellers: ${missingInClient.join(', ')}`);
    if (missingInShared.length) lines.push(`in ${SHARED_SEED_FILE}'s sellers but missing from ${SHARED_USERS_FILE}: ${missingInShared.join(', ')}`);
    throw new Error(`${SHARED_SEED_FILE}'s seller ids don't match ${SHARED_USERS_FILE}'s:\n  ${lines.join('\n  ')}`);
  }
  const clientSellersById = new Map(clientSellers.map(s => [String(s.id), s]));
  const sellers = shared.sellers.map(s => {
    const own = clientSellersById.get(String(s.id));
    return { id: s.id, name: s.name, email: s.email, servicePointIds: own.servicePointIds, active: s.active, quotes: own.quotes };
  });

  /* A seeded quote's `seller` field is a denormalised display label; deriving
   * it here from sellerId + the merged sellers above means it can never drift
   * from the shared name a pack's seed happens to hand-type. */
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
    serviceLines,
    copyByEngine,
    damageItems,
    askSpecs,
    pricingRates,
    presets,
    copy: { ...client.copy, loginEmailPlaceholder: `nombre@${emailDomain}` }
  };

  return { slug, client: mergedClient, seed: { ...seed, users, sellers, quotes }, logoDataUri, logoOnDarkDataUri, logoOnLightDataUri };
}
