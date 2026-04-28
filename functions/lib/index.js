"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredCommunityPosts = exports.ratePost = exports.validateAndCreateCommunityPost = exports.processGeminiQueue = exports.enqueueGeminiRequest = exports.fetchBulletinEvents = exports.fetchLocationSuggestions = exports.askProQuestion = exports.generateAssignmentGuide = exports.generateWeeklyPlan = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const firebase_functions_1 = require("firebase-functions");
const genai_1 = require("@google/genai");
const admin = require("firebase-admin");
// Initialise Admin SDK once
if (!admin.apps.length)
    admin.initializeApp();
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
    var _a;
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
        firebase_functions_1.logger.error('Gemini API call failed', {
            functionName: 'generateWeeklyPlan',
            uid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
            errorCode: e instanceof Error ? e.constructor.name : 'UnknownError',
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString(),
        });
        throw new https_1.HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
});
// ── generateAssignmentGuide ───────────────────────────────────────────────────
exports.generateAssignmentGuide = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    var _a;
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
        firebase_functions_1.logger.error('Gemini API call failed', {
            functionName: 'generateAssignmentGuide',
            uid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
            errorCode: e instanceof Error ? e.constructor.name : 'UnknownError',
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString(),
        });
        throw new https_1.HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
});
// ── askProQuestion ────────────────────────────────────────────────────────────
exports.askProQuestion = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    var _a;
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
        firebase_functions_1.logger.error('Gemini API call failed', {
            functionName: 'askProQuestion',
            uid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
            errorCode: e instanceof Error ? e.constructor.name : 'UnknownError',
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString(),
        });
        throw new https_1.HttpsError('internal', 'Photovise is temporarily unreachable.');
    }
});
// ── fetchLocationSuggestions ──────────────────────────────────────────────────
exports.fetchLocationSuggestions = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    var _a, _b, _c, _d;
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
        firebase_functions_1.logger.error('Gemini API call failed', {
            functionName: 'fetchLocationSuggestions',
            uid: (_d = request.auth) === null || _d === void 0 ? void 0 : _d.uid,
            errorCode: e instanceof Error ? e.constructor.name : 'UnknownError',
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString(),
        });
        return { suggestions: [] };
    }
});
// ── fetchBulletinEvents helpers ───────────────────────────────────────────────
const VALID_CFE_TYPES = new Set([
    'Competition', 'Grant', 'Fellowship', 'Residency',
    'Open Call', 'Call for Entry', 'Portfolio Review', 'Festival', 'Event',
]);
const VALID_REGIONS = new Set(['Global', 'US', 'Europe', 'Asia', 'Latin America', 'Africa', 'Other']);
const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);
function isValidBulletinItem(item) {
    if (!item || typeof item !== 'object')
        return false;
    const o = item;
    return (typeof o.name === 'string' && o.name.trim().length > 0 &&
        typeof o.url === 'string' && o.url.trim().length > 0 &&
        VALID_CFE_TYPES.has(o.type) &&
        VALID_REGIONS.has(o.region) &&
        VALID_PRIORITIES.has(o.priority));
}
// ── fetchBulletinEvents ───────────────────────────────────────────────────────
exports.fetchBulletinEvents = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    var _a, _b, _c;
    requireAuth(request.auth);
    const { genre, region, type } = request.data;
    if (!genre || !region)
        throw new https_1.HttpsError('invalid-argument', 'genre and region are required');
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
        const ai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey.value() });
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
        });
        const text = (response.text || '').replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch (_d) {
            firebase_functions_1.logger.error('Gemini response JSON parse failed', {
                functionName: 'fetchBulletinEvents',
                uid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
                errorCode: 'JsonParseError',
                rawResponse: text.slice(0, 500),
                timestamp: new Date().toISOString(),
            });
            return { items: [] };
        }
        if (!Array.isArray(parsed)) {
            firebase_functions_1.logger.error('Gemini response is not an array', {
                functionName: 'fetchBulletinEvents',
                uid: (_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid,
                errorCode: 'InvalidResponseShape',
                rawResponse: text.slice(0, 500),
                timestamp: new Date().toISOString(),
            });
            return { items: [] };
        }
        const items = parsed
            .filter((item) => {
            var _a;
            const valid = isValidBulletinItem(item);
            if (!valid)
                firebase_functions_1.logger.warn('Dropping invalid bulletin item', {
                    functionName: 'fetchBulletinEvents',
                    uid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
                    invalidItem: JSON.stringify(item).slice(0, 200),
                    timestamp: new Date().toISOString(),
                });
            return valid;
        })
            .map((item) => (Object.assign(Object.assign({}, item), { id: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), status: 'unmarked' })));
        return { items };
    }
    catch (e) {
        firebase_functions_1.logger.error('Gemini API call failed', {
            functionName: 'fetchBulletinEvents',
            uid: (_c = request.auth) === null || _c === void 0 ? void 0 : _c.uid,
            errorCode: e instanceof Error ? e.constructor.name : 'UnknownError',
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString(),
        });
        return { items: [] };
    }
});
// ── runGeminiForFunction (internal) ──────────────────────────────────────────
// Shared Gemini call logic used by processGeminiQueue.
// Must only be called from within a Cloud Function that declares geminiApiKey.
async function runGeminiForFunction(functionName, payload) {
    var _a, _b, _c, _d, _e;
    const ai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey.value() });
    // ── generateWeeklyPlan / generateAssignmentGuide ──────────────────────────
    if (functionName === 'generateWeeklyPlan' || functionName === 'generateAssignmentGuide') {
        const input = String((_a = payload.input) !== null && _a !== void 0 ? _a : '');
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: input,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });
        return { text: response.text || 'Communication error with Photovise core.' };
    }
    // ── askProQuestion ────────────────────────────────────────────────────────
    if (functionName === 'askProQuestion') {
        const prompt = String((_b = payload.prompt) !== null && _b !== void 0 ? _b : '');
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });
        return { text: response.text || 'The pro is currently silent. Please try asking again.' };
    }
    // ── fetchBulletinEvents ───────────────────────────────────────────────────
    if (functionName === 'fetchBulletinEvents') {
        const genre = String((_c = payload.genre) !== null && _c !== void 0 ? _c : 'All');
        const region = String((_d = payload.region) !== null && _d !== void 0 ? _d : 'All');
        const type = String((_e = payload.type) !== null && _e !== void 0 ? _e : 'All');
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
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
        });
        const text = (response.text || '').replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch (_f) {
            firebase_functions_1.logger.error('Gemini response JSON parse failed', {
                functionName: 'runGeminiForFunction/fetchBulletinEvents',
                errorCode: 'JsonParseError',
                rawResponse: text.slice(0, 500),
                timestamp: new Date().toISOString(),
            });
            return { items: [] };
        }
        if (!Array.isArray(parsed)) {
            firebase_functions_1.logger.error('Gemini response is not an array', {
                functionName: 'runGeminiForFunction/fetchBulletinEvents',
                errorCode: 'InvalidResponseShape',
                rawResponse: text.slice(0, 500),
                timestamp: new Date().toISOString(),
            });
            return { items: [] };
        }
        const items = parsed
            .filter((item) => {
            const valid = isValidBulletinItem(item);
            if (!valid)
                firebase_functions_1.logger.warn('Dropping invalid bulletin item', {
                    functionName: 'runGeminiForFunction/fetchBulletinEvents',
                    invalidItem: JSON.stringify(item).slice(0, 200),
                    timestamp: new Date().toISOString(),
                });
            return valid;
        })
            .map((item) => (Object.assign(Object.assign({}, item), { id: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), status: 'unmarked' })));
        return { items };
    }
    throw new https_1.HttpsError('invalid-argument', `Unknown function name: ${functionName}`);
}
// ── enqueueGeminiRequest ──────────────────────────────────────────────────────
// Accepts a functionName + payload from the client, writes a pending job to
// geminiQueue, and returns the jobId immediately. The queue processor runs
// every minute and processes up to 30 jobs — enforcing the 30 req/min limit.
const QUEUE_VALID_FUNCTIONS = new Set([
    'generateWeeklyPlan',
    'generateAssignmentGuide',
    'askProQuestion',
    'fetchBulletinEvents',
]);
exports.enqueueGeminiRequest = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request.auth);
    const { functionName, payload } = request.data;
    if (!QUEUE_VALID_FUNCTIONS.has(functionName)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid function name: ${functionName}`);
    }
    const db = admin.firestore();
    // Per-user guard: max 2 pending jobs at a time to prevent flooding
    const userSnap = await db.collection('geminiQueue').where('userId', '==', uid).get();
    const userPending = userSnap.docs.filter(d => d.data().status === 'pending').length;
    if (userPending >= 2) {
        throw new https_1.HttpsError('resource-exhausted', 'You have too many pending requests. Please wait for your current requests to complete.');
    }
    // Count jobs currently ahead in line (pending + processing) for position display
    const queueSnap = await db.collection('geminiQueue')
        .where('status', 'in', ['pending', 'processing'])
        .limit(50)
        .get();
    const queuedBefore = queueSnap.size;
    const jobRef = db.collection('geminiQueue').doc();
    await jobRef.set({
        userId: uid,
        functionName,
        payload,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        queuedBefore, // approximate position shown to client
    });
    firebase_functions_1.logger.info('Gemini job enqueued', {
        functionName: 'enqueueGeminiRequest',
        uid,
        jobId: jobRef.id,
        geminiTarget: functionName,
        queuePosition: queuedBefore + 1,
        timestamp: new Date().toISOString(),
    });
    return { jobId: jobRef.id };
});
// ── processGeminiQueue ────────────────────────────────────────────────────────
// Runs every minute via Cloud Scheduler.
// Processes up to 30 pending jobs per invocation — matching the 30 req/min
// Gemini quota. Uses a Firestore transaction to claim each job atomically so
// concurrent scheduler invocations cannot double-process the same job.
exports.processGeminiQueue = (0, scheduler_1.onSchedule)({ schedule: '* * * * *', timeZone: 'UTC', secrets: [geminiApiKey] }, async () => {
    var _a, _b, _c;
    const db = admin.firestore();
    const RATE_LIMIT = 30;
    const STUCK_MS = 5 * 60000; // recover jobs stuck in 'processing' > 5 min
    // ── Recover stuck jobs ────────────────────────────────────────────────────
    const processingSnap = await db.collection('geminiQueue')
        .where('status', '==', 'processing')
        .get();
    for (const stuckDoc of processingSnap.docs) {
        const processedAt = (_c = (_b = (_a = stuckDoc.data().processedAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        if (Date.now() - processedAt > STUCK_MS) {
            firebase_functions_1.logger.warn('Recovering stuck Gemini queue job', {
                functionName: 'processGeminiQueue',
                jobId: stuckDoc.id,
                stuckForMs: Date.now() - processedAt,
                timestamp: new Date().toISOString(),
            });
            await stuckDoc.ref.update({ status: 'pending' });
        }
    }
    // ── Fetch and sort pending jobs in memory (avoids composite index) ────────
    const pendingSnap = await db.collection('geminiQueue')
        .where('status', '==', 'pending')
        .limit(RATE_LIMIT + 20) // fetch extra so in-memory sort is accurate
        .get();
    if (pendingSnap.empty) {
        firebase_functions_1.logger.info('No pending Gemini jobs', {
            functionName: 'processGeminiQueue',
            timestamp: new Date().toISOString(),
        });
    }
    else {
        const sorted = pendingSnap.docs
            .slice()
            .sort((a, b) => {
            var _a, _b, _c, _d, _e, _f;
            return ((_c = (_b = (_a = a.data().createdAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0) -
                ((_f = (_e = (_d = b.data().createdAt) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0);
        })
            .slice(0, RATE_LIMIT);
        firebase_functions_1.logger.info('Processing Gemini queue batch', {
            functionName: 'processGeminiQueue',
            jobCount: sorted.length,
            timestamp: new Date().toISOString(),
        });
        for (const jobDoc of sorted) {
            // Atomic claim — prevents double-processing if scheduler fires twice
            const claimed = await db.runTransaction(async (tx) => {
                var _a;
                const fresh = await tx.get(jobDoc.ref);
                if (((_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status) !== 'pending')
                    return false;
                tx.update(jobDoc.ref, {
                    status: 'processing',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return true;
            });
            if (!claimed)
                continue;
            const job = jobDoc.data();
            try {
                const result = await runGeminiForFunction(job.functionName, job.payload);
                await jobDoc.ref.update({
                    status: 'complete',
                    result,
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                firebase_functions_1.logger.info('Gemini job completed', {
                    functionName: 'processGeminiQueue',
                    jobId: jobDoc.id,
                    geminiTarget: job.functionName,
                    uid: job.userId,
                    timestamp: new Date().toISOString(),
                });
            }
            catch (e) {
                firebase_functions_1.logger.error('Gemini job failed', {
                    functionName: 'processGeminiQueue',
                    jobId: jobDoc.id,
                    geminiTarget: job.functionName,
                    uid: job.userId,
                    errorCode: e instanceof Error ? e.constructor.name : 'UnknownError',
                    errorMessage: e instanceof Error ? e.message : String(e),
                    timestamp: new Date().toISOString(),
                });
                await jobDoc.ref.update({
                    status: 'failed',
                    error: e instanceof Error ? e.message : 'Unknown error',
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        }
    }
    // ── Clean up completed/failed jobs older than 1 hour ─────────────────────
    // Two separate queries to avoid a composite index on status+completedAt.
    const cutoffMs = Date.now() - 60 * 60000;
    const [completeSnap, failedSnap] = await Promise.all([
        db.collection('geminiQueue').where('status', '==', 'complete').limit(100).get(),
        db.collection('geminiQueue').where('status', '==', 'failed').limit(100).get(),
    ]);
    const toDelete = [...completeSnap.docs, ...failedSnap.docs]
        .filter(d => { var _a, _b, _c; return ((_c = (_b = (_a = d.data().completedAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0) < cutoffMs; });
    if (toDelete.length > 0) {
        const batch = db.batch();
        toDelete.forEach(d => batch.delete(d.ref));
        await batch.commit();
        firebase_functions_1.logger.info('Cleaned up old Gemini queue jobs', {
            functionName: 'processGeminiQueue',
            deletedCount: toDelete.length,
            timestamp: new Date().toISOString(),
        });
    }
});
// ── validateAndCreateCommunityPost ───────────────────────────────────────────
// Enforces a 3-active-post limit per user, then creates the Firestore document.
// Images must be uploaded to Storage by the client first; their download URLs are
// passed in as `imageUrls`.
exports.validateAndCreateCommunityPost = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request.auth);
    const { displayName, caption, assignmentTag, imageUrls, cameraBody, lens, settings, expiresAtMs } = request.data;
    if (!caption || !assignmentTag || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'caption, assignmentTag, and imageUrls are required.');
    }
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    // Pre-allocate a document ID so we can reference it inside the transaction
    // and return it to the caller without a second round-trip.
    const postRef = db.collection('communityPosts').doc();
    // ── Atomic transaction ───────────────────────────────────────────────────
    // Reads users/{uid}.activePostCount, enforces the 3-post cap, creates the
    // community post document, and increments the counter — all in one commit.
    // If any step fails the entire transaction is rolled back automatically.
    let activeCount;
    try {
        activeCount = await db.runTransaction(async (tx) => {
            var _a, _b;
            const userSnap = await tx.get(userRef);
            // Treat a missing field (or a brand-new user doc) as 0.
            const count = (_b = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.activePostCount) !== null && _b !== void 0 ? _b : 0;
            if (count >= 3) {
                throw new https_1.HttpsError('resource-exhausted', 'Post limit reached. Remove a post to continue.');
            }
            // Write the new post document.
            tx.set(postRef, Object.assign(Object.assign(Object.assign(Object.assign({ userId: uid, displayName: displayName !== null && displayName !== void 0 ? displayName : 'Photographer', caption: String(caption).trim(), assignmentTag,
                imageUrls }, (cameraBody && { cameraBody })), (lens && { lens })), (settings && { settings })), { createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromMillis(Number(expiresAtMs)), status: 'active', ratingSum: 0, ratingCount: 0 }));
            // Increment the counter on the user document.
            // merge: true handles the case where activePostCount doesn't exist yet
            // (FieldValue.increment creates the field and sets it to 1).
            tx.set(userRef, { activePostCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
            return count; // value before increment — used for logging
        });
    }
    catch (e) {
        // Re-throw HttpsErrors (e.g. limit reached); wrap everything else.
        if (e instanceof https_1.HttpsError)
            throw e;
        firebase_functions_1.logger.error('Community post transaction failed', {
            functionName: 'validateAndCreateCommunityPost',
            uid,
            errorCode: e instanceof Error ? e.constructor.name : 'UnknownError',
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString(),
        });
        throw new https_1.HttpsError('internal', 'Failed to create post. Please try again.');
    }
    firebase_functions_1.logger.info('Community post created', {
        functionName: 'validateAndCreateCommunityPost',
        uid,
        postId: postRef.id,
        activeCountBefore: activeCount,
        activeCountAfter: activeCount + 1,
        timestamp: new Date().toISOString(),
    });
    return { id: postRef.id };
});
// ── ratePost ──────────────────────────────────────────────────────────────────
// Adds or updates a 1-5 star rating for a community post.
// Uses a Firestore transaction to keep ratingSum / ratingCount in sync on the post doc.
// Ratings are stored in the subcollection: communityPosts/{postId}/ratings/{uid}
exports.ratePost = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request.auth);
    const { postId, rating } = request.data;
    if (!postId)
        throw new https_1.HttpsError('invalid-argument', 'postId is required.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new https_1.HttpsError('invalid-argument', 'rating must be an integer between 1 and 5.');
    }
    const db = admin.firestore();
    const postRef = db.collection('communityPosts').doc(postId);
    const ratingRef = postRef.collection('ratings').doc(uid);
    const { ratingSum, ratingCount } = await db.runTransaction(async (tx) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const [postSnap, ratingSnap] = await Promise.all([tx.get(postRef), tx.get(ratingRef)]);
        if (!postSnap.exists)
            throw new https_1.HttpsError('not-found', 'Post not found.');
        if (((_a = postSnap.data()) === null || _a === void 0 ? void 0 : _a.status) !== 'active') {
            throw new https_1.HttpsError('failed-precondition', 'Post is no longer active.');
        }
        const oldRating = ratingSnap.exists ? ((_c = (_b = ratingSnap.data()) === null || _b === void 0 ? void 0 : _b.rating) !== null && _c !== void 0 ? _c : 0) : 0;
        const isNew = !ratingSnap.exists;
        const delta = isNew ? rating : rating - oldRating;
        tx.update(postRef, Object.assign({ ratingSum: admin.firestore.FieldValue.increment(delta) }, (isNew && { ratingCount: admin.firestore.FieldValue.increment(1) })));
        tx.set(ratingRef, {
            rating,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Compute optimistic return values from snapshot + delta
        const currentSum = (_e = (_d = postSnap.data()) === null || _d === void 0 ? void 0 : _d.ratingSum) !== null && _e !== void 0 ? _e : 0;
        const currentCount = (_g = (_f = postSnap.data()) === null || _f === void 0 ? void 0 : _f.ratingCount) !== null && _g !== void 0 ? _g : 0;
        return {
            ratingSum: currentSum + delta,
            ratingCount: isNew ? currentCount + 1 : currentCount,
        };
    });
    firebase_functions_1.logger.info('Post rated', {
        functionName: 'ratePost',
        uid,
        postId,
        rating,
        ratingSum,
        ratingCount,
        timestamp: new Date().toISOString(),
    });
    return { ratingSum, ratingCount };
});
// ── cleanupExpiredCommunityPosts ──────────────────────────────────────────────
// Runs every 24 hours. Deletes Firestore docs and Storage files for posts
// whose expiresAt timestamp has passed.
exports.cleanupExpiredCommunityPosts = (0, scheduler_1.onSchedule)({ schedule: '0 3 * * *', timeZone: 'UTC' }, // 03:00 UTC daily
async () => {
    var _a, _b;
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = admin.firestore.Timestamp.now();
    // ── Collect posts to delete ──────────────────────────────────────────────
    // Two independent queries — no composite index needed:
    //   1. Posts whose expiry timestamp has passed (any status).
    //   2. Posts explicitly removed by the owner (any expiry).
    // We deduplicate by document ID so a removed+expired post is only counted once.
    const [expiredSnap, removedSnap] = await Promise.all([
        db.collection('communityPosts').where('expiresAt', '<=', now).get(),
        db.collection('communityPosts').where('status', '==', 'removed').get(),
    ]);
    // Deduplicate: use a Set to track IDs we've already included.
    const seen = new Set();
    const allDocs = [...expiredSnap.docs, ...removedSnap.docs].filter(doc => {
        if (seen.has(doc.id))
            return false;
        seen.add(doc.id);
        return true;
    });
    if (allDocs.length === 0) {
        firebase_functions_1.logger.info('No expired community posts found', {
            functionName: 'cleanupExpiredCommunityPosts',
            timestamp: new Date().toISOString(),
        });
        return;
    }
    // ── Tally per-user decrements ────────────────────────────────────────────
    // Multiple posts from the same user collapse into one batch.set() call,
    // so we accumulate the total delta before building the batch.
    const decrementByUid = new Map();
    for (const doc of allDocs) {
        const userId = doc.data().userId;
        if (userId) {
            decrementByUid.set(userId, ((_a = decrementByUid.get(userId)) !== null && _a !== void 0 ? _a : 0) + 1);
        }
    }
    let deletedPosts = 0;
    let deletedFiles = 0;
    const batch = db.batch();
    // ── Delete Storage files and queue Firestore doc deletes ─────────────────
    for (const doc of allDocs) {
        const data = doc.data();
        const imageUrls = (_b = data.imageUrls) !== null && _b !== void 0 ? _b : [];
        // Delete each Storage file derived from its download URL
        for (const url of imageUrls) {
            try {
                // URL format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?...
                const match = url.match(/\/o\/([^?]+)/);
                if (match) {
                    const filePath = decodeURIComponent(match[1]);
                    await bucket.file(filePath).delete();
                    deletedFiles++;
                }
            }
            catch (err) {
                // Log but don't abort — file may already be gone
                firebase_functions_1.logger.warn('Failed to delete Storage file for expired post', {
                    functionName: 'cleanupExpiredCommunityPosts',
                    postId: doc.id,
                    storageUrl: url,
                    errorCode: err instanceof Error ? err.constructor.name : 'UnknownError',
                    errorMessage: err instanceof Error ? err.message : String(err),
                    timestamp: new Date().toISOString(),
                });
            }
        }
        batch.delete(doc.ref);
        deletedPosts++;
    }
    // ── Decrement activePostCount for every affected user ────────────────────
    // merge: true handles the edge case where the user doc was deleted;
    // FieldValue.increment on a missing field creates it at -delta (harmless,
    // as the CF re-initialises on next create via merge: true).
    for (const [userId, delta] of decrementByUid) {
        const userRef = db.collection('users').doc(userId);
        batch.set(userRef, { activePostCount: admin.firestore.FieldValue.increment(-delta) }, { merge: true });
    }
    await batch.commit();
    firebase_functions_1.logger.info('Expired community posts cleaned up', {
        functionName: 'cleanupExpiredCommunityPosts',
        deletedPosts,
        deletedFiles,
        affectedUsers: decrementByUid.size,
        timestamp: new Date().toISOString(),
    });
});
//# sourceMappingURL=index.js.map