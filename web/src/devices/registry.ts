// Device registry: the list of adapters and planned devices, and the one
// place where readings enter the app.
//
// OWNER: devices builder (src/devices/**). The class works as written; the
// devices builder adds the adapters, fills PLANNED_DEVICES and wires
// initDevices() in ./index.ts. The registry has no React and no store import:
// ./index.ts connects it to src/state.

import type { Observation } from '../core/observation';
import type { DeviceAdapter, DeviceRecord, DeviceStatus, ObservationListener, PlannedDevice } from './types';

export type RegistryListener = (records: readonly DeviceRecord[]) => void;

export interface DeviceRegistry {
  /** Adds an adapter and starts listening to its readings. Replaces one with the same id. */
  register(adapter: DeviceAdapter): void;
  /** Lists a device that has no adapter yet. */
  registerPlanned(device: PlannedDevice): void;
  unregister(id: string): void;
  get(id: string): DeviceAdapter | undefined;
  /** One row per adapter and planned device, in registration order. */
  list(): readonly DeviceRecord[];
  connect(id: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  /** Adapters call this when their status changes. */
  setStatus(id: string, status: DeviceStatus, error?: string): void;
  /** Every reading from every adapter. Returns an unsubscribe function. */
  onObservation(listener: ObservationListener): () => void;
  /** Called after any change to the list. Returns an unsubscribe function. */
  subscribe(listener: RegistryListener): () => void;
}

/**
 * Planned devices with their channel mapping (BUILD-KICKOFF section 2).
 * TODO(devices builder): CSA Bio-Monitor (Astroskin garment), wrist actigraphy
 * (Actiwatch class), ESA T-Mini / Thermolab temperature, crew dosimeters.
 */
export const PLANNED_DEVICES: readonly PlannedDevice[] = [];

export function createRegistry(now: () => number = Date.now): DeviceRegistry {
  const adapters = new Map<string, DeviceAdapter>();
  const records = new Map<string, DeviceRecord>();
  const unsubscribe = new Map<string, () => void>();
  const observers = new Set<ObservationListener>();
  const watchers = new Set<RegistryListener>();
  let snapshot: readonly DeviceRecord[] = [];

  const publish = () => {
    snapshot = [...records.values()];
    watchers.forEach((fn) => fn(snapshot));
  };
  const patch = (id: string, change: Partial<DeviceRecord>) => {
    const rec = records.get(id);
    if (!rec) return;
    records.set(id, { ...rec, ...change });
    publish();
  };
  const receive = (id: string, observation: Observation) => {
    const rec = records.get(id);
    if (rec) records.set(id, { ...rec, observations: rec.observations + 1, lastObservationAt: now() });
    observers.forEach((fn) => fn(observation));
    publish();
  };

  const registry: DeviceRegistry = {
    register(adapter) {
      unsubscribe.get(adapter.id)?.();
      adapters.set(adapter.id, adapter);
      records.set(adapter.id, {
        id: adapter.id,
        label: adapter.label,
        kind: adapter.kind,
        channels: adapter.channels,
        status: adapter.status,
        observations: 0,
        lastObservationAt: null,
        error: null,
      });
      unsubscribe.set(adapter.id, adapter.onObservation((o) => receive(adapter.id, o)));
      publish();
    },
    registerPlanned(device) {
      if (adapters.has(device.id)) return;
      records.set(device.id, { ...device, status: 'planned', observations: 0, lastObservationAt: null, error: null });
      publish();
    },
    unregister(id) {
      unsubscribe.get(id)?.();
      unsubscribe.delete(id);
      adapters.delete(id);
      records.delete(id);
      publish();
    },
    get: (id) => adapters.get(id),
    list: () => snapshot,
    async connect(id) {
      const adapter = adapters.get(id);
      if (!adapter) throw new Error(`No device "${id}"`);
      patch(id, { status: 'connecting', error: null });
      try {
        await adapter.connect();
        patch(id, { status: 'connected', error: null });
      } catch (e) {
        patch(id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    },
    async disconnect(id) {
      const adapter = adapters.get(id);
      if (!adapter) return;
      await adapter.disconnect();
      patch(id, { status: 'disconnected', error: null });
    },
    setStatus(id, status, error) {
      patch(id, { status, error: error ?? null });
    },
    onObservation(listener) {
      observers.add(listener);
      return () => void observers.delete(listener);
    },
    subscribe(listener) {
      watchers.add(listener);
      return () => void watchers.delete(listener);
    },
  };
  return registry;
}

/** The app-wide registry. */
export const registry: DeviceRegistry = createRegistry();
