"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchBulletinEvents = exports.fetchLocationSuggestions = exports.askProQuestion = exports.generateAssignmentGuide = exports.generateWeeklyPlan = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const genai_1 = require("@google/genai");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
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
function requireAuth(auth) {
    if (!(auth === null || auth === void 0 ? void 0 : auth.uid)) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to use this feature.');
    }
    return auth.uid;
}
// ── generateWeeklyPlan ────────────────────────────────────────────────────────
exports.generateWeeklyPlan = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    requireAuth(request.auth);
    const input = request.data.input;
    if (!input)
        throw new https_1.HttpsError('invalid-argument', 'input is required');
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey.value() });
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: input,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });
        return { text: response.text || 'Communication error with Photovise core.' };
    }
    catch (e) {
        console.error('generateWeeklyPlan error:', e);
        throw new https_1.HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
});
// ── generateAssignmentGuide ───────────────────────────────────────────────────
exports.generateAssignmentGuide = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    requireAuth(request.auth);
    const input = request.data.input;
    if (!input)
        throw new https_1.HttpsError('invalid-argument', 'input is required');
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey.value() });
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: input,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });
        return { text: response.text || 'Communication error with Photovise core.' };
    }
    catch (e) {
        console.error('generateAssignmentGuide error:', e);
        throw new https_1.HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
});
// ── askProQuestion ────────────────────────────────────────────────────────────
exports.askProQuestion = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    requireAuth(request.auth);
    const prompt = request.data.prompt;
    if (!prompt)
        throw new https_1.HttpsError('invalid-argument', 'prompt is required');
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey.value() });
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });
        return { text: response.text || 'The pro is currently silent. Please try asking again.' };
    }
    catch (e) {
        console.error('askProQuestion error:', e);
        throw new https_1.HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
});
// ── fetchLocationSuggestions ──────────────────────────────────────────────────
exports.fetchLocationSuggestions = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    var _a, _b, _c;
    requireAuth(request.auth);
    const { query, lat, lng } = request.data;
    if (!query)
        throw new https_1.HttpsError('invalid-argument', 'query is required');
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey.value() });
        const config = {
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
        const chunks = ((_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.groundingMetadata) === null || _c === void 0 ? void 0 : _c.groundingChunks) || [];
        const mapsSuggestions = chunks
            .filter(chunk => !!chunk.maps)
            .map(chunk => { var _a, _b; return ({ title: ((_a = chunk.maps) === null || _a === void 0 ? void 0 : _a.title) || '', uri: (_b = chunk.maps) === null || _b === void 0 ? void 0 : _b.uri }); })
            .filter(s => s.title.length > 0);
        if (mapsSuggestions.length > 0) {
            return { suggestions: mapsSuggestions };
        }
        const lines = (response.text || '')
            .split('\n')
            .map((l) => l.replace(/^[•\-\d.\s]+/, '').trim())
            .filter((l) => l.length > 0)
            .slice(0, 5)
            .map((title) => ({ title }));
        return { suggestions: lines };
    }
    catch (e) {
        console.error('fetchLocationSuggestions error:', e);
        return { suggestions: [] };
    }
});
// ── fetchBulletinEvents ───────────────────────────────────────────────────────
exports.fetchBulletinEvents = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    requireAuth(request.auth);
    const { genre, region } = request.data;
    if (!genre || !region)
        throw new https_1.HttpsError('invalid-argument', 'genre and region are required');
    const today = new Date().toISOString().split('T')[0];
    const genreContext = genre === 'All'
        ? 'all photography genres (Street, Landscape, Portrait, Architecture, Sports, Photojournalism, Fashion, Wildlife, Documentary)'
        : `${genre} photography`;
    const regionContext = region === 'All' ? 'worldwide' : `the ${region} region`;
    const prompt = `Today is ${today}. List 12 real upcoming photography competitions, grants, open calls, festivals, and residencies relevant to ${genreContext} in ${regionContext}. Only include events with deadlines after ${today} or rolling/ongoing applications. Return ONLY a valid JSON array with no markdown. Each object must match this schema exactly: {"id":"ai-1","name":"","organizer":"","type":"Competition","url":"https://example.com","location":"","deadline":"YYYY-MM-DD","genres":[""],"blurb":"","fee":"","status":"unmarked","region":"Global","priority":"high"}. Valid type values: Competition, Grant, Festival, Residency, Open Call, Event. Valid region values: Global, US, Europe, Asia, Latin America, Africa, Other. Valid priority values: high, medium, low. Use "Rolling" for deadline if the application is ongoing.`;
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey.value() });
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
        });
        const text = (response.text || '[]').replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed))
            return { items: [] };
        const items = parsed.map((item) => (Object.assign(Object.assign({}, item), { id: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), status: 'unmarked' })));
        return { items };
    }
    catch (e) {
        console.error('fetchBulletinEvents error:', e);
        return { items: [] };
    }
});
//# sourceMappingURL=index.js.map