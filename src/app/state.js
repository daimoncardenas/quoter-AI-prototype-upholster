/* EL ESTADO DEL COTIZADOR (src/app) — corte 6.
 *
 * Lo que sostiene todo lo demás: el wizard (los módulos de src/wizard/), el bus de eventos del
 * asistente (events.js) y la conversación leen y escriben ESTE objeto, por referencia. Nace con lo
 * justo: el paso, la línea, el mueble y lo que la conversación va declarando.
 */
export const state = {step:1,furniture:'',furnitureNote:'',photos:[],analyzed:false,fabric:null,fabricTouched:false,service:null,damages:[],ruta:null,proposito:null,saber:null};
/* Con lo que nace el cotizador: cambiar de línea devuelve el mueble a este valor (y a la primera
 * tarjeta, que es la que renderFurnitureOptions marca) — el paquete puede no llamarlo «Sofá». */
export const FURNITURE_INICIAL = state.furniture;
