import { supabase } from '@/lib/supabase';

/**
 * Permanently delete the signed-in user's account.
 *
 * Calls the delete-account Edge Function (which uses the service role to call auth.admin.deleteUser).
 * Conversations and entitlements cascade via FK. The caller is responsible for signing out + routing
 * after this resolves — the existing session JWT is harmless once the user row is gone.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
}
