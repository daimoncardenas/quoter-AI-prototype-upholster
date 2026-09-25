/* LAS TRES PREGUNTAS DE LA COMPRA (src/wizard) — la primera puerta del corte 4.
 *
 * Es con lo que ABRE el cotizador: «¿qué necesitas?» (la línea), «¿para qué?» y «¿qué sabes del
 * daño?». Se mudaron juntas porque son una sola pantalla y comparten el pintor de la grilla:
 * separarlas habría dejado tres archivos llamándose para dibujar lo mismo.
 *
 * Todo lo del taller —el estado, el motor de pasos, el catálogo— entra por `elTaller()`, que la página
 * llena en `window.CotizadorPuente`. `state` viaja por REFERENCIA: el módulo lee y escribe el mismo
 * objeto que el resto de la página.
 */
import { guardarElTaller, elTaller } from './casa.js';

let laCompra = null;   /* nombre del módulo: los top-level se pegan en un script */

export function pintarLaCompra() { const v = laCompra; return v ? v.pintarTodo() : false; }
/* Estas tres son las que la página llama cuando algo cambia: la línea, «¿para qué?» y «¿qué sabes?». */
export function pintarLaLinea() { const v = laCompra; return v ? v.pintarLinea() : false; }
export function pintarElProposito() { const v = laCompra; return v ? v.pintarProposito() : false; }
export function pintarElSaber() { const v = laCompra; return v ? v.pintarSaber() : false; }
export function conectarLaCompra(elTallerDeLaPagina) {
  guardarElTaller(elTallerDeLaPagina);
  const C = elTaller();
  if (!C) return false;
  function renderPurposeOptions(){
    C.pintarPreguntaDeLaCompra('purposeGrid',C.propositosRuta(),C.estado.proposito,p=>{
      C.estado.proposito=p.id;C.aplicarSaberPorDefecto();C.elegidoEnLaCompra();
      C.ACI.emit('ROUTE_SELECTED',{routeId:C.estado.ruta||'',purposeId:p.id,label:p.label});
    });
  }
  function renderSaberOptions(){
    C.pintarPreguntaDeLaCompra('saberGrid',C.saberesDelProposito(),(C.saberActual()||{}).id,s=>{
      C.estado.saber=s.id;C.elegidoEnLaCompra();
      C.ACI.emit('ROUTE_SELECTED',{routeId:C.estado.ruta||'',purposeId:C.estado.proposito||'',saberId:s.id,label:s.label});
    });
  }
  
  function renderServiceOptions(){
    if(!C.hasServiceStep())return;
    const grid=document.getElementById('serviceGrid');grid.innerHTML='';
    /* Una línea que OTRA usa como camino no pinta tarjeta propia: «reparación y restauración» se
     * elige dentro de mantenimiento (catálogo: `rutas` con `line`), así el paso muestra UNA tarjeta
     * donde antes había dos y el mismo oficio no se cobra por dos puertas. */
    const ofrecidas=C.serviceOptions().filter(s=>!C.serviceOptions().some(o=>(o.rutas||[]).some(r=>r.line===s.id)));
    /* Una lista de opciones, no una grilla: con 4 o con 7 líneas el paso se lee de un vistazo y
     * ocupa el panel. La nota de arriba dice cuántas incluye el plan vigente — así el salto entre
     * planes se ve en la pantalla. */
    const note=document.getElementById('servicePlanNote');
    if(note)note.textContent=`Tu plan ${C.Store.planLabel(C.Store.settings().plan)} incluye ${ofrecidas.length} líneas de servicio.`;
    /* Una columna hasta tres líneas; de cuatro en adelante, dos: así la grilla llena el panel sin
     * dejar huecos ni obligar a desplazarse. `--rows` topa el alto de las tarjetas por filas: con
     * dos líneas no quedan tarjetas de 250 px con una sola frase dentro (medido). */
    const cols = ofrecidas.length <= 3 ? 1 : 2;
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(Math.ceil(ofrecidas.length / cols)));
    ofrecidas.forEach((s,i)=>{
      const on=C.estado.service&&C.estado.service.id===s.id;
      const card=document.createElement('button');card.type='button';card.setAttribute('role','radio');
      card.className='service-choice'+(on?' selected':'');card.setAttribute('aria-checked',on?'true':'false');
      const body=document.createElement('span');
      const title=document.createElement('b');title.textContent=s.label;body.appendChild(title);
      if(s.hint){const hint=document.createElement('small');hint.textContent=s.hint;body.appendChild(hint);}
      card.appendChild(body);
      const go=document.createElement('span');go.className='go';go.textContent=on?'Elegida':'Elegir';card.appendChild(go);
      card.addEventListener('click',()=>{
        /* Solo hay algo que borrar si YA había una línea elegida: en la primera elección (página
         * recién abierta) no se toca nada — no hay declaración que pueda viajar. */
        const cambiaDeLinea=!!C.estado.service&&C.estado.service.id!==s.id;
        /* Cambiar de línea EMPIEZA DE CERO: lo declarado era de la línea anterior. */
        if(cambiaDeLinea)C.olvidarElCaso();
        C.estado.service=s;C.estado.damages=[];
        /* La ruta de la línea nueva y sus dos preguntas por defecto: volver a pulsar la misma línea no
         * cambia nada (no hay ruta vieja que borrar). */
        C.estado.ruta=null;C.estado.proposito=null;C.estado.saber=null;C.aplicarRutaPorDefecto();C.aplicarPropositoPorDefecto();
        /* Cambiar de línea EMPIEZA DE CERO (ver C.resetProjectForLine). Volver a pulsar la línea ya
         * elegida no borra nada: no hay cambio. */
        if(cambiaDeLinea)C.resetProjectForLine();
        C.applyLineCopy();renderServiceOptions();C.serviceError().hidden=true;C.nextButton().disabled=false;
        const ceja=document.getElementById('furnitureEyebrow');if(ceja)ceja.textContent=s.label;
        const motivo=document.getElementById('journeyContextLabel');if(motivo)motivo.textContent=s.label;
        /* La línea decide qué pasos existen (reparación pregunta por los daños): se recalcula aquí y
         * los daños de la línea anterior no viajan a la nueva. La estimación se rehace en el acto:
         * la línea cambia lo que se suma, y el bloque de precio ya no puede quedar con el número
         * anterior hasta que alguien entre y salga del paso. */
        C.applyOptionalSteps();C.updateEstimate();
        /* Si el cliente cambiaba la línea desde un paso que la nueva no tiene (p. ej. desde «Tu
         * mueble» a una línea que no pregunta mueble), ese paso se queda en pantalla pidiendo algo
         * que ya no existe y «Continuar» no avanza. Se vuelve al principio del recorrido nuevo. */
        if(!C.pasosVisibles().includes(C.estado.step))C.showStep(C.pasosVisibles()[0]);
        C.ACI.emit('SERVICE_SELECTED',{serviceId:s.id,label:s.label,journey:s.journey});
      });
      grid.appendChild(card);
    });
    /* El paso del mueble puede haber cambiado su ceja (líneas sin escogedor: ver aplicarElEscogedor),
     * así que el elemento se busca de nuevo y se tolera que no esté. */
    const ceja=document.getElementById('furnitureEyebrow');
    if(ceja)ceja.textContent=C.estado.service?C.estado.service.label:'Empecemos';
  }

  /* La línea decide el recorrido; estas cuatro puertas son lo que la página llama. */
  laCompra = {
    pintarTodo: renderAllOptions,
    pintarLinea: renderServiceOptions,
    pintarProposito: renderPurposeOptions,
    pintarSaber: renderSaberOptions
  };
  return true;
}
