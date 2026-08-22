import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listCredentialCatalogue } from "@/lib/directory";
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

/**
 * Nothing is prerendered, and every path is still served.
 *
 * `generateStaticParams` returns an empty array and `dynamicParams` is left at
 * its default of `true`, so a profile page is rendered on its **first request**
 * and cached from then on. That is the whole mechanism by which a newly approved
 * profile appears: no rebuild, no deploy.
 *
 * The fact that settles it, because it is easy to get backwards: **during
 * revalidation `generateStaticParams` is not called again.** Enumerating handles
 * here could therefore never be how new profiles arrive — it would only decide
 * which ones exist at build time, and every later one would depend on somebody
 * rebuilding. `dynamicParams` is the mechanism; this function is not.
 *
 * Do not set `dynamicParams = false`. It turns any path this function did not
 * name into a 404, which with an empty array is every profile there will ever
 * be.
 *
 * Returning `[]` is also what the API reference requires in order to revalidate
 * paths at runtime at all, so this is the sanctioned ISR shape rather than a
 * workaround — and it is the same decision as keeping `pnpm build` green with no
 * Supabase configured, since a function that enumerates nothing cannot need a
 * database to do it.
 */
export function generateStaticParams() {
  return [];
}

/* A day, matching the directory. See the long note in `src/app/page.tsx` for
   what the clock does and does not cover, and for the two tag names — this page
   is the `practitioner:<id>` half of that contract. The literal is repeated
   rather than imported because `revalidate` must be statically analysable. */
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: PageProps<"/p/[handle]">): Promise<Metadata> {
  /* The same lookup the page makes. `findByHandle` reads through React's
     per-request memo, so this costs no second round trip. */
  const person = await findByHandle((await params).handle);

  return {
    title: person ? `${person.name} — Bluehex` : "Profile",
  };
}

export default async function ProfilePage({ params }: PageProps<"/p/[handle]">) {
  const handle = (await params).handle;
  const person = await findByHandle(handle);
  if (!person) notFound();

  const canonical = profilePath(person);
  if (`/p/${handle}` !== canonical) redirect(canonical);

  /* The whole catalogue, so the credentials block can offer the rest of it
     behind the Not earned control. It was an empty array until this query
     landed, which is the case the control was written to survive: nothing to
     reveal, so nothing renders. It still degrades to that on a build with no
     Supabase configured. */
  const catalogue = await listCredentialCatalogue();

  return (
    <div className="container-x pt-32 pb-24 md:pt-40">
      <p className="mx-auto mb-10 max-w-3xl text-sm text-t-muted">
        <Link href="/" className="underline underline-offset-4">
          Directory
        </Link>{" "}
        / {person.name}
      </p>

      <ProfileDetail person={person} catalogue={catalogue} />
    </div>
  );
}
