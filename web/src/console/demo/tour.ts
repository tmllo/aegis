// The interactive walkthrough: seven steps, each one sentence plus what the cursor does on the
// real app. Sentences come from the mission files (through script.ts). Actions use the router,
// the store setters and taps on the real controls; a control that is missing is skipped, the
// sentence still shows. Nothing is saved for good: the player restores the app on exit.
import type { CrewData, EnvironmentId, StormForecast } from '../../data/types';
import { crewView, fmt, METRIC_TARGET, rowOf } from '../model';
import { buildBeats, type Trend } from './script';

/** What a step can do. Every call waits for the animation, and stops when the demo is left. */
export interface Stage {
  nav: (to: string) => Promise<void>;
  /** Move the cursor to a control and press it. Returns false when it is not on screen. */
  tap: (selector: string, text?: string, opts?: { press?: boolean; row?: string }) => Promise<boolean>;
  /** Move the cursor to a point given as a fraction of the window, and ripple. */
  tapAt: (x: number, y: number) => Promise<void>;
  /** Type a value into an input (the real field, so the app's own save applies). */
  type: (selector: string, value: string) => Promise<boolean>;
  wait: (ms: number) => Promise<void>;
  setCrew: (id: string) => void;
  setEnv: (e: EnvironmentId) => void;
}

export interface Step {
  id: 'crew' | 'body' | 'link' | 'edit' | 'check' | 'forecast' | 'shelter';
  title: string;
  say: string;
  /** Rough length, for the progress line. */
  seconds: number;
  trends?: [Trend, Trend];
  run: (s: Stage) => Promise<void>;
}

export function buildTour(cd: CrewData, storm: StormForecast, seat: Record<string, string>): Step[] {
  const beats = buildBeats(cd, storm, seat);
  const views = cd.crew.map((m) => crewView(cd, m));
  const lead = views.find((v) => v.overall === 'red') ?? views.find((v) => v.overall === 'amber') ?? views[0];
  const who = seat[lead.m.id] ?? lead.m.role;
  const k = lead.issue?.metric ?? 'sleep_h';
  const row = rowOf(cd, lead.m, lead.scores, k);
  const label = row.label;
  const unit = row.unit === '/5' ? ' of 5' : row.unit ? ` ${row.unit}` : '';
  const usual = row.mean != null ? fmt(row.mean, row.digits) : null;
  const now = fmt(row.value, row.digits);
  const target = METRIC_TARGET[k];
  const home = cd.mission.environment;

  return [
    {
      id: 'crew',
      title: 'Crew',
      say: beats[0].caption.split('. Each reading')[0] + '. One word says how each person is today.',
      seconds: 7,
      run: async (s) => {
        s.setEnv(home);
        await s.nav('/');
        await s.wait(600);
        await s.tap('.cx-crew button', who);
        s.setCrew(lead.m.id);
        await s.wait(2600);
      },
    },
    {
      id: 'body',
      title: 'The body',
      say: `Tap the body to see the reading behind the colour: ${label.toLowerCase()} ${now}${unit}${usual ? `, usual ${usual}` : ''}.`,
      seconds: 7,
      run: async (s) => {
        await s.nav('/');
        await s.wait(400);
        await s.tapAt(0.5, 0.16);
        if (target) await s.nav(`/?t=${target}&k=${k}`);
        await s.wait(3200);
      },
    },
    {
      id: 'link',
      title: 'What moved together',
      say: beats[1].caption,
      seconds: 7,
      trends: beats[1].trends,
      run: async (s) => {
        if (target) await s.nav(`/?t=${target}&k=${k}`);
        await s.wait(5200);
      },
    },
    {
      id: 'edit',
      title: 'Correct a reading',
      say: usual ? `Any number can be corrected by hand. Enter ${usual}${unit} and the status is worked out again at once.` : 'Any number can be corrected by hand. The status is worked out again at once.',
      seconds: 10,
      run: async (s) => {
        await s.nav('/?p=details');
        await s.wait(700);
        // the value button of the flagged row opens the field
        await s.tap('.vrow-v', undefined, { row: label });
        await s.wait(300);
        if (usual && (await s.type('.vrow-edit input', usual))) {
          await s.wait(500);
          await s.tap('.vrow-edit .solid');
        }
        await s.wait(900);
        await s.nav('/');
        await s.wait(2600);
      },
    },
    {
      id: 'check',
      title: 'Daily check',
      say: 'The daily check takes a minute: five questions, then heart rate from the camera, the wrist band and a reaction test.',
      seconds: 9,
      run: async (s) => {
        await s.nav('/');
        await s.wait(500);
        if (!(await s.tap('button', 'Start daily check'))) await s.nav('/checkup');
        await s.wait(1300);
        await s.tap('.oq-opt', undefined, { press: false }); // shown, not saved
        await s.wait(900);
        await s.tap('button', 'Skip questions');
        await s.wait(3000);
      },
    },
    {
      id: 'forecast',
      title: 'Space weather',
      say: beats[4].caption.split(' The crew gets')[0] + ' The map shows the route it takes from the Sun to the crew.',
      seconds: 10,
      run: async (s) => {
        await s.nav('/environment');
        await s.wait(900);
        if (!(await s.tap('button', 'Open forecast'))) await s.nav('/environment?mode=forecast');
        await s.wait(1600);
        await s.tap('.wx-pick', 'May 2024');
        await s.wait(4200);
      },
    },
    {
      id: 'shelter',
      title: 'One instruction',
      say: 'When a warning comes, the crew gets one instruction: go to the shelter.',
      seconds: 9,
      run: async (s) => {
        await s.nav('/environment?mode=forecast');
        await s.wait(500);
        if (!(await s.tap('.wx-btn'))) await s.nav('/environment?mode=shelter');
        await s.wait(1100);
        await s.tap('button', 'Start the drill');
        await s.wait(1800);
        await s.tap('button', 'Move to the shelter');
        await s.wait(900);
        await s.tap('.cf-box button', 'Shelter');
        await s.wait(2600);
      },
    },
  ];
}
