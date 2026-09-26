/* VENDEDORES Y ZONAS (src/backoffice) — la segunda vista que se muda.
 *
 * Es la primera que LEE datos de otra vista (cada vendedor declara qué puntos de atención cubre, y esos
 * son de `puntos.js`): por eso se mudó después de ella. Todo lo que necesita de la casa se lo pasa la
 * página en `conectarVendedores(casa)` — el almacén, las lecturas compartidas (puntos, cotizaciones),
 * el aviso, el confirm y los helpers — así esta vista se puede leer sola.
 */
import { guardarCasa, laCasa } from './casa.js';

export function pintarVendedores() {
  const C = laCasa();
  if (!C) return false;
  const caja = document.querySelector('#sellerGrid');
  if (!caja) return false;
  caja.innerHTML = C.sellersAll().map(x =>
    `<article class="seller"><div class="seller-head"><div class="seller-id">` +
      `<span class="avatar">${C.esc(C.initialsOf(x.name))}</span><div><h3>${C.esc(x.name)}</h3><p>${C.esc(x.email)}</p></div></div>` +
      `<button class="toggle ${x.active ? 'on' : ''}" data-toggle-seller="${C.esc(x.id)}" aria-label="Activar o desactivar vendedor"></button></div>` +
    `<div class="seller-meta">` +
      `<span>Solicitudes este mes<strong>${C.quotesAll().filter(q => C.quoteIsFor(q, { sellerId: x.id, name: x.name })).length}</strong></span>` +
      `<span>Estado<strong>${x.active ? 'Recibe asignaciones' : 'Pausado · sin acceso'}</strong></span></div>` +
    `<div class="zones">${C.sellerPointNames(x).map(z => `<span>${C.esc(z)}</span>`).join('')}</div>` +
    `<div class="seller-actions"><button data-edit-seller="${C.esc(x.id)}">Editar datos</button></div></article>`
  ).join('');
  return true;
}

function llenarPuntosDelVendedor(seller) {
  const C = laCasa();
  const caja = document.querySelector('#sellerPointChecks');
  const puntos = C.pointsAll();
  const marcados = ((seller && seller.servicePointIds) || []).map(String);
  /* Las casillas se listan SIEMPRE, no solo las que ya cubre: así se puede sumar cobertura nueva desde
   * el mismo formulario. */
  caja.innerHTML = puntos.map(p =>
    `<label class="check"><input type="checkbox" name="servicePointIds" value="${C.esc(p.id)}"${marcados.includes(String(p.id)) ? ' checked' : ''}> ${C.esc(p.name)}${p.active ? '' : ' (pausado)'}</label>`
  ).join('');
  document.querySelector('#sellerPointsHint').hidden = !!puntos.length;
}

const puntosMarcados = form => [...form.querySelectorAll('[name=servicePointIds]:checked')].map(c => c.value);

function editarVendedor(id) {
  const C = laCasa();
  const x = C.Store.get('sellers', id), f = document.querySelector('#sellerForm');
  if (!x) return;
  f.reset();
  f.elements.id.value = x.id; f.elements.name.value = x.name; f.elements.email.value = x.email;
  f.elements.active.value = String(!!x.active);
  llenarPuntosDelVendedor(x);
  document.querySelector('#sellerAccountHint').hidden = false;
  document.querySelector('#sellerModalTitle').textContent = 'Editar vendedor';
  C.openModal('#sellerModal');
}

export function conectarVendedores(laCasaDeLaPagina) {
  guardarCasa(laCasaDeLaPagina);
  const C = laCasa();
  if (!C) return false;

  const grid = document.querySelector('#sellerGrid');
  if (grid) grid.addEventListener('click', e => {
    const ed = e.target.closest('[data-edit-seller]');
    if (ed) return editarVendedor(ed.dataset.editSeller);
    const t = e.target.closest('[data-toggle-seller]');
    if (!t) return;
    const x = C.Store.get('sellers', t.dataset.toggleSeller);
    if (!x) return;
    x.active = !x.active;
    try { C.Store.put('sellers', x); } catch (err) { return C.toast(err.message); }
    /* Pausar a un asistente tiene que cerrarle la cuenta también, o el interruptor miente. */
    C.Auth.setSellerActive(x.id, x.active);
    C.renderAll();
    C.toast(x.active ? 'Vendedor activado · recupera el acceso' : 'Vendedor pausado · pierde el acceso');
  });

  const nuevo = document.querySelector('#newSeller');
  if (nuevo) nuevo.onclick = () => {
    const f = document.querySelector('#sellerForm');
    f.reset(); f.elements.id.value = ''; f.elements.active.value = 'true';
    document.querySelector('#sellerAccountHint').hidden = true;
    llenarPuntosDelVendedor(null);
    document.querySelector('#sellerModalTitle').textContent = 'Nuevo vendedor';
    C.openModal('#sellerModal');
  };

  const form = document.querySelector('#sellerForm');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const esNuevo = !d.id, previo = esNuevo ? null : C.Store.get('sellers', d.id);
    if (!esNuevo && !previo) return C.toast('Ese vendedor ya no existe');
    /* El correo es el usuario con el que entra al backoffice: si se repite, el login encuentra la otra
     * cuenta y esta persona no vuelve a entrar nunca. */
    if (C.Auth.emailInUse(d.email, esNuevo ? null : previo.id)) return C.toast('Ese correo ya lo usa otra cuenta');
    const servicePointIds = puntosMarcados(e.target);
    if (!servicePointIds.length) return C.toast('Elige al menos un punto de atención');
    let seller;
    try {
      seller = C.Store.put('sellers', {
        id: esNuevo ? Date.now() : previo.id,
        name: String(d.name).trim(), email: String(d.email).trim(), servicePointIds,
        active: esNuevo ? true : d.active === 'true', quotes: previo ? previo.quotes : 0
      });
    } catch (err) { return C.toast(err.message); }
    if (esNuevo) {
      /* Un asistente nuevo necesita por dónde entrar: la cuenta se crea con él. */
      C.Auth.ensureUserForSeller(seller).catch(err => console.warn('[auth]', err));
      C.renderAll(); e.target.reset(); C.closeModals();
      return C.toast(`Vendedor agregado · contraseña ${C.Auth.DEMO_PASSWORD}`);
    }
    /* El vendedor y su cuenta son dos registros: sin esto, corregir un correo dejaría el login en la
     * dirección vieja, y pausar aquí no cerraría el acceso. */
    C.Auth.syncSellerAccount(seller);
    C.Auth.setSellerActive(seller.id, seller.active);
    /* La cotización guarda el nombre como etiqueta: sin refrescarla, la búsqueda y el CSV seguirían
     * leyendo el anterior. */
    const retag = previo.name !== seller.name ? C.Store.retagQuotes(seller.id, seller.name) : 0;
    C.renderAll(); C.closeModals();
    C.toast(retag ? `Vendedor actualizado · ${retag} ${retag === 1 ? 'solicitud renombrada' : 'solicitudes renombradas'}` : 'Vendedor actualizado');
  };
  return true;
}
