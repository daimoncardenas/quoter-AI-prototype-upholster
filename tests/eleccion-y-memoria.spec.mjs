/* EL ASISTENTE ELIGE EL CONTRATO, RECUERDA EL CASO Y MIRA SI LA FOTO SE PUEDE LEER
 * (docs/contrato-conversacional.md, docs/telas-en-la-lista.md).
 *
 * El dueño, el 24/09, corrigiendo el dibujo del flujo:
 *   «el model tiene que elegir por obvias razones cual JSON es de acuerdo al caso y las primeras
 *   preguntas de sondeo... como diablos va a hacer de otra forma»;
 *   «puede guardarse esa memoria en algun LOCAL STORAGE o algo asi para tener acceso a ese contrato
 *   durante la conversacion e ir anotando y completando cada campo de ese contrato»;
 *   «si hay fotos.. tienes que validar que realmente se puedan leer y que sea lo que dicen que es..
 *   o si estan borrosas etc...... para completar ese campo».
 *
 * Lo que se comprueba:
 *
 *   1 · EL ÍNDICE DE CONTRATOS: una fila por rama con el id de su JSON, exactamente los contratos
 *       escritos (ni uno de más ni uno de menos), y viaja en el prompt con la orden de elegir —
 *       lo que el modelo anota en `rama` aplica la cadena entera por los mismos controles
 *   2 · LA MEMORIA ES DE LA CONVERSACIÓN, NO DEL NAVEGADOR: lo declarado vive en la página mientras
 *       se conversa (la rama, la compra, los campos, los mensajes) y una RECARGA EMPIEZA LIMPIO — no
 *       vuelve la rama, ni la compra, ni las medidas, ni la conversación, y no queda borrador en el
 *       almacén (el dueño: «cuando recargo no se borra»). Dentro de la conversación, «empezar
 *       de cero» o cambiar de línea limpian el caso — lo de una pre-cotización no viaja a la siguiente
 *   3 · LA NITIDEZ: la varianza del laplaciano sobre los píxeles (no la palabra del modelo) marca
 *       una foto fuera de foco en la revisión, y deja pasar las nítidas
 *
 *   node tests/eleccion-y-memoria.spec.mjs
 */
import { chromium } from 'playwright';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const D = 'file://' + process.cwd() + '/generated/';

let fails = 0;
const check = (nombre, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${nombre}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));

const fresh = async () => {
  await page.goto(D + 'index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto(D + 'index.html');
  await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
  await page.goto(D + 'index.html');
  await page.waitForTimeout(250);
};

/* Las fotos de prueba: la misma escena dibujada nítida y desenfocada (el velo de 6 px es un
 * desenfoque de foto movida). Devuelve el dataURL y la nitidez que mide el cotizador. */
const fotoDePrueba = (blur) => page.evaluate(async (b) => {
  const cv = document.createElement('canvas'); cv.width = 900; cv.height = 650;
  const cx = cv.getContext('2d'); cx.fillStyle = '#d9d2c7'; cx.fillRect(0, 0, 900, 650);
  cx.strokeStyle = '#2b2b2b'; cx.lineWidth = 3;
  for (let i = 0; i < 60; i++) cx.strokeRect(60 + i * 18, 80 + (i % 5) * 90, 12, 60);
  let out = cv;
  if (b) { const c2 = document.createElement('canvas'); c2.width = 900; c2.height = 650; const x2 = c2.getContext('2d'); x2.filter = 'blur(6px)'; x2.drawImage(cv, 0, 0); out = c2; }
  const dataUrl = out.toDataURL('image/png');
  return { dataUrl, nitidez: await medirNitidez(dataUrl) };
}, blur);

console.log('EL MODELO ELIGE EL CONTRATO — EL ÍNDICE ESTÁ EN EL PROMPT Y LA RAMA SE APLICA ENTERA');
await fresh();
/* Las ramas del wizard (los ids que él conoce, en español) y el contrato de endpoint de cada una
 * (el nombre del archivo, en inglés): el espejo es el que lleva las dos caras. */
const espejos = readdirSync('tests/mirror').filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync('tests/mirror/' + f, 'utf8')));
const ramas = espejos.map(e => e.chain.join('.')).sort();
const contratos = espejos.map(e => e.branch).sort();
check('el índice del cotizador es, exactamente, las ramas del wizard (una por rama)',
  await page.evaluate(() => elIndiceDeContratos().map(c => c.id).sort()), ramas);
check('y cada rama tiene su contrato de endpoint en shared/contracts (el espejo lleva las dos caras)',
  contratos.every(b => existsSync('shared/contracts/' + b + '.json')), true);
check('y no ofrece la línea cuyo contrato está pendiente (mantenimiento)',
  await page.evaluate(() => elIndiceDeContratos().some(c => /^mantenimiento/.test(c.id))), false);
check('el prompt lleva el índice con la orden de elegir y anotar `rama`',
  await page.evaluate(() => {
    const t = promptDeLaConversacion(mundoDelContrato());
    return [t.includes('LAS RAMAS Y SU CONTRATO'), (t.match(/→ contrato [\w.-]+/g) || []).length, t.includes('anótala en `rama`')];
  }), [true, ramas.length, true]);
check('y `rama` es un valor legal de la conversación: la lista de ids',
  await page.evaluate(() => losValoresLegalesDe('rama').length), ramas.length);
check('la rama dicha aplica la cadena entera por los mismos controles (y su recorrido)',
  await page.evaluate(async () => {
    const r = await aplicarValorDelContrato('rama', 'suministro-tela.compra.reventa.sugerencias');
    return [r.ok, laRamaDelEstado(), pasosVisibles()];
  }), [true, 'suministro-tela.compra.reventa.sugerencias', [0, 18, 22, 23, 12, 14, 16, 15]]);
check('y otra rama distinta también (el modelo clasifica por el caso, no por el nombre)',
  await page.evaluate(async () => {
    const r = await aplicarValorDelContrato('rama', 'retapizado');
    return [r.ok, laRamaDelEstado()];
  }), [true, 'retapizado']);
await fresh();
check('una rama inventada no entra y lo dice',
  await page.evaluate(async () => {
    const r = await aplicarValorDelContrato('rama', 'suministro-tela.casino.inventado');
    return [r.ok, /no reconocí/.test(r.motivo || '')];
  }), [false, true]);

console.log('LA MEMORIA ES DE LA CONVERSACIÓN — RECARGAR EMPIEZA LIMPIO');
await fresh();
check('lo declarado vive en la conversación (la rama, la compra, los campos y los mensajes, en la página)',
  await page.evaluate(async () => {
    await aplicarValorDelContrato('rama', 'suministro-tela.compra.reventa.sugerencias');
    await aplicarFilaDeLaLista({ fabricId: 1, cantidad: 2, unidad: 'm' });
    await aplicarValorDelContrato('medidas', { width: '210', height: '85', depth: '90' });
    decirEnLaConversacion('Hola, quiero telas para revender');
    return [laRamaDelEstado(), filasDeLaLista().filter(r => r.metros > 0).length, valorDeCampo('width'), voz.mensajes.length];
  }), ['suministro-tela.compra.reventa.sugerencias', 1, '210', 1]);
check('y RECARGAR empieza limpio: no vuelve la rama, ni la compra, ni las medidas, ni la conversación',
  await page.reload().then(() => page.waitForTimeout(900)).then(() => page.evaluate(() => ({
    rama: laRamaDelEstado(), filas: filasDeLaLista().filter(r => r.metros > 0).length,
    medida: valorDeCampo('width'), mensajes: document.getElementById('vozMessages').textContent.trim() === '',
    enAlmacen: Object.keys(localStorage).filter(k => /draft|borrador/i.test(k))
  }))), { rama: '', filas: 0, medida: '', mensajes: true, enAlmacen: [] });
check('y pedir «empezar de cero» olvida el caso DENTRO de la conversación (sin recargar)',
  await page.evaluate(async () => {
    await aplicarValorDelContrato('rama', 'suministro-tela.compra.reventa.sugerencias');
    await aplicarFilaDeLaLista({ fabricId: 1, cantidad: 2, unidad: 'm' });
    await aplicarValorDelContrato('medidas', { width: '210', height: '85', depth: '90' });
    const antes = [filasDeLaLista().filter(r => r.metros > 0).length, valorDeCampo('width')];
    await elTurnoDeLaConversacion('quiero empezar de cero con otra cosa');
    await new Promise(r => setTimeout(r, 150));
    return [antes[0], antes[1], filasDeLaLista().length, valorDeCampo('width'),
            document.getElementById('vozMessages').textContent.includes('borrón y cuenta nueva')];
  }), [1, '210', 0, '', true]);
check('y cambiar de línea también limpia el caso',
  await page.evaluate(async () => {
    await aplicarValorDelContrato('rama', 'suministro-tela.compra.reventa.sugerencias');
    await aplicarFilaDeLaLista({ fabricId: 1, cantidad: 5, unidad: 'm' });
    const antes = filasDeLaLista().filter(r => r.metros > 0).length;
    const otra = [...document.querySelectorAll('#serviceGrid .service-choice')].find(c => !/Suministro/.test(c.textContent));
    otra.click();
    await new Promise(r => setTimeout(r, 200));
    return [antes, filasDeLaLista().length];
  }), [1, 0]);

console.log('LAS FOTOS BORROSAS — MEDIDAS SOBRE LOS PÍXELES, NO LA PALABRA DEL MODELO');
await fresh();
/* La revisión de fotos vive en una rama que pide fotos y medidas (el mueble): con la rama puesta,
 * la revisión trae sus filas completas. */
await page.evaluate(async () => { await aplicarValorDelContrato('rama', 'suministro-tela.compra.mueble.metros'); });
const nitida = await fotoDePrueba(false), borrosa = await fotoDePrueba(true);
check('la nitidez separa las dos: la nítida arriba del mínimo y la desenfocada abajo (ver NITIDEZ_MINIMA)',
  [nitida.nitidez > await page.evaluate(() => NITIDEZ_MINIMA), borrosa.nitidez < await page.evaluate(() => NITIDEZ_MINIMA)], [true, true]);
check('la revisión lo dice, con la foto buena al lado',
  await page.evaluate(([a, b]) => {
    state.photos = [{ dataUrl: a.dataUrl, width: 900, height: 650, nitidez: a.nitidez },
                    { dataUrl: b.dataUrl, width: 900, height: 650, nitidez: b.nitidez }];
    return runReview().map(c => c.title);
  }, [nitida, borrosa]), ['2 fotografías recibidas', '1 foto fuera de foco', 'Medidas registradas', 'Datos suficientes para estimar', 'Presupuesto declarado']);
check('con las dos nítidas no hay fila de foco',
  await page.evaluate(a => {
    state.photos = [{ dataUrl: a.dataUrl, width: 900, height: 650, nitidez: a.nitidez }];
    return runReview().map(c => c.title).some(t => /fuera de foco/.test(t));
  }, nitida), false);
check('una foto chica sigue avisando por resolución (lo de antes no se perdió)',
  await page.evaluate(() => {
    state.photos = [{ dataUrl: '', width: 300, height: 200, nitidez: 0 }];
    return runReview().map(c => c.detail).some(t => /baja resolución/.test(t));
  }), true);
check('sin errores en la página', errs.length, 0);

await browser.close();
if (fails) { console.log(`\n${fails} FAILING`); process.exit(1); }
console.log('\nALL PASS');
