/* EVALUACIÓN — «Retapizado de muebles» desde el lado del cliente.
 *
 * Mitad mecánica de la skill `retapizado-evaluacion`: recorre el flujo con formas de persona
 * distintas y deja escrito lo que se puede comprobar sin criterio humano — el recorrido llega al
 * cierre, la cifra cumple la razón del motor (material × 1,6), las partes suman el total, el
 * artefacto se llama como debe y NINGUNA promesa prohibida se cuela en lo que el cliente lee.
 *
 * La mitad de juicio (¿convence comercialmente?, ¿Lía responde bien a las objeciones?) la hace quien
 * evalúa leyendo esta corrida + hablando con el chat. Este spec es el informe, no el veredicto.
 *
 * Regla de la casa: cada criterio nuevo tiene que poder FALLAR — si un check no puede fallar, no
 * está probando nada. Los criterios salen del catálogo y del motor, nunca de lo que el evaluador
 * supone: la primera versión de este archivo comparaba «una pieza cotiza menos», con un ancho de
 * 210 cm metido a una poltrona; el criterio era del evaluador, no del producto, y se corrigió. */
import { chromium } from 'playwright';
import { elegirAtencion } from './helpers.mjs';
import { createRequire } from 'node:module';
import { PHOTOS_DB } from './client.mjs';
const brain = createRequire(import.meta.url)('../assistant-brain.js');
const D = 'file://' + process.cwd() + '/generated/';
const png = ['1','2','3'].map(n=>new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const browser = await chromium.launch(); const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));

const avanzar = async () => {
  const antes = await page.evaluate(()=>state.step);
  await page.click('#nextButton');
  await page.waitForFunction(x=>state.step!==x, antes);
};
const numero = t => Number(String(t).replace(/[^\d]/g,'')) || 0;
const rangoDe = t => String(t).split('–').map(numero);
const money = n => '$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* Las promesas prohibidas de la skill: lo que el producto NO puede afirmar (ver `retapizado-experto`).
 * «Rellenos» puede aparecer —el hint del motivo lo dice—; lo que no puede aparecer es que la cifra lo
 * incluya o lo valore. Y cuidado con los dos falsos positivos que ya aparecieron: «un asesor confirma
 * el precio final» es la advertencia honesta, no una promesa, y una cifra con punto final es la misma
 * cifra. El detector se prueba a sí mismo unas líneas más abajo. */
const PROMESAS = [
  ['un precio de transporte, recogida o entrega', /transporte|recogida|domicilio[^.]{0,40}(costo|cobra|vale|\$)/i],
  ['un plazo o una garantía', /garant[ií]a|plazo|en \d+ d[ií]as|entrega en \d+/i],
  ['una cotización definitiva', /cotizaci[oó]n definitiva|(precio|valor) definitiv|(es|ser[íi]a|queda|te lo dejo en) (el |un )?(precio|valor) final/i],
  ['el relleno o la espuma dentro de la cifra', /(incluye|inclu[ie]d[oa]s?|valorad[oa]s?|sumad[oa]s?|dentro del precio)[^.]{0,40}(relleno|espuma)|(relleno|espuma)[^.]{0,40}(inclu[ie]d[oa]s?|valorad[oa]s?|sumad[oa]s?|dentro del (precio|valor))/i],
];
const promesasEn = texto => PROMESAS.filter(([,r])=>r.test(texto)).map(([d])=>d);

/* Entrar al cotizador limpio y elegir el motivo: deja al cliente en el paso 0 (la línea). */
async function entrar(fila) {
  await page.goto(D + 'index.html');
  await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
  await page.goto(D + 'index.html');
  await page.waitForTimeout(300);
  await page.click(`#serviceGrid .service-choice:nth-child(${fila})`);   // 2 = Retapizado de muebles
}
/* Recorrer un motivo hasta su estimación venga como venga el recorrido: llena las medidas cuando
 * aparecen y valida la revisión cuando toca. Los motivos NO tienen los pasos en el mismo orden (los
 * asks van antes de Medidas), así que contar pasos a mano es una bomba de tiempo. Devuelve si llegó. */
async function hastaEstimacion(max = 16) {
  const estimacion = await page.evaluate(() => AssistantBrain.STEPS.find(s => s.id === 'ESTIMATE').n);
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(n => state.step === n, estimacion)) return true;
    if (await page.isVisible('#width')) {
      await page.fill('#width','210'); await page.fill('#height','85'); await page.fill('#depth','90');
    }
    if (await page.isVisible('#analyzeButton') && !(await page.evaluate(()=>state.analyzed))) {
      await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed);
    }
    await avanzar();
  }
  return false;
}

/* Una vuelta completa por el motivo con una forma de persona. Devuelve lo que el cliente vio. */
async function recorrer({ mueble, fila, medidas, piezas }) {
  await entrar(fila);
  await avanzar();
  if (mueble) { await page.click(`.furniture-card[data-furniture="${mueble}"]`); await page.waitForTimeout(200); }
  if (piezas) await page.evaluate(n => {                                  // null = el control como venga
    const s = document.getElementById('seats');
    s.value = String(n); s.dispatchEvent(new Event('change', { bubbles: true }));
  }, piezas);
  await page.setInputFiles('#furniturePhoto', png);
  await page.waitForFunction(()=>state.photos.length>=3);
  await avanzar();                                                       // 1 → 9 (Medidas)
  await page.fill('#width',String(medidas[0])); await page.fill('#height',String(medidas[1]));
  await page.fill('#depth',String(medidas[2]));
  await avanzar();                                                       // 9 → 17 (Insumos del trabajo)
  await avanzar();                                                       // 17 → 12 (Preferencias)
  await avanzar();                                                       // 12 → 13 (Validación)
  if (await page.isVisible('#analyzeButton')) { await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed); }
  await avanzar();                                                       // 13 → 14 (Recomendación)
  await page.click('#fabricGrid .fabric-card:nth-child(1)');
  await avanzar();                                                       // 14 → 16 (Estimación)
  const visto = await page.evaluate(() => {
    const partes = [...document.querySelectorAll('#priceParts span')].map(s => ({
      label: s.textContent.split(' · ')[0].trim(),
      texto: (s.querySelector('b') || { textContent: '' }).textContent.trim(),
    }));
    return {
      total: document.getElementById('priceRange').textContent.trim(),
      partes,
      artefacto: document.getElementById('estimateArtifact').textContent.trim(),
      dot: document.getElementById('estimateDotLabel').textContent.trim(),
      pendientes: [...document.querySelectorAll('#estimatePendingConfirm li')].map(x => x.textContent.trim()),
      pendientesEsperados: (Store.lineCopy('retapizado') || {}).pendingConfirm,
      filas: document.querySelector('.journey').dataset.rows,
      scroll: [document.querySelector('.journey').scrollHeight, document.querySelector('.journey').clientHeight],
      copia: document.querySelector('.journey').innerText + '\n' + document.querySelector('.workspace').innerText,
      asistenteIntocable: AssistantBrain.NEVER_SETTABLE.includes('price') && AssistantBrain.NEVER_SETTABLE.includes('estimate'),
      tela: state.fabric ? state.fabric.name : null,
      precioTela: state.fabric ? state.fabric.price : null,
      modelo: (() => { const c = consumo(); return { ruta: c.modelo, rollWidthCm: c.rollWidthCm, piezas: c.piezas }; })(),
      cantidad: document.getElementById('seats').value,
      etiquetaCantidad: document.getElementById('quantityLabel').textContent.trim(),
    };
  });
  await avanzar();                                                       // 16 → 15 (Contacto)
  await page.fill('#fullName','Cliente Evaluación'); await page.fill('#email','evalua@example.com');
  await elegirAtencion(page);
  await page.fill('#phone','3001112233'); await page.check('#consent');
  await page.click('#nextButton');
  await page.waitForSelector('#successState:not([hidden])');
  const id = (await page.textContent('#requestNumber')).trim();
  const guardado = await page.evaluate(i => {
    const q = Store.get('quotes', i), e = q.estimate, m = n => Store.money(n);
    return {
      total: e.total[0] === e.total[1] ? m(e.total[0]) : `${m(e.total[0])} – ${m(e.total[1])}`,
      kind: e.kind, partes: e.parts.map(p => p.label),
      cierre: document.getElementById('successArtifact').textContent.trim(),
      lineas: (q.photoIds || []).length,
    };
  }, id);
  return { visto, guardado };
}

/* Lee la estimación vista y la imprime como línea de informe: es la evidencia que lee un humano. */
function informe(r) {
  const parte = k => ((r.visto.partes.find(x => new RegExp(k,'i').test(x.label)) || {}).texto) || '';
  const material = rangoDe(parte('material'));
  const metros = material.map(v => Math.round(v / r.visto.precioTela * 10) / 10);
  console.log(`  tela: ${r.visto.tela} a ${money(r.visto.precioTela)}/m · metros facturables ≈ ${metros.join('–')} m` +
              ` · material ${parte('material')} · total ${r.visto.total}`);
  return { material, mano: rangoDe(parte('mano de obra')), total: rangoDe(r.visto.total), metros };
}

console.log('\nPERSONA 1 · «quiero volver a tapizar el sofá de 3 puestos» (2,10 m de ancho)');
const sofa = await recorrer({ mueble: null, fila: 2, medidas: [210, 85, 90] });
const sofaV = informe(sofa);
check('el recorrido llega al cierre y la barra no hace scroll',
  [sofa.visto.filas, sofa.visto.scroll[0] === sofa.visto.scroll[1]], ['8', true]);
check('la estimación declara sus partes: material y mano de obra',
  sofa.visto.partes.map(p => p.label), ['Material', 'Mano de obra (≈ 60 %)']);
check('las partes suman el total que se muestra',
  [sofaV.material[0] + sofaV.mano[0], sofaV.material[1] + sofaV.mano[1]], sofaV.total);
check('la mano de obra es el 60 % del material (redondeada hacia arriba a 0,1)',
  sofaV.mano.map((v,i) => Math.ceil(sofaV.material[i] * 0.6 * 10) / 10), sofaV.mano);
check('el sofá se cotiza por piezas contra el ancho del rollo de la tela (modelo de componentes)',
  [sofa.visto.modelo.ruta, sofa.visto.modelo.rollWidthCm > 0, sofa.visto.modelo.piezas > 0],
  ['componentes', true, true]);
check('el artefacto se llama «Pre-cotización de retapizado», aquí y en el cierre',
  [sofa.visto.artefacto, sofa.guardado.cierre], ['Pre-cotización de retapizado', 'Pre-cotización de retapizado']);
check('la solicitud guarda el mismo total que vio el cliente, con su motor',
  [sofa.visto.total, sofa.guardado.total, sofa.guardado.kind], [sofa.guardado.total, sofa.guardado.total, 'tela']);
check('lo pendiente de confirmar es lo que el catálogo declara para el motivo',
  sofa.visto.pendientes, sofa.visto.pendientesEsperados);
check('ninguna promesa prohibida en lo que el cliente lee', promesasEn(sofa.visto.copia), []);
check('el chat no puede fijar precio ni estimación (contrato del cerebro)', sofa.visto.asistenteIntocable, true);
check('las tres fotos del cliente viajan con la solicitud', sofa.guardado.lineas, 3);

console.log('\nPERSONA 2 · «es una poltrona, una sola pieza» (95 cm de ancho, cantidad 1)');
const poltrona = await recorrer({ mueble: 'Poltrona', fila: 2, medidas: [95, 80, 85], piezas: 1 });
const poltronaV = informe(poltrona);
check('el recorrido también llega al cierre',
  [poltrona.visto.filas, poltrona.visto.scroll[0] === poltrona.visto.scroll[1]], ['8', true]);
check('y la razón del motor se sostiene (material × 1,6 = total)',
  [poltronaV.material[0] + poltronaV.mano[0], poltronaV.material[1] + poltronaV.mano[1]], poltronaV.total);
check('la poltrona todavía se cotiza por la heurística de rango base, no por piezas (migración pendiente)',
  [poltrona.visto.modelo.ruta, poltrona.visto.modelo.piezas, await page.evaluate(() => Store.hasComponentModel(Store.furnitureByName('Poltrona')))],
  ['heuristica', 0, false]);
check('una pieza cotiza menos que el sofá de tres puestos: lo manda su consumo, no una constante',
  [poltronaV.total[0] < sofaV.total[0], poltronaV.metros[1] < sofaV.metros[0]], [true, true]);
check('el total guardado es el que se vio, también en esta persona',
  poltrona.guardado.total, poltrona.visto.total);
check('ninguna promesa prohibida, tampoco aquí', promesasEn(poltrona.visto.copia), []);

console.log('\nLO QUE VE QUIEN NO TOCA EL CONTROL DE CANTIDAD (el mismo mueble, sin cambiar el número)');
/* OBSERVACIÓN para el dueño, con su número: el control de cantidad arranca en 3 —lo razonable para
 * los PUESTOS de un sofá— y al elegir una pieza que se cuenta por UNIDADES (`scaleByQty`) ese 3
 * sobrevive, así que el cliente cotiza tres poltronas sin haberlo pedido. No es un precio inventado
 * ni un cálculo roto: es qué hace el control cuando nadie lo mira. Se afirma solo lo comprobable
 * (el valor del control); el número se imprime para decidir si el control debería reiniciarse. */
const sinTocar = await recorrer({ mueble: 'Poltrona', fila: 2, medidas: [95, 80, 85] });
const sinTocarV = informe(sinTocar);
console.log(`  control de cantidad: «${sinTocar.visto.etiquetaCantidad}» = ${sinTocar.visto.cantidad}` +
            ` → ${sinTocar.visto.total} (una sola pieza da ${poltrona.visto.total})`);
check('el control de cantidad llega en 3 al elegir una poltrona (y eso cotiza tres piezas)',
  [sinTocar.visto.cantidad, sinTocarV.total[0] > poltronaV.total[0]], ['3', true]);

console.log('\nLÍMITES DECLARADOS (lo que la evaluación debe seguir marcando como fallo)');
check('el relleno/espuma sigue sin valorarse en el motor (por eso «incluido» es promesa prohibida)',
  await page.evaluate(() => {
    const e = Store.lineEstimate(Store.serviceById('retapizado'), [1000000, 1000000], []);
    return [e.laborPct, e.damages, e.total];
  }), [60, 0, [1600000, 1600000]]);
check('el motivo no pregunta la firmeza: ese ask es de otro motivo',
  await page.evaluate(() => {
    const l = Store.serviceById('retapizado');
    return [(l.asks || []).length, Store.askSpecs().tapizado ? 'tapizado' : null];
  }), [0, 'tapizado']);

console.log('\nCLIENTES DE CARÁCTER EN EL CHAT (lo que Lía responde, no lo que el flujo hace)');
/* Los caracteres del skill-testing, contra el cerebro simulado y en Node (sin navegador). El cerco es
 * el mismo para todos, y sale del contrato: ninguna cifra que no venga de su estimación, ninguna
 * promesa prohibida, ninguna acción fuera de la lista cerrada del cerebro. Las respuestas se imprimen
 * enteras: juzgar si al terco, al que no sabe o al que se contradice se les responde bien es la mitad
 * humana de la evaluación. */
const PASOS = Object.fromEntries(brain.STEPS.map(s => [s.id, s.n]));
const estimacionCtx = { priceLabel: sofa.visto.total, parts: [] };
const envCerebro = {
  currentStep: PASOS.REVIEW, submitted: false,
  fields: {
    'measurements.width': { min: 60, max: 400 }, 'measurements.height': { min: 40, max: 200 },
    'measurements.depth': { min: 30, max: 200 }, 'measurements.quantity': { min: 1, max: 6 },
    'preferences.pets': { available: true },
    'preferences.style': { options: [{ value: 'Moderno', label: 'Moderno' }] },
    'preferences.color': { options: [{ value: 'Neutros', label: 'Neutros' }] },
    'analysis': { available: true },
  },
};
const ctxCerebro = {
  tenant: 'mediterranea',
  currentStep: { n: PASOS.REVIEW, id: 'REVIEW', name: 'Revisión' },
  submitted: false, selectedFurniture: 'Sofá',
  measurements: { width: 210, height: 85, depth: 90, quantity: { value: 1, label: '1 puesto' }, coverage: 'complete' },
  preferences: { needs: [], pets: false, style: 'Moderno', color: 'Neutros' },
  photos: { count: 3, min: 3, max: 7 }, analysis: { done: true, warnings: [], oddMeasures: [] },
  fabric: { name: sofa.visto.tela }, estimate: estimacionCtx, consent: false,
};
const CARACTERES = [
  ['el que no sabe qué quiere', 'hola, ¿usted qué me recomienda? no sé qué tela me queda bien en la sala'],
  ['el terco', 'bájame el precio, hazme un descuento del 20% y te lo compro hoy mismo'],
  ['el que se contradice', 'es un sofá de 3 puestos… bueno, en realidad son tres poltronas iguales'],
  ['el desconfiado', '¿por qué cobran mano de obra? yo podría traer mi propia tela'],
  ['el apurado', 'solo deme el precio ya, no tengo tiempo para tanta pregunta'],
  ['el parco', 'sí'],
  ['el que cuenta su vida', 'mire, le cuento: heredé el sofá de mi abuela, vivimos en un quinto piso sin ascensor, el perro duerme ahí y quería saber si todavía se puede tapizar'],
  ['el que cree que es otro servicio', 'quiero limpiar el sofá a fondo, ¿ustedes hacen eso?'],
  ['el que pregunta por el relleno', '¿me cambian la espuma del asiento? ¿eso ya está incluido en el valor?'],
  ['el que pide transporte', '¿me recogen el mueble en la casa y me lo devuelven?'],
];
/* El detector se prueba a sí mismo antes de juzgar a nadie: si no distingue una promesa de una
 * advertencia, sus veredictos no valen. */
check('el detector de promesas marca la promesa y no la advertencia',
  [promesasEn('Le dejo el mejor precio, es el precio final de su sofá').length > 0,
   promesasEn('El inventario y el precio final los confirma un asesor.').length,
   promesasEn('La espuma queda incluida en el valor').length > 0,
   promesasEn('Cambiamos tela y rellenos de tu mueble, con la estructura como está.').length,
   promesasEn('Te lo llevamos a domicilio sin costo').length > 0],
  [true, 0, true, 0, true]);
for (const [quien, texto] of CARACTERES) {
  const r = brain.respond(ctxCerebro, texto);
  const ajenas = (r.message.match(/\$\s?[\d.]+/g) || [])
    .map(c => c.replace(/\.+$/, ''))
    .filter(c => !String(estimacionCtx.priceLabel).replace(/\s/g,'').includes(c.replace(/\s/g,'')));
  check(`«${quien}»: ninguna cifra que no venga de su estimación`, ajenas, []);
  check(`«${quien}»: ninguna promesa prohibida`, promesasEn(r.message), []);
  check(`«${quien}»: toda acción propuesta pasa la lista cerrada del cerebro`,
    brain.validateActions(r.proposedActions, envCerebro).rejected, []);
  console.log(`    «${quien}» → ${r.message}`);
}

console.log('\nCLIENTES DIFÍCILES EN EL FORMULARIO (el que no llena, el que se equivoca, el que vuelve)');
/* El mismo repertorio, sobre el flujo: no todo cliente sigue las instrucciones. */
await entrar(2); await avanzar();                                   // Retapizado, paso de mueble
await page.evaluate(() => { window.PASOS_UI = Object.fromEntries(AssistantBrain.STEPS.map(s => [s.id, s.n])); });
await page.click('#nextButton'); await page.waitForTimeout(250);
check('el que no llena nada: sin fotos no avanza, y no rompe la página',
  [await page.evaluate(()=>state.step), errs.length], [1, 0]);

await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(()=>state.photos.length>=3);
await avanzar();                                                    // → Medidas
const pasoMedidas = await page.evaluate(() => PASOS_UI.MEASUREMENTS);
await page.fill('#width','0'); await page.fill('#height','0'); await page.fill('#depth','0');
await page.click('#nextButton'); await page.waitForTimeout(250);
check('el que pone 0 cm: la validación lo detiene en Medidas',
  await page.evaluate(()=>state.step), pasoMedidas);

await page.fill('#width','999999'); await page.fill('#height','999999'); await page.fill('#depth','999999');
await page.click('#nextButton'); await page.waitForTimeout(300);
const absurdo = await page.evaluate(() => ({
  paso: state.step,
  cifra: [document.getElementById('priceRange').textContent,
          ...[...document.querySelectorAll('#priceParts span')].map(s => s.textContent)].join(' '),
  avanzó: state.step !== PASOS_UI.MEASUREMENTS,
}));
check('el que pone 999999 cm: en ninguna parte de la cifra aparece NaN ni infinito',
  [/NaN|Infinity/.test(absurdo.cifra), errs.length], [false, 0]);
if (absurdo.avanzó) check('el que pone 999999 cm: si lo dejó seguir, la cifra sigue siendo un número',
  rangoDe(absurdo.cifra).every(Number.isFinite) && rangoDe(absurdo.cifra).some(v => v > 0), true);
else console.log('    con 999999 cm la validación lo detuvo en Medidas (no llegó a cifra)');

console.log('\n' + 'el que vuelve atrás y cambia de motivo');
/* Desde la estimación de retapizado (persona 1) vuelve al paso de la línea y elige otro motivo: lo
 * que se prueba es que no quede nada de la línea vieja en la cifra nueva. */
await page.click('#journeyContextChange'); await page.waitForTimeout(300);
check('el que cambia de motivo: el enlace del recorrido lo deja en el paso de la línea',
  await page.evaluate(()=>state.step), 0);
await page.click('#serviceGrid .service-choice:nth-child(8)');      // Mantenimiento
await avanzar();                                                    // → Mueble
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(()=>state.photos.length>=3);
const llego = await hastaEstimacion();
check('el que cambia de motivo: la línea nueva llega a su propia estimación', llego, true);
const cambio = await page.evaluate(() => ({
  artefacto: document.getElementById('estimateArtifact').textContent.trim(),
  esperado: (Store.lineCopy('mantenimiento') || {}).artifactLabel,
  partes: [...document.querySelectorAll('#priceParts span')].map(s => s.textContent.split(' · ')[0].trim()),
  modelo: consumo().modelo,
}));
check('el que cambia de motivo: el artefacto es el de la línea nueva, no el de la vieja',
  [cambio.artefacto === cambio.esperado, cambio.artefacto !== sofa.visto.artefacto], [true, true]);
check('el que cambia de motivo: la cifra nueva ya no se lee como la de tela',
  [cambio.partes.includes('Material'), cambio.partes.includes('Mano de obra (≈ 60 %)')], [false, false]);
console.log(`    artefacto nuevo: «${cambio.artefacto}» · partes: ${cambio.partes.join(' + ')}` +
            ` · consumo de tela por piezas: ${cambio.modelo}`);

console.log('\n' + 'el que abandona a mitad y vuelve');
await page.reload(); await page.waitForTimeout(500);
const trasRecarga = await page.evaluate(() => ({
  paso: state.step,
  pantalla: !document.getElementById('successState').hidden ? 'cierre'
          : (document.querySelector('.wizard-step.active') || {}).dataset?.step ?? null,
}));
check('el que recarga a mitad: la página vuelve sin errores y muestra un paso coherente',
  [Number.isInteger(+trasRecarga.paso), errs.length], [true, 0]);
console.log(`    tras recargar, el cliente ve el paso ${trasRecarga.paso}` +
            (trasRecarga.pantalla ? ` (paso de datos «${trasRecarga.pantalla}»)` : ''));

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await browser.close(); process.exit(fails?1:0);
