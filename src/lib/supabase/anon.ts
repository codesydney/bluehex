import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

/* The anonymous client: the publishable key and nothing else, so every query it
   makes is subject to row level security exactly as a visitor's would be. There
   is no service role key anywhere in the repo — that key bypasses RLS outright
   and belongs only to an admin write path that does not exist yet. See AGENTS.md
   before adding one.

   This is the client for a read that has no reader: the public directory, a
   profile page, anything `anon` is granted. A signed-in read wants
   `./server.ts` (per request, from cookies) or `./browser.ts` instead — see the
   caching note below for why this one must never become either. */

/* Cached at module scope rather than on `globalThis`. A `globalThis`-only cache tends
   to be skipped in production and leaks a fresh client per call. */
let client: SupabaseClient<Database> | undefined;

export function getClient(): SupabaseClient<Database> {
  if (client) return client;

  const { url, key } = supabaseEnv();

  /* Both auth options are off because this client is anonymous and shared. auth-js
     defaults them on for a browser, where one client belongs to one person; here a
     single instance is cached at module scope and serves every request in the process,
     so a session stored on it would be visible to all of them. Nothing signs in through
     this client, and nothing may: the two clients that carry a session are built fresh
     per request, and turning these flags on here is what would silently turn one
     visitor's session into every visitor's. */
  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
