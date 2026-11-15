# Body rendering recipes (e^x Crew Station)

Research note for the `ui/body` build. Stack assumed: three 0.169, @react-three/fiber 8, @react-three/drei 9 (what `docs/body-kit/AegisBody.tsx` typechecks against). WebGLRenderer and GLSL only; no TSL or WebGPU.

## Summary

| Topic | Recommendation |
|---|---|
| Look | Additive fresnel skin shell + ghosted skeleton + lit organs with a status rim. All shader work, no new dependency |
| Glow | Inflated back-face halo per status region first; bloom from three's own `UnrealBloomPass` second. `@react-three/postprocessing` only if both fall short |
| Where in the body | Hotspot uniforms (world position + radius) in the shell and organ shaders. Works on the current GLB today |
| Single structures | Not possible with the current GLB (see section 1). Needs a `_PART` vertex attribute from the build script |
| Labels | One SVG overlay, labels in fixed side gutters, leader lines written through refs each frame |
| Camera | drei `CameraControls` (`camera-controls` ships with drei), `fitToBox` per region |
| File size | Meshopt through `npx @gltf-transform/cli`; target under 1.5 MB on disk. Not Draco (decoder comes from a CDN by default, breaks offline) |
| Blender | Not needed for the look. Only useful later for baked vertex AO or a smoother skin |

## 1. What the GLB really is (measured from the file)

The README says about 630 structures. Those are concatenated at build time. The file itself holds:

| Node | Triangles | Vertices | Bounds y (m) |
|---|---|---|---|
| `whole_body` | 22,372 | 11,492 | 0.00 to 1.72 |
| `brain` | 39,679 | 25,753 | 1.54 to 1.71 |
| `heart` | 19,389 | 12,337 | 1.25 to 1.36 |
| `blood` | 35,352 | 22,923 | 0.36 to 1.46 |
| `bones` | 79,843 | 64,329 | 0.01 to 1.71 |
| `bones_loadbearing` | 23,760 | 16,971 | 0.01 to 1.15 |
| `muscle_antigravity` | 22,726 | 23,593 | 0.11 to 1.45 |

Consequences:

- 7 nodes, 7 meshes, 7 materials, so **7 draw calls already**. No merge step is needed. Do not split it back into 630 meshes.
- Attributes are `POSITION` and `NORMAL` (float32) with uint32 indices. **No UVs, no vertex colours, no textures.** Any surface detail must come from shaders.
- A single bone or vessel cannot be highlighted as a mesh. Use hotspots (section 5a) or add a part id attribute (section 5b).
- Every mesh has under 65,536 vertices, so 16-bit indices are possible. The 7.2 MB is almost all uncompressed float32 plus uint32.
- The skin has only 11.5k vertices. If its silhouette looks faceted, raise `KEEP["whole_body"]` from 0.5 to 1.0 in `docs/body-kit/build_aegis_body.py` and rebuild. That is cheaper than Blender.
- Region centres and sizes must come from `new THREE.Box3().setFromObject(node)` at runtime, never typed in.

## 2. Layer plan and draw order

Transparency sorting is the main risk. Fix it with explicit `renderOrder` and depth rules instead of leaving it to three.

| Order | Layer | Material | depthWrite | Blending |
|---|---|---|---|---|
| 0 | Organs with a status (`brain`, `heart`, `blood`) | `MeshStandardMaterial` + rim patch | yes | normal |
| 1 | Skeleton and muscle, depth prepass | `colorWrite: false` | yes | none |
| 2 | Skeleton and muscle, ghost colour | fresnel `ShaderMaterial`, `depthFunc: EqualDepth` | no | normal, alpha about 0.35 |
| 3 | Glow halos | inflated back-face shell | no | additive |
| 4 | Skin shell | fresnel x-ray `ShaderMaterial` | no | additive |

Lighting: one key directional, one dim fill, one ambient. Do not use drei `<Environment preset>`: presets download HDR files at runtime and the app must run offline. If reflections are wanted, use `<Environment>` with `<Lightformer>` children (generated locally).

## 3. Holographic and clinical looks

### 3a. Fresnel x-ray shell (custom ShaderMaterial)

Used for the skin and, with other uniforms, for the ghost skeleton. Additive blending is order independent, so the skin never needs sorting and never hides organs.

```ts
import * as THREE from "three";

export const MAX_HOT = 4;

export function makeShellMaterial(color: THREE.ColorRepresentation, additive = true) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uBase: { value: 0.03 },      // fill alpha facing the camera
      uRim: { value: 0.9 },        // alpha at the silhouette
      uPower: { value: 2.6 },      // higher = thinner rim
      uTime: { value: 0 },
      uScan: { value: 0 },         // 0..1, optional scan line strength
      uHot: { value: Array.from({ length: MAX_HOT }, () => new THREE.Vector4()) }, // xyz world, w radius
      uHotColor: { value: Array.from({ length: MAX_HOT }, () => new THREE.Color()) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = mat3(modelMatrix) * normal;          // fine while scale is uniform
        vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      #define MAX_HOT ${MAX_HOT}
      uniform vec3 uColor; uniform float uBase, uRim, uPower, uTime, uScan;
      uniform vec4 uHot[MAX_HOT]; uniform vec3 uHotColor[MAX_HOT];
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        float a = uBase + uRim * f;
        vec3 col = uColor;
        for (int i = 0; i < MAX_HOT; i++) {
          float h = 1.0 - smoothstep(0.0, max(uHot[i].w, 1e-4), distance(vW, uHot[i].xyz));
          h *= step(1e-4, uHot[i].w);
          col = mix(col, uHotColor[i], h);
          a += h * 0.35;
        }
        float line = smoothstep(0.96, 1.0, sin(vW.y * 90.0 - uTime * 1.5));
        a += line * uScan * 0.15;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
}
```

Notes:

- `abs(dot())` keeps the rim correct on back faces, so `DoubleSide` is not needed. Single sided halves the skin fill cost.
- Keep `uBase` low (0.02 to 0.05). The cockpit reference reads as glass because the interior is almost empty and only the silhouette is lit.
- Scan lines are decoration. Leave `uScan` at 0 unless a scan is actually running (for example during a check-in).

### 3b. Rim on a lit material (onBeforeCompile)

Organs should stay lit so they read as solid objects inside the glass body. Add the status rim to `MeshStandardMaterial` instead of replacing it. Use `MeshStandardMaterial`, not the kit's `MeshPhysicalMaterial`: clearcoat costs a second specular lobe and is invisible here.

```ts
export function makeOrganMaterial(base: THREE.ColorRepresentation) {
  const u = {
    uRimColor: { value: new THREE.Color("#ffffff") },
    uRimPower: { value: 2.0 },
    uRimGain: { value: 0.0 },   // animate this, not emissiveIntensity alone
  };
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>",
        "#include <common>\nuniform vec3 uRimColor; uniform float uRimPower; uniform float uRimGain;")
      .replace("#include <emissivemap_fragment>", /* glsl */ `
        #include <emissivemap_fragment>
        float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), uRimPower);
        totalEmissiveRadiance += uRimColor * rim * uRimGain;`);
  };
  m.customProgramCacheKey = () => "organ-rim-v1";
  m.userData.u = u;             // update through material.userData.u
  return m;
}
```

`normal` and `vViewPosition` already exist at that point in the standard fragment shader. One program is compiled and shared by all organ materials because the cache key is constant.

### 3c. Ghost skeleton without self-overlap ("depth peel" in two passes)

True depth peeling needs several full-screen passes and is not worth it for 7 meshes. The same clean result (only the nearest surface of the skeleton shows, no ribs drawn through ribs) comes from a depth prepass:

```tsx
function Ghost({ geometry, material }: { geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const pre = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false }), []);
  // material: makeShellMaterial("#cfd8e6", false) with depthFunc = THREE.EqualDepth
  return (
    <>
      <mesh geometry={geometry} material={pre} renderOrder={1} />
      <mesh geometry={geometry} material={material} renderOrder={2} />
    </>
  );
}
```

Set `material.depthFunc = THREE.EqualDepth` and `material.depthWrite = false` on the colour pass. Both meshes share one geometry, so GPU memory does not grow. Cost: 2 extra draw calls per ghosted node.

When a region is selected, fade the other layers by lowering their `uRim` and `uBase` (damped in `useFrame`), not by toggling `visible`. The fade is the micro-animation.

## 4. Glowing status regions

Rule from the brief: green stays calm, amber glows steady, red pulses. Keep one colour per status and read it from the shared status tokens, not from a second colour table in the 3D code.

### 4a. No dependency, recommended first: inflated halo shell

A second mesh on the same geometry, drawn back faces only, pushed out along the normal, additive. Looks like bloom, costs one draw call per glowing region, and works with on-demand rendering.

```ts
export function makeHaloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uInflate: { value: 0.012 },   // metres; 0.008 to 0.02 on this body
      uGain: { value: 0.0 },        // 0 hides it; drive from status and pulse
      uFalloff: { value: 2.2 },
    },
    vertexShader: /* glsl */ `
      uniform float uInflate; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 w = modelMatrix * vec4(position + normalize(normal) * uInflate, 1.0);
        vN = mat3(modelMatrix) * normal; vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uGain, uFalloff; varying vec3 vN; varying vec3 vV;
      void main() {
        float g = pow(abs(dot(normalize(vN), normalize(vV))), uFalloff);
        gl_FragColor = vec4(uColor * g * uGain, 1.0);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
}
```

Pulse without allocations (the kit's `useFrame` creates `new THREE.Color` for every material every frame; do not copy that):

```ts
const target = useRef(0);
useFrame((state, dt) => {
  const pulse = status === "red" ? 0.65 + 0.35 * Math.sin(state.clock.elapsedTime * 4) : 1;
  target.current = status === "green" ? 0 : pulse * (focused ? 1.3 : 1);
  halo.uniforms.uGain.value = THREE.MathUtils.damp(halo.uniforms.uGain.value, target.current, 8, dt);
});
```

Set `halo.uniforms.uColor.value.set(statusColor)` in an effect when the status changes, not per frame.

### 4b. No new dependency, real bloom: three's own UnrealBloomPass

These files ship inside `three`, so nothing is added to `package.json`.

```tsx
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export function Bloom({ strength = 0.55, radius = 0.5, threshold = 0.85 }) {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, rt);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, threshold));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera, strength, radius, threshold]);
  useEffect(() => { composer.setSize(size.width, size.height); }, [composer, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);   // priority 1 takes over rendering from R3F
  return null;
}
```

Selectivity comes from the threshold: keep ordinary surfaces below it and let only status materials exceed it (`toneMapped: false` and a colour or gain above 1). Additive layers stack, so check that the skin rim does not cross the threshold where two silhouettes overlap; lower `uRim` if it does.

### 4c. New dependency (ask Emile first): @react-three/postprocessing

- Packages added: `@react-three/postprocessing` plus `postprocessing` (and its own small helpers).
- Version: fiber 8 needs `@react-three/postprocessing@2.x`. Version 3 requires fiber 9 and React 19.
- Size: not measured in this session. Expect on the order of a few tens of KB gzip for composer plus Bloom after tree shaking; confirm with `vite build` before accepting it, since the bundle budget is a flight-readiness check.
- Gain over 4b: mipmap bloom (softer, wider, less flicker) and effects merged into one pass.

```tsx
<EffectComposer multisampling={4} disableNormalPass>
  <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.8} radius={0.7} />
</EffectComposer>
```

Decision order: ship 4a. Add 4b only if the halo looks flat on the projector. Ask for 4c only if 4b flickers.

## 5. Selective highlight

### 5a. Where in the body, today: hotspots

The product goal is "what is wrong and where". A hotspot is a world position and a radius passed to the shell and organ shaders (`uHot`, `uHotColor` in 3a). It lights the skin and whatever sits under it, needs no geometry change, and keeps 7 draw calls.

```ts
// anchors.ts: named points derived from geometry, never typed-in coordinates
export function regionAnchor(scene: THREE.Object3D, node: string, bias = new THREE.Vector3(0, 0, 0)) {
  const box = new THREE.Box3().setFromObject(scene.getObjectByName(node)!);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  return { center: c.add(bias.clone().multiply(s)), radius: 0.5 * Math.max(s.x, s.y, s.z), box };
}
// bias is a fraction of the box, e.g. (0, -0.35, 0) on bones_loadbearing lands on the lower leg
```

Which metric maps to which region comes from `metrics[m].body_region` in the crew file. Finer anchors (for example lumbar spine inside `bones_loadbearing`) are a UI mapping table of node name plus box fraction; keep that table in one file in `ui/body`.

### 5b. A single structure (one femur, the aorta): `_PART` attribute

Needs a small change to `docs/body-kit/build_aegis_body.py` (outside `web/`, so ask first): before concatenating, give each structure an index and write it as a per-vertex float attribute named `_PART`, and write the index to name table into the manifest. Note that the simplification step rebuilds vertices, so simplify each structure before concatenating, or split the id back by nearest original vertex.

GLTFLoader exposes it as `geometry.attributes._part`. Then, in either shader:

```glsl
attribute float _part; varying float vPart;        // vertex: vPart = _part;
uniform float uPart;                                // -1.0 = none
float sel = 1.0 - step(0.5, abs(vPart - uPart));    // fragment: 1 on the selected structure
col = mix(col, uHotColor[0], sel); a += sel * 0.5;
```

Still 7 draw calls. This is the right path if Emile wants bone-level callouts; it is not needed for the five contract regions.

### 5c. Hover and selection outline

drei `<Outlines>` (inverted hull) works on these meshes but doubles the triangles of the outlined node. The halo in 4a already gives the same reading, so prefer raising `uGain` and `uRimGain` on hover and selection.

### 5d. Picking with gloves

The kit raycasts all 243k triangles on every pointer move, and thin vessels are impossible to hit with a gloved finger. Use invisible proxies instead:

```tsx
// one proxy per region, sized from the region box plus padding, largest touch area wins
<mesh position={a.center} scale={a.box.getSize(v).addScalar(0.06)} visible={false}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(region); }}>
  <boxGeometry />
</mesh>
```

`visible={false}` meshes are still raycast in R3F only if they are in the scene graph with handlers, which is the case here; set `raycast={() => null}` on the real anatomy meshes so they are skipped. Order proxies by specificity (heart before blood before bones before whole body) and take the first hit. Add the same regions as large buttons beside the body so selection never depends on 3D aim.

## 6. Callouts: 3D anchor to 2D label with a leader line

Cockpit style: labels sit in fixed left and right gutters, aligned to a grid, and a hairline runs from the label to the anchor. Labels never float over the body and never overlap each other.

One SVG over the canvas, updated through refs (no React state per frame):

```tsx
// inside the Canvas
function AnchorProjector({ anchors, store }: { anchors: THREE.Vector3[]; store: React.MutableRefObject<Float32Array> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    anchors.forEach((a, i) => {
      v.copy(a).project(camera);
      store.current[i * 2] = (v.x * 0.5 + 0.5) * size.width;
      store.current[i * 2 + 1] = (-v.y * 0.5 + 0.5) * size.height;
    });
    onProjected();   // plain function that writes the SVG attributes below
  });
  return null;
}

// outside the Canvas, same parent box, pointer-events: none on the svg
// label i has a fixed gutter position (lx, ly) from CSS grid measurements
line.setAttribute("points", `${lx},${ly} ${elbowX},${ly} ${ax},${ay}`);   // <polyline> with one elbow
dot.setAttribute("cx", String(ax)); dot.setAttribute("cy", String(ay));
```

- Pick the gutter side from the sign of the projected x so lines never cross the body.
- Animate entry with `stroke-dasharray` and `stroke-dashoffset` (line draws from label to anchor in about 250 ms), then fade in the value.
- drei `<Html position={anchor} center>` is fine for a single small marker at the anchor (the dot), but do not place the full label with it: labels would move with the camera and overlap.
- Occlusion tests are unnecessary because the body is translucent.

## 7. Camera focus

`camera-controls` is already a dependency of drei, so `CameraControls` adds nothing to `package.json`.

```tsx
import { CameraControls } from "@react-three/drei";

const controls = useRef<CameraControls>(null);
useEffect(() => {
  const c = controls.current; if (!c) return;
  c.smoothTime = 0.35;                        // about 0.6 s settle, no overshoot
  if (!region) { c.setLookAt(0, 1.0, 2.6, 0, 0.9, 0, true); return; }   // home view; derive from the whole_body box
  const { box } = regionAnchor(scene, nodeFor(region));
  c.fitToBox(box, true, { paddingTop: 0.15, paddingBottom: 0.15, paddingLeft: 0.4, paddingRight: 0.4, cover: false });
}, [region]);

<CameraControls ref={controls} makeDefault minDistance={0.5} maxDistance={4}
  minPolarAngle={Math.PI * 0.25} maxPolarAngle={Math.PI * 0.65}
  truckSpeed={0} dollySpeed={0.5} />
```

- `truckSpeed={0}` disables panning so a gloved drag can only rotate. Keep rotation around the vertical axis; clamp the polar angle so the body never ends up viewed from above.
- Leave room for the gutters with the padding values so the focused region is not under a label.
- Fallback with no controls library: keep target and position vectors in refs and call `THREE.MathUtils.damp` on each component in `useFrame`, then `camera.lookAt(target)`. Use `damp`, not a fixed `lerp` factor, so the motion is frame-rate independent.
- With `prefers-reduced-motion`, pass `false` as the transition flag.

## 8. Performance

Budget on a laptop at 1920x1080: 243k triangles and under 20 draw calls is light. The costs to watch are overdraw from transparent layers and per-frame JavaScript.

| Item | Rule |
|---|---|
| Draw calls | 7 base + 4 for ghost passes + up to 3 halos. Stay under 20 |
| Pixel ratio | `<Canvas dpr={[1, 2]}>`. On a 1080p projector this resolves to 1 |
| Renderer | `gl={{ antialias: true, powerPreference: "high-performance" }}`; with a composer, turn `antialias` off and use the multisampled target |
| Frame loop | `frameloop="demand"` when nothing pulses and the camera is still; switch to `"always"` while any region is red or a transition runs. `CameraControls` invalidates on its own |
| useFrame | No allocations, no `setState`. Reuse `Color` and `Vector3` objects. Damp uniforms |
| Materials | 4 programs in total: organ, shell, halo, prepass. Share them; only uniforms differ, so clone with `material.clone()` and keep the same cache key |
| Matrices | The body never moves: set `matrixAutoUpdate = false` on the nodes after load |
| Raycast | Proxies only (5d) |
| Cached scene | `useGLTF` returns a shared cached scene. Do not mutate it in place if a second body view exists (Ground surface); build meshes from `nodes[name].geometry` instead of using `<primitive>` |
| Unmount | Dispose the materials created here; leave the cached geometry to drei |

Recommended component shape (declarative, no traversal):

```tsx
const { nodes } = useGLTF("/models/body.glb") as unknown as { nodes: Record<string, THREE.Mesh> };
<group>
  <mesh geometry={nodes.heart.geometry} material={heartMat} renderOrder={0} raycast={noRaycast} />
  <Ghost geometry={nodes.bones.geometry} material={ghostMat} />
  <mesh geometry={nodes.whole_body.geometry} material={skinMat} renderOrder={4} raycast={noRaycast} />
</group>
```

If the nodes carry a transform after compression (see 9), use `<primitive>`-free placement by copying `nodes.x.position`, `quaternion` and `scale` onto each mesh, or wrap each in a group with `nodes.x.matrix`.

## 9. Compression (gltf-transform CLI through npx)

Nothing is installed globally; `npx` downloads the CLI into the npm cache. It was not run in this session (downloads were not permitted), so the sizes below are estimates and must be replaced with `ls -l` output.

```sh
cd "aegis-body-kit"
npx --yes @gltf-transform/cli inspect aegis-body.glb          # confirm 7 meshes, names
npx --yes @gltf-transform/cli weld aegis-body.glb /tmp/body-weld.glb
npx --yes @gltf-transform/cli meshopt /tmp/body-weld.glb ../aegis/web/public/models/body.glb --level medium
npx --yes @gltf-transform/cli inspect ../aegis/web/public/models/body.glb   # names must be unchanged
```

- **Use Meshopt, not Draco.** drei's `useGLTF` wires the Meshopt decoder from the bundle, so it works offline with no extra file. Its Draco path loads the decoder from a Google CDN by default, which fails the offline check; Draco would need the decoder files copied into `public/draco/` and `useGLTF(url, "/draco/")`.
- **Do not use the one-shot `optimize` command with defaults.** It dedups, joins and flattens: `brain`, `heart` and `blood` have identical materials and would be merged into one mesh, which destroys the region names. If `optimize` is used, pass `--join false --flatten false --palette false --simplify false --instance false`.
- Meshopt quantizes positions to 16 bit and normals to 8 bit and may put a scale and offset on each node. Always take bounds with `Box3.setFromObject`, and keep `normalize()` on normals in every shader (already done above).
- Do not simplify further: the brain is already at 20 percent of the source and the skin is low.

| File | Size |
|---|---|
| Current GLB | 7.2 MB (4.4 MB gzip per the kit README) |
| Meshopt, estimated | 1.0 to 1.8 MB on disk, less after the host's gzip or brotli |
| Target to accept | under 1.5 MB on disk, decode under 100 ms |

Precache the file in the service worker and keep `useGLTF.preload`. Show the crew overview while it loads; the body view sits behind `<Suspense>`.

## 10. Would Blender materially improve the visuals?

Blender is not installed. Short answer: **no for the look, a little for the geometry.**

| Blender could add | Worth it? |
|---|---|
| Baked ambient occlusion into vertex colours (`COLOR_0`), multiplied in the organ shader. Gives depth in the brain folds and between ribs | The one real visual gain. Do it only if organs look flat after the rim and halo pass |
| Smoother, cleaner skin (remesh, subdivision, fixed normals) | Try `KEEP["whole_body"] = 1.0` in the build script first |
| Splitting or naming sub-structures, placing anchor empties | Covered by box-fraction anchors (5a) and the `_PART` attribute (5b) |
| Pose change (arms away from the torso), rigging | Not needed; the scan pose is neutral standing |
| Materials, lighting, glass, glow | No. Blender materials do not export to glTF as shaders. The whole look in sections 3 and 4 is runtime GLSL |

Recommendation: do not install Blender now. Build sections 3 to 7, compress, then judge on the projector. Revisit only for baked AO.

## 11. Kit issues to fix when integrating

| In `AegisBody.tsx` | Fix |
|---|---|
| `new THREE.Color` per material per frame | Set colours on status change; damp scalars only |
| `MeshPhysicalMaterial` with clearcoat on every node | `MeshStandardMaterial` + rim for organs, shell shader for the rest |
| Skin is `DoubleSide`, alpha blended | Additive front-side fresnel shell |
| Raycast against full anatomy on pointer move | Proxies, pointer down only |
| Mutates the cached `useGLTF` scene | Build meshes from `nodes[name].geometry` |
| Local status colour table | Use the app's status tokens |
| Product name AEGIS in comments | e^x |

Credit line required in the footer or credits (CC BY 4.0): "Anatomy: BodyParts3D 4.0, (c) The Database Center for Life Science, licensed CC BY 4.0. Packaged via human-atlas (MIT)."
