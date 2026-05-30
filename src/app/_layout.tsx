import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/features/auth/auth-context';
import { useCheckoutReturn } from '@/features/billing/use-checkout-return';
import { configureRevenueCat } from '@/lib/revenuecat';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const background = Colors[colorScheme === 'dark' ? 'dark' : 'light'].background;

  // Initialize in-app purchases once at startup (no-op on web / unsupported platforms).
  useEffect(() => {
    configureRevenueCat();
  }, []);

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
