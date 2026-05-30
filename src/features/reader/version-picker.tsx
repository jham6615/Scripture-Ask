import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type VersionMeta, fetchVersions } from '@/lib/bible/versions';

type Props = {
  currentCode: string;
  onSelect: (code: string, name: string) => void;
};

/** Pick a Bible version, grouped by language (English first). Fetched from getbible on open. */
export function VersionPicker({ currentCode, onSelect }: Props) {
  const theme = useTheme();
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openLang, setOpenLang] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVersions()
      .then((v) => !cancelled && setVersions(v))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Group by language, with English on top.
  const groups = useMemo(() => {
    if (!versions) return [];
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

  // Open the current version's language section by default.
  useEffect(() => {
    if (openLang || !versions) return;
    const cur = versions.find((v) => v.code === currentCode);
    if (cur) setOpenLang(cur.languageName);
  }, [versions, currentCode, openLang]);

  if (failed) {
    return (
      <View style={[styles.wrap, styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>Couldn’t load versions. Check your connection.</Text>
      </View>
    );
  }
  if (!versions) {
    return (
      <View style={[styles.wrap, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: theme.background }]} bounces={false}>
      <View style={styles.inner}>
        {groups.map(([lang, items]) => {
          const open = lang === openLang;
          return (
            <View key={lang}>
              <Pressable onPress={() => setOpenLang(open ? null : lang)} style={styles.langRow}>
                <Text style={[styles.langName, { color: theme.text }]}>{lang}</Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]}>
                  {items.length} {open ? '▴' : '▾'}
                </Text>
              </Pressable>

              {open &&
                items.map((v) => {
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
                })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { maxHeight: 380, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  langName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13 },
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
});
