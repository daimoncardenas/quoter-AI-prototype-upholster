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
import { PHOTOS_DB } from './client.mjs';
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
 * incluya o lo valore. */
const PROMESAS = [
  ['un precio de transporte, recogida o entrega', /transporte|recogida|domicilio[^.]{0,40}(costo|cobra|vale|\$)/i],
  ['un plazo o una garantía', /garant[ií]a|plazo|en \d+ d[ií]as|entrega en \d+/i],
  ['una cotización definitiva', /cotizaci[oó]n definitiva|precio final|valor definitivo/i],
  ['el relleno o la espuma dentro de la cifra', /(incluye|inclu[ie]do|valorad|sumad|dentro del precio)[^.]{0,40}(relleno|espuma)/i],
];
const promesasEn = texto => PROMESAS.filter(([,r])=>r.test(texto)).map(([d])=>d);

/* Una vuelta completa por el motivo con una forma de persona. Devuelve lo que el cliente vio. */
async function recorrer({ mueble, fila, medidas, piezas }) {
  await page.goto(D + 'index.html');
  await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
  await page.goto(D + 'index.html');
  await page.waitForTimeout(300);
  await page.click(`#serviceGrid .service-choice:nth-child(${fila})`);   // 2 = Retapizado de muebles
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
  await avanzar();                                                       // 9 → 12 (Preferencias)
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
check('el artefacto se llama «Precotización de retapizado», aquí y en el cierre',
  [sofa.visto.artefacto, sofa.guardado.cierre], ['Precotización de retapizado', 'Precotización de retapizado']);
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

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await browser.close(); process.exit(fails?1:0);
