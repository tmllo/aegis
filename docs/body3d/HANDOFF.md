# Body v2: handoff for Emile

**What this is:** the full interactive 3D body, as a standalone Vite app. It replaces the v1 body that's in `web/src/components/body/AegisBody.tsx`. Tomas put it here in `docs/` so nothing in `/web` was touched; you decide when and how to bring it in.

**See it first:** live preview: https://claude.ai/artifact/ME8wZTrbTSJ9bw5YkzXmT8 (or run it locally, below).

## What's new vs v1
- **Lenses** (left rail): Whole body, Heart & blood, Brain & sleep, Bones & muscle, Blood sugar, Radiation & temp. Each fades the body to the layers that matter and shows only those numbers.
- **Click any organ or label:** a side inspector opens with that organ cut out of the same model and running live, plus a cell-level close-up (red cells in an artery, nerve signals, bone lattice and muscle fibres launch vs today, DNA breaks).
- **Full anatomy:** about 570k triangles, 15 layers (skin, muscles, skeleton, arteries, veins, heart, brain, lungs, organs, eyes).
- **Warning light:** the screen edge glows amber or pulses red, plus a banner with a "Look inside" button.
- **Every visual is driven by a field in `crew_data.json`.** The table is in `README.md`. No contract change.

## Run it standalone (2 min)
```bash
cd docs/body3d
npm i
npm run dev        # http://localhost:5173
```
Practice links: add `#hypertension-heart`, `#boneloss-bone`, `#storm-dna`, `#sleep-brain-2` or `#sugar-metabolic` to the URL.

## Port it into /web (about 30–45 min)
1. **Copy files:**
   - `src/body/*` → `web/src/components/body3d/`
   - `public/body.glb` → `web/public/models/body.glb` (18.5 MB; the v1 `aegis-body.glb` can stay as a fallback)
2. **Types:** `src/body/types.ts` duplicates the contract types. Point its imports at `web/src/data/types.ts` instead if you prefer one source.
3. **Model path:** set `VITE_MODEL_URL=/models/body.glb` (or edit the fetch in `loadBody()` in `BodyScene.tsx` to use your `base()` helper).
4. **Data:** `src/App.tsx` is the screen. It takes `dataUrl`; pass the same `crew_data.json` URL your loader uses. Or lift `Body`, `CameraRig`, `Hotspots`, `Radiation`, `ViewShift` and the inspector into your own route.
5. **Dependencies.** `web/` already has three 0.169, fiber 8.18 and drei 9.122. It also needs:
   - `suspend-react` (tiny; required)
   - `@react-three/postprocessing@2` + `postprocessing@6`, only for the glow (Bloom/Vignette). To skip both, delete the `<EffectComposer>` block in `App.tsx`; it still works, just with less glow.

   The repo rule says to agree new deps first, so check with Tomas.
6. **Credit (required by CC BY 4.0):** keep "Anatomy: BodyParts3D 4.0, © DBCLS, CC BY 4.0" in the footer.

## Check on the demo laptop today
Three WebGL views run at once (body + organ + close-up). It was only tested in a software renderer, never on a real GPU. If it lags:
1. lower `dpr={[1, 1.75]}` to `[1, 1.25]`
2. drop the Bloom effect
3. close-ups can be lazy-mounted only when the inspector opens (they already are)

## Honest framing for the pitch
- Bone loss in our data is **estimated**, not measured. Say "estimated".
- The close-ups illustrate the mechanism driven by our numbers; they are not physics simulations.
- The "Simulate" options only push our own fields out of range, for rehearsal. They're labelled on screen.

## Rebuild the model (only if you want different structures)
`python3 build_body_full.py <clone of github.com/ashemag/human-atlas>/public/models out/` writes `body.glb` and `anchors.json`. Blender isn't needed.
