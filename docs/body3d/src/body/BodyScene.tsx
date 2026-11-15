import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three-stdlib";
import { suspend } from "suspend-react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import A from "./anchors.json";
import type { Status } from "./types";
import type { Vis } from "./derive";
import { LENSES, pickTarget, type Lens, type TargetId } from "./targets";
import { U, boneMaterial, brainMaterial, flowMaterial, heartMaterial, muscleMaterial, skinMaterial } from "./shaders";

export const STATUS_HEX: Record<Status, string> = { green: "#0ca30c", amber: "#fab219", red: "#d03b3b" };
export type Layers = { skin: boolean; muscles: boolean; skeleton: boolean; vessels: boolean; organs: boolean };
export const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);

const NODE_LAYER: Record<string, { layer: keyof Layers; key: string }> = {
  skin: { layer: "skin", key: "skin" },
  muscles: { layer: "muscles", key: "muscles" },
  muscle_antigravity: { layer: "muscles", key: "mag" },
  bones: { layer: "skeleton", key: "bones" },
  bones_loadbearing: { layer: "skeleton", key: "bones" },
  arteries: { layer: "vessels", key: "vessels" },
  artery_lad: { layer: "vessels", key: "vessels" },
  veins: { layer: "vessels", key: "vessels" },
  heart: { layer: "organs", key: "heart" },
  brain: { layer: "organs", key: "brain" },
  eyes: { layer: "organs", key: "eyes" },
  airways: { layer: "organs", key: "organs" },
  organs: { layer: "organs", key: "organs" },
  lung_left: { layer: "organs", key: "lungs" },
  lung_right: { layer: "organs", key: "lungs" },
};
const RENDER_ORDER: Record<string, number> = { lung_left: 5, lung_right: 5, muscles: 6, muscle_antigravity: 6, skin: 10 };
const NO_PICK = new Set(["skin", "muscles", "lung_left", "lung_right", "airways"]);

/** Loads body.glb. Hosts that can't serve .glb can ship it gzipped + base64 as body-glb-gz.js (VITE_MODEL_B64=1). */
async function loadBody(): Promise<THREE.Group> {
  let buf: ArrayBuffer;
  if (import.meta.env.VITE_MODEL_B64 === "1") {
    const txt = (await (await fetch("body-glb-gz.js")).text()).trim();
    const bin = atob(txt), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  } else {
    buf = await (await fetch(import.meta.env.VITE_MODEL_URL ?? "body.glb")).arrayBuffer();
  }
  return (await new GLTFLoader().parseAsync(buf, "")).scene;
}
export const useBody = () => suspend(loadBody, ["aegis-body"]);

const nodeName = (mesh: THREE.Object3D) => (mesh.name in NODE_LAYER ? mesh.name : mesh.parent?.name ?? mesh.name);

/** One geometry per model layer, shared by the body and the organ inspector. */
export function bodyGeometries(scene: THREE.Group): Record<string, THREE.BufferGeometry> {
  const out: Record<string, THREE.BufferGeometry> = {};
  scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) out[nodeName(m)] = m.geometry; });
  return out;
}

export function makeMaterials(): Record<string, THREE.Material> {
  return {
    skin: skinMaterial(),
    muscles: muscleMaterial("muscles", false),
    muscle_antigravity: muscleMaterial("muscle_antigravity", true),
    bones: boneMaterial("bones", false),
    bones_loadbearing: boneMaterial("bones_loadbearing", true),
    arteries: flowMaterial("arteries", "#7d0f1c", "#ff3b4e", 1),
    artery_lad: flowMaterial("artery_lad", "#7d0f1c", "#ff3b4e", 1, true),
    veins: flowMaterial("veins", "#1d3277", "#4d86ff", -1),
    heart: heartMaterial(),
    brain: brainMaterial(),
    eyes: new THREE.MeshPhysicalMaterial({ name: "eyes", color: "#eef2f5", roughness: 0.15, clearcoat: 1 }),
    airways: new THREE.MeshStandardMaterial({ name: "airways", color: "#e9c9c6", roughness: 0.5 }),
    organs: new THREE.MeshStandardMaterial({ name: "organs", color: "#9b5a45", roughness: 0.5 }),
    lung_left: new THREE.MeshPhysicalMaterial({ name: "lungs", color: "#e48a96", roughness: 0.35, transparent: true, depthWrite: false, opacity: 0.22, clearcoat: 1 }),
  };
}

const setU = (mat: THREE.Material | undefined, key: string, fn: (u: { value: any }) => void) => {
  const u = (mat?.userData.u as Record<string, { value: any }> | undefined)?.[key];
  if (u) fn(u);
};

/** Per-material uniforms that depend on the current vitals. */
export function syncMaterials(mats: Record<string, THREE.Material>, vis: Vis, k: number) {
  setU(mats.heart, "uIsch", (u) => u.value.copy(v3(A.lad_block)).addScaledVector(U.uBlockAxis.value, 0.032));
  setU(mats.heart, "uStatus", (u) => u.value.set(STATUS_HEX[vis.status.heart]));
  setU(mats.heart, "uStatusAmt", (u) => (u.value = vis.ladBlock > 0 || vis.status.heart === "green" ? 0 : vis.status.heart === "amber" ? 0.25 : 0.45));
  setU(mats.brain, "uStatus", (u) => u.value.set(STATUS_HEX[vis.status.brain === "green" ? "amber" : vis.status.brain]));
  setU(mats.bones_loadbearing, "uStatus", (u) => u.value.set(STATUS_HEX[vis.status.bones === "green" ? "amber" : vis.status.bones]));
  setU(mats.veins, "uAmp", (u) => (u.value += ((1 - vis.stasis * 0.8) - u.value) * k));
  const skin = mats.skin as THREE.ShaderMaterial;
  skin.uniforms.uTintAmt.value += (vis.fever - skin.uniforms.uTintAmt.value) * k;
  skin.uniforms.uAura.value += (vis.radiation * (vis.status.whole_body === "green" ? 0.3 : 1) - skin.uniforms.uAura.value) * k;
}

/* ---------- the body ---------- */

type BodyProps = { vis: Vis; lens: Lens; layers: Layers; onPick: (t: TargetId) => void; onReady?: () => void };

export function Body({ vis, lens, layers, onPick, onReady }: BodyProps) {
  const scene = useBody();
  useEffect(() => { onReady?.(); }, [onReady]);
  const lungC = useMemo(() => v3(A.lungs), []);

  const mats = useMemo(() => {
    const m = makeMaterials();
    for (const [k, mat] of Object.entries(m)) if (k !== "skin") mat.transparent = true;
    return m;
  }, []);

  const nodes = useMemo(() => {
    const out: Record<string, THREE.Mesh> = {};
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = nodeName(mesh);
      mesh.material = mats[name === "lung_right" ? "lung_left" : name] ?? mesh.material;
      mesh.renderOrder = RENDER_ORDER[name] ?? 0;
      mesh.frustumCulled = name !== "heart" && name !== "muscle_antigravity"; // vertex-animated meshes
      mesh.userData.node = name;
      out[name] = mesh;
    });
    return out;
  }, [scene, mats]);

  useEffect(() => {
    U.uHeart.value.copy(v3(A.heart));
    U.uBlockP.value.copy(v3(A.lad_block));
    U.uBlockAxis.value.copy(v3(A.lad_axis)).normalize();
  }, []);

  const opacity = useRef<Record<string, number>>({});

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const rate = vis.hr / 60;
    const ph = (t * rate) % 1; // heartbeat: sharp squeeze, slow relaxation
    U.uTime.value = t;
    U.uRate.value = rate;
    U.uBeat.value = ph < 0.15 ? Math.sin((ph / 0.15) * Math.PI * 0.5) : Math.exp(-(ph - 0.15) * 7);
    const k = 1 - Math.exp(-dt * 3);
    U.uPressure.value += (vis.pressure - U.uPressure.value) * k;
    U.uBlock.value += (vis.ladBlock - U.uBlock.value) * k;
    U.uSugar.value += (vis.sugar - U.uSugar.value) * k;
    U.uPorosity.value += (vis.porosity - U.uPorosity.value) * k;
    U.uAtrophy.value += (vis.atrophy - U.uAtrophy.value) * k;
    U.uFatigue.value += (vis.brainFatigue - U.uFatigue.value) * k;
    syncMaterials(mats, vis, k);

    const br = 1 + 0.035 * Math.sin(t * 1.45); // breathing, about 14 breaths a minute
    for (const n of ["lung_left", "lung_right"]) {
      const mesh = nodes[n];
      if (!mesh) continue;
      mesh.scale.setScalar(br);
      mesh.position.copy(lungC).multiplyScalar(1 - br);
    }

    // Fade layers toward what this lens shows. Materials stay transparent so fading never recompiles a shader.
    const target = LENSES[lens].opacity;
    for (const [name, mesh] of Object.entries(nodes)) {
      const meta = NODE_LAYER[name];
      if (!meta) continue;
      const goal = layers[meta.layer] ? target[meta.key] ?? 1 : 0;
      const cur = (opacity.current[name] ??= goal);
      const next = cur + (goal - cur) * (1 - Math.exp(-dt * 5));
      opacity.current[name] = next;
      mesh.visible = next > 0.01;
      const mat = mesh.material as THREE.Material & { opacity: number };
      if (name === "skin") { (mat as unknown as THREE.ShaderMaterial).uniforms.uOpacity.value = next; continue; }
      if (name.startsWith("lung")) { if (name === "lung_left") mat.opacity = 0.25 * next; continue; }
      mat.depthWrite = !name.startsWith("muscle") && next > 0.98;
      mat.opacity = next;
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return; // it was a drag, not a click
    for (const hit of e.intersections) {
      const name = hit.object.userData.node as string | undefined;
      if (!name || NO_PICK.has(name) || (opacity.current[name] ?? 1) < 0.3) continue;
      const t = pickTarget(name, hit.point, lens);
      if (t) { onPick(t); return; }
    }
  };

  return <primitive object={scene} onClick={click} />;
}

/* ---------- LAD plaque marker ---------- */

export function Plaque({ on }: { on: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(A.lad_axis).normalize()), []);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const p = (clock.elapsedTime * 1.4) % 1;
    ring.current.scale.setScalar(1 + 0.5 * p);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * on;
  });
  if (on < 0.05) return null;
  return (
    <group position={A.lad_block as [number, number, number]}>
      <mesh>
        <icosahedronGeometry args={[0.0058, 2]} />
        <meshStandardMaterial color="#ffd36b" emissive="#ffb020" emissiveIntensity={1.6} roughness={0.8} />
      </mesh>
      <mesh ref={ring} quaternion={q}>
        <torusGeometry args={[0.011, 0.0012, 8, 48]} />
        <meshBasicMaterial color="#ff3030" transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------- radiation: particle streaks crossing the body ---------- */

export function Radiation({ level }: { level: number }) {
  const N = 1400;
  const ref = useRef<THREE.LineSegments>(null);
  const { pos, seeds, dir, side, up } = useMemo(() => {
    const pos = new Float32Array(N * 6), seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random() * 2 - 1; seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = Math.random() * 2 - 1; }
    const dir = new THREE.Vector3(0.75, -0.35, 0.55).normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    return { pos, seeds, dir, side, up: new THREE.Vector3().crossVectors(side, dir).normalize() };
  }, []);
  useFrame(({ clock }) => {
    const g = ref.current?.geometry; if (!g) return;
    const t = clock.elapsedTime, n = Math.floor(N * Math.min(1, level));
    for (let i = 0; i < n; i++) {
      const s0 = seeds[i * 4], s1 = seeds[i * 4 + 1], s2 = seeds[i * 4 + 2], s3 = seeds[i * 4 + 3];
      const along = ((t * (1.2 + s2) + s0 * 3) % 3) - 1.5;
      const x = side.x * s1 * 0.45 + up.x * s3 * 0.95 + dir.x * along, y = 0.95 + side.y * s1 * 0.45 + up.y * s3 * 0.95 + dir.y * along, z = side.z * s1 * 0.45 + up.z * s3 * 0.95 + dir.z * along;
      pos.set([x, y, z, x - dir.x * 0.07, y - dir.y * 0.07, z - dir.z * 0.07], i * 6);
    }
    g.setDrawRange(0, n * 2);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <lineBasicMaterial color="#9ff6ff" transparent opacity={0.55} toneMapped={false} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

/* ---------- 3D labels with live numbers ---------- */

export type Hotspot = { id: TargetId; pos: number[]; lines: string[]; status: Status };

export function Hotspots({ spots, active, onPick }: { spots: Hotspot[]; active: TargetId | null; onPick: (t: TargetId) => void }) {
  return (
    <>
      {spots.map((h) => (
        <group key={h.id} position={h.pos as [number, number, number]}>
          <mesh><sphereGeometry args={[0.0035, 16, 16]} /><meshBasicMaterial color={STATUS_HEX[h.status]} toneMapped={false} /></mesh>
          <Html zIndexRange={[20, 0]} style={{ pointerEvents: "auto" }}>
            <button className={`hs hs--${h.status} ${active === h.id ? "hs--on" : ""}`} onClick={() => onPick(h.id)}>
              <span className="hs-dot" />
              <span className="hs-text">{h.lines.map((l, i) => <span key={i} className={i === 0 ? "hs-main" : "hs-sub"}>{l}</span>)}</span>
            </button>
          </Html>
        </group>
      ))}
    </>
  );
}

/* ---------- keep the body centred in the space left of the side panel ---------- */

export function ViewShift({ px }: { px: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (size.width > 900) cam.setViewOffset(size.width, size.height, px, 0, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size, px]);
  return null;
}

/* ---------- camera: glides to each view, then free orbit ---------- */

export function CameraRig({ view }: { view: { key: string; target: number[]; offset: number[] } }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const goal = useRef({ t: new THREE.Vector3(), p: new THREE.Vector3(), active: false });
  useEffect(() => {
    const t = v3(view.target);
    goal.current = { t, p: t.clone().add(v3(view.offset)), active: true };
  }, [view.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ctl = controls.current; if (!ctl) return;
    const stop = () => (goal.current.active = false);
    ctl.addEventListener("start", stop);
    return () => ctl.removeEventListener("start", stop);
  }, []);
  useFrame((_, dt) => {
    const g = goal.current, ctl = controls.current;
    if (!g.active || !ctl) return;
    const k = 1 - Math.exp(-dt * 3.2);
    ctl.target.lerp(g.t, k);
    camera.position.lerp(g.p, k);
    ctl.update();
    if (camera.position.distanceTo(g.p) < 0.002 && ctl.target.distanceTo(g.t) < 0.002) g.active = false;
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.15} maxDistance={5} enableDamping dampingFactor={0.08} />;
}
