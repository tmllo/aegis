// The one persistent 3D scene behind the HUD. Earth sections (Environment, Systems) use the
// globe from src/globe-lab: real Sun, Moon and stars for now, a physically based atmosphere and
// Google-Earth-style controls (drag the surface, scroll to zoom at the cursor, Shift/right drag
// to tilt, double-click to fly, click the ISS or Mission Control to focus). The Crew section
// keeps the porcelain body in its grey studio below the Earth with the orbit camera.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useLocation, useNavigate } from 'react-router-dom';
import { TARGETS } from '../components/body3d/targets';
import { Pin } from './Globe';
import { Atmosphere } from '../globe-lab/Atmosphere';
import { Earth } from '../globe-lab/Earth';
import { ll, R_KM, sunDir, toLatLon } from '../globe-lab/frame';
import { GlobeControls, type GlobeApi, type View as GlobeView } from '../globe-lab/GlobeControls';
import { useIssSource } from '../globe-lab/iss';
import { IssTrack, Marker } from '../globe-lab/Orbit';
import { Sky } from '../globe-lab/Sky';
import { labTime, useLab } from '../globe-lab/store';
import { SunTracker } from '../globe-lab/SunTracker';
import { RANK, STATUS_WORD } from './model';
import { useConsole } from './useConsole';
import type { Status } from '../data/types';
import { Porcelain } from './Porcelain';
import { useHud } from './hud';

export const BODY_Y = -6;

// The scene mounts after the intro hands off (the GLB and textures are prefetched meanwhile).

type V3 = [number, number, number];
type View = { pos: V3; target: V3 };

function bodyView(focus: string | null): View {
  const t = focus ? TARGETS[focus as keyof typeof TARGETS] : null;
  if (t) {
    const c = t.box.c;
    const d = Math.max(0.8, Math.hypot(...t.box.h) * 3.8);
    return { pos: [c[0] + 0.22, c[1] + BODY_Y + 0.06, c[2] + d], target: [c[0] + 0.12, c[1] + BODY_Y, c[2]] };
  }
  return { pos: [0, BODY_Y + 0.98, 3.25], target: [0, BODY_Y + 0.9, 0] };
}

/** Globe view per Earth section: Environment looks at the day side with the dusk terminator on
 *  the right; Systems sits the whole disc above the bottom card. */
function globeView(path: string, iss: { lat: number; lon: number } | null): { view: GlobeView; offset: number } {
  const s = toLatLon(sunDir(new Date(labTime.ms)));
  if (path.startsWith('/systems')) {
    // the crew is the subject: centre on the station, the whole disc above the bottom card
    const c = iss ?? { lat: 20, lon: s.lon };
    return { view: { lat: Math.max(-40, Math.min(40, c.lat)), lon: c.lon, altKm: 34000, heading: 0, tilt: 0 }, offset: 0.2 };
  }
  // the day side between the two cards, dusk terminator on the right
  return { view: { lat: Math.max(-30, Math.min(30, s.lat * 0.6 + 10)), lon: s.lon + 50, altKm: 21000, heading: 0, tilt: 0 }, offset: 0.03 };
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Flies the camera and the orbit target to each view; a drag hands control to the user. */
function CameraRig({ view, body, onNear }: { view: View; body: boolean; onNear: (n: boolean) => void }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const tween = useRef<{ path: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3; start: number } | null>(null);
  const par = useRef({ x: 0, y: 0 });
  const tick = useRef(0);
  const near = useRef(false);
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const key = view.pos.join() + view.target.join();
  useEffect(() => {
    const c = controls.current;
    const t0 = c ? c.target.clone() : new THREE.Vector3(...view.target);
    const p0 = camera.position.clone();
    const p1 = new THREE.Vector3(...view.pos);
    const t1 = new THREE.Vector3(...view.target);
    // fly on a curve: the midpoint is pulled back and up, the look-at follows its own curve
    const mid = p0.clone().lerp(p1, 0.5);
    const out = mid.clone().sub(t0.clone().lerp(t1, 0.5)).normalize().multiplyScalar(Math.min(1.2, p0.distanceTo(p1) * 0.25));
    mid.add(out).add(new THREE.Vector3(0, Math.min(0.6, p0.distanceTo(p1) * 0.1), 0));
    tween.current = {
      path: new THREE.CatmullRomCurve3([p0, mid, p1], false, 'centripetal'),
      look: new THREE.CatmullRomCurve3([t0, t0.clone().lerp(t1, 0.5), t1], false, 'centripetal'),
      start: -1,
    };
  }, [key, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  const idle = useRef(0);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => {
      tween.current = null;
      idle.current = 0;
    };
    const wake = () => (idle.current = 0);
    c.addEventListener('start', stop);
    addEventListener('pointerdown', wake);
    addEventListener('wheel', wake);
    addEventListener('keydown', wake);
    return () => {
      c.removeEventListener('start', stop);
      removeEventListener('pointerdown', wake);
      removeEventListener('wheel', wake);
      removeEventListener('keydown', wake);
    };
  }, []);
  useEffect(() => {
    idle.current = 0;
  }, [key]);
  useFrame((state, dt) => {
    const c = controls.current;
    if (!c) return;
    const tw = tween.current;
    if (tw) {
      if (tw.start < 0) tw.start = state.clock.elapsedTime;
      const k = reduced ? 1 : Math.min(1, (state.clock.elapsedTime - tw.start) / 0.9);
      const e = ease(k);
      camera.position.copy(tw.path.getPoint(e));
      c.target.copy(tw.look.getPoint(e));
      if (k >= 1) tween.current = null;
    }
    // Crew idle mode: after 20 s without input the camera orbits the body slowly (one turn a minute),
    // easing in over 3 s; any input stops it at once
    idle.current += Math.min(dt, 0.1);
    const orbiting = body && !reduced && !tw && idle.current > 20;
    c.autoRotate = orbiting;
    c.autoRotateSpeed = orbiting ? -1 * Math.min(1, (idle.current - 20) / 3) : 0;
    c.update();
    // gentle damped pointer parallax, at most 2 degrees
    if (!reduced) {
      par.current.x += (state.pointer.x - par.current.x) * 0.05;
      par.current.y += (state.pointer.y - par.current.y) * 0.05;
      camera.rotateY(-par.current.x * 0.035);
      camera.rotateX(par.current.y * 0.035);
    }
    // quiet telemetry from the camera
    if ((tick.current = (tick.current + 1) % 8) === 0) {
      const el = document.getElementById('cx-tele');
      if (el) {
        const d = camera.position.distanceTo(c.target);
        const h = ((Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z) * 180) / Math.PI + 360) % 360;
        el.textContent = `RNG ${d.toFixed(2)}  HDG ${h.toFixed(0).padStart(3, '0')}`;
      }
    }
    if (body) {
      const n = camera.position.distanceTo(c.target) < 1.3;
      if (n !== near.current) {
        near.current = n;
        onNear(n);
      }
    }
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} enablePan={false} rotateSpeed={0.6} minDistance={body ? 0.35 : 1.25} maxDistance={body ? 6 : 9} />;
}


/** Bridges the console HUD (zoom buttons and keys, compass dial, reset) and the camera
 *  readout to the globe controls. */
function GlobeBridge({ api }: { api: React.MutableRefObject<GlobeApi | null> }) {
  useEffect(() => {
    const unHud = useHud.subscribe((s, p) => {
      const g = api.current;
      if (!g) return;
      if (s.zoom !== p.zoom) g.zoomBy(p.zoom / s.zoom);
      if (s.yaw !== p.yaw) g.setHeading((-s.yaw * 180) / Math.PI);
      if (s.reset !== p.reset) g.home();
    });
    const unLab = useLab.subscribe((s, p) => {
      if (s.readout === p.readout) return;
      const el = document.getElementById('cx-tele');
      if (el) el.textContent = `ALT ${Math.round(s.readout.altKm).toLocaleString('en-US')} KM  HDG ${String(Math.round(s.readout.heading) % 360).padStart(3, '0')}  TILT ${Math.round(s.readout.tilt)}`;
    });
    return () => {
      unHud();
      unLab();
    };
  }, [api]);
  return null;
}

const HOUSTON = ll(29.56, -95.09, 1.004);

export function World() {
  const loc = useLocation();
  const nav = useNavigate();
  const { yaw, focus, tint, setBodyReady, bodyTips, zoom, reset } = useHud();
  const [near, setNear] = useState(false);
  const [dpr, setDpr] = useState(1.6);
  const body = loc.pathname === '/';
  const { views, seat } = useConsole();
  const iss = useIssSource(() => labTime.ms);
  const globe = useRef<GlobeApi | null>(null);
  const earth = useRef<THREE.Group>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const gv = useMemo(() => globeView(loc.pathname, iss.at(labTime.ms)), [loc.pathname, iss.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setFocused(null), [loc.pathname, reset]);
  const worst = views.reduce<Status>((w, v) => (RANK[v.overall] > RANK[w] ? v.overall : w), 'green');
  const crewLine = views.map((v) => seat[v.m.id]).filter(Boolean).join(' · ');

  // the body studio's key light follows the real Sun
  const sun = useMemo(() => sunDir(new Date(labTime.ms)), [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = bodyView(focus);
  const bk = base.pos.join() + base.target.join();
  const view: View = useMemo(() => {
    const t = new THREE.Vector3(...base.target);
    const p = new THREE.Vector3(...base.pos).sub(t).divideScalar(zoom).add(t);
    return { pos: [p.x, p.y, p.z], target: base.target };
  }, [bk, zoom, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Canvas dpr={dpr} camera={{ position: view.pos, fov: 36, near: 0.01, far: 300 }} gl={{ antialias: true }}>
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.6)} />
      <color attach="background" args={['#000000']} />
      <SunTracker />
      <directionalLight position={sun.clone().multiplyScalar(5)} intensity={3.4} color="#fff6ea" />
      <group ref={earth}>
        <Suspense fallback={null}>
          <Sky sun={!body} />
        </Suspense>
        <Suspense fallback={null}>
          <Earth />
        </Suspense>
        <Atmosphere />
        {!body && (
          <>
            <IssTrack src={iss} />
            <Marker
              id="iss"
              title="ISS"
              line={crewLine ? `${crewLine} · ${STATUS_WORD[worst]}` : undefined}
              status={worst}
              active={focused === 'iss'}
              where={() => {
                const p = iss.at(labTime.ms);
                return p ? ll(p.lat, p.lon, 1 + p.altKm / R_KM) : null;
              }}
              onFocus={() => {
                const p = iss.at(labTime.ms);
                if (!p) return;
                setFocused('iss');
                globe.current?.focus(p.lat, p.lon, 1600, true);
              }}
            />
            <Marker
              id="ground"
              title="Mission Control"
              line="Houston"
              active={focused === 'ground'}
              where={() => HOUSTON}
              onFocus={() => {
                setFocused('ground');
                globe.current?.focus(29.56, -95.09, 2200);
              }}
            />
          </>
        )}
      </group>

      {/* the body studio, below the Earth */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3.3} position={[-2.5, 3.5, 3]} rotation={[-0.7, -0.5, 0]} scale={[6, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.7} position={[3, 1, 2.5]} rotation={[0, 0.9, 0]} scale={[3, 5, 1]} color="#eef1f5" />
        <Lightformer form="rect" intensity={0.6} position={[0, 2, -4]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} color="#bfe8f0" />
      </Environment>
      <spotLight position={[-2.2, BODY_Y + 4, 3]} angle={0.6} penumbra={1} intensity={42} distance={14} color="#ffffff" target-position={[0, BODY_Y + 0.9, 0]} />
      <group position={[0, BODY_Y, 0]} rotation={[0, body ? yaw : 0, 0]} visible={body}>
        <Suspense fallback={null}>
          <Porcelain
            focus={focus}
            tint={tint}
            near={near}
            onPick={(t) => nav(`/?t=${t}`)}
            onReady={setBodyReady}
          />
        </Suspense>
        {body && bodyTips.map((b) => <Pin key={b.id} tip={b} />)}
        <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={2.2} blur={2.4} far={1.2} frames={1} />
      </group>

      {body ? (
        <CameraRig view={view} body={body} onNear={setNear} />
      ) : (
        <>
          <GlobeControls key="globe" initial={gv.view} home={gv.view} offset={gv.offset} earth={earth} api={globe} keys={false} drift enter follow={() => iss.at(labTime.ms)} />
          <GlobeBridge api={globe} />
        </>
      )}
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.55} />
        <Vignette offset={0.22} darkness={0.62} eskil={false} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
