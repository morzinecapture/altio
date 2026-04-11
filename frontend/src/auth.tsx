import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role?: string;
  onboarding_completed?: boolean;
  owner_type?: string;
  is_admin?: boolean;
  marketing_consent_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  handleLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  setUser: () => { },
  handleLogout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch full user profile from the public.users table
  const fetchUserProfile = async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      return;
    }

    try {
      // Add a 5 second timeout to prevent hanging indefinitely on bad network/websocket handshake
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase fetch timeout')), 5000));
      const fetchPromise = supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      const { data: profile, error } = await Promise.race([
        fetchPromise,
        timeoutPromise
      ]) as Awaited<typeof fetchPromise>;

      if (profile) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: profile.name || '',
          picture: profile.picture,
          role: profile.role,
          onboarding_completed: profile.onboarding_completed,
          owner_type: profile.owner_type,
          is_admin: profile.is_admin,
        });
      } else {
        // New user (no profile yet) — send welcome email (fire-and-forget)
        // Pass the access token explicitly because the session may not be
        // fully registered on the supabase client yet during onAuthStateChange.
        const userEmail = session.user.email;
        const firstName = session.user.user_metadata?.full_name?.split(' ')[0] || undefined;
        if (userEmail && session.access_token) {
          supabase.functions.invoke('send-welcome-email', {
            body: { email: userEmail, firstName },
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => { /* silent — email is nice-to-have */ });
        }

        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || '',
        });
      }
    } catch (e) {
      // Ensure we don't get stuck loading if network fails
      setUser({
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.user_metadata?.full_name || '',
      });
    }
  };

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — no need for a separate getSession() call
    const { data: authListener } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          fetchUserProfile(session).finally(() => {
            setLoading(false);
          });
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // setUser(null) is handled by onAuthStateChange SIGNED_OUT event
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
};

