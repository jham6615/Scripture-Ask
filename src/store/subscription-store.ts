import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { fetchServerEntitlement } from '@/lib/entitlements';

/**
 * Free AI questions before the paywall: one, so a new reader can try it. After that they see the
 * paywall with the free trial. Reading the Bible is always free; only the AI is gated.
 *
 * This local count only decides when to show the paywall. The real gate is server-side
 * (AI_FREE_CHAT_LIMIT in supabase/functions/ai), so reinstalling or clearing storage doesn't add
 * questions. Keep the two numbers in sync.
 */
export const FREE_QUESTION_LIMIT = 1;

const STORAGE_KEY = 'bf:subscription';

/**
 * Dev override. In Metro-served dev builds (`__DEV__` true), unconditionally treat the user
 * as premium so the paywall + free-question counter don't block iteration. This matters in particular
 * because the dev variant has its own bundle ID (com.shuttlementor.biblefriend.dev) for which
 * Apple has no IAP products configured — so RevenueCat returns no offerings and the paywall
 * would otherwise be a dead end. Release builds (TestFlight, App Store) have `__DEV__` false
 * and behave normally. Note the server still meters dev builds: give your test account an active
 * row in `entitlements` (or raise AI_FREE_CHAT_LIMIT) if you need unlimited questions while testing.
 */
const DEV_FREE_PREMIUM = __DEV__;

/**
 * Premium can be granted by any of three independent sources, OR'd together:
 *   - dev    : the __DEV__ override above
 *   - store  : RevenueCat / Apple StoreKit (iOS, Android) — set by src/lib/revenuecat.ts
 *   - server : the Supabase `entitlements` table (web Stripe purchases, and the cross-platform
 *              source of truth) — refreshed by refreshServerEntitlement()
 * `isPremium` is the derived boolean the rest of the app reads; we recompute it whenever any
 * source changes so existing `useSubscriptionStore((s) => s.isPremium)` readers keep working.
 */
const derivePremium = (storePremium: boolean, serverPremium: boolean) =>
  DEV_FREE_PREMIUM || storePremium || serverPremium;

type SubscriptionState = {
  /** Derived: true when any premium source is active. The app reads this. */
  isPremium: boolean;
  /** RevenueCat / Apple entitlement (native only). */
  storePremium: boolean;
  /** Supabase `entitlements` row (web Stripe + cross-platform). */
  serverPremium: boolean;
  /** Free AI questions used on this device. Lifetime, not per day. */
  freeUsed: number;
  hydrate: () => void;
  /** Free questions left (Infinity when premium). */
  remaining: () => number;
  canAsk: () => boolean;
  recordAsk: () => void;
  /** Give back a question whose answer failed. The server refunds its own count in that case too. */
  refundAsk: () => void;
  /** The server says the free question is already used (e.g. after a reinstall); match it locally. */
  markFreeUsedUp: () => void;
  /** Set by RevenueCat (native store purchases). */
  setStorePremium: (value: boolean) => void;
  /** Set by the Supabase entitlements refresh (web Stripe / cross-platform). */
  setServerPremium: (value: boolean) => void;
  /** Re-read the signed-in user's entitlement from Supabase and fold it in. */
  refreshServerEntitlement: () => Promise<void>;
};

type Persisted = { storePremium: boolean; serverPremium: boolean; freeUsed: number };

const save = (s: Persisted) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s)).catch(() => {});

const clampFree = (n: number) => Math.min(Math.max(n, 0), FREE_QUESTION_LIMIT);

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isPremium: DEV_FREE_PREMIUM,
  storePremium: false,
  serverPremium: false,
  freeUsed: 0,

  hydrate: () => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        // Older builds stored a daily count ({ date, used }); it doesn't carry over, so updating
        // readers start with their one free question and the server decides from there.
        const s = JSON.parse(raw) as Partial<Persisted>;
        const storePremium = !!s.storePremium;
        const serverPremium = !!s.serverPremium;
        set({
          storePremium,
          serverPremium,
          isPremium: derivePremium(storePremium, serverPremium),
          freeUsed: clampFree(typeof s.freeUsed === 'number' ? s.freeUsed : 0),
        });
      })
      .catch(() => {});
  },

  remaining: () => {
    const s = get();
    if (s.isPremium) return Number.POSITIVE_INFINITY;
    return Math.max(0, FREE_QUESTION_LIMIT - s.freeUsed);
  },

  canAsk: () => get().remaining() > 0,

  recordAsk: () =>
    set((s) => {
      if (s.isPremium) return s;
      const freeUsed = clampFree(s.freeUsed + 1);
      save({ storePremium: s.storePremium, serverPremium: s.serverPremium, freeUsed });
      return { freeUsed };
    }),

  refundAsk: () =>
    set((s) => {
      if (s.isPremium) return s;
      const freeUsed = clampFree(s.freeUsed - 1);
      save({ storePremium: s.storePremium, serverPremium: s.serverPremium, freeUsed });
      return { freeUsed };
    }),

  markFreeUsedUp: () =>
    set((s) => {
      save({ storePremium: s.storePremium, serverPremium: s.serverPremium, freeUsed: FREE_QUESTION_LIMIT });
      return { freeUsed: FREE_QUESTION_LIMIT };
    }),

  setStorePremium: (value) =>
    set((s) => {
      const storePremium = value;
      save({ storePremium, serverPremium: s.serverPremium, freeUsed: s.freeUsed });
      return { storePremium, isPremium: derivePremium(storePremium, s.serverPremium) };
    }),

  setServerPremium: (value) =>
    set((s) => {
      const serverPremium = value;
      save({ storePremium: s.storePremium, serverPremium, freeUsed: s.freeUsed });
      return { serverPremium, isPremium: derivePremium(s.storePremium, serverPremium) };
    }),

  refreshServerEntitlement: async () => {
    const premium = await fetchServerEntitlement();
    get().setServerPremium(premium);
  },
}));
