/* EL AVISO BREVE (src/ui): el «toast» que confirma que algo pasó.
 *
 * Uno solo a la vez —el mismo aviso no se apila, se refresca— y se va solo. Si la página no trae el
 * elemento `#toast`, no se rompe: se calla (un aviso no es razón para tumbar una pantalla).
 */
const TIEMPO = 2400;
let reloj = null;

export function mostrar(texto, tiempo) {
  const el = document.querySelector('#toast');
  if (!el) return false;
  el.textContent = String(texto === undefined || texto === null ? '' : texto);
  el.classList.add('show');
  clearTimeout(reloj);
  reloj = setTimeout(() => el.classList.remove('show'), Number(tiempo) > 0 ? Number(tiempo) : TIEMPO);
  return true;
}

export function esconder() {
  const el = document.querySelector('#toast');
  if (!el) return false;
  clearTimeout(reloj);
  el.classList.remove('show');
  return true;
}
