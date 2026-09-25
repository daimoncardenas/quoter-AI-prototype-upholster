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

  ACI = {emit,stepId,context,env,execute,isTyping,fabricPayload};
  /* También en window: las specs lo leen desde page.evaluate y la conversación lo usa por su nombre;
   * una propiedad global lo ve todo el mundo y dice en voz alta que este objeto es la superficie del
   * asistente en la página. */
  window.ACI = ACI;
  /* Y en el puente del taller: los módulos de src/ lo leen como `C.ACI`. */
  elPuenteDeLaPagina.ACI = ACI;
  return true;
}
