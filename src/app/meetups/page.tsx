import type { Metadata } from "next";
import { MeetupEvents } from "@/components/meetup-events";
import { Button, SectionLabel } from "@/components/ui";
import { listUpcomingEvents } from "@/lib/events";
import { site } from "@/lib/site";

/**
 * Meetups — Agent Exchange's third tab, #157/#60.
 *
 * `listUpcomingEvents` never throws — see `@/lib/events` for the invariant —
 * so there is nothing here to catch. A Meetup outage renders `MeetupEvents`
 * with an empty list, which draws its own explanation rather than this page
 * needing to know the fetch failed.
 */
export const metadata: Metadata = {
  title: "Meetups",
  description: "The Code.Sydney Claude meetup, weekly in Sydney. See what's next and RSVP.",
};

/** Matches the `next: { revalidate }` on the fetch in `@/lib/events` — stated
    again here so the page's own caching is legible without opening that file,
    the same way `/practitioners` documents its revalidate window. */
export const revalidate = 3600;

export default async function MeetupsPage() {
  const events = await listUpcomingEvents();

  return (
    <>
      <section className="container-x pt-36 pb-20 md:pt-48 md:pb-28">
        <SectionLabel>Meetups</SectionLabel>

        <h1 className="display-1 mt-8 max-w-6xl">Meetups.</h1>

        <p className="mt-10 max-w-2xl text-lg text-t-muted md:text-xl">
          The Code.Sydney Claude community meets weekly in Sydney — beginners and builders
          both. See what&rsquo;s next below, or join the group to get notified of every one.
        </p>

        <div className="mt-12 flex flex-wrap gap-4">
          <Button href="#meetups" size="lg">
            See what&rsquo;s next
          </Button>
          <Button href={site.meetup} variant="outline" size="lg">
            Join the group
          </Button>
        </div>
      </section>

      <section id="meetups" className="container-x scroll-mt-24 pb-16 md:pb-24">
        <MeetupEvents events={events} />
      </section>
    </>
  );
}
