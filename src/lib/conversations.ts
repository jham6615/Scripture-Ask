// Per-account saved conversations (ChatGPT/Gemini-style history), backed by the `conversations`
// table in Supabase. All calls are no-ops for signed-out users (RLS + the uid() guard), so the
// chat simply stays local until the user signs in.

import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/store/chat-store';

export type ConversationSummary = {
  id: string;
  title: string;
  reference: string | null;
  updatedAt: string;
};

export type Conversation = ConversationSummary & { messages: ChatMessage[] };

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Strip transient fields (e.g. `pending`) before persisting. */
function clean(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => !m.pending)
    .map(({ id, role, text, prompt, response }) => ({ id, role, text, prompt, response }));
}

/** Most-recent-first list for the history drawer. Empty for signed-out users. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, reference, updated_at')
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, title: r.title, reference: r.reference, updatedAt: r.updated_at }));
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, reference, messages, updated_at')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    title: data.title,
    reference: data.reference,
    updatedAt: data.updated_at,
    messages: Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [],
  };
}

/** Create a row for a new conversation; returns its id, or null if signed out / failed. */
export async function createConversation(
  title: string,
  reference: string | null,
  messages: ChatMessage[],
): Promise<string | null> {
  const userId = await uid();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title, reference, messages: clean(messages) })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function updateConversation(
  id: string,
  messages: ChatMessage[],
  title?: string,
  reference?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { messages: clean(messages), updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = title;
  if (reference !== undefined) patch.reference = reference;
  await supabase.from('conversations').update(patch).eq('id', id);
}

export async function deleteConversation(id: string): Promise<void> {
  await supabase.from('conversations').delete().eq('id', id);
}
