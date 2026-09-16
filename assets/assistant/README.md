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

- keeps only the clips the assistant plays (`Idle`, `Idle_Neutral`, `Wave`, `Interact`);
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
