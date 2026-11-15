# AEGIS body: drop-in anatomy for the 3D body map

A real anatomical body to replace the primitive one. It keeps the same five clickable regions from the data contract, so `crew_data.json` and `contracts/` don't change.

## Files
- `aegis-body.glb`: 7.2 MB (4.4 MB gzipped), about 243k triangles, 1.72 m tall, standing at the origin with y up. Each glTF node is named after a region:
  - `brain`: 110 structures (cerebral hemispheres, cerebellum, brainstem, ventricles)
  - `heart`: 18 structures (walls, chambers, valves)
  - `blood`: 109 structures (aorta, venae cavae, carotids, subclavians, iliacs, femorals, jugulars and so on)
  - `bones`: 246 structures (the rest of the skeleton; teeth removed)
  - `bones_loadbearing`: 20 structures (femurs, hip bones, lumbar vertebrae, sacrum, tibiae, calcanei). This is where microgravity bone loss concentrates.
  - `muscle_antigravity`: 24 structures (soleus, gastrocnemius, vasti, rectus femoris, glutes, psoas, back extensors). These are the muscles that waste first in space.
  - `whole_body`: skin, drawn as a translucent shell that becomes the radiation/temperature aura
- `AegisBody.tsx`: the R3F component. It recolors each node by `status[region]`, makes red pulse, handles hover and click with picking through the skin, and calls `onSelect(region)`. It typechecks against three 0.169, fiber 8 and drei 9.
- `build_aegis_body.py`: rebuilds the GLB from a clone of `ashemag/human-atlas` if you want different structures. Run `python3 build_aegis_body.py human-atlas/public/models out.glb`.

## Integrate (about 20 min)
1. Copy `aegis-body.glb` to `web/public/models/` and `AegisBody.tsx` to `web/src/components/`.
2. Render `<AegisBody status={crew.status} selected={region} onSelect={setRegion} />` inside your Canvas. The bottom of the component file has a usage snippet with the camera and lights.
3. Keep the old primitive body behind a flag as a fallback until the demo run-through passes.
4. Add the credit line below to the footer or credits screen. The license requires it.

## Credit (required: CC BY 4.0)
> Anatomy: BodyParts3D 4.0, © The Database Center for Life Science, licensed CC BY 4.0. Packaged via human-atlas (github.com/ashemag/human-atlas, MIT).
