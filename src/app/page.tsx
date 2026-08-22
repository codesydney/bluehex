import Image from "next/image";
import { PractitionerDirectory } from "@/components/practitioner-directory";
import { Card, Button, SectionLabel } from "@/components/ui";
import { listProfiles, listServiceOptions } from "@/lib/directory";
import { site } from "@/lib/site";

/**
 * The directory is cached, and revalidated once a day.
 *
 * Profiles are public, read-heavy and rarely edited, so this page is static
 * content that happens to be assembled from Postgres. The number is written out
 * as a literal because `export const revalidate` has to be statically
 * analysable — `60 * 60 * 24` is refused — and `/p/[handle]` carries the same
 * literal for the same reason.
 *
 * **The clock is a staleness preference and it is not the whole story.** An
 * ordinary edit — a rewritten bio, a credential added — waits up to a day, and
 * that is an acceptable trade. Revocation is not: `status` leaving `approved`,
 * or a credential's `verified` going false, are Bluehex-owned and revocable, and
 * a page sitting in a cache keeps serving a withdrawn profile and keeps showing
 * a badge that was pulled. The clock *bounds* that window at 24 hours; it does
 * not close it, and nothing in this repository purges these pages today.
 *
 * **The tags that will close it, named here so the tickets that need them agree
 * on the words:**
 *
 *   `practitioners`        the directory listing — this page
 *   `practitioner:<id>`    one profile page — `/p/[handle]`
 *
 * A status change or a `verified` change purges both; an ordinary edit purges
 * neither and waits for the clock. They are a contract rather than live code:
 * attaching a tag to cached data in Next 16 needs either a `fetch` of ours to
 * hang `next.tags` on — we query through `supabase-js`, so there is none — or
 * `cacheTag()` inside a `use cache` function, which needs `cacheComponents` in
 * `next.config.ts`. Choosing between those is application-wide and is **#117**.
 * The writes that will call the purge are **#14**.
 *
 * When that call is written it wants `updateTag`, which expires the entry
 * immediately, and **not** `revalidateTag(tag, "max")`, which serves the stale
 * response one more time — for a pulled badge that is the pulled badge going out
 * once more, which is the entire failure being closed. Bare `revalidateTag(tag)`
 * with no second argument is deprecated.
 */
export const revalidate = 86400;

/* Communities Bluehex runs this directory alongside. Logos are the
   collaborators' own artwork, trimmed to their bounding box and given a
   transparent background — see public/img/partners/. */
const collaborators = [
  {
    name: "Seiment",
    href: "https://seiment.com/",
    logo: "/img/partners/seiment-logo.png",
    width: 246,
    height: 246,
  },
  {
    name: "Data Engineering Pilipinas",
    href: "https://dataengineering.ph/",
    logo: "/img/partners/data-engineering-pilipinas-logo.png",
    width: 480,
    height: 395,
  },
  {
    name: "Tutorials Dojo",
    href: "https://tutorialsdojo.com/",
    logo: "/img/partners/tutorials-dojo-logo.png",
    width: 200,
    height: 200,
  },
];

export default async function HomePage() {
  /* Fetched here and passed down, because `PractitionerDirectory` is a client
     component: search and filters are local state, and it matches against the
     whole set in the browser rather than making a round trip per keystroke.

     No `connection()`, deliberately, and this is the read its documentation
     describes — an anonymous public query touching neither cookies nor headers.
     What that document is *for* is a component that must produce different
     output per request; this one must not. It is cached for a day on purpose,
     and `await connection()` would opt the route out of prerendering entirely
     and undo the rendering decision rather than implement it. */
  const [practitioners, serviceCatalogue] = await Promise.all([
    listProfiles(),
    listServiceOptions(),
  ]);

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="container-x pt-36 pb-20 md:pt-48 md:pb-28">
        <SectionLabel>Claude and Anthropic specialists</SectionLabel>

        <h1 className="display-1 mt-8 max-w-6xl">Claude Specialists.</h1>

        <p className="mt-10 max-w-2xl text-lg text-t-muted md:text-xl">{site.tagline}</p>

        <div className="mt-12 flex flex-wrap gap-4">
          <Button href="#practitioners" size="lg">
            Find a practitioner
          </Button>
          <Button href="/contact" variant="outline" size="lg">
            Publish your profile
          </Button>
        </div>

        <p className="mt-20 text-base font-medium tracking-wide text-t-medium uppercase md:text-lg">
          In collaboration with
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {collaborators.map((c) => (
            <a key={c.name} href={c.href} target="_blank" rel="noopener noreferrer">
              <Card className="flex items-center gap-5 border border-stroke py-8 transition-colors hover:border-stroke-strong md:py-8">
                <Image
                  src={c.logo}
                  alt=""
                  width={c.width}
                  height={c.height}
                  className="h-12 w-12 shrink-0 object-contain"
                />
                <span className="text-lg leading-snug">{c.name}</span>
              </Card>
            </a>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Practitioner directory — search, filters, profiles               */}
      {/* ---------------------------------------------------------------- */}
      <PractitionerDirectory
        practitioners={practitioners}
        serviceCatalogue={serviceCatalogue}
      />
    </>
  );
}
