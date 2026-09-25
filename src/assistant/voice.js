/* LA VOZ DEL ASISTENTE (src/assistant) — corte 5.
 *
 * El micrófono, su voz y el componente que se mueve con el sonido — más el silencio (su botón) y la
 * nota que dice de dónde sale el reconocimiento. La página conserva las puertas `encenderElMicrofono`,
 * `apagarElMicrofono` y `hablarConSuVoz`; `vozAudio` vive A NIVEL DEL MÓDULO, no en la closure:
 * `tests/voz.spec.mjs` lo lee y lo escribe por `evaluate` (nivel, piso, silenciada, el flujo del
 * micrófono), como `mirandoFoto` y los `let` de las telas.
 *
 * Lo que se mueve dice la verdad. Mientras habla el CLIENTE, las barras van con el nivel REAL del
 * micrófono (`getUserMedia` + `AnalyserNode`: el análisis es de este equipo y no sale de aquí);
 * mientras habla ELLA, con los pulsos reales de `speechSynthesis` (un evento por palabra: la voz la
 * pone el sistema, no se puede medir, así que no se finge una onda).
 */
import { guardarElTaller, elTaller } from '../wizard/casa.js';

let laVoz = null;   /* nombre del módulo: los top-level se pegan en un script */

const vozAudio = { escuchando: false, hablando: false, silenciada: false,
  stream: null, contexto: null, analizador: null, bucle: null, reconocedor: null,
  /* Lo que el micrófono necesita para no sordo ni atropellado: el nivel real que acaba de oír, cuándo
   * terminó ella de hablar (la cola del eco, corta), y las últimas frases SUYAS para reconocer su eco. */
  nivel: 0, vozHasta: 0, dichas: [], turnoDeVoz: 0, piso: 0.002 };

export function hablarConLaVoz(texto) { const v = laVoz; return v ? v.hablar(texto) : false; }
export function encenderElMicrofonoDelAsistente() { const v = laVoz; return v ? v.encender() : false; }
export function apagarElMicrofonoDelAsistente() { const v = laVoz; if (v) v.apagar(); }

export function conectarLaVoz(elPuenteDeLaPagina) {
  guardarElTaller(elPuenteDeLaPagina);
  const C = elTaller();
  if (!C) return false;

  function pintarLaOnda(valores){
    const onda = document.getElementById('vozOnda'); if (!onda) return;
    [...onda.querySelectorAll('i')].forEach((barra, i) => {
      barra.style.height = Math.max(3, Math.round((valores[i] || 0))) + 'px';
    });
  }
  const ondaDeNivel = (nivel, barras = 7) => Array.from({ length: barras }, (_, i) => {
    const centro = 1 - Math.abs(i - (barras - 1) / 2) / ((barras - 1) / 2);   // más alto en el centro
    return 4 + nivel * (26 - 4) * (0.45 + 0.55 * centro);
  });

  function animarLaOnda(){
    const datos = new Uint8Array(vozAudio.analizador.fftSize);
    const paso = () => {
      if (!vozAudio.escuchando) return;
      vozAudio.analizador.getByteTimeDomainData(datos);
      let suma = 0;
      for (const v of datos) { const d = (v - 128) / 128; suma += d * d; }
      const rms = Math.sqrt(suma / datos.length);
      /* El nivel queda guardado, y con él el PISO del cuarto: es lo que deja que ella NO interrumpa al
       * cliente sin depender de un número fijo (abajo, `elClienteEstaHablando`). */
      vozAudio.nivel = rms;
      vozAudio.piso = rms < vozAudio.piso ? rms : vozAudio.piso * 1.0002 + 0.00001;
      pintarLaOnda(ondaDeNivel(Math.min(1, rms * 4.5)));
      vozAudio.bucle = requestAnimationFrame(paso);
    };
    paso();
  }

  /* La nota dice de dónde es el reconocimiento ANTES de que el cliente hable: el navegador puede
   * mandar el audio a su servicio, y eso no se calla. Si el reconocimiento admite `processLocally`,
   * se pide local y se dice. */
  function laNotaDeLaVoz(){
    const el = document.getElementById('vozNotaAudio'); if (!el) return;
    const Soporte = window.SpeechRecognition || window.webkitSpeechRecognition;
    let texto = 'El movimiento sigue el nivel real de tu micrófono, y lo mide este equipo.';
    if (!Soporte) texto += ' Este navegador no sabe reconocer voz: escríbeme con el teclado.';
    /* Honestidad sobre el motor: el reconocimiento NO local (se dejó de pedir el 25/09: captaba
     * peor) lo hace el servicio del navegador y su audio puede salir hacia allá — se dice. */
    else texto += ' El reconocimiento de voz lo hace el navegador: puede enviar el audio a su servicio (el texto es lo único que entra a tu cotización).';
    el.textContent = texto; el.hidden = false;
  }

  async function encenderElMicrofono(){
    if (vozAudio.escuchando) return true;
    laNotaDeLaVoz();
    try {
      /* Cancelación de eco del navegador: cuando el cliente la oye por parlantes, su voz vuelve más
       * limpia y el reconocimiento no la toma por el cliente. */
      vozAudio.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      document.getElementById('vozNotaAudio').textContent = 'No pude usar el micrófono (permiso denegado o sin dispositivo): te leo por el teclado y no finjo que te escucho.';
      return false;
    }
    vozAudio.contexto = new (window.AudioContext || window.webkitAudioContext)();
    vozAudio.analizador = vozAudio.contexto.createAnalyser();
    vozAudio.analizador.fftSize = 512;
    vozAudio.contexto.createMediaStreamSource(vozAudio.stream).connect(vozAudio.analizador);
    vozAudio.escuchando = true;
    document.getElementById('vozOnda').dataset.estado = 'escuchando';
    { const b = document.getElementById('vozMic'); if (b) b.setAttribute('aria-pressed', 'true'); }
    animarLaOnda();
    /* El reconocimiento es otra cosa que el nivel: si no está, el cliente escribe (y la onda sigue). */
    const Soporte = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Soporte) {
      const r = new Soporte();
      r.lang = 'es-CO'; r.continuous = true; r.interimResults = true;
      /* EL RECONOCIMIENTO DEL NAVEGADOR, NO EL LOCAL (dueño, 25/09: «por qué no capta el audio de mi voz
       * bien»). Aquí se pedía el modelo local (`processLocally`) cada vez que se abría: Chrome lo baja en
       * el fondo y, cuando queda, empieza a usarlo — y ese motor es más lento y capta peor que el
       * servicio. La tarde que el dueño aprobó no lo estaba usando. Se deja de pedir. */
      /* La señal de que la reconoce: el campo lo dice mientras escucha (y vuelve al suyo al parar). */
      r.onstart = () => { const i = document.getElementById('vozInput'); if (i && vozAudio.escuchando) i.placeholder = 'Te escucho… habla tranquilo'; };
      r.onresult = ev => {
        let final = '', parcial = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) final += t; else parcial += t;
        }
        /* SU ECO NO ES EL CLIENTE, PERO SU INTERRUPCIÓN SÍ (dueño, 25/09: «the customer can interrupt to
         * assistant... but assistant can not interrupt to customer»). Mientras ella habla, lo que entra
         * por el micrófono puede ser SU voz por los parlantes —eso se descarta, ni al campo ni a la
         * conversación— o el cliente cortándola —eso se atiende, y primero se la calla—. Antes se tiraba
         * TODO mientras hablaba: el cliente no podía cortarla, y la cola del eco (1500 ms) se comía el
         * arranque de su frase siguiente («el micrófono no capta mi voz»). */
        if (vozAudio.hablando) {
          if (pareceSuPropiaVoz(final || parcial)) return;    // su eco, no el cliente
          if (!final.trim()) return;                          // un parcial suyo no escribe en el campo
          callarlaParaEscuchar();                             // el cliente la interrumpe: se calla
        }
        /* La cola del eco, corta: apenas termina de hablar, el micrófono todavía oye su última sílaba. */
        else if (Date.now() - (vozAudio.vozHasta || 0) < 400) return;
        const input = document.getElementById('vozInput');
        if (parcial) input.value = parcial;
        if (final.trim()) {
          input.value = '';
          /* Si ya hay un turno corriendo, sus palabras NO se tiran: van a la cola y se atienden al
           * terminar el turno (antes se perdían — dueño: «se le están escapando palabras que yo digo»). */
          const chat = C.vozDeLaConversacion();
          if (chat.turno) { chat.cola = (chat.cola || []).concat(final.trim()); }
          else C.responderEnLaConversacion(final.trim());
        }
      };
      /* Los tropiezos del reconocimiento SE DICEN: un micrófono encendido que no entiende nada es
       * justo lo que no puede quedarse callado (el dueño: «the microphone seem is working but the
       * assistant dont response»). `no-speech` y `aborted` son de la vida diaria y no se cuentan. */
      vozAudio.tropiezos = 0;
      r.onerror = ev => {
        const err = ev && ev.error;
        console.warn('[voz] el reconocimiento falló:', err, ev && ev.message);
        if (err === 'no-speech' || err === 'aborted') return;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          const n = document.getElementById('vozNotaAudio');
          if (n) { n.textContent = 'El navegador no dejó usar el reconocimiento en esta página (permiso del micrófono o del servicio de voz). Te leo por el teclado.'; n.hidden = false; }
          apagarElMicrofono();
          return;
        }
        vozAudio.tropiezos++;
        const n = document.getElementById('vozNotaAudio');
        if (n) {
          n.textContent = err === 'network'
            ? 'El servicio de voz del navegador no responde (parece que no hay salida a internet para él): escribe con el teclado y el micrófono sigue midiendo tu voz.'
            : 'No pude reconocer tu voz (' + err + '): escribe con el teclado.';
          n.hidden = false;
        }
        if (vozAudio.tropiezos >= 3) {
          /* NO se apaga sola: se queda escuchando y volverá a intentar. Un micrófono que se apaga en
           * silencio es justo lo que se siente como «no capta mi voz» (el botón cambia, pero el
           * cliente no lo mira). La nota sí lo dice. */
          vozAudio.tropiezos = 0;
        }
      };
      r.onend = () => { if (vozAudio.escuchando && vozAudio.tropiezos < 3) { try { r.start(); } catch (err) { /* ya estaba arrancado */ } } };
      try { r.start(); vozAudio.reconocedor = r; } catch (err) {
        vozAudio.reconocedor = null;
        console.warn('[voz] el reconocimiento no arrancó', err);
      }
    }
    return true;
  }
  function apagarElMicrofono(){
    vozAudio.escuchando = false;
    /* El botón dice la verdad: apagado es apagado (lo mismo hace el encendido). */
    const botonMic = document.getElementById('vozMic');
    if (botonMic) botonMic.setAttribute('aria-pressed', 'false');
    if (vozAudio.bucle) cancelAnimationFrame(vozAudio.bucle), vozAudio.bucle = null;
    if (vozAudio.reconocedor) { try { vozAudio.reconocedor.onend = null; vozAudio.reconocedor.stop(); } catch (err) {} vozAudio.reconocedor = null; }
    if (vozAudio.stream) { vozAudio.stream.getTracks().forEach(t => t.stop()); vozAudio.stream = null; }
    if (vozAudio.contexto) { try { vozAudio.contexto.close(); } catch (err) {} vozAudio.contexto = null; }
    const onda = document.getElementById('vozOnda'); if (onda) onda.dataset.estado = 'callada';
    pintarLaOnda([]);
    const boton = document.getElementById('vozMic'); if (boton) boton.setAttribute('aria-pressed', 'false');
    const input = document.getElementById('vozInput'); if (input) input.placeholder = 'Escribe tu respuesta…';
  }

  /* Su voz, con la voz del sistema. Los eventos `boundary` son reales (uno por palabra): con ellos
   * se mueve la onda mientras habla — no se inventa una onda de audio que no se puede medir. */
  /* La VOZ va con el asistente: la Web Speech API no dice el sexo, así que se elige por el nombre de
   * la voz — y el sexo lo manda el pack del cliente (voz/sexo/genero) o, si no lo declara, el propio
   * nombre del asistente (Lía femenina; Thomás masculina). Colombia primero. */
  function elSexoDelAsistente(){
    const cfg = (typeof C.asistenteCfg === 'function' ? C.asistenteCfg() : null) || {};
    const declarado = String(cfg.voz || cfg.sexo || cfg.genero || '').toLowerCase();
    if (/fem|mujer/.test(declarado)) return 'femenina';
    if (/mas|hombre|varon|varón/.test(declarado)) return 'masculina';
    const nombre = String(cfg.name || '').toLowerCase();
    return /thom|tom[aá]s|diego|jorge|carlos|andr[eé]s|miguel|mario|pablo|juan|luis|pedro|raul|raúl/.test(nombre) ? 'masculina' : 'femenina';
  }
  function laVozDelAsistente(){
    if (!('speechSynthesis' in window)) return null;
    const sexo = elSexoDelAsistente();
    const femeninas = /monica|m[oó]nica|paulina|sabina|helena|laura|sof[ií]a|mar[ií]a|camila|valentina|isabela|luc[ií]a|elvira|esperanza|teresa|salom[eé]|ximena|catalina|angela|ángela|female|mujer|femenina/i;
    const masculinas = /jorge|diego|carlos|pablo|juan|luis|miguel|andr[eé]s|mario|alfonso|ra[uú]l|gonzalo|pedro|male|hombre|masculina/i;
    const espanolas = (speechSynthesis.getVoices() || []).filter(v => /^es/i.test(v.lang));
    const pesoDeAcento = v => /-co/i.test(v.lang) ? 0 : /-419|-mx|-us|-ve|-pe|-ec|-ar|-cl/i.test(v.lang) ? 1 : 2;
    /* La CALIDAD primero entre acentos iguales (el dueño: «ese ruido al final de la voz»):
     * las voces nuevas del sistema (Natural/Neural/Online/Premium) salen limpias; las viejas chasquean
     * al cerrar la frase. Si solo hay viejas, se usa la mejor que haya — la página no puede inventarlas. */
    const pesoDeCalidad = v => /natural|neural|online|premium|plus/i.test(v.name) ? 0 : 1;
    const ordenadas = espanolas.slice().sort((a, b) => pesoDeAcento(a) - pesoDeAcento(b) || pesoDeCalidad(a) - pesoDeCalidad(b));
    const quiere = sexo === 'masculina' ? masculinas : femeninas;
    const laOtra = sexo === 'masculina' ? femeninas : masculinas;
    return ordenadas.filter(v => quiere.test(v.name))[0]
      || ordenadas.filter(v => !laOtra.test(v.name))[0]
      || ordenadas[0] || null;
  }
  /* Aviso de que ELLA habla, para quien quiera acompañarla (la capa 3D hace su gesto): un evento
   * del DOM, que no depende del bus y cualquiera puede escuchar. */
  function avisarQueHabla(hablando){ try { window.dispatchEvent(new CustomEvent('assistant:hablando', { detail: { hablando: !!hablando } })); } catch (e) {} }
  /* Las palabras de una frase, en minúsculas y sin acentos ni puntuación: con eso se compara lo dictado
   * con lo que ella acaba de decir. */
  function lasPalabrasDe(texto){
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(p => p.length > 2);
  }
  /* ¿Lo dictado es lo que ELLA acaba de decir por los parlantes? (dos de cada tres palabras suyas: su
   * eco no es el cliente — y lo que no suena como ella SÍ lo es, aunque esté hablando). */
  function pareceSuPropiaVoz(dicho){
    const suyas = lasPalabrasDe(vozAudio.dichas);
    const oidas = lasPalabrasDe(dicho);
    if (!suyas.length || oidas.length < 2) return false;
    return oidas.filter(p => suyas.indexOf(p) >= 0).length / oidas.length >= 0.6;
  }
  /* ¿El cliente está hablando AHORA? Lo dice el nivel REAL del micrófono, muestreado de una: el bucle de
   * la onda se detiene con la pestaña en segundo plano, y esta pregunta no puede depender de eso. Se mide
   * contra el PISO de su propio cuarto, no contra un número fijo: hablar es sonar bastante más alto que
   * el silencio de ahí. */
  function elClienteEstaHablando(){
    if (!vozAudio.escuchando || !vozAudio.analizador) return false;
    const datos = new Uint8Array(vozAudio.analizador.fftSize);
    vozAudio.analizador.getByteTimeDomainData(datos);
    let suma = 0;
    for (const v of datos) { const d = (v - 128) / 128; suma += d * d; }
    const rms = Math.sqrt(suma / datos.length);
    vozAudio.nivel = rms;
    vozAudio.piso = rms < vozAudio.piso ? rms : vozAudio.piso * 1.0002 + 0.00001;
    return rms > Math.max(0.035, vozAudio.piso * 3);
  }
  /* Se calla para escuchar: la interrupción del cliente corta su frase en el sitio (no se encola). */
  function callarlaParaEscuchar(){
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (err) {}
    vozAudio.hablando = false; vozAudio.vozHasta = Date.now();
    avisarQueHabla(false);
    const onda = document.getElementById('vozOnda');
    if (onda && vozAudio.escuchando) { onda.dataset.estado = 'escuchando'; pintarLaOnda([]); }
  }
  /* Su voz, como estaba (el dueño: «eso estaba bien»): cada línea se dice al momento, cancelando lo que
   * hubiera sonando. La versión con fila (encolar y decir una tras otra) hacía que hablara más rato
   * seguido y el micrófono quedaba sordo mientras tanto — se revirtió. LO NUEVO (dueño, 25/09): mientras
   * el cliente está hablando la frase ESPERA su pausa — ella no interrumpe; a ella sí se la interrumpe
   * (arriba). El tope de 12 s es para no quedarse muda si él habla de corrido. */
  function hablarConSuVoz(texto){
    if (vozAudio.silenciada || !('speechSynthesis' in window)) return false;
    const limpio = String(texto || '').replace(/[«»]/g, '').slice(0, 300);
    if (!limpio) return false;
    const decirAhora = () => {
      speechSynthesis.cancel();
      const dicho = new SpeechSynthesisUtterance(limpio);
      /* COMO ESTABA (el dueño, 24/09: «esta tarde estaba… ni ruidoso»): idioma es-CO fijo, la voz a
       * cargo del sistema. El cambio de idioma a `voz.lang` se probó y se revirtió. */
      dicho.lang = 'es-CO';
      const elegida = laVozDelAsistente();
      /* Una voz que el motor no acepte (lista vieja) no puede tumbar su frase: se queda la de por
       * defecto del sistema. */
      if (elegida) { try { dicho.voice = elegida; } catch (err) { /* la voz de por defecto */ } }
      let pulso = 0;
      dicho.onstart = () => { avisarQueHabla(true); vozAudio.hablando = true; vozAudio.vozDesde = Date.now();
        /* Lo que acaba de decir queda a mano: con eso se reconoce su eco en el micrófono. */
        vozAudio.dichas = (vozAudio.dichas || []).concat(limpio).slice(-2);
        document.getElementById('vozOnda').dataset.estado = 'hablando'; };
      dicho.onboundary = () => { pulso++; pintarLaOnda(ondaDeNivel(0.35 + (pulso % 3) * 0.25)); };
      dicho.onend = dicho.onerror = () => { avisarQueHabla(false); vozAudio.hablando = false; vozAudio.vozHasta = Date.now();
        if (!vozAudio.escuchando) { document.getElementById('vozOnda').dataset.estado = 'callada'; pintarLaOnda([]); } };
      speechSynthesis.speak(dicho);
    };
    /* Si entre tanto salió otra frase, esta se cae: no se dice lo viejo. */
    const miTurno = ++vozAudio.turnoDeVoz;
    const dice = () => { if (miTurno === vozAudio.turnoDeVoz) decirAhora(); };
    if (!elClienteEstaHablando()) { dice(); return true; }
    const desde = Date.now();
    const espera = () => {
      if (!elClienteEstaHablando() || Date.now() - desde > 12000) { dice(); return; }
      setTimeout(espera, 120);
    };
    setTimeout(espera, 120);
    return true;
  }

  /* Los oídos de la voz: el botón del micrófono y el del silencio (el navegador pide su permiso la
   * primera vez), y la verdad para un navegador sin reconocimiento. */
  const botonMic = document.getElementById('vozMic'), botonSonido = document.getElementById('vozSonido');
  if (botonMic) botonMic.addEventListener('click', async e => {
    const boton = e.currentTarget;
    if (vozAudio.escuchando) { apagarElMicrofono(); return; }
    const encendido = await encenderElMicrofono();
    boton.setAttribute('aria-pressed', encendido ? 'true' : 'false');
  });
  if (botonSonido) botonSonido.addEventListener('click', e => {
    const boton = e.currentTarget;
    vozAudio.silenciada = !vozAudio.silenciada;
    boton.setAttribute('aria-pressed', vozAudio.silenciada ? 'true' : 'false');
    boton.textContent = vozAudio.silenciada ? '🔇' : '🔊';
    if (vozAudio.silenciada && 'speechSynthesis' in window) speechSynthesis.cancel();
  });
  /* En un navegador sin reconocimiento (Firefox, por ejemplo), el botón del micrófono lo dice desde
   * el principio: mide el nivel de tu voz, pero no te dicta — abajo se escribe (dueño, 25/09: la voz
   * no se comporta igual en todos los navegadores; la app lo asume en vez de disimularlo). */
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    const b = document.getElementById('vozMic');
    if (b) { b.title = 'En este navegador no puedo oírte: escribe abajo'; b.setAttribute('aria-label', b.title); }
  }

  laVoz = { hablar: hablarConSuVoz, encender: encenderElMicrofono, apagar: apagarElMicrofono };
  return true;
}
