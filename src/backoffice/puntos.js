/* PUNTOS DE ATENCIÓN (src/backoffice) — la primera vista que se muda del backoffice.
 *
 * Cómo se escribe una vista aquí (y así van las que siguen: quotes, catalog, sellers, settings):
 *   · `pintar()`  deja la tabla como está la pantalla hoy (mismos rótulos, mismos avisos).
 *   · `conectar(casa)` engancha los gestos (el ⋯ de una fila, «Nuevo punto», guardar y eliminar) y
 *     recibe de la página lo que la vista necesita: el almacén, el aviso, el confirm y un par de
 *     lecturas. Se pasan a mano mientras el núcleo siga siendo un script clásico; cuando el núcleo
 *     sea modular, esto serán imports y `conectar` desaparece.
 *
 * Nada de esta vista sabe de otra: lee puntos y vendedores, escribe puntos, y avisa. Eso es lo que se
 * gana al mudarla: se puede leer sola.
 */
import { guardarCasa, laCasa } from './casa.js';

export function pintarPuntos() {
  const C = laCasa();
  if (!C) return false;
  const caja = document.querySelector('#pointRows');
  if (!caja) return false;
  const auto = C.Store.settings().autoAssignByZone;
  caja.innerHTML = C.pointsAll().map(p => {
    const cubren = C.sellersAll().filter(s => s.active && (s.servicePointIds || []).some(id => String(id) === String(p.id))).length;
    const aviso = auto && p.active && !cubren;
    return `<tr><td><strong>${C.esc(p.name)}</strong>` +
      (aviso ? '<br><small style="color:var(--amber)">Sin vendedor activo · las solicitudes quedan sin asignar</small>' : '') +
      `</td><td>${C.esc(p.city || '—')}</td><td>${cubren}</td><td>${C.esc(p.order || 0)}</td>` +
      `<td><span class="status ${p.active ? 'sent' : 'progress'}">${p.active ? 'Activo' : 'Pausado'}</span></td>` +
      `<td><button class="row-action" data-edit-point="${C.esc(p.id)}" aria-label="Editar">⋯</button></td></tr>`;
  }).join('') || '<tr><td colspan="6">No hay puntos de atención configurados. El cotizador no podrá ofrecer ninguna ciudad.</td></tr>';
  return true;
}

function llenarFormulario(p) {
  const C = laCasa();
  const form = document.querySelector('#pointForm'), E = form.elements;
  form.reset();
  E.id.value = p ? p.id : '';
  E.name.value = p ? p.name : '';
  E.city.value = p ? (p.city || '') : '';
  E.address.value = p ? (p.address || '') : '';
  E.phone.value = p ? (p.phone || '') : '';
  E.order.value = p ? (p.order || 1) : (C.pointsAll().length + 1);
  E.active.value = p ? String(!!p.active) : 'true';
  document.querySelector('#deletePoint').style.display = p ? '' : 'none';
}

function editar(id) {
  const C = laCasa();
  const p = C.Store.get('servicePoints', id);
  if (!p) return;
  llenarFormulario(p);
  document.querySelector('#pointModalTitle').textContent = 'Editar punto';
  C.openModal('#pointModal');
}

export function conectarPuntos(laCasaDeLaPagina) {
  guardarCasa(laCasaDeLaPagina);
  const C = laCasa();
  if (!C) return false;
  const rows = document.querySelector('#pointRows');
  if (rows) rows.addEventListener('click', e => {
    const b = e.target.closest('[data-edit-point]');
    if (b) editar(b.dataset.editPoint);
  });

  const nuevo = document.querySelector('#newPoint');
  if (nuevo) nuevo.onclick = () => {
    llenarFormulario(null);
    document.querySelector('#pointModalTitle').textContent = 'Nuevo punto';
    C.openModal('#pointModal');
  };

  const form = document.querySelector('#pointForm');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const name = String(d.name || '').trim(), city = String(d.city || '').trim();
    if (!name) return C.toast('El nombre no puede quedar vacío');
    if (!city) return C.toast('La ciudad no puede quedar vacía');
    const repetido = C.pointsAll().some(p => C.normName(p.city) === C.normName(city) && C.normName(p.name) === C.normName(name) && String(p.id) !== String(d.id));
    if (repetido) return C.toast('Ya existe un punto de atención con ese nombre en esa ciudad');
    const previo = d.id ? C.Store.get('servicePoints', d.id) : null;
    const item = { id: d.id || ('sp-' + Date.now()), name, city,
      address: String(d.address || '').trim(), phone: String(d.phone || '').trim(),
      order: +d.order || 1, active: d.active === 'true' };
    try { C.Store.put('servicePoints', item); } catch (err) { return C.toast(err.message); }
    /* La etiqueta del punto queda repetida en cada cotización: sin refrescarla, la búsqueda y el CSV
     * seguirían leyendo el nombre o la ciudad anteriores. */
    const retag = previo && C.pointLabel(previo) !== C.pointLabel(item) ? C.Store.retagQuotePoints(item.id, C.pointLabel(item)) : 0;
    C.renderAll(); C.closeModals();
    C.toast(retag ? `Punto guardado · ${retag} ${retag === 1 ? 'solicitud renombrada' : 'solicitudes renombradas'}` : 'Punto guardado — el cotizador ya lo usa');
  };

  const borrar = document.querySelector('#deletePoint');
  if (borrar) borrar.onclick = async () => {
    const id = document.querySelector('#pointForm').elements.id.value;
    if (!id) return;
    const ok = await C.askConfirm({ title: 'Eliminar punto de atención',
      message: '¿Eliminar este punto de atención? Las cotizaciones ya enviadas conservan su texto.',
      confirmText: 'Sí, continuar', danger: true });
    if (!ok) return;
    const tocados = C.Store.removeServicePoint(id);
    C.renderAll(); C.closeModals();
    C.toast(tocados ? `Punto eliminado · ${tocados} ${tocados === 1 ? 'vendedor perdió esa cobertura' : 'vendedores perdieron esa cobertura'}` : 'Punto eliminado');
  };
  return true;
}
