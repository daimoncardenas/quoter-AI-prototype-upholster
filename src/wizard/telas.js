/* LAS TELAS Y SU RECOMENDACIÓN (src/wizard) — corte 4.
 *
 * El paso de la recomendación: la parrilla —la «Mejor coincidencia», el porqué de cada tela, el
 * sobre-presupuesto y la cantidad por tela donde el camino elige VARIAS— y la espera del asistente
 * que las ordena.
 *
 * EL MODELO SOLO PUEDE ORDENAR: recibe lo declarado (las mismas filas de la revisión) y el catálogo
 * activo, y devuelve ids y una razón; los ids que no estén en el catálogo se ignoran y ningún precio
 * sale de él. Sin modelo no se pinta nada —el orden determinista de Store.recommend() se queda tal
 * cual— y si el modelo está pero no da algo utilizable, la fila lo dice en vez de callarse.
 *
 * `ordenDeLaIA`, `recomendandoIA` y `TOPE_RECOMENDACION_MS` viven ARRIBA, a nivel del módulo, a
 * propósito: las pruebas del área los escriben por `evaluate` (el tope baja a 300 ms para medir esa
 * salida, y volver a recomendar suelta el orden). En una closure dejarían de existir para ellas.
 */
import { guardarElTaller, elTaller } from './casa.js';

let lasTelas = null;   /* nombre del módulo: los top-level se pegan en un script */
let ordenDeLaIA = null, recomendandoIA = false;
/* El modelo tarda segundos, pero una pantalla sin telas no puede durar para siempre: si no contesta
 * dentro de este tope, la parrilla vuelve con el orden determinista y la fila lo dice.
 * (La spec lo baja para probar esa salida sin esperar los 15 s.) */
let TOPE_RECOMENDACION_MS = 15000;

export function pintarLasTelas() { const v = lasTelas; return v ? v.pintar() : false; }
export function recomendarLasTelas() { const v = lasTelas; return v ? v.recomendar() : false; }
export function esperarLasTelas(e) { const v = lasTelas; return v ? v.esperar(e) : false; }
export function olvidarLoDeLaIA() { ordenDeLaIA = null; recomendandoIA = false; }

export function conectarLasTelas(elPuenteDeLaPagina) {
  guardarElTaller(elPuenteDeLaPagina);
  const C = elTaller();
  if (!C) return false;
  const E = C.estado;

  const conTope = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('la IA no contestó a tiempo')), ms))]);
  /* Las telas no se enseñan mientras la IA las está ordenando: la parrilla aparece cuando hay algo que
   * enseñar —su orden, o el determinista con la fila diciendo que la recomendación no llegó—, y el
   * bloque de metros aparece CON ellas (14–19 metros antes de ver la tela es una cifra sin contexto).
   * Mientras tanto la fila espera centrada en el panel, con su movimiento. El dueño lo pidió con una
   * captura: «you can see the fabrics below but at this moment the AI is choosing the recommendation...
   * doesn't make sense show fabric before... make sense after of analysis». */
  function telasEnEspera(esperando) {
    const g = document.getElementById('fabricGrid'); if (g) g.hidden = esperando;
    const paso = document.querySelector('.wizard-step[data-brain="RECOMMENDATION"]');
    if (paso) paso.classList.toggle('esperando-telas', esperando);
  }
  const TEXTO_RECOMENDACION_FALLO = () => `${C.asistenteNombre()} no pudo darte una recomendación esta vez: el orden de abajo sigue tus preferencias.`;
  const FILA_RECOMENDACION = (titulo, detalle, ok) => `<div class="${ok ? '' : 'warn'}"><span>${ok ? '✓' : '!'}</span>` +
    `<p><b>${C.esc(titulo)} ${C.etiquetaIA()}</b><small>${C.esc(detalle)}</small></p></div>`;
  function pintarLaRecomendacion(titulo, detalle, ok) {
    const caja = document.getElementById('aiPick'); if (!caja) return;
    caja.innerHTML = FILA_RECOMENDACION(titulo, detalle, ok); caja.hidden = false;
  }
  function pintarEsperaDeTelas() {
    const caja = document.getElementById('aiPick'); if (!caja) return;
    caja.innerHTML = '<div><span class="mirada-gira"></span><p><b>Pidiéndole una recomendación ' + C.etiquetaIA() + '</b>' +
      `<small>${C.esc(C.asistenteNombre())} está leyendo lo que declaraste y las telas disponibles.</small>` +
      `<span class="mirada-espera" role="status" aria-label="${C.esc(C.asistenteNombre())} está preparando una recomendación"></span></p></div>`;
    caja.hidden = false;
  }
  const pedidoDeTelas = () => ({
    needs: [...document.querySelectorAll('#needsGrid input:checked')].map(x => x.value),
    style: document.getElementById('style').value,
    color: document.getElementById('color').value,
    budget: +document.getElementById('budget').value || null
  });
  function promptDeLaRecomendacion(ranked) {
    const catalogo = ranked.map(r => `- ${r.fabric.id}: ${r.fabric.name} · ${r.fabric.colorName} — ${C.money(r.fabric.price)} por metro — ${(r.fabric.tags || []).join(', ')}`).join('\n');
    return [
      'Eres el asistente de un taller de tapicería y le estás recomendando telas a un cliente.',
      'Contesta SOLO con un JSON de esta forma: {"orden": ["id", "id", …], "razon": "una o dos frases"}.',
      'En "orden" van los ids de la lista de telas, de la que mejor le viene al cliente a la que menos. No inventes telas ni ids: solo los de esa lista.',
      'La "razon" va en español de Colombia, sin precios y sin promesas, y dice por qué la primera le viene bien.',
      'Lo que el cliente declaró:',
      C.declaredRows().map(([k, v]) => `- ${k}: ${v}`).join('\n'),
      `- Presupuesto por metro: ${pedidoDeTelas().budget ? C.money(pedidoDeTelas().budget) + ' o menos' : 'sin límite declarado'}`,
      'Telas disponibles:',
      catalogo,
      'REGLAS QUE NO PUEDES ROMPER: no ofrezcas telas que no estén en la lista; no inventes precios; no prometas plazos de entrega, garantías, transporte, recogida, rellenos ni descuentos.',
    ].join('\n');
  }
  function leerLaRecomendacion(crudo) {
    try {
      const d = JSON.parse(crudo.slice(crudo.indexOf('{'), crudo.lastIndexOf('}') + 1));
      if (d && Array.isArray(d.orden) && d.orden.length) return { orden: d.orden.map(String), razon: String(d.razon || '').trim() };
    } catch (err) { }
    return null;
  }
  async function recomendarConIA() {
    const caja = document.getElementById('aiPick');
    if (!caja || recomendandoIA || ordenDeLaIA || !C.iaDisponible()) return;
    const ranked = C.Store.recommend(pedidoDeTelas());
    if (!ranked.length) return;
    recomendandoIA = true;
    telasEnEspera(true);
    pintarEsperaDeTelas();
    /* El sistema está trabajando: ella coge la hoja y lee (capa de presencia). Se cierra en el
     * finally, con o sin recomendación: lo que se enseña es la espera, no el desenlace. */
    C.ACI.emit('RECOMMENDATION_STARTED', {});
    try {
      const sesion = await conTope(C.sesionDelProveedor(promptDeLaRecomendacion(ranked)), TOPE_RECOMENDACION_MS);
      const crudo = String(await conTope(sesion.pedir({ texto: 'Ordénalas para mí y dime por qué la primera.' }), TOPE_RECOMENDACION_MS)).trim();
      sesion.soltar();
      const dicho = leerLaRecomendacion(crudo);
      /* El cerco juzga la razón: con los precios del catálogo como lo único que el cliente tiene a la
       * vista (así citar un precio real no es "inventar una cifra") y sin la regla del tema, que es del
       * chat — una recomendación no responde a una pregunta. */
      const juicio = dicho && dicho.razon ? C.CercoAsistente.revisar(dicho.razon, { estimacion: ranked.map(r => C.money(r.fabric.price)).join(' '), sinTema: true }) : null;
      if (dicho && dicho.razon && juicio.limpia) {
        const ids = dicho.orden.filter(id => ranked.some(r => String(r.fabric.id) === id));
        if (ids.length) ordenDeLaIA = ids;
        pintarLaRecomendacion('Lo que te recomiendo', dicho.razon, true);
        renderFabrics();
      } else {
        console.warn('[recomendación] la IA no dio una recomendación utilizable', juicio);
        pintarLaRecomendacion(`Recomendación de ${C.asistenteCfg().enabled ? C.asistenteCfg().name : 'la IA local'}`, TEXTO_RECOMENDACION_FALLO(), false);
      }
    } catch (err) {
      console.warn('[recomendación] la recomendación local no llegó', err);
      pintarLaRecomendacion(`Recomendación de ${C.asistenteCfg().enabled ? C.asistenteCfg().name : 'la IA local'}`, TEXTO_RECOMENDACION_FALLO(), false);
    } finally { recomendandoIA = false; telasEnEspera(false); C.ACI.emit('RECOMMENDATION_COMPLETED', { orden: ordenDeLaIA || null }) }
  }
  function renderFabrics() {
    /* Mientras la IA ordena, la parrilla existe pero no se enseña: el `finally` de recomendarConIA() la
     * revela (con el orden de la IA si llegó, o el determinista). Fuera de esa espera, pintar telas es
     * enseñarlas. */
    if (!recomendandoIA) telasEnEspera(false);
    let ranked = C.Store.recommend(pedidoDeTelas());
    /* El orden de la IA local, si lo dio: solo puede REORDENAR las telas del catálogo (los ids que no
     * estén se ignoran), y las que no nombró quedan detrás en el orden determinista. */
    if (ordenDeLaIA) {
      const porId = new Map(ranked.map(r => [String(r.fabric.id), r]));
      ranked = ordenDeLaIA.map(id => porId.get(id)).filter(Boolean)
        .concat(ranked.filter(r => ordenDeLaIA.indexOf(String(r.fabric.id)) < 0));
    }
    const grid = document.getElementById('fabricGrid');
    /* SELECCIÓN y CANTIDAD del paso (el dueño: «you can choose several fabrics, not only one» y «one
     * field cantidad for fabric»): donde el camino lo declara (`variasTelas` — la reventa que pide
     * sugerencias), cada tarjeta elegida lleva SU campo de cantidad y SU fila en la lista: se eligen
     * varias telas y cada una declara cuánto. En las demás ramas se elige UNA —la del proyecto— como
     * siempre. */
    const varias = C.esVariasTelas();
    grid.innerHTML = '';
    if (!ranked.length) {
      grid.innerHTML = '<p class="field-error">No hay telas disponibles en este momento. Un asesor te contactará con opciones.</p>';
      E.fabric = null; C.updateEstimate(); return;
    }
    // Keep the current pick only if it still exists and is still active.
    if (E.fabric && !ranked.some(r => String(r.fabric.id) === String(E.fabric.id))) E.fabric = null;
    // Otherwise lead with the best match. Scoring replaces the old special case
    // that force-selected one fabric whenever "Mascotas" was ticked.
    if (!E.fabric) { E.fabric = ranked[0].fabric; C.ACI.emit('FABRIC_SELECTED', C.ACI.fabricPayload(E.fabric, true)) }
    document.getElementById('selectedFabric').value = E.fabric.name;

    const best = ordenDeLaIA ? (ranked[0] ? ranked[0].fabric.id : null) : (ranked[0].score > 0 ? ranked[0].fabric.id : null);
    ranked.forEach(r => {
      const f = r.fabric;
      /* Con varias telas la tarjeta está ELEGIDA si tiene su fila en la lista (se suelta quitándola);
       * con una sola, si es la tela del proyecto. */
      const on = varias ? !!C.filaDeLaListaPor(f.id) : String(f.id) === String(E.fabric.id);
      const card = document.createElement('div');
      card.className = 'fabric-card' + (on ? ' selected' : '') + (r.overBudget ? ' over-budget' : '');
      card.dataset.fabric = String(f.id);
      if (!varias) card.setAttribute('role', 'button');
      /* La tarjeta interior es un botón de verdad (con el campo de cantidad FUERA de él: un input
       * dentro de un botón no es HTML válido y el clic no llegaría). */
      const suya = C.filaDeLaListaPor(f.id);
      const rules = C.Store.fabricRules(f) || {}, porRollo = rules.saleUnit === 'rollo';
      const campoCantidad = (varias && on)
        ? `<div class="reco-cantidad"><label>Cantidad <span class="unit">${porRollo ? 'rollos' : 'm'}</span></label>` +
        `<input type="number" class="reco-cantidad-input" min="0.1" step="0.1" inputmode="decimal" ` +
        `value="${suya ? C.esc(String((suya.querySelector('.list-metros') || {}).value || '')) : ''}" placeholder="${porRollo ? 'Ej. 2' : 'Ej. 22'}">` +
        `<small>Queda en tu lista, con esta referencia.</small></div>`
        : '';
      card.innerHTML = `<button type="button" class="fabric-pick" aria-pressed="${on}">` +
        `<div class="swatch" style="background:${C.Store.swatch(f)}">` +
        `${String(f.id) === String(best) ? '<span class="best-match">Mejor coincidencia</span>' : ''}</div>` +
        `<div class="fabric-card-body"><b>${C.esc(f.name)} · ${C.esc(f.colorName)}</b>` +
        `<small>${C.money(f.price)} por metro · Precio de referencia</small>` +
        `<div class="fabric-tags">${(f.tags || []).map(t => `<span>${C.esc(t)}</span>`).join('')}</div>` +
        (r.reasons.length ? `<p class="why"><b>Por qué te la sugerimos:</b> ${C.esc(r.reasons.join(' · '))}</p>` : '') +
        (r.overBudget ? `<p class="why over">Por encima del presupuesto que indicaste</p>` : '') +
        `</div></button>` + campoCantidad;
      card.addEventListener('click', e => {
        if (e.target.closest('.reco-cantidad')) return;   // escribir la cantidad no cambia la elección
        E.fabricTouched = true; E.fabric = f;
        const errReco = document.getElementById('recoError'); if (errReco) errReco.hidden = true;
        if (varias) {
          /* Varias: la que ya tiene fila se suelta (su fila se va con ella); la que no, entra. */
          const enLaLista = C.filaDeLaListaPor(f.id);
          if (enLaLista) { enLaLista.remove(); C.updateEstimate() }
          else { C.agregarFilaDeLaLista(f.id); C.quitarLaFilaVaciaDeLaLista() }
        }
        renderFabrics(); C.ACI.emit('FABRIC_SELECTED', C.ACI.fabricPayload(f, false));
      });
      const cajaCantidad = card.querySelector('.reco-cantidad-input');
      if (cajaCantidad) cajaCantidad.addEventListener('input', () => C.escribirLaCantidadDeLaTela(f.id, cajaCantidad.value));
      grid.appendChild(card);
      // La imagen de la tela está en IndexedDB: la tarjeta nace con el color y
      // Store.paintSwatch la reemplaza si el backoffice cargó una foto.
      C.Store.paintSwatch(card.querySelector('.swatch'), f);
    });
    C.updateEstimate();
  }

  lasTelas = { pintar: renderFabrics, recomendar: recomendarConIA, esperar: telasEnEspera };
  return true;
}
