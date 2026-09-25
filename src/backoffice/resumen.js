/* EL RESUMEN (src/backoffice) — la primera mitad del corte de cotizaciones.
 *
 * Es el panel que AGREGA: los cuatro números, la dona por estado, la actividad reciente y la tabla de
 * ciclo por vendedor. Se mudó antes que la lista porque no comparte nada con ella más allá de leer las
 * cotizaciones: la lista (tabla, visor de fotos, detalle con piezas, estado, comentarios y CSV) va en su
 * propio corte, `cotizaciones.js`.
 *
 * Y un detalle que se respeta a propósito: un VENDEDOR solo ve lo suyo. Todo el panel se calcula sobre
 * `visibles()` —las que le tocan a quien entró—, nunca sobre el total del negocio.
 */
import { guardarCasa, laCasa } from './casa.js';

export function pintarResumen() {
  const C = laCasa();
  if (!C) return false;
  const usuario = C.usuario ? C.usuario() : null;
  const todas = C.quotesAll();
  const visibles = usuario && usuario.role === 'seller' ? todas.filter(q => C.quoteIsFor(q, usuario)) : todas;
  const cuantas = s => visibles.filter(q => q.status === s).length;
  const nuevas = cuantas('Nueva'), gestion = cuantas('En gestión'), cotizadas = cuantas('Cotizada');
  const aceptadas = cuantas('Aceptada'), rechazadas = cuantas('Rechazada');

  document.querySelector('#statTotal').textContent = visibles.length;
  document.querySelector('#statUnassigned').textContent = visibles.filter(q => !C.quoteSellerName(q)).length;

  const donut = document.querySelector('#donut');
  donut.dataset.total = visibles.length;
  const pct = n => visibles.length ? (n / visibles.length * 100) : 0;
  const a = pct(nuevas), b = a + pct(gestion), c = b + pct(cotizadas), d = c + pct(aceptadas);
  donut.style.background = `conic-gradient(var(--ink) 0 ${a}%,var(--accent) ${a}% ${b}%,var(--tint-donut-third) ${b}% ${c}%,var(--green) ${c}% ${d}%,var(--red) ${d}% 100%)`;
  document.querySelector('#legNew').textContent = nuevas;
  document.querySelector('#legProgress').textContent = gestion;
  document.querySelector('#legSent').textContent = cotizadas;
  document.querySelector('#legAccepted').textContent = aceptadas;
  document.querySelector('#legRejected').textContent = rechazadas;

  document.querySelector('#activityFeed').innerHTML = visibles.slice(0, 5).map(q => {
    const quien = C.quoteSellerName(q);
    return `<li><span class="activity-icon">${quien ? '♙' : '◇'}</span><div>` +
      `<b>${C.esc(quien ? `${q.id} asignada a ${quien}` : `Nueva cotización ${q.id}`)}</b>` +
      `<small>${C.esc([C.etiquetaDelProyecto(q), C.Store.pointName(q)].filter(Boolean).join(' · '))}</small></div>` +
      `<time>${C.esc(C.fmtDate(q.date))}</time></li>`;
  }).join('') || '<li><div><b>Aún no hay solicitudes</b><small>Las cotizaciones enviadas desde el cotizador aparecerán aquí.</small></div></li>';

  /* Casos cerrados: aceptados + rechazados, sobre el total visible. */
  const cerradas = aceptadas + rechazadas;
  document.querySelector('#metricClosed').textContent = cerradas;
  document.querySelector('#metricClosedPct').textContent = `${visibles.length ? Math.round(cerradas / visibles.length * 100) : 0}% del total`;

  /* Aceptación: solo tiene sentido sobre lo que sí llegó a cotizarse. */
  const conCotizacion = cotizadas + cerradas;
  document.querySelector('#metricAcceptRate').textContent = conCotizacion ? `${Math.round(aceptadas / conCotizacion * 100)}%` : '—';

  /* Tiempo promedio de cierre: de la fecha de la solicitud a `closedAt`, en días, solo sobre los casos
   * que sí cerraron. `q.date` es un día LOCAL ('YYYY-MM-DD'); `new Date('YYYY-MM-DD')` lo leería como
   * medianoche UTC, que en Bogotá (UTC-5) infla cada duración hasta un día: por eso se le pega T00:00:00. */
  const conFecha = visibles.filter(q => q.closedAt);
  if (conFecha.length) {
    const dias = conFecha.reduce((suma, q) => {
      const ms = new Date(q.closedAt) - new Date(q.date + 'T00:00:00');
      return suma + (isFinite(ms) ? Math.max(0, ms / 86400000) : 0);
    }, 0) / conFecha.length;
    document.querySelector('#metricAvgDays').textContent = `${dias.toFixed(1).replace('.', ',')} días`;
  } else {
    document.querySelector('#metricAvgDays').textContent = '—';
  }

  /* La tabla por vendedor solo tiene sentido para quien ve a todo el equipo — un vendedor ya ve nada más
   * lo suyo en el resto del panel. */
  const soyAdmin = !(usuario && usuario.role === 'seller');
  document.querySelector('#sellerCycleTablePanel').hidden = !soyAdmin;
  if (soyAdmin) {
    document.querySelector('#sellerCycleRows').innerHTML = C.sellersAll().map(s => {
      const propias = todas.filter(q => C.quoteIsFor(q, { sellerId: s.id, name: s.name }));
      const cot = propias.filter(q => ['Cotizada', 'Aceptada', 'Rechazada'].includes(q.status)).length;
      const cer = propias.filter(q => C.Store.isQuoteClosed(q)).length;
      const ace = propias.filter(q => q.status === 'Aceptada').length;
      return `<tr><td><strong>${C.esc(s.name)}</strong></td><td>${propias.length}</td><td>${cot}</td><td>${cer}</td><td>${ace}</td></tr>`;
    }).join('') || '<tr><td colspan="5">No hay vendedores configurados.</td></tr>';
  }
  return true;
}

export function conectarResumen(laCasaDeLaPagina) {
  guardarCasa(laCasaDeLaPagina);
  return !!laCasa();
}
