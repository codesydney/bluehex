import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

/**
 * The browser client: one per tab, storing the session in cookies.
 *
 * Cookies rather than local storage is the whole point of `@supabase/ssr`. The
 * server has to be able to read the session too — the proxy refreshes it and
 * every Server Component reads it — and only a cookie is sent with the request.
 *
 * `createBrowserClient` is already a singleton (`isSingleton` defaults true), so
 * calling this from several components hands back the same instance rather than
 * one client per render. That is safe here and is not safe in `./anon.ts`: a
 * browser bundle serves one person, a server process serves everybody.
 *
 * Its one job today is the magic-link request, which is a client-side call
 * because the PKCE code verifier it generates has to be written where the
 * callback route can read it back — the same cookie jar, from the same browser.
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  const { url, key } = supabaseEnv();
  return createBrowserClient<Database>(url, key);
}
