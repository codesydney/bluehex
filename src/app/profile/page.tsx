import type { Metadata } from "next";
import Link from "next/link";
import { ProfileEditor } from "@/components/profile-editor/profile-editor";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAccount } from "@/lib/auth/session";
import { listCredentialCatalogue } from "@/lib/directory";
import { statusCopy } from "@/lib/profile-draft";
import { saveProfileAction } from "./_lib/actions";
import { readOwnProfile } from "./_lib/profile-read";

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
 * **The persistence seam is closed as of #14.** #71 built the editor against
 * fixtures and said so on screen; the draft is now this practitioner's own rows,
 * read through `./_lib/profile-read`, and `saveProfileAction` writes them back.
 * A practitioner who has never submitted gets an empty draft with their account
 * address prefilled, which is the only difference between the two cases the page
 * has to know about.
 *
 * A Server Component, and it stays one: the reads happen here and are handed
 * down, which is the shape the query always wanted. Only the editor itself is a
 * client component, because a draft and a live preview are local state. No
 * `connection()`: the guard reads cookies, so the render is request-bound
 * already.
 *
 * **The catalogue is the one anonymous read on the page.** `credential_catalogue`
 * is Bluehex's reference data with a `select` grant to `anon`, so it comes from
 * `@/lib/directory` — the same list the public profile page renders against —
 * rather than being read a second way for a signed-in caller.
 */
export default async function ProfilePage() {
  const viewer = await requireAccount("/profile");

  /* Two reads, and only one of them depends on who is asking. They go together
     rather than in sequence because neither needs the other's answer. */
  const [own, catalogue] = await Promise.all([
    readOwnProfile(viewer.email ?? null),
    listCredentialCatalogue(),
  ]);

  const existing = own.profile !== null;

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

      {/* Where this profile stands, before the form rather than three steps into
          it. The Review step says the same thing at more length; somebody
          arriving to fix a typo should not have to navigate to find out whether
          they are in the directory. */}
      <div className="mt-10 max-w-2xl rounded-card border border-stroke bg-surface p-6">
        <p className="text-sm font-medium">
          {existing ? statusCopy[own.controlled.status].axis : "Not submitted yet"}
        </p>
        <p className="mt-2 text-sm text-t-muted">
          {existing ? (
            <>
              {statusCopy[own.controlled.status].row} Signed in as{" "}
              <strong className="text-t-bright">{viewer.email ?? viewer.id}</strong>. Edits
              save in place and never change whether you are published — but editing a
              credential Bluehex has checked clears that check, because it was a check of
              what the credential said.
            </>
          ) : (
            <>
              You have no profile yet. Fill this in and submit it, and Bluehex reads it
              before anything appears in the directory. Signed in as{" "}
              <strong className="text-t-bright">{viewer.email ?? viewer.id}</strong>, and
              your contact address is prefilled from that — change it if enquiries should
              go somewhere else.
            </>
          )}
        </p>
      </div>

      <div className="mt-14">
        <ProfileEditor
          initialDraft={own.draft}
          initialControlled={own.controlled}
          catalogue={catalogue}
          save={saveProfileAction}
          existing={existing}
        />
      </div>
    </section>
  );
}
