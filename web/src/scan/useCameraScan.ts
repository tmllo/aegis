// useCameraScan: on-device camera heart-rate scan (rPPG). Nothing leaves the device: frames are
// reduced to one mean R, G, B per frame in memory, and the camera stops when the scan ends.
// UI is not here: the page places its own Scan button and overlay and reads this hook's state.
//
//   const scan = useCameraScan();
//   <video ref={scan.videoRef} muted playsInline />   // optional preview; the hook works without it
//   scan.start()  scan.cancel()
//   scan.bpm, scan.breathing, scan.confidence, scan.progress (0..1), scan.status, scan.hint, scan.box
import { useCallback, useEffect, useRef, useState } from 'react';
import { estimate, quality, type Sample } from './signal';

export const SCAN_LABEL = 'Camera estimate, not a medical device';

export type ScanStatus = 'idle' | 'starting' | 'scanning' | 'done' | 'denied' | 'unsupported' | 'error' | 'cancelled';

/** Skin box in video pixels (forehead and upper cheeks). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CameraScan {
  status: ScanStatus;
  /** 0..1 over the scan duration */
  progress: number;
  bpm: number | null;
  breathing: number | null;
  /** 0..1 */
  confidence: number;
  /** one short instruction while scanning, null when fine ("Hold still", "More light", "Face the camera") */
  hint: string | null;
  /** where the skin is read from, in video pixels; null before the first frame */
  box: Box | null;
  /** whether a real face detector is used (else a fixed guide box the user lines up with) */
  faceTracking: boolean;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  start: () => void;
  cancel: () => void;
  label: string;
}

interface Options {
  /** seconds; 20-30 recommended (breathing needs >= 15) */
  durationS?: number;
}

interface FaceDetectorLike {
  detect(src: CanvasImageSource): Promise<{ boundingBox: DOMRectReadOnly }[]>;
}

function makeFaceDetector(): FaceDetectorLike | null {
  const FD = (globalThis as unknown as { FaceDetector?: new (o?: object) => FaceDetectorLike }).FaceDetector;
  try {
    return FD ? new FD({ fastMode: true, maxDetectedFaces: 1 }) : null;
  } catch {
    return null;
  }
}

/** Fixed guide box: where a face sits when the user lines up with the on-screen guide. */
function guideBox(w: number, h: number): Box {
  const fw = w * 0.3;
  const fh = h * 0.42;
  return { x: (w - fw) / 2, y: h * 0.18, w: fw, h: fh };
}

/** Forehead + upper cheeks inside a face box: skip eyes, mouth, hair and background. */
function skinBox(face: Box): Box {
  return { x: face.x + face.w * 0.2, y: face.y + face.h * 0.12, w: face.w * 0.6, h: face.h * 0.45 };
}

export function useCameraScan({ durationS = 25 }: Options = {}): CameraScan {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [breathing, setBreathing] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [faceTracking, setFaceTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useRef<{ stop: () => void } | null>(null);

  const stopAll = useCallback(() => {
    run.current?.stop();
    run.current = null;
  }, []);

  useEffect(() => stopAll, [stopAll]); // camera off on unmount

  const cancel = useCallback(() => {
    stopAll();
    setStatus('cancelled');
    setHint(null);
  }, [stopAll]);

  const start = useCallback(() => {
    stopAll();
    setProgress(0); setBpm(null); setBreathing(null); setConfidence(0); setHint(null); setBox(null); setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setError('This browser has no camera access');
      return;
    }
    setStatus('starting');

    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ownVideo: HTMLVideoElement | null = null;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current ?? ownVideo;
      if (v) v.srcObject = null;
    };
    run.current = { stop };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
        setError(name === 'NotAllowedError' ? 'Camera permission was declined' : 'No camera available');
        run.current = null;
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current ?? (ownVideo = document.createElement('video'));
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setStatus('error'); setError('Canvas unavailable'); stop(); return;
      }
      const detector = makeFaceDetector();
      setFaceTracking(!!detector);

      const samples: Sample[] = [];
      let face: Box | null = null;
      let lastDetect = 0;
      let lastEstimate = 0;
      let detecting = false;
      const t0 = performance.now();
      setStatus('scanning');

      const tick = () => {
        if (stopped) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
          ctx.drawImage(video, 0, 0, w, h);
          const now = performance.now();

          if (detector && !detecting && now - lastDetect > 500) {
            detecting = true;
            lastDetect = now;
            detector.detect(canvas).then(
              (faces) => {
                const b = faces[0]?.boundingBox;
                face = b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
                detecting = false;
              },
              () => { detecting = false; },
            );
          }
          const roi = skinBox(face ?? guideBox(w, h));
          const x = Math.max(0, Math.round(roi.x));
          const y = Math.max(0, Math.round(roi.y));
          const rw = Math.max(1, Math.min(w - x, Math.round(roi.w)));
          const rh = Math.max(1, Math.min(h - y, Math.round(roi.h)));
          const px = ctx.getImageData(x, y, rw, rh).data;
          let r = 0, g = 0, b = 0;
          const n = px.length / 4;
          for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
          samples.push({ t: now, r: r / n, g: g / n, b: b / n });
          setBox({ x, y, w: rw, h: rh });

          const elapsed = (now - t0) / 1000;
          setProgress(Math.min(1, elapsed / durationS));

          // live readout every second after 8 s, and one short instruction
          if (now - lastEstimate > 1000) {
            lastEstimate = now;
            const recent = samples.filter((s) => s.t > now - 3000);
            const q = quality(recent);
            setHint(detector && !face ? 'Face the camera' : q.light < 0.6 ? 'More light' : q.stillness < 0.7 ? 'Hold still' : null);
            if (elapsed > 8) {
              const e = estimate(samples);
              setBpm(e.bpm); setConfidence(e.confidence);
            }
          }

          if (elapsed >= durationS) {
            const e = estimate(samples);
            setBpm(e.bpm); setBreathing(e.breathing); setConfidence(e.confidence);
            setProgress(1); setHint(null);
            setStatus('done');
            stop();
            run.current = null;
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
  }, [durationS, stopAll]);

  return { status, progress, bpm, breathing, confidence, hint, box, faceTracking, error, videoRef, start, cancel, label: SCAN_LABEL };
}
