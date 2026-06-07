import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatReference } from '@/features/selection/actions';
import { useTheme } from '@/hooks/use-theme';
import { useChatStore } from '@/store/chat-store';
import { useSelectionStore } from '@/store/selection-store';
import { useSuggestionsStore } from '@/store/suggestions-store';

/**
 * Header for the chat column in the desktop split-pane layout. Owns the chat-scoped affordances —
 * history, refresh suggestions, and starting a new chat. (Collapse lives on the divider between the
 * panes; see SplitPane.)
 */
export function ChatColumnHeader() {
  const theme = useTheme();
  const selection = useSelectionStore((s) => s.selection);
  const openHistory = useChatStore((s) => s.setHistoryOpen);
  const newChat = useChatStore((s) => s.newChat);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const refresh = useSuggestionsStore((s) => s.refresh);
  const refreshing = useSuggestionsStore((s) => s.loading);

  const referenceLabel = selection ? formatReference(selection) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <IconButton label="Chat history" onPress={() => openHistory(true)} icon="☰" color={theme.text} />
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          Chat
        </Text>
        <View style={styles.actions}>
          <IconButton
            label="Refresh suggestions"
            onPress={refresh}
            disabled={refreshing}
            icon="↻"
            color={theme.textSecondary}
          />
          {/* Labeled so its purpose is obvious — starts a fresh conversation. */}
          <Pressable
            onPress={newChat}
            disabled={!hasMessages}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="New chat"
            style={[styles.newButton, { borderColor: theme.backgroundSelected, opacity: hasMessages ? 1 : 0.4 }]}
          >
            <Text style={[styles.newButtonText, { color: theme.text }]}>＋ New</Text>
          </Pressable>
        </View>
      </View>
      {referenceLabel && (
        <Text style={[styles.reference, { color: theme.textSecondary }]} numberOfLines={1}>
          {referenceLabel}
        </Text>
      )}
    </View>
  );
}

type IconButtonProps = {
  label: string;
  onPress: () => void;
  icon: string;
  color: string;
  disabled?: boolean;
};

function IconButton({ label, onPress, icon, color, disabled }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.iconButton}
    >
      <Text style={[styles.icon, { color, opacity: disabled ? 0.35 : 1 }]}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.four, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18, fontWeight: '600', lineHeight: 22 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: Spacing.two,
    height: 28,
  },
  newButtonText: { fontSize: 13, fontWeight: '600' },
  reference: { fontSize: 13, fontWeight: '600' },
});
