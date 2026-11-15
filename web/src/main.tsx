import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { StationApp } from './station/StationApp';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StationApp />
  </React.StrictMode>,
);
