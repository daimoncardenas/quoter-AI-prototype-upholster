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

const $ = id => document.getElementById(id);
const stage = $('assistantStage'), hit = $('assistantHit'), bubble = $('assistantBubble'), chatPanel = $('chatPanel');
const journey = document.querySelector('.journey');
const helpCard = journey && journey.querySelector('.help-card');
const stepList = journey && journey.querySelector('.step-list');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let THREE = null, GLTFLoader = null;
let renderer, scene, camera, chairScene, chairCamera, timer;
let current = null, chair = null, layout = null;
let state = 'idle', lookYaw = 0, lookPitch = 0;
let bubbleTimer = null, running = false, broken = false;
let glance = null, thinking = false, queuedReaction = null, queueTimer = null;
let reactionCount = 0, suppressedCount = 0, budget = null;
let loadingKind = null;

const hideLayer = () => { stage.hidden = true; hit.hidden = true; layout = null; };

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
  hideLayer();
  if (bubble) bubble.hidden = true;
  if (helpCard) helpCard.querySelector('.text-button')?.style.removeProperty('margin-right');
  console.warn('Assistant presence disabled:', err && err.message ? err.message : err);
};

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
  /* The chair gets its own scene and a slightly elevated camera: seen dead level
   * it reads as a box, because the seat is hidden. Same pixel scale as the character. */
  chairScene = lights(new THREE.Scene());
  chairCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
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
  if (chair) { chairScene.remove(chair.pivot); disposeObject(chair.pivot); }
  chairScene.add(pivot);
  const neutral = tint.clone(); // the chair exactly as shipped
  chair = { pivot, tint, neutral, target: neutral.clone(), heightUnits: size.y, widthUnits: Math.max(size.x, size.z) * 1.25 };
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
    head: root.getObjectByName('Head'), neck: root.getObjectByName('Neck'),
    originalColors: materials.map(m => m.color.clone()),
    feetY: box.min.y, bodyH: box.max.y - box.min.y
  };
}

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
  const height = Math.round(heightPx * (1 + HEAD_ROOM));
  const top = floorY - height + 2;
  let left = centerX - Math.round(heightPx * (BODY_W + SIDE_ROOM * 2) / 2);
  const right = centerX + Math.round(heightPx * (BODY_W + SIDE_ROOM * 2) / 2);

  // Real armchairs are ~half a person's height; shrink it rather than let it cover a step.
  let chairX = null;
  if (chair) {
    const padL = parseFloat(getComputedStyle(journey).paddingLeft);
    const chairPx = Math.min(heightPx * 0.5, floorY - steps.bottom - 10);
    chair.pivot.visible = chairPx >= 40;
    if (chair.pivot.visible) {
      const chairWpx = chairPx * chair.widthUnits / chair.heightUnits;
      const chairCenter = Math.max(j.left + padL + chairWpx / 2, centerX - heightPx * BODY_W / 2 - chairWpx / 2 - 4);
      const aim = new THREE.Vector3(0, chair.heightUnits / 2, 0);
      chairCamera.position.set(0, aim.y + Math.sin(CHAIR_ELEVATION) * 10, Math.cos(CHAIR_ELEVATION) * 10);
      chairCamera.lookAt(aim);
      chair.frame = { u: chair.heightUnits / chairPx, px: chairCenter, py: floorY - chairPx * 0.58 };
      left = Math.min(left, Math.floor(chairCenter - chairWpx * 0.7));
      chairX = chairCenter;
    }
  }
  const width = right - left;
  layout = { heightPx, floorY, left, top, width, height, centerX, headY: top + heightPx * (HEAD_ROOM + 0.07), chairX, chairY: floorY - heightPx * 0.2 };
  // Test hooks: where her head is and where the top of her hair is, in viewport pixels.
  stage.dataset.headY = String(Math.round(layout.headY));
  stage.dataset.crown = String(Math.round(floorY - heightPx));
  placeNotice();

  Object.assign(stage.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  Object.assign(hit.style, { left: `${centerX - heightPx * 0.16}px`, top: `${floorY - heightPx}px`, width: `${heightPx * 0.32}px`, height: `${heightPx}px` });
  renderer.setSize(width, height, false);

  // Frustum in model units: character height maps to heightPx pixels, x=0 at the character.
  camera.left = (left - centerX) * unitsPerPx; camera.right = (right - centerX) * unitsPerPx;
  camera.bottom = current.feetY - 2 * unitsPerPx; camera.top = camera.bottom + height * unitsPerPx;
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  if (chair?.pivot.visible && chair.frame) {
    const { u, px, py } = chair.frame;
    chairCamera.left = (left - px) * u; chairCamera.right = (right - px) * u;
    chairCamera.top = (py - top) * u; chairCamera.bottom = (py - top - height) * u;
    chairCamera.updateProjectionMatrix();
  }
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
// Rotates a bone about WORLD axes, expressed in the bone's own frame (survives any scale in the rig).
function rotateBoneWorld(bone, yaw, pitch) {
  bone.updateWorldMatrix(true, false);
  const mirror = Math.sign(bone.matrixWorld.determinant()) || 1;
  M.copy(bone.matrixWorld).invert();
  for (const [axis, angle] of [[WORLD_Y, yaw], [WORLD_X, pitch]]) {
    if (!angle) continue;
    AXIS.copy(axis).transformDirection(M);
    bone.quaternion.multiply(DQ.setFromAxisAngle(AXIS, angle * mirror));
    bone.updateWorldMatrix(false, false);
    M.copy(bone.matrixWorld).invert();
  }
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
  // Body takes part of the turn, neck and head the rest.
  current.body.rotation.y = lookYaw * 0.3;
  current.body.updateMatrixWorld(true);
  rotateBoneWorld(current.neck, lookYaw * 0.2, lookPitch * 0.4);
  rotateBoneWorld(current.head, lookYaw * 0.3, lookPitch * 0.6);
}

/* ---------------------------------------------------------------- render -- */

function draw() {
  renderer.clear();
  if (chair?.pivot.visible) renderer.render(chairScene, chairCamera);
  renderer.render(scene, camera);
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
    /* The mixer skips writing a bone whose keyframe value did not change, so the
     * look offset is undone after rendering or it would pile up every frame. */
    const neckPose = current.neck.quaternion.clone(), headPose = current.head.quaternion.clone();
    updateLook(dt);
    draw();
    current.neck.quaternion.copy(neckPose);
    current.head.quaternion.copy(headPose);
  } catch (err) { fail(err); }
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
  play('Wave', 0.25);
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
  WORLD_Y = new THREE.Vector3(0, 1, 0); WORLD_X = new THREE.Vector3(1, 0, 0);
  if (!chair) await loadChair();
  if (!current || current.kind !== cfg.character) await loadCharacter(cfg.character);
  applyBrandSuit(cfg.brandSuit);
  place();
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
  play('Interact', 0.25);
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
