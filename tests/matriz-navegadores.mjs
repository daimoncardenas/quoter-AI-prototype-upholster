/* La matriz de motores: qué encuentra la capa de voz en cada navegador, medido, no supuesto.
 * Chromium (Chrome/Edge), Firefox y WebKit (Safari). Cabeza sin audio real: lo que se mide es la
 * DISPONIBILIDAD y la elección de la app, no la calidad del sonido. */
import { chromium, firefox, webkit } from 'playwright';

const URL = 'file://' + process.cwd() + '/generated/index.html';
const MOTORES = [
  ['chromium (Chrome/Edge)', chromium, { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }],
  ['firefox', firefox, { firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true } }],
  ['webkit (Safari)', webkit, {}],
];

for (const [nombre, motor, opciones] of MOTORES) {
  let b;
  try {
    b = await motor.launch(opciones);
    const p = await b.newPage({ viewport: { width: 800, height: 640 } });
    await p.goto(URL); await p.waitForTimeout(900);
    await p.evaluate(() => { const f = document.getElementById('vozFab'); if (f) f.click(); });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(async () => {
      const marco = window.SpeechRecognition || window.webkitSpeechRecognition;
      let voces = [];
      try { voces = speechSynthesis.getVoices() || []; } catch (e) {}
      if (!voces.length) await new Promise(r => setTimeout(r, 800));
      try { voces = speechSynthesis.getVoices() || []; } catch (e) {}
      const elegida = typeof laVozDelAsistente === 'function' ? (laVozDelAsistente() || {}) : {};
      const api = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      let micro = 'sin API';
      if (api) {
        try {
          const s = await Promise.race([
            encenderElMicrofono(),
            new Promise(r => setTimeout(() => r('timeout'), 4000)),
          ]);
          micro = s === true ? 'ok' : (s === false ? 'negado' : s);
        } catch (e) { micro = 'error'; }
      }
      return {
        reconocimiento: !!marco,
        sintesis: 'speechSynthesis' in window,
        voces: voces.length,
        suVoz: elegida.name || '(la del sistema)',
        suIdioma: elegida.lang || '',
        micApi: api, micro,
        onda: document.getElementById('vozOnda').dataset.estado,
        nota: (document.getElementById('vozNotaAudio').textContent || '').slice(0, 120),
      };
    });
    console.log(`\n== ${nombre}`);
    console.log(`   reconocimiento de voz: ${r.reconocimiento ? 'SÍ' : 'NO'}   ·   síntesis: ${r.sintesis ? 'SÍ' : 'NO'} (${r.voces} voces)`);
    console.log(`   su voz elegida: ${r.suVoz} ${r.suIdioma ? '(' + r.suIdioma + ')' : ''}`);
    console.log(`   micrófono: ${r.micro} (API ${r.micApi ? 'sí' : 'no'})   ·   onda: ${r.onda}`);
    console.log(`   nota: ${r.nota}`);
    await b.close();
  } catch (e) {
    console.log(`\n== ${nombre}\n   NO CORRIÓ: ${e.message.split('\n')[0]}`);
    try { if (b) await b.close(); } catch (e2) {}
  }
}
