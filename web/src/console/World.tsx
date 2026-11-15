// The one persistent 3D scene behind the HUD: a static star field, the Earth (real sun
// terminator, night-side city lights, slow clouds, orbit track, network mesh) and the
// porcelain body in a grey studio below it. Sections never load a new scene: the camera flies
// between views in 800 ms (eased) and comes back along the same path. Drag to orbit (damped),
// scroll or pinch to zoom within limits, double-click to fly to a point or organ.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { DefaultLoadingManager } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useLocation, useNavigate } from 'react-router-dom';
import { TARGETS } from '../components/body3d/targets';
import type { Status } from '../data/types';
import { EarthGroup, ll, onOrbit, Pin, SUN_VIEW, sunLocal, type Tip } from './Globe';
import { Porcelain } from './Porcelain';
import { useHud } from './hud';
import { RANK, STATUS_WORD } from './model';
import { useConsole } from './useConsole';

export const BODY_Y = -6;
const TILT = 0.32;

// The 18.5 MB body model loads behind the loading screen.
DefaultLoadingManager.itemStart('world-body');
let bodyHeld = true;
function bodyLoaded() {
  if (!bodyHeld) return;
  bodyHeld = false;
  DefaultLoadingManager.itemEnd('world-body');
}

type V3 = [number, number, number];
type View = { pos: V3; target: V3 };

function viewFor(path: string, focus: string | null, sun: THREE.Vector3): View {
  if (path.startsWith('/compare')) return { pos: [0, BODY_Y + 1.0, 4.6], target: [0, BODY_Y + 0.88, 0] };
  if (path.startsWith('/vitals')) {
    const t = focus ? TARGETS[focus as keyof typeof TARGETS] : null;
    if (t) {
      const c = t.box.c;
      const d = Math.max(0.8, Math.hypot(...t.box.h) * 3.8);
      return { pos: [c[0] + 0.22, c[1] + BODY_Y + 0.06, c[2] + d], target: [c[0] + 0.12, c[1] + BODY_Y, c[2]] };
    }
    return { pos: [0, BODY_Y + 0.98, 3.25], target: [0, BODY_Y + 0.9, 0] };
  }
  if (path.startsWith('/cabin')) return { pos: [0.2, 1.38, 1.05], target: [-0.2, 0.75, -1.6] };
  if (path.startsWith('/storm')) {
    const p = sun.clone().multiplyScalar(3.6);
    return { pos: [p.x, p.y + 0.3, p.z], target: [0, 0, 0] };
  }
  if (path.startsWith('/systems')) return { pos: [0.1, 2.3, 3.2], target: [0.1, -0.15, 0] };
  if (path.startsWith('/mind')) return { pos: [1.7, 0.35, 4.6], target: [1.15, 0, 0] };
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

/** Grey studio backdrop behind the body: #5A5F66 to #2E3238, falling off to the scene. */
function Backdrop() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `varying vec2 vUv; void main(){
          vec3 top = vec3(0.353,0.373,0.4); vec3 bot = vec3(0.18,0.196,0.22);
          vec3 c = mix(bot, top, smoothstep(0.1, 0.9, vUv.y));
          float r = distance(vUv, vec2(0.5, 0.52)); float a = 1.0 - smoothstep(0.28, 0.62, r);
          gl_FragColor = vec4(c, a * 0.9); }`,
      }),
    [],
  );
  return (
    <mesh position={[0, BODY_Y + 1, -2.4]} material={mat} raycast={() => null}>
      <planeGeometry args={[9, 7]} />
    </mesh>
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
  const { views, seat } = useConsole();
  const { yaw, focus, tint, setBodyReady, bodyTips, zoom, reset } = useHud();
  const [fly, setFly] = useState<View | null>(null);
  const [near, setNear] = useState(false);
  const body = loc.pathname.startsWith('/vitals');
  const compare = loc.pathname.startsWith('/compare');
  const crewTints = useHud((s) => s.compare);

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

  const worst = views.reduce<Status>((w, v) => (RANK[v.overall] > RANK[w] ? v.overall : w), 'green');
  const crewView = loc.pathname === '/';
  const tips: Tip[] =
    crewView || loc.pathname.startsWith('/systems')
      ? [{ id: 'ground', pos: ll(29.56, -95.09, 1.01), title: 'Mission control', line: <em>Escalation queue</em>, status: 'green' }]
      : [];
  const orbitTips: Tip[] = crewView ? [{ id: 'crew', pos: onOrbit(2.2), title: views.map((v) => seat[v.m.id]).join(' · '), line: <em>{STATUS_WORD[worst]}</em>, status: worst }] : [];

  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: view.pos, fov: 36, near: 0.01, far: 300 }} gl={{ antialias: true }}>
      <color attach="background" args={['#0b1012']} />
      <Stars radius={120} depth={60} count={4000} factor={3} saturation={0} fade speed={0} />
      <ambientLight intensity={0.05} />
      <directionalLight position={sun.clone().multiplyScalar(5)} intensity={2.4} color="#fff6ea" />
      <Sun dir={sun} />
      <EarthGroup
        yaw={body ? 0 : yaw}
        tips={tips}
        orbitTips={orbitTips}
        orbit={!loc.pathname.startsWith('/cabin')}
        onDouble={(p) => {
          const n = p.clone().normalize();
          setFly({ pos: [n.x * 2.3, n.y * 2.3, n.z * 2.3], target: [p.x * 0.6, p.y * 0.6, p.z * 0.6] });
        }}
      />

      {/* the body studio, below the Earth */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.4} position={[-2.5, 3.5, 3]} rotation={[-0.7, -0.5, 0]} scale={[6, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.7} position={[3, 1, 2.5]} rotation={[0, 0.9, 0]} scale={[3, 5, 1]} color="#eef1f5" />
        <Lightformer form="rect" intensity={0.3} position={[0, 2, -4]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} color="#d9e2ee" />
      </Environment>
      {(body || compare) && <Backdrop />}
      <spotLight position={[-2.2, BODY_Y + 4, 3]} angle={0.6} penumbra={1} intensity={30} distance={14} color="#ffffff" target-position={[0, BODY_Y + 0.9, 0]} />
      <group position={[0, BODY_Y, 0]} rotation={[0, body ? yaw : 0, 0]} visible={body}>
        <Suspense fallback={null}>
          <Porcelain
            focus={focus}
            tint={tint}
            near={near}
            onPick={(t) => nav(`/vitals?t=${t}`)}
            onReady={() => {
              bodyLoaded();
              setBodyReady();
            }}
          />
        </Suspense>
        {body && bodyTips.map((b) => <Pin key={b.id} tip={b} />)}
        <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={2.2} blur={2.4} far={1.2} frames={1} />
      </group>
      {compare &&
        crewTints.map((tn, k) => (
          <group key={k} position={[(k - (crewTints.length - 1) / 2) * 0.9, BODY_Y, 0]}>
            <Suspense fallback={null}>
              <Porcelain focus={null} tint={tn} onPick={() => undefined} />
            </Suspense>
          </group>
        ))}

      <CameraRig view={view} body={body || compare} onNear={setNear} />
    </Canvas>
  );
}
