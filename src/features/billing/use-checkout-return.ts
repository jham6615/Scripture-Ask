import { useEffect } from 'react';
import { Platform } from 'react-native';

import { syncEntitlement } from '@/lib/billing';
import { useSubscriptionStore } from '@/store/subscription-store';

type WebGlobals = {
  location: { href: string };
  history: { replaceState: (data: unknown, unused: string, url: string) => void };
  setTimeout: (fn: () => void, ms: number) => unknown;
};

/**
 * Web-only. After Stripe Checkout, the browser returns to PUBLIC_SITE_URL/?checkout=success (or
 * ?checkout=cancel). The Stripe webhook writes the entitlement asynchronously, so on a `success`
 * return we poll the entitlement a few times until premium lands, then strip the query param so a
 * refresh doesn't re-trigger. No-op on native and when there's no `checkout` param.
 */
export function useCheckoutReturn(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const g = globalThis as unknown as WebGlobals;
    const url = new URL(g.location.href);
    const status = url.searchParams.get('checkout');
    if (!status) return;

    // Clean the URL immediately so a reload doesn't re-run this flow.
    url.searchParams.delete('checkout');
    g.history.replaceState({}, '', url.toString());

    if (status !== 'success') return;

    let tries = 0;
    const tick = async () => {
      tries += 1;
      // Pull the authoritative status from Stripe into the entitlements table (robust to webhook
      // lag / a transient "incomplete" snapshot), then reflect it in the local store.
      await syncEntitlement();
      await useSubscriptionStore.getState().refreshServerEntitlement();
      if (useSubscriptionStore.getState().serverPremium || tries >= 4) return;
      g.setTimeout(tick, 2000);
    };
    void tick();
  }, []);
}
