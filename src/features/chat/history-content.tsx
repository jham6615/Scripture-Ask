import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { type ConversationSummary, listConversations } from '@/lib/conversations';
import { useChatStore } from '@/store/chat-store';

/**
 * The conversation list shared by both presentations of chat history: the mobile bottom-sheet Modal
 * and the desktop in-column slide-over panel. It owns its own data fetch (keyed on the store's
 * `historyOpen` flag) so either wrapper can simply mount it.
 */
export function HistoryContent({ onClose, onOpened }: { onClose: () => void; onOpened?: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();

  const open = useChatStore((s) => s.historyOpen);
  const openConversation = useChatStore((s) => s.openConversation);
  const newChat = useChatStore((s) => s.newChat);
  const currentId = useChatStore((s) => s.conversationId);

  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    setLoading(true);
    listConversations()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [open, session]);

  const onPick = async (id: string) => {
    await openConversation(id);
    onClose();
    onOpened?.();
  };

  const onNew = () => {
    newChat();
    onClose();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.three }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to chat">
          <Text style={[styles.back, { color: theme.textSecondary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.serif }]}>Chats</Text>
        <View style={styles.backSpacer} />
      </View>

      <Pressable onPress={onNew} style={[styles.newRow, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.newText, { color: theme.text }]}>＋  New chat</Text>
      </Pressable>

      {!session ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Sign in to save your conversations and pick up where you left off.
          </Text>
          <Pressable
            onPress={() => {
              onClose();
              router.push('/auth');
            }}
            style={[styles.signIn, { backgroundColor: theme.text }]}
          >
            <Text style={[styles.signInText, { color: theme.background }]}>Sign in</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.five }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No saved conversations yet. Ask a question to start one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.id)}
              style={[styles.item, item.id === currentId && { backgroundColor: theme.backgroundElement }]}
            >
              <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                {[item.reference, formatWhen(item.updatedAt)].filter(Boolean).join('  ·  ')}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  back: { fontSize: 28, fontWeight: '600', width: 24 },
  backSpacer: { width: 24 },
  title: { flex: 1, fontSize: 26, fontWeight: '700' },
  newRow: { borderRadius: 12, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three, marginBottom: Spacing.three },
  newText: { fontSize: 16, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: Spacing.six, gap: Spacing.three },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  signIn: { borderRadius: 14, paddingVertical: Spacing.three, paddingHorizontal: Spacing.five, minHeight: 48, justifyContent: 'center' },
  signInText: { fontSize: 16, fontWeight: '700' },
  item: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: 12, gap: 2 },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemMeta: { fontSize: 13 },
});
