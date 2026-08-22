import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui";
import { ADMIN_ROLE } from "@/lib/auth/claims";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Admin",
};

/**
 * A placeholder, and deliberately not a design.
 *
 * #72 builds the review queue here from `src/app/prototype/admin/`. Until then
 * this page exists to show that the `bluehex_admin` claim reaches the
 * application: it is on the token because `custom_access_token_hook` put it
 * there for a user listed in `public.admins`.
 *
 * Reading it is presentation. The privileges that set `verified` belong to the
 * `bluehex_admin` Postgres role and are checked by Postgres on every statement,
 * so a practitioner who got past this page would still be refused by the
 * database. See `docs/adr/0001-admins-are-a-postgres-role.md`.
 */
export default async function AdminPage() {
  const viewer = await requireAdmin("/admin");

  return (
    <PageHeader
      label="Admin"
      title="Admin"
      lead={
        <>
          Signed in as <strong className="text-t-bright">{viewer.email ?? viewer.id}</strong>,
          holding <code>{ADMIN_ROLE}</code>. The review queue lands here with #72.
        </>
      }
    >
      <SignOutButton />
    </PageHeader>
  );
}
