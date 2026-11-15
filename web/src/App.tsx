import { lazy, Suspense, useMemo } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { conceptLoaders } from './registry';
import { ConceptsIndex } from './ConceptsIndex';
import { Shell } from './app/Shell';

const BodyScreen = lazy(() => import('./features/body/BodyScreen'));
const CabinScreen = lazy(() => import('./features/cabin/CabinScreen'));
const ReplayScreen = lazy(() => import('./concepts/radiation'));

function ConceptRoute() {
  const { id = '' } = useParams();
  const load = conceptLoaders[id];
  const Concept = useMemo(() => (load ? lazy(load) : null), [load]);
  if (!Concept) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="text-dim">No concept "{id}"</p>
          <Link className="mt-4 inline-block text-accent" to="/concepts">
            All concepts
          </Link>
        </div>
      </div>
    );
  }
  // data-concept scopes the concept's token overrides: [data-concept="<id>"] { --bg: ... }
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
          <Route path="/" element={<Navigate to="/body" replace />} />
          <Route path="/body" element={<Suspense fallback={null}><BodyScreen /></Suspense>} />
          <Route path="/cabin" element={<Suspense fallback={null}><CabinScreen /></Suspense>} />
          <Route
            path="/cabin/replay"
            element={
              <div data-concept="radiation" className="app-replay h-full">
                <Suspense fallback={null}>
                  <ReplayScreen />
                </Suspense>
              </div>
            }
          />
        </Route>
        {/* Design concepts: reachable, not in the nav. */}
        <Route path="/concepts" element={<ConceptsIndex />} />
        <Route path="/concepts/:id" element={<ConceptRoute />} />
        <Route path="*" element={<Navigate to="/body" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
