import { lazy, Suspense, useMemo } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { conceptLoaders } from './registry';
import { ConceptsIndex } from './ConceptsIndex';
import { Shell } from './console/Shell';
import CrewPage from './console/CrewPage';

// Crew is the first screen and loads with the shell; the rest load when opened.
const VitalsPage = lazy(() => import('./console/VitalsPage'));
const CabinPage = lazy(() => import('./console/CabinPage'));
const StormPage = lazy(() => import('./console/StormPage'));
const ReplayPage = lazy(() => import('./console/ReplayPage'));
const SystemsPage = lazy(() => import('./console/SystemsPage'));
const MindPage = lazy(() => import('./console/MindPage'));

function ConceptRoute() {
  const { id = '' } = useParams();
  const load = conceptLoaders[id];
  const Concept = useMemo(() => (load ? lazy(load) : null), [load]);
  if (!Concept) {
    return (
      <div className="grid h-full place-items-center">
        <Link className="text-accent" to="/concepts">
          No concept "{id}"
        </Link>
      </div>
    );
  }
  return (
    <div data-concept={id} className="h-full">
      <Suspense fallback={null}>
        <Concept />
      </Suspense>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<CrewPage />} />
          <Route path="/vitals" element={<VitalsPage />} />
          <Route path="/cabin" element={<CabinPage />} />
          <Route path="/storm" element={<StormPage />} />
          <Route path="/storm/replay" element={<ReplayPage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/mind" element={<MindPage />} />
        </Route>
        {/* old addresses */}
        <Route path="/body" element={<Navigate to="/vitals" replace />} />
        <Route path="/cabin/replay" element={<Navigate to="/storm/replay" replace />} />
        {/* design concepts: reachable, not in the nav */}
        <Route path="/concepts" element={<ConceptsIndex />} />
        <Route path="/concepts/:id" element={<ConceptRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
