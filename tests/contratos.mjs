/* LOS CONTRATOS: la maquinaria compartida de las suites «contrato-<línea>».
 *
 * Dos piezas, separadas a propósito:
 *
 *   · shared/contracts/<branch>.json — EL CONTRATO: el cuerpo que el endpoint recibe por esa rama
 *     (puro dato, en camelCase; ver shared/contracts/README.md). No lleva pasos ni selectores: eso es
 *     frontend y no viaja al backend (el dueño: «un mierdero de indicaciones que son para el
 *     frontend... un endpoint de backend necesita datos claros y concretos»).
 *   · tests/mirror/<branch>.json — EL ESPEJO: los pasos que el wizard muestra para esa rama y el
 *     control que pinta cada campo. Es verificación, no contrato.
 *
 * La suite de la línea camina cada entrada en el wizard RENDERIZADO y compara el espejo en las dos
 * direcciones (el paso declarado está en el wizard con su brain/id/ask; cada control declarado existe
 * DENTRO de su paso; ningún control del paso queda sin declarar), y en datos (sin navegador): cada
 * espejo tiene su contrato y los dos dicen la misma rama, la cadena es un camino REAL del catálogo
 * —con la línea indirecta incluida—, ninguna tarjeta se queda sin espejo, las claves del contrato
 * están declaradas, y las ACCIONES estándar (shared/ai-actions.json) coinciden con los pasos que las
 * declaran. Diseño: docs/contrato-conversacional.md.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';

export const CATALOGO = JSON.parse(readFileSync('shared/service-lines.json', 'utf8'));
export const ACCIONES = JSON.parse(readFileSync('shared/ai-actions.json', 'utf8')).acciones;
const LINEA = id => CATALOGO.lines.filter(l => l.id === id)[0] || null;

/* Las claves que un contrato puede llevar: las del caso + la cabecera. Una clave nueva se declara
 * aquí ANTES de escribirla (así el endpoint no recibe sorpresas). */
export const CLAVES_DE_CONTRATO = [
  'schemaVersion', 'branch', 'source', 'brand', 'submittedAt',
  'serviceLine', 'route', 'purpose', 'knowledge',
  'furniture', 'photos', 'damages', 'measurements', 'supplies', 'preferences', 'budget',
  'fabric', 'purchase', 'previousOrder', 'customerCity', 'serviceCity', 'delivery', 'contact', 'clientEstimate',
  /* La forma nueva: la general (QuoteRequest) peluqueada para cada rama — campos con su tipo, sin
   * valores. Los contratos viejos que todavía no se peluquean siguen declarando sus claves de
   * arriba; los nuevos usan estas. */
  '_nota', 'from', 'fields', 'required', 'system'
];

export function leerContratos() {
  return readdirSync('shared/contracts').filter(f => f.endsWith('.json'))
    .map(f => ({ archivo: f, ...JSON.parse(readFileSync('shared/contracts/' + f, 'utf8')) }));
}
export function leerEspejos() {
  return readdirSync('tests/mirror').filter(f => f.endsWith('.json'))
    .map(f => ({ archivo: f, ...JSON.parse(readFileSync('tests/mirror/' + f, 'utf8')) }));
}
export const contratosDe = (lineaId, todos = leerContratos()) => todos.filter(c => c.serviceLine === lineaId);
export const espejosDe = (lineaId, todos = leerEspejos()) => todos.filter(e => e.line === lineaId);

/* La cadena de un contrato, como lista: es el camino del cliente por el wizard. */
export const cadenaDe = c => [c.serviceLine, c.route, c.purpose, c.knowledge].filter(Boolean);

/* ---- el árbol del catálogo: los caminos que una línea abre, con su línea efectiva (· `line`) ---- */
export function ramasDelCatalogo(lineaId) {
  const linea = LINEA(lineaId);
  if (!linea) return [];
  const out = [];
  const hijosDe = n => n.propositos || n.saberes || [];
  if (!(linea.rutas || []).length) return [{ camino: [], linea: linea.id }];
  for (const r of linea.rutas) {
    const rec = (camino, nodos, efectiva) => {
      if (!nodos.length) { out.push({ camino, linea: efectiva }); return; }
      for (const n of nodos) rec(camino.concat({ id: n.id, label: n.label }), hijosDe(n), n.line || efectiva);
    };
    rec([{ id: r.id, label: r.label }], hijosDe(r), r.line || linea.id);
  }
  return out;
}

/* Las tarjetas que el paso de la línea pinta: toda línea que OTRA no use como camino (index.html). */
export function tarjetas() {
  return CATALOGO.lines.filter(l => !CATALOGO.lines.some(o => (o.rutas || []).some(r => r.line === l.id)));
}
export function usadaComoCamino(lineaId) {
  return CATALOGO.lines.some(o => (o.rutas || []).some(r => r.line === lineaId));
}

/* ---- comprobaciones de DATOS (sin navegador): devuelven listas de problemas ----
 * `filtro` = { lineaId } recorta la lista a lo que le toca a UNA línea (su suite). Sin filtro, todo. */
export function problemasDeDatos(contratos = leerContratos(), espejos = leerEspejos(), filtro = null) {
  const probs = [];
  const porBranch = new Map(espejos.map(e => [e.branch, e]));
  const visto = new Map();

  for (const c of contratos) {
    const branch = c.archivo.replace(/\.json$/, '');
    if (c.branch !== branch) probs.push(`${c.archivo}: el archivo dice «${branch}» y el contrato «${c.branch}»`);
    if (c.schemaVersion !== 1) probs.push(`${c.archivo}: sin schemaVersion 1`);
    for (const k of Object.keys(c)) {
      if (k === 'archivo') continue;   /* el nombre del archivo, bookkeeping de la suite */
      if (!CLAVES_DE_CONTRATO.includes(k)) probs.push(`${c.archivo}: la clave «${k}» no está declarada en CLAVES_DE_CONTRATO`);
    }
    if (!LINEA(c.serviceLine)) { probs.push(`${c.archivo}: la rama empieza en «${c.serviceLine}», que no está en el catálogo`); continue; }

    /* La cadena tiene que ser un camino REAL del catálogo y desembocar en la línea del contrato. */
    const reales = ramasDelCatalogo(c.serviceLine);
    const ids = [c.route, c.purpose, c.knowledge].filter(Boolean).join('>');
    const real = reales.filter(r => r.camino.map(x => x.id).join('>') === ids)[0];
    if (!real) probs.push(`${c.archivo}: el camino «${c.serviceLine} > ${ids}» no es una rama del catálogo`);
    else if (real.linea !== c.serviceLine) probs.push(`${c.archivo}: la línea de esa rama es «${real.linea}», no «${c.serviceLine}»`);

    /* Su espejo, y el espejo dice la misma rama. */
    const e = porBranch.get(branch);
    if (!e) { probs.push(`${c.archivo}: no tiene espejo en tests/mirror/`); continue; }
    if (e.chain.join('.') !== cadenaDe(c).join('.')) probs.push(`${c.archivo}: el espejo dice la cadena «${e.chain.join(' > ')}» y el contrato «${cadenaDe(c).join(' > ')}»`);
    if (e.line !== c.serviceLine) probs.push(`${c.archivo}: el espejo es de la línea «${e.line}»`);

    /* Las entradas del espejo: por dónde se llega, con su línea efectiva. */
    for (const en of e.entries) {
      const clave = en.card + '|' + (en.path || []).map(x => x.id).join('>');
      if (visto.has(clave)) probs.push(`${c.archivo}: la entrada ${clave} ya la reclama ${visto.get(clave)}`);
      visto.set(clave, c.archivo);
      if (!LINEA(en.card)) { probs.push(`${c.archivo}: la tarjeta «${en.card}» no existe`); continue; }
      const camino = ramasDelCatalogo(en.card).filter(r => r.camino.map(x => x.id).join('>') === (en.path || []).map(x => x.id).join('>'))[0];
      if (!camino) probs.push(`${c.archivo}: el camino «${en.card} > ${(en.path || []).map(x => x.id).join('>')}» no es una rama del catálogo`);
      else if (camino.linea !== c.serviceLine) probs.push(`${c.archivo}: la línea de esa entrada es «${camino.linea}», no «${c.serviceLine}»`);
    }
  }

  for (const e of espejos) if (!contratos.some(c => c.archivo.replace(/\.json$/, '') === e.branch))
    probs.push(`tests/mirror/${e.archivo}: no tiene contrato en shared/contracts/`);

  /* Ninguna tarjeta se queda sin espejo, y ninguna línea usada como camino se queda sin su entrada
   * «sola» (su tarjeta propia, con quien la usa apagado). */
  for (const l of tarjetas()) {
    for (const r of ramasDelCatalogo(l.id)) {
      const clave = l.id + '|' + r.camino.map(x => x.id).join('>');
      if (!visto.has(clave)) probs.push(`la rama «${l.id} > ${r.camino.map(x => x.id).join('>')}» no tiene espejo`);
    }
  }
  for (const l of CATALOGO.lines) {
    if (!usadaComoCamino(l.id)) continue;
    if (!visto.has(l.id + '|')) probs.push(`«${l.id}» se alcanza sola con quien la usa apagado y no tiene entrada propia`);
  }
  return recortar(probs, contratos, espejos, filtro);
}

function recortar(probs, contratos, espejos, filtro) {
  if (!filtro) return probs;
  const propios = contratos.filter(c => c.serviceLine === filtro.lineaId).map(c => c.archivo + ':')
    .concat(espejos.filter(e => e.line === filtro.lineaId).map(e => `tests/mirror/${e.archivo}:`));
  return probs.filter(p => propios.some(a => p.startsWith(a))
    || p.startsWith(`la rama «${filtro.lineaId} >`) || p.startsWith(`«${filtro.lineaId}» se alcanza sola`));
}

/* ---- acciones estándar contra los espejos (el plan de llenado) ---- */
export function problemasDeAcciones(espejos = leerEspejos(), acciones = ACCIONES, filtro = null) {
  const probs = [];
  const ids = acciones.map(a => a.id);
  for (const e of espejos) {
    for (const p of e.steps) {
      for (const id of p.actions || []) {
        const a = acciones.filter(x => x.id === id)[0];
        if (!a) { probs.push(`${e.archivo}: el paso ${p.step} declara la acción «${id}», que no está en ai-actions.json`); continue; }
        if (a.paso !== p.step) probs.push(`${e.archivo}: «${id}» corre en el paso ${a.paso} y el espejo la pone en el ${p.step}`);
        const campos = p.fields.map(x => x.field);
        const toca = campos.some(x => x === a.campo || x.startsWith(a.campo + '.'));
        if (!toca) probs.push(`${e.archivo}: «${id}» involucra «${a.campo}» y el paso ${p.step} no declara ese campo`);
      }
      for (const cm of p.fields) {
        if (!cm.action) continue;
        const a = acciones.filter(x => x.id === cm.action)[0];
        if (!a) { probs.push(`${e.archivo}: el campo «${cm.field}» involucra «${cm.action}», que no existe`); continue; }
        if (!(p.actions || []).includes(cm.action)) probs.push(`${e.archivo}: el campo «${cm.field}» involucra «${cm.action}» y el paso ${p.step} no la declara`);
      }
    }
    const pasos = e.steps.map(p => p.step);
    for (const a of acciones) {
      if (!pasos.includes(a.paso)) continue;
      const p = e.steps.filter(x => x.step === a.paso)[0];
      if (!(p.actions || []).includes(a.id)) probs.push(`${e.archivo}: la rama pasa por el paso ${a.paso} y no declara «${a.id}»`);
    }
  }
  for (const id of ids) if (acciones.filter(a => a.id === id).length > 1) probs.push(`ai-actions.json: «${id}» está dos veces`);
  return filtro
    ? probs.filter(p => p.startsWith('ai-actions.json:') || espejos.filter(e => e.line === filtro.lineaId).some(e => p.startsWith(e.archivo + ':')))
    : probs;
}

/* ---- el wizard: caminar una entrada y leer los pasos ---- */
export async function abrirLaEntrada(page, D, entrada) {
  const label = (LINEA(entrada.card) || {}).label;
  await page.goto(D + 'index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto(D + 'index.html');
  await page.evaluate(a => Store.saveSettings({ plan: 'Business', disabledLines: a }), entrada.disableLines || []);
  await page.goto(D + 'index.html');
  await page.waitForTimeout(200);
  await page.click(`#serviceGrid .service-choice:has-text("${label}")`);
  await page.waitForTimeout(250);
  for (const n of entrada.path || []) {
    const antes = await page.evaluate(() => state.step);
    await page.click('#nextButton');
    await page.waitForFunction(x => state.step !== x, antes).catch(() => {});
    await page.waitForTimeout(180);
    const grid = { ruta: '#routeGrid', proposito: '#purposeGrid', saber: '#saberGrid' }[n.nivel] || (`[data-step]:visible`);
    await page.click(`${grid} .service-choice:has-text("${n.label}")`);
    await page.waitForTimeout(250);
  }
}

export const pasosDelWizard = page => page.evaluate(() => pasosVisibles());
export const lineaDelWizard = page => page.evaluate(() => state.service && state.service.id);

/* ---- el espejo, paso por paso: devuelve los problemas (vacío = espejo) ---- */
export async function problemasDelPaso(page, cp) {
  return page.evaluate(({ cp }) => {
    const SEL = 'input, select, textarea, .service-grid, .chip-grid, .furniture-grid, .fabric-grid, .boq-rows, .upload-zone, [data-ask-body]';
    const CONT = '.service-grid, .chip-grid, .furniture-grid, .fabric-grid, .boq-rows, .upload-zone, [data-ask-body]';
    const probs = [];
    const s = [...document.querySelectorAll('.wizard-step')].find(x => +x.dataset.step === cp.step);
    if (!s) return [`el paso ${cp.step} no está en el wizard`];
    if (cp.brain !== null && cp.brain !== undefined && (s.dataset.brain || '') !== cp.brain)
      probs.push(`el paso ${cp.step} del wizard no es «${cp.brain}» (es «${s.dataset.brain || '—'}»)`);
    if (cp.id && (s.id || '') !== cp.id) probs.push(`el paso ${cp.step} del wizard no es #${cp.id} (es #${s.id || '—'}»)`);
    if (cp.ask && (s.dataset.ask || '') !== cp.ask) probs.push(`el paso ${cp.step} del wizard no es el ask «${cp.ask}» (es «${s.dataset.ask || '—'}»)`);
    const declarados = [];
    for (const cm of cp.fields) for (const sel of cm.controls) {
      declarados.push(sel);
      let n = 0;
      try { n = s.querySelectorAll(sel).length; } catch (e) { probs.push(`el campo «${cm.field}» declara un selector inválido: ${sel}`); continue; }
      if (!n) probs.push(`el campo «${cm.field}» declara ${sel} y el paso ${cp.step} no lo tiene`);
    }
    const dentro = el => { let p = el.parentElement; while (p) { if (p.matches(CONT)) return true; p = p.parentElement; } return false; };
    const comoSelector = el => el.id ? '#' + el.id
      : (el.dataset && el.dataset.askBody) ? `[data-ask-body="${el.dataset.askBody}"]`
      : el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : '';
    for (const el of s.querySelectorAll(SEL)) {
      if (el.tagName === 'INPUT' && el.type === 'file') continue;
      if (dentro(el)) continue;
      const sel = comoSelector(el);
      if (!declarados.includes(sel)) probs.push(`el paso ${cp.step} tiene ${sel} y ningún campo del espejo lo declara`);
    }
    return probs;
  }, { cp });
}

/* ---- un verificador con la forma de la casa (PASS/FAIL por comprobación) ---- */
export function verificador() {
  let fails = 0;
  const check = (nombre, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${nombre}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
  };
  const problemas = (nombre, lista) => check(nombre, lista, []);
  return { check, problemas, fin: () => fails };
}

/* ---- la suite de UNA línea: los datos de sus contratos y el espejo de cada rama en el wizard ---- */
export async function correrSuiteDeContrato(lineaId, etiqueta) {
  const D = 'file://' + process.cwd() + '/generated/';
  const { check, problemas, fin } = verificador();
  const TODOS = leerContratos();
  const ESPEJOS = leerEspejos();
  const MIOS = contratosDe(lineaId, TODOS);
  const filtro = { lineaId };

  console.log(`\nCONTRATO DE «${etiqueta}» — LOS DATOS (sin navegador)`);
  check('la línea tiene su contrato', MIOS.length > 0, true);
  problemas('cada contrato tiene su espejo, los dos dicen la misma rama, y ninguna tarjeta se queda sin espejo',
    problemasDeDatos(TODOS, ESPEJOS, filtro));
  problemas('las acciones estándar coinciden con los pasos que las declaran', problemasDeAcciones(ESPEJOS, ACCIONES, filtro));

  console.log(`\nCONTRATO DE «${etiqueta}» — EL ESPEJO CONTRA EL WIZARD`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  for (const c of MIOS) {
    const e = ESPEJOS.filter(x => x.branch === c.archivo.replace(/\.json$/, ''))[0];
    if (!e) continue;
    for (const en of e.entries) {
      const por = `«${cadenaDe(c).join(' > ')}»` + (en.path && en.path.length ? ` por ${en.card}` : ' por su tarjeta')
        + (en.disableLines && en.disableLines.length ? ` [sin ${en.disableLines.join(', ')}]` : '');
      await abrirLaEntrada(page, D, en);
      check(`${por}: los pasos del wizard son los del espejo`, await pasosDelWizard(page), e.steps.map(p => p.step));
      check(`${por}: la línea del wizard es la del contrato`, await lineaDelWizard(page), c.serviceLine);
      const espejo = [];
      for (const cp of e.steps) espejo.push(...await problemasDelPaso(page, cp));
      problemas(`${por}: cada paso declara sus campos, y nada queda sin declarar`, espejo);
    }
  }
  check('sin errores de página', errs, []);
  await browser.close();
  const fails = fin();
  console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
  return fails;
}
