// The Earth hero: NASA Blue Marble day map and Black Marble night lights (public domain),
// Solar System Scope clouds (CC BY 4.0), a fresnel atmosphere, an orbit track, a fine dotted
// network mesh, and tooltips anchored to points with a leader line. Still: it only turns
// when the crew uses the rotate dial.
import { Suspense, useMemo, type ReactNode } from 'react';
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

function Earth({ yaw }: { yaw: number }) {
  const [day, night, clouds] = useTexture([`${base}blue-marble-4k.jpg`, `${base}black-marble-2k.jpg`, `${base}clouds-2k.jpg`]);
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 8;
  }, [day, night]);
  return (
    <group rotation={[0.32, yaw, 0]}>
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial map={day} emissiveMap={night} emissive="#ffc98a" emissiveIntensity={0.9} roughness={0.9} metalness={0} />
      </mesh>
      <mesh scale={1.008}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial alphaMap={clouds} transparent depthWrite={false} color="#ffffff" opacity={0.7} />
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
export function EarthGroup({ yaw = 0, tips = [], orbitTips = [] }: { yaw?: number; tips?: Tip[]; orbitTips?: Tip[] }) {
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
        <Earth yaw={yaw} />
      </Suspense>
      <mesh scale={1.035} material={atmo}>
        <sphereGeometry args={[1, 64, 64]} />
      </mesh>
      <group rotation={ORBIT_TILT}>
        <mesh>
          <torusGeometry args={[ORBIT_R, 0.0022, 8, 256]} />
          <meshBasicMaterial color="#e6f4f4" transparent opacity={0.45} />
        </mesh>
        <mesh position={onOrbit(2.2)}>
          <sphereGeometry args={[0.018, 16, 16]} />
          <meshBasicMaterial color="#5fd3d6" />
        </mesh>
        {orbitTips.map((t) => (
          <Pin key={t.id} tip={t} />
        ))}
      </group>
      <group rotation={[0.32, yaw, 0]}>
        {tips.map((t) => (
          <Pin key={t.id} tip={t} />
        ))}
      </group>
    </group>
  );
}
