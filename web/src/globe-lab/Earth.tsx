// Globe lab Earth surface: Blue Marble day map, Black Marble night lights on the night side, ocean
// sun glint, normal-map relief, lit clouds with ground shadows, procedural close-range detail, an
// optional lat/lon grid, and aerial perspective from the shared scattering model. One shader pass,
// clouds composited in it (8 km shell parallax is negligible at orbital altitudes).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { KM } from './frame';
import { useLateTextures } from './progressive';
import { SCATTER_GLSL } from './scattering.glsl';
import { labTime, useLab } from './store';

const base = `${import.meta.env.BASE_URL}refs/globe-lab/`;

const vert = /* glsl */ `
varying vec3 vPos;
varying vec2 vUv;
void main() {
  vPos = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
${SCATTER_GLSL}
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uNormal;
uniform sampler2D uWater;
uniform sampler2D uClouds;
uniform float uCloudU;
uniform float uCloudsOn;
uniform float uNightOn;
uniform float uAtmOn;
uniform float uGrid;
uniform float uDetail;
varying vec3 vPos;
varying vec2 vUv;

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; } return s; }

void main() {
  vec3 N = normalize(vPos);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(0.0, 0.0, -1e-6));
  vec3 north = cross(N, east);
  vec3 V = normalize(uCamPos - vPos);

  // relief: tangent-space normal map (u = east, v = north)
  vec3 nm = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
  vec3 n = normalize(east * nm.x * 1.4 + north * nm.y * 1.4 + N * nm.z);

  vec3 albedo = texture2D(uDay, vUv).rgb;
  float water = texture2D(uWater, vUv).r;

  // procedural detail so close views are not a blur of texels (fades in below ~1500 km)
  if (uDetail > 0.001) {
    vec3 q = vPos * 6371.0 / 6.0;            // ~6 km features
    float d1 = fbm(q);
    float d2 = fbm(q * 5.3 + 7.1);
    float land = 1.0 - water;
    albedo *= 1.0 + uDetail * land * ((d1 - 0.5) * 0.35 + (d2 - 0.5) * 0.18);
    vec3 g = vec3(fbm(q + vec3(0.13, 0.0, 0.0)) - d1, fbm(q + vec3(0.0, 0.13, 0.0)) - d1, fbm(q + vec3(0.0, 0.0, 0.13)) - d1);
    n = normalize(n - uDetail * land * 1.6 * (g - N * dot(g, N)));
  }

  // clouds (drift in longitude) and their shadow, offset away from the sun
  float c = 0.0;
  float shadow = 1.0;
  if (uCloudsOn > 0.5) {
    vec2 cuv = vec2(vUv.x + uCloudU, vUv.y);
    c = texture2D(uClouds, cuv).r;
    c = smoothstep(0.08, 0.95, c);
    vec3 sT = uSunDir - N * dot(uSunDir, N);
    float elev = max(dot(uSunDir, N), 0.08);
    vec2 off = vec2(dot(sT, east), dot(sT, north)) * (8.0 * KMU / elev);
    off = clamp(off, vec2(-0.004), vec2(0.004));
    float cs = smoothstep(0.08, 0.95, texture2D(uClouds, cuv + vec2(off.x / (6.2832 * max(length(N.xz), 0.05)), off.y / 3.1416)).r);
    shadow = 1.0 - 0.55 * cs;
  }

  vec3 sun = sunAt(vPos * 1.0004);
  float ndl = max(dot(n, uSunDir), 0.0);
  float day = smoothstep(-0.12, 0.08, dot(N, uSunDir));
  vec3 skyAmb = vec3(0.035, 0.05, 0.08) * uSunI * 0.06 * day;

  // ocean: GGX glint with Schlick fresnel
  vec3 H = normalize(V + uSunDir);
  float rough = 0.22;
  float a2 = rough * rough * rough * rough;
  float nh = max(dot(N, H), 0.0);
  float D = a2 / (PI_ * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  float nv = max(dot(N, V), 0.02);
  float spec = water * D * F / (4.0 * nv) * max(dot(N, uSunDir), 0.0);

  vec3 ground = albedo * (sun * ndl / PI_ + skyAmb) * shadow + sun * spec * shadow * (1.0 - c);
  // clouds: bright, softly wrapped lighting, slightly blue in their own shadow side
  vec3 cloudCol = vec3(0.8) * (sun * max(dot(N, uSunDir) * 0.85 + 0.15, 0.0) / PI_ * day + skyAmb * 1.5);
  vec3 col = mix(ground, cloudCol, c);

  // night lights, only where the sun is down, dimmed by clouds
  if (uNightOn > 0.5) {
    float nightK = smoothstep(0.02, -0.16, dot(N, uSunDir));
    vec3 lights = pow(texture2D(uNight, vUv).rgb, vec3(1.25)) * vec3(1.0, 0.82, 0.58);
    col += lights * nightK * 1.6 * (1.0 - c * 0.75);
  }

  // lat/lon grid every 15 deg
  if (uGrid > 0.5) {
    float lat = asin(clamp(N.y, -1.0, 1.0)) * 57.29578;
    float lon = atan(-N.z, N.x) * 57.29578;
    vec2 gp = vec2(lon, lat) / 15.0;
    vec2 fw = fwidth(gp);
    vec2 gl = abs(fract(gp - 0.5) - 0.5) / max(fw, vec2(1e-5));
    float line = 1.0 - min(min(gl.x, gl.y), 1.0);
    col = mix(col, vec3(0.37, 0.83, 0.84) * (0.25 + 0.4 * day), line * 0.55);
  }

  // aerial perspective: camera -> this point through the atmosphere
  if (uAtmOn > 0.5) {
    vec3 d = vPos - uCamPos;
    float t = length(d);
    vec3 ins; vec3 tr;
    atmScatter(uCamPos, d / t, t, 8, 3, ins, tr);
    col = col * tr + ins * 0.75;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _inv = new THREE.Matrix4();

export function Earth() {
  // 3.3 MB of 2k maps for the first view, then 15 MB of full-size maps once the page is idle
  const [day, night, normal, water, clouds] = useTexture([
    `${base}earth-day-2k.jpg`,
    `${base}earth-night-2k.jpg`,
    `${base}earth-normal-2k.jpg`,
    `${base}earth-water-2k.png`,
    `${base}earth-clouds-2k.jpg`,
  ]);
  const hd = useLateTextures(
    [`${base}earth-day-8k.jpg`, `${base}earth-night-4k.jpg`, `${base}earth-normal-4k.jpg`, `${base}earth-water-8k.png`, `${base}earth-clouds-8k.jpg`],
    (t, i) => {
      if (i < 2) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      t.wrapS = THREE.RepeatWrapping;
    },
  );
  const mesh = useRef<THREE.Mesh>(null);
  const layers = useLab((s) => s.layers);

  const mat = useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    for (const t of [day, night, normal, water, clouds]) {
      t.anisotropy = 16;
      t.wrapS = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uCamPos: { value: new THREE.Vector3(0, 0, 3) },
        uExag: { value: 1.6 },
        uSunI: { value: 10 },
        uDay: { value: day },
        uNight: { value: night },
        uNormal: { value: normal },
        uWater: { value: water },
        uClouds: { value: clouds },
        uCloudU: { value: 0 },
        uCloudsOn: { value: 1 },
        uNightOn: { value: 1 },
        uAtmOn: { value: 1 },
        uGrid: { value: 0 },
        uDetail: { value: 0 },
      },
    });
  }, [day, night, normal, water, clouds]);

  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    if (!hd) return;
    const u = mat.uniforms;
    [u.uDay.value, u.uNight.value, u.uNormal.value, u.uWater.value, u.uClouds.value] = hd;
  }, [hd, mat]);
  useEffect(() => {
    const u = mat.uniforms;
    u.uCloudsOn.value = layers.clouds ? 1 : 0;
    u.uNightOn.value = layers.night ? 1 : 0;
    u.uAtmOn.value = layers.atmosphere ? 1 : 0;
    u.uGrid.value = layers.grid ? 1 : 0;
  }, [layers, mat]);

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    const u = mat.uniforms;
    // Earth-local camera (the Earth may sit in a tilted parent group)
    _inv.copy(m.matrixWorld).invert();
    u.uCamPos.value.copy(camera.position).applyMatrix4(_inv);
    u.uSunDir.value.copy(SUN_LOCAL);
    // clouds drift east about 30 km/h at mid latitudes: one turn per ~50 days of simulated time
    u.uCloudU.value = ((labTime.ms / 86400000) / 50) % 1;
    const alt = u.uCamPos.value.length() - 1;
    u.uDetail.value = THREE.MathUtils.smoothstep(1500 * KM - alt, 0, 1100 * KM);
  });

  return (
    <mesh ref={mesh} material={mat} name="earth-surface">
      <sphereGeometry args={[1, 384, 192]} />
    </mesh>
  );
}

/** Sun direction in the Earth-local frame, written once per frame by <SunTracker /> in LabApp. */
export const SUN_LOCAL = new THREE.Vector3(1, 0, 0);
