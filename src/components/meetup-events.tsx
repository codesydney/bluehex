import { Badge, Button, Card } from "@/components/ui";
import type { Event } from "@/lib/events";
import { site } from "@/lib/site";

/**
 * The Meetups page's roster: the next event highlighted, a short list of the
 * ones after it.
 *
 * A Server Component, deliberately — #60's scope note ("no `use client`,
 * there is no interaction here beyond a link") still holds now that this is a
 * page rather than a home page band. Formatting the date here rather than in
 * `@/lib/events` is what keeps that module a pure, testable parser: this
 * component is the one place a `Date` becomes a Sydney-local string, and it
 * does so entirely on the server, so there is no client-rendered date to
 * disagree with what the server already sent down.
 */

const dateFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatWhen(event: Event) {
  return `${dateFormatter.format(event.start)} · ${timeFormatter.format(event.start)}`;
}

/** How many events after the next one get a row. Four plus the highlighted
    one is a month or so of a weekly meetup — enough to show the cadence
    without turning into the calendar #59/#60 explicitly ruled out. */
const UPCOMING_LIMIT = 4;

export function MeetupEvents({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <p className="text-lg">Nothing scheduled right now.</p>
        <p className="mt-3 text-t-muted">
          The group page is the source of truth if this is out of date —{" "}
          <a
            href={site.meetup}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-stroke underline-offset-4 hover:text-t-bright hover:decoration-current"
          >
            check Meetup directly
          </a>
          .
        </p>
      </Card>
    );
  }

  const [next, ...rest] = events;
  const upcoming = rest.slice(0, UPCOMING_LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Badge tone="strong">Next meetup</Badge>
          <h3 className="display-3 mt-4 wrap-break-word">{next.title}</h3>
          <p className="mt-2 text-t-muted">{formatWhen(next)}</p>
        </div>
        <Button href={next.url} variant="outline" className="shrink-0">
          RSVP
        </Button>
      </Card>

      {upcoming.length > 0 ? (
        <div className="overflow-hidden rounded-card bg-surface">
          <ul>
            {upcoming.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-4 border-b border-stroke px-6 py-5 last:border-b-0 md:flex-row md:items-center md:justify-between md:px-8"
              >
                <div className="min-w-0">
                  <p className="font-medium wrap-break-word">{event.title}</p>
                  <p className="mt-1 text-sm text-t-muted">{formatWhen(event)}</p>
                </div>
                <Button href={event.url} variant="outline" size="sm" className="w-fit shrink-0">
                  RSVP
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
