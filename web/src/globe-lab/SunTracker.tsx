// Runs the globe clock and writes the Sun direction (Earth-local) once per frame, before any
// globe shader reads it. Mount once inside the Canvas.
import { useFrame } from '@react-three/fiber';
import { SUN_LOCAL } from './Earth';
import { sunDir } from './frame';
import { labTime, useLabClock } from './store';

export function SunTracker() {
  useLabClock();
  useFrame(() => {
    sunDir(new Date(labTime.ms), SUN_LOCAL);
  }, -2);
  return null;
}
