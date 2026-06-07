import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
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
import { PickerDropdown } from './picker-dropdown';
import { ReferenceButton } from './reference-button';
import { VersionPicker } from './version-picker';

// Static data: building the whole-Bible page list and the book summary doesn't need to re-run
// on every mount (or every breakpoint cross).
const PAGES: ReadingPage[] = getReadingPages();
const BOOKS = getBooks();
const DEFAULT_INDEX = Math.max(
  0,
  PAGES.findIndex((p) => p.bookId === DEFAULT_BOOK_ID && p.chapter === 1),
);

const findPageIndex = (bookId: string, chapter: number) => {
  const i = PAGES.findIndex((p) => p.bookId === bookId && p.chapter === chapter);
  return i >= 0 ? i : DEFAULT_INDEX;
};

type Props =
  | {
      /** Mobile bottom-sheet layout. */
      mode: 'sheet';
      /** Height of the collapsed sheet showing above the reader's bottom edge. */
      peekInset: number;
    }
  | {
      /** Desktop split-pane layout. */
      mode: 'column';
      /** Width of the reader's pane — the horizontal pager must size pages to this, not the window. */
      paneWidth: number;
      /** Hide the history button (it moves into the chat column header on desktop). */
      hideHistoryButton?: boolean;
    };

export function ReaderScreen(props: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isSheet = props.mode === 'sheet';
  const width = isSheet ? windowWidth : props.paneWidth;
  const peekInset = isSheet ? props.peekInset : 0;

  // Seed from the store so reading position survives the WideLayout ↔ NarrowLayout swap that
  // happens when the user drags the viewport across the breakpoint.
  const [pageIndex, setPageIndex] = useState(() => {
    const pos = useReaderStore.getState();
    return findPageIndex(pos.bookId, pos.chapter);
  });
  const [picker, setPicker] = useState<'none' | 'book' | 'version'>('none');
  const [headerH, setHeaderH] = useState(56);
  const listRef = useRef<FlatList<ReadingPage>>(null);
  const clearSelection = useSelectionStore((s) => s.clear);
  const setPosition = useReaderStore((s) => s.setPosition);
  const storedBookId = useReaderStore((s) => s.bookId);
  const storedChapter = useReaderStore((s) => s.chapter);
  const versionCode = useVersionStore((s) => s.code);
  const setVersion = useVersionStore((s) => s.setVersion);
  const hydrateVersion = useVersionStore((s) => s.hydrate);
  const openHistory = useChatStore((s) => s.setHistoryOpen);

  const lastIndex = PAGES.length - 1;
  const current = PAGES[pageIndex];

  // Restore the saved version on first mount.
  useEffect(() => {
    hydrateVersion();
  }, [hydrateVersion]);

  // Selection is contextual to the visible chapter — clear it when the page changes.
  useEffect(() => {
    clearSelection();
  }, [pageIndex, clearSelection]);

  // Keep the reader position in the store so suggestions adapt to the passage AND so the next
  // mount of this screen can resume here.
  useEffect(() => {
    const p = PAGES[pageIndex];
    if (p) setPosition({ bookId: p.bookId, bookName: p.bookName, chapter: p.chapter });
  }, [pageIndex, setPosition]);

  // Externally-driven navigation: keyboard shortcuts (and any future deep link) bump the store, and
  // the pager follows. Only reacts to *store* changes; the round-trip from our own pageIndex effect
  // above lands here as a no-op because targetIndex matches pageIndex.
  useEffect(() => {
    const targetIndex = findPageIndex(storedBookId, storedChapter);
    if (targetIndex === pageIndex) return;
    setPicker('none');
    setPageIndex(targetIndex);
    // On web the FlatList isn't rendered, so the ref is null; skip the scroll call entirely.
    if (Platform.OS !== 'web') scrollToPage(targetIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedBookId, storedChapter]);

  // The pager scroll position is in PIXELS — when the pane resizes (chat collapse / divider drag end)
  // the per-page width changes and the current pixel offset no longer points at `pageIndex`. Re-snap
  // using scrollToOffset (which uses the current width directly, sidestepping any stale getItemLayout).
  // Deferred to the next frame so the FlatList has re-measured at the new width.
  // Height available to the FlatList — window minus top inset and header.
  // Passed explicitly to ChapterPage so each page has a defined height on web (without it the
  // inner ScrollView has no height constraint and vertical scrolling breaks).
  const listHeight = windowHeight - insets.top - headerH;

  // Shared RAF handle so any in-flight programmatic scroll can be cancelled before a new one fires.
  const scrollRafRef = useRef<number | null>(null);

  const scrollToPage = (index: number, animated: boolean) => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    // Defer to next frame: React Native Web's FlatList.scrollToOffset must run after the layout
    // pass that processes the state update, otherwise the DOM scroll is ignored.
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      listRef.current?.scrollToOffset({ offset: index * width, animated });
    });
  };

  const lastWidthRef = useRef(width);
  useEffect(() => {
    if (lastWidthRef.current === width) return;
    lastWidthRef.current = width;
    scrollToPage(pageIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, pageIndex]);

  const goToPage = (index: number, animated = true) => {
    if (index < 0 || index > lastIndex) return;
    setPicker('none');
    setPageIndex(index);
    // On web we render only the active chapter directly (no FlatList), so no scroll needed.
    if (Platform.OS !== 'web') scrollToPage(index, animated);
  };

  const jumpTo = (bookId: string, chapter: number) => {
    const index = findPageIndex(bookId, chapter);
    goToPage(index, false);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== pageIndex) setPageIndex(index);
  };

  const hideHistory = props.mode === 'column' && props.hideHistoryButton;

  // Keep the last-opened picker rendered through PickerDropdown's close animation.
  const lastPickerRef = useRef<'book' | 'version'>('book');
  if (picker !== 'none') lastPickerRef.current = picker;
  const activePicker = lastPickerRef.current;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header} onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}>
        <Pressable
          onPress={() => goToPage(pageIndex - 1)}
          disabled={pageIndex === 0}
          hitSlop={12}
          style={styles.navButton}
        >
          <Text style={[styles.navIcon, { color: theme.text, opacity: pageIndex === 0 ? 0.25 : 1 }]}>‹</Text>
        </Pressable>

        <View style={styles.center}>
          <ReferenceButton
            bookLabel={current ? `${current.bookName} ${current.chapter}` : 'Bible'}
            versionLabel={versionCode.toUpperCase()}
            active={picker === 'none' ? null : picker}
            onPressBook={() => setPicker((p) => (p === 'book' ? 'none' : 'book'))}
            onPressVersion={() => setPicker((p) => (p === 'version' ? 'none' : 'version'))}
          />
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

      {!hideHistory && (
        <View style={[styles.history, { top: insets.top }]} pointerEvents="box-none">
          <Pressable onPress={() => openHistory(true)} hitSlop={10} style={styles.historyButton}>
            <Text style={[styles.historyIcon, { color: theme.text }]}>☰</Text>
          </Pressable>
        </View>
      )}

      {Platform.OS === 'web' ? (
        // On web there is no swipe gesture, so instead of a virtualized horizontal FlatList
        // (which has unreliable programmatic-scroll behavior on the web platform), we simply
        // render the active chapter directly. The `key` forces a remount — and a scroll reset
        // to the top — whenever the user navigates to a different chapter.
        <View style={{ flex: 1 }}>
          <ChapterPage
            key={pageIndex}
            chapter={PAGES[pageIndex]?.data ?? PAGES[DEFAULT_INDEX].data}
            width={width}
            pageHeight={listHeight}
            bottomInset={insets.bottom + peekInset}
            bookId={PAGES[pageIndex]?.bookId ?? DEFAULT_BOOK_ID}
            bookName={PAGES[pageIndex]?.bookName ?? ''}
            mode={props.mode}
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={PAGES}
          keyExtractor={(item) => `${item.bookId}-${item.chapter}`}
          renderItem={({ item }) => (
            <ChapterPage
              chapter={item.data}
              width={width}
              pageHeight={listHeight}
              bottomInset={insets.bottom + peekInset}
              bookId={item.bookId}
              bookName={item.bookName}
              mode={props.mode}
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
          windowSize={5}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
        />
      )}

      {/* Book/version pickers slide down from under the header. PickerDropdown keeps the last content
          mounted through its close animation, so we render whichever picker was last active. */}
      <PickerDropdown open={picker !== 'none'} onClose={() => setPicker('none')} top={insets.top + headerH}>
        {activePicker === 'book' ? (
          <BiblePicker
            books={BOOKS}
            currentBookId={current?.bookId ?? DEFAULT_BOOK_ID}
            currentChapter={current?.chapter ?? 1}
            onSelect={jumpTo}
          />
        ) : (
          <VersionPicker
            currentCode={versionCode}
            onSelect={(code, name) => {
              setVersion(code, name);
              setPicker('none');
            }}
          />
        )}
      </PickerDropdown>
    </View>
  );
}

const styles = StyleSheet.create({
  // position:relative makes this the containing block for the absolute PickerDropdown, so on desktop
  // the dropdown confines to the reader pane instead of spilling under the chat column.
  container: { flex: 1, position: 'relative' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  account: { position: 'absolute', right: Spacing.four, paddingVertical: Spacing.two, zIndex: 20 },
  history: { position: 'absolute', left: Spacing.four, paddingVertical: Spacing.two, zIndex: 20 },
  historyButton: { height: 32, justifyContent: 'center' },
  historyIcon: { fontSize: 20 },
  navButton: { width: 40, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 30, lineHeight: 34 },
  center: { flexShrink: 1, alignItems: 'center' },
});
