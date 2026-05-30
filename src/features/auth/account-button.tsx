import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from './auth-context';

export function AccountButton() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const initial = session?.user?.email?.[0]?.toUpperCase();

  return (
    <Pressable
      onPress={() => router.push('/auth')}
      hitSlop={8}
      style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
    >
      <Text style={[styles.text, { color: theme.text }]}>{initial ?? 'Sign in'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 13, fontWeight: '700' },
});
