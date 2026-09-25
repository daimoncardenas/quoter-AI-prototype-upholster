/* Contrato — el conjunto de hechos que una precotización necesita, declarado UNA vez.
 *
 * El problema que resuelve (docs/contrato-conversacional.md): hoy esos hechos solo se pueden
 * producir llenando el formulario paso a paso. Aquí se declaran aparte, para que el formulario y la
 * conversación sean dos maneras de llenarlos y el sistema —no el modelo— diga qué falta.
 *
 * No es una plantilla de HTML ni toca el DOM: `tools/generate.mjs` lo incrusta como <script>
 * clásico en index.html (antes del guion del wizard) y `tests/contrato.spec.mjs` lo carga desde
 * Node. Todo aquí es puro: un MUNDO entra, y salen campos, faltantes y veredictos.
 *
 * El mundo lo arma la página con lo que ya sabe (y el spec con mundos de mentira):
 *
 *   {
 *     catalogo: { lineas:[{id,label}], muebles:[nombres], danos:[ids],
 *                 telas:[ids], ciudades:[], rangos:{mueble:{width:[a,b],…}} },
 *     linea:    {id,label,skips:[],asks:[]}   | null,
 *     ruta:     {id,label,skips:[],rutasConLista:[ids],esLista:bool} | null,
 *     proposito:{id,label,skips:[]} | null,   saber:{id,label,skips:[]} | null,
 *     fotos:    {cargadas, min, paso},
 *     danos:    {marcados: n},
 *     medidas:  {valores:{width,height,depth}, mueble},
 *     lista:    {filas: n, intencionTela: bool},
 *     pedido:   {dicho: bool},
 *     revision: {analizada: bool},
 *     respuestas: {askId: {…}},   asks:[{id, groups:[…]}]  (los specs de los asks de la línea)
 *     atencion: {cliente, servicio, sede},
 *     contacto: {nombre, correo, celular, autoriza}
 *   }
 *
 * Las frases son las del formulario, palabra por palabra, donde el formulario tiene una (el spec lo
 * comprueba contra generated/index.html para que las dos no se separen); las que no existían
 * —ruta, propósito, saber— se escriben aquí por primera vez.
 *
 * Regla de oro: el modelo propone valores de la LISTA CERRADA de `validarValor()`; el contrato
 * decide; el motor calcula. Lo que la IA no puede escribir nunca está en NUNCA_LO_PONE_LA_IA.
 */
(function (root) {
  'use strict';

  const NOMBRE_MEDIDA = { width: 'ancho', height: 'alto', depth: 'fondo' };
  /* Los mismos atributos del formulario (index.html, paso de medidas): son la primera puerta, la de
   * `checkValidity()`. La segunda es la banda del ±20 % sobre los rangos del catálogo. */
  const MEDIDAS_POSIBLES = { width: [20, 1000], height: [20, 500], depth: [10, 500] };
  const MARGEN_MEDIDA = 0.2;              // el mismo margen del formulario (`MARGEN_MEDIDA`)
  const MIN_FOTOS_POR_DEFECTO = 3;

  /* Lo que la conversación NUNCA escribe, aunque el cliente lo diga o el modelo lo proponga:
   * la autorización la marca la persona, las fotos las sube la persona, y la estimación y los
   * precios los pone el motor. */
  const NUNCA_LO_PONE_LA_IA = ['autorizacion', 'fotos', 'estimacion', 'precio'];

  /* ---- El mundo, leído con tolerancia: lo que no está se lee como «no declarado» ---- */
  const skipsDe = (x) => (x && Array.isArray(x.skips)) ? x.skips : [];
  const enSkips = (x, paso) => skipsDe(x).indexOf(paso) >= 0;

  /* La unión de los saltos de la línea y de sus tres preguntas, igual que `applyOptionalSteps()`:
   * `furniture`, `measurements`, `preferences`, `review`, `recommendation`, `photos`… */
  function saltos(m) {
    return skipsDe(m.linea).concat(skipsDe(m.ruta), skipsDe(m.proposito), skipsDe(m.saber));
  }
  const pide = (m, paso) => saltos(m).indexOf(paso) < 0;

  function pideMueble(m) { return pide(m, 'furniture'); }
  function pideMedidas(m) { return pide(m, 'measurements'); }
  /* Las fotos son la excepción declarada: un camino puede pedir lo contrario (la compra directa
   * llega con la tela y los metros). La regla es la del formulario (`pideFotos()`). */
  function pideFotos(m) { return pide(m, 'photos'); }
  function hayRutaStep(m) { return Number(m.rutas && m.rutas.length) > 1; }
  function hayPropositoStep(m) { return Number(m.propositos && m.propositos.length) > 0; }
  function haySaberStep(m) { return Number(m.saberes && m.saberes.length) > 0; }
  const rutaLista = (m) => hayRutaStep(m) && (((m.ruta || {}).rutasConLista) || []).indexOf((m.ruta || {}).id) >= 0;
  const pideLista = (m) => rutaLista(m);
  const pidePedido = (m) => rutaLista(m) && !enSkips(m.ruta, 'order');
  const asks = (m) => ((m.linea && m.linea.asks) || []);
  const pideDanos = (m) => asks(m).indexOf('danos') >= 0;
  /* Los specs de los asks pueden venir como lista o como mapa por id (el catálogo los guarda como
   * mapa): aquí se leen igual, porque el contrato no debería saber de esa diferencia. */
  function specsDe(m) {
    const a = (m && m.asks) || [];
    if (Array.isArray(a)) return a.filter(x => x && typeof x === 'object');
    if (typeof a === 'object') return Object.entries(a).map(([id, spec]) => Object.assign({ id }, spec));
    return [];
  }

  /* ---- Los campos, en el orden SUGERIDO (el recorrido del formulario) ----
   *   aplica(m)  ¿este contrato —el de ESTA línea y sus caminos— pide ese campo?
   *   falta(m)   ¿está sin declarar? (solo tiene sentido si aplica)
   *   mensaje(m) la frase que se le dice al cliente (la conversación la reformula, no la contradice)
   * El progreso se cuenta sobre los campos que APLICAN: un contrato de siete campos lleno es el
   * 100 %, no un 50 % de catorce. */
  const CAMPOS = [
    { id: 'linea', paso: 0, bloque: 'viaje', etiqueta: 'Línea de servicio',
      aplica: () => true,
      falta: (m) => !(m.linea && m.linea.id),
      mensaje: () => 'Elige qué quieres hacer para continuar.', foco: 'serviceGrid' },

    { id: 'ruta', paso: 18, bloque: 'viaje', etiqueta: 'Qué necesitas',
      aplica: (m) => hayRutaStep(m),
      falta: (m) => !(m.ruta && m.ruta.id),
      /* La primera ruta ya viene elegida en el formulario; aquí se pregunta porque la conversación
       * puede empezar hablando de un pedido anterior y el formulario tiene que reflejarlo. */
      mensaje: () => 'Dime qué necesitas de esta línea: una compra nueva o completar un pedido.', foco: 'routeGrid' },

    { id: 'proposito', paso: 22, bloque: 'viaje', etiqueta: 'Para qué',
      aplica: (m) => hayPropositoStep(m),
      falta: (m) => !(m.proposito && m.proposito.id),
      mensaje: () => 'Dime para qué necesitas la tela: eso decide el resto del recorrido.', foco: 'purposeGrid' },

    { id: 'saber', paso: 23, bloque: 'viaje', etiqueta: 'Qué sabes',
      aplica: (m) => haySaberStep(m),
      falta: (m) => !(m.saber && m.saber.id),
      mensaje: () => 'Dime si ya conoces la tela y cuánto necesitas, o si lo miramos juntos.', foco: 'saberGrid' },

    /* El mueble y su descripción son UN solo campo del contrato: «Otro» sin decir cuál no está
     * declarado, y la frase de ese caso es la del formulario. */
    { id: 'mueble', paso: 1, bloque: 'pieza', etiqueta: 'Mueble',
      aplica: (m) => pideMueble(m),
      /* El mueble cuenta como falta hasta que el cliente lo DIGA (o toque su tarjeta): «Sofá» viene
       * por defecto, pero preguntarlo es parte del recorrido (dueño, 25/09: «assistant should ask
       * "que mueble quieres renovar"»). El mundo trae `elegido`. */
      falta: (m) => !(m.mueble && m.mueble.nombre) || !(m.mueble || {}).elegido
        || ((m.mueble || {}).nombre === 'Otro' && !String((m.mueble || {}).descripcion || '').trim()),
      mensaje: (m) => ((m.mueble || {}).nombre === 'Otro'
        ? 'Cuéntanos cuál es el mueble para continuar: «Otro» no dice qué hay que tapizar.'
        : 'Elige el mueble que quieres cotizar para continuar.'), foco: 'furnitureGrid' },

    { id: 'fotos', paso: null, bloque: 'evidencia', etiqueta: 'Fotos',
      aplica: (m) => pideFotos(m),
      falta: (m) => Number((m.fotos || {}).cargadas) < (Number((m.fotos || {}).min) || MIN_FOTOS_POR_DEFECTO),
      mensaje: (m) => {
        const min = Number((m.fotos || {}).min) || MIN_FOTOS_POR_DEFECTO;
        const faltan = min - (Number((m.fotos || {}).cargadas) || 0);
        return `Agrega ${faltan} ${faltan === 1 ? 'foto más' : 'fotos más'}: necesitamos al menos ${min}.`;
      }, foco: 'uploadZone' },

    { id: 'danos', paso: 2, bloque: 'por linea', etiqueta: 'Daños',
      aplica: (m) => pideDanos(m),
      falta: (m) => !Number((m.danos || {}).marcados),
      mensaje: () => 'Marca al menos una opción — «que lo revisen» también cuenta.', foco: 'damageGrid' },

    { id: 'medidas', paso: 9, bloque: 'medidas', etiqueta: 'Medidas',
      aplica: (m) => pideMedidas(m),
      falta: (m) => MEDIDAS_ORDEN.some(k => !Number(((m.medidas || {}).valores || {})[k])),
      mensaje: (m) => {
        const valores = (m.medidas || {}).valores || {};
        const vacia = MEDIDAS_ORDEN.find(k => !Number(valores[k]));
        if (vacia) return `Me falta el ${NOMBRE_MEDIDA[vacia]} del mueble: sin las tres medidas no puedo calcular la tela.`;
        const fuera = fueraDeRango(m);
        if (fuera) return `El ${NOMBRE_MEDIDA[fuera.id]} de ${fuera.valor} cm no es una medida posible: va de ${fuera.min} a ${fuera.max} cm.`;
        const raro = muyFueraDeLoHabitual(m)[0];
        return raro
          ? `${NOMBRE_MEDIDA[raro.id]} de ${raro.valor} cm está muy fuera de lo habitual para ${String((m.medidas || {}).mueble || 'este mueble').toLowerCase()} (lo habitual: ${raro.min} a ${raro.max} cm). Corrige la medida para continuar.`
          : 'Revisa las medidas del mueble para continuar.';
      }, foco: 'width' },

    { id: 'revision', paso: 13, bloque: 'medidas', etiqueta: 'Revisión',
      aplica: (m) => pide(m, 'review'),
      falta: (m) => !(m.revision || {}).analizada,
      mensaje: () => 'Revisa tu información para continuar.', foco: 'analyzeButton' },

    /* El paso 14 (la recomendación) ES del recorrido de esta línea: sin la tela ELEGIDA por el
     * cliente el contrato no está lleno — la que trae el formulario es automática (`auto`), no una
     * elección (dueño, 24/09: «no me dejaste escoger el color»). */
    { id: 'tela', paso: 14, bloque: 'por linea', etiqueta: 'Tela',
      aplica: (m) => pide(m, 'recommendation') || pasoEnElFlujo(14, m),
      falta: (m) => !(m.fabric && m.fabric.touched),
      mensaje: () => 'Elige la tela para tu mueble: te digo cuáles sirven y a cuánto el metro.',
      foco: 'fabricGrid' },

    /* El paso 17 (los insumos del trabajo): la línea los pide (`asks:["insumos"]`) y la
     * conversación no los cobraba (dueño, 24/09: «no has hecho todavía lo de los insumos»). */
    { id: 'insumos', paso: 17, bloque: 'por linea', etiqueta: 'Insumos',
      aplica: (m) => asks(m).indexOf('insumos') >= 0 || pasoEnElFlujo(17, m),
      falta: (m) => !Number(((m.supplies || []).length)),
      mensaje: () => 'Con tus medidas estimo los insumos del taller: dime si los dejo así.',
      foco: 'insumoRows' },

    /* El paso 12 (preferencias): estilo y color deciden la recomendación; el formulario los
     * pregunta y la conversación los saltaba (el mismo caso del dueño). */
    { id: 'preferencias', paso: 12, bloque: 'por linea', etiqueta: 'Estilo y color',
      aplica: (m) => pide(m, 'preferences') || pasoEnElFlujo(12, m),
      falta: (m) => !String(((m.preferencias || {}).style) || '').trim()
        || !String(((m.preferencias || {}).color) || '').trim(),
      mensaje: () => 'Dime el estilo y el color que quieres para la tela, y con eso te recomiendo.',
      foco: 'style' },

    /* El presupuesto: se pregunta en Validación, en la unidad del oficio (docs/presupuesto.md). */
    { id: 'presupuesto', paso: 13, bloque: 'medidas', etiqueta: 'Presupuesto',
      aplica: (m) => !!((m.budget || {}).declared) || pasoEnElFlujo(13, m),
      falta: (m) => !((m.budget || {}).declared),
      mensaje: () => 'Dime tu presupuesto para orientar la recomendación.',
      foco: 'budget' },

    { id: 'lista', paso: 20, bloque: 'por linea', etiqueta: 'Referencias',
      aplica: (m) => pideLista(m),
      falta: (m) => !Number((m.lista || {}).filas),
      mensaje: (m) => (m.lista || {}).intencionTela
        ? 'Elige la tela para calcular cuántos metros necesita tu mueble.'
        : 'Agrega al menos una referencia con su cantidad para calcular tu estimación.', foco: 'listRows' },

    { id: 'pedido', paso: 21, bloque: 'por linea', etiqueta: 'Pedido anterior',
      aplica: (m) => pidePedido(m),
      falta: (m) => !(m.pedido || {}).dicho,
      mensaje: () => 'Escribe el número de la solicitud o la referencia del pedido que vas a completar.', foco: 'pedidoBusca' },

    { id: 'atencion', paso: 15, bloque: 'contacto', etiqueta: 'Atención',
      aplica: () => true,
      falta: (m) => {
        const a = m.atencion || {};
        return !String(a.cliente || '').trim() || !String(a.servicio || '').trim();
      },
      mensaje: (m) => {
        const a = m.atencion || {};
        if (!String(a.cliente || '').trim()) return 'Necesito saber en qué ciudad estás: elige una ciudad para continuar.';
        if (!String(a.servicio || '').trim()) return 'Necesito saber para qué ciudad es el servicio: elige una ciudad para continuar.';
        return 'Necesito saber la atención para continuar.';
      }, foco: 'customerCity' },

    { id: 'contacto', paso: 15, bloque: 'contacto', etiqueta: 'Contacto',
      aplica: () => true,
      falta: (m) => faltaElContacto(m) !== null,
      mensaje: (m) => MENSAJE_CONTACTO[faltaElContacto(m)] || 'Completa tus datos de contacto para continuar.', foco: 'fullName' },
  ];

  const MEDIDAS_ORDEN = ['width', 'height', 'depth'];

  const MENSAJE_CONTACTO = {
    nombre: 'Escribe tu nombre aquí abajo (así no se pierde ni una letra).',
    correoSin: 'Necesito tu correo: ahí te llega la copia de tu pre-cotización.',
    correoMal: 'Ese correo no tiene forma de correo: revísalo y te mando la copia.',
    celularSin: 'Me falta tu celular: un asesor te escribe por ahí.',
    celularMal: 'Ese celular no tiene pinta de celular: escríbelo como 300 123 4567.',
    autorizacion: 'Marca la autorización: sin ella no puedo usar tus datos ni que un asesor te contacte.',
  };

  /* Lo que falta del contacto, con el mismo orden del formulario (`validStep`, paso 15). */
  function faltaElContacto(m) {
    const c = m.contacto || {};
    if (!String(c.nombre || '').trim()) return 'nombre';
    if (!String(c.correo || '').trim()) return 'correoSin';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c.correo || ''))) return 'correoMal';
    if (!String(c.celular || '').trim()) return 'celularSin';
    if ((String(c.celular || '').match(/\d/g) || []).length < 7) return 'celularMal';
    if (c.autoriza !== true) return 'autorizacion';
    return null;
  }

  /* Las medidas imposibles: primero la puerta del formulario (sus atributos `min`/`max`), después la
   * banda del ±20 % sobre los rangos del catálogo. Dentro de la banda pero fuera del rango es un
   * AVISO, no un bloqueo — así lo trata el formulario. */
  const rangoDe = (m, k) => (((m.catalogo || {}).rangos || {})[(m.medidas || {}).mueble] || {})[k]
    || MEDIDAS_POSIBLES[k];
  function fueraDeRango(m) {
    const valores = ((m.medidas || {}).valores) || {};
    for (const k of MEDIDAS_ORDEN) {
      const v = Number(valores[k]); if (!v) continue;
      const [a, b] = MEDIDAS_POSIBLES[k];
      if (v < a || v > b) return { id: k, valor: v, min: a, max: b };
    }
    return null;
  }
  const bandaDe = (m, k) => {
    const [a, b] = rangoDe(m, k);
    const margen = Math.round((b - a) * MARGEN_MEDIDA);
    return [a - margen, b + margen];
  };
  function muyFueraDeLoHabitual(m) {
    const valores = ((m.medidas || {}).valores) || {};
    const out = [];
    for (const k of MEDIDAS_ORDEN) {
      const v = Number(valores[k]); if (!v) continue;
      const [a, b] = rangoDe(m, k);
      const [lo, hi] = bandaDe(m, k);
      if (v < lo || v > hi) out.push({ id: k, valor: v, min: a, max: b, margen: Math.round((b - a) * MARGEN_MEDIDA) });
    }
    return out;
  }

  /* ---- La API ---- */

  /* Los campos que ESTE contrato pide (los de su línea y sus caminos), en el orden sugerido. */
  /* EL CONTRATO ES EL WIZARD: un campo manda si el PASO del wizard al que pertenece está en el flujo
   * de esta rama/subrama (las secciones que esta línea tiene a la vista) — el espejo no decide ese
   * flujo. `aplica` sigue sumando lo suyo (nunca resta).
   *
   * El flujo viaja en el MUNDO (`m.flujo`, que el cotizador llena con `pasosVisibles()`): los pasos
   * del wizard no se esconden con el atributo `hidden` —viajan con `skippedSteps`—, así que mirar el
   * DOM desde aquí mentía: daba por presente hasta el paso 21 en una línea que no lo tiene, y la
   * conversación preguntaba por caminos que el recorrido no pide (medido: retapizado pedía «¿compra
   * nueva o pedido?», y sus fotos nunca llegaban a preguntarse). Sin `flujo` manda `aplica`. */
  const pasoEnElFlujo = (paso, m) => paso != null && !!(m && Array.isArray(m.flujo)) && m.flujo.indexOf(Number(paso)) >= 0;

  /* EL ORDEN ES EL DEL RECORRIDO. El contrato se recorre en el orden en que ESTA rama camina el
   * wizard (`m.flujo` = `pasosVisibles()`), no en el orden en que el código lista sus reglas: así
   * preguntar «lo que falta» pregunta lo primero del recorrido, y pasos que el código lista tarde
   * (la tela, los insumos) se preguntan donde el wizard los pide (dueño, 24/09: «cada rama del
   * wizard… debes recorrerla… y solo devolver para que pregunte por los que falten»). */
  const posicionEnElRecorrido = (m, c) => {
    const flujo = (m && m.flujo) || [];
    /* Sin paso propio (las fotos viven en la conversación, no en un paso): con un recorrido a la
     * vista van justo DESPUÉS de la línea —al abrir, primero «qué necesitas» y enseguida las fotos—;
     * sin recorrido (un mundo suelto, sin rama elegida) manda el orden en que las reglas están
     * listadas, para que la primera pregunta siga siendo la línea. */
    if (c.paso == null) return flujo.length ? 0.5 : 999;
    const i = flujo.indexOf(Number(c.paso));
    return i < 0 ? 999 : i;
  };
  const losDelRecorrido = (m) => CAMPOS.filter(c => c.aplica(m) || pasoEnElFlujo(c.paso, m))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => posicionEnElRecorrido(m, a.c) - posicionEnElRecorrido(m, b.c) || a.i - b.i)
    .map(x => x.c);
  const campos = (m) => losDelRecorrido(m).map(c => ({ id: c.id, paso: c.paso, bloque: c.bloque, etiqueta: c.etiqueta }));

  function faltantes(m) {
    return losDelRecorrido(m).filter(c => c.falta(m)).map(c => ({
      id: c.id, paso: c.paso, bloque: c.bloque, etiqueta: c.etiqueta,
      mensaje: c.mensaje(m), foco: c.foco
    }));
  }

  /* El progreso, contado sobre los campos que APLICAN: un contrato de siete campos lleno es el
   * 100 %, no un 50 % de los catorce que existen entre todas las líneas. */
  function progreso(m) {
    const aplican = CAMPOS.filter(c => c.aplica(m)).length;
    const faltan = faltantes(m);
    const hechos = aplican - faltan.length;
    return { hechos, total: aplican, porcentaje: aplican ? Math.round(hechos * 100 / aplican) : 100, faltantes: faltan };
  }

  const puedeEnviar = (m) => faltantes(m).length === 0;

  /* El valor que el cliente DICTÓ o escribió, juzgado antes de entrar al contrato. Devuelve
   * {ok:false, motivo} o {ok:true, valor} — con `aviso` cuando pasa pero conviene decirlo (una
   * medida dentro de la banda del formulario pero fuera de lo habitual). */
  function validarValor(m, id, valor) {
    if (NUNCA_LO_PONE_LA_IA.indexOf(id) >= 0) {
      return { ok: false, motivo: `«${id}» no lo puede escribir la conversación: lo pone el cliente o el motor` };
    }
    const cat = m.catalogo || {};
    const enCatalogo = (lista, v, que) => lista.some(x => String(x && x.id != null ? x.id : x) === String(v))
      ? { ok: true, valor: v } : { ok: false, motivo: `«${valor}» no está en el catálogo de ${que}` };

    switch (id) {
      case 'linea': return enCatalogo(cat.lineas || [], valor, 'líneas');
      case 'ruta': return enCatalogo(m.rutas || [], valor, 'caminos');
      case 'proposito': return enCatalogo(m.propositos || [], valor, 'propósitos');
      case 'saber': return enCatalogo(m.saberes || [], valor, 'respuestas');
      case 'mueble': return enCatalogo(cat.muebles || [], valor, 'muebles');
      case 'muebleOtro': {
        const dicho = String(valor || '').trim();
        if (!dicho) return { ok: false, motivo: 'una descripción vacía no dice cuál es el mueble' };
        /* La descripción solo aplica si el mueble es «Otro»: con el catálogo elegido, ese texto es
         * ruido — y el modelo vivo metía frases sueltas ahí (medido: «Anotado: también.»). */
        if (String(((m.mueble || {}).nombre) || '') !== 'Otro') {
          return { ok: false, motivo: 'el mueble elegido no es «Otro»: esa descripción no aplica' };
        }
        if (dicho.length > 80) return { ok: false, motivo: 'la descripción del mueble es demasiado larga' };
        return { ok: true, valor: dicho };
      }
      case 'danos': {
        const ids = Array.isArray(valor) ? valor : [valor];
        if (!ids.length) return { ok: false, motivo: 'sin daños no hay nada que revisar' };
        for (const v of ids) { const r = enCatalogo(cat.danos || [], v, 'daños'); if (!r.ok) return r; }
        return { ok: true, valor: ids };
      }
      case 'tela': {
        const dicho = String(valor || '').trim();
        return dicho ? { ok: true, valor: dicho } : { ok: false, motivo: 'una tela sin nombre no dice cuál' };
      }
      case 'insumos': {
        const ok = /\b(s[ií]|claro|estima|est[íi]mala|est[íi]malos|adelante|hazlo|dale|d[eé]jal[oa]s?|as[ií] est[áa]|listo)\b/i.test(String(valor || '').trim());
        return ok ? { ok: true, valor: true } : { ok: false, motivo: 'para los insumos dime si los estimo («estímalos»)' };
      }
      /* El estilo, el color y el presupuesto los valida el caso del DOM (sus mismos selects). */
      case 'preferencias': case 'presupuesto': return { ok: true, valor: valor };
      case 'medidas': {
        const { campo, valor: v } = valor || {};
        if (MEDIDAS_ORDEN.indexOf(campo) < 0) return { ok: false, motivo: `«${campo}» no es una medida del mueble` };
        const n = Number(v);
        if (!(n > 0)) return { ok: false, motivo: 'una medida tiene que ser un número mayor que cero' };
        const [a, b] = MEDIDAS_POSIBLES[campo];
        if (n < a || n > b) {
          return { ok: false, motivo: `El ${NOMBRE_MEDIDA[campo]} de ${n} cm no es una medida posible: va de ${a} a ${b} cm.` };
        }
        const [lo, hi] = bandaDe(m, campo);
        if (n < lo || n > hi) {
          const [ra, rb] = rangoDe(m, campo);
          return { ok: false, motivo: `El ${NOMBRE_MEDIDA[campo]} de ${n} cm está muy fuera de lo habitual para ${String((m.medidas || {}).mueble || 'este mueble').toLowerCase()} (lo habitual: ${ra} a ${rb} cm).` };
        }
        const [ra, rb] = rangoDe(m, campo);
        return (n < ra || n > rb) ? { ok: true, valor: n, aviso: 'está fuera de lo habitual, pero se puede seguir' }
          : { ok: true, valor: n };
      }
      case 'contacto': {
        const { campo, valor: v } = valor || {};
        if (campo === 'autorizacion') return { ok: false, motivo: 'la autorización la marca el cliente, no la conversación' };
        if (campo === 'correo') {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ''))) return { ok: false, motivo: MENSAJE_CONTACTO.correoMal };
          return { ok: true, valor: String(v).trim() };
        }
        if (campo === 'celular') {
          if ((String(v || '').match(/\d/g) || []).length < 7) return { ok: false, motivo: MENSAJE_CONTACTO.celularMal };
          return { ok: true, valor: String(v).trim() };
        }
        if (campo === 'nombre') {
          const dicho = String(v || '').trim();
          if (!dicho) return { ok: false, motivo: MENSAJE_CONTACTO.nombre };
          return { ok: true, valor: dicho };
        }
        return { ok: false, motivo: `«${campo}» no es un dato de contacto` };
      }
      case 'respuestas': {
        const { ask, campo, valor: v } = valor || {};
        const spec = specsDe(m).filter(a => a.id === ask)[0];
        if (!spec) return { ok: false, motivo: `esta línea no pregunta «${ask}»` };
        const grupo = (spec.groups || []).filter(g => g.id === campo)[0];
        if (!grupo) return { ok: false, motivo: `«${campo}» no es una pregunta de «${ask}»` };
        if (grupo.type === 'fields') {
          const f = (grupo.fields || []).filter(x => x.id === v.campo)[0];
          if (!f) return { ok: false, motivo: `«${v.campo}» no es un campo de «${campo}»` };
          const n = Number(v.valor);
          return (n >= f.min && n <= f.max)
            ? { ok: true, valor: n }
            : { ok: false, motivo: `«${f.label || v.campo}» va de ${f.min} a ${f.max}` };
        }
        const opciones = (grupo.options || []).map(o => String(o.id));
        return opciones.indexOf(String(v)) >= 0
          ? { ok: true, valor: v }
          : { ok: false, motivo: `«${v}» no es una opción de «${grupo.label || campo}»` };
      }
      default:
        return { ok: false, motivo: `«${id}» no es un campo del contrato` };
    }
  }

  const api = {
    CAMPOS, NUNCA_LO_PONE_LA_IA, MEDIDAS_POSIBLES, MARGEN_MEDIDA, MENSAJE_CONTACTO,
    campos, faltantes, progreso, puedeEnviar, validarValor,
    pideMueble, pideMedidas, pideFotos, pideDanos, pideLista, pidePedido,
    hayRutaStep, hayPropositoStep, haySaberStep,
    fueraDeRango, muyFueraDeLoHabitual, faltaElContacto, saltos
  };
  root.Contrato = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
