/* LA CONVERSACIÓN CONTRA EL WIZARD (dueño, 25/09): «speak with assistant... and another can for each
 * interaction you can validate... what is her question or question... and take a screenshoot.. and
 * compare against it... that is ... whats says Lia... versus .... wizard where is?».
 *
 * Le habla al asistente como un cliente —escribe en el mismo cuadro y envía por el mismo formulario—
 * y en CADA turno compara dos cosas: lo que LÍA dice y dónde está el COTIZADOR (el paso visible, sus
 * campos, lo que falta). Deja una captura por turno, una tabla, y sale con 1 si algo no cuadra.
 *
 *   node tools/conversacion-vs-wizard.mjs                 (el guion «varios», el caso del 25/09)
 *   node tools/conversacion-vs-wizard.mjs --guion basico
 *   node tools/conversacion-vs-wizard.mjs --base http://127.0.0.1:3000 --capturas generated/conversacion
 *
 * Necesita el servidor de desarrollo arriba (`npm run dev`) y el proveedor de IA configurado: la
 * conversación real la contesta el modelo.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (nombre, porDefecto) => {
  const i = argv.indexOf('--' + nombre);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : porDefecto;
};
const BASE = arg('base', 'http://127.0.0.1:3000');
const CAPTURAS = arg('capturas', 'generated/conversacion-vs-wizard');
const GUION = arg('guion', 'varios');

/* Los guiones: una conversación de cliente, tal como la escribiría él — y lo que hay que comprobar al
 * final de la conversación entera. */
const GUIONES = {
  varios: {
    que: 'varios muebles (el caso del 25/09: dijo «unos muebles» y se perdía)',
    turnos: [
      'Gracias si es para retapizar unos muebles',
      'son varios muebles',
      'sofá',
      'y una poltrona',
      'el ancho del sofá es 200, el alto 90 y el largo 150',
      'y la poltrona mide 90 de ancho',
      '¿cuántos muebles llevo?'
    ],
    alFinal: { piezasMin: 2, porque: 'dijo varias veces que eran varios muebles: la tabla tiene que tener más de una pieza' }
  },
  basico: {
    que: 'una línea y un mueble (el paseo normal)',
    turnos: ['necesito retapizar un sofá', 'el ancho es 200, el alto 90 y el largo 150'],
    alFinal: {}
  },
  /* La sesión del 25/09 con el sofá «largo 190, alto 130» y la poltrona después: los nombres de las
   * medidas como los dice el cliente y la cuenta de las fotos por las piezas. */
  medidas: {
    que: 'las medidas dichas como las dice el cliente (el caso del 25/09 en la noche)',
    turnos: [
      'Gracias liga sí necesito re tapizar unos muebles',
      'retapizados y es para sofá inicialmente',
      'sí en este caso sería largo 190 el alto 130',
      'y el ancho o profundidad 1',
      'exactamente',
      'quiero retapizar una poltrona',
      'sí es un metro o un metro y un metro',
      'sí'
    ],
    alFinal: { piezasMin: 2, campos: [{ instrumento: 'pieza.0.width', valor: '190' }] }
  },
  /* La sesión del 25/09 en la noche (la segunda): el ancho de 100 en el sofá bloquea el paso y ella se
   * va a preguntar la ciudad y el contacto — «lia is in disorder… dont respect the step by step». */
  desorden: {
    que: 'el paso bloqueado por un valor fuera de lo habitual (el caso «is in disorder»)',
    turnos: [
      'vale sí necesito re tapizar unos muebles',
      'que sería un sofá',
      'Claro que sí de ancho un metro de largo metro y medio y de alto metro y medio',
      'tienes razón Sí es un metro de alto',
      'ya la subí',
      'en Bogotá'
    ],
    alFinal: { piezasMin: 1 }
  },
  repite: {
    que: 'el cliente repite lo que ya dio y pregunta el rótulo suelto (la sesión del 25/09, la tercera)',
    turnos: [
      'Gracias mi vida Sí a ver Quiero retapizar unos muebles',
      'sofa',
      'largo 1.50',
      'ancho',
      '120',
      'y alto 90',
      'largo 1.50',
      'ancho 120',
      'y alto 90 cm',
      'por eso alto es 90 cm ancho 120 y largo 150',
      'yo te los dije',
      'Acuérdate que hay más muebles',
      'no tiene cojines',
      'cantidad de que no te entiendo',
      'la tela',
      'siguiente mueble es una poltrona',
      'alto 150 ancho 50',
      'y largo 50'
    ],
    alFinal: { piezasMin: 2 }
  },
  insumos: {
    que: 'el paso de los insumos y la ciudad colada (la sesión del 25/09, la cuarta)',
    turnos: [
      'Gracias si son unos muebles que quiero tapizar',
      'si es un sofá y estoy en la ciudad de Bogotá',
      'largo 160 al 1,60 centímetros alto en 90 cm y ancho son un metro Es decir 100 centímetros',
      'No sí el ancho está bien',
      'Sí fue lo que trae',
      'sí estimadas',
      'vale',
      'nada',
      'no no se le cambió nada',
      'solo tela'
    ],
    alFinal: { piezasMin: 1 }
  },
  salto: {
    que: 'el cliente de varios muebles y la ciudad colada (la sesión del 25/09, la quinta)',
    turnos: [
      'pásame así necesito retapizar unos muebles',
      'sí son varios',
      'primeros son favor',
      'es un sofá',
      'de largo 190 de ancho 120 y de alto 90',
      'Ya te lo dije',
      'solo tela',
      'no no tiene nada',
      'segundo mueble es una poltrona',
      'mide 50 cm 50 cm y 50 cm respectivamente',
      'sí solo la tela',
      'o no no tiene nada',
      'no son esos dos',
      'en Bogotá',
      'Claro que sí mi nombre es diamon Cárdenas mi correo es demo cardenas@gmail.com y mi celular Es 311 557 53 52',
      'sí',
      'ya subí las fotos',
      'ya subí tres fotos'
    ],
    alFinal: { piezasMin: 2 }
  },
  /* El cliente ROBOT: no hay guion — las respuestas las calcula él en cada turno, mirando el primer
   * pendiente del paso. Recorre el cotizador entero para probar que ella SIGUE cada paso con sus
   * campos (dueño, 25/09). */
  robot: {
    que: 'el cliente robot: sigue el paso a paso, campo por campo, hasta el final',
    turnos: [],
    alFinal: {}
  }
};

/* QUÉ PIDE LÍA, traducido al campo del paso que lo contesta. Las palabras son las suyas; el campo, el
 * del formulario. */
const PIDE = [
  { pide: /\bancho\b/i, campo: /(^|\.)width$/, dice: 'el ancho' },
  { pide: /\balto\b/i, campo: /(^|\.)height$/, dice: 'el alto' },
  { pide: /\blargo\b|\bfondo\b|profund/i, campo: /(^|\.)depth$/, dice: 'el largo' },
  { pide: /\bfotos?\b/i, campo: /^fotos$/, dice: 'las fotos' },
  { pide: /\bciudad\b/i, campo: /customerCity|serviceCity/, dice: 'la ciudad' },
  { pide: /\bcorreo\b/i, campo: /(^|\.)email$/, dice: 'el correo' },
  { pide: /\bcelular\b|\btel[eé]fono\b/i, campo: /(^|\.)phone$/, dice: 'el celular' },
  { pide: /\btela\b/i, campo: /fabric|tela|referencia|cantidad ?m/i, dice: 'la tela' },
  { pide: /\bpresupuesto\b/i, campo: /budget/, dice: 'el presupuesto' }
];

const limpio = s => String(s || '').replace(/\s+/g, ' ').trim();
const firma = s => limpio(s).toLowerCase().replace(/[¿?¡!.,;:«»"']/g, '').slice(0, 70);

/* ── EL CLIENTE ROBOT (dueño, 25/09: «should validate that assistant follow each step correctly with
 * the fields»). Recorre el cotizador ENTERO: en cada turno mira cuál es el primer pendiente del paso
 * visible, comprueba que la pregunta de ella haya sido por ESE, y contesta como contestaría un cliente
 * —las medidas por el chat (para que las escriba ella), las listas y las tarjetas con la mano, las
 * fotos de verdad— y, cuando el paso queda cerrado, pasa al siguiente con el «Continuar» de la
 * página. Así la prueba no mira un turno suelto: sigue la conversación paso por paso. */
async function loQueHayEnLaPantalla() {
  return pagina.evaluate(() => {
    const p = ACI.losCamposDelPaso();
    return { paso: p ? p.paso : null, titulo: p ? p.titulo : null,
      campos: (p ? p.campos : []).map(c => ({ id: c.id, pregunta: c.pregunta, lleno: c.lleno, aviso: c.aviso || null,
        tipo: c.tipo, valor: c.valor, min: c.min, max: c.max })) };
  });
}
async function laUltimaDeLia() {
  return pagina.evaluate(() => [...document.querySelectorAll('#vozMessages .message.bot')].pop()?.textContent.replace(/\s+/g, ' ').trim() || '');
}
async function contestarConLaMano(campo) {
  return pagina.evaluate((c) => {
    const el = elControlDeLaPantalla(c);
    if (!el) return false;
    if (el.tagName === 'SELECT') {
      const opcion = [...el.options].find(o => o.value) || el.options[1] || el.options[0];
      if (opcion) { el.value = opcion.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    }
    if (el.getAttribute && el.getAttribute('role') === 'radiogroup') {
      const primera = el.querySelector('[aria-checked]'); if (primera) { primera.click(); return true; }
    }
    if (el.type === 'checkbox') { if (!el.checked) el.click(); return true; }
    return false;
  }, campo.id);
}
async function subirLasFotos() {
  const entrada = await pagina.$('[data-foto-pieza] input[type=file], .photo-strip input[type=file], input[type=file][accept*="image"]');
  if (!entrada) return false;
  await entrada.setInputFiles(['tests/fixture-sofa-1.png', 'tests/fixture-sofa-2.png', 'tests/fixture-sofa-3.png']);
  for (let k = 0; k < 40; k++) {
    await pagina.waitForTimeout(500);
    const cuantas = await pagina.evaluate(() => document.querySelectorAll('.photo-strip .photo-thumb, [data-foto-pieza] .pieza-foto-mini').length);
    if (cuantas >= 3) return true;
  }
  return false;
}
async function respuestaPara(campo) {
  const id = campo.id || '', pregunta = String(campo.pregunta || '').toLowerCase();
  if (/fotos/.test(id)) return (await subirLasFotos()) ? 'ya subí las tres fotos' : 'ahora no puedo subirlas';
  if (/\.width$/.test(id) || /\bancho\b/.test(pregunta)) return '200';
  if (/\.height$/.test(id) || /\balto\b/.test(pregunta)) return '90';
  if (/\.depth$/.test(id) || /\blargo\b|\bfondo\b/.test(pregunta)) return '90';
  if (campo.tipo === 'eleccion' || campo.tipo === 'lista') return (await contestarConLaMano(campo)) ? 'listo' : 'la primera';
  if (/\.ctl\d$/.test(id) || /mueble|tapiza/.test(pregunta)) return (await contestarConLaMano(campo)) ? 'listo' : 'sofá';
  if (/metros|cantidad|cu[aá]ntas/i.test(pregunta + id)) return '10';
  if (/referencia/i.test(pregunta + id)) {
    /* La lista de telas se construye al tocarla: si no hay fila, se agrega una con la mano (como haría
     * el cliente) y después se llena su referencia. */
    await pagina.evaluate(() => {
      const b = document.getElementById('listAdd');
      const filas = document.querySelectorAll('#listRows .boq-row, #listRows [data-row]');
      if (b && !filas.length) b.click();
    });
    await pagina.waitForTimeout(400);
    return (await contestarConLaMano(campo)) ? 'la primera' : 'lino';
  }
  if (/customerCity|serviceCity|ciudad/.test(id + pregunta)) return 'Bogotá';
  if (/fullName|nombre/.test(id + pregunta)) return 'Daimon Cárdenas';
  if (/email|correo/.test(id + pregunta)) return 'daimon@ejemplo.com';
  if (/phone|celular|tel[eé]fono/.test(id + pregunta)) return '300 123 4567';
  if (/consent|autoriz/.test(id + pregunta)) return (await contestarConLaMano(campo)) ? 'autorizo' : 'sí autorizo';
  if (/metros|cantidad/.test(id + pregunta)) return '10';
  return 'sí';
}
async function* respuestasDelRobot(hasta) {
  for (let t = 0; t < Math.max(4, hasta); t++) {
    /* Si el TURNO anterior terminó con la pregunta de ella antes de que el robot conteste, aquí se
     * comprueba que fuera por el primero pendiente del paso (lo mismo que revisa el arnés, pero ANTES
     * de contestar: es la única forma de saber si pidió ESE campo). */
    const p = await loQueHayEnLaPantalla();
    let campo = p.campos.find(c => c.id !== 'insumos' && (!c.lleno || c.aviso));
    if (!campo) {
      const avanzo = await pagina.evaluate(() => {
        const b = document.querySelector('.wizard-step.active .btn-next, .wizard-step.active [data-next], .wizard-step.active .btn-primary');
        if (b && !b.disabled) { b.click(); return b.textContent.trim(); }
        return null;
      });
      if (!avanzo) {
        const falta = await pagina.evaluate(() => { try { return (Contrato.faltantes(mundoDelContrato())[0] || {}); } catch (e) { return null; } });
        if (!falta || !falta.id) break;
        campo = { id: falta.id, pregunta: falta.etiqueta || '', tipo: '', lleno: false };
      } else { await pagina.waitForTimeout(900); continue; }
    }
    const suya = await laUltimaDeLia();
    const PALABRAS_SIN_PESO = ['para', 'desde', 'dime', 'cuando', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'sobre', 'otra', 'otro', 'este', 'esta', 'esos', 'esas'];
    const palabras = (String(campo.pregunta || '').toLowerCase().match(/[a-záéíóúñ]{4,}/g) || []).filter(w => PALABRAS_SIN_PESO.indexOf(w) < 0);
    const clave = palabras[0] || '';
    /* Los sinónimos, para no acusarla de no pedir lo que sí pidió con otra palabra («¿cuántos metros?»
     * por «Cantidad m»). */
    const SINONIMOS = { cantidad: /cantidad|metros?|\bm\b/i, referencia: /referencia|tela|lino|mezcla/i,
      ancho: /ancho|frente/i, alto: /alto|altura/i, largo: /largo|fondo|profund/i, fotos: /fotos?/i,
      autorizo: /autoriz|tratamiento|datos/i, nombre: /nombre/i, correo: /correo|email/i, celular: /celular|whats|tel[eé]fono/i };
    const loNombra = !clave || new RegExp(clave).test(suya) || (SINONIMOS[clave] || /$^/).test(suya);
    /* Solo se cae si PREGUNTÓ por otra cosa (el saludo de arranque no es una pregunta): una frase sin
     * «?» que no nombra el pendiente es charla, y eso está permitido. */
    if (!loNombra && /\?/.test(suya)) {
      const aviso = `paso ${p.paso}: iba a contestar «${campo.pregunta}» y la última pregunta de ella fue «${limpio(suya).slice(0, 70)}…»`;
      console.log('  ✗ FALLA ' + aviso);
      fallas.push(aviso);
    } else if (loNombra) {
      console.log(`  ✔ robot: el primero pendiente es «${campo.pregunta}» y ella lo pidió (paso ${p.paso})`);
    } else {
      console.log(`  · robot: el primero pendiente es «${campo.pregunta}» y ella aún no lo nombra (paso ${p.paso})`);
    }
    yield [t, await respuestaPara(campo)];
  }
}

const guion = GUIONES[GUION];
const ROBOT = GUION === 'robot';
if (!guion) { console.error('No existe el guion «' + GUION + '». Hay: ' + Object.keys(GUIONES).join(', ')); process.exit(2); }
mkdirSync(CAPTURAS, { recursive: true });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1500, height: 950 } });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', e => errores.push(String(e).slice(0, 200)));

try {
  await pagina.goto(BASE + '/', { waitUntil: 'load', timeout: 15000 });
} catch (e) {
  console.error('No hay servidor en ' + BASE + ' — levántalo con `npm run dev` y vuelve.');
  process.exit(2);
}
await pagina.waitForTimeout(1500);
await pagina.evaluate(() => document.getElementById('vozFab').click());
await pagina.waitForTimeout(700);

const fotos = [];
const fallas = [];
let previaFirma = '', repetidas = 0;
const mapaDeValores = () => pagina.evaluate(() => {
  const p = ACI.losCamposDelPaso();
  return Object.fromEntries((p ? p.campos : []).map(f => [f.id, f.valor == null ? '' : String(f.valor)]));
});

for await (const [i, textoCliente] of (ROBOT ? respuestasDelRobot(Number(arg('hasta', '40'))) : guion.turnos.entries())) {
  const n = String(i + 1).padStart(2, '0');
  const antes = await pagina.evaluate(() => [...document.querySelectorAll('#vozMessages > *')].length);
  const valoresAntes = await mapaDeValores();
  /* Se envía por el MISMO camino que el cliente: el cuadro y su formulario. */
  await pagina.fill('#vozInput', textoCliente);
  await pagina.press('#vozInput', 'Enter');
  /* Se espera a que el turno termine de verdad: ni él corriendo ni ella hablando. */
  for (let k = 0; k < 60; k++) {
    await pagina.waitForTimeout(400);
    const libre = await pagina.evaluate(() => ({ turno: !!voz.turno, hablando: !!vozAudio.hablando }));
    if (!libre.turno && !libre.hablando) break;
  }
  await pagina.waitForTimeout(500);

  /* Lo que dijo LÍA (sus burbujas nuevas) y dónde está el COTIZADOR. */
  const suyo = await pagina.evaluate((corte) => [...document.querySelectorAll('#vozMessages > *')]
    .slice(corte).filter(m => m.classList.contains('bot')).map(m => m.textContent.replace(/\s+/g, ' ').trim()), antes);
  const wizard = await pagina.evaluate(() => {
    const p = ACI.losCamposDelPaso();
    return {
      paso: p ? p.paso : null, titulo: p ? p.titulo : null,
      campos: (p ? p.campos : []).map(f => ({ id: f.id, pregunta: f.pregunta, lleno: f.lleno, valor: f.valor })),
      faltan: p ? p.faltan : [],
      piezas: (state.piezas || []).map(x => x.furniture),
      declarado: (voz.declarado || []).map(d => d.que)
    };
  });
  const captura = CAPTURAS + '/' + n + '.png';
  await pagina.screenshot({ path: captura });
  fotos.push(captura);

  /* La pregunta de ella: la última burbuja con «?»; si no hay, la última. Y de esa burbuja, la ÚLTIMA
   * frase que pregunta — la frase de cortesía que va delante («Perfecto, 90 de ancho para la
   * poltrona.») no es lo que está pidiendo. */
  const conPregunta = [...suyo].reverse().find(t => /\?/.test(t)) || suyo[suyo.length - 1] || '';
  const laPregunta = (conPregunta.match(/[^.?!]*\?[^?]*$/) || [conPregunta])[0].trim() || conPregunta;
  const dice = [];

  /* ── LAS COMPROBACIONES DEL TURNO ─────────────────────────────────────────────────────────────── */
  /* 0 · ¿Se va a OTRO paso mientras el paso visible tiene algo pendiente? (dueño, 25/09: «lia is in
   * disorder.....dont respect the step by step»: preguntó la ciudad con el paso del mueble a medio
   * cerrar.) Un pendiente es un campo sin llenar o uno LLENO que el cotizador no acepta. */
  const pendienteAqui = wizard.campos.some(c => !c.lleno) || wizard.campos.some(c => c.aviso);
  if (pendienteAqui) {
    for (const r of PIDE) {
      if (!r.pide.test(laPregunta)) continue;
      const aqui = wizard.campos.some(f => r.campo.test(f.id));
      if (!aqui) dice.push({ ok: false, texto: `pide ${r.dice}, que no es de este paso, y aquí queda algo pendiente (paso «${wizard.titulo}»)` });
    }
  }
  /* 1 · ¿Pide lo que el paso VISIBLE tiene? Se miran las medidas que su pregunta NOMBRA, juntas: con
   * varias piezas, «dime el ancho» puede ser legítimo aunque el ancho de OTRA fila esté lleno. Se cae
   * solo si nombra medidas y TODAS las que nombra están llenas — o si el paso no muestra ese campo. */
  const nombradas = PIDE.filter(r => r.pide.test(laPregunta) && !(r.dice === 'la tela' && wizard.paso === 0));
  for (const r of nombradas) {
    const campos = wizard.campos.filter(f => r.campo.test(f.id));
    if (!campos.length) dice.push({ ok: false, texto: `pide ${r.dice} y el paso «${wizard.titulo}» no muestra ese campo` });
  }
  const conAlgoFaltante = nombradas.filter(r => wizard.campos.filter(f => r.campo.test(f.id)).some(f => !f.lleno));
  if (nombradas.length && !conAlgoFaltante.length) {
    dice.push({ ok: false, texto: `nombra ${nombradas.map(r => r.dice).join(' / ')} y en el paso están todos llenos` });
  } else {
    for (const r of conAlgoFaltante) dice.push({ ok: true, texto: `pide ${r.dice} y el paso lo tiene sin llenar` });
  }
  /* 1b · EL ORDEN DENTRO DEL PASO (dueño, 25/09: «should validate that assistant follow each step
   * correctly with the fields»): si al paso le queda un primero pendiente —sin llenar o con un valor
   * que el cotizador no acepta—, su pregunta tiene que ser por ESE. Pedir otro campo del mismo paso
   * antes de cerrar el primero es no seguir el paso. */
  const primero = wizard.campos.find(c => c.id !== 'insumos' && (!c.lleno || c.aviso));
  if (primero) {
    const clavePrimero = ((String(primero.pregunta || '').toLowerCase().match(/[a-záéíóúñ]{4,}/g) || [])[0]) || '';
    /* El primero se da por pedido si su pregunta NOMBRA ese campo de cualquiera de las dos maneras: por
     * su palabra («fondo») o por la regla del arnés («el largo» = /largo|fondo|profund/). Antes solo
     * miraba la palabra exacta y acusaba de pedir el ancho a quien estaba pidiendo el fondo. */
    const laNombra = !clavePrimero
      || PIDE.some(r => r.campo.test(primero.id) && r.pide.test(conPregunta))
      || new RegExp(clavePrimero.replace(/s$/, 's?'), 'i').test(conPregunta);
    const nombraOtroDelPaso = nombradas.find(r => wizard.campos.some(f => r.campo.test(f.id) && f.id !== primero.id));
    if (laNombra) dice.push({ ok: true, texto: `pregunta por el primero que falta («${primero.pregunta}»)` });
    else if (nombraOtroDelPaso) dice.push({ ok: false, texto: `pregunta por ${nombraOtroDelPaso.dice} y antes falta «${primero.pregunta}»` });
  }
  /* 2 · ¿ENTRÓ lo que el cliente dijo? Si su frase trae un número para una medida que él nombró, esa
   * medida tiene que haber cambiado en el formulario — y si ella dice «Anotado: …», algo tiene que
   * haber entrado. (Su frase no prueba nada por sí sola: el «anoto el sofá en 200 de ancho» con la
   * fila en blanco fue el bug del 25/09.) */
  const valoresDespues = await mapaDeValores();
  const entro = Object.keys(valoresDespues)
    .filter(k => valoresDespues[k] !== (valoresAntes[k] || ''))
    .map(k => k + ' = «' + valoresDespues[k] + '»');
  if (entro.length) console.log('  entró  : ' + entro.join(' · '));
  const promete = /\bAnotado:/i.test(suyo.join(' '));
  if (promete && !entro.length) dice.push({ ok: false, texto: 'dice «Anotado: …» y en el formulario no cambió nada' });
  /* Si ella MISMA dijo por qué no lo aceptó («Ojo: El fondo de 150 cm está muy fuera…»), el dato que no
   * entró no es una falla — pero solo si el motivo habla de ESA medida, con sus sinónimos (el ancho, el
   * alto, el largo/fondo/profundidad): un «Ojo» sobre el fondo no disculpa al ancho que también se perdió. */
  const SINONIMOS = { 'el ancho': /ancho/, 'el alto': /alto|altura/, 'el largo': /largo|fondo|profundidad/ };
  const avisos = (suyo.join(' ').match(/Ojo:[^.]*\./g) || []).map(a => a.toLowerCase());
  const disculpa = (dice) => { const re = SINONIMOS[dice] || new RegExp(dice.replace(/^el /, '')); return avisos.find(a => re.test(a)); };
  for (const r of PIDE) {
    if (!r.pide.test(textoCliente) || !/\d/.test(textoCliente)) continue;
    const tocado = entro.some(x => r.campo.test(x.split(' = ')[0]));
    if (!tocado && disculpa(r.dice)) {
      const cual = disculpa(r.dice) || '';
      dice.push({ ok: true, texto: 'el cliente dio ' + r.dice + ' y no entró — ella dijo por qué («' + cual.slice(0, 80) + '…»)', nota: true });
    } else if (!tocado && /\?/.test(laPregunta) && r.pide.test(laPregunta)) {
      /* Tampoco es falla pedir confirmación en vez de anotar: «1» (un metro dicho a la ligera) no cabe
       * en el campo y ella preguntó «¿el ancho es 1 metro, o sea 100 cm?» — eso es cotizar bien. */
      dice.push({ ok: true, texto: 'el cliente dio ' + r.dice + ' y no entró — ella lo preguntó antes de anotarlo', nota: true });
    } else if (!tocado && /^(el ancho|el alto|el largo)$/.test(r.dice) && entro.some(x => /(width|height|depth)$/.test(x.split(' = ')[0]))) {
      /* El número ENTRÓ, pero en otra medida de la misma pieza: eso es el cotizador acomodándolo donde
       * cabe — el cliente dice «ancho» por el fondo y al revés. No es falla; se deja dicho. */
      dice.push({ ok: true, texto: 'el cliente dio ' + r.dice + ' y entró en otra medida de la pieza (lo acomodó el cotizador)', nota: true });
    } else if (!tocado) {
      dice.push({ ok: false, texto: 'el cliente dio ' + r.dice + ' («' + textoCliente.slice(0, 40) + '…») y ese campo no cambió' });
    }
  }
  /* 5 · ¿Le habló con un RÓTULO suelto? («Cantidad», «Referencia», «Contacto»…) Eso no es una
   * pregunta: el cliente no sabe de qué le hablan y, repetido, suena a máquina (dueño, 25/09:
   * «Cantidad.......are you sure the testing is correct?»). */
  const sueltas = suyo.filter(t => { const p = limpio(t).split(/\s+/);
    return p.length <= 2 && limpio(t).length < 24
      && !/^(anotado|anoté|listo\b|quedó)/i.test(limpio(t))
      && !/^(hola|buenas|perfecto|listo|gracias|claro|sí|si|bien|entendido|exacto|vale|con gusto|de nada)[.!]?$/i.test(limpio(t)); });
  if (sueltas.length) dice.push({ ok: false, texto: `le habló con un rótulo suelto, sin pregunta: «${sueltas[0]}»` });
  const f = firma(conPregunta);
  if (f && f === previaFirma) { repetidas++; if (repetidas >= 2) dice.push({ ok: false, texto: `la misma pregunta ${repetidas + 1} veces seguidas: «${conPregunta.slice(0, 60)}…»` }); }
  else repetidas = 0;
  previaFirma = f || previaFirma;
  /* 4 · La misma frase, PALABRA POR PALABRA, una tras otra (dueño, 25/09: «the AI never should repeat
   * phrase the same way and words..one after the other... this action can be seen like a rude.... you
   * can rephrase.. but never repeat exactly»). Vale para cualquier burbuja suya —la del modelo, el
   * recibo, el anuncio—: se puede reformular, pero no repetir igual. */
  const seguidas = await pagina.evaluate(() => [...document.querySelectorAll('#vozMessages .message.bot')].slice(-2).map(m => m.textContent));
  if (seguidas.length === 2 && firma(seguidas[0]) && firma(seguidas[0]) === firma(seguidas[1])) {
    dice.push({ ok: false, texto: `la misma frase, una tras otra: «${limpio(seguidas[1]).slice(0, 60)}…»` });
  } else {
    dice.push({ ok: true, texto: 'no repitió ninguna frase de una vez a la otra' });
  }

  console.log('── turno ' + n + ' ─────────────────────────────────────────────');
  console.log('  CLIENTE: ' + textoCliente);
  console.log('  LÍA    : ' + limpio(conPregunta) || '(nada)');
  console.log('  WIZARD : paso ' + wizard.paso + ' «' + wizard.titulo + '»  ·  sin llenar: ' + (wizard.faltan.join(' · ') || '(nada)'));
  console.log('           piezas: ' + JSON.stringify(wizard.piezas) + (wizard.declarado.length ? '  ·  declarado: ' + JSON.stringify(wizard.declarado) : ''));
  for (const d of dice) {
    console.log('  ' + (d.ok ? '✔' : '✗ FALLA') + ' ' + d.texto);
    if (!d.ok) fallas.push('turno ' + n + ': ' + d.texto);
  }
  console.log('  captura: ' + captura);
}

/* ── LO DE LA CONVERSACIÓN ENTERA ──────────────────────────────────────────────────────────────── */
if (guion.alFinal && (guion.alFinal.piezasMin || guion.alFinal.campos)) {
  console.log('── el guion completo ──────────────────────────────────────────');
}
if (guion.alFinal && guion.alFinal.piezasMin) {
  const piezas = await pagina.evaluate(() => (state.piezas || []).length);
  const ok = piezas >= guion.alFinal.piezasMin;
  console.log('  ' + (ok ? '✔' : '✗ FALLA') + ' piezas en la tabla: ' + piezas + ' (mínimo ' + guion.alFinal.piezasMin + ') — ' + guion.alFinal.porque);
  if (!ok) fallas.push('al final: quedaron ' + piezas + ' piezas y el cliente dijo que eran varios');
}
for (const esperado of (guion.alFinal && guion.alFinal.campos) || []) {
  const quedo = await pagina.evaluate((instrumento) => {
    const el = elControlDeLaPantalla(instrumento);
    return el ? String(el.value) : null;
  }, esperado.instrumento);
  const ok = quedo === esperado.valor;
  console.log('  ' + (ok ? '✔' : '✗ FALLA') + ' ' + esperado.instrumento + ' = «' + (quedo == null ? '(no existe)' : quedo) + '» (se esperaba «' + esperado.valor + '»)');
  if (!ok) fallas.push('al final: ' + esperado.instrumento + ' quedó «' + quedo + '» y se esperaba «' + esperado.valor + '»');
}
await navegador.close();

console.log('');
if (errores.length) { console.log('errores de página: ' + errores.join(' | ')); fallas.push('errores de página'); }
console.log(fallas.length ? 'FALLAS: ' + fallas.length + '\n  - ' + fallas.join('\n  - ') : 'TODO PASA: ' + guion.turnos.length + ' turnos, la conversación y el wizard cuadran.');
console.log('capturas: ' + CAPTURAS + '/  (' + fotos.length + ')');
process.exit(fallas.length ? 1 : 0);
