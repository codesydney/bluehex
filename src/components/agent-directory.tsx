"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Close, Search, Sparkle } from "@/components/icons";
import { Badge, Card } from "@/components/ui";
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
    <section id="agents" className="container-x scroll-mt-24 py-16 md:py-24">
      <h2 className="display-2 max-w-3xl">Find an agent.</h2>

      <p className="mt-6 max-w-2xl text-t-muted">
        Every listing here was built by an indie developer and reviewed by Bluehex before it
        went live — there is no self-service publishing yet, so what you see is the whole
        roster.
      </p>

      {/* Search ------------------------------------------------------- */}
      <div className="mt-10 max-w-3xl">
        <label htmlFor="agent-search" className="sr-only">
          Search agents by name, category, developer or location
        </label>
        <div className="flex items-center gap-4 rounded-full bg-surface px-6 py-4 outline-ink outline-offset-[3px] focus-within:outline-2 md:px-8 md:py-5">
          <Search className="size-5 shrink-0 text-t-faint md:size-6" />
          <input
            ref={searchBox}
            id="agent-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, category, developer or location"
            className="w-full bg-transparent text-base outline-none placeholder:text-t-faint md:text-lg [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
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
      <div className="mt-8 flex flex-col gap-4">
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
            className="w-fit text-sm text-t-muted underline-offset-4 transition-colors hover:text-t-bright hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* Results ------------------------------------------------------ */}
      <p aria-live="polite" className="mt-8 text-sm text-t-muted">
        {agents.length === 0
          ? "The first agents are being reviewed now."
          : `${results.length} ${results.length === 1 ? "agent" : "agents"}`}
      </p>

      {filtering && results.length === 0 ? (
        <Card className="mt-6">
          <p className="text-lg">No agent matches that yet.</p>
          <p className="mt-3 text-t-muted">
            {agents.length > 0
              ? "Try a broader term, or clear the filters to see everyone in the exchange."
              : "No agents are listed yet, so there is nothing to search — clearing this will not turn any up. Yours could be the first."}
          </p>
        </Card>
      ) : (
        <div className="mt-6 overflow-hidden rounded-card bg-surface">
          {results.length > 0 ? (
            <>
              <div
                aria-hidden="true"
                className="hidden border-b border-stroke px-6 py-3 text-xs font-medium tracking-wide text-t-faint uppercase lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] lg:gap-8 lg:px-8"
              >
                <span>Agent</span>
                <span>Description</span>
                <span>Category</span>
                <span />
              </div>

              <ul>
                {results.map((agent) => (
                  <li
                    key={agent.id}
                    className="grid gap-5 border-b border-stroke px-6 py-6 last:border-b-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] lg:items-start lg:gap-8 lg:px-8"
                  >
                    <AgentRow agent={agent} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {!filtering ? (
            <div className="flex flex-col items-start gap-3 border-t border-dashed border-stroke p-8 first:border-t-0 md:p-10">
              <Sparkle className="size-6 text-t-faint" />
              <p className="text-xl font-medium">Your agent here</p>
              <p className="max-w-md text-sm leading-relaxed text-t-muted">
                Built something on Claude? Tell us about it through{" "}
                <a href="/contact" className="underline decoration-stroke underline-offset-4 hover:text-t-bright hover:decoration-current">
                  Contact
                </a>{" "}
                and, once it clears review, it lists here.
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

function AgentRow({ agent }: { agent: Agent }) {
  const link = primaryLink(agent);

  return (
    <>
      <div className="min-w-0">
        <h3 className="font-medium wrap-break-word">{agent.name}</h3>
        {agent.tagline ? (
          <p className="mt-0.5 text-sm wrap-break-word text-t-muted">{agent.tagline}</p>
        ) : null}
        <p className="mt-1.5 text-xs wrap-break-word text-t-faint">
          By {agent.developerName}
          {agent.location ? ` · ${agent.location}` : ""}
        </p>
        {agent.pricing ? (
          <p className="mt-1 text-xs wrap-break-word text-t-faint">{agent.pricing}</p>
        ) : null}
      </div>

      <div className="min-w-0">
        {agent.description ? (
          <p className="text-sm wrap-break-word text-t-medium">{agent.description}</p>
        ) : (
          <p className="text-sm text-t-faint">No description yet.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {agent.categories.map((item) => (
          <Badge key={item}>{item}</Badge>
        ))}
      </div>

      {/* One call to action per row, an external link rather than a `Link` —
          there is no `/agent/<id>` page yet, so the row sends a visitor
          straight to the agent's own site. See `primaryLink`. */}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border border-stroke-strong px-4 text-sm font-medium transition-colors hover:bg-ink hover:text-t-invert"
        >
          Visit
          <span className="sr-only"> {agent.name}, opens in a new tab</span>
          <ArrowUpRight className="size-3.5" />
        </a>
      ) : null}
    </>
  );
}
