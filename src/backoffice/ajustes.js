/* CONFIGURACIONES DE COTIZADOR (src/backoffice) — la cuarta vista que se muda (corte 3).
 *
 * Es la vista que MUEVE NÚMEROS: desperdicio, margen, tolerancia del rango, los porcentajes de cobertura
 * y las listas de opciones que ve el cliente (necesidades, estilos, gamas, cortes de presupuesto). Por eso
 * se mudó después de las de contenido: cuando se toque un precio, el diff tiene que hablar de precios y no
 * de estructura.
 *
 * Trae su propia pieza de interfaz —las etiquetas («escribe y Enter, × para quitar»)— que hasta ahora
 * vivía suelta en la página. El bloque de «lo que este negocio presta HOY» (líneas de servicio y Mi ACI)
 * vive en la misma pantalla y se mudará después: va aparte a propósito, para no mezclar dos asuntos.
 */
import { guardarCasa, laCasa } from './casa.js';
import { pintarServicios, pintarMiAci } from './servicios.js';

/* ── las etiquetas: «escribe y Enter para agregar; toca la × para quitar» ─────────────────────────── */
function campoDeEtiquetas(el) {
  if (el._tagsCampo) return el._tagsCampo;
  const numerico = el.dataset.type === 'number';
  let items = [], cargando = false;
  /* Las etiquetas no son un <input>, así que no emiten 'input' solas y el aviso de «sin guardar» no se
   * enteraría. Se emite a mano —menos durante `poner()`, que es la carga inicial y no un cambio—. */
  const avisa = () => { if (!cargando) el.dispatchEvent(new Event('input', { bubbles: true })); };
  const campo = document.createElement('input');
  campo.type = 'text';
  campo.placeholder = el.dataset.placeholder || '';
  campo.setAttribute('aria-label', el.dataset.placeholder || 'Agregar');
  const lista = document.createElement('div');
  lista.className = 'tag-list';

  function pintar() {
    lista.innerHTML = items.map((v, i) =>
      `<span class="tag">${String(v)}<button type="button" data-quitar="${i}" aria-label="Quitar ${String(v)}">×</button></span>`).join('');
    el.classList.toggle('empty', !items.length);
  }
  function agregar(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    const v = numerico ? Number(t.replace(/[^\d.]/g, '')) : t;
    if (numerico && !isFinite(v)) return;
    if (items.some(x => String(x).toLowerCase() === String(v).toLowerCase())) return;
    items = items.concat([v]); pintar(); avisa();
  }
  campo.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    agregar(campo.value); campo.value = '';
  });
  campo.addEventListener('blur', () => { if (campo.value.trim()) { agregar(campo.value); campo.value = ''; } });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    items = items.filter((_, i) => i !== Number(b.dataset.quitar)); pintar(); avisa();
  });
  el.appendChild(campo); el.appendChild(lista);
  el._tagsCampo = {
    get: () => items.slice(),
    set: vals => { cargando = true; items = (vals || []).slice(); pintar(); cargando = false; }
  };
  return el._tagsCampo;
}
const etiquetasDe = id => campoDeEtiquetas(document.querySelector(id));

/* ── el aviso de «cambios sin guardar» ───────────────────────────────────────────────────────────── */
export function marcarSucio(hay) {
  document.querySelector('#settingsDirty').hidden = !hay;
  const b = document.querySelector('#saveSettings');
  b.classList.toggle('dirty', !!hay);
  b.textContent = hay ? 'Guardar cambios' : 'Guardado';
  return true;
}

/* ── el alcance de los porcentajes (a qué muebles se les aplican) ─────────────────────────────────── */
export function pintarAlcance() {
  const C = laCasa();
  if (!C) return false;
  const todos = C.furnitureAll();
  const piezas = todos.filter(f => C.Store.hasComponentModel(f)).map(f => f.name);
  const base = todos.filter(f => !C.Store.hasComponentModel(f)).map(f => f.name);
  document.querySelector('#coverageScope').textContent = base.length
    ? `Solo se aplican a los muebles que se estiman por rango base: ${base.join(', ')}.`
    : 'Ningún mueble se estima ya por rango base, así que hoy no se aplican a ninguno.';
  const piezasAviso = document.querySelector('#coveragePieces');
  piezasAviso.textContent = piezas.length
    ? `${piezas.join(', ')} no los usa${piezas.length > 1 ? 'n' : ''}: calcula${piezas.length > 1 ? 'n' : ''} la proporción a partir de las piezas que se tapizan.`
    : '';
  piezasAviso.hidden = !piezas.length;
  return true;
}

/* ── la carga: lo guardado → el formulario ───────────────────────────────────────────────────────── */
export function cargarAjustes() {
  const C = laCasa();
  if (!C) return false;
  const s = C.Store.settings();
  const poner = (sel, valor) => { const el = document.querySelector(sel); if (el) el.value = valor; };
  poner('#setWaste', s.wastePct); poner('#setMargin', s.marginPct); poner('#setTolerance', s.rangeTolerancePct);
  poner('#setCurrency', s.currency); poner('#setMessage', s.confirmationMessage);
  poner('#setSender', s.senderEmail); poner('#setResponse', s.responseTime);
  etiquetasDe('#setNeeds').set(s.needs); etiquetasDe('#setStyles').set(s.styles);
  etiquetasDe('#setColors').set(s.colors); etiquetasDe('#setBudgets').set(s.budgets);
  poner('#setMaxQty', s.maxQuantity);
  poner('#setCovSeatsMin', s.coverageSeats[0]); poner('#setCovSeatsMax', s.coverageSeats[1]);
  poner('#setCovPartMin', s.coveragePartial[0]); poner('#setCovPartMax', s.coveragePartial[1]);
  pintarAlcance();
  /* La oferta (líneas de servicio) y Mi ACI viven en servicios.js y se pintan junto con los ajustes:
   * la pantalla muestra las dos cosas, y el cotizador depende de las DOS (lo prendido y su precio). */
  pintarServicios(); pintarMiAci();
  document.querySelector('#setAutoAssign').classList.toggle('on', !!s.autoAssignByZone);
  document.querySelector('#setEmailCopy').classList.toggle('on', !!s.emailClientCopy);
  document.querySelector('#setAiCheck').classList.toggle('on', !!s.aiPhotoCheck);
  marcarSucio(false);
  return true;
}

export function conectarAjustes(laCasaDeLaPagina) {
  guardarCasa(laCasaDeLaPagina);
  const C = laCasa();
  if (!C) return false;

  /* Cualquier retoque en la pantalla enciende el aviso de «cambios sin guardar». */
  ['input', 'change'].forEach(ev => document.querySelector('#settings').addEventListener(ev, () => marcarSucio(true)));

  /* Los interruptores son <button>, no emiten 'input': avisan a mano. */
  ['#setAutoAssign', '#setEmailCopy', '#setAiCheck'].forEach(id => {
    const b = document.querySelector(id);
    if (b) b.onclick = () => { b.classList.toggle('on'); marcarSucio(true); };
  });

  const guardar = document.querySelector('#saveSettings');
  if (guardar) guardar.onclick = () => {
    try {
      C.Store.saveSettings({
        wastePct: +document.querySelector('#setWaste').value || 0,
        marginPct: +document.querySelector('#setMargin').value || 0,
        rangeTolerancePct: +document.querySelector('#setTolerance').value || 0,
        currency: document.querySelector('#setCurrency').value,
        confirmationMessage: document.querySelector('#setMessage').value,
        senderEmail: document.querySelector('#setSender').value,
        responseTime: document.querySelector('#setResponse').value,
        needs: etiquetasDe('#setNeeds').get(), styles: etiquetasDe('#setStyles').get(),
        colors: etiquetasDe('#setColors').get(),
        budgets: etiquetasDe('#setBudgets').get().sort((a, b) => a - b),
        maxQuantity: Math.max(2, +document.querySelector('#setMaxQty').value || 5),
        coverageSeats: [+document.querySelector('#setCovSeatsMin').value || 68, +document.querySelector('#setCovSeatsMax').value || 70],
        coveragePartial: [+document.querySelector('#setCovPartMin').value || 45, +document.querySelector('#setCovPartMax').value || 50],
        autoAssignByZone: document.querySelector('#setAutoAssign').classList.contains('on'),
        emailClientCopy: document.querySelector('#setEmailCopy').classList.contains('on'),
        aiPhotoCheck: document.querySelector('#setAiCheck').classList.contains('on')
      });
    } catch (err) { return C.toast(err.message); }
    C.renderAll(); marcarSucio(false);
    C.toast('Configuraciones de cotizador guardadas — el cotizador ya las usa');
  };
  return true;
}
