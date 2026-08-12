"use client";

import { useMemo, useState } from "react";
import { Close, Search, Sparkle } from "@/components/icons";
import { Badge, Card } from "@/components/ui";
import type { Practitioner } from "@/lib/practitioners";

/**
 * The practitioner directory: a search box, a row of filters and the grid of
 * profiles underneath.
 *
 * Everything matches client-side against the practitioner list, which ships
 * with the page — the directory is small enough that a round trip per keystroke
 * would only add latency. If the list outgrows that, this is the seam to move
 * behind a route handler; the props stay the same.
 */

/** Every field a query is matched against, flattened once per practitioner. */
function searchIndex(person: Practitioner) {
  return [
    person.name,
    person.role,
    person.location,
    person.bio,
    ...person.focus,
    ...person.credentials.flatMap((credential) => [credential.label, credential.source]),
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
  const [focusFilters, setFocusFilters] = useState<string[]>([]);

  /* Focus areas are whatever the published profiles actually claim — there is
     no separate taxonomy to drift out of sync with. */
  const focusAreas = useMemo(
    () => [...new Set(practitioners.flatMap((person) => person.focus))].sort(),
    [practitioners],
  );

  const results = useMemo(
    () =>
      practitioners.filter((person) => {
        if (verifiedOnly && !person.verified) return false;
        if (focusFilters.length && !focusFilters.some((item) => person.focus.includes(item))) {
          return false;
        }
        return matchesQuery(person, query);
      }),
    [practitioners, query, verifiedOnly, focusFilters],
  );

  const filtering = query.trim() !== "" || verifiedOnly || focusFilters.length > 0;

  const toggleFocus = (area: string) =>
    setFocusFilters((current) =>
      current.includes(area) ? current.filter((item) => item !== area) : [...current, area],
    );

  const clearAll = () => {
    setQuery("");
    setVerifiedOnly(false);
    setFocusFilters([]);
  };

  return (
    <section id="practitioners" className="container-x scroll-mt-24 py-16 md:py-24">
      <h2 className="display-2 max-w-3xl">Find a Claude practitioner.</h2>

      <p className="mt-6 max-w-2xl text-t-muted">
        Anyone in the community can publish a profile. <strong className="font-medium text-t-bright">Verified</strong>{" "}
        means Bluehex has checked the credentials on it against the certificates that issued them.
      </p>

      {/* Search ------------------------------------------------------- */}
      <div className="mt-10 max-w-3xl">
        <label htmlFor="practitioner-search" className="sr-only">
          Search practitioners by name, skill, credential or location
        </label>
        <div className="flex items-center gap-4 rounded-full bg-surface px-6 py-4 md:px-8 md:py-5">
          <Search className="size-5 shrink-0 text-t-faint md:size-6" />
          <input
            id="practitioner-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by skill, credential, role or location"
            /* The native search affordances duplicate the clear button and the
               icon this box already draws. */
            className="w-full bg-transparent text-base outline-none placeholder:text-t-faint md:text-lg [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid size-8 shrink-0 place-items-center rounded-full text-t-muted transition-colors hover:bg-ink hover:text-t-invert"
            >
              <Close className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Filters ------------------------------------------------------ */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <FilterChip pressed={verifiedOnly} onClick={() => setVerifiedOnly(!verifiedOnly)}>
          Verified only
        </FilterChip>

        {focusAreas.map((area) => (
          <FilterChip
            key={area}
            pressed={focusFilters.includes(area)}
            onClick={() => toggleFocus(area)}
          >
            {area}
          </FilterChip>
        ))}

        {filtering ? (
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 text-sm text-t-muted underline-offset-4 transition-colors hover:text-t-bright hover:underline"
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
        <ul className="mt-6 grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((person) => (
            <li key={person.name}>
              <PractitionerCard person={person} />
            </li>
          ))}

          {/* The invitation only belongs on an unfiltered view — under an active
              search it would read as a result. */}
          {!filtering ? (
            <li>
              <div className="flex h-full min-h-64 flex-col items-start justify-end gap-3 rounded-card border border-dashed border-stroke p-8 md:p-10">
                <Sparkle className="size-6 text-t-faint" />
                <p className="text-xl font-medium">Your profile here</p>
                <p className="text-sm leading-relaxed text-t-muted">
                  Certified, or working towards it. Both belong in the directory.
                </p>
              </div>
            </li>
          ) : null}
        </ul>
      )}
    </section>
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

function PractitionerCard({ person }: { person: Practitioner }) {
  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-medium">{person.name}</h3>
          <p className="mt-1 text-sm text-t-muted">{person.role}</p>
          <p className="text-sm text-t-faint">{person.location}</p>
        </div>
        {/* The badge is only ever about the Bluehex check. Where someone is up
            to with certification shows per credential in the list below. */}
        <Badge tone={person.verified ? "strong" : "quiet"}>
          {person.verified ? "Verified" : "Self-listed"}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-t-muted">{person.bio}</p>

      <ul className="flex flex-col gap-2">
        {person.credentials.map((credential) => (
          <li key={credential.label} className="flex items-start gap-2.5 text-sm text-t-medium">
            <Sparkle className="mt-1 size-3.5 shrink-0 text-t-faint" />
            <span>
              {credential.label}
              <span className="block text-xs text-t-faint">
                {credential.earned ?? "In progress"}
                {credential.source === credential.label ? "" : ` · ${credential.source}`}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        {person.focus.map((item) => (
          <Badge key={item}>{item}</Badge>
        ))}
      </div>
    </Card>
  );
}
