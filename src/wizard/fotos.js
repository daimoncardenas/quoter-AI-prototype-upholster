/* LAS FOTOS DEL COTIZADOR (src/wizard) — corte 4.
 *
 * UNA sola tubería para todas las puertas de la subida: el bloque del paso (su botón y el arrastre),
 * el «+» de cada fila de pieza (piezas.js lo abre con el mismo input) y el componente de fotos de la
 * conversación, que la página llama por la misma puerta. Aquí vive: leer el archivo (data URL y
 * dimensiones reales), medir su nitidez UNA vez al cargar —la revisión la lee sin volver a tocar la
 * imagen—, marcar cada foto con la PIEZA que se estaba llenando y refrescar lo que la muestra (la fila
 * de la pieza y el aviso del paso).
 */
import { guardarElTaller, elTaller } from './casa.js';

let lasFotos = null;   /* nombre del módulo: los top-level se pegan en un script */

export function pintarLasFotos() { const v = lasFotos; return v ? v.pintar() : false; }
export function losLimitesDeLasFotos() { const v = lasFotos; return v ? v.limites() : { min: 3, max: 7 }; }
export function cargarLasFotos(files) { const v = lasFotos; return v ? v.cargar(files) : undefined; }

export function conectarLasFotos(elPuenteDeLaPagina) {
  guardarElTaller(elPuenteDeLaPagina);
  const C = elTaller();
  if (!C) return false;
  const E = C.estado;

  /* El input de archivos es el MISMO para el bloque del paso y para el «+» de cada fila. */
  const entrada = document.getElementById('furniturePhoto');
  const laZona = document.getElementById('uploadZone');
  const elAviso = document.getElementById('photoError');

  function limites() {
    const cfg = C.Store.settings();
    /* 2 FOTOS DE CADA PIEZA (dueño, 25/09: «y minimo 2 fotos de cada uno»): el mínimo es el que pide el
     * número de piezas —nunca menos que el de la configuración— y el máximo crece con ellas, para que la
     * regla se pueda cumplir. Con una sola pieza todo queda como estaba. */
    const piezas = Math.max(1, (E.piezas || []).length);
    const min = Math.max(+cfg.minPhotos || 3, 2 * piezas);
    const max = Math.max(min, +cfg.maxPhotos || 7);
    return { min, max };
  }
  function pintar() {
    const { min } = limites();
    /* Las fotos viven en la FILA de cada pieza (dueño, 25/09): aquí solo se refresca la lista y el aviso
     * —el carrete y el botón de abajo se fueron con el bloque que sobraba. */
    try { C.pintarPiezas(); } catch (err) { /* sin lista que pintar */ }
    try { C.pintarMedidasPorPieza(); } catch (err) { /* sin fichas */ }
    const mini = document.getElementById('summaryPhoto');
    if (mini) mini.style.backgroundImage = E.photos.length ? `url(${E.photos[0].dataUrl})` : '';
    if (E.photos.length >= min) elAviso.hidden = true;
  }
  function readImage(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = e => {
        const probe = new Image();
        // Keep the real dimensions: step 4 reports what we can actually measure.
        probe.onload = () => resolve({ dataUrl: e.target.result, width: probe.naturalWidth, height: probe.naturalHeight, bytes: file.size });
        probe.onerror = () => resolve(null);
        probe.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  /* Cuán nítida es una foto: la varianza del laplaciano sobre el gris —la medida clásica de «fuera de
   * foco»—, sobre una muestra de 480 px de ancho. Un borde duro la sube; una foto movida o desenfocada
   * la deja baja, y no depende del modelo de visión: es aritmética sobre los píxeles.
   * Calibración (medida en las pruebas, 900×650): nítida ≈ 2000 · desenfoque leve ≈ 80 · plano ≈ 0. */
  async function medirNitidez(dataUrl) {
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      const ancho = Math.min(480, img.naturalWidth || img.width || 480);
      const alto = Math.max(1, Math.round(ancho * ((img.naturalHeight || img.height || ancho) / Math.max(1, img.naturalWidth || img.width || ancho))));
      const cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
      const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, ancho, alto);
      const d = cx.getImageData(0, 0, ancho, alto).data, g = new Float32Array(ancho * alto);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let s = 0, s2 = 0, n = 0;
      for (let y = 1; y < alto - 1; y++) for (let x = 1; x < ancho - 1; x++) {
        const i = y * ancho + x, lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - ancho] - g[i + ancho];
        s += lap; s2 += lap * lap; n++;
      }
      if (!n) return null;
      const media = s / n;
      return Math.round(s2 / n - media * media);
    } catch (e) { return null; }
  }
  async function cargar(files) {
    const { max } = limites();
    const imagenes = [...files || []].filter(f => f && f.type.startsWith('image/'));
    if (!imagenes.length) return;
    const hueco = max - E.photos.length;
    if (hueco <= 0) {
      elAviso.textContent = `Ya alcanzaste el máximo de ${max} fotos. Quita alguna para agregar otra.`;
      elAviso.hidden = false; return;
    }
    const nuevas = (await Promise.all(imagenes.slice(0, hueco).map(readImage))).filter(Boolean);
    /* La nitidez se mide UNA vez, al cargar: la revisión la lee sin volver a tocar la imagen. Y cada foto
     * queda marcada con la PIEZA que se estaba llenando (dueño, 25/09: «y minimo 2 fotos de cada uno»). */
    for (const ph of nuevas) { ph.pieza = C.piezaEnFoco ? C.piezaEnFoco().id : null; ph.nitidez = await medirNitidez(ph.dataUrl); }
    E.photos = E.photos.concat(nuevas);
    if (imagenes.length > hueco) {
      elAviso.textContent = `Solo agregamos ${hueco} ${hueco === 1 ? 'foto' : 'fotos'}: el máximo es ${max}.`;
      elAviso.hidden = false;
    }
    pintar();
    C.ACI.emit('PHOTOS_CHANGED', { count: E.photos.length });
  }

  /* El botón del bloque (solo en las líneas sin mueble) y el «+» de cada fila abren el mismo selector. */
  document.getElementById('selectPhoto').addEventListener('click', () => entrada.click());
  entrada.addEventListener('change', () => { cargar(entrada.files); entrada.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => laZona.addEventListener(ev, e => { e.preventDefault(); laZona.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(ev => laZona.addEventListener(ev, e => { e.preventDefault(); laZona.classList.remove('dragging'); if (ev === 'drop') cargar(e.dataTransfer.files); }));

  lasFotos = { pintar, limites, cargar };
  return true;
}
