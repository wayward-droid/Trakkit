import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let client;
/** Create one client per page from the bundled, pinned supabase-js v2.57.4. */
export async function getClient() {
  if (!configured)
    throw new Error(
      "Account access is not configured yet. Follow the included setup guide.",
    );
  if (SUPABASE_ANON_KEY.startsWith("sb_secret_"))
    throw new Error("Use a public publishable key, never a secret key.");
  if (!client) {
    if (!globalThis.supabase?.createClient)
      throw new Error(
        "The Supabase client did not load. Refresh the page and try again.",
      );
    client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
