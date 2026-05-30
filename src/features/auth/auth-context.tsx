import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { identifyUser } from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/chat-store';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      identifyUser(data.session?.user.id ?? null);
      if (data.session) useChatStore.getState().resumeLatest();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // Tie RevenueCat purchases to the account (or revert to anonymous on sign-out).
      identifyUser(nextSession?.user.id ?? null);
      // Resume saved conversations on sign-in; clear them on sign-out.
      if (nextSession) useChatStore.getState().resumeLatest();
      else useChatStore.getState().reset();
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
