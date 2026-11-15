// Camera scan (rPPG): on-device heart rate and breathing estimate. See useCameraScan.ts and signal.ts.
export { useCameraScan, SCAN_LABEL, type CameraScan, type ScanStatus, type Box } from './useCameraScan';
export { estimate, quality, type Sample, type ScanResult } from './signal';
