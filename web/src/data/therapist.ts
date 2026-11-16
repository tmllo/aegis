// Support companion for the Mind page. Emile, 16 Nov: no real API; the demo should feel like a real AI.
// So the default is a built-in companion that runs on the device: it reads what the astronaut wrote and
// today's check-in, picks the topic, reflects it back, offers one small step on the station, and never
// repeats itself. It takes a short "thinking" pause like a model would. A Gemini key pasted on this device
// (kept in localStorage, never built into the app) still takes precedence if someone sets one.
// Not a clinician: anything that sounds like risk gets one fixed reply sending them to the Earth support team.

export interface Turn {
  role: 'user' | 'model';
  text: string;
}

const KEY = 'ex-gemini-key';
const MODEL = 'gemini-flash-latest';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const getKey = (): string => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

export const setKey = (k: string) => {
  try {
    if (k) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: key lasts only for this visit */
  }
};

const RISK = /suicid|kill myself|end it|self[- ]?harm|hurt myself|no reason to live|can't go on|want to die/i;
export const RISK_REPLY =
  'That sounds serious, and you should not carry it alone. Please contact the Earth support team now. They are on a private line, and this is what they are there for.';

const system = (today: string) =>
  [
    'You are a calm, warm support companion for an astronaut on a long mission, inside the e^x health app.',
    'Use short, plain sentences. Reply in at most three sentences. Reflect what they said, then offer one small, practical step they can take on the station (breathing, a call home, sleep routine, a treadmill walk, talking to a crewmate).',
    'You are a demo, not a therapist or doctor. Never diagnose. If they mention self-harm or feeling unsafe, tell them to contact the Earth support team now.',
    `Today's check-in: ${today || 'not done yet'}.`,
  ].join(' ');

/** Who answered: a pasted Gemini key, the built-in companion, or the fixed risk rule. */
export type Reply = { text: string; demo: boolean; via: 'gemini' | 'site' | 'rule' | 'script' };

// ---------------------------------------------------------------- built-in companion

type Topic = { id: string; re: RegExp; scale?: string; replies: string[] };

/** Topics in priority order. Each reply: reflect, one small step, often one open question. */
const TOPICS: Topic[] = [
  {
    id: 'who',
    re: /are you (real|human|a bot|an ai)|who are you|what are you/i,
    replies: [
      "I'm the e^x companion: a support tool, not a person and not a clinician. I only see what you type here and today's check-in. What's on your mind?",
    ],
  },
  {
    id: 'sleep',
    re: /sleep|slept|insomnia|awake|tired|exhaust|nap|rest\b|noise|bunk|night/i,
    scale: 'Sleep',
    replies: [
      'Short nights add up fast up here, and the station never really goes quiet. Tonight, try earplugs and the eye mask, and dim the crew quarters light an hour before your sleep slot. What usually keeps you up: noise, thoughts, or the schedule?',
      'That kind of tiredness makes everything feel heavier. One small thing: no screens for the last 30 minutes before your sleep slot, and keep the bag a little cool. Has this been building over several nights?',
      'Your body is still adjusting to a sunrise every 90 minutes; that is hard on anyone. If you can, keep the same wake time for the next three days, even after a bad night. Would that fit your timeline?',
    ],
  },
  {
    id: 'home',
    re: /home|family|kids?|wife|husband|partner|parents?|mom|mum|dad|earth|miss/i,
    scale: 'Social',
    replies: [
      'Missing home is one of the most normal things on a long mission, and it often comes in waves. Could you book a family conference for this week, even a short one? Hearing ordinary news from home helps more than it sounds.',
      'That distance is real, and you are allowed to feel it. One thing that helps many crews: write a few lines to them tonight, even if it sends later. What would you want them to know about your day?',
      'It sounds like you are carrying them with you, which says a lot about you. Is there a photo or a recording you could keep near your bunk for the next few nights?',
    ],
  },
  {
    id: 'crew',
    re: /crew|crewmate|commander|colleague|argu|tension|conflict|fight|annoy|frustrat|team/i,
    scale: 'Social',
    replies: [
      'Friction in a small crew is common, and it usually grows when nobody names it. A calm two-minute talk at a neutral moment, over a meal rather than during a task, often clears more than expected. Is it one person, or the whole group?',
      'That sounds draining, especially when you cannot get away from it. Before you talk, try writing down the one thing you need from them, in one sentence. What would that sentence be?',
      'You are noticing it early, which is the right time. If it keeps coming back, the crew medic or your private conference with Earth support can help mediate. Would a shared task you both enjoy help reset things?',
    ],
  },
  {
    id: 'stress',
    re: /stress|anxi|worr|panic|pressure|overwhelm|workload|deadline|behind|too much|scared|afraid|fear|nervous/i,
    scale: 'Stress',
    replies: [
      'That is a lot to hold at once. Try this now: four counts in, six counts out, ten times. Then pick only the next task, not the whole list. Which task is sitting heaviest?',
      'It makes sense that your mind is running fast with this much on the timeline. Could you ask the ground to move one non-critical task to tomorrow? Small slack makes a real difference.',
      'Feeling on edge before demanding work is normal; it means you care about getting it right. A short treadmill or bike session often brings the level down within 20 minutes. Is there a slot for that today?',
    ],
  },
  {
    id: 'radiation',
    re: /radiation|storm|flare|solar|dose|shelter/i,
    replies: [
      'Worrying about radiation is completely reasonable. e^x watches the Sun for you and will tell the crew to shelter in time, so you do not have to keep checking. Would it help to look at today’s forecast together on the Radiation tab?',
    ],
  },
  {
    id: 'flat',
    re: /flat|low|down|sad|empty|numb|bored|meh|unmotivat|lonely|alone|isolat|blue|cry/i,
    scale: 'Mood',
    replies: [
      'Thank you for saying it; flat days happen to everyone out here, and weeks of the same walls make them more likely. One small thing for the next hour: ten minutes at the window, or music you love. What has given you even a little energy lately?',
      'That heaviness is worth paying attention to, gently. Doing one small thing with a crewmate, like sharing a meal or a game, often lifts it a bit. Who on board do you feel easiest with?',
      'You do not have to fix the whole feeling today. Keep the next step small: a shower, a short walk on the treadmill, a call home. If it stays for more than a few days, bring it to your private conference with Earth support.',
    ],
  },
  {
    id: 'body',
    re: /pain|ache|headache|back|sore|sick|nause|dizzy|eyes?|vision/i,
    replies: [
      'I am sorry it hurts. I cannot assess symptoms, but the crew medic can, and e^x keeps your readings ready for them. If it is getting worse or feels unusual, please tell the medic today.',
    ],
  },
  {
    id: 'food',
    re: /food|eat|appetite|hungry|meal|taste/i,
    replies: [
      'Appetite often changes in microgravity, and food can taste flat up here. Small, regular meals and a bit of hot sauce help many crews. Have you been skipping meals lately?',
    ],
  },
  {
    id: 'good',
    re: /^(?!.*\b(not|never|isn'?t|wasn'?t|no)\b).*\b(better|good|great|fine|okay|ok|thanks?|thank you|helped|nice)\b/i,
    replies: [
      'I am glad to hear that. Notice what helped today, so you can reach for it again on a harder day. Anything else on your mind?',
      'That is good to hear. Keep the small habits going, they matter more than they look. I am here whenever you want to talk.',
    ],
  },
];

const FALLBACK = [
  'Thank you for telling me. It makes sense to feel that way after weeks in a small space. What part of today weighed on you most?',
  'I hear you. Let us keep it small: one thing in the next hour that would make today a little easier. What would that be?',
  'That is a lot to hold. Ten slow breaths, four counts in and six out, often takes the edge off. Would that be possible right now?',
  'You are doing the right thing by noticing it. A short call home or a meal with the crew often helps more than it seems. Who could you reach today?',
];
const FOLLOW = [
  'That makes sense. Try it once today and see how it feels; small steps count.',
  'Good. Keep it small and kind to yourself. If this feeling stays for more than a few days, bring it to your private conference with the Earth support team.',
];
const SHORT_YES = /^(yes|yeah|yep|sure|maybe|i guess|ok(ay)?|i can|i will|alright)\b/i;
const SHORT_NO = /^(no|nope|not really|i can'?t|not now|don'?t know|idk)\b/i;

/** Today's check-in words by scale, from the line the Mind page passes ("Mood Okay, Sleep Poor, ..."). */
function checkin(today: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of today.matchAll(/(Mood|Stress|Energy|Sleep|Social) ([^,]+)/g)) if (!/not answered/i.test(m[2])) out[m[1]] = m[2].trim();
  return out;
}

function pick(list: string[], used: Set<string>, seed: number): string {
  const fresh = list.filter((r) => !used.has(r));
  const pool = fresh.length ? fresh : list;
  return pool[seed % pool.length];
}

function companion(history: Turn[], today: string): string {
  const last = history[history.length - 1]?.text ?? '';
  const used = new Set(history.filter((t) => t.role === 'model').map((t) => t.text));
  const n = history.filter((t) => t.role === 'user').length;
  const seed = n + last.length;
  const topic = TOPICS.find((t) => t.re.test(last));
  if (!topic) {
    // a short yes / no continues the last topic instead of starting over
    if (n > 1 && (SHORT_YES.test(last.trim()) || SHORT_NO.test(last.trim()))) {
      if (SHORT_NO.test(last.trim())) return pick(['That is okay. We can keep it even smaller: just the next hour. What would make it a little easier?', 'Fair enough. What would feel doable instead?'], used, seed);
      return pick(FOLLOW, used, seed);
    }
    return pick(FALLBACK, used, seed);
  }
  let reply = pick(topic.replies, used, seed);
  // tie in today's check-in once, the way a model with that context would
  const ck = checkin(today);
  const word = topic.scale ? ck[topic.scale] : undefined;
  const mentioned = history.some((t) => t.role === 'model' && t.text.includes('check-in'));
  if (word && !mentioned) reply = `Your check-in today put ${topic.scale!.toLowerCase()} at "${word.toLowerCase()}", and that fits what you describe. ${reply}`;
  return reply;
}

/** A model-like pause: a beat to "read", then time that grows with the answer's length. */
const think = (text: string) => new Promise((r) => setTimeout(r, Math.min(650 + text.length * 9 + Math.random() * 400, 2600)));

/** One reply. A Gemini key pasted on this device answers if set; otherwise the built-in companion. */
export async function talk(history: Turn[], today: string): Promise<Reply> {
  const last = history[history.length - 1]?.text ?? '';
  if (RISK.test(last)) {
    await think('');
    return { text: RISK_REPLY, demo: false, via: 'rule' };
  }
  const local = async (): Promise<Reply> => {
    const text = companion(history, today);
    await think(text);
    return { text, demo: true, via: 'site' };
  };
  const key = getKey();
  if (!key) return local();
  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system(today) }] },
        contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return local();
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    return text ? { text, demo: false, via: 'gemini' } : local();
  } catch {
    return local();
  }
}
