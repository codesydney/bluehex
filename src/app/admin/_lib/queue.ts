/**
 * The review queue's model: what a profile in it looks like, why it is in it,
 * and the order it comes back in.
 *
 * Pure functions over plain data — no React, no Next, no Supabase. That is what
 * let the same rules be unit-tested and then survive #14 putting a query behind
 * them unchanged: `outstanding()` decides queue membership whether the rows
 * arrived from a fixture or from PostgREST.
 *
 * The shape is the argument. `status` and `verified` are two independent axes
 * with different authors, not two stages of one pipeline:
 *
 *   status    — admission control. Is this a real person, is it not spam.
 *               Governs whether anyone else can see the profile at all.
 *   verified  — credential attestation, PER CREDENTIAL. A human at Bluehex
 *               opened the evidence and read the name on it. Governs whether
 *               the badge shows, and nothing else.
 *
 * A profile can be approved and unverified — published but not vouched for —
 * and `docs/spec/profile-and-credentials.md` calls that the normal case. So the
 * queue cannot be a single list with an Approve button, which is exactly the
 * design everyone reaches for first.
 */

/**
 * One row of `credential_catalogue`, embedded rather than referenced by id.
 *
 * `kind` and `platform` are two axes that vary independently — a Pearson VUE
 * certification and an Anthropic Academy course — which is why #103 split them
 * out of the single `source` column the prototype had. Embedding the row is how
 * PostgREST returns it and it is still the catalogue supplying every word: a
 * credential carries no text of its own, so nothing on this screen except the
 * evidence URL was typed by the person under review.
 */
export type CatalogueEntry = {
  id: string;
  kind: "course" | "certification";
  platform: string;
  label: string;
};

export type QueueCredential = {
  id: string;
  entry: CatalogueEntry;
  /** `earned_at`, and `not null`: there is no in-progress credential. */
  earnedAt: string;
  evidenceUrl: string | null;
  /** Whether the practitioner chose to publish the URL. Not a review input. */
  evidencePublic: boolean;
  verified: boolean;
  verifiedAt: string | null;
  /**
   * The column is `verified_by uuid`. It is a display name here because the
   * badge means a *named human* looked on a given day, and a uuid names nobody
   * — the query resolves it, in `queue-mapping.ts`.
   *
   * Null is a real answer rather than an absent one, and means the check stands
   * with no name against it: `verified_by` is `on delete set null`, so an admin
   * whose account is gone leaves one, and so does any privileged path that had
   * no `auth.uid()` to record.
   */
  verifiedBy: string | null;
};

export type ProfileStatus = "pending" | "approved" | "rejected" | "withdrawn";

/**
 * The statuses Bluehex may set, which is three of the four.
 *
 * `withdrawn` is the practitioner's own lever — how someone leaves without
 * being erased, keeping their credentials and verification history for when
 * they come back. Taking a profile down as an admin is `pending` or `rejected`.
 * Stated as a type rather than only as an absent button, so a later change that
 * adds the button has to argue with the compiler first.
 */
export type AdminStatus = Exclude<ProfileStatus, "withdrawn">;

export type QueueProfile = {
  id: string;
  name: string;
  /* Nullable, because the columns are. A profile with no headline is a real
     row — `name` and a contact are the only things `practitioners` insists on —
     and it is one an admin should be able to see is empty rather than one the
     mapper fills in with `""`. Judging a submission means reading what was
     actually written, absences included. */
  headline: string | null;
  location: string | null;
  bio: string | null;
  focus: string[];
  /** What they sell. Closed set, at most three — the directory's filter axis. */
  services: string[];
  contactEmail: string;
  status: ProfileStatus;
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
export function badgeShows(credentials: QueueCredential[]): boolean {
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
export function unchecked(profile: QueueProfile): QueueCredential[] {
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
 * keeps that item out of the queue, and it rests on Hae-Won Park alone.
 */
export function checkable(profile: QueueProfile): QueueCredential[] {
  return profile.credentials.filter(
    (credential) => credential.evidenceUrl && !credential.verified,
  );
}

/**
 * The evidence URL, if it is one a browser may be pointed at.
 *
 * Defence in depth, and deliberately redundant: `practitioner_credentials.evidence_url`
 * is `public.https_url`, whose check is `value ~* '^https://…'`, so Postgres already
 * refuses `javascript:` and `data:` at insert. The redundancy is the point — the rule
 * that nothing on this screen may be a route to executing somebody else's string is
 * stated in the component that renders the link, and it should be true there rather
 * than true three migrations away. It is the same reasoning that puts both a column
 * privilege and a trigger on `verified`: neither being sufficient alone is not a
 * reason to drop either.
 *
 * Case-insensitive because the domain's check is, so a legal `HTTPS://` row is not
 * refused by the stricter half of the pair. Untrimmed on purpose: browsers strip
 * leading whitespace before resolving a URL, so ` javascript:…` is a real shape and
 * anchoring at position zero is what rejects it.
 */
export function openableEvidence(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

/**
 * Edited since the last check. Derived from two timestamps rather than stored,
 * and only meaningful once something has actually been verified.
 *
 * It has false positives and they are accepted: an admin edit bumps
 * `updated_at` too, and at this volume that is cheaper than a column to
 * suppress them.
 *
 * `lastVerifiedAt` is the largest `verified_at` across the profile's live
 * credential rows, so undoing a check can move it backwards and a profile
 * edited between two checks then reads as drifted. That is a true statement
 * rather than a manufactured one — the check that covered the edit has been
 * taken back — and holding it still would need somewhere to remember a check
 * that no longer exists, which is a column. See `queue-mapping.ts`.
 */
export function hasDrifted(profile: QueueProfile): boolean {
  if (!profile.lastVerifiedAt) return false;
  return profile.updatedAt > profile.lastVerifiedAt;
}

/**
 * The three kinds of work, named once.
 *
 * The filter control and the reason shown on a queue row read the same value,
 * so "show me only the certificate checks" and "why is this profile here" can
 * never disagree — a filter written against its own predicate is a second
 * definition of membership, and the two drift the first time `outstanding()`
 * changes.
 */
export type ReasonKind = "decision" | "certificates" | "drift";

export type Reason = { kind: ReasonKind; label: string };

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
export function outstanding(profile: QueueProfile): Reason[] {
  /* A profile nobody can see generates no work. Rejecting Marcus Bell has to
     clear him outright, certificates and all — checking the evidence on a
     profile that is not published is work with no consumer, and leaving it in
     the list would mean the most obvious spam in the queue is also the hardest
     thing to get rid of. Withdrawn is the same, from the other direction: the
     practitioner has left, and their verification history is kept for their
     return rather than added to while they are gone. */
  if (profile.status === "rejected" || profile.status === "withdrawn") return [];

  const reasons: Reason[] = [];

  if (profile.status === "pending") {
    reasons.push({ kind: "decision", label: "Needs a decision" });
  }

  const toCheck = checkable(profile).length;
  if (toCheck > 0) {
    reasons.push({
      kind: "certificates",
      label: `${toCheck} certificate${toCheck === 1 ? "" : "s"} to check`,
    });
  }

  if (hasDrifted(profile)) {
    reasons.push({ kind: "drift", label: "Edited since checked" });
  }

  return reasons;
}

/* ------------------------------------------------------------------ */
/* Volume: order and filter                                           */
/* ------------------------------------------------------------------ */

/**
 * Oldest first, or newest first. Two orders and no more.
 *
 * Both are over `updatedAt`, which is the one clock this screen already has to
 * reason about — it is half of the drift comparison — so ordering on it adds no
 * second notion of when a profile "arrived". Oldest first is the default
 * because a queue is a fairness device before it is a throughput device:
 * whoever has been sitting longest untouched gets looked at first. Newest first
 * exists for the opposite shift, the one where a burst has just landed and the
 * thing worth seeing is what arrived together — Marcus Bell's two certificates
 * were earned on the same day and submitted hours later, and that is a pattern
 * you only notice at the top of a recency list.
 */
export type QueueOrder = "oldest" | "newest";

export const queueOrders: { value: QueueOrder; label: string }[] = [
  { value: "oldest", label: "Longest untouched" },
  { value: "newest", label: "Most recent first" },
];

/**
 * A total order, so the list does not shuffle between renders. `updatedAt`
 * alone leaves ties — two profiles edited in the same minute — and an unstable
 * queue is one an admin cannot keep their place in.
 */
export function sortQueue(profiles: QueueProfile[], order: QueueOrder): QueueProfile[] {
  const direction = order === "oldest" ? 1 : -1;

  return [...profiles].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -direction : direction;
    return a.id < b.id ? -1 : 1;
  });
}

/** `all`, or one kind of work. Same vocabulary as `Reason`, deliberately. */
export type QueueFilter = "all" | ReasonKind;

export const queueFilters: { value: QueueFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "decision", label: "Needs a decision" },
  { value: "certificates", label: "Certificates to check" },
  { value: "drift", label: "Edited since checked" },
];

export function matchesFilter(profile: QueueProfile, filter: QueueFilter): boolean {
  const reasons = outstanding(profile);
  if (reasons.length === 0) return false;
  if (filter === "all") return true;

  return reasons.some((reason) => reason.kind === filter);
}

/** How many profiles each filter would show. Rendered on the control itself,
    so an admin can see there is no work of a kind without selecting it. */
export function countByFilter(profiles: QueueProfile[]): Record<QueueFilter, number> {
  const counts: Record<QueueFilter, number> = { all: 0, decision: 0, certificates: 0, drift: 0 };

  for (const { value } of queueFilters) {
    counts[value] = profiles.filter((profile) => matchesFilter(profile, value)).length;
  }

  return counts;
}

/**
 * The list, split the way it is rendered: work, and everything already dealt
 * with.
 *
 * `cleared` is deliberately not filtered. The filter names a kind of *work*,
 * and a profile with none has no kind — filtering it would empty the reference
 * list for no reason an admin could infer from the control they touched.
 */
export function partitionQueue(
  profiles: QueueProfile[],
  { filter, order }: { filter: QueueFilter; order: QueueOrder },
): { open: QueueProfile[]; cleared: QueueProfile[] } {
  return {
    open: sortQueue(
      profiles.filter((profile) => matchesFilter(profile, filter)),
      order,
    ),
    cleared: sortQueue(
      profiles.filter((profile) => outstanding(profile).length === 0),
      order,
    ),
  };
}

/**
 * What an admin can do, and — as much to the point — what they cannot.
 *
 * Every member returns `void | Promise<void>`, which is what let #14 swap the
 * implementation without touching anything below it: the client shell now wraps
 * the Server Actions in `./actions` — `approve_practitioner()`,
 * `reject_practitioner()`, `set_credential_verified()` and a `PATCH` of
 * `user_id` — reports what came back, and hands down the same object. The
 * components never learn which one they were given, and none of them writes to
 * PostgREST itself.
 *
 * The wrapping is where the outcome goes. An action returns `{ ok }` rather than
 * throwing, because a thrown error out of a Server Action is replaced with a
 * generic message in a production build and the specific ones are what a
 * reviewer needs; the shell reads it and puts it on screen, so this type stays
 * about what an admin may do rather than about how a failure travels.
 *
 * Two absences are load-bearing:
 *
 * - **There is no `setProfileVerified`.** Verification is per credential and
 *   there is no such thing as verifying a profile — the badge is a rollup of
 *   credential rows and is never stored. `AGENTS.md` warns that this invariant
 *   fails open rather than loudly, so it is stated where a compiler can see it.
 * - **`setStatus` takes `AdminStatus`.** Bluehex has no Withdraw button, and
 *   `"withdrawn"` is not a value this type will carry.
 */
export type QueueActions = {
  /** `note` is required in practice for `"rejected"` and meaningless otherwise:
      `practitioner_review_notes.note` is `not null`, so there is no rejecting
      somebody without telling them why. Optional in the type because the other
      two statuses take none, and refused by the action when it is missing. */
  setStatus: (profileId: string, status: AdminStatus, note?: string) => void | Promise<void>;
  setVerified: (
    profileId: string,
    credentialId: string,
    verified: boolean,
  ) => void | Promise<void>;
  setNote: (profileId: string, note: string) => void | Promise<void>;
  /** `null → A` only. `A → B` raises `23514` in the guard, admins included, so
      there is no reassign and no argument for one.

      The account is named by id rather than resolved from the contact address,
      because nothing reachable from PostgREST turns an email into an account:
      `auth` is not an exposed schema. The address is on screen beside the field
      and the match is the admin's to make. */
  assignOwner: (profileId: string, accountId: string) => void | Promise<void>;
};
