// Tooltips pinned to a 3D point with a leader line (the globe itself lives in World.tsx).
import type { ReactNode } from 'react';
import { Html } from '@react-three/drei';

export interface Tip {
  id: string;
  pos: [number, number, number];
  title: string;
  line: ReactNode;
  status?: string;
}

export function Pin({ tip }: { tip: Tip }) {
  return (
    <group position={tip.pos}>
      <Html zIndexRange={[12, 11]} style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'relative' }}>
          <div className="pin" data-status={tip.status} style={{ position: 'absolute', left: -5, top: -5 }} />
          <div className="tip" data-status={tip.status}>
            <b>{tip.title}</b>
            <span>{tip.line}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}
