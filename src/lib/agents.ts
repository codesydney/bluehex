/**
 * The Agent Exchange listing, as types and hardcoded data.
 *
 * The premise: indie developers build AI agents, and Agent Exchange is where an
 * Australian buyer finds one. Unlike the practitioner directory, there is no
 * self-service submission and no database table behind this yet — a developer
 * reaches Bluehex through `/contact`, Bluehex reviews the agent, and only then
 * does an entry land here, in a commit, reviewed like any other change. That is
 * the review step: publishing *is* the check, so there is no separate
 * `verified` flag to get wrong.
 *
 * This mirrors how `practitioners.ts` looked before #53 moved that directory
 * onto Postgres — an exported array a page renders directly — and deliberately
 * so, per AGENTS.md: no schema lands before the model it encodes is settled,
 * and nobody has designed the submission/ownership model an `agents` table
 * would need. Promote this to a query the same way practitioners was, once
 * that design exists.
 *
 * REAL AGENTS ONLY, same rule as the practitioner directory: nothing invented,
 * and the empty array is what ships until the first one clears review.
 */

export const categories = [
  "Customer support",
  "Sales and marketing",
  "Coding and dev tools",
  "Productivity",
  "Data and analytics",
  "Content and creative",
] as const;

export type Category = (typeof categories)[number];

export type Agent = {
  id: string;
  name: string;
  /** What it does, in a line. */
  tagline: string | null;
  /** Longer prose, the developer's own words. */
  description: string | null;
  developerName: string;
  /** The developer's own site, portfolio or profile — not a support inbox. */
  developerUrl: string | null;
  /** Free text, at whatever granularity the developer chose. Not filterable. */
  location: string | null;
  /**
   * ISO 3166-1 alpha-2. Separate from `location` for the same reason it is on
   * a practitioner: this is what the location filter groups on.
   */
  countryCode: string | null;
  /**
   * What it can be bought for — the directory's filter axis, mirroring
   * `services` on a practitioner. At most three, so a listing describes what
   * it actually does rather than claiming the whole catalogue.
   */
  categories: Category[];
  /** A sentence, not a price list — "Free", "From $19/mo", "Usage-based". */
  pricing: string | null;
  websiteUrl: string | null;
  githubUrl: string | null;
  demoUrl: string | null;
};

/** `agent_categories_cap`'s eventual equivalent, if this ever becomes a
    column. Written once so a future form and a future constraint agree. */
export const maxCategories = 3;

/**
 * The one link a directory row sends a visitor to, in the order a buyer would
 * want to try them: a live demo before a marketing site, a marketing site
 * before source code. Null when the entry has published none, which a row
 * treats as no call to action rather than a broken one.
 */
export function primaryLink(agent: Pick<Agent, "demoUrl" | "websiteUrl" | "githubUrl">) {
  return agent.demoUrl ?? agent.websiteUrl ?? agent.githubUrl ?? null;
}

export const agents: Agent[] = [];
