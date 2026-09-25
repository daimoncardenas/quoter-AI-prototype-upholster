/* LA CONVERSACIÓN LLENA EL CONTRATO — y el formulario se mueve detrás.
 *
 * Spec de la conversación (docs/contrato-conversacional.md), sobre la página servida en `file://`
 * para que corra sin API: aquí el que pregunta es el cerebro simulado y el que decide es el
 * contrato. Lo que se comprueba es el contrato de la feature:
 *
 *   · la capa es TRANSPARENTE (el formulario se ve detrás) y el formulario se mueve con lo declarado
 *   · lo que el cliente dice entra por los MISMOS controles del formulario (estado uno solo)
 *   · las fotos se suben por el componente del modal, con la misma tubería (`loadPhotos`)
 *   · lo que el contrato prohíbe NO entra (una medida imposible se rechaza con la frase del form)
 *   · la autorización no la puede marcar la conversación: queda pendiente y ella lo dice
 *   · sin nada que falte, `puedeEnviar` es true; con la autorización pendiente, no se puede enviar
 *
 *   node tests/conversacion.spec.mjs
 */
import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';

const D = 'file://' + process.cwd() + '/generated/';
const FOTOS = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.stack || e)));
await p.goto(D + 'index.html');
await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await p.waitForTimeout(500);

/* El driver tarda en asentarse (la revisión corre sola en su paso: ~1,2 s, y el turno con el
 * modelo puede tardar): se espera a que el campo pendiente quede ESTABLE antes de responder —
 * responder antes deja la respuesta consumida por el turno anterior (medido). */
const esperarElTurno = async () => {
  await p.waitForTimeout(400);
  for (let i = 0; i < 40; i++) {
    if (await p.evaluate(() => voz.turno === false)) return;
    await p.waitForTimeout(250);
  }
};
const responder = async (texto) => { await p.fill('#vozInput', texto); await p.press('#vozInput', 'Enter'); await esperarElTurno(); };
const ultimoDicho = () => p.innerText('#vozMessages .message:last-child');
const todaLaConversacion = () => p.innerText('#vozMessages');

console.log('\nLA CAPA: SIN VELO, CON EL FORMULARIO DETRÁS A LA VISTA (dueño, 25/09: «we need the modal in the same part where exist the chat original… si el usuario puede ver cómo el wizard se mueve solo, es impresionante»)');
await p.click('#vozFab');
await p.waitForTimeout(300);
const capa = await p.evaluate(() => {
  const modal = document.getElementById('vozModal'), card = modal.querySelector('.voz-card');
  const est = getComputedStyle(card), estModal = getComputedStyle(modal);
  const caja = card.getBoundingClientRect();
  return { visible: !modal.hidden, wizardDetras: !!document.querySelector('.wizard-step.active'),
    blur: est.backdropFilter, fondo: est.backgroundColor, velo: estModal.backgroundColor,
    derecha: Math.round(window.innerWidth - caja.right), abajo: Math.round(window.innerHeight - caja.bottom),
    ancho: Math.round(caja.width) };
});
check('la conversación abre sobre el formulario, que sigue a la vista — sin velo ni desenfoque',
  [capa.visible, capa.wizardDetras, /none/.test(capa.blur), /rgba\(0, 0, 0, 0\)/.test(capa.velo)], [true, true, true, true]);
check('y la tarjeta es sólida (el texto no compite con lo de atrás)',
  /rgb\(255, 255, 255\)/.test(capa.fondo), true);
check('y vive donde vive el chat original: dentro de la barra, y el progreso le cede su banda',
  await p.evaluate(() => ({
    chatting: document.querySelector('.journey').classList.contains('chatting'),
    progreso: getComputedStyle(document.querySelector('.journey .step-list')).display,
    enLaBarra: (() => { const m = document.getElementById('vozModal').getBoundingClientRect(),
      j = document.querySelector('.journey').getBoundingClientRect();
      return m.left >= j.left - 2 && m.right <= j.right + 2; })(),
  })), { chatting: true, progreso: 'none', enLaBarra: true });
/* Mientras ella trabaja, el cotizador se VE pero no se edita (dueño, 25/09), y el botón de enviar
 * del modal cabe entero — el texto largo del campo ya no lo empuja fuera de la tarjeta. */
check('y el cotizador queda a la vista pero sin ratón (se llena solo)',
  await p.evaluate(() => getComputedStyle(document.querySelector('.workspace')).pointerEvents), 'none');
check('y el botón de enviar del modal cabe entero en su fila',
  await p.evaluate(() => {
    const b = document.querySelector('.voz-form button[aria-label="Enviar"]').getBoundingClientRect();
    const c = document.querySelector('.voz-card').getBoundingClientRect();
    return b.width > 20 && b.right <= c.right + 1;
  }), true);

console.log('\nPRIMERA PREGUNTA: LA LÍNEA (con las de su plan)');
const primera = await ultimoDicho();
/* La verdad es la rejilla del paso 0 — las líneas que el plan de ESTE cliente habilita y que el
 * cliente ve: el flag `enabled` del store trae una de más (visto el 25/09 con «Reparación»). */
const lineas = await p.evaluate(() => lasLineasDelCliente().map(l => l.rotulo));
check('pregunta por la línea y dice las opciones', lineas.every(l => primera.includes(l)), true);

console.log('\nLO DICHO ENTRA AL FORMULARIO (estado uno solo)');
/* EL WIZARD CAMINA SOLO (dueño, 25/09: «assistant can click and "continuar"» y «dont push
 * continue… should continue with the next step»): ella pulsa el botón de verdad y el formulario
 * avanza a la vista. Se espía el clic desde antes de la primera respuesta. */
await p.evaluate(() => {
  const b = document.getElementById('nextButton'); const orig = b.click.bind(b);
  window.__continuars = 0; b.click = () => { window.__continuars++; orig(); };
});
await responder('quiero retapizar el sofá de mi casa');
const trasLinea = await p.evaluate(() => ({ servicio: state.service && state.service.id, paso: state.step,
  progreso: document.getElementById('vozProgreso').textContent }));
check('la línea queda elegida en el estado del formulario', /retapizado/.test(String(trasLinea.servicio)), true);
check('y el progreso lo dice sobre lo que esa línea pide', /de 11/.test(trasLinea.progreso), true);
/* Con la línea elegida, lo que falta son las fotos (sin paso): el wizard no se queda esperando —
 * sigue al siguiente paso que existe, pulsando Continuar él mismo. */
check('y el wizard ya siguió al paso que viene, sin que nadie pulse «Continuar»',
  await p.evaluate(() => [window.__continuars >= 1, state.step]), [true, 1]);

console.log('\nLAS FOTOS, POR EL COMPONENTE DE LA CONVERSACIÓN');
check('el componente está a la vista desde el principio (no espera a que falten)',
  await p.evaluate(() => !document.getElementById('vozFotos').hidden), true);
check('mientras faltan, ella las pide',
  await p.evaluate(() => ({ dicho: /fotos|foto/.test(document.getElementById('vozMessages').innerText) })), { dicho: true });
/* Con las fotos como lo que falta, el componente lo dice encendiendo su caja (dueño, 25/09:
 * «component of photo should be seen»). */
check('y con las fotos pendientes, el componente se enciende (pidiendo)',
  await p.evaluate(() => document.getElementById('vozFotos').classList.contains('pidiendo')), true);
await p.setInputFiles('#vozFotoInput', FOTOS);
await p.waitForTimeout(2200);
check('las fotos entran al MISMO estado del formulario',
  await p.evaluate(() => state.photos.length), 3);
check('y la cuenta del modal lo muestra', /3 de 3/.test(await p.innerText('#vozFotoCuenta')), true);
check('y subidas, el componente deja de pedir',
  await p.evaluate(() => document.getElementById('vozFotos').classList.contains('pidiendo')), false);

console.log('\nLA PREGUNTA DEL MUEBLE — «SOFÁ» VIENE POR DEFECTO, PERO SE PREGUNTA');
/* El formulario trae Sofá elegido, pero eso es un default, no una respuesta: ella pregunta con las
 * palabras del formulario (dueño, 25/09: «assistant should ask "que mueble quieres renovar"»). */
check('ella pregunta con las palabras del formulario, aunque el formulario arranque sin mueble marcado',
  await p.evaluate(() => ({ dicho: /¿Qué mueble quieres renovar\?/.test(document.getElementById('vozMessages').innerText),
    pendiente: (Contrato.faltantes(mundoDelContrato())[0] || {}).id })), { dicho: true, pendiente: 'mueble' });
await responder('es un sofá de tres puestos');
check('y decirlo lo deja elegido de verdad (y el pendiente se va)',
  await p.evaluate(() => ({ dicho: !!voz.muebleDicho,
    falta: Contrato.faltantes(mundoDelContrato()).some(f => f.id === 'mueble') })), { dicho: true, falta: false });

console.log('\nLAS MEDIDAS: LO IMPOSIBLE NO ENTRA, LO POSIBLE SÍ');
await p.fill('#vozInput', 'ancho 2000 alto 85 fondo 90'); await p.press('#vozInput', 'Enter');
await esperarElTurno();
/* La frase del formulario se busca en TODA la conversación: después del tropiezo ella además
 * vuelve a preguntar (distinto), así que la última línea no es el rechazo. */
check('una medida imposible se rechaza con la frase del formulario y no llega al campo',
  [/\d+ cm no es una medida posible/.test(await todaLaConversacion()), await p.inputValue('#width')], [true, '']);
if (await p.inputValue('#width')) console.log('        ancho en el campo: ' + await p.inputValue('#width'));
await responder('ancho 210 alto 85 fondo 90');
check('y tres medidas buenas entran juntas, cada una en su campo',
  await p.evaluate(() => ['width', 'height', 'depth'].map(i => document.getElementById(i).value)), ['210', '85', '90']);
check('y en el orden del mueble, como el cliente las dijo', /210 × 85 × 90/.test(await p.innerText('#vozMessages')), true);
/* El wizard quedó parado donde vive lo que falta AHORA, y llegó ahí pulsando Continuar (no por un
 * salto): si el cotizador no la deja caminar —un paso intermedio suyo sin llenar—, salta, y el
 * registro lo muestra. */
const paseo = await p.evaluate(() => ({ clics: window.__continuars, paso: state.step,
  falta: (Contrato.faltantes(mundoDelContrato())[0] || {}).paso }));
console.log('   caminó: ' + JSON.stringify(paseo));
check('y con el paso completo, el wizard caminó solo pulsando «Continuar» hasta el paso de lo que falta',
  [paseo.clics >= 1, paseo.falta == null ? true : paseo.paso === Number(paseo.falta)], [true, true]);

/* Las medidas de a POCO (dueño, 24/09: «de largo tiene 150 de alto 90…» / «de 90 también»): con UNA
 * sola medida faltante, un número suelto cae en esa — y la frase no exige las tres de una. */
await p.evaluate(() => { const d = document.getElementById('depth'); d.value = ''; d.dispatchEvent(new Event('input', { bubbles: true })); });
await responder('y el fondo es de 90 también');
check('una medida suelta cae en la que faltaba y el campo queda lleno',
  await p.evaluate(() => document.getElementById('depth').value), '90');

console.log('\nLOS INSUMOS DEL TALLER (LA MANO LOS ESTIMA SOLA, NO SE LE PREGUNTAN AL CLIENTE)');
check('tras declarar las medidas, los insumos quedaron estimados sin preguntarle nada al cliente',
  await p.evaluate(() => ({ estimados: insumosMarcados().length > 0,
    preguntado: /insumos del taller/i.test(document.getElementById('vozMessages').innerText) })), { estimados: true, preguntado: false });
/* El estilo y el color vienen con valor por defecto (no son un faltante), pero si el cliente los
 * dice, entran igual a sus selects. */
await responder('estilo natural y color grises');
check('lo que diga del estilo y el color entra a sus dos selects',
  await p.evaluate(() => [document.getElementById('style').value, document.getElementById('color').value].every(Boolean)), true);

console.log('\nLA REVISIÓN (PASO 13)');
await responder('revisa');
check('decir «revisa» corre la revisión aunque el pendiente sea otro', await p.evaluate(() => state.analyzed), true);

console.log('\nEL CIERRE TAMBIÉN VA POR LA CONVERSACIÓN (TELA, AUTORIZACIÓN, ENVÍO)');
/* Después del contacto el cierre sigue AQUÍ: la tela de las mismas tarjetas del cotizador. */
await esperarElTurno();
check('ella pide la tela y la rejilla del cotizador está viva (los nombres los dice el modelo)',
  await p.evaluate(() => {
    const nombres = [...document.querySelectorAll('#fabricGrid .fabric-card b')].map(x => x.textContent.trim()).filter(Boolean);
    const dicho = document.getElementById('vozMessages').innerText;
    return { campo: voz.campo, hayTelas: nombres.length > 0, nombra: /tela/i.test(dicho) };
  }), { campo: 'tela', hayTelas: true, nombra: true });
const telas = await p.evaluate(() => [...document.querySelectorAll('#fabricGrid .fabric-card b')].map(x => x.textContent.trim()));
/* La tela no mueve el wizard (dueño, 25/09: «while is stop in this page… dont click the button
 * "continue"»): la página a la vista se queda donde estaba, y la rejilla de telas igual se pinta. */
check('y la tela no movió el wizard de su página — la rejilla se pintó igual',
  await p.evaluate(() => ({ paso: state.step, tarjetas: document.querySelectorAll('#fabricGrid .fabric-card').length })),
  { paso: 13, tarjetas: 5 });
await responder(telas[0]);
check('decir una tela la marca en el propio cotizador (la tarjeta del formulario)',
  await p.evaluate(() => {
    const marcada = document.querySelector('#fabricGrid .fabric-card.selected');
    return { elegida: document.getElementById('selectedFabric').value, tarjeta: marcada ? marcada.querySelector('b').textContent.trim() : null };
  }), { elegida: telas[0].split(' · ')[0], tarjeta: telas[0] });

/* El último paso del recorrido: la atención y el contacto (después de la tela). */
console.log('\nLA ATENCIÓN Y EL CONTACTO (EL ÚLTIMO PASO)');
await responder('estoy en Bogotá y el servicio es en Bogotá');
check('las ciudades entran a sus dos selects',
  await p.evaluate(() => [document.getElementById('customerCity').value, document.getElementById('serviceCity').value].map(v => v ? v : '')).then(v => v.every(x => /bogot/i.test(x))), true);
await responder('Ana Pérez ana@taller.co 300 123 4567');
check('nombre, correo y celular entran a sus campos',
  await p.evaluate(() => [document.getElementById('fullName').value, document.getElementById('email').value, document.getElementById('phone').value]),
  ['Ana Pérez', 'ana@taller.co', '300 123 4567']);

/* El contacto se ESCRIBE (dueño, 25/09: «email and phone is better when the customer has to write»):
 * los campos del modal llenan los MISMOS campos del formulario. */
check('y el formulario para escribirlos está a la vista cuando son lo que falta',
  await p.evaluate(() => !document.getElementById('vozContacto').hidden), true);
check('escribir en el campo del modal llena el MISMO campo del formulario',
  await p.evaluate(() => {
    const de = document.getElementById('vozCorreo');
    de.value = 'otro@correo.co'; de.dispatchEvent(new Event('input', { bubbles: true }));
    return document.getElementById('email').value;
  }), 'otro@correo.co');
await p.evaluate(() => {
  const de = document.getElementById('vozCorreo');
  de.value = 'ana@taller.co'; de.dispatchEvent(new Event('input', { bubbles: true }));
});

console.log('\nLA AUTORIZACIÓN LA DA ÉL — TOCANDO SU FILA, O HABLANDO');
/* El cierre se asienta unos milisegundos después del contacto (los pasos del wizard siguen
 * corriendo detrás): se espera a que el pendiente sea la firma antes de leer. */
for (let i = 0; i < 25 && !(await p.evaluate(() => voz.campo === 'autorizacion')); i++) await p.waitForTimeout(200);
const antesDeFirmar = await p.evaluate(() => ({
  casilla: document.getElementById('consent').checked, campo: voz.campo,
  fila: !document.getElementById('vozPermiso').hidden,
  boton: /Sí, autorizo/.test(document.getElementById('vozPermisoSi').textContent),
  dicho: /Sí, autorizo/.test(document.getElementById('vozMessages').innerText)
}));
check('ella la pide, la fila del permiso está a la vista y la casilla sigue sin marcar',
  antesDeFirmar, { casilla: false, campo: 'autorizacion', fila: true, boton: true, dicho: true });
await p.click('#vozPermisoSi');
for (let i = 0; i < 20 && !(await p.evaluate(() => voz.campo === 'envio')); i++) await p.waitForTimeout(200);
const firmado = await p.evaluate(() => ({
  autoriza: document.getElementById('consent').checked,
  filaOculta: document.getElementById('vozPermiso').hidden,
  faltantes: Contrato.faltantes(mundoDelContrato()).map(f => f.id),
  puedeEnviar: Contrato.puedeEnviar(mundoDelContrato())
}));
check('su toque marca la autorización del formulario y la fila se va', [firmado.autoriza, firmado.filaOculta], [true, true]);
check('y con eso el contrato queda completo y se puede enviar', [firmado.faltantes, firmado.puedeEnviar], [[], true]);
const precio = await p.evaluate(() => document.getElementById('priceRange').textContent.trim());
check('el cierre dice el número que calculó el motor (o que un asesor lo confirma): nunca lo inventa',
  await p.evaluate(precio => {
    const dicho = document.getElementById('vozMessages').innerText;
    return /por confirmar|—/.test(precio) ? /confirma un asesor|lo calcula el cotizador/.test(dicho) : dicho.includes(precio);
  }, precio), true);
/* LA PRE-COTIZACIÓN SE CREA SOLA al completarse (dueño, 25/09: «dont create quote… cuando se termine,
 * cree la cotización»): el cliente ya no tiene que buscar el botón «Enviar pre-cotización». */
const creada = await p.evaluate(async () => {
  for (let i = 0; i < 25 && !voz.creada; i++) await new Promise(r => setTimeout(r, 200));
  return { creada: !!voz.creada, pantalla: !document.getElementById('successState').hidden,
    numero: String((document.getElementById('requestNumber') || {}).textContent || '') };
});
check('la pre-cotización se crea sola al completarse y su número queda a la vista',
  [creada.creada, creada.pantalla, /COT-\d+/.test(creada.numero)], [true, true, true]);

console.log('\nEL FORMULARIO SE MOVIÓ DETRÁS');
check('los pasos del formulario siguen siendo los del formulario (paso activo válido)',
  await p.evaluate(() => Number.isInteger(state.step) && !!document.querySelector('.wizard-step[data-step="' + state.step + '"]')), true);

await p.close(); await b.close();
if (errs.length) { console.log('\nErrores de página:'); for (const e of errs) console.log('  ' + e.slice(0, 300)); }
const total = fails + errs.length;
console.log(total ? `\n${total} FALLO(S)` : '\nALL PASS');
process.exit(total ? 1 : 0);
