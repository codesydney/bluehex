/**
 * A realistic launch population for the directory. Invented people.
 *
 * The constraint that makes this worth drawing: **nobody has finished a Claude
 * Certification.** Two people have started the courses and none have completed
 * one, so every earned credential in this set is an Anthropic Academy
 * certificate, and every Claude Certification is `earnedAt: null`.
 *
 * That is not a fixture convenience, it is the actual state of the world on the
 * day this launches, and it is what makes `scope.md`'s closing question sharp:
 *
 *   "What does Verified attest to for the first fifty profiles?"
 *
 * Note what the rollup then does — see NOTES.md, because it is not what
 * scope.md assumes.
 */

import type { Practitioner } from "@/lib/practitioners";

function academy(
  label: string,
  earnedAt: string | null,
  verified: boolean,
  evidenceUrl: string | null = null,
) {
  return { source: "Anthropic Academy" as const, label, earnedAt, verified, evidenceUrl };
}

/** Started, not finished. True of everybody right now. */
const certificationInProgress = {
  source: "Claude Certification" as const,
  label: "Claude Certification",
  earnedAt: null,
  verified: false,
  evidenceUrl: null,
};

export const launchPopulation: Practitioner[] = [
  {
    id: "l1",
    name: "Mara Ellison",
    headline: "Staff engineer, agent platforms",
    location: "Sydney",
    countryCode: "AU",
    bio: "Builds evaluation harnesses for tool-using agents. Ten years in distributed systems before that, which mostly taught me how to make failures legible.",
    focus: ["Agents", "Evals", "MCP"],
    credentials: [
      academy(
        "Building with the Claude API",
        "2026-01-22",
        true,
        "https://example.invalid/certificate/mara-ellison",
      ),
      certificationInProgress,
    ],
  },
  {
    id: "l2",
    name: "Toby Nakamura",
    headline: "Independent consultant",
    location: "Wellington",
    countryCode: "NZ",
    bio: "Retrieval pipelines and the unglamorous data work underneath them.",
    focus: ["RAG", "Data"],
    credentials: [academy("Prompt engineering", "2026-05-02", true)],
  },
  {
    id: "l3",
    name: "Devon Achebe",
    headline: "Backend developer, moving into AI work",
    location: "Melbourne",
    countryCode: "AU",
    bio: "Writing Go for payments by day, working through the Academy track on weekends.",
    focus: ["Agents", "MCP"],
    credentials: [certificationInProgress, academy("Building with the Claude API", null, false)],
  },
  {
    id: "l4",
    name: "Priya Raghavan",
    headline: "ML engineer",
    location: "Singapore",
    countryCode: "SG",
    bio: "Moved from recommender systems to LLM tooling in 2025 and has not looked back.",
    focus: ["Evals", "Fine-tuning", "Agents"],
    credentials: [
      academy("Tool use and function calling", "2026-04-30", true),
      academy("Claude Code in practice", "2026-08-01", false),
      certificationInProgress,
    ],
  },
  {
    id: "l5",
    name: "Susanna Wróbel",
    headline: "Product engineer",
    location: "Brisbane",
    countryCode: "AU",
    bio: "Interfaces for things that stream. Interested in how you show a model thinking without lying about it.",
    focus: ["Frontend", "Streaming"],
    credentials: [academy("Prompt engineering", "2026-07-19", false)],
  },
  {
    id: "l6",
    name: "Kofi Mensah",
    headline: "Solutions architect",
    location: "London",
    countryCode: "GB",
    bio: "Helps teams work out whether they need an agent or a for-loop. Usually a for-loop.",
    focus: ["Architecture", "Agents"],
    credentials: [
      academy(
        "Tool use and function calling",
        "2026-06-08",
        true,
        "https://example.invalid/certificate/kofi-mensah",
      ),
      certificationInProgress,
    ],
  },
  {
    id: "l7",
    name: "Ines Delacroix",
    headline: "Technical writer",
    location: "Perth",
    countryCode: "AU",
    bio: "Documentation for developer tools. Joined to be findable, not to be certified.",
    focus: ["Docs", "DX"],
    credentials: [],
  },
  {
    id: "l8",
    name: "Rahim Osman",
    headline: "Data engineer",
    location: "Kuala Lumpur",
    countryCode: "MY",
    bio: "Pipelines, warehouses, and the long tail of data that never fits the schema.",
    focus: ["Data", "RAG"],
    credentials: [academy("Building with the Claude API", "2026-03-30", true)],
  },
  {
    id: "l9",
    name: "Elena Vasquez",
    headline: "Design lead",
    location: "Sydney",
    countryCode: "AU",
    bio: "Designs for products where the model is part of the interface, not behind it.",
    focus: ["Design", "Frontend"],
    credentials: [certificationInProgress],
  },
  {
    id: "l10",
    name: "Nguyen Thi Lan",
    headline: "Full-stack developer",
    location: "Ho Chi Minh City",
    countryCode: "VN",
    bio: "Ships small tools quickly. Most of them stay small on purpose.",
    focus: ["Claude Code", "Agents"],
    credentials: [academy("Claude Code in practice", "2026-06-21", true)],
  },
  {
    id: "l11",
    name: "Sam Okafor",
    headline: "Engineering manager",
    location: "Auckland",
    countryCode: "NZ",
    bio: "Spends most of the week helping other people decide what not to build.",
    focus: ["Architecture", "Evals"],
    credentials: [academy("Prompt engineering", "2026-02-11", true), academy("Evaluations", "2026-07-30", false)],
  },
  {
    id: "l12",
    name: "Aisha Rahman",
    headline: "Research engineer",
    location: "Bengaluru",
    countryCode: "IN",
    bio: "Works on retrieval quality. Reads more papers than is strictly healthy.",
    focus: ["RAG", "Evals", "Fine-tuning"],
    credentials: [certificationInProgress, academy("Tool use and function calling", null, false)],
  },
];

/* A switchable population (0 / 3 / 12) lived here and was cut: the numbers were
   an unexplained guess at signup rate, and flipping between them never answered
   anything the three-profile view did not. The surface shows the launch
   population and nothing else. */
