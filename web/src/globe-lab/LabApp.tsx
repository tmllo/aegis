// Globe lab page: one Canvas with the Earth-fixed group (surface, atmosphere, sky, Moon, ISS) and
// the Google-Earth-style controls, plus the HUD. Views are scriptable from the URL:
//   ?lat=40.4&lon=-3.7&alt=1200&hdg=0&tilt=45&t=2026-11-15T12:00:00Z&rate=60&tiltgroup=0.32
import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Atmosphere } from './Atmosphere';
import { Earth } from './Earth';
import { SunTracker } from './SunTracker';
import { GlobeControls, type View } from './GlobeControls';
import { Hud } from './Hud';
import { useIssSource } from './iss';
import { IssTrack } from './Orbit';
import { Sky } from './Sky';
import { labTime, useLab } from './store';

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

function Scene() {
  const earth = useRef<THREE.Group>(null);
  const layers = useLab((s) => s.layers);
  const iss = useIssSource(() => labTime.ms);
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
        <IssTrack src={iss} />
      </group>
      <GlobeControls initial={INITIAL} home={HOME} earth={earth} follow={() => iss.at(labTime.ms)} />
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
