import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import {
  RETURN_TO_PARAM,
  safeReturnTo,
  SIGN_IN_PATH,
  SIGNED_IN_HOME,
} from "@/lib/auth/routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Where the emailed link lands.
 *
 * Supabase sends the visitor through its own verify endpoint first, which
 * redirects here with a one-time `code`. Exchanging that code for a session is
 * the only thing this route does, and it has to happen on the server: the
 * exchange writes the session cookies, and a Server Component cannot.
 *
 * The exchange needs the PKCE code verifier the browser stored when the link was
 * requested, which is why a link opened in a different browser from the one that
 * asked for it will fail here rather than sign anyone in.
 */
export async function GET(request: NextRequest): Promise<never> {
  const params = request.nextUrl.searchParams;
  const returnTo = safeReturnTo(params.get(RETURN_TO_PARAM)) ?? SIGNED_IN_HOME;
  const code = params.get("code");

  /* `redirect` throws to unwind, so it is called after everything else has
     finished rather than inside a branch that still has work to do. */
  let failed = code === null;

  if (code !== null) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = error !== null;
  }

  if (failed) {
    /* A fixed code rather than the provider's message. Supabase's text arrives
       from the URL and would be rendered on the sign-in page as though it were
       ours; `error=link` says enough for the one thing a visitor can do about
       it, which is ask for another link. */
    const query = new URLSearchParams({ [RETURN_TO_PARAM]: returnTo, error: "link" });
    redirect(`${SIGN_IN_PATH}?${query.toString()}`);
  }

  redirect(returnTo);
}
