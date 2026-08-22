/**
 * A realistic launch population for the directory. Invented people.
 *
 * The constraint that makes this worth drawing: **nobody has finished a Claude
 * Certification.** Every credential in this set is an Anthropic Academy
 * certificate, and one of the three people holds nothing at all.
 *
 * **The mechanism changed and the finding did not.** It used to be carried by
 * in-progress rows — every Claude Certification present with `earnedAt: null`,
 * so the population said "started, not finished" out loud. Those rows no longer
 * exist: `earned_at` is `not null`, and a credential you have not earned is
 * simply a credential you do not hold. So the same fact is now stated by
 * absence, which is a weaker signal on screen and a truer one in the model —
 * nothing here claims anything nobody could check.
 *
 * Devon Achebe is where that lands hardest, and he is worth reading first. He
 * had two in-progress rows and now has no credentials; what he is working
 * through is in his bio, in his own words, which is exactly what the spec says
 * replaces the row. His profile is the case the directory exists to include and
 * the one a credential-shaped model most easily excludes.
 *
 * That is not a fixture convenience, it is the actual state of the world on the
 * day this launches, and it is what makes `scope.md`'s closing question sharp:
 *
 *   "What does Verified attest to for the first fifty profiles?"
 *
 * Note what the rollup then does — see NOTES.md, because it is not what
 * scope.md assumes. The count is unchanged by any of this: three profiles, two
 * badged, nobody holding a Claude Certification.
 */

import { entryByLabel } from "../catalogue";
import type { Credential, Profile } from "@/lib/practitioners";

/**
 * One held credential. The label is looked up rather than typed, because a
 * credential names a catalogue entry and cannot describe one — a fixture that
 * wrote its own labels would be drawing the free text this model removed.
 */
function held(
  label: string,
  earnedAt: string,
  verified: boolean,
  evidenceUrl: string | null = null,
): Credential {
  return { entry: entryByLabel(label), earnedAt, verified, evidenceUrl };
}

/* The ids are uuid-shaped because `profilePath` takes the first six characters
   of the row's uuid, and a two-character stand-in makes that truncation a no-op
   — the surface would serve `/p/mara-ellison-l1` and never show the URL this
   drawing exists to look at. */

export const launchPopulation: Profile[] = [
  {
    id: "2f1a3c9d-4b7e-4c21-9a86-1d0f5e83b7c4",
    name: "Mara Ellison",
    headline: "Staff engineer, agent platforms",
    location: "Sydney",
    countryCode: "AU",
    bio: "Builds evaluation harnesses for tool-using agents. Ten years in distributed systems before that, which mostly taught me how to make failures legible.",
    focus: ["Agents", "Evals", "MCP"],
    /* Three, which is the cap. Worth having one person at it, because a filter
       axis everybody maxes out is the failure the cap exists to prevent and it
       should be visible on the roster rather than only in the form. */
    services: ["Architecture and advisory", "Evaluation and testing", "Team training"],
    availability: "Evenings and weekends, and about one day a fortnight.",
    websiteUrl: "https://example.invalid/mara",
    githubUrl: "https://github.com/example-invalid",
    linkedinUrl: null,
    bookingUrl: null,
    credentials: [
      held(
        "Building with the Claude API",
        "2026-01-22",
        true,
        "https://example.invalid/certificate/mara-ellison",
      ),
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
    services: ["Implementation", "Code review"],
    availability: "Booked until March.",
    websiteUrl: null,
    githubUrl: null,
    linkedinUrl: "https://www.linkedin.com/in/example-invalid",
    bookingUrl: "https://example.invalid/book/toby",
    credentials: [held("Prompt engineering", "2026-05-02", true)],
  },
  {
    /* No credentials, and that is the whole point of him. He is in the
       directory, findable, with a headline and a bio saying what he is working
       through — which is what the model now offers instead of an in-progress
       row, and it is his own prose rather than a structure implying somebody
       checked it. He carries no badge and never falsely could.

       `services` is empty too, which is legal and normal: he is not selling
       anything yet. A roster that made either absence look like a broken
       profile would be wrong about the population it launches with. */
    id: "b41f6a2e-9c30-4d85-8e17-5fa2c3d70b19",
    name: "Devon Achebe",
    headline: "Backend developer, moving into AI work",
    location: "Melbourne",
    countryCode: "AU",
    bio: "Writing Go for payments by day, working through the Academy track on weekends. Two courses down, aiming at the Certification next year.",
    focus: ["Agents", "MCP"],
    services: [],
    availability: null,
    websiteUrl: null,
    githubUrl: "https://github.com/example-invalid-devon",
    linkedinUrl: null,
    bookingUrl: null,
    credentials: [],
  },
];

/* A switchable population (0 / 3 / 12) lived here and was cut: the numbers were
   an unexplained guess at signup rate, and flipping between them never answered
   anything the three-profile view did not. The surface shows the launch
   population and nothing else. */
