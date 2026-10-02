/**
 * The Meetup group's upcoming events, read from its public iCal feed.
 *
 * #59's scope, folded into #60 rather than shipped as its own ticket — see the
 * closing comment on #59: "we have decided not to do a full events page and
 * instead do #60 only." That closed the door on a *fetched* full events page,
 * not on fetching itself: #60 later grew into its own page (Agent Exchange's
 * third tab, #157), and this module is that page's data layer, kept separate
 * from rendering for the same reason `practitioners.ts` is — a pure module a
 * test can import without a network call.
 *
 * ## The invariant
 *
 * **A Meetup outage must never take the page down.** This is a read from a
 * third party Bluehex does not control, unlike the Postgres reads in
 * `@/lib/directory` — there is no local source of truth to fail loudly in
 * defence of, so the right behaviour is the opposite of that module's: log the
 * reason and return an empty list. `listUpcomingEvents` never throws.
 *
 * ## Parsing, by hand
 *
 * The feed has one property per line, folded per RFC 5545: a continuation
 * starts with a single leading space and is joined onto the previous line
 * before anything else runs. `unfoldLines` does only that. There is a
 * defensible argument for an iCal library here, and an equally defensible one
 * against: the feed uses a handful of properties (`UID`, `SUMMARY`,
 * `DTSTART`, `URL`, `STATUS`) with no recurrence rules on the events
 * themselves, so a hand-rolled reader is a few dozen lines rather than a new
 * dependency — chosen for that reason, consistent with #59's own suggestion.
 *
 * ## Time zones
 *
 * `DTSTART` carries `TZID=Australia/Sydney`, not UTC, and Sydney's offset
 * moves between `+10` and `+11` with daylight saving — `sydneyOffsetMinutes`
 * finds the offset in effect for a given instant, using `Intl` rather than a
 * hardcoded rule, so the switchover is correct without this module tracking
 * the date DST starts. Everything downstream holds a real UTC `Date`, and
 * formatting it in `Australia/Sydney` at render time is the caller's job —
 * this module does not format anything, which is what keeps a Server
 * Component rendering it free of a client/server hydration mismatch.
 */

export type Event = {
  id: string;
  title: string;
  /** The UTC instant the event starts, resolved from `DTSTART` and its zone. */
  start: Date;
  end: Date;
  /** The Meetup event page — where a visitor RSVPs. */
  url: string;
};

const MEETUP_ICAL_URL = "https://www.meetup.com/codesydney/events/ical/";

/** RFC 5545 line unfolding: a line beginning with a single space or tab is a
    continuation of the previous one, joined without the leading whitespace. */
function unfoldLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else if (raw !== "") {
      lines.push(raw);
    }
  }
  return lines;
}

type Property = { name: string; params: Record<string, string>; value: string };

/** `NAME;PARAM=value:the rest` → `{ name: "NAME", params: { PARAM: "value" },
    value: "the rest" }`. The colon inside a value (a URL, say) is why this
    splits on the *first* colon rather than the last. */
function parseLine(line: string): Property {
  const colon = line.indexOf(":");
  const head = colon === -1 ? line : line.slice(0, colon);
  const value = colon === -1 ? "" : line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const [key, val] = part.split("=");
    if (key && val) params[key] = val;
  }
  return { name, params, value };
}

/** The offset of `timeZone`, in minutes east of UTC, at the instant `date`
    names. Reads it from `Intl` rather than a hardcoded DST rule, so a
    daylight saving switchover is correct without this module tracking when
    one happens. */
function offsetMinutes(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(formatted ?? "");
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/**
 * A `DTSTART`/`DTEND` value plus its `TZID` param, as a real UTC `Date`.
 *
 * The offset a wall-clock instant needs is the one in effect *at that
 * instant*, which is what it is trying to compute — so this guesses first by
 * treating the local time as if it were already UTC, reads the zone's offset
 * at that guess, and corrects by it. The guess can only be wrong within a
 * couple of hours of a DST transition itself, which none of this feed's
 * 08:10 events are anywhere near.
 */
function toUtc(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number) as unknown as [
    never,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60_000);
}

/** iCal's `TEXT` escaping — only the sequences this feed's `SUMMARY` could
    plausibly contain, since nothing here renders `DESCRIPTION`. */
function unescapeText(value: string): string {
  return value.replace(/\\([,;nN\\])/g, (_, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
}

/**
 * The feed's `VEVENT` blocks, parsed into `Event`s.
 *
 * Exported for `events.test.ts`, which asserts against real captured feed
 * output — see `events.fixtures.ts` for why. Everything outside a `VEVENT`
 * (`VCALENDAR`, `VTIMEZONE`) is ignored rather than misread: `VTIMEZONE`
 * carries its own `DTSTART` and `RRULE` describing when the zone's *offset*
 * changes, which is a different thing entirely from an event's start time and
 * would be a real bug to parse as one.
 */
export function parseEvents(ical: string): Event[] {
  const events: Event[] = [];
  let current: Record<string, Property> | null = null;

  for (const line of unfoldLines(ical)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const event = toEvent(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const property = parseLine(line);
    current[property.name] = property;
  }

  return events;
}

function toEvent(props: Record<string, Property>): Event | null {
  /* `STATUS:CANCELLED` is a legal value the feed has not carried yet — see
     #59 — and a cancelled event is dropped here rather than rendered, the
     same way a withdrawn practitioner profile is filtered by a policy rather
     than shown with a strikethrough. */
  if (props.STATUS?.value === "CANCELLED") return null;

  const uid = props.UID?.value;
  const title = props.SUMMARY?.value;
  const url = props.URL?.value;
  const dtstart = props.DTSTART;
  const dtend = props.DTEND;
  if (!uid || !title || !url || !dtstart || !dtend) return null;

  const timeZone = dtstart.params.TZID ?? "UTC";
  const start = toUtc(dtstart.value, timeZone);
  const end = toUtc(dtend.value, dtend.params.TZID ?? timeZone);
  if (!start || !end) return null;

  return { id: uid, title: unescapeText(title), start, end, url };
}

/**
 * Upcoming events, soonest first, past and cancelled ones dropped.
 *
 * No `revalidate` argument: the interval lives on the `fetch` call itself,
 * `next: { revalidate }`, which is the lever Next gives a Server Component
 * for exactly this — a read that does not need to be per-request. A weekly
 * event does not need a fresh fetch on every visit.
 */
export async function listUpcomingEvents(): Promise<Event[]> {
  let text: string;
  try {
    const response = await fetch(MEETUP_ICAL_URL, { next: { revalidate: 3600 } });
    if (!response.ok) {
      console.error(`Reading the Meetup feed failed: ${response.status} ${response.statusText}`);
      return [];
    }
    text = await response.text();
  } catch (error) {
    console.error("Reading the Meetup feed failed:", error);
    return [];
  }

  let events: Event[];
  try {
    events = parseEvents(text);
  } catch (error) {
    console.error("Parsing the Meetup feed failed:", error);
    return [];
  }

  const now = Date.now();
  return events
    .filter((event) => event.start.getTime() > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
