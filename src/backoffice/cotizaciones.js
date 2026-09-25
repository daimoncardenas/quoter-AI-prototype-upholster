/* LA LISTA DE COTIZACIONES Y SU DETALLE (src/backoffice) — la última vista del corte 3.
 *
 * Es la vista que USA a todas: la tabla con búsqueda y filtro, el visor de fotos en grande, el detalle de
 * la solicitud (con la tabla de piezas y la galería), el estado con sus comentarios y la exportación a CSV.
 * Por eso se mudó al final: cuando le tocó, ya no era un problema de estructura sino de trastear piezas
 * que ya se leen solas.
 *
 * El bloque entero vive dentro de `conectarCotizaciones(casa)`: sus ayudantes lo ven por closure y las
 * manos (los listeners de la tabla, del visor y de los comentarios) se enganchan al conectar, cuando el
 * DOM ya existe — el paquete corre en el `<head>`.
 */
import { guardarCasa, laCasa } from './casa.js';

let vista = null;   // la API que la página llama: pintar la lista, abrir una solicitud

export function pintarCotizaciones() {
  const v = vista;
  return v ? v.pintar() : false;
}

export function conectarCotizaciones(laCasaDeLaPagina) {
  guardarCasa(laCasaDeLaPagina);
  const C = laCasa();
  if (!C) return false;

    function renderQuotes(){
      const q=document.querySelector('#quoteSearch').value.toLowerCase(),f=document.querySelector('#statusFilter').value;
      const mine=me&&C.usuario().role==='seller';
      const rows=C.quotesAll().filter(r=>(!mine||C.quoteIsFor(r,me))&&(!f||r.status===f)&&
        [r.id,r.customer&&r.customer.name,r.furniture,(r.pieces||[]).map(x=>x.furniture).join(' '),r.city,C.quoteSellerName(r),r.status,r.fabricName,(r.service&&r.service.label)||''].join(' ').toLowerCase().includes(q));
      document.querySelector('#quoteRows').innerHTML=rows.map(r=>{
        const asesor=C.quoteSellerName(r),who=asesor||'Sin asignar';
        const project=C.projectLabel(r);
        return `<tr><td><strong>${C.esc(r.id)}</strong><br><small>${C.esc(C.fmtDate(r.date))}</small></td>`+
          `<td>${C.esc((r.customer&&r.customer.name)||'—')}</td>`+
          `<td>${C.esc(project)}${r.service?`<br><small>${C.esc(r.service.label)}</small>`:''}${r.fabricName?`<br><small>${C.esc(r.fabricName)}</small>`:''}</td>`+
          `<td>${C.esc(C.Store.pointName(r)||'—')}</td>`+
          `<td><span class="mini-user"><i class="mini-avatar">${C.esc(asesor?C.initialsOf(asesor):'—')}</i>${C.esc(who)}</span></td>`+
          `<td><span class="status ${statusClass(r.status)}">${C.esc(r.status)}</span></td>`+
          `<td><button class="row-action" data-quote="${C.esc(r.id)}" aria-label="Ver detalle">⋯</button></td></tr>`;
      }).join('')||'<tr><td colspan="7">No se encontraron solicitudes.</td></tr>';
    }
    document.querySelector('#quoteRows').addEventListener('click',e=>{const b=e.target.closest('[data-quote]');if(b)openQuote(b.dataset.quote)});

    let currentQuote=null;
    /* El visor de fotos: una miniatura de 118 px no deja leer una mancha ni un daño, y hasta ahora
     * el clic sobre la foto no hacía nada. Vive DENTRO del detalle de la solicitud, así que se
     * cierra solo (Esc, fondo o ×) sin llevarse el detalle, que sigue abierto debajo — el mismo
     * trato que #payModal y #confirmModal, que también se anidan. */
    let galeriaFotos=[],fotoActual=0,fotoOrigen=null;
    function renderPhoto(){
      const x=galeriaFotos[fotoActual];if(!x)return;
      const q=C.Store.get('quotes',currentQuote)||{};
      const total=(q.photoIds||[]).length||galeriaFotos.length;
      document.querySelector('#photoModalImg').src=x.f;
      document.querySelector('#photoModalImg').alt=`Fotografía ${x.i+1} de ${total} de la solicitud ${q.id||''}`.trim();
      document.querySelector('#photoModalCaption').textContent=`Fotografía ${x.i+1} de ${total} · ${(q.customer&&q.customer.name)||'Cliente'}`;
      document.querySelector('#photoCounter').textContent=`${fotoActual+1} / ${galeriaFotos.length}`;
      document.querySelector('#photoPrev').disabled=fotoActual===0;
      document.querySelector('#photoNext').disabled=fotoActual===galeriaFotos.length-1;
    }
    function openPhoto(i){
      if(!galeriaFotos.length)return;
      fotoActual=Math.max(0,Math.min(i,galeriaFotos.length-1));
      const pos=galeriaFotos[fotoActual].i;
      fotoOrigen=document.querySelector(`#quoteDetail .quote-gallery button[data-photo="${pos}"]`);
      renderPhoto();
      document.querySelector('#photoModal').classList.add('open');
      document.querySelector('#photoModal [data-close]').focus();
    }
    function closePhoto(){
      if(!document.querySelector('#photoModal').classList.contains('open'))return false;
      document.querySelector('#photoModal').classList.remove('open');
      if(fotoOrigen&&fotoOrigen.focus){fotoOrigen.focus();fotoOrigen=null}
      return true;
    }
    function moverFoto(paso){
      const siguiente=fotoActual+paso;
      if(siguiente<0||siguiente>=galeriaFotos.length)return;
      fotoActual=siguiente;renderPhoto();document.querySelector('#photoModal [data-close]').focus();
    }
    document.querySelector('#photoPrev').onclick=()=>moverFoto(-1);
    document.querySelector('#photoNext').onclick=()=>moverFoto(1);
    document.addEventListener('keydown',e=>{
      if(!document.querySelector('#photoModal').classList.contains('open'))return;
      if(e.key==='ArrowLeft'){e.preventDefault();moverFoto(-1)}
      if(e.key==='ArrowRight'){e.preventDefault();moverFoto(1)}
    });
    async function openQuote(id){
      const q=C.Store.get('quotes',id);if(!q)return;
      currentQuote=id;
      const m=q.measures,price=q.price,meters=q.meters,bill=q.billing,est=q.estimate;
      /* Lo que se le mostró al cliente: la estimación congelada con la solicitud. Una solicitud
       * vieja (o una que no llegó a estimar) cae al rango de tela, que es lo único que guardaba. */
      const rangoPesos=v=>{const a=[].concat(v||[]).map(x=>+x||0).sort((x,y)=>x-y);if(!a.length)return '—';
        return a[0]===a[a.length-1]?C.money(a[0]):`${C.money(a[0])} – ${C.money(a[a.length-1])}`};
      const plano=v=>Array.isArray(v)?v.join('/'):(v&&typeof v==='object'?JSON.stringify(v):String(v));
      // Un par [min,max] se lee mejor sin repetir cuando los dos coinciden.
      const numM=n=>String(Math.round((+n||0)*100)/100).replace('.',',');
      // El sobrante decrece cuando el consumo sube (16-15=1, pero 20-20=0), así
      // que un par puede llegar al revés. Un rango nunca se lee de mayor a menor.
      const rango=v=>{const a=[].concat(v).sort((x,y)=>x-y);return a[0]===a[a.length-1]?numM(a[0]):`${numM(a[0])}–${numM(a[a.length-1])}`};
      /* La galería respeta el ORDEN de `photoIds` y dice cuántas faltan: `C.Photos.getAll` filtra las
       * que no están y una galería más corta parecía una solicitud con menos fotos. Cada foto es un
       * botón (se abre en grande) y cada hueco dice por qué está vacío. */
      const ids=q.photoIds||(q.photoId?[q.photoId]:[]);
      const locales=await Promise.all(ids.map(id=>C.Photos.get(id)));
      /* Las fotos que viajan CON la solicitud (de la base del servidor, cada una con su ruta) son de
       * cualquier navegador: si este no tiene las suyas, se muestran ESAS — es lo que hace que una
       * solicitud subida en otro navegador no diga «no incluye fotografías». Se prefieren las locales. */
      const deLaBase=(q.photos||[]).filter(f=>f&&f.path).map(f=>f.path);
      const fotos=ids.length?locales:deLaBase;
      const conFoto=fotos.map((f,i)=>({f,i})).filter(x=>x.f);
      const faltan=Math.max(0,ids.length-conFoto.length);   // las de la base no «faltan»: no son de este navegador
      const galeria=fotos.length
        ? `<div class="quote-gallery">${fotos.map((f,i)=>f
            ? `<button type="button" data-photo="${i}" aria-label="Ver la fotografía ${i+1} de ${ids.length} en grande"><img src="${f}" alt="Fotografía ${i+1} enviada por el cliente"></button>`
            : `<div class="photo-missing">Fotografía ${i+1} · no está en este navegador</div>`).join('')}</div>`+
          (faltan?`<p class="modal-hint">${faltan} de ${ids.length} fotografías no están en este navegador (se borraron o se subieron desde otro).</p>`:'')
        : `<p class="modal-hint">Esta solicitud no incluye fotografías.</p>`;
      galeriaFotos=conFoto;
      /* LA LISTA DE PIEZAS (docs/piezas-en-la-cotizacion.md): la solicitud es de una o VARIAS, y cada una
       * llega con su mueble, su cantidad, sus medidas, su cobertura, sus fotos y su valor. Con una sola no
       * se repite: las filas de siempre ya la dicen. */
      const piezas=(q.pieces&&q.pieces.length)?q.pieces:[];
      const COBERTURA={complete:'Todo el mueble',seats:'Solo asiento y respaldo',partial:'Una parte específica'};
      const tablaPiezas=piezas.length>1?`<h3 class="modal-section">Piezas de la cotización (${piezas.length})</h3>`+
        `<div class="table-wrap"><table class="data-table" style="min-width:0"><thead><tr><th>#</th><th>Mueble</th>`+
        `<th>Cantidad</th><th>Medidas (cm)</th><th>Tapizar</th><th>Fotos</th><th>Valor</th></tr></thead><tbody>`+
        piezas.map((pz,i)=>`<tr><td>${i+1}</td><td><strong>${C.esc(pz.furniture||'—')}</strong>${pz.note?` · ${C.esc(pz.note)}`:''}</td>`+
          `<td>${C.esc(String(pz.quantity||1))}</td>`+
          `<td>${pz.measures?[pz.measures.width,pz.measures.height,pz.measures.depth].map(x=>x==null?'—':x).join(' × ')+' cm':'—'}</td>`+
          `<td>${C.esc(COBERTURA[pz.coverage]||'—')}</td><td>${C.esc(String(pz.photos||0))}</td>`+
          `<td>${Array.isArray(pz.value)?rangoPesos(pz.value):'—'}</td></tr>`).join('')+
        `</tbody></table></div>`:'';
      document.querySelector('#quoteDetail').innerHTML=
        galeria+
        tablaPiezas+
        `<div class="form-grid">`+
        [['Solicitud',q.id],['Fecha',C.fmtDate(q.date)],['Cliente',(q.customer&&q.customer.name)||'—'],
         ['Correo',(q.customer&&q.customer.email)||'—'],['Celular',(q.customer&&q.customer.phone)||'—'],
         ['Mueble',(piezas.length>1?`${piezas.length} piezas · ${piezas.map(pz=>pz.furniture).join(', ')}`:[q.furniture,q.quantityLabel].filter(Boolean).join(' · '))||'—'],
         ['Línea de servicio',(q.service&&q.service.label)||'—'],
         ['Medidas',m?`${m.width} × ${m.height} × ${m.depth} cm`:'—'],
         ['Ciudad',C.Store.pointName(q)||'—'],['Vendedor',C.quoteSellerName(q)||'Sin asignar'],
         ['Tela',q.fabricName||'—'],
         ['Modelo de cálculo',bill?(bill.modelo==='componentes'
            ? `Por piezas · rollo de ${bill.rollWidthCm} cm · ${bill.piezas} tipos de corte`
            : 'Rango base del mueble'):'—'],
         ['Consumo técnico',bill&&bill.tecnico?`${numM(bill.tecnico)} m (antes de desperdicio y margen)`:'—'],
         ['Consumo estimado',meters?`${rango(meters)} m`:'—'],
         ['Cantidad a comprar',bill?`${rango(bill.compra)} m`:'—'],
         ['Cantidad facturable',bill?`${rango(bill.facturable)} m`:'—'],
         ['Sobrante estimado',bill?`${rango(bill.sobrante)} m`:'—'],
         ['Estimación mostrada',est&&est.total?rangoPesos(est.total):(price?rangoPesos(price):'—')],
         ['Motor',est?`${est.kind||'—'} · snapshot v${est.engineVersion||1}`:'Sin snapshot: rango de tela de una solicitud vieja'],
         ['Necesidades',(q.needs&&q.needs.length?q.needs.join(', '):'—')],
         ['Estado',q.status]
        ].map(([k,v])=>`<label class="field">${C.esc(k)}<input value="${C.esc(v)}" readonly></label>`).join('')+`</div>`+
        // Las razones se congelaron con la solicitud: dicen por qué se cotizó
        // esa cantidad, aunque hoy la tela se venda de otra forma.
        (bill&&bill.razones&&bill.razones.length
          ? `<p class="quote-reasons">${C.esc(bill.razones.join(' '))}</p>` : '')+
        /* El desglose y las entradas de esa estimación: la solicitud tiene que poder explicarse
         * sola aunque el catálogo haya cambiado desde entonces. */
        (est&&est.parts&&est.parts.length
          ? `<div class="quote-estimate"><h4>Así se compuso</h4><ul>`+
            est.parts.map(p=>`<li><span>${C.esc(p.label)}</span><b>${C.esc(rangoPesos(p.value))}</b></li>`).join('')+
            `<li class="total"><span>Total mostrado al cliente</span><b>${C.esc(rangoPesos(est.total))}</b></li></ul></div>` : '')+
        (est&&est.inputs
          ? `<div class="quote-inputs"><h4>Entradas de la estimación · motor v${C.esc(est.engineVersion||1)}</h4><dl>`+
            /* CON VARIAS PIEZAS, la cuenta no se puede auditar con una sola terna: la fila «Piezas» las
             * enseña todas, con su cantidad, sus medidas y su cobertura (docs/piezas-en-la-cotizacion.md). */
            (est.inputs.piezas&&est.inputs.piezas.length>1
              ? [['Piezas',est.inputs.piezas.map((x,i)=>{
                    const mm=x.measures||{};
                    const cob={complete:'todo el mueble',seats:'solo asiento y respaldo',partial:'una parte específica'}[x.coverage||'complete'];
                    return `${i+1}) ${x.furniture||'—'}${(x.quantity||1)>1?' × '+x.quantity:''} · ${[mm.width,mm.height,mm.depth].map(v=>v==null?'—':v).join(' × ')} cm · ${cob}`;
                  }).join(' · ')]] : [])+
            [['Mueble',est.inputs.furnitureId||'—'],
             ['Cantidad',est.inputs.quantity!=null?String(est.inputs.quantity):'—'],
             ['Rango de material',rangoPesos(est.inputs.materialRange)],
             ['Tela por m²',est.inputs.fabricPerM2?`${C.money(est.inputs.fabricPerM2)} / m²`:'—'],
             ['Daños',(est.inputs.damages&&est.inputs.damages.length?est.inputs.damages.join(', '):'—')],
             ['Respuestas',(est.inputs.answers&&Object.keys(est.inputs.answers).length?Object.entries(est.inputs.answers).map(([k,v])=>`${k}: ${plano(v)}`).join(' · '):'—')],
             ['Filas BOQ',(est.inputs.boq&&est.inputs.boq.length?est.inputs.boq.map(r=>`${r.cantidad} × ${r.furniture||'—'}`).join(' · '):'—')],
             ['Calculada',est.calculatedAt||'—']]
              .map(([k,v])=>`<div><dt>${C.esc(k)}</dt><dd>${C.esc(v)}</dd></div>`).join('')+
            `</dl></div>` : '');
      document.querySelectorAll('#quoteDetail .quote-gallery button').forEach(b=>b.onclick=()=>openPhoto(+b.dataset.photo));
      renderQuoteStatus(q);
      renderQuoteComments(q);
      document.querySelector('#quoteModal').classList.add('open');
    }

    /* Nueva/En gestión/Cotizada mueven libremente, en cualquier sentido — un
     * vendedor a menudo tiene que devolver una solicitud (el cliente pidió
     * cambios después de cotizada). Cerrar el caso (Aceptada/Rechazada) solo
     * se ofrece desde Cotizada, pide confirmación porque no se puede
     * deshacer, y una vez cerrado no se ofrece ningún control: C.Store.put ya
     * lo bloquea en la capa de datos, así que esto es solo reflejar esa
     * regla en la interfaz. */
    function renderQuoteStatus(q){
      const box=document.querySelector('#quoteStatusControl');
      if(C.Store.isQuoteClosed(q)){
        // closedAt can be missing on a row that got a final status some other
        // way (a hand-edited pack, an import) — isQuoteClosed still locks it,
        // so the copy has to hold up without a date to show.
        const cuando=q.closedAt?` el ${C.esc(C.fmtDate(q.closedAt))}`:'';
        box.innerHTML=`<h3 class="modal-section">Estado</h3>`+
          `<p class="modal-hint">Este caso quedó cerrado como <strong>${C.esc(q.status)}</strong>${cuando}. El estado ya no se puede modificar.</p>`;
        return;
      }
      const pill=s=>`<button type="button" class="button ${s===q.status?'primary':'secondary'}" data-set-status="${C.esc(s)}">${C.esc(s)}</button>`;
      let html=`<h3 class="modal-section">Estado</h3><div class="save-block" style="flex-wrap:wrap">${C.Store.QUOTE_NON_FINAL_STATUSES.map(pill).join('')}</div>`;
      if(q.status==='Cotizada'){
        html+=`<p class="modal-hint" style="margin-top:12px">Esto cierra el caso y no se puede deshacer.</p>`+
          `<div class="save-block" style="flex-wrap:wrap;margin-top:8px">`+
          `<button type="button" class="button gold" data-close-status="Aceptada">Marcar como aceptada</button>`+
          `<button type="button" class="button danger" data-close-status="Rechazada">Marcar como rechazada</button></div>`;
      }
      box.innerHTML=html;
    }
    document.querySelector('#quoteStatusControl').addEventListener('click',async e=>{
      const setBtn=e.target.closest('[data-set-status]');
      const closeBtn=e.target.closest('[data-close-status]');
      if(setBtn){
        const status=setBtn.dataset.setStatus,q=C.Store.get('quotes',currentQuote);
        if(!q||status===q.status)return;
        try{C.Store.setQuoteStatus(currentQuote,status)}catch(err){return C.toast(err.message)}
        C.renderAll();openQuote(currentQuote);C.toast(`${q.id} → ${status}`);
        return;
      }
      if(closeBtn){
        const status=closeBtn.dataset.closeStatus;
        const ok=await C.askConfirm({title:'Cerrar caso',
          message:`Esto cierra el caso y no se puede deshacer. ¿Marcar esta solicitud como "${status}"?`,
          confirmText:'Sí, continuar',danger:true});
        if(!ok)return;
        let q;
        try{q=C.Store.setQuoteStatus(currentQuote,status)}catch(err){return C.toast(err.message)}
        C.renderAll();openQuote(currentQuote);C.toast(`${q.id} cerrada como ${status}`);
      }
    });

    /* Los comentarios se admiten en cualquier estado, cerrado incluido: son
     * notas del equipo sobre el caso, no parte del flujo de estado. Se listan
     * del más antiguo al más reciente y no se pueden editar ni borrar. */
    function renderQuoteComments(q){
      const list=C.Store.quoteComments(q);
      const box=document.querySelector('#quoteComments');
      box.innerHTML=`<h3 class="modal-section">Comentarios</h3>`+
        (list.length
          ? `<ul class="activity">${list.map(c=>`<li><span class="activity-icon">✎</span><div><b>${C.esc(c.author||'—')}</b><small>${C.esc(c.text)}</small></div><time>${C.esc(C.fmtDate(c.date))}</time></li>`).join('')}</ul>`
          : `<p class="modal-hint">Todavía no hay comentarios.</p>`)+
        `<form id="commentForm"><label class="field full">Agregar comentario<textarea id="commentText" placeholder="Escribe una nota para el equipo…"></textarea></label>`+
        `<div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="submit" class="button secondary">Agregar comentario</button></div></form>`;
    }
    document.querySelector('#quoteComments').addEventListener('submit',e=>{
      if(e.target.id!=='commentForm')return;
      e.preventDefault();
      const text=document.querySelector('#commentText').value.trim();
      if(!text)return C.toast('El comentario no puede quedar vacío');
      try{C.Store.addComment(currentQuote,{author:C.usuario().name,authorId:C.usuario().id,text})}catch(err){return C.toast(err.message)}
      openQuote(currentQuote);
    });

  /* La API que la página sigue llamando: pintar la lista, abrir una solicitud y cerrar el visor de
   * fotos — el cierre global del modal vive en la página y necesita poder cerrar la foto. */
  vista = { pintar: renderQuotes, abrir: openQuote, cerrarFoto: closePhoto, abrirFoto: openPhoto };

  /* La exportación a CSV vive con la lista: es la misma tabla, en un archivo. */
  const exportar = document.querySelector('#exportBtn');
  if (exportar) exportar.onclick = () => {
    const rows = C.quotesAll();
    if (!rows.length) return C.toast('No hay solicitudes para exportar');
    const cols = ['id', 'date', 'customer.name', 'customer.email', 'customer.phone', 'furniture', 'quantityLabel', 'city', 'seller', 'fabricName', 'status'];
    const val = (o, path) => { const v = path.split('.').reduce((a, k) => a == null ? a : a[k], o); return v == null ? '' : v; };
    const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => `"${String(val(r, c)).replace(/"/g, '""')}"`).join(','))).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'cotizaciones.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    C.toast('CSV exportado');
  };
  return true;
}
