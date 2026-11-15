// Demo AI therapist for the Mind page. Uses Google's free Gemini API when a key is set on this
// device (pasted once in the panel, kept in localStorage, never built into the app). Without a
// key or network it answers from a short scripted demo, so the page still works offline.
// Not a clinician: anything that sounds like risk is sent to the flight surgeon instead.

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

const RISK = /suicid|kill myself|end it|self[- ]?harm|hurt myself|no reason to live|can't go on/i;
export const RISK_REPLY =
  'That sounds serious, and you should not carry it alone. Please contact the flight surgeon now. They are on a private line, and this is what they are there for.';

const system = (today: string) =>
  [
    'You are a calm, warm support companion for an astronaut on a long mission, inside the e^x health app.',
    'Use short, plain sentences. Reply in at most three sentences. Reflect what they said, then offer one small, practical step they can take on the station (breathing, a call home, sleep routine, a treadmill walk, talking to a crewmate).',
    'You are a demo, not a therapist or doctor. Never diagnose. If they mention self-harm or feeling unsafe, tell them to contact the flight surgeon now.',
    `Today's check-in: ${today || 'not done yet'}.`,
  ].join(' ');

const SCRIPT = [
  'Thank you for telling me. It makes sense to feel that way after weeks in a small space. What part of today weighed on you most?',
  'That is a lot to hold. One small thing for the next hour: ten slow breaths, four counts in and six out. Would that be possible right now?',
  'You are doing the right thing by noticing it. A short call home or a meal with the crew often helps more than it seems. Who could you reach today?',
  'Good. Keep it small and kind to yourself. If this feeling stays for more than a few days, bring it to your private conference with the flight surgeon.',
];

/** One reply. `demo` is true when the scripted fallback answered. */
export async function talk(history: Turn[], today: string): Promise<{ text: string; demo: boolean }> {
  const last = history[history.length - 1]?.text ?? '';
  if (RISK.test(last)) return { text: RISK_REPLY, demo: false };
  const scripted = { text: SCRIPT[Math.min(history.filter((t) => t.role === 'user').length - 1, SCRIPT.length - 1)], demo: true };
  const key = getKey();
  if (!key) return scripted;
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
    if (!r.ok) return scripted;
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    return text ? { text, demo: false } : scripted;
  } catch {
    return scripted;
  }
}
