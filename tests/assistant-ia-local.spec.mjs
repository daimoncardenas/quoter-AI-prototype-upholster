/* LÍA CON EL MODELO LOCAL — el cableado del chat con un modelo que corre en el navegador.
 *
 * Aquí no hay modelo de verdad (el de Chrome vive en el equipo del cliente): se inyecta un
 * `LanguageModel` de mentira con `addInitScript` y se comprueba lo que sí es responsabilidad del
 * producto — que la nota diga la verdad de cada modo, que el modelo reciba el contexto de la casa,
 * que su respuesta se muestre cuando pasa el cerco y que NO se muestre cuando lo rompe (ahí responde
 * el cerebro simulado). El cerco se prueba por su lado, con su lista.
 *
 *   node tests/assistant-ia-local.spec.mjs
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { PHOTOS_DB } from './client.mjs';
const Cerco = createRequire(import.meta.url)('../assistant-fence.js');
const D = 'file://' + process.cwd() + '/generated/';

let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

console.log('\nEL CERCO, POR SU LADO (la lista que juzga al modelo)');
const EST = '$ 1.780.000 – $ 1.993.600';
const juzgar = t => { const r = Cerco.revisar(t, { estimacion: EST }); return [...r.cifras, ...r.promesas, ...r.tema]; };
check('una cifra que no es la de su estimación queda marcada',
  juzgar('El relleno te sale por $ 350.000 más'), ['$ 350.000']);
check('la misma cifra de la estimación no se marca',
  juzgar('Tu estimación va en $ 1.780.000 – $ 1.993.600 y la confirma un asesor'), []);
check('una negación honesta no es una promesa',
  juzgar('Actualmente no ofrecemos servicio de transporte para recoger y devolver los muebles'), []);
check('«no está incluido» tampoco lo es',
  juzgar('El cambio de espuma no está incluido en la cotización que tenemos'), []);
check('pero prometer transporte sí',
  juzgar('Sí, te lo recogemos sin costo y con garantía de un año'),
  ['un precio de transporte, recogida o entrega', 'una garantía']);
check('y el relleno incluido también', juzgar('La espuma ya queda incluida en el valor'), ['el relleno o la espuma dentro de la cifra']);
check('una respuesta que no responde queda marcada', juzgar('necesito plátanos para el techo'), ['no habla del motivo ni de los datos del negocio']);

const browser = await chromium.launch();
const errs = [];

/* ---- 1 · Sin modelo: la nota dice la verdad y responde el cerebro simulado ---- */
{
  const p = await browser.newPage();
  p.on('pageerror', e => errs.push('sin modelo: ' + e));
  /* Este Chromium trae la API (aunque sin modelo detrás): para probar el modo simulado hay que quitarla. */
  await p.addInitScript(() => {
    delete window.LanguageModel;
    if (window.ai) delete window.ai.languageModel;
  });
  await p.goto(D + 'index.html'); await p.waitForTimeout(400);
  console.log(`\n(file:// se reporta como contexto seguro: ${await p.evaluate(() => window.isSecureContext)})`);
  await p.evaluate(() => openChat());
  check('sin modelo la nota dice que son respuestas simuladas',
    (await p.innerText('.chat-sim-note')).includes('Respuestas simuladas'), true);
  await p.evaluate(() => askAssistant('hola'));
  await p.waitForTimeout(1500);
  const soloCerebro = await p.innerText('#messages');
  check('y contesta el cerebro simulado, no un modelo', soloCerebro.includes('Estás en «'), true);
  if (!soloCerebro.includes('Estás en «')) console.log('        mensajes: ' + soloCerebro.replace(/\n/g, ' | ').slice(0, 200));
  await p.close();
}

/* ---- 2 · Con modelo: contexto, respuesta mostrada y cerco ---- */
{
  const p = await browser.newPage();
  p.on('pageerror', e => errs.push('con modelo: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });   // el navegador del cliente
    window.__pedidos = [];
    window.__sistema = '';
    window.__cola = [];
    window.LanguageModel = {
      availability: async () => 'available',
      create: async (opciones) => {
        window.__sistema = (opciones.initialPrompts || []).map(x => x.content).join('\n');
        return { prompt: async (texto) => { window.__pedidos.push(texto); return window.__cola.shift() || 'ok'; } };
      },
    };
  });
  await p.goto(D + 'index.html'); await p.waitForTimeout(400);
  await p.evaluate(() => openChat());
  /* La nota nombra a Lía y sigue diciendo que NO es una persona (la honestidad no se toca: el
   * dueño pidió cambiar la etiqueta «IA local», no fingir que hay alguien detrás). */
  check('con modelo la nota la nombra y dice que no es una persona, en vez de fingir que es simulado',
    (await p.innerText('.chat-sim-note')).includes('Lía responde con el modelo local del navegador (no es una persona)'), true);
  await p.evaluate(() => { window.__cola = ['Elige la tela con calma y te digo cómo va tu estimación si quieres.']; });
  await p.evaluate(() => askAssistant('¿cómo voy?'));
  await p.waitForTimeout(1200);
  const sistema = await p.evaluate(() => window.__sistema);
  const primerTurno = await p.evaluate(() => window.__pedidos.at(-1));
  check('su carácter lleva las reglas que no puede romper',
    /no inventes precios/i.test(sistema) && /no prometas transporte/i.test(sistema), true);
  check('y el estado del cotizador viaja EN EL TURNO, no una sola vez al abrir la sesión',
    /ESTADO ACTUAL DEL COTIZADOR/.test(primerTurno) && /Paso del cliente: «/.test(primerTurno) && /Mueble: /.test(primerTurno), true);
  const linea = await p.evaluate(() => (ACI.context().service || {}).label || 'todavía sin elegir');
  check('diciendo la línea que se está cotizando, con las palabras de la página',
    primerTurno.includes(`Línea que está cotizando: «${linea}»`), true);
  check('una respuesta que pasa el cerco se muestra tal cual',
    (await p.innerText('#messages')).includes('Elige la tela con calma'), true);

  await p.evaluate(() => { window.__cola = ['Sí, te lo recogemos sin costo y con garantía de un año.']; });
  await p.evaluate(() => askAssistant('¿me lo recogen?'));
  await p.waitForTimeout(1200);
  const trasPromesa = await p.innerText('#messages');
  check('una promesa del modelo NO se muestra', trasPromesa.includes('te lo recogemos sin costo'), false);
  check('y en su lugar responde el cerebro simulado', /asesor|no puedo|est[áa]n? en/i.test(trasPromesa), true);

  await p.evaluate(() => { window.__cola = ['necesito plátanos para el techo']; });
  await p.evaluate(() => askAssistant('¿algo?'));
  await p.waitForTimeout(1200);
  check('y una respuesta que no responde tampoco', (await p.innerText('#messages')).includes('plátanos'), false);
  await p.close();
}

/* ---- 3 · Modelo disponible pero SIN descargar: no se usa, y no se dispara una descarga ---- */
{
  const p = await browser.newPage();
  p.on('pageerror', e => errs.push('descargable: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.__creado = false;
    window.LanguageModel = { availability: async () => 'downloadable',
      create: async () => { window.__creado = true; return { prompt: async () => 'usé el modelo' }; } };
  });
  await p.goto(D + 'index.html'); await p.waitForTimeout(500);
  await p.evaluate(() => openChat());
  check('con el modelo sin descargar la nota lo explica, sin prometer IA',
    (await p.innerText('.chat-sim-note')).includes('listo para activarse'), true);
  await p.evaluate(() => askAssistant('hola'));
  await p.waitForTimeout(900);
  check('y no se crea ninguna sesión: no se dispara la descarga', await p.evaluate(() => window.__creado), false);
  check('responde el cerebro simulado', (await p.innerText('#messages')).includes('Estás en «'), true);
  await p.close();
}

/* ---- 4 · El modelo tarda: mientras piensa, el chat lo dice y el envío espera ---- */
{
  const p = await browser.newPage();
  p.on('pageerror', e => errs.push('modelo lento: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => { await new Promise(r => setTimeout(r, 900)); return 'La tela Milo Protect te va bien: es la que menos pelo recoge.'; }
      })
    };
  });
  await p.goto(D + 'index.html'); await p.waitForTimeout(400);
  await p.evaluate(() => openChat());
  /* La burbuja se dibuja antes del primer await, así que se lee en el mismo instante en que
   * se pregunta; después hay que esperar de verdad a los 900 ms del modelo. */
  const mientrasPiensa = await p.evaluate(() => {
    askAssistant('¿qué tela me sirve?');
    return {
      espera: document.querySelectorAll('#messages .message.typing').length,
      envio: document.querySelector('#chatForm button').disabled
    };
  });
  check('con el modelo pensando se ve que está pensando', mientrasPiensa.espera, 1);
  check('y el envío espera a que termine', mientrasPiensa.envio, true);
  await p.waitForFunction(() => !document.querySelector('#messages .message.typing'), { timeout: 5000 });
  check('cuando el modelo responde los puntos se van y queda su respuesta',
    (await p.innerText('#messages')).includes('Milo Protect'), true);
  check('y el envío vuelve', await p.evaluate(() => document.querySelector('#chatForm button').disabled), false);
  await p.close();
}

/* ---- 5 · El cliente cambia de línea y de medidas con la conversación abierta: el turno
 *         siguiente ya lo sabe, y sin recrear la sesión (el hilo no se pierde) ---- */
{
  const p = await browser.newPage();
  p.on('pageerror', e => errs.push('estado cambiado: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.__pedidos = [];
    window.__sesiones = 0;
    window.__destruidas = 0;
    window.LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        window.__sesiones++;
        return { prompt: async (texto) => { window.__pedidos.push(texto); return 'Listo: con esa tela y esas medidas lo tengo claro.'; },
                 destroy: () => { window.__destruidas++; } };
      }
    };
  });
  await p.goto(D + 'index.html'); await p.waitForTimeout(400);
  await p.evaluate(() => openChat());
  await p.evaluate(() => askAssistant('¿qué tengo seleccionado?'));
  await p.waitForTimeout(600);
  /* Como un cliente: primero elige el motivo —es el primer paso de la pantalla— y después declara.
   * El hilo de la conversación se conserva mientras solo escriba una medida. */
  const conMedida = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#serviceGrid .service-choice')];
    const primera = cards.find(c => !c.classList.contains('selected')) || cards[0];
    if (primera) primera.click();
    const ancho = document.getElementById('width');
    if (ancho) { ancho.value = '233'; ancho.dispatchEvent(new Event('input', { bubbles: true })); ancho.dispatchEvent(new Event('change', { bubbles: true })); }
    return { linea: (ACI.context().service || {}).label || 'todavía sin elegir', ancho: (ACI.context().measurements || {}).width };
  });
  await p.evaluate(() => askAssistant('¿y ahora qué tengo seleccionado?'));
  await p.waitForTimeout(600);
  const turnoMedida = await p.evaluate(() => window.__pedidos.at(-1));
  check('el turno siguiente lleva la medida que el cliente acaba de escribir',
    turnoMedida.includes(`medidas ${conMedida.ancho} ×`), true);
  check('sin recrear la sesión: escribir una medida no pierde el hilo',
    await p.evaluate(() => window.__sesiones), 1);
  /* Y ahora SÍ cambia de línea: lo declarado para la anterior no viaja (el reset lo borra) y la
   * conversación se suelta, porque su historial guarda la línea vieja. */
  const despues = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#serviceGrid .service-choice')];
    const otra = cards.find(c => !c.classList.contains('selected')) || cards[0];
    if (otra) otra.click();
    return { linea: (ACI.context().service || {}).label || 'todavía sin elegir',
      ancho: (ACI.context().measurements || {}).width, fotos: (ACI.context().photos || {}).count };
  });
  await p.evaluate(() => askAssistant('¿y ahora qué tengo seleccionado?'));
  await p.waitForTimeout(600);
  const ultimoTurno = await p.evaluate(() => window.__pedidos.at(-1));
  check('el turno siguiente lleva la línea que el cliente acaba de elegir',
    ultimoTurno.includes(`Línea que está cotizando: «${despues.linea}»`), true);
  check('cambiar de línea suelta la conversación: la pregunta siguiente abre una sesión nueva',
    await p.evaluate(() => window.__sesiones), 2);
  check('y la sesión de la línea anterior se destruye',
    await p.evaluate(() => window.__destruidas), 1);
  check('el turno de la línea nueva ya no lleva la medida de la anterior',
    [!despues.ancho, ultimoTurno.includes('233')], [true, false]);
  /* Y con «Otro» elegido, la descripción del cliente viaja pegada al mueble. */
  await p.evaluate(() => {
    const s = document.querySelector('.pieza-mueble');
    s.value = 'Otro';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    const campo = document.getElementById('furnitureOther');
    campo.value = 'silla de barbería';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.evaluate(() => askAssistant('¿qué mueble tengo?'));
  await p.waitForTimeout(600);
  const turnoConOtro = await p.evaluate(() => window.__pedidos.at(-1));
  check('«Otro» viaja con las palabras del cliente, no como un nombre vacío',
    turnoConOtro.includes('Mueble: Otro (el cliente lo describe: «silla de barbería»)'), true);
  check('y el contexto del asistente lleva esa descripción',
    await p.evaluate(() => ACI.context().furnitureNote), 'silla de barbería');
  await p.close();
}

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'ninguno'));
console.log(fails ? `\n${fails} FALLAN` : '\nTODO PASA');
await browser.close(); process.exit(fails ? 1 : 0);
