// The one persistent 3D scene behind the HUD: a static star field, the Earth (real sun
// terminator, night-side city lights, slow clouds, orbit track, network mesh) and the
// porcelain body in a grey studio below it. Sections never load a new scene: the camera flies
// between views in 800 ms (eased) and comes back along the same path. Drag to orbit (damped),
// scroll or pinch to zoom within limits, double-click to fly to a point or organ.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useLocation, useNavigate } from 'react-router-dom';
import { TARGETS } from '../components/body3d/targets';
import { EarthGroup, Pin, SUN_VIEW, sunLocal } from './Globe';
import { Porcelain } from './Porcelain';
import { useHud } from './hud';

export const BODY_Y = -6;
const TILT = 0.32;

// The scene mounts after the intro hands off (the GLB and textures are prefetched meanwhile).

type V3 = [number, number, number];
type View = { pos: V3; target: V3 };

function viewFor(path: string, focus: string | null, sun: THREE.Vector3): View {
  if (path === '/') {
    const t = focus ? TARGETS[focus as keyof typeof TARGETS] : null;
    if (t) {
      const c = t.box.c;
      const d = Math.max(0.8, Math.hypot(...t.box.h) * 3.8);
      return { pos: [c[0] + 0.22, c[1] + BODY_Y + 0.06, c[2] + d], target: [c[0] + 0.12, c[1] + BODY_Y, c[2]] };
    }
    return { pos: [0, BODY_Y + 0.98, 3.25], target: [0, BODY_Y + 0.9, 0] };
  }
  if (path.startsWith('/environment')) {
    // the sun side of the Earth, a little off so the terminator shows
    const p = sun.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.9).multiplyScalar(3.7);
    return { pos: [p.x, p.y + 0.25, p.z], target: [0, 0, 0] };
  }
  if (path.startsWith('/systems')) return { pos: [0.1, 2.3, 3.2], target: [0.1, -0.15, 0] };
  return { pos: [0.42, 0.06, 4.15], target: [0.42, 0.06, 0] };
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Flies the camera and the orbit target to each view; a drag hands control to the user. */
function CameraRig({ view, body, onNear }: { view: View; body: boolean; onNear: (n: boolean) => void }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const tween = useRef<{ p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; start: number } | null>(null);
  const near = useRef(false);
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const key = view.pos.join() + view.target.join();
  useEffect(() => {
    const c = controls.current;
    const t0 = c ? c.target.clone() : new THREE.Vector3(...view.target);
    tween.current = { p0: camera.position.clone(), t0, p1: new THREE.Vector3(...view.pos), t1: new THREE.Vector3(...view.target), start: -1 };
  }, [key, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => (tween.current = null);
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, []);
  useFrame((state) => {
    const c = controls.current;
    if (!c) return;
    const tw = tween.current;
    if (tw) {
      if (tw.start < 0) tw.start = state.clock.elapsedTime;
      const k = reduced ? 1 : Math.min(1, (state.clock.elapsedTime - tw.start) / 0.8);
      const e = ease(k);
      camera.position.lerpVectors(tw.p0, tw.p1, e);
      c.target.lerpVectors(tw.t0, tw.t1, e);
      if (k >= 1) tween.current = null;
    }
    c.update();
    if (body) {
      const n = camera.position.distanceTo(c.target) < 1.3;
      if (n !== near.current) {
        near.current = n;
        onNear(n);
      }
    }
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} enablePan={false} rotateSpeed={0.6} minDistance={body ? 0.35 : 1.25} maxDistance={body ? 6 : 9} />;
}


/** A very faint Milky Way: a few thousand dim points concentrated about one great circle. */
function MilkyWay() {
  const pos = useMemo(() => {
    const n = 5000;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const lon = Math.random() * Math.PI * 2;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.18; // narrow band
      const r = 110;
      a.set([r * Math.cos(g) * Math.cos(lon), r * Math.sin(g), r * Math.cos(g) * Math.sin(lon)], i * 3);
    }
    return a;
  }, []);
  return (
    <points rotation={[0.9, 0.3, 0.5]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#c9d6e8" size={0.35} sizeAttenuation transparent opacity={0.18} depthWrite={false} />
    </points>
  );
}

/** Sun disc far along the real sun direction; also feeds the view-space sun to the night lights. */
function Sun({ dir }: { dir: THREE.Vector3 }) {
  const { camera } = useThree();
  useFrame(() => {
    SUN_VIEW.value.copy(dir).transformDirection(camera.matrixWorldInverse);
  });
  return (
    <mesh position={dir.clone().multiplyScalar(60)} raycast={() => null}>
      <sphereGeometry args={[1.1, 32, 32]} />
      <meshBasicMaterial color="#fff4e0" toneMapped={false} />
    </mesh>
  );
}

export function World() {
  const loc = useLocation();
  const nav = useNavigate();
  const { yaw, focus, tint, setBodyReady, bodyTips, zoom, reset } = useHud();
  const [fly, setFly] = useState<View | null>(null);
  const [near, setNear] = useState(false);
  const body = loc.pathname === '/';

  // the real sun in world space (the Earth is tilted and turned by the dial)
  const sun = useMemo(() => sunLocal().applyEuler(new THREE.Euler(TILT, body ? 0 : yaw, 0)), [yaw, body]);
  useEffect(() => setFly(null), [loc.pathname, reset]);

  const base = fly ?? viewFor(loc.pathname, body ? focus : null, sun);
  const bk = base.pos.join() + base.target.join();
  const view: View = useMemo(() => {
    const t = new THREE.Vector3(...base.target);
    const p = new THREE.Vector3(...base.pos).sub(t).divideScalar(zoom).add(t);
    return { pos: [p.x, p.y, p.z], target: base.target };
  }, [bk, zoom, reset]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: view.pos, fov: 36, near: 0.01, far: 300 }} gl={{ antialias: true }}>
      <color attach="background" args={['#02040a']} />
      <Stars radius={120} depth={60} count={7000} factor={2.2} saturation={0} fade speed={0} />
      <MilkyWay />
      <ambientLight intensity={0.04} />
      <directionalLight position={sun.clone().multiplyScalar(5)} intensity={3.4} color="#fff6ea" />
      <Sun dir={sun} />
      <EarthGroup
        yaw={body ? 0 : yaw}
        tips={[]}
        orbitTips={[]}
        orbit={!loc.pathname.startsWith('/cabin')}
        onDouble={(p) => {
          const n = p.clone().normalize();
          setFly({ pos: [n.x * 2.3, n.y * 2.3, n.z * 2.3], target: [p.x * 0.6, p.y * 0.6, p.z * 0.6] });
        }}
      />

      {/* the body studio, below the Earth */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3.3} position={[-2.5, 3.5, 3]} rotation={[-0.7, -0.5, 0]} scale={[6, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.7} position={[3, 1, 2.5]} rotation={[0, 0.9, 0]} scale={[3, 5, 1]} color="#eef1f5" />
        <Lightformer form="rect" intensity={0.6} position={[0, 2, -4]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} color="#bfe8f0" />
      </Environment>
      <spotLight position={[-2.2, BODY_Y + 4, 3]} angle={0.6} penumbra={1} intensity={42} distance={14} color="#ffffff" target-position={[0, BODY_Y + 0.9, 0]} />
      <group position={[0, BODY_Y, 0]} rotation={[0, body ? yaw : 0, 0]} visible={body}>
        <Suspense fallback={null}>
          <Porcelain
            focus={focus}
            tint={tint}
            near={near}
            onPick={(t) => nav(`/?t=${t}`)}
            onReady={setBodyReady}
          />
        </Suspense>
        {body && bodyTips.map((b) => <Pin key={b.id} tip={b} />)}
        <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={2.2} blur={2.4} far={1.2} frames={1} />
      </group>

      <CameraRig view={view} body={body} onNear={setNear} />
    </Canvas>
  );
}
