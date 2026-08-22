import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";

/**
 * Index for the design mocks that are still drawings. Served in production,
 * linked from nowhere.
 *
 * A mock leaves this list when the surface it drew is built: the profile editor
 * went with #71 and is behind sign-in at `/profile`.
 *
 * These used to 404 outside development. The guard was removed deliberately so
 * the designs can be handed to someone as a URL rather than as a screenshot or a
 * checkout — which is the only way a non-contributor can actually use them.
 *
 * What that costs, stated plainly because it is easy to forget once these look
 * like ordinary pages: the people in these mocks are invented and none of it is
 * behind auth. On a site whose product is a trust badge, anyone who finds these
 * without context can reasonably read them as real. They stay `noindex` and stay
 * unlinked from the site's own navigation for that reason. Do not link to them
 * from the hero, the footer or the directory.
 *
 * The review queue is no longer among them. #72 built it at `/admin`, behind the
 * `bluehex_admin` gate — which is where a drawing of how Bluehex judges
 * credentials belongs once it stops being a drawing.
 */

export const metadata: Metadata = {
  title: "Designs",
  robots: { index: false, follow: false },
};

/* No `open` flag. It existed while the variants and the switcher did, and all
   three rounds have closed — a design here is settled or it has been deleted. */
const designs: { href: string; title: string; blurb: string }[] = [
  {
    href: "/prototype/directory",
    title: "Directory and profile",
    blurb:
      "The real directory at the population it launches with, and a profile one click away at the URL a practitioner would paste into a job application. Five alternatives were drawn against the roster and none of them beat it.",
  },
  {
  },
];

export default function DesignIndex() {
  return (
    <section className="container-x pt-32 pb-32 md:pt-40">
      <h1 className="display-2">Designs</h1>
      <p className="mt-5 max-w-2xl text-t-muted">
        Working mocks of surfaces that do not exist yet, alongside the directory as it
        ships today. Nothing here saves and nothing here is real: the people are
        invented, their badges attest to nothing, and no button reaches a database. The
        real directory is on the home page.
      </p>

      <ul className="mt-12 flex max-w-3xl flex-col gap-4">
        {designs.map((design) => (
          <li key={design.href}>
            <Link
              href={design.href}
              className="group block rounded-card bg-surface p-8 transition-colors hover:bg-surface-shade md:p-10"
            >
              <p className="display-3 flex items-start gap-3">
                {design.title}
                <ArrowUpRight className="mt-1.5 size-[0.5em] shrink-0 text-t-faint transition-colors group-hover:text-t-bright" />
              </p>
              <p className="mt-3 text-xs font-medium tracking-wide text-t-faint uppercase">
                Settled
              </p>
              <p className="mt-4 max-w-xl text-t-muted">{design.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
