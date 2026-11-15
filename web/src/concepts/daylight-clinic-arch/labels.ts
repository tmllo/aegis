// Label placement for the map. Every label is tried below, above and beside its
// disc; the first spot that touches no disc, no count and no earlier label wins.
// A label with no free spot is left out (the sheet still lists the node).
export interface LabelLine {
  t: string;
  k: 'label' | 'strong' | 'sub';
}
export interface LabelReq {
  id: string;
  x: number;
  y: number;
  /** Disc radius plus the count line under it, if any. */
  below: number;
  lines: LabelLine[];
  fs: number;
  priority: number;
  outward: boolean;
}
export interface Placed {
  id: string;
  x: number;
  y: number;
  anchor: 'middle' | 'start' | 'end';
  lh: number;
  fs: number;
  lines: LabelLine[];
}
type Box = [number, number, number, number];

const hit = (a: Box, b: Box) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
const widthOf = (l: LabelLine, fs: number) => l.t.length * fs * (l.k === 'strong' ? 0.6 : 0.55);

export function placeLabels(reqs: LabelReq[], obstacles: Box[], bounds: { w: number; h: number }): Placed[] {
  const taken: Box[] = [...obstacles];
  const out: Placed[] = [];
  const R = 26;
  for (const q of [...reqs].sort((a, b) => a.priority - b.priority)) {
    const lh = q.fs * 1.22;
    const w = Math.max(...q.lines.map((l) => widthOf(l, q.fs))) + 8;
    const h = q.lines.length * lh + 2;
    const below: [Box, Placed['anchor'], number, number] = [[q.x - w / 2, q.y + q.below + 2, w, h], 'middle', q.x, q.y + q.below + 2];
    const above: [Box, Placed['anchor'], number, number] = [[q.x - w / 2, q.y - R - 4 - h, w, h], 'middle', q.x, q.y - R - 4 - h];
    const right: [Box, Placed['anchor'], number, number] = [[q.x + R + 4, q.y - h / 2, w, h], 'start', q.x + R + 8, q.y - h / 2];
    const left: [Box, Placed['anchor'], number, number] = [[q.x - R - 4 - w, q.y - h / 2, w, h], 'end', q.x - R - 8, q.y - h / 2];
    const sides = q.x >= 0 ? [right, left] : [left, right];
    const vert = q.y <= 0 ? [above, below] : [below, above];
    const order = q.outward ? (Math.abs(q.x) > Math.abs(q.y) ? [sides[0], ...vert, sides[1]] : [vert[0], ...sides, vert[1]]) : [below, above, ...sides];
    for (const [box, anchor, tx, ty] of order) {
      if (box[0] < -bounds.w || box[0] + box[2] > bounds.w || box[1] < -bounds.h || box[1] + box[3] > bounds.h) continue;
      if (taken.some((t) => hit(box, t))) continue;
      taken.push(box);
      out.push({ id: q.id, x: tx, y: ty + q.fs * 0.95, anchor, lh, fs: q.fs, lines: q.lines });
      break;
    }
  }
  return out;
}
