// Care plan for behavioural health on long missions, in plain words. Every line is tied to a source
// from the team's research (docs/research/3-health-science/03-health-indicators-thresholds.md,
// docs/backend/MIND-API.md, docs/backend/SLEEP.md). Shown on the Mind page with a Sources toggle.

export interface Source {
  id: string;
  title: string;
  url: string;
}

export const SOURCES: Source[] = [
  { id: 'TB-016', title: 'NASA OCHMO TB-016, Behavioral health and performance', url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf' },
  { id: 'MTB-009', title: 'NASA OCHMO MTB-009, Circadian desynchrony (sleep and light)', url: 'https://www.nasa.gov/wp-content/uploads/2026/03/ochmo-mtb-009-circadian-desynchrony.pdf' },
  { id: 'V1', title: 'NASA-STD-3001 Vol. 1 Rev C (6010: behavioural health provider sets conference frequency)', url: 'https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf' },
  { id: 'HRP', title: 'NASA Human Research Program, five hazards: isolation and confinement', url: 'https://www.nasa.gov/hrp/hazards/' },
  { id: 'PTSD-Coach', title: 'VA National Center for PTSD, PTSD Coach relaxation tools', url: 'https://mhealth.amegroups.org/article/view/20524/20219' },
];

export interface CareItem {
  title: string;
  /** one plain sentence */
  text: string;
  sources: string[];
  /** which scores it helps */
  helps: string[];
}

export const CARE: CareItem[] = [
  {
    title: 'Sleep and light',
    text: 'Keep the 8.5 h sleep window; bright light in the first 1-2 h after waking, dim light 1-2 h before bed, no caffeine 6-12 h before sleep.',
    sources: ['MTB-009'],
    helps: ['self.sleep_quality', 'self.sleep_h', 'self.energy'],
  },
  {
    title: 'Private conference',
    text: 'A private video call with the ground psychologist; how often is set by the behavioural health team. Raise anything that worries you there.',
    sources: ['TB-016', 'V1'],
    helps: ['self.mood', 'self.stress'],
  },
  {
    title: 'Family contact',
    text: 'Planned family conferences and care packages keep the link home; book a call when you feel cut off.',
    sources: ['TB-016', 'HRP'],
    helps: ['self.social', 'self.mood'],
  },
  {
    title: 'Exercise block',
    text: 'The daily exercise block protects bone and muscle and also lifts mood and sleep.',
    sources: ['HRP'],
    helps: ['self.mood', 'self.energy', 'self.sleep_quality'],
  },
  {
    title: 'Workload and breaks',
    text: 'Short breaks, paced breathing or grounding for a few minutes when stress builds; flag a heavy schedule to the commander.',
    sources: ['TB-016', 'PTSD-Coach'],
    helps: ['self.stress'],
  },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
