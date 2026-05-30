import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { fetchServerEntitlement } from '@/lib/entitlements';

/** Free users get this many AI questions per day; premium is unlimited. */
export const FREE_DAILY_LIMIT = 5;

const STORAGE_KEY = 'bf:subscription';
const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

/**
 * Dev override. In Metro-served dev builds (`__DEV__` true), unconditionally treat the user
 * as premium so the paywall + daily counter don't block iteration. This matters in particular
 * because the dev variant has its own bundle ID (com.shuttlementor.biblefriend.dev) for which
 * Apple has no IAP products configured — so RevenueCat returns no offerings and the paywall
 * would otherwise be a dead end. Release builds (TestFlight, App Store) have `__DEV__` false
 * and behave normally.
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
  date: string; // the day `used` counts toward
  used: number; // AI questions asked today
  hydrate: () => void;
  /** Free questions left today (Infinity when premium). */
  remaining: () => number;
  canAsk: () => boolean;
  recordAsk: () => void;
  /** Set by RevenueCat (native store purchases). */
  setStorePremium: (value: boolean) => void;
  /** Set by the Supabase entitlements refresh (web Stripe / cross-platform). */
  setServerPremium: (value: boolean) => void;
  /** Re-read the signed-in user's entitlement from Supabase and fold it in. */
  refreshServerEntitlement: () => Promise<void>;
};

type Persisted = { storePremium: boolean; serverPremium: boolean; date: string; used: number };

const save = (s: Persisted) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s)).catch(() => {});

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isPremium: DEV_FREE_PREMIUM,
  storePremium: false,
  serverPremium: false,
  date: todayKey(),
  used: 0,

  hydrate: () => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as Partial<Persisted>;
        const storePremium = !!s.storePremium;
        const serverPremium = !!s.serverPremium;
        set({
          storePremium,
          serverPremium,
          isPremium: derivePremium(storePremium, serverPremium),
          date: s.date ?? todayKey(),
          used: s.used ?? 0,
        });
      })
      .catch(() => {});
  },

  remaining: () => {
    const s = get();
    if (s.isPremium) return Number.POSITIVE_INFINITY;
    if (s.date !== todayKey()) return FREE_DAILY_LIMIT; // new day → reset on next ask
    return Math.max(0, FREE_DAILY_LIMIT - s.used);
  },

  canAsk: () => get().remaining() > 0,

  recordAsk: () =>
    set((s) => {
      if (s.isPremium) return s;
      const d = todayKey();
      const used = s.date === d ? s.used + 1 : 1;
      save({ storePremium: s.storePremium, serverPremium: s.serverPremium, date: d, used });
      return { date: d, used };
    }),

  setStorePremium: (value) =>
    set((s) => {
      const storePremium = value;
      save({ storePremium, serverPremium: s.serverPremium, date: s.date, used: s.used });
      return { storePremium, isPremium: derivePremium(storePremium, s.serverPremium) };
    }),

  setServerPremium: (value) =>
    set((s) => {
      const serverPremium = value;
      save({ storePremium: s.storePremium, serverPremium, date: s.date, used: s.used });
      return { serverPremium, isPremium: derivePremium(s.storePremium, serverPremium) };
    }),

  refreshServerEntitlement: async () => {
    const premium = await fetchServerEntitlement();
    get().setServerPremium(premium);
  },
}));
