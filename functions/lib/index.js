"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredCommunityPosts = exports.ratePost = exports.validateAndCreateCommunityPost = exports.fetchBulletinEvents = exports.fetchLocationSuggestions = exports.askProQuestion = exports.generateAssignmentGuide = exports.generateWeeklyPlan = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
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
    const now = Date.now();
    // Query by userId only (no composite index needed), filter active + non-expired in code
    const snap = await db.collection('communityPosts').where('userId', '==', uid).get();
    const activeCount = snap.docs.filter(d => {
        var _a, _b, _c;
        const data = d.data();
        const expires = (_c = (_b = (_a = data.expiresAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        return data.status === 'active' && expires > now;
    }).length;
    if (activeCount >= 3) {
        throw new https_1.HttpsError('resource-exhausted', 'Post limit reached. Remove a post to continue.');
    }
    const docRef = await db.collection('communityPosts').add(Object.assign(Object.assign(Object.assign(Object.assign({ userId: uid, displayName: displayName !== null && displayName !== void 0 ? displayName : 'Photographer', caption: String(caption).trim(), assignmentTag,
        imageUrls }, (cameraBody && { cameraBody })), (lens && { lens })), (settings && { settings })), { createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromMillis(Number(expiresAtMs)), status: 'active', ratingSum: 0, ratingCount: 0 }));
    console.log(`validateAndCreateCommunityPost: created ${docRef.id} for uid=${uid} (activeCount was ${activeCount})`);
    return { id: docRef.id };
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
        const currentSum = (_c = (_b = postSnap.data()) === null || _b === void 0 ? void 0 : _b.ratingSum) !== null && _c !== void 0 ? _c : 0;
        const currentCount = (_e = (_d = postSnap.data()) === null || _d === void 0 ? void 0 : _d.ratingCount) !== null && _e !== void 0 ? _e : 0;
        const oldRating = ratingSnap.exists ? ((_g = (_f = ratingSnap.data()) === null || _f === void 0 ? void 0 : _f.rating) !== null && _g !== void 0 ? _g : 0) : 0;
        let newSum = currentSum;
        let newCount = currentCount;
        if (ratingSnap.exists) {
            // Replace existing rating — count stays the same, just swap the value
            newSum = currentSum - oldRating + rating;
        }
        else {
            // First rating from this user
            newSum = currentSum + rating;
            newCount = currentCount + 1;
        }
        tx.update(postRef, { ratingSum: newSum, ratingCount: newCount });
        tx.set(ratingRef, {
            rating,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ratingSum: newSum, ratingCount: newCount };
    });
    console.log(`ratePost: uid=${uid} rated post=${postId} with ${rating} stars (sum=${ratingSum}, count=${ratingCount})`);
    return { ratingSum, ratingCount };
});
// ── cleanupExpiredCommunityPosts ──────────────────────────────────────────────
// Runs every 24 hours. Deletes Firestore docs and Storage files for posts
// whose expiresAt timestamp has passed.
exports.cleanupExpiredCommunityPosts = (0, scheduler_1.onSchedule)({ schedule: '0 3 * * *', timeZone: 'UTC' }, // 03:00 UTC daily
async () => {
    var _a;
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection('communityPosts')
        .where('expiresAt', '<=', now)
        .get();
    if (snap.empty) {
        console.log('cleanupExpiredCommunityPosts: no expired posts found.');
        return;
    }
    let deletedPosts = 0;
    let deletedFiles = 0;
    const batch = db.batch();
    for (const doc of snap.docs) {
        const data = doc.data();
        const imageUrls = (_a = data.imageUrls) !== null && _a !== void 0 ? _a : [];
        // Delete each Storage file derived from its download URL
        for (const url of imageUrls) {
            try {
                // Extract the storage path from the download URL
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
                console.warn(`cleanupExpiredCommunityPosts: failed to delete file from ${url}`, err);
            }
        }
        batch.delete(doc.ref);
        deletedPosts++;
    }
    await batch.commit();
    console.log(`cleanupExpiredCommunityPosts: deleted ${deletedPosts} posts and ${deletedFiles} files.`);
});
//# sourceMappingURL=index.js.map