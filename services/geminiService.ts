/**
 * geminiService.ts
 *
 * All heavy Gemini calls (generateWeeklyPlan, generateAssignmentGuide,
 * askProQuestion, fetchBulletinEvents) are routed through a Firestore-backed
 * queue (enqueueGeminiRequest Cloud Function) to enforce the 30 req/min limit.
 *
 * Flow per call:
 *   1. enqueueGeminiRequest  → writes a pending job, returns jobId
 *   2. pollJobResult         → getDoc every 3 s on geminiQueue/{jobId}
 *   3. Toast updates in-place: "Position X" → "Processing…" → dismissed
 *   4. Resolves with job.result on complete, rejects on failed/timeout
 *
 * External interface is unchanged — App.tsx requires no modifications.
 * fetchLocationSuggestions bypasses the queue (lightweight, keystroke-driven).
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc }   from 'firebase/firestore';
import { toast }                        from '../utils/toast';
import { CfeBulletinItem }              from '../types';

// ── Firebase helpers ──────────────────────────────────────────────────────────

function getFn<T = unknown, R = unknown>(name: string) {
  return httpsCallable<T, R>(getFunctions(), name);
}

function handleError(error: unknown): string {
  console.error('Photovise AI Error:', error);
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  if (/timeout/i.test(msg)) {
    return 'Your request timed out after 3 minutes. Please try again.';
  }
  if (msg.includes('429') || /rate.?limit|overloaded|exhausted|resource-exhausted/i.test(msg)) {
    return 'Photovise is currently at capacity. Please wait a moment and try again.';
  }
  return 'Photovise is temporarily unreachable. Please check your network connection.';
}

// ── Queue polling ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3_000;        // check every 3 seconds
const TIMEOUT_MS       = 3 * 60_000;  // give up after 3 minutes

async function enqueueAndPoll(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  // Step 1: add job to server-side queue
  const enqueueFn = getFn<
    { functionName: string; payload: Record<string, unknown> },
    { jobId: string }
  >('enqueueGeminiRequest');

  const { data: { jobId } } = await enqueueFn({ functionName, payload });

  // Step 2: poll Firestore until complete / failed / timeout
  const db      = getFirestore();
  const jobRef  = doc(db, 'geminiQueue', jobId);
  const startAt = Date.now();

  // Toast management — first call shows the toast; subsequent calls update it
  // in-place using toast.update() so there's no flicker between polls.
  let toastVisible = false;
  const showStatus = (msg: string) => {
    if (toastVisible) {
      toast.update(msg);
    } else {
      toast.info(msg); // duration=0 → persists until toast.dismiss()
      toastVisible = true;
    }
  };

  return new Promise((resolve, reject) => {
    const poll = async () => {
      // 3-minute hard timeout
      if (Date.now() - startAt > TIMEOUT_MS) {
        toast.dismiss();
        toast.error('Request timed out after 3 minutes. Please try again.');
        reject(new Error('timeout'));
        return;
      }

      try {
        const snap = await getDoc(jobRef);

        // Document not yet visible — transient consistency lag, retry
        if (!snap.exists()) {
          setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        const data = snap.data()!;

        if (data.status === 'pending') {
          // queuedBefore is the depth at enqueue time. On each poll we subtract
          // the elapsed minutes × 30 (the scheduler's throughput) to give an
          // approximate live countdown rather than a frozen initial value.
          const initialAhead  = (data.queuedBefore as number) ?? 0;
          const elapsedMin    = (Date.now() - startAt) / 60_000;
          const estimatedAhead = Math.max(0, Math.round(initialAhead - elapsedMin * 30));
          const position       = estimatedAhead + 1;
          showStatus(
            position <= 1
              ? 'Your request is next in line…'
              : `Your request is queued — position ${position}.`,
          );
          setTimeout(poll, POLL_INTERVAL_MS);

        } else if (data.status === 'processing') {
          showStatus('Your request is being processed…');
          setTimeout(poll, POLL_INTERVAL_MS);

        } else if (data.status === 'complete') {
          toast.dismiss();
          resolve(data.result);

        } else if (data.status === 'failed') {
          toast.dismiss();
          toast.error('Something went wrong. Please try again.');
          reject(new Error((data.error as string) || 'Request failed.'));

        } else {
          // Unknown status — wait and retry
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        // Transient network error during poll — silently retry
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  });
}

// ── Exported service functions ────────────────────────────────────────────────
// Same signatures as before — App.tsx is unchanged.

export async function generateWeeklyPlan(input: string): Promise<string> {
  try {
    const result = await enqueueAndPoll('generateWeeklyPlan', { input }) as { text: string };
    return result.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function generateAssignmentGuide(assignmentDescription: string): Promise<string> {
  try {
    const result = await enqueueAndPoll(
      'generateAssignmentGuide',
      { input: assignmentDescription },
    ) as { text: string };
    return result.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function askProQuestion(prompt: string): Promise<string> {
  try {
    const result = await enqueueAndPoll('askProQuestion', { prompt }) as { text: string };
    return result.text;
  } catch (error) {
    return handleError(error);
  }
}

/**
 * fetchLocationSuggestions bypasses the queue — it's lightweight, called on
 * keystrokes, and doesn't consume the main Gemini text-generation quota.
 */
export async function fetchLocationSuggestions(
  query: string,
  lat?: number,
  lng?: number,
): Promise<{ title: string; uri?: string }[]> {
  try {
    const fn = getFn<
      { query: string; lat?: number; lng?: number },
      { suggestions: { title: string; uri?: string }[] }
    >('fetchLocationSuggestions');
    const result = await fn({ query, lat, lng });
    return result.data.suggestions;
  } catch (error) {
    console.error('Photovise: Location suggestions failed', error);
    return [];
  }
}

export async function fetchBulletinEvents(
  genre: string,
  region: string,
  type = 'All',
): Promise<CfeBulletinItem[]> {
  try {
    const result = await enqueueAndPoll(
      'fetchBulletinEvents',
      { genre, region, type },
    ) as { items: CfeBulletinItem[] };
    return result.items ?? [];
  } catch (error) {
    console.error('Photovise: Failed to fetch bulletin events', error);
    return [];
  }
}
