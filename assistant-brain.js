/* Assistant brain — SIMULATED. No AI, no network: deterministic rules over the
 * quotation context, standing in for the LLM that lives in the product repo.
 *
 * Not a template: tools/generate.mjs inlines this file into index.html as a
 * classic <script> (before the wizard's own script). It is also plain enough to
 * load from Node (tests/assistant-brain.spec.mjs requires it), so everything
 * here is pure: context and env in, messages and ACTIONS out. It never touches
 * the DOM and never executes anything — the page's adapter (window.ACI in
 * index.html) does, and only what validateActions() accepts.
 *
 * Permission levels:
 *   observe  — read the context the wizard publishes (no confirmation)
 *   explain  — answer questions (no confirmation)
 *   propose  — return actions (FOCUS_FIELD runs without confirmation; SET_FIELD
 *              and NAVIGATE_TO_STEP need the customer's explicit yes)
 *   execute  — the adapter applies an approved action through the SAME controls
 *              and events a manual edit uses. The assistant has no extra power.
 *
 * Customer text is data, never instructions: it can only select among the
 * responses and allowlisted actions below. */
(function (root) {
  'use strict';

  const STEPS = [
    { n: 0, id: 'SERVICE', name: 'Tu línea de servicio' },
    { n: 1, id: 'FURNITURE', name: 'Tu mueble' },
    { n: 2, id: 'DAMAGE', name: '¿Qué hay que reparar?' },
    { n: 3, id: 'LIMPIEZA', name: '¿Qué hay que hacerle?' },
    { n: 4, id: 'TRASLADO', name: '¿Vamos por él o lo traes?' },
    { n: 5, id: 'SUPERFICIE', name: 'La superficie' },
    { n: 6, id: 'ACUSTICA', name: 'Cómo se monta' },
    { n: 7, id: 'BOQ', name: 'Qué necesita el proyecto' },
    { n: 8, id: 'OBRA', name: 'La obra' },
    { n: 9, id: 'MEASUREMENTS', name: 'Medidas' },
    { n: 10, id: 'MATERIALES', name: 'Materiales y acabados' },
    { n: 11, id: 'TAPIZADO', name: 'El tapizado' },
    { n: 12, id: 'PREFERENCES', name: 'Preferencias' },
    { n: 13, id: 'REVIEW', name: 'Validación' },
    { n: 14, id: 'RECOMMENDATION', name: 'Recomendación' },
    { n: 15, id: 'CONTACT', name: 'Tu cotización' },
    /* El paso de la estimación es de TODOS los motivos (ver docs/journeys.md §10): va después de las
     * preguntas y antes del contacto, y esta tabla es la que lo nombra en el móvil y en los eventos. */
    { n: 16, id: 'ESTIMATE', name: 'Estimación' }
  ];
  /* Los pasos se NOMBRAN por su id, nunca por un número escrito a mano: con los tres pasos
   * opcionales (la línea, los daños y los que pide cada motivo) la numeración corre, y un
   * `step > 3` suelto deja de significar «después de Medidas» sin que nada avise. */
  const nDe = id => (STEPS.find(s => s.id === id) || {}).n;
  const MEDIDAS = nDe('MEASUREMENTS'), PREFERENCIAS = nDe('PREFERENCES'), REVISION = nDe('REVIEW'), CONTACTO = nDe('CONTACT');

  /* Every field the assistant may name. `step` is where its control lives.
   * `set` is the value kind SET_FIELD accepts; a field without `set` can only
   * be focused. Anything not listed here does not exist for the assistant. */
  const FIELDS = {
    'furniture.type': { step: 1, label: 'Tipo de mueble' },
    'photos': { step: 1, label: 'Fotos del mueble' },
    'measurements.width': { step: MEDIDAS, label: 'Ancho total', set: 'integer', unit: 'cm' },
    'measurements.height': { step: MEDIDAS, label: 'Alto total', set: 'integer', unit: 'cm' },
    'measurements.depth': { step: MEDIDAS, label: 'Profundidad', set: 'integer', unit: 'cm' },
    'measurements.quantity': { step: MEDIDAS, label: 'Cantidad', set: 'integer' },
    'measurements.coverage': { step: MEDIDAS, label: 'Qué se tapiza', set: 'enum' },
    'preferences.pets': { step: PREFERENCIAS, label: 'Mascotas en casa', set: 'boolean' },
    'preferences.style': { step: PREFERENCIAS, label: 'Estilo', set: 'enum' },
    'preferences.color': { step: PREFERENCIAS, label: 'Gama de color', set: 'enum' },
    'analysis': { step: REVISION, label: 'Revisar mi información' },
    'contact.fullName': { step: CONTACTO, label: 'Nombre completo' },
    'contact.email': { step: CONTACTO, label: 'Correo electrónico' },
    'contact.phone': { step: CONTACTO, label: 'Celular o WhatsApp' },
    'contact.consent': { step: CONTACTO, label: 'Autorización de datos' }
  };

  /* Named explicitly so a rejection says why. Money and quantities are always
   * calculated; identity, consent and the quote's lifecycle belong to people. */
  const NEVER_SETTABLE = ['price', 'estimate', 'meters', 'fabric', 'quote.id', 'quote.status', 'seller',
    'contact.fullName', 'contact.email', 'contact.phone', 'contact.consent'];

  const ACTION_TYPES = ['FOCUS_FIELD', 'SET_FIELD', 'NAVIGATE_TO_STEP'];

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const stepOf = n => STEPS.find(s => s.n === n);

  /* One action against the live env (what the wizard exposes RIGHT NOW):
   *   env = { currentStep, submitted, fields: { [field]: {min,max} | {options:[{value,label}]} | {available} } }
   * Returns { ok:true, action (a fresh, normalized copy), requiresConfirmation }
   * or { ok:false, reason }. Unknown keys on the input are dropped. */
  function validateAction(action, env) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return { ok: false, reason: 'not-an-object' };
    if (!ACTION_TYPES.includes(action.type)) return { ok: false, reason: 'unknown-type' };
    if (!env || env.submitted) return { ok: false, reason: 'quote-already-submitted' };
    const current = env.currentStep;

    if (action.type === 'NAVIGATE_TO_STEP') {
      const step = action.step;
      if (!Number.isInteger(step) || !stepOf(step)) return { ok: false, reason: 'unknown-step' };
      // Backward only: moving forward is the customer's "Continuar", with its validation.
      if (step >= current) return { ok: false, reason: 'step-not-reachable' };
      return { ok: true, action: { type: 'NAVIGATE_TO_STEP', step }, requiresConfirmation: true };
    }

    const field = action.field;
    if (typeof field !== 'string') return { ok: false, reason: 'unknown-field' };
    if (action.type === 'SET_FIELD' && NEVER_SETTABLE.includes(field)) return { ok: false, reason: 'not-settable' };
    if (!own(FIELDS, field)) return { ok: false, reason: NEVER_SETTABLE.includes(field) ? 'not-settable' : 'unknown-field' };
    const def = FIELDS[field];
    // Same reach as the customer's hands: only the controls of the step on screen.
    if (def.step !== current) return { ok: false, reason: 'field-not-on-current-step' };
    const live = (env.fields && env.fields[field]) || {};
    if (live.available === false) return { ok: false, reason: 'field-not-available' };

    if (action.type === 'FOCUS_FIELD') return { ok: true, action: { type: 'FOCUS_FIELD', field }, requiresConfirmation: false };

    if (!def.set) return { ok: false, reason: 'not-settable' };
    const value = action.value;
    if (def.set === 'boolean' && typeof value !== 'boolean') return { ok: false, reason: 'invalid-value' };
    if (def.set === 'integer') {
      if (!Number.isInteger(value)) return { ok: false, reason: 'invalid-value' };
      if ((Number.isFinite(live.min) && value < live.min) || (Number.isFinite(live.max) && value > live.max)) return { ok: false, reason: 'out-of-range' };
    }
    if (def.set === 'enum' && (typeof value !== 'string' || !(live.options || []).some(o => o.value === value))) return { ok: false, reason: 'invalid-value' };
    return { ok: true, action: { type: 'SET_FIELD', field, value }, requiresConfirmation: true };
  }

  /* A proposal is applied in order, so a NAVIGATE_TO_STEP earlier in the list
   * moves the step the later actions are checked against. */
  function validateActions(actions, env) {
    const accepted = [], rejected = [];
    let e = env ? Object.assign({}, env) : env;
    for (const a of Array.isArray(actions) ? actions : []) {
      const r = validateAction(a, e);
      if (r.ok) {
        accepted.push({ action: r.action, requiresConfirmation: r.requiresConfirmation });
        if (r.action.type === 'NAVIGATE_TO_STEP') e = Object.assign({}, e, { currentStep: r.action.step });
      } else rejected.push({ action: a, reason: r.reason });
    }
    return { accepted, rejected };
  }

  function describeAction(action, env) {
    if (action.type === 'NAVIGATE_TO_STEP') return `Volver al paso ${action.step} · ${stepOf(action.step).name}`;
    const def = FIELDS[action.field];
    if (action.type === 'FOCUS_FIELD') return `Ir a «${def.label}»`;
    if (def.set === 'boolean') return action.value ? `Marcar «${def.label}»` : `Desmarcar «${def.label}»`;
    const live = (env && env.fields && env.fields[action.field]) || {};
    const opt = (live.options || []).find(o => o.value === action.value);
    const shown = opt ? opt.label : (def.unit ? `${action.value} ${def.unit}` : String(action.value));
    return `${def.label}: ${shown}`;
  }

  // Lowercase, no accents: matching is about intent, not spelling.
  const normalizeText = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const MEASURE_WORDS = [
    ['measurements.width', /\bancho\b/],
    ['measurements.height', /\balto\b|\baltura\b/],
    ['measurements.depth', /\bfondo\b|\bprofundidad\b/]
  ];
  // Cómo se nombran al hablar (los FIELDS usan las etiquetas del formulario).
  const MEASURE_NAME = { width: 'ancho', height: 'alto', depth: 'fondo' };
  const joinEs = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : (xs[0] || '');

  /* Two phrasings: "210 de ancho, 85 de alto" (number first, joined by "de") and
   * "ancho 210, alto 85" (word first). Mixing them in one sentence would make
   * every number ambiguous, so the phrasing is decided once for the whole text. */
  function extractMeasurements(t) {
    const found = {};
    const numberFirst = /\d{2,4}\s*(?:cm|centimetros)?\s+de\s+(?:ancho|alto|altura|fondo|profundidad)\b/.test(t);
    for (const [field, word] of MEASURE_WORDS) {
      const src = word.source;
      const m = numberFirst
        ? t.match(new RegExp(`(\\d{2,4})\\s*(?:cm|centimetros)?\\s+de\\s+(?:${src})`))
        : t.match(new RegExp(`(?:${src})\\s*(?:de|:|=)?\\s*(\\d{2,4})`));
      if (m) found[field] = parseInt(m[1], 10);
    }
    return found;
  }

  const firstEmptyMeasure = ctx => ['width', 'height', 'depth'].find(k => !(ctx.measurements && ctx.measurements[k]));

  /* The simulated reply. Returns { message, proposedActions } — proposals are
   * suggestions only; the adapter validates them before showing or running any. */
  function respond(ctx, text) {
    const t = normalizeText(text);
    const step = ctx && ctx.currentStep ? ctx.currentStep.n : 1;
    const furniture = String((ctx && ctx.selectedFurniture) || 'mueble').toLowerCase();
    const reply = (message, proposedActions) => ({ message, proposedActions: proposedActions || [] });

    if (ctx && ctx.submitted) return reply('Tu solicitud ya fue enviada. Un asesor te contactará para confirmar los detalles.');

    // Asking the assistant to move money is refused outright, whatever the wording.
    if (/(precio|valor|costo|descuento|metros)/.test(t) && /(baj|rebaj|cambi|pon|deja|quita|gratis|cero|descuent|modific)/.test(t)) {
      return reply('No puedo cambiar el precio ni los metros: el sistema los calcula con tus medidas y la tela que elijas, y un asesor confirma el valor final.');
    }

    const measures = extractMeasurements(t);
    const qty = t.match(/(\d{1,2})\s*(puestos|plazas|sillas|cuerpos|unidades|cojines?)\b/);
    if (Object.keys(measures).length || (qty && !/cojin/.test(qty[2]))) {
      if (step < MEDIDAS) return reply('Anótalo: en Medidas podrás escribir esas medidas. Primero elige el mueble y sube las fotos.');
      const actions = step > MEDIDAS ? [{ type: 'NAVIGATE_TO_STEP', step: MEDIDAS }] : [];
      for (const [field, value] of Object.entries(measures)) actions.push({ type: 'SET_FIELD', field, value });
      if (qty && !/cojin/.test(qty[2])) actions.push({ type: 'SET_FIELD', field: 'measurements.quantity', value: parseInt(qty[1], 10) });
      return reply(`Entendido. Puedo registrar esos datos de tu ${furniture} en Medidas si me lo confirmas.`, actions);
    }

    if (/(mascota|perro|gato)/.test(t)) {
      const pets = ctx && ctx.preferences ? ctx.preferences.pets : null;
      const base = 'Con mascotas conviene una tela de fácil limpieza, trama cerrada y buena resistencia al rasguño.';
      if (pets === true) return reply(`${base} Ya tienes «Mascotas» marcado en tus preferencias, así que lo tendré en cuenta al recomendarte telas.`);
      if (pets === null) return reply(base);
      if (step < PREFERENCIAS) return reply(`${base} Cuando lleguemos a Preferencias te propondré marcarlo.`);
      const actions = step > PREFERENCIAS ? [{ type: 'NAVIGATE_TO_STEP', step: PREFERENCIAS }] : [];
      actions.push({ type: 'SET_FIELD', field: 'preferences.pets', value: true });
      return reply(`${base} ¿Quieres que marque «Mascotas» en tus preferencias?`, actions);
    }

    if (/(definitiv|precio|valor|cuesta|cuanto|costo)/.test(t)) {
      const range = ctx && ctx.estimate && ctx.estimate.priceLabel;
      return reply('No es definitivo: es una estimación orientativa de la línea que elegiste (tela' +
        ', mano de obra y, si marcaste daños, reparaciones).' +
        (range ? ` Hoy tu estimación es ${range}.` : '') + ' Un asesor confirma cantidad, disponibilidad y precio antes de tu compra.');
    }

    if (/(medid|medir|mido|mide)/.test(t)) {
      const howto = `Mide el ancho, el alto y la profundidad de tu ${furniture} en sus puntos más largos, en centímetros.`;
      if (step === MEDIDAS) {
        const empty = firstEmptyMeasure(ctx);
        return reply(howto + (empty ? ' Te llevo al primer campo que falta.' : ' Ya registraste las tres medidas.'),
          empty ? [{ type: 'FOCUS_FIELD', field: `measurements.${empty}` }] : []);
      }
      if (step > MEDIDAS) return reply(`${howto} Si quieres revisarlas, puedo volver contigo al paso de Medidas.`, [{ type: 'NAVIGATE_TO_STEP', step: MEDIDAS }]);
      return reply(`${howto} Las registrarás en el siguiente paso.`);
    }

    if (/(foto|imagen)/.test(t)) {
      const photos = (ctx && ctx.photos) || { count: 0, min: 3 };
      if (step === 1 && photos.count < photos.min) {
        const missing = photos.min - photos.count;
        return reply(`Necesitamos al menos ${photos.min} fotos: de frente, en diagonal y un detalle de la tela. Te faltan ${missing}.`,
          [{ type: 'FOCUS_FIELD', field: 'photos' }]);
      }
      return reply(`Tienes ${photos.count} ${photos.count === 1 ? 'foto' : 'fotos'}. Con buena luz y de frente, un asesor puede confirmar mejor los detalles.`);
    }

    const where = stepOf(step);
    return reply(`Estás en «${where.name}». Puedo orientarte sobre medidas, uso con mascotas, cuidado y selección de telas. El inventario y el precio final los confirma un asesor.`);
  }

  /* The context made visible: what she can see, said out loud. Called once when the
   * chat opens, so the customer can tell the assistant is reading the wizard and
   * not just replying. Uses only the published context — nothing is inferred,
   * remembered or narrated back as a log. null when there is nothing to say. */
  function summarize(ctx) {
    if (!ctx || ctx.submitted) return null;
    const m = ctx.measurements || {};
    const mueble = String(ctx.selectedFurniture || 'mueble').toLowerCase();
    const qty = m.quantity && m.quantity.value > 1 ? m.quantity.label : null;
    const fotos = (ctx.photos && ctx.photos.count) || 0;
    const visto = [qty ? `${mueble} de ${qty}` : mueble];
    if (fotos) visto.push(`${fotos} ${fotos === 1 ? 'foto' : 'fotos'}`);
    const faltan = [];
    for (const k of ['width', 'height', 'depth']) {
      if (m[k]) visto.push(`${MEASURE_NAME[k]} ${m[k]} cm`);
      else faltan.push(`el ${MEASURE_NAME[k]}`);
    }
    return `Lo que tengo a la vista: ${visto.join(', ')}.` +
      (faltan.length ? ` Me falta ${joinEs(faltan)}.` : '') +
      ' ¿En qué te ayudo?';
  }

  /* Proactive messages: ONLY for real inconsistencies the wizard itself found.
   * Returns null when there is nothing worth interrupting for. */
  function observe(ctx, event) {
    if (!event || !ctx || ctx.submitted) return null;
    // A measurement the wizard considers out of the ordinary for this furniture,
    // caught as it is typed and not only when the step-4 review runs. The page
    // says it once per field (see `avisos` in index.html), which is why the field
    // and the value travel back.
    if (event.type === 'MEASUREMENTS_CHANGED') {
      const p = event.payload || {};
      const range = p.field && ctx.measurements && ctx.measurements.ranges && ctx.measurements.ranges[p.field];
      const value = p.value;
      if (!range || !Number.isFinite(value)) return null;
      const [min, max] = range;
      if (!(value < min || value > max)) return null;
      const mueble = String(ctx.selectedFurniture || 'mueble').toLowerCase();
      const palabra = MEASURE_NAME[String(p.field).split('.').pop()] || 'medida';
      return {
        field: p.field,
        value,
        message: `${value} cm de ${palabra} es ${value > max ? 'mucho' : 'poco'} para tu ${mueble}: ` +
          `lo habitual está entre ${min} y ${max} cm. Puedes corregirlo, o dejarlo así y un asesor lo confirma.`,
        notice: 'Encontré algo en tus medidas. Tócame para verlo.',
        proposedActions: []
      };
    }
    if (event.type === 'ANALYSIS_COMPLETED') {
      const odd = (event.payload && event.payload.oddMeasures) || [];
      if (!odd.length) return null;
      const labels = { width: 'el ancho', height: 'el alto', depth: 'la profundidad' };
      const names = odd.map(k => labels[k] || k);
      const furniture = String(ctx.selectedFurniture || 'mueble').toLowerCase();
      return {
        message: `En la revisión, ${joinEs(names)} quedó fuera de lo habitual para ${furniture}. Puedes seguir, o volver a Medidas para corregirlo.`,
        notice: 'Encontré algo en tus medidas. Tócame para verlo.',
        proposedActions: [{ type: 'NAVIGATE_TO_STEP', step: MEDIDAS }]
      };
    }
    return null;
  }

  /* Anti-Clippy budget for the presence's reactions: at most one reaction per
   * cooldown window, and none while the customer is typing. */
  function createReactionBudget(opts) {
    const cooldownMs = (opts && opts.cooldownMs) || 4000;
    let last = -Infinity;
    return {
      cooldownMs,
      allow(now, typing) {
        if (typing) return false;
        if (now - last < cooldownMs) return false;
        last = now;
        return true;
      },
      reset() { last = -Infinity; }
    };
  }

  const api = { STEPS, FIELDS, NEVER_SETTABLE, ACTION_TYPES, validateAction, validateActions, describeAction, respond, summarize, observe, createReactionBudget, normalizeText, extractMeasurements };
  root.AssistantBrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
