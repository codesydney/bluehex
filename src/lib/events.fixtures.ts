/**
 * Real, captured Meetup iCal output for `events.test.ts` to parse.
 *
 * `SAMPLE_FEED` is the group's actual feed, verified 20 September 2026 against
 * `https://www.meetup.com/codesydney/events/ical/`, trimmed to its `VTIMEZONE`
 * block and the first two events. Real output rather than invented data, per
 * #59: the awkward cases — RFC 5545 line folding with a leading space,
 * escaped commas inside `DESCRIPTION`, markdown-style bold, unicode bullets —
 * are exactly the things a hand-written fixture tends to leave out because the
 * author does not think to put them in.
 *
 * `CANCELLED_EVENT` and `MALFORMED_EVENT` are hand-written, because a
 * cancelled event and a feed missing a required property have not occurred in
 * the live feed to capture — `STATUS:CONFIRMED` on all ten events was true at
 * capture time and is expected to drift, per #59's own note.
 */
export const SAMPLE_FEED = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Meetup//Meetup Calendar 1.0//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
NAME:Code.Sydney
X-WR-CALNAME:Code.Sydney
BEGIN:VTIMEZONE
TZID:Australia/Sydney
TZURL:http://tzurl.org/zoneinfo-outlook/Australia/Sydney
X-LIC-LOCATION:Australia/Sydney
BEGIN:STANDARD
TZOFFSETFROM:+1100
TZOFFSETTO:+1000
TZNAME:AEST
DTSTART:19700405T030000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
END:STANDARD
BEGIN:DAYLIGHT
TZOFFSETFROM:+1000
TZOFFSETTO:+1100
TZNAME:AEDT
DTSTART:19701004T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:event_316585851@meetup.com
SEQUENCE:1
DTSTAMP:20260920T015041Z
DTSTART;TZID=Australia/Sydney:20260924T081000
DTEND;TZID=Australia/Sydney:20260924T084000
SUMMARY:Sydney Claude Community: From Beginners to Builders
DESCRIPTION:Code.Sydney\\nWelcome to the Sydney Claude Community!\\n\\nWhethe
 r you are completely new to artificial intelligence or a seasoned develope
 r looking to architect enterprise solutions\\, this meetup is your space to
  learn\\, share\\, and grow.\\n\\nAI is moving fast\\, and navigating it alone
 can be overwhelming. We've broadened the scope of this group to support
 everyone in our local community who wants to understand and leverage AI—
 specifically\\n\\nAnthropic's Claude—no matter where you are on your jou
 rney.\\n\\n**What to Expect:**\\nGrab a coffee and join us for relaxed\\, open
  discussions broken down into three main areas of focus:\\n\\n•⁠ ⁠The
 AI Explorers (Beginners): for those who don't know much about AI yet.
URL;VALUE=URI:https://www.meetup.com/codesydney/events/316585851/
STATUS:CONFIRMED
CREATED:20260916T201508Z
LAST-MODIFIED:20260916T201508Z
CLASS:PUBLIC
END:VEVENT
BEGIN:VEVENT
UID:event_316565822@meetup.com
SEQUENCE:1
DTSTAMP:20260920T015041Z
DTSTART;TZID=Australia/Sydney:20261008T081000
DTEND;TZID=Australia/Sydney:20261008T084000
SUMMARY:Sydney Claude Community: From Beginners to Builders
DESCRIPTION:Code.Sydney\\nWelcome to the Sydney Claude Community!
URL;VALUE=URI:https://www.meetup.com/codesydney/events/316565822/
STATUS:CONFIRMED
CREATED:20260915T123403Z
LAST-MODIFIED:20260915T123403Z
CLASS:PUBLIC
END:VEVENT
END:VCALENDAR
`;

/** One `VEVENT`, standalone, with `STATUS:CANCELLED` — `listUpcomingEvents`
    must drop it rather than show a meetup that will not happen. */
export const CANCELLED_EVENT = `BEGIN:VEVENT
UID:event_cancelled@meetup.com
SEQUENCE:2
DTSTAMP:20260920T015041Z
DTSTART;TZID=Australia/Sydney:20261015T081000
DTEND;TZID=Australia/Sydney:20261015T084000
SUMMARY:Sydney Claude Community: From Beginners to Builders
URL;VALUE=URI:https://www.meetup.com/codesydney/events/316000000/
STATUS:CANCELLED
END:VEVENT
`;

/** Missing `URL` — there is nowhere to send someone to RSVP, so this is
    dropped rather than rendered with a dead link. */
export const MALFORMED_EVENT = `BEGIN:VEVENT
UID:event_no_url@meetup.com
SEQUENCE:1
DTSTAMP:20260920T015041Z
DTSTART;TZID=Australia/Sydney:20261022T081000
DTEND;TZID=Australia/Sydney:20261022T084000
SUMMARY:Sydney Claude Community: From Beginners to Builders
STATUS:CONFIRMED
END:VEVENT
`;
