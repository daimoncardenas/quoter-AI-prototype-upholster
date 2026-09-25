/* LA VOZ: el micrófono, la onda que se mueve, y su voz.
 *
 * Spec del audio de la conversación (docs/contrato-conversacional.md). El DISPOSITIVO va de
 * mentira —`getUserMedia` se sustituye por un tono real de Web Audio (oscilador → MediaStream):
 * Web Audio es pura cuenta del navegador y no necesita tarjeta de sonido, que es justo lo que esta
 * máquina (WSL) no tiene—, pero todo lo demás es el código de verdad: el analizador, la onda, el
 * encendido/apagado, la nota y el silencio. El micrófono REAL solo se puede probar en el Chrome del
 * dueño, que es el único con uno; el dispositivo falso de Chromium (`--use-fake-device-for-media-
 * stream`) revienta el renderer en esta máquina, así que no se usa.
 *
 *   node tests/voz.spec.mjs
 */
import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';

const D = 'file://' + process.cwd() + '/generated/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

/* El servicio de audio, en proceso: en WSL/contenedor el servicio aparte no arranca y el renderer
 * se cae al crear el primer AudioContext (medido). */
const b = await chromium.launch({ args: ['--disable-features=AudioServiceOutOfProcess', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions: ['microphone'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.stack || e)));
/* El dispositivo Y el AudioContext van de mentira: esta máquina (WSL, sin tarjeta de sonido) se
 * lleva el renderer por delante en cuanto se crea un `AudioContext` de verdad (medido con el
 * dispositivo falso de Chromium y con `AudioServiceOutOfProcess` apagado). El sustituto entrega la
 * misma forma —un stream con su pista y un analizador que devuelve una onda—, así que lo que se
 * prueba es el código de la página: el bucle del nivel, las barras, el encendido/apagado, la nota y
 * el silencio. El micrófono REAL (permiso, dispositivo y reconocimiento) se prueba en el Chrome del
 * dueño, que es el único con uno. */
await p.addInitScript(() => {
  const onda = (buf) => { const t = performance.now() / 1000;
    for (let i = 0; i < buf.length; i++) buf[i] = 128 + Math.round(42 * Math.sin(2 * Math.PI * 220 * (t + i / 48000))); };
  class AudioContextFalso {
    constructor() { this.state = 'running'; this.sampleRate = 48000; }
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: onda }; }
    createMediaStreamSource() { return { connect() {} }; }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = AudioContextFalso;
  window.webkitAudioContext = AudioContextFalso;
  const pista = () => ({ stop() {}, kind: 'audio' });
  const stream = { getAudioTracks: () => [pista()], getTracks: () => [pista()] };
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
  navigator.mediaDevices.getUserMedia = async () => stream;
  /* El reconocimiento también va de mentira (el servicio de voz del navegador se lleva el renderer
   * por delante en esta máquina): el sustituto DICTA lo que el test le ponga en `__dictar`, para
   * poder comprobar el camino completo voz → conversación → contrato → formulario. */
  window.__dictar = null;
  window.SpeechRecognition = class {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.onresult = null; this.onend = null; this.onerror = null; }
    start() {
      window.__arranques = (window.__arranques || 0) + 1;
      /* Como el de verdad: avisa que arranca y escucha desde ahí; dicta cuando algo llega. */
      if (typeof this.onstart === 'function') this.onstart();
      clearInterval(this.tick);
      this.tick = setInterval(() => {
        if (window.__dictar && this.onresult) {
          const dicho = window.__dictar; window.__dictar = null;
          this.onresult({ resultIndex: 0, results: [{ 0: { transcript: dicho }, isFinal: true, length: 1 }] });
        }
      }, 250);
    }
    stop() { clearInterval(this.tick); }
  };
});
await p.goto(D + 'index.html');
await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await p.waitForTimeout(500);
await p.click('#vozFab');
await p.waitForTimeout(300);

console.log('\nLA BIENVENIDA CAMBIA (dueño, 25/09: «that phrase can be random»)');
/* Cuatro saludos del mismo tono, al azar, sin repetir dos veces seguidas: el guion fijo se lee a
 * robot. Se abre tres veces más y ninguno de los saludos debe repetir al anterior. */
const saludos = await p.evaluate(async () => {
  const leer = () => {
    const c = [...document.getElementById('vozMessages').children].filter(x => x.classList.contains('bot'))[0];
    return c ? c.textContent : '';
  };
  const arranca = leer();
  const siguen = [];
  for (let i = 0; i < 3; i++) {
    voz.mensajes.length = 0;
    document.getElementById('vozMessages').innerHTML = '';
    abrirLaConversacion();
    await new Promise(r => setTimeout(r, 80));
    siguen.push(leer());
  }
  return { arranca, siguen, nombre: [arranca, ...siguen].every(t => t.includes(asistenteCfg().name)), largos: [arranca, ...siguen].every(t => t.length > 30) };
});
check('cada apertura saluda distinto (y nunca dos veces seguidas)',
  [saludos.arranca !== saludos.siguen[0], saludos.siguen[0] !== saludos.siguen[1], saludos.siguen[1] !== saludos.siguen[2]],
  [true, true, true]);
check('y cada saludo llama a la asistente por su nombre y dice algo, no una línea vacía',
  [saludos.nombre, saludos.largos], [true, true]);

console.log('\nEL MICRÓFONO: SE PIDE AL ABRIR, Y EL NIVEL REAL MUEVE LAS BARRAS');
/* El dueño lo pidió así: al abrir la conversación el micrófono se pide DE UNA. */
const alAbrir = await p.evaluate(() => ({ estado: document.getElementById('vozOnda').dataset.estado,
  boton: document.getElementById('vozMic').getAttribute('aria-pressed'), encendido: vozAudio.escuchando,
  nota: document.getElementById('vozNotaAudio').textContent, notaVisible: !document.getElementById('vozNotaAudio').hidden,
  pista: !!(vozAudio.stream && vozAudio.stream.getAudioTracks().length) }));
check('al abrir, el micrófono ya está encendido y la onda dice que escucha',
  [alAbrir.estado, alAbrir.boton, alAbrir.encendido], ['escuchando', 'true', true]);
check('y la pista del micrófono está viva', alAbrir.pista, true);
check('y el campo avisa que la está reconociendo', /Te escucho/.test(await p.getAttribute('#vozInput', 'placeholder')), true);
check('y la nota dice de dónde es el reconocimiento ANTES de hablar',
  [alAbrir.notaVisible, /micrófono|equipo|navegador/.test(alAbrir.nota)], [true, true]);
console.log('   nota: ' + alAbrir.nota);
console.log('   reconocimiento: ' + (await p.evaluate(() => vozAudio.reconocedor ? 'activo' : 'este Chromium no lo trae (se escribe)')));
/* El nivel: se muestrean las alturas mientras corre el dispositivo de mentira. */
const alturas = [];
for (let i = 0; i < 12; i++) { alturas.push(...await p.$$eval('#vozOnda i', els => els.map(e => parseFloat(e.style.height) || 4))); await p.waitForTimeout(110); }
check('el nivel del micrófono mueve las barras (más de 4 px)', Math.max(...alturas) > 6, true);
/* Apagarlo a mano: vuelve el piso y el flujo se suelta. */
await p.click('#vozMic');
await p.waitForTimeout(700);
const apagadoAMano = await p.evaluate(() => ({ estado: document.getElementById('vozOnda').dataset.estado,
  boton: document.getElementById('vozMic').getAttribute('aria-pressed'), encendido: vozAudio.escuchando,
  pista: !!(vozAudio.stream && vozAudio.stream.getAudioTracks().length),
  piso: [...document.querySelectorAll('#vozOnda i')].every(e => (parseFloat(e.style.height) || 4) <= 4) }));
check('apagarlo a mano vuelve el piso y suelta el flujo',
  [apagadoAMano.estado, apagadoAMano.boton, apagadoAMano.encendido, apagadoAMano.pista], ['callada', 'false', false, false]);
/* Y encenderlo otra vez: la conversación sigue por voz. */
await p.click('#vozMic');
await p.waitForTimeout(1200);
check('y encenderlo otra vez lo deja escuchando', await p.evaluate(() => vozAudio.escuchando), true);

console.log('\nSU VOZ AVISA AL PERSONAJE (el gesto de la capa 3D)');
/* La costura que ve el personaje: al hablar se emite ASSISTANT_SPEAKING (la capa 3D la escucha y
 * hace su gesto). Aquí se prueba con la síntesis de mentira, porque esta máquina no tiene audio. */
const gestos = await p.evaluate(async () => {
  const vistos = [];
  window.addEventListener('assistant:hablando', e => vistos.push(!!(e && e.detail && e.detail.hablando)));
  /* La prueba es de la costura, no del botón de silencio: se asegura que ella puede hablar. */
  vozAudio.silenciada = false; vozAudio.hablando = false;
  const real = window.speechSynthesis;
  /* `window.speechSynthesis` es un ACCESOR del navegador: asignarle un doble se pierde en silencio
   * (medido: la frase salía por la voz real —sin voces en headless—, `onerror` avisaba «callada» y el
   * gesto de «hablando» nunca llegaba). Con defineProperty el doble entra de verdad. */
  const falsa = { speak(u) { setTimeout(() => u.onstart && u.onstart(), 10); setTimeout(() => u.onend && u.onend(), 60); },
    cancel() {}, getVoices() { return []; } };
  Object.defineProperty(window, 'speechSynthesis', { value: falsa, configurable: true });
  hablarConSuVoz('prueba de voz');
  await new Promise(r => setTimeout(r, 200));
  Object.defineProperty(window, 'speechSynthesis', { value: real, configurable: true });
  return vistos;
});
check('hablar avisa al personaje (y callar también)', gestos, [true, false]);
/* Su propia voz no es el cliente: lo que el micrófono oiga MIENTRAS ella habla se descarta. */
const antesDeDictar = await p.evaluate(() => voz.mensajes.length);
await p.evaluate(() => { vozAudio.hablando = true; vozAudio.vozDesde = Date.now(); window.__dictar = 'papá'; });
await p.waitForTimeout(900);
const mientrasHabla = await p.evaluate(() => ({ mensajes: voz.mensajes.length, servicio: state.service && state.service.id }));
await p.evaluate(() => { vozAudio.hablando = false; vozAudio.vozDesde = 0; });
check('mientras ella habla, lo que suena NO entra a la conversación ni responde (su eco no es el cliente)',
  [mientrasHabla.mensajes, mientrasHabla.servicio], [antesDeDictar, null]);
await p.evaluate(() => { window.__dictar = 'quiero retapizar el sofá de mi casa'; });
await p.waitForTimeout(1200);
const trasDictar = await p.evaluate(() => ({ servicio: state.service && state.service.id,
  ultimo: document.getElementById('vozMessages').innerText.slice(-260) }));
check('lo dictado entra a la conversación y la línea queda elegida en el formulario',
  [/retapizado/.test(String(trasDictar.servicio)), /retapizar/.test(trasDictar.ultimo)], [true, true]);
if (!/retapizado/.test(String(trasDictar.servicio))) console.log('        conversación: ' + trasDictar.ultimo.replace(/\n/g, ' | '));

await p.click('#vozMic');
await p.waitForTimeout(400);
const apagado = await p.evaluate(() => ({ estado: document.getElementById('vozOnda').dataset.estado, encendido: vozAudio.escuchando,
  pista: !!vozAudio.stream, boton: document.getElementById('vozMic').getAttribute('aria-pressed') }));
const reposo = await p.$$eval('#vozOnda i', els => els.map(e => parseFloat(e.style.height) || 4));
check('apagado: la onda vuelve al piso, el botón se suelta y el micrófono se cierra',
  [apagado.estado, apagado.encendido, apagado.pista, apagado.boton, reposo.every(h => h <= 4)],
  ['callada', false, false, 'false', true]);

console.log('\nSU VOZ: SE HABLA, SE SILENCIA, Y NO SE FINJE');
const voces = await p.evaluate(() => ('speechSynthesis' in window ? (speechSynthesis.getVoices() || []).length : -1));
console.log('   voces en este Chromium: ' + (voces < 0 ? 'sin speechSynthesis' : voces));
const suVoz = await p.evaluate(() => hablarConSuVoz('Estoy contigo.'));
check('hablar con su voz no revienta y queda en manos del sistema (hay voces o no las hay)',
  typeof suVoz, 'boolean');
await p.click('#vozSonido');
await p.waitForTimeout(200);
const silenciada = await p.evaluate(() => ({ silenciada: vozAudio.silenciada, boton: document.getElementById('vozSonido').getAttribute('aria-pressed'),
  dicho: hablarConSuVoz('no debería sonar') }));
check('silenciada: el botón lo dice y no vuelve a hablar',
  [silenciada.silenciada, silenciada.boton, silenciada.dicho], [true, 'true', false]);
await p.click('#vozSonido');
check('y se vuelve a encender', await p.evaluate(() => ({ silenciada: vozAudio.silenciada, icono: document.getElementById('vozSonido').textContent })),
  { silenciada: false, icono: '🔊' });

console.log('\nCERRAR LA CAPA APAGA TODO');
await p.click('#vozMic'); await p.waitForTimeout(600);
await p.click('#vozCerrar'); await p.waitForTimeout(300);
check('cerrar cierra el micrófono y la onda', await p.evaluate(() => ({ encendido: vozAudio.escuchando, modal: document.getElementById('vozModal').hidden })),
  { encendido: false, modal: true });
check('y al cerrar, el cotizador vuelve a dejarse editar',
  await p.evaluate(() => getComputedStyle(document.querySelector('.workspace')).pointerEvents), 'auto');
/* Y CERRADA, LA LÍA NO VUELVE A HABLAR: el turno que venía en camino llegaba después del cierre y
 * seguía sonando con la ventana cerrada (dueño, 25/09). */
check('cerrada la ventana, nada vuelve a hablar (ni el turno que venía en camino)',
  await p.evaluate(async () => {
    const real = window.speechSynthesis;
    const dichas = [];
    const falsa = { speak(u) { dichas.push(u.text); }, cancel() {}, getVoices() { return []; } };
    Object.defineProperty(window, 'speechSynthesis', { value: falsa, configurable: true });
    decirEnLaConversacion('esto no debe sonar', 'bot');
    preguntarLoQueFalta();
    await elTurnoDeLaConversacion('otro intento');
    await new Promise(r => setTimeout(r, 400));
    Object.defineProperty(window, 'speechSynthesis', { value: real, configurable: true });
    return dichas.length;
  }), 0);

await p.close(); await ctx.close(); await b.close();
if (errs.length) { console.log('\nErrores de página:'); for (const e of errs) console.log('  ' + e.slice(0, 300)); }
const total = fails + errs.length;
console.log(total ? `\n${total} FALLO(S)` : '\nALL PASS');
process.exit(total ? 1 : 0);
