// Device adapters: each one turns a source into normalized Observations.
// Any adapter that emits valid Observations drives the same UI (the
// "Device swap" flight-readiness check).
//
// OWNER: devices builder (src/devices/**). This contract is frozen.

import type { Observation } from '../core/observation';

/** What the source is. */
export type DeviceKind =
  /** Replays a bundled data file (crew_data.json). */
  | 'replay'
  /** A person typing values in (the daily check-in). */
  | 'manual'
  /** Real hardware over a browser API (Web Bluetooth heart rate). */
  | 'hardware'
  /** A simulated instrument. */
  | 'simulated'
  /** A live external feed, only behind the "Live feeds" switch. */
  | 'feed';

export type DeviceStatus =
  /** Listed with its channel mapping, no adapter yet. */
  | 'planned'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface DeviceChannel {
  /** Metric key from crew_data.json `metrics`, or a device channel name. */
  metric: string;
  unit: string;
  /** Verified LOINC code only. Leave out when not verified. */
  loinc?: string;
}

export type ObservationListener = (observation: Observation) => void;

export interface DeviceAdapter {
  /** Stable id, for example 'replay', 'manual-checkin', 'ble-hr', 'sim-biomonitor'. */
  readonly id: string;
  /** 1-3 words for the UI. */
  readonly label: string;
  readonly kind: DeviceKind;
  readonly channels: readonly DeviceChannel[];
  /** Current status. Report every change through the registry (registry.setStatus). */
  readonly status: DeviceStatus;
  /** Starts the source. Rejects with a readable message when it cannot (no Bluetooth, permission denied). */
  connect(): Promise<void>;
  /** Stops the source and releases everything it holds. Safe to call twice. */
  disconnect(): Promise<void>;
  /** Subscribes to readings. Returns an unsubscribe function. */
  onObservation(listener: ObservationListener): () => void;
}

/** A device listed for the architecture map that has no adapter yet. */
export interface PlannedDevice {
  id: string;
  label: string;
  kind: DeviceKind;
  channels: readonly DeviceChannel[];
  /** Who makes or flies it, for the Systems screen. */
  source: string;
}

/** The row src/state keeps per device and the Systems screen draws. */
export interface DeviceRecord {
  id: string;
  label: string;
  kind: DeviceKind;
  channels: readonly DeviceChannel[];
  status: DeviceStatus;
  /** Readings received since the page loaded. */
  observations: number;
  /** Station time of the last reading, ms. */
  lastObservationAt: number | null;
  /** Last error message, when status is 'error'. */
  error: string | null;
  source?: string;
}
