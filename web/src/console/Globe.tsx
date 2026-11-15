// The Earth hero: NASA Blue Marble day map and Black Marble night lights (public domain),
// Solar System Scope clouds (CC BY 4.0), a fresnel atmosphere, an orbit track, a fine dotted
// network mesh, and tooltips anchored to points with a leader line. Still: it only turns
// when the crew uses the rotate dial.
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { getJson, hasServer } from '../data/http';
import { Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';

const base = `${import.meta.env.BASE_URL}refs/earth/`;

const atmoVert = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const atmoFrag = /* glsl */ `
uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 4.0); gl_FragColor = vec4(uColor * f * 1.1, f); }`;

/** Point on the unit sphere from latitude/longitude in degrees. */
export function ll(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const th = ((lon + 180) * Math.PI) / 180;
  return [-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)];
}

function Mesh() {
  // fine network: evenly spread points, each linked to its nearest neighbours
  const { points, lines } = useMemo(() => {
    const N = 260;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = Math.PI * (3 - Math.sqrt(5)) * i;
      pts.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r).multiplyScalar(1.035));
    }
    const seg: number[] = [];
    pts.forEach((p, i) => {
      pts
        .map((q, j) => ({ j, d: p.distanceTo(q) }))
        .filter((o) => o.j > i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach((o) => seg.push(p.x, p.y, p.z, pts[o.j].x, pts[o.j].y, pts[o.j].z));
    });
    return { points: new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z])), lines: new Float32Array(seg) };
  }, []);
  return (
    <group>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#cfe9ea" transparent opacity={0.13} depthWrite={false} />
      </lineSegments>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#e8f6f6" size={0.012} transparent opacity={0.55} depthWrite={false} />
      </points>
    </group>
  );
}

/** Sub-solar point now (declination and hour angle; accurate to about a degree). */
export function subsolar(date = new Date()): { lat: number; lon: number } {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  return { lat: decl, lon: -(hours - 12) * 15 };
}

/** Earth-local direction to the Sun. */
export const sunLocal = (d = new Date()) => {
  const s = subsolar(d);
  return new THREE.Vector3(...ll(s.lat, s.lon)).normalize();
};

/** Shared uniform: the Sun direction in view space, set each frame by the world. */
export const SUN_VIEW = { value: new THREE.Vector3(0, 0, 1) };

function Earth({ yaw, onDouble }: { yaw: number; onDouble?: (p: THREE.Vector3) => void }) {
  const [day, night, clouds, spec] = useTexture([`${base}blue-marble-4k.jpg`, `${base}black-marble-2k.jpg`, `${base}clouds-2k.jpg`, `${base}specular-2k.jpg`]);
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 8;
  }, [day, night]);
  // city lights only on the night side, fading across the terminator
  const surface = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: day, emissiveMap: night, emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 1.1, roughness: 0.92, roughnessMap: spec, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSunView = SUN_VIEW;
      sh.fragmentShader = 'uniform vec3 uSunView;\n' + sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance *= smoothstep(0.08, -0.18, dot(normalize(normal), normalize(uSunView)));',
      ).replace(
        '#include <roughnessmap_fragment>',
        // the specular map is white over water: oceans get a sun glint, land stays matte
        'float roughnessFactor = roughness; vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv ); roughnessFactor *= 1.0 - 0.32 * texelRoughness.r;',
      );
    };
    return m;
  }, [day, night, spec]);
  // clouds fade out toward the poles, where a sphere's texture pinches
  const cloudMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ alphaMap: clouds, transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.9 });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n diffuseColor.a *= 1.0 - smoothstep(0.36, 0.47, abs(vAlphaMapUv.y - 0.5));');
    };
    return m;
  }, [clouds]);
  const cloud = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (cloud.current) cloud.current.rotation.y += Math.min(dt, 0.05) * 0.004; // slow drift
  });
  return (
    <group rotation={[0.32, yaw, 0]}>
      <mesh material={surface} onDoubleClick={(e) => { e.stopPropagation(); onDouble?.(e.point.clone()); }}>
        <sphereGeometry args={[1, 128, 128]} />
      </mesh>
      <mesh ref={cloud} scale={1.008} raycast={() => null} material={cloudMat}>
        <sphereGeometry args={[1, 96, 96]} />
      </mesh>
      <Mesh />
    </group>
  );
}

export interface Tip {
  id: string;
  pos: [number, number, number];
  title: string;
  line: ReactNode;
  status?: string;
}

/** A tooltip pinned to a 3D point with a leader line. */
export function Pin({ tip }: { tip: Tip }) {
  return (
    <group position={tip.pos}>
      <Html zIndexRange={[12, 11]} style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'relative' }}>
          <div className="pin" data-status={tip.status} style={{ position: 'absolute', left: -5, top: -5 }} />
          <div className="tip" data-status={tip.status}>
            <b>{tip.title}</b>
            <span>{tip.line}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}

const ORBIT_R = 1.42;
export const ORBIT_TILT: [number, number, number] = [1.2, 0.2, -0.35];
/** Point on the orbit track at angle a (local to the tilted orbit group). */
export const onOrbit = (a: number): [number, number, number] => [Math.cos(a) * ORBIT_R, Math.sin(a) * ORBIT_R, 0];

/** Earth, atmosphere, network mesh and orbit track, at the origin (no canvas). */
export function EarthGroup({ yaw = 0, tips = [], orbitTips = [], onDouble, orbit = true }: { yaw?: number; tips?: Tip[]; orbitTips?: Tip[]; onDouble?: (p: THREE.Vector3) => void; orbit?: boolean }) {
  const iss = useIssTrack();
  const atmo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmoVert,
        fragmentShader: atmoFrag,
        uniforms: { uColor: { value: new THREE.Color('#8fd8ff') } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  return (
    <group>
      <Suspense fallback={null}>
        <Earth yaw={yaw} onDouble={onDouble} />
      </Suspense>
      <mesh scale={1.035} material={atmo}>
        <sphereGeometry args={[1, 64, 64]} />
      </mesh>
      <group rotation={ORBIT_TILT} visible={orbit && !iss}>
        <mesh>
          <torusGeometry args={[ORBIT_R, 0.0022, 8, 256]} />
          <meshBasicMaterial color="#e6f4f4" transparent opacity={0.45} />
        </mesh>
        <mesh position={onOrbit(2.2)}>
          <sphereGeometry args={[0.018, 16, 16]} />
          <meshBasicMaterial color="#5fd3d6" />
        </mesh>
        {!iss &&
          orbitTips.map((t) => (
            <Pin key={t.id} tip={t} />
          ))}
      </group>
      <group rotation={[0.32, yaw, 0]}>
        {orbit && iss && (
          <>
            <line>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[iss.points, 3]} />
              </bufferGeometry>
              <lineBasicMaterial color="#5fd3d6" transparent opacity={0.75} />
            </line>
            <mesh position={iss.now}>
              <sphereGeometry args={[0.016, 16, 16]} />
              <meshBasicMaterial color="#5fd3d6" />
            </mesh>
            {orbitTips.map((t) => (
              <Pin key={t.id} tip={{ ...t, pos: iss.now }} />
            ))}
          </>
        )}
        {tips.map((t) => (
          <Pin key={t.id} tip={t} />
        ))}
      </group>
    </group>
  );
}

/* ---------- ISS orbit from a CelesTrak TLE (two-body propagation, client-side, offline) ---------- */

const MU = 398600.4418; // km^3/s^2
const RE = 6378.137; // km

interface Tle { epoch: number; i: number; raan: number; e: number; argp: number; m0: number; n: number }

function parseTle(text: string): Tle | null {
  const lines = text.trim().split('\n').map((l) => l.trimEnd());
  const l1 = lines.find((l) => l.startsWith('1 '));
  const l2 = lines.find((l) => l.startsWith('2 '));
  if (!l1 || !l2) return null;
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const epoch = Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
  const d = (a: number, b: number) => (Number(l2.slice(a, b)) * Math.PI) / 180;
  return { epoch, i: d(8, 16), raan: d(17, 25), e: Number(`0.${l2.slice(26, 33).trim()}`), argp: d(34, 42), m0: d(43, 51), n: (Number(l2.slice(52, 63)) * 2 * Math.PI) / 86400 };
}

/** Earth-fixed lat/lon/alt at time t (ms). Two-body: no J2 drift, good for a ground track. */
function propagate(k: Tle, t: number): { lat: number; lon: number; alt: number } {
  const a = Math.cbrt(MU / (k.n * k.n));
  const M = k.m0 + k.n * ((t - k.epoch) / 1000);
  let E = M;
  for (let j = 0; j < 8; j++) E -= (E - k.e * Math.sin(E) - M) / (1 - k.e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + k.e) * Math.sin(E / 2), Math.sqrt(1 - k.e) * Math.cos(E / 2));
  const r = a * (1 - k.e * Math.cos(E));
  const u = k.argp + nu;
  const x = r * (Math.cos(k.raan) * Math.cos(u) - Math.sin(k.raan) * Math.sin(u) * Math.cos(k.i));
  const y = r * (Math.sin(k.raan) * Math.cos(u) + Math.cos(k.raan) * Math.sin(u) * Math.cos(k.i));
  const z = r * Math.sin(u) * Math.sin(k.i);
  const jd = t / 86400000 + 2440587.5;
  const gmst = ((280.46061837 + 360.98564736629 * (jd - 2451545)) * Math.PI) / 180;
  const lon = Math.atan2(y, x) - gmst;
  return { lat: (Math.asin(z / r) * 180) / Math.PI, lon: ((((lon * 180) / Math.PI + 540) % 360) + 360) % 360 - 180, alt: r - RE };
}

/**
 * One orbit of the ISS ground track from now. Server up: SGP4 points from /api/orbit (geodetic).
 * Offline: two-body propagation of the bundled CelesTrak TLE (good for a few days of age).
 */
export function useIssTrack(at?: Date): { points: Float32Array; now: [number, number, number] } | null {
  const [tle] = useStateTle();
  const [srv, setSrv] = useState<{ points: Float32Array; now: [number, number, number] } | null>(null);
  useEffect(() => {
    let alive = true;
    void hasServer().then((up) => {
      if (!up) return;
      getJson<{ points: { lat: number; lon: number; alt_km: number }[] }>('api/orbit?subject=iss&minutes=95&step_s=30', 20000)
        .then((o) => {
          if (!alive || !o.points?.length) return;
          const pts = o.points.flatMap((p) => ll(p.lat, p.lon, 1 + p.alt_km / 6371));
          setSrv({ points: new Float32Array(pts), now: ll(o.points[0].lat, o.points[0].lon, 1 + o.points[0].alt_km / 6371) });
        })
        .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, []);
  const local = useMemo(() => {
    if (!tle) return null;
    const t0 = (at ?? new Date()).getTime();
    const period = (2 * Math.PI) / tle.n;
    const pts: number[] = [];
    let now: [number, number, number] = [0, 0, 0];
    for (let s = 0; s <= 180; s++) {
      const p = propagate(tle, t0 + (s / 180) * period * 1000);
      const v = ll(p.lat, p.lon, 1 + p.alt / 6371);
      pts.push(...v);
      if (s === 0) now = v;
    }
    return { points: new Float32Array(pts), now };
  }, [tle, at]);
  return srv ?? local;
}

let tleCache: Promise<Tle | null> | null = null;
function useStateTle(): [Tle | null] {
  const [tle, setTle] = useState<Tle | null>(null);
  useEffect(() => {
    tleCache ??= fetch(`${import.meta.env.BASE_URL}orbits/iss.tle`).then((r) => (r.ok ? r.text() : '')).then(parseTle, () => null);
    let alive = true;
    void tleCache.then((t) => alive && setTle(t));
    return () => {
      alive = false;
    };
  }, []);
  return [tle];
}
