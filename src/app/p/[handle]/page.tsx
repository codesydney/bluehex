import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { profilePath } from "@/lib/practitioners";
import { findByHandle } from "../_lib/handles";
import { ProfileDetail } from "../_lib/profile-detail";

/**
 * A profile at its real URL.
 *
 * It sits at `/p/` rather than under `/prototype/` because the directory links
 * here from production code (`profilePath` in `@/lib/practitioners`), and the
 * whole point of a profile having a URL is that the URL is real and shareable.
 *
 * Only the trailing short id resolves; the slug is decoration. A request whose
 * slug no longer matches is redirected to the canonical path rather than served
 * in both places, which is what keeps a link alive across a rename without
 * splitting the profile across two URLs.
 *
 * Every arrival renders this — clicked from the directory, pasted from a CV, or
 * found in search. An earlier version intercepted the click into a drawer over
 * the directory so the visitor kept their search context; that was cut, because
 * interception applies to soft navigation only and a link pasted from anywhere
 * else is a cold arrival at this page regardless.
 */

export async function generateMetadata({
  params,
}: PageProps<"/p/[handle]">): Promise<Metadata> {
  const person = findByHandle((await params).handle);

  return {
    title: person ? `${person.name} — Bluehex` : "Profile",
  };
}

export default async function ProfilePage({ params }: PageProps<"/p/[handle]">) {
  const handle = (await params).handle;
  const person = findByHandle(handle);
  if (!person) notFound();

  const canonical = profilePath(person);
  if (`/p/${handle}` !== canonical) redirect(canonical);

  return (
    <div className="container-x pt-32 pb-24 md:pt-40">
      <p className="mx-auto mb-10 max-w-3xl text-sm text-t-muted">
        <Link href="/" className="underline underline-offset-4">
          Directory
        </Link>{" "}
        / {person.name}
      </p>

      <ProfileDetail person={person} />
    </div>
  );
}
