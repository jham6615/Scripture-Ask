import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { AccountButton } from '@/features/auth/account-button';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_BOOK_ID, type ReadingPage, getBooks, getReadingPages } from '@/lib/bible';
import { useChatStore } from '@/store/chat-store';
import { useReaderStore } from '@/store/reader-store';
import { useSelectionStore } from '@/store/selection-store';
import { useVersionStore } from '@/store/versions-store';
import { BiblePicker } from './bible-picker';
import { ChapterPage } from './chapter-page';
import { VersionPicker } from './version-picker';

export function ReaderScreen({ peekInset = 0 }: { peekInset?: number }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Every chapter of the whole Bible becomes a swipeable page; the picker jumps between them.
  const pages = useMemo(() => getReadingPages(), []);
  const books = useMemo(() => getBooks(), []);
  const initialIndex = useMemo(
    () => Math.max(0, pages.findIndex((p) => p.bookId === DEFAULT_BOOK_ID && p.chapter === 1)),
    [pages],
  );

  const [pageIndex, setPageIndex] = useState(initialIndex);
  const [picker, setPicker] = useState<'none' | 'book' | 'version'>('none');
  const listRef = useRef<FlatList<ReadingPage>>(null);
  const clearSelection = useSelectionStore((s) => s.clear);
  const setPosition = useReaderStore((s) => s.setPosition);
  const versionCode = useVersionStore((s) => s.code);
  const setVersion = useVersionStore((s) => s.setVersion);
  const hydrateVersion = useVersionStore((s) => s.hydrate);
  const openHistory = useChatStore((s) => s.setHistoryOpen);

  const lastIndex = pages.length - 1;
  const current = pages[pageIndex];

  // Restore the saved version on first mount.
  useEffect(() => {
    hydrateVersion();
  }, [hydrateVersion]);

  // Selection is contextual to the visible chapter — clear it when the page changes.
  useEffect(() => {
    clearSelection();
  }, [pageIndex, clearSelection]);

  // Keep the reader position in the store so suggestions adapt to the passage.
  useEffect(() => {
    const p = pages[pageIndex];
    if (p) setPosition({ bookId: p.bookId, bookName: p.bookName, chapter: p.chapter });
  }, [pageIndex, pages, setPosition]);

  const goToPage = (index: number, animated = true) => {
    if (index < 0 || index > lastIndex) return;
    setPicker('none');
    setPageIndex(index);
    listRef.current?.scrollToIndex({ index, animated });
  };

  const jumpTo = (bookId: string, chapter: number) => {
    const index = pages.findIndex((p) => p.bookId === bookId && p.chapter === chapter);
    if (index >= 0) goToPage(index, false);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== pageIndex) setPageIndex(index);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => goToPage(pageIndex - 1)}
          disabled={pageIndex === 0}
          hitSlop={12}
          style={styles.navButton}
        >
          <Text style={[styles.navIcon, { color: theme.text, opacity: pageIndex === 0 ? 0.25 : 1 }]}>‹</Text>
        </Pressable>

        <View style={styles.center}>
          <Pressable onPress={() => setPicker(picker === 'book' ? 'none' : 'book')} hitSlop={8}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {current ? `${current.bookName} ${current.chapter}` : 'Bible'}
              </Text>
              <Text style={[styles.chevron, { color: theme.textSecondary }]}>{picker === 'book' ? '▴' : '▾'}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setPicker(picker === 'version' ? 'none' : 'version')} hitSlop={8}>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {versionCode.toUpperCase()} {picker === 'version' ? '▴' : '▾'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => goToPage(pageIndex + 1)}
          disabled={pageIndex === lastIndex}
          hitSlop={12}
          style={styles.navButton}
        >
          <Text style={[styles.navIcon, { color: theme.text, opacity: pageIndex === lastIndex ? 0.25 : 1 }]}>›</Text>
        </Pressable>
      </View>

      <View style={[styles.account, { top: insets.top }]} pointerEvents="box-none">
        <AccountButton />
      </View>

      <View style={[styles.history, { top: insets.top }]} pointerEvents="box-none">
        <Pressable onPress={() => openHistory(true)} hitSlop={10} style={styles.historyButton}>
          <Text style={[styles.historyIcon, { color: theme.text }]}>☰</Text>
        </Pressable>
      </View>

      {picker === 'book' && (
        <BiblePicker books={books} currentBookId={current?.bookId ?? DEFAULT_BOOK_ID} onSelect={jumpTo} />
      )}
      {picker === 'version' && (
        <VersionPicker
          currentCode={versionCode}
          onSelect={(code, name) => {
            setVersion(code, name);
            setPicker('none');
          }}
        />
      )}

      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(item) => `${item.bookId}-${item.chapter}`}
        renderItem={({ item }) => (
          <ChapterPage
            chapter={item.data}
            width={width}
            bottomInset={insets.bottom + peekInset}
            bookId={item.bookId}
            bookName={item.bookName}
          />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={pageIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollToIndexFailed={({ index }) =>
          listRef.current?.scrollToOffset({ offset: index * width, animated: false })
        }
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  account: { position: 'absolute', right: Spacing.four, paddingVertical: Spacing.two, zIndex: 20 },
  history: { position: 'absolute', left: Spacing.four, paddingVertical: Spacing.two, zIndex: 20 },
  historyButton: { height: 32, justifyContent: 'center' },
  historyIcon: { fontSize: 20 },
  navButton: { width: 40, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 30, lineHeight: 34 },
  center: { alignItems: 'center', flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  title: { fontSize: 18, fontWeight: '600' },
  chevron: { fontSize: 13 },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 1, letterSpacing: 0.4 },
});
