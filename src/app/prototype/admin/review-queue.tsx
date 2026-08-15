"use client";

/**
 * The Bluehex review queue — the chosen shape, redrawn.
 *
 * The shape is unchanged and settled: one queue, profile-centric, two axes kept
 * apart. What changed is that the previous drawing was **a form for editing a
 * record when the job is making a decision**, and the specific complaints were
 * all symptoms of that:
 *
 * 1. **It was called a queue and could not empty.** The list mapped over every
 *    profile unconditionally, so acting on one changed a pill and moved
 *    nothing. A queue whose items never leave is a table, and you feel that at
 *    nine profiles as much as at two hundred — which is why this was never the
 *    scale problem it looked like. `outstanding()` decides membership now, and
 *    a profile with nothing left drops out.
 * 2. **The visual weight was inverted.** The judgement — is this a real person
 *    — was made against a small muted header while three one-click controls got
 *    large panels. The person now gets the room.
 * 3. **Nothing acknowledged an action**, and there was no way through the queue
 *    but clicking rows. There is a pager, arrow keys, and a profile that says
 *    when it is finished.
 *
 * ## Two things this got wrong first time, corrected here
 *
 * **Flatness is not hierarchy.** The first redraw answered "three panels of
 * identical weight" by deleting every panel, which removed the only structure
 * the page had and left grey text on grey rules — worse, not better. The
 * palette is the reason it reads so weakly: `surface` is `#ffffff` on a
 * `#faf7f6` page, a 3% step, and `stroke` is `#e0dddb`. A panel here has to
 * carry both a surface *and* a border to register at all. So there is exactly
 * one panel, around the credentials, and everything else is page.
 *
 * **Approving comes before checking, and the order should say so.** Status was
 * below the credentials on the grounds that credentials are the product. But
 * admission control is a separate, earlier decision, and its evidence is the
 * profile you have just read — so it sits directly under the bio, while the
 * credentials are a working surface further down with a different treatment.
 * Different in kind, not merely ordered: that is what keeps two independent
 * axes from reading as two stages of one pipeline.
 *
 * The invariants from NOTES.md are unchanged: no verify-a-profile action, no
 * admin Withdraw, owner assignment one-way, and `verifiedBy`/`verifiedAt` shown
 * as the substance of the attestation rather than hidden as bookkeeping.
 *
 * **This is a drawing, not an implementation.** No auth, no database, no write
 * path — a real admin surface is gated on `bluehex_admin` per ADR-0001 and needs
 * #49/#50 and application auth first.
 */

import { useEffect, useState } from "react";
import { catalogueEntry } from "../catalogue";
import {
  admin,
  badgeShows,
  checkable,
  outstanding,
  unchecked,
  type QueueCredential,
  type QueueProfile,
  type VariantProps,
} from "./queue-data";

export function ReviewQueue({ queue, actions }: VariantProps) {
  const [selectedId, setSelectedId] = useState(queue[0]?.id);

  const open = queue.filter((profile) => outstanding(profile).length > 0);
  const cleared = queue.filter((profile) => outstanding(profile).length === 0);

  /* Navigation follows what is on screen: outstanding work first, finished
     profiles after it. */
  const ordered = [...open, ...cleared];
  const index = ordered.findIndex((profile) => profile.id === selectedId);
  const selected = ordered[index] ?? ordered[0];
  const step = (delta: number) => {
    const target = ordered[index + delta];
    if (target) setSelectedId(target.id);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /* Left and right only, and never with a modifier held. Up and down are
         how you scroll — the profile column is long and the queue beside it is
         sticky, so scrolling it is the normal reading action — and Alt+Left is
         Back in Chrome and Firefox. A shortcut added for throughput must not
         take away two the admin already had. */
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* No dependency array on purpose: the handler closes over `index`, and
       re-binding one listener per render is free at this scale. */
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-14">
      {/* The queue ------------------------------------------------------- */}
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-sm font-medium">
          {open.length === 0
            ? "Nothing to review"
            : `${open.length} ${open.length === 1 ? "profile needs" : "profiles need"} you`}
        </p>

        <ul className="mt-4 flex flex-col gap-1">
          {open.map((profile) => (
            <li key={profile.id}>
              <QueueRow
                profile={profile}
                selected={profile.id === selected?.id}
                onSelect={() => setSelectedId(profile.id)}
              />
            </li>
          ))}
        </ul>

        {cleared.length > 0 ? (
          <details className="mt-6" open>
            <summary className="cursor-pointer text-sm text-t-muted">
              Reviewed — {cleared.length}
            </summary>
            <ul className="mt-3 flex flex-col gap-1">
              {cleared.map((profile) => (
                <li key={profile.id}>
                  <QueueRow
                    profile={profile}
                    selected={profile.id === selected?.id}
                    onSelect={() => setSelectedId(profile.id)}
                  />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {/* The profile ----------------------------------------------------- */}
      {selected ? (
        <article className="max-w-3xl">
          {/* Pager. Arrow keys do the same thing; the buttons are here because
              a keyboard shortcut nobody can see is a shortcut nobody uses. */}
          <div className="flex items-center justify-between border-b border-stroke pb-4">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={index <= 0}
              className="text-sm font-medium underline underline-offset-4 disabled:no-underline disabled:opacity-40"
            >
              ← Previous
            </button>
            <p className="text-sm text-t-muted">
              {index + 1} of {ordered.length}
              <span className="ml-2 hidden sm:inline">· ← → move</span>
            </p>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={index >= ordered.length - 1}
              className="text-sm font-medium underline underline-offset-4 disabled:no-underline disabled:opacity-40"
            >
              Next →
            </button>
          </div>

          {/* The person, given the room, in full-strength text. This is the
              evidence the visibility decision below is made on. */}
          <header className="mt-10">
            <h2 className="display-3">{selected.name}</h2>
            <p className="mt-2 text-lg">{selected.headline}</p>
            <p className="mt-0.5 text-t-muted">{selected.location}</p>

            <p className="mt-6 max-w-prose">{selected.bio}</p>

            {/* Services and focus, kept apart and labelled. They are two
                different claims — what you can buy, and what somebody knows —
                and running them together as one pile of chips would hide the
                one an admin is most likely to find telling. Marcus Bell's five
                focus areas beside his three services is a signal; the same
                eight in one row is decoration. */}
            {selected.services.length > 0 ? (
              <p className="mt-5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-t-faint uppercase">Offers</span>
                {selected.services.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-stroke-strong px-2.5 py-0.5 text-t-bright"
                  >
                    {item}
                  </span>
                ))}
              </p>
            ) : null}

            {selected.focus.length > 0 ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-t-faint uppercase">Knows</span>
                {selected.focus.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-stroke px-2.5 py-0.5 text-t-muted"
                  >
                    {item}
                  </span>
                ))}
              </p>
            ) : null}

            <p className="mt-5 text-sm text-t-muted">
              {selected.contactEmail} · never published
              {selected.owner ? "" : " · unclaimed"}
            </p>
          </header>

          {/* Admission control. Directly under the person because that is what
              it is decided on, and before the credentials because it comes
              first — reject and there is nothing left to check. */}
          <section className="mt-10 border-t border-stroke pt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <h3 className="text-lg font-medium">Visible?</h3>
              <StatusPill status={selected.status} />

              <div className="ml-auto flex flex-wrap gap-2">
                {selected.status !== "approved" ? (
                  <Action onClick={() => actions.setStatus(selected.id, "approved")}>
                    Approve
                  </Action>
                ) : null}
                {selected.status !== "rejected" ? (
                  <Action onClick={() => actions.setStatus(selected.id, "rejected")} quiet>
                    Reject
                  </Action>
                ) : null}
                {selected.status !== "pending" ? (
                  <Action onClick={() => actions.setStatus(selected.id, "pending")} quiet>
                    Back to pending
                  </Action>
                ) : null}
              </div>
            </div>

            {!selected.owner ? (
              <div className="mt-5">
                <Action onClick={() => actions.assignOwner(selected.id)} quiet>
                  Assign owner
                </Action>
                <p className="mt-2 text-sm text-t-muted">
                  Hands over a profile that may already carry the badge, and cannot be
                  undone — a profile never changes owners twice.
                </p>
              </div>
            ) : null}
          </section>

          {/* Credentials — a working surface, and the one panel on the page.
              Both a white fill and a border, because either alone is a 3% step
              against the page and disappears. */}
          <section className="mt-10 rounded-card border border-stroke bg-surface p-6 md:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h3 className="text-lg font-medium">Credentials</h3>
              <p className="text-sm text-t-muted">{badgeLine(selected)}</p>
            </div>

            {selected.credentials.length === 0 ? (
              <p className="mt-6 text-sm text-t-muted">None claimed.</p>
            ) : (
              <ul className="mt-6 flex flex-col divide-y divide-stroke">
                {selected.credentials.map((credential) => (
                  <li key={credential.id} className="py-5 first:pt-0 last:pb-0">
                    <CredentialRow
                      credential={credential}
                      status={selected.status}
                      onCheck={() => actions.setVerified(selected.id, credential.id, true)}
                      onUndo={() => actions.setVerified(selected.id, credential.id, false)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="mt-8">
            <summary className="cursor-pointer text-sm text-t-muted">
              Note to the practitioner{selected.reviewNote ? " · written" : ""}
            </summary>
            {/* The summary above says what this is but names nothing, and a
                placeholder is only a last-resort accessible name — without the
                label the field announces as "Why this was rejected, or what is
                missing…", which is the prompt rather than the field. */}
            <textarea
              rows={3}
              aria-label="Note to the practitioner"
              value={selected.reviewNote ?? ""}
              onChange={(event) => actions.setNote(selected.id, event.target.value)}
              placeholder="Why this was rejected, or what is missing…"
              className="mt-3 w-full resize-y rounded-tight border border-stroke bg-surface px-3.5 py-2.5 text-sm outline-ink outline-offset-2 focus:outline-2"
            />
            <p className="mt-2 text-sm text-t-muted">They can read this; nobody else can.</p>
          </details>

          <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-stroke pt-6">
            {outstanding(selected).length === 0 ? (
              <p className="text-sm font-medium">Nothing left on this profile.</p>
            ) : (
              <p className="text-sm text-t-muted">
                Still open: {outstanding(selected).join(" · ").toLowerCase()}
              </p>
            )}
            <p className="ml-auto text-sm text-t-muted">Signed in as {admin}</p>
          </div>
        </article>
      ) : null}
    </div>
  );
}

/**
 * What the badge is doing, and why, in one line.
 *
 * The middle branch is the one worth reading. `unchecked` is what the badge is
 * waiting on; `checkable` is what an admin can move. Hae-Won Park is the
 * difference — one earned credential with no evidence URL — and calling that
 * "still unchecked" describes as pending work what the row below correctly
 * calls permanent. The header has to make the same distinction `queue-data.ts`
 * went out of its way to keep, or it re-creates the never-completing task.
 */
function badgeLine(profile: QueueProfile) {
  if (badgeShows(profile.credentials)) return "Badge showing";

  /* Nothing is pending on a profile nobody can see. */
  if (profile.status === "rejected" || profile.status === "withdrawn") {
    return "No badge — the profile is not visible";
  }

  /* Nothing claimed at all, which is a normal profile rather than a gap. It
     used to read "nothing earned yet", which was true of a profile holding only
     in-progress rows; there are no such rows now, so the only way to have
     nothing to check is to hold nothing. */
  if (profile.credentials.length === 0) return "No badge — no credentials claimed";

  const waiting = unchecked(profile).length;
  if (checkable(profile).length === 0) {
    return `No badge — ${waiting} claimed, no certificate supplied`;
  }
  return `No badge — ${waiting} still unchecked`;
}

function QueueRow({
  profile,
  selected,
  onSelect,
}: {
  profile: QueueProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  const reasons = outstanding(profile);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      /* Three states that are actually distinguishable on a #faf7f6 page:
         page, white on hover, ink when selected. The previous version gave
         selected and hover the same fill, so hovering looked like selecting. */
      className={`w-full rounded-tight px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-ink text-t-invert" : "hover:bg-surface"
      }`}
    >
      <p className="font-medium">{profile.name}</p>
      <p className={`mt-0.5 text-sm ${selected ? "text-t-invert-muted" : "text-t-muted"}`}>
        {reasons.length > 0 ? reasons.join(" · ") : "Done"}
      </p>
    </button>
  );
}

function CredentialRow({
  credential,
  status,
  onCheck,
  onUndo,
}: {
  credential: QueueCredential;
  status: QueueProfile["status"];
  onCheck: () => void;
  onUndo: () => void;
}) {
  /* A profile nobody can see generates no verification work — `outstanding()`
     returns nothing at all for these two statuses, and for the same reason the
     actions have to go with it. A live Verify button on a rejected profile
     stamps a named human onto spam, and it sits above a footer saying there is
     nothing left to do. The rows still render, because the evidence is part of
     why it was rejected; only the action column goes read-only. */
  const closed = status === "rejected" || status === "withdrawn";
  /* The label and the source are read off the catalogue rather than off the
     credential, which is the whole of the change here: the practitioner chose
     an entry from a list Bluehex wrote, so what an admin reads on this row is
     Bluehex's own text and the only untrusted string left is the URL. */
  const entry = catalogueEntry(credential.catalogueId);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{entry.label}</p>
        <p className="mt-0.5 text-sm text-t-muted">
          {entry.source} · earned {credential.earnedAt}
        </p>

        {credential.verified ? (
          <p className="mt-2 text-sm">
            Checked by {credential.verifiedBy} on {credential.verifiedAt?.slice(0, 10)}.
          </p>
        ) : null}

        {credential.evidenceUrl ? (
          /* The URL is on screen as text as well as being linked, because the
             URL is a large part of what is being judged. `Open certificate`
             renders identically for a Skilljar certificate page and for a file
             on somebody's Drive, and it hides a slug an admin has already read
             on another profile this week — the two things the awkward fixtures
             exist to test. Text embeds nothing, frames nothing and issues no
             request, so none of the reasoning in NOTES.md against rendering a
             certificate argues against showing where it lives. */
          <div className="mt-2">
            <a
              href={credential.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm underline underline-offset-4"
            >
              Open certificate
            </a>
            <p className="mt-1 text-sm break-all text-t-muted">{credential.evidenceUrl}</p>
          </div>
        ) : null}
      </div>

      <div className="shrink-0">
        {closed ? (
          <p className="max-w-48 text-sm text-t-muted">
            {status === "rejected" ? "Rejected" : "Withdrawn"}, so there is nothing to check
          </p>
        ) : !credential.evidenceUrl ? (
          /* Earned, claimed, nothing behind it. Not a rejection and not a task —
             it waits on them, and must never sit in the queue as work that
             cannot be finished. */
          <p className="max-w-48 text-sm text-t-muted">
            No certificate supplied, so this cannot be checked
          </p>
        ) : credential.verified ? (
          /* "Check again" is the same verb applied a second time, not a new one
             — the badge means a named human looked on a given day, so looking
             again moves the day. It is also the only thing that clears a
             drifted profile whose credentials are all already verified, which
             would otherwise be a queue item with no action that closes it. */
          <div className="flex flex-col items-end gap-2">
            <Action onClick={onCheck} quiet>
              Check again
            </Action>
            <button
              type="button"
              onClick={onUndo}
              className="text-sm text-t-muted underline underline-offset-4"
            >
              Undo check
            </button>
          </div>
        ) : (
          <Action onClick={onCheck}>Verify</Action>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: QueueProfile["status"] }) {
  const tone =
    status === "approved"
      ? "bg-ink text-t-invert"
      : status === "rejected"
        ? "border border-stroke-strong text-t-bright"
        : "border border-stroke bg-surface text-t-muted";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}

function Action({
  children,
  onClick,
  quiet,
}: {
  children: React.ReactNode;
  onClick: () => void;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 w-fit items-center rounded-full px-4 text-sm font-medium transition-colors ${
        quiet
          ? "border border-stroke-strong bg-surface hover:bg-ink hover:text-t-invert"
          : "bg-ink text-t-invert hover:bg-ink-tint"
      }`}
    >
      {children}
    </button>
  );
}
