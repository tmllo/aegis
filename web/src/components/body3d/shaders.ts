// Shader patches injected into three's standard material, so lighting stays physically based.
import * as THREE from "three";

export const NOISE = /* glsl */ `
float h3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }`;

/** Uniforms shared by every patched material; BodyScene updates them each frame. */
export const U = {
  uTime: { value: 0 },
  uRate: { value: 1 },          // heartbeats per second
  uBeat: { value: 0 },          // 0..1 contraction curve
  uHeart: { value: new THREE.Vector3() },
  uPressure: { value: 0 },
  uBlock: { value: 0 },
  uBlockP: { value: new THREE.Vector3() },
  uBlockAxis: { value: new THREE.Vector3(0, -1, 0) },
  uSugar: { value: 0 },
  uPorosity: { value: 0 },
  uAtrophy: { value: 0 },
  uFatigue: { value: 0 },
};

type Extra = Record<string, { value: unknown }>;

function patch(mat: THREE.MeshStandardMaterial, extra: Extra, vert: { head?: string; begin?: string }, frag: { head?: string; emissive?: string; start?: string }) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, extra);
    const uniDecl = Object.keys({ ...U, ...extra }).map((k) => {
      const v = ({ ...U, ...extra } as Extra)[k].value;
      const t = v instanceof THREE.Vector3 ? "vec3" : v instanceof THREE.Color ? "vec3" : "float";
      return `uniform ${t} ${k};`;
    }).join("\n");
    sh.vertexShader = `${uniDecl}\nvarying vec3 vWPos;\n${NOISE}\n${vert.head ?? ""}\n` + sh.vertexShader
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vert.begin ?? ""}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = `${uniDecl}\nvarying vec3 vWPos;\n${NOISE}\n${frag.head ?? ""}\n` + sh.fragmentShader
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${frag.start ?? ""}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${frag.emissive ?? ""}`);
  };
  mat.userData.u = extra;
  mat.customProgramCacheKey = () => mat.name;
  return mat;
}

/** Blood vessels: glowing pulses travel along the vessel tree, away from the heart in arteries and back in veins. */
export function flowMaterial(name: string, base: string, flow: string, dir: 1 | -1, isLad = false) {
  const m = new THREE.MeshStandardMaterial({ name, color: base, roughness: 0.32, metalness: 0.05 });
  return patch(m,
    { uDir: { value: dir }, uFlowColor: { value: new THREE.Color(flow) }, uIsLad: { value: isLad ? 1 : 0 }, uSugarColor: { value: new THREE.Color("#ffb020") }, uAmp: { value: 1 } },
    { begin: `transformed += normal * (0.0004 + 0.0016 * uPressure) * uBeat * step(0.5, uDir);` },
    { emissive: `
      float d = distance(vWPos, uHeart);
      float ph = d * 22.0 - uTime * uRate * 4.0 * uDir;
      float band = pow(clamp(0.5 + 0.5 * sin(ph * 6.2831), 0.0, 1.0), 12.0);
      float cells = pow(clamp(noise3(vec3(ph * 3.0, vWPos.x * 60.0, vWPos.z * 60.0)), 0.0, 1.0), 6.0) * 2.5;
      float wave = 0.55 + 0.45 * pow(clamp(0.5 + 0.5 * cos(6.2831 * (uTime * uRate - d * 2.2)), 0.0, 1.0), 3.0);
      float down = uIsLad * smoothstep(-0.002, 0.004, dot(vWPos - uBlockP, uBlockAxis));
      float flow = (band + cells) * wave * uAmp * (1.0 - down * uBlock * 0.97);
      vec3 fc = mix(uFlowColor, uSugarColor, uSugar * 0.75 * step(0.5, uDir));
      totalEmissiveRadiance += fc * flow * (1.0 + uPressure * 0.8 * step(0.5, uDir));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.04, 0.10), down * uBlock);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.25, 0.15), uPressure * 0.35 * step(0.5, uDir) * uBeat);
    ` });
}

/** Heart: contracts at the heart rate; shows the oxygen-starved zone when the LAD is blocked. */
export function heartMaterial() {
  const m = new THREE.MeshStandardMaterial({ name: "heart", color: "#9e2335", roughness: 0.45 });
  return patch(m, { uIsch: { value: new THREE.Vector3() }, uStatus: { value: new THREE.Color("#000") }, uStatusAmt: { value: 0 } },
    { begin: `transformed = uHeart + (transformed - uHeart) * (1.0 - 0.06 * uBeat);` },
    { emissive: `
      float zone = smoothstep(0.055, 0.012, distance(vWPos, uIsch)) * step(0.0, dot(vWPos - uBlockP, uBlockAxis) + 0.01);
      float pulse = 0.55 + 0.45 * sin(uTime * 7.0);
      totalEmissiveRadiance += vec3(1.0, 0.06, 0.04) * zone * uBlock * pulse * 3.5;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.03, 0.08), zone * uBlock * 0.85);
      totalEmissiveRadiance += uStatus * uStatusAmt * (0.4 + 0.6 * uBeat);
    ` });
}

/** Load-bearing bones stay solid; estimated mineral loss shows as a glowing density map, like a bone scan. */
export function boneMaterial(name: string, density: boolean) {
  const m = new THREE.MeshStandardMaterial({ name, color: "#e6dfcc", roughness: 0.62 });
  if (!density) return m;
  return patch(m, { uStatus: { value: new THREE.Color("#fab219") } }, {},
    { emissive: `
      float dn = noise3(vWPos * 55.0) * 0.65 + noise3(vWPos * 150.0) * 0.35;
      float thin = smoothstep(0.72, 0.32, dn) * uPorosity;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.64, 0.58), clamp(uPorosity * 0.6 + thin * 0.5, 0.0, 1.0));
      totalEmissiveRadiance += uStatus * (thin * 0.75 + uPorosity * 0.05);
    ` });
}

/** Muscles: antigravity muscles thin out and pale with atrophy. */
export function muscleMaterial(name: string, atrophy: boolean) {
  const m = new THREE.MeshStandardMaterial({ name, color: "#8c2f2b", roughness: 0.55, transparent: true, depthWrite: false });
  if (!atrophy) return m;
  return patch(m, {}, { begin: `transformed -= normal * uAtrophy * 0.007;` },
    { emissive: `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.55, 0.5), uAtrophy * 0.6);
      float st = noise3(vWPos * vec3(30.0, 400.0, 30.0)); diffuseColor.rgb *= 0.85 + 0.3 * st;` });
}

/** Brain: neural sparks; with sleep debt they slow down and fatigue patches pulse in the status color. */
export function brainMaterial() {
  const m = new THREE.MeshStandardMaterial({ name: "brain", color: "#d6a9a4", roughness: 0.6 });
  return patch(m, { uStatus: { value: new THREE.Color("#fab219") } }, {},
    { emissive: `
      float sp = noise3(vWPos * 110.0 + vec3(0.0, 0.0, uTime * (2.0 - uFatigue * 1.7)));
      float fire = smoothstep(0.82, 0.97, sp) * (1.0 - uFatigue * 0.75);
      totalEmissiveRadiance += vec3(0.45, 0.75, 1.0) * fire * 2.5;
      float pt = noise3(vWPos * 28.0 + vec3(uTime * 0.15));
      totalEmissiveRadiance += uStatus * smoothstep(0.5, 0.72, pt) * uFatigue * (0.5 + 0.5 * sin(uTime * 2.2)) * 1.4;
      diffuseColor.rgb *= 1.0 - uFatigue * 0.35;
    ` });
}

/** Skin: a fresnel x-ray shell. Tints with fever and shimmers with radiation. */
export function skinMaterial() {
  return new THREE.ShaderMaterial({
    name: "skin",
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: { uTime: U.uTime, uOpacity: { value: 1 }, uBase: { value: new THREE.Color("#8fb4ff") }, uTint: { value: new THREE.Color("#ff7a3d") }, uTintAmt: { value: 0 }, uAura: { value: 0 }, uAuraColor: { value: new THREE.Color("#7ff0ff") } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity, uTintAmt, uAura; uniform vec3 uBase, uTint, uAuraColor;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float fr = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2);
        vec3 c = mix(uBase, uTint, uTintAmt);
        float aura = uAura * (0.5 + 0.5 * sin(uTime * 4.0 + vW.y * 18.0));
        c = mix(c, uAuraColor, aura * 0.8);
        float a = uOpacity * (0.03 + fr * 0.55 + aura * 0.25 + uTintAmt * 0.08);
        gl_FragColor = vec4(max(c * (0.6 + fr * 1.6 + aura), 0.0), clamp(a, 0.0, 1.0));
      }`,
  });
}
