/* Assistant presence — the 3D salesperson in the cotizador's sidebar.
 *
 * Not a template: tools/generate.mjs inlines this file into index.html as a
 * <script type="module">, next to the embedded models (<script
 * type="application/json" id="assistantModel-*">). It must not contain the
 * closing script tag sequence (generate.mjs refuses to render if it does).
 *
 * What it does (desktop only, when Store.assistant().enabled):
 *   - stands Lía or Tomás on the sidebar's help-card line, 75% of the free height
 *   - reacts to the wizard's own events (window 'aci:event', published by the ACI
 *     adapter in index.html) instead of watching the cursor: glances at the chosen
 *     furniture card, at the uploader when photos change, at the armchair when a
 *     fabric is picked; "thinks" while the review runs. Idle, it looks at the step title.
 *   - and she looks at whatever the customer TOUCHES: a click (pointerdown) or a
 *     focus in the form turns her head to that control, rate-limited so it never
 *     twitches. Never the bare cursor (hover is not an intention), and while the
 *     chat is open she faces the customer instead.
 *   - anti-Clippy budget: one reaction per customer action (events of the same
 *     action are coalesced), a 4 s cooldown, none while the customer types, none
 *     with reduced motion or the presence off. Suppressed reactions are counted.
 *   - waves once per browser with a welcome bubble; faces the customer while the chat is open
 *   - an armchair next to them wears the fabric in the quotation context
 * Test hooks on #assistantStage: data-reactions / data-reactions-suppressed
 * (counters), data-reaction (last one), data-glance (what she is looking at:
 * 'selection' | 'uploader' | 'armchair' | the control's id or value), data-thinking,
 * data-chair-fabric.
 *
 * three.js comes from cdn.jsdelivr.net through the importmap in <head>. The module
 * waits for the page's load event and imports three dynamically, so it never
 * delays the wizard. ANY failure (offline, no WebGL, a bad model) leaves the page
 * as if the layer did not exist: "Preguntar" and the chat keep working. */

const ready = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => addEventListener('load', r, { once: true }));

const CHARACTERS = {
  // suitMaterials: what "traje con el color de la marca" recolors.
  female: { model: 'assistantModel-female', suitMaterials: ['Black', 'Skirt'] },
  male: { model: 'assistantModel-male', suitMaterials: ['Suit'] }
};

/* Face details added in code: the Quaternius heads have no mouth and frowning
 * brows, and no morph targets. Coordinates are in Head-bone space (meters). */
const FACES = {
  female: { browMaterial: 'Hair_Brown', mouth: { y: 0.018, z: 0.113, halfWidth: 0.028, lift: 0.012 }, brow: { y: 0.129, z: 0.125, inner: 0.02, outer: 0.064, arch: 0.007 } },
  male: { browMaterial: 'Eyebrows', mouth: { y: 0.012, z: 0.114, halfWidth: 0.029, lift: 0.012 }, brow: { y: 0.131, z: 0.123, inner: 0.02, outer: 0.066, arch: 0.007 } }
};

// Canvas room around the character, as a fraction of its height (waving hand, arms).
const HEAD_ROOM = 0.14, SIDE_ROOM = 0.45;
/* Cuánto baja el lienzo POR DEBAJO de la línea del suelo (px). Ya no es un número fijo: el hueco
 * se deriva del alcance del zapato medido en el modelo (ver `floorRoom` en place()), con
 * `FLOOR_ROOM` como mínimo y `FLOOR_MARGIN` de aire para que la punta nunca toque el borde.
 * `data-floor` publica la línea para que las pruebas midan la misma que dibuja el render. */
const FLOOR_ROOM = 14;
/* Aire bajo los zapatos en el PEOR cuadro del ciclo (medido: `settle` y `walk2` son los que más
 * se acercan al borde). El lienzo es transparente y no recibe clics, así que reservar de más no
 * cuesta nada: lo que no se puede es volver a ver una punta cortada. */
const FLOOR_MARGIN = 20;
// A standing figure is ~36% as wide as it is tall, arms included.
const MAX_H = 300, MIN_H = 130, BODY_W = 0.36, EDGE = 12, GAP = 10;
const SCALE = 0.75; // three quarters of the space it could take: more white room around it
const MOBILE_MAX = 650; // same breakpoint that hides the sidebar
const CHAIR_ELEVATION = 0.38; // radians the chair camera looks down
const FABRIC_GRAY = 0.46; // linear average of the fabric area in the armchair's diffuse map
const WELCOME_MS = 8000;
const NOTICE_MS = 10000; // a notice takes the sidebar for a few seconds, then gives it back
const GLANCE_MS = 1800; // how long a reaction keeps the head on its target
const GLANCE_LOCK_MS = 1200; // and how long the click that caused it cannot take it away
const HANDS_MS = 1400; // how long the head stays on what the customer just touched
const HANDS_MIN_MS = 350; // minimum spacing between those turns (attentive, never twitchy)
const COALESCE_MS = 60; // events published by one customer action arrive within this window
const REACTION_COOLDOWN_MS = 4000;
// Looking up and away, the classic "let me think" (radians; no clip exists for it).
const THINKING = { pose: { yaw: -0.35, pitch: -0.22 } };
/* A minute without a single sign of life —no mouse, no keyboard, no touch— and she walks
 * to her armchair and sits down; any sign brings her back. Sitting is a POSE, not a clip
 * (none exists for it): the legs are bent after the mixer, like the wave and the look. */
const IDLE_MS = 60000;
const SIT_TURN_MS = 380, SIT_WALK_MS = 1150, SIT_SETTLE_MS = 700, STAND_MS = 620;
/* El paseo son DOS piernas de caminata, con un giro entre ellas: cada una se camina mirando
 * a donde va (el clip Walk es una zancada hacia adelante, así que la que se hacía de lado al
 * ir y de espaldas al volver se leía como patinaje). La cadencia es la de antes: cada pierna
 * dura la mitad de lo que duraba el tramo entero. */
const SIT_LEG_MS = SIT_WALK_MS / 2;
const WALK_PHASES = ['walk1', 'walk2', 'walkback1', 'walkback2'];
const SIT_SKIP_UNITS = 0.03;   // un tramo más corto que esto no se camina: se salta
const SIT_FACE_MS = 620;   // el giro de 180° para volver a mirar al cliente
/* Where the armchair's seat is, relative to where its origin projects (py): measured on the
 * render with marker lines, not derived from the mesh — the seat's surface is not at the
 * chair's origin. The chair's placement itself is untouched; she is the one who moves. */
const SEAT_ABOVE_PY = 0.36;
/* The clear gap between the armrests is NOT centred on the chair's outline: measured with
 * marker lines, its centre sits 15 px right of the chair's origin on screen (the chair is
 * turned toward her). Sitting her on the outline put her hip inside the left armrest. */
const SEAT_X_OFFSET = 15;
/* Cuánto cabalga la cadera sobre el cojín, en UNIDADES del modelo (0.10 ≈ 12 px a 1440 y
 * ≈ 16 px a 1915): escrito en píxeles, el contacto cambiaba de profundidad física con el
 * tamaño de la ventana y a 1915 la dejaba flotando ~25 px sobre el asiento. */
const HIP_ON_SEAT_UNITS = 0.10;
/* Sentada se adelanta en el asiento (px de pantalla): hacia la derecha porque el sillón
 * mira algo hacia ella. En el eje vertical NO se baja — su cámara es frontal, así que bajar
 * es hundirse en el cojín; eso lo decide HIP_ON_SEAT_UNITS. */
const SIT_FWD = { x: 8, y: 0 };
/* ------------------------------------------------------------- colisiones --
 * La regla del producto: Lía NUNCA atraviesa el sillón — ni caminando, ni girando, ni
 * al sentarse. La animación y la IK PROPONEN movimiento y pose; este paso mide lo que
 * se solapa contra colliders de verdad (Rapier: el sillón como trimesh, el suelo como
 * caja, ella como cápsulas sobre sus huesos) y devuelve la corrección. Sólo se dibuja
 * lo corregido. Ningún solape se arregla ya con constantes a ojo. */
const RAPIER_URL = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs';
const PHYS = {
  torsoR: 0.15, headR: 0.11, thighR: 0.085, shinR: 0.07, footR: 0.05, // radios en unidades del modelo
  armR: 0.075, foreR: 0.06, handR: 0.05,
  samples: 4,      // puntos por cápsula
  maxPush: 0.12,   // corrección máxima por cuadro: sin saltos, pero sin dejar un solape visible
  iterations: 3,
  bodyUp: 0.25,    // el empuje del cuerpo casi no sube: subirla es flotar, apartarla es lo correcto
  floorLike: 0.55  // un empuje así de vertical es una superficie donde se apoya, no un obstáculo
};
let RAPIER = null, phys = null;
const SIT_POSE = { torso: -0.05 }; // radianes; piernas y brazos los resuelve su IK
/* Las manos se apoyan en los muslos: blancos y forma del apoyo (ver placeHands). El blanco
 * va a lo largo del muslo, a `thighR + handR` sobre su eje — el contacto es un desnivel del
 * hueso — más el grosor de la prenda, porque apoyar la mano en la PIEL la deja dentro de la
 * falda y la tela le queda encima (reportado: "la falda le queda en las manos"). Ese grosor
 * está medido en el render con un rayo, sentada y hacia afuera del blanco (donde la mano ya
 * no está): 3.9 px a 11 px del blanco y 2.8 px a 20 px en el muslo izquierdo — el derecho
 * queda tapado por la pierna cruzada. 0.036 u ≈ 4 px. El codo, además, cuelga del hombro con
 * un sesgo hacia afuera. */
const SIT_HANDS = { t: 0.32, above: 0.036, out: 0.35, down: 1, back: 0.15 };
/* Las piernas sentadas: la separación de los tobillos respecto a la línea media, en unidades
 * del modelo (0.07 u ≈ 8 px por lado, la postura de alguien sentado). */
const SIT_LEGS = { stance: 0.07 };
/* Los pies, sentada: girados hacia afuera ~24°. De frente a la cámara el largo del zapato se
 * proyecta en la profundidad y el pie se lee como un muñón de piel — "no le veo los pies" —
 * aunque el zapato esté dibujado; girado, su largo se ve como largo. Es además la postura de
 * alguien sentado. */
const SIT_FEET = { out: 0.42 };
/* El paso máximo del descenso al asiento, por cuadro, en unidades del modelo (0.045 u ≈ 5 px a
 * 1440): acota el salto de un cuadro largo; ver el muelle de sentarse. */
const SIT_DROP_MAX = 0.045;
/* Sentada se gira hacia donde mira el sillón, no al revés: el sillón está girado
 * `chair.pivot.rotation.y` (+0.3, hacia su derecha) y con la mujer al otro lado el render
 * se leía como "el sillón mira a la derecha y ella a la izquierda". Se deriva de la
 * orientación del sillón para que un cambio de mueble la arrastre. */
const SIT_YAW_EXTRA = 0.32; // tres cuartos hacia el cliente, en el mismo sentido que el sillón
const sitYaw = () => (chair?.pivot?.rotation.y || 0) + SIT_YAW_EXTRA;
const SIT_BONES = ['UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R', 'Torso', 'Shoulder.L', 'Shoulder.R', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R'];

const $ = id => document.getElementById(id);
const stage = $('assistantStage'), hit = $('assistantHit'), bubble = $('assistantBubble'), chatPanel = $('chatPanel');
const journey = document.querySelector('.journey');
const helpCard = journey && journey.querySelector('.help-card');
const stepList = journey && journey.querySelector('.step-list');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let THREE = null, GLTFLoader = null;
let renderer, scene, camera, timer;
let current = null, chair = null, layout = null;
let state = 'idle', lookYaw = 0, lookPitch = 0;
let bubbleTimer = null, running = false, broken = false;
let glance = null, thinking = false, queuedReaction = null, queueTimer = null;
let reactionCount = 0, suppressedCount = 0, budget = null;
let loadingKind = null;
/* Idle-and-sit: `pose` is what the tests read; `sitSeq` is the step of the walk over
 * there, sitting down, or the way back. `bodyYaw` is the sequence's own turn, which the
 * look adds to instead of overwriting (each walking leg faces where it goes; she sits and
 * walks home looking at the customer). */
let pose = 'standing', sitSeq = null, sitWeight = 0, bodyYaw = 0, lastAlive = 0, sitGeom = null, SIT_V3 = null;
/* La caminata se mide sola: `walkPrev` es dónde estaba en el cuadro anterior (para saber
 * hacia dónde se movió) y `travelPeak` el peor ángulo del episodio (ver publishTravel). */
let walkPrev = null, travelPeak = 0;

const hideLayer = () => { stage.hidden = true; hit.hidden = true; layout = null; resetSit(); };

/* Frees the GPU/memory of a model that is being replaced: every geometry,
 * material (arrays too) and texture under `object`, the friendly-face tubes
 * included. Only call it on objects nothing else renders. */
function disposeObject(object) {
  object.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    [].concat(o.material || []).forEach(m => {
      for (const value of Object.values(m)) if (value && value.isTexture) value.dispose();
      m.dispose();
    });
  });
}

const fail = err => {
  broken = true;
  running = false;
  resetSit();
  hideLayer();
  if (bubble) bubble.hidden = true;
  if (helpCard) helpCard.querySelector('.text-button')?.style.removeProperty('margin-right');
  console.warn('Assistant presence disabled:', err && err.message ? err.message : err);
};

/* Vuelve a su sitio, de pie: al desmontar la capa, apagarla o fallar, nadie queda
 * sentado en el aire. */
function resetSit() {
  pose = 'standing';
  sitSeq = null;
  sitWeight = 0;
  bodyYaw = 0;
  walkPrev = null;
  travelPeak = 0;
  if (current) { current.body.position.set(0, 0, 0); }
  if (hit) hit.style.removeProperty('transform');
  if (stage) {
    stage.dataset.pose = 'standing';
    stage.dataset.sitPhase = '';
    delete stage.dataset.travel;
    delete stage.dataset.travelPeak;
    delete stage.dataset.pushRoot;
    delete stage.dataset.hands;   // de pie no hay manos apoyadas que publicar
    delete stage.dataset.feetFlat;
    delete stage.dataset.legReach;
  }
}

function webglAvailable() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (err) { return false; }
}

async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
  renderer = new THREE.WebGLRenderer({ canvas: stage.querySelector('canvas'), alpha: true, antialias: true });
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const lights = s => {
    s.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c7, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.5, 3, 4);
    s.add(key);
    return s;
  };
  scene = lights(new THREE.Scene());
  // Orthographic: model units map linearly to pixels, so the feet land exactly on the line.
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  /* The chair lives in THIS scene, not in one of its own: one scene, one camera, one
   * depth buffer, so the armchair can actually occlude her (and she it) where they meet.
   * Its tilted view is baked into its transform instead — see loadChair() and place(). */
  timer = new THREE.Timer();
}

async function parseModel(id) {
  const el = $(id);
  if (!el) throw new Error(`missing embedded model #${id}`);
  return new GLTFLoader().parseAsync(el.textContent, '');
}

/* ----------------------------------------------------------------- chair -- */

/* The armchair's fabric and carved wood share ONE texture atlas, so a plain
 * material tint would dye the wood too. Only the light-gray (fabric) texels are
 * tinted, keeping the weave: texel / average fabric gray * fabric color. Darker
 * wrinkles still count as fabric (the threshold sits below them), and the fabric
 * area is forced matte so glossy spots do not read as white stains. */
function maskedFabric(material) {
  const uniforms = { uFabric: { value: new THREE.Color(FABRIC_GRAY, FABRIC_GRAY, FABRIC_GRAY) } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFabric;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float fabricLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float fabricMask = smoothstep(0.07, 0.13, fabricLum);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb / ${FABRIC_GRAY.toFixed(2)} * uFabric, fabricMask);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n        roughnessFactor = mix(roughnessFactor, 1.0, fabricMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n        metalnessFactor = mix(metalnessFactor, 0.0, fabricMask);');
  };
  material.customProgramCacheKey = () => 'assistant-masked-fabric';
  return uniforms.uFabric.value;
}

async function loadChair() {
  const { scene: model } = await parseModel('assistantModel-armchair');
  let tint = null;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map(m => { const c = m.clone(); tint = maskedFabric(c); return c; });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.y = 0.3; // mostly frontal (seat visible), slightly turned toward the character
  /* Its own root carries the placement (position/scale, in the character's world units).
   * The tilted view now comes from the shared camera, so the chair needs no rotation of
   * its own — only its yaw, which lives in the pivot. */
  const root = new THREE.Group();
  root.add(pivot);
  if (chair) { scene.remove(chair.root); disposeObject(chair.root); }
  root.visible = false;
  scene.add(root);
  const neutral = tint.clone(); // the chair exactly as shipped
  const meshes = [];
  model.traverse(o => { if (o.isMesh) meshes.push(o); });
  chair = { root, pivot, tint, neutral, target: neutral.clone(), meshes, heightUnits: size.y, widthUnits: Math.max(size.x, size.z) * 1.25, depthUnits: size.z };
}

/* The armchair ships as ONE mesh with no named parts, so there is nothing to attach a socket
 * to. It is measured with rays instead, the way a game does: straight down for the seat's
 * surface, horizontally inward for the armrests' inner faces. That is where the seat's line
 * and the gap's centre come from — not from constants eyeballed off a screenshot. */
function measureChairSocket() {
  if (!chair?.root.visible || !_ray) return null;
  chair.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(chair.root);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const cast = (origin, dir) => {
    _ray.set(origin, dir);
    _ray.far = size.length() * 2;
    const hits = _ray.intersectObjects(chair.meshes, false);
    return hits.length ? hits[0].point.clone() : null;
  };
  const DOWN = new THREE.Vector3(0, -1, 0), RIGHT = new THREE.Vector3(1, 0, 0), LEFT = new THREE.Vector3(-1, 0, 0);
  // Down from above the middle; if that lands on the backrest, try further forward.
  let seat = null;
  for (const f of [0, 0.25, -0.25, 0.4, -0.4]) {
    const p = cast(new THREE.Vector3(c.x, box.max.y + size.y, c.z + f * size.z), DOWN);
    if (p && p.y < box.min.y + size.y * 0.7) { seat = p; break; }
  }
  if (!seat) return null;
  const y = seat.y + size.y * 0.12; // armrest height, above the cushion
  const l = cast(new THREE.Vector3(box.min.x - size.x, y, seat.z), RIGHT);
  const r = cast(new THREE.Vector3(box.max.x + size.x, y, seat.z), LEFT);
  /* Y la cara del sillón que mira a la cámara a esa altura (el respaldo): desde adelante
   * hacia atrás. Su cuerpo tiene que quedar DELANTE de esa cara, o el respaldo se le dibuja
   * encima. No importa hacia dónde mire el sillón: lo que cuenta es dónde está la primera
   * superficie que ve la cámara. */
  const BACK = new THREE.Vector3(0, 0, -1);
  const face = cast(new THREE.Vector3(c.x, y, box.max.z + size.z), BACK);
  /* Y la cara de adelante a la altura de los pies: ahí es donde una persona sentada los
   * apoya (delante del faldón), no dentro del hueco bajo el asiento. */
  const front = cast(new THREE.Vector3(c.x, box.min.y + size.y * 0.04, box.max.z + size.z * 2), BACK);
  chair.socket = {
    seatWorldY: seat.y,
    seatWorldZ: seat.z,
    gapCenterWorldX: l && r ? (l.x + r.x) / 2 : c.x,
    gapWidthWorld: l && r ? Math.abs(r.x - l.x) : null,
    faceWorldZ: face ? face.z : null,
    frontWorldZ: front ? front.z : box.max.z
  };
  return chair.socket;
}

/* --------------------------------------------------- colisiones (Rapier) -- */

async function loadPhysics() {
  try {
    const mod = await import(RAPIER_URL);
    await mod.init();
    RAPIER = mod;
    // Sin gravedad: su movimiento lo manda la animación; el mundo sólo responde preguntas.
    const world = new mod.World({ x: 0, y: 0, z: 0 });
    const floorBody = world.createRigidBody(mod.RigidBodyDesc.fixed());
    phys = {
      world, floorBody,
      floor: world.createCollider(mod.ColliderDesc.cuboid(30, 0.5, 30), floorBody),
      chairBody: world.createRigidBody(mod.RigidBodyDesc.fixed()),
      chair: null,
      pushRoot: new THREE.Vector3()   // cuánto la movió la colisión en el cuadro (ver data-push-root)
    };
    return true;
  } catch (err) {
    RAPIER = null; phys = null;
    return false;
  }
}

/* El sillón entra al mundo tal como se ve: un trimesh con su transformación mundial ya
 * cocida (es estático). Se rehace cuando el layout lo mueve o lo redimensiona, y el
 * suelo se pone en la línea de sus pies. */
function buildChairCollider() {
  if (!phys) return;
  if (phys.chair) { phys.world.removeCollider(phys.chair, true); phys.chair = null; }
  if (!chair?.root.visible || !current) return;
  chair.root.updateMatrixWorld(true);
  const verts = [], idx = [];
  const v = new THREE.Vector3();
  let base = 0;
  chair.root.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      verts.push(v.x, v.y, v.z);
    }
    const index = o.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(base + i);
    base += pos.count;
  });
  if (!idx.length) return;
  phys.chair = phys.world.createCollider(
    RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)),
    phys.chairBody
  );
  phys.floorBody.setTranslation({ x: 0, y: current.feetY - 0.5, z: 0 }, true);
  phys.world.step(); // las consultas viven del pipeline que arma el step
}

/* Sus cápsulas, leídas de los huesos YA posados: cadera→cuello, cabeza, muslos,
 * espinillas, pies y BRAZOS. Los brazos importan: con ellos fuera de la lista, un codo
 * dentro del apoyabrazos era invisible para la métrica. */
const handFrom = (elbow, len) => {
  if (!elbow) return null;
  const up = new THREE.Vector3().setFromMatrixColumn(elbow.matrixWorld, 1).normalize();  // eje Y del hueso
  return elbow.getWorldPosition(new THREE.Vector3()).addScaledVector(up, len);
};

function herCapsules() {
  const out = [];
  const P = b => (b ? b.getWorldPosition(new THREE.Vector3()) : null);
  const hips = P(current.hips), neck = P(current.neck), head = P(current.head);
  const kneeL = P(current.knee), footL = P(current.foot);
  const kneeR = P(current.kneeR), footR = P(current.footR);
  if (hips && neck) out.push({ a: hips, b: neck, r: PHYS.torsoR, part: 'body' });
  if (head) out.push({ a: head, b: head, r: PHYS.headR, part: 'body' });
  if (hips && kneeL) out.push({ a: hips, b: kneeL, r: PHYS.thighR, part: 'body' });
  if (hips && kneeR) out.push({ a: hips, b: kneeR, r: PHYS.thighR, part: 'body' });
  if (kneeL && footL) { out.push({ a: kneeL, b: footL, r: PHYS.shinR, part: 'leg', foot: current.foot }); out.push({ a: footL, b: footL, r: PHYS.footR, part: 'leg', foot: current.foot }); }
  if (kneeR && footR) { out.push({ a: kneeR, b: footR, r: PHYS.shinR, part: 'leg', foot: current.footR }); out.push({ a: footR, b: footR, r: PHYS.footR, part: 'leg', foot: current.footR }); }
  for (const [sh, el] of [[current.shoulderL, current.elbowL], [current.shoulderR, current.elbowR]]) {
    const S = P(sh), E = P(el);
    if (!S || !E) continue;
    out.push({ a: S, b: E, r: PHYS.armR, part: 'brazo' });                  // brazo
    out.push({ a: E, b: E, r: PHYS.foreR, part: 'codo' });                  // el codo, cubra donde cubra el antebrazo
    const hand = handFrom(el, S.distanceTo(E) * 0.85);                     // antebrazo hacia la mano
    if (!hand) continue;
    out.push({ a: E, b: hand, r: PHYS.foreR, part: 'antebrazo' });
    out.push({ a: hand, b: hand, r: PHYS.handR, part: 'mano' });
  }
  return out;
}

// Mueve un pie (su hueso) por un vector del mundo: el mismo camino que placeFeet().
function pushFoot(foot, dir, depth) {
  foot.getWorldPosition(SIT_V3);
  SIT_V3.addScaledVector(dir, depth);
  foot.position.copy(foot.parent.worldToLocal(SIT_V3));
}

/* La resolución: se muestrean las cápsulas, se proyecta cada muestra contra el sillón y
 * el suelo, y se corrige — el cuerpo empuja la RAÍZ, las piernas empujan su propio pie.
 * Se itera, porque al corregir un punto se destapa otro. Devuelve el solape RESIDUAL
 * (una última pasada que sólo mide): eso es lo que se dibuja, y lo que el test exige. */
function scanContacts(apply) {
  const sample = new THREE.Vector3(), dir = new THREE.Vector3(), push = new THREE.Vector3(), insidePush = new THREE.Vector3();
  const footPushes = new Map();   // un pie puede tocar por varias muestras: se suman, no se pisan
  let worst = 0;
  for (const cap of herCapsules()) {
    for (let s = 0; s <= PHYS.samples; s++) {
      sample.copy(cap.a).lerp(cap.b, s / PHYS.samples);
      for (const collider of [phys.chair, phys.floor]) {
        const proj = phys.world.projectPoint(sample, false, undefined, undefined, collider);
        if (!proj || !proj.point) continue;
        /* Dirección: `projectPoint` da el punto MÁS CERCANO de la superficie, así que
         * (punto − muestra) apunta HACIA la superficie. Si la muestra está dentro, salir es
         * ir hacia ese punto; si está fuera pero a menos del radio, salir es lo contrario.
         * Usar el mismo signo en los dos casos empujaba a Lía DENTRO del sillón (y era el
         * origen del bamboleo de los pies y del roce del brazo que no bajaba de 7 px). */
        dir.set(proj.point.x - sample.x, proj.point.y - sample.y, proj.point.z - sample.z);
        const dist = dir.length();
        if (dist > cap.r || dist < 1e-5) continue;   // su superficie no llega, o está justo en ella
        dir.multiplyScalar((proj.isInside ? 1 : -1) / dist);
        const depth = Math.min(PHYS.maxPush, proj.isInside ? dist + cap.r : cap.r - dist);
        if (depth <= 0) continue;
        // Nunca se resuelve hacia abajo: dentro de un sólido la superficie más cercana puede
        // ser su cara de abajo, y empujarla ahí la hunde más (el suelo es el que la sostiene).
        if (dir.y < -0.2) continue;
        // Una superficie que la empuja hacia arriba es donde se APOYA (asiento, suelo,
        // apoyabrazos): eso no es un obstáculo que deba apartarla.
        const isLeg = cap.part === 'leg';
        const isBody = cap.part === 'body';
        if (!isLeg && dir.y > PHYS.floorLike) continue;
        worst = Math.max(worst, depth);
        if (depth >= (scanContacts.worstDepth || 0)) { scanContacts.worstDepth = depth; scanContacts.worstPart = cap.part; scanContacts.worstDir = dir.clone(); }
        if (!apply) continue;
        // El cuerpo empuja la raíz entera; un brazo sólo la empuja un poco (si un codo no
        // cabe, lo que hay que mover es el brazo, no a ella del asiento).
        if (!isLeg) {
          // Un roce del brazo NO mueve la raíz (arrastraba a Lía unos px por cuadro y no
          // volvía); sólo un brazo bien metido (más de ~8 px) la aparta un poco.
          const weight = isBody ? 1 : (depth > 0.07 ? 0.35 : 0);
          const amount = depth * weight;
          if (amount > 0 && proj.isInside) insidePush.addScaledVector(dir, amount);   // metida de verdad: sale como pueda
          else if (amount > 0) push.addScaledVector(dir, amount);
        } else if (cap.foot) {
          const acc = footPushes.get(cap.foot) || new THREE.Vector3();
          acc.addScaledVector(dir, depth);
          footPushes.set(cap.foot, acc);
        }
      }
    }
  }
  let moved = false;
  if (apply) {
    scanContacts.log = [];
    push.y *= PHYS.bodyUp;   // apartarla, no levantarla: subirla la haría flotar sobre el sillón
    /* Una muestra DENTRO del sólido puede estar atrapada (un empujón la mete entre el
     * apoyabrazos y el respaldo): ahí sí se deja salir hacia arriba, o no sale nunca. */
    insidePush.y *= insidePush.y > 0 ? 1.15 : 0.15;
    for (const [foot, acc] of footPushes) {
      if (acc.length() > PHYS.maxPush) acc.setLength(PHYS.maxPush);
      scanContacts.log.push({ part: 'foot', dir: acc.clone().normalize(), depth: acc.length() });
      pushFoot(foot, acc, 1);
      moved = true;
    }
    if (push.lengthSq() > 0 || insidePush.lengthSq() > 0) {
      push.add(insidePush);
      scanContacts.log.push({ part: 'root', dir: push.clone().normalize(), depth: push.length() });
      current.body.position.add(push);
      phys.pushRoot.add(push);   // el empuje del cuadro, publicado como data-push-root
      current.body.updateMatrixWorld(true);   // las cápsulas se leen de las matrices
      moved = true;
      scanContacts.pushedRoot = true;
    } else scanContacts.pushedRoot = false;
  }
  scanContacts.moved = moved;
  return worst;
}

function resolvePhysics() {
  if (!phys?.chair || !current) return 0;
  phys.pushRoot.set(0, 0, 0);
  let pushed = false;
  for (let it = 0; it < PHYS.iterations; it++) {
    scanContacts(true);
    pushed = pushed || scanContacts.pushedRoot;
    if (!scanContacts.moved) break;
  }
  scanContacts.worstDepth = 0; scanContacts.worstPart = '';   // la medida del residuo, limpia
  const residual = scanContacts(false); // el residuo, ya corregido
  phys.rootPushed = pushed;
  return residual;
}


/* The armchair wears the quotation's fabric: FABRIC_SELECTED's payload, or the
 * context's fabric when the layer (re)starts. No fabric → the chair as shipped. */
function applyChairFabric(fabric) {
  if (!chair) return;
  const color = fabric && typeof fabric.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(fabric.color) ? fabric.color : null;
  chair.target = color ? new THREE.Color(color) : chair.neutral.clone();
  stage.dataset.chairFabric = color ? String(fabric.name || '') : '';
  if (reducedMotion) { chair.tint.copy(chair.target); renderOnce(); }
}
const contextFabric = () => {
  if (typeof ACI === 'undefined') return null;
  const f = ACI.context().fabric;
  return f ? Store.all('fabrics').find(x => String(x.id) === String(f.id)) || null : null;
};

/* ------------------------------------------------------------- reactions -- */

const chairRect = () => (layout?.chairX != null ? { left: layout.chairX - 1, top: layout.chairY - 1, width: 2, height: 2 } : null);
const REACTIONS = {
  FURNITURE_SELECTED: { name: 'look-selection', look: 'selection', rect: () => document.querySelector('.furniture-card.selected')?.getBoundingClientRect() || null },
  PHOTOS_CHANGED: { name: 'look-uploader', look: 'uploader', ms: 2000, rect: () => $('uploadZone')?.getBoundingClientRect() || null },
  FABRIC_SELECTED: { name: 'look-armchair', look: 'armchair', ms: 2600, rect: chairRect, clip: 'Interact' },
  QUOTE_SUBMITTED: { name: 'wave-thanks', clip: 'Wave' }
};

function setThinking(on) {
  thinking = !!on;
  if (stage) stage.dataset.thinking = thinking ? 'on' : 'off';
}

/* ----------------------------------------------------------- what she sees -- */

/* What the customer TOUCHES is an intention, so it is worth a head turn; where the
 * cursor merely passes (hover) is not, and the old build watched both. Rate-limited,
 * and outranked by a reaction (the click that picked a fabric cannot take her eyes
 * off the armchair) and by the customer's chat (then she faces them). */
let lastHandsAt = -Infinity;
function glanceLabel(el) {
  if (!el) return '';
  if (el.id) return el.id;
  if (el.dataset && el.dataset.furniture) return el.dataset.furniture;
  if (typeof el.value === 'string' && el.value) return el.value;
  const text = el.closest?.('label')?.querySelector('span')?.textContent?.trim();
  if (text) return text;
  return el.closest?.('[id]')?.id || el.tagName?.toLowerCase() || '';
}

function followHands(target) {
  if (broken || !layout || reducedMotion || state === 'talking') return;
  if (!target || typeof target.closest !== 'function') return;
  // Outside the wizard (the chat, the assistant's own hit area) is not the form.
  if (!target.closest('.workspace') || target.closest('#chatPanel, .assistant-stage, .assistant-hit')) return;
  const now = performance.now();
  if (glance && now < (glance.lock || 0)) return;
  if (now - lastHandsAt < HANDS_MIN_MS) return;
  const el = target.closest('button,label,input,select,textarea,.furniture-card,.fabric-card,.photo-thumb') || target;
  lastHandsAt = now;
  glance = { source: 'hands', rect: () => el.getBoundingClientRect(), until: now + HANDS_MS };
  if (stage) stage.dataset.glance = glanceLabel(el);
}

function onAciEvent(detail) {
  const { type, payload = {} } = detail || {};
  if (broken || !Store.assistant().enabled) return;
  alive(); // un paso del cotizador también es una señal de vida
  // State the presence mirrors whether or not it reacts.
  if (type === 'FABRIC_SELECTED') applyChairFabric(payload);
  if (type === 'ANALYSIS_STARTED') setThinking(true);
  if (type === 'ANALYSIS_COMPLETED') setThinking(false);
  // A new step is a new place: look at it instead of at the "Continuar" just clicked.
  if (type === 'STEP_CHANGED') { glance = null; if (stage) delete stage.dataset.glance; }
  const reaction = REACTIONS[type];
  if (!reaction || payload.auto) return; // the automatic best match is not a customer action
  // One customer action can publish several events: keep the first, react once.
  if (!queuedReaction) queuedReaction = reaction;
  clearTimeout(queueTimer);
  queueTimer = setTimeout(flushReaction, COALESCE_MS);
}

function flushReaction() {
  const reaction = queuedReaction;
  queuedReaction = null;
  if (!reaction || !stage) return;
  const typing = typeof ACI !== 'undefined' && ACI.isTyping();
  const allowed = running && !!layout && !reducedMotion && !broken && !!budget && budget.allow(performance.now(), typing);
  if (!allowed) { stage.dataset.reactionsSuppressed = String(++suppressedCount); return; }
  const now = performance.now();
  if (reaction.rect) {
    glance = { source: 'reaction', rect: reaction.rect, until: now + (reaction.ms || GLANCE_MS), lock: now + GLANCE_LOCK_MS };
    if (stage) stage.dataset.glance = reaction.look || reaction.name;
  }
  if (reaction.clip) play(reaction.clip, 0.25);
  stage.dataset.reaction = reaction.name;
  stage.dataset.reactions = String(++reactionCount);
}

/* ------------------------------------------------------------- character -- */

function arc(points, radius, color) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 6, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 })
  );
}

// Hides the frowning brows and adds a smile + soft raised brows, parented to the Head bone.
function addFriendlyFace(root, face) {
  const head = root.getObjectByName('Head');
  let browColor = new THREE.Color(0x2a1a12);
  root.traverse(o => {
    if (o.isMesh && [].concat(o.material).some(m => m.name === face.browMaterial)) {
      browColor = [].concat(o.material)[0].color.clone();
      o.visible = false;
    }
  });
  const group = new THREE.Group();
  const { y, z, halfWidth: w, lift } = face.mouth;
  group.add(arc([
    new THREE.Vector3(-w, y + lift, z - 0.012),
    new THREE.Vector3(-w * 0.5, y + lift * 0.15, z - 0.002),
    new THREE.Vector3(0, y, z),
    new THREE.Vector3(w * 0.5, y + lift * 0.15, z - 0.002),
    new THREE.Vector3(w, y + lift, z - 0.012)
  ], 0.0045, 0x5a2620));
  const b = face.brow;
  for (const side of [-1, 1]) {
    group.add(arc([
      new THREE.Vector3(side * b.inner, b.y, b.z),
      new THREE.Vector3(side * (b.inner + (b.outer - b.inner) * 0.55), b.y + b.arch, b.z - 0.006),
      new THREE.Vector3(side * b.outer, b.y + b.arch * 0.2, b.z - 0.02)
    ], 0.0045, browColor));
  }
  head.add(group);
}

async function loadCharacter(kind) {
  const def = CHARACTERS[kind];
  loadingKind = kind;
  const gltf = await parseModel(def.model);
  if (loadingKind !== kind) return; // a newer choice arrived while parsing
  if (current) { scene.remove(current.body); disposeObject(current.body); }
  const root = gltf.scene;
  addFriendlyFace(root, FACES[kind]);
  const body = new THREE.Group(); // pivot for the body turn; Quaternius models already face +Z (the camera)
  body.add(root);
  scene.add(body);

  const mixer = new THREE.AnimationMixer(root);
  const actions = Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)]));
  for (const name of ['Wave', 'Interact']) {
    actions[name].setLoop(THREE.LoopOnce, 1);
    actions[name].clampWhenFinished = true;
  }
  mixer.addEventListener('finished', () => play('Idle_Neutral'));

  // Measure the posed body (skinned vertices), not the bind pose.
  actions.Idle_Neutral.play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);

  const materials = [];
  root.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => def.suitMaterials.includes(m.name) && materials.push(m)); });
  current = {
    kind, root, body, mixer, actions, materials, active: actions.Idle_Neutral,
    head: findBone(root, 'Head'), neck: findBone(root, 'Neck'),
    hips: findBone(root, 'Hips'),
    sitBones: Object.fromEntries(SIT_BONES.map(n => [n, findBone(root, n)]).filter(([, b]) => b)),
    originalColors: materials.map(m => m.color.clone()),
    feetY: box.min.y, bodyH: box.max.y - box.min.y, rearZ: box.min.z,
    /* Hasta dónde llega el zapato hacia adelante (la punta es el punto más al frente del
     * modelo: 0.255 u medidos en Lía). Con la cámara inclinada eso se DIBUJA más abajo que el
     * tobillo, y es lo que dimensiona el hueco bajo la línea del suelo — ver `floorRoom` en
     * place(). Medido en el ciclo completo: 12 px bajo la línea en el peor cuadro. */
    shoeZ: box.max.z - box.min.z
  };
  // Where her hip joint is while standing, in model units above her feet: what has to
  // come down for her to land on the armchair's seat.
  SIT_V3.set(0, 0, 0);
  if (current.hips) current.hips.getWorldPosition(SIT_V3);
  current.hipY = current.hips ? SIT_V3.y - box.min.y : (box.max.y - box.min.y) * 0.55;
  /* The leg, measured on the rig itself — segment lengths are what the seated IK is
   * arithmetic on. Assuming human proportions here is how a pose ends up hovering.
   * Two traps in THIS asset, both found by dumping the node tree instead of trusting
   * names: the upper leg hangs off `Body` (not `Hips`), and the feet are parented to
   * `Root` — `LowerLeg.L` is a leaf, so a bent shin does not carry the foot with it.
   * The lengths are still the right ones (rest knee → rest ankle), which is all the IK
   * needs; the welded feet are a rig defect, documented in assets/assistant/README.md. */
  current.leg = { thigh: 0, shin: 0, ankle: 0 };
  const upper = findBone(root, 'UpperLeg.L');
  const knee = upper?.children.find(c => /LowerLeg/i.test(c.name));
  const ankle = findBone(root, 'Foot.L');
  if (upper && knee && ankle) {
    const P = new THREE.Vector3(), Q = new THREE.Vector3(), R = new THREE.Vector3();
    upper.getWorldPosition(P); knee.getWorldPosition(Q); ankle.getWorldPosition(R);
    current.leg = { thigh: P.distanceTo(Q), shin: Q.distanceTo(R), ankle: R.y - box.min.y };
    current.knee = knee; current.foot = ankle;
  }
  const otherFoot = findBone(root, 'Foot.R');
  current.feet = [current.foot, otherFoot].filter(Boolean);
  /* El "arriba" del pie en su propio espacio, medido en la pose en que se carga (de pie, con
   * las suelas en el suelo): con esa referencia se lo acuesta plano al sentarla. El clip deja
   * el pie colgando — punta hacia abajo, taco hacia arriba — y eso se veía como un zapato en
   * el aire aunque el tobillo estuviera en la línea. */
  current.footUp = {};
  {
    const q = new THREE.Quaternion();
    for (const [side, bone] of [['L', current.foot], ['R', otherFoot]]) {
      if (!bone) continue;
      bone.getWorldQuaternion(q);
      current.footUp[side] = new THREE.Vector3(0, 1, 0).applyQuaternion(q.invert()).normalize();
    }
  }
  // La otra pierna, para las cápsulas de colisión (misma resolución, sin caminar la cadena).
  const upperR = findBone(root, 'UpperLeg.R');
  current.kneeR = upperR?.children.find(c => /LowerLeg/i.test(c.name)) || null;
  current.footR = otherFoot || null;
  // Brazos, para las cápsulas de colisión (hombro y codo de cada lado) y para apoyar las
  // manos: la muñeca es donde termina el brazo visible.
  current.shoulderL = findBone(root, 'Shoulder.L'); current.elbowL = findBone(root, 'LowerArm.L');
  current.shoulderR = findBone(root, 'Shoulder.R'); current.elbowR = findBone(root, 'LowerArm.R');
  current.wristL = findBone(root, 'Wrist.L'); current.wristR = findBone(root, 'Wrist.R');
  /* Los brazos, medidos en el rig como las piernas: la IK de las manos es aritmética con
   * estas dos longitudes (hombro→codo y codo→muñeca), no con proporciones supuestas. */
  current.armSeg = {};
  for (const [side, sh, el, wr] of [['L', current.shoulderL, current.elbowL, current.wristL], ['R', current.shoulderR, current.elbowR, current.wristR]]) {
    if (!sh || !el || !wr) continue;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    sh.getWorldPosition(A); el.getWorldPosition(B); wr.getWorldPosition(C);
    current.armSeg[side] = { upper: A.distanceTo(B), fore: B.distanceTo(C) };
  }
  /* --- TEMPORAL: API de diagnóstico (banco de pruebas del zapato; NO commitear) ---
   * Se expone solo si la página la pide (`#assistantStage[data-dbg-api]`) y sirve para mirar la
   * jerarquía REAL de three.js — mallas, esqueleto, materiales, cámara — y para aislar piezas.
   * Sin la marca no existe: `window.__aci` queda undefined. */
  if (stage.dataset.dbgApi) {
    window.__aci = {
      THREE, scene, camera, renderer, stage,
      get current() { return current; },
      get chair() { return chair; },
      get layout() { return layout; },
      place: () => place(),
    };
  }
}

/* three's GLTFLoader runs node names through PropertyBinding.sanitizeNodeName(), which
 * drops reserved characters — the rig's 'UpperLeg.L' arrives as 'UpperLegL'. Try both
 * spellings, or a bone is silently missing and the pose half-applies. */
const findBone = (root, name) => root.getObjectByName(name) || root.getObjectByName(name.replace(/[.\s]/g, ''));

function play(name, fade = 0.35) {
  if (!current) return;
  const next = current.actions[name];
  if (!next || current.active === next) return;
  next.reset().play();
  current.active.crossFadeTo(next, fade, false);
  current.active = next;
}

function applyBrandSuit(on) {
  if (!current) return;
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  current.materials.forEach((m, i) => {
    if (on && ink) m.color.set(ink); else m.color.copy(current.originalColors[i]);
  });
}

/* ---------------------------------------------------------------- layout -- */

// Stands the character on the help card's line, as tall as the free space allows.
function place() {
  if (!current || broken) return;
  const j = journey.getBoundingClientRect();
  if (innerWidth <= MOBILE_MAX || !j.width || !Store.assistant().enabled) { hideLayer(); return; }
  stage.hidden = hit.hidden = false;
  // Test hook (and the way to tell a stale page from a real regression): which compositing
  // this build runs. Two passes meant she was always painted over the chair.
  stage.dataset.render = 'one-pass';

  const floorY = helpCard.getBoundingClientRect().top;
  const steps = stepList.getBoundingClientRect();
  const labelsRight = Math.max(...[...stepList.querySelectorAll('li > div')].map(d => {
    const r = document.createRange(); r.selectNodeContents(d); return r.getBoundingClientRect().right;
  }));
  // Below the step list is always free. Beside it only as tall as still fits right of the labels.
  const belowH = floorY - steps.bottom - 6;
  const besideH = Math.min(floorY - (steps.top + steps.height * 0.35), (j.right - EDGE - labelsRight - GAP) / BODY_W);
  const heightPx = Math.round(Math.min(MAX_H, Math.max(MIN_H, belowH, besideH)) * SCALE);

  // Hug the sidebar's right edge, and center "Preguntar" under the feet.
  const centerX = Math.round(j.right - EDGE - heightPx * BODY_W / 2);
  const ask = helpCard.querySelector('.text-button');
  if (ask) ask.style.marginRight = `${Math.max(0, Math.round(j.right - centerX - ask.offsetWidth / 2 - parseFloat(getComputedStyle(journey).paddingRight)))}px`;
  const unitsPerPx = current.bodyH / heightPx;
  /* El lienzo termina POR DEBAJO de la línea del suelo, no a 2 px: con la cámara inclinada, todo
   * lo que está más cerca (z mayor) se dibuja más abajo, y el zapato es lo más cercano que hay.
   * Medido en el ciclo completo a 1919×1149: en el peor cuadro (`settle`) el tobillo va 16 px
   * bajo la línea y la punta suma otros ~16 — 32 px de zapato, con 14 px fijos quedaba a 2-3 px
   * del borde y con el redondeo de DPR se veía cortado. El hueco se DERIVA del alcance del zapato
   * en el modelo (0.355 u, la punta es el punto más al frente) por 1.5 (el peor cuadro medido
   * equivale a ~0.53 u de profundidad) y de la escala de la figura, más `FLOOR_MARGIN` de aire:
   * sirve en cualquier ventana y para cualquier personaje. */
  const shoeDropPx = (current.shoeZ * 1.5 * Math.abs(Math.sin(CHAIR_ELEVATION))) / unitsPerPx;
  const floorRoom = Math.max(FLOOR_ROOM, Math.ceil(shoeDropPx + FLOOR_MARGIN));
  const height = Math.round(heightPx * (1 + HEAD_ROOM)) - 2 + floorRoom;
  const top = floorY - height + floorRoom;
  let left = centerX - Math.round(heightPx * (BODY_W + SIDE_ROOM * 2) / 2);
  const right = centerX + Math.round(heightPx * (BODY_W + SIDE_ROOM * 2) / 2);

  // Real armchairs are ~half a person's height; shrink it rather than let it cover a step.
  let chairX = null;
  if (chair) {
    const padL = parseFloat(getComputedStyle(journey).paddingLeft);
    const chairPx = Math.min(heightPx * 0.5, floorY - steps.bottom - 10);
    chair.root.visible = chairPx >= 40;
    if (chair.root.visible) {
      const chairWpx = chairPx * chair.widthUnits / chair.heightUnits;
      const chairCenter = Math.max(j.left + padL + chairWpx / 2, centerX - heightPx * BODY_W / 2 - chairWpx / 2 - 4);
      /* Placed in the character's own world units, so the shared camera sees it exactly
       * where its own camera used to draw it. py is where the chair's origin (its base
       * centre) lands: the tilt pushes the front of the base DOWN the screen by half the
       * chair's depth, so that is what has to sit on the floor line — the chair keeps the
       * spot it always had. `frame` keeps the screen mapping for the seat's line. */
      const pxPerUnit = chairPx / chair.heightUnits;
      const py = floorY - (chair.depthUnits / 2) * Math.sin(CHAIR_ELEVATION) * pxPerUnit;
      chair.frame = { u: chair.heightUnits / chairPx, px: chairCenter, py };
      chair.root.position.set((chairCenter - centerX) * unitsPerPx, (floorY - py) * unitsPerPx + current.feetY, 0);
      chair.root.scale.setScalar(pxPerUnit * unitsPerPx);
      chair.frame.socket = measureChairSocket();
      buildChairCollider();
      stage.dataset.socket = chair.frame.socket
        ? `${Math.round(floorY - (chair.frame.socket.seatWorldY - current.feetY) / unitsPerPx)}|${Math.round(centerX + chair.frame.socket.gapCenterWorldX / unitsPerPx)}|${chair.frame.socket.gapWidthWorld ? Math.round(chair.frame.socket.gapWidthWorld / unitsPerPx) : '-'}|${chair.frame.socket.faceWorldZ != null ? chair.frame.socket.faceWorldZ.toFixed(3) : '-'}`
        : '';
      left = Math.min(left, Math.floor(chairCenter - chairWpx * 0.7));
      chairX = chairCenter;
    } else buildChairCollider();
  }
  const width = right - left;
  layout = { heightPx, floorY, left, top, width, height, centerX, headY: top + heightPx * (HEAD_ROOM + 0.07), chairX, chairY: floorY - heightPx * 0.2 };
  // What sitting down needs, in the same units the camera uses: how far left the chair is,
  // how far her hip has to drop to reach the seat, and where that seat is on screen.
  /* El suelo de esta escena es una LÍNEA en pantalla, no un plano a la vista, y la cámara
   * mira inclinada: lo que está más cerca (z mayor) se dibuja MÁS ABAJO. El sillón compensa
   * su propio frente al colocarse (py usa `sin(CHAIR_ELEVATION)`); lo que se apoya en el
   * suelo tiene que compensar igual. Los pies no lo hacían y con z ≈ 0.56 aparecían 23 px por
   * debajo de la línea — fuera del lienzo, que es "no tiene pies" cuando se sienta. */
  const upTilt = v => v * Math.sin(CHAIR_ELEVATION) / unitsPerPx;   // px hacia abajo por z
  sitGeom = null;
  if (chair?.root.visible && chair.frame && current.hipY) {
    const { u, px, py } = chair.frame;
    const sock = chair.frame.socket;
    // The seat's line and the gap's centre come from the chair's own geometry when the
    // rays find them (`data-socket`), and fall back to the marker-measured constants
    // if they don't (a mesh that moves under the rays, an odd viewport).
    const seatY = sock ? floorY - (sock.seatWorldY - current.feetY) / unitsPerPx + upTilt(sock.seatWorldZ ?? 0)
                       : py - SEAT_ABOVE_PY * (chair.heightUnits / u);
    const seatCenterX = sock ? centerX + sock.gapCenterWorldX / unitsPerPx : chairX + SEAT_X_OFFSET;
    const hipStandingY = floorY - current.hipY / unitsPerPx;
    const hipOnSeatPx = HIP_ON_SEAT_UNITS / unitsPerPx;   // el contacto, en píxeles de ESTA ventana
    /* Y en profundidad: su parte trasera (su propia caja, medida al cargar) tiene que quedar
     * delante de la cara del respaldo. Con las dos raíces en Z=0 su espalda arrancaba dentro
     * del respaldo y este se le dibujaba por encima de la cadera. */
    const rear = current.rearZ ?? 0;
    const dzUnits = sock?.faceWorldZ != null ? Math.max(0, sock.faceWorldZ + 0.01 - rear) : 0;
    /* Y los pies DELANTE del faldón, sobre el suelo: el hueco bajo el asiento no es sitio
     * para unos pies (la colisión los rebotaría entre el faldón y la parte de atrás). */
    const footZ = sock?.frontWorldZ != null ? sock.frontWorldZ + PHYS.shinR * 1.9 : null;
    const approachZ = sock?.frontWorldZ != null ? sock.frontWorldZ + 0.25 : dzUnits;
    sitGeom = {
      dxUnits: (seatCenterX - centerX + SIT_FWD.x) * unitsPerPx,
      dzUnits,
      approachZ,
      footZ,
      /* El tobillo, a la altura que proyecta SOBRE la línea del suelo para su propia z (la
       * compensación de la inclinación), MÁS lo que hay del tobillo a la suela: lo que se
       * apoya en la línea es la SUELA, y con el tobillo justo en ella el pie quedaba medio
       * fuera del lienzo por abajo (2 px más abajo) y no se leía como un pie. `leg.ankle` es
       * esa altura, medida en el rig al cargar. */
      footY: current.feetY + (footZ ?? 0) * Math.sin(CHAIR_ELEVATION) + (current.leg?.ankle || 0),
      rearZ: rear + dzUnits,
      dropUnits: Math.max(0, (seatY - hipOnSeatPx + SIT_FWD.y) - hipStandingY) * unitsPerPx,
      seatY: Math.round(seatY)
    };
    stage.dataset.seat = String(sitGeom.seatY);
    stage.dataset.chairX = String(Math.round(chairX));
    if (sock?.faceWorldZ != null) stage.dataset.sitZ = `${sock.faceWorldZ.toFixed(3)}|${sitGeom.rearZ.toFixed(3)}`;
  }
  // Test hooks: where her head is and where the top of her hair is, in viewport pixels.
  stage.dataset.headY = String(Math.round(layout.headY));
  stage.dataset.crown = String(Math.round(floorY - heightPx));
  placeNotice();

  Object.assign(stage.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  Object.assign(hit.style, { left: `${centerX - heightPx * 0.16}px`, top: `${floorY - heightPx}px`, width: `${heightPx * 0.32}px`, height: `${heightPx}px` });
  renderer.setSize(width, height, false);

  /* Frustum in model units: character height maps to heightPx pixels, x=0 at the
   * character. The camera looks DOWN by CHAIR_ELEVATION — that view is what makes the
   * armchair read as a chair, and now that the two share one scene it has to be the view
   * for both, or the chair occludes her at the wrong places (its cushion's front lip ate
   * her lap). The vertical extent is scaled by cos(tilt), so the pixel mapping — and every
   * constant built on it — stays exactly what it was. */
  const cosTilt = Math.cos(CHAIR_ELEVATION);
  camera.left = (left - centerX) * unitsPerPx; camera.right = (right - centerX) * unitsPerPx;
  camera.bottom = (current.feetY - floorRoom * unitsPerPx) * cosTilt;
  camera.top = camera.bottom + height * unitsPerPx * cosTilt;
  camera.position.set(0, Math.sin(CHAIR_ELEVATION) * 10, Math.cos(CHAIR_ELEVATION) * 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  bandChat();
  if (reducedMotion) renderOnce();
}

/* ------------------------------------------------------------------ look -- */

/* Where the character looks: a reaction's target while it lasts, the customer
 * while talking, a thinking pose during the review, otherwise the step title. */
function lookTarget() {
  // A reaction always wins. A head turned by a click gives way to the customer
  // while the chat is open — then she faces them, not the form behind them.
  if (glance && performance.now() < glance.until && (glance.source === 'reaction' || state !== 'talking')) {
    const r = glance.rect();
    if (r) return r;
  }
  if (state === 'talking') return null;
  if (thinking) return THINKING;
  const el = document.querySelector('.wizard-step.active .step-heading h2');
  return el ? el.getBoundingClientRect() : null;
}

const _m = () => new THREE.Matrix4();
let M, AXIS, DQ, WORLD_Y, WORLD_X;
// Rotates a bone about an arbitrary WORLD axis, expressed in the bone's own frame (survives
// any scale or mirroring in the rig). A mirrored gesture or a leg IK plane turned by the
// body's yaw needs an axis that is not X or Y.
function rotateAboutWorld(bone, axis, angle) {
  if (!angle) return;
  bone.updateWorldMatrix(true, false);
  const mirror = Math.sign(bone.matrixWorld.determinant()) || 1;
  M.copy(bone.matrixWorld).invert();
  AXIS.copy(axis).transformDirection(M);
  bone.quaternion.multiply(DQ.setFromAxisAngle(AXIS, angle * mirror));
  bone.updateWorldMatrix(false, false);
}

// The common case: a turn (world Y) and a tip forward/back (world X).
function rotateBoneWorld(bone, yaw, pitch) {
  rotateAboutWorld(bone, WORLD_Y, yaw);
  rotateAboutWorld(bone, WORLD_X, pitch);
}

function updateLook(dt) {
  const t = lookTarget();
  let yaw = 0, pitch = 0;
  if (t && t.pose) {
    yaw = t.pose.yaw;
    pitch = t.pose.pitch;
  } else if (t && layout) {
    const depth = 700;
    yaw = THREE.MathUtils.clamp(Math.atan2(t.left + t.width / 2 - layout.centerX, depth), -0.75, 0.75);
    pitch = THREE.MathUtils.clamp(Math.atan2(t.top + t.height / 2 - layout.headY, depth), -0.3, 0.3);
  }
  const k = 1 - Math.exp(-dt * 3.5); // smooth, never snappy
  lookYaw += (yaw - lookYaw) * k;
  lookPitch += (pitch - lookPitch) * k;
  // Body takes part of the turn, neck and head the rest. `bodyYaw` is the sit sequence's
  // own turn (she faces the chair to walk there, and the customer again to sit down):
  // the look adds to it instead of wiping it out.
  current.body.rotation.y = bodyYaw + lookYaw * 0.3;
  current.body.updateMatrixWorld(true);
  rotateBoneWorld(current.neck, lookYaw * 0.2, lookPitch * 0.4);
  rotateBoneWorld(current.head, lookYaw * 0.3, lookPitch * 0.6);
}

/* ---------------------------------------------------------------- render -- */

function draw() {
  renderer.clear();
  renderer.render(scene, camera); // one pass: the chair and she share one depth buffer
}

function renderOnce() {
  if (!current || !layout || broken) return;
  try { draw(); } catch (err) { fail(err); }
}

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  if (document.hidden || !current || !layout) return;
  try {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    current.mixer.update(dt);
    if (chair?.target) chair.tint.lerp(chair.target, 1 - Math.exp(-dt * 4));
    const now = performance.now();
    if (sitSeq) stepSit(now);
    else if (now - lastAlive >= idleMs() && canSit()) startSit();
    /* The mixer skips writing a bone whose keyframe value did not change, so the
     * look offset — and the sitting pose — are undone after rendering, or they
     * would pile up every frame. */
    const posed = [current.neck, current.head];
    if (sitWeight > 0.001) posed.push(...Object.values(current.sitBones), ...(current.feet || []));
    const saved = posed.map(b => [b, b.quaternion.clone(), b.position.clone()]);
    updateLook(dt);
    applySitPose();
    if (sitWeight > 0.001) placeHands(sitWeight);
    if (sitWeight > 0.001 && sitGeom) placeFeet(sitWeight);
    /* El empujón de prueba de la suite: la mete hacia el sillón sin pasar por la
     * animación, para comprobar que el paso de colisiones la deja fuera igual. */
    if (phys?.chair && layout) {
      const shove = Number(stage.dataset.shove) || 0;
      if (shove && !phys.shoved) { phys.peak = 0; phys.shoved = 1; }  // el empujón también es un episodio
      if (!shove) phys.shoved = 0;
      if (shove) {
        current.body.position.x -= shove * (layout.heightPx ? current.bodyH / layout.heightPx : 0);
        current.body.updateMatrixWorld(true);
      }
      const pen = resolvePhysics();
      const px = pen / (current.bodyH / layout.heightPx);
      /* Sentada y sin nadie empujando, vuelve sola a su sitio: los empujes de la colisión
       * desplazan la raíz y sin esto se quedaba corrida donde la dejara el último roce.
       * El sitio es el RESUELTO, no el geométrico: el blanco de `dxUnits/dzUnits` cae unos
       * píxeles dentro del apoyabrazos (su cuerpo no cabe entero en el hueco a la altura
       * del brazo), así que el muelle la metía y la resolución la sacaba — un vaivén de
       * ~3 px cada ~0.5 s que se veía como un balanceo sentada. El ancla se toma del primer
       * cuadro SENTADA y, mientras nadie la empuje a propósito, sigue a los empujes de la
       * resolución — pero sólo a los que dejan el cuadro LIMPIO (`px` ~0): si tras resolver
       * queda solape (un pie metido que la resolución no puede sacar sin pelear), el ancla no
       * se mueve y el muelle la trae de vuelta al sitio bueno en vez de quedarse en el malo.
       * Así el cuerpo se para en el borde EXTERIOR de lo que la animación mete en el sillón
       * (el clip Idle respira y se balancea) sin volver nunca a un sitio con roce: eso era el
       * balanceo — ~3 px cada ~0.5 s con el blanco geométrico, ~1.3 px cada ~2 s con el
       * ancla fija. Un empujón de prueba (`data-shove`) mueve a ella y NO al ancla. */
      if (pose === 'sitting' && !sitSeq && sitGeom && !shove && px < 0.05 && (sitGeom.restX == null || phys.rootPushed)) {
        sitGeom.restX = current.body.position.x;
        sitGeom.restZ = current.body.position.z;
      }
      /* El muelle tira hacia el ancla SIEMPRE que esté sentada (y nadie la empuje a
       * propósito): desde que el ancla es el sitio resuelto, tirar de ella y sacarla del
       * sillón son la misma dirección, así que ya no hay tira y afloja que evitar — y con el
       * empujón de prueba salía de un pozo de 6 px sólo con los topes de la resolución. */
      if (pose === 'sitting' && !sitSeq && sitGeom && !shove) {
        const k = 1 - Math.exp(-dt * 3);
        current.body.position.x += (sitGeom.restX - current.body.position.x) * k;
        current.body.position.z += (sitGeom.restZ - current.body.position.z) * k;
        /* El descenso al asiento, con el paso ACOTADO: un cuadro largo (una pestaña que se
         * atasca, el resto de la suite corriendo) hacía un salto de decenas de píxeles y la
         * hundía en el sillón de golpe — medido: 1 cuadro de más de 6 px de hondura en una
         * corrida de cada tantas, contra ~2 px en las demás. El tope es el mismo recurso que
         * `PHYS.maxPush`: sin saltos, y el muelle llega igual (unos cuadros más tarde). */
        const step = (-sitGeom.dropUnits - current.body.position.y) * k;
        const maxStep = SIT_DROP_MAX / (current.bodyH / layout.heightPx);
        current.body.position.y += Math.max(-maxStep, Math.min(maxStep, step));
      }
      /* Cuánto la movió la colisión este cuadro (en unidades del modelo): vacío es que no
       * tuvo que tocarla. Sentada y quieta tiene que quedarse vacío — si vuelve a haber
       * empujes cada medio segundo, el ancla y la colisión están peleando otra vez. */
      stage.dataset.pushRoot = phys.pushRoot.lengthSq() > 0 ? `${phys.pushRoot.x.toFixed(4)},${phys.pushRoot.z.toFixed(4)}` : '';
      stage.dataset.pen = px.toFixed(2);
      /* Y en unidades del modelo, que no dependen del tamaño de la ventana: 0.075 unidades
       * es el margen de la cápsula del brazo contra el apoyabrazos (la malla no cruza). */
      stage.dataset.penUnits = pen.toFixed(4);
      phys.peak = Math.max(phys.peak || 0, px);
      phys.peakUnits = Math.max(phys.peakUnits || 0, pen);
      stage.dataset.penPeak = phys.peak.toFixed(2);
      stage.dataset.penPeakUnits = phys.peakUnits.toFixed(4);
      /* Cuántos CUADROS pasan de 2 y de 6 px: un solape de un par de cuadros no se ve,
       * uno sostenido sí. Es la diferencia entre "nunca lo atraviesa" y "casi nunca". */
      const tr = phys.track || (phys.track = { over2: 0, over6: 0, frames: 0 });
      tr.frames++;
      if (px > 2) tr.over2++;
      if (px > 6) tr.over6++;
      stage.dataset.penFrames = `${tr.over2}|${tr.over6}|${tr.frames}`;
      const ph = (sitSeq && sitSeq.phase) || pose;
      const per = (phys.phases || (phys.phases = {}));
      if (px > (per[ph] || 0)) per[ph] = Math.round(px * 100) / 100;
      phys.phasesPart = scanContacts.worstPart || phys.phasesPart || '';
      stage.dataset.penPhases = Object.entries(per).map(([k, v]) => `${k}:${v}`).join(' ');
      stage.dataset.penPart = phys.phasesPart;
      stage.dataset.pushes = (scanContacts.log || []).slice(0, 4)
        .map(l => `${l.part}:${l.dir.x.toFixed(2)},${l.dir.y.toFixed(2)},${l.dir.z.toFixed(2)}@${l.depth.toFixed(3)}`).join(' ');
    }
    if (sitWeight > 0.001 && current.hips) reportHip();
    /* --- TEMPORAL: mapa de primer impacto por píxel (banco de pruebas; NO commitear) ---
     * Lanza rayos desde la cámara sobre la franja de los pies, en este cuadro YA posado, y
     * publica qué objeto gana cada rayo: C=sillón, S=zapato/pie, L=piernas, B=cuerpo, .=nada.
     * Es la única forma de saber qué tapa qué: un raycast fuera de este punto mediría la pose
     * restaurada. Se pone `stage.dataset.dbgRay = '1'` y el mapa queda en ese mismo atributo. */
    if (stage.dataset.dbgRay === '1') {
      const ray = new THREE.Raycaster();
      const tag = o => {
        for (let n = o; n; n = n.parent) {
          if (/ArmChair/i.test(n.name || '')) return 'C';
          if (/^Cube047/.test(n.name || '')) return 'S';
          if (/^Cube016/.test(n.name || '')) return 'L';
          if (/^Cube03/.test(n.name || '')) return 'B';
        }
        return '#';
      };
      const rows = [];
      for (let py = layout.floorY - 36; py <= layout.floorY + 10; py += 6) {
        let line = '';
        for (let px = layout.left + layout.width * 0.15; px < layout.left + layout.width * 0.85; px += 6) {
          ray.setFromCamera({
            x: ((px - layout.left) / layout.width) * 2 - 1,
            y: -((py - layout.top) / layout.height) * 2 + 1,
          }, camera);
          const hit = ray.intersectObjects(scene.children, true).find(h => h.object.visible);
          line += hit ? tag(hit.object) : '.';
        }
        rows.push(`${Math.round(py)} ${line}`);
      }
      stage.dataset.dbgRay = rows.join('\n');
    }
    /* --- TEMPORAL: caja de lo que se DIBUJA (banco de pruebas; NO commitear) ---
     * Se mide aquí, antes de dibujar, porque la pose se deshace justo después: medir fuera de
     * este punto devuelve la pose restaurada. Se dispara una sola vez: poner el atributo en '1'. */
    if (stage.dataset.dbgBoxes === '1') {
      const acc = {};
      current.body.updateWorldMatrix(true, true);
      current.body.traverse(o => {
        if (!o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
        const bb = new THREE.Box3(), v = new THREE.Vector3();
        const n = o.geometry.attributes.position.count;
        for (let i = 0; i < n; i++) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); bb.expandByPoint(v); }
        acc[o.name] = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map(x => +x.toFixed(3));
      });
      stage.dataset.dbgBoxes = JSON.stringify(acc);
    }
    draw();
    for (const [b, q, p] of saved) { b.quaternion.copy(q); b.position.copy(p); }
  } catch (err) { fail(err); }
}

/* Test hooks: where her hip joint and her ankle end up on screen, in viewport pixels — a
 * test can then check she is really ON the seat and that her feet reach the floor. */
function reportHip() {
  /* A pantalla, con la inclinación de la cámara incluida: un punto más cerca (z mayor) se
   * dibuja más abajo (el mismo término que usa el sillón para apoyar su frente en la línea).
   * Sin él, estos hooks publicaban la altura "en el aire" de un punto que en pantalla está
   * 23 px más abajo — y la prueba de los pies medía contra un número que no era el dibujado. */
  const toScreen = v => Math.round(layout.floorY - (v.y - current.feetY) / (current.bodyH / layout.heightPx)
    + v.z * Math.sin(CHAIR_ELEVATION) / (current.bodyH / layout.heightPx));
  current.hips.getWorldPosition(SIT_V3);
  stage.dataset.hip = String(toScreen(SIT_V3));
  stage.dataset.floor = String(Math.round(layout.floorY));
  if (current.foot) {
    current.foot.getWorldPosition(SIT_V3);
    stage.dataset.foot = String(toScreen(SIT_V3));
  }
  if (current.knee) {
    current.knee.getWorldPosition(SIT_V3);
    stage.dataset.knee = String(toScreen(SIT_V3));
  }
}

// Para medir el socket del sillón (una sola malla, sin partes con nombre).
let _ray = null;
// Temporales de la IK de los brazos: se crean en el arranque (three llega después).
let _QI = null;
let _hS = null, _hT = null, _hEl = null, _hElNow = null, _hDir = null, _hAim = null, _hPole = null, _hKnee = null, _hHip = null, _hTmp = null;
let _hQ1 = null, _hQ2 = null, _hQ3 = null;
// La distancia de cada muñeca a su blanco en el muslo, para `data-hands`.
const handsPx = { L: '', R: '' };
// Temporales y medida del acostado de los pies (suela plana en la línea).
let _fUp = null, _fQ = null, _fWordUp = null;
const feetFlat = { L: '', R: '' };
// Temporales de la IK de las piernas y cuánto le falta a cada una para llegar al suelo.
let _lFwd = null, _lLeft = null, _lHip = null, _lT = null, _lAim = null, _lPole = null, _lKnee = null, _lDir = null, _lNow = null, _lTmp = null;
const legReach = { L: '0.0', R: '0.0' };

/* --------------------------------------------------------------- descanso -- */

/* Un minuto sin una sola señal de vida —ni ratón, ni teclado, ni toques— y se va a su
 * sillón: se gira hacia él, camina (el clip Walk, que ahora viaja dentro del modelo), se
 * sienta y se queda ahí mirando al cliente. Sentarse es una POSE, no un clip (no existe
 * ninguno): las piernas se doblan después del mixer, como el saludo y la mirada.
 * Cualquier señal —ratón, teclado, toque, rueda o un paso del cotizador— la trae de vuelta. */

const SIT_UPPER = [
  ['Torso', 0, SIT_POSE.torso]
];

const setPose = () => { stage.dataset.pose = pose; };
const idleMs = () => Number(stage.dataset.idleMs) > 0 ? Number(stage.dataset.idleMs) : IDLE_MS;
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2);

/* No se sienta si hay conversación abierta, un aviso en pantalla, el repaso corriendo o
 * la pestaña de fondo: solo cuando está sola de verdad. Y solo con colisiones cargadas:
 * sin el mundo físico no hay garantía de que no lo atraviese, así que no se sienta. */
function canSit() {
  return running && current && layout && sitGeom && phys?.chair && !reducedMotion && !document.hidden
    && pose === 'standing' && !sitSeq && state !== 'talking' && !thinking
    && !chatPanel.classList.contains('open') && bubble.hidden && Store.assistant().enabled;
}

function alive() {
  lastAlive = performance.now();
  if (pose === 'sitting' || pose === 'to-chair') standUp();
}

function startSit() {
  pose = 'to-chair';
  sitSeq = { phase: 'walk1', t0: performance.now(), fromX: current.body.position.x, fromZ: current.body.position.z };
  if (sitGeom) { sitGeom.restX = null; sitGeom.restZ = null; }   // el ancla se vuelve a medir en cada paseo
  walkPrev = null; travelPeak = 0;
  if (stage) stage.dataset.travelPeak = '0';
  if (phys) { phys.peak = 0; phys.shoved = 0; phys.phases = {}; phys.track = { over2: 0, over6: 0, frames: 0 }; }   // cada episodio se mide aparte
  play('Walk', 0.25);
  hideBubble();
  setPose();
}

function standUp() {
  sitSeq = { phase: 'rise', t0: performance.now(), weight: sitWeight, fromZ: current.body.position.z };
  pose = 'back';
  setPose();
}

/* El ángulo entre hacia dónde MIRA y hacia dónde CAMINA, en grados: 0 es caminar de frente,
 * ±90 un paso de lado y ±180 caminar de espaldas. Se publica como `data-travel` mientras hay
 * una pierna de caminata (y `data-travel-peak` guarda el peor del paseo), que es lo que la
 * suite exige que se quede cerca de 0: el clip Walk es una zancada hacia adelante, así que
 * cualquier otra cosa se ve como patinar. Se mide contra `bodyYaw` —el giro que decide la
 * secuencia—, no contra el giro real del cuerpo: la mirada suma aparte (hasta ~13°), y que
 * ella mire al cliente mientras camina es correcto. */
function publishTravel() {
  stage.dataset.sitPhase = sitSeq ? sitSeq.phase : '';
  if (!current || !sitSeq || !WALK_PHASES.includes(sitSeq.phase)) { delete stage.dataset.travel; walkPrev = null; return; }
  const { x, z } = current.body.position;
  const dx = walkPrev ? x - walkPrev.x : 0, dz = walkPrev ? z - walkPrev.z : 0;
  walkPrev = { x, z };
  if (Math.hypot(dx, dz) < 1e-6) return;   // sin avance en este cuadro no hay veredicto
  const fx = Math.sin(bodyYaw), fz = Math.cos(bodyYaw);
  const deg = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 180 / Math.PI;
  travelPeak = Math.max(travelPeak, Math.abs(deg));
  stage.dataset.travel = deg.toFixed(1);
  stage.dataset.travelPeak = travelPeak.toFixed(1);
}

/* Un paso de la secuencia: caminar hasta el frente del sillón, girarse hacia él, caminar
 * hasta el asiento y sentarse — y lo mismo al revés cuando vuelve. El camino es el L de
 * siempre (de frente primero, de lado después: cruzarlo en diagonal metía las piernas por
 * el mueble), pero cada pierna se camina MIRANDO A DONDE VA, y el giro va entre las dos. */
function stepSit(now) {
  const g = sitGeom;
  if (!g) { sitSeq = null; pose = 'standing'; setPose(); stage.dataset.sitPhase = ''; return; }
  const k = easeInOut(Math.min(1, (now - sitSeq.t0) / SIT_TURN_MS));
  const leg = () => easeInOut(Math.min(1, (now - sitSeq.t0) / SIT_LEG_MS));
  const az = g.approachZ ?? g.dzUnits;
  if (sitSeq.phase === 'walk1') {
    // De frente al cliente hasta ponerse delante del sillón (el clip Walk ya es una zancada
    // hacia adelante: caminar de frente es lo que hace que se lea caminando).
    bodyYaw = 0;
    current.body.position.z = sitSeq.fromZ + (az - sitSeq.fromZ) * leg();
    current.body.position.x = sitSeq.fromX;
    if (now - sitSeq.t0 >= SIT_LEG_MS) { sitSeq = { phase: 'turn', t0: now }; play('Idle', 0.3); }
  } else if (sitSeq.phase === 'turn') {
    bodyYaw = -(Math.PI / 2) * k;   // se gira hacia el sillón para entrar de frente
    if (now - sitSeq.t0 >= SIT_TURN_MS) { sitSeq = { phase: 'walk2', t0: now, fromX: current.body.position.x }; play('Walk', 0.25); }
  } else if (sitSeq.phase === 'walk2') {
    bodyYaw = -(Math.PI / 2);
    current.body.position.x = sitSeq.fromX + (g.dxUnits - sitSeq.fromX) * leg();
    current.body.position.z = az;
    if (now - sitSeq.t0 >= SIT_LEG_MS) { sitSeq = { phase: 'settle', t0: now }; play('Idle', 0.3); }
  } else if (sitSeq.phase === 'settle') {
    const w = easeInOut(Math.min(1, (now - sitSeq.t0) / SIT_SETTLE_MS));
    sitWeight = w;
    // Del frente al asiento, y de pie a sentada: los dos movimientos a la vez.
    current.body.position.z = az * (1 - w) + g.dzUnits * w;
    // De caminar mirando al sillón a quedarse de tres cuartos: así se le ven los muslos
    // hacia adelante y se lee sentada, no de pie con las piernas cortas.
    bodyYaw = (1 - w) * -(Math.PI / 2) + w * sitYaw();
    if (now - sitSeq.t0 >= SIT_SETTLE_MS) { sitSeq = null; pose = 'sitting'; setPose(); }
  } else if (sitSeq.phase === 'rise') {
    const w = easeInOut(Math.min(1, (now - sitSeq.t0) / STAND_MS));
    sitWeight = sitSeq.weight * (1 - w);
    current.body.position.z = sitSeq.fromZ + (az - sitSeq.fromZ) * w;   // se levanta hacia adelante
    bodyYaw = sitYaw();
    if (now - sitSeq.t0 >= STAND_MS) sitSeq = { phase: 'turnback1', t0: now };
  } else if (sitSeq.phase === 'turnback1') {
    /* Se gira hacia donde VA a caminar (de espaldas al sillón), no hacia el sillón: girarse
     * hacia el mueble y caminar hacia afuera es exactamente el moonwalk que se veía. */
    bodyYaw = sitYaw() * (1 - k) + (Math.PI / 2) * k;
    if (now - sitSeq.t0 >= SIT_TURN_MS) {
      /* Si la despertaron a mitad del paseo, algún tramo ya no tiene nada que caminar: no se
       * camina en el sitio, se salta al siguiente (y así no hay saltos de posición). */
      const nada = Math.abs(current.body.position.x) <= SIT_SKIP_UNITS;
      sitSeq = nada ? { phase: 'turnback2', t0: now } : { phase: 'walkback1', t0: now, fromX: current.body.position.x };
      if (!nada) play('Walk', 0.25);
    }
  } else if (sitSeq.phase === 'walkback1') {
    bodyYaw = Math.PI / 2;
    current.body.position.x = sitSeq.fromX * (1 - leg());
    current.body.position.z = az;
    if (now - sitSeq.t0 >= SIT_LEG_MS) { sitSeq = { phase: 'turnback2', t0: now }; play('Idle', 0.3); }
  } else if (sitSeq.phase === 'turnback2') {
    bodyYaw = (Math.PI / 2) * (1 - k) + Math.PI * k;   // se gira hacia su sitio, para ir de frente
    if (now - sitSeq.t0 >= SIT_TURN_MS) {
      const nada = current.body.position.z <= SIT_SKIP_UNITS;
      sitSeq = nada ? { phase: 'face', t0: now } : { phase: 'walkback2', t0: now, fromZ: current.body.position.z };
      if (!nada) play('Walk', 0.25);
    }
  } else if (sitSeq.phase === 'walkback2') {
    bodyYaw = Math.PI;
    current.body.position.z = sitSeq.fromZ * (1 - leg());
    current.body.position.x = 0;
    if (now - sitSeq.t0 >= SIT_LEG_MS) { sitSeq = { phase: 'face', t0: now }; play('Idle', 0.3); }
  } else if (sitSeq.phase === 'face') {
    bodyYaw = Math.PI * (1 - easeInOut(Math.min(1, (now - sitSeq.t0) / SIT_FACE_MS)));   // 180°: vuelve a mirar al cliente
    if (now - sitSeq.t0 >= SIT_FACE_MS) {
      sitSeq = null; pose = 'standing'; setPose();
      lastAlive = performance.now();
    }
  }
  publishTravel();
  current.body.position.y = -g.dropUnits * sitWeight;
  // El blanco de clic viaja con ella: sigue siendo ella la que se toca, esté donde esté.
  if (layout) hit.style.transform = `translateX(${Math.round(current.body.position.x / (current.bodyH / layout.heightPx))}px)`;
}

/* Los pies de este rig vienen soldados al origen del modelo (ver assets/assistant/README.md):
 * al bajar el cuerpo para sentarse se hunden con él. Se suben exactamente lo que bajó, en el
 * espacio de su padre, después del mixer y con el peso de la transición — el mismo truco que
 * la mirada. No arregla el rig, pero pone los pies en el suelo. */
function placeFeet(w) {
  if (!current.feet || !sitGeom) return;
  for (const [side, foot, shin] of [['L', current.foot, current.knee], ['R', current.footR, current.kneeR]]) {
    if (!foot || !shin) continue;
    /* El pie va donde TERMINA LA ESPINILLA (posición + su largo por su eje), no donde lo dejó
     * el clip: la malla del zapato está repartida entre los dos huesos (≈60% pie, 40%
     * espinilla), así que un pie lejos de la punta de la espinilla estira la malla entre dos
     * anclas y el zapato se ve como un borrón pegado a la pantorrilla. La espinilla ya está
     * resuelta por la IK, con su punta en la línea del suelo (compensada por la inclinación y
     * subida lo que hay del tobillo a la suela). */
    shin.getWorldPosition(SIT_V3);
    shin.getWorldQuaternion(_fQ);
    _fUp.set(0, 1, 0).applyQuaternion(_fQ).multiplyScalar(current.leg.shin);
    SIT_V3.add(_fUp);
    foot.position.lerp(foot.parent.worldToLocal(SIT_V3), w);
    /* Y acostado: la suela horizontal, que es como está de pie. Sin esto el pie hereda del
     * clip la punta hacia abajo y el taco hacia arriba, y el zapato cuelga. La referencia se
     * midió al cargar (de pie, suelas en el suelo). */
    const upLocal = current.footUp?.[side];
    if (upLocal && _fUp) {
      _fUp.copy(upLocal).applyQuaternion(foot.getWorldQuaternion(_fQ)).normalize();
      const tilt = Math.acos(Math.min(1, Math.max(-1, _fUp.dot(_fWordUp))));
      feetFlat[side] = (tilt * 180 / Math.PI).toFixed(1);
      alignBoneWorld(foot, _fUp, _fWordUp, w);
      // Y los dedos hacia afuera, que es como se lee un zapato desde esta cámara (ver SIT_FEET).
      rotateAboutWorld(foot, WORLD_Y, (side === 'L' ? 1 : -1) * SIT_FEET.out * w);
    }
  }
  if (feetFlat.L && feetFlat.R) stage.dataset.feetFlat = `${feetFlat.L}|${feetFlat.R}`;
}

/* La pose de sentada, después del mixer (que manda sobre los huesos) y con el peso de la
 * transición; se restaura después de dibujar, como la mirada. Piernas y brazos salen de su IK
 * (dos huesos, longitudes medidas en el rig), no de constantes. */
function applySitPose() {
  if (!current || !sitGeom || sitWeight <= 0.001) return;
  /* Las piernas se pliegan ANTES de aterrizar: con el mismo peso que el descenso, el muslo
   * barría el sillón mientras bajaba — medido, 1 cuadro de cada tantos con la pierna 13.27 px
   * dentro (`settle`, parte `leg`). Como una persona: primero dobla, después se sienta. */
  placeLegs(Math.min(1, sitWeight * 1.6));
  for (const [name, yaw, pitch] of SIT_UPPER) {
    const bone = current.sitBones[name];
    if (bone) rotateBoneWorld(bone, yaw, pitch * sitWeight);
  }
}

/* --------------------------- piernas de sentada (IK de dos huesos) -- */

/* IK de dos huesos por pierna — el mismo triángulo que los brazos — con el blanco SIMÉTRICO
 * (el tobillo sobre la línea del suelo, delante del faldón y a medio pie de la línea media) y
 * el polo hacia adelante, que es hacia donde dobla la rodilla alguien sentado.
 *
 * Antes era UN ángulo para las dos piernas, resuelto del clip. El clip deja una pierna ~20 px
 * más alta y ~24 px más adelante que la otra (se lee como pierna cruzada), y el zapato —una
 * malla repartida entre el pie y la espinilla, ~60/40— quedaba estirado entre dos anclas
 * separadas 30-40 px: la pierna visible bajaba por la x de la RODILLA y el zapato se dibujaba
 * como un borrón pegado a la pantorrilla, con el pie del clip fuera de cuadro. Eso era el
 * reporte "no le veo los pies cuando está sentada" — no la altura (que ya estaba en la línea),
 * sino que el pie y su espinilla no estaban en el mismo sitio. */
function placeLegs(w) {
  if (!current?.leg || !sitGeom || w <= 0.001 || !_QI || !current.hips) return;
  _lFwd.set(Math.sin(sitYaw()), 0, Math.cos(sitYaw()));
  _lLeft.set(Math.cos(sitYaw()), 0, -Math.sin(sitYaw()));
  for (const [side, upper, lower, kneeBone, foot] of [
    ['L', current.sitBones['UpperLeg.L'], current.sitBones['LowerLeg.L'], current.knee, current.foot],
    ['R', current.sitBones['UpperLeg.R'], current.sitBones['LowerLeg.R'], current.kneeR, current.footR]
  ]) {
    if (!upper || !lower || !kneeBone || !foot) continue;
    /* El origen de la IK es el hueso del MUSLO, no la cadera: en este rig las piernas cuelgan
     * de `Body`, no de `Hips`, y el triángulo resuelto desde la cadera quedaba unos píxeles
     * corrido (el tobillo terminaba por encima del blanco). */
    upper.getWorldPosition(_lHip);
    /* El blanco: el tobillo, a un lado de la línea media (las piernas separadas, no juntas). */
    _lT.copy(_lHip).addScaledVector(_lLeft, side === 'L' ? SIT_LEGS.stance : -SIT_LEGS.stance);
    _lT.y = sitGeom.footY;
    if (sitGeom.footZ != null) _lT.z = sitGeom.footZ;
    _lAim.copy(_lT).sub(_lHip);
    const want = _lAim.length();
    const reach = (current.leg.thigh + current.leg.shin) * 0.995;
    const dist = Math.min(want, reach);
    if (dist < 1e-4) continue;
    legReach[side] = (Math.max(0, want - reach) / (current.bodyH / layout.heightPx)).toFixed(1);
    _lAim.normalize();
    // El codo… la rodilla: a lo largo de cadera→tobillo y `b` perpendicular, hacia adelante.
    const a = (current.leg.thigh * current.leg.thigh + dist * dist - current.leg.shin * current.leg.shin) / (2 * dist);
    const b = Math.sqrt(Math.max(0, current.leg.thigh * current.leg.thigh - a * a));
    _lPole.copy(_lFwd).addScaledVector(_lAim, -_lFwd.dot(_lAim));
    if (_lPole.lengthSq() < 1e-6) _lPole.set(0, 1, 0).addScaledVector(_lAim, _lAim.y);
    _lPole.normalize();
    _lKnee.copy(_lHip).addScaledVector(_lAim, a).addScaledVector(_lPole, b);
    // 1) el muslo apunta a la rodilla resuelta; 2) la espinilla, al tobillo del blanco.
    kneeBone.getWorldPosition(_lDir).sub(_lHip).normalize();
    alignBoneWorld(upper, _lDir, _lTmp.copy(_lKnee).sub(_lHip).normalize(), w);
    kneeBone.getWorldPosition(_lNow);
    // La dirección de la espinilla es SU EJE, no la recta rodilla→pie: la posición del pie la
    // escribe `placeFeet` y el respaldo del cuadro la revierte, así que la recta apuntaba al
    // pie del clip (a 30-40 px) y la pierna giraba a cualquier parte.
    kneeBone.getWorldQuaternion(_fQ);
    _lDir.set(0, 1, 0).applyQuaternion(_fQ).normalize();
    alignBoneWorld(lower, _lDir, _lTmp.copy(_lT).sub(_lNow).normalize(), w);
  }
  stage.dataset.legReach = `${legReach.L}|${legReach.R}`;
}

/* ------------------------------- manos sobre los muslos (IK de brazos) -- */

/* Las manos se apoyan en los muslos con IK de dos huesos por brazo — la misma clase de
 * solución que las piernas, y por la misma razón: un juego FIJO de rotaciones no llega. El
 * clip deja los dos brazos en posturas distintas (medido: su muñeca derecha quedaba 21 px
 * más alta que la izquierda, con las dos a 22 y 33 px por encima del muslo) y cada hombro
 * está a otra distancia de su propio muslo. El blanco es un punto SOBRE la superficie del
 * muslo —el contacto es un desnivel, no la coordenada del hueso—, el codo se resuelve por
 * triángulo (ley de cosenos) y el plano de flexión mira hacia afuera y abajo, que es hacia
 * donde apunta un codo de alguien sentado. */

/* Gira un hueso para que su dirección actual (hueso → hijo) pase a ser `to`, en ejes del
 * mundo: la rotación se pasa al espacio del padre (el hueso puede venir girado por el clip,
 * por el giro del cuerpo y por la mirada). Con `weight` < 1 se mezcla hacia la identidad,
 * que es como entra y sale con la transición de sentarse. */
function alignBoneWorld(bone, fromDir, toDir, weight) {
  if (!bone || !bone.parent || weight <= 0.001 || !_QI) return;
  _hQ1.setFromUnitVectors(fromDir, toDir);
  bone.parent.getWorldQuaternion(_hQ2);
  _hQ3.copy(_hQ2).invert();
  _hQ1.premultiply(_hQ3).multiply(_hQ2);
  if (weight < 0.999) _hQ1.slerp(_QI, 1 - weight);
  bone.quaternion.premultiply(_hQ1);
  bone.updateWorldMatrix(false, true);
}

function placeHands(w) {
  if (!current?.armSeg || !sitGeom || w <= 0.001 || !_QI || !current.hips) return;
  for (const [side, sh, el, wr, knee] of [
    ['L', current.shoulderL, current.elbowL, current.wristL, current.knee],
    ['R', current.shoulderR, current.elbowR, current.wristR, current.kneeR]
  ]) {
    const seg = current.armSeg[side];
    if (!seg || !sh || !el || !wr || !knee) continue;
    sh.getWorldPosition(_hS);
    knee.getWorldPosition(_hKnee);
    current.hips.getWorldPosition(_hHip);
    /* El blanco: a lo largo del muslo (de la cadera a la rodilla) y un desnivel por encima
     * de su superficie, del tamaño de la mano: apoyada, no dentro. */
    _hT.copy(_hHip).lerp(_hKnee, SIT_HANDS.t);
    _hT.y += PHYS.thighR + PHYS.handR + SIT_HANDS.above;   // piel + mano + tela
    _hAim.copy(_hT).sub(_hS);
    const reach = (seg.upper + seg.fore) * 0.995;
    const dist = Math.min(_hAim.length(), reach);
    if (dist < 1e-4) continue;
    _hAim.normalize();
    // El codo: a lo largo de hombro→blanco y `b` perpendicular a eso, hacia el polo.
    const a = (seg.upper * seg.upper + dist * dist - seg.fore * seg.fore) / (2 * dist);
    const b = Math.sqrt(Math.max(0, seg.upper * seg.upper - a * a));
    _hPole.set(side === 'L' ? SIT_HANDS.out : -SIT_HANDS.out, -SIT_HANDS.down, -SIT_HANDS.back).normalize();
    _hPole.addScaledVector(_hAim, -_hPole.dot(_hAim));
    if (_hPole.lengthSq() < 1e-6) _hPole.set(0, -1, 0).addScaledVector(_hAim, _hAim.y);
    _hPole.normalize();
    _hEl.copy(_hS).addScaledVector(_hAim, a).addScaledVector(_hPole, b);
    // 1) el hombro apunta al codo resuelto; 2) el codo, a la muñeca sobre el blanco.
    el.getWorldPosition(_hDir).sub(_hS).normalize();
    alignBoneWorld(sh, _hDir, _hTmp.copy(_hEl).sub(_hS).normalize(), w);
    el.getWorldPosition(_hElNow);
    wr.getWorldPosition(_hDir).sub(_hElNow).normalize();
    alignBoneWorld(el, _hDir, _hTmp.copy(_hT).sub(_hElNow).normalize(), w);
    /* Lo que quedó la muñeca del blanco, en px: es la medida de "la mano se apoya en el
     * muslo" — 0 es apoyada; un gesto fijo la dejaba 22 px (izquierda) y 33 px (derecha) por
     * encima, que es lo que se veía como manos flotando frente al vientre. */
    wr.getWorldPosition(_hTmp);
    handsPx[side] = (_hTmp.distanceTo(_hT) / (current.bodyH / layout.heightPx)).toFixed(1);
    if (side === 'R') stage.dataset.hands = `${handsPx.L}|${handsPx.R}`;
  }
}

/* Los clips de pie (saludar, interactuar) no se pueden jugar sentada: el peso de la pose
 * manda sobre los brazos. Las reacciones siguen mirando, solo que sin clip. */
function playStanding(name, fade) {
  if (pose === 'standing' && !sitSeq) play(name, fade);
}

/* --------------------------------------------------------------- welcome -- */

function welcome() {
  const cfg = Store.assistant();
  const p = bubble.querySelector('.bubble-text');
  // Built with text nodes: the name and company come from the backoffice.
  p.replaceChildren('¡Hola! Te damos la bienvenida a ', Object.assign(document.createElement('b'), { textContent: Store.brand().companyName }),
    '. Soy ', Object.assign(document.createElement('b'), { textContent: cfg.name }), ', si necesitas algo, aquí estaré para ayudarte.');
  bubble.hidden = false;
  requestAnimationFrame(() => bubble.classList.add('show'));
  state = 'talking';
  playStanding('Wave', 0.25);
  Store.markAssistantWelcomed();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, WELCOME_MS);
}

function hideBubble() {
  clearTimeout(bubbleTimer);
  bubble.classList.remove('show');
  setTimeout(() => { if (!bubble.classList.contains('show')) bubble.hidden = true; }, 250);
  journey?.classList.remove('noticing'); // el progreso vuelve
  if (!chatPanel.classList.contains('open')) state = 'idle';
  lastAlive = performance.now();
}

// Bubbles are in the sidebar's own flow now (above her feet, inside .journey-foot):
// nothing to position, and the wizard is never covered. Nothing to do here.

/* The conversation must never run over her. The panel is capped to end ABOVE her
 * head (--chat-band), so the messages scroll in the space that is really free and
 * she keeps the bottom of the sidebar — the text yields to the assistant, never the
 * other way round. Below a readable minimum the cap is dropped and she simply stays
 * in front (she has z-index above the panel, which is static there); if the 3D layer
 * is not running there is no head to respect and the panel uses the whole sidebar. */
const CHAT_MIN_BAND = 170;
function bandChat() {
  if (!journey || !layout) return;
  if (innerWidth <= MOBILE_MAX) { journey.style.removeProperty('--chat-band'); return; }
  const padTop = parseFloat(getComputedStyle(journey).paddingTop) || 0;
  const band = Math.round(layout.headY - journey.getBoundingClientRect().top - padTop - 12);
  if (band >= CHAT_MIN_BAND) journey.style.setProperty('--chat-band', `${band}px`);
  else journey.style.removeProperty('--chat-band');
}

/* A notice floats just above her crown — never far away, never behind her body, never
 * leaving a hole. Her crown is exact, not an estimate: the posed model is measured at load
 * (bodyH) and mapped so the figure spans heightPx pixels with her feet on the help card's
 * line, so floorY - heightPx is the top of her hair for any character. The sidebar's
 * content stays put; the card sits over it and leaves after a few seconds. */
function placeNotice() {
  if (!journey || !layout) return;
  const j = journey.getBoundingClientRect();
  journey.style.setProperty('--notice-bottom', `${Math.round(j.bottom - (layout.floorY - layout.heightPx) + 6)}px`);
}

/* ------------------------------------------------------------------ boot -- */

let booting = null;
async function start() {
  const cfg = Store.assistant();
  if (broken || !cfg.enabled || innerWidth <= MOBILE_MAX || !stage || !journey || !helpCard || !stepList) { if (stage) hideLayer(); return; }
  if (!webglAvailable()) return fail('WebGL is not available');
  await loadThree();
  M = _m(); AXIS = new THREE.Vector3(); DQ = new THREE.Quaternion();
  SIT_V3 = new THREE.Vector3();
  _QI = new THREE.Quaternion();
  _hS = new THREE.Vector3(); _hT = new THREE.Vector3(); _hEl = new THREE.Vector3(); _hElNow = new THREE.Vector3();
  _hDir = new THREE.Vector3(); _hAim = new THREE.Vector3(); _hPole = new THREE.Vector3(); _hKnee = new THREE.Vector3();
  _hHip = new THREE.Vector3(); _hTmp = new THREE.Vector3();
  _hQ1 = new THREE.Quaternion(); _hQ2 = new THREE.Quaternion(); _hQ3 = new THREE.Quaternion();
  _fUp = new THREE.Vector3(); _fQ = new THREE.Quaternion(); _fWordUp = new THREE.Vector3(0, 1, 0);
  _lFwd = new THREE.Vector3(); _lLeft = new THREE.Vector3(); _lHip = new THREE.Vector3(); _lT = new THREE.Vector3();
  _lAim = new THREE.Vector3(); _lPole = new THREE.Vector3(); _lKnee = new THREE.Vector3(); _lDir = new THREE.Vector3();
  _lNow = new THREE.Vector3(); _lTmp = new THREE.Vector3();
  _ray = new THREE.Raycaster();
  await loadPhysics();
  stage.dataset.phys = phys ? 'rapier' : 'sin-colisiones';
  WORLD_Y = new THREE.Vector3(0, 1, 0); WORLD_X = new THREE.Vector3(1, 0, 0);
  if (!chair) await loadChair();
  if (!current || current.kind !== cfg.character) await loadCharacter(cfg.character);
  applyBrandSuit(cfg.brandSuit);
  place();
  if (current.leg) stage.dataset.legReach = `${legReach.L}|${legReach.R}`;
  lastAlive = performance.now();
  setPose();
  stage.classList.add('ready');
  if (!budget && window.AssistantBrain) budget = AssistantBrain.createReactionBudget({ cooldownMs: REACTION_COOLDOWN_MS });
  applyChairFabric(contextFabric());
  if (reducedMotion) renderOnce();
  else if (!running) { running = true; requestAnimationFrame(tick); }
  if (!Store.assistantWelcomed()) setTimeout(() => { if (!broken && layout) welcome(); }, 600);
}

function refresh() {
  if (broken) return;
  booting = (booting || Promise.resolve()).then(start).catch(fail);
}

await ready;

bubble.querySelector('.bubble-close').addEventListener('click', hideBubble);
document.querySelector('.workspace')?.addEventListener('pointerdown', () => { if (!bubble.hidden) hideBubble(); });
document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', () => {
  if (!bubble.hidden) hideBubble();
  state = 'talking';
  playStanding('Interact', 0.25);
}));
new MutationObserver(() => { if (!chatPanel.classList.contains('open')) state = 'idle'; bandChat(); })
  .observe(chatPanel, { attributes: true, attributeFilter: ['class'] });
addEventListener('aci:event', e => onAciEvent(e.detail));
// What the customer TOUCHES, not where the cursor happens to be: a click, a tap or a
// keyboard activation inside the wizard turns her head to that control. Focus covers
// Tab, click covers Enter/Space (a checkbox toggled by keyboard fires no pointerdown).
addEventListener('pointerdown', e => followHands(e.target), true);
addEventListener('click', e => followHands(e.target), true);
addEventListener('focusin', e => followHands(e.target), true);
// A proactive observation while the chat is closed: it appears just above her (never far
// from her, never behind her body), leaves the unread mark on "Pregúntale a" and goes away
// on its own — or the moment the customer goes on with the form.
addEventListener('aci:notice', e => {
  if (broken || !running || !layout || !Store.assistant().enabled) return;
  if (chatPanel.classList.contains('open')) return; // the conversation is already on screen
  bubble.querySelector('.bubble-text').replaceChildren(String((e.detail && e.detail.text) || ''));
  bubble.hidden = false;
  placeNotice();
  journey?.classList.add('noticing'); // el progreso se guarda mientras el aviso está
  requestAnimationFrame(() => bubble.classList.add('show'));
  const ask = helpCard?.querySelector('.text-button');
  if (ask) ask.dataset.unread = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, NOTICE_MS);
});
addEventListener('resize', () => { if (current) place(); if (!layout && !broken) refresh(); });
/* Una señal de vida cualquiera —ratón, teclado, toque, rueda o desplazamiento— reinicia
 * la espera del sillón y, si ya estaba sentada, la trae de vuelta (los pasos del
 * cotizador entran por onAciEvent). */
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
  addEventListener(ev, alive, { passive: true, capture: true });
}
// Saved in the backoffice (another tab) or repainted by Brand/Assistant.apply(): follow it.
addEventListener('assistantchange', () => {
  const cfg = Store.assistant();
  if (!cfg.enabled) { hideLayer(); hideBubble(); running = false; glance = null; setThinking(false); return; }
  if (current) applyBrandSuit(cfg.brandSuit);
  refresh();
});
addEventListener('storage', e => { if (current && (e.key === null || /brand$/.test(e.key || ''))) setTimeout(() => applyBrandSuit(Store.assistant().brandSuit), 0); });
if (journey) new ResizeObserver(() => { if (current) place(); }).observe(journey);

refresh();
