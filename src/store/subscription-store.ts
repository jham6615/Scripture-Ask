import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

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

type SubscriptionState = {
  isPremium: boolean;
  date: string; // the day `used` counts toward
  used: number; // AI questions asked today
  hydrate: () => void;
  /** Free questions left today (Infinity when premium). */
  remaining: () => number;
  canAsk: () => boolean;
  recordAsk: () => void;
  setPremium: (value: boolean) => void;
};

const save = (s: { isPremium: boolean; date: string; used: number }) =>
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s)).catch(() => {});

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isPremium: DEV_FREE_PREMIUM,
  date: todayKey(),
  used: 0,

  hydrate: () => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as Partial<{ isPremium: boolean; date: string; used: number }>;
        set({ isPremium: DEV_FREE_PREMIUM || !!s.isPremium, date: s.date ?? todayKey(), used: s.used ?? 0 });
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
      save({ isPremium: s.isPremium, date: d, used });
      return { date: d, used };
    }),

  setPremium: (value) =>
    set((s) => {
      const effective = DEV_FREE_PREMIUM || value;
      save({ isPremium: effective, date: s.date, used: s.used });
      return { isPremium: effective };
    }),
}));
