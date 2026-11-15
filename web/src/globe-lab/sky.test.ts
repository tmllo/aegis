import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bvToKelvin, bvToRgb, sunVisibility } from './sky-math';
import { gmstDeg, ll, raDec } from './frame';

describe('globe-lab sky', () => {
  it('puts Polaris within 1 deg of the north pole', () => {
    const p = raDec(37.95, 89.26, new Date('2026-11-15T00:00:00Z'));
    expect(p.angleTo(new THREE.Vector3(0, 1, 0)) * (180 / Math.PI)).toBeLessThan(1);
  });

  it('rotating the sky by -GMST about +Y equals raDec', () => {
    const d = new Date('2026-11-15T03:30:00Z');
    const a = raDec(101.29, -16.72, d);
    const b = ll(-16.72, 101.29).applyAxisAngle(new THREE.Vector3(0, 1, 0), (-gmstDeg(d) * Math.PI) / 180);
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });

  it('B-V colour gets monotonically redder', () => {
    let lastT = Infinity;
    let lastBR = -Infinity;
    for (let bv = -0.3; bv <= 2.0; bv += 0.1) {
      const t = bvToKelvin(bv);
      const c = bvToRgb(bv);
      expect(t).toBeLessThan(lastT);
      expect(c[0] / c[2]).toBeGreaterThanOrEqual(lastBR - 1e-9);
      lastT = t;
      lastBR = c[0] / c[2];
    }
  });

  it('sun visibility: hidden behind the Earth, clear in view', () => {
    const sun = new THREE.Vector3(1, 0, 0);
    expect(sunVisibility(new THREE.Vector3(-3, 0, 0), sun)).toBe(0);
    expect(sunVisibility(new THREE.Vector3(3, 0, 0), sun)).toBe(1);
    expect(sunVisibility(new THREE.Vector3(-3, 2, 0), sun)).toBe(1);
  });
});
