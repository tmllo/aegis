// Habitat tab: thin wrapper around the drop-in HabitatPanel. ?focus=<anomaly id> highlights one anomaly.
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HabitatPanel } from '../../habitat';
import type { CrewResolver } from '../../habitat/logic';
import { useHabitatData } from '../habitat';
import { useStationData } from '../model';

export default function Habitat() {
  const { data, error } = useHabitatData();
  const { data: mission } = useStationData();
  const [qs] = useSearchParams();
  // crew_id + metric key -> "Kenji Mori" + "Sleep", from crew_data.json (rank prefix like "Eng." dropped)
  const resolveCrew = useCallback<CrewResolver>(
    (crewId, metric) => {
      const m = mission?.crew.crew.find((c) => c.id === crewId);
      const label = mission?.crew.metrics[metric as keyof typeof mission.crew.metrics]?.label;
      return { name: m ? m.name.replace(/^\S+\.\s+/, '') : crewId, metric: label ?? metric };
    },
    [mission],
  );
  if (error) return <p className="st-page st-muted">Habitat telemetry could not be loaded: {error}</p>;
  if (!data) return <div className="st-wait" />;
  return (
    <div className="st-page">
      <HabitatPanel data={data} focusAnomalyId={qs.get('focus')} resolveCrew={resolveCrew} />
    </div>
  );
}
