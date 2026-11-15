// Example concept. Copy this folder to src/concepts/<your-id>/ and edit:
// it is registered automatically and served at /concepts/<your-id>.
// Scope your look under [data-concept="<your-id>"] in a CSS file inside your
// folder (see ./example.css) so concepts never restyle each other.
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AegisBody } from '../../components/body/AegisBody';
import { Footer } from '../../components/Footer';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import { statusOn } from '../../core/scoring';
import type { ConceptMeta } from '../../registry';
import type { Status } from '../../data/types';
import './example.css';

export const meta: ConceptMeta = {
  title: 'Example',
  direction: 'Plain tokens, body wired to the store',
  surface: 'Crew Console',
};

const DOT: Record<Status, string> = { green: 'bg-ok', amber: 'bg-warn', red: 'bg-crit' };

export default function ExampleConcept() {
  const { data, loadState, error } = useMissionData();
  const crew = useSelectedCrew();
  const region = useMissionStore((s) => s.selectedRegion);
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);
  const setRegion = useMissionStore((s) => s.setSelectedRegion);

  if (loadState === 'error') return <p className="p-8 text-crit">{error}</p>;
  if (!data || !crew || !environment) return null;

  // Status is computed by core/scoring from the series, not copied from a constant.
  const { status, scores } = statusOn(crew, data.crew, data.crew.mission.today, environment);
  const inRegion = scores.filter((s) => !region || data.crew.metrics[s.metric].body_region === region);

  return (
    <div className="example-shell grid h-full grid-cols-[280px_1fr_360px] grid-rows-[1fr_auto]">
      <nav className="flex flex-col gap-2 border-r border-line p-4">
        {data.crew.crew.map((c) => (
          <button
            key={c.id}
            onClick={() => setCrew(c.id)}
            className={`flex min-h-touch items-center gap-3 rounded border px-4 text-left transition-colors duration-base ease-out ${
              c.id === crew.id ? 'border-accent bg-surface-2' : 'border-line bg-surface hover:bg-surface-2'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${DOT[c.status.overall]}`} />
            <span className="flex-1">{c.name}</span>
          </button>
        ))}
      </nav>

      <div className="relative">
        <Canvas camera={{ position: [0, 0.95, 3.4], fov: 35 }} onPointerMissed={() => setRegion(null)}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 3, 2]} intensity={1.2} />
          <Suspense fallback={null}>
            <AegisBody status={status} selected={region} onSelect={setRegion} />
          </Suspense>
          <OrbitControls target={[0, 0.88, 0]} enablePan={false} minDistance={1.2} maxDistance={5} />
        </Canvas>
      </div>

      <aside className="overflow-auto border-l border-line p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">{region ?? 'all regions'}</p>
        <ul className="mt-3 divide-y divide-line">
          {inRegion.map((s) => (
            <li key={s.metric} className="flex items-center gap-3 py-3">
              <span className={`h-2 w-2 rounded-full ${DOT[s.status]}`} />
              <span className="flex-1 text-sm text-dim">{data.crew.metrics[s.metric].label}</span>
              <span className="font-mono text-lg">{s.value}</span>
              <span className="w-12 font-mono text-xs text-faint">{data.crew.metrics[s.metric].unit}</span>
            </li>
          ))}
        </ul>
      </aside>

      <Footer className="col-span-3" />
    </div>
  );
}
