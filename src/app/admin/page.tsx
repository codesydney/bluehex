import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { readQueue } from "./_lib/fixtures";
import { ReviewQueue } from "./review-queue";

export const metadata: Metadata = {
  title: "Review queue",
  /* Unreachable without the admin role, so a crawler would only ever meet the
     redirect. Says so anyway: the cost is one header and the failure it guards
     against is a misconfigured gate publishing how Bluehex judges credentials. */
  robots: { index: false, follow: false },
};

/**
 * The Bluehex review queue.
 *
 * **The gate is one line, and it is presentation.** `requireAdmin` reads the
 * `bluehex_admin` claim the access token hook stamps onto an admin's token and
 * redirects anybody else. The privileges that set `verified` belong to the
 * `bluehex_admin` Postgres role and are checked by Postgres on every statement,
 * so a practitioner who somehow got past this line would still be refused by
 * the database. Deleting the call would make the page ugly, not insecure — see
 * `docs/adr/0001-admins-are-a-postgres-role.md`. Nothing on this screen may
 * ever become the control.
 *
 * **The data is fixtures and the page says so on itself.** #72 built the route,
 * the components and the rules and stopped at `readQueue()`; the write path is
 * #14. That seam is also why the actions are assembled in the client shell and
 * handed to the components rather than reached for inside them: when the Server
 * Actions land they replace one object.
 *
 * A Server Component, and `async` for the seam rather than for the fixtures. No
 * `connection()`: the guard above reads cookies, so the render is already
 * request-bound and there is nothing for it to add.
 */
export default async function AdminPage() {
  const viewer = await requireAdmin("/admin");
  const queue = await readQueue();

  return (
    <>
      <PageHeader
        label="Review"
        title="Review queue"
        lead={
          <>
            Two independent decisions, not one pipeline.{" "}
            <strong className="text-t-bright">Status</strong> is whether a profile is
            visible; <strong className="text-t-bright">Verified</strong> is whether a human
            read the evidence behind one credential. A profile can be published and
            unvouched for, and usually is.
          </>
        }
      >
        <SignOutButton />
      </PageHeader>

      <section className="container-x pb-32">
        <p className="max-w-2xl rounded-tight border border-stroke bg-surface px-4 py-3 text-sm text-t-muted">
          <strong className="font-medium text-t-bright">Nine invented people.</strong> The
          queue below is a fixture: nothing is read from the database and no button writes
          to it. Four of the nine are awkward on purpose — one is spam, one is using
          somebody else&rsquo;s certificate and is only catchable by looking across
          profiles, one is entirely legitimate and will trip any careless name check, and
          one cannot be verified at all and is doing nothing wrong.
        </p>

        <div className="mt-12">
          <ReviewQueue queue={queue} reviewer={viewer.email ?? viewer.id} />
        </div>
      </section>
    </>
  );
}
