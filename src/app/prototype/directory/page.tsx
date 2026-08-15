import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PractitionerDirectory } from "@/components/practitioner-directory";
import { launchPopulation } from "./fixtures";

/**
 * The directory and the profile, as one surface. Never production.
 *
 * Renders the **real** `PractitionerDirectory` against the population it will
 * actually have on launch day — three profiles, none of them holding a finished
 * Claude Certification. A copy would drift and stop answering the question this
 * asks, which is whether the shipped design survives being nearly empty.
 *
 * It was two prototypes until they could be merged. The directory could not
 * reach a profile while the roster's only control was *Enquire*, so the profile
 * surface had to draw its own list to have something to click, and that second
 * list doubled up with this one. Changing the production CTA to *View profile*
 * removed the reason for the copy: the real component now links to
 * `/p/<handle>` itself, so this page is the only roster and the profile is one
 * click away through the real link.
 *
 * That click is an ordinary navigation. It was briefly an intercepted route that
 * opened the profile in a drawer over this page, Seek-style, so the visitor kept
 * their search and filters — it did not work and the scope was cut rather than
 * chased. NOTES.md records what broke, because the failure was not obvious.
 *
 * The hero is deliberately not reproduced — it does not vary with the
 * population, so a second copy would only be a second thing to keep in sync.
 *
 * **The roster is settled, and two rounds of variants are what settled it** —
 * first a page split by verification and a bio-led stack with no filters, then
 * three densities of the roster itself. All five lost to the shipped design.
 * That is why there is no `?variant=` here and no switcher: `NOTES.md` keeps
 * what was learned, and nothing that lost stays on disk to be re-read as a live
 * option. Reopening it needs a reason the file does not already answer.
 *
 * A population switcher (0 / 3 / 12) and a "What does Verified attest to?" panel
 * both used to live here and were cut too. The numbers were an unexplained guess
 * at signup rate, and the panel was an argument rather than something to look
 * at. Both findings survive in `NOTES.md`, which is where an argument belongs.
 */

export const metadata: Metadata = {
  title: "Directory",
  robots: { index: false, follow: false },
};

export default function DirectoryPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <div className="container-x pt-32 md:pt-40">
        <p className="max-w-2xl text-sm text-t-muted">
          Click <strong className="font-medium text-t-bright">View profile</strong> on any
          row to go to that person&rsquo;s page at <code>/p/&lt;handle&gt;</code> — the same
          URL they would paste into a job application.
        </p>
      </div>

      <PractitionerDirectory practitioners={launchPopulation.slice(0, 3)} />
    </>
  );
}
