import { getFunctions, httpsCallable } from 'firebase/functions';
import { CfeBulletinItem } from '../types';

// All Gemini calls go through Firebase Cloud Functions — the API key
// lives only on the server and is never exposed in the browser bundle.
function getFn<T = unknown, R = unknown>(name: string) {
  return httpsCallable<T, R>(getFunctions(), name);
}

function handleError(error: unknown): string {
  console.error('Photovise AI Error:', error);
  const errStr = error instanceof Error ? error.message : JSON.stringify(error);
  if (errStr.includes('429') || /rate.?limit|overloaded|exhausted/i.test(errStr)) {
    return 'Photovise is currently at capacity (API Quota Exhausted). Please wait a minute before trying again.';
  }
  return 'Photovise is temporarily unreachable. Please check your network connection.';
}

export async function generateWeeklyPlan(input: string): Promise<string> {
  try {
    const fn = getFn<{ input: string }, { text: string }>('generateWeeklyPlan');
    const result = await fn({ input });
    return result.data.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function generateAssignmentGuide(assignmentDescription: string): Promise<string> {
  try {
    const fn = getFn<{ input: string }, { text: string }>('generateAssignmentGuide');
    const result = await fn({ input: assignmentDescription });
    return result.data.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function askProQuestion(prompt: string): Promise<string> {
  try {
    const fn = getFn<{ prompt: string }, { text: string }>('askProQuestion');
    const result = await fn({ prompt });
    return result.data.text;
  } catch (error) {
    return handleError(error);
  }
}

export async function fetchLocationSuggestions(
  query: string,
  lat?: number,
  lng?: number
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

export async function fetchBulletinEvents(genre: string, region: string, type: string = 'All'): Promise<CfeBulletinItem[]> {
  try {
    const fn = getFn<{ genre: string; region: string; type: string }, { items: CfeBulletinItem[] }>('fetchBulletinEvents');
    const result = await fn({ genre, region, type });
    return result.data.items;
  } catch (error) {
    console.error('Photovise: Failed to fetch bulletin events', error);
    return [];
  }
}
