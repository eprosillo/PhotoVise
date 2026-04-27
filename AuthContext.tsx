import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GithubAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onIdTokenChanged,
} from 'firebase/auth';
import { auth } from './firebase';
import { toast } from './utils/toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onIdTokenChanged is a superset of onAuthStateChanged: it fires on
    // sign-in, sign-out, AND every silent token refresh (~every 55 min).
    // This means expired-token failures are detected and surfaced to the user
    // rather than silently causing Firestore writes to fail.
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Proactively refresh the token if it will expire within 5 minutes.
        // getIdToken(true) forces a network round-trip; getIdToken(false) uses
        // the cached token if it is still valid.
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const expiresAt   = new Date(tokenResult.expirationTime).getTime();
          const msUntilExpiry = expiresAt - Date.now();

          if (msUntilExpiry < 5 * 60 * 1000) {
            // Token expires in < 5 min — force a refresh now before it expires.
            await firebaseUser.getIdToken(/* forceRefresh */ true);
          }
        } catch {
          // Refresh failed (network loss, revoked session, deleted account).
          // Show a toast so the user knows their session is at risk.
          toast.error(
            'Your session could not be refreshed. Save your work and sign in again.',
            8000,
          );
        }
      }

      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGitHub = async () => {
    const provider = new GithubAuthProvider();
    // TODO: Before deploying to GitHub Pages, add your authorized domain in Firebase Console:
    //   Authentication > Sign-in method > GitHub > Authorized domains
    //   Add: https://<your-github-username>.github.io
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGitHub, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
