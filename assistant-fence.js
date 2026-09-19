/* EL CERCO DEL ASISTENTE — las reglas que una respuesta debe cumplir antes de mostrarse.
 *
 * Nace de la prueba con el modelo real: cuando Lía contesta con un modelo local (el que Chrome trae en la
 * máquina del cliente), su texto pasa por aquí y, si rompe el cerco, no se muestra: el chat responde con
 * la respuesta preparada del cerebro. El modelo nunca tiene la última palabra sobre lo que lee el cliente.
 *
 * Las reglas están escritas contra el comportamiento observado:
 *   - «El cambio de espuma no está incluido en la cotización» → HONESTA: una negación no es una promesa.
 *   - «El transporte … no lo ofrecemos» → HONESTA, por lo mismo.
 *   - «Te lo recogemos sin costo» → promesa: la negación va dentro del beneficio, no lo desactiva.
 * Por eso se mira antes del acierto y dentro de él, nunca después.
 *
 * Mientras el negocio no declare tiempos de entrega, garantías, transporte ni descuentos, afirmarlos es
 * promesa. El día que su archivo de empresa los declare (ver docs/onboarding-precios.md), esta lista se
 * alimenta de ahí y deja de bloquearlos.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CercoAsistente = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /* Lo que el negocio NO ha declarado todavía. Vacío = nada declarado. */
  const SIN_DECLARAR = {
    transporte: 'un precio de transporte, recogida o entrega',
    plazo: 'un plazo de entrega',
    garantia: 'una garantía',
    descuento: 'un descuento o una promoción',
  };

  const AFIRMA = {
    transporte: /(te lo |se lo )?(recogemos|retiramos)|(incluye|ofrecemos|tenemos|contamos con)[^.]{0,30}(transporte|recogida|domicilio)|(transporte|recogida|domicilio)[^.]{0,30}(inclu|gratis|sin costo|vale \$|cuesta|\$ ?\d)/i,
    plazo: /en \d+ (d[ií]as|semanas)|\d+ d[ií]as h[aá]biles|(lo|te lo) entregamos|entrega en|(queda|est[áa]) listo (el|en)/i,
    garantia: /(te (damos|ofrecemos|dejamos)|con|bajo) garant[ií]a|garant[ií]a de \d+ (a[ñn]os?|meses)|garantizamos/i,
    descuento: /(te (hago|doy|dejo)|con) un descuento|\d+ ?% ?(de descuento|menos)|precio especial|te lo dejo en \$ ?\d/i,
    relleno: /(incluye|inclu[ie]d[oa]s?|valorad[oa]s?|sumad[oa]s?)[^.]{0,40}(relleno|espuma)|(relleno|espuma)[^.]{0,40}(inclu[ie]d[oa]s?|incluye|valorad[oa]s?|sumad[oa]s?|dentro del (precio|valor))/i,
    definitivo: /cotizaci[oó]n definitiva|(precio|valor) definitiv|(es|ser[íi]a|queda|te lo dejo en) (el |un )?(precio|valor) final/i,
    tocar: /(cambi[eé]|cambiar|modifiqu[eé]|actualic[eé]|puse)[^.]{0,30}(precio|valor|metros|estado)/i,
  };
  const NIEGA = /\b(no|nunca|jam[áa]s|todav[íi]a no|actualmente no|por ahora no)\b/i;

  /* Del motivo, de los datos del negocio o del propio formulario: una respuesta tiene que hablar de algo
   * de eso. No entiende de sentido —para eso está una persona—, pero impide que pase una respuesta que
   * no responde. */
  const TEMA = /retapiz|tela|tapiz|mueble|sof|sill|poltrona|asiento|relleno|espuma|coj[ií]n|cabecero|da[ñn]|reparaci|mantenimiento|limpieza|suministro|cambio de tela|a la medida|proyecto comercial|arquitect|medida|medici|foto|color|valor|precio|estimaci|precotizaci|cotizaci|asesor|motivo|paso|cat[aá]logo|punto de atenci[oó]n|sede|direcci[oó]n|horario|p[aá]gina|whatsapp|tel[eé]fono|correo|formulario|validaci|revisi|an[aá]lisis|observaci|corregir|datos|\d{1,2}:\d{2}/i;
  /* Ojo: en JavaScript \b es ASCII, así que «Sí,» no tiene frontera después de la «í». Se comprueba
 * con una mira negativa de letra, y solo para el piso del tema: una promesa que empiece con «Sí,»
 * se juzga igual. */
  const SALUDOS = /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|gracias|ok|listo|de acuerdo|s[íi])(?!\p{L})/iu;

  function promete(frase, re) {
    const m = re.exec(frase);
    if (!m) return false;
    const antes = frase.slice(Math.max(0, m.index - 30), m.index);
    return !NIEGA.test(antes) && !NIEGA.test(m[0]);
  }

  /* `estimacion` es el texto que el cliente tiene a la vista: cualquier otra cifra es inventada.
   * `permitido` es lo que el negocio declaró (hoy: nada). */
  function revisar(texto, opciones) {
    const t = String(texto || '');
    const estimacion = String((opciones && opciones.estimacion) || '');
    const permitido = (opciones && opciones.permitido) || {};
    const frases = t.split(/(?<=[.!?¡¿])\s+|\n+/).filter(function (f) { return f.trim(); });

    const promesas = [];
    for (const clave of Object.keys(SIN_DECLARAR)) {
      if (permitido[clave]) continue;
      if (frases.some(function (f) { return promete(f, AFIRMA[clave]); })) promesas.push(SIN_DECLARAR[clave]);
    }
    if (frases.some(function (f) { return promete(f, AFIRMA.relleno); })) promesas.push('el relleno o la espuma dentro de la cifra');
    if (frases.some(function (f) { return promete(f, AFIRMA.definitivo); })) promesas.push('una cotización definitiva');
    if (frases.some(function (f) { return promete(f, AFIRMA.tocar); })) promesas.push('haber tocado precio, metros o estado');

    const base = estimacion.replace(/\s/g, '');
    const cifras = (t.match(/\$\s?[\d.]+/g) || []).map(function (c) { return c.replace(/\.+$/, ''); })
      .filter(function (c) { return !base || !base.includes(c.replace(/\s/g, '')); });

    const limpio = t.trim();
    const tema = (limpio.length < 12 || SALUDOS.test(limpio)) ? []
      : (/[a-záéíóúñ]/i.test(limpio) && !TEMA.test(limpio) ? ['no habla del motivo ni de los datos del negocio'] : []);

    return { cifras: cifras, promesas: promesas, tema: tema, limpia: !cifras.length && !promesas.length && !tema.length };
  }

  return { revisar: revisar, SIN_DECLARAR: SIN_DECLARAR, _afirma: AFIRMA };
});
