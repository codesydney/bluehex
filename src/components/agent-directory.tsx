"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Close, Search, Sparkle } from "@/components/icons";
import { GradientBand } from "@/components/ui";
import { categories as categoryOptions, primaryLink, type Agent, type Category } from "@/lib/agents";
import { countryName } from "@/lib/practitioners";

/**
 * The Agent Exchange directory: a search box, filters, and a roster of listed
 * agents underneath.
 *
 * Deliberately the same shape as `PractitionerDirectory` — rows rather than
 * cards, search matching client-side against the whole list, filter groups
 * that gate on their own source data — because the two directories are the
 * same kind of surface: a small, hand-curated roster a visitor searches to
 * find someone (or something) to hire. What differs is the data underneath:
 * this one has no credential catalogue and no verification, because every row
 * here already cleared Bluehex's review before it was committed. See
 * `@/lib/agents` for what that review replaces.
 *
 * The listings are cards rather than table rows: that is how the Xhibiter
 * look the site follows lays out a roster.
 */

/** Every field a query is matched against, flattened once per agent. Mirrors
    `searchIndex` in `practitioner-directory.tsx`, including indexing the
    country's *name* rather than its code, for the same reason: that is the
    word a visitor types and the word the Location chips are labelled with. */
function searchIndex(agent: Agent) {
  return [
    agent.name,
    agent.tagline ?? "",
    agent.description ?? "",
    agent.developerName,
    agent.location ?? "",
    agent.countryCode ? countryName(agent.countryCode) : "",
    ...agent.categories,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesQuery(agent: Agent, query: string) {
  const haystack = searchIndex(agent);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function AgentDirectory({ agents }: { agents: Agent[] }) {
  const [query, setQuery] = useState("");
  const [countryFilters, setCountryFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<Category[]>([]);
  const searchBox = useRef<HTMLInputElement>(null);

  /* Only categories somebody actually lists under get a chip. Ordered from the
     closed set rather than `sort()`, so the chips read in the same order the
     set is declared in rather than alphabetically. */
  const offered = useMemo(
    () => categoryOptions.filter((category) => agents.some((agent) => agent.categories.includes(category))),
    [agents],
  );

  const countries = useMemo(
    () =>
      [...new Set(agents.flatMap((agent) => agent.countryCode ?? []))]
        .map((code) => ({ code, name: countryName(code) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const results = useMemo(
    () =>
      agents.filter((agent) => {
        if (countryFilters.length) {
          if (!agent.countryCode || !countryFilters.includes(agent.countryCode)) return false;
        }
        if (categoryFilters.length && !categoryFilters.some((item) => agent.categories.includes(item))) {
          return false;
        }
        return matchesQuery(agent, query);
      }),
    [agents, query, countryFilters, categoryFilters],
  );

  const filtering = query.trim() !== "" || countryFilters.length > 0 || categoryFilters.length > 0;

  const toggle = (setter: typeof setCategoryFilters) => (value: Category) =>
    setter((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );

  const toggleCountry = (value: string) =>
    setCountryFilters((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );

  const clearAll = () => {
    setQuery("");
    setCountryFilters([]);
    setCategoryFilters([]);
  };

  return (
    <GradientBand id="agents" tone="soft" className="scroll-mt-24 py-24">
      <div className="container-x">
        <h2 className="mb-4 text-center font-display text-3xl font-normal text-t-bright">
          Find an agent.
        </h2>

        <p className="mx-auto max-w-2xl text-center">
          Every listing here was built by an indie developer and reviewed by Bluehex before it
          went live — there is no self-service publishing yet, so what you see is the whole
          roster.
        </p>

        {/* Search ----------------------------------------------------- */}
        <div className="mx-auto mt-10 max-w-2xl">
          <label htmlFor="agent-search" className="sr-only">
            Search agents by name, category, developer or location
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-t-muted" />
            <input
              ref={searchBox}
              id="agent-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, category, developer or location"
              className="w-full rounded-2xl border border-stroke bg-white py-3 pr-12 pl-11 text-t-bright placeholder:text-t-faint focus:border-ink focus:ring-2 focus:ring-ink focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchBox.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-t-muted transition-colors hover:bg-ink hover:text-white"
              >
                <Close className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Filters ---------------------------------------------------- */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {countries.length > 0 ? (
            <FilterGroup label="Location">
              {countries.map((country) => (
                <FilterChip
                  key={country.code}
                  pressed={countryFilters.includes(country.code)}
                  onClick={() => toggleCountry(country.code)}
                >
                  {country.name}
                </FilterChip>
              ))}
            </FilterGroup>
          ) : null}

          {offered.length > 0 ? (
            <FilterGroup label="Category">
              {offered.map((category) => (
                <FilterChip
                  key={category}
                  pressed={categoryFilters.includes(category)}
                  onClick={() => toggle(setCategoryFilters)(category)}
                >
                  {category}
                </FilterChip>
              ))}
            </FilterGroup>
          ) : null}

          {filtering ? (
            <button
              type="button"
              onClick={clearAll}
              className="w-fit text-sm text-ink underline-offset-4 hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {/* Results ---------------------------------------------------- */}
        <p aria-live="polite" className="mt-8 text-center text-sm">
          {agents.length === 0
            ? "The first agents are being reviewed now."
            : `${results.length} ${results.length === 1 ? "agent" : "agents"}`}
        </p>

        {filtering && results.length === 0 ? (
          <div className="mx-auto mt-6 max-w-2xl rounded-card border border-stroke bg-white p-8 text-center">
            <p className="font-display text-lg text-t-bright">No agent matches that yet.</p>
            <p className="mt-3">
              {agents.length > 0
                ? "Try a broader term, or clear the filters to see everyone in the exchange."
                : "No agents are listed yet, so there is nothing to search — clearing this will not turn any up. Yours could be the first."}
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2 md:gap-[1.875rem] lg:grid-cols-3">
            {results.map((agent) => (
              <li key={agent.id}>
                <AgentCard agent={agent} />
              </li>
            ))}

            {!filtering ? (
              <li className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-xh-jacarta-200 bg-white/70 p-8 text-center md:col-span-2 lg:col-span-3">
                <span className="grid size-12 place-items-center rounded-full bg-ink text-white shadow-xh-accent-volume">
                  <Sparkle className="size-5" />
                </span>
                <p className="font-display text-xl text-t-bright">Your agent here</p>
                <p className="max-w-md text-sm leading-relaxed">
                  Built something on Claude? Tell us about it through{" "}
                  <a href="/contact" className="font-semibold text-ink hover:text-ink-tint">
                    Contact
                  </a>{" "}
                  and, once it clears review, it lists here.
                </p>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </GradientBand>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const labelId = useId();

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span id={labelId} className="mr-1 font-display text-sm text-t-bright">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center justify-center gap-2">
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
      className={`inline-flex h-9 items-center rounded-xl border px-4 font-display text-sm transition-colors ${
        pressed
          ? "border-transparent bg-ink text-white"
          : "border-stroke bg-white text-t-muted hover:border-transparent hover:bg-ink hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const link = primaryLink(agent);

  return (
    <article className="flex h-full flex-col rounded-card border border-stroke bg-white p-7 transition-shadow hover:shadow-lg">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-[0.625rem] bg-ink font-display text-lg text-white"
        >
          {agent.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight wrap-break-word text-t-bright">
            {agent.name}
          </h3>
          <p className="mt-1 text-sm wrap-break-word text-ink">
            By {agent.developerName}
            {agent.location ? ` · ${agent.location}` : ""}
          </p>
        </div>
      </div>

      {agent.tagline ? (
        <p className="mt-4 font-semibold wrap-break-word text-t-bright">{agent.tagline}</p>
      ) : null}

      {agent.description ? (
        <p className="mt-2 text-sm wrap-break-word">{agent.description}</p>
      ) : (
        <p className="mt-2 text-sm text-t-faint">No description yet.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.categories.map((item) => (
          <span
            key={item}
            className="rounded-lg border border-stroke bg-xh-jacarta-50 px-2.5 py-1 text-xs text-t-bright"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-6">
        <span className="text-sm">{agent.pricing ?? ""}</span>

        {/* One call to action per card, an external link rather than a `Link` —
            there is no `/agent/<id>` page yet, so the card sends a visitor
            straight to the agent's own site. See `primaryLink`. */}
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white shadow-xh-accent-volume transition-all hover:bg-ink-tint"
          >
            Visit
            <span className="sr-only"> {agent.name}, opens in a new tab</span>
            <ArrowUpRight className="size-3.5" />
          </a>
        ) : null}
      </div>
    </article>
  );
}
