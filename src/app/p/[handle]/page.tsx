import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfileByHandle, listCredentialCatalogue } from "@/lib/directory";
import { ProfileDetail } from "../_lib/profile-detail";

/**
 * A profile at its real URL.
 *
 * It sits at `/p/` rather than under `/prototype/` because the directory links
 * here from production code (`profilePath` in `@/lib/practitioners`), and the
 * whole point of a profile having a URL is that the URL is real and shareable.
 *
 * **One path per profile, and no redirect** (#119). The URL used to be
 * `/p/<name-slug>-<short id>`, where only the trailing id resolved and a stale
 * slug was redirected to the canonical form — machinery that existed to keep a
 * link alive across a rename. The slug is gone, so the rename problem is gone
 * with it and so is the redirect: `handle` is a `not null unique` column that
 * nothing derives from the name, so there is no second spelling of this page for
 * anything to be canonical against.
 *
 * `findByHandle` went at the same time and for the same reason. It lived in
 * `_lib/handles.ts` and did real work — strip the slug, read every published id,
 * match six characters in memory, `.find()` the first hit — all of which was
 * forced by an identifier Postgres could not filter on. With a column there is
 * one `.eq("handle", …)`, which belongs in `@/lib/directory` beside every other
 * read; a wrapper here would only be a second name for it.
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
  /* The same lookup the page makes. `getProfileByHandle` reads through React's
     per-request memo, so this costs no second round trip. */
  const person = await getProfileByHandle((await params).handle);

  if (!person) return { title: "Profile" };

  return {
    /* The name alone. The root layout's `title.template` appends " — Bluehex",
       so naming the suffix here rendered it twice — every other route returns
       its leaf and comes out right. */
    title: person.name,
    /* No `openGraph` here, deliberately. Metadata merges *shallowly*, so naming
       it would replace every field the root set — and the share card goes with
       it, because the root never declares `images`: `opengraph-image.png` is
       injected by the file convention, leaving nothing to spread back in. So a
       profile unfurls under the site's name rather than the practitioner's.
       Decided rather than deferred — see #144 for why we are not building a
       per-profile card. */
  };
}

export default async function ProfilePage({ params }: PageProps<"/p/[handle]">) {
  const person = await getProfileByHandle((await params).handle);
  if (!person) notFound();

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
