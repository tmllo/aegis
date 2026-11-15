// Globe lab sky, in the Earth-local frame (place it inside the Earth group). A camera-centred
// skybox (Milky Way from NASA SVS Deep Star Maps, 8,404 BSC5 stars with Pogson sizes and B-V
// colours) turned by sidereal time, the Sun at its true direction with a glare that fades as the
// Earth's limb covers it, and the Moon at its true position with the real phase.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { SUN_LOCAL } from './Earth';
import { gmstDeg, ll, moonPos, R_KM } from './frame';
import { bvToRgb, flux, sunVisibility } from './sky-math';
import { useLateTextures } from './progressive';
import { labTime, useLab } from './store';

const base = `${import.meta.env.BASE_URL}refs/globe-lab/`;
const SKY_R = 45;
const D = Math.PI / 180;

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const skyFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uGain;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float dec = asin(clamp(d.y, -1.0, 1.0));
  float ra = atan(-d.z, d.x);                       // model frame: lon = RA (the mesh is turned by -GMST)
  vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
  vec3 c = texture2D(uMap, uv).rgb;
  gl_FragColor = vec4(c * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const starVert = /* glsl */ `
attribute vec3 aColor;
attribute float aFlux;
uniform float uPx;
uniform float uGain;
varying vec3 vColor;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // size grows with the cube root of flux; faint stars stay 1-2 px and lose alpha instead
  float s = clamp(1.6 + 2.6 * pow(aFlux, 0.33), 1.6, 7.0);
  gl_PointSize = s * uPx;
  vA = clamp(aFlux * 6.0, 0.16, 1.0);
  vColor = aColor * uGain * (0.6 + 2.2 * clamp(aFlux, 0.0, 1.5));
}`;
const starFrag = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0);
  float halo = exp(-r2 * 2.5) * 0.25;
  gl_FragColor = vec4(vColor * (core + halo) * vA, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function useStars() {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    let alive = true;
    let g: THREE.BufferGeometry | null = null;
    fetch(`${base}stars.bin`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        if (!alive) return;
        const f = new Float32Array(buf);
        const n = f.length / 4;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const fl = new Float32Array(n);
        const v = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          ll(f[i * 4 + 1], f[i * 4], SKY_R * 0.98, v);
          pos.set([v.x, v.y, v.z], i * 3);
          col.set(bvToRgb(f[i * 4 + 3]), i * 3);
          fl[i] = flux(f[i * 4 + 2]);
        }
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
        g.setAttribute('aFlux', new THREE.BufferAttribute(fl, 1));
        setGeo(g);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      g?.dispose();
    };
  }, []);
  return geo;
}

function radialTexture(stops: [number, string][]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Sky({ sun: showSun = true }: { sun?: boolean }) {
  const layers = useLab((s) => s.layers);
  const { gl } = useThree();
  const [milky, moonMap] = useTexture([`${base}milkyway-1k.jpg`, `${base}moon-2k.jpg`]);
  const milkyHd = useLateTextures([`${base}milkyway-4k.jpg`], (t) => (t.colorSpace = THREE.SRGBColorSpace), 2500);
  const stars = useStars();
  const sky = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const sun = useRef<THREE.Group>(null);
  const glare = useRef<THREE.Sprite>(null);
  const moon = useRef<THREE.Mesh>(null);

  const mats = useMemo(() => {
    milky.colorSpace = THREE.SRGBColorSpace;
    moonMap.colorSpace = THREE.SRGBColorSpace;
    moonMap.anisotropy = 8;
    const mw = new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: { uMap: { value: milky }, uGain: { value: 0.035 } }, side: THREE.BackSide, depthTest: false, depthWrite: false });
    const st = new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, uniforms: { uPx: { value: 1 }, uGain: { value: 1 } }, transparent: false, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    const glareTex = radialTexture([[0, 'rgba(255,250,240,1)'], [0.08, 'rgba(255,246,232,0.7)'], [0.22, 'rgba(255,236,210,0.12)'], [0.5, 'rgba(255,226,200,0.025)'], [1, 'rgba(255,200,160,0)']]);
    const gm = new THREE.SpriteMaterial({ map: glareTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, color: new THREE.Color(3, 3, 3) });
    const sunDisc = new THREE.MeshBasicMaterial({ color: new THREE.Color(60, 56, 50), depthTest: false, depthWrite: false });
    const mm = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: moonMap }, uSun: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN;
        void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN;
        void main(){ float l = max(dot(normalize(vN), uSun), 0.0);
          vec3 c = texture2D(uMap, vUv).rgb * l * 6.0 + texture2D(uMap, vUv).rgb * 0.004;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { mw, st, gm, glareTex, sunDisc, mm };
  }, [milky, moonMap]);

  const moonGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(1737 / R_KM, 96, 48);
    g.rotateY(-Math.PI / 2); // texture lon 0 (+X) -> +Z, so lookAt(Earth) shows the near side
    return g;
  }, []);

  useEffect(
    () => () => {
      const { mw, st, gm, glareTex, sunDisc, mm } = mats;
      [mw, st, gm, sunDisc, mm].forEach((m) => m.dispose());
      glareTex.dispose();
    },
    [mats],
  );
  useEffect(() => () => moonGeo.dispose(), [moonGeo]);
  useEffect(() => {
    if (milkyHd) mats.mw.uniforms.uMap.value = milkyHd[0];
  }, [milkyHd, mats]);

  const tmp = useMemo(() => ({ inv: new THREE.Matrix4(), cam: new THREE.Vector3(), mp: new THREE.Vector3(), q: new THREE.Quaternion(), wq: new THREE.Quaternion() }), []);

  useFrame(({ camera }) => {
    const g = sky.current;
    if (!g || !g.parent) return;
    const date = new Date(labTime.ms);
    // camera in the Earth-local frame
    g.parent.updateWorldMatrix(true, false);
    tmp.inv.copy(g.parent.matrixWorld).invert();
    tmp.cam.copy(camera.position).applyMatrix4(tmp.inv);
    g.position.copy(tmp.cam);
    if (turn.current) turn.current.rotation.y = -gmstDeg(date) * D;

    // dim stars and Milky Way when the camera sits in a sunlit atmosphere
    const alt = tmp.cam.length() - 1;
    const inAir = 1 - THREE.MathUtils.smoothstep(alt, (60 / R_KM) * 1.6, (160 / R_KM) * 1.6);
    const sunUp = THREE.MathUtils.smoothstep(tmp.cam.clone().normalize().dot(SUN_LOCAL), -0.15, 0.1);
    const dim = 1 - 0.92 * inAir * sunUp;
    mats.mw.uniforms.uGain.value = 0.035 * dim;
    mats.st.uniforms.uGain.value = dim;
    mats.st.uniforms.uPx.value = gl.getPixelRatio();

    // sun disc and glare
    if (sun.current) {
      sun.current.position.copy(SUN_LOCAL).multiplyScalar(SKY_R * 0.9);
      sun.current.visible = showSun;
    }
    if (glare.current) {
      const vis = sunVisibility(tmp.cam, SUN_LOCAL);
      glare.current.material.opacity = vis;
      glare.current.visible = showSun && vis > 0.001;
      const s = SKY_R * 0.9 * 0.075;
      glare.current.scale.set(s, s, 1);
    }

    // moon at its true position, near side toward the Earth, lit by the real Sun
    const m = moon.current;
    if (m) {
      moonPos(date, tmp.mp);
      m.position.copy(tmp.mp);
      m.lookAt(m.parent!.localToWorld(new THREE.Vector3(0, 0, 0)));
      // Sun direction in world space for the shader (normals are world-space)
      m.parent!.getWorldQuaternion(tmp.wq);
      mats.mm.uniforms.uSun.value.copy(SUN_LOCAL).applyQuaternion(tmp.wq);
    }
  });

  return (
    <>
      <group ref={sky} renderOrder={-10}>
        <group ref={turn}>
          {layers.milkyway && (
            <mesh material={mats.mw} renderOrder={-10} raycast={() => null}>
              <sphereGeometry args={[SKY_R, 96, 48]} />
            </mesh>
          )}
          {layers.stars && stars && <points geometry={stars} material={mats.st} renderOrder={-9} raycast={() => null} frustumCulled={false} />}
        </group>
        <group ref={sun}>
          <mesh material={mats.sunDisc} renderOrder={-8} raycast={() => null}>
            <sphereGeometry args={[SKY_R * 0.9 * Math.tan(0.4 * D), 24, 12]} />
          </mesh>
          <sprite ref={glare} material={mats.gm} renderOrder={50} raycast={() => null} />
        </group>
      </group>
      <mesh ref={moon} geometry={moonGeo} material={mats.mm} raycast={() => null} name="moon" />
    </>
  );
}
