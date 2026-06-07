import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type VersionMeta, fetchVersions } from '@/lib/bible/versions';
import { BackRow, SearchInput } from './picker-chrome';

type Props = {
  currentCode: string;
  onSelect: (code: string, name: string) => void;
};

/**
 * Two-step version picker: browse languages, tap one to see its versions, or search across every
 * version/language at once. Opens straight to the current version's language. Fetched once from
 * getbible (module-cached); a failed load offers a retry.
 */
export function VersionPicker({ currentCode, onSelect }: Props) {
  const theme = useTheme();
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openLang, setOpenLang] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Auto-open the current language exactly once — never fight the user's collapse afterward.
  const didInit = useRef(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchVersions()
      .then((v) => !cancelled && setVersions(v))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (didInit.current || !versions) return;
    didInit.current = true;
    setOpenLang(versions.find((v) => v.code === currentCode)?.languageName ?? null);
  }, [versions, currentCode]);

  // Languages, English first then alphabetical.
  const groups = useMemo(() => {
    if (!versions) return [] as [string, VersionMeta[]][];
    const byLang = new Map<string, VersionMeta[]>();
    for (const v of versions) {
      const arr = byLang.get(v.languageName) ?? [];
      arr.push(v);
      byLang.set(v.languageName, arr);
    }
    return [...byLang.entries()].sort((a, b) => {
      if (a[0] === 'English') return -1;
      if (b[0] === 'English') return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [versions]);

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q || !versions) return [];
    return versions.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.code.toLowerCase().includes(q) ||
        v.languageName.toLowerCase().includes(q),
    );
  }, [versions, q]);

  if (failed) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Text style={{ color: theme.textSecondary }}>Couldn’t load versions.</Text>
        <Pressable onPress={() => setReloadKey((k) => k + 1)} style={[styles.retry, { backgroundColor: theme.text }]}>
          <Text style={{ color: theme.background, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!versions) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  const renderVersion = (v: VersionMeta) => {
    const active = v.code === currentCode;
    return (
      <Pressable
        key={v.code}
        onPress={() => onSelect(v.code, v.name)}
        style={[styles.versionRow, active && { backgroundColor: theme.backgroundElement }]}
      >
        <Text style={[styles.versionName, { color: theme.text }]} numberOfLines={1}>
          {v.name}
        </Text>
        <Text style={[styles.code, { color: active ? theme.text : theme.textSecondary }]}>
          {active ? '✓ ' : ''}
          {v.code.toUpperCase()}
        </Text>
      </Pressable>
    );
  };

  // Search overrides into a flat result list across all languages.
  if (q) {
    return (
      <View style={styles.fill}>
        <SearchInput value={query} onChangeText={setQuery} placeholder="Search versions or languages" />
        <ScrollView style={styles.fill} contentContainerStyle={styles.inner} bounces={false} keyboardShouldPersistTaps="handled">
          {searchResults.map(renderVersion)}
          {searchResults.length === 0 && (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>No versions match “{query}”.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // Leaf: one language's versions.
  if (openLang) {
    const items = groups.find(([lang]) => lang === openLang)?.[1] ?? [];
    return (
      <View style={styles.fill}>
        <SearchInput value={query} onChangeText={setQuery} placeholder="Search versions or languages" />
        <BackRow label="Languages" onPress={() => setOpenLang(null)} />
        <ScrollView style={styles.fill} contentContainerStyle={styles.inner} bounces={false} keyboardShouldPersistTaps="handled">
          <Text style={[styles.langHeading, { color: theme.text }]}>{openLang}</Text>
          {items.map(renderVersion)}
        </ScrollView>
      </View>
    );
  }

  // Language list.
  return (
    <View style={styles.fill}>
      <SearchInput value={query} onChangeText={setQuery} placeholder="Search versions or languages" />
      <ScrollView style={styles.fill} contentContainerStyle={styles.inner} bounces={false} keyboardShouldPersistTaps="handled">
        {groups.map(([lang, items]) => (
          <Pressable key={lang} onPress={() => setOpenLang(lang)} style={styles.langRow}>
            <Text style={[styles.langName, { color: theme.text }]}>{lang}</Text>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>
              {items.length} ›
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  retry: { borderRadius: 12, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingBottom: Spacing.three },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  langName: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 14 },
  langHeading: { fontSize: 20, fontWeight: '700', paddingVertical: Spacing.two },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
  },
  versionName: { fontSize: 15, flexShrink: 1 },
  code: { fontSize: 12, fontWeight: '700' },
  empty: { fontSize: 15, textAlign: 'center', paddingTop: Spacing.five },
});
