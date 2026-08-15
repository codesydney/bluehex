/**
 * PROTOTYPE — the credential catalogue. Throwaway *contents*, real *shape*.
 *
 * `credential_catalogue` is the Bluehex-owned list of every Claude credential
 * that exists: each Anthropic Academy course and each Claude Certification, one
 * row apiece. A practitioner's credential references a row here and carries no
 * free text of its own, which is the whole mechanism — the word "credential"
 * cannot be widened by anybody but Bluehex, because `insert` on this table is
 * granted to `bluehex_admin` and to nobody else.
 *
 * **The contents below are invented and the real list has not been compiled.**
 * That is its own scope item. What is not invented is the shape: `source`,
 * `label`, `active` and `sort_order`, with the id as the only reference. Read
 * these as plausible placeholders for names Anthropic owns, and do not copy any
 * of them into a migration.
 *
 * Twenty-three claimable entries, plus one retired. The number is deliberate:
 * the spec uses "2 of 23" as its worked example of a progress figure, so the
 * fixture is sized to it and the drawing and the prose agree.
 *
 * One catalogue for all three prototype surfaces rather than one each. The
 * editor picks from it, the directory renders labels out of it and the review
 * queue reads what an admin is checking — three invented copies would let the
 * same course carry three different ids, which is the failure the profile
 * prototype already recorded once, when a second handle scheme disagreed with
 * production and was deleted rather than reconciled.
 */

import type { CatalogueEntry } from "@/lib/practitioners";

/* Ids are uuid-shaped for the same reason the fixture profiles' are: the real
   column is a uuid and a short stand-in hides anything that truncates one. */
function entry(
  id: string,
  source: CatalogueEntry["source"],
  label: string,
  sortOrder: number,
): CatalogueEntry {
  return { id, source, label, active: true, sortOrder };
}

export const catalogue: CatalogueEntry[] = [
  /* The Academy track, in the order somebody would work through it. This is
     what `sort_order` is for — alphabetical would scramble a track. */
  entry("c1000000-0000-4000-8000-000000000001", "Anthropic Academy", "Claude fundamentals", 10),
  entry("c1000000-0000-4000-8000-000000000002", "Anthropic Academy", "Prompt engineering", 20),
  entry(
    "c1000000-0000-4000-8000-000000000003",
    "Anthropic Academy",
    "Building with the Claude API",
    30,
  ),
  entry("c1000000-0000-4000-8000-000000000004", "Anthropic Academy", "Choosing a Claude model", 40),
  entry(
    "c1000000-0000-4000-8000-000000000005",
    "Anthropic Academy",
    "Structured outputs and JSON",
    50,
  ),
  entry(
    "c1000000-0000-4000-8000-000000000006",
    "Anthropic Academy",
    "Working with long context",
    60,
  ),
  entry(
    "c1000000-0000-4000-8000-000000000007",
    "Anthropic Academy",
    "Tool use and function calling",
    70,
  ),
  entry(
    "c1000000-0000-4000-8000-000000000008",
    "Anthropic Academy",
    "The Model Context Protocol",
    80,
  ),
  entry(
    "c1000000-0000-4000-8000-000000000009",
    "Anthropic Academy",
    "Building agents with Claude",
    90,
  ),
  entry(
    "c1000000-0000-4000-8000-00000000000a",
    "Anthropic Academy",
    "Retrieval-augmented generation",
    100,
  ),
  entry("c1000000-0000-4000-8000-00000000000b", "Anthropic Academy", "Evaluating model output", 110),
  entry("c1000000-0000-4000-8000-00000000000c", "Anthropic Academy", "Claude Code in practice", 120),
  entry(
    "c1000000-0000-4000-8000-00000000000d",
    "Anthropic Academy",
    "Vision and document understanding",
    130,
  ),
  entry(
    "c1000000-0000-4000-8000-00000000000e",
    "Anthropic Academy",
    "Prompt caching and latency",
    140,
  ),
  entry("c1000000-0000-4000-8000-00000000000f", "Anthropic Academy", "Batch processing at scale", 150),
  entry(
    "c1000000-0000-4000-8000-000000000010",
    "Anthropic Academy",
    "Safety, refusals and guardrails",
    160,
  ),
  entry("c1000000-0000-4000-8000-000000000011", "Anthropic Academy", "Claude for data analysis", 170),
  entry("c1000000-0000-4000-8000-000000000012", "Anthropic Academy", "Claude in the enterprise", 180),
  entry(
    "c1000000-0000-4000-8000-000000000013",
    "Anthropic Academy",
    "Deploying Claude on Bedrock and Vertex",
    190,
  ),

  /* Retired, and it is in the fixture on purpose: an entry can be withdrawn
     without invalidating the claim of anybody who earned it, so the picker has
     to filter `active` while a profile holding one still renders. What a
     retired entry looks like on a profile is undecided in the spec, and nothing
     here draws it differently — this shows the filtering only. */
  {
    id: "c1000000-0000-4000-8000-000000000014",
    source: "Anthropic Academy",
    label: "Prompt engineering (2025 edition)",
    active: false,
    sortOrder: 200,
  },

  /* The Certifications. Higher weight, examined rather than completed, and four
     of them. `source` is the two-value axis that stayed a check constraint,
     because weight is what it describes and that has not grown. */
  entry(
    "c2000000-0000-4000-8000-000000000001",
    "Claude Certification",
    "Claude Certified Developer",
    1010,
  ),
  entry(
    "c2000000-0000-4000-8000-000000000002",
    "Claude Certification",
    "Claude Certified Agent Engineer",
    1020,
  ),
  entry(
    "c2000000-0000-4000-8000-000000000003",
    "Claude Certification",
    "Claude Certified Data Practitioner",
    1030,
  ),
  entry(
    "c2000000-0000-4000-8000-000000000004",
    "Claude Certification",
    "Claude Certified Implementation Lead",
    1040,
  ),
];

/**
 * Look an entry up by id.
 *
 * It throws rather than returning undefined, because in the real schema
 * `catalogue_id` is a `not null` foreign key with `on delete restrict` — a
 * credential pointing at nothing cannot exist, and a fixture that quietly
 * rendered "Unknown credential" would be drawing a state the database refuses.
 */
export function catalogueEntry(id: string): CatalogueEntry {
  const found = catalogue.find((item) => item.id === id);
  if (!found) throw new Error(`No catalogue entry ${id}`);
  return found;
}

/** By label, so the fixtures can read as prose rather than as uuids. */
export function entryByLabel(label: string): CatalogueEntry {
  const found = catalogue.find((item) => item.label === label);
  if (!found) throw new Error(`No catalogue entry labelled ${label}`);
  return found;
}

/**
 * What the picker offers: claimable entries, in track order.
 *
 * `active` filters here rather than in a policy — a retired entry stays
 * readable so a profile holding it still renders its label, and the picker is a
 * query rather than a visibility rule.
 */
export function pickable(): CatalogueEntry[] {
  return catalogue.filter((item) => item.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** How many entries there are to hold — the denominator of a progress figure. */
export const claimableCount = catalogue.filter((item) => item.active).length;
