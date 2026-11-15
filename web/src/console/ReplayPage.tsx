// The May 2024 storm replay inside the console frame. Back to Cabin is the Environment page's
// own button (env-back), so this wrapper only places the replay on the deep-black scene.
import StormReplay from './replay/StormReplay';

export default function ReplayPage() {
  return (
    <div className="rp-frame">
      <StormReplay />
    </div>
  );
}
