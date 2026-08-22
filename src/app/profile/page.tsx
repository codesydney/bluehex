import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui";
import { requireAccount } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Your profile",
};

/**
 * A placeholder, and deliberately not a design.
 *
 * #71 builds the profile editor here from the settled prototype in
 * `src/app/prototype/profile/`. What this page exists to do until then is prove
 * the guard: signed out, nobody reaches it. Drawing anything more would be
 * drawing something #71 throws away.
 */
export default async function ProfilePage() {
  const viewer = await requireAccount("/profile");

  return (
    <PageHeader
      label="Account"
      title="You are signed in"
      lead={
        <>
          Signed in as <strong className="text-t-bright">{viewer.email ?? viewer.id}</strong>. The
          profile editor lands here with #71.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-4">
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
    </PageHeader>
  );
}
