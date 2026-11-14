import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { identifyUser } from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';
import { useAnnotationsStore } from '@/store/annotations-store';
import { useChatStore } from '@/store/chat-store';
import { useSubscriptionStore } from '@/store/subscription-store';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

/**
 * The session, if it belongs to a real account. Anonymous sessions exist only so the AI server can
 * meter a signed-out reader's free question (see ensureAiSession in lib/api.ts), so the app treats
 * them as signed out everywhere.
 */
const realAccount = (s: Session | null): Session | null => (s && !s.user.is_anonymous ? s : null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const account = realAccount(data.session);
      setSession(account);
      setLoading(false);
      identifyUser(account?.user.id ?? null);
      if (account) {
        useChatStore.getState().resumeLatest();
        // Pull cross-platform premium (web Stripe / Supabase entitlements) for this account.
        useSubscriptionStore.getState().refreshServerEntitlement();
        // Any chapter that loaded (empty) before the session restored refetches its annotations.
        useAnnotationsStore.getState().reset();
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // An anonymous sign-in happens mid-send (a signed-out reader's first question). Keep the UI signed
      // out and leave the chat alone, since the question that triggered it is still in flight.
      if (nextSession?.user.is_anonymous) {
        setSession(null);
        return;
      }
      setSession(nextSession);
      // Tie RevenueCat purchases to the account (or revert to anonymous on sign-out).
      identifyUser(nextSession?.user.id ?? null);
      // Resume saved conversations on sign-in; clear them on sign-out.
      if (nextSession) {
        useChatStore.getState().resumeLatest();
        useSubscriptionStore.getState().refreshServerEntitlement();
      } else {
        useChatStore.getState().reset();
        // Drop the server-granted premium on sign-out (native store entitlement, if any, stays).
        useSubscriptionStore.getState().setServerPremium(false);
      }
      // Highlights/notes belong to the account — reload on sign-in, clear on sign-out.
      if (_event === 'SIGNED_IN' || _event === 'SIGNED_OUT') {
        useAnnotationsStore.getState().reset();
      }
    });

    // Re-check cross-platform premium whenever the app returns to the foreground, so a purchase made
    // on another platform (e.g. paid on web, now opening the iPhone app) takes effect without a relaunch.
    // AppState maps to document visibility on web, so this covers native + web + desktop.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useSubscriptionStore.getState().refreshServerEntitlement();
    });

    return () => {
      data.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
