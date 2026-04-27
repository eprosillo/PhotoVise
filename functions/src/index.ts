import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { GoogleGenAI } from '@google/genai';
import * as admin from 'firebase-admin';

// Initialise Admin SDK once
if (!admin.apps.length) admin.initializeApp();

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
      logger.error('Gemini API call failed', {
        functionName: 'generateWeeklyPlan',
        uid:          request.auth?.uid,
        errorCode:    e instanceof Error ? e.constructor.name : 'UnknownError',
        errorMessage: e instanceof Error ? e.message : String(e),
        timestamp:    new Date().toISOString(),
      });
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
      logger.error('Gemini API call failed', {
        functionName: 'generateAssignmentGuide',
        uid:          request.auth?.uid,
        errorCode:    e instanceof Error ? e.constructor.name : 'UnknownError',
        errorMessage: e instanceof Error ? e.message : String(e),
        timestamp:    new Date().toISOString(),
      });
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
      logger.error('Gemini API call failed', {
        functionName: 'askProQuestion',
        uid:          request.auth?.uid,
        errorCode:    e instanceof Error ? e.constructor.name : 'UnknownError',
        errorMessage: e instanceof Error ? e.message : String(e),
        timestamp:    new Date().toISOString(),
      });
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
      logger.error('Gemini API call failed', {
        functionName: 'fetchLocationSuggestions',
        uid:          request.auth?.uid,
        errorCode:    e instanceof Error ? e.constructor.name : 'UnknownError',
        errorMessage: e instanceof Error ? e.message : String(e),
        timestamp:    new Date().toISOString(),
      });
      return { suggestions: [] };
    }
  }
);

// ── fetchBulletinEvents helpers ───────────────────────────────────────────────
const VALID_CFE_TYPES = new Set([
  'Competition', 'Grant', 'Fellowship', 'Residency',
  'Open Call', 'Call for Entry', 'Portfolio Review', 'Festival', 'Event',
]);
const VALID_REGIONS  = new Set(['Global', 'US', 'Europe', 'Asia', 'Latin America', 'Africa', 'Other']);
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
      const text = (response.text || '').replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        logger.error('Gemini response JSON parse failed', {
          functionName: 'fetchBulletinEvents',
          uid:          request.auth?.uid,
          errorCode:    'JsonParseError',
          rawResponse:  text.slice(0, 500),
          timestamp:    new Date().toISOString(),
        });
        return { items: [] };
      }

      if (!Array.isArray(parsed)) {
        logger.error('Gemini response is not an array', {
          functionName: 'fetchBulletinEvents',
          uid:          request.auth?.uid,
          errorCode:    'InvalidResponseShape',
          rawResponse:  text.slice(0, 500),
          timestamp:    new Date().toISOString(),
        });
        return { items: [] };
      }

      const items = parsed
        .filter((item: unknown) => {
          const valid = isValidBulletinItem(item);
          if (!valid) logger.warn('Dropping invalid bulletin item', {
            functionName: 'fetchBulletinEvents',
            uid:          request.auth?.uid,
            invalidItem:  JSON.stringify(item).slice(0, 200),
            timestamp:    new Date().toISOString(),
          });
          return valid;
        })
        .map((item: Record<string, unknown>) => ({
          ...item,
          id: (item.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          status: 'unmarked',
        }));
      return { items };
    } catch (e) {
      logger.error('Gemini API call failed', {
        functionName: 'fetchBulletinEvents',
        uid:          request.auth?.uid,
        errorCode:    e instanceof Error ? e.constructor.name : 'UnknownError',
        errorMessage: e instanceof Error ? e.message : String(e),
        timestamp:    new Date().toISOString(),
      });
      return { items: [] };
    }
  }
);

// ── runGeminiForFunction (internal) ──────────────────────────────────────────
// Shared Gemini call logic used by processGeminiQueue.
// Must only be called from within a Cloud Function that declares geminiApiKey.
async function runGeminiForFunction(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });

  // ── generateWeeklyPlan / generateAssignmentGuide ──────────────────────────
  if (functionName === 'generateWeeklyPlan' || functionName === 'generateAssignmentGuide') {
    const input    = String(payload.input ?? '');
    const response = await ai.models.generateContent({
      model:    GEMINI_MODEL,
      contents: input,
      config:   { systemInstruction: SYSTEM_INSTRUCTION },
    });
    return { text: response.text || 'Communication error with Photovise core.' };
  }

  // ── askProQuestion ────────────────────────────────────────────────────────
  if (functionName === 'askProQuestion') {
    const prompt   = String(payload.prompt ?? '');
    const response = await ai.models.generateContent({
      model:    GEMINI_MODEL,
      contents: prompt,
      config:   { systemInstruction: SYSTEM_INSTRUCTION },
    });
    return { text: response.text || 'The pro is currently silent. Please try asking again.' };
  }

  // ── fetchBulletinEvents ───────────────────────────────────────────────────
  if (functionName === 'fetchBulletinEvents') {
    const genre  = String(payload.genre  ?? 'All');
    const region = String(payload.region ?? 'All');
    const type   = String(payload.type   ?? 'All');
    const today  = new Date().toISOString().split('T')[0];

    const genreContext = genre === 'All'
      ? 'all photography genres (Street, Landscape, Portrait, Architecture, Sports, Photojournalism, Fashion, Wildlife, Documentary)'
      : `${genre} photography`;
    const regionContext = region === 'All' ? 'worldwide' : `the ${region} region`;
    const typeContext = (!type || type === 'All')
      ? 'competitions, grants, fellowships, residencies, open calls, calls for entry, portfolio reviews, festivals, and events'
      : type === 'Competition'     ? 'photography competitions and contests'
      : type === 'Grant'           ? 'photography grants and funding opportunities'
      : type === 'Fellowship'      ? 'photography fellowships and artist-in-residence programs'
      : type === 'Residency'       ? 'photography residencies'
      : type === 'Open Call'       ? 'open calls for photographers'
      : type === 'Call for Entry'  ? 'calls for entry and submission opportunities'
      : type === 'Portfolio Review'? 'portfolio review events and programs'
      : type === 'Festival'        ? 'photography festivals and exhibitions'
      : 'photography events and opportunities';

    const prompt = `Today is ${today}. List 12 real upcoming ${typeContext} relevant to ${genreContext} in ${regionContext}. Only include opportunities with deadlines after ${today} or rolling/ongoing applications. Return ONLY a valid JSON array with no markdown. Each object must match this schema exactly: {"id":"ai-1","name":"","organizer":"","type":"Competition","url":"https://example.com","location":"","deadline":"YYYY-MM-DD","genres":[""],"blurb":"","fee":"","status":"unmarked","region":"Global","priority":"high"}. Valid type values: Competition, Grant, Fellowship, Residency, Open Call, Call for Entry, Portfolio Review, Festival, Event. Valid region values: Global, US, Europe, Asia, Latin America, Africa, Other. Valid priority values: high, medium, low. Use "Rolling" for deadline if the application is ongoing.`;

    const response = await ai.models.generateContent({
      model:    GEMINI_MODEL,
      contents: prompt,
      config:   { responseMimeType: 'application/json' },
    });

    const text = (response.text || '').replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      logger.error('Gemini response JSON parse failed', {
        functionName: 'runGeminiForFunction/fetchBulletinEvents',
        errorCode:    'JsonParseError',
        rawResponse:  text.slice(0, 500),
        timestamp:    new Date().toISOString(),
      });
      return { items: [] };
    }
    if (!Array.isArray(parsed)) {
      logger.error('Gemini response is not an array', {
        functionName: 'runGeminiForFunction/fetchBulletinEvents',
        errorCode:    'InvalidResponseShape',
        rawResponse:  text.slice(0, 500),
        timestamp:    new Date().toISOString(),
      });
      return { items: [] };
    }
    const items = parsed
      .filter((item: unknown) => {
        const valid = isValidBulletinItem(item);
        if (!valid) logger.warn('Dropping invalid bulletin item', {
          functionName: 'runGeminiForFunction/fetchBulletinEvents',
          invalidItem:  JSON.stringify(item).slice(0, 200),
          timestamp:    new Date().toISOString(),
        });
        return valid;
      })
      .map((item: Record<string, unknown>) => ({
        ...item,
        id:     (item.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        status: 'unmarked',
      }));
    return { items };
  }

  throw new HttpsError('invalid-argument', `Unknown function name: ${functionName}`);
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

export const enqueueGeminiRequest = onCall(async (request) => {
  const uid = requireAuth(request.auth);
  const { functionName, payload } = request.data as {
    functionName: string;
    payload: Record<string, unknown>;
  };

  if (!QUEUE_VALID_FUNCTIONS.has(functionName)) {
    throw new HttpsError('invalid-argument', `Invalid function name: ${functionName}`);
  }

  const db = admin.firestore();

  // Per-user guard: max 2 pending jobs at a time to prevent flooding
  const userSnap        = await db.collection('geminiQueue').where('userId', '==', uid).get();
  const userPending     = userSnap.docs.filter(d => d.data().status === 'pending').length;
  if (userPending >= 2) {
    throw new HttpsError(
      'resource-exhausted',
      'You have too many pending requests. Please wait for your current requests to complete.',
    );
  }

  // Count jobs currently ahead in line (pending + processing) for position display
  const queueSnap    = await db.collection('geminiQueue')
    .where('status', 'in', ['pending', 'processing'])
    .limit(50)
    .get();
  const queuedBefore = queueSnap.size;

  const jobRef = db.collection('geminiQueue').doc();
  await jobRef.set({
    userId:       uid,
    functionName,
    payload,
    status:       'pending',
    createdAt:    admin.firestore.FieldValue.serverTimestamp(),
    queuedBefore,             // approximate position shown to client
  });

  logger.info('Gemini job enqueued', {
    functionName: 'enqueueGeminiRequest',
    uid,
    jobId:        jobRef.id,
    geminiTarget: functionName,
    queuePosition: queuedBefore + 1,
    timestamp:    new Date().toISOString(),
  });
  return { jobId: jobRef.id };
});

// ── processGeminiQueue ────────────────────────────────────────────────────────
// Runs every minute via Cloud Scheduler.
// Processes up to 30 pending jobs per invocation — matching the 30 req/min
// Gemini quota. Uses a Firestore transaction to claim each job atomically so
// concurrent scheduler invocations cannot double-process the same job.
export const processGeminiQueue = onSchedule(
  { schedule: '* * * * *', timeZone: 'UTC', secrets: [geminiApiKey] },
  async () => {
    const db         = admin.firestore();
    const RATE_LIMIT = 30;
    const STUCK_MS   = 5 * 60_000; // recover jobs stuck in 'processing' > 5 min

    // ── Recover stuck jobs ────────────────────────────────────────────────────
    const processingSnap = await db.collection('geminiQueue')
      .where('status', '==', 'processing')
      .get();

    for (const stuckDoc of processingSnap.docs) {
      const processedAt = stuckDoc.data().processedAt?.toMillis?.() ?? 0;
      if (Date.now() - processedAt > STUCK_MS) {
        logger.warn('Recovering stuck Gemini queue job', {
          functionName: 'processGeminiQueue',
          jobId:        stuckDoc.id,
          stuckForMs:   Date.now() - processedAt,
          timestamp:    new Date().toISOString(),
        });
        await stuckDoc.ref.update({ status: 'pending' });
      }
    }

    // ── Fetch and sort pending jobs in memory (avoids composite index) ────────
    const pendingSnap = await db.collection('geminiQueue')
      .where('status', '==', 'pending')
      .limit(RATE_LIMIT + 20)   // fetch extra so in-memory sort is accurate
      .get();

    if (pendingSnap.empty) {
      logger.info('No pending Gemini jobs', {
        functionName: 'processGeminiQueue',
        timestamp:    new Date().toISOString(),
      });
    } else {
      const sorted = pendingSnap.docs
        .slice()
        .sort((a, b) =>
          (a.data().createdAt?.toMillis?.() ?? 0) -
          (b.data().createdAt?.toMillis?.() ?? 0),
        )
        .slice(0, RATE_LIMIT);

      logger.info('Processing Gemini queue batch', {
        functionName: 'processGeminiQueue',
        jobCount:     sorted.length,
        timestamp:    new Date().toISOString(),
      });

      for (const jobDoc of sorted) {
        // Atomic claim — prevents double-processing if scheduler fires twice
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(jobDoc.ref);
          if (fresh.data()?.status !== 'pending') return false;
          tx.update(jobDoc.ref, {
            status:      'processing',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return true;
        });

        if (!claimed) continue;

        const job = jobDoc.data();
        try {
          const result = await runGeminiForFunction(
            job.functionName as string,
            job.payload       as Record<string, unknown>,
          );
          await jobDoc.ref.update({
            status:      'complete',
            result,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.info('Gemini job completed', {
            functionName: 'processGeminiQueue',
            jobId:        jobDoc.id,
            geminiTarget: job.functionName,
            uid:          job.userId,
            timestamp:    new Date().toISOString(),
          });
        } catch (e) {
          logger.error('Gemini job failed', {
            functionName: 'processGeminiQueue',
            jobId:        jobDoc.id,
            geminiTarget: job.functionName,
            uid:          job.userId,
            errorCode:    e instanceof Error ? e.constructor.name : 'UnknownError',
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp:    new Date().toISOString(),
          });
          await jobDoc.ref.update({
            status:      'failed',
            error:       e instanceof Error ? e.message : 'Unknown error',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }

    // ── Clean up completed/failed jobs older than 1 hour ─────────────────────
    // Two separate queries to avoid a composite index on status+completedAt.
    const cutoffMs = Date.now() - 60 * 60_000;
    const [completeSnap, failedSnap] = await Promise.all([
      db.collection('geminiQueue').where('status', '==', 'complete').limit(100).get(),
      db.collection('geminiQueue').where('status', '==', 'failed').limit(100).get(),
    ]);
    const toDelete = [...completeSnap.docs, ...failedSnap.docs]
      .filter(d => (d.data().completedAt?.toMillis?.() ?? 0) < cutoffMs);

    if (toDelete.length > 0) {
      const batch = db.batch();
      toDelete.forEach(d => batch.delete(d.ref));
      await batch.commit();
      logger.info('Cleaned up old Gemini queue jobs', {
        functionName: 'processGeminiQueue',
        deletedCount: toDelete.length,
        timestamp:    new Date().toISOString(),
      });
    }
  },
);

// ── validateAndCreateCommunityPost ───────────────────────────────────────────
// Enforces a 3-active-post limit per user, then creates the Firestore document.
// Images must be uploaded to Storage by the client first; their download URLs are
// passed in as `imageUrls`.
export const validateAndCreateCommunityPost = onCall(
  async (request) => {
    const uid = requireAuth(request.auth);

    const { displayName, caption, assignmentTag, imageUrls, cameraBody, lens, settings, expiresAtMs } =
      request.data as {
        displayName: string;
        caption: string;
        assignmentTag: string;
        imageUrls: string[];
        cameraBody?: string;
        lens?: string;
        settings?: string;
        expiresAtMs: number;
      };

    if (!caption || !assignmentTag || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new HttpsError('invalid-argument', 'caption, assignmentTag, and imageUrls are required.');
    }

    const db  = admin.firestore();
    const now = Date.now();

    // Query by userId only (no composite index needed), filter active + non-expired in code
    const snap = await db.collection('communityPosts').where('userId', '==', uid).get();
    const activeCount = snap.docs.filter(d => {
      const data    = d.data();
      const expires = (data.expiresAt as admin.firestore.Timestamp)?.toMillis?.() ?? 0;
      return data.status === 'active' && expires > now;
    }).length;

    if (activeCount >= 3) {
      throw new HttpsError(
        'resource-exhausted',
        'Post limit reached. Remove a post to continue.',
      );
    }

    const docRef = await db.collection('communityPosts').add({
      userId:        uid,
      displayName:   displayName ?? 'Photographer',
      caption:       String(caption).trim(),
      assignmentTag,
      imageUrls,
      ...(cameraBody && { cameraBody }),
      ...(lens       && { lens       }),
      ...(settings   && { settings   }),
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      expiresAt:   admin.firestore.Timestamp.fromMillis(Number(expiresAtMs)),
      status:      'active',
      ratingSum:   0,
      ratingCount: 0,
    });

    logger.info('Community post created', {
      functionName: 'validateAndCreateCommunityPost',
      uid,
      postId:       docRef.id,
      activeCount,
      timestamp:    new Date().toISOString(),
    });
    return { id: docRef.id };
  }
);

// ── ratePost ──────────────────────────────────────────────────────────────────
// Adds or updates a 1-5 star rating for a community post.
// Uses a Firestore transaction to keep ratingSum / ratingCount in sync on the post doc.
// Ratings are stored in the subcollection: communityPosts/{postId}/ratings/{uid}
export const ratePost = onCall(
  async (request) => {
    const uid = requireAuth(request.auth);
    const { postId, rating } = request.data as { postId: string; rating: number };

    if (!postId) throw new HttpsError('invalid-argument', 'postId is required.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpsError('invalid-argument', 'rating must be an integer between 1 and 5.');
    }

    const db        = admin.firestore();
    const postRef   = db.collection('communityPosts').doc(postId);
    const ratingRef = postRef.collection('ratings').doc(uid);

    const { ratingSum, ratingCount } = await db.runTransaction(async (tx) => {
      const [postSnap, ratingSnap] = await Promise.all([tx.get(postRef), tx.get(ratingRef)]);

      if (!postSnap.exists) throw new HttpsError('not-found', 'Post not found.');
      if (postSnap.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Post is no longer active.');
      }

      const oldRating = ratingSnap.exists ? (ratingSnap.data()?.rating ?? 0) : 0;
      const isNew     = !ratingSnap.exists;
      const delta     = isNew ? rating : rating - oldRating;

      tx.update(postRef, {
        ratingSum:   admin.firestore.FieldValue.increment(delta),
        ...(isNew && { ratingCount: admin.firestore.FieldValue.increment(1) }),
      });
      tx.set(ratingRef, {
        rating,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Compute optimistic return values from snapshot + delta
      const currentSum   = postSnap.data()?.ratingSum   ?? 0;
      const currentCount = postSnap.data()?.ratingCount ?? 0;
      return {
        ratingSum:   currentSum + delta,
        ratingCount: isNew ? currentCount + 1 : currentCount,
      };
    });

    logger.info('Post rated', {
      functionName: 'ratePost',
      uid,
      postId,
      rating,
      ratingSum,
      ratingCount,
      timestamp:    new Date().toISOString(),
    });
    return { ratingSum, ratingCount };
  }
);

// ── cleanupExpiredCommunityPosts ──────────────────────────────────────────────
// Runs every 24 hours. Deletes Firestore docs and Storage files for posts
// whose expiresAt timestamp has passed.
export const cleanupExpiredCommunityPosts = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'UTC' }, // 03:00 UTC daily
  async () => {
    const db      = admin.firestore();
    const bucket  = admin.storage().bucket();
    const now     = admin.firestore.Timestamp.now();

    const snap = await db.collection('communityPosts')
      .where('expiresAt', '<=', now)
      .get();

    if (snap.empty) {
      logger.info('No expired community posts found', {
        functionName: 'cleanupExpiredCommunityPosts',
        timestamp:    new Date().toISOString(),
      });
      return;
    }

    let deletedPosts = 0;
    let deletedFiles = 0;

    const batch = db.batch();

    for (const doc of snap.docs) {
      const data      = doc.data();
      const imageUrls = (data.imageUrls as string[]) ?? [];

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
        } catch (err) {
          // Log but don't abort — file may already be gone
          logger.warn('Failed to delete Storage file for expired post', {
            functionName: 'cleanupExpiredCommunityPosts',
            postId:       doc.id,
            storageUrl:   url,
            errorCode:    err instanceof Error ? err.constructor.name : 'UnknownError',
            errorMessage: err instanceof Error ? err.message : String(err),
            timestamp:    new Date().toISOString(),
          });
        }
      }

      batch.delete(doc.ref);
      deletedPosts++;
    }

    await batch.commit();
    logger.info('Expired community posts cleaned up', {
      functionName:  'cleanupExpiredCommunityPosts',
      deletedPosts,
      deletedFiles,
      timestamp:     new Date().toISOString(),
    });
  }
);
