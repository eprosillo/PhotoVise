import React, { useState } from 'react';
import { useAuth } from './AuthContext';

const LoginScreen: React.FC = () => {
  const { signInWithGitHub } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGitHub();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setError(msg);
      console.error('LoginScreen: GitHub sign-in error', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-display text-brand-rose tracking-wider leading-none mb-3">
            PHOTOVISE
          </h1>
          <p className="text-[9px] text-brand-gray uppercase tracking-[0.3em] font-bold">
            Photography workflow assistant
          </p>
        </div>

        {/* Sign-in card */}
        <div className="bg-brand-white p-10 rounded-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-black/50 mb-8">
            Sign in to continue
          </p>

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-brand-black text-brand-white py-4 px-6 rounded-sm text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-brand-black/80 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <i className="fa-solid fa-circle-notch animate-spin text-sm"></i>
                Signing in…
              </>
            ) : (
              <>
                <i className="fa-brands fa-github text-sm"></i>
                Sign in with GitHub
              </>
            )}
          </button>

          {error && (
            <p className="mt-4 text-[9px] text-red-500 font-bold uppercase tracking-widest text-center leading-relaxed">
              {error}
            </p>
          )}

          <p className="mt-8 text-[9px] text-brand-black/30 uppercase tracking-[0.2em] text-center leading-relaxed">
            Your data syncs securely across devices
          </p>
        </div>

        {/* Subtle footer */}
        <p className="text-center text-[8px] text-brand-gray/40 uppercase tracking-[0.2em] mt-8">
          Powered by Firebase · GitHub OAuth
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
