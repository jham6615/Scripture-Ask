import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/features/auth/auth-context';
import { useOAuthCallback } from '@/features/auth/use-oauth-callback';
import { useCheckoutReturn } from '@/features/billing/use-checkout-return';
import { configureRevenueCat } from '@/lib/revenuecat';
import { useSubscriptionStore } from '@/store/subscription-store';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const background = Colors[colorScheme === 'dark' ? 'dark' : 'light'].background;
  const hydrateSubscription = useSubscriptionStore((s) => s.hydrate);

  // Initialize in-app purchases once at startup (no-op on web / unsupported platforms).
  useEffect(() => {
    configureRevenueCat();
  }, []);

  // Restore premium status + today's usage on launch (used by both layouts).
  useEffect(() => {
    hydrateSubscription();
  }, [hydrateSubscription]);

  // Web: finish Google / email-confirmation sign-in by exchanging the ?code= for a session.
  useOAuthCallback();

  // Web: handle the return from Stripe Checkout (refresh entitlement on ?checkout=success).
  useCheckoutReturn();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
