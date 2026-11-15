// Ambient globe with an orbit track: NASA Blue Marble day map and Black Marble night
// lights (public domain), a fresnel atmosphere, a hairline orbit and one moving marker.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

const base = `${import.meta.env.BASE_URL}refs/earth/`;

const atmoVert = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const atmoFrag = /* glsl */ `
uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uColor * f * 1.4, f); }`;

const ORBIT_R = 1.32;
const TILT = new THREE.Euler(1.18, 0, -0.32);

export function Globe() {
  const [day, night] = useTexture([`${base}blue-marble-4k.jpg`, `${base}black-marble-2k.jpg`]);
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
  }, [day, night]);
  const spin = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const atmo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmoVert,
        fragmentShader: atmoFrag,
        uniforms: { uColor: { value: new THREE.Color('#7fb2ff') } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  useFrame((state, dt) => {
    if (reduced) return;
    if (spin.current) spin.current.rotation.y += dt * 0.02;
    if (marker.current) {
      const a = state.clock.elapsedTime * 0.12;
      marker.current.position.set(Math.cos(a) * ORBIT_R, Math.sin(a) * ORBIT_R, 0);
    }
  });
  return (
    <group>
      <mesh ref={spin} rotation={[0.35, 2.4, 0]}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial map={day} emissiveMap={night} emissive="#ffd29a" emissiveIntensity={0.6} roughness={0.9} metalness={0} />
      </mesh>
      <mesh scale={1.06} material={atmo}>
        <sphereGeometry args={[1, 64, 64]} />
      </mesh>
      <group rotation={TILT}>
        <mesh>
          <torusGeometry args={[ORBIT_R, 0.0025, 8, 256]} />
          <meshBasicMaterial color="#dfe8ff" transparent opacity={0.55} toneMapped={false} />
        </mesh>
        <mesh ref={marker} position={[ORBIT_R, 0, 0]}>
          <sphereGeometry args={[0.022, 16, 16]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
