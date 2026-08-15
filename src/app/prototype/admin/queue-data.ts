/**
 * PROTOTYPE — the admin review queue's data. Throwaway, invented people.
 *
 * The shape here is the whole argument. `status` and `verified` are two
 * independent axes with different authors, not two stages of one pipeline:
 *
 *   status    — admission control. Is this a real person, is it not spam.
 *               Governs whether anyone else can see the profile at all.
 *   verified  — credential attestation, PER CREDENTIAL. A human at Bluehex
 *               opened the evidence and read the name on it. Governs whether
 *               the badge shows, and nothing else.
 *
 * A profile can be approved and unverified — published but not vouched for —
 * and the spec calls that "the normal case, not an edge case". So the queue
 * cannot be a single list with an Approve button, which is exactly the design
 * everyone reaches for first.
 *
 * There is a third kind of work that is easy to miss and comes free from the
 * schema: `updated_at > verified_at` means "edited since we checked it", which
 * gives Bluehex a re-check queue over every verified profile that has changed.
 * No extra column. An admin edit bumps `updated_at` too, so there are some
 * false positives; at this volume that is cheaper than a column to suppress
 * them.
 *
 * A credential names a row in `credential_catalogue` and carries no text of its
 * own, so every label on this screen came from a list Bluehex wrote. There is
 * nothing for a practitioner to type into a credential, which is why nothing in
 * this file types one either.
 *
 * ## The population is adversarial on purpose
 *
 * It was five benign people, and that made the surface impossible to judge:
 * every certificate matched, every address was `example.invalid`, and nobody
 * was trying anything. A queue is not tested by profiles that are obviously
 * fine — it is tested by the ones where a human has to decide. The additions
 * are each a *different kind* of hard, and two of them are hard while being
 * completely innocent, which is the point:
 *
 *   q6  evidence on a file share, throwaway address, generated copy — spam
 *   q7  an evidence URL that already appears on another profile — theft
 *   q8  a legal name on the certificate that is not the profile's name — fine
 *   q9  an earned credential with no evidence at all — uncheckable, not fake
 *
 * If a design makes q8 look like q6, it is wrong, and that is the single most
 * useful thing this population can tell you.
 *
 * Devon Achebe (q1) is the one this round reworked. He was an in-progress-only
 * profile — one credential nobody could ever check — and that row is gone from
 * the model. What replaced him is the same person with no credentials and a bio
 * that says what he is working through, which is the shape the spec says
 * carries it now. See his comment below.
 *
 * **q9 now carries weight it did not before.** In-progress credentials are gone
 * from the model, so the thing that used to demonstrate "in the queue, nothing
 * anybody can do about it" is q9 alone: earned, no evidence URL, approvable,
 * never badgeable, and not a rejection. It is the only permanently-open item
 * left, and unlike the rows it replaced it is one the *practitioner* can close.
 */

import { entryByLabel } from "../catalogue";

export type QueueCredential = {
  id: string;
  /**
   * `catalogue_id` — the entry this credential names. There is no `source` or
   * `label` here: they are properties of the catalogue row, so a credential
   * claiming `Anthropic Academy` + `Claude Certification` is not representable
   * and nobody but Bluehex can add a name to the list.
   */
  catalogueId: string;
  /** `earned_at`, and `not null`: there is no in-progress credential. */
  earnedAt: string;
  evidenceUrl: string | null;
  evidencePublic: boolean;
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
};

export type QueueProfile = {
  id: string;
  name: string;
  headline: string;
  location: string;
  bio: string;
  focus: string[];
  /** What they sell. Closed set, at most three — the directory's filter axis. */
  services: string[];
  contactEmail: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  /** Null means unclaimed — curated intake, written up by Bluehex. */
  owner: string | null;
  updatedAt: string;
  /** Latest verification across the profile's credentials, for drift. */
  lastVerifiedAt: string | null;
  reviewNote: string | null;
  credentials: QueueCredential[];
};

/**
 * The badge rollup: at least one credential, and every one of them verified.
 *
 * It used to take the earned subset first, because an in-progress row could
 * never be checked and would have denied the badge forever. Every row is earned
 * now, so the filter went with the premise rather than being kept as a
 * defensive no-op.
 */
export function badgeShows(credentials: QueueCredential[]) {
  return credentials.length > 0 && credentials.every((credential) => credential.verified);
}

/**
 * Credentials nobody has checked yet.
 *
 * This is what the badge is waiting on, and it is NOT the same as what an admin
 * can act on — see `checkable`. Hae-Won Park is the difference: she has an
 * earned credential with no evidence URL, so she appears here forever and there
 * is nothing anybody at Bluehex can do about it.
 */
export function unchecked(profile: QueueProfile) {
  return profile.credentials.filter((credential) => !credential.verified);
}

/**
 * Credentials an admin can actually do something about right now: with evidence
 * to open, and not yet checked.
 *
 * The `evidenceUrl` clause is the whole point of this existing separately, and
 * it is the *only* clause left — the earned check went with in-progress rows. A
 * credential with nothing behind it cannot be checked today, cannot be checked
 * tomorrow, and would otherwise sit in the queue as a task that never completes,
 * belonging to somebody who has done nothing wrong. The distinction between
 * "the badge is waiting on this" and "a human can move this forward" is what
 * keeps that item out of the queue, and it now rests on Hae-Won Park alone.
 */
export function checkable(profile: QueueProfile) {
  return profile.credentials.filter(
    (credential) => credential.evidenceUrl && !credential.verified,
  );
}

/**
 * Why this profile is in the queue, in the order the work would be done. Empty
 * means there is nothing outstanding and it drops out of the list.
 *
 * A queue that cannot empty is a table. Everything here exists so that acting
 * on a profile visibly finishes it — which also means the reasons have to be
 * things an admin can close, never facts about the profile. "Unclaimed" is a
 * fact and is deliberately absent: a curated profile nobody has claimed is a
 * normal steady state, not a job.
 */
export function outstanding(profile: QueueProfile) {
  /* A profile nobody can see generates no work. Rejecting Marcus Bell has to
     clear him outright, certificates and all — checking the evidence on a
     profile that is not published is work with no consumer, and leaving it in
     the list would mean the most obvious spam in the queue is also the hardest
     thing to get rid of. Withdrawn is the same, from the other direction: the
     practitioner has left, and their verification history is kept for their
     return rather than added to while they are gone. */
  if (profile.status === "rejected" || profile.status === "withdrawn") return [];

  const reasons: string[] = [];

  if (profile.status === "pending") reasons.push("Needs a decision");

  const toCheck = checkable(profile).length;
  if (toCheck > 0) {
    reasons.push(`${toCheck} certificate${toCheck === 1 ? "" : "s"} to check`);
  }

  if (hasDrifted(profile)) reasons.push("Edited since checked");

  return reasons;
}

/**
 * Edited since the last check. Derived from two timestamps rather than stored,
 * and only meaningful once something has actually been verified.
 */
export function hasDrifted(profile: QueueProfile) {
  if (!profile.lastVerifiedAt) return false;
  return profile.updatedAt > profile.lastVerifiedAt;
}

/**
 * One credential, naming a catalogue entry by its label.
 *
 * The lookup is the point rather than a convenience: a credential references a
 * row Bluehex wrote, so a fixture that typed its own labels would be drawing
 * the free text this model removed. `entryByLabel` throws on a name that is not
 * in the catalogue, which is the foreign key doing its job.
 */
function credential(
  id: string,
  label: string,
  earnedAt: string,
  rest: Partial<Omit<QueueCredential, "id" | "catalogueId" | "earnedAt">> = {},
): QueueCredential {
  return {
    id,
    catalogueId: entryByLabel(label).id,
    earnedAt,
    evidenceUrl: null,
    evidencePublic: false,
    verified: false,
    verifiedAt: null,
    verifiedBy: null,
    ...rest,
  };
}

export const initialQueue: QueueProfile[] = [
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
      credential("q2c1", "Prompt engineering", "2026-07-19", {
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
      credential("q3c1", "Claude Certified Developer", "2026-02-14", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/priya-raghavan",
        evidencePublic: true,
        verified: true,
        verifiedAt: "2026-08-10T08:30:00Z",
        verifiedBy: "david",
      }),
      credential("q3c2", "Tool use and function calling", "2026-04-30", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/priya-tools",
        verified: true,
        verifiedAt: "2026-08-12T11:05:00Z",
        verifiedBy: "david",
      }),
      credential("q3c3", "Claude Code in practice", "2026-08-01", {
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
      credential("q4c1", "Tool use and function calling", "2026-06-08", {
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
      credential("q6c1", "Claude Certified Agent Engineer", "2026-08-14", {
        evidenceUrl: "https://drive.google.com/file/d/1Xk9mQ/view",
        evidencePublic: true,
      }),
      credential("q6c2", "Prompt engineering", "2026-08-14", {
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
       exists to produce.

       Note it is also the case a per-profile check passes: open the URL, and
       there is a real certificate at the other end. It just is not his.

       The catalogue does not help here and it is worth being explicit about
       that, because `unique (practitioner_id, catalogue_id)` looks like it
       might. It is scoped to one practitioner — two people claiming the same
       entry is the normal case, which is exactly what makes this claim legal.
       He and Priya now hold the *same* catalogue row, so the theft is a little
       more legible than it was against two free-text labels, and still only to
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
      credential("q7c1", "Claude Certified Developer", "2026-02-14", {
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
      credential("q8c1", "Claude Code in practice", "2026-07-02", {
        evidenceUrl: "https://anthropic.skilljar.com/certificate/a-te-rangi-ngata",
      }),
    ],
  },
  {
    /* Nothing to check. An earned credential with no evidence behind it is not
       a lie and not a rejection — it is a profile that can be approved and can
       never carry the badge until she supplies a URL. The only useful action is
       the note, which makes this the case that justifies the note existing.

       **She is now the only profile in this shape, and that is why she matters
       more than she did.** She used to be one of a pair with Devon, whose
       credential could not be checked because it had not been earned. That row
       no longer exists, so everything the queue does to keep a
       permanently-open item from reading as an unfinished task rests on her
       alone — and unlike Devon's, her item is one *she* can close by pasting a
       link, which is the difference the spec kept the state for. */
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
    credentials: [credential("q9c1", "Prompt engineering", "2026-06-27")],
  },
];

export const admin = "david";

/**
 * What an admin can do. Stubbed against local state in the shell — the question
 * is what the workflow should feel like, not whether the write path works.
 *
 * Note what is absent: there is no "verify profile" action, because there is no
 * such thing. Verification is per credential, so the only verb available is
 * checking one row.
 */
export type QueueActions = {
  setStatus: (profileId: string, status: QueueProfile["status"]) => void;
  setVerified: (profileId: string, credentialId: string, verified: boolean) => void;
  setNote: (profileId: string, note: string) => void;
  assignOwner: (profileId: string) => void;
};

export type VariantProps = { queue: QueueProfile[]; actions: QueueActions };
