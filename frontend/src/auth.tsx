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
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching profile:', error);
      }

      if (profile) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: profile.name || '',
          picture: profile.picture,
          role: profile.role,
          onboarding_completed: profile.onboarding_completed,
          owner_type: profile.owner_type,
        });
      } else {
        // Fallback if profile not created yet
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || '',
        });
      }
    } catch (e) {
      console.error('Exception in fetchUserProfile:', e);
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
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      console.log('Auth event:', event);
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await fetchUserProfile(session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
      setLoading(false);
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

