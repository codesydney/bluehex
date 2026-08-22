import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SessionClaims } from "@/lib/auth/claims";
import { authRedirect, RETURN_TO_PARAM } from "@/lib/auth/routes";
import type { Database } from "@/lib/database.types";
import { supabaseEnvOrNull } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session on every request, and turns a signed-out
 * visitor away from the routes that need an account.
 *
 * `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the convention and the
 * old name is deprecated. It defaults to the Node.js runtime in 16, so the
 * WebCrypto that verifies a token signature locally is available.
 *
 * The refresh is the part that cannot live anywhere else. An access token lasts
 * an hour; a Server Component render can read cookies but cannot write them,
 * because HTTP will not take a `Set-Cookie` once a response has begun streaming.
 * So something has to run *before* the render, notice the token is stale, swap
 * it, and put the new one on both the outgoing response (for the browser) and
 * the incoming request (for the render about to happen). That is this file, and
 * it is why `setAll` writes to `request.cookies` as well.
 *
 * The gate on top of it is convenience rather than security — see
 * `src/lib/auth/routes.ts`. Every table behind these routes is guarded by row
 * level security, which does not consult this file and would refuse the same
 * caller if this file were deleted.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const cookiesToWrite: { name: string; value: string; options: CookieOptions }[] = [];
  let cacheHeaders: Record<string, string> = {};
  let claims: SessionClaims | null = null;

  /* No configuration means no session, and every protected route is then
     unreachable — which is the direction to fail in. Throwing instead would take
     the public directory down over two variables the public directory does not
     use. See `src/lib/supabase/env.ts`. */
  const env = supabaseEnvOrNull();

  if (env) {
    const supabase = createServerClient<Database>(env.url, env.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (setCookies, headers) => {
          for (const { name, value } of setCookies) request.cookies.set(name, value);
          cookiesToWrite.push(...setCookies);
          /* A response that carries a fresh token must not be cached by a CDN,
             or one visitor's session is served to the next. The library hands
             the headers that say so; applying them is ours to do. */
          cacheHeaders = { ...cacheHeaders, ...headers };
        },
      },
    });

    /* Verifies the signature rather than trusting the cookie, and refreshes the
       token if it is close to expiring — which is what triggers `setAll`. */
    const { data } = await supabase.auth.getClaims();
    claims = data?.claims ?? null;
  }

  const destination = authRedirect(
    {
      pathname: request.nextUrl.pathname,
      /* Carried so that signing in returns the visitor to the URL they asked
         for and not merely to its path. */
      search: request.nextUrl.search,
      returnTo: request.nextUrl.searchParams.get(RETURN_TO_PARAM),
    },
    claims,
  );

  /* Built after `getClaims`, because `NextResponse.next({ request })` snapshots
     the request headers and the refreshed cookies were written into them above. */
  const response = destination
    ? NextResponse.redirect(new URL(destination, request.nextUrl))
    : NextResponse.next({ request });

  if (destination) {
    /* Where the gate sends someone depends entirely on their session, so a
       shared cache holding one of these would bounce the next visitor to
       somebody else's answer. A 307 is not on the list of status codes RFC 9111
       lets a cache store on its own initiative, so nothing well-behaved would
       store it anyway — this says so rather than relying on it. */
    response.headers.set("Cache-Control", "private, no-store");
  }

  for (const { name, value, options } of cookiesToWrite) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of Object.entries(cacheHeaders)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  /* Everything except the things that are not requests for a page: the build
     output, the files in `public/`, and the favicon. Running on every remaining
     route is deliberate — a signed-in practitioner reading the public directory
     for an hour still needs their token refreshed, and a matcher listing only
     the protected routes would sign them out for browsing. */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|img/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
