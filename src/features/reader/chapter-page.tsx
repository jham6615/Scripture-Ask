import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Chapter, Verse } from '@/lib/bible';
import { loadChapterVerses } from '@/lib/bible/versions';
import { useSelectionStore } from '@/store/selection-store';
import { useVersionStore } from '@/store/versions-store';

type Props = {
  chapter: Chapter;
  width: number;
  bottomInset: number;
  bookId: string;
  bookName: string;
};

export function ChapterPage({ chapter, width, bottomInset, bookId, bookName }: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const selection = useSelectionStore((s) => s.selection);
  const toggleVerse = useSelectionStore((s) => s.toggleVerse);
  const version = useVersionStore((s) => s.code);

  const [verses, setVerses] = useState<Verse[]>(version === 'web' ? chapter.verses : []);
  const [loading, setLoading] = useState(version !== 'web');

  // Load the active version's text for this chapter (WEB is bundled; others fetch + cache, falling
  // back to the bundled WEB text if the network fails).
  useEffect(() => {
    let cancelled = false;
    if (version === 'web') {
      setVerses(chapter.verses);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadChapterVerses(version, bookId, chapter.chapter)
      .then((vs) => {
        if (cancelled) return;
        setVerses(vs.length ? vs : chapter.verses);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setVerses(chapter.verses);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version, bookId, chapter]);

  const selectedVerses =
    selection && selection.bookId === bookId && selection.chapter === chapter.chapter
      ? selection.verses
      : [];
  const ownsSelection = selectedVerses.length > 0;

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  // Screen Y + scroll offset captured when a verse is tapped, so we can later lift it above the sheet.
  const anchor = useRef<{ pageY: number; scrollY: number } | null>(null);

  // When the keyboard rises (the reader starts typing), scroll the selected verse up so the floating sheet
  // doesn't cover it. Only the chapter that owns the selection subscribes.
  useEffect(() => {
    if (!ownsSelection) return;
    const evt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(evt, () => {
      const a = anchor.current;
      if (!a) return;
      const currentVerseY = a.pageY - (scrollY.current - a.scrollY);
      if (currentVerseY <= height * 0.4) return; // already above where the sheet will sit
      // Park the tapped point in the upper third: visible above the sheet, but not jammed off the top.
      const targetY = height * 0.3;
      scrollRef.current?.scrollTo({ y: Math.max(0, a.pageY + a.scrollY - targetY), animated: true });
    });
    return () => sub.remove();
  }, [ownsSelection, height]);

  return (
    <View style={{ width }}>
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomInset + (ownsSelection ? height * 0.5 : Spacing.six) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <Text style={[styles.chapterNumber, { color: theme.text, fontFamily: Fonts.serif }]}>
            {chapter.chapter}
          </Text>
          {loading ? (
            <ActivityIndicator style={styles.loading} color={theme.textSecondary} />
          ) : (
            <Text style={[styles.body, { color: theme.text, fontFamily: Fonts.serif }]}>
              {verses.map((v) => {
                const isSelected = selectedVerses.includes(v.verse);
                return (
                  <Text
                    key={v.verse}
                    onPress={(e) => {
                      anchor.current = { pageY: e.nativeEvent.pageY, scrollY: scrollY.current };
                      toggleVerse({ bookId, bookName, chapter: chapter.chapter, verse: v.verse });
                    }}
                    style={isSelected ? { backgroundColor: theme.backgroundSelected } : undefined}
                  >
                    <Text style={[styles.verseNumber, { color: theme.textSecondary }]}>{`${v.verse} `}</Text>
                    {v.text}
                    {'  '}
                  </Text>
                );
              })}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, alignItems: 'center' },
  page: { width: '100%', maxWidth: MaxContentWidth },
  chapterNumber: { fontSize: 44, fontWeight: '700', marginBottom: Spacing.three },
  body: { fontSize: 19, lineHeight: 32 },
  verseNumber: { fontSize: 12, fontWeight: '700' },
  loading: { marginTop: Spacing.five },
});
