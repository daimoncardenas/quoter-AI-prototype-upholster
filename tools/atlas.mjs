/* EL ATLAS DE PASOS — Playwright recorre CADA línea del cotizador y le saca una captura a CADA paso.
 *
 * Dueño, 25/09: «con playwright… es para hacer screenshots.. de cada flujo y linea en cada paso».
 * Para qué sirve: el asistente (y quien lo revise) tiene delante lo que el cliente ve —qué pregunta
 * cada paso de cada recorrido, en qué orden, y con qué a la vista— en vez de una descripción.
 *
 *   node tools/atlas.mjs            → generated/atlas/<linea>/<NN>-paso-<paso>.png + atlas.json + README.md
 *   node tools/atlas.mjs retapizado → solo esa línea (por su id)
 *
 * Corre contra `generated/` en `file://` (sin servidor y sin modelo): el atlas es del WIZARD, no de la
 * conversación. Cada paso se fotografía ANTES de tocarlo; después se llena lo mínimo para que deje
 * pasar (una tarjeta, las medidas, tres fotos de prueba…), como lo haría una persona. Un paso que no
 * deja avanzar se marca `bloqueado` con su motivo y esa línea termina ahí — no se inventa el resto.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PHOTOS_DB } from '../tests/client.mjs';

const D = 'file://' + resolve('generated') + '/';
const SALIDA = resolve('generated/atlas');
const FOTOS = ['1', '2', '3'].map(n => resolve(`tests/fixture-sofa-${n}.png`));
const solo = process.argv[2] || null;
const MAX_PASOS = 24;          // tope de seguridad: ninguna línea tiene más pasos que estos
const INTENTOS = 3;            // veces que se intenta llenar y avanzar un paso antes de darlo por bloqueado

const slug = s => String(s || 'linea').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', () => {});
mkdirSync(SALIDA, { recursive: true });

/* El paso activo: su número, su título y lo que pregunta (el texto visible de su cabecera). */
const leerPaso = () => p.evaluate(() => {
  const s = document.querySelector('.wizard-step.active');
  if (!s) return null;
  const limpio = t => String(t || '').replace(/\s+/g, ' ').trim();
  const t = limpio((s.querySelector('h2') || s.querySelector('h3') || {}).textContent);
  const pregunta = limpio((s.querySelector('.step-sub, .step-copy, .hint, p') || {}).textContent);
  return { paso: s.dataset.step, titulo: t || '(sin título)', pregunta: pregunta.slice(0, 220),
    controles: [...s.querySelectorAll('input, select, button.service-choice, .furniture-card, label')]
      .map(c => c.id || c.className).slice(0, 12) };
});

/* Llenar lo mínimo para que el paso deje pasar: se prueba y se dice qué se tocó. */
const llenarElPaso = () => p.evaluate(async () => {
  const s = document.querySelector('.wizard-step.active');
  if (!s) return [];
  const tocado = [];
  const clic = (sel) => { const c = s.querySelector(sel); if (c) { c.click(); tocado.push(sel); return true; } return false; };
  clic('.service-choice');                                   // línea, camino, propósito, saber
  clic('.furniture-card');                                   // el mueble
  clic('.fabric-card');                                      // la tela recomendada / elegida
  /* Las preferencias y los daños son casillas: se marca la primera de cada reja. */
  ['#needsGrid', '#damageGrid'].forEach(id => {
    const c = s.querySelector(`${id} input[type="checkbox"]`);
    if (c && !c.checked) { c.click(); tocado.push(id + ' ✓'); }
  });
  /* La lista de compra: una fila con su tela y su cantidad (sin eso el paso no deja pasar). */
  { const sel = s.querySelector('#listRows .list-fabric');
    if (sel && !sel.value && sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true })); tocado.push('.list-fabric'); }
    const mes = s.querySelector('#listRows .list-metros');
    if (mes && !mes.value) { mes.value = '12'; mes.dispatchEvent(new Event('input', { bubbles: true })); tocado.push('.list-metros'); } }
  ['#width', '#height', '#depth'].forEach((id, i) => {
    const el = s.querySelector(id); if (el && !el.value) { el.value = ['210', '85', '90'][i]; el.dispatchEvent(new Event('input', { bubbles: true })); tocado.push(id); }
  });
  ['#style', '#color', '#budget', '#entrega'].forEach(id => {
    const el = s.querySelector(id);
    if (el && el.options && !el.value) { el.selectedIndex = [...el.options].findIndex(o => o.value); el.dispatchEvent(new Event('change', { bubbles: true })); tocado.push(id); }
  });
  ['#customerCity', '#serviceCity', '#city'].forEach(id => {
    const el = s.querySelector(id);
    if (el && el.value === '' && el.options.length > 1) { el.selectedIndex = 1; el.dispatchEvent(new Event('change', { bubbles: true })); tocado.push(id); }
  });
  ['#fullName', '#email', '#phone'].forEach((id, i) => {
    const el = s.querySelector(id); if (el && !el.value) { el.value = ['Cliente Demo', 'cliente@demo.com', '300 000 0000'][i]; el.dispatchEvent(new Event('input', { bubbles: true })); tocado.push(id); }
  });
  const consent = s.querySelector('#consent'); if (consent && !consent.checked) { consent.click(); tocado.push('#consent'); }
  return tocado;
}, FOTOS);

/* ¿Este paso pide fotos? (su input de archivo está en el paso activo) */
const elPasoPide = async () => p.evaluate(() => {
  const s = document.querySelector('.wizard-step.active');
  const f = s && s.querySelector('input[type="file"]');
  return f ? f.id : null;
});
const pasoActual = () => p.evaluate(() => (document.querySelector('.wizard-step.active') || {}).dataset?.step);

await p.goto(D + 'index.html');
await p.evaluate(db => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await p.waitForTimeout(700);

const lineas = await p.evaluate(() => {
  const reja = document.getElementById('serviceGrid');
  if (!reja || !reja.querySelector('.service-choice')) return [{ id: 'unica', rotulo: 'la única del plan', indice: -1 }];
  return [...reja.querySelectorAll('.service-choice')].map((c, i) => ({
    id: c.dataset.service || String((c.querySelector('b') || {}).textContent || c.textContent).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    rotulo: String((c.querySelector('b') || {}).textContent || c.textContent).replace(/\s+/g, ' ').trim(), indice: i
  }));
});
console.log('Líneas a recorrer: ' + lineas.map(l => l.rotulo).join(' · '));

const atlas = [];
for (const linea of lineas) {
  if (solo && linea.id !== solo) continue;
  await p.goto(D + 'index.html');
  await p.evaluate(db => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await p.waitForTimeout(600);
  if (linea.indice >= 0) {
    await p.click(`#serviceGrid .service-choice >> nth=${linea.indice}`);
    await p.waitForTimeout(250);
    /* Elegir la línea no avanza solo: el paso de la línea pide su «Continuar», como una persona. */
    await p.click('#nextButton').catch(() => {});
    await p.waitForTimeout(900);
  }
  /* El id REAL de la línea lo dice su estado (`state.service.id`): el rótulo de la tarjeta es larguísimo
   * y no sirve de carpeta. */
  const idReal = await p.evaluate(() => (typeof state !== 'undefined' && state.service && state.service.id) || null);
  const carpetaId = slug(idReal || linea.id);
  const carpeta = resolve(SALIDA, carpetaId);
  mkdirSync(carpeta, { recursive: true });
  const pasos = [];
  let anterior = null, bloqueado = null;
  for (let n = 0; n < MAX_PASOS; n++) {
    const visto = await leerPaso();
    /* Sin paso activo el recorrido ya terminó: eso no es un bloqueo (la última pantalla ya se
     * fotografió). Un paso que no deja pasar sí lo es, y se dice con su número y su título. */
    if (!visto) { bloqueado = null; break; }
    const archivo = `${String(n + 1).padStart(2, '0')}-paso-${visto.paso}.png`;
    await p.screenshot({ path: resolve(carpeta, archivo), fullPage: false });
    pasos.push({ orden: n + 1, paso: visto.paso, titulo: visto.titulo, pregunta: visto.pregunta, captura: `${carpetaId}/${archivo}` });
    let avanzo = false;
    for (let k = 0; k < INTENTOS && !avanzo; k++) {
      const elFoto = await elPasoPide();
      if (elFoto) { await p.setInputFiles(`#${elFoto}`, FOTOS); await p.waitForTimeout(1600); }
      /* La revisión (paso 13) corre sola cuando se le pulsa su botón: el paso no deja pasar antes. */
      if (await p.isVisible('.wizard-step.active #analyzeButton')) { await p.click('#analyzeButton'); await p.waitForTimeout(2600); }
      await llenarElPaso();
      await p.waitForTimeout(250);
      await p.click('#nextButton').catch(() => {});
      await p.waitForTimeout(900);
      const ahora = await pasoActual();
      if (ahora !== visto.paso) { avanzo = true; }
    }
    if (!avanzo) {
      bloqueado = `el paso ${visto.paso} («${visto.titulo}») no deja avanzar: ${await p.evaluate(() => (document.querySelector('#nextButton') || {}).disabled !== false ? 'el botón sigue apagado' : 'el botón no mueve el paso')}`;
      pasos[pasos.length - 1].bloqueado = bloqueado;
      break;
    }
    anterior = visto.paso;
  }
  atlas.push({ linea: linea.id, rotulo: linea.rotulo, pasos, bloqueado });
  console.log(`\n${linea.rotulo}  (${pasos.length} pasos)${bloqueado ? '  ⛔ ' + bloqueado : ''}`);
  pasos.forEach(x => console.log(`   ${String(x.orden).padStart(2, '0')}. paso ${x.paso} — ${x.titulo.slice(0, 60)}${x.bloqueado ? '  ⛔' : ''}`));
}

writeFileSync(resolve(SALIDA, 'atlas.json'), JSON.stringify({ generado: new Date().toISOString(), client: process.env.CLIENT || '(el del .env)', lineas: atlas }, null, 2));
writeFileSync(resolve(SALIDA, 'README.md'), [
  '# El atlas de pasos (capturas de cada línea, paso a paso)',
  '',
  'Lo genera `node tools/atlas.mjs` con Playwright, sobre `generated/` (el cliente del `.env`).',
  'Sirve para mirar sin abrir la app: qué pregunta cada paso de cada recorrido y en qué orden.',
  '',
  ...atlas.flatMap(l => [`## ${l.rotulo}${l.bloqueado ? '  (⛔ ' + l.bloqueado + ')' : ''}`, '',
    ...l.pasos.map(x => `- **${x.paso}** — ${x.titulo}${x.pregunta ? ': ' + x.pregunta : ''}\n  ![paso ${x.paso}](<${x.captura}>)`), '']),
  `Generado: ${new Date().toISOString()}`,
].join('\n'));
console.log('\nAtlas en ' + SALIDA + ' (atlas.json + README.md + una carpeta por línea)');
await b.close();
