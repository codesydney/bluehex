import type { Metadata } from "next";
import { AdminQueuePrototype } from "./admin-queue";

/**
 * The Bluehex review queue — the agreed design, as a mock. Served in production.
 *
 * There is no auth here and there is not meant to be: a real admin surface is
 * gated on `bluehex_admin`, a Postgres role stamped onto the access token by
 * `custom_access_token_hook`, per `docs/adr/0001-admins-are-a-postgres-role.md`.
 *
 * This is the surface where being publicly reachable is least comfortable, so be
 * clear about what it is and is not. It reads and writes nothing — every profile
 * in it is invented, `Approve` and `Verify` move React state and no more, and
 * there is no database behind it to reach. What a visitor can see is a drawing
 * of how Bluehex judges credentials, which is a process worth being open about.
 * What they cannot do is change any real profile's status or badge, because no
 * real profile exists here and no request leaves the page.
 *
 * Kept so #14 has something to build from. See `NOTES.md` for the decision, the
 * two designs it beat, and what the built version has to be held to.
 */

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false, follow: false },
};

export default function AdminQueuePage() {
  return <AdminQueuePrototype />;
}
