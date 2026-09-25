/* EL CONTACTO Y SU RESUMEN (src/wizard) — corte 4.
 *
 * El último paso: la atención declarada —la ciudad del cliente, la del servicio y la SEDE por id,
 * nunca por texto libre— con sus desplegables («Otra ciudad…» declara su texto) y la tarjeta que
 * resume lo cotizado antes de enviar (mueble, medidas, tela o lista, consumo, metros, daños y precio).
 *
 * La sede viaja CON la principal elegida, así que su valor por sí solo no es una declaración: cuenta
 * cuando el cliente la toca, cuando declara alguna ciudad o cuando confirma el último paso; el paso
 * de la revisión va ANTES y el dueño vio ahí una sede que nadie había elegido todavía.
 */
import { guardarElTaller, elTaller } from './casa.js';

let elContacto = null;   /* nombre del módulo: los top-level se pegan en un script */

export function laAtencionDeclarada() { const v = elContacto; return v ? v.atencion() : null; }
export function pintarLasCiudades() { const v = elContacto; if (v) return v.ciudades(); }
export function pintarElResumen() { const v = elContacto; if (v) return v.resumen(); }

export function conectarElContacto(elPuenteDeLaPagina) {
  guardarElTaller(elPuenteDeLaPagina);
  const C = elTaller();
  if (!C) return false;
  const E = C.estado;

  /* La atención declarada: ciudad del cliente, ciudad del servicio y sede (la sede por id, nunca por
   * texto libre). Las ciudades salen de las sedes configuradas; «Otra ciudad…» declara su texto. */
  function atencionDeclarada() {
    const ciudad = id => { const sel = document.getElementById(id); if (!sel) return null;
      if (sel.value === '__otra__') { const t = document.getElementById(id + 'Other'); return (t && t.value.trim()) || null }
      return sel.value || null };
    const sel = document.getElementById('city'), punto = sel && sel.value ? C.Store.get('servicePoints', sel.value) : null;
    /* La sede viene CON la principal elegida (no bloquea), así que su valor por sí solo no es una
     * declaración: cuenta cuando el cliente la toca, cuando declara alguna ciudad o cuando confirma el
     * último paso. Antes de eso no viaja a ninguna parte — el paso de la revisión va ANTES y el dueño
     * vio ahí una sede que nadie había elegido todavía. */
    const declarada = !!(E.atencionDeclarada) || !!(sel && sel.dataset.declarada === '1')
      || !!ciudad('customerCity') || !!ciudad('serviceCity');
    return { customerCity: declarada ? ciudad('customerCity') : null,
      serviceCity: declarada ? ciudad('serviceCity') : null,
      servicePoint: declarada && punto ? { id: punto.id, name: punto.name, city: punto.city } : null,
      declared: declarada };
  }

  function furnitureSummaryLabel() {
    const rule = C.reglasDelMueble()[E.furniture]; const qtyText = (C.seatsSelect.options[C.seatsSelect.selectedIndex] || {}).text || '';
    /* Sin mueble elegido (la parrilla ya no marca ninguno por defecto) no hay etiqueta que armar. */
    if (!rule) return E.furniture || '—';
    // "Poltrona · 1 poltrona" reads badly; a single piece needs no count.
    if (rule.scaleByQty && C.seatsSelect.value === '1') return E.furniture;
    return `${E.furniture} · ${qtyText}`;
  }
  function updateSummary() {
    document.getElementById('summaryFurniture').textContent = furnitureSummaryLabel();
    document.getElementById('summaryMeasures').textContent = `${document.getElementById('width').value} × ${document.getElementById('height').value} × ${document.getElementById('depth').value} cm`;
    document.getElementById('summaryFabric').textContent = C.esRutaLista()
      ? (() => { const n = C.leerLaLista().length; return n ? `${n} ${n === 1 ? 'referencia' : 'referencias'}` : 'Por confirmar' })()
      : (E.fabric ? `${E.fabric.name} · ${E.fabric.colorName}` : 'Por confirmar');
    document.getElementById('summaryService').textContent = E.service ? E.service.label : '—';
    const q = C.billable();
    document.getElementById('summaryConsumo').textContent = `${C.rangoM(q.min, q.max)} m`;
    document.getElementById('summaryMeters').textContent = `${C.rangoM(q.facMin, q.facMax)} m`;
    /* Los daños y el total solo aparecen cuando existen: el resumen de un suministro de tela no
     * tiene por qué mostrar una fila de reparaciones en $0. */
    const ds = C.damageIds(), fila = document.getElementById('summaryDamagesRow');
    fila.hidden = !ds.length;
    if (ds.length) document.getElementById('summaryDamages').textContent = C.Store.damageItems().filter(d => ds.indexOf(d.id) >= 0).map(d => d.label).join(' · ');
    const p = C.linePrice(q);
    document.getElementById('summaryPrice').textContent = p ? p.totalText : 'Por confirmar';
  }

  // Los puntos ya vienen ordenados por Store; agruparlos por ciudad conserva
  // ese orden (el grupo nace en la posición del primer punto que lo usa), así
  // que basta con recorrerlos una vez, sin ordenar las ciudades aparte.
  function renderCities() {
    const sel = document.getElementById('city'); const puntos = C.Store.activeServicePoints();
    const grupos = [];
    puntos.forEach(p => {
      let g = grupos.find(x => x.city === p.city);
      if (!g) { g = { city: p.city, items: [] }; grupos.push(g) }
      g.items.push(p);
    });
    sel.innerHTML = grupos.map(g =>
      `<optgroup label="${C.esc(g.city)}">${g.items.map(p => `<option value="${C.esc(p.id)}">${C.esc(p.name)}</option>`).join('')}</optgroup>`
    ).join('') + '<option value="">Otra ciudad</option>';
    /* Las ciudades del cliente salen de sus propias sedes (`activeServicePoints`), sin inventar
     * ninguna: la misma lista para «en qué ciudad estás» y «para qué ciudad es el servicio», cada una
     * con «Otra ciudad…» para quien no esté en la lista (dueño, 20/09). */
    const ciudades = [...new Set(puntos.map(p => p.city))].filter(Boolean).sort();
    ['customerCity', 'serviceCity'].forEach(id => {
      const sel = document.getElementById(id); if (!sel) return;
      const previo = sel.value;
      sel.innerHTML = '<option value="">Elige una ciudad…</option>' +
        ciudades.map(c => `<option value="${C.esc(c)}">${C.esc(c)}</option>`).join('') +
        '<option value="__otra__">Otra ciudad…</option>';
      if (previo) sel.value = previo;
      if (!sel.dataset.atencionLigada) {
        sel.dataset.atencionLigada = '1';
        const campo = document.getElementById(id + 'Other'), caja = document.getElementById(id + 'OtherField');
        const sync = () => { const otra = sel.value === '__otra__'; if (caja) caja.hidden = !otra;
          if (campo && !otra) campo.value = ''; };
        sel.addEventListener('change', () => { sel.dataset.declarada = '1'; sync() }); sync();
      }
    });
  }

  elContacto = { atencion: atencionDeclarada, ciudades: renderCities, resumen: updateSummary };
  return true;
}
