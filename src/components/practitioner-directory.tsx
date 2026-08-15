"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { CredentialMark, Tick, earnedLabel } from "@/components/credential-mark";
import { Close, Search, Sparkle } from "@/components/icons";
import { Badge, Card } from "@/components/ui";
import {
  countryName,
  hasVerifiedBadge,
  profilePath,
  services as serviceOptions,
  type Practitioner,
  type Service,
} from "@/lib/practitioners";

/**
 * The practitioner directory: a search box, filters, and a roster of profiles
 * underneath.
 *
 * A roster of rows rather than a grid of cards, because the job someone does
 * here is *comparing* practitioners, and a grid is a poor shape for that — each
 * card is read on its own and nothing lines up between them. In rows the
 * credentials sit in a column, so "who has actually been checked" is a
 * vertical scan rather than eight separate readings.
 *
 * Everything matches client-side against the practitioner list, which ships
 * with the page — the directory is small enough that a round trip per keystroke
 * would only add latency. If the list outgrows that, this is the seam to move
 * behind a route handler; the props stay the same.
 *
 * **The filter axis is `services`, not `focus`.** A visitor arrives to hire
 * somebody rather than to survey the community's skill distribution, and
 * "one-to-one tutoring" is what they came to type. `focus` answers a question
 * they did not ask — knowing RAG does not say whether you can be hired for an
 * afternoon — so it survives as free text on the profile page and no longer
 * drives the roster.
 *
 * Two things here are load-bearing rather than stylistic:
 *
 *   - **The badge sits with the credentials, never beside the name.** It
 *     attests to evidence a human read — the credentials, and the name they
 *     are attached to — and never to `bio`, `headline`, `focus` or `location`.
 *     Placed beside the name it reads as a whole-profile endorsement, which is
 *     a claim Bluehex has no method for. No schema rule can fix that reading,
 *     so the placement is the mitigation. See the spec.
 *   - **The badge is derived, not read.** There is no profile-level `verified`
 *     column. `hasVerifiedBadge` computes it from the credential rows, and the
 *     "Verified only" filter computes it too.
 */

/**
 * Every field a query is matched against, flattened once per practitioner.
 *
 * The country goes in as its *name*, because that is the word a visitor types
 * and the same word the Location chips are labelled with. Leaving it out let
 * the search box and the filter disagree about one fact: "Australia" matched
 * nobody while the chip built from the same `countryCode` selected them. The
 * raw code is deliberately not indexed — two-letter queries would hit far more
 * than they were aimed at.
 *
 * `services` goes in for the same reason the country name does: it is what the
 * chips are labelled with now, so leaving it out would recreate exactly that
 * disagreement. `focus` stays indexed even though it no longer has chips —
 * typing "RAG" should still find people, and free text with no chip behind it
 * cannot disagree with a filter that does not exist.
 */
function searchIndex(person: Practitioner) {
  return [
    person.name,
    person.headline ?? "",
    person.location ?? "",
    person.countryCode ? countryName(person.countryCode) : "",
    person.bio ?? "",
    ...person.focus,
    ...person.services,
    ...person.credentials.flatMap((credential) => [
      credential.entry.label,
      credential.entry.source,
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

/* A query matches when every word in it appears somewhere in the profile, so
   "sydney agents" narrows rather than widens the way a plain substring would. */
function matchesQuery(person: Practitioner, query: string) {
  const haystack = searchIndex(person);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function PractitionerDirectory({ practitioners }: { practitioners: Practitioner[] }) {
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [countryFilters, setCountryFilters] = useState<string[]>([]);
  const [serviceFilters, setServiceFilters] = useState<string[]>([]);
  const searchBox = useRef<HTMLInputElement>(null);

  /* Only services somebody actually offers get a chip, rather than the whole
     closed set — a chip that always returns nothing is worse than no chip. But
     the order comes from the closed set instead of `sort()`, because unlike the
     focus areas this replaced there is a canonical order, and alphabetical
     would put "Architecture and advisory" first for no reason. */
  const offered = useMemo(
    () =>
      serviceOptions.filter((service) =>
        practitioners.some((person) => person.services.includes(service)),
      ),
    [practitioners],
  );

  /* Location filtering groups on `countryCode`, not on `location`. `location`
     is free text at whatever granularity the practitioner chose — "Sydney"
     next to "Bengaluru, Karnataka, India (remote)" — so it will never collapse
     into a usable set of chips. The country code exists for exactly this. */
  const countries = useMemo(
    () =>
      /* flatMap over `?? []` drops the nulls and narrows the type in one step. */
      [...new Set(practitioners.flatMap((person) => person.countryCode ?? []))]
        .map((code) => ({ code, name: countryName(code) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [practitioners],
  );

  const results = useMemo(
    () =>
      practitioners.filter((person) => {
        if (verifiedOnly && !hasVerifiedBadge(person.credentials)) return false;
        if (countryFilters.length) {
          if (!person.countryCode || !countryFilters.includes(person.countryCode)) return false;
        }
        if (
          serviceFilters.length &&
          !serviceFilters.some((item) => person.services.includes(item as Service))
        ) {
          return false;
        }
        return matchesQuery(person, query);
      }),
    [practitioners, query, verifiedOnly, countryFilters, serviceFilters],
  );

  const filtering =
    query.trim() !== "" || verifiedOnly || countryFilters.length > 0 || serviceFilters.length > 0;

  const toggle = (setter: typeof setServiceFilters) => (value: string) =>
    setter((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );

  const clearAll = () => {
    setQuery("");
    setVerifiedOnly(false);
    setCountryFilters([]);
    setServiceFilters([]);
  };

  return (
    <section id="practitioners" className="container-x scroll-mt-24 py-16 md:py-24">
      <h2 className="display-2 max-w-3xl">Find a Claude practitioner.</h2>

      <p className="mt-6 max-w-2xl text-t-muted">
        Anyone in the community can publish a profile.{" "}
        <strong className="font-medium text-t-bright">Verified</strong> means Bluehex has
        checked that credential against the certificate that issued it.
      </p>

      {/* Search ------------------------------------------------------- */}
      <div className="mt-10 max-w-3xl">
        <label htmlFor="practitioner-search" className="sr-only">
          Search practitioners by name, service, skill, credential or location
        </label>
        {/* The focus ring lives on the pill rather than the input, so it traces
            the rounded shape instead of boxing the text. Matches the global
            :focus-visible treatment in globals.css. */}
        <div className="flex items-center gap-4 rounded-full bg-surface px-6 py-4 outline-ink outline-offset-[3px] focus-within:outline-2 md:px-8 md:py-5">
          <Search className="size-5 shrink-0 text-t-faint md:size-6" />
          <input
            ref={searchBox}
            id="practitioner-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by service, skill, credential or location"
            /* The native search affordances duplicate the clear button and the
               icon this box already draws. */
            className="w-full bg-transparent text-base outline-none placeholder:text-t-faint md:text-lg [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              /* Clearing unmounts this button, so hand focus back to the input
                 rather than dropping the keyboard user out to the document. */
              onClick={() => {
                setQuery("");
                searchBox.current?.focus();
              }}
              aria-label="Clear search"
              className="grid size-8 shrink-0 place-items-center rounded-full text-t-muted transition-colors hover:bg-ink hover:text-t-invert"
            >
              <Close className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Filters ------------------------------------------------------ */}
      {/* Grouped rather than one flat row of chips: "Verified", a country and a
          focus area are three different kinds of claim, and mixing them makes
          the row read as one undifferentiated pile. Groups whose source data is
          empty render nothing at all. */}
      <div className="mt-8 flex flex-col gap-4">
        <FilterGroup label="Verification">
          <FilterChip pressed={verifiedOnly} onClick={() => setVerifiedOnly(!verifiedOnly)}>
            Verified only
          </FilterChip>
        </FilterGroup>

        {countries.length > 0 ? (
          <FilterGroup label="Location">
            {countries.map((country) => (
              <FilterChip
                key={country.code}
                pressed={countryFilters.includes(country.code)}
                onClick={() => toggle(setCountryFilters)(country.code)}
              >
                {country.name}
              </FilterChip>
            ))}
          </FilterGroup>
        ) : null}

        {offered.length > 0 ? (
          <FilterGroup label="Services">
            {offered.map((service) => (
              <FilterChip
                key={service}
                pressed={serviceFilters.includes(service)}
                onClick={() => toggle(setServiceFilters)(service)}
              >
                {service}
              </FilterChip>
            ))}
          </FilterGroup>
        ) : null}

        {filtering ? (
          <button
            type="button"
            onClick={clearAll}
            className="w-fit text-sm text-t-muted underline-offset-4 transition-colors hover:text-t-bright hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* Results ------------------------------------------------------ */}
      <p aria-live="polite" className="mt-8 text-sm text-t-muted">
        {practitioners.length === 0
          ? "The first profiles are being verified now."
          : `${results.length} ${results.length === 1 ? "practitioner" : "practitioners"}`}
      </p>

      {filtering && results.length === 0 && practitioners.length > 0 ? (
        <Card className="mt-6">
          <p className="text-lg">No practitioner matches that yet.</p>
          <p className="mt-3 text-t-muted">
            Try a broader term, or clear the filters to see everyone in the directory.
          </p>
        </Card>
      ) : (
        <div className="mt-6 overflow-hidden rounded-card bg-surface">
          {results.length > 0 ? (
            <>
              {/* Column headings. Suppressed below lg, where a row stacks and
                  headings would label nothing. */}
              <div
                aria-hidden="true"
                className="hidden border-b border-stroke px-6 py-3 text-xs font-medium tracking-wide text-t-faint uppercase lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] lg:gap-8 lg:px-8"
              >
                <span>Practitioner</span>
                <span>Credentials</span>
                <span>Services</span>
                <span />
              </div>

              <ul>
                {results.map((person) => (
                  <li
                    key={person.id}
                    className="grid gap-5 border-b border-stroke px-6 py-6 last:border-b-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] lg:items-start lg:gap-8 lg:px-8"
                  >
                    <PractitionerRow person={person} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {/* The invitation only belongs on an unfiltered view — under an active
              search it would read as a result. */}
          {!filtering ? (
            <div className="flex flex-col items-start gap-3 border-t border-dashed border-stroke p-8 first:border-t-0 md:p-10">
              <Sparkle className="size-6 text-t-faint" />
              <p className="text-xl font-medium">Your profile here</p>
              {/* "Working towards it" is a statement about people, not about a
                  row anybody can enter — there is no in-progress credential and
                  a profile with none is an ordinary profile. The invitation is
                  still true and is deliberately not narrowed to the credentialed:
                  a practitioner says what they are working through in their bio,
                  in their own words. */}
              <p className="max-w-md text-sm leading-relaxed text-t-muted">
                Certified, or working towards it. Both belong in the directory.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const labelId = useId();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        id={labelId}
        className="w-20 shrink-0 text-xs font-medium tracking-wide text-t-faint uppercase"
      >
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
        pressed
          ? "border-ink bg-ink text-t-invert"
          : "border-stroke text-t-muted hover:border-stroke-strong hover:text-t-bright"
      }`}
    >
      {children}
    </button>
  );
}

function PractitionerRow({ person }: { person: Practitioner }) {
  return (
    <>
      {/* Practitioner. No badge in this column, deliberately — see the note at
          the top of the file. `countryCode` drives the location filter and is
          what a flag would be drawn from; the flag asset itself is its own
          ticket, so nothing renders it here yet. */}
      <div className="min-w-0">
        <h3 className="font-medium break-words">{person.name}</h3>
        {person.headline ? (
          <p className="mt-0.5 text-sm break-words text-t-muted">{person.headline}</p>
        ) : null}
        {person.location ? (
          <p className="mt-1.5 text-xs break-words text-t-faint">{person.location}</p>
        ) : null}
      </div>

      {/* Credentials, and the badge that belongs to them. */}
      <div className="min-w-0">
        {hasVerifiedBadge(person.credentials) ? (
          <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-t-invert">
            <Tick className="size-2.5" />
            Verified by Bluehex
          </p>
        ) : null}

        {person.credentials.length === 0 ? (
          <p className="text-sm text-t-faint">No credentials listed.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {person.credentials.map((credential) => (
              <li key={credential.entry.id} className="flex items-start gap-2 text-sm">
                <CredentialMark credential={credential} />
                <span className="min-w-0">
                  <span className="break-words text-t-medium">{credential.entry.label}</span>
                  <span className="ml-2 text-xs whitespace-nowrap text-t-faint">
                    {earnedLabel(credential)}
                  </span>
                  {credential.evidenceUrl ? (
                    <a
                      href={credential.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-t-muted underline decoration-stroke underline-offset-4 transition-colors hover:text-t-bright hover:decoration-current"
                    >
                      Certificate
                      <span className="sr-only">
                        {" "}
                        for {credential.entry.label}, opens in a new tab
                      </span>
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Services. Self-described and never vetted — which is how every
          directory works, and the reason the badge's placement above is
          load-bearing. `services` sharpens that: somebody filtering by "code
          review" and landing on a badged profile is one step from reading the
          badge as Bluehex endorsing the service, which it never does.

          Empty renders nothing rather than a placeholder. A practitioner who
          has not said what they sell is a normal profile, not a gap. */}
      <div className="flex flex-wrap gap-1.5">
        {person.services.map((item) => (
          <Badge key={item}>{item}</Badge>
        ))}
      </div>

      {/* One call to action per surface: the directory's job is to get you to a
          profile, the profile's job is to get you to enquire. Enquiring from the
          row would ask someone to commit before they have read anything, and it
          is why the profile page ends in "Enquire about {first name}" instead.

          A `Link` rather than an `<a>`, so the navigation is soft and the route
          is prefetched. Worth knowing if an overlay is ever attempted here
          again: route interception applies to soft navigation *only*, so an
          anchor silently disables it and full-page-loads every profile, and the
          symptom looks exactly like a misconfigured interceptor. One was built
          and cut for that reason among others. */}
      <Link
        href={profilePath(person)}
        className="inline-flex h-9 w-fit shrink-0 items-center rounded-full border border-stroke-strong px-4 text-sm font-medium transition-colors hover:bg-ink hover:text-t-invert"
      >
        View profile
        <span className="sr-only"> for {person.name}</span>
      </Link>
    </>
  );
}
