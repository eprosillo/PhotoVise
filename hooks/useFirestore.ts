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
 */

import { useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Session,
  GearItem,
  JournalEntry,
  BulletinStatus,
  CfeBulletinItem,
  PhotographerProfile,
  FeedbackEntry,
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
}

export function useFirestore(uid: string | null) {
  /**
   * Load all user data from Firestore.
   * Returns null if the user has no document yet or if an error occurs.
   */
  const loadUserData = useCallback(async (): Promise<FirestoreUserData | null> => {
    if (!uid) return null;
    try {
      const ref = doc(db, 'users', uid);
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
   * Examples:
   *   saveUserData({ sessions })            // save only sessions
   *   saveUserData({ gear, bulletinState }) // save multiple fields at once
   */
  const saveUserData = useCallback(async (data: Partial<FirestoreUserData>): Promise<void> => {
    if (!uid) return;
    try {
      const ref = doc(db, 'users', uid);
      await setDoc(ref, data, { merge: true });
    } catch (e) {
      console.error('Firestore: Failed to save user data', e);
    }
  }, [uid]);

  return { loadUserData, saveUserData };
}
