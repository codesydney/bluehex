import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANCELLED_EVENT, MALFORMED_EVENT, SAMPLE_FEED } from "./events.fixtures";
import { listUpcomingEvents, parseEvents } from "./events";

describe("parseEvents", () => {
  it("parses real captured feed output into events, resolving Sydney local time to UTC", () => {
    const events = parseEvents(SAMPLE_FEED);

    expect(events).toHaveLength(2);

    /* 24 September 2026, 08:10 Australia/Sydney is before daylight saving
       starts (the first Sunday of October) and is therefore AEST, UTC+10. */
    expect(events[0]).toMatchObject({
      id: "event_316585851@meetup.com",
      title: "Sydney Claude Community: From Beginners to Builders",
      url: "https://www.meetup.com/codesydney/events/316585851/",
    });
    expect(events[0].start.toISOString()).toBe("2026-09-23T22:10:00.000Z");
    expect(events[0].end.toISOString()).toBe("2026-09-23T22:40:00.000Z");

    /* 8 October 2026 is after the switchover, so the same 08:10 local time is
       AEDT, UTC+11 — an hour earlier in UTC than the September event despite
       the identical local clock time. This is the assertion that would fail
       first if daylight saving were ever hardcoded instead of read from
       `Intl`. */
    expect(events[1].start.toISOString()).toBe("2026-10-07T21:10:00.000Z");
  });

  it("drops a cancelled event rather than rendering it", () => {
    expect(parseEvents(CANCELLED_EVENT)).toEqual([]);
  });

  it("drops an event missing a required property rather than rendering it half-built", () => {
    expect(parseEvents(MALFORMED_EVENT)).toEqual([]);
  });

  it("ignores VTIMEZONE's own DTSTART and RRULE rather than misreading them as an event", () => {
    /* The VTIMEZONE block in SAMPLE_FEED carries two DTSTART lines of its own,
       describing when the zone's offset changes rather than when anything is
       happening — get this wrong and the parser reports two extra "events". */
    expect(parseEvents(SAMPLE_FEED)).toHaveLength(2);
  });

  it("returns nothing for text with no VEVENT block, rather than throwing", () => {
    expect(parseEvents("this is not an iCal feed")).toEqual([]);
  });
});

describe("listUpcomingEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    /* Before both events in SAMPLE_FEED, so neither is filtered as past —
       real time would eventually pass them, which is exactly why this is
       frozen rather than left to the clock the suite happens to run under. */
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns upcoming events soonest first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SAMPLE_FEED) }),
    );

    const events = await listUpcomingEvents();

    expect(events.map((event) => event.id)).toEqual([
      "event_316585851@meetup.com",
      "event_316565822@meetup.com",
    ]);
  });

  it("drops an event once its start time has passed", async () => {
    vi.setSystemTime(new Date("2026-09-25T00:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SAMPLE_FEED) }),
    );

    const events = await listUpcomingEvents();

    expect(events.map((event) => event.id)).toEqual(["event_316565822@meetup.com"]);
  });

  /* The invariant from #59: a Meetup outage must never take the page down, so
     every failure mode below degrades to an empty list rather than throwing. */

  it("degrades to an empty list when the feed responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" }),
    );

    await expect(listUpcomingEvents()).resolves.toEqual([]);
  });

  it("degrades to an empty list when the fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await expect(listUpcomingEvents()).resolves.toEqual([]);
  });

  it("degrades to an empty list when the response is not a feed at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<html>down for maintenance</html>") }),
    );

    await expect(listUpcomingEvents()).resolves.toEqual([]);
  });
});
