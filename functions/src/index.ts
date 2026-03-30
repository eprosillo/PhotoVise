import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenAI } from '@google/genai';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `You are Photovise, a design-aware personal workflow assistant for a professional photographer.
Always refer to the user's PHOTOGRAPHER PROFILE for their specific software workflow (e.g. Lightroom, Capture One, Photoshop, CamRanger), hardware locker, and artistic goals. Avoid assuming a standard Capture One + Photoshop workflow if their profile states otherwise.

OUTPUT FORMAT:
- Use plain text and markdown only. Never use HTML tags, inline styles, or span elements.
- Use ** for bold, * for italic, and plain hyphens for bullet points.

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

// ── fetchLocationSuggestions ──────────────────────────────────────────────────
export const fetchLocationSuggestions = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    requireAuth(request.auth);
    const { query, lat, lng } = request.data as { query: string; lat?: number; lng?: number };
    if (!query) throw new HttpsError('invalid-argument', 'query is required');

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });

      const config: Record<string, unknown> = {
        tools: [{ googleMaps: {} }],
      };
      if (lat !== undefined && lng !== undefined) {
        config.toolConfig = { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } };
      }

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Provide 5 specific real-world place or address suggestions that match: "${query}". Return only the names of the places.`,
        config,
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const mapsSuggestions = chunks
        .filter(chunk => !!chunk.maps)
        .map(chunk => ({ title: chunk.maps?.title || '', uri: chunk.maps?.uri }))
        .filter(s => s.title.length > 0);

      if (mapsSuggestions.length > 0) {
        return { suggestions: mapsSuggestions };
      }

      const lines = (response.text || '')
        .split('\n')
        .map((l: string) => l.replace(/^[•\-\d.\s]+/, '').trim())
        .filter((l: string) => l.length > 0)
        .slice(0, 5)
        .map((title: string) => ({ title }));

      return { suggestions: lines };
    } catch (e) {
      console.error('fetchLocationSuggestions error:', e);
      return { suggestions: [] };
    }
  }
);

// ── fetchBulletinEvents ───────────────────────────────────────────────────────
export const fetchBulletinEvents = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    requireAuth(request.auth);
    const { genre, region, type } = request.data as { genre: string; region: string; type?: string };
    if (!genre || !region) throw new HttpsError('invalid-argument', 'genre and region are required');

    const today = new Date().toISOString().split('T')[0];
    const genreContext = genre === 'All'
      ? 'all photography genres (Street, Landscape, Portrait, Architecture, Sports, Photojournalism, Fashion, Wildlife, Documentary)'
      : `${genre} photography`;
    const regionContext = region === 'All' ? 'worldwide' : `the ${region} region`;
    const typeContext = (!type || type === 'All')
      ? 'competitions, grants, fellowships, residencies, open calls, calls for entry, portfolio reviews, festivals, and events'
      : type === 'Competition' ? 'photography competitions and contests'
      : type === 'Grant' ? 'photography grants and funding opportunities'
      : type === 'Fellowship' ? 'photography fellowships and artist-in-residence programs'
      : type === 'Residency' ? 'photography residencies'
      : type === 'Open Call' ? 'open calls for photographers'
      : type === 'Call for Entry' ? 'calls for entry and submission opportunities'
      : type === 'Portfolio Review' ? 'portfolio review events and programs'
      : type === 'Festival' ? 'photography festivals and exhibitions'
      : 'photography events and opportunities';

    const prompt = `Today is ${today}. List 12 real upcoming ${typeContext} relevant to ${genreContext} in ${regionContext}. Only include opportunities with deadlines after ${today} or rolling/ongoing applications. Return ONLY a valid JSON array with no markdown. Each object must match this schema exactly: {"id":"ai-1","name":"","organizer":"","type":"Competition","url":"https://example.com","location":"","deadline":"YYYY-MM-DD","genres":[""],"blurb":"","fee":"","status":"unmarked","region":"Global","priority":"high"}. Valid type values: Competition, Grant, Fellowship, Residency, Open Call, Call for Entry, Portfolio Review, Festival, Event. Valid region values: Global, US, Europe, Asia, Latin America, Africa, Other. Valid priority values: high, medium, low. Use "Rolling" for deadline if the application is ongoing.`;

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
