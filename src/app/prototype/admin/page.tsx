import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminQueuePrototype } from "./admin-queue";

/**
 * The Bluehex review queue — the agreed design, as a mock. Never production.
 *
 * There is no auth here and there is not meant to be: a real admin surface is
 * gated on `bluehex_admin`, a Postgres role stamped onto the access token by
 * `custom_access_token_hook`, per `docs/adr/0001-admins-are-a-postgres-role.md`.
 * The guard below is what keeps a drawing out of a production build.
 *
 * Kept so #14 has something to build from. See `NOTES.md` for the decision, the
 * two designs it beat, and what the built version has to be held to.
 */

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false, follow: false },
};

export default function AdminQueuePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <AdminQueuePrototype />;
}
