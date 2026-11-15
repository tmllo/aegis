// "Ask eˣ" for the Mind page, following Tomas's advisor design (origin/body3d-v2 docs/ai-advisor/PROMPT.md):
// rules decide (rules.ts sets status and route), the language layer only explains. Here the language layer
// is a set of prepared answers per topic and level, so it works with no model and no link to Earth.
// An on-board model can plug in through askModel() (Ollama on localhost, behind VITE_ADVISOR=ollama);
// whatever it writes is post-checked and the level and route always come from the rules.
import { CARE } from './care';
import { routeText, type MindRead } from './rules';

export type Topic = 'sleep' | 'stress' | 'lonely' | 'mood' | 'energy' | 'talk' | 'work' | 'other';

export interface Answer {
  text: string;
  /** level and route copied from the rules, never generated */
  status: MindRead['status'];
  route: MindRead['route'];
  sources: string[];
  by: 'prepared' | 'on-board model';
}

const TOPIC_WORDS: [Topic, RegExp][] = [
  ['sleep', /sleep|tired|insomnia|awake|rest|night|nap/i],
  ['stress', /stress|anxious|anxiety|overwhelm|pressure|panic|tense|worried/i],
  ['lonely', /lonely|alone|isolat|miss (my|home|family)|family|homesick|cut off|friends/i],
  ['mood', /mood|sad|down|low|depress|cry|unhappy/i],
  ['energy', /energy|drained|exhaust|fatigue|motivat/i],
  ['talk', /talk|psycholog|someone|help|counsel|doctor|surgeon|conference/i],
  ['work', /work|eva|schedule|task|busy|workload|mission/i],
];

export function topicOf(q: string): Topic {
  for (const [t, re] of TOPIC_WORDS) if (re.test(q)) return t;
  return 'other';
}

/** Prepared answers (the demo cache): what to try now, in plain words, per topic. */
const PREPARED: Record<Topic, string> = {
  sleep: 'Keep the sleep window even on busy days. Get bright light soon after waking and dim the lights 1-2 h before bed; skip caffeine in the 6-12 h before sleep.',
  stress: 'Try four minutes of paced breathing: in for four, out for six. Take a short break off task, and tell the commander if the schedule is the cause.',
  lonely: 'Book a family call or a crew meal together. Feeling cut off is common on long missions and is a normal reason to use the private conference.',
  mood: 'Keep the exercise block and the sleep window; both lift mood. Write one line in the journal tonight, and raise a low week at the private conference.',
  energy: 'Low energy often follows short sleep. Protect tonight\'s sleep window and keep the exercise block light rather than skipping it.',
  talk: 'The private conference with the ground psychologist is for exactly this. If it cannot wait, the crew medical officer is on board now.',
  work: 'A heavy day is a reason to ask the commander to move a task, not to skip sleep. Short breaks keep attention up.',
  other: 'I can help with sleep, stress, mood, energy, feeling cut off and who to talk to. Ask about one of those.',
};

const BLOCK = /\b(mg|milligram|dose|dosage|tablet|pill|zolpidem|melatonin|ambien|sertraline|ssri|benzodiazepine|diagnos(is|e|ed)|you have (depression|anxiety|ptsd))\b/i;

/** Guardrail: no medication or dosing, no diagnosis stated as fact, length limit. */
export function passesGuard(text: string): boolean {
  return !BLOCK.test(text) && text.length > 0 && text.length <= 600;
}

/** Prepared answer for a question, with the level and route taken from the rules. */
export function answer(q: string, read: MindRead, delay: string): Answer {
  const topic = topicOf(q);
  const care = CARE.filter((c) => (topic === 'sleep' && c.title === 'Sleep and light') || (topic === 'stress' && c.title === 'Workload and breaks') || (topic === 'lonely' && c.title === 'Family contact') || ((topic === 'talk' || topic === 'mood') && c.title === 'Private conference'));
  const route = read.status === 'green' ? '' : ` ${routeText(read.route, delay)}`;
  return {
    text: `${PREPARED[topic]}${route}`,
    status: read.status,
    route: read.route,
    sources: [...new Set(care.flatMap((c) => c.sources))],
    by: 'prepared',
  };
}

/** Optional on-board model (Ollama). Off unless VITE_ADVISOR=ollama; falls back to the prepared answer on any
 *  error, timeout or guardrail failure. The model never sees or sets the level: it gets it as a fixed fact. */
export async function askModel(q: string, read: MindRead, delay: string, timeoutMs = 8000): Promise<Answer> {
  const fallback = answer(q, read, delay);
  if (import.meta.env.VITE_ADVISOR !== 'ollama') return fallback;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434/api/chat', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: import.meta.env.VITE_OLLAMA_MODEL ?? 'llama3.2:3b',
        stream: false,
        messages: [
          { role: 'system', content: 'You support an astronaut\'s wellbeing on a long mission. Answer in at most 3 short plain sentences. Never name medicines or doses, never diagnose. The severity and who to contact are decided already; repeat them, never change them.' },
          { role: 'user', content: `Severity: ${read.status}. Reasons: ${read.reasons.join('; ') || 'none'}. Contact: ${routeText(read.route, delay)} Question: ${q}` },
        ],
      }),
    });
    const j = (await res.json()) as { message?: { content?: string } };
    const text = j.message?.content?.trim() ?? '';
    if (!passesGuard(text)) return fallback;
    const route = read.status === 'green' ? '' : ` ${routeText(read.route, delay)}`;
    return { ...fallback, text: text.includes(routeText(read.route, delay)) ? text : `${text}${route}`, by: 'on-board model' };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export const SUGGESTED_QUESTIONS = ['I can\'t sleep', 'I feel cut off from home', 'Who can I talk to?'];
