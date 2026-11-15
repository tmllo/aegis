// Habitat tab: thin wrapper around the drop-in HabitatPanel. ?focus=<anomaly id> highlights one anomaly.
import { useSearchParams } from 'react-router-dom';
import { HabitatPanel } from '../../habitat';
import { useHabitatData } from '../habitat';

export default function Habitat() {
  const { data, error } = useHabitatData();
  const [qs] = useSearchParams();
  if (error) return <p className="st-page st-muted">Habitat telemetry could not be loaded: {error}</p>;
  if (!data) return <div className="st-wait" />;
  return (
    <div className="st-page">
      <HabitatPanel data={data} focusAnomalyId={qs.get('focus')} />
    </div>
  );
}
