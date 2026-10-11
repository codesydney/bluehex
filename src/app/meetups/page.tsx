import type { Metadata } from "next";
import { Collaborators } from "@/components/collaborators";
import { MeetupEvents } from "@/components/meetup-events";
import { Button, Hero } from "@/components/ui";
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
      <Hero
        label="Meetups"
        title="Meetups."
        lead={
          <>
            The Code.Sydney Claude community meets weekly in Sydney — beginners and builders
            both. See what&rsquo;s next below, or join the group to get notified of every one.
          </>
        }
        actions={
          <>
            <Button href="#meetups" size="lg">
              See what&rsquo;s next
            </Button>
            <Button href={site.meetup} variant="outline" size="lg">
              Join the group
            </Button>
          </>
        }
      >
        <Collaborators />
      </Hero>

      <section id="meetups" className="container-x scroll-mt-24 py-16 md:py-24">
        <MeetupEvents events={events} />
      </section>
    </>
  );
}
