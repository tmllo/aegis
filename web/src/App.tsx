import { lazy, Suspense, useMemo } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { conceptLoaders } from './registry';
import { ConceptsIndex } from './ConceptsIndex';
import { Shell } from './console/Shell';
import CrewPage from './console/CrewPage';

// Crew is the first screen and loads with the shell; the others load when opened.
const EnvironmentPage = lazy(() => import('./console/EnvironmentPage'));
const SystemsPage = lazy(() => import('./console/SystemsPage'));

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
          <Route path="/environment" element={<EnvironmentPage />} />
          <Route path="/systems" element={<SystemsPage />} />
        </Route>
        {/* earlier addresses fold into the three sections */}
        <Route path="/vitals" element={<Navigate to="/" replace />} />
        <Route path="/body" element={<Navigate to="/" replace />} />
        <Route path="/mind" element={<Navigate to="/?p=checkin" replace />} />
        <Route path="/handoff" element={<Navigate to="/?p=handoff" replace />} />
        <Route path="/timeline" element={<Navigate to="/" replace />} />
        <Route path="/compare" element={<Navigate to="/" replace />} />
        <Route path="/cabin" element={<Navigate to="/environment" replace />} />
        <Route path="/storm" element={<Navigate to="/environment" replace />} />
        <Route path="/shelter" element={<Navigate to="/environment?mode=shelter" replace />} />
        <Route path="/storm/replay" element={<Navigate to="/environment?mode=replay" replace />} />
        <Route path="/cabin/replay" element={<Navigate to="/environment?mode=replay" replace />} />
        {/* design concepts: reachable, not in the nav */}
        <Route path="/concepts" element={<ConceptsIndex />} />
        <Route path="/concepts/:id" element={<ConceptRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
