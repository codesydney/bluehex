import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/* The anonymous client: the publishable key and nothing else, so every query it makes
   is subject to row level security exactly as a visitor's would be. There is no
   server-only client here yet, and no service role key anywhere in the repo — that key
   bypasses RLS outright and belongs only to an admin write path that does not exist
   yet. See AGENTS.md before adding one.

   Signed-in reads will need a second client that carries the user's session from
   cookies (`@supabase/ssr`), which is issue #14's problem, not this one's. */

/* Cached at module scope rather than on `globalThis`. A `globalThis`-only cache tends
   to be skipped in production and leaks a fresh client per call. */
let client: SupabaseClient<Database> | undefined;

export function getClient(): SupabaseClient<Database> {
  if (client) return client;

  /* Read inside the function, never at module top level. This module is imported
     during `next build`, and a build in CI or a preview without these set must still
     succeed — it only has to fail if something actually tries to query. Note the two
     names are written out in full rather than indexed dynamically: Next.js inlines
     `NEXT_PUBLIC_*` by matching the literal text, so `process.env[name]` silently
     yields undefined in the browser bundle. */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — " +
        "`pnpm exec supabase status` prints both for the local stack.",
    );
  }

  /* Both auth options are off because this client is anonymous and shared. auth-js
     defaults them on for a browser, where one client belongs to one person; here a
     single instance is cached at module scope and serves every request in the process,
     so a session stored on it would be visible to all of them. Nothing signs in through
     this client today — turning them off is what keeps that from becoming a silent
     cross-request leak the first time someone reaches for the client that already
     exists. Signed-in reads get their own cookie-backed client; see AGENTS.md. */
  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
