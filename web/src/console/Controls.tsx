// View controls for the hero: a compass dial (drag to rotate, N resets north), zoom in and out,
// and for the body the layer peel. All drive the shared HUD state; the scene reacts.
import { useRef } from 'react';
import { useHud, type Layer } from './hud';
import { Icon } from './ui';

export function ViewControls({ style, layers = false }: { style?: React.CSSProperties; layers?: boolean }) {
  const { yaw, setYaw, zoom, setZoom, doReset, layers: shown, toggleLayer } = useHud();
  const drag = useRef<{ a: number; yaw: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const angle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  const deg = (yaw * 180) / Math.PI;
  return (
    <div className="vc" style={style}>
      {layers && (
        <div className="vc-layers" role="group" aria-label="Layers">
          {(['skin', 'muscle', 'organs', 'skeleton'] as Layer[]).map((l) => (
            <button key={l} type="button" className="sq" aria-pressed={shown[l]} onClick={() => toggleLayer(l)} title={l}>
              <span className="vc-l">{l}</span>
            </button>
          ))}
        </div>
      )}
      <div className="vc-zoom">
        <button type="button" className="sq" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.2)}>
          +
        </button>
        <button type="button" className="sq" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.2)}>
          -
        </button>
      </div>
      <div
        ref={ref}
        className="dial-ctl"
        style={{ position: 'relative', ['--rot' as string]: `${deg}deg` }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { a: angle(e), yaw };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setYaw(drag.current.yaw + (angle(e) - drag.current.a));
        }}
        onPointerUp={() => (drag.current = null)}
        role="slider"
        aria-label="Rotate"
        aria-valuenow={Math.round(deg)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setYaw(yaw - 0.15);
          if (e.key === 'ArrowRight') setYaw(yaw + 0.15);
        }}
      >
        <span>{Math.round(((deg % 360) + 360) % 360)}°</span>
        <button type="button" className="vc-n" aria-label="Reset north" onPointerDown={(e) => e.stopPropagation()} onClick={doReset}>
          N
        </button>
      </div>
      <button type="button" className="sq" aria-label="Reset view" title="Reset view" onClick={doReset}>
        <Icon name="back" size={16} />
      </button>
    </div>
  );
}
