/* Builds the assistant presence's 3D assets into assets/assistant/:
 *
 *   lia.gltf      Quaternius "Ultimate Modular Women" Suit, with Formal's skirt
 *   tomas.gltf    Quaternius "Ultimate Modular Men" Suit, pistol removed
 *   armchair.gltf Poly Haven "Arm Chair 01" (1K), textures embedded
 *
 * Every output is a single self-contained .gltf (buffers and images as data
 * URIs): the wizard is opened from file://, where fetch() of a sibling file is
 * blocked, so tools/generate.mjs embeds these files into index.html and the
 * page hands them to GLTFLoader.parse().
 *
 * The sources are CC0 and are downloaded, not committed, into
 * assets/assistant/sources/ (gitignored) on the first run. See
 * assets/assistant/README.md.
 *
 *   node tools/build-assistant-assets.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const OUT = path.join('assets', 'assistant');
const SRC = path.join(OUT, 'sources');

/* Google Drive file ids from the packs' public folders (linked from
 * quaternius.com/packs/ultimatemodularwomen.html and ultimatemodularcharacters.html). */
const DRIVE = {
  'women-suit.gltf': '1GjWtofxjmPku25cXJxHrzLLeUbXw7A_s',
  'women-formal.gltf': '1iayBzVv_zLjuPtaNPouw_auwKlQLLmes',
  'men-suit.gltf': '1NhXHnGU0zK9hBrT5FoZp8nTz_EmvTPg5'
};
const CHAIR_ID = 'ArmChair_01';

// Only the clips the assistant plays; the packs also ship combat animations.
// Walk is what takes her to the armchair when the customer has been quiet for a minute.
const CLIPS = ['Idle', 'Idle_Neutral', 'Wave', 'Interact', 'Walk'];
const PROPS = /pistol|gun|sword|backpack/i;

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  downloaded ${file}`);
}

async function ensureSources() {
  for (const [name, id] of Object.entries(DRIVE)) {
    const file = path.join(SRC, name);
    if (!existsSync(file)) await download(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, file);
  }
  const chairDir = path.join(SRC, 'armchair');
  if (!existsSync(path.join(chairDir, `${CHAIR_ID}.gltf`))) {
    const files = await (await fetch(`https://api.polyhaven.com/files/${CHAIR_ID}`)).json();
    const g = files.gltf['1k'].gltf;
    await download(g.url, path.join(chairDir, `${CHAIR_ID}.gltf`));
    for (const [rel, v] of Object.entries(g.include)) await download(v.url, path.join(chairDir, rel));
  }
}

/* ---------------------------------------------------------------- glTF io -- */

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// Buffers as Node Buffers, whether embedded (data URI) or external (relative file).
function loadGltf(file) {
  const g = JSON.parse(readFileSync(file, 'utf8'));
  g._bins = g.buffers.map(b => b.uri.startsWith('data:')
    ? Buffer.from(b.uri.split(',')[1], 'base64')
    : readFileSync(path.join(path.dirname(file), b.uri)));
  g._dir = path.dirname(file);
  return g;
}

function viewBytes(g, bvIndex) {
  const bv = g.bufferViews[bvIndex];
  const bin = g._bins[bv.buffer];
  return bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
}

/* Keeps only what the scene actually reaches, then rewrites everything into ONE
 * buffer. Without this a grafted file carries the donor's whole buffer (every
 * character's meshes and all 24 clips), and a detached prop still ships its mesh. */
function prune(g) {
  const reachable = new Set();
  const walk = i => { if (reachable.has(i)) return; reachable.add(i); (g.nodes[i].children || []).forEach(walk); };
  g.scenes.forEach(s => s.nodes.forEach(walk));
  // Skin joints are part of the rig even when a scene lists only the armature.
  g.nodes.forEach((n, i) => { if (reachable.has(i) && n.skin != null) g.skins[n.skin].joints.forEach(walk); });
  g.nodes.forEach((n, i) => { if (!reachable.has(i)) { delete n.mesh; delete n.skin; } });

  const remap = (list, used) => {
    const map = new Map();
    const kept = [];
    list.forEach((item, i) => { if (used.has(i)) { map.set(i, kept.length); kept.push(item); } });
    return { kept, map };
  };

  const usedMeshes = new Set(g.nodes.filter(n => n.mesh != null).map(n => n.mesh));
  const meshes = remap(g.meshes, usedMeshes);
  g.nodes.forEach(n => { if (n.mesh != null) n.mesh = meshes.map.get(n.mesh); });
  g.meshes = meshes.kept;

  const usedSkins = new Set(g.nodes.filter(n => n.skin != null).map(n => n.skin));
  const skins = remap(g.skins || [], usedSkins);
  g.nodes.forEach(n => { if (n.skin != null) n.skin = skins.map.get(n.skin); });
  g.skins = skins.kept;

  g.animations = (g.animations || []).filter(a => CLIPS.includes(a.name) || !g.nodes.some(n => n.skin != null));

  // Untextured materials never sample UVs; drop them from those primitives.
  const textured = m => {
    if (m == null) return false;
    const mat = g.materials[m];
    return JSON.stringify(mat).includes('"index"');
  };
  g.meshes.forEach(m => m.primitives.forEach(p => {
    if (!textured(p.material)) Object.keys(p.attributes).filter(k => k.startsWith('TEXCOORD_')).forEach(k => delete p.attributes[k]);
  }));

  const usedMaterials = new Set(g.meshes.flatMap(m => m.primitives.map(p => p.material)).filter(x => x != null));
  const mats = remap(g.materials || [], usedMaterials);
  g.meshes.forEach(m => m.primitives.forEach(p => { if (p.material != null) p.material = mats.map.get(p.material); }));
  g.materials = mats.kept;

  const usedAcc = new Set();
  g.meshes.forEach(m => m.primitives.forEach(p => {
    Object.values(p.attributes).forEach(a => usedAcc.add(a));
    if (p.indices != null) usedAcc.add(p.indices);
    (p.targets || []).forEach(t => Object.values(t).forEach(a => usedAcc.add(a)));
  }));
  g.skins.forEach(s => { if (s.inverseBindMatrices != null) usedAcc.add(s.inverseBindMatrices); });
  g.animations.forEach(a => a.samplers.forEach(s => { usedAcc.add(s.input); usedAcc.add(s.output); }));
  const acc = remap(g.accessors, usedAcc);
  const fixAcc = i => acc.map.get(i);
  g.meshes.forEach(m => m.primitives.forEach(p => {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = fixAcc(p.attributes[k]);
    if (p.indices != null) p.indices = fixAcc(p.indices);
    (p.targets || []).forEach(t => { for (const k of Object.keys(t)) t[k] = fixAcc(t[k]); });
  }));
  g.skins.forEach(s => { if (s.inverseBindMatrices != null) s.inverseBindMatrices = fixAcc(s.inverseBindMatrices); });
  g.animations.forEach(a => a.samplers.forEach(s => { s.input = fixAcc(s.input); s.output = fixAcc(s.output); }));
  g.accessors = acc.kept;

  const usedImagesViews = new Set((g.images || []).filter(im => im.bufferView != null).map(im => im.bufferView));
  const usedViews = new Set([...g.accessors.filter(a => a.bufferView != null).map(a => a.bufferView), ...usedImagesViews]);

  // One fresh buffer: each kept view copied in, 4-byte aligned.
  const chunks = [];
  let offset = 0;
  const viewMap = new Map();
  const views = [];
  g.bufferViews.forEach((bv, i) => {
    if (!usedViews.has(i)) return;
    const bytes = viewBytes(g, i);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    viewMap.set(i, views.length);
    views.push({ ...bv, buffer: 0, byteOffset: offset, byteLength: bytes.length });
    chunks.push(Buffer.from(bytes));
    offset += bytes.length;
  });
  g.accessors.forEach(a => { if (a.bufferView != null) a.bufferView = viewMap.get(a.bufferView); });
  (g.images || []).forEach(im => { if (im.bufferView != null) im.bufferView = viewMap.get(im.bufferView); });
  g.bufferViews = views;
  g._bins = [Buffer.concat(chunks)];
  g.buffers = [{ byteLength: g._bins[0].length }];
  return g;
}

function save(g, name) {
  const out = { ...g };
  out.buffers = [{ byteLength: g._bins[0].length, uri: 'data:application/octet-stream;base64,' + g._bins[0].toString('base64') }];
  // External images (Poly Haven ships .jpg files) become data URIs too.
  if (out.images) {
    out.images = out.images.map(im => {
      if (!im.uri || im.uri.startsWith('data:')) return im;
      const ext = path.extname(im.uri).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      return { ...im, uri: `data:${mime};base64,${readFileSync(path.join(g._dir, im.uri)).toString('base64')}` };
    });
  }
  delete out._bins; delete out._dir;
  const file = path.join(OUT, name);
  writeFileSync(file, JSON.stringify(out));
  console.log(`  wrote ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
}

/* ------------------------------------------------------------- mesh edits -- */

function detach(g, test) {
  const gone = new Set(g.nodes.flatMap((n, i) => (n.mesh != null && test(n.name) ? [i] : [])));
  for (const n of g.nodes) if (n.children) n.children = n.children.filter(c => !gone.has(c));
  for (const s of g.scenes) s.nodes = s.nodes.filter(c => !gone.has(c));
}

/* Copies mesh nodes from `donor` into `base`. Both must share the same skeleton
 * (same joint order and bind pose — true across Quaternius' modular packs), so
 * the copies reuse base's skin 0. prune() later drops what the donor does not use. */
function graft(base, donor, test, materialFor) {
  const bufIndex = base._bins.push(donor._bins[0]) - 1;
  base.buffers.push({ byteLength: donor._bins[0].length });
  const bvMap = new Map(), accMap = new Map();
  const bv = i => {
    if (!bvMap.has(i)) bvMap.set(i, base.bufferViews.push({ ...donor.bufferViews[i], buffer: bufIndex }) - 1);
    return bvMap.get(i);
  };
  const acc = i => {
    if (!accMap.has(i)) {
      const a = { ...donor.accessors[i] };
      if (a.bufferView != null) a.bufferView = bv(a.bufferView);
      accMap.set(i, base.accessors.push(a) - 1);
    }
    return accMap.get(i);
  };
  const armature = base.nodes.find(n => n.name === 'CharacterArmature');
  donor.nodes.forEach(n => {
    if (n.mesh == null || !test(n.name)) return;
    const m = donor.meshes[n.mesh];
    const mesh = {
      name: m.name,
      primitives: m.primitives.map(p => {
        const q = { ...p, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, acc(v)])), material: materialFor(donor.materials[p.material]) };
        if (p.indices != null) q.indices = acc(p.indices);
        return q;
      })
    };
    const meshIndex = base.meshes.push(mesh) - 1;
    armature.children.push(base.nodes.push({ ...n, mesh: meshIndex, skin: 0 }) - 1);
  });
}

function material(g, name, rgb) {
  const i = g.materials.findIndex(m => m.name === name);
  if (i >= 0) return i;
  return g.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 1 } }) - 1;
}

/* Moves bind-pose vertices of the given mesh primitives with fn([x, y, z]) -> [x, y, z].
 * Skin weights are untouched, so the edited garment still follows the same bones.
 * Accessors are copied first so an edit never leaks into data another primitive shares. */
function reshape(g, nodeName, materials, fn) {
  const mesh = g.meshes[g.nodes.find(n => n.name === nodeName).mesh];
  for (const p of mesh.primitives) {
    if (!materials.includes(g.materials[p.material].name)) continue;
    const a = g.accessors[p.attributes.POSITION];
    const bv = g.bufferViews[a.bufferView];
    const src = viewBytes(g, a.bufferView);
    const bytes = Buffer.from(src.subarray(a.byteOffset || 0, (a.byteOffset || 0) + a.count * 12));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const stride = bv.byteStride || 12;
    if (stride !== 12) throw new Error(`${nodeName}: interleaved POSITION data is not supported`);
    for (let i = 0; i < a.count; i++) {
      const at = i * 12;
      const v = fn([bytes.readFloatLE(at), bytes.readFloatLE(at + 4), bytes.readFloatLE(at + 8)]);
      v.forEach((c, k) => { bytes.writeFloatLE(c, at + k * 4); min[k] = Math.min(min[k], c); max[k] = Math.max(max[k], c); });
    }
    const buffer = g._bins.push(bytes) - 1;
    g.buffers.push({ byteLength: bytes.length });
    const view = g.bufferViews.push({ buffer, byteOffset: 0, byteLength: bytes.length, target: bv.target }) - 1;
    p.attributes.POSITION = g.accessors.push({ ...a, bufferView: view, byteOffset: 0, min, max }) - 1;
  }
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* Stretches everything below `top` so the edge at `from` lands at `to`, flaring by up
 * to `flare` around (cx(x), cz) toward the new edge. Proportional, so lapels and
 * pockets keep their shape. The bind pose is a T-pose in meters, y up. */
function lengthen({ top, from, to, flare, cx, cz }) {
  const k = (top - to) / (top - from);
  return ([x, y, z]) => {
    if (y >= top) return [x, y, z];
    const ny = top - (top - y) * k;
    const f = 1 + flare * smooth(top, to, ny);
    const c = cx(x);
    return [c + (x - c) * f, ny, cz + (z - cz) * f];
  };
}

// Same idea along the arms, which run along ±x in the T-pose.
function lengthenSleeve({ from, end, to, flare, ay, az }) {
  const k = (to - from) / (end - from);
  return ([x, y, z]) => {
    const ax = Math.abs(x);
    if (ax <= from) return [x, y, z];
    const nx = from + (ax - from) * k;
    const f = 1 + flare * smooth(from, to, nx);
    return [Math.sign(x) * nx, ay + (y - ay) * f, az + (z - az) * f];
  };
}

// Slides the shirt cuff out along the arm so only a thin line shows past the sleeve.
const shiftCuff = ({ beyond, by }) => ([x, y, z]) => (Math.abs(x) > beyond ? [x + Math.sign(x) * by, y, z] : [x, y, z]);

/* ------------------------------------------------------------------- run -- */

await ensureSources();
mkdirSync(OUT, { recursive: true });

// Tomás: the Suit ships a pistol; his jacket ended at the waist, trousers above
// the ankle and sleeves short of the wrist. Measurements in the README.
const men = loadGltf(path.join(SRC, 'men-suit.gltf'));
detach(men, n => PROPS.test(n));
reshape(men, 'Suit_Body', ['Suit', 'White'], lengthen({ top: 1.20, from: 1.02, to: 0.86, flare: 0.17, cx: () => 0, cz: 0.06 }));
reshape(men, 'Suit_Body', ['Suit'], lengthenSleeve({ from: 0.36, end: 0.546, to: 0.60, flare: 0.12, ay: 1.435, az: 0.08 }));
reshape(men, 'Suit_Body', ['White'], shiftCuff({ beyond: 0.45, by: 0.032 }));
reshape(men, 'Suit_Legs', ['Suit'], lengthen({ top: 0.42, from: 0.14, to: 0.07, flare: 0.12, cx: x => Math.sign(x) * 0.124, cz: 0.063 }));
save(prune(men), 'tomas.gltf');

// Lía: Suit jacket over Formal's skirt and flats (recolored to match the suit),
// jacket lowered over the skirt's waistband, sleeves to the wrist.
const women = loadGltf(path.join(SRC, 'women-suit.gltf'));
const formal = loadGltf(path.join(SRC, 'women-formal.gltf'));
detach(women, n => PROPS.test(n) || /^Suit_(Legs|Feet)$/.test(n));
reshape(women, 'Suit_Body', ['Black', 'White'], lengthen({ top: 1.24, from: 1.13, to: 1.02, flare: 0.25, cx: () => 0, cz: 0.08 }));
reshape(women, 'Suit_Body', ['Black'], lengthenSleeve({ from: 0.36, end: 0.537, to: 0.59, flare: 0.12, ay: 1.441, az: 0.08 }));
reshape(women, 'Suit_Body', ['White'], shiftCuff({ beyond: 0.45, by: 0.03 }));
const suitBlack = women.materials.find(m => m.name === 'Black').pbrMetallicRoughness.baseColorFactor.slice(0, 3);
const skin = material(women, 'Skin');
const skirt = material(women, 'Skirt', suitBlack);
const shoes = material(women, 'Shoes', [0.02, 0.02, 0.02]);
graft(women, formal, n => /^Formal_(Legs|Feet)$/.test(n), m => (m.name === 'Skin' ? skin : m.name === 'LimeGreen' ? skirt : shoes));
save(prune(women), 'lia.gltf');

// Armchair: already lean; only re-packed into one self-contained file.
const chair = loadGltf(path.join(SRC, 'armchair', `${CHAIR_ID}.gltf`));
save(prune(chair), 'armchair.gltf');
