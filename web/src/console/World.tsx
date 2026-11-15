// The one persistent 3D scene behind the HUD: the Earth at the origin and the porcelain body in
// a grey studio below it. Sections never load a new scene; the camera flies between views in
// about 800 ms (eased) and comes back along the same path.
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { DefaultLoadingManager } from 'three';
import { useLocation, useNavigate } from 'react-router-dom';
import { TARGETS } from '../components/body3d/targets';
import { useCabin } from '../data/cabin';
import { EarthGroup, ll, onOrbit, Pin, type Tip } from './Globe';
import { Porcelain } from './Porcelain';
import { useHud } from './hud';
import { RANK, STATUS_WORD } from './model';
import { useConsole } from './useConsole';
import type { Status } from '../data/types';

export const BODY_Y = -6;

// The 18.5 MB body model loads behind the loading screen.
DefaultLoadingManager.itemStart('world-body');
let bodyHeld = true;
function bodyLoaded() {
  if (!bodyHeld) return;
  bodyHeld = false;
  DefaultLoadingManager.itemEnd('world-body');
}
const SUN = new THREE.Vector3(-3, 1.6, 2.2).normalize();

type View = { pos: [number, number, number]; target: [number, number, number] };

function viewFor(path: string, focus: string | null): View {
  if (path.startsWith('/vitals')) {
    const t = focus ? TARGETS[focus as keyof typeof TARGETS] : null;
    if (t) {
      const c = t.box.c;
      const d = Math.max(0.8, Math.hypot(...t.box.h) * 3.8);
      return { pos: [c[0] + 0.22, c[1] + BODY_Y + 0.06, c[2] + d], target: [c[0] + 0.12, c[1] + BODY_Y, c[2]] };
    }
    return { pos: [0, BODY_Y + 0.98, 3.25], target: [0, BODY_Y + 0.9, 0] };
  }
  if (path.startsWith('/cabin')) return { pos: [0.95, 0.85, 1.35], target: [-0.1, 0.1, -0.35] };
  if (path.startsWith('/storm')) {
    const p = SUN.clone().multiplyScalar(3.5);
    return { pos: [p.x + 0.4, p.y, p.z], target: [0.25, 0, 0] };
  }
  if (path.startsWith('/systems')) return { pos: [0.1, 2.3, 3.2], target: [0.1, -0.15, 0] };
  if (path.startsWith('/mind')) return { pos: [1.7, 0.35, 4.6], target: [1.15, 0, 0] };
  return { pos: [0.42, 0.06, 4.15], target: [0.42, 0.06, 0] };
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function CameraFly({ view }: { view: View }) {
  const { camera } = useThree();
  const from = useRef({ p: new THREE.Vector3(...view.pos), t: new THREE.Vector3(...view.target) });
  const look = useRef(new THREE.Vector3(...view.target));
  const t0 = useRef(-1);
  const key = view.pos.join() + view.target.join();
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => {
    from.current = { p: camera.position.clone(), t: look.current.clone() };
    t0.current = -1;
  }, [key, camera]);
  useFrame((state) => {
    if (t0.current < 0) t0.current = state.clock.elapsedTime;
    const k = reduced ? 1 : Math.min(1, (state.clock.elapsedTime - t0.current) / 0.8);
    const e = ease(k);
    camera.position.lerpVectors(from.current.p, new THREE.Vector3(...view.pos), e);
    look.current.lerpVectors(from.current.t, new THREE.Vector3(...view.target), e);
    camera.lookAt(look.current);
  });
  return null;
}

/** Grey studio backdrop behind the body: #5A5F66 to #2E3238, falling off to the scene. */
function Backdrop() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
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
    <mesh position={[0, BODY_Y + 1, -2.4]} material={mat}>
      <planeGeometry args={[9, 7]} />
    </mesh>
  );
}

function Sun() {
  const p = SUN.clone().multiplyScalar(40);
  return (
    <mesh position={p}>
      <sphereGeometry args={[0.9, 32, 32]} />
      <meshBasicMaterial color="#fff4e0" toneMapped={false} />
    </mesh>
  );
}

export function World() {
  const loc = useLocation();
  const nav = useNavigate();
  const { views, seat } = useConsole();
  const { cabin } = useCabin();
  const { yaw, focus, tint, setBodyReady, bodyTips } = useHud();
  const view = viewFor(loc.pathname, loc.pathname.startsWith('/vitals') ? focus : null);
  const worst = views.reduce<Status>((w, v) => (RANK[v.overall] > RANK[w] ? v.overall : w), 'green');

  const crewView = loc.pathname === '/';
  const tips: Tip[] = crewView || loc.pathname.startsWith('/systems')
    ? [{ id: 'ground', pos: ll(29.56, -95.09, 1.01), title: 'Ground', line: <em>{cabin ? (cabin.signal ? 'Link up' : 'Link down') : 'No link data'}</em>, status: cabin?.signal ? 'green' : 'amber' }]
    : [];
  const orbitTips: Tip[] = crewView
    ? [{ id: 'crew', pos: onOrbit(2.2), title: views.map((v) => seat[v.m.id]).join(' · '), line: <em>{STATUS_WORD[worst]}</em>, status: worst }]
    : [];

  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: view.pos, fov: 36, near: 0.01, far: 200 }} gl={{ antialias: true }}>
      <color attach="background" args={['#0e1316']} />
      <ambientLight intensity={0.06} />
      <directionalLight position={SUN.clone().multiplyScalar(5)} intensity={2.4} color="#fff6ea" />
      <Sun />
      <EarthGroup yaw={yaw} tips={tips} orbitTips={orbitTips} />

      {/* the body studio, below the Earth */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.4} position={[-2.5, 3.5, 3]} rotation={[-0.7, -0.5, 0]} scale={[6, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.7} position={[3, 1, 2.5]} rotation={[0, 0.9, 0]} scale={[3, 5, 1]} color="#eef1f5" />
        <Lightformer form="rect" intensity={0.3} position={[0, 2, -4]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} color="#d9e2ee" />
      </Environment>
      <Backdrop />
      <spotLight position={[-2.2, BODY_Y + 4, 3]} angle={0.6} penumbra={1} intensity={30} distance={14} color="#ffffff" target-position={[0, BODY_Y + 0.9, 0]} />
      <group position={[0, BODY_Y, 0]} rotation={[0, loc.pathname.startsWith('/vitals') ? yaw : 0, 0]}>
        <Suspense fallback={null}>
          <Porcelain focus={focus} tint={tint} onPick={(t) => nav(`/vitals?t=${t}`)} onReady={() => {
            bodyLoaded();
            setBodyReady();
          }} />
        </Suspense>
        {loc.pathname.startsWith('/vitals') && bodyTips.map((b) => <Pin key={b.id} tip={b} />)}
        <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={2.2} blur={2.4} far={1.2} frames={1} />
      </group>

      <CameraFly view={view} />
    </Canvas>
  );
}
