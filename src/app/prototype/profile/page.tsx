import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileEditor } from "./profile-editor";

/**
 * The profile editor — the agreed design, as a mock. Never production.
 *
 * Drawn against the practitioner-writable field set in
 * `docs/spec/profile-and-credentials.md`. No validation, no persistence, no
 * auth; the guard below is what keeps a drawing out of a production build.
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
  if (process.env.NODE_ENV === "production") notFound();

  return <ProfileEditor />;
}
