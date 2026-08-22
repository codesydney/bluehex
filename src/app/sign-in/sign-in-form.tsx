"use client";

import { useState } from "react";
import { ArrowUpRight } from "@/components/icons";
import { RETURN_TO_PARAM } from "@/lib/auth/routes";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/* Underline-style field, matching the contact form. */
const fieldClasses =
  "w-full border-0 border-b border-stroke bg-transparent pb-3 text-base text-t-bright placeholder:text-t-muted focus:border-ink focus:outline-none";

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "failed"; message: string };

/**
 * The whole of signing in and signing up: one address, one emailed link.
 *
 * There is no password, so there is no password to reset and no second form for
 * people who already have an account. `shouldCreateUser: true` is what collapses
 * the two — an address nobody has used before gets an account, an address that
 * has gets its session back, and the form cannot tell you which happened. That
 * last part is worth keeping: a form that answers "is this person registered?"
 * answers it for anyone who asks.
 *
 * This runs in the browser rather than as a server action because of PKCE. The
 * client generates a code verifier and stores it in a cookie; the emailed link
 * comes back with a code that is only exchangeable against that verifier. Doing
 * the request server-side would work, but the browser client is where the
 * verifier belongs and it is where `@supabase/ssr` puts it.
 */
export function SignInForm({ returnTo }: { returnTo: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) return;

    setState({ status: "sending" });

    try {
      const supabase = createBrowserSupabaseClient();

      /* Built from the origin the visitor is actually on, so the link works from
         localhost, from a preview host and from production without a build-time
         constant to keep in step. Supabase still has to allow the host: it
         accepts anything sharing a hostname with the project's Site URL, which
         is why `supabase/config.toml` sets that to `http://127.0.0.1:3000`. */
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set(RETURN_TO_PARAM, returnTo);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
      });

      setState(
        error ? { status: "failed", message: error.message } : { status: "sent", email },
      );
    } catch (cause) {
      /* Reached when Supabase is not configured at all — `createBrowserSupabaseClient`
         throws by design rather than building a client pointed at nothing. */
      setState({
        status: "failed",
        message: cause instanceof Error ? cause.message : "Something went wrong.",
      });
    }
  };

  if (state.status === "sent") {
    return (
      <div className="mt-12 max-w-xl">
        <p className="text-lg text-t-bright">Check your email.</p>
        <p className="mt-3 text-t-muted">
          A sign-in link is on its way to <strong className="text-t-bright">{state.email}</strong>.
          It is good for one use. If it does not arrive, check the spam folder and try again.
        </p>
        <button
          type="button"
          onClick={() => setState({ status: "idle" })}
          className="mt-8 text-sm text-t-muted underline underline-offset-4 hover:text-t-bright"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-12 max-w-xl">
      <label htmlFor="email" className="block text-sm text-t-muted">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        className={`${fieldClasses} mt-3`}
      />

      {state.status === "failed" ? (
        <p role="alert" className="mt-4 text-sm text-t-bright">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state.status === "sending"}
        className="mt-10 inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-ink px-6 text-base font-medium text-t-invert transition-colors hover:bg-ink-tint disabled:opacity-60"
      >
        {state.status === "sending" ? "Sending…" : "Email me a link"}
        <ArrowUpRight className="size-[1.1em] shrink-0" />
      </button>
    </form>
  );
}
