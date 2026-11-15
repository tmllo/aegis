// Wrist band: simulated (always) or a real Bluetooth heart-rate strap. See useWristband.ts.
export { useWristband, type Wristband, type WristSource, type WristStatus } from './useWristband';
export { createWristSim, parseHeartRateMeasurement, type WristReading } from './wristSim';
