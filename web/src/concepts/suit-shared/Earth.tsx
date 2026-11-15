// Earth below the Cupola: NASA Blue Marble day map, Black Marble night lights
// (public domain), Solar System Scope clouds (CC BY 4.0), fresnel atmosphere.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

const base = `${import.meta.env.BASE_URL}refs/earth/`;

const atmoVert = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const atmoFrag = /* glsl */ `
uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), uPower); gl_FragColor = vec4(uColor * f * 1.6, f); }`;

export function Earth({
  radius = 6,
  position = [0, -6.6, -4] as [number, number, number],
  tilt = 0.35,
  atmosphere = '#6fb6ff',
}: {
  radius?: number;
  position?: [number, number, number];
  tilt?: number;
  atmosphere?: string;
}) {
  const [day, night, clouds] = useTexture([`${base}blue-marble-4k.jpg`, `${base}black-marble-2k.jpg`, `${base}clouds-2k.jpg`]);
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 8;
  }, [day, night]);
  const spin = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmoVert,
        fragmentShader: atmoFrag,
        uniforms: { uColor: { value: new THREE.Color(atmosphere) }, uPower: { value: 3.2 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [atmosphere],
  );
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.006;
    if (cloudRef.current) cloudRef.current.rotation.y += dt * 0.002;
  });
  return (
    <group position={position} rotation={[tilt, 0, 0.18]}>
      <group ref={spin} rotation={[0, 2.2, 0]}>
        <mesh>
          <sphereGeometry args={[radius, 96, 96]} />
          <meshStandardMaterial map={day} emissiveMap={night} emissive="#ffcf8a" emissiveIntensity={0.35} roughness={0.85} metalness={0} />
        </mesh>
        <mesh ref={cloudRef} scale={1.006}>
          <sphereGeometry args={[radius, 96, 96]} />
          <meshStandardMaterial alphaMap={clouds} transparent depthWrite={false} color="#ffffff" opacity={0.85} />
        </mesh>
      </group>
      <mesh scale={1.045} material={atmoMat}>
        <sphereGeometry args={[radius, 96, 96]} />
      </mesh>
    </group>
  );
}
