import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { profilePath } from "@/lib/practitioners";
import { findByHandle } from "../_lib/handles";
import { ProfileDetail } from "../_lib/profile-detail";

/**
 * A profile at its real URL. **Never production** — the guard below 404s it, so
 * production behaviour is unchanged from having no route here at all.
 *
 * It sits at `/p/` rather than under `/prototype/` on purpose. The directory
 * links here from production code (`profilePath` in `@/lib/practitioners`), so
 * a prototype at a different path would need the link faked, and faking the one
 * thing the design is built around — that the URL is real and shareable — would
 * make the prototype prove nothing. This is also the file the real page
 * replaces, which is the right shape for a drawing that is meant to be thrown
 * away from underneath.
 *
 * What makes it a drawing is the data: it reads the throwaway fixture in
 * `@/app/prototype/directory/fixtures`, which is a deliberately awkward import.
 * A page under `/p/` reaching into `/prototype/` should look wrong, because it
 * is the part that must not survive.
 *
 * Every arrival renders this — clicked from the directory, pasted from a CV, or
 * found in search. An earlier version intercepted the click into a drawer over
 * the directory so the visitor kept their search context; that was cut. See
 * NOTES.md.
 */

export async function generateMetadata({
  params,
}: PageProps<"/p/[handle]">): Promise<Metadata> {
  const person = findByHandle((await params).handle);

  return {
    title: person ? `${person.name} — Bluehex` : "Profile",
    /* Noindex is a property of the prototype, not of the design. The real page
       is indexable on purpose — organic search is a third of why it has a URL. */
    robots: { index: false, follow: false },
  };
}

export default async function ProfilePage({ params }: PageProps<"/p/[handle]">) {
  if (process.env.NODE_ENV === "production") notFound();

  const handle = (await params).handle;
  const person = findByHandle(handle);
  if (!person) notFound();

  const canonical = profilePath(person).replace("/p/", "");

  return (
    <div className="container-x pt-32 pb-24 md:pt-40">
      <p className="mx-auto mb-10 max-w-3xl text-sm text-t-muted">
        <Link href="/prototype/directory" className="underline underline-offset-4">
          Directory
        </Link>{" "}
        / {person.name}
      </p>

      <ProfileDetail person={person} />

      {handle !== canonical ? (
        <div className="mx-auto mt-14 max-w-3xl rounded-tight border border-dashed border-stroke p-5 text-sm">
          <p className="font-medium">This is not the canonical URL</p>
          <p className="mt-2 text-t-muted">
            You asked for <code>{handle}</code> and the canonical one is{" "}
            <code>{canonical}</code>. It resolved anyway, because only the trailing short
            id is read — which is how a rename keeps old links alive. A real build would
            redirect here rather than serve both.
          </p>
        </div>
      ) : null}
    </div>
  );
}
