// What every console screen needs: the data, each crew member's status (with today's
// self-reported mood merged in), seat designations and the selected crew member.
import { useEffect, useMemo } from 'react';
import { useMissionData, useMissionStore } from '../data/store';
import { useMind } from '../data/mind';
import type { CrewMember } from '../data/types';
import { crewView, RANK, withMood, type CrewView } from './model';
import { useHud } from './hud';

/** Seat designations from the role field (UI layer only; no names on screen). */
export function designations(crew: CrewMember[]): Record<string, string> {
  const out: Record<string, string> = {};
  let ms = 0;
  for (const c of crew) {
    const r = c.role.toLowerCase();
    if (r.includes('commander')) out[c.id] = 'CDR';
    else if (r.includes('pilot')) out[c.id] = 'PLT';
    else if (r.includes('engineer')) out[c.id] = 'FE';
    else out[c.id] = `MS${++ms}`;
  }
  return out;
}

let picked = false;

export function useConsole() {
  const { data, loadState, error } = useMissionData();
  const reports = useMind((s) => s.reports);
  const selectedId = useMissionStore((s) => s.selectedCrewId);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);
  const asOf = useHud((s) => s.asOf);
  const env = useMissionStore((s) => s.environment);
  // replay day and mission setting (ISS / Moon / transit / Mars) applied to the same data
  const cd = useMemo(() => {
    if (!data?.crew) return null;
    const mission = { ...data.crew.mission, ...(asOf ? { today: asOf } : {}), ...(env ? { environment: env } : {}) };
    return { ...data.crew, mission };
  }, [data, asOf, env]);

  const views: CrewView[] = useMemo(
    () => (cd ? cd.crew.map((m) => crewView(cd, withMood(cd, m, reports[m.id]?.[cd.mission.today]?.mood))) : []),
    [cd, reports],
  );
  const seat = useMemo(() => (cd ? designations(cd.crew) : {}), [cd]);

  // first visit: open on the crew member who needs a look most
  useEffect(() => {
    if (picked || !views.length) return;
    picked = true;
    const worst = [...views].sort((a, b) => RANK[b.overall] - RANK[a.overall])[0];
    if (worst) setCrew(worst.m.id);
  }, [views, setCrew]);

  const cv = views.find((v) => v.m.id === selectedId) ?? views[0] ?? null;
  const day = cd && cv ? cv.m.series.findIndex((r) => r.date === cd.mission.today) + 1 : null;
  return { data, cd, loadState, error, views, seat, cv, setCrew, day, asOf };
}
