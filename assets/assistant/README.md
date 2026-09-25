# Assistant presence assets

Self-contained glTF files (buffers and textures embedded as data URIs) for the
cotizador's 3D assistant. `tools/generate.mjs` embeds them into
`generated/index.html`; see "Assistant presence" in the root `CLAUDE.md`.

| File | What | Source | License |
|---|---|---|---|
| `lia.gltf` | Lía: jacket from the Suit character, skirt and flats from the Formal character (recolored to match the suit) | Quaternius, "Ultimate Modular Women" pack (quaternius.com/packs/ultimatemodularwomen.html) | CC0 1.0 |
| `tomas.gltf` | Tomás: the Suit character, pistol prop removed | Quaternius, "Ultimate Modular Men" pack (quaternius.com/packs/ultimatemodularcharacters.html) | CC0 1.0 |
| `armchair.gltf` | Classic upholstered armchair, 1K textures | Poly Haven, "Arm Chair 01" (polyhaven.com/a/ArmChair_01) | CC0 1.0 |

CC0 needs no attribution; crediting Quaternius and Poly Haven is still appreciated.

## Regenerating

```
npm run build:assistant      # node tools/build-assistant-assets.mjs
```

The first run downloads the original files into `assets/assistant/sources/`
(gitignored, never committed). The script then:

- keeps only the clips the assistant plays (`Idle`, `Idle_Neutral`, `Wave`, `Interact`,
  `Walk` — the last one is how she gets to her armchair when the customer has been quiet);
- removes props (the men's Suit ships a skinned `Pistol` mesh);
- grafts Formal's `Formal_Legs`/`Formal_Feet` onto the women's Suit (same
  skeleton and bind pose across the pack) and recolors them;
- lengthens the garments by moving bind-pose vertices (T-pose, meters, y up):
  - Tomás: jacket hem 1.02 m → 0.86 m (17% flare), sleeves 0.546 m → 0.60 m
    (12% flare), shirt cuffs +0.032 m, trousers 0.14 m → 0.07 m (12% flare);
  - Lía: jacket hem 1.13 m → 1.02 m (25% flare, over the skirt's waistband),
    sleeves 0.537 m → 0.59 m, shirt cuffs +0.03 m;
- prunes everything the scene does not reach and rewrites a single buffer,
  so the grafted file does not carry Formal's whole buffer.

Sizes after pruning: `lia.gltf` ~1.0 MB, `tomas.gltf` ~1.0 MB, `armchair.gltf` ~1.0 MB.
Always check a new model for weapons or other props before shipping it.

## Known defect: the feet are not parented to the shins

Both characters have this skeleton shape (dumped from the glTF node tree):

```
Root ─┬─ Body ─┬─ Hips
      │        ├─ UpperLeg.L → LowerLeg.L   (LowerLeg.L is a LEAF)
      │        └─ UpperLeg.R → LowerLeg.R
      ├─ Foot.L          ← hangs off Root, NOT off LowerLeg.L
      ├─ Foot.R
      └─ PT.L, PT.R
```

Rotating a shin bends the visible shin but does not carry the foot with it: the feet
stay welded to the model's origin, so any pose that lowers the body (sitting on the
armchair drops her ~46 px) sinks them by that same amount. That is why the seated
pose can look right above the cushion and still have her feet through the floor.

**What the build does about it today** (2026-09): `reweightFeet()` in the builder
rewrites the FEET mesh's skin weights to 1.0 of its own `Foot.L/R` (the side read from
the x sign in the bind pose). Measured before: the feet band of `lia.gltf` carried
26.3% `Foot.L`, 26.3% `Foot.R`, 23.7% `LowerLeg.L` and 23.7% `LowerLeg.R` — HALF the
shoe rode the shin, and with the ankle bent (seated, sole flat on the floor) the two
halves pulled apart and the mesh collapsed: on screen the leg ended in a skin stub,
reported as "she has no feet when she is sitting". After the reweight the shoes render
at the feet — verified standing and seated (`assets/assistant/*.gltf` rebuilt, same
byte size, weights only). Walking still shows stubs: the clips animate the foot bones
in a space of their OWN (root-local), so during `Walk` they do not land where the leg
mesh ends — that is the retargeting below, still parked.

**The fix, when someone wants to spend the time** (parked on purpose — it is asset
surgery, not a one-liner):

1. In `tools/build-assistant-assets.mjs`, after the graft: re-parent `Foot.L/R` under
   `LowerLeg.L/R`, preserving their world transform
   (`foot.matrix = parentOldWorld⁻¹ · parentNewWorld · foot.matrix`).
2. Retarget the feet channels of all 5 clips (`Idle`, `Idle_Neutral`, `Interact`,
   `Walk`, `Wave` — each carries `translation` and `rotation` on both feet). Their
   values are local to `Root`; after re-parenting they must be local to the shin:
   per keyframe `t' = R⁻¹(t − T)`, `q' = q_shin⁻¹ · q`. With a static shin (every
   clip but `Walk`) that is one constant; `Walk` animates the shins, so its foot
   values have to be re-expressed against the shin's animated transform at each
   keyframe time.
3. Re-run `npm run build:assistant`, then the suite.

Until then `src/assistant/presence.js` measures the leg lengths off the rest pose
(knee → foot) to solve the seated IK, and the suite asserts the thigh really rotates
(`data-knee` at hip height) — never that the feet reach the floor.
