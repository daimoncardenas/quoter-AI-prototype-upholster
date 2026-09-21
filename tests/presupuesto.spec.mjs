/* ------------------------------------------------------------------------------------------------
 * EL PRESUPUESTO, EN TODAS LAS LÍNEAS Y EN LA UNIDAD DE CADA OFICIO
 * El dueño, 19/09: «budget "presupuesto"...is data key for the bussiness.. and the assistant can
 * recommend fabric and another things according the budget...this field "presupuesto"...or
 * "presupuesto por metro"...or "presupuesto por proyecto"...and so on.. according the line...».
 *
 * El campo vivía en «Preferencias» —paso que tres líneas no tienen— y sólo se leía «por metro».
 * Ahora vive en «Validación», que la tienen las ocho, con la pregunta y la unidad que pide el
 * `pricing` del oficio (tela / m2 / pieza / fabricacion / unidad), y viaja al resumen, al contexto
 * del asistente y a la revisión. Los tramos son los ajustes del cliente (el backoffice los edita;
 * el cotizador sólo los lee). Detalle y porqué: docs/presupuesto.md.
 * --------------------------------------------------------------------------------------------- */
import { chromium } from 'playwright';
import { openWizard } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

/* El campo vive en el paso de Validación: se elige su tramo por el DOM (el clic de verdad, el de
 * la persona, se comprueba en el bloque de arriba: el campo está en Validación y a la vista). */
const elegirTramo = (page, index) => page.evaluate(i => { const s = document.getElementById('budget');
  s.selectedIndex = i; s.dispatchEvent(new Event('change', { bubbles: true })); }, index);

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(D + 'index.html');
await page.evaluate(() => localStorage.clear());
await page.goto(D + 'index.html');
await page.waitForTimeout(700);

console.log('\nCADA OFICIO PREGUNTA SU PRESUPUESTO, EN SU UNIDAD — EN VALIDACIÓN');
/* Las cinco unidades que declara el catálogo (`pricing`): las cuatro líneas de tela comparten una. */
const UNIDADES = { 'tela': ['¿Cuál es tu presupuesto por metro de tela?', 'por metro de tela', '/m'],
  'm2': ['¿Cuál es tu presupuesto por metro cuadrado?', 'por metro cuadrado', '/m²'],
  'pieza': ['¿Cuál es tu presupuesto por pieza?', 'por pieza', '/pieza'],
  'fabricacion': ['¿Cuál es tu presupuesto por mueble?', 'por mueble', '/mueble'],
  'unidad': ['¿Cuál es tu presupuesto por proyecto?', 'por proyecto', '/proyecto'] };
const lineas = await page.$$eval('#serviceGrid .service-choice', els => els.map(e => e.querySelector('b').textContent.trim()));
check('el paso ofrece las seis líneas (reparación se elige dentro de Mantenimiento)', lineas.length, 6);
for (const nombre of lineas) {
  await page.evaluate(n => { const c = [...document.querySelectorAll('#serviceGrid .service-choice')].find(x => x.textContent.includes(n)); if (c) c.click(); }, nombre);
  await page.waitForTimeout(280);
  const leido = await page.evaluate(() => {
    const b = presupuestoDeclarado();
    return { pregunta: document.getElementById('budgetQuestion').textContent,
      unidad: document.getElementById('budgetUnit').textContent,
      enValidacion: !!document.getElementById('budgetField').closest('[data-brain="REVIEW"]'),
      opciones: document.querySelectorAll('#budget option').length,
      tramo: document.getElementById('budget').selectedOptions[0].textContent.trim(),
      b: [b.declared, b.amount, b.unit, b.unitLabel],
      contexto: ACI.context().budget,
      fila: (declaredRows().filter(r => /^Presupuesto$/.test(r[0]))[0] || [])[1] };
  });
  const pricing = await page.evaluate(() => (state.service || {}).pricing);
  const [pregunta, unidad, corta] = UNIDADES[pricing] || UNIDADES.tela;
  check(`«${nombre}» pregunta por su unidad (${pricing})`,
    [leido.pregunta, leido.unidad, leido.enValidacion], [pregunta, unidad, true]);
  check(`«${nombre}» ofrece los tramos del cliente y nace en el intermedio`,
    [leido.opciones >= 3, /^Entre |^Hasta /.test(leido.tramo)], [true, true]);
  check(`«${nombre}» lo lleva al contexto y al resumen con su unidad`,
    [leido.contexto.unit, leido.contexto.unitLabel, leido.contexto.declared, leido.b,
     /^Hasta \$/.test(leido.fila) && leido.fila.endsWith(unidad)],
    [corta, unidad, true, [true, leido.b[1], corta, unidad], true]);
}

console.log('\nEL TRAMO ABIERTO ES «SIN TOPE» — Y NO MARCA NADA SOBRE PRESUPUESTO');
await openWizard(page, D);
await elegirTramo(page, 0);   // «Hasta $X»: un tope estrecho
await page.waitForTimeout(200);
const estrecho = await page.evaluate(() => ({ declarado: presupuestoDeclarado(), contexto: ACI.context().budget }));
check('con tope, el tramo se declara y viaja', [estrecho.declarado.declared, estrecho.contexto.declared, estrecho.declarado.amount > 0], [true, true, true]);
const opciones = await page.$$eval('#budget option', els => els.length);
await elegirTramo(page, opciones - 1);   // «Más de $X»: sin tope
await page.waitForTimeout(200);
const abierto = await page.evaluate(() => ({ b: presupuestoDeclarado(), contexto: ACI.context().budget,
  fila: (declaredRows().filter(r => /^Presupuesto$/.test(r[0]))[0] || [])[1] }));
check('el tramo abierto es sin tope: no declara tope y lo dice con esas palabras',
  [abierto.b.declared, abierto.contexto.declared, abierto.contexto.amount, abierto.fila], [false, false, null, 'Sin tope declarado']);

console.log('\nEL PEDIDO DE TELAS QUE VE EL MOTOR SALE DEL CAMPO (NO DE UN VALOR FIJO)');
/* `recommend()` ya sabía marcar `overBudget` con un techo (tests/recommend.spec.mjs lo fija). Lo que
 * se comprueba aquí es la tubería nueva: el tramo que el cliente elige en Validación es el techo que
 * recibe el motor, y el tramo abierto llega como «sin límite declarado». */
const conTope = await page.evaluate(() => { const s = document.getElementById('budget'); s.selectedIndex = 0;
  s.dispatchEvent(new Event('change', { bubbles: true })); return pedidoDeTelas().budget; });
check('con un tramo con tope, el motor recibe su número', conTope > 0, true);
await elegirTramo(page, (await page.$$eval('#budget option', els => els.length)) - 1);
const sinTope = await page.evaluate(() => pedidoDeTelas().budget);
check('y con el tramo abierto, ninguna cifra: «sin límite declarado» (up presupuesto)', sinTope, null);

console.log('\nLA ESTIMACIÓN CONTRASTA EL TRAMO CON LA CANTIDAD DEL PROYECTO');
/* «Tapicería arquitectónica»: su estimación sale de las medidas del paso de su pregunta (m²), así
 * que basta responderla y pedir el número. El contraste traduce el tramo a total con esa cantidad. */
await page.goto(D + 'index.html');
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await page.goto(D + 'index.html');
await page.waitForTimeout(400);
await page.click('#serviceGrid .service-choice:has-text("Tapicería arquitectónica")');
await page.waitForTimeout(400);
await page.setInputFiles('#furniturePhoto', ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname));
await page.waitForFunction(() => state.photos.length >= 3);
await page.click('#nextButton');            // a su primera pregunta: ahí viven las medidas de la m²
await page.waitForTimeout(600);
/* Las preguntas de la línea no llevan id en sus campos (los identifica su orden): se responden como
 * los responde una persona, del primero al segundo, y se comprueba que el cotizador los leyó. */
await page.evaluate(() => {
  const paso = document.querySelector('.wizard-step.active');
  paso.querySelectorAll('.chip-grid label:first-child input').forEach(i => { if (!i.checked) i.click(); });
  const nums = [...paso.querySelectorAll('input[type="number"]')].filter(i => i.offsetParent);
  [['300'], ['220']].forEach(([v], k) => { if (nums[k]) { nums[k].value = v; nums[k].dispatchEvent(new Event('change', { bubbles: true })); } });
});
await page.waitForTimeout(300);
const contraste = await page.evaluate(() => {
  const a = allAnswers();
  updateEstimate();
  const el = document.getElementById('budgetCompare');
  return { leyo: [+a.ancho || 0, +a.alto || 0], visible: !el.hidden, texto: el.textContent.replace(/\s+/g, ' ').trim() };
});
check('el cotizador leyó las medidas de su pregunta (30–2000 · 30–1000)',
  [contraste.leyo[0] > 0, contraste.leyo[1] > 0], [true, true]);
check('la estimación dice el techo del tramo en dinero y con qué cantidad lo tradujo',
  [contraste.visible, /por metro cuadrado/.test(contraste.texto), /\d/.test(contraste.texto),
   /queda dentro|arranca dentro|queda por encima/.test(contraste.texto)],
  [true, true, true, true]);

console.log('\nCAMBIAR DE LÍNEA DEVUELVE EL TRAMO A SU PUNTO DE PARTIDA');
const antes = await page.evaluate(() => document.getElementById('budget').selectedIndex);
await elegirTramo(page, 0);
await page.evaluate(() => { const c = [...document.querySelectorAll('#serviceGrid .service-choice')].find(x => /Mantenimiento/.test(x.textContent)); if (c) c.click(); });
await page.waitForTimeout(400);
const despues = await page.evaluate(() => ({ indice: document.getElementById('budget').selectedIndex,
  pregunta: document.getElementById('budgetQuestion').textContent, unidad: document.getElementById('budgetUnit').textContent }));
check('el tramo vuelve a su valor de fábrica y la pregunta cambia de oficio',
  [despues.indice, antes !== 0 || despues.indice === antes, despues.pregunta, despues.unidad],
  [1, true, '¿Cuál es tu presupuesto por pieza?', 'por pieza']);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FALLAN` : '\nTODO PASA');
await browser.close();
process.exit(fails ? 1 : 0);
