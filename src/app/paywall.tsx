import { useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EULA_URL, PRIVACY_POLICY_URL, SUBSCRIPTION_LENGTHS, SUBSCRIPTION_TITLE } from '@/constants/legal';
import { Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { startWebCheckout } from '@/lib/billing';
import { getCurrentOffering, purchasePackage, purchasesReady, restorePurchases } from '@/lib/revenuecat';

type PlanId = 'annual' | 'monthly';

/** One plan as the paywall shows it, whether it came from the App Store (RevenueCat) or Stripe (web). */
type PlanView = {
  id: PlanId;
  label: string;
  /** The amount billed each period, e.g. "$39.99". Always the most prominent price (Apple 3.1.2). */
  price: string;
  period: 'year' | 'month';
  /** Monthly equivalent of the annual price, shown as secondary text. */
  perMonth?: string;
  savePercent?: number;
  /** Native only: the RevenueCat package to buy. */
  pkg?: PurchasesPackage;
};

/**
 * Web (Stripe) prices shown on the paywall. Keep in sync with the Stripe Prices behind
 * STRIPE_PRICE_ID_ANNUAL / STRIPE_PRICE_ID in create-checkout. There is no free trial: the first
 * payment is taken at checkout, on web and in the App Store alike.
 * Native prices are never hard-coded: they come from the App Store through RevenueCat.
 */
const WEB_PLANS: PlanView[] = [
  { id: 'annual', label: 'Yearly', price: '$39.99', period: 'year', perMonth: '$3.33', savePercent: 67 },
  { id: 'monthly', label: 'Monthly', price: '$9.99', period: 'month' },
];

const BENEFITS = [
  'Unlimited AI conversations',
  'Every translation & language',
  'First access to new features',
  'Support the mission',
];

const openLegal = (href: string) =>
  void openBrowserAsync(href, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });

/**
 * Build the plan list from the current RevenueCat offering: annual first, then monthly.
 * The App Store products must have no introductory offer: the disclosure below says payment is taken at
 * purchase confirmation.
 */
function nativePlans(offering: PurchasesOffering | null): PlanView[] {
  if (!offering) return [];
  const annual = offering.annual;
  const monthly = offering.monthly ?? (annual ? null : (offering.availablePackages[0] ?? null));

  const plans: PlanView[] = [];
  if (annual) {
    const save =
      monthly && monthly.product.price > 0
        ? Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100)
        : 0;
    plans.push({
      id: 'annual',
      label: 'Yearly',
      price: annual.product.priceString,
      period: 'year',
      perMonth: annual.product.pricePerMonthString ?? undefined,
      savePercent: save > 0 ? save : undefined,
      pkg: annual,
    });
  }
  if (monthly) {
    plans.push({
      id: 'monthly',
      label: 'Monthly',
      price: monthly.product.priceString,
      period: 'month',
      pkg: monthly,
    });
  }
  return plans;
}

const RENEWAL_TERMS =
  'The subscription renews automatically unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in your App Store account settings.';

/**
 * Required by App Store Review Guideline 3.1.2(c) for auto-renewable subscriptions: the paywall
 * must state the subscription's title, length, price, auto-renewal terms, and cancel path. Wording
 * follows Apple's recommended template — do not soften without revisiting that guideline.
 */
function appleDisclosure(plan: PlanView): string {
  return `${SUBSCRIPTION_TITLE} is a ${SUBSCRIPTION_LENGTHS[plan.id]} auto-renewing subscription at ${plan.price}/${plan.period}. Payment is charged to your Apple ID at purchase confirmation. ${RENEWAL_TERMS}`;
}

function webDisclosure(plan: PlanView): string {
  return `${SUBSCRIPTION_TITLE} is a ${SUBSCRIPTION_LENGTHS[plan.id]} auto-renewing subscription at ${plan.price}/${plan.period}, billed by Stripe when you subscribe. Cancel anytime from the Stripe billing portal linked in your receipt.`;
}

export default function PaywallScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { session } = useAuth();
  // Payment is only allowed when signed in, so every subscription is bound to a Supabase account from
  // the moment of purchase — that account is the source of truth and unlocks premium on every platform
  // (including the server-side AI check).
  const signedIn = !!session;

  const isWeb = Platform.OS === 'web';
  const ready = purchasesReady();
  const [loading, setLoading] = useState(!isWeb && ready);
  const [nativeList, setNativeList] = useState<PlanView[]>([]);
  const [selected, setSelected] = useState<PlanId>('annual');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isWeb || !ready) return;
    let active = true;
    getCurrentOffering()
      .then(nativePlans)
      .then((list) => {
        if (!active) return;
        setNativeList(list);
        // Annual is the default; fall back to whatever the offering has if annual isn't set up yet.
        if (list.length > 0 && !list.some((p) => p.id === 'annual')) setSelected(list[0].id);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [isWeb, ready]);

  const plans = isWeb ? WEB_PLANS : nativeList;
  const plan = plans.find((p) => p.id === selected) ?? plans[0];

  const ctaLabel = signedIn ? 'Subscribe' : 'Sign in to subscribe';

  // Web: hand off to Stripe Checkout (full-page redirect). On success Stripe returns the browser to
  // PUBLIC_SITE_URL/?checkout=success, where the app refreshes the entitlement and unlocks premium.
  const subscribeWeb = async () => {
    if (!signedIn) {
      router.push('/auth'); // must be signed in to subscribe; returns here after sign-in
      return;
    }
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    const result = await startWebCheckout(plan.id);
    if (!result.ok) {
      setBusy(false);
      setMessage(result.message ?? 'Could not start checkout. Please try again.');
    }
    // On success the browser navigates away to Stripe, so we intentionally leave `busy` set.
  };

  const subscribe = async () => {
    if (!signedIn) {
      router.push('/auth'); // must be signed in to subscribe; returns here after sign-in
      return;
    }
    if (!plan?.pkg) return;
    setBusy(true);
    setMessage(null);
    const result = await purchasePackage(plan.pkg);
    setBusy(false);
    if (result.status === 'success') {
      router.back();
    } else if (result.status === 'error') {
      setMessage(result.message);
    }
    // 'cancelled' → silently stay on the paywall
  };

  const restore = async () => {
    // A restored subscription has to attach to an account too, or the server-side AI check can't see it.
    if (!signedIn) {
      router.push('/auth');
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await restorePurchases();
    setBusy(false);
    if (result.premium) router.back();
    else setMessage(result.message ?? 'No previous purchases found.');
  };

  // When not signed in, the button is still tappable — it routes to sign-in (no package needed yet).
  const canBuy = !busy && (isWeb || !signedIn || !!plan?.pkg);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.five }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: theme.textSecondary }]}>BEACON BIBLE PREMIUM</Text>
        <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.serif }]}>Go deeper, with no limits.</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Scripture is always free. Premium unlocks the AI study partner, so you can ask about any passage as
          often as you like.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Text style={[styles.check, { color: theme.text }]}>✓</Text>
              <Text style={[styles.benefitText, { color: theme.text }]}>{b}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        {!isWeb && !ready ? (
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Premium subscriptions are available in the Beacon Bible app on your phone.
          </Text>
        ) : loading ? (
          <ActivityIndicator color={theme.text} style={{ paddingVertical: Spacing.three }} />
        ) : !plan ? (
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Subscriptions aren’t available just yet. Please check back soon.
          </Text>
        ) : (
          <>
            <View style={styles.plans} accessibilityRole="radiogroup">
              {plans.map((p) => (
                <PlanOption
                  key={p.id}
                  plan={p}
                  selected={p.id === plan.id}
                  onPress={() => setSelected(p.id)}
                  theme={theme}
                />
              ))}
            </View>

            <Pressable
              onPress={isWeb ? subscribeWeb : subscribe}
              disabled={!canBuy}
              style={[styles.primary, { backgroundColor: theme.text, opacity: canBuy ? 1 : 0.4 }]}
            >
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <Text style={[styles.primaryText, { color: theme.background }]}>{ctaLabel}</Text>
              )}
            </Pressable>

            {message ? <Text style={[styles.note, { color: theme.textSecondary }]}>{message}</Text> : null}

            {isWeb && !signedIn ? (
              <Text style={[styles.note, { color: theme.textSecondary }]}>
                Sign in so your Premium works across iPhone, web, and desktop.
              </Text>
            ) : null}

            <Text style={[styles.disclosure, { color: theme.textSecondary }]}>
              {isWeb ? webDisclosure(plan) : appleDisclosure(plan)}
            </Text>

            {!isWeb ? (
              <Pressable onPress={restore} disabled={busy} style={styles.linkBtn}>
                <Text style={[styles.link, { color: theme.textSecondary }]}>Restore purchases</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <LegalLinks theme={theme} />

        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <Text style={[styles.link, { color: theme.textSecondary }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ThemeShape = ReturnType<typeof useTheme>;

/** A selectable plan row. The billed price is the most prominent number; the monthly equivalent is secondary. */
function PlanOption({
  plan,
  selected,
  onPress,
  theme,
}: {
  plan: PlanView;
  selected: boolean;
  onPress: () => void;
  theme: ThemeShape;
}) {
  const detail = [
    plan.perMonth ? `${plan.perMonth}/mo` : null,
    plan.period === 'year' ? 'billed yearly' : 'billed monthly',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${plan.label}, ${plan.price} per ${plan.period}`}
      style={[
        styles.plan,
        {
          borderColor: selected ? theme.text : theme.backgroundSelected,
          backgroundColor: selected ? theme.backgroundElement : 'transparent',
        },
      ]}
    >
      <View style={styles.planText}>
        <View style={styles.planTitleRow}>
          <Text style={[styles.planLabel, { color: theme.text }]}>{plan.label}</Text>
          {plan.savePercent ? (
            <View style={[styles.badge, { backgroundColor: theme.text }]}>
              <Text style={[styles.badgeText, { color: theme.background }]}>SAVE {plan.savePercent}%</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.planDetail, { color: theme.textSecondary }]}>{detail}</Text>
      </View>
      <Text style={[styles.planPrice, { color: theme.text }]}>
        {plan.price}
        <Text style={[styles.per, { color: theme.textSecondary }]}> / {plan.period}</Text>
      </Text>
    </Pressable>
  );
}

/** Required by Apple 3.1.2(c): functional links to Privacy Policy and Terms of Use on the paywall. */
function LegalLinks({ theme }: { theme: ThemeShape }) {
  return (
    <View style={styles.legalRow}>
      <Pressable
        onPress={() => openLegal(PRIVACY_POLICY_URL)}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="Privacy Policy"
      >
        <Text style={[styles.legalLink, { color: theme.textSecondary }]}>Privacy Policy</Text>
      </Pressable>
      <Text style={[styles.legalSep, { color: theme.textSecondary }]}>·</Text>
      <Pressable
        onPress={() => openLegal(EULA_URL)}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="Terms of Use"
      >
        <Text style={[styles.legalLink, { color: theme.textSecondary }]}>Terms of Use</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.four },
  content: { paddingBottom: Spacing.four, gap: Spacing.three },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 16, lineHeight: 22 },
  benefits: { gap: Spacing.three, marginTop: Spacing.two },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  check: { fontSize: 18, fontWeight: '800' },
  benefitText: { fontSize: 17 },
  footer: { gap: Spacing.two },
  plans: { gap: Spacing.two },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  planText: { flex: 1, gap: 2 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  planLabel: { fontSize: 16, fontWeight: '700' },
  planDetail: { fontSize: 13 },
  planPrice: { fontSize: 17, fontWeight: '700' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  per: { fontSize: 13, fontWeight: '500' },
  primary: {
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryText: { fontSize: 17, fontWeight: '700' },
  note: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
  // Apple 3.1.2(c) disclosure: smaller than body text but explicitly readable, multi-line.
  disclosure: { fontSize: 11, textAlign: 'center', lineHeight: 15, paddingHorizontal: Spacing.two },
  linkBtn: { alignItems: 'center', paddingVertical: Spacing.two },
  link: { fontSize: 14 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.one },
  legalLink: { fontSize: 13, textDecorationLine: 'underline' },
  legalSep: { fontSize: 13 },
});
