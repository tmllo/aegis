// The Radiation screen's object: the Sun in real space. A living surface (animated granulation, limb
// darkening, corona), every recent flare at its heliographic position, the magnetic field line from the
// Sun to the crew with particles running along it, a star field, and a camera that circles slowly when
// nobody touches it. All positions come from Forecast.tsx (storm_forecast.json); nothing is invented here.
// Heliographic frame: the Sun at the origin, the Earth side (lon 0) faces +Z, west (+lon) is +X.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html, Line, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AlertLevel } from '../data/types';
import './sun3d.css';

export interface SunFlare {
  id: string;
  lat: number;
  lon: number;
  flux: number;
  level: AlertLevel;
  open: boolean;
}
export interface SunFocus {
  lat: number;
  lon: number;
  label: string;
  level: AlertLevel;
  test?: boolean;
}

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = Math.PI / 180;
const R = 1;
const CREW = new THREE.Vector3(3.1, 0.12, 1.5);
const LEVEL_HEX: Record<AlertLevel, string> = { none: '#fff1c2', watch: '#ffb547', warning: '#ff5a4f' };
const UP = new THREE.Vector3(0, 1, 0);

const onSun = (lat: number, lon: number, r = R) => new THREE.Vector3(r * Math.cos(lat * D) * Math.sin(lon * D), r * Math.sin(lat * D), r * Math.cos(lat * D) * Math.cos(lon * D));
const flareSize = (flux: number) => Math.max(0.025, Math.min(0.09, 0.025 + (Math.log10(flux) + 6) * 0.022));

/* ---------------------------------------------------------------- the Sun's surface */
const NOISE = /* glsl */ `
vec3 h3(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return -1.0+2.0*fract(sin(p)*43758.5453123);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
return mix(mix(mix(dot(h3(i),f),dot(h3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(h3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(h3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
mix(mix(dot(h3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(h3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(h3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(h3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);}
float fbm(vec3 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*n3(p);p*=2.03;a*=0.5;}return s;}
`;
function SunBody({ calm }: { calm: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
          void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: /* glsl */ `uniform float t; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
          void main(){
            float g = fbm(vP*4.0 + vec3(0.0, t*0.04, t*0.025));
            float cells = fbm(vP*14.0 - vec3(t*0.05));
            float spots = smoothstep(0.42, 0.62, fbm(vP*2.2 + 7.3));
            float mu = clamp(dot(vN, vV), 0.0, 1.0);
            float limb = pow(mu, 0.45);
            vec3 hot = vec3(1.0, 0.93, 0.72), mid = vec3(1.0, 0.62, 0.20), deep = vec3(0.72, 0.22, 0.04);
            vec3 c = mix(mid, hot, clamp(0.55 + g*1.4 + cells*0.35, 0.0, 1.0));
            c = mix(c, deep, spots*0.55);
            c *= mix(0.55, 1.15, limb);
            c = mix(deep*0.9, c, smoothstep(0.0, 0.25, mu));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!calm) mat.uniforms.t.value += dt;
    if (ref.current && !calm) ref.current.rotation.y += dt * 0.01;
  });
  return (
    <mesh ref={ref} material={mat}>
      <sphereGeometry args={[R, 128, 96]} />
    </mesh>
  );
}

/** Corona: an additive glow that always faces the camera. */
function Corona({ storm }: { storm: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { t: { value: 0 }, s: { value: 0 } },
        vertexShader: `varying vec2 vU; void main(){ vU = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform float t; uniform float s; varying vec2 vU; ${NOISE}
          void main(){
            float r = length(vU);
            float a = atan(vU.y, vU.x);
            float streak = 0.75 + 0.25*fbm(vec3(cos(a)*3.0, sin(a)*3.0, t*0.05));
            float g = smoothstep(1.0, 0.36, r) * streak;
            g *= smoothstep(0.30, 0.34, r) * 0.9 + 0.1;
            vec3 col = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.35, 0.25), s);
            gl_FragColor = vec4(col * g * (0.55 + 0.35*s), g);
          }`,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    mat.uniforms.t.value += REDUCE ? 0 : dt;
    mat.uniforms.s.value += (storm - mat.uniforms.s.value) * Math.min(1, dt * 2);
  });
  return (
    <Billboard>
      <mesh material={mat}>
        <planeGeometry args={[R * 6, R * 6]} />
      </mesh>
    </Billboard>
  );
}

function Flare({ f }: { f: SunFlare }) {
  const pos = useMemo(() => onSun(f.lat, f.lon, R * 1.005), [f.lat, f.lon]);
  const ring = useRef<THREE.Mesh>(null);
  const size = flareSize(f.flux);
  useFrame(({ clock }) => {
    if (!ring.current || !f.open || REDUCE) return;
    const k = (clock.elapsedTime * 0.7) % 1;
    ring.current.scale.setScalar(1 + k * 2.2);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
  });
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize()), [pos]);
  return (
    <group position={pos} quaternion={q}>
      <mesh>
        <circleGeometry args={[size, 24]} />
        <meshBasicMaterial color={LEVEL_HEX[f.level]} toneMapped={false} />
      </mesh>
      {f.open && (
        <mesh ref={ring}>
          <ringGeometry args={[size * 1.05, size * 1.3, 32]} />
          <meshBasicMaterial color={LEVEL_HEX[f.level]} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** The field line from the Sun's footpoint to the crew, with particles running along it. */
function FieldLine({ foot, level, particles }: { foot: number; level: AlertLevel; particles: number }) {
  const curve = useMemo(() => {
    const a = onSun(0, Math.min(89, foot), R * 1.02);
    const out = a.clone().normalize().multiplyScalar(2.1).add(new THREE.Vector3(0, 0.35, 0));
    const mid = new THREE.Vector3(2.3, 0.5, 1.9);
    return new THREE.CatmullRomCurve3([a, out, mid, CREW.clone()], false, 'centripetal');
  }, [foot]);
  const pts = useMemo(() => curve.getPoints(80), [curve]);
  const dots = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const speed = level === 'warning' ? 0.45 : level === 'watch' ? 0.25 : 0.12;
  useFrame(({ clock }) => {
    const m = dots.current;
    if (!m) return;
    for (let i = 0; i < particles; i++) {
      const u = REDUCE ? i / particles : (clock.elapsedTime * speed + i / particles) % 1;
      tmp.position.copy(curve.getPointAt(u));
      tmp.scale.setScalar(level === 'none' ? 0.6 : 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.count = particles;
    m.instanceMatrix.needsUpdate = true;
  });
  const col = LEVEL_HEX[level === 'none' ? 'none' : level];
  return (
    <>
      <Line points={pts} color={level === 'none' ? '#9fb4ff' : col} lineWidth={1.2} dashed dashSize={0.08} gapSize={0.06} transparent opacity={0.7} />
      <instancedMesh ref={dots} args={[undefined, undefined, 24]} frustumCulled={false}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshBasicMaterial color={col} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function Crew({ place, shield }: { place: string; shield: string }) {
  return (
    <group position={CREW}>
      <mesh>
        <sphereGeometry args={[0.05, 24, 24]} />
        <meshBasicMaterial color="#7fe3d0" toneMapped={false} />
      </mesh>
      <Billboard>
        <mesh>
          <ringGeometry args={[0.11, 0.12, 48]} />
          <meshBasicMaterial color="#7fe3d0" transparent opacity={0.6} toneMapped={false} />
        </mesh>
      </Billboard>
      <Html center position={[0, -0.3, 0]} zIndexRange={[20, 0]}>
        <div className="s3-tag">
          <b>Crew · {place}</b>
          <span>Shielding: {shield}</span>
        </div>
      </Html>
    </group>
  );
}

function FocusTag({ f }: { f: SunFocus }) {
  const p = useMemo(() => onSun(f.lat, f.lon, R * 1.01), [f.lat, f.lon]);
  return (
    <group position={p}>
      <Html zIndexRange={[20, 0]}>
        <div className={`s3-focus is-${f.level}`}>
          <i />
          {f.label}
        </div>
      </Html>
    </group>
  );
}

/** Slow orbit around the scene when idle (about 70 s a turn); stops while dragging, resumes after 4 s. */
function Camera() {
  const ctl = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const idle = useRef(true);
  const off = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    let tm = 0;
    const start = () => (window.clearTimeout(tm), (idle.current = false));
    const end = () => (tm = window.setTimeout(() => (idle.current = true), 4000));
    c.addEventListener('start', start);
    c.addEventListener('end', end);
    return () => (window.clearTimeout(tm), c.removeEventListener('start', start), c.removeEventListener('end', end));
  }, []);
  useFrame((_, dt) => {
    const c = ctl.current;
    if (!c || !idle.current || REDUCE) return;
    off.copy(camera.position).sub(c.target).applyAxisAngle(UP, Math.min(dt, 0.1) * 0.09);
    camera.position.copy(c.target).add(off);
    c.update();
  });
  return <OrbitControls ref={ctl} target={[1.1, 0.05, 0.6]} enablePan={false} minDistance={3} maxDistance={12} enableDamping dampingFactor={0.08} minPolarAngle={0.6} maxPolarAngle={2.3} />;
}

export default function SunScene({
  flares,
  focus,
  foot,
  level,
  particles,
  place,
  shield,
  alarm,
}: {
  flares: SunFlare[];
  focus: SunFocus | null;
  foot: number;
  level: AlertLevel;
  particles: number;
  place: string;
  shield: string;
  alarm: boolean;
}) {
  const [ready, setReady] = useState(false);
  return (
    <div className={`sun3d${ready ? ' is-ready' : ''}`} role="img" aria-label="The Sun in space with recent flares, the magnetic field line to the crew, and the crew's position">
      <Canvas dpr={[1, 1.75]} camera={{ position: [1.0, 0.9, 8.6], fov: 34, near: 0.05, far: 400 }} gl={{ antialias: true }} onCreated={() => setReady(true)}>
        <color attach="background" args={['#03050c']} />
        <Suspense fallback={null}>
          <Stars radius={90} depth={60} count={5000} factor={3.2} saturation={0} fade speed={REDUCE ? 0 : 0.35} />
          <Corona storm={alarm || level === 'warning' ? 1 : 0} />
          <SunBody calm={REDUCE} />
          {flares.map((f) => (
            <Flare key={f.id} f={f} />
          ))}
          {focus && <FocusTag f={focus} />}
          <FieldLine foot={foot} level={level} particles={particles} />
          <Crew place={place} shield={shield} />
        </Suspense>
        <Camera />
      </Canvas>
    </div>
  );
}
