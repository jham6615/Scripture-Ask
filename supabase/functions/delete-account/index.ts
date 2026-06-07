// Supabase Edge Function — permanently delete the signed-in user's account.
//
// Called from the in-app "Delete account" confirmation (auth.tsx). The client forwards the user's
// Supabase JWT; we identify them via auth.getUser, then use the service-role client to call
// auth.admin.deleteUser. The FK constraints on public.conversations.user_id and public.entitlements.user_id
// are `on delete cascade`, so their rows go with the auth row — no manual cleanup required.
//
// Required for Apple App Review (Guideline 5.1.1(v)): apps that allow account creation must let the
// user delete the account from inside the app.
//
// Auto-injected by Supabase (do NOT set): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return Response.json({ error: 'Not signed in' }, { status: 401, headers: cors });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    return Response.json({ ok: true }, { headers: cors });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: cors },
    );
  }
});
