import { chromium } from 'playwright';
const D = 'file://' + process.cwd() + '/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const b = await chromium.launch();
const errs = [];
const newSession = async () => {                       // sessionStorage is per context
  const ctx = await b.newContext(); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(D + 'admin.html'); return p;
};
// localStorage is partitioned per browser context, so anything written as one
// user must be read back in that same context.
const signOut = async p => { await p.click('#logoutBtn'); await p.waitForSelector('#loginScreen:not([hidden])'); };
const signIn = async (p, email, pw='mediterranea') => {
  await p.fill('#loginEmail', email); await p.fill('#loginPassword', pw); await p.click('#loginSubmit');
  await p.waitForTimeout(350);
};

console.log('\nEL BACKOFFICE NO SE ABRE SIN SESIÓN');
let p = await newSession();
check('arranca en la pantalla de login', await p.isVisible('#loginScreen'), true);
check('y la aplicación no se ve', await p.isVisible('#appShell'), false);
check('el overlay realmente tapa: el nav no es alcanzable',
  await p.isVisible('button[data-page="fabrics"]'), false);

console.log('\nCREDENCIALES INCORRECTAS');
await signIn(p, 'maria@mediterraneacol.com', 'incorrecta');
check('no entra', await p.isVisible('#appShell'), false);
check('avisa sin revelar qué mitad falló', await p.textContent('#loginError'), 'Correo o contraseña incorrectos');
await signIn(p, 'noexiste@mediterraneacol.com', 'mediterranea');
check('mismo mensaje para un correo inexistente', await p.textContent('#loginError'), 'Correo o contraseña incorrectos');

console.log('\nADMIN VE TODO');
await signIn(p, 'maria@mediterraneacol.com');
check('entra', await p.isVisible('#appShell'), true);
check('el login desaparece', await p.isVisible('#loginScreen'), false);
check('ve las siete secciones',
  await p.$$eval('.nav button', bs => bs.filter(x=>!x.hidden).map(x=>x.dataset.page)),
  ['dashboard','quotes','fabrics','furniture','sellers','points','settings']);
check('el topbar muestra quién es', await p.textContent('#meName'), 'María Camila Restrepo');
check('y su rol', await p.textContent('#meRole'), 'Administradora');
check('ve todas las cotizaciones', await p.evaluate(()=>document.querySelectorAll('#quoteRows tr').length), 6);

console.log('\nVENDEDORA SOLO VE LO SUYO');
const p2 = await newSession();
await signIn(p2, 'laura@mediterraneacol.com');
check('entra', await p2.isVisible('#appShell'), true);
check('solo ve resumen y cotizaciones',
  await p2.$$eval('.nav button', bs => bs.filter(x=>!x.hidden).map(x=>x.dataset.page)),
  ['dashboard','quotes']);
check('catálogo, muebles, vendedores, puntos y configuración quedan fuera',
  await p2.$$eval('.nav button', bs => bs.filter(x=>x.hidden).map(x=>x.dataset.page)),
  ['fabrics','furniture','sellers','points','settings']);
await p2.click('button[data-page="quotes"]');
const rows = await p2.textContent('#quoteRows');
check('la tabla trae solo sus solicitudes', await p2.evaluate(()=>document.querySelectorAll('#quoteRows tr').length), 1);
check('y son las asignadas a ella', rows.includes('Laura Méndez') && !rows.includes('Paula Gómez'), true);
check('el contador del resumen también está filtrado', await p2.textContent('#statTotal'), '1');
check('no puede exportar', await p2.isVisible('#exportBtn'), false);

console.log('\nSALIR CIERRA LA SESIÓN');
await p2.click('#logoutBtn');
await p2.waitForSelector('#loginScreen:not([hidden])');
check('vuelve al login', await p2.isVisible('#loginScreen'), true);
check('y la sesión quedó vacía', await p2.evaluate(()=>sessionStorage.getItem('med.v1.session')), null);

console.log('\nUNA CUENTA DESACTIVADA NO ENTRA');
check('el seed no deja vendedores pausados con la cuenta abierta',
  await p.evaluate(()=>Store.all('sellers').filter(v=>!v.active)
    .filter(v=>(Store.all('users').find(u=>String(u.sellerId)===String(v.id))||{}).active)
    .map(v=>v.name)), []);
await signOut(p);
await signIn(p, 'daniel@mediterraneacol.com');
check('lo dice explícitamente', await p.textContent('#loginError'), 'Esta cuenta está desactivada');
check('y no entra', await p.isVisible('#appShell'), false);

console.log('\nUN VENDEDOR NUEVO RECIBE CUENTA');
await signIn(p, 'maria@mediterraneacol.com');
await p.click('button[data-page="sellers"]');
await p.click('#newSeller');
await p.fill('#sellerForm [name=name]','Sofía Ramírez');
await p.fill('#sellerForm [name=email]','sofia@mediterraneacol.com');
await p.check('#sellerPointChecks input[value="sp-patio-bonito"]');
await p.check('#sellerPointChecks input[value="sp-cali"]');
await p.click('#sellerForm button.primary');
await p.waitForTimeout(400);
check('se le crea usuario de vendedor',
  await p.evaluate(()=>{const u=Store.all('users').find(x=>x.email==='sofia@mediterraneacol.com');return u?u.role:'sin usuario'}),
  'seller');
await signOut(p);
await signIn(p, 'sofia@mediterraneacol.com');
check('y puede entrar con la contraseña de demo', await p.isVisible('#appShell'), true);
check('con permisos de vendedora',
  await p.$$eval('.nav button', bs => bs.filter(x=>!x.hidden).map(x=>x.dataset.page)), ['dashboard','quotes']);

console.log('\nPAUSAR A UN VENDEDOR LE QUITA EL ACCESO');
await signOut(p);
await signIn(p, 'maria@mediterraneacol.com');
await p.click('button[data-page="sellers"]');
const sofiaId = await p.evaluate(()=>Store.all('sellers').find(v=>v.name==='Sofía Ramírez').id);
await p.click(`[data-toggle-seller="${sofiaId}"]`);
await p.waitForTimeout(250);
check('el vendedor queda pausado',
  await p.evaluate(id=>Store.get('sellers',id).active, sofiaId), false);
check('y su cuenta se cierra con él',
  await p.evaluate(()=>Store.all('users').find(u=>u.email==='sofia@mediterraneacol.com').active), false);
check('la ficha lo dice, no solo que no recibe asignaciones',
  (await p.textContent('#sellerGrid')).includes('Pausado · sin acceso'), true);
await signOut(p);
await signIn(p, 'sofia@mediterraneacol.com');
check('ya no entra', await p.isVisible('#appShell'), false);
check('y sabe por qué', await p.textContent('#loginError'), 'Esta cuenta está desactivada');

console.log('\nREACTIVARLO LE DEVUELVE EL ACCESO');
await signIn(p, 'maria@mediterraneacol.com');
await p.click('button[data-page="sellers"]');
await p.click(`[data-toggle-seller="${sofiaId}"]`);
await p.waitForTimeout(250);
await signOut(p);
await signIn(p, 'sofia@mediterraneacol.com');
check('vuelve a entrar', await p.isVisible('#appShell'), true);
await signOut(p);
await signIn(p, 'maria@mediterraneacol.com');

console.log('\nEL AVISO DE PROTOTIPO ACOMPAÑA TODA LA SESIÓN');
check('la barra está también dentro del backoffice, no solo en el login',
  await p.isVisible('#demoBanner'), true);
check('queda fija al pie', await p.evaluate(()=>{
  const r=document.getElementById('demoBanner').getBoundingClientRect();
  return getComputedStyle(document.getElementById('demoBanner')).position==='fixed'
      && Math.abs(r.bottom-innerHeight)<1;}), true);
check('aclara que no es el sitio oficial y de quién es el diseño', await (async()=>{
  const t=await p.textContent('#demoBanner');
  return ['Prototipo demostrativo','no es la página oficial de Mediterránea',
          'evaluación privada','no protege información','Hecho por Daimon Cardenas']
    .every(x=>t.includes(x));})(), true);
check('la autoría va en su propio bloque, no enterrada en la frase',
  (await p.textContent('.demo-author')).trim(), 'Hecho por Daimon Cardenas');
check('y también en los metadatos del archivo',
  await p.evaluate(()=>document.querySelector('meta[name=author]').content), 'Daimon Cardenas');
check('la marca de agua NO aparece en pantalla',
  await p.evaluate(()=>getComputedStyle(document.body,'::after').backgroundImage), 'none');
check('y no expone credenciales: se envían aparte con la propuesta', await (async()=>{
  const t=await p.textContent('#demoBanner');
  return !/@mediterraneacol\.com/.test(t) && !t.includes(await p.evaluate(()=>Auth.DEMO_PASSWORD));})(), true);
check('su alto real alimenta los desplazamientos', await p.evaluate(()=>{
  const h=getComputedStyle(document.documentElement).getPropertyValue('--banner-h').trim();
  return h===document.getElementById('demoBanner').offsetHeight+'px';}), true);
check('no tapa ningún control', await p.evaluate(()=>{
  const bn=document.getElementById('demoBanner').getBoundingClientRect();
  return [...document.querySelectorAll('button:not([hidden]),a,input,select')]
    .filter(el=>{const x=el.getBoundingClientRect();
      return x.width&&x.height&&x.bottom>bn.top&&x.top<bn.bottom&&!el.closest('.demo-banner');}).length;}), 0);

console.log('\nEDITAR UN VENDEDOR: SUS DATOS, SU CUENTA Y SU HISTORIAL');
const pe = await newSession();
await signIn(pe, 'maria@mediterraneacol.com');
// Un punto nuevo, creado antes de tocar al vendedor, para probar que se puede
// sumar cobertura que la ficha todavía no tenía.
await pe.click('button[data-page="points"]');
await pe.click('#newPoint');
await pe.fill('#pointForm [name=name]', 'Sopó');
await pe.fill('#pointForm [name=city]', 'Sopó');
await pe.click('#pointForm button.primary');
const sopoId = await pe.evaluate(()=>Store.all('servicePoints').find(p=>p.name==='Sopó').id);
await pe.click('button[data-page="sellers"]');
check('cada vendedor ofrece editar sus datos, no solo pausarlo',
  await pe.evaluate(()=>document.querySelectorAll('#sellerGrid [data-edit-seller]').length),
  await pe.evaluate(()=>Store.all('sellers').length));
await pe.click('[data-edit-seller="1"]');   // Laura Méndez
check('el modal abre en modo edición', await pe.textContent('#sellerModalTitle'), 'Editar vendedor');
check('y llega con los datos que ya tiene',
  await pe.evaluate(()=>{const f=document.getElementById('sellerForm').elements;
    const checked=[...document.querySelectorAll('#sellerPointChecks input:checked')].map(c=>c.value).sort();
    return [f.name.value, f.email.value, checked, f.active.value];}),
  ['Laura Méndez','laura@mediterraneacol.com',['sp-12-de-octubre'],'true']);
check('y avisa que el correo es también su usuario',
  await pe.isVisible('#sellerAccountHint'), true);

// Un correo repetido no es un choque cosmético: el login busca por correo y se
// queda con la primera cuenta, así que la segunda no volvería a entrar.
await pe.fill('#sellerForm [name=email]', 'andres@mediterraneacol.com');
await pe.click('#sellerForm button.primary');
check('no deja poner el correo de otra cuenta', await pe.textContent('#toast'), 'Ese correo ya lo usa otra cuenta');
check('y no guardó nada', await pe.evaluate(()=>Store.get('sellers',1).email), 'laura@mediterraneacol.com');

await pe.fill('#sellerForm [name=name]', 'Laura Méndez Ruiz');
await pe.fill('#sellerForm [name=email]', 'laura.ruiz@mediterraneacol.com');
await pe.check(`#sellerPointChecks input[value="${sopoId}"]`);
await pe.click('#sellerForm button.primary');
check('guarda nombre, correo y los puntos que cubre',
  await pe.evaluate(()=>{const s=Store.get('sellers',1);return [s.name,s.email,(s.servicePointIds||[]).slice().sort()];}),
  ['Laura Méndez Ruiz','laura.ruiz@mediterraneacol.com',['sp-12-de-octubre',sopoId].sort()]);

// El vendedor y su cuenta son dos registros. Si la cuenta no se mueve con él,
// el correo corregido no sirve para entrar y la persona queda con el viejo.
check('su cuenta se mueve con él: mismo nombre, mismo correo',
  await pe.evaluate(()=>{const u=Store.all('users').filter(x=>String(x.sellerId)==='1')[0];
    return [u.name,u.email];}),
  ['Laura Méndez Ruiz','laura.ruiz@mediterraneacol.com']);

// La cotización guarda el nombre como etiqueta; sin refrescarla, la búsqueda y
// el CSV seguirían mostrando el nombre viejo.
check('sus solicitudes quedan renombradas, no huérfanas',
  await pe.evaluate(()=>Store.all('quotes').filter(q=>String(q.sellerId)==='1').map(q=>q.seller)),
  ['Laura Méndez Ruiz']);
check('y el contador de su tarjeta las sigue contando',
  await pe.$eval('#sellerGrid .seller:has-text("Laura Méndez Ruiz") .seller-meta strong', e=>e.textContent), '1');

// El cambio vive en el localStorage de ESTE contexto, así que la comprobación
// del login se hace aquí mismo — un contexto nuevo no vería la edición.
await signOut(pe);
await signIn(pe, 'laura.ruiz@mediterraneacol.com');
check('entra con el correo nuevo', await pe.isVisible('#appShell'), true);
await pe.click('button[data-page="quotes"]');
check('y sigue viendo su propia solicitud, ahora a su nombre nuevo',
  await pe.$$eval('#quoteRows tr', rs => rs.map(r => r.textContent.includes('Laura Méndez Ruiz'))), [true]);
await signOut(pe);
await signIn(pe, 'laura@mediterraneacol.com');
check('el correo viejo ya no abre nada', await pe.isVisible('#appShell'), false);

// Pausar desde el modal tiene que cerrar el acceso igual que el interruptor.
await signIn(pe, 'maria@mediterraneacol.com');
await pe.click('button[data-page="sellers"]');
await pe.click('[data-edit-seller="1"]');
await pe.selectOption('#sellerForm [name=active]', 'false');
await pe.click('#sellerForm button.primary');
check('pausarlo desde el modal también le cierra la cuenta',
  await pe.evaluate(()=>{const u=Store.all('users').filter(x=>String(x.sellerId)==='1')[0];
    return [Store.get('sellers',1).active, u.active];}), [false,false]);

console.log('\nLA CONTRASEÑA NO SE GUARDA EN CLARO');
check('solo queda un hash SHA-256 por usuario, nunca la contraseña',
  await p.evaluate(()=>{const us=Store.all('users');
    return {todosConHash:us.every(u=>/^[0-9a-f]{64}$/.test(u.hash)),
            algunoGuardaPassword:us.some(u=>Object.values(u).some(v=>v===Auth.DEMO_PASSWORD))};}),
  {todosConHash:true, algunoGuardaPassword:false});
check('dos cuentas con la misma contraseña no comparten hash (sal por usuario)',
  await p.evaluate(()=>{const us=Store.all('users');return new Set(us.map(u=>u.hash)).size===us.length}), true);

console.log('\nerrores de pagina: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await b.close(); process.exit(fails?1:0);
