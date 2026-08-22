/**
 * The nine people the review queue's rules were written against. **Tests only.**
 *
 * **Fixtures. Invented people, real credential names.** #72 built the route, the
 * components and the rules against these nine and stopped at `readQueue()`; #14
 * put `@/app/admin/_lib/queue-read` behind that seam, so nothing in the running
 * application imports this file any more. What is left is a population, and it
 * survives the swap because it is the only thing that states what the screen has
 * to keep distinguishable — see below. Nothing here is read from or written to
 * the database, and nothing here is a real person.
 *
 * ## The population is adversarial on purpose
 *
 * It was five benign people, and that made the surface impossible to judge:
 * every certificate matched, every address was `example.invalid`, and nobody
 * was trying anything. A queue is not tested by profiles that are obviously
 * fine — it is tested by the ones where a human has to decide. Four of the nine
 * are a *different kind* of hard, and two of those are hard while being
 * completely innocent, which is the point:
 *
 *   q6  evidence on a file share, throwaway address, generated copy — spam
 *   q7  an evidence URL that already appears on another profile — theft
 *   q8  a legal name on the certificate that is not the profile's name — fine
 *   q9  an earned credential with no evidence at all — uncheckable, not fake
 *
 * **If a design makes q8 look like q6, it is wrong**, and that is the single
 * most useful thing this population can tell you. It is also why they moved
 * here rather than being replaced with three tidy rows when the prototype was
 * deleted.
 *
 * ## The credential names are real, and that is a change from the prototype
 *
 * `src/app/prototype/catalogue.ts` invented twenty-four course names, and its
 * own header forbids copying any of them into a migration. The real list has
 * since been compiled — the twenty-four confirmed Claude credentials in
 * `supabase/seed/credential-catalogue.json` — so the labels below are drawn
 * from it rather than invented, and they carry the `kind` / `platform` split
 * that #103 put on the table instead of the prototype's single `source`.
 *
 * Every property the fixtures exist to test survives the swap: Tomas Novak and
 * Priya Raghavan still hold the *same* catalogue row, Marcus Bell's two
 * credentials are still earned on the same day, and Aroha Ngata's certificate
 * still carries a name her profile does not.
 */

import type { CatalogueEntry, QueueCredential, QueueProfile } from "./queue";

/* Ids are uuid-shaped because the real column is a uuid and a short stand-in
   hides anything that truncates one. */
function entry(
  id: string,
  kind: CatalogueEntry["kind"],
  platform: string,
  label: string,
): CatalogueEntry {
  return { id, kind, platform, label };
}

/**
 * The five catalogue rows these nine people between them claim — a slice of the
 * catalogue, not a copy of it. The queue only ever sees the entries its
 * credentials embed, so holding the whole list here would be inventing a second
 * source for something `credential_catalogue` already owns.
 */
const catalogue = {
  claude101: entry(
    "c1000000-0000-4000-8000-000000000001",
    "course",
    "Anthropic Academy",
    "Claude 101",
  ),
  claudeApi: entry(
    "c1000000-0000-4000-8000-000000000007",
    "course",
    "Anthropic Academy",
    "Building with the Claude API",
  ),
  claudeCode: entry(
    "c1000000-0000-4000-8000-000000000005",
    "course",
    "Anthropic Academy",
    "Claude Code in Action",
  ),
  developer: entry(
    "c2000000-0000-4000-8000-000000000004",
    "certification",
    "Pearson VUE",
    "Claude Certified Developer - Foundations (CCDV-F)",
  ),
  architect: entry(
    "c2000000-0000-4000-8000-000000000003",
    "certification",
    "Pearson VUE",
    "Claude Certified Architect - Professional (CCAR-P)",
  ),
} satisfies Record<string, CatalogueEntry>;

function credential(
  id: string,
  catalogueEntry: CatalogueEntry,
  earnedAt: string,
  rest: Partial<Omit<QueueCredential, "id" | "entry" | "earnedAt">> = {},
): QueueCredential {
  return {
    id,
    entry: catalogueEntry,
    earnedAt,
    evidenceUrl: null,
    evidencePublic: false,
    verified: false,
    verifiedAt: null,
    verifiedBy: null,
    ...rest,
  };
}

const queue: QueueProfile[] = [
  {
    /* No credentials at all, and he used to have one that could never be
       checked. That row is gone from the model, so what is left is the case it
       was standing in front of: a self-service profile whose *bio* says what
       the person is working through. It is a claim in prose, nobody can check
       it, and nobody is meant to — the queue has one decision to make here and
       must not offer a second. Distinct from Ines below, who is unclaimed,
       curated, and asserting nothing at all.

       If a design tempts an admin to treat "working through the Academy track"
       as something to verify, the confusion in-progress rows caused has simply
       moved into the bio, which was the objection to them in the first place. */
    id: "q1",
    name: "Devon Achebe",
    headline: "Backend developer, moving into AI work",
    location: "Melbourne",
    bio: "Writing Go for payments by day, working through the Academy track on weekends. Two courses down, aiming at the Certification next year.",
    focus: ["Agents", "MCP"],
    services: [],
    contactEmail: "devon@example.invalid",
    status: "pending",
    owner: "devon@example.invalid",
    updatedAt: "2026-08-14T09:12:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [],
  },
  {
    id: "q2",
    name: "Susanna Wróbel",
    headline: "Product engineer",
    location: "Brisbane",
    bio: "Interfaces for things that stream. Interested in how you show a model thinking without lying about it.",
    focus: ["Frontend", "Streaming"],
    services: ["Implementation", "Code review"],
    contactEmail: "susanna@example.invalid",
    status: "pending",
    owner: "susanna@example.invalid",
    updatedAt: "2026-08-13T22:40:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [
      credential("q2c1", catalogue.claude101, "2026-07-19", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/susanna-wrobel",
        evidencePublic: true,
      }),
    ],
  },
  {
    id: "q3",
    name: "Priya Raghavan",
    headline: "ML engineer",
    location: "Singapore",
    bio: "Moved from recommender systems to LLM tooling in 2025 and has not looked back.",
    focus: ["Evals", "Fine-tuning", "Agents"],
    services: ["Evaluation and testing", "Implementation"],
    contactEmail: "priya@example.invalid",
    status: "approved",
    owner: "priya@example.invalid",
    updatedAt: "2026-08-12T11:05:00Z",
    lastVerifiedAt: "2026-08-12T11:05:00Z",
    reviewNote: null,
    credentials: [
      credential("q3c1", catalogue.developer, "2026-02-14", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/priya-raghavan",
        evidencePublic: true,
        verified: true,
        verifiedAt: "2026-08-10T08:30:00Z",
        verifiedBy: "david",
      }),
      credential("q3c2", catalogue.claudeApi, "2026-04-30", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/priya-tools",
        verified: true,
        verifiedAt: "2026-08-12T11:05:00Z",
        verifiedBy: "david",
      }),
      credential("q3c3", catalogue.claudeCode, "2026-08-01", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/priya-code",
      }),
    ],
  },
  {
    id: "q4",
    name: "Kofi Mensah",
    headline: "Solutions architect",
    location: "London",
    bio: "Helps teams work out whether they need an agent or a for-loop. Usually a for-loop.",
    focus: ["Architecture", "Agents"],
    services: ["Architecture and advisory", "One-to-one tutoring"],
    contactEmail: "kofi@example.invalid",
    status: "approved",
    owner: "kofi@example.invalid",
    updatedAt: "2026-08-15T07:15:00Z",
    lastVerifiedAt: "2026-08-09T14:00:00Z",
    reviewNote: null,
    credentials: [
      credential("q4c1", catalogue.claudeApi, "2026-06-08", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/kofi-mensah",
        evidencePublic: true,
        verified: true,
        verifiedAt: "2026-08-09T14:00:00Z",
        verifiedBy: "david",
      }),
    ],
  },
  {
    id: "q5",
    name: "Ines Delacroix",
    headline: "Technical writer",
    location: "Perth",
    bio: "Documentation for developer tools. Joined to be findable, not to be certified.",
    focus: ["Docs", "DX"],
    services: ["Team training"],
    contactEmail: "ines@example.invalid",
    status: "pending",
    owner: null,
    updatedAt: "2026-08-15T03:00:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [],
  },

  /* ---------------------------------------------------------------------
     The hard cases. Everything above this line is somebody being ordinary.
     --------------------------------------------------------------------- */

  {
    /* Spam, and it should be rejectable in seconds — but only because several
       weak signals stack, not because any one of them is damning. The account
       is hours old, the address is throwaway, the evidence is a Drive link
       rather than a certificate page, and the bio is the kind of copy that
       comes out of a model asked for a professional summary. Each of those on
       its own has an innocent explanation. Together they do not. */
    id: "q6",
    name: "Marcus Bell",
    headline: "AI Consultant | LLM Expert | Prompt Engineering Specialist",
    location: "Remote",
    bio: "Passionate about leveraging cutting-edge AI solutions to drive transformative business outcomes. Extensive experience delivering scalable, robust systems that unlock value for stakeholders across the enterprise.",
    focus: ["AI", "LLM", "Prompt Engineering", "Automation", "Consulting"],
    /* Maxed out, which is what the cap is for. `focus` is free text and he has
       five of them; `services` stops at three however hard he leans on it, so
       the axis a visitor filters by cannot be flooded by the profile most
       willing to claim everything. */
    services: ["One-to-one tutoring", "Team training", "Implementation"],
    contactEmail: "marcus.bell.ai@mailinator.com",
    status: "pending",
    owner: "marcus.bell.ai@mailinator.com",
    updatedAt: "2026-08-15T06:52:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [
      credential("q6c1", catalogue.architect, "2026-08-14", {
        evidenceUrl: "https://drive.google.com/file/d/1Xk9mQ/view",
        evidencePublic: true,
      }),
      credential("q6c2", catalogue.claude101, "2026-08-14", {
        evidenceUrl: "https://drive.google.com/file/d/1Xk9mR/view",
        evidencePublic: true,
      }),
    ],
  },
  {
    /* Somebody else's certificate. The URL is byte-identical to the one on
       Priya's profile, which is the only reason this is catchable at all — and
       it is catchable only by looking ACROSS profiles, which nothing in a
       profile-centric queue does by default. That is the finding this case
       exists to produce, and it is a known hole rather than a solved problem: a
       cross-profile duplicate check belongs in whatever gets built next, and
       this ticket did not build it.

       Note it is also the case a per-profile check passes: open the URL, and
       there is a real certificate at the other end. It just is not his.

       The catalogue does not help here and it is worth being explicit about
       that, because `unique (practitioner_id, catalogue_id)` looks like it
       might. It is scoped to one practitioner — two people claiming the same
       entry is the normal case, which is exactly what makes this claim legal.
       He and Priya hold the *same* catalogue row, so the theft is a little more
       legible than it was against two free-text labels, and still only to
       somebody who looks across profiles. */
    id: "q7",
    name: "Tomas Novak",
    headline: "Machine learning engineer",
    location: "Prague",
    bio: "Recommender systems and LLM tooling.",
    focus: ["Evals", "Agents"],
    services: ["Implementation"],
    contactEmail: "t.novak.ml@example.invalid",
    status: "pending",
    owner: "t.novak.ml@example.invalid",
    updatedAt: "2026-08-14T21:22:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [
      credential("q7c1", catalogue.developer, "2026-02-14", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/priya-raghavan",
        evidencePublic: true,
      }),
    ],
  },
  {
    /* Entirely legitimate, and it will trip any name-matching rule written
       without care. The certificate carries her full legal name; the profile
       carries the name she goes by. A design that flags this the way it flags
       q6 teaches the admin to dismiss flags, which is how the badge quietly
       stops meaning anything.

       Her certificate reads "Aroha Te Rangi Ngata". Nothing in the queue can
       know that — there is no API behind a Claude credential — so the only way
       the difference is ever seen is a person opening the URL, and the only
       thing that resolves it is that person's judgement. */
    id: "q8",
    name: "Aroha Ngata",
    headline: "Developer advocate",
    location: "Auckland",
    bio: "Teaching teams to use Claude without outsourcing their judgement to it.",
    focus: ["Advocacy", "Education", "MCP"],
    services: ["Team training", "One-to-one tutoring"],
    contactEmail: "aroha@example.invalid",
    status: "pending",
    owner: "aroha@example.invalid",
    updatedAt: "2026-08-13T05:30:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [
      credential("q8c1", catalogue.claudeCode, "2026-07-02", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/a-te-rangi-ngata",
      }),
    ],
  },
  {
    /* Nothing to check. An earned credential with no evidence behind it is not
       a lie and not a rejection — it is a profile that can be approved and can
       never carry the badge until she supplies a URL. The only useful action is
       the note, which makes this the case that justifies the note existing.

       **She is the only profile in this shape, and that is why she matters.**
       She used to be one of a pair with Devon, whose credential could not be
       checked because it had not been earned. That row no longer exists, so
       everything the queue does to keep a permanently-open item from reading as
       an unfinished task rests on her alone — and unlike Devon's, her item is
       one *she* can close by pasting a link, which is the difference the spec
       kept the state for. */
    id: "q9",
    name: "Hae-Won Park",
    headline: "Data engineer",
    location: "Seoul",
    bio: "Pipelines, mostly. Took the Academy track to work out where a model fits in one.",
    focus: ["Data", "Pipelines"],
    services: ["Implementation", "Evaluation and testing"],
    contactEmail: "haewon@example.invalid",
    status: "pending",
    owner: "haewon@example.invalid",
    updatedAt: "2026-08-12T09:00:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [credential("q9c1", catalogue.claude101, "2026-06-27")],
  },
];

/**
 * The population, as a fresh copy each time.
 *
 * The copy is deep and deliberate. The array is module state, so a test that
 * mutated a profile in place would change what every later test in the same
 * file sees — and the two suites that read this both iterate the whole list.
 */
export function reviewQueueFixtures(): QueueProfile[] {
  return structuredClone(queue);
}
