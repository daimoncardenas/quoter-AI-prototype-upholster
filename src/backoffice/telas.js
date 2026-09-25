/* CATÁLOGO DE TELAS (src/backoffice) — la tercera vista que se muda (corte 3).
 *
 * Es la vista más «de contenido» del backoffice: la rejilla con búsqueda y filtro, y el formulario grande
 * de la tela (referencia, rollo y forma de venta, criterios de recomendación y la foto). Trae dos cosas
 * que las vistas anteriores no traían y por eso se mudó después de ellas:
 *   · un formulario que LEE de las configuraciones (los criterios de recomendación salen de Ajustes), y
 *   · un archivo (la foto de la tela, que se reduce y vive en IndexedDB, no en el registro).
 *
 * Lo que necesita de la casa se lo pasa la página en `conectarTelas(casa)` (el puente, src/backoffice/casa.js).
 */
import { guardarCasa, laCasa } from './casa.js';

/* La foto que se está editando: `undefined` = sin tocar · `null` = quitada · texto = la nueva. */
let fotoDeTela;

export function pintarTelas() {
  const C = laCasa();
  if (!C) return false;
  const q = document.querySelector('#fabricSearch').value.toLowerCase();
  const f = document.querySelector('#fabricFilter').value;
  const todas = C.fabricsAll();
  const lista = todas.filter(x => (!f || (f === 'active') === !!x.active) &&
    [x.name, x.collection, x.use].concat(x.tags || []).join(' ').toLowerCase().includes(q));
  document.querySelector('#fabricGrid').innerHTML = lista.map(x =>
    `<article class="fabric"><div class="swatch" style="background:${C.Store.swatch(x)}"></div>` +
    `<div class="fabric-body"><div class="fabric-top"><div><h3>${C.esc(x.name)}</h3>` +
    `<p>${C.esc(x.collection)} · ${C.esc(x.colorName)}<br>Desde ${C.money(x.price)} / metro</p></div>` +
    `<span class="availability ${x.active ? '' : 'off'}" title="${x.active ? 'Activa' : 'Inactiva'}"></span></div>` +
    `<div class="tags">${(x.tags || []).map(t => `<span>${C.esc(t)}</span>`).join('')}<span>${C.esc(x.use)}</span></div>` +
    ((x.needs || []).length || (x.styles || []).length || x.colorFamily
      ? `<p class="reco">Recomendable para: ${C.esc([].concat(x.needs || [], x.styles || [], x.colorFamily || []).join(' · '))}</p>`
      : '<p class="reco none">Sin criterios de recomendación</p>') +
    `</div><div class="fabric-actions"><button data-edit-fabric="${C.esc(x.id)}">Editar</button>` +
    `<button data-toggle-fabric="${C.esc(x.id)}">${x.active ? 'Desactivar' : 'Activar'}</button></div></article>`
  ).join('') || '<p>No hay telas que coincidan con la búsqueda.</p>';
  /* La imagen vive en IndexedDB, así que la tarjeta se pinta primero con el color y
   * `Store.paintSwatch` la reemplaza cuando la foto llega. */
  document.querySelectorAll('#fabricGrid .fabric .swatch').forEach((el, i) => C.Store.paintSwatch(el, lista[i]));
  document.querySelector('#fabricCount').textContent = todas.filter(x => x.active).length;
  return true;
}

/* Los criterios salen de Configuraciones: una opción renombrada nunca queda desfasada. */
function llenarOpcionesDeRecomendacion() {
  const C = laCasa();
  const cfg = C.Store.settings(), F = document.querySelector('#fabricForm').elements;
  F.needs.innerHTML = (cfg.needs || []).map(n => `<option>${C.esc(n)}</option>`).join('');
  F.styles.innerHTML = (cfg.styles || []).map(n => `<option>${C.esc(n)}</option>`).join('');
  F.colorFamily.innerHTML = '<option value="">Sin definir</option>' + (cfg.colors || []).map(n => `<option>${C.esc(n)}</option>`).join('');
}

const marcarVarias = (sel, vals) => [...sel.options].forEach(o => { o.selected = (vals || []).includes(o.value); });

function mostrarFotoDeTela(url) {
  const t = document.querySelector('#fabricPhotoThumb');
  t.style.backgroundImage = url ? `url("${url}")` : '';
  t.classList.toggle('filled', !!url);
  document.querySelector('#fabricPhotoDrop').hidden = !url;
  document.querySelector('#fabricPhotoPick').textContent = url ? 'Cambiar imagen' : 'Subir imagen';
  document.querySelector('#fabricPhotoNote').textContent = url
    ? 'Se muestra en el catálogo y en el cotizador, en lugar del color de muestra.'
    : 'Opcional. Si la cargas, reemplaza al color de muestra en el catálogo y en el cotizador.';
}

function reiniciarFotoDeTela(fabric) {
  const C = laCasa();
  fotoDeTela = undefined;
  document.querySelector('#fabricPhotoInput').value = '';
  mostrarFotoDeTela(null);
  if (fabric && fabric.photoId) C.Photos.get(fabric.photoId)
    /* Solo pinta si el usuario no cargó ni quitó otra mientras tanto. */
    .then(url => { if (url && fotoDeTela === undefined) mostrarFotoDeTela(url); }).catch(() => {});
}

/* La imagen nunca se ve más grande que la tarjeta, así que se reduce antes de guardarla: una foto de
 * celular de 4 MB queda en ~80 KB. */
function leerImagenDeTela(file) {
  return new Promise(resolve => {
    if (!file.type.startsWith('image/')) return resolve(null);
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const k = Math.min(1, 900 / (img.naturalWidth || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        /* Un canvas contaminado lanza en vez de devolver: ahí se guarda el original. */
        try { resolve(c.toDataURL('image/jpeg', .82)); } catch (err) { resolve(ev.target.result); }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function editarTela(id) {
  const C = laCasa();
  const x = C.Store.get('fabrics', id), form = document.querySelector('#fabricForm');
  if (!x) return;
  form.reset(); llenarOpcionesDeRecomendacion();
  Object.keys(x).forEach(k => {
    const el = form.elements[k];
    if (!el || el.multiple || el.type === 'checkbox') return;
    el.value = Array.isArray(x[k]) ? x[k].join(', ') : x[k];
  });
  /* Los valores por defecto viven en Store.fabricRules: una tela creada antes de estas reglas abre el
   * modal con las suyas y no en blanco. */
  const reglas = C.Store.fabricRules(x);
  Object.keys(reglas).forEach(k => {
    const el = form.elements[k]; if (!el) return;
    if (el.type === 'checkbox') el.checked = !!reglas[k]; else el.value = reglas[k];
  });
  marcarVarias(form.elements.needs, x.needs); marcarVarias(form.elements.styles, x.styles);
  form.elements.colorFamily.value = x.colorFamily || '';
  reiniciarFotoDeTela(x);
  document.querySelector('#fabricModalTitle').textContent = 'Editar tela';
  C.openModal('#fabricModal');
}

export function conectarTelas(laCasaDeLaPagina) {
  guardarCasa(laCasaDeLaPagina);
  const C = laCasa();
  if (!C) return false;

  const grid = document.querySelector('#fabricGrid');
  if (grid) grid.addEventListener('click', e => {
    const ed = e.target.closest('[data-edit-fabric]'), tg = e.target.closest('[data-toggle-fabric]');
    if (ed) editarTela(ed.dataset.editFabric);
    if (tg) {
      const x = C.Store.get('fabrics', tg.dataset.toggleFabric); if (!x) return;
      x.active = !x.active;
      try { C.Store.put('fabrics', x); } catch (err) { return C.toast(err.message); }
      C.renderAll();
      C.toast(x.active ? 'Tela activada' : 'Tela desactivada');
    }
  });

  const nueva = document.querySelector('#newFabric');
  if (nueva) nueva.onclick = () => {
    const f = document.querySelector('#fabricForm');
    f.reset(); llenarOpcionesDeRecomendacion();
    f.elements.id.value = ''; f.elements.color.value = '#a79579';
    reiniciarFotoDeTela(null);
    const base = C.Store.fabricRules(null);
    Object.keys(base).forEach(k => {
      const el = f.elements[k]; if (!el) return;
      if (el.type === 'checkbox') el.checked = !!base[k]; else el.value = base[k];
    });
    document.querySelector('#fabricModalTitle').textContent = 'Nueva tela';
    C.openModal('#fabricModal');
  };

  const pick = document.querySelector('#fabricPhotoPick');
  if (pick) pick.onclick = () => document.querySelector('#fabricPhotoInput').click();
  const drop = document.querySelector('#fabricPhotoDrop');
  if (drop) drop.onclick = () => { fotoDeTela = null; document.querySelector('#fabricPhotoInput').value = ''; mostrarFotoDeTela(null); };
  const input = document.querySelector('#fabricPhotoInput');
  if (input) input.onchange = async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const url = await leerImagenDeTela(file);
    if (!url) return C.toast('No pudimos leer esa imagen');
    fotoDeTela = url; mostrarFotoDeTela(url);
  };

  const form = document.querySelector('#fabricForm');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const elegidas = n => [...e.target.elements[n].selectedOptions].map(o => o.value);
    const item = {
      id: d.id || Date.now(), name: d.name, collection: d.collection, price: +d.price || 0,
      color: d.color, colorName: d.colorName || 'Sin nombre', use: d.use,
      tags: String(d.tags || '').split(',').map(x => x.trim()).filter(Boolean), active: d.active === 'true',
      needs: elegidas('needs'), styles: elegidas('styles'), colorFamily: d.colorFamily || '',
      rollWidthCm: +d.rollWidthCm || 140, rollLengthM: +d.rollLengthM || 30,
      saleUnit: d.saleUnit === 'rollo' ? 'rollo' : 'metro',
      incrementM: +d.incrementM || 0.1, minOrderM: +d.minOrderM || 0,
      supplierMinM: +d.supplierMinM || 0,
      /* La orientación del corte es de la tela, no del mueble: sin el dato el cotizador NO gira piezas
       * (docs/consumo-direccional.md). */
      cutDirection: (d.cutDirection === 'free' || d.cutDirection === 'directional') ? d.cutDirection : 'unknown',
      patternMatch: d.patternMatch === 'none' ? 'none' : 'confirm',
      reusableRemainder: e.target.elements.reusableRemainder.checked
    };
    /* El item se arma desde el formulario, que no tiene la imagen: sin este bloque, editar cualquier
     * campo borraría la foto de la tela. */
    const prev = C.Store.get('fabrics', item.id);
    if (fotoDeTela === undefined) { if (prev && prev.photoId) item.photoId = prev.photoId; }
    else {
      const pid = C.Store.fabricPhotoId(item.id);
      if (fotoDeTela) { item.photoId = pid; C.Photos.put(pid, fotoDeTela).catch(err => console.warn('[telas] imagen no guardada', err)); }
      else C.Photos.remove(pid).catch(() => {});
    }
    try { C.Store.put('fabrics', item); } catch (err) { return C.toast(err.message); }
    C.renderAll(); C.closeModals();
    C.toast('Tela guardada — ya aparece en el cotizador');
  };
  return true;
}
