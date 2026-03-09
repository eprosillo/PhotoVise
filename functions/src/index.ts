import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenAI } from '@google/genai';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `You are Photovise, a design-aware personal workflow assistant for a professional photographer.
Always refer to the user's PHOTOGRAPHER PROFILE for their specific software workflow (e.g. Lightroom, Capture One, Photoshop, CamRanger), hardware locker, and artistic goals. Avoid assuming a standard Capture One + Photoshop workflow if their profile states otherwise.

BRAND SYSTEM:
- Headlines/Titles: Bebas Neue (Uppercase, bold, clean, tracking 0.05em).
- Body/Labels: Arial/Neuzeit Grotesk-style (Clean sans-serif).
- Slate Black (#1e2328): Logos, primary text, strong dividers.
- Bone White (#f7f5f0): Main backgrounds, layout backdrops.
- Cool Gray (#6b6b6b): Secondary text, borders, muted labels.
- Coastal Blue (#8fa5b2): Secondary actions, info highlights.
- Dusty Rose (#d4a5a5): Primary buttons, standout highlights, key markers.

ERROR-HANDLING & UNCERTAINTY:
- If input is vague (missing dates/locations/goals): Ask a short clarifying question. Do not guess.
- If input is conflicting (overlapping times): Point it out briefly and propose one clear plan.
- If task is out of scope (file management, raw editing): State this clearly and suggest the specific steps to take in the user's preferred software (from profile).

STRUCTURE FOR STRATEGY DOCUMENTS:
1. Strategic overview (1-2 sentences).
2. Assignment Plan (Objectives, shots, gear).
3. Workflow Guidance (Technical settings, time of day).
4. PJ Notes (Turnaround tips relative to timeframe).
5. Small improvement suggestion.
6. Ending: A short checklist OR a clarifying question.

Style: Concise, professional, action-oriented. Avoid long essays.`;

// Helper: verify user is authenticated
function requireAuth(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to use this feature.');
  }
  return auth.uid;
}

// ── generateWeeklyPlan ────────────────────────────────────────────────────────
export const generateWeeklyPlan = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    requireAuth(request.auth);
    const input = request.data.input as string;
    if (!input) throw new HttpsError('invalid-argument', 'input is required');

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: input,
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
      return { text: response.text || 'Communication error with Photovise core.' };
    } catch (e) {
      console.error('generateWeeklyPlan error:', e);
      throw new HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
  }
);

// ── generateAssignmentGuide ───────────────────────────────────────────────────
export const generateAssignmentGuide = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    requireAuth(request.auth);
    const input = request.data.input as string;
    if (!input) throw new HttpsError('invalid-argument', 'input is required');

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: input,
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
      return { text: response.text || 'Communication error with Photovise core.' };
    } catch (e) {
      console.error('generateAssignmentGuide error:', e);
      throw new HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
  }
);

// ── askProQuestion ────────────────────────────────────────────────────────────
export const askProQuestion = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    requireAuth(request.auth);
    const prompt = request.data.prompt as string;
    if (!prompt) throw new HttpsError('invalid-argument', 'prompt is required');

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
      return { text: response.text || 'The pro is currently silent. Please try asking again.' };
    } catch (e) {
      console.error('askProQuestion error:', e);
      throw new HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
  }
);

// ── fetchBulletinEvents ───────────────────────────────────────────────────────
export const fetchBulletinEvents = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    requireAuth(request.auth);
    const { genre, region } = request.data as { genre: string; region: string };
    if (!genre || !region) throw new HttpsError('invalid-argument', 'genre and region are required');

    const today = new Date().toISOString().split('T')[0];
    const genreContext = genre === 'All'
      ? 'all photography genres (Street, Landscape, Portrait, Architecture, Sports, Photojournalism, Fashion, Wildlife, Documentary)'
      : `${genre} photography`;
    const regionContext = region === 'All' ? 'worldwide' : `the ${region} region`;

    const prompt = `Today is ${today}. List 12 real upcoming photography competitions, grants, open calls, festivals, and residencies relevant to ${genreContext} in ${regionContext}. Only include events with deadlines after ${today} or rolling/ongoing applications. Return ONLY a valid JSON array with no markdown. Each object must match this schema exactly: {"id":"ai-1","name":"","organizer":"","type":"Competition","url":"https://example.com","location":"","deadline":"YYYY-MM-DD","genres":[""],"blurb":"","fee":"","status":"unmarked","region":"Global","priority":"high"}. Valid type values: Competition, Grant, Festival, Residency, Open Call, Event. Valid region values: Global, US, Europe, Asia, Latin America, Africa, Other. Valid priority values: high, medium, low. Use "Rolling" for deadline if the application is ongoing.`;

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const text = (response.text || '[]').replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return { items: [] };
      const items = parsed.map((item: Record<string, unknown>) => ({
        ...item,
        id: (item.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        status: 'unmarked',
      }));
      return { items };
    } catch (e) {
      console.error('fetchBulletinEvents error:', e);
      return { items: [] };
    }
  }
);
