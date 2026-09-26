/* LOS DOS NAVEGADORES (dueño, 26/09: «should exist... testing... with two browser open for emulate
 * behaviour with customer... with the first browser you can speak in the chat and the another browser is
 * for reference for step... only this way you can catch where the behaviour is different... when come
 * back and fill the form or wizard of client... and where is in the browser 1 and where is in the
 * browser 2»).
 *
 * Son DOS navegadores de verdad, con su propio almacén cada uno (dos contextos: el borrador de uno no
 * se mezcla con el del otro):
 *
 *   NAVEGADOR 1 (el cliente)   — habla por el chat; contesta el modelo; el formulario lo llena la
 *                                conversación, como en la sesión real.
 *   NAVEGADOR 2 (la referencia)— las MISMAS respuestas, pero por la mano y el parser del cotizador, sin
 *                                modelo: es donde el wizard dice que debería estar.
 *
 * En cada turno se lee DÓNDE está cada uno (el paso visible, lo que le falta, lo que ya tiene) y se
 * dicen las DIFERENCIAS. Esa es la única forma de ver el desorden: lo que ella pregunta contra el paso
 * que el cliente debería tener delante.
 *
 *   node tools/dos-navegadores.mjs                 (el guion del dueño, 26/09)
 *   node tools/dos-navegadores.mjs --guion varios
 *   node tools/dos-navegadores.mjs --base http://127.0.0.1:3000 --capturas generated/dos-navegadores
 *
 * Necesita el servidor de desarrollo arriba (`npm run dev`) y el proveedor de IA configurado: la
 * conversación real la contesta el modelo. No es una suite: es la lupa.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:3000');
const CAPTURAS = arg('capturas', 'generated/dos-navegadores');
const GUION = arg('guion', 'dueno');

/* Los guiones: lo que dice el cliente, turno a turno. */
const GUIONES = {
  /* La sesión del dueño del 26/09: dijo el propósito («las dos cosas»), el mueble, las tres medidas y
   * el cotizador siguió preguntando las medidas y se fue a la tela. Su queja: «dont respect the order
   * of steps of the wizard». */
  dueno: {
    que: 'el caso del 26/09 del dueño',
    turnos: [
      'listo sí la retapización de mi sofá sí porfa',
      'sí las dos cosas',
      'sofá',
      'de ancho 190 perdón de ancho no, ahí me equivoqué',
      'Okay no, este largo 190 de alto 90 y de ancho 140',
      'ya subí las fotos',
      'pero no entiendo, ya te di los centímetros de ancho alto y largo',
      'sí todo el relleno',
      'sí dame opciones'
    ]
  },
  varios: {
    que: 'varios muebles (el caso del 25/09)',
    turnos: ['Gracias si es para retapizar unos muebles', 'son varios muebles', 'sofá', 'y una poltrona',
      'el ancho del sofá es 200, el alto 90 y el largo 150', 'y la poltrona mide 90 de ancho']
  }
};
const guion = GUIONES[GUION] || GUIONES.dueno;

const limpio = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const D = 'file://' + process.cwd() + '/generated/';
mkdirSync(CAPTURAS, { recursive: true });

/* ── Lo que se lee de un navegador: dónde está y qué tiene ─────────────────────────────────────── */
const estado = (pagina) => pagina.evaluate(() => {
  const limpio = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const p = (() => { try { return ACI.losCamposDelPaso(); } catch (e) { return null; } })();
  const paso = document.querySelector('.wizard-step.active');
  const mueble = [...document.querySelectorAll('.piezas-lista .pieza-mueble')].map(s => s.value).filter(Boolean);
  const medidas = [...document.querySelectorAll('.piezas-lista .pieza-fila')].map(f =>
    [...f.querySelectorAll('[data-medida]')].map(m => m.dataset.medida + '=' + (m.value || '·')).join(','));
  return {
    paso: paso ? +paso.dataset.step : null, cerebro: paso ? (paso.dataset.brain || '') : '',
    titulo: limpio((document.querySelector('.wizard-step.active .step-heading h2') || {}).textContent || ''),
    faltan: p ? (p.campos || []).filter(c => !c.lleno).map(c => c.pregunta) : null,
    avisos: p ? (p.campos || []).filter(c => c.lleno && c.aviso).map(c => c.pregunta + ': ' + c.aviso) : null,
    mueble, medidas,
    ultima: limpio(([...document.querySelectorAll('#vozMessages .message.bot')].pop() || {}).textContent || '').slice(0, 90)
  };
});
const texto = (e) => `paso ${e.paso}${e.cerebro ? ' (' + e.cerebro + ')' : ''} «${e.titulo}»`
  + `\n      mueble: ${JSON.stringify(e.mueble)} · medidas: ${JSON.stringify(e.medidas)}`
  + `\n      falta: ${JSON.stringify(e.faltan)}` + (e.avisos && e.avisos.length ? `\n      avisa: ${JSON.stringify(e.avisos)}` : '');

/* ── El arranque: la línea, el camino y el mueble, igual en los dos (una vez, para partir del mismo sitio) */
async function arrancar(pagina, conLaMano) {
  await pagina.goto(BASE + '/', { waitUntil: 'load', timeout: 20000 });
  /* El navegador 1 es el del dueño: entra, abre la conversación con el botón flotante y HABLA — la
   * línea y los caminos los elige su frase, como en su Chrome. El 2 arranca igual de vacío: su línea
   * la pone la mano (esa es la referencia). */
  if (!conLaMano) { await pagina.click('#vozFab'); await pagina.waitForTimeout(1500); }
  await pagina.waitForTimeout(700);
}

/* ── El cliente del navegador 1: HABLA (lo mismo que hace el dueño con el micrófono) ────────────
 * Se dicta por la misma costura que usan las suites (`window.__dictar`, el sustituto del
 * reconocimiento), así que el camino es el de su Chrome: voz → turno → contrato → formulario. */
async function hablar(pagina, textoCliente) {
  const antes = await pagina.evaluate(() => document.querySelectorAll('#vozMessages > *').length);
  await pagina.evaluate((t) => { window.__dictar = t; }, textoCliente);
  for (let k = 0; k < 90; k++) {
    await pagina.waitForTimeout(500);
    const hay = await pagina.evaluate((c) => document.querySelectorAll('#vozMessages > *').length > c, antes);
    const ocupada = await pagina.evaluate(() => !!document.querySelector('#vozMessages .message.typing, [data-escribiendo]'));
    if (hay && !ocupada && k > 1) return true;
  }
  return false;
}

/* ── La referencia del navegador 2: la misma respuesta, por la mano y el parser del cotizador ──── */
async function conLaMano(pagina, textoCliente) {
  /* La LÍNEA y los CAMINOS también se eligen con la mano (el cliente los dijo por voz): el mismo
   * sitio al que llega el navegador 1 cuando su frase elige la línea. */
  await pagina.evaluate(async (dicho) => {
    const espera = (ms) => new Promise(r => setTimeout(r, ms));
    const elige = (sel, texto) => { const b = [...document.querySelectorAll(sel)].find(x => (x.textContent || '').includes(texto)); if (b) b.click(); return !!b; };
    /* La línea y los caminos, uno por pantalla y con su «Continuar»: el mismo sitio al que llega el
     * navegador 1 cuando su frase (y el toque del cliente) los eligen. */
    for (let k = 0; k < 5; k++) {
      const s = document.querySelector('.wizard-step.active');
      let toque = false;
      if (document.querySelector('#serviceGrid .service-choice')) { elige('#serviceGrid .service-choice', 'Retapizado'); toque = true; }
      else if (s && s.querySelector('#routeGrid')) { elige('#routeGrid .service-choice', 'Nueva compra'); toque = true; }
      else if (s && s.querySelector('#purposeGrid')) { elige('#purposeGrid .service-choice', 'Mi mueble o proyecto personal'); toque = true; }
      else if (s && s.querySelector('#saberGrid')) { elige('#saberGrid .service-choice', 'No tengo claro ninguna de las dos'); toque = true; }
      if (!toque) break;
      await espera(350);
      document.getElementById('nextButton')?.click();
      await espera(800);
    }
  }, textoCliente);
  await pagina.waitForTimeout(700);
  return pagina.evaluate(async (dicho) => {
    const enVista = (() => { try { return ACI.losCamposDelPaso(); } catch (e) { return null; } })();
    const campo = enVista && (enVista.campos || []).find(c => !c.lleno && c.id !== 'insumos' && c.id !== 'fotos');
    /* El instrumento de la pantalla, traducido al CAMPO del contrato —el mismo nombre que usa la
     * conversación (`comoCampo`, index.html): las medidas por pieza (`pieza.0.width`) se le dicen al
     * campo «medidas» de la fila, o el parser no las reconoce y la referencia se queda atrás. */
    const comoCampo = (c) => {
      if (!c) return null;
      if (/\.ctl0$/.test(c.id)) return 'mueble';
      if (/^pieza\.\d+\.(width|height|depth)$/.test(c.id)) return 'medidas';
      return c.id;
    };
    if (campo) { const r = await aplicarLoDicho(comoCampo(campo), dicho).catch(() => ({ ok: false })); if (r && r.ok) return true; }
    /* Lo que el parser no sabe (una elección, un «Otro»), se contesta con la mano en el control. */
    const el = campo && elControlDeLaPantalla(campo.id);
    if (el) {
      if (el.tagName === 'SELECT' && el.options.length > 1) { el.selectedIndex = 1; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return true; }
    }
    const grupo = document.querySelector('.wizard-step.active [role="radiogroup"]');
    const primera = grupo && grupo.querySelector('[aria-checked]');
    if (primera) { primera.click(); return true; }
    return false;
  }, textoCliente);
}
/* Las FOTOS se suben con la mano, como las sube él (el chat solo las cobra): en los dos navegadores,
 * cuando el paso las está pidiendo. */
async function subirFotos(pagina) {
  const entrada = await pagina.$('.wizard-step.active input[type=file], .photo-strip input[type=file], input[type=file][accept*="image"]');
  if (!entrada) return false;
  const faltan = await pagina.evaluate(() => {
    try { const p = ACI.losCamposDelPaso(); const f = (p && p.campos || []).find(c => c.id === 'fotos'); return f ? (f.valor || 0) < 3 : false; } catch (e) { return false; }
  });
  if (!faltan) return false;
  await entrada.setInputFiles(['tests/fixture-sofa-1.png', 'tests/fixture-sofa-2.png', 'tests/fixture-sofa-3.png']);
  await pagina.waitForTimeout(1200);
  return true;
}
const avanzarSiCerro = (pagina) => pagina.evaluate(async () => {
  const enVista = (() => { try { return ACI.losCamposDelPaso(); } catch (e) { return null; } })();
  const quedan = enVista ? (enVista.campos || []).filter(c => !c.lleno && c.id !== 'insumos').length : 1;
  if (quedan) return false;
  const b = document.getElementById('nextButton');
  if (b && !b.disabled) { b.click(); await new Promise(r => setTimeout(r, 900)); return true; }
  return false;
});

/* El servicio de audio y el micrófono van de mentira, con la MISMA costura que las suites
 * (`tests/voz.spec.mjs`): el Chrome del dueño sí tiene micrófono; esta máquina (WSL, sin tarjeta) se
 * lleva el renderer al crear un `AudioContext` de verdad. Lo que se prueba es el código de la página. */
const navegador = await chromium.launch({ args: ['--disable-features=AudioServiceOutOfProcess', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const contexto1 = await navegador.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['microphone'] });
const contexto2 = await navegador.newContext({ viewport: { width: 1400, height: 900 } });
await contexto1.addInitScript(() => {
  const onda = (buf) => { const amp = (typeof window.__nivel === 'number') ? window.__nivel : 42;
    if (amp <= 0) { buf.fill(128); return; }
    const t = performance.now() / 1000;
    for (let i = 0; i < buf.length; i++) buf[i] = 128 + Math.round(amp * Math.sin(2 * Math.PI * 220 * (t + i / 48000))); };
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
  /* La voz: el sustituto dicta lo que se le ponga en `__dictar` — el mismo camino que su micrófono. */
  window.__dictar = null;
  window.SpeechRecognition = class {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.onresult = null; this.onend = null; this.onerror = null; }
    start() {
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
const uno = await contexto1.newPage();
const dos = await contexto2.newPage();
const diferencias = [];

try {
  await arrancar(uno, false);
  await arrancar(dos, true);
  console.log('\n=== DOS NAVEGADORES · guion «' + GUION + '» (' + guion.que + ') ===');
  for (let i = 0; i < guion.turnos.length; i++) {
    const turno = guion.turnos[i];
    console.log(`\n── turno ${String(i + 1).padStart(2, '0')} ─────────────────────────────────────────`);
    console.log('  CLIENTE: ' + turno);
    /* Las fotos las sube él con la mano (el chat solo las cobra): si el paso las está pidiendo, se
     * suben en los dos antes de la frase del turno. */
    await subirFotos(uno); await subirFotos(dos);
    await hablar(uno, turno);
    await conLaMano(dos, turno);
    await avanzarSiCerro(dos);
    const a = await estado(uno), b = await estado(dos);
    console.log('  NAVEGADOR 1 (hablando):\n      ' + texto(a) + '\n      LÍA: ' + a.ultima);
    console.log('  NAVEGADOR 2 (referencia):\n      ' + texto(b));
    const pasosDistintos = a.paso !== b.paso;
    const faltanDistintos = JSON.stringify(a.faltan) !== JSON.stringify(b.faltan);
    if (pasosDistintos || faltanDistintos) {
      diferencias.push({ turno: i + 1, dicho: turno, uno: `${a.paso} ${JSON.stringify(a.faltan)}`, dos: `${b.paso} ${JSON.stringify(b.faltan)}` });
      console.log('  ⚠ DIFERENTES: ' + (pasosDistintos ? `el paso (${a.paso} contra ${b.paso}) ` : '') + (faltanDistintos ? 'lo que falta ' : ''));
    } else console.log('  ✔ los dos en el mismo sitio');
    await uno.screenshot({ path: `${CAPTURAS}/${String(i + 1).padStart(2, '0')}-1-hablando.png` });
    await dos.screenshot({ path: `${CAPTURAS}/${String(i + 1).padStart(2, '0')}-2-referencia.png` });
  }
  console.log('\n=== DÓNDE SE SEPARARON ===');
  if (!diferencias.length) console.log('  en ningún turno: los dos navegadores caminaron igual');
  for (const d of diferencias) console.log(`  turno ${d.turno} («${d.dicho}»): 1 está en ${d.uno} · 2 está en ${d.dos}`);
  console.log('\ncapturas: ' + CAPTURAS + '/  (una de cada navegador por turno)');
} finally {
  await navegador.close();
}
