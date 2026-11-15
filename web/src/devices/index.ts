// Devices entry point. OWNER: devices builder.
//
// main.tsx calls initDevices() once at start-up. It mirrors the registry into
// src/state (so the Systems screen can draw it) and sends every reading to the
// station. TODO(devices builder): register the adapters here (ReplayAdapter,
// ManualCheckInAdapter, WebBluetoothHRAdapter, SimBioMonitorAdapter,
// SimDosimeterAdapter), the planned devices, and the live feed adapters behind
// the "Live feeds" switch (state: liveFeeds, default off; bundled samples in
// public/samples/** as the fallback).

import { useStation } from '../state';
import { PLANNED_DEVICES, registry } from './registry';

export * from './types';
export * from './registry';

let started = false;

export function initDevices(): void {
  if (started) return;
  started = true;
  PLANNED_DEVICES.forEach((d) => registry.registerPlanned(d));
  registry.subscribe((records) => useStation.getState().setDevices(records));
  registry.onObservation((o) => useStation.getState().ingestObservation(o));
  useStation.getState().setDevices(registry.list());
}
