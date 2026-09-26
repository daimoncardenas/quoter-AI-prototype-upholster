/* EL PASO MANDA — suite determinista de la capa que conversa (dueño, 25/09: «debe ser una suite»).
 *
 * Prueba las REGLAS del sistema, sin modelo y sin red: qué campo pide en el paso visible, dónde entra
 * un número que no cabe donde el cliente lo dijo, cuántas fotos hacen falta, que nunca diga la misma
 * frase dos veces, y que el paso del taller (insumos) no se le pregunte al cliente. Cada caso es el
 * bug tal como se vivió en las sesiones del 25/09, congelado aquí para que no vuelva.
 *
 * La conversación con el modelo (que sí varía entre corridas) vive aparte:
 * tools/conversacion-vs-wizard.mjs. Esto es lo que tiene que pasar SIEMPRE.
 */
import { chromium } from 'playwright';
import { client } from './client.mjs';
import { openWizard } from './helpers.mjs';

const D = 'file://' + process.cwd() + '/generated/';

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
try {
  await openWizard(pagina, D);

  /* ── 1 · El primer pendiente del paso es el que ella pregunta ─────────────────────────────────── */
  const primero = await pagina.evaluate(() => {
    const c = elCampoDeLaPantalla();
    return c && { id: c.id, campo: c.campo };
  });
  check('el primero pendiente es el ancho de la pieza 1', primero, { id: 'pieza.0.width', campo: 'medidas' });

  /* ── 2 · El número entra donde el cotizador lo acepta (el INTERCAMBIO) ────────────────────────── */
  await pagina.evaluate(() => aplicarLoDicho('medidas', 'largo 160 alto 90 ancho 100'));
  const fila = await pagina.evaluate(() => [...document.querySelectorAll('.piezas-lista .pieza-fila [data-medida]')]
    .map(e => e.dataset.medida + '=' + e.value).join(' '));
  check('«largo 160 alto 90 ancho 100» de un sofá: 160 al ancho, 90 al alto, 100 al fondo', fila, 'width=160 height=90 depth=100');

  /* ── 3 · Las fotos son un pendiente del paso (si no, ella se salta los pasos) ─────────────────── */
  const conMedidas = await pagina.evaluate(() => {
    const c = elCampoDeLaPantalla();
    return c && { id: c.id, campo: c.campo };
  });
  check('con las medidas puestas, el pendiente es «las fotos»', conMedidas, { id: 'fotos', campo: 'fotos' });

  /* ── 4 · El valor que el cotizador no acepta se dice, y es el pendiente ───────────────────────── */
  const conAviso = await pagina.evaluate(() => {
    const el = document.querySelector('.piezas-lista .pieza-fila [data-medida="width"]');
    el.value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const c = elCampoDeLaPantalla();
    return { id: c && c.id, tieneAviso: !!(c && c.aviso), frase: c ? conAvisoDelPendiente(c) : '' };
  });
  check('el ancho de 100 cm en un sofá vuelve a ser el pendiente, con aviso', { id: conAviso.id, aviso: conAviso.tieneAviso }, { id: 'pieza.0.width', aviso: true });
  check('y su frase empieza por «Ojo:»', conAviso.frase.startsWith('Ojo:'), true);

  /* ── 5 · Nunca la misma frase dos veces ───────────────────────────────────────────────────────── */
  const repetidas = await pagina.evaluate(() => {
    const caja = document.getElementById('vozMessages');
    const ultimas = () => [...caja.querySelectorAll('.message.bot')].map(m => m.textContent);
    decirEnLaConversacion('¿Cómo va todo por allá?');
    decirEnLaConversacion('¿Cómo va todo por allá?');
    const conPregunta = ultimas().slice(-2);
    decirEnLaConversacion('Anotado: Sofá.');
    const antesDelRecibo = ultimas().length;
    decirEnLaConversacion('Anotado: Sofá.');
    const despuesDelRecibo = ultimas().length;
    return { conPregunta, reciboRepetido: despuesDelRecibo - antesDelRecibo };
  });
  check('la misma pregunta dos veces seguidas sale distinta', repetidas.conPregunta[0] !== repetidas.conPregunta[1], true);
  check('un recibo igual no se repite', repetidas.reciboRepetido, 0);

  /* ── 6 · La pregunta del respaldo tiene banco (rota, no se repite) ────────────────────────────── */
  const dosFotos = await pagina.evaluate(() => {
    const f = { id: 'fotos', mensaje: 'las fotos' };
    return [preguntaDelRespaldo(f), preguntaDelRespaldo(f)];
  });
  check('la pregunta de las fotos no se repite igual dos veces', dosFotos[0] !== dosFotos[1], true);

  /* ── 7 · La tela elegida entra a la fila aunque los metros los ponga el taller ────────────────── */
  const conTela = await pagina.evaluate(async () => {
    const r = await aplicarLoDicho('lista', 'quiero la terracota');
    const fila = document.querySelector('#listRows .boq-row');
    return { ok: !!(r && r.ok), tela: fila ? (fila.querySelector('.list-fabric') || {}).value : null,
      metros: fila ? Number((fila.querySelector('.list-metros') || {}).value) || 0 : 0 };
  });
  check('nombrar la tela sin metros llena la fila igual («ustedes saben el metraje»)', { ok: conTela.ok, hayTela: !!conTela.tela, metros: conTela.metros > 0 },
    { ok: true, hayTela: true, metros: true });

  /* ── 8 · El mínimo de fotos es dos por pieza (y nunca menos que el del cotizador) ─────────────── */
  const minUna = await pagina.evaluate(() => elMinimoDeFotos());
  await pagina.evaluate(() => agregarPieza());
  await pagina.waitForTimeout(200);
  const minDos = await pagina.evaluate(() => elMinimoDeFotos());
  check('mínimo de fotos con una pieza', minUna >= 3, true);
  check('mínimo de fotos con dos piezas (dos por cada una)', minDos >= 4, true);

  /* ── 8 · El paso del taller (insumos) no se le pregunta al cliente ────────────────────────────── */
  const taller = await pagina.evaluate(() => {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.toggle('active', s.dataset.step === '17'));
    const leido = ACI.losCamposDelPaso();
    const c = elCampoDeLaPantalla();
    return { campos: (leido.campos || []).map(x => x.id), pendiente: c && c.id };
  });
  check('en el paso de insumos no hay campos del cliente', taller.campos.filter(id => /espuma|cincha|grapa|hilo|pegante|insumo/i.test(id)), []);
  check('y no queda pendiente que preguntar', taller.pendiente, null);
} finally {
  await navegador.close();
}

if (fails) {
  console.log(`FALLAS: ${fails}`);
  process.exit(1);
}
console.log(`TODO PASA — la asistente sigue el paso (${(client.assistant && client.assistant.name) || 'Lía'})`);
