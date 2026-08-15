import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "@/components/icons";

/**
 * Index for the two design mocks. Never production, and linked from nowhere.
 *
 * Both routes below 404 in a production build, which is the confusing failure
 * to know about: `pnpm start` serves the rest of the site perfectly well and
 * returns 404 only for these, which reads like a broken route rather than a
 * working guard. Use `pnpm dev`.
 */

export const metadata: Metadata = {
  title: "Designs",
  robots: { index: false, follow: false },
};

const designs: { href: string; title: string; blurb: string; open?: boolean }[] = [
  {
    href: "/prototype/directory",
    title: "Directory and profile",
    blurb:
      "The real directory at the population it launches with, and a profile one click away at the URL a practitioner would paste into a job application. Five alternatives were drawn against the roster and none of them beat it.",
  },
  {
    href: "/prototype/profile",
    title: "Your profile",
    blurb:
      "What a practitioner fills in. A stepped form with the directory row you are building alongside it, so nothing about what is public has to be taken on trust.",
  },
  {
    href: "/prototype/admin",
    title: "Review queue",
    blurb:
      "How Bluehex reviews. One queue, a profile at a time, with admission control and per-credential verification kept as the separate decisions they are.",
  },
];

export default function DesignIndex() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <section className="container-x pt-32 pb-32 md:pt-40">
      <h1 className="display-2">Designs</h1>
      <p className="mt-5 max-w-2xl text-t-muted">
        Working mocks of the two surfaces that do not exist yet. Nothing here saves, and
        neither is reachable in production.
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
                {design.open ? "Open — variants to compare" : "Settled"}
              </p>
              <p className="mt-4 max-w-xl text-t-muted">{design.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
