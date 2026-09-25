/* LAS PIEZAS DE LA COTIZACIÓN Y SUS MEDIDAS (src/wizard) — corte 4.
 *
 * Una pre-cotización puede ser de VARIAS piezas (un juego de sala: un sofá y dos poltronas). Aquí
 * vive lo que las atiende: la lista del paso 1 —una fila por pieza, con su desplegable de mueble, su
 * cantidad, qué se tapiza, sus medidas y sus fotos—, la pieza EN FOCO que llenan los pasos de abajo,
 * las fichas del paso de medidas («✓ medidas» / «faltan medidas») y el cuaderno de fotos de cada
 * pieza.
 *
 * La verdad sigue siendo `state.piezas` (entra por el puente, `elTaller()`), porque el motor, el
 * sendero y la conversación la leen: aquí se pinta y se escribe, nunca se copia. Con UNA sola pieza
 * la lista no se enseña: el paso se ve como siempre.
 */
import { guardarElTaller, elTaller } from './casa.js';

let lasPiezas = null;   /* nombre del módulo: los top-level se pegan en un script */

export function pintarLasPiezas() { const v = lasPiezas; return v ? v.pintarLista() : false; }
export function pintarLasMedidasPorPieza() { const v = lasPiezas; return v ? v.pintarFichas() : false; }
export function laPiezaEnFoco() { const v = lasPiezas; return v ? v.enFoco() : null; }
export function cantidadDeLaPiezaParaElMotor(p) { const v = lasPiezas; return v ? v.cantidadParaElMotor(p) : '1'; }
export function enfocarLaPieza(i) { const v = lasPiezas; return v ? v.enfocar(i) : false; }
export function agregarUnaPieza() { const v = lasPiezas; return v ? v.agregar() : false; }
export function quitarLaPieza(i) { const v = lasPiezas; return v ? v.quitar(i) : false; }
export function guardarLaPiezaDelFoco() { const v = lasPiezas; return v ? v.guardar() : false; }
export function lasFotosDeLaPieza(p) { const v = lasPiezas; return v ? v.fotosDeLaPieza(p) : []; }
export function lasPiezasQueLesFaltanFotos() { const v = lasPiezas; return v ? v.piezasSinFotos() : []; }
export function etiquetaDeUnaPieza(p) { const v = lasPiezas; return v ? v.etiquetaDeLaPieza(p) : ''; }

export function conectarLasPiezas(elTallerDeLaPagina) {
  guardarElTaller(elTallerDeLaPagina);
  const C = elTaller();
  if (!C) return false;
  const E = C.estado;
  const reglasDelMueble = () => C.reglasDelMueble();

  /* Una pieza nace sin mueble: que el catálogo traiga «Sofá» primero no es una respuesta del cliente. */
  const unaPiezaNueva = (nombre = '') => ({ id: 'p' + Math.random().toString(36).slice(2, 8), furniture: nombre,
    furnitureNote: '', cantidad: 1,
    medidas: { width: '', height: '', depth: '', puestos: '', cojines: '', cobertura: 'complete' }, fotos: [] });
  /* Cómo se cuenta una PIEZA en la fila del paso 1. El pack dice la unidad cuando el mueble se cuenta por
   * piezas (`scaleByQty`: poltrona → poltronas); en los que se cuentan por PUESTOS —el sofá—, esa unidad
   * habla de otra cosa («Número de puestos»), así que la pieza se cuenta con su propio nombre en plural
   * («1 sofá», «2 sofás», «2 sofás en L»). Cuando el pack traiga la unidad de la pieza, manda el pack. */
  const enPlural = (nombre) => {
    const [primera, ...resto] = String(nombre || '').split(' ');
    const plural = /[aeiouáéíóú]$/i.test(primera) ? primera + 's' : primera + 'es';
    return [plural, ...resto].join(' ');
  };
  const laUnidadDeLaPieza = (rule, nombre, n) => {
    if (rule && rule.scaleByQty) return n === 1 ? rule.unit[0] : rule.unit[1];
    return n === 1 ? String(nombre || 'unidad') : enPlural(nombre);
  };
  /* Qué número espera el MOTOR en `#seats`, según cómo se cuente ese mueble (lo dice el pack): los que se
   * cuentan por PIEZAS llevan la cantidad de su fila; los que se cuentan por PUESTOS o MÓDULOS —el sofá, el
   * seccional— llevan ese dato, que se pregunta en el paso de las medidas (su consumo va con el ancho). */
  function laCantidadParaElMotor(p){
    const rule = (p && p.furniture && reglasDelMueble()[p.furniture]) || null;
    if (rule && rule.scaleByQty) return String(p.cantidad || 1);
    return String((p && p.medidas.puestos) || 3);
  }
  if (!E.piezas) { E.piezas = [unaPiezaNueva(E.furniture)]; E.piezaEnFoco = 0; }
  const piezaEnFoco = () => E.piezas[E.piezaEnFoco] || E.piezas[0];
  /* Las fotos de UNA pieza. Todas viven en `state.photos` —la revisión, el registro y el backoffice siguen
   * leyendo esa lista—, y cada foto dice de qué pieza es (`ph.pieza` = el id de la pieza cuando se subió). */
  function fotosDeLaPieza(p){ return (E.photos||[]).filter(ph => ph.pieza === p.id); }
  function lasPiezasSinSusFotos(){ return (E.piezas||[]).filter(p => p.furniture && fotosDeLaPieza(p).length < 2); }
  /* Cómo se llama una pieza en un aviso: «la poltrona (pieza 2)». */
  function etiquetaDeLaPieza(p){
    const i = (E.piezas||[]).indexOf(p) + 1;
    const nombre = String(p.furniture || 'pieza').toLowerCase();
    return (E.piezas||[]).length > 1 ? `${nombre} (pieza ${i})` : `tu ${nombre}`;
  }

  /* LA LISTA DEL PASO 1: una fila por pieza, con su desplegable de mueble y su cantidad. La fila en foco
   * (borde del acento) es la que llenan los pasos de abajo. Los desplegables se rehacen enteros cada vez:
   * así el que elige el cliente es siempre el que manda, sin estados a medias. */
  let repintarPiezasPendiente = false;
  function pintarPiezas(){
    /* QUIEN ESCRIBE MANDA (dueño, 25/09): si el foco está en una fila —tecleando una medida—, la lista
     * NO se vuelve a pintar: se anota y se pinta al salir del campo. Antes, cada tecla caía en un campo
     * recién reemplazado y la cifra se perdía. */
    const escribiendo = document.activeElement;
    if (escribiendo && escribiendo.closest && escribiendo.closest('#piezasLista')) { repintarPiezasPendiente = true; return; }
    const caja = document.getElementById('piezasLista'); if (!caja) return;
    const catalogo = C.Store.activeFurniture();
    const maxQ = Math.max(2, +C.Store.settings().maxQuantity || 5);
    caja.innerHTML = E.piezas.map((p, i) => {
      const rule = reglasDelMueble()[p.furniture] || null;
      /* La CANTIDAD se ve siempre (la fila declara lo suyo): sin mueble elegido van los números solos,
       * porque todavía no se sabe si se cuentan sofás, poltronas o puestos. */
      const cuantos = Array.from({ length: maxQ }, (_, k) => k + 1).map(n =>
        `<option value="${n}"${Number(p.cantidad) === n ? ' selected' : ''}>${n === maxQ ? n + ' o más' : n}${rule ? ' ' + C.esc(laUnidadDeLaPieza(rule, p.furniture, n)) : ''}</option>`).join('');
      const suyas = fotosDeLaPieza(p);
      const mini = suyas.slice(0, 3).map(() => '').length;   // solo diseño: se ve cuántas van
      const med = k => C.esc(String(p.medidas[k] || ''));
      return `
    <div class="pieza-fila${i === E.piezaEnFoco ? ' en-foco' : ''}" data-pieza="${i}">
      <span class="pieza-num" aria-hidden="true">${i + 1}</span>
      <label class="pieza-campo">
        <span class="pieza-rotulo">Mueble</span>
        <select class="pieza-mueble" data-mueble="${i}" aria-label="Mueble de la pieza ${i + 1}">
          <option value="">Elige el mueble…</option>
          ${catalogo.map(f => `<option value="${C.esc(f.name)}"${p.furniture === f.name ? ' selected' : ''}>${C.esc(f.name)}</option>`).join('')}
        </select>
      </label>
      <label class="pieza-campo pieza-campo-cantidad">
        <span class="pieza-rotulo">Cantidad</span>
        <select class="pieza-cantidad" data-cantidad="${i}" aria-label="Cuántas piezas ${i + 1}">${cuantos}</select>
      </label>
      <label class="pieza-campo pieza-campo-cobertura">
        <span class="pieza-rotulo">Tapizar</span>
        <select class="pieza-cobertura" data-cobertura="${i}" aria-label="Qué se tapiza en la pieza ${i + 1}">
          <option value="complete"${(p.medidas.cobertura || 'complete') === 'complete' ? ' selected' : ''}>Todo el mueble</option>
          <option value="seats"${p.medidas.cobertura === 'seats' ? ' selected' : ''}>Solo asiento y respaldo</option>
          <option value="partial"${p.medidas.cobertura === 'partial' ? ' selected' : ''}>Una parte específica</option>
        </select>
      </label>
      <label class="pieza-campo"><span class="pieza-rotulo">Ancho</span><input type="number" min="20" max="1000" class="pieza-medida" data-medida="width" data-pieza-medida="${i}" inputmode="numeric" placeholder="cm" value="${med('width')}" aria-label="Ancho de la pieza ${i + 1}"></label>
      <label class="pieza-campo"><span class="pieza-rotulo">Alto</span><input type="number" min="20" max="500" class="pieza-medida" data-medida="height" data-pieza-medida="${i}" inputmode="numeric" placeholder="cm" value="${med('height')}" aria-label="Alto de la pieza ${i + 1}"></label>
      <label class="pieza-campo"><span class="pieza-rotulo">Largo</span><input type="number" min="10" max="500" class="pieza-medida" data-medida="depth" data-pieza-medida="${i}" inputmode="numeric" placeholder="cm" value="${med('depth')}" aria-label="Largo de la pieza ${i + 1}"></label>
      <div class="pieza-campo pieza-fotos">
        <span class="pieza-rotulo">Fotos</span>
        <div class="pieza-foto-fila">
          ${suyas.slice(0, 3).map(ph => `<span class="pieza-foto-mini" style="background-image:url(${ph.dataUrl})" role="img" aria-label="Foto de la pieza ${i + 1}"><button type="button" data-quitar-foto="${E.photos.indexOf(ph)}" aria-label="Quitar la foto">×</button></span>`).join('')}
          <button type="button" class="pieza-foto-mas" data-foto-pieza="${i}" aria-label="Subir fotos de la pieza ${i + 1}">+</button>
          <span class="pieza-foto-cuenta">${suyas.length}/2</span>
        </div>
      </div>
      ${E.piezas.length > 1 ? `<button type="button" class="pieza-quita" data-quitar="${i}" aria-label="Quitar la pieza ${i + 1}">✕</button>` : '<span></span>'}
    </div>`;
    }).join('');
  }
  /* Llevar al DOM lo de la pieza en foco (medidas, cantidad, cojines, cobertura) y dejar el paso 1 en ella:
   * el mueble elegido en la reja, la «Otro» descrita si la hay, y el rótulo del mueble de las medidas. */
  function enfocarPieza(i){
    if (!E.piezas[i]) return;
    E.piezaEnFoco = i;
    const p = piezaEnFoco();
    E.furniture = p.furniture; E.furnitureNote = p.furnitureNote || '';
    ['width', 'height', 'depth'].forEach(campo => { const el = document.getElementById(campo); if (el) el.value = p.medidas[campo] || ''; });
    const cobertura = document.getElementById('coverage'); if (cobertura) cobertura.value = p.medidas.cobertura || 'complete';
    C.renderFurnitureOptions && C.renderFurnitureOptions();
    C.renderQuantityOptions();                     // repone las opciones de la cantidad y su rótulo
    const puestos = document.getElementById('seats'); if (puestos) puestos.value = laCantidadParaElMotor(p);
    const cojines = document.getElementById('cushions'); if (cojines && p.medidas.cojines) cojines.value = String(p.medidas.cojines);
    const otros = document.getElementById('furnitureOther'); if (otros) otros.value = p.furnitureNote || '';
    const tipo = document.getElementById('furnitureType'); if (tipo) tipo.value = E.furniture || '';
    C.syncOtherFurniture && C.syncOtherFurniture();
    document.querySelectorAll('[data-furniture-label]').forEach(x => { x.textContent = String(E.furniture || '').toLowerCase(); });
    pintarPiezas();
    try { C.renderPhotos(); } catch (err) { /* sin fotos que pintar */ }
    try { pintarMedidasPorPieza(); } catch (err) { /* sin fichas que pintar */ }
    try { C.updateEstimate(); } catch (err) { /* la estimación se rehace al pasar */ }
  }
  function agregarPieza(){
    const p = unaPiezaNueva('');
    p.medidas = { width: '', height: '', depth: '', cojines: '', cobertura: 'complete' };
    E.piezas.push(p);
    pintarPiezas();
    enfocarPieza(E.piezas.length - 1);
    const fila = document.querySelector('.pieza-fila.en-foco'); if (fila) fila.scrollIntoView({ block: 'nearest' });
    const desplegable = document.querySelector('.pieza-fila.en-foco .pieza-mueble');
    if (desplegable) desplegable.focus();          // se sigue con el mueble de la pieza nueva
    C.ACI.emit('FURNITURE_SELECTED', { furniture: '', furnitureId: null, pieza: E.piezaEnFoco });
  }
  function quitarPieza(i){
    if (E.piezas.length <= 1) return;              // la cotización siempre tiene al menos una pieza
    E.piezas.splice(i, 1);
    enfocarPieza(Math.max(0, Math.min(E.piezaEnFoco > i ? E.piezaEnFoco - 1 : E.piezaEnFoco, E.piezas.length - 1)));
  }
  /* Lo que el cliente escriba en los controles de la pieza se guarda en ELLA (la pieza en foco). */
  function guardarLoDeLaPieza(){
    const p = piezaEnFoco(); if (!p) return;
    ['width', 'height', 'depth'].forEach(campo => { const el = document.getElementById(campo); if (el) p.medidas[campo] = el.value; });
    const puestos = document.getElementById('seats'); if (puestos && puestos.value) { p.medidas.puestos = puestos.value; p.cantidad = Math.max(1, +puestos.value || 1); }
    const cojines = document.getElementById('cushions'); if (cojines) p.medidas.cojines = cojines.value;
    const cobertura = document.getElementById('coverage'); if (cobertura) p.medidas.cobertura = cobertura.value || 'complete';
    const otros = document.getElementById('furnitureOther'); if (otros) p.furnitureNote = otros.value;
    /* Los PUESTOS o módulos del mueble —donde el pack los pide— también son de la pieza: en los muebles que
     * se cuentan por piezas, `#seats` es la cantidad de la fila y no se toca desde aquí. */
    const regla = (p.furniture && reglasDelMueble()[p.furniture]) || null;
    const espejo = document.getElementById('seats');
    if (espejo && regla && !regla.scaleByQty) p.medidas.puestos = espejo.value;
    pintarPiezas();
    pintarMedidasPorPieza();           // las fichas del paso de medidas: cuáles están y cuáles faltan
  }
  /* LAS MEDIDAS, PIEZA POR PIEZA: las fichas del paso de medidas. La que está EN FOCO es la que llenan los
   * campos de abajo; las demás dicen si ya están (✓ medidas listas) o que faltan — así el cliente ve por
   * dónde va cada pieza sin que se le escape ninguna (dueño, 25/09: medidas y fotos de CADA fila). */
  function pintarMedidasPorPieza(){
    const caja=document.getElementById('medidasPiezas'); if(!caja) return;
    const varias=(E.piezas||[]).length>1;
    caja.hidden=!varias;
    if(!varias){ caja.innerHTML=''; return; }
    caja.innerHTML=E.piezas.map((p,i)=>{
      const completa=!!(String(p.medidas.width||'').trim()&&String(p.medidas.height||'').trim()&&String(p.medidas.depth||'').trim());
      const suyas=fotosDeLaPieza(p).length;
      return `<button type="button" class="pieza-chip${i===E.piezaEnFoco?' en-foco':''}${completa?' lista':''}" data-chippieza="${i}" aria-pressed="${i===E.piezaEnFoco}">`+
        `<b>${i+1}</b> ${C.esc(p.furniture||'sin elegir')} <span class="chip-estado">${completa?'✓ medidas':'faltan medidas'}${suyas?' · '+suyas+'/2 fotos':''}</span></button>`;
    }).join('');
  }

  /* Los oídos de la lista (elegir la pieza en foco, su cantidad, lo de cada fila y «Agregar otra pieza»)
   * y de las fichas del paso de medidas. Se enganchan al conectar, no al importar: el paquete corre en
   * el `<head>` y el DOM todavía no existe. */
  (function prepararLasPiezas(){
    const caja = document.getElementById('piezasLista'), sumar = document.getElementById('agregarPieza');
    if (sumar) sumar.addEventListener('click', () => agregarPieza());
    if (caja) {
      /* Elegir en un desplegable pone ESA fila en foco: es la pieza que llenan los pasos de abajo. */
      caja.addEventListener('change', e => {
        const mueble = e.target.closest('[data-mueble]'), cuantos = e.target.closest('[data-cantidad]');
        if (mueble) {
          E.piezaEnFoco = +mueble.dataset.mueble;
          C.selectFurniture(mueble.value);
          if (!mueble.value) C.ACI.emit('FURNITURE_SELECTED', { furniture: '', furnitureId: null, pieza: E.piezaEnFoco });
          return;
        }
        if (cuantos) {
          const i = +cuantos.dataset.cantidad; E.piezaEnFoco = i;
          const p = E.piezas[i]; if (p) p.cantidad = Number(cuantos.value) || 1;
          /* El motor lee `#seats`: la cifra de la fila baja al espejo —con el sentido de ese mueble— y la
           * estimación se rehace. */
          const espejo = document.getElementById('seats');
          if (espejo) espejo.value = laCantidadParaElMotor(p);
          pintarPiezas();
          try { C.updateEstimate(); } catch (err) { /* la estimación se rehace al pasar */ }
        }
      });
      /* Al salir del campo, lo que quedó pendiente se pinta de una vez. */
      caja.addEventListener('focusout', e => {
        if (!e.target.closest('[data-pieza-medida]')) return;
        setTimeout(() => {
          const quien = document.activeElement;
          if (quien && quien.closest && quien.closest('#piezasLista')) return;   // sigue escribiendo en otra casilla
          if (repintarPiezasPendiente) { repintarPiezasPendiente = false; pintarPiezas(); }
        }, 0);
      });
      caja.addEventListener('click', e => {
        const quitar = e.target.closest('[data-quitar]'); if (quitar) { quitarPieza(+quitar.dataset.quitar); return; }
        const fila = e.target.closest('[data-pieza]');
        if (fila && !e.target.closest('select')) enfocarPieza(+fila.dataset.pieza);
      });
    }
    /* Las fichas del paso de medidas: tocar una pone ESA pieza en foco y los campos pasan a ser los suyos. */
    const fichas = document.getElementById('medidasPiezas');
    if (fichas) fichas.addEventListener('click', e => {
      const b = e.target.closest('[data-chippieza]'); if (b) enfocarPieza(+b.dataset.chippieza);
    });
    /* LO DE CADA FILA (dueño, 25/09: mueble, cantidad, fotos y medidas en la misma línea):
     *   · escribir una medida la guarda en ESA pieza y la baja al espejo que lee el motor;
     *   · el «+» de la fila abre el selector de fotos para esa pieza;
     *   · la miniatura se quita con su ✕. */
    if (caja) {
      caja.addEventListener('input', e => {
        const campo = e.target.closest('[data-pieza-medida]'); if (!campo) return;
        const i = +campo.dataset.piezaMedida, p = E.piezas[i]; if (!p) return;
        p.medidas[campo.dataset.medida] = campo.value;
        if (i === E.piezaEnFoco) {
          const espejo = document.getElementById(campo.dataset.medida);
          if (espejo) espejo.value = campo.value;
        }
        try { pintarMedidasPorPieza(); } catch (err) { /* sin fichas que refrescar */ }
        try { C.updateEstimate(); } catch (err) { /* la estimación se rehace al pasar */ }
      });
      caja.addEventListener('change', e => {
        const cob = e.target.closest('[data-cobertura]'); if (!cob) return;
        const i = +cob.dataset.cobertura, p = E.piezas[i]; if (!p) return;
        p.medidas.cobertura = cob.value;
        if (i === E.piezaEnFoco) {
          const espejo = document.getElementById('coverage'); if (espejo) espejo.value = cob.value;
        }
        try { C.updateEstimate(); } catch (err) { /* la estimación se rehace al pasar */ }
      });
      caja.addEventListener('click', e => {
        const mas = e.target.closest('[data-foto-pieza]');
        if (mas) {
          const i = +mas.dataset.fotoPieza;
          E.piezaEnFoco = i;                    // las fotos que entren son de ESA pieza
          document.getElementById('furniturePhoto').click();
          return;
        }
        const quitarFoto = e.target.closest('[data-quitar-foto]');
        if (quitarFoto) {
          E.photos.splice(+quitarFoto.dataset.quitarFoto, 1);
          pintarPiezas();
          C.ACI.emit('PHOTOS_CHANGED', { count: E.photos.length });
        }
      });
    }
    /* Lo que se escriba en los controles de la pieza se guarda en ELLA (la que tiene el foco). */
    ['width','height','depth','cushions','coverage','furnitureOther'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('input', guardarLoDeLaPieza);
      el.addEventListener('change', guardarLoDeLaPieza);
    });
  })();

  lasPiezas = {
    pintarLista: pintarPiezas, pintarFichas: pintarMedidasPorPieza,
    enFoco: piezaEnFoco, cantidadParaElMotor: laCantidadParaElMotor,
    enfocar: enfocarPieza, agregar: agregarPieza, quitar: quitarPieza,
    guardar: guardarLoDeLaPieza, fotosDeLaPieza, piezasSinFotos: lasPiezasSinSusFotos,
    etiquetaDeLaPieza
  };
  pintarPiezas();   /* la lista existe desde el primer render (el taller ya está guardado) */
  return true;
}
