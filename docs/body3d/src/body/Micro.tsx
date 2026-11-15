// Close-up scenes: what is physically happening at cell scale, driven by the same vitals as the body.
// These are illustrations of the mechanism, not physics simulations.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vis } from "./derive";
import type { MicroKind } from "./targets";
import { U } from "./shaders";

const dummy = new THREE.Object3D();
const col = new THREE.Color();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------- artery: red cells pushed by each heartbeat, wall stretch = pressure, amber = glucose ---------- */

function Vessel({ vis }: { vis: Vis }) {
  const N = 190, G = 130, L = 5.2;
  const cells = useRef<THREE.InstancedMesh>(null), sugar = useRef<THREE.InstancedMesh>(null), wall = useRef<THREE.Mesh>(null);
  const seeds = useMemo(() => Array.from({ length: N + G }, () => ({ x: rnd(-L, L), r: Math.sqrt(Math.random()) * 0.8, a: rnd(0, 6.283), sp: rnd(0.7, 1.3), rot: rnd(0, 6.283), rs: rnd(-2, 2) })), []);

  useFrame(({ clock }, dt) => {
    const beat = U.uBeat.value, rate = vis.hr / 60, t = clock.elapsedTime, step = Math.min(dt, 0.05);
    const flow = (0.45 + 1.5 * beat) * rate * 1.2;
    const put = (mesh: THREE.InstancedMesh | null, i: number, s: (typeof seeds)[number], size: number, flat: number, show: boolean) => {
      if (!mesh) return;
      s.x += flow * s.sp * step;
      if (s.x > L) s.x = -L;
      dummy.position.set(s.x, s.r * Math.cos(s.a), s.r * Math.sin(s.a));
      dummy.rotation.set(s.rot + t * s.rs * (0.3 + flow), s.rot * 2, t * s.rs * 0.5);
      dummy.scale.set(size, size * flat, size).multiplyScalar(show ? 1 : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };
    for (let i = 0; i < N; i++) put(cells.current, i, seeds[i], 0.17, 0.36, true);
    const ng = Math.round(8 + vis.sugar * (G - 8));
    for (let i = 0; i < G; i++) put(sugar.current, i, seeds[N + i], 0.05, 1, i < ng);
    if (cells.current) cells.current.instanceMatrix.needsUpdate = true;
    if (sugar.current) sugar.current.instanceMatrix.needsUpdate = true;
    if (wall.current) { const s = 1 + (0.025 + 0.09 * vis.pressure) * beat; wall.current.scale.set(s, 1, s); }
  });

  return (
    <group rotation={[0.12, -0.25, 0]}>
      <mesh ref={wall} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.03, 1.03, L * 2, 64, 1, true]} />
        <meshStandardMaterial color="#8f1f2e" side={THREE.BackSide} roughness={0.55} emissive="#3a0710" emissiveIntensity={0.6 + vis.pressure * 1.2} />
      </mesh>
      <instancedMesh ref={cells} args={[undefined, undefined, N]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#d81f2c" roughness={0.35} emissive="#5a0308" />
      </instancedMesh>
      <instancedMesh ref={sugar} args={[undefined, undefined, G]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#ffc23d" emissive="#ffa200" emissiveIntensity={1.4} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ---------- nerve cells ---------- */

function Neurons({ vis }: { vis: Vis }) {
  const { nodes, edges, lines } = useMemo(() => {
    const nodes = Array.from({ length: 44 }, () => new THREE.Vector3(rnd(-3.6, 3.6), rnd(-1.2, 1.2), rnd(-1, 1)));
    const edges: [number, number][] = [];
    nodes.forEach((n, i) => {
      const near = nodes.map((m, j) => ({ j, d: n.distanceTo(m) })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
      near.forEach((x) => edges.push([i, x.j]));
    });
    const pts = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], i) => pts.set([...nodes[a].toArray(), ...nodes[b].toArray()], i * 6));
    return { nodes, edges, lines: pts };
  }, []);
  const body = useRef<THREE.InstancedMesh>(null), pulse = useRef<THREE.InstancedMesh>(null), g = useRef<THREE.Group>(null);
  const phase = useMemo(() => edges.map(() => Math.random()), [edges]);
  useFrame(({ clock }, dt) => {
    const f = vis.brainFatigue, t = clock.elapsedTime;
    if (g.current) g.current.rotation.y = Math.sin(t * 0.2) * 0.25;
    edges.forEach(([a, b], i) => {
      phase[i] = (phase[i] + dt * (0.9 - f * 0.7) * (0.6 + (i % 5) * 0.15)) % 1;
      dummy.position.lerpVectors(nodes[a], nodes[b], phase[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(i / edges.length < 1 - f * 0.65 ? 0.07 : 0);
      dummy.updateMatrix();
      pulse.current?.setMatrixAt(i, dummy.matrix);
    });
    nodes.forEach((n, i) => {
      const fire = Math.max(0, Math.sin(t * (3 - f * 2.2) + i * 1.7));
      dummy.position.copy(n); dummy.scale.setScalar(0.13 + fire * 0.05 * (1 - f)); dummy.updateMatrix();
      body.current?.setMatrixAt(i, dummy.matrix);
      col.set(f > 0.3 && i % 3 === 0 ? "#b8771a" : "#5d8fd9").multiplyScalar(0.35 + fire * (1 - f * 0.7));
      body.current?.setColorAt(i, col);
    });
    if (pulse.current) pulse.current.instanceMatrix.needsUpdate = true;
    if (body.current) { body.current.instanceMatrix.needsUpdate = true; if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true; }
  });
  return (
    <group ref={g}>
      <lineSegments>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[lines, 3]} /></bufferGeometry>
        <lineBasicMaterial color="#3d5c8f" transparent opacity={0.7} />
      </lineSegments>
      <instancedMesh ref={body} args={[undefined, undefined, nodes.length]}>
        <icosahedronGeometry args={[1, 2]} /><meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pulse} args={[undefined, undefined, edges.length]}>
        <sphereGeometry args={[1, 10, 10]} /><meshBasicMaterial color="#bfe3ff" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ---------- spongy bone: launch day (left) vs today (right) ---------- */

function Trabecular({ vis }: { vis: Vis }) {
  const struts = useMemo(() => {
    const nx = 9, ny = 4, nz = 3, sp = 0.72, P: THREE.Vector3[][][] = [];
    for (let x = 0; x < nx; x++) { P[x] = []; for (let y = 0; y < ny; y++) { P[x][y] = []; for (let z = 0; z < nz; z++) P[x][y][z] = new THREE.Vector3((x - (nx - 1) / 2) * sp + rnd(-0.2, 0.2), (y - (ny - 1) / 2) * sp + rnd(-0.2, 0.2), (z - (nz - 1) / 2) * sp + rnd(-0.2, 0.2)); } }
    const out: { mid: THREE.Vector3; q: THREE.Quaternion; len: number; s: number; cur: number }[] = [];
    const joints = P.flat(2).filter((p) => Math.abs(p.x) > 0.3);
    const up = new THREE.Vector3(0, 1, 0);
    const add = (a: THREE.Vector3, b: THREE.Vector3) => {
      const d = b.clone().sub(a), mid = a.clone().add(b).multiplyScalar(0.5);
      if (Math.abs(mid.x) < 0.22) return; // gap between the two halves
      out.push({ mid, q: new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()), len: d.length(), s: Math.random(), cur: 1 });
    };
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      if (x + 1 < nx) add(P[x][y][z], P[x + 1][y][z]);
      if (y + 1 < ny) add(P[x][y][z], P[x][y + 1][z]);
      if (z + 1 < nz) add(P[x][y][z], P[x][y][z + 1]);
    }
    return { out, joints };
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null), jref = useRef<THREE.InstancedMesh>(null), g = useRef<THREE.Group>(null), jc = useRef(1);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = Math.sin(clock.elapsedTime * 0.25) * 0.22;
    struts.out.forEach((s, i) => {
      const p = s.mid.x > 0 ? vis.porosity : 0;
      const goal = s.s < p * 0.9 ? 0 : 1 - p * 0.45;
      s.cur += (goal - s.cur) * 0.05;
      dummy.position.copy(s.mid); dummy.quaternion.copy(s.q); dummy.scale.set(0.15 * s.cur, s.len, 0.15 * s.cur); dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    jc.current += ((1 - vis.porosity * 0.45) - jc.current) * 0.05;
    struts.joints.forEach((p, i) => {
      dummy.position.copy(p); dummy.quaternion.identity(); dummy.scale.setScalar(0.2 * (p.x > 0 ? jc.current : 1)); dummy.updateMatrix();
      jref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (jref.current) jref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={g} rotation={[0.2, 0, 0]}>
      <instancedMesh ref={ref} args={[undefined, undefined, struts.out.length]}>
        <cylinderGeometry args={[1, 0.8, 1, 10]} /><meshStandardMaterial color="#e9dfc4" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={jref} args={[undefined, undefined, struts.joints.length]}>
        <icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#e9dfc4" roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

/* ---------- muscle fibres: launch day (left) vs today (right) ---------- */

function Fibers({ vis }: { vis: Vis }) {
  const fibres = useMemo(() => {
    const out: { x: number; y: number; side: number }[] = [];
    for (const side of [-1, 1]) for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
      if (Math.abs(q + r) > 3) continue;
      out.push({ x: side * 1.9 + (q + r / 2) * 0.36, y: r * 0.312, side });
    }
    return out;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null), cur = useRef(0);
  useFrame(() => {
    cur.current += (vis.atrophy - cur.current) * 0.05;
    fibres.forEach((f, i) => {
      const a = f.side > 0 ? cur.current : 0, r = 0.165 * (1 - a * 0.45);
      dummy.position.set(f.x, f.y, 0); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.set(r, 2.6, r); dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
      ref.current?.setColorAt(i, col.set("#b5332f").lerp(new THREE.Color("#c99a8f"), a * 0.8));
    });
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true; }
  });
  return (
    <group rotation={[0.25, -0.5, 0]}>
      <instancedMesh ref={ref} args={[undefined, undefined, fibres.length]}>
        <cylinderGeometry args={[1, 1, 1, 20]} /><meshStandardMaterial roughness={0.5} />
      </instancedMesh>
    </group>
  );
}

/* ---------- DNA with radiation strikes ---------- */

function Dna({ vis }: { vis: Vis }) {
  const N = 40, BREAKS = [6, 31, 18, 12, 25, 36, 3, 21, 28, 9];
  const back = useRef<THREE.InstancedMesh>(null), rung = useRef<THREE.InstancedMesh>(null), g = useRef<THREE.Group>(null), rays = useRef<THREE.InstancedMesh>(null);
  const raySeeds = useMemo(() => Array.from({ length: 16 }, () => ({ o: Math.random() * 10, x: rnd(-3.5, 3.5), sp: rnd(5, 9) })), []);
  const nb = Math.round(Math.max(0, vis.radiation - 0.25) * 12);
  const broken = useMemo(() => new Set(BREAKS.slice(0, nb)), [nb]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) g.current.rotation.x = t * 0.35;
    for (let i = 0; i < N; i++) {
      const x = (i - N / 2) * 0.2, a = i * 0.42, y = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62, br = broken.has(i);
      const flash = br ? 0.6 + 0.4 * Math.sin(t * 6 + i) : 0;
      for (const s of [1, -1]) {
        const k = i * 2 + (s > 0 ? 0 : 1);
        dummy.position.set(x, y * s, z * s); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(br ? 0.11 + flash * 0.04 : 0.1); dummy.updateMatrix();
        back.current?.setMatrixAt(k, dummy.matrix);
        back.current?.setColorAt(k, br ? col.setRGB(1.6 * flash + 0.6, 0.12, 0.1) : col.set(s > 0 ? "#6aa9ff" : "#9fd0ff"));
      }
      dummy.position.set(x, 0, 0); dummy.rotation.set(a, 0, 0); dummy.scale.set(0.035, br ? 0 : 1.24, 0.035); dummy.updateMatrix();
      rung.current?.setMatrixAt(i, dummy.matrix);
    }
    const nr = Math.round(1 + vis.radiation * 15);
    raySeeds.forEach((r, i) => {
      const p = ((t * r.sp + r.o) % 10) - 5;
      dummy.position.set(r.x + p * 0.5, -p, 0.4); dummy.rotation.set(0, 0, 0.46); dummy.scale.set(0.012, i < nr ? 1.1 : 0, 0.012); dummy.updateMatrix();
      rays.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [back.current, rung.current, rays.current]) if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });
  return (
    <>
      <group ref={g}>
        <instancedMesh ref={back} args={[undefined, undefined, N * 2]}><sphereGeometry args={[1, 14, 14]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
        <instancedMesh ref={rung} args={[undefined, undefined, N]}><cylinderGeometry args={[1, 1, 1, 6]} /><meshStandardMaterial color="#c9d6ea" roughness={0.4} /></instancedMesh>
      </group>
      <instancedMesh ref={rays} args={[undefined, undefined, raySeeds.length]}><cylinderGeometry args={[1, 1, 1, 4]} /><meshBasicMaterial color="#9ff6ff" toneMapped={false} /></instancedMesh>
    </>
  );
}

export function Micro({ kind, vis }: { kind: MicroKind; vis: Vis }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 4, 5]} intensity={1.8} />
      <pointLight position={[-4, 0.5, 2]} intensity={12} color="#ff9a8a" />
      {kind === "artery" && <Vessel vis={vis} />}
      {kind === "neurons" && <Neurons vis={vis} />}
      {kind === "trabecular" && <Trabecular vis={vis} />}
      {kind === "fibers" && <Fibers vis={vis} />}
      {kind === "dna" && <Dna vis={vis} />}
    </>
  );
}
