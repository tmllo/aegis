import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter-tight/300.css';
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/jetbrains-mono/400.css';
import './lab.css';
import { LabApp } from './LabApp';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LabApp />
  </React.StrictMode>,
);
