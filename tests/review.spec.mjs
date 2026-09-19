import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openWizard } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
const BIG = ['1','2','3'].map(n=>new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);   // 1200x900
const SMALL = BIG.slice(0,2).concat(new URL('./fixture-sofa-baja.png', import.meta.url).pathname); // una de 463x259
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const b = await chromium.launch(); const page = await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));

async function review({photo, furniture, w, h, d}) {
  await page.goto(D+'index.html');
  await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
  await openWizard(page, D);
  if (furniture) await page.click(`.furniture-card[data-furniture="${furniture}"]`);
  await page.setInputFiles('#furniturePhoto', photo);
  await page.waitForFunction(()=>state.photos.length>=3);
  await page.click('#nextButton');
  /* Desde que el paso de Medidas NO deja seguir con una medida fuera de lo habitual, un caso
   * imposible no llega a la revisión por el camino normal: se inyecta la cifra y se salta al paso,
   * que es la única forma de comprobar que la revisión sigue viendo lo que entró por otra puerta
   * (los rangos del backoffice cambian bajo los pies del cliente, por ejemplo). */
  await page.evaluate(({w,h,d}) => {
    document.getElementById('width').value = String(w);
    document.getElementById('height').value = String(h);
    document.getElementById('depth').value = String(d);
    const s = document.querySelector('.wizard-step[data-brain="REVIEW"]');
    showStep(+s.dataset.step);
  }, {w,h,d});
  await page.click('#analyzeButton');
  await page.waitForFunction(()=>state.analyzed);
  return {
    title: await page.textContent('#analysisTitle'),
    items: await page.$$eval('#analysisChecks > div', els => els.map(e => ({
      warn: e.classList.contains('warn'),
      title: e.querySelector('b').textContent,
      detail: e.querySelector('small').textContent
    })))
  };
}

console.log('\nUna captura de pago (463x259) entre las fotos del mueble');
const r1 = await review({photo: SMALL, furniture:'Sofá', w:210, h:85, d:90});
check('no longer claims the image is a sofa',
  r1.items.some(i => /compatible con la categoría|tipo de mueble coherente/i.test(i.title + i.detail)), false);
check('flags the low resolution it can actually measure', r1.items[0].warn, true);
check('nombra cuántas y la menor medida real',
  r1.items[0].detail.includes('463×259') && r1.items[0].detail.startsWith('1 '), true);
check('title admits there are observations', r1.title, 'Revisión lista, con observaciones');

console.log('\nA usable photo (1200x900) with plausible sofa measurements');
const r2 = await review({photo: BIG, furniture:'Sofá', w:210, h:85, d:90});
check('photo check passes', r2.items[0].warn, false);
check('measurements check passes', r2.items[1].warn, false);
check('clean title', r2.title, 'Revisión lista');

console.log('\nA usable photo with an implausible width for a sofa (20 cm)');
const r3 = await review({photo: BIG, furniture:'Sofá', w:20, h:85, d:90});
check('flags the measurement, not the image', [r3.items[0].warn, r3.items[1].warn], [false, true]);
check('names which measurement is off', r3.items[1].detail.includes('ancho'), true);

console.log('\nThe same 20 cm width is fine for a Silla');
const r4 = await review({photo: BIG, furniture:'Silla', w:45, h:95, d:50});
check('ranges are per furniture type', r4.items[1].warn, false);

/* ---- La revisión MIRA la foto y la relaciona con lo declarado (IA local) ----
 * El arnés es un LanguageModel de mentira que devuelve la frase que le pidamos y apunta lo que
 * recibe: así se comprueba que la foto viaja de verdad y que lo declarado viaja con ella. */
/* El paseo hasta la revisión, con la foto puesta y las medidas dentro: lo comparten los arneses. */
async function hastaLaRevision(p){
  await p.goto(D + 'index.html');
  await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await openWizard(p, D);
  await p.click('.furniture-card[data-furniture="Sofá"]');
  await p.setInputFiles('#furniturePhoto', BIG);
  await p.waitForFunction(() => state.photos.length >= 3);
  await p.click('#nextButton');
  await p.evaluate(() => {
    document.getElementById('width').value = '210';
    document.getElementById('height').value = '85';
    document.getElementById('depth').value = '90';
    const s = document.querySelector('.wizard-step[data-brain="REVIEW"]');
    showStep(+s.dataset.step);
  });
  await p.click('#analyzeButton');
  await p.waitForFunction(() => state.analyzed);
}

async function conModelo(frase){
  const p = await b.newPage(); p.on('pageerror', e => errs.push('ojos: ' + e));
  await p.addInitScript((f) => {
    Object.defineProperty(window, 'isSecureContext', { value: true });   // el navegador del cliente
    window.__pedido = null; window.__sistema = ''; window.__esperados = null;
    window.LanguageModel = {
      availability: async () => 'available',
      create: async (opciones) => {
        window.__sistema = (opciones.initialPrompts || []).map(x => x.content).join('\n');
        window.__esperados = opciones.expectedInputs || null;
        return { prompt: async (mensajes) => {
          /* Tan estricto como la API de verdad: mensajes con `role` y `content`, y cada parte con
           * `type` y `value`. Un stub permisivo dejó pasar una petición mal formada y la cazó el
           * navegador del dueño (19/09: «Failed to read the 'content' property from
           * 'LanguageModelMessage'»). Ahora la caza el arnés, aquí. */
          if (!Array.isArray(mensajes) || !mensajes.every(m => m && m.role && Array.isArray(m.content)
              && m.content.every(part => part && part.type && 'value' in part)))
            throw new Error("Failed to read the 'content' property from 'LanguageModelMessage': Required member is undefined.");
          window.__pedido = mensajes;
          return f;
        }, destroy(){} };
      }
    };
  }, frase);
  await hastaLaRevision(p);
  return p;
}

console.log('\nLA REVISIÓN MIRA LA FOTO (IA LOCAL) Y LA RELACIONA CON LO DECLARADO');
{
  const p = await conModelo('{"veMueble": true, "frase": "Veo un sofá de dos puestos tapizado en tela clara, con los brazos gastados."}');
  await p.waitForFunction(() => /sofá de dos puestos/.test(document.getElementById('visionNote').innerText), null, {timeout: 5000}).catch(()=>{});
  const fila = await p.innerText('#visionNote').catch(() => '');
  const partes = await p.evaluate(() => (window.__pedido || []).flatMap(m => m.content).map(x => ({
    tipo: x && x.type, clase: x && x.value && x.value.constructor && x.value.constructor.name,
    tam: x && x.value && x.value.size, texto: x && x.type === 'text' ? String(x.value) : '' })));
  check('con modelo, la revisión dice lo que ve en la foto', fila.includes('sofá de dos puestos'), true);
  /* El color dice LO QUE DICE LA MIRADA, no que la tubería funcionó: con el mueble a la vista, verde. */
  check('y con el mueble a la vista, la fila va en verde (sin aviso)',
    await p.evaluate(() => document.querySelector('#visionNote > div').classList.contains('warn')), false);
  /* La forma que exige la API: mensajes con role y content (el error que cazó el navegador del
   * dueño el 19/09 venía de mandar las partes sueltas). */
  check('y la petición va en mensajes con role y content, no en partes sueltas',
    await p.evaluate(() => Array.isArray(window.__pedido)
      && window.__pedido.every(m => m.role === 'user' && Array.isArray(m.content))), true);
  check('y la foto llegó al modelo, no una pregunta a ciegas',
    partes.some(x => x.tipo === 'image' && x.clase === 'Blob' && x.tam > 0), true);
  check('y el navegador sabe que va a mirar una imagen (expectedInputs)',
    await p.evaluate(() => (window.__esperados || []).some(x => x.type === 'image')), true);
  /* Lo declarado viaja en el carácter de la mirada: es el «related with another information» del dueño. */
  const sistema = await p.evaluate(() => window.__sistema);
  /* Lo que viaja son LAS MISMAS filas que el cliente ve en la tarjeta, ni una versión distinta:
   * se leen del DOM y se comprueba que todas están en el carácter de la mirada. */
  const declarado = await p.evaluate(() => [...document.querySelectorAll('#aiSummary dl>div')]
    .map(d => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent));
  check('y lo declarado en el cotizador viaja entero con la mirada',
    declarado.length > 0 && declarado.every(x => sistema.includes('- ' + x)), true);
  check('y la mirada va firmada por ella, no como juicio de la casa', /lía/i.test(fila), true);
  await p.close();
}
{
  /* Una descripción que no nombra el motivo ni el negocio —«hay algo claro junto a una ventana»— SÍ se
   * muestra: la regla del tema es del chat (responder a una pregunta), no de una descripción. */
  const p = await conModelo('{"veMueble": true, "frase": "Hay algo claro junto a una ventana."}');
  await p.waitForFunction(() => /junto a una ventana/.test(document.getElementById('visionNote').innerText), null, {timeout: 5000}).catch(()=>{});
  check('una descripción que no nombra el motivo se muestra igual (la regla del tema es del chat)',
    (await p.innerText('#visionNote')).includes('junto a una ventana'), true);
  await p.close();
}
{
  const p = await conModelo('{"veMueble": true, "frase": "Te lo dejo con garantía de un año y te lo entrego en 5 días hábiles."}');
  /* Se espera al DESENLACE de verdad: la fila pintada y ya sin «Mirando tu foto» (una fila oculta
   * tiene innerText vacío y haría pasar este wait antes de tiempo). */
  await p.waitForFunction(() => { const v = document.getElementById('visionNote');
    return !v.hidden && !/Mirando tus fotos/.test(v.innerText); }, null, {timeout: 8000}).catch(()=>{});
  const fila = await p.innerText('#visionNote').catch(() => '');
  check('una mirada que promete NO se muestra al cliente', fila.includes('garantía'), false);
  check('y la fila dice que miró pero que eso no se puede mostrar (no una línea vacía)',
    fila.includes('no se puede mostrar aquí'), true);
  await p.close();
}
{
  const p = await b.newPage(); p.on('pageerror', e => errs.push('sin ojos: ' + e));
  await p.addInitScript(() => { delete window.LanguageModel; if (window.ai) delete window.ai.languageModel; });
  await p.goto(D + 'index.html');
  await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await openWizard(p, D);
  await p.click('.furniture-card[data-furniture="Sofá"]');
  await p.setInputFiles('#furniturePhoto', BIG);
  await p.waitForFunction(() => state.photos.length >= 3);
  await p.click('#nextButton');
  await p.evaluate(() => {
    document.getElementById('width').value = '210';
    document.getElementById('height').value = '85';
    document.getElementById('depth').value = '90';
    const s = document.querySelector('.wizard-step[data-brain="REVIEW"]');
    showStep(+s.dataset.step);
  });
  await p.click('#analyzeButton');
  await p.waitForFunction(() => state.analyzed);
  await p.waitForTimeout(600);
  check('sin modelo, la revisión no finge ojos',
    await p.evaluate(() => document.getElementById('visionNote').hidden), true);
  /* Sin modelo el aviso no prometía nada: no se le añade la coletilla del equipo. */
  check('y el aviso se queda como estaba (no hablaba de la mirada)',
    await p.evaluate(() => /no está activada/.test(document.getElementById('reviewNotice').textContent)), false);
  await p.close();
}

{
  /* Un documento en vez de un mueble: la mirada lo dice tal cual — y la fila va en ÁMBAR, porque no
   * es un visto bueno: es una observación que el cliente tiene que ver. */
  const p = await conModelo('{"veMueble": false, "frase": "Veo un documento con texto, no un mueble: no puedo decir nada del mueble declarado."}');
  await p.waitForFunction(() => /documento/.test(document.getElementById('visionNote').innerText), null, {timeout: 5000}).catch(()=>{});
  const fila = await p.innerText('#visionNote').catch(() => '');
  check('una foto que no es el mueble se dice tal cual', fila.includes('documento'), true);
  check('y sin mueble en la foto la fila va en ámbar, no en verde',
    await p.evaluate(() => document.querySelector('#visionNote > div').classList.contains('warn')), true);
  check('y sigue sin bloquear nada ni contar como observación de la revisión',
    [/lía/i.test(fila), await p.evaluate(() => state.review.warnings.length)], [true, 0]);
  await p.close();
}
{
  /* Mientras mira —con un modelo de verdad son segundos— tiene que verse que está pasando. */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('mirando: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async () => 'available',
      create: async () => ({ prompt: async (mensajes) => {
        if (!Array.isArray(mensajes) || !mensajes.every(m => m && m.role && Array.isArray(m.content)))
          throw new Error("Failed to read the 'content' property from 'LanguageModelMessage': Required member is undefined.");
        await new Promise(r => setTimeout(r, 900));
        return '{"veMueble": true, "frase": "Veo un sofá claro con los brazos gastados."}';
      }, destroy(){} }) };
  });
  await hastaLaRevision(p);
  await p.waitForFunction(() => !!document.querySelector('#visionNote .mirada-espera'), null, {timeout: 6000}).catch(()=>{});
  check('mientras mira, la fila lo dice con su señal de espera',
    await p.evaluate(() => !!document.querySelector('#visionNote .mirada-espera')), true);
  /* Con movimiento de verdad —barra que barre y giro del icono—: una imagen quieta no se lee como
   * que algo está pasando. Se comprueba por estilo computado, no porque el elemento exista. */
  check('y la espera se mueve (barra y giro con animación real, no una imagen quieta)',
    await p.evaluate(() => { const b = document.querySelector('#visionNote .mirada-espera');
      const g = document.querySelector('#visionNote .mirada-gira');
      if (!b || !g) return null; const sb = getComputedStyle(b, '::before'); const sg = getComputedStyle(g);
      return [sb.animationName, sb.animationIterationCount, sg.animationName]; }),
    ['mirada-barra', 'infinite', 'mirada-giro']);
  /* Y «Continuar» espera: el paso no se cierra con una foto que la IA todavía está mirando. */
  check('mientras la IA mira, «Continuar» está desactivado',
    await p.evaluate(() => document.getElementById('nextButton').disabled), true);
  check('y si el paso se intenta cerrar igual, lo dice en vez de dejarlo pasar',
    await p.evaluate(() => { const antes = state.step; const paso = validStep();
      return [paso, state.step === antes, /sigue analizando/.test(document.getElementById('analysisError').textContent)]; }),
    [false, true, true]);
  await p.waitForFunction(() => /sofá claro/.test(document.getElementById('visionNote').innerText), null, {timeout: 8000}).catch(()=>{});
  check('y la señal se va cuando llega la mirada',
    await p.evaluate(() => [!!document.querySelector('#visionNote .mirada-espera'), !!document.querySelector('#visionNote .mirada-gira')]), [false, false]);
  check('y al terminar, «Continuar» vuelve solo (y el aviso se retira)',
    await p.evaluate(() => [document.getElementById('nextButton').disabled, document.getElementById('analysisError').hidden]),
    [false, true]);
  await p.close();
}
{
  /* Un modelo que NO acepta imágenes —el caso del dueño, 19/09—: la fila lo dice. No se fingen ojos,
   * pero tampoco se deja al cliente sin saber qué pasó con su foto. */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('sin imagen: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async () => 'available',
      create: async () => { throw new Error('este equipo no sabe mirar imágenes'); } };
  });
  await hastaLaRevision(p);
  check('aun contestando al instante, la espera se ve un momento (piso de espera, como en el chat)',
    await p.waitForFunction(() => !!document.querySelector('#visionNote .mirada-espera'), null, {timeout: 400})
      .then(() => true).catch(() => false), true);
  await p.waitForFunction(() => /no puedo mirar la fotografía/.test(document.getElementById('visionNote').innerText), null, {timeout: 8000}).catch(()=>{});
  check('un modelo que no acepta imágenes no finge ojos, pero la fila lo dice',
    /En este equipo no puedo mirar la fotografía/.test(await p.innerText('#visionNote')), true);
  /* Y el aviso no puede prometer una mirada que no va a llegar. */
  check('y el aviso de la tarjeta aclara que en este equipo la mirada no está activada',
    await p.evaluate(() => /no está activada/.test(document.getElementById('reviewNotice').textContent)), true);
  await p.close();
}
{
  /* El navegador ACEPTA la sesión y RECHAZA la imagen al pedirla — el caso medido el 19/09. La fila
   * lo dice igual: el cliente tiene que ver qué pasó con su foto (sin fingir que se miró). */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('imagen rechazada: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async () => 'available',
      create: async () => ({ prompt: async () => { throw new DOMException('image input is not supported', 'NotSupportedError'); }, destroy(){} }) };
  });
  await hastaLaRevision(p);
  await p.waitForFunction(() => /no puedo mirar la fotografía/.test(document.getElementById('visionNote').innerText), null, {timeout: 8000}).catch(()=>{});
  check('si el navegador rechaza la imagen al mirar, la fila lo dice igual (sin fingir la mirada)',
    /En este equipo no puedo mirar la fotografía/.test(await p.innerText('#visionNote')), true);
  await p.close();
}
{
  /* La capacidad está declarada y la mirada se cae por otra razón: la fila lo dice, no se calla.
   * (La sonda consume la primera llamada del modelo: la de ella responde; la mirada es la segunda.) */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('mirada caída: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    let llamadas = 0;
    window.LanguageModel = { availability: async () => 'available',
      create: async () => ({ prompt: async () => { if (++llamadas === 1) return 'ok'; throw new Error('se cayó al mirar'); }, destroy(){} }) };
  });
  await hastaLaRevision(p);
  await p.waitForFunction(() => /no pude/i.test(document.getElementById('visionNote').innerText), null, {timeout: 5000}).catch(()=>{});
  const fila = await p.innerText('#visionNote').catch(() => '');
  check('cuando la mirada se cae por otra razón, la fila lo dice en vez de callarse',
    /No pude mirar la fotografía/.test(fila), true);
  await p.close();
}

{
  /* El equipo TIENE la variante de imagen y NO está descargada: no se baja sola (son gigas y una
   * cotización no puede costar eso) y tampoco se finge la mirada. El navegador lo dice con
   * availability({expectedInputs:[{type:'image'}]}) === 'downloadable'. */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('por descargar: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async (o) => (o && o.expectedInputs) ? 'downloadable' : 'available',
      create: async () => ({ prompt: async () => 'no debería llegar aquí', destroy(){} }) };
  });
  await hastaLaRevision(p);
  await p.waitForFunction(() => /no puedo mirar la fotografía/.test(document.getElementById('visionNote').innerText), null, {timeout: 8000}).catch(()=>{});
  check('si la variante de imagen está sin descargar, no se baja sola y la fila lo dice',
    /no puedo mirar la fotografía/.test(await p.innerText('#visionNote')), true);
  check('y el aviso de la tarjeta lo dice igual',
    await p.evaluate(() => /no está activada/.test(document.getElementById('reviewNotice').textContent)), true);
  await p.close();
}

/* ---- El documento en sus manos mientras el sistema trabaja (dueño, 19/09) ----
 * «Lia at this moment can have a document on her hands.. and simulate read these documents… is
 * white.. is simulating while the bar progressive and loading animation is working at the same
 * time.... when exist response then come back to normal behaviour».
 *
 * La pose de lectura se aplica y se DESHACE dentro del cuadro (como la de sentarse), así que
 * desde fuera de la capa solo se puede comprobar lo que ella publica: data-reading, cuánto mide
 * la hoja dibujada (data-sheet-px), a qué distancia queda cada muñeca de su borde
 * (data-sheet-gap), cuánto baja la cara (data-sheet-head) y de qué color es el papel
 * (data-sheet-color). El modelo de mentira TARDA a propósito: la espera es lo que se mira. */
console.log('\nMIENTRAS MIRA LA FOTO, ELLA LEE SU DOCUMENTO');
{
  const p = await b.newPage(); p.on('pageerror', e => errs.push('hoja: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async () => 'available',
      create: async () => ({ prompt: async () => {
        await new Promise(r => setTimeout(r, 2500));   // la mirada tarda: se mira MIENTRAS
        return '{"veMueble": true, "frase": "Veo un sofá de dos puestos tapizado en tela clara."}'; }, destroy(){} }) };
  });
  await p.goto(D + 'index.html');
  await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  /* Sin saludo de bienvenida: mientras el saludo está en pantalla ella mira al cliente
   * (`state='talking'`), y eso taparía la mirada de la lectura en una prueba de 8 segundos. */
  await p.evaluate(() => Store.markAssistantWelcomed());
  await openWizard(p, D);
  /* La capa 3D tarda en levantar (modelos + WebGL): sin esperarla, la prueba mediría el
   * atributo que todavía no existe — pasó, y el fallo se veía como tres checks raros. */
  await p.waitForFunction(() => document.querySelector('#assistantStage')?.dataset.pose === 'standing', null, { timeout: 15000 });
  await p.click('.furniture-card[data-furniture="Sofá"]');
  await p.setInputFiles('#furniturePhoto', BIG);
  await p.waitForFunction(() => state.photos.length >= 3);
  await p.click('#nextButton');
  await p.evaluate(() => {
    document.getElementById('width').value = '210';
    document.getElementById('height').value = '85';
    document.getElementById('depth').value = '90';
    const s = document.querySelector('.wizard-step[data-brain="REVIEW"]');
    showStep(+s.dataset.step);
  });
  const antes = await p.evaluate(() => { const st = document.getElementById('assistantStage').dataset;
    return { reading: st.reading, px: st.sheetPx }; });
  check('sin nada corriendo, no hay documento en las manos (ni se finge uno)',
    [antes.reading, antes.px], ['off', '']);
  await p.click('#analyzeButton');
  /* La mirada (y con ella la hoja) arranca cuando el repaso local termina, ~1,2 s después del
   * clic; el modelo de mentira tarda 2,5 s más. Se mira a los 2,6 s: la hoja ya está levantada
   * y la cara ya bajó (la pose se levanta en ~0,6 s). */
  await p.waitForTimeout(2600);
  const mientras = await p.evaluate(() => { const st = document.getElementById('assistantStage').dataset;
    const [w, h] = (st.sheetPx || '0x0').split('x').map(Number);
    const [l, r] = (st.sheetGap || '1|1').split('|').map(Number);
    return { reading: st.reading, w, h, l, r, head: Number(st.sheetHead), color: st.sheetColor,
      manos: st.sheetHands, mid: st.sheetMid, mira: st.lookSrc, z: st.sheetWristz, tipsx: st.sheetTipsx, dedos: st.sheetFingers,
      /* El botón de revisar no sirve para esto: el paso se vuelve a pintar cuando la mirada
       * termina y desaparece del DOM (por eso se lee la bandera de la app). */
      analizando: mirandoFoto }; });
  check('mientras la mirada corre, ella sostiene el documento y lo lee',
    [mientras.reading, mientras.analizando], ['on', true]);
  /* El papel es un blanco cálido, no #ffffff: con las luces de la escena un albedo puro satura en
   * blanco en todas las caras y el pliegue no se ve (por eso la textura y el tono). Lo que se exige
   * es que sea un blanco (casi sin tinte) y que se dibuje con tamaño de verdad. */
  const c = parseInt((mientras.color || '#000000').slice(1), 16);
  const rgb = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  check('el papel es blanco y se dibuja con tamaño de verdad (no un punto)',
    [Math.min(...rgb) > 0xd0, Math.max(...rgb) - Math.min(...rgb) < 0x20, mientras.w >= 16, mientras.h >= 22],
    [true, true, true, true]);
  /* Menos de 7 cm de la muñeca al canto: la manopla de este rig mide ~4 cm, así que ese es el
   * «agarre» real — con el papel en media carta (20x28 px) las manos pesan en la lectura. */
  check('las dos manos están en los bordes de la hoja, a la misma altura y a menos de un palmo',
    [mientras.l < 0.07, mientras.r < 0.07, Math.abs(mientras.l - mientras.r) < 0.03], [true, true, true]);
  /* El agarre SE VE: las manos van por delante del plano del papel y los dedos quedan sobre su
   * cara (el dueño lo pidió con la captura: «the hands dont catch the sheet»). A este tamaño
   * (26 px de ancho) lo que se lee es la silueta, así que esto es lo que se exige. */
  const agarre = mientras.z.split('|').map(Number);
  const puntas = (mientras.tipsx || '0|0').split('|').map(Number);
  const munecasX = (mientras.manos || '').split('|').map(t => Math.abs(Number(t.split(',')[0])));
  check('y las manos van POR DELANTE del papel, con las muñecas en sus cantos (el agarre que se ve)',
    [agarre[0] > 0.005, agarre[1] > 0.005,
     munecasX[0] > 0.04, munecasX[0] < 0.10, munecasX[1] > 0.04, munecasX[1] < 0.10],
    [true, true, true, true, true, true]);
  /* Y las puntas quedan EN LOS BORDES, no juntas en el medio: con las manos cruzadas al centro el
   * gesto deja de leerse como sostener (visto en una captura: «clasped in the middle»). Las diez
   * puntas se cuentan sólo si caen por delante del papel; la banda es 3–10 cm la más adentro y
   * 8–14 cm la más afuera, con el canto del papel a 10.5 cm (medido en vivo: 0.049–0.069 la más
   * adentro según el cuadro, y 0.002–0.016 cuando las manos se cruzaban al medio). */
  check('los dedos quedan en los bordes de la hoja, sin cruzarse al medio',
    [puntas.length === 2, puntas[0] >= 0.005, puntas[0] <= 0.09, puntas[1] >= 0.03, puntas[1] <= 0.12],
    [true, true, true, true, true]);
  /* 8–30°: el dueño pidió dos veces bajar la cara («too down still») y con 0.30 rad quedan ~13°.
   * El piso del rango se movió con el ángulo — el fallo de la corrida anterior fue exactamente
   * dejar el umbral viejo (15°) mientras cambiaba la pose: al cambiar un número, grepear los
   * specs que lo citan. */
  check('y la cara baja hacia el papel (sin clavarla en el pecho: entre 8 y 30 grados)',
    [mientras.head >= 8, mientras.head <= 30], [true, true]);
  check('la hoja cuelga del punto medio de las manos, no de un supuesto',
    await p.evaluate(() => { const st = document.getElementById('assistantStage').dataset;
      const num = t => t.split(',').map(Number);
      const [ml, mr] = (st.sheetHands || '').split('|').map(num), mid = num(st.sheetMid || '0,0,0');
      const medio = [(ml[0] + mr[0]) / 2, (ml[1] + mr[1]) / 2, (ml[2] + mr[2]) / 2];
      return Math.abs(mid[0] - medio[0]) < 0.02 && Math.abs(mid[1] - medio[1]) < 0.03; }), true);
  /* Se espera al FIN de la mirada (`mirandoFoto`), no al del repaso local: ANALYSIS_COMPLETED
   * sale 1,2 s después del clic y la mirada todavía no había empezado. */
  await p.waitForFunction(() => state.analyzed && !mirandoFoto, null, { timeout: 12000 }).catch(() => {});
  await p.waitForTimeout(1200);    // el peso de la pose se deja en ~0,6 s
  const despues = await p.evaluate(() => { const st = document.getElementById('assistantStage').dataset;
    return { reading: st.reading, px: st.sheetPx, gap: st.sheetGap, head: st.sheetHead }; });
  check('cuando llega la respuesta, el documento se guarda y vuelve a su pose',
    [despues.reading, despues.px, despues.gap, despues.head], ['off', '', '', '']);
  await p.close();
}

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'none'));
console.log(fails?`\n${fails} FAILING`:'\nALL PASS');
await b.close(); process.exit(fails?1:0);
