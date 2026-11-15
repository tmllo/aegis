import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './console/Shell';
import CrewPage from './console/CrewPage';

// Crew is the first screen and loads with the shell; the others load when opened.
const EnvironmentPage = lazy(() => import('./console/EnvironmentPage'));
const SystemsPage = lazy(() => import('./console/SystemsPage'));
const MindPage = lazy(() => import('./console/mind/MindPage'));

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<CrewPage />} />
          <Route path="/environment" element={<EnvironmentPage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/mind" element={<MindPage />} />
        </Route>
        {/* earlier addresses fold into the three sections */}
        <Route path="/vitals" element={<Navigate to="/" replace />} />
        <Route path="/body" element={<Navigate to="/" replace />} />
        <Route path="/handoff" element={<Navigate to="/?p=handoff" replace />} />
        <Route path="/timeline" element={<Navigate to="/" replace />} />
        <Route path="/compare" element={<Navigate to="/" replace />} />
        <Route path="/cabin" element={<Navigate to="/environment" replace />} />
        <Route path="/storm" element={<Navigate to="/environment" replace />} />
        <Route path="/shelter" element={<Navigate to="/environment?mode=shelter" replace />} />
        <Route path="/storm/replay" element={<Navigate to="/environment?mode=replay" replace />} />
        <Route path="/cabin/replay" element={<Navigate to="/environment?mode=replay" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
