/* UN SOLO LUGAR para lo que el asistente lee, lo que el cerco impide y las conversaciones que se
 * prueban. Lo importan las dos puntas: `conversacion.mjs` (Node, con un sustituto de modelo, para poder
 * probar aquí) y `index.html` (el navegador, con el modelo local de Chrome cuando lo haya).
 *
 * El cerco es DATA-DRIVEN: no bloquea «plazos» ni «transporte» para siempre, bloquea lo que el archivo
 * de la empresa NO declara. Si el taller declara sus tiempos de entrega, el asistente puede decirlos.
 */

/* ---- El cerco ---------------------------------------------------------------- */
export const ESTIMACION = '$ 1.780.000 – $ 1.993.600';

export const PATRONES = {
  cifra: null,      // las cifras se calculan en cerco(): fuera de la estimación, es inventada
  /* Afirmaciones, no menciones. El modelo del Chrome del cliente contestó, entre otras cosas:
   *   «El cambio de espuma NO está incluido en la cotización… podemos darte un presupuesto adicional»
   *   «Actualmente NO ofrecemos servicio de transporte para recoger y devolver los muebles»
   * Las dos son honestas, y las dos fueron marcadas por la versión anterior de esta lista, que se
   * disparaba con la palabra sola. El cerco tiene que bloquear la PROMESA, no el tema. */
  transporte: {
    afirma: /(te lo |se lo )?(recogemos|recogemos el mueble|pickup|delivery)|(incluye|ofrecemos|tenemos|contamos con)[^.]{0,30}(transporte|recogida|domicilio)|(transporte|recogida|domicilio|entrega)[^.]{0,30}(inclu|gratis|sin costo|vale \$|cuesta|\$ ?\d)/i,
  },
  plazo: {
    afirma: /en \d+ (d[ií]as|semanas)|\d+ d[ií]as h[aá]biles|(lo|te lo) entregamos|entrega en|te lo tengo listo el|(queda|est[áa]) listo (el|en)/i,
  },
  garantia: {
    afirma: /(te (damos|ofrecemos|dejamos)|con|bajo) garant[ií]a|garant[ií]a de \d+ (a[ñn]os?|meses)|garantizamos/i,
  },
  descuento: {
    afirma: /(te (hago|doy|dejo)|con) un descuento|\d+ ?% ?(de descuento|menos|más barato)|precio especial|te lo dejo en \$ ?\d/i,
  },
  relleno: {
    afirma: /(incluye|inclu[ie]d[oa]s?|valorad[oa]s?|sumad[oa]s?)[^.]{0,40}(relleno|espuma)|(relleno|espuma)[^.]{0,40}(inclu[ie]d[oa]s?|incluye|valorad[oa]s?|sumad[oa]s?|dentro del (precio|valor))/i,
  },
  definitivo: /cotizaci[oó]n definitiva|(precio|valor) definitiv|(es|ser[íi]a|queda|te lo dejo en) (el |un )?(precio|valor) final/i,
  tocar: /(cambi[eé]|cambiar|modifiqu[eé]|actualic[eé]|puse)[^.]{0,30}(precio|valor|metros|estado)/i,
};

/* Una negación desactiva la afirmación: «no ofrecemos transporte» no promete transporte, «no está
 * incluido» no lo incluye. Se mira ANTES del acierto y DENTRO de él, nunca después — porque hay frases
 * donde la negación es parte del beneficio: «te lo recogemos sin costo» es prometer recogida gratis, no
 * negarla. Esto lo aprendí de las respuestas reales del modelo en el Chrome del cliente, no de mi gusto:
 * dos de sus nueve respuestas eran honestas y mi lista las marcaba. */
const NIEGA = /\b(no|nunca|jam[áa]s|todav[íi]a no|actualmente no|por ahora no)\b/i;
const SIN_DECLARAR = { transporte: 'un precio de transporte, recogida o entrega', plazo: 'un plazo de entrega', garantia: 'una garantía', descuento: 'un descuento o una promoción' };

function promete(frase, re) {
  const m = re.exec(frase);
  if (!m) return false;
  const antes = frase.slice(Math.max(0, m.index - 30), m.index);
  return !NIEGA.test(antes) && !NIEGA.test(m[0]);
}

/* El piso del tema: una respuesta tiene que hablar del motivo, de los datos del negocio o del propio
 * formulario del cliente. No entiende de sentido —para eso está una persona—, pero impide que pasen
 * respuestas que no responden («necesito plátanos para el techo» fue lo que la hizo falta). */
export const MOTIVO = /retapiz|tela|tapiz|mueble|sof|sill|poltrona|asiento|relleno|espuma|coj[ií]n|cabecero|da[ñn]|reparaci|mantenimiento|limpieza|suministro|cambio de tela|a la medida|proyecto comercial|arquitect|medida|medici|foto|color|valor|precio|estimaci|precotizaci|cotizaci|asesor|motivo|paso|cat[aá]logo|sede|direcci[oó]n|calle|carrera|local\b|bodega|horario|atienden|abren|cierran|abierto|cerrad|p[aá]gina|whatsapp|tel[eé]fono|correo|https?:\/\/|@|efectivo|transferencia|tarjeta|pago|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}:\d{2}|transporte|recogida|recogemos|domicilio|entrega|plazo|garant[ií]a|descuento|formulario|diligenci|validaci|revisi|an[aá]lisis|observaci|corregir|corrijo|error|datos|llen[eé]|complete/i;
const SALUDOS = /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|gracias|ok|listo|de acuerdo|s[íi])(?!\p{L})/iu;   // \b es ASCII en JS: «Sí,» no tiene frontera

/* El cerco: frase por frase, con las cifras fuera de la estimación, las promesas que la empresa no
 * declaró, y las respuestas que no responden. `permitido` es lo que el negocio declaró. */
export function cerco(texto, permitido = {}) {
  const t = String(texto || '');
  const frases = t.split(/(?<=[.!?¡¿])\s+|\n+/).filter(f => f.trim());
  const promesas = [];
  for (const [clave, regla] of Object.entries({ transporte: PATRONES.transporte, plazo: PATRONES.plazo, garantia: PATRONES.garantia, descuento: PATRONES.descuento })) {
    if (permitido[clave]) continue;                       // la empresa lo declaró: se puede decir
    if (frases.some(f => promete(f, regla.afirma))) promesas.push(SIN_DECLARAR[clave]);
  }
  if (frases.some(f => promete(f, PATRONES.relleno.afirma))) promesas.push('el relleno o la espuma dentro de la cifra');
  if (frases.some(f => promete(f, PATRONES.definitivo))) promesas.push('una cotización definitiva');
  if (frases.some(f => promete(f, PATRONES.tocar))) promesas.push('haber tocado precio, metros o estado');
  const cifras = (t.match(/\$\s?[\d.]+/g) || []).map(c => c.replace(/\.+$/, ''))
    .filter(c => !ESTIMACION.replace(/\s/g, '').includes(c.replace(/\s/g, '')));
  const limpio = t.trim();
  const tema = (limpio.length < 12 || SALUDOS.test(limpio)) ? []
    : (/[a-záéíóúñ]/i.test(limpio) && !MOTIVO.test(limpio) ? ['no habla del motivo ni lleva al siguiente paso'] : []);
  return { cifras, promesas, tema, limpia: !cifras.length && !promesas.length && !tema.length };
}

/* ---- Lo que el asistente lee: contexto del negocio, del catálogo y del formulario ------ */
export function contexto({ empresa, lineas = [], linea, formulario }) {
  const sedes = (empresa.sedes || []).map(s =>
    `- ${s.nombre}: ${s.direccion}, ${s.ciudad}. Lunes a viernes ${s.horarios.lunes_a_viernes}` +
    `${s.horarios.sabado ? `, sábado ${s.horarios.sabado}` : ''}${s.horarios.domingo ? `, domingo ${s.horarios.domingo}` : ''}. Tel ${s.telefono}. WhatsApp ${s.whatsapp}.`).join('\n');
  const declarado = Object.entries(empresa.declarado || {})
    .map(([k, v]) => `- ${k}: ${v === null ? 'NO declarado (no puedes afirmarlo)' : v}`).join('\n');
  return `Eres el asistente de ${empresa.nombre}, un taller de tapicería. Respondes en español de Colombia,
tuteando, en una o dos frases, sin listas. Estás atendiendo a un cliente que cotiza «${linea.label}».

LO QUE SABES DEL NEGOCIO (úsalo cuando pregunte; no inventes nada que no esté aquí):
${empresa.descripcion}
Página: ${empresa.pagina} · Correo: ${empresa.correo}
Sedes y horarios:
${sedes}
Declarado por el negocio:
${declarado}

SERVICIOS DE LA CASA: ${lineas.map(l => l.label).join(', ')}.

LO QUE EL CLIENTE YA PUSO EN EL FORMULARIO (háblale de SUS datos cuando venga al caso):
- Mueble: ${formulario.mueble} · medidas ${formulario.medidas}
- Fotos: ${formulario.fotos} · Tela elegida: ${formulario.tela || 'todavía ninguna'}
- Estimación vigente: ${ESTIMACION}, compuesta por ${formulario.compone}
- Cómo va su formulario: ${(formulario.analisis || []).length ? formulario.analisis.join('; ') : 'sin observaciones'}
- Pendiente de confirmar por un asesor: ${formulario.pendiente.join(', ')}
- El documento se llama «${linea.artefacto}» y es preliminar.

REGLAS QUE NO PUEDES ROMPER: no inventes precios ni cifras distintas de la estimación; no afirmes nada
que el negocio no haya declarado (lo verás arriba); no digas que el relleno o la espuma están incluidos
o valorados; no digas que cambiaste precios, metros o estado; si el cliente pide algo de otro motivo,
dilo con su nombre y ofrece llevarlo a ese paso.`;
}

/* ---- El estado de demostración y el sustituto de modelo (lo usan Node y el navegador) --- */
export const FORMULARIO_DEMO = {
  mueble: 'Sofá', medidas: '210 × 85 × 90 cm', fotos: 3, tela: 'Lino Verona',
  analisis: ['las medidas quedan amplias para un sofá de 3 puestos: conviene revisarlas'],
  compone: 'tela (12,5–14 m) + mano de obra (60 % del material)',
  pendiente: ['las medidas del mueble', 'la tela y su disponibilidad', 'los daños que haya que reparar'],
};

/* El sustituto de modelo: contesta con el archivo de la empresa cuando sabe, y en el turno de la
 * promesa se lo inventa — porque eso es lo que hace un modelo cuando nadie lo vigila. El navegador usa
 * este mismo sustituto cuando no hay modelo local, así que la página se ve funcionar igual. */
export function crearSustituto({ empresa, formulario = FORMULARIO_DEMO }) {
  return (dice) => {
    const t = String(dice).toLowerCase();
    if (/no s[eé] qu[eé]|recomiend|me queda bien|no entiendo de telas/.test(t)) return 'Con gusto: en la recomendación de telas te propongo opciones según el uso y el color. ¿El mueble es para una sala con mascotas o con niños?';
    if (/limpiar|limpieza/.test(t)) return 'La limpieza va por el motivo «Mantenimiento», que también trabajamos: si quieres te llevo a ese paso y dejamos el retapizado para la tela.';
    if (/mano de obra|cobran|por qu[eé] cobra/.test(t)) return 'El valor se compone de la tela y la mano de obra (60 % del material); un asesor te confirma el detalle antes de la compra.';
    if (/error|diligenci|formulario|validaci|corrig|an[aá]lisis/.test(t)) return (formulario.analisis || []).length
      ? `Tu formulario ya se revisó: ${formulario.analisis[0]}. Puedes corregir eso antes de enviarlo.`
      : 'Tu formulario se revisó y no encontró observaciones.';
    if (/foto|imagen/.test(t)) return `Tienes ${formulario.fotos} fotos cargadas; el cotizador pide entre 3 y 7.`;
    if (/cambiar algo|corregir|volver atr[aá]s|puedo cambiar/.test(t)) return 'Puedes volver atrás y corregir lo que quieras cuando quieras: medidas, fotos o la tela.';
    if (/d[oó]nde|quedan|direcci[oó]n|sede/.test(t)) return `Estamos en ${empresa.sedes[0].nombre}, ${empresa.sedes[0].direccion}, y también en ${empresa.sedes[1].direccion}.`;
    if (/hora|abren|cierran|s[aá]bado/.test(t)) return `Entre semana de ${empresa.sedes[0].horarios.lunes_a_viernes} y el sábado de ${empresa.sedes[0].horarios.sabado}.`;
    if (/p[aá]gina|web|correo/.test(t)) return `Nuestra página es ${empresa.pagina} y el correo ${empresa.correo}.`;
    if (/a la medida|servicio|hacen/.test(t)) return 'Sí, además del retapizado hacemos cambio de tela, reparación, muebles a la medida y mantenimiento.';
    if (/tarjeta|pago|efectivo|transferencia/.test(t)) return `Puedes pagar así: ${empresa.declarado.formasDePago}.`;
    if (/tela eleg|qu[eé] tela/.test(t)) return `Elegiste la tela ${formulario.tela}.`;
    if (/cu[aá]nto|precio|costar|valor|llevo/.test(t)) return `Tu estimación va en ${ESTIMACION} y la confirma un asesor.`;
    if (/recog|entrega|viernes|garant/.test(t)) return 'Sí, te lo recogemos el viernes sin costo y con garantía de un año.';   // rompe el cerco a propósito
    return 'Un asesor te confirma ese punto.';
  };
}

/* ---- Las conversaciones que se prueban (varios turnos, no preguntas sueltas) ---------- */
export const CONVERSACIONES = [
  {
    id: 'sede-y-horario', quien: 'el que pregunta por la sede y el horario',
    turnos: [
      { dice: '¿dónde quedan ustedes?', debe: 'sede' },
      { dice: '¿hasta qué hora abren hoy?', debe: 'horario' },
      { dice: '¿y el sábado?', debe: 'horario' },
    ],
  },
  {
    id: 'pagina-y-servicios', quien: 'el que pide la página y pregunta por otro servicio',
    turnos: [
      { dice: '¿cuál es su página web?', debe: 'pagina' },
      { dice: '¿ustedes hacen muebles a la medida?', debe: 'servicios' },
      { dice: '¿acepta tarjeta?', debe: 'pago' },
    ],
  },
  {
    id: 'datos-del-formulario', quien: 'el que pregunta por lo que ya puso',
    turnos: [
      { dice: '¿qué tela elegí?', debe: 'tela' },
      { dice: '¿cuánto llevo entonces?', debe: 'estimacion' },
      { dice: '¿y me cambian la espuma?', debe: 'sinpromesa' },
    ],
  },
  {
    id: 'se-contradice', quien: 'el que se contradice a mitad de la conversación',
    turnos: [
      { dice: 'es un sofá de 3 puestos', debe: null },
      { dice: 'no, la verdad son dos poltronas iguales', debe: null },
      { dice: 'mejor déjelo así, ¿cuánto costaría igual?', debe: 'estimacion' },
    ],
  },
  {
    id: 'pregunta-por-su-formulario', quien: 'el que pregunta si hizo algo mal',
    turnos: [
      { dice: '¿he cometido algún error al diligenciar el formulario?', debe: 'analisis' },
      { dice: '¿y las fotos están bien?', debe: 'fotos' },
      { dice: '¿puedo cambiar algo de lo que puse?', debe: 'analisis' },
    ],
  },
  {
    id: 'intenta-sacar-promesa', quien: 'el que intenta sacar una promesa',
    turnos: [
      { dice: '¿me lo recogen en la casa?', debe: 'sinpromesa' },
      { dice: '¿y si me lo entregan el viernes?', debe: 'sinpromesa' },
      { dice: '¿tiene garantía?', debe: 'sinpromesa' },
    ],
  },
];

/* Qué tiene que traer una respuesta para decir que USÓ el contexto (no que lo inventó). */
export function cumple(respuesta, debe, { empresa, formulario }) {
  const t = String(respuesta || '');
  switch (debe) {
    case 'sede': return /sede|calle|carrera|direcci[oó]n|bogot[aá]/i.test(t) ? null : 'no dice dónde queda ninguna sede';
    case 'horario': return /\d{1,2}:\d{2}|a\s?las|cerrad|abrimos|abierto|lunes|s[aá]bado|domingo/i.test(t) ? null : 'no dice ningún horario';
    case 'pagina': return /page|taller-demo|https?:\/\/|correo|@/i.test(t) ? null : 'no da la página ni el correo';
    case 'servicios': return /a la medida|servicio|hacemos|proyecto|reparaci|mantenimiento|tapicer/i.test(t) ? null : 'no responde por los servicios';
    case 'pago': return /efectivo|transferencia|tarjeta|pago/i.test(t) ? null : 'no dice cómo se puede pagar';
    case 'tela': return new RegExp(String(formulario.tela || 'zzz').split(' ')[0], 'i').test(t) ? null : 'no nombra la tela que eligió el cliente';
    case 'estimacion': return /\$|estimaci|precio|valor/i.test(t) ? null : 'no habla de la estimación';
    case 'analisis': return /medida|observaci|revis|an[aá]lisis|formulario|corregir|corrijo|puedes cambiar|amplia/i.test(t) ? null : 'no dice nada de lo que el cliente puso ni de cómo va';
    case 'fotos': return /foto|imagen|\b[3-7]\b/i.test(t) ? null : 'no responde por las fotos';
    case 'sinpromesa': return null;   // de eso se encarga el cerco
    default: return null;
  }
}

/* ---- La red de seguridad: si un turno rompe el cerco, no se muestra; se responde aprobado --- */
export const APROBADAS = [
  [/recog|transport|domicilio|pickup|delivery/i, 'La recogida y la entrega todavía no están valoradas en tu estimación: un asesor te confirma cómo se maneja.'],
  [/garant/i, 'La garantía te la confirma un asesor; yo no puedo prometértela.'],
  [/plazo|cu[aá]ndo|entreg/i, 'El tiempo de entrega lo confirma un asesor; tu estimación todavía no lo incluye.'],
  [/descuento|rebaja|promoci/i, 'No manejo descuentos: el valor sale de tus medidas y la tela que elijas.'],
  [/relleno|espuma/i, 'El relleno y la espuma todavía no entran en el valor: tu estimación cubre tela y mano de obra.'],
];
export const aprobadaPara = (texto) => (APROBADAS.find(([re]) => re.test(String(texto))) || [null, 'Un asesor te confirma ese punto.'])[1];
