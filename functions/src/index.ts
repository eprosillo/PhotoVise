import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
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

    console.log(`validateAndCreateCommunityPost: created ${docRef.id} for uid=${uid} (activeCount was ${activeCount})`);
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

      const currentSum   = postSnap.data()?.ratingSum   ?? 0;
      const currentCount = postSnap.data()?.ratingCount ?? 0;
      const oldRating    = ratingSnap.exists ? (ratingSnap.data()?.rating ?? 0) : 0;

      let newSum   = currentSum;
      let newCount = currentCount;

      if (ratingSnap.exists) {
        // Replace existing rating — count stays the same, just swap the value
        newSum = currentSum - oldRating + rating;
      } else {
        // First rating from this user
        newSum   = currentSum + rating;
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
      console.log('cleanupExpiredCommunityPosts: no expired posts found.');
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
          console.warn(`cleanupExpiredCommunityPosts: failed to delete file from ${url}`, err);
        }
      }

      batch.delete(doc.ref);
      deletedPosts++;
    }

    await batch.commit();
    console.log(`cleanupExpiredCommunityPosts: deleted ${deletedPosts} posts and ${deletedFiles} files.`);
  }
);
