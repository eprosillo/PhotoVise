import { GoogleGenAI } from "@google/genai";
import { CfeBulletinItem } from '../types';

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

function handleError(error: unknown): string {
  console.error("Photovise AI Error:", error);
  const errStr = error instanceof Error ? error.message : JSON.stringify(error);
  if (errStr.includes("429") || /rate.?limit|overloaded|exhausted/i.test(errStr)) {
    return "Photovise is currently at capacity (API Quota Exhausted). Please wait a minute before trying again.";
  }
  return "Photovise is temporarily unreachable. Please check your network connection.";
}

export async function generateWeeklyPlan(input: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: input,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
    return response.text || "Communication error with Photovise core.";
  } catch (error) {
    return handleError(error);
  }
}

export async function generateAssignmentGuide(assignmentDescription: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: assignmentDescription,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
    return response.text || "Communication error with Photovise core.";
  } catch (error) {
    return handleError(error);
  }
}

export async function askProQuestion(prompt: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
    return response.text || "The pro is currently silent. Please try asking again.";
  } catch (error) {
    return handleError(error);
  }
}

export async function fetchBulletinEvents(genre: string, region: string): Promise<CfeBulletinItem[]> {
  const today = new Date().toISOString().split('T')[0];
  const genreContext = genre === 'All'
    ? 'all photography genres (Street, Landscape, Portrait, Architecture, Sports, Photojournalism, Fashion, Wildlife, Documentary)'
    : `${genre} photography`;
  const regionContext = region === 'All' ? 'worldwide' : `the ${region} region`;

  const prompt = `Today is ${today}. List 12 real upcoming photography competitions, grants, open calls, festivals, and residencies relevant to ${genreContext} in ${regionContext}. Only include events with deadlines after ${today} or rolling/ongoing applications. Return ONLY a valid JSON array with no markdown. Each object must match this schema exactly: {"id":"ai-1","name":"","organizer":"","type":"Competition","url":"https://example.com","location":"","deadline":"YYYY-MM-DD","genres":[""],"blurb":"","fee":"","status":"unmarked","region":"Global","priority":"high"}. Valid type values: Competition, Grant, Festival, Residency, Open Call, Event. Valid region values: Global, US, Europe, Asia, Latin America, Africa, Other. Valid priority values: high, medium, low. Use "Rolling" for deadline if the application is ongoing.`;

  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const text = (response.text || '[]').replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(text) as CfeBulletinItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      id: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      status: 'unmarked' as const,
    }));
  } catch (error) {
    console.error('Photovise: Failed to fetch bulletin events', error);
    return [];
  }
}
