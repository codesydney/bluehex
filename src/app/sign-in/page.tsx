import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";
import { SectionLabel } from "@/components/ui";
import { RETURN_TO_PARAM, safeReturnTo, SIGNED_IN_HOME } from "@/lib/auth/routes";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Bluehex, or create an account, with a link sent to your email.",
};

/**
 * One page for signing in and signing up, because with magic links they are the
 * same request. The proxy sends a signed-in visitor away from here before this
 * renders — see `src/lib/auth/routes.ts`.
 */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;

  const requested = params[RETURN_TO_PARAM];
  /* Attacker-controlled: this arrives in a query string and is carried into the
     emailed link. `safeReturnTo` is what keeps `?next=https://example.invalid`
     from turning our own sign-in into someone else's landing page. */
  const returnTo =
    safeReturnTo(typeof requested === "string" ? requested : null) ?? SIGNED_IN_HOME;

  /* A fixed code, never the provider's message. Echoing an error string from a
     query parameter into the page renders attacker-supplied text as though
     Bluehex wrote it. */
  const linkFailed = params.error === "link";

  return (
    <section className="container-x pt-32 pb-24 md:pt-44 md:pb-32">
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-16">
        <SectionLabel className="md:w-40 md:shrink-0 md:pt-6">Sign in</SectionLabel>

        <div className="w-full max-w-3xl">
          <h1 className="display-2">Sign in to Bluehex</h1>

          <p className="mt-10 max-w-xl text-lg text-t-muted">
            There is no password. Give us your email address and we will send you a link
            that signs you in. If you have not been here before, that same link creates
            your account.
          </p>

          {linkFailed ? (
            <p role="alert" className="mt-8 max-w-xl text-t-bright">
              That link did not work. Sign-in links expire and can only be used once —
              ask for a new one below.
            </p>
          ) : null}

          <SignInForm returnTo={returnTo} />
        </div>
      </div>
    </section>
  );
}
