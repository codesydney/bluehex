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

/** Started, not finished. Nobody has completed one yet — that is the point. */
function certificationInProgress() {
  return {
    source: "Claude Certification" as const,
    label: "Claude Certification",
    earnedAt: null,
    verified: false,
    evidenceUrl: null,
  };
}

/* The ids are uuid-shaped because `profilePath` takes the first six characters
   of the row's uuid, and a two-character stand-in makes that truncation a no-op
   — the surface would serve `/p/mara-ellison-l1` and never show the URL this
   drawing exists to look at. */

export const launchPopulation: Practitioner[] = [
  {
    id: "2f1a3c9d-4b7e-4c21-9a86-1d0f5e83b7c4",
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
      certificationInProgress(),
    ],
  },
  {
    id: "8c5d1e07-3a94-4f6b-b2d8-06e7a1c94f52",
    name: "Toby Nakamura",
    headline: "Independent consultant",
    location: "Wellington",
    countryCode: "NZ",
    bio: "Retrieval pipelines and the unglamorous data work underneath them.",
    focus: ["RAG", "Data"],
    credentials: [academy("Prompt engineering", "2026-05-02", true)],
  },
  {
    id: "b41f6a2e-9c30-4d85-8e17-5fa2c3d70b19",
    name: "Devon Achebe",
    headline: "Backend developer, moving into AI work",
    location: "Melbourne",
    countryCode: "AU",
    bio: "Writing Go for payments by day, working through the Academy track on weekends.",
    focus: ["Agents", "MCP"],
    credentials: [certificationInProgress(), academy("Building with the Claude API", null, false)],
  },
];

/* A switchable population (0 / 3 / 12) lived here and was cut: the numbers were
   an unexplained guess at signup rate, and flipping between them never answered
   anything the three-profile view did not. The surface shows the launch
   population and nothing else. */
