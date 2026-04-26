/**
 * useFirestore.ts
 *
 * Reads and writes all PingStudio user data to Firestore, scoped per uid.
 * Each user's data lives at: users/{uid}  (a single document with sub-fields)
 *
 * Usage:
 *   const { loadUserData, saveUserData } = useFirestore(user?.uid ?? null);
 *
 *   // On mount — load from Firestore to hydrate state
 *   const data = await loadUserData();
 *   if (data?.sessions) setSessions(data.sessions);
 *
 *   // On state change — persist to Firestore (alongside existing localStorage writes)
 *   await saveUserData({ sessions });
 *
 * Save resilience:
 *   - Retries up to 3 times with exponential backoff (1 s → 2 s → 4 s).
 *   - If all retries fail, shows a visible error toast and queues the write
 *     to IndexedDB so it can be replayed when the user comes back online.
 *   - An `online` listener in this hook automatically replays queued writes
 *     and shows a success toast when they complete.
 */

import { useCallback, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from '../utils/toast';
import { queueWrite, getQueuedWrites, removeQueuedWrite } from '../utils/offlineQueue';
import {
  Session,
  GearItem,
  JournalEntry,
  BulletinStatus,
  CfeBulletinItem,
  PhotographerProfile,
  FeedbackEntry,
  WeekPlan,
} from '../types';

export interface FirestoreUserData {
  sessions?: Session[];
  gear?: GearItem[];
  journal?: JournalEntry[];
  profile?: PhotographerProfile;
  bulletinState?: Record<string, BulletinStatus>;
  bulletinItems?: CfeBulletinItem[];
  bulletinFetchedAt?: number;
  feedback?: FeedbackEntry[];
  weekPlans?: WeekPlan[];
}

// ── Retry helper ──────────────────────────────────────────────────────────────
// Attempts fn() up to `attempts` times.
// Waits 1 s before attempt 2, 2 s before attempt 3, 4 s before attempt 4, etc.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise<void>((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  // Unreachable — TypeScript needs the explicit throw
  throw new Error('withRetry: exhausted');
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useFirestore(uid: string | null) {
  /**
   * Load all user data from Firestore.
   * Returns null if the user has no document yet or if an error occurs.
   */
  const loadUserData = useCallback(async (): Promise<FirestoreUserData | null> => {
    if (!uid) return null;
    try {
      const ref  = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return snap.data() as FirestoreUserData;
      }
    } catch (e) {
      console.error('Firestore: Failed to load user data', e);
    }
    return null;
  }, [uid]);

  /**
   * Merge-write a partial data object into the user's Firestore document.
   * Only the keys you pass will be updated; everything else is preserved.
   *
   * Retries up to 3 times on failure. If all attempts fail, shows an error
   * toast and queues the write to IndexedDB for replay on reconnect.
   *
   * Examples:
   *   saveUserData({ sessions })            // save only sessions
   *   saveUserData({ gear, bulletinState }) // save multiple fields at once
   */
  const saveUserData = useCallback(async (data: Partial<FirestoreUserData>): Promise<void> => {
    if (!uid) return;
    try {
      await withRetry(() => {
        const ref = doc(db, 'users', uid);
        return setDoc(ref, data, { merge: true });
      });
    } catch (e) {
      console.error('Firestore: All save attempts failed', e);
      toast.error('Changes could not be saved. Please check your connection and try again.');
      try {
        await queueWrite(uid, data as Record<string, unknown>);
      } catch (queueErr) {
        console.error('Firestore: Failed to queue write to IndexedDB', queueErr);
      }
    }
  }, [uid]);

  /**
   * When the browser comes back online, replay any writes that were queued
   * to IndexedDB while offline. Shows a success toast when done.
   */
  useEffect(() => {
    if (!uid) return;

    const handleOnline = async () => {
      let pending: Awaited<ReturnType<typeof getQueuedWrites>>;
      try {
        pending = await getQueuedWrites();
      } catch {
        return;
      }

      const mine = pending.filter((entry) => entry.uid === uid);
      if (mine.length === 0) return;

      let successCount = 0;
      for (const entry of mine) {
        try {
          await withRetry(() => {
            const ref = doc(db, 'users', entry.uid);
            return setDoc(ref, entry.data, { merge: true });
          });
          await removeQueuedWrite(entry.id!);
          successCount++;
        } catch (e) {
          console.error('Firestore: Failed to replay queued write', e);
        }
      }

      if (successCount > 0) {
        toast.success(
          `${successCount} pending change${successCount === 1 ? '' : 's'} saved.`
        );
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [uid]);

  return { loadUserData, saveUserData };
}
