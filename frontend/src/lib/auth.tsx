'use client';

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Profile } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  sendOtp: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string, type?: 'email' | 'signup') => Promise<{ error: Error | null }>;
  resendSignupOtp: (email: string) => Promise<{ error: Error | null }>;
  updateProfile: (name: string, company: string) => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  needsOnboarding: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('psf_password_recovery') === 'true';
    }
    return false;
  });
  const sessionIdRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================================
  // PASSWORD RECOVERY FLAG
  // ============================================================================

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecovery(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('psf_password_recovery');
    }
  }, []);

  // ============================================================================
  // SESSION TRACKING
  // ============================================================================

  const startSessionTracking = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .insert({ user_id: userId })
        .select('id')
        .single();

      if (!error && data) {
        sessionIdRef.current = data.id;
        sessionStartRef.current = Date.now();

        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(async () => {
          if (sessionIdRef.current && sessionStartRef.current) {
            const durationSecs = Math.floor((Date.now() - sessionStartRef.current) / 1000);
            await supabase
              .from('user_sessions')
              .update({ ended_at: new Date().toISOString(), duration_seconds: durationSecs })
              .eq('id', sessionIdRef.current);
          }
        }, 60000);
      }
    } catch (err) {
      console.warn('[Auth] Session tracking error:', err);
    }
  }, []);

  const endSessionTracking = useCallback(async () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (sessionIdRef.current && sessionStartRef.current) {
      const durationSecs = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      try {
        await supabase
          .from('user_sessions')
          .update({ ended_at: new Date().toISOString(), duration_seconds: durationSecs })
          .eq('id', sessionIdRef.current);
      } catch (err) {
        console.warn('[Auth] End session error:', err);
      }
      sessionIdRef.current = null;
      sessionStartRef.current = null;
    }
  }, []);

  // Handle page unload - try to save session
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionIdRef.current && sessionStartRef.current) {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_sessions?id=eq.${sessionIdRef.current}`;
        navigator.sendBeacon?.(url);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ============================================================================
  // AUTH STATE LISTENER
  // ============================================================================

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn('[Auth] Timeout reached, forcing loading=false');
      setLoading(false);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      console.log('[Auth] Initial session:', session ? 'exists' : 'none');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      clearTimeout(timeout);
      console.error('[Auth] Error getting session:', err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log('[Auth] State change:', _event, session ? 'session exists' : 'no session');
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
          if (_event === 'SIGNED_IN' && !sessionIdRef.current) {
            startSessionTracking(session.user.id);
          }
          // Handle password recovery redirect from Supabase
          if (_event === 'PASSWORD_RECOVERY') {
            setPasswordRecovery(true);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('psf_password_recovery', 'true');
            }
          }
        } else {
          setProfile(null);
          setNeedsOnboarding(false);
          if (_event === 'SIGNED_OUT') {
            endSessionTracking();
          }
        }
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // PROFILE FETCHING
  // ============================================================================

  const fetchProfile = async (userId: string) => {
    try {
      console.log('[Auth] Fetching profile for:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.log('[Auth] Profile not found (needs onboarding):', error.message);
        setNeedsOnboarding(true);
        setProfile(null);
      } else if (!data) {
        console.log('[Auth] No profile data, needs onboarding');
        setNeedsOnboarding(true);
        setProfile(null);
      } else {
        console.log('[Auth] Profile loaded:', data.name);
        setProfile(data);
        setNeedsOnboarding(false);
      }
    } catch (err) {
      console.error('[Auth] Error fetching profile:', err);
      setNeedsOnboarding(true);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // AUTH METHODS - All use native fetch (Supabase JS v2.94 hangs on auth calls)
  // ============================================================================

  const signUp = async (email: string, password: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: new Error(err.msg || err.error_description || `Error ${response.status}`) };
      }

      const data = await response.json();

      // Supabase returns empty identities if user already exists (security: prevents enumeration)
      if (data.identities && data.identities.length === 0) {
        return { error: new Error('Este email ya está registrado. Inicia sesión.') };
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: new Error(err.msg || err.error_description || `Error ${response.status}`) };
      }

      const data = await response.json();

      if (data.access_token && data.refresh_token && data.user) {
        const sessionData = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
          expires_at: data.expires_at,
          token_type: data.token_type || 'bearer',
          user: data.user,
        } as Session;

        setSession(sessionData);
        setUser(data.user);

        // Fetch profile
        try {
          const profileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=*`;
          const profileRes = await fetch(profileUrl, {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${data.access_token}`,
            },
          });
          const profiles = await profileRes.json();
          if (profiles && profiles.length > 0) {
            setProfile(profiles[0]);
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
            setProfile(null);
          }
        } catch {
          setNeedsOnboarding(true);
          setProfile(null);
        }

        // Persist session in Supabase client (fire-and-forget)
        supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        }).catch(() => {});

        setLoading(false);
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    await endSessionTracking();

    // Use native fetch (supabase.auth.signOut hangs on v2.94)
    const token = session?.access_token;
    if (token) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch {
        // Ignore logout API errors - we clear local state regardless
      }
    }

    setUser(null);
    setSession(null);
    setProfile(null);

    // Clear Supabase client local storage (removes persisted session)
    if (typeof window !== 'undefined') {
      const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`;
      localStorage.removeItem(storageKey);
    }
  };

  const sendOtp = async (email: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ email, create_user: true }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: new Error(err.msg || err.error_description || `Error ${response.status}`) };
      }
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const verifyOtp = async (email: string, token: string, type: 'email' | 'signup' = 'email') => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ email, token, type }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: new Error(err.msg || err.error_description || 'Código inválido') };
      }

      const data = await response.json();

      if (data.access_token && data.refresh_token && data.user) {
        const sessionData = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
          expires_at: data.expires_at,
          token_type: data.token_type || 'bearer',
          user: data.user,
        } as Session;

        setSession(sessionData);
        setUser(data.user);

        // Fetch profile
        try {
          const profileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=*`;
          const profileRes = await fetch(profileUrl, {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${data.access_token}`,
            },
          });
          const profiles = await profileRes.json();
          if (profiles && profiles.length > 0) {
            setProfile(profiles[0]);
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
            setProfile(null);
          }
        } catch {
          setNeedsOnboarding(true);
          setProfile(null);
        }

        // Start session tracking
        startSessionTracking(data.user.id);

        // Persist session in Supabase client (fire-and-forget)
        supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        }).catch(() => {
          console.warn('[Auth] setSession fire-and-forget failed (expected)');
        });

        setLoading(false);
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const resendSignupOtp = async (email: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/resend`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ type: 'signup', email }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: new Error(err.msg || err.error_description || `Error ${response.status}`) };
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const resetPasswordForEmail = async (email: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/recover`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ email }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: new Error(err.msg || err.error_description || `Error ${response.status}`) };
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const token = session?.access_token;
      if (!token) return { error: new Error('No hay sesión activa') };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ password: newPassword }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { error: new Error(err.msg || err.error_description || `Error ${response.status}`) };
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  // ============================================================================
  // PROFILE UPDATE
  // ============================================================================

  const updateProfile = async (name: string, company: string) => {
    if (!user) return { error: new Error('No user logged in') };

    try {
      const token = session?.access_token;
      if (!token) return { error: new Error('No hay sesión activa') };

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: user.id, name, company }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[Auth] Profile upsert failed:', response.status, errText);
        return { error: new Error(`Error al guardar perfil: ${response.status}`) };
      }

      setProfile({ id: user.id, name, company, created_at: new Date().toISOString() });
      setNeedsOnboarding(false);
      return { error: null };
    } catch (err) {
      console.error('[Auth] Profile upsert error:', err);
      return { error: err as Error };
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        sendOtp,
        verifyOtp,
        resendSignupOtp,
        updateProfile,
        resetPasswordForEmail,
        updatePassword,
        needsOnboarding,
        passwordRecovery,
        clearPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
