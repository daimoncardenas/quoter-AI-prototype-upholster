/* EL BUS DE EVENTOS Y EL ADAPTADOR DEL ASISTENTE (src/app) — corte 6.
 *
 * ACI — el ÚNICO puente entre el cotizador y el cerebro del asistente (src/assistant/brain.js).
 * Hace tres cosas y nada más:
 *   1. publica los eventos del wizard como 'aci:event' {type, payload} en `window`, disparados desde
 *      los manejadores (nunca mirando el DOM a la espera);
 *   2. arma el contexto de la cotización que el asistente puede observar (context()); los datos de
 *      contacto viajan SOLO con la autorización marcada;
 *   3. aplica una acción aprobada por los MISMOS controles y eventos con los que el cliente hace clic
 *      o edita (execute()). No tiene poder extra.
 *
 * El bus lo arma `conectarElBus(...)`, que la página llama al final —necesita el DOM completo y el
 * puente del taller—, y queda en `window.ACI` y en el puente (`C.ACI`), que es como lo ven la página,
 * los módulos y las specs. See CLAUDE.md "Assistant context & actions (simulated)".
 */
import { guardarElTaller, elTaller } from '../wizard/casa.js';
import { state } from './state.js';

let ACI = null;   /* nombre del módulo: la página y las specs lo leen por su nombre (y por window.ACI) */

export function conectarElBus(elPuenteDeLaPagina) {
  guardarElTaller(elPuenteDeLaPagina);
  const C = elTaller();
  if (!C) return false;

  /* LO QUE EL CLIENTE HACE, DESDE SU PROPIO NAVEGADOR (dueño, 25/09: «AI can touch his own browser but
   * this isnt guarantee that the browser of client is push or write the same... assistant should have a
   * map where and what part is exactly in the browser of client... should have error for validations...
   * or restrictions»).
   *
   * Aquí el asistente vive en la misma página, pero la memoria de la página NO puede depender de su
   * copia del DOM: lo único que en producción viaja desde el navegador del cliente son sus EVENTOS.
   * Así que cada acción suya (tecla, clic, cambio) se anota aparte, con quién la hizo: el navegador
   * marca `isTrusted` en lo que toca una persona, y lo que escribe el asistente llega sin esa marca. */
  const hizoElCliente = [];
  const anotar = (el, quien, que) => {
    const ultimo = hizoElCliente[hizoElCliente.length - 1];
    if (ultimo && ultimo.el === el && Date.now() - ultimo.cuando < 1500) { ultimo.que = que; ultimo.cuando = Date.now(); return; }
    hizoElCliente.push({ el, cuando: Date.now(), quien, que });
    if (hizoElCliente.length > 12) hizoElCliente.shift();
  };
  const rotuloDe = el => {
    const texto = (n) => { const c = n.cloneNode(true);
      c.querySelectorAll('input,select,textarea,button,svg').forEach(x => x.remove());
      return (c.textContent || '').replace(/\s+/g, ' ').trim(); };
    if (!el) return 'un control';
    /* Las tarjetas de elección (`.service-choice`, la reja de telas…) se llaman por su título, que va
     * en la `<b>`: «eligió «Retapizado de muebles»», no «eligió un control». */
    const titulo = el.querySelector && el.querySelector('b');
    if (titulo && texto(titulo)) return texto(titulo);
    return el.getAttribute('aria-label') || (el.closest && el.closest('label') ? texto(el.closest('label')) : '')
      || el.id || el.value || 'un control';
  };
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el || !el.closest || !el.closest('.wizard-step')) return;
    anotar(el, e.isTrusted ? 'cliente' : 'asistente', `escribió «${String(el.value || '').slice(0, 30)}» en ${rotuloDe(el)}`);
  }, true);
  document.addEventListener('click', e => {
    const c = e.target && e.target.closest ? e.target.closest('.service-choice, .furniture-card, [aria-checked], #needsGrid input, #damageGrid input, .insumo-row [data-insumo]') : null;
    if (!c) return;
    anotar(c, e.isTrusted ? 'cliente' : 'asistente', `eligió «${rotuloDe(c)}»`);
  }, true);
  /* Lo último que tocó ÉL (el asistente no cuenta como el cliente) — y también lo que hizo el propio
   * asistente, para que no se confundan: la página lo dice con todas las letras. */
  const loQueHizoElCliente = (n = 4) => hizoElCliente.filter(x => x.quien === 'cliente').slice(-n)
    .map(x => ({ que: x.que, hace: Math.round((Date.now() - x.cuando) / 1000) + ' s' }));
  const loUltimoQueToco = () => {
    for (let i = hizoElCliente.length - 1; i >= 0; i--) if (hizoElCliente[i].quien === 'cliente') return hizoElCliente[i].que;
    return null;
  };

  const byId=id=>document.getElementById(id);
  const stepId=n=>(AssistantBrain.STEPS.find(s=>s.n===n)||{}).id||null;

  const emit=(type,payload={})=>{
    try{window.dispatchEvent(new CustomEvent('aci:event',{detail:{type,payload}}))}
    catch(err){console.warn('[aci] evento no publicado',type,err)}
  };
  // Typing = a text-like field of the form has focus and got a key recently.
  let lastKeyAt=-Infinity;
  const TEXTY=/^(text|number|email|tel|search)$/;
  const typingTarget=el=>!!(el&&el.closest&&el.closest('#quoteForm')&&((el.tagName==='INPUT'&&TEXTY.test(el.type))||el.tagName==='TEXTAREA'));
  document.addEventListener('keydown',e=>{if(typingTarget(e.target))lastKeyAt=performance.now()},true);
  const isTyping=()=>typingTarget(document.activeElement)&&performance.now()-lastKeyAt<1500;

  const petsBox=()=>[...document.querySelectorAll('#needsGrid input')].find(x=>/mascota/i.test(x.value))||null;
  const num=id=>{const v=+byId(id).value;return Number.isFinite(v)&&v>0?v:null};
  const selText=sel=>sel&&sel.selectedOptions[0]?sel.selectedOptions[0].text:'';
  const fabricPayload=(f,auto)=>({fabricId:f.id,name:f.name,colorName:f.colorName,color:f.color,auto:!!auto});
  // Los rangos plausibles viven en el cotizador con nombres cortos (width/depth:
  // los usa su paso 4). Aquí se publican con el mismo nombre de campo que FIELDS,
  // que es el vocabulario con el que habla el asistente.
  const rangesPayload=()=>{
    const r=C.rangosDeMedida()[state.furniture];
    return r?Object.fromEntries(Object.entries(r).map(([k,v])=>['measurements.'+k,v])):null;
  };

  function estimateSnapshot(){
    try{
      const q=C.billable();
      return {meters:[q.facMin,q.facMax],metersLabel:`${C.rangoM(q.facMin,q.facMax)} m`,priceLabel:(()=>{const p=C.linePrice(q);return p?p.totalText:null})()};
    }catch(err){return null}
  }
  function context(){
    const {min,max}=C.photoLimits();
    const pets=petsBox();
    const seats=byId('seats');
    const ctx={
      tenant:TENANT,
      currentStep:{n:state.step,id:stepId(state.step),name:(AssistantBrain.STEPS.find(s=>s.n===state.step)||{}).name},
      submitted:!!state.submitted,
      service:state.service?{id:state.service.id,label:state.service.label,journey:state.service.journey}:null,
      /* Qué pasos existen para esta línea. El asistente no debe hablar de lo que nadie preguntó
       * (dueño, 19/09: «in this wizard doesnt exist choose furniture.... however Lia has a context
       * of furniture»): donde no hay paso, el campo viaja en null — y los que lo consumen lo
       * cuentan como «no aplica», no como «sin elegir». */
      asksFurniture:C.pideMueble(),asksMeasurements:C.pideMedidas(),asksPreferences:C.pidePreferencias(),
      asksRecommendation:C.pideRecomendacion(),
      selectedFurniture:C.pideMueble()?state.furniture:null,
      // «Otro» no dice qué mueble es: la descripción del cliente es la que lo dice (y solo con esa opción).
      furnitureNote:C.pideMueble()&&C.esMuebleOtro()?byId('furnitureOther').value.trim()||null:null,
      measurements:C.pideMedidas()?{width:num('width'),height:num('height'),depth:num('depth'),
        quantity:{value:+seats.value||1,label:selText(seats)},cushions:C.cojines(),coverage:byId('coverage').value,
        // Lo que el propio cotizador considera habitual para este mueble (lo usa
        // su paso 4); el asistente lo cita, no lo inventa.
        ranges:rangesPayload()}:null,
      preferences:C.pidePreferencias()?{needs:[...document.querySelectorAll('#needsGrid input:checked')].map(x=>x.value),
        pets:pets?pets.checked:null,style:byId('style').value,color:byId('color').value,
        budget:selText(byId('budget'))}:null,
      /* Las fotos son de todas las líneas (dueño, 19/09): siempre en el contexto, con su mínimo. */
      photos:{count:state.photos.length,min,max},
      /* El presupuesto: se pregunta en Validación, en la unidad del oficio (docs/presupuesto.md). */
      budget:(()=>{const b=C.presupuestoDeclarado();return {amount:b.amount,unit:b.unit,unitLabel:b.unitLabel,declared:b.declared}})(),
      /* La atención: de dónde escribe el cliente, para dónde es el servicio y su sede. La declaran
       * todas las líneas (vive en el último paso), así que va al contexto como las fotos. */
      location:(()=>C.atencionDeclarada())(),
      /* La RAMA elegida (ruta → propósito → saber) y lo que las rutas cortas declaran (la lista, el
       * pedido anterior): sin esto el asistente no sabe qué eligió el cliente y se lo vuelve a
       * preguntar (dueño, 24/09: «the AI dont save data of customer in the interaction»). */
      ruta:state.ruta?{id:state.ruta,label:((C.rutasLine().filter(r=>r.id===state.ruta)[0]||{}).label)||state.ruta}:null,
      proposito:C.propositoActual()?{id:C.propositoActual().id,label:C.propositoActual().label}:null,
      saber:C.saberActual()?{id:C.saberActual().id,label:C.saberActual().label}:null,
      lista:C.filasDeLaLista().map(r=>{const f=C.telasActivas().filter(x=>String(x.id)===String(r.fabricId))[0]||null;
        return {fabricId:r.fabricId||null,name:f?f.name:null,colorName:f?f.colorName:null,unidad:r.unidad,valor:r.valor,metros:r.metros}}),
      order:{dicho:!!byId('pedidoBusca').value.trim(),pedido:C.pedidoBase()?{id:C.pedidoBase().id,fabricName:C.pedidoBase().fabricName}:null},
      delivery:(()=>{const f=byId('entregaField');return f&&!f.hidden?byId('entrega').value:null})(),
      /* Del contacto viaja el HECHO de estar declarado (los valores solo con la autorización,
       * unas líneas abajo): así no vuelve a pedir un correo que ya tiene. */
      contactDeclared:{name:!!byId('fullName').value.trim(),email:!!byId('email').value.trim(),phone:!!byId('phone').value.trim()},
      analysis:{done:!!state.analyzed,warnings:state.review?state.review.warnings:[],oddMeasures:state.review?state.review.oddMeasures:[]},
      fabric:C.pideRecomendacion()&&state.fabric?{id:state.fabric.id,name:state.fabric.name,colorName:state.fabric.colorName,auto:!state.fabricTouched,touched:!!state.fabricTouched}:null,
      /* Los insumos del taller que el wizard ya estime (la mano, paso 17): el contrato los cobra. */
      supplies:C.insumosMarcados(),
      /* La estimación SOLO viaja cuando el recorrido tiene lo suyo: la tela elegida a mano, los
       * insumos y la revisión hecha. Antes viajaba siempre y la conversación la soltaba antes de
       * tiempo (dueño, 24/09: «¿qué es lo que quieres cobrarme?»). */
      estimate:((!C.pideRecomendacion()||!!state.fabricTouched)&&(!C.asksInsumos()||C.insumosMarcados().length>0)&&!!state.analyzed)?estimateSnapshot():null,
      consent:byId('consent').checked
    };
    // Ley 1581: personal data only with the customer's authorization, which names the assistant.
    if(ctx.consent)ctx.contact={name:byId('fullName').value.trim(),email:byId('email').value.trim(),phone:byId('phone').value.trim()};
    return ctx;
  }

  // What the wizard allows RIGHT NOW, for AssistantBrain.validateActions().
  function env(){
    const options=sel=>[...sel.options].map(o=>({value:o.value,label:o.text}));
    const range=id=>{const el=byId(id);return {min:el.min===''?undefined:+el.min,max:el.max===''?undefined:+el.max}};
    const seatVals=[...byId('seats').options].map(o=>+o.value).filter(Number.isFinite);
    return {currentStep:state.step,submitted:!!state.submitted,fields:{
      'measurements.width':range('width'),'measurements.height':range('height'),'measurements.depth':range('depth'),
      'measurements.quantity':{min:Math.min(...seatVals),max:Math.max(...seatVals)},
      'measurements.coverage':{options:options(byId('coverage'))},
      'preferences.pets':{available:!!petsBox()},
      'preferences.style':{options:options(byId('style'))},
      'preferences.color':{options:options(byId('color'))},
      'analysis':{available:!!byId('analyzeButton')}
    }};
  }

  /* LO QUE EL CLIENTE TIENE EN PANTALLA, campo por campo (dueño, 25/09: «the AI sometimes forget fields
   * and questions… always assistant take a screenshot… should create a JSON with fields and after
   * question or lead a customer for each one until complete the section or step»).
   *
   * No es una captura: el paso VISIBLE se lee del propio formulario. Una captura sería una copia lenta
   * y borrosa de esto —y Playwright no corre dentro de la página del cliente—; el DOM es la misma
   * verdad y está fresca: un campo nuevo, movido o cambiado por un refactor aparece aquí el mismo día,
   * sin lista que mantener. Devuelve EL PASO (su número y sus preguntas) y cada control con su estado;
   * `faltan` son los que el cliente todavía no ha llenado. Best-effort: si el DOM cambiara tanto que
   * esta lectura fallara, devuelve null y el turno sigue sin ella. */
  function losCamposDelPaso(){
    try {
      const paso = document.querySelector('.wizard-step.active');
      if (!paso) return null;
      const aLaVista = el => !!el && !el.closest('[hidden]') && el.type !== 'hidden' && !el.disabled
        && (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
      const textoSin = (el) => { const c = el.cloneNode(true);
        c.querySelectorAll('input,select,textarea,button,svg').forEach(x => x.remove());
        return (c.textContent || '').replace(/\s+/g, ' ').trim(); };
      const etiquetaDe = (el) => {
        /* Las filas de las PIEZAS nombran su medida con el aria-label, que dice de qué pieza es
         * («Ancho de la pieza 2»): el rótulo de la caja, solo, se leería «Ancho» a secas. */
        if (el.closest && el.closest('.piezas-lista') && el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        const porFor = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        if (porFor) return textoSin(porFor);
        const envuelto = el.closest('label');
        if (envuelto) return textoSin(envuelto);
        return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.id || el.name || 'sin nombre';
      };
      const llenoDe = el => el.type === 'checkbox' ? el.checked : String(el.value || '').trim() !== '';
      const valorDe = el => el.type === 'checkbox' ? el.checked
        : el.tagName === 'SELECT' ? ((el.selectedOptions[0] || {}).text || '').trim() : String(el.value || '').trim();
      const campos = [];
      paso.querySelectorAll('input, select, textarea, [role="radiogroup"]').forEach(el => {
        /* Los grupos de tarjetas (la línea, la ruta, el propósito, los daños…) son UNA pregunta con sus
         * opciones, y se contestan tocando: no tienen input que leer. */
        if (el.getAttribute('role') === 'radiogroup') {
          const elegido = el.querySelector('[aria-checked="true"]');
          const rotulo = x => (x.querySelector('b') ? textoSin(x.querySelector('b')) : textoSin(x)).trim();
          campos.push({ id: el.id || 'eleccion', pregunta: el.getAttribute('aria-label') || el.id || 'elegir',
            tipo: 'eleccion', requerido: true, lleno: !!elegido, valor: elegido ? rotulo(elegido) : null,
            opciones: [...el.querySelectorAll('[aria-checked]')].map(rotulo).filter(Boolean) });
          return;
        }
        if (!aLaVista(el)) return;
        /* LOS INSUMOS DEL TALLER NO SON DEL CLIENTE (dueño, 24/09: «dont show "insumos" to client»): su
         * paso no le pregunta nada —los estima la mano—, así que sus casillas no cuentan como
         * pendientes. Sin esto el paso nunca cerraba y ella repetía su título, «¿Qué se le cambia por
         * dentro?», turno tras turno (medido en la sesión del 25/09, la cuarta). */
        if (el.closest && el.closest('#insumoStep')) return;
        const d = el.dataset || {};
        /* Las medidas por PIEZA: cada fila tiene las suyas y dos comparten instrumento («width» en la
         * pieza 1 y en la 2). El id las distingue: `pieza.<n>.<medida>` — con eso el que escribe sabe
         * en cuál fila va el número, y `pieza 1` no se confunde con `pieza 2`. */
        const fila = el.closest && el.closest('.piezas-lista .pieza-fila');
        const instrumento = (fila && d.medida)
          ? `pieza.${[...fila.parentNode.children].indexOf(fila)}.${d.medida}`
          /* Los demás controles de la fila (el mueble, la cantidad, lo que se tapiza) también llevan su
           * nombre de fila: dos filas comparten el mismo control y el que lee tiene que saber cuál es. */
          : (fila
            ? `pieza.${[...fila.parentNode.children].indexOf(fila)}.ctl${[...fila.querySelectorAll('input,select,textarea')].indexOf(el)}`
            /* Un control sin id ni data-* se nombra por su GRUPO y su valor: los seis campos de la
             * pantalla de preferencias salían todos como «campo», así que el pendiente no se podía
             * apuntar y la conversación no lo podía pedir (medido con la suite del flujo completo,
             * 25/09). Con el grupo y el valor, cada uno es único. */
            : (el.id || d.field || d.row || d.name || el.getAttribute('name')
               || (el.closest && el.closest('[id]') ? el.closest('[id]').id + ':' + String(el.value || '') : 'campo')));
        campos.push({ id: instrumento, pregunta: etiquetaDe(el),
          tipo: el.tagName === 'SELECT' ? 'lista' : (el.type || 'texto'), requerido: !!el.required,
          /* Los LÍMITES de cada control, leídos de la página: son las restricciones que el cliente
           * tiene delante (y las que el cotizador le va a hacer cumplir al pasar de paso). */
          min: el.min !== '' && el.min != null ? Number(el.min) : null,
          max: el.max !== '' && el.max != null ? Number(el.max) : null,
          lleno: llenoDe(el), valor: valorDe(el) || null,
          /* …Y SI ESTÁ LLENO PERO EL COTIZADOR NO LO ACEPTA, se dice AQUÍ: un ancho de 100 en un sofá
           * queda escrito y el «Continuar» no pasa — ese campo es el pendiente de verdad del paso, y
           * sin esto ella no lo veía y se iba a preguntar cosas de otros pasos (dueño, 25/09: «lia is
           * in disorder… dont respect the step by step»). */
          aviso: (() => {
            try {
              if (!llenoDe(el) || typeof mundoDelContrato !== 'function') return null;
              if (fila && d.medida) {
                const v = Contrato.validarValor(mundoDelContrato(), 'medidas',
                  { campo: d.medida, valor: Number(String(el.value).replace(',', '.')) });
                return v && v.ok === false ? v.motivo : null;
              }
              /* El contacto también: un celular mal escrito queda ESCRITO y el paso no cierra — sin
               * esto ella lo daba por bueno y el cliente no sabía qué le faltaba (medido con el
               * cliente robot, 25/09). */
              const deContacto = { phone: 'celular', email: 'correo', fullName: 'nombre' }[el.id];
              if (deContacto) {
                const v = Contrato.validarValor(mundoDelContrato(), 'contacto', { campo: deContacto, valor: String(el.value).trim() });
                return v && v.ok === false ? v.motivo : null;
              }
              return null;
            } catch (err) { return null; }
          })() });
      });
      /* Las fotos no son un input: son una zona con sus miniaturas (una por foto subida). */
      const zonaFotos = paso.querySelector('.photo-strip, [data-foto-pieza]');
      if (zonaFotos) {
        const miniaturas = paso.querySelectorAll('.photo-strip .photo-thumb, [data-foto-pieza] .pieza-foto-mini').length;
        campos.push({ id: 'fotos', pregunta: 'las fotos', tipo: 'fotos', requerido: false,
          lleno: miniaturas > 0, valor: miniaturas });
      }
      const titulo = textoSin(paso.querySelector('.step-heading h2') || { cloneNode: () => document.createElement('i'), textContent: '' });
      const subtitulo = textoSin(paso.querySelector('.step-heading p:not(.service-plan-note)') || { cloneNode: () => document.createElement('i'), textContent: '' });
      return { paso: +paso.dataset.step, titulo, subtitulo, campos,
        faltan: campos.filter(c => !c.lleno).map(c => c.pregunta) };
    } catch (err) { return null; }
  }

  const CONTROLS={
    'furniture.type':()=>document.querySelector('.piezas-lista .pieza-fila.en-foco .pieza-mueble')||document.querySelector('.pieza-mueble'),
    'photos':()=>document.querySelector('[data-foto-pieza]'),
    'measurements.width':()=>byId('width'),'measurements.height':()=>byId('height'),'measurements.depth':()=>byId('depth'),
    'measurements.quantity':()=>byId('seats'),'measurements.coverage':()=>byId('coverage'),
    'preferences.pets':petsBox,'preferences.style':()=>byId('style'),'preferences.color':()=>byId('color'),
    'analysis':()=>byId('analyzeButton'),
    'contact.fullName':()=>byId('fullName'),'contact.email':()=>byId('email'),'contact.phone':()=>byId('phone'),'contact.consent':()=>byId('consent')
  };
  function focusField(field){
    const el=CONTROLS[field]&&CONTROLS[field]();if(!el)return false;
    el.scrollIntoView({block:'center',behavior:'smooth'});el.focus({preventScroll:true});
    const mark=el.type==='checkbox'&&el.nextElementSibling?el.nextElementSibling:el;
    mark.classList.add('aci-highlight');setTimeout(()=>mark.classList.remove('aci-highlight'),2200);
    return true;
  }
  // Same path as the customer: a checkbox is clicked, a field gets its value plus the input/change events.
  function setField(field,value){
    const el=CONTROLS[field]&&CONTROLS[field]();if(!el)return false;
    if(el.type==='checkbox'){if(el.checked!==value)el.click();return el.checked===value}
    el.value=String(value);
    if(String(el.value)!==String(value))return false;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  // Backward only, one "← Volver" at a time, exactly as the customer would.
  function navigate(step){
    while(state.step>step){const before=state.step;C.backButton.click();if(state.step===before)return false}
    return state.step===step;
  }
  /* Runs ONE action already accepted by AssistantBrain.validateActions() (and,
   * when it needs it, confirmed by the customer). Refuses while the presence is off. */
  function execute(action){
    try{if(!C.Store.assistant().enabled)return false}catch(err){return false}
    if(action.type==='FOCUS_FIELD')return focusField(action.field);
    if(action.type==='SET_FIELD')return setField(action.field,action.value);
    if(action.type==='NAVIGATE_TO_STEP')return navigate(action.step);
    return false;
  }

  // Changes the customer makes themselves (change fires on commit, not on every key).
  // The field name published is the same one the assistant's catalogue uses
  // (`measurements.width`), not the input's id: one vocabulary for context,
  // events and actions.
  const FIELD_BY_INPUT={width:'measurements.width',height:'measurements.height',depth:'measurements.depth',seats:'measurements.quantity',cushions:'measurements.cushions',coverage:'measurements.coverage'};
  ['width','height','depth','seats','cushions','coverage'].forEach(id=>byId(id).addEventListener('change',e=>{
    emit('MEASUREMENTS_CHANGED',{field:FIELD_BY_INPUT[id]||id,value:e.target.type==='number'?num(id):e.target.value});
  }));
  document.querySelector('#needsGrid').addEventListener('change',e=>{
    if(e.target.matches('input[type=checkbox]'))emit('PREFERENCES_CHANGED',{field:'needs',option:e.target.value,checked:e.target.checked});
  });
  ['style','color','budget','city'].forEach(id=>byId(id).addEventListener('change',e=>emit('PREFERENCES_CHANGED',{field:id,value:e.target.value})));
  byId('consent').addEventListener('change',e=>emit('CONSENT_CHANGED',{checked:e.target.checked}));

  ACI = {emit,stepId,context,env,execute,isTyping,fabricPayload,losCamposDelPaso,loQueHizoElCliente,loUltimoQueToco};
  /* También en window: las specs lo leen desde page.evaluate y la conversación lo usa por su nombre;
   * una propiedad global lo ve todo el mundo y dice en voz alta que este objeto es la superficie del
   * asistente en la página. */
  window.ACI = ACI;
  /* Y en el puente del taller: los módulos de src/ lo leen como `C.ACI`. */
  elPuenteDeLaPagina.ACI = ACI;
  return true;
}
