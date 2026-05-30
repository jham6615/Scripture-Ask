// RevenueCat (in-app purchases) seam. Everything that talks to `react-native-purchases` lives here so
// the rest of the app deals in plain promises and a boolean entitlement. RevenueCat is the "store"
// premium source on native (iOS/Android); the subscription store OR's it with the Supabase
// `entitlements` source (web Stripe / cross-platform) and the dev override. See subscription-store.ts.
//
// The key below is the PUBLIC SDK key for the App Store app — it is meant to ship in the binary
// (like the Supabase publishable key). The secret API key is never in the app.

import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { useSubscriptionStore } from '@/store/subscription-store';

const RC_IOS_API_KEY = 'appl_kkqIOFnMolIKqLQYUXzlZDpHZKU';
// const RC_ANDROID_API_KEY = 'goog_...'; // add the Google key here when we ship Android

/** Entitlement identifier configured in RevenueCat that unlocks premium. */
export const PREMIUM_ENTITLEMENT = 'premium';

/** Platform gate (no web SDK). Real native availability is confirmed at configure() time. */
export const purchasesSupported = Platform.OS === 'ios' || Platform.OS === 'android';

type PurchaseError = { userCancelled?: boolean | null; message?: string };

let configured = false;
let nativeReady = false;

function apiKey(): string | null {
  if (Platform.OS === 'ios') return RC_IOS_API_KEY;
  // if (Platform.OS === 'android') return RC_ANDROID_API_KEY;
  return null;
}

const syncStore = (info: CustomerInfo | null | undefined) =>
  useSubscriptionStore.getState().setStorePremium(hasPremium(info));

/** True when the premium entitlement is active in this customer info. */
export function hasPremium(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[PREMIUM_ENTITLEMENT];
}

/** True once the SDK is configured AND the native module is actually present in this binary. */
export function purchasesReady(): boolean {
  return nativeReady;
}

/**
 * Configure the SDK once at startup. Safe everywhere: no-op on web/unsupported, and if the native
 * module is missing (old dev client, Expo Go) it degrades to the free tier instead of crashing.
 */
export function configureRevenueCat(): void {
  if (configured || !purchasesSupported) return;
  const key = apiKey();
  if (!key) return;
  configured = true; // mark attempted so we don't retry on every render

  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: key });
    // Keep the local cache in lockstep with RevenueCat (renewals, expirations, restores, other devices).
    Purchases.addCustomerInfoUpdateListener(syncStore);
    // Pull once now in case no event fires (e.g. unchanged status on a cold start).
    Purchases.getCustomerInfo().then(syncStore).catch(() => {});
    nativeReady = true;
  } catch (e) {
    // RNPurchases native module unavailable. Degrade gracefully so the app still runs.
    nativeReady = false;
    if (__DEV__) console.warn('[revenuecat] native module unavailable — purchases disabled for this build.', e);
  }
}

/** Tie purchases to the signed-in user so they follow the account across devices/reinstalls. */
export async function identifyUser(userId: string | null): Promise<void> {
  configureRevenueCat(); // defensive: ensure configured regardless of effect ordering
  if (!nativeReady) return;
  try {
    if (userId) {
      syncStore((await Purchases.logIn(userId)).customerInfo);
    } else if (!(await Purchases.isAnonymous())) {
      // Only log out a previously-identified user — logging out an already-anonymous user logs a noisy error.
      syncStore(await Purchases.logOut());
    }
  } catch {
    // non-fatal
  }
}

/** The offering marked "current" in RevenueCat (our `default` offering), or null. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!nativeReady) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export type PurchaseOutcome =
  | { status: 'success'; premium: boolean }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Run the store purchase flow for a package and reflect the result in the store. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!nativeReady) return { status: 'error', message: 'In-app purchases aren’t available in this build.' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    syncStore(customerInfo);
    return { status: 'success', premium: hasPremium(customerInfo) };
  } catch (e) {
    const err = e as PurchaseError;
    if (err?.userCancelled) return { status: 'cancelled' };
    return { status: 'error', message: err?.message ?? 'Purchase failed. Please try again.' };
  }
}

/** Restore prior purchases (App Store requirement) and reflect the result in the store. */
export async function restorePurchases(): Promise<{ premium: boolean; message?: string }> {
  if (!nativeReady) return { premium: false, message: 'In-app purchases aren’t available in this build.' };
  try {
    const info = await Purchases.restorePurchases();
    syncStore(info);
    return { premium: hasPremium(info) };
  } catch (e) {
    const err = e as PurchaseError;
    return { premium: false, message: err?.message ?? 'Restore failed. Please try again.' };
  }
}
