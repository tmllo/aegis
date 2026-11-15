// Globe lab sky shell: the atmosphere seen against space (limb, blue haze, sunrise band) and the
// sky around the camera when it is inside the atmosphere. Rays that hit the ground are left to the
// Earth shader's aerial perspective, so the ground is never fogged twice. Blending:
// out = inscatter + dst * transmittance (grey average), drawn after the Earth with no depth test.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SUN_LOCAL } from './Earth';
import { SCATTER_GLSL, SCATTER_UNIFORMS } from './scattering.glsl';

const vert = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
${SCATTER_GLSL}
uniform float uLimb;
varying vec3 vPos;
void main() {
  vec3 d = normalize(vPos - uCamPos);
  // ground: handled by the Earth shader. Test a sphere 0.6 km inside the mesh so the faceted mesh
  // silhouette never shows a gap between ground and sky.
  vec2 pl = raySphere(uCamPos, d, 0.9999);
  if (pl.x > 0.0 && pl.x < pl.y) discard;
  vec3 ins; vec3 tr;
  atmScatter(uCamPos, d, 1e9, 12, 5, ins, tr);
  float t = dot(tr, vec3(0.3333));
  gl_FragColor = vec4(ins * uLimb, t);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _inv = new THREE.Matrix4();

export function Atmosphere({ exaggeration = 1.6 }: { exaggeration?: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { ...SCATTER_UNIFORMS(), uLimb: { value: 1.5 } },
        side: THREE.BackSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.SrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const top = 1 + (100 / 6371) * exaggeration;

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    _inv.copy(m.matrixWorld).invert();
    const u = mat.uniforms;
    u.uCamPos.value.copy(camera.position).applyMatrix4(_inv);
    u.uSunDir.value.copy(SUN_LOCAL);
    u.uExag.value = exaggeration;
  });

  return (
    <mesh ref={mesh} material={mat} renderOrder={5} raycast={() => null} name="atmosphere">
      <sphereGeometry args={[top * 1.001, 128, 64]} />
    </mesh>
  );
}
