// Globe lab page: one Canvas with the Earth-fixed group (surface, atmosphere, sky, Moon, ISS) and
// the Google-Earth-style controls, plus the HUD. Views are scriptable from the URL:
//   ?lat=40.4&lon=-3.7&alt=1200&hdg=0&tilt=45&t=2026-11-15T12:00:00Z&rate=60&tiltgroup=0.32
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Atmosphere } from './Atmosphere';
import { Earth, SUN_LOCAL } from './Earth';
import { GlobeControls, type View } from './GlobeControls';
import { Hud } from './Hud';
import { issAt, useTle, type Tle } from './iss';
import { ll, R_KM, sunDir } from './frame';
import { Sky } from './Sky';
import { labTime, useLab, useLabClock } from './store';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
const INITIAL: View = { lat: num('lat', 30), lon: num('lon', 10), altKm: num('alt', 18000), heading: num('hdg', 0), tilt: num('tilt', 0) };
const HOME: View = { lat: 30, lon: 10, altKm: 18000, heading: 0, tilt: 0 };
const PARENT_TILT = num('tiltgroup', 0); // test the lab inside a tilted parent, like the main app
{
  const t = q.get('t');
  const d = t ? new Date(t) : null;
  if (d && !Number.isNaN(d.getTime())) {
    labTime.ms = d.getTime();
    useLab.setState({ date: d });
  }
  if (q.has('rate')) useLab.setState({ rate: num('rate', 1) });
  if (q.get('paused') === '1') useLab.setState({ paused: true });
}

/** Clock + Sun direction in the Earth-local frame, once per frame before anything reads it. */
function SunTracker() {
  useLabClock();
  useFrame(() => {
    sunDir(new Date(labTime.ms), SUN_LOCAL);
  }, -2);
  return null;
}

function IssTrack({ tle }: { tle: Tle }) {
  const dot = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(181 * 3), 3)), []);
  const line = useMemo(() => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#5fd3d6', transparent: true, opacity: 0.8, depthWrite: false })), [geo]);
  useEffect(
    () => () => {
      geo.dispose();
      (line.material as THREE.Material).dispose();
    },
    [geo, line],
  );
  const last = useRef(0);
  useFrame(() => {
    const t0 = labTime.ms;
    const p = issAt(tle, t0);
    if (dot.current) ll(p.lat, p.lon, 1 + p.altKm / R_KM, dot.current.position);
    if (Math.abs(t0 - last.current) < 20000) return; // re-draw the track every 20 s of sim time
    last.current = t0;
    const period = (2 * Math.PI) / tle.n;
    const a = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let s = 0; s <= 180; s++) {
      const r = issAt(tle, t0 + (s / 180) * period * 1000);
      ll(r.lat, r.lon, 1 + r.altKm / R_KM, v);
      a.setXYZ(s, v.x, v.y, v.z);
    }
    a.needsUpdate = true;
    geo.computeBoundingSphere();
  });
  return (
    <group>
      <primitive object={line} renderOrder={6} />
      <mesh ref={dot} renderOrder={7}>
        <sphereGeometry args={[0.006, 16, 16]} />
        <meshBasicMaterial color={new THREE.Color(2.2, 5.5, 5.6)} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Scene() {
  const earth = useRef<THREE.Group>(null);
  const layers = useLab((s) => s.layers);
  const tle = useTle();
  const follow = useMemo(() => (tle ? () => issAt(tle, labTime.ms) : undefined), [tle]);
  return (
    <>
      <SunTracker />
      <group ref={earth} rotation={[PARENT_TILT, 0, 0]}>
        <Suspense fallback={null}>
          <Sky />
        </Suspense>
        <Suspense fallback={null}>
          <Earth />
        </Suspense>
        {layers.atmosphere && <Atmosphere />}
        {tle && <IssTrack tle={tle} />}
      </group>
      <GlobeControls initial={INITIAL} home={HOME} earth={earth} follow={follow} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={1.2} luminanceSmoothing={0.2} intensity={0.55} radius={0.7} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

export function LabApp() {
  return (
    <div className="gl-root">
      <Canvas flat dpr={[1, 2]} camera={{ fov: 36, near: 0.01, far: 200, position: [0, 0, 4] }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
        <color attach="background" args={['#000000']} />
        <Scene />
      </Canvas>
      <Hud />
    </div>
  );
}
