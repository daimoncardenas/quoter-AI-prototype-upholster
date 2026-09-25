/* LÍNEAS DE SERVICIO Y MI ACI (src/backoffice) — la quinta vista que se muda (corte 3).
 *
 * Vive en la pantalla de Configuraciones pero es otro asunto: aquí no se ajustan números del cálculo,
 * se decide QUÉ SE OFRECE (líneas prendidas/apagadas, cómo se cobra la obra del taller, y el paquete que
 * el propio cliente arma). Por eso va en su módulo y no junto a `ajustes.js`.
 *
 * Tres piezas: la lista de líneas de servicio (`pintarServicios`), la tarjeta de mano de obra e insumos
 * por línea (`pintarObra`) y Mi ACI —el mercado: Core, capacidades, paquetes y el total (`pintarMiAci`).
 */
import { guardarCasa, laCasa } from './casa.js';

export function pintarServicios() {
  const C = laCasa();
  if (!C) return false;
  const list = document.querySelector('#serviceLinesCfg');
  if (!list) return false;
  /* La línea que otra usa como camino (catálogo: `rutas` con `line`) no se lista aparte: la reparación
   * se elige DENTRO de Mantenimiento (dueño, 21/09). Se acá y en Mi ACI. */
  const esCaminoDeOtra = s => C.Store.services().some(o => (o.rutas || []).some(r => r.line === s.id));
  list.innerHTML = C.Store.services().filter(s => !esCaminoDeOtra(s)).map(s =>
    `<li><label class="line-row"><input type="checkbox" data-line="${C.esc(s.id)}"${s.enabled ? ' checked' : ''}>` +
    `<span><strong>${C.esc(s.label)}</strong></span></label>` +
    `<span class="aci-value">${s.enabled ? 'Habilitada' : 'Deshabilitada'}</span></li>`
  ).join('');
  list.querySelectorAll('input[data-line]').forEach(cb => {
    cb.addEventListener('change', () => {
      try { const l = C.Store.setLineEnabled(cb.dataset.line, cb.checked); C.toast(`${l.label}: ${cb.checked ? 'habilitada' : 'deshabilitada'}`); }
      catch (err) { cb.checked = !cb.checked; C.toast(err.message); }
      pintarServicios(); pintarMiAci();
    });
  });
  pintarObra();
  return true;
}

/* Mano de obra e insumos (docs/retapizado-trabajo.md): lo único que el taller edita aquí es CÓMO se cobra
 * su obra y CUÁNTO por metro de tela. La base por mueble vive en el catálogo del producto (valores DEMO) y
 * los precios de los insumos también: esta tarjeta es una decisión, no un formulario. La edición vive como
 * override de ESTE cliente (`settings.lineOverrides`), así regenerar el paquete no borra lo elegido. */
export function pintarObra() {
  const C = laCasa();
  if (!C) return false;
  const box = document.querySelector('#lineWorkCfg');
  if (!box) return false;
  const lineas = C.Store.services().filter(s => (s.labor && s.labor.mode === 'tabla') || (s.insumos || []).length);
  if (!lineas.length) { box.innerHTML = ''; return true; }
  box.innerHTML = lineas.map(s => {
    const lab = s.labor || { mode: 'pct', pct: 0, perMeter: 0, porMueble: {} };
    const filasInsumo = (s.insumos || []).map(x =>
      `<li><label><b>${C.esc(x.label)}</b> <em>por ${C.esc(x.unit || 'unidad')}</em><input type="number" min="0" step="1000" data-insumo-cop="${C.esc(x.id)}" value="${x.cop}" placeholder="—"></label></li>`).join('');
    return `<div class="line-work" data-line-work="${C.esc(s.id)}">` +
      `<h3>Mano de obra e insumos — ${C.esc(s.label)}</h3>` +
      `<div class="line-work-grid">` +
        `<label>Se cobra por<select data-obra-modo>` +
          `<option value="tabla"${lab.mode === 'tabla' ? ' selected' : ''}>Por mueble + por metro</option>` +
          `<option value="pct"${lab.mode !== 'tabla' ? ' selected' : ''}>Porcentaje de la tela</option>` +
        `</select></label>` +
        `<label data-obra-metro${lab.mode === 'tabla' ? '' : ' hidden'}>Por metro de tela (COP)<input type="number" min="0" step="500" data-obra-metro-campo value="${lab.perMeter || ''}" placeholder="—"></label>` +
        `<label data-obra-pct${lab.mode === 'tabla' ? ' hidden' : ''}>Porcentaje de la tela (%)<input type="number" min="0" max="200" step="1" data-obra-pct-campo value="${lab.pct || ''}" placeholder="60"></label>` +
      `</div>` +
      `<h4>Insumos que repone — precio del catálogo</h4><ul class="line-work-rows">${filasInsumo || '<li>Esta línea no pregunta insumos.</li>'}</ul>` +
    `</div>`;
  }).join('');
  const cambiarModo = caja => {
    const modo = caja.querySelector('[data-obra-modo]').value;
    caja.querySelector('[data-obra-metro]').hidden = modo !== 'tabla';
    caja.querySelector('[data-obra-pct]').hidden = modo === 'tabla';
  };
  box.querySelectorAll('[data-line-work]').forEach(caja => {
    const guardar = () => {
      const id = caja.dataset.lineWork;
      const s = C.Store.services().filter(x => x.id === id)[0];
      /* La base por mueble NO se toca desde aquí: viaja tal como está (catálogo u override). */
      const labor = { mode: caja.querySelector('[data-obra-modo]').value,
        pct: +caja.querySelector('[data-obra-pct-campo]').value || 0,
        perMeter: +caja.querySelector('[data-obra-metro-campo]').value || 0,
        porMueble: Object.assign({}, (s.labor || {}).porMueble || {}) };
      const insumos = (s.insumos || []).map(x => {
        const campo = caja.querySelector(`[data-insumo-cop="${x.id}"]`);
        return Object.assign({}, x, { cop: campo ? Math.max(0, +campo.value || 0) : x.cop });
      });
      const todos = Object.assign({}, C.Store.settings().lineOverrides || {});
      todos[id] = { labor, insumos };
      C.Store.saveSettings({ lineOverrides: todos });
      C.toast(`${s.label}: obra ${labor.mode === 'tabla' ? 'por mueble + por metro' : 'por porcentaje'}`);
    };
    caja.addEventListener('change', () => { cambiarModo(caja); guardar(); });
  });
  return true;
}

/* Mi ACI: el mercado. El Core es fijo, los paquetes recomendados son un atajo y cada servicio lleva su
 * precio; abajo se compone el total. Es la cara comercial del mismo estado que se prende en
 * Configuraciones (disabledLines), así que las dos pantallas coinciden. */
export function pintarMiAci() {
  const C = laCasa();
  if (!C) return false;
  const list = document.querySelector('#serviceLines');
  if (!list) return false;
  const money = v => C.Store.money(v || 0);
  const aci = C.Store.myAci();

  const core = document.querySelector('#aciCore');
  if (core) core.innerHTML =
    `<div class="aci-head"><b>${C.esc(aci.core.label)}</b><em>${money(aci.core.price)} / ${C.esc(aci.period)}</em></div>` +
    `<ul class="aci-includes">${(aci.core.includes || []).map(x => `<li>✓ ${C.esc(x)}</li>`).join('')}</ul>`;

  /* Consumo: la cuota del paquete. Los paquetes de consumo comprados viven en la pestaña Paquetes, no
   * aquí: repetirlos en Mi ACI era información duplicada (dueño, 21/09). */
  const cap = document.querySelector('#aciCapacity');
  if (cap) {
    const q = aci.quotaActual;
    cap.innerHTML = `<h4 class="aci-section">Consumo</h4>` +
      (q ? `<ul class="aci-capacity aci-quota-actual"><li><span>${aci.presetActual ? `Incluido en el paquete «${C.esc(aci.presetActual.label)}»` : 'Incluido en tu cuenta (paquete a la medida)'}</span><em>${q.quotes} cotizaciones · ${q.aiCredits} interacciones de IA · ${q.storageGB} GB · ${q.users} usuario${q.users === 1 ? '' : 's'} · ${q.locations} sede${q.locations === 1 ? '' : 's'} · ${q.historyMonths} meses de historial</em></li></ul>` : '');
  }

  /* Capacidades: cada una se activa por su cuenta y con su valor (nada de «venía en»). */
  const capa = document.querySelector('#aciCapabilities');
  if (capa) {
    capa.innerHTML = `<h4 class="aci-section">Capacidades</h4><ul class="service-lines">` +
      aci.capabilities.map(c => `<li><label class="line-row"><input type="checkbox" data-cap="${C.esc(c.id)}"${c.enabled ? ' checked' : ''}>` +
        `<span><strong>${C.esc(c.label)}</strong>${c.hint ? `<small class="aci-hint">${C.esc(c.hint)}</small>` : ''}</span></label>` +
        `<span class="aci-value">+${money(c.price)} / ${C.esc(aci.period)}</span></li>`).join('') + `</ul>`;
    capa.querySelectorAll('input[data-cap]').forEach(cb => cb.addEventListener('change', () => {
      try { C.Store.setCapability(cb.dataset.cap, cb.checked); }
      catch (err) { cb.checked = !cb.checked; C.toast(err.message); }
      pintarMiAci(); pintarServicios();
    }));
  }

  const box = document.querySelector('#aciPresets');
  if (box) {
    /* El precio del botón es el del PLAN (p.price, del catálogo): el paquete y su tarjeta en Planes
     * muestran el mismo número. La suma de sus partes es el precio de lista y no se enseña aquí: el
     * total de abajo explica la diferencia cuando la hay. */
    box.innerHTML = aci.presets.map(p => {
      const q = p.quota ? `${p.quota.quotes} cotizaciones · ${p.quota.users} usuario${p.quota.users === 1 ? '' : 's'} · ${p.quota.locations} sede${p.quota.locations === 1 ? '' : 's'}` : '';
      return `<button type="button" class="aci-preset${aci.presetActual && aci.presetActual.id === p.id ? ' current' : ''}" data-preset="${C.esc(p.id)}">` +
        `<b>${C.esc(p.label)}</b><small>${C.esc(p.hint)}</small>` +
        (q ? `<small class="aci-quota">${C.esc(q)}</small>` : '') +
        `<em>${money(p.price)} / ${C.esc(aci.period)}</em></button>`;
    }).join('');
    box.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      const p = C.Store.presets().presets.find(x => x.id === b.dataset.preset);
      /* El paquete es un punto de partida: servicios + capacidades + cuota de una vez, y después el
       * cliente agrega o quita lo que necesite (cada casilla tiene su valor). */
      try { C.Store.setBundle(p.id); C.toast(`Paquete «${p.label}» aplicado: puedes agregar o quitar lo que quieras.`); }
      catch (err) { C.toast(err.message); }
      pintarMiAci(); pintarServicios();
    }));
  }

  /* La copia de `aci.services` no lleva `rutas`: la verdad está en el catálogo (`Store.services()`). Sin
   * esto, «Reparación y restauración» seguía apareciendo suelta con «incluido» (dueño, 21/09). */
  const conRutas = C.Store.services() || [];
  const esCaminoDeOtra = id => conRutas.some(o => (o.rutas || []).some(r => r.line === id));
  list.innerHTML = aci.services.filter(s => !esCaminoDeOtra(s.id)).map(s =>
    `<li><label class="line-row"><input type="checkbox" data-line="${C.esc(s.id)}"${s.enabled ? ' checked' : ''}>` +
    `<span><strong>${C.esc(s.label)}</strong>${s.hint ? `<small class="aci-hint">${C.esc(s.hint)}</small>` : ''}</span></label>` +
    `<span class="aci-value">${s.price ? '+' + money(s.price) + ' / ' + C.esc(aci.period) : 'incluido'}</span></li>`
  ).join('');
  list.querySelectorAll('input[data-line]').forEach(cb => {
    cb.addEventListener('change', () => {
      try { const l = C.Store.setLineEnabled(cb.dataset.line, cb.checked); C.toast(`${l.label}: ${cb.checked ? 'habilitada' : 'deshabilitada'}`); }
      catch (err) { cb.checked = !cb.checked; C.toast(err.message); }
      pintarMiAci(); pintarServicios();
    });
  });

  const total = document.querySelector('#aciTotal');
  if (total) {
    /* La suma de lo marcado ES el precio POR MES del paquete (Core + servicios + capacidades suman
     * exacto lo que se paga cada mes): si lo marcado es un paquete del catálogo se dice su nombre, la
     * condición mes a mes y, aparte, el precio del contrato de 12 meses. */
    const nota = aci.presetActual
      ? `Precio del paquete «${aci.presetActual.label}» · ${C.BILLING_CAPTIONS.mensual} · ${C.BILLING_CAPTIONS.anual} ${money(aci.presetActual.priceYearly)}`
      : `A la medida: Core + servicios + capacidades, cada uno con su precio · ${C.BILLING_CAPTIONS.mensual}`;
    total.innerHTML = `<b>Tu plan</b><span>${money(aci.total)} / ${C.esc(aci.period)}</span>` +
      `<small class="aci-total-note">${C.esc(nota)}</small>` +
      (aci.demo ? '<small>Precios demo del prototipo</small>' : '');
  }
  return true;
}

export function conectarServicios(laCasaDeLaPagina) {
  guardarCasa(laCasaDeLaPagina);
  return !!laCasa();
}
