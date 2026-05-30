import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Public client config — safe to ship in the app.
// The secret / service_role key is NEVER here; it lives only in the Edge Function (server-side).
const SUPABASE_URL = 'https://gkwcekrthkkumwfztlln.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UPHiWHzV7zWaqY8dZZiaHA_5wFF4AL6';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // OAuth (Google) uses the PKCE code flow; on web the session is read back from the redirect URL.
    flowType: 'pkce',
    detectSessionInUrl: Platform.OS === 'web',
  },
});
