/* LA REVISIÓN DEL COTIZADOR (src/wizard) — corte 4.
 *
 * El paso «Revisemos que todo sea coherente»: las filas declaradas (que son también el contexto del
 * asistente y el prompt de la mirada), el resumen de lo que se va a revisar, las medidas raras, el
 * repaso que pinta los chequeos (`runReview`) y la revisión de la FOTO —la mirada del modelo, con su
 * espera y su fila— más el botón «Revisar mi información» que lo dispara todo.
 *
 * La mirada: el modelo describe la foto, con lo declarado delante. Nace de la petición del dueño:
 * «this step needs eyes for validation of photos... and related with another information». Mira la
 * foto más grande —el mismo criterio con el que la revisión señala «la menor»— y nunca decide nada:
 * la fila es una observación a nombre de ella, no bloquea el paso, y si no hay modelo o su texto
 * rompe el cerco queda la línea neutra. Sin modelo no se pinta fila: no se fingen ojos.
 *
 * `mirandoFoto` vive ARRIBA, a nivel del módulo, a propósito: `validStep` (que se queda en la página
 * hasta su corte) y las specs del área lo leen por `evaluate`; en una closure dejaría de existir.
 */
import { guardarElTaller, elTaller } from './casa.js';

let laRevision = null;   /* nombre del módulo: los top-level se pegan en un script */
let mirandoFoto = false;

/* La validación del paso de la revisión lee si la mirada está corriendo: `mirandoFoto` no sale de
 * este módulo, así que viaja esta puerta y no una copia. */
export function estasMirando() { return mirandoFoto; }

export function pintarLaRevision() { const v = laRevision; return v ? v.pintarResumen() : false; }
export function correrLaRevision() { const v = laRevision; return v ? v.correr() : false; }
export function lasFilasDeclaradas() { const v = laRevision; return v ? v.filas() : []; }

export function conectarLaRevision(elPuenteDeLaPagina) {
  guardarElTaller(elPuenteDeLaPagina);
  const C = elTaller();
  if (!C) return false;
  const E = C.estado;

  function declaredRows() {
    const rule = C.reglasDelMueble()[E.furniture];
    /* La etiqueta de la cantidad: con `#seats` vacío (sin mueble elegido no hay opciones) esto no puede
     * caerse — la pieza en foco manda y, si no hay nada, no hay etiqueta. */
    const qty = (C.seatsSelect.options[C.seatsSelect.selectedIndex] || {}).text || '';
    const w = document.getElementById('width').value, h = document.getElementById('height').value, d = document.getElementById('depth').value;
    const coverage = { complete: 'Todo el mueble', seats: 'Solo asiento y respaldo', partial: 'Una parte específica' }[document.getElementById('coverage').value] || '—';
    const needs = [...document.querySelectorAll('#needsGrid input:checked')].map(x => x.value);
    /* Cada fila existe si el paso que la declara existe para esta línea: la arquitectónica no habla
     * de muebles, medidas ni preferencias, y su resumen no puede inventarlos. */
    const rows = [['Motivo', E.service ? E.service.label : 'Sin elegir']];
    /* CON VARIAS PIEZAS el resumen va UNA FILA POR PIEZA —mueble, cuántas, sus medidas, qué se tapiza y sus
     * fotos—, que es exactamente lo que el cliente llenó (docs/piezas-en-la-cotizacion.md). Con una sola se
     * queda como siempre. */
    const lasPiezas = (E.piezas || []).filter(p => p.furniture);
    const varias = lasPiezas.length > 1;
    if (C.pideMueble() && varias) {
      const COB = { complete: 'todo el mueble', seats: 'solo asiento y respaldo', partial: 'una parte específica' };
      lasPiezas.forEach((p, i) => {
        const mm = p.medidas, medidas = (mm.width && mm.height && mm.depth) ? `${mm.width} × ${mm.height} × ${mm.depth} cm` : 'sin medidas';
        const suyas = C.fotosDeLaPieza(p).length;
        rows.push([`Pieza ${i + 1}`, `${p.furniture}${Number(p.cantidad) > 1 ? ` × ${p.cantidad}` : ''} · ${medidas} · ${COB[mm.cobertura || 'complete']} · ${suyas} foto${suyas === 1 ? '' : 's'}`]);
      });
    }
    if (C.pideMueble() && !varias) rows.push(['Mueble', !E.furniture ? 'Sin elegir' : (!rule ? E.furniture : (rule.scaleByQty && C.seatsSelect.value === '1' ? E.furniture : `${E.furniture} · ${qty}`))]);
    if (C.pideMedidas() && !varias) {
      rows.push(['Medidas', w && h && d ? `${w} × ${h} × ${d} cm (ancho × alto × fondo)` : 'Sin registrar']);
      rows.push(['Qué se tapiza', coverage]);
    }
    if (C.pidePreferencias()) {
      rows.push(['Uso previsto', needs.length ? needs.join(' · ') : 'Sin preferencias marcadas']);
      rows.push(['Estilo y color', `${document.getElementById('style').value} · ${document.getElementById('color').value}`]);
    }
    /* Las fotos son la excepción declarada —se piden en todas las líneas— salvo que la RUTA las deje
     * fuera: las rutas de la cantidad declarada llegan con la tela y los metros. */
    if (C.pideFotos()) rows.push(['Fotografías', `${E.photos.length} adjunta${E.photos.length === 1 ? '' : 's'}`]);
    (() => { const b = C.presupuestoDeclarado();
      rows.push(['Presupuesto', b.declared ? `Hasta ${C.money(b.amount)} ${b.unitLabel}` : 'Sin tope declarado']); })();
    (() => { const a = C.atencionDeclarada();
      if (a.customerCity) rows.push(['Ciudad del cliente', a.customerCity]);
      if (a.serviceCity) rows.push(['Ciudad del servicio', a.serviceCity]);
      if (a.servicePoint) rows.push(['Sede', a.servicePoint.city ? `${a.servicePoint.city} · ${a.servicePoint.name}` : a.servicePoint.name]); })();
    const ds = C.damageIds();
    if (ds.length) rows.splice(3, 0, ['Reparaciones', C.Store.damageItems().filter(d => ds.indexOf(d.id) >= 0).map(d => d.label).join(' · ')]);
    return rows;
  }
  function renderReviewSummary() {
    document.getElementById('aiSummary').innerHTML =
      '<h4>Esto es lo que vamos a revisar</h4><dl>' +
      declaredRows().map(([k, v]) => `<div><dt>${C.esc(k)}</dt><dd>${C.esc(v)}</dd></div>`).join('') + '</dl>';
  }

  // Measurements outside the backoffice's plausible range for this furniture.
  function oddMeasures() {
    const r = C.rangosDeMedida()[E.furniture] || { width: [20, 1000], height: [20, 500], depth: [5, 500] };
    return Object.keys(r).filter(k => {
      const v = +document.getElementById(k).value;
      return !v || v < r[k][0] || v > r[k][1];
    });
  }
  function runReview() {
    const checks = [];

    // 1. the photos — we genuinely know their sizes, so report those and nothing more.
    //    Solo si la línea pide fotos (el paso del mueble las sube): la arquitectónica no las pide.
    const n = E.photos.length;
    const chicas = E.photos.filter(ph => ph.width < 600 || ph.height < 600);
    if (!n) {
      checks.push({ ok: false, title: 'Fotografías recibidas', detail: 'No recibimos ninguna fotografía.' });
    } else if (chicas.length) {
      const menor = chicas.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b));
      checks.push({ ok: false, title: `${n} fotografía${n === 1 ? '' : 's'} recibida${n === 1 ? '' : 's'}`,
        detail: `${chicas.length} ${chicas.length === 1 ? 'es de baja resolución' : 'son de baja resolución'} (la menor mide ${menor.width}×${menor.height} px). Un asesor podría pedirte otras.` });
    } else {
      const menor = E.photos.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b));
      checks.push({ ok: true, title: `${n} fotografía${n === 1 ? '' : 's'} recibida${n === 1 ? '' : 's'}`,
        detail: `Todas tienen resolución suficiente (la menor mide ${menor.width}×${menor.height} px).` });
    }

    /* 1b. La NITIDEZ: medida sobre los píxeles al cargar (`medirNitidez`), no la palabra del modelo.
     *     No bloquea —el asesor mira la foto igual—, pero se dice, y una foto repetida se agradece. */
    const borrosas = E.photos.filter(ph => typeof ph.nitidez === 'number' && ph.nitidez < C.NITIDEZ_MINIMA);
    if (borrosas.length) {
      checks.push({ ok: false, title: `${borrosas.length} foto${borrosas.length === 1 ? '' : 's'} fuera de foco`,
        detail: `Se ve poco detalle${borrosas.length === 1 ? '' : ' en ellas'}: vuelve a ${borrosas.length === 1 ? 'tomarla' : 'tomarlas'} con más luz y el teléfono quieto. El asesor las mira igual.` });
    }

    // 2. the measurements — real arithmetic against plausible ranges, solo si la línea las pide:
    //    sin ese paso no hay rangos que aplicar ni medidas que corregir.
    if (C.pideMedidas()) {
      const odd = oddMeasures();
      checks.push({ ok: !odd.length, title: 'Medidas registradas',
        detail: odd.length
          ? `El ${odd.map(k => C.MEASURE_LABELS[k]).join(' y el ')} está fuera de lo habitual para ${E.furniture.toLowerCase()}. Corrige la medida para continuar.`
          : `Ancho, alto y fondo están dentro de lo habitual para ${E.furniture.toLowerCase()}.` });
    }

    // 3. completeness — what the estimate actually needs
    checks.push({ ok: true, title: 'Datos suficientes para estimar',
      /* «de tela» no vale para la arquitectónica (va por m² de paneles o muros): fuera de ella la
       * frase se queda como estaba — su largo mueve el alto del panel y con él la barra lateral. */
      detail: `Podemos calcular un rango preliminar${E.service && E.service.pricing === 'm2' ? '' : ' de tela'} con esta información.` });

    /* El presupuesto declarado, al final: dato del negocio, en la unidad del oficio. No bloquea
     * —«más de $X» es una declaración legítima— y no corre las filas de siempre (hay pruebas que las
     * cuentan por posición). */
    (() => { const b = C.presupuestoDeclarado();
      checks.push(b.declared
        ? { ok: true, title: 'Presupuesto declarado', detail: `Hasta ${C.money(b.amount)} ${b.unitLabel}, para ordenar la recomendación y contrastar la estimación.` }
        : { ok: true, title: 'Sin tope de presupuesto', detail: 'No pusiste tope: verás todas las telas y la estimación sin contraste.' }); })();

    return checks;
  }

  const FILA_MIRADA = (titulo, detalle, ok) => `<div class="${ok ? '' : 'warn'}"><span>${ok ? '✓' : '!'}</span>` +
    `<p><b>${C.esc(titulo)} ${C.etiquetaIA()}</b><small>${C.esc(detalle)}</small></p></div>`;
  /* Mientras mira: el título, el icono girando y una barra indeterminada — movimiento inequívoco. */
  const filaPensando = () => `<div><span class="mirada-gira"></span><p><b>Mirando tus fotos ${C.etiquetaIA()}</b>` +
    `<small>${C.esc(C.asistenteNombre())} está analizando tus fotografías.</small>` +
    `<span class="mirada-espera" role="status" aria-label="${C.esc(C.asistenteNombre())} está analizando tus fotografías."></span></p></div>`;
  const MIRADA_NO_MOSTRABLE = () => `${C.asistenteNombre()} miró la fotografía, pero su respuesta no se puede mostrar aquí. Un asesor la revisa y te dice si sirve.`;
  /* Cuando el equipo no puede mirar —o el modelo se cae— la fila lo dice: el cliente tiene que ver qué
   * pasó con su foto. Dos frases distintas porque son dos cosas distintas: una capacidad que este
   * equipo no tiene, y un intento que se cayó — y con la API hablan de la API, no del navegador. */
  const MIRADA_SIN_OJOS = () => C.proveedorIA() === 'api'
    ? 'La API del modelo no aceptó la fotografía, así que no la pude mirar. Un asesor la revisa y te dice si sirve.'
    : 'En este equipo no puedo mirar la fotografía: al modelo local le falta la variante de imagen. Un asesor la revisa y te dice si sirve.';
  const MIRADA_FALLO = () => C.proveedorIA() === 'api'
    ? 'No pude mirar la fotografía con la API del modelo. Un asesor la mira y te dice si sirve.'
    : 'No pude mirar la fotografía con el modelo local de este equipo. Un asesor la mira y te dice si sirve.';
  /* Lo mínimo que se ven los puntos, aunque el equipo conteste al instante: la misma razón del chat
   * (`ESPERA_MINIMA_MS`) — una señal que parpadea no se lee como que el cotizador hizo algo. */
  const esperarLoMinimo = async desde => { const falta = C.ESPERA_MINIMA_MS - (Date.now() - desde);
    if (falta > 0) await new Promise(r => setTimeout(r, falta)); };
  /* Mientras la mirada corre, «Continuar» no se puede pulsar (y si se pulsa igual, `validStep` lo
   * dice): el paso de revisión no puede cerrarse con una foto que la IA todavía está mirando. */
  const bloquearContinuar = v => { C.nextButton().disabled = v; };

  const fotoMasGrande = () => E.photos.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));

  /* La foto original puede pesar megas y al modelo solo va una mirada: se manda una copia de 1024 px
   * como máximo, hecha en el propio navegador (con la API, sale del equipo solo esa copia). Devuelve
   * las dos formas de la misma copia: Blob para el modelo del navegador, data URL para la API. */
  function fotoPequeña(dataUrl, max = 1024) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const lienzo = document.createElement('canvas');
          lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
          lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
          lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
          const copia = lienzo.toDataURL('image/jpeg', 0.8);
          lienzo.toBlob(b => b ? resolve({ blob: b, dataUrl: copia }) : reject(new Error('la foto no se pudo reducir')), 'image/jpeg', 0.8);
        } catch (err) { reject(err) }
      };
      img.onerror = () => reject(new Error('la foto no se pudo leer'));
      img.src = dataUrl;
    });
  }
  /* La imagen mínima con la que se prueba la capacidad de mirar: un píxel blanco, en las dos formas. */
  function pixelBlanco() {
    const pixel = document.createElement('canvas'); pixel.width = pixel.height = 1;
    const dataUrl = pixel.toDataURL('image/jpeg', 0.8);
    return new Promise(resolve => pixel.toBlob(b => resolve({ blob: b, dataUrl }), 'image/jpeg', 0.8));
  }
  function promptDeLaMirada() {
    return [
      'Eres el asistente de un taller de tapicería y acabas de ver la fotografía que un cliente subió a su precotización.',
      'Mira la fotografía y contesta SOLO con un JSON de esta forma: {"veMueble": true o false, "frase": "lo que ves, en una o dos frases, en español de Colombia"}.',
      'Pon "veMueble": false si en la foto no se ve el mueble —un documento, una habitación, una mano, cualquier otra cosa— y que la frase lo diga tal cual, sin describir nada más.',
      'Lo que el cliente declaró:',
      declaredRows().map(([k, v]) => `- ${k}: ${v}`).join('\n'),
      'REGLAS QUE NO PUEDES ROMPER: no inventes lo que la foto no muestra; no des cifras ni medidas ni precios; no prometas plazos de entrega, garantías, transporte, recogida, rellenos ni descuentos; no digas que confirmas lo declarado ni que la medida está bien —solo lo que ves—; no nombres telas del catálogo.',
    ].join('\n');
  }
  /* El veredicto que la mirada devuelve en JSON: si ve el mueble y la frase que se muestra. Si no se
   * puede leer —un modelo que contesta en prosa— queda null y se usa el texto tal cual, en ámbar. */
  function leerLaMirada(crudo) {
    try {
      const d = JSON.parse(crudo.slice(crudo.indexOf('{'), crudo.lastIndexOf('}') + 1));
      if (d && typeof d.frase === 'string' && d.frase.trim()) return { veMueble: d.veMueble === true, frase: d.frase.trim() };
    } catch (err) { }
    return null;
  }
  function pintarLaMirada(titulo, detalle, ok) {
    const caja = document.getElementById('visionNote');
    caja.innerHTML = FILA_MIRADA(titulo, detalle, ok);
    caja.hidden = false;
  }
  function pintarEspera() {
    const caja = document.getElementById('visionNote');
    caja.innerHTML = filaPensando();
    caja.hidden = false;
  }
  /* ¿Este equipo acepta imágenes? Se pregunta UNA vez y con una imagen DE VERDAD, no con la letra de
   * la documentación. Con el modelo del navegador: `availability({expectedInputs:[{type:'image'}]})`
   * primero y después mirar un píxel blanco, porque hay Chrome con el modelo listo para texto que
   * acepta la sesión y RECHAZA la imagen al pedirla (medido el 19/09). Con la API, el mismo criterio
   * un nivel más arriba: se le manda un píxel blanco y solo entonces la fila se pinta. Mejor ninguna
   * fila que ojos prometidos. */
  let verComprobado = null;
  async function puedeVerLaFoto() {
    if (verComprobado !== null) return verComprobado;
    const proveedor = C.proveedorIA();
    if (!proveedor) { verComprobado = false; return false }
    if (proveedor === 'api') {
      try {
        const sonda = await C.sesionDelProveedor('Contesta solo «ok».');
        await sonda.pedir({ texto: 'ok', imagen: await pixelBlanco() });
        sonda.soltar();
        verComprobado = true;
      } catch (err) {
        console.warn('[revisión] la API no mira fotos en este momento', err);
        verComprobado = false;
      }
      return verComprobado;
    }
    try {
      /* 1) Lo que el navegador DICE de la entrada de imagen: 'unavailable' (este equipo no tiene la
       * variante multimodal), 'downloadable'/'downloading' (existe y no está bajada — y aquí no se baja
       * nada: bajar gigas no puede ser el precio de abrir una cotización) o 'available'. */
      if (typeof C.IA_LOCAL.availability === 'function') {
        const dicho = await C.IA_LOCAL.availability({ expectedInputs: [{ type: 'image' }] });
        if (dicho !== 'available') {
          console.warn('[revisión] la mirada con IA no está lista en este equipo:', dicho);
          verComprobado = false; return false;
        }
      }
      /* 2) Y la verdad de verdad: mirar una imagen —un píxel blanco—, porque hay navegadores que
       * aceptan la sesión y RECHAZAN la imagen al pedirla (medido el 19/09 en el Chrome del dueño). */
      const sonda = await C.IA_LOCAL.create({ expectedInputs: [{ type: 'image' }] });
      await sonda.prompt([{ role: 'user', content: [{ type: 'text', value: 'ok' }, { type: 'image', value: (await pixelBlanco()).blob }] }]);
      if (sonda.destroy) sonda.destroy();
      verComprobado = true;
    } catch (err) {
      console.warn('[revisión] este equipo no mira fotos con el modelo local', err);
      verComprobado = false;
    }
    return verComprobado;
  }
  const sinCapacidadDeImagen = err => /image|imagen|not.?support|unsupported|NotSupportedError/i
    .test(String((err && err.name) || '') + ' ' + String((err && err.message) || err || ''));
  /* El aviso de la tarjeta dice que la revisión «describe lo que ve en la foto» cuando el equipo tiene el
   * modelo: si el modelo está pero no mira fotos, el aviso lo aclara — prometer una mirada que no va a
   * llegar es justo lo que este prototipo no hace. (Sin modelo no se añade nada: ahí no prometía.) */
  function marcarSinOjos() {
    const p = document.getElementById('reviewNotice');
    if (!p || !C.iaDisponible()) return;
    const quien = C.asistenteCfg().enabled ? C.asistenteCfg().name : 'la IA local';
    const dicho = C.proveedorIA() === 'api'
      ? ' En este momento la API del modelo no puede mirar las fotografías.'
      : ` En este equipo la mirada de ${quien} no está activada.`;
    if (!/no está activada|no puede mirar/.test(p.textContent)) p.textContent += dicho;
  }
  async function mirarLaFoto() {
    if (mirandoFoto || !E.analyzed || !E.photos.length) return;
    /* Sin modelo no hay mirada ni espera que anunciar: la tarjeta es la del cerebro simulado y su aviso
     * ya dice que no hay IA real (con modelo, en cambio, el cliente VE qué pasó con su foto). */
    if (!C.iaDisponible()) return;
    mirandoFoto = true;
    /* La mirada publica sus propios eventos: es ELLA la que tiene la barra que el cliente ve
     * (el análisis local de arriba dura 1.2 s y no la enciende). Con esto Lía coge la hoja
     * mientras mira la foto y la suelta cuando llega la respuesta. */
    C.ACI.emit('LOOK_STARTED', {});
    bloquearContinuar(true);
    pintarEspera();
    const vista = Date.now();
    try {
      if (!await puedeVerLaFoto()) {
        await esperarLoMinimo(vista);
        marcarSinOjos();
        pintarLaMirada('Lo que veo en la foto', MIRADA_SIN_OJOS(), false);
        return;
      }
      const imagen = await fotoPequeña(fotoMasGrande().dataUrl);
      const sesion = await C.sesionDelProveedor(promptDeLaMirada(), { expectedInputs: [{ type: 'text', languages: ['es'] }, { type: 'image' }] });
      const crudo = String(await sesion.pedir({ texto: 'Mira esta fotografía del mueble y dime qué ves.', imagen })).trim();
      sesion.soltar();
      const dicho = leerLaMirada(crudo);
      const frase = dicho ? dicho.frase : crudo;
      /* `sinTema`: una descripción de la foto no tiene que "responder" a nada — sin esa salida, una
       * mirada limpia se caía por no nombrar el motivo y la fila quedaba en una línea que no decía nada
       * de la foto (el dueño: «the sentence dont say nothing»). Las promesas y las cifras sí se juzgan. */
      const juicio = C.CercoAsistente.revisar(frase, { estimacion: '', sinTema: true });
      if (frase && juicio.limpia) {
        /* El color dice lo que dice la mirada, no que la tubería funcionó: sin mueble en la foto es una
         * observación (ámbar, como la resolución baja) y con el mueble a la vista va en verde. Un texto
         * del que no se pudo leer el veredicto va en ámbar: es una cautela, no un visto bueno. */
        pintarLaMirada('Lo que veo en la foto', frase, dicho ? dicho.veMueble : false);
      } else {
        console.warn('[revisión] la mirada no pasó el cerco', juicio);
        pintarLaMirada('Lo que veo en la foto', MIRADA_NO_MOSTRABLE(), false);
      }
    } catch (err) {
      console.warn('[revisión] la mirada local no llegó', err);
      /* Rechazo de la imagen = este equipo no tiene ojos: la fila lo dice igual (y queda aprendido).
       * Otro fallo —la foto no se leyó, el modelo se cayó— también se dice, con sus palabras. */
      if (sinCapacidadDeImagen(err)) { verComprobado = false; marcarSinOjos(); pintarLaMirada('Lo que veo en la foto', MIRADA_SIN_OJOS(), false); }
      else pintarLaMirada('Lo que veo en la foto', MIRADA_FALLO(), false);
    } finally {
      mirandoFoto = false;
      C.ACI.emit('LOOK_COMPLETED', {});   // la mirada tiene sus eventos: la barra que el cliente ve es la suya
      bloquearContinuar(false);
      const err = document.getElementById('analysisError');
      if (/sigue analizando/.test(err.textContent)) err.hidden = true;
    }
  }

  document.getElementById('analyzeButton').addEventListener('click', () => {
    const btn = document.getElementById('analyzeButton');
    btn.disabled = true; btn.textContent = 'Revisando…';
    C.ACI.emit('ANALYSIS_STARTED', {});
    document.getElementById('analysisTitle').textContent = 'Revisando tu información';
    document.getElementById('analysisText').textContent = 'Comprobando la fotografía y las medidas que registraste.';
    setTimeout(() => {
      E.analyzed = true;
      // Cada análisis completado consume un crédito de IA del mes (lo muestra
      // la sección Usage del backoffice); no poder guardarlo no frena al cliente.
      try { C.Store.spendAiCredit() } catch (err) { console.warn('[wizard] crédito de IA no registrado', err) }
      document.getElementById('analysisError').hidden = true;
      btn.remove();
      const checks = runReview();
      const caveats = checks.filter(c => !c.ok).length;
      document.getElementById('analysisTitle').textContent = caveats ? 'Revisión lista, con observaciones' : 'Revisión lista';
      document.getElementById('analysisText').textContent = caveats
        ? 'Puedes continuar: un asesor confirmará los puntos señalados.'
        : 'Podemos calcular tu estimación preliminar.';
      const box = document.getElementById('analysisChecks');
      box.innerHTML = checks.map(c => `<div class="${c.ok ? '' : 'warn'}"><span>${c.ok ? '✓' : '!'}</span><p><b>${C.esc(c.title)}</b><small>${C.esc(c.detail)}</small></p></div>`).join('');
      box.hidden = false;
      mirarLaFoto();
      /* Las medidas fuera de rango solo existen si la línea las pregunta: sin ese paso, el abanico
       * vacío se leería como «todas fuera de rango» y viajaría al contexto del asistente. */
      E.review = { warnings: checks.filter(c => !c.ok).map(c => c.title), oddMeasures: C.pideMedidas() ? oddMeasures() : [] };
      C.ACI.emit('ANALYSIS_COMPLETED', E.review);
    }, 1200);
  });

  laRevision = { pintarResumen: renderReviewSummary, correr: runReview, filas: declaredRows };
  return true;
}
