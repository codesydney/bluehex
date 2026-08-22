/**
 * The two environment variables every Supabase client in this repo needs, read
 * at call time rather than at module scope.
 *
 * Reading them eagerly would break `next build` wherever they are absent — CI, a
 * clean clone with no `.env.local` — because every module here is imported
 * during the build even when nothing queries anything. Reading them inside a
 * function moves the failure to the first actual use, which is where it belongs.
 *
 * Both names are written out in full rather than indexed dynamically. Next.js
 * inlines `NEXT_PUBLIC_*` by matching the literal text, so `process.env[name]`
 * silently yields undefined in a browser bundle.
 */

export type SupabaseEnv = { url: string; key: string };

const missing =
  "Supabase is not configured. Copy .env.example to .env.local and fill in " +
  "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — " +
  "`pnpm exec supabase status` prints both for the local stack.";

/**
 * The configuration, or `null` when either half is absent.
 *
 * Only the proxy uses this. Everything else wants the throwing version: a page
 * that cannot reach Supabase should say so rather than render as though the
 * visitor were signed out. The proxy is the exception because it runs on every
 * request including the public ones, and a throw there would take the home page
 * down over a variable the home page does not use. Treating an unconfigured
 * deployment as "nobody is signed in" fails closed — every protected route is
 * then unreachable — and leaves the sign-in form to report the real problem.
 */
export function supabaseEnvOrNull(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return url && key ? { url, key } : null;
}

/** The configuration, or a thrown error naming the two variables. */
export function supabaseEnv(): SupabaseEnv {
  const env = supabaseEnvOrNull();
  if (!env) throw new Error(missing);
  return env;
}
