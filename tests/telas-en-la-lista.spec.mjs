/* LAS TELAS EN EL PASO DE LA LISTA — y los datos que el asistente ya guarda (docs/telas-en-la-lista.md).
 *
 * El dueño, el 24/09, después de hablar con Lía en la ruta corta: «this conversation show that AI dont
 * save data of customer in the interaction .... you can use local storage... whatever.... and
 * aditional.. dont apply actions.... dont recommend ... but is for wizard dont have recommend... can
 * you put a button in the wizard for recommed fabric... the last collections... and remember the
 * assistant should have acces to fabrics..and values... and can calculate...».
 *
 * Y en la segunda pasada, mirando el paso de «Reventa o inventario»: «even I can see are missing two
 * steps... between "reventa o inventario"...and ..."que referencia y cuantas"...because should exist
 * before.. "ya sabes que tipo de tela requieres" and "quiero sugerencias"....after that... if choose
 * "ya sabes que tipo de tela requieres"..show the current next step... without button
 * recommendation... but if choose "quiero sugerencias"...you can add another step like a this...
 * [el paso de preferencias]...and after that... run assistant recommendation action....».
 *
 * Lo que se comprueba:
 *
 *   1 · LA RAMA PREGUNTA QUÉ SABE EL CLIENTE, con las dos respuestas del dueño, y cada una decide el
 *       recorrido: «sé qué tela quiero» → la lista y el cierre (sin recomendación, sin vitrina);
 *       «quiero sugerencias» → la preferencia (necesidades, estilo, gama) y la recomendación, y la
 *       tela que sale de ahí entra en la fila de la lista
 *   2 · el ESTADO de cada turno lleva la rama, lo declarado y el contacto (declarado o no)
 *   3 · el prompt del modelo lleva el CATÁLOGO y `lista`/`pedido` entran en lo que puede llenar
 *   4 · la VITRINA del paso (donde el camino no la respondió solo): el botón, el panel, las últimas
 *       colecciones de primeras, y la elegida entra en la fila por su select (como un dedo)
 *   5 · la conversación APLICA la lista y el pedido por los mismos controles
 *   6 · el CERCO deja pasar los precios del catálogo y tumba una cifra inventada
 *
 *   node tests/telas-en-la-lista.spec.mjs
 */
import { chromium } from 'playwright';
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
  await page.waitForTimeout(200);
};
const avanzar = async () => {
  const antes = await page.evaluate(() => state.step);
  await page.click('#nextButton');
  await page.waitForFunction(x => state.step !== x, antes).catch(() => {});
  await page.waitForTimeout(180);
};
/* Suministro de tela → compra nueva → el propósito → (la respuesta del saber, si se dice). Con
 * `saber` null el wizard queda EN la pregunta del saber; con una respuesta, en el paso de la lista. */
const abrirSuministro = async (proposito, saber) => {
  await fresh();
  await page.click('#serviceGrid .service-choice:has-text("Suministro de tela")');
  await page.waitForTimeout(200);
  await avanzar();
  await page.click('#routeGrid .service-choice:has-text("Nueva compra")');
  await page.waitForTimeout(150);
  await avanzar();
  await page.click(`#purposeGrid .service-choice:has-text("${proposito}")`);
  await page.waitForTimeout(200);
  await avanzar();
  if (saber) {
    await page.click(`#saberGrid .service-choice:has-text("${saber}")`);
    await page.waitForTimeout(200);
    await avanzar();
  }
};
const abrirReventa = (saber = 'Sé qué tela quiero') => abrirSuministro('Reventa o inventario', saber);

console.log('\nLA RAMA PREGUNTA QUÉ SABE EL CLIENTE (las dos respuestas del dueño)');
await abrirSuministro('Reventa o inventario', null);
const elSaber = await page.evaluate(() => ({
  paso: state.step, elegido: state.saber,
  tarjetas: [...document.querySelectorAll('#saberGrid .service-choice')].map(c => (c.querySelector('b') || {}).textContent),
  visibles: pasosVisibles()
}));
check('el paso existe, con las dos respuestas', [elSaber.paso, elSaber.tarjetas],
  [23, ['Sé qué tela quiero', 'Quiero sugerencias']]);
check('y trae su respuesta por defecto marcada («sé qué tela quiero»)', elSaber.elegido, 'se-tela');
check('esa respuesta deja la lista y el cierre, sin paso de recomendación',
  elSaber.visibles, [0, 18, 22, 23, 20, 16, 15]);
check('y la vitrina no se le ofrece: el cliente ya dijo que sabe la tela',
  await page.evaluate(() => document.getElementById('listaSugerirFila').hidden), true);

await page.click('#saberGrid .service-choice:has-text("Quiero sugerencias")');
await page.waitForTimeout(200);
check('«quiero sugerencias» pone las características y la recomendación ANTES de la lista',
  await page.evaluate(() => pasosVisibles()), [0, 18, 22, 23, 12, 14, 16, 15]);
check('y la vitrina tampoco: la sugerencia tiene su propio paso',
  await page.evaluate(() => document.getElementById('listaSugerirFila').hidden), true);
await avanzar();
const preferencia = await page.evaluate(() => ({
  paso: state.step,
  titulo: (document.querySelector('.wizard-step[data-step="12"] h2') || {}).textContent,
  seccion: (document.querySelector('.wizard-step[data-step="12"] h3') || {}).textContent,
  necesidades: document.querySelectorAll('#needsGrid input').length,
  estilo: !!document.getElementById('style'), color: !!document.getElementById('color')
}));
check('lo siguiente son las características, y su título habla de la tela (en esta rama no hay mueble)',
  [preferencia.paso, /necesitas de la tela/i.test(String(preferencia.seccion)),
   /^¿Cómo se usará la tela\?$/.test(String(preferencia.titulo)), preferencia.necesidades > 0,
   preferencia.estilo, preferencia.color],
  [12, true, true, true, true, true]);
await avanzar();
const recomendacion = await page.evaluate(() => ({
  paso: state.step,
  tarjetas: [...document.querySelectorAll('#fabricGrid .fabric-card')].map(c => (c.querySelector('b') || {}).textContent)
}));
check('y después la recomendación, con las telas del catálogo', [recomendacion.paso, recomendacion.tarjetas.length >= 5],
  [14, true]);
check('y la barra de pasos lista el recorrido en SU orden (no el del documento)',
  await page.evaluate(() => [...document.querySelectorAll('[data-step-dot]')].filter(l => !l.hidden).map(l => +l.dataset.stepDot)),
  [0, 18, 22, 23, 12, 14, 16, 15]);
/* El dueño: «you cant pass if dont choose some fabric... and if some fabric dont have cantidad...
 * then show alert for this» — el paso de la lista NO vuelve (ahí ya se declaró todo). */
await avanzar();
const sinTela = await page.evaluate(() => ({ paso: state.step, alerta: document.getElementById('recoError').textContent }));
check('sin ninguna tela elegida no se pasa, y el aviso lo dice',
  [sinTela.paso, /Elige al menos una tela/.test(sinTela.alerta)], [14, true]);
await page.evaluate(() => document.querySelector('#fabricGrid .fabric-card .fabric-pick').click());
await page.waitForTimeout(250);
await avanzar();
const sinCantidad = await page.evaluate(() => ({ paso: state.step, alerta: document.getElementById('recoError').textContent }));
check('y una tela elegida sin su cantidad tampoco — el aviso dice CUÁL falta',
  [sinCantidad.paso, /^Dile cuánto necesitas de .+ para continuar\.$/.test(sinCantidad.alerta)], [14, true]);
check('el paso deja elegir VARIAS telas —no solo una— y cada una entra a la lista',
  await page.evaluate(() => {
    const marcadas = [...document.querySelectorAll('#fabricGrid .fabric-card.selected')].map(c => c.dataset.fabric);
    const campos = [...document.querySelectorAll('#fabricGrid .reco-cantidad-input')].length;
    return { marcadas, campos, filas: filasDeLaLista().map(r => [String(r.fabricId), r.metros]) };
  }),
  await page.evaluate(() => {
    const primera = document.querySelector('#fabricGrid .fabric-card');
    return { marcadas: [primera.dataset.fabric], campos: 1, filas: [[primera.dataset.fabric, 0]] };
  }));
/* La cantidad es de CADA tela elegida: su campo vive en su tarjeta y escribe SU fila. Se elige por
 * el botón de la tarjeta (`<button class="fabric-pick">`), que es el que lleva el manejador. */
const elegir = (tela) => page.evaluate(t => {
  const c = [...document.querySelectorAll('#fabricGrid .fabric-card')].find(x => x.textContent.includes(t));
  (c.querySelector('.fabric-pick') || c).click();
}, tela);
const escribirCantidad = (tela, valor) => page.evaluate(([t, v]) => {
  const c = [...document.querySelectorAll('#fabricGrid .fabric-card')].find(x => x.textContent.includes(t));
  const i = c.querySelector('.reco-cantidad-input');
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
}, [tela, valor]);
await elegir('Velvet Siena');
await page.waitForTimeout(250);
await escribirCantidad('Velvet Siena', '22');
await page.waitForTimeout(200);
/* Lino Verona ya quedó elegido arriba (el primer clic del paso): su campo de cantidad ya está. */
await escribirCantidad('Lino Verona', '8');
await page.waitForTimeout(250);
check('y cada una declara SU cantidad: dos telas elegidas, dos filas, cada una con sus metros',
  await page.evaluate(() => filasDeLaLista().map(r => [String(r.fabricId), r.unidad, r.metros]).sort()),
  await page.evaluate(() => {
    const id = t => [...document.querySelectorAll('#fabricGrid .fabric-card')].find(x => x.textContent.includes(t)).dataset.fabric;
    return [[id('Velvet Siena'), 'm', 22], [id('Lino Verona'), 'm', 8]].sort();
  }));
const laCantidad = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#fabricGrid .fabric-card')].find(x => x.textContent.includes('Lino Verona'));
  const campo = c.querySelector('.reco-cantidad');
  return { enSuTarjeta: !!campo, unidad: (campo.querySelector('.unit') || {}).textContent,
           ayuda: (campo.querySelector('small') || {}).textContent };
});
check('el campo vive en la tarjeta de ESA tela, con su unidad y lo que hará',
  [laCantidad.enSuTarjeta, laCantidad.unidad, /tu lista/i.test(String(laCantidad.ayuda))], [true, 'm', true]);
/* Y soltar una tela se lleva su fila: la lista es del cliente. */
await page.evaluate(() => {
  const c = [...document.querySelectorAll('#fabricGrid .fabric-card')].find(x => x.textContent.includes('Velvet Siena'));
  c.click();
});
await page.waitForTimeout(250);
check('y soltar una tela quita SU fila (las demás quedan)',
  await page.evaluate(() => filasDeLaLista().map(r => [r.unidad, r.metros])), [['m', 8]]);
await avanzar();
const laEstimacion = await page.evaluate(() => ({
  paso: state.step,
  precio: document.getElementById('priceRange').textContent,
  dice: document.querySelector('.wizard-step[data-step="16"]').innerText
}));
check('y el cierre cotiza lo que el cliente armó en la recomendación (el paso de la lista no vuelve)',
  [laEstimacion.paso, laEstimacion.precio !== 'Por confirmar', /Lino Verona/.test(laEstimacion.dice)],
  [16, true, true]);

console.log('\nEL ESTADO DEL TURNO LLEVA LO QUE YA SE DIJO (la rama, la lista, el contacto)');
await abrirReventa();
const estado = () => page.evaluate(() => estadoDelCotizador(ACI.context()));
check('la rama elegida viaja en el estado (ruta → propósito → saber)',
  (await estado()).split('\n').filter(l => l.startsWith('Camino elegido')),
  ['Camino elegido por el cliente: «Nueva compra» → «Reventa o inventario» → «Sé qué tela quiero».']);
await page.evaluate(() => {
  const pon = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  pon('fullName', 'Diamond Cárdenas'); pon('email', 'diamond@ejemplo.com');
});
await page.waitForTimeout(150);
check('con el nombre y el correo declarados, el estado lo dice (sin los valores: la autorización no está)',
  (await estado()).split('\n').filter(l => l.startsWith('Datos de contacto')),
  ['Datos de contacto: ya declarados el nombre, el correo (sin autorización todavía). No los vuelvas a pedir: falta la autorización, y la da el cliente.']);
check('y sin autorización los VALORES no entran al contexto (Ley 1581)', await page.evaluate(() => 'contact' in ACI.context()), false);
await page.evaluate(() => { const c = document.getElementById('consent'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForTimeout(150);
check('con la autorización marcada, el contexto sí lleva el contacto',
  await page.evaluate(() => (ACI.context().contact || {}).name), 'Diamond Cárdenas');

console.log('\nEL PROMPT LLEVA EL CATÁLOGO — Y LA LISTA Y EL PEDIDO ENTRAN A LO QUE PUEDE LLENAR');
const prompt = await page.evaluate(() => promptDeLaConversacion(mundoDelContrato()));
check('nombra las telas activas con su colección y su precio por metro',
  [/Lino Verona · Arena — colección Naturales — \$\s?[\d.]+\/m/.test(prompt),
   /Bouclé Capri · Marfil — colección Texturas \(última colección\) — \$\s?[\d.]+\/m/.test(prompt)],
  [true, true]);
check('no nombra la tela inactiva (Milo Protect está apagada en el seed)', /Milo Protect/.test(prompt), false);
check('y `lista` y `pedido` están entre los campos que puede llenar',
  [/lista \(las referencias con su cantidad/.test(prompt), /pedido \(el número de la solicitud anterior/.test(prompt)], [true, true]);

console.log('\nLA VITRINA DEL PASO (donde el camino no la respondió solo): EL BOTÓN, EL PANEL Y LA ELECCIÓN');
await abrirSuministro('Mi servicio de tapicería', 'Conozco la tela y cuánto necesito');
check('el paso de la lista tiene su botón', await page.isVisible('#listaSugerir'), true);
check('y el panel arranca cerrado', await page.isVisible('#listaVitrina'), false);
await page.click('#listaSugerir');
await page.waitForTimeout(250);
const vitrina = await page.evaluate(() => ({
  abierto: !document.getElementById('listaVitrina').hidden,
  expandido: document.getElementById('listaSugerir').getAttribute('aria-expanded'),
  tarjetas: [...document.querySelectorAll('#telasGrid .fabric-card')].map(c => ({
    tela: (c.querySelector('b') || {}).textContent,
    sello: (c.querySelector('.best-match') || {}).textContent,
    precio: (c.querySelector('small') || {}).textContent.slice(0, 12)
  })),
}));
check('el panel abre con las cinco telas activas', [vitrina.abierto, vitrina.expandido, vitrina.tarjetas.length], [true, 'true', 5]);
check('y las últimas colecciones van de primeras (el sello lo dice)',
  vitrina.tarjetas.slice(0, 2).map(c => c.sello), ['Última colección', 'Última colección']);
check('cada tarjeta dice su colección y su precio de referencia',
  vitrina.tarjetas.slice(2).map(c => /colección/i.test(c.sello)), vitrina.tarjetas.slice(2).map(() => true));
await page.evaluate(() => [...document.querySelectorAll('#telasGrid .fabric-card')].find(c => c.textContent.includes('Bouclé Capri')).click());
await page.waitForTimeout(250);
check('la elegida entra en la fila por su select, como un dedo',
  await page.evaluate(() => ({ valor: document.querySelector('#listRows .list-fabric').value,
    tela: document.querySelector('#listRows .list-fabric').selectedOptions[0].textContent,
    panel: document.getElementById('listaVitrina').hidden })),
  { valor: '3', tela: 'Bouclé Capri · Marfil', panel: true });

console.log('\nLA CONVERSACIÓN APLICA LA LISTA Y EL PEDIDO (los mismos controles del formulario)');
await abrirReventa();
check('«veinte metros de lino verona» entra a la lista',
  await page.evaluate(() => aplicarLoDicho('lista', 'veinte metros de lino verona')),
  await page.evaluate(() => ({ ok: true, dicho: 'Lino Verona · Arena: 20 metros' })));
check('y la fila queda con su referencia y su cantidad',
  await page.evaluate(() => filasDeLaLista().map(r => [r.fabricId, r.unidad, r.valor, r.metros])),
  await page.evaluate(() => [[1, 'm', 20, 20]]));
check('una referencia que no está en el catálogo se rechaza con su motivo',
  await page.evaluate(() => aplicarLoDicho('lista', 'treinta metros de tela inventada')),
  await page.evaluate(() => ({ ok: false, motivo: 'dime la referencia del catálogo y te digo sus metros' })));
/* La tela de ROLLO (Milo Protect) viene apagada en el seed: se enciende como lo haría el backoffice,
 * y entonces «dos rollos» son dos rollos — el motor los convierte con el largo del rollo. */
await page.evaluate(() => { const f = Store.all('fabrics').find(x => x.id === 6); Store.put('fabrics', { ...f, active: true }); });
await page.waitForTimeout(150);
check('«dos rollos de milo protect» entra con la unidad de esa tela',
  await page.evaluate(() => aplicarLoDicho('lista', 'dos rollos de milo protect')),
  await page.evaluate(() => ({ ok: true, dicho: 'Milo Protect · Oliva: 2 rollos (60 m)' })));
check('y la fila del rollo declara rollos, con sus metros calculados',
  await page.evaluate(() => filasDeLaLista().filter(r => String(r.fabricId) === '6').map(r => [r.unidad, r.valor, r.rollLengthM, r.metros])),
  await page.evaluate(() => [['rollos', 2, 30, 60]]));
check('el estado dice lo declarado en la lista (ya no se pregunta otra vez)',
  (await estado()).split('\n').filter(l => l.startsWith('Lo declarado en la lista')),
  ['Lo declarado en la lista: Lino Verona 20 m · Milo Protect 2 rollos (60 m).']);
check('«quiero completar el COT-1042» deja la referencia en el pedido',
  await page.evaluate(() => aplicarLoDicho('pedido', 'quiero completar el COT-1042')),
  await page.evaluate(() => ({ ok: true, dicho: 'pedido COT-1042 (lo encontré en este navegador)' })));
check('y el campo del pedido la tiene', await page.evaluate(() => document.getElementById('pedidoBusca').value), 'COT-1042');

console.log('\nEL CERCO: EL PRECIO DEL CATÁLOGO PASA, LA CIFRA INVENTADA NO');
check('una respuesta que cita el precio del catálogo es limpia',
  await page.evaluate(() => CercoAsistente.revisar('El Bouclé Capri está a $ 137.000 el metro de tela; con tus 20 m te sirve.', { estimacion: '', permitidas: preciosDelCatalogo() }).limpia),
  true);
check('una cifra que no es del catálogo ni de la estimación se tumba',
  await page.evaluate(() => CercoAsistente.revisar('Te lo dejo en $99.000 el metro.', { estimacion: '', permitidas: preciosDelCatalogo() }).cifras),
  ['$99.000']);
/* El tema es DATO: el vocabulario del negocio (telas, colecciones, líneas, muebles, ciudades) deja
 * pasar una respuesta que habla de lo suyo aunque no use ninguna de las palabras del piso genérico. */
check('el tema de una respuesta sale del catálogo, no de una lista fija',
  await page.evaluate(() => [
    CercoAsistente.revisar('El Bouclé Capri · Marfil de Texturas te sirve muy bien.', { estimacion: '', permitidas: [], tema: elVocabularioDelNegocio() }).limpia,
    CercoAsistente.revisar('El Bouclé Capri · Marfil de Texturas te sirve muy bien.', { estimacion: '', permitidas: [] }).limpia
  ]), [true, false]);

check('sin errores de página', errs, []);
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
