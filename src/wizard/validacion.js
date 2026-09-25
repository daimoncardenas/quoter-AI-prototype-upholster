/* EL MOTOR DE VALIDACIÓN (src/wizard) — corte 4.
 *
 * Qué le falta a cada paso y por qué «Continuar» no avanza: una frase por tropiezo —nada de burbujas
 * del navegador—, el foco puesto en el campo que falta y el aviso escrito por ella (decirError).
 * Corre en cada pulsación de «Continuar» (la página la llama por su puerta) y las specs la llaman
 * por `evaluate`; devuelve true cuando el paso puede cerrarse.
 *
 * Vive aquí y no dentro de un paso porque los mira TODOS: la línea, el mueble y sus fotos con su
 * mínimo por pieza, los daños, la lista, el pedido anterior, las medidas por pieza, la revisión y su
 * mirada en curso, el contacto y las preguntas del catálogo.
 */
import { guardarElTaller, elTaller } from './casa.js';
import { estasMirando } from './revision.js';

let laValidacion = null;   /* nombre del módulo: los top-level se pegan en un script */

export function correrLaValidacion() { const v = laValidacion; if (v) return v.pasos(); }

export function conectarLaValidacion(elPuenteDeLaPagina) {
  guardarElTaller(elPuenteDeLaPagina);
  const C = elTaller();
  if (!C) return false;
  const E = C.estado;

  function validStep(){
    if(E.step===0){
      if(!E.service){
        C.decirError(C.serviceError(),'Elige qué quieres hacer para continuar.',null);document.getElementById('serviceGrid').scrollIntoView({behavior:'smooth',block:'center'});return false}}
    if(E.step===1){
      /* CADA FILA NECESITA SU MUEBLE: con varias piezas, la que esté sin elegir tiene su propio aviso y el
       * foco se va a ella (dueño, 25/09: la cotización es una lista; ninguna fila se queda a medias). */
      const sinMueble=(E.piezas||[]).find(p=>!p.furniture);
      if(sinMueble){
        const i=(E.piezas||[]).indexOf(sinMueble);
        if(i>=0&&i!==E.piezaEnFoco&&typeof C.enfocarPieza==='function')C.enfocarPieza(i);
        const err=document.getElementById('furnitureOtherError');
        C.decirError(err,(E.piezas||[]).length>1?`Elige el mueble de la pieza ${i+1} para continuar.`:'Elige el mueble para continuar.',null);
        const sel=document.querySelector('.piezas-lista .pieza-fila.en-foco .pieza-mueble');
        if(sel)sel.focus({preventScroll:true});
        err.scrollIntoView({behavior:'smooth',block:'center'});
        return false;
      }
      if(C.esMuebleOtro()&&!document.getElementById('furnitureOther').value.trim()){
        const err=document.getElementById('furnitureOtherError');
        C.decirError(err,'Cuéntanos cuál es el mueble para continuar: «Otro» no dice qué hay que tapizar.','furnitureOther');
        document.getElementById('furnitureOther').focus({preventScroll:true});
        document.getElementById('furnitureOtherField').scrollIntoView({behavior:'smooth',block:'center'});
        return false}}
    /* Las fotos se piden SIEMPRE: en el paso que las aloje para esta línea (el del mueble, o el
     * primero en las que no preguntan mueble). Va DESPUÉS del bloque del mueble y sin cortar: el paso
     * del mueble también las exige (un `return true` ahí las saltaba). */
    const anfitrion=C.pasoAnfitrionDeLaSubida();
    if(anfitrion&&E.step===+anfitrion.dataset.step){
      const {min}=C.photoLimits();
      if(E.photos.length<min){
        const faltan=min-E.photos.length;
        C.decirError(C.photoError,`Agrega ${faltan} ${faltan===1?'foto más':'fotos más'}: necesitamos al menos ${min}.`,'uploadZone');C.uploadZone.scrollIntoView({behavior:'smooth',block:'center'});return false}
      /* Y CADA PIEZA con las suyas: mínimo 2 por pieza (dueño, 25/09: «y minimo 2 fotos de cada uno»). El
       * aviso dice CUÁL falta y lleva el foco a esa pieza, que es la que está llenando el cliente. */
      const sinFotos=C.lasPiezasSinSusFotos();
      if(sinFotos.length){
        const p=sinFotos[0], suyas=C.fotosDeLaPieza(p).length, faltan=2-suyas;
        const i=(E.piezas||[]).indexOf(p);
        if(i>=0&&i!==E.piezaEnFoco){ try{ C.enfocarPieza(i); }catch(err){ /* sin pieza que enfocar */ } }
        C.decirError(C.photoError,`A ${C.etiquetaDeLaPieza(p)} le ${faltan===1?'falta 1 foto':'faltan '+faltan+' fotos'}: cada pieza lleva mínimo 2.`,'uploadZone');
        C.uploadZone.scrollIntoView({behavior:'smooth',block:'center'});return false}}
    if(E.step===2){
      if(!C.damageIds().length){
        C.decirError(C.damageError,C.damageError.textContent,'damageGrid');document.getElementById('damageGrid').scrollIntoView({behavior:'smooth',block:'center'});return false}}
    /* La lista no avanza sin lo que esa intención necesita: la cantidad —o, si la tela se conoce y la
     * cantidad la calcula el motor, la referencia—. */
    /* La recomendación donde se eligen VARIAS telas: sin ninguna elegida no se pasa, y una elegida sin
     * su cantidad tampoco — el aviso dice CUÁL falta (el dueño: «you cant pass if dont choose some
     * fabric... and if some fabric dont have cantidad... then show alert for this»). */
    if(E.step===14&&C.esVariasTelas()){
      const err=document.getElementById('recoError');
      const elegidas=[...document.querySelectorAll('#fabricGrid .fabric-card.selected')].map(c=>c.dataset.fabric);
      if(!elegidas.length){
        C.decirError(err,'Elige al menos una tela para continuar.','fabricGrid');
        document.getElementById('fabricGrid').scrollIntoView({behavior:'smooth',block:'center'});
        return false;
      }
      const sinCantidad=elegidas.filter(id=>{const f=C.filaDeLaListaPor(id);
        return !(Number(f&&f.querySelector('.list-metros')&&f.querySelector('.list-metros').value)||0)});
      if(sinCantidad.length){
        const nombres=sinCantidad.map(id=>{const f=C.telasActivas().filter(x=>String(x.id)===String(id))[0];
          return f?`${f.name} · ${f.colorName}`:id;});
        C.decirError(err,`Dile cuánto necesitas de ${nombres.join(', ')} para continuar.`,'fabricGrid');
        document.getElementById('fabricGrid').scrollIntoView({behavior:'smooth',block:'center'});
        return false;
      }
      if(err)err.hidden=true;
    }
    if(E.step===20&&!((C.esIntencionTela()?C.filasDeLaLista().length:C.leerLaLista().length))){
      const err=document.getElementById('listError');
      err.textContent=C.esIntencionTela()
        ?'Elige la tela para calcular cuántos metros necesita tu mueble.'
        :'Agrega al menos una referencia con su cantidad para calcular tu estimación.';
      C.decirError(err,err.textContent,'listRows');
      err.scrollIntoView({behavior:'smooth',block:'center'});return false}
    /* El pedido anterior no avanza sin decir CUÁL: sin número ni referencia el asesor no tiene qué
     * buscar y el faltante queda sin base. No se exige que aparezca aquí —el que no está en este
     * navegador lo busca un asesor— pero sí que se diga cuál es. */
    if(E.step===21){
      const busca=document.getElementById('pedidoBusca');
      const dicho=String((busca&&busca.value)||'').trim();
      if(!dicho){
        const err=document.getElementById('pedidoError');
        C.decirError(err,'Escribe el número de la solicitud o la referencia del pedido que vas a completar.','pedidoBusca');
        if(busca)busca.scrollIntoView({behavior:'smooth',block:'center'});return false}
    }
    const idPaso=C.ACI.stepId(E.step);
    if(idPaso==='MEASUREMENTS'){
      /* Nada de burbujas del navegador (salen en el idioma del sistema y sin su voz): cada tropiezo
       * tiene su frase y la dice ella. */
      const NOMBRE_MEDIDA={width:'ancho',height:'alto',depth:'fondo'};
      const fields=['width','height','depth'].map(id=>document.getElementById(id));
      const vacia=fields.find(x=>!x.value);
      if(vacia){const err=document.getElementById('measureError');
        C.decirError(err,`Me falta el ${NOMBRE_MEDIDA[vacia.id]} del mueble: sin las tres medidas no puedo calcular la tela.`,vacia.id);
        vacia.focus({preventScroll:true});err.scrollIntoView({behavior:'smooth',block:'center'});return false}
      /* CADA PIEZA CON SUS TRES MEDIDAS: con varias piezas no se pasa dejando una a medias (dueño, 25/09:
       * «esas medidas dependen de esa cotizacion» — y cada pieza tiene las suyas). El aviso dice cuál falta
       * y el foco se va a esa pieza, que es la que el cliente tiene que medir. */
      const sinMedidas=(E.piezas||[]).find(p=>p.furniture&&!(String(p.medidas.width||'').trim()&&String(p.medidas.height||'').trim()&&String(p.medidas.depth||'').trim()));
      if(sinMedidas){
        const err=document.getElementById('measureError'), i=(E.piezas||[]).indexOf(sinMedidas);
        if(i>=0&&i!==E.piezaEnFoco){ C.enfocarPieza(i); }
        C.decirError(err,`Faltan las medidas de ${C.etiquetaDeLaPieza(sinMedidas)}: ancho, alto y fondo.`,null);
        document.getElementById('width').focus({preventScroll:true});
        err.scrollIntoView({behavior:'smooth',block:'center'});return false}
      const imposible=fields.find(x=>!x.checkValidity());
      if(imposible){const err=document.getElementById('measureError');
        C.decirError(err,`El ${NOMBRE_MEDIDA[imposible.id]} de ${imposible.value} cm no es una medida posible: va de ${imposible.min} a ${imposible.max} cm.`,imposible.id);
        imposible.focus({preventScroll:true});err.scrollIntoView({behavior:'smooth',block:'center'});return false}
      const fuera=C.medidasMuyFueraDeLoHabitual();
      if(fuera.length){
        const err=document.getElementById('measureError');
        C.decirError(err,C.textoMedidasFuera(fuera),fuera[0].id);
        document.getElementById(fuera[0].id).focus({preventScroll:true});
        err.scrollIntoView({behavior:'smooth',block:'center'});
        return false}}
    if(idPaso==='REVIEW'&&!E.analyzed){const err=document.getElementById('analysisError');C.decirError(err,err.textContent,'analyzeButton');err.scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('analyzeButton').focus();return false}
    /* Mientras la IA mira la fotografía, el paso no deja pasar: lo que se está revisando todavía no
     * está. (El botón se desactiva al empezar y vuelve solo al terminar; esto es el cinturón.) */
    if(idPaso==='REVIEW'&&estasMirando()){const err=document.getElementById('analysisError');C.decirError(err,`Un momento: ${C.asistenteCfg().enabled?C.asistenteCfg().name:'la IA local'} sigue analizando tu fotografía. Puedes continuar cuando termine.`);err.scrollIntoView({behavior:'smooth',block:'center'});return false}
    if(idPaso==='CONTACT'){
      /* El último paso también habla: cada campo que falta tiene su frase, y ninguna burbuja del
       * navegador en inglés. */
      const err=document.getElementById('contactError');
      /* La atención, primero: es el orden de la pantalla (ciudad del cliente, del servicio y sede). */
      for(const id of ['customerCity','serviceCity']){
        const sel=document.getElementById(id);if(!sel)continue;
        const otro=id==='customerCity'?'en qué ciudad estás':'para qué ciudad es el servicio';
        let falta=null;
        if(sel.value==='__otra__'){const t=document.getElementById(id+'Other');
          if(!t||!t.value.trim())falta={el:t||sel,frase:`Necesito saber ${otro}: escríbela en el campo.`}}
        else if(!sel.value)falta={el:sel,frase:`Necesito saber ${otro}: elige una ciudad para continuar.`};
        if(falta){C.decirError(err,falta.frase,falta.el.id);if(falta.el.focus)falta.el.focus({preventScroll:true});falta.el.scrollIntoView({behavior:'smooth',block:'center'});return false}}
      /* La sede no bloquea: el campo viene con la principal elegida y «Otra ciudad» es una respuesta
       * legítima (sin punto y sin vendedor asignado, que es lo que ya sabía hacer la solicitud). */
      E.atencionDeclarada=true;   // el cliente vio la atención y siguió: queda declarada
      const nombre=document.getElementById('fullName'),correo=document.getElementById('email'),
            celular=document.getElementById('phone'),autoriza=document.getElementById('consent');
      const qué=!nombre.value.trim()?'nombre'
        :!correo.value.trim()?'correoSin'
        :!correo.checkValidity()?'correoMal'
        :!celular.value.trim()?'celularSin'
        :(celular.value.match(/\d/g)||[]).length<7?'celularMal'
        :!autoriza.checked?'autorizacion':null;
      if(qué){
        const dicho={
          nombre:'Necesito tu nombre para enviarte la pre-cotización.',
          correoSin:'Necesito tu correo: ahí te llega la copia de tu pre-cotización.',
          correoMal:'Ese correo no tiene forma de correo: revísalo y te mando la copia.',
          celularSin:'Me falta tu celular: un asesor te escribe por ahí.',
          celularMal:'Ese celular no tiene pinta de celular: escríbelo como 300 123 4567.',
          autorizacion:'Marca la autorización: sin ella no puedo usar tus datos ni que un asesor te contacte.',
        }[qué];
        const campoEl={nombre:nombre,correoSin:correo,correoMal:correo,celularSin:celular,celularMal:celular,autorizacion:autoriza}[qué];
        C.decirError(err,dicho,campoEl);
        campoEl.focus({preventScroll:true});
        err.scrollIntoView({behavior:'smooth',block:'center'});
        return false}
    }
    /* Un paso de pregunta valida lo que su spec declara: los campos numéricos dentro de su rango y
     * las filas del BOQ con al menos una pieza. Los chips son opcionales (no marcar también es una
     * respuesta: «solo limpieza», «decorativo»). */
    const sec=C.steps.find(x=>x.classList.contains('active'));
    if(sec&&sec.dataset.ask){
      const spec=C.Store.askSpec(sec.dataset.ask),err=sec.querySelector('[data-ask-error]');
      const fuera=(spec.groups||[]).filter(g=>g.type==='fields').some(g=>(g.fields||[]).some(f=>{
        const el=sec.querySelector(`[data-field="${f.id}"]`),v=+el.value;
        return !(v>=f.min&&v<=f.max);
      }));
      const rows=sec.querySelector('[data-rows]');
      const sinPiezas=!!rows&&!C.askAnswers(sec.dataset.ask).rows.length;
      if(fuera||sinPiezas){
        const campo=fuera?sec.querySelector('[data-field]'):sec.querySelector('[data-rows]');
        C.decirError(err,fuera?'Revisa las medidas: cada campo tiene su rango.':'Agrega al menos una pieza con su cantidad.',campo);sec.scrollIntoView({behavior:'smooth',block:'center'});return false;
      }
    }
    return true;
  }

  laValidacion = { pasos: validStep };
  return true;
}
