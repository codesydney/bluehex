import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

/**
 * A Supabase client for one server request, carrying that request's session.
 *
 * **Build a new one per request.** Never hoist the result to module scope: this
 * client holds a person's access token, and a module-scoped copy is shared by
 * every request the process serves. That is the trap `./anon.ts` documents from
 * the other side, and it is the reason this is a function taking no arguments
 * rather than an exported constant.
 *
 * Server-only by construction — `next/headers` cannot be imported from a client
 * component, so a stray import fails the build rather than shipping the session
 * plumbing to the browser.
 *
 * Suitable for Server Components, Server Actions and Route Handlers. The
 * difference between them is whether cookies can be written, which is what the
 * `try` in `setAll` is about.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  /* `cookies()` first, and the order matters. Awaiting it is what tells Next.js
     the render is request-bound, so a page calling this is never prerendered at
     build time. Reading the environment first instead makes `next build` try to
     prerender `/profile` and `/admin`, reach the throw in `supabaseEnv`, and
     fail the whole build on a clone with no `.env.local` — the one thing the
     lazy client exists to prevent. */
  const store = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          /* A Server Component render cannot set cookies — HTTP will not take a
             `Set-Cookie` once the response has started streaming. That is not an
             error here: the refreshed token still reaches the browser, because
             `src/proxy.ts` runs before the render and writes it there. Swallowing
             this is only safe *while* the proxy runs on the route; if a route is
             ever excluded from the matcher, its sessions stop refreshing and the
             symptom is a user logged out an hour later for no visible reason. */
        }
      },
    },
  });
}
