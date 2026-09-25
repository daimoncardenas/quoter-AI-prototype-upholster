/* EL MODAL DE CONFIRMACIÓN (src/ui).
 *
 * Un solo confirm dentro de la app —reemplaza a los `confirm()` del navegador, que no se pueden pintar
 * con la marca— con la misma marca que los demás modales (`.modal-backdrop/.modal/...`) para que los dos
 * modos de color funcionen gratis. Devuelve una promesa, así el sitio que llama se lee como el viejo
 * `if(!confirm(...))return`.
 *
 * Este módulo es el DUEÑO del modal de confirmación: los botones (OK, Cancelar, ×), el fondo, Escape y el
 * foco (Tab no se escapa del diálogo) los maneja él. La página deja de tocarlo — así no hay dos manos
 * sobre el mismo modal, que es de donde salen los cierres que no cierran.
 */
/* El `$` de la página ya existe y en el paquete todo es un script: los ayudantes llevan nombre propio. */
const elModal = sel => document.querySelector(sel);

let abierto = null;          // { resolve, disparador } mientras hay uno abierto

function atraparTab(e) {
  if (e.key !== 'Tab') return;
  const botones = Array.from(document.querySelectorAll('#confirmModal button:not([disabled])'));
  if (!botones.length) return;
  e.preventDefault();
  let i = botones.indexOf(document.activeElement);
  if (i < 0) i = 0;
  i = (i + (e.shiftKey ? -1 : 1) + botones.length) % botones.length;
  botones[i].focus();
}

/* Cierra el que esté abierto. Lo llama quien pregunta (botón, ×, fondo, Escape) y también la página cuando
 * cierra TODOS los modales: una promesa sin resolver dejaría al que llamó esperando para siempre. */
export function resolver(valor) {
  if (!abierto) return false;
  const { resolve, disparador } = abierto;
  abierto = null;
  document.removeEventListener('keydown', atraparTab, true);
  const modal = elModal('#confirmModal');
  if (modal) modal.classList.remove('open');
  resolve(!!valor);
  if (disparador && typeof disparador.focus === 'function') disparador.focus();
  return true;
}

export function hayConfirmAbierto() { return !!abierto; }

export function confirmar(opciones) {
  const o = opciones || {};
  if (abierto) return Promise.resolve(false);          // nunca dos diálogos a la vez
  const modal = elModal('#confirmModal');
  if (!modal) {                                        // sin modal en la página: se contesta que no
    return Promise.resolve(window.confirm ? window.confirm(o.message || '') : false);
  }
  const disparador = document.activeElement;
  elModal('#confirmModalTitle').textContent = o.title || 'Confirmar';
  elModal('#confirmModalBody').textContent = o.message || '';
  const ok = elModal('#confirmOk');
  ok.textContent = o.confirmText || (o.danger ? 'Sí, continuar' : 'Confirmar');
  ok.className = 'button ' + (o.danger ? 'danger' : 'primary');
  elModal('#confirmCancel').textContent = o.cancelText || 'Cancelar';
  modal.classList.add('open');
  document.addEventListener('keydown', atraparTab, true);
  ok.focus();
  return new Promise(resolve => { abierto = { resolve, disparador }; });
}

/* Se engancha UNA vez: los botones, el fondo y Escape. */
export function engancharConfirmacion() {
  const modal = elModal('#confirmModal');
  if (!modal || modal.dataset.uiEnganchado) return false;
  modal.dataset.uiEnganchado = '1';
  const ok = elModal('#confirmOk');
  if (ok) ok.addEventListener('click', () => resolver(true));
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => resolver(false)));
  modal.addEventListener('click', e => { if (e.target === modal) resolver(false); });   // el fondo
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !abierto) return;
    e.stopPropagation();
    resolver(false);
  }, true);
  return true;
}

/* Cerrar cualquier modal abierto (los demás son de la página; aquí solo se sueltan los suyos). */
export function cerrarTodos() {
  document.querySelectorAll('.modal-backdrop').forEach(x => x.classList.remove('open'));
  resolver(false);
  const focus = document.activeElement;
  if (focus && focus.blur) focus.blur();
}
