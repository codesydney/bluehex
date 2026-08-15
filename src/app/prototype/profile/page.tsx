import type { Metadata } from "next";
import { ProfileEditor } from "./profile-editor";

/**
 * The profile editor — the agreed design, as a mock. Served in production.
 *
 * Drawn against the practitioner-writable field set in
 * `docs/spec/profile-and-credentials.md`. No validation, no persistence, no
 * auth — and since this is now reachable on the live site, that last one is
 * worth saying out loud: nothing typed here is saved or sent anywhere, and the
 * page must never be linked from anywhere that implies it is.
 *
 * Kept so #14 has something to build from, and so curated intake has a concrete
 * field list to collect against. See `NOTES.md` for the decision, the shapes it
 * was assembled from, and what the built version has to be held to.
 */

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export default function ProfileEditorPage() {
  return <ProfileEditor />;
}
