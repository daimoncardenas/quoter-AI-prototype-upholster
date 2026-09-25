/* EL TEMA: los nombres canónicos de las variables y su lectura/escritura en caliente.
 *
 * El generador ya escribe el bloque `:root` de cada página con las variables del paquete
 * (`tools/generate.mjs` → `themeCssVars`). Este módulo no lo reemplaza: es la puerta para LEERLAS desde el
 * código (sin adivinar el nombre de una variable) y para REESCRIBIRLAS cuando algo las cambia — que hoy es
 * el panel «Configuración de estilos» del backoffice.
 *
 * El motor de marca que hace ese cambio en caliente (`Brand`, dentro de `store.js`) se muda aquí en su
 * propio corte, cuando `store.js` se modularice: moverlo antes obligaría a copiar media docena de ayudas
 * que todavía viven allá y que son las que evitan el parpadeo en la primera pintura.
 */
export const VARIABLES = {
  accent: '--accent',
  accentContrast: '--accent-contrast',
  ink: '--ink',
  inkSecondary: '--ink-secondary',
  muted: '--muted',
  line: '--line',
  bg: '--bg',
  surface: '--surface',
  shadow: '--shadow',
  fontBody: '--font-body',
  fontHeading: '--font-heading',
  rgbAccent: '--rgb-accent',
  rgbShadow: '--rgb-shadow'
};

const raiz = () => (typeof document === 'undefined' ? null : document.documentElement);

/* Lo que vale una variable AHORA (lo que se ve), no lo que decía el paquete. */
export function leer(nombre) {
  const r = raiz();
  if (!r) return '';
  const varName = VARIABLES[nombre] || (String(nombre).startsWith('--') ? nombre : '--' + nombre);
  return (getComputedStyle(r).getPropertyValue(varName) || '').trim();
}

/* Todas juntas, para pintar o comparar. */
export function leerTodas() {
  const salida = {};
  Object.keys(VARIABLES).forEach(k => { salida[k] = leer(k); });
  return salida;
}

/* Escribir en caliente: gana sobre lo que el generador dejó en el `:root`. */
export function aplicar(mapa) {
  const r = raiz();
  if (!r) return false;
  let toco = false;
  Object.keys(mapa || {}).forEach(k => {
    const varName = VARIABLES[k] || (String(k).startsWith('--') ? k : '--' + k);
    const valor = mapa[k];
    if (valor === null || valor === undefined || valor === '') { r.style.removeProperty(varName); return; }
    r.style.setProperty(varName, String(valor));
    toco = true;
  });
  return toco;
}

/* Volver a lo del paquete: quitar lo escrito a mano deja valer otra vez el `:root` del generador. */
export function restaurar(nombres) {
  return aplicar((nombres || Object.keys(VARIABLES)).reduce((acc, k) => { acc[k] = ''; return acc; }, {}));
}
