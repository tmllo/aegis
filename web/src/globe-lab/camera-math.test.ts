import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { altitude, clampState, flyLerp, grabRotation, hitSphere, maxTilt, MIN_ALT, pose, rayFrom, rotateState, zoomAt, type LookAt } from './camera-math';
import { KM, ll, toLatLon } from './frame';

const FOV = 36;
const AR = 16 / 9;
const st = (lat: number, lon: number, rangeKm: number, hdg = 0, tilt = 0): LookAt => ({ target: ll(lat, lon), range: rangeKm * KM, heading: (hdg * Math.PI) / 180, tilt: (tilt * Math.PI) / 180 });
const hit = (s: LookAt, x: number, y: number) => hitSphere(rayFrom(pose(s), x, y, FOV, AR), false);

describe('globe-lab camera math', () => {
  it('looks straight down at the target with north up', () => {
    const s = st(40, -3.7, 2000);
    const c = hit(s, 0, 0)!;
    const ll0 = toLatLon(c);
    expect(ll0.lat).toBeCloseTo(40, 4);
    expect(ll0.lon).toBeCloseTo(-3.7, 4);
    // a point above screen centre is further north
    expect(toLatLon(hit(s, 0, 0.3)!).lat).toBeGreaterThan(40);
    // a point right of centre is further east
    expect(toLatLon(hit(s, 0.3, 0)!).lon).toBeGreaterThan(-3.7);
    expect(altitude(s) / KM).toBeCloseTo(2000, 0);
  });

  it('keeps the grabbed point under the cursor after a drag update', () => {
    for (const [lat, lon, tilt, hdg] of [[10, 20, 0, 0], [70, -40, 50, 120], [-85, 100, 30, 300]]) {
      let s = clampState(st(lat, lon, 1500, hdg, tilt));
      const grab = hit(s, -0.2, 0.1)!;
      // the user moves the cursor to (0.25, -0.15): rotate so the grabbed point is there
      for (let k = 0; k < 6; k++) {
        const now = hit(s, 0.25, -0.15)!;
        s = rotateState(s, grabRotation(now, grab));
      }
      expect(hit(s, 0.25, -0.15)!.distanceTo(grab)).toBeLessThan(1e-4);
    }
  });

  it('zooms toward the cursor keeping the hit point fixed', () => {
    const s = st(48, 2, 6000);
    const before = hit(s, 0.3, 0.2)!;
    const z = zoomAt(s, 0.6, 0.3, 0.2, FOV, AR);
    expect(z.range).toBeCloseTo(s.range * 0.6, 6);
    expect(hit(z, 0.3, 0.2)!.distanceTo(before)).toBeLessThan(1e-4);
  });

  it('clamps altitude and tilt', () => {
    const s = clampState(st(0, 0, 10, 0, 89));
    expect(altitude(s)).toBeGreaterThanOrEqual(MIN_ALT - 1e-9);
    expect(s.tilt).toBeLessThanOrEqual(maxTilt(s.range) + 1e-9);
    const far = clampState(st(0, 0, 20000, 0, 60));
    expect(far.tilt).toBe(0);
  });

  it('fly-to starts and ends exactly and rises mid-flight on long hops', () => {
    const a = st(29.6, -95.1, 1000);
    const b = st(45.9, 63.3, 1000);
    expect(flyLerp(a, b, 0).target.distanceTo(a.target)).toBeLessThan(1e-9);
    expect(flyLerp(a, b, 1).target.distanceTo(b.target)).toBeLessThan(1e-9);
    expect(flyLerp(a, b, 0.5).range).toBeGreaterThan(a.range * 2);
    expect(new THREE.Vector3().copy(flyLerp(a, b, 0.5).target).length()).toBeCloseTo(1, 9);
  });
});
