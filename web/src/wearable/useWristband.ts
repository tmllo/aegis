// useWristband: the astronaut's wrist band as a live device. Two sources, one interface:
//   connect('sim')        simulated band (always available), seeded from the member's own baseline
//   connect('bluetooth')  a real chest strap or watch over Web Bluetooth (Heart Rate Service 0x180D),
//                         Chrome/Edge only; heart rate only, the other channels stay simulated
// Once a minute the mean heart rate is stored on the e^x server (POST api/observations, vital.hr)
// when the server is up, so it is scored against her baseline like every other reading.
// UI is not here: the page shows status, the live numbers and one Connect / Disconnect button.
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasServer, postJson } from '../data/http';
import { createWristSim, minuteMean, parseHeartRateMeasurement, type WristReading } from './wristSim';

export type WristSource = 'sim' | 'bluetooth';
export type WristStatus = 'off' | 'pairing' | 'connected' | 'lost' | 'unsupported' | 'error';

export interface Wristband {
  status: WristStatus;
  source: WristSource | null;
  /** "Wrist band (simulated)" or the Bluetooth device name */
  deviceName: string | null;
  reading: WristReading | null;
  /** last 60 heart-rate values, oldest first (for a sparkline) */
  hrHistory: number[];
  /** readings stored on the server this session */
  uploaded: number;
  error: string | null;
  bluetoothAvailable: boolean;
  connect: (source?: WristSource) => void;
  disconnect: () => void;
  /** 0 rest .. 1 exercise (simulated band only) */
  setActivity: (a: number) => void;
}

interface Options {
  subject: string | null | undefined;
  /** member's resting heart-rate baseline (crew_data baseline.hr) */
  hrMean?: number;
  hrSd?: number;
  /** mission day (crew_data mission.today, YYYY-MM-DD) used to time-stamp stored readings */
  day?: string;
  /** store one reading a minute on the server (default true) */
  upload?: boolean;
}

interface BluetoothLike {
  requestDevice(o: object): Promise<{
    name?: string;
    gatt?: { connect(): Promise<{ getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<EventTarget & { startNotifications(): Promise<unknown>; value?: DataView }> }> }> };
    addEventListener(t: string, f: () => void): void;
  }>;
}

const bluetooth = (): BluetoothLike | null => (navigator as unknown as { bluetooth?: BluetoothLike }).bluetooth ?? null;

export function useWristband({ subject, hrMean = 62, hrSd = 4, day, upload = true }: Options): Wristband {
  const [status, setStatus] = useState<WristStatus>('off');
  const [source, setSource] = useState<WristSource | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [reading, setReading] = useState<WristReading | null>(null);
  const [hrHistory, setHrHistory] = useState<number[]>([]);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sim = useRef<ReturnType<typeof createWristSim> | null>(null);
  const timers = useRef<number[]>([]);
  const minute = useRef<number[]>([]);
  const btHr = useRef<number | null>(null);
  const alive = useRef(false);

  const clear = () => {
    timers.current.forEach((id) => window.clearInterval(id));
    timers.current = [];
  };

  const disconnect = useCallback(() => {
    alive.current = false;
    clear();
    setStatus('off'); setSource(null); setDeviceName(null); setReading(null); setHrHistory([]);
    minute.current = []; btHr.current = null;
  }, []);

  useEffect(() => () => { alive.current = false; clear(); }, []);
  // a different crew member means a different band
  useEffect(() => { disconnect(); }, [subject, disconnect]);

  const flush = useCallback(async () => {
    const hr = minuteMean(minute.current);
    minute.current = [];
    if (!upload || hr == null || !subject || !(await hasServer())) return;
    const now = new Date();
    const t = `${day ?? now.toISOString().slice(0, 10)}T${now.toISOString().slice(11, 19)}Z`;
    try {
      await postJson('api/observations', { subject, metric: 'vital.hr', t, value: Math.round(hr) });
      setUploaded((n) => n + 1);
    } catch {
      /* offline: the band keeps streaming locally */
    }
  }, [subject, day, upload]);

  const startStream = useCallback(() => {
    sim.current = createWristSim({ hrMean, hrSd, seed: [...(subject ?? 'x')].reduce((a, c) => a + c.charCodeAt(0), 7) });
    alive.current = true;
    timers.current.push(
      window.setInterval(() => {
        if (!alive.current || !sim.current) return;
        const r = sim.current.next(1000);
        if (btHr.current != null) r.hr = btHr.current;
        setReading(r);
        setHrHistory((h) => [...h.slice(-59), r.hr]);
        minute.current.push(r.hr);
      }, 1000),
      window.setInterval(() => void flush(), 60_000),
    );
  }, [hrMean, hrSd, subject, flush]);

  const connect = useCallback(
    (src: WristSource = 'sim') => {
      clear();
      setError(null);
      setSource(src);
      if (src === 'sim') {
        setStatus('pairing');
        setDeviceName('Wrist band (simulated)');
        // a real band takes a moment to pair; keep the same rhythm so the UI shows it
        const id = window.setTimeout(() => {
          setStatus('connected');
          startStream();
        }, 1200);
        timers.current.push(id);
        return;
      }
      const bt = bluetooth();
      if (!bt) {
        setStatus('unsupported');
        setError('Bluetooth needs Chrome or Edge');
        return;
      }
      setStatus('pairing');
      void (async () => {
        try {
          const dev = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] });
          setDeviceName(dev.name ?? 'Heart-rate strap');
          const server = await dev.gatt!.connect();
          const svc = await server.getPrimaryService('heart_rate');
          const ch = await svc.getCharacteristic('heart_rate_measurement');
          ch.addEventListener('characteristicvaluechanged', () => {
            if (ch.value) btHr.current = parseHeartRateMeasurement(ch.value);
          });
          await ch.startNotifications();
          dev.addEventListener('gattserverdisconnected', () => setStatus('lost'));
          setStatus('connected');
          startStream();
        } catch (e) {
          const name = (e as DOMException)?.name;
          setStatus(name === 'NotFoundError' ? 'off' : 'error'); // NotFoundError = user closed the picker
          setError(name === 'NotFoundError' ? null : 'Could not connect to the strap');
        }
      })();
    },
    [startStream],
  );

  const setActivity = useCallback((a: number) => sim.current?.setActivity(a), []);

  return {
    status, source, deviceName, reading, hrHistory, uploaded, error,
    bluetoothAvailable: !!bluetooth(),
    connect, disconnect, setActivity,
  };
}
