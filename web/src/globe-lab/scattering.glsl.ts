// Single-scattering atmosphere (Rayleigh + Mie + ozone absorption), ray-marched, in the Earth-local
// frame of frame.ts (planet radius 1 = 6371 km). Shared by the sky shell (Atmosphere.tsx) and the
// ground's aerial perspective (Earth.tsx). Constants from Bruneton's precomputed scattering
// reference (Earth): beta_R (5.802, 13.558, 33.1) e-6/m, beta_M 3.996e-6/m (ext / 0.9), ozone
// (0.650, 1.881, 0.085) e-6/m, H_R 8 km, H_M 1.2 km, Mie g 0.8. `uExag` thickens the shell and its
// scale heights while keeping the optical depth the same, so it reads at orbital zoom levels.
import * as THREE from 'three';

export const SCATTER_UNIFORMS = () => ({
  uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uCamPos: { value: new THREE.Vector3(0, 0, 3) },
  uExag: { value: 1.6 },
  uSunI: { value: 10 },
});

export const SCATTER_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform float uExag;
uniform float uSunI;

#define KMU (1.0 / 6371.0)
#define PI_ 3.14159265
const vec3 BETA_R = vec3(5.802, 13.558, 33.1) * 6.371;   // per scene unit (1e-6/m * 6.371e6 m)
const float BETA_M = 3.996 * 6.371;
const float BETA_M_EXT = 3.996 / 0.9 * 6.371;
const vec3 BETA_O = vec3(0.650, 1.881, 0.085) * 6.371;
const float MIE_G = 0.8;

float atmTop() { return 1.0 + 100.0 * KMU * uExag; }

// near and far hit distances of a ray with a sphere at the origin; x > y when missed
vec2 raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// (rayleigh, mie, ozone) densities at height h above the surface (scene units)
vec3 atmDensity(float h) {
  h = max(h, 0.0);
  float s = KMU * uExag;
  return vec3(exp(-h / (8.0 * s)), exp(-h / (1.2 * s)), max(0.0, 1.0 - abs(h - 25.0 * s) / (15.0 * s)));
}

vec3 atmExtinction(vec3 d) { return (BETA_R * d.x + BETA_M_EXT * d.y + BETA_O * d.z) / uExag; }

// optical depth from p toward the sun to the top of the atmosphere; huge when the planet blocks it
vec3 sunOpticalDepth(vec3 p, int n) {
  vec2 pl = raySphere(p, uSunDir, 0.9995);
  float t1 = raySphere(p, uSunDir, atmTop()).y;
  vec3 od = vec3(0.0);
  float ds = max(t1, 0.0) / float(n);
  for (int i = 0; i < 8; i++) {
    if (i >= n) break;
    vec3 q = p + uSunDir * (ds * (float(i) + 0.5));
    od += atmDensity(length(q) - 1.0) * ds;
  }
  vec3 e = atmExtinction(od);
  // soft planet shadow: fade over a few km of grazing height instead of a hard cut
  if (pl.x > 0.0 && pl.x < pl.y) {
    float b = dot(p, uSunDir);
    float graze = sqrt(max(dot(p, p) - b * b, 0.0)) - 1.0;   // closest approach height of the sun ray
    e += vec3(40.0) * smoothstep(0.0, -8.0 * KMU * uExag, graze) + vec3(1e4) * step(graze, -8.0 * KMU * uExag);
  }
  return e;
}

float phaseR(float mu) { return 3.0 / (16.0 * PI_) * (1.0 + mu * mu); }
float phaseM(float mu) {
  float g2 = MIE_G * MIE_G;
  return 3.0 / (8.0 * PI_) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * MIE_G * mu, 1e-4), 1.5));
}

// in-scattered light and transmittance along o + d t, t in [0, tMax]
void atmScatter(vec3 o, vec3 d, float tMax, int nView, int nLight, out vec3 inscatter, out vec3 trans) {
  inscatter = vec3(0.0);
  trans = vec3(1.0);
  vec2 a = raySphere(o, d, atmTop());
  float t0 = max(a.x, 0.0);
  float t1 = min(a.y, tMax);
  if (t1 <= t0) return;
  float ds = (t1 - t0) / float(nView);
  vec3 odView = vec3(0.0);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= nView) break;
    vec3 p = o + d * (t0 + ds * (float(i) + 0.5));
    vec3 dens = atmDensity(length(p) - 1.0) * ds;
    odView += dens;
    vec3 tr = exp(-(atmExtinction(odView) + sunOpticalDepth(p, nLight)));
    sumR += dens.x * tr;
    sumM += dens.y * tr;
  }
  float mu = dot(d, uSunDir);
  inscatter = uSunI * (sumR * BETA_R * phaseR(mu) + sumM * BETA_M * phaseM(mu)) / uExag;
  trans = exp(-atmExtinction(odView));
}

// sunlight reaching point p (colour shift at sunrise / sunset, zero in the planet shadow)
vec3 sunAt(vec3 p) { return uSunI * exp(-sunOpticalDepth(p, 6)); }
`;
