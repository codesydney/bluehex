import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { readQueue } from "./_lib/queue-read";
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
 * **The data is real as of #14.** #72 built the route, the components and the
 * rules and stopped at `readQueue()`; that seam is now `./_lib/queue-read`, a
 * `bluehex_admin` read through the per-request client, and the write path is
 * `./_lib/actions`. The actions are still assembled in the client shell rather
 * than reached for inside the components, which is what let the Server Actions
 * replace one object.
 *
 * A Server Component, and `async` for the query. No `connection()`: the guard
 * above reads cookies, so the render is already request-bound and there is
 * nothing for it to add.
 *
 * `viewer` is for the screen and not for the query. Who is reading changes
 * nothing about what the queue says: a credential names the admin who checked
 * it whoever is looking, so `readQueue` takes no argument and there is no
 * per-reader view of a row to keep straight.
 */
export default async function AdminPage() {
  const viewer = await requireAdmin("/admin");
  const reviewer = viewer.email ?? viewer.id;
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
        <ReviewQueue queue={queue} reviewer={reviewer} />
      </section>
    </>
  );
}
