import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

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

function requireAuth(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to use this feature.');
  }
  return auth.uid;
}

function getClient() {
  return new Anthropic({ apiKey: anthropicApiKey.value() });
}

async function callClaude(userContent: string, systemOverride?: string): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemOverride ?? SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: userContent }],
  });
  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

// ── generateWeeklyPlan ────────────────────────────────────────────────────────
export const generateWeeklyPlan = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    requireAuth(request.auth);
    const input = request.data.input as string;
    if (!input) throw new HttpsError('invalid-argument', 'input is required');
    try {
      return { text: await callClaude(input) };
    } catch (e) {
      logger.error('Claude API call failed', { functionName: 'generateWeeklyPlan', error: String(e) });
      throw new HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
  }
);

// ── generateAssignmentGuide ───────────────────────────────────────────────────
export const generateAssignmentGuide = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    requireAuth(request.auth);
    const input = request.data.input as string;
    if (!input) throw new HttpsError('invalid-argument', 'input is required');
    try {
      return { text: await callClaude(input) };
    } catch (e) {
      logger.error('Claude API call failed', { functionName: 'generateAssignmentGuide', error: String(e) });
      throw new HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
  }
);

// ── askProQuestion ────────────────────────────────────────────────────────────
export const askProQuestion = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    requireAuth(request.auth);
    const prompt = request.data.prompt as string;
    if (!prompt) throw new HttpsError('invalid-argument', 'prompt is required');
    try {
      return { text: await callClaude(prompt) };
    } catch (e) {
      logger.error('Claude API call failed', { functionName: 'askProQuestion', error: String(e) });
      throw new HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
  }
);

// ── fetchLocationSuggestions ──────────────────────────────────────────────────
export const fetchLocationSuggestions = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    requireAuth(request.auth);
    const { query, lat, lng } = request.data as { query: string; lat?: number; lng?: number };
    if (!query) throw new HttpsError('invalid-argument', 'query is required');

    const locationContext = (lat !== undefined && lng !== undefined)
      ? ` The user is near coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}.`
      : '';

    const prompt = `Suggest 5 specific real-world photography locations matching: "${query}".${locationContext}
Return ONLY a JSON array, no markdown. Each item: {"title":"Location Name, City, Country","uri":"https://www.google.com/maps/search/Location+Name+City+Country"}
Replace spaces in the uri search query with +. Return only the JSON array.`;

    try {
      const text = await callClaude(prompt, 'You are a photography location assistant. Return only valid JSON arrays, no explanation.');
      const clean = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) return { suggestions: [] };
      return {
        suggestions: parsed
          .filter((s: unknown) => s && typeof s === 'object' && typeof (s as Record<string,unknown>).title === 'string')
          .slice(0, 5)
          .map((s: Record<string, unknown>) => ({ title: String(s.title), uri: s.uri ? String(s.uri) : undefined })),
      };
    } catch (e) {
      logger.error('Claude location suggestions failed', { error: String(e) });
      return { suggestions: [] };
    }
  }
);

// ── fetchBulletinEvents ───────────────────────────────────────────────────────
const VALID_CFE_TYPES = new Set([
  'Competition', 'Grant', 'Fellowship', 'Residency',
  'Open Call', 'Call for Entry', 'Portfolio Review', 'Festival', 'Event',
]);
const VALID_REGIONS   = new Set(['Global', 'US', 'Europe', 'Asia', 'Latin America', 'Africa', 'Other']);
const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);

function isValidBulletinItem(item: unknown): item is Record<string, unknown> {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  return (
    typeof o.name     === 'string' && o.name.trim().length > 0 &&
    typeof o.url      === 'string' && o.url.trim().length  > 0 &&
    VALID_CFE_TYPES.has(o.type     as string) &&
    VALID_REGIONS.has(o.region     as string) &&
    VALID_PRIORITIES.has(o.priority as string)
  );
}

export const fetchBulletinEvents = onCall(
  { secrets: [anthropicApiKey] },
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
      : type === 'Competition'      ? 'photography competitions and contests'
      : type === 'Grant'            ? 'photography grants and funding opportunities'
      : type === 'Fellowship'       ? 'photography fellowships and artist-in-residence programs'
      : type === 'Residency'        ? 'photography residencies'
      : type === 'Open Call'        ? 'open calls for photographers'
      : type === 'Call for Entry'   ? 'calls for entry and submission opportunities'
      : type === 'Portfolio Review' ? 'portfolio review events and programs'
      : type === 'Festival'         ? 'photography festivals and exhibitions'
      : 'photography events and opportunities';

    const prompt = `Today is ${today}. List 12 real upcoming ${typeContext} relevant to ${genreContext} in ${regionContext}. Only include opportunities with deadlines after ${today} or rolling/ongoing applications. Return ONLY a valid JSON array with no markdown. Each object must match this schema exactly: {"id":"ai-1","name":"","organizer":"","type":"Competition","url":"https://example.com","location":"","deadline":"YYYY-MM-DD","genres":[""],"blurb":"","fee":"","status":"unmarked","region":"Global","priority":"high"}. Valid type values: Competition, Grant, Fellowship, Residency, Open Call, Call for Entry, Portfolio Review, Festival, Event. Valid region values: Global, US, Europe, Asia, Latin America, Africa, Other. Valid priority values: high, medium, low. Use "Rolling" for deadline if the application is ongoing.`;

    try {
      const text = await callClaude(prompt, 'You are a photography opportunities assistant. Return only valid JSON arrays, no explanation or markdown.');
      const clean = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(clean);
      } catch {
        logger.error('Claude response JSON parse failed', { functionName: 'fetchBulletinEvents', raw: clean.slice(0, 500) });
        return { items: [] };
      }

      if (!Array.isArray(parsed)) return { items: [] };

      const items = (parsed as unknown[])
        .filter((item) => {
          const valid = isValidBulletinItem(item);
          if (!valid) logger.warn('Dropping invalid bulletin item', { item: JSON.stringify(item).slice(0, 200) });
          return valid;
        })
        .map((item) => ({
          ...(item as Record<string, unknown>),
          id: ((item as Record<string,unknown>).name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          status: 'unmarked',
        }));

      return { items };
    } catch (e) {
      logger.error('Claude API call failed', { functionName: 'fetchBulletinEvents', error: String(e) });
      return { items: [] };
    }
  }
);

// ── parseAssignment ───────────────────────────────────────────────────────────
export const parseAssignment = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 60 },
  async (request) => {
    requireAuth(request.auth);
    const { text } = request.data as { text: string };
    if (!text?.trim()) throw new HttpsError('invalid-argument', 'text is required');

    const today = new Date().toISOString().split('T')[0];
    const prompt = `Today is ${today}. A photographer pasted the following assignment description. Extract the relevant fields and return ONLY a valid JSON object — no markdown, no explanation.

Assignment text:
"""
${text.trim()}
"""

Return this exact JSON shape (use null for any field you cannot determine):
{
  "title": "short assignment title",
  "category": "Personal" | "Professional" | "School" | null,
  "priority": "high" | "medium" | "low" | null,
  "dueDate": "YYYY-MM-DD" | null,
  "genre": "Street" | "Sports" | "Photojournalism" | "Portrait" | "Wedding" | "Event" | "Landscape" | "Architecture" | "Documentary" | "Commercial" | "Editorial" | "Fashion" | "Product" | "Food" | "Still Life" | "Wildlife" | "Macro" | "Astro" | "Travel" | "Other" | null,
  "location": "city or place name" | null,
  "brief": "the full assignment requirements, cleaned up",
  "notes": "any extra context or constraints not covered by other fields" | null
}`;

    try {
      const raw = await callClaude(prompt, 'You are a structured data extractor. Return only valid JSON, no markdown or explanation.');
      const clean = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);
      return { assignment: parsed };
    } catch (e) {
      logger.error('parseAssignment failed', { error: String(e) });
      throw new HttpsError('internal', 'Could not parse the assignment. Please fill in the fields manually.');
    }
  }
);

// ── getDailyInspiration ───────────────────────────────────────────────────────
export const getDailyInspiration = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 60 },
  async (request) => {
    requireAuth(request.auth);
    const { genre, date } = request.data as { genre?: string; date: string };

    const genreCtx = genre && genre !== 'Other'
      ? ` who specialises in ${genre} photography`
      : '';

    const prompt = `Today is ${date}. Generate a daily photography inspiration brief for a photographer${genreCtx}.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "photographer": {
    "name": "Full Name",
    "era": "decade range or 'Contemporary'",
    "style": "one-line style description",
    "why": "2–3 sentences on why to study them today and what to look for",
    "find": "where to find their work (e.g. a book title, museum, or website)"
  },
  "concept": {
    "title": "Concept Name",
    "description": "2–3 sentences explaining the concept and one concrete way to apply it today"
  },
  "read": {
    "title": "Title",
    "author": "Author or Creator",
    "type": "book or article or video or podcast",
    "description": "1–2 sentences on why it's worth reading or watching"
  },
  "follow": {
    "handle": "@handle",
    "platform": "Instagram or YouTube or Substack or Website",
    "name": "Full Name",
    "why": "1–2 sentences on what makes their work worth following"
  }
}`;

    try {
      const raw = await callClaude(prompt, 'You are a photography curator and educator. Return only valid JSON, no markdown or explanation. Recommend real people and real works only.');
      const clean = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);
      return { inspiration: parsed };
    } catch (e) {
      logger.error('getDailyInspiration failed', { error: String(e) });
      throw new HttpsError('internal', 'Could not generate daily inspiration.');
    }
  }
);

// ── suggestScoutLocations ─────────────────────────────────────────────────────
export interface ScoutLocationSuggestion {
  name: string; area: string; mapLink: string; tags: string[];
  bestTime: string; lightingNotes: string; accessNotes: string;
  safetyNotes: string; parkingNotes: string; shotIdeas: string; backupSpot: string;
}

export const suggestScoutLocations = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    requireAuth(request.auth);
    const { sessionContext } = request.data as { sessionContext: string };
    if (!sessionContext) throw new HttpsError('invalid-argument', 'sessionContext is required');

    const prompt = `Based on this photography session context: "${sessionContext}"

Suggest 3 specific real-world shooting locations. Return ONLY a JSON array, no markdown.
Each item: {"name":"","area":"City, Country","mapLink":"https://www.google.com/maps/search/Location+Name","tags":[""],"bestTime":"","lightingNotes":"","accessNotes":"","safetyNotes":"","parkingNotes":"","shotIdeas":"","backupSpot":""}`;

    try {
      const text = await callClaude(prompt, 'You are a photography location scouting assistant. Return only valid JSON arrays.');
      const clean = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) return { locations: [] };
      return { locations: parsed as ScoutLocationSuggestion[] };
    } catch (e) {
      logger.error('Claude scout locations failed', { error: String(e) });
      throw new HttpsError('internal', 'Location suggestions temporarily unavailable.');
    }
  }
);
