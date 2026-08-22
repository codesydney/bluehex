import type { Metadata } from "next";
import Link from "next/link";
import { ProfileEditor } from "@/components/profile-editor/profile-editor";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAccount } from "@/lib/auth/session";
import { credentialCatalogue, exampleControlled, exampleDraft } from "@/lib/profile-fixtures";

export const metadata: Metadata = {
  title: "Your profile",
  /* Behind a gate, so a crawler never sees it — saying so costs nothing and
     stops a signed-in crawl putting an editor in an index. */
  robots: { index: false, follow: false },
};

/**
 * The profile editor.
 *
 * **One line gates it.** `requireAccount` returns the viewer or redirects to
 * the sign-in form carrying where they were going; there is no branch to
 * forget. It is convenience rather than the control — every table behind this
 * page is guarded by row level security, which does not consult this file — but
 * it is what makes a signed-out visitor meet a form instead of a page of
 * permission errors. See `src/lib/auth/routes.ts`.
 *
 * **It stops at the persistence seam.** The editor is wired to fixtures and
 * local state: it collects and validates the entire practitioner-writable
 * record and writes none of it. #14 replaces `@/lib/profile-fixtures` with a
 * query keyed on `auth.uid()` and `submitProfile` with a Server Action. Saying
 * so on the page rather than only in a pull request is deliberate — the one
 * thing a form about who decides what cannot do is mislead somebody about
 * whether their answers went anywhere.
 *
 * A Server Component, and it stays one: the fixtures are read here and handed
 * down, which is the shape the query wants. Only the editor itself is a client
 * component, because a draft and a live preview are local state.
 */
export default async function ProfilePage() {
  const viewer = await requireAccount("/profile");

  return (
    <section className="container-x pt-32 pb-32 md:pt-40">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <h1 className="display-2">Your profile</h1>
          <p className="mt-5 max-w-2xl text-t-muted">
            Publish what you do and the Claude credentials you hold. Bluehex checks the
            credentials and decides the badge — nothing on this form sets it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <SignOutButton />
          {viewer.isAdmin ? (
            <Link
              href="/admin"
              className="text-sm text-t-muted underline underline-offset-4 hover:text-t-bright"
            >
              Admin
            </Link>
          ) : null}
        </div>
      </div>

      {/* Not a toast and not a footnote. Somebody signed in as themselves is
          about to see a filled-in profile that is not theirs, and every field on
          this page forgets what it was told on reload. */}
      <div className="mt-10 max-w-2xl rounded-card border border-stroke bg-surface p-6">
        <p className="text-sm font-medium">Nothing here is saved yet.</p>
        <p className="mt-2 text-sm text-t-muted">
          This is the editor working against example content, so it can be used and judged
          before it is wired to the database. You are signed in as{" "}
          <strong className="text-t-bright">{viewer.email ?? viewer.id}</strong>, and the
          profile below is not yours — it is an example. Nothing you type is stored, and
          nothing here reaches the directory.
        </p>
      </div>

      <div className="mt-14">
        <ProfileEditor
          initialDraft={exampleDraft()}
          initialControlled={exampleControlled()}
          catalogue={credentialCatalogue()}
        />
      </div>
    </section>
  );
}
