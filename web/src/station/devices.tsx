// Wearables on the body page: which device is connected and what it reads from the body. Simulated in this
// demo (no Bluetooth device is paired); the list says so. Each device has its own icon.
import './devices.css';

type DeviceId = 'watch' | 'band' | 'ear';
interface Device {
  id: DeviceId;
  name: string;
  on: boolean;
  reads: string;
}

const DEVICES: Device[] = [
  { id: 'watch', name: 'Watch', on: true, reads: 'Heart rate, sleep, activity · haptic alerts' },
  { id: 'band', name: 'Bracelet', on: true, reads: 'Skin temperature, blood oxygen, movement' },
  { id: 'ear', name: 'Earbud', on: false, reads: 'Core temperature, heart rate, breathing' },
];

function DeviceIcon({ id }: { id: DeviceId }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {id === 'watch' && (
        <>
          <rect x="6" y="6" width="12" height="12" rx="3" {...p} />
          <path d="M9 6 9.6 2.5h4.8L15 6M9 18l.6 3.5h4.8L15 18M12 9.5V12l1.8 1.2" {...p} />
        </>
      )}
      {id === 'band' && (
        <>
          <ellipse cx="12" cy="12" rx="9" ry="5" {...p} />
          <rect x="9" y="9.6" width="6" height="4.8" rx="1.4" {...p} />
        </>
      )}
      {id === 'ear' && (
        <>
          <path d="M8 13.5a4.5 4.5 0 1 1 6.8-3.9c0 1.6-.9 2.4-1.8 3.2-.8.7-1.2 1.4-1.2 2.6v4.1" {...p} />
          <circle cx="16.5" cy="7" r="1.2" {...p} />
        </>
      )}
    </svg>
  );
}

export function Devices() {
  return (
    <section className="dv" aria-label="Devices">
      <p className="fr-cap">Devices · simulated</p>
      <ul>
        {DEVICES.map((d) => (
          <li key={d.id} className={d.on ? 'is-on' : 'is-off'}>
            <span className="dv-i">
              <DeviceIcon id={d.id} />
            </span>
            <span className="dv-t">
              <b>
                {d.name}
                <em>
                  <i aria-hidden /> {d.on ? 'Connected' : 'Not worn'}
                </em>
              </b>
              <span>{d.reads}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
