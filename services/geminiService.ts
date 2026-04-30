/**
 * geminiService.ts
 *
 * Calls Gemini Cloud Functions directly via Firebase httpsCallable.
 * No queue needed for a personal app — direct calls are faster, simpler,
 * and avoid the 60-second scheduler latency introduced by the queue approach.
 */

import { httpsCallable } from 'firebase/functions';
import { functions }     from '../firebase';
import { CfeBulletinItem } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Default timeout for Gemini Cloud Function calls (ms). Matches server timeoutSeconds. */
const GEMINI_TIMEOUT_MS = 120_000;

function getFn<T = unknown, R = unknown>(name: string, timeoutMs = GEMINI_TIMEOUT_MS) {
  return httpsCallable<T, R>(functions, name, { timeout: timeoutMs });
}

function handleError(error: unknown): string {
  console.error('Photovise AI Error:', error);
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  if (msg.includes('429') || /rate.?limit|overloaded|exhausted|resource-exhausted/i.test(msg)) {
    return 'Photovise is currently at capacity. Please wait a moment and try again.';
  }
  return 'Photovise is temporarily unreachable. Please check your network connection.';
}

// ── Exported service functions ────────────────────────────────────────────────

export async function generateWeeklyPlan(input: string): Promise<string> {
  try {
    const fn     = getFn<{ input: string }, { text: string }>('generateWeeklyPlan');
    const result = await fn({ input });
    return result.data.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function generateAssignmentGuide(assignmentDescription: string): Promise<string> {
  try {
    const fn     = getFn<{ input: string }, { text: string }>('generateAssignmentGuide');
    const result = await fn({ input: assignmentDescription });
    return result.data.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function askProQuestion(prompt: string): Promise<string> {
  try {
    const fn     = getFn<{ prompt: string }, { text: string }>('askProQuestion');
    const result = await fn({ prompt });
    return result.data.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function fetchLocationSuggestions(
  query: string,
  lat?: number,
  lng?: number,
): Promise<{ title: string; uri?: string }[]> {
  try {
    const fn     = getFn<
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
    const fn     = getFn<
      { genre: string; region: string; type: string },
      { items: CfeBulletinItem[] }
    >('fetchBulletinEvents');
    const result = await fn({ genre, region, type });
    return result.data.items ?? [];
  } catch (error) {
    console.error('Photovise: Failed to fetch bulletin events', error);
    return [];
  }
}
