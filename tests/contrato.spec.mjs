/* EL CONTRATO — los hechos de una precotización, declarados aparte del formulario.
 *
 * Spec de unidad pura (sin navegador, sin red): `contrato.js` no toca el DOM. Lo que se comprueba es
 * lo que la conversación va a necesitar y lo que el formulario ya exige, con las MISMAS frases:
 *
 *   1 · qué campos pide cada línea (los `skips` y los `asks` del catálogo, de verdad)
 *   2 · qué falta, en qué orden, y el progreso contado sobre lo que ESA línea pide
 *   3 · que las frases sean las del formulario (contra generated/index.html, para que no se separen)
 *   4 · qué valores acepta la conversación y cuáles NUNCA (la lista cerrada del modelo)
 *
 *   node tests/contrato.spec.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Contrato = createRequire(import.meta.url)('../contrato.js');

let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

/* ---- El catálogo real: las líneas del catálogo compartido y los muebles con sus rangos ---- */
const lineas = JSON.parse(readFileSync('shared/service-lines.json', 'utf8'));
/* Los muebles viven en store.js (no en un JSON): se leen de ahí, que es la MISMA lista que usa el
 * cotizador. Si esta lectura se rompe, el spec lo dice en vez de probar contra datos inventados. */
const storeJs = readFileSync('store.js', 'utf8');
const muebles = [];
for (const m of storeJs.matchAll(/name:'([^']+)'[^\n]*?ranges:\{\s*width:\[(\d+),\s*(\d+)\],\s*height:\[(\d+),\s*(\d+)\],\s*depth:\[(\d+),\s*(\d+)\]\s*\}/g)) {
  muebles.push({ name: m[1], ranges: { width: [+m[2], +m[3]], height: [+m[4], +m[5]], depth: [+m[6], +m[7]] } });
}
const rangos = Object.fromEntries(muebles.map(m => [m.name, m.ranges]));
const linea = id => lineas.lines.filter(l => l.id === id)[0];
const articulos = lineas.damageItems.map(d => d.id);

console.log('\nEL CATÁLOGO REAL');
check('la lista de muebles se leyó del cotizador (con sus rangos)', muebles.length >= 6, true);
check('y el sofá trae los rangos del cotizador', rangos['Sofá'], { width: [140, 320], height: [55, 120], depth: [70, 120] });
check('las líneas del catálogo están', lineas.lines.map(l => l.id).sort(),
  ['a-la-medida', 'mantenimiento', 'proyecto-comercial', 'reparacion', 'retapizado', 'suministro-tela', 'tapiceria-arquitectonica']);

const catalogo = { muebles: muebles.map(m => m.name), rangos, danos: articulos, lineas: lineas.lines.map(l => ({ id: l.id, label: l.label })) };
const mundo = (extra = {}) => Object.assign({
  catalogo, linea: null, ruta: null, proposito: null, saber: null,
  rutas: [], propositos: [], saberes: [],
  fotos: { cargadas: 0, min: 3 }, danos: { marcados: 0 }, medidas: { valores: {}, mueble: '' },
  lista: { filas: 0, intencionTela: false }, pedido: { dicho: false }, revision: { analizada: false },
  respuestas: {}, asks: lineas.asks, atencion: { cliente: '', servicio: '', sede: '' },
  contacto: { nombre: '', correo: '', celular: '', autoriza: false }
}, extra);

/* ---- 1 · Qué pide cada línea ---- */
console.log('\nLO QUE CADA LÍNEA PIDE (skips y asks del catálogo)');
const ids = m => Contrato.faltantes(m).map(f => f.id);
/* El recorrido REAL de cada rama vive en el espejo del wizard (`tests/mirror/`): la unidad lo lee
 * para saber en qué orden se pregunta — es el mismo dato que la página pone en `m.flujo`. */
const MIRROR_DE = { 'retapizado': 'reupholstery', 'tapiceria-arquitectonica': 'architectural-upholstery',
  'reparacion': 'repair', 'proyecto-comercial': 'commercial-project', 'a-la-medida': 'custom-made' };
const flujoDe = id => { try { return (JSON.parse(readFileSync(`tests/mirror/${MIRROR_DE[id]}.json`, 'utf8')).steps || []).map(s => Number(s.step)); } catch { return []; } };
const conLinea = (id, extra = {}) => mundo(Object.assign({ linea: linea(id), flujo: flujoDe(id) }, extra));
check('sin línea elegida, el contrato de la pantalla empieza por la línea',
  ids(mundo())[0], 'linea');
check('y con la línea elegida, retapizado pide las fotos, la pieza, las medidas y lo del oficio, en el orden del recorrido',
  ids(conLinea('retapizado')), ['fotos', 'mueble', 'medidas', 'insumos', 'preferencias', 'revision', 'presupuesto', 'tela', 'atencion', 'contacto']);
check('la tapicería arquitectónica no pregunta mueble ni medidas',
  ids(conLinea('tapiceria-arquitectonica')).filter(x => ['mueble', 'medidas'].includes(x)), []);
check('el proyecto comercial tampoco pregunta medidas (las piezas van en su mesa)',
  ids(conLinea('proyecto-comercial')).includes('medidas'), false);
check('la línea que pregunta daños los pide',
  ids(conLinea('reparacion')).includes('danos'), true);
check('y la que no los pregunta, no',
  ids(conLinea('retapizado')).includes('danos'), false);

/* La línea con caminos: el camino, el propósito, lo que se sabe, la lista y el pedido anterior son de
 * CIERTOS caminos — y solo aplican cuando la línea los declara. */
const suministro = linea('suministro-tela');
const conCaminos = (extra = {}) => conLinea('suministro-tela', Object.assign({ rutas: suministro.rutas }, extra));
const rutaDe = (id) => Object.assign({ id, rutasConLista: ['compra', 'pedido'] }, suministro.rutas.filter(r => r.id === id)[0]);
const rutaCompra = rutaDe('compra');
check('con caminos y sin elegir, el primer campo que falta es el camino', ids(conCaminos())[0], 'ruta');
check('y el propósito, cuando el camino los declara',
  ids(conCaminos({ ruta: rutaCompra, propositos: rutaCompra.propositos })).includes('proposito'), true);
check('«nueva compra» pide la lista pero NO el pedido anterior',
  ids(conCaminos({ ruta: rutaCompra })).includes('pedido'), false);
check('y sí la lista', ids(conCaminos({ ruta: rutaCompra })).includes('lista'), true);
check('«completar pedido» pide las dos cosas',
  ['lista', 'pedido'].map(x => ids(conCaminos({ ruta: rutaDe('pedido') })).includes(x)), [true, true]);

/* ---- 2 · Qué falta, en orden, y el progreso ---- */
console.log('\nQUÉ FALTA Y EL PROGRESO (contado sobre lo que esa línea pide)');
const vacio = mundo();
const p0 = Contrato.progreso(vacio);
check('el progreso de un contrato sin línea, sobre sus nueve campos', [p0.hechos, p0.total, p0.porcentaje], [0, 9, 0]);
check('y el primero que falta es la línea, con la frase del formulario',
  p0.faltantes[0].mensaje, 'Elige qué quieres hacer para continuar.');
check('un mundo sin nada declarado no se puede enviar', Contrato.puedeEnviar(vacio), false);
check('y con la línea elegida, la línea ya no falta (siguen seis por hacer)',
  [Contrato.faltantes(conLinea('retapizado')).some(f => f.id === 'linea'), Contrato.progreso(conLinea('retapizado')).hechos],
  [false, 1]);

const lleno = conLinea('retapizado', {
  mueble: { nombre: 'Sofá', descripcion: '' },
  fotos: { cargadas: 3, min: 3 }, medidas: { valores: { width: 210, height: 85, depth: 90 }, mueble: 'Sofá' },
  revision: { analizada: true }, atencion: { cliente: 'Bogotá', servicio: 'Bogotá', sede: 'Principal' },
  /* Lo del oficio de esta línea: la tela ELEGIDA (no la automática), los insumos estimados y las
   * preferencias que deciden la recomendación — más el presupuesto, que el paso 13 declara. */
  fabric: { touched: true }, supplies: [{ id: 'espuma', cantidad: 2 }],
  preferencias: { style: 'Moderno', color: 'Neutros' }, budget: { declared: true },
  contacto: { nombre: 'Ana', correo: 'ana@taller.co', celular: '300 123 4567', autoriza: true }
});
check('con todo lo que esa línea pide, el contrato se puede enviar', Contrato.puedeEnviar(lleno), true);
check('y el progreso dice 100 %', Contrato.progreso(lleno).porcentaje, 100);
check('«Otro» sin decir cuál no cierra el contrato',
  Contrato.faltantes(Object.assign({}, lleno, { mueble: { nombre: 'Otro', descripcion: '' } })).map(f => f.id), ['mueble']);

/* ---- 3 · Las frases son las del formulario ---- */
console.log('\nLAS FRASES SON LAS DEL FORMULARIO (contra generated/index.html)');
const pagina = readFileSync('generated/index.html', 'utf8');
/* La PLANTILLA del formulario, sin el contrato: contrato.js se incrusta en la página generada, así
 * que para saber si una frase «nació en el contrato» hay que mirar el formulario, no el build. */
const plantilla = readFileSync('index.html', 'utf8');
/* Las que arman su frase con números: se comprueban por sus piezas estables. */
const POR_PIEZAS = {
  fotos: ['foto más', 'necesitamos al menos'],
  medidas: ['sin las tres medidas no puedo calcular la tela'],
  atencion: ['Necesito saber', 'elige una ciudad para continuar.'],
};
/* Las que el formulario no tenía y nacen en el contrato: la ruta, el propósito y lo que se sabe
 * (el formulario los deja preelegidos), lo del oficio que la conversación no preguntaba (la tela
 * elegida, los insumos, las preferencias, el presupuesto) y el «no hay mueble elegido» (la parrilla
 * siempre trae uno). */
const NUEVAS = ['ruta', 'proposito', 'saber', 'tela', 'insumos', 'preferencias', 'presupuesto'];
const mundosDeMensajes = [
  conLinea('retapizado'), conLinea('reparacion'), conCaminos(),
  conCaminos({ ruta: rutaCompra, propositos: rutaCompra.propositos }),
  conLinea('retapizado', { mueble: { nombre: 'Otro', descripcion: '' } }),
];
const porId = new Map();
for (const m of mundosDeMensajes) for (const f of Contrato.faltantes(m)) if (!porId.has(f.id)) porId.set(f.id, f.mensaje);
for (const [id, mensaje] of porId) {
  if (NUEVAS.includes(id)) {
    check(`«${id}» es una frase nueva (no está en el formulario)`, plantilla.includes(mensaje), false);
    if (plantilla.includes(mensaje)) console.log('        frase: ' + mensaje);
    continue;
  }
  if (POR_PIEZAS[id]) {
    const faltan = POR_PIEZAS[id].filter(x => !pagina.includes(x));
    check(`«${id}» se arma con las piezas del formulario`, faltan, []);
    continue;
  }
  if (id === 'mueble') {
    /* Las dos variantes del mueble: la de «Otro» es del formulario; la de «no hay ninguno elegido»
     * nace aquí (en la pantalla la parrilla siempre trae uno seleccionado). */
    const otro = Contrato.faltantes(conLinea('retapizado', { mueble: { nombre: 'Otro', descripcion: '' } }))
      .filter(f => f.id === 'mueble')[0].mensaje;
    check('«mueble» dice la frase del formulario cuando es «Otro»',
      [pagina.includes(otro), /no dice qué hay que tapizar/.test(otro)], [true, true]);
    check('y la de «sin elegir» es nueva', plantilla.includes(mensaje), false);
    continue;
  }
  check(`«${id}» dice la misma frase que el formulario`, pagina.includes(mensaje), true);
  if (!pagina.includes(mensaje)) console.log('        frase: ' + mensaje);
}
check('la frase de la banda de medidas también es la del formulario',
  pagina.includes('está muy fuera de lo habitual para'), true);
check('y las seis del contacto', Object.values(Contrato.MENSAJE_CONTACTO).every(x => pagina.includes(x)), true);

/* ---- 4 · Qué acepta la conversación, y qué nunca ---- */
console.log('\nLA LISTA CERRADA: QUÉ ACEPTA LA CONVERSACIÓN Y QUÉ NUNCA');
const sofá = mundo({ medidas: { valores: {}, mueble: 'Sofá' } });
check('una medida del catálogo se acepta', Contrato.validarValor(sofá, 'medidas', { campo: 'width', valor: 210 }), { ok: true, valor: 210 });
check('una medida imposible se rechaza con la frase del formulario',
  Contrato.validarValor(sofá, 'medidas', { campo: 'width', valor: 2000 }).motivo,
  'El ancho de 2000 cm no es una medida posible: va de 20 a 1000 cm.');
check('una medida muy fuera de lo habitual (banda ±20 %) se rechaza',
  Contrato.validarValor(sofá, 'medidas', { campo: 'width', valor: 20 }).ok, false);
check('y una fuera del rango pero dentro de la banda pasa con aviso',
  Contrato.validarValor(sofá, 'medidas', { campo: 'width', valor: 130 }).aviso, 'está fuera de lo habitual, pero se puede seguir');
check('un mueble que no está en el catálogo no entra',
  Contrato.validarValor(mundo(), 'mueble', 'Sofá cama').ok, false);
check('«Otro» sí entra con la descripción del cliente',
  Contrato.validarValor(mundo({ mueble: { nombre: 'Otro', descripcion: '' } }), 'muebleOtro', 'Sofá de mi abuela'),
  { ok: true, valor: 'Sofá de mi abuela' });
check('un daño inventado no entra', Contrato.validarValor(mundo({ linea: linea('reparacion') }), 'danos', ['inventado']).ok, false);
check('un daño del catálogo sí', Contrato.validarValor(mundo({ linea: linea('reparacion') }), 'danos', [articulos[0]]), { ok: true, valor: [articulos[0]] });

/* El contacto: formas de correo y celular, y la autorización que la conversación NO firma. */
check('un correo sin forma de correo no entra', Contrato.validarValor(mundo(), 'contacto', { campo: 'correo', valor: 'ana-arroba-taller' }).ok, false);
check('un correo con forma sí', Contrato.validarValor(mundo(), 'contacto', { campo: 'correo', valor: 'ana@taller.co' }).ok, true);
check('un celular de tres dígitos no entra', Contrato.validarValor(mundo(), 'contacto', { campo: 'celular', valor: '123' }).ok, false);
check('y uno de verdad sí', Contrato.validarValor(mundo(), 'contacto', { campo: 'celular', valor: '300 123 4567' }).ok, true);
check('la autorización NO la puede escribir la conversación',
  Contrato.validarValor(mundo(), 'contacto', { campo: 'autorizacion', valor: true }).ok, false);
check('y la lista de lo que nunca escribe la IA es la que es',
  Contrato.NUNCA_LO_PONE_LA_IA, ['autorizacion', 'fotos', 'estimacion', 'precio']);
check('la estimación no es un campo que se llene',
  Contrato.validarValor(mundo(), 'estimacion', 500000).ok, false);

/* Una respuesta de un paso de pregunta: las opciones y los rangos del catálogo. */
const gruposDe = (tipo) => Object.entries(lineas.asks)
  .map(([id, a]) => ({ id, a, grupo: (a.groups || []).filter(g => (g[tipo] || []).length)[0] }))
  .filter(x => x.grupo)[0];
/* La línea que pregunta ese ask: el mundo lleva los specs de ESA línea, como los pasaría la página. */
const mundoConAsk = (askId) => mundo({ linea: Object.assign({}, linea('retapizado'), { asks: [askId] }), asks: { [askId]: lineas.asks[askId] } });
const conOpciones = gruposDe('options');
if (conOpciones) {
  const { id: askId, grupo } = conOpciones;
  const opcion = grupo.options[0].id;
  const m = mundoConAsk(askId);
  check(`una opción real de «${askId}» entra`, Contrato.validarValor(m, 'respuestas', { ask: askId, campo: grupo.id, valor: opcion }).ok, true);
  check('y una inventada no', Contrato.validarValor(m, 'respuestas', { ask: askId, campo: grupo.id, valor: 'platanos' }).ok, false);
  check('y una pregunta que esa línea no hace no entra',
    Contrato.validarValor(mundo({ asks: {} }), 'respuestas', { ask: askId, campo: grupo.id, valor: opcion }).ok, false);
}
const conCampos = gruposDe('fields');
if (conCampos) {
  const { id: askId, grupo } = conCampos;
  const f = grupo.fields[0];
  const m = mundoConAsk(askId);
  check(`un número dentro del rango de «${f.label || f.id}» entra`,
    Contrato.validarValor(m, 'respuestas', { ask: askId, campo: grupo.id, valor: { campo: f.id, valor: f.min } }).ok, true);
  check('y uno fuera no',
    Contrato.validarValor(m, 'respuestas', { ask: askId, campo: grupo.id, valor: { campo: f.id, valor: f.max + 1 } }).ok, false);
}

console.log(fails ? `\n${fails} FALLAN` : '\nTODO PASA');
process.exit(fails ? 1 : 0);
