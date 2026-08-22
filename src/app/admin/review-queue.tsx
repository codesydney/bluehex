"use client";

/**
 * The Bluehex review queue.
 *
 * One queue, profile-centric: a list of everything needing attention, and a
 * detail panel where all of it is done for one person — approve or reject, tick
 * each credential, leave a note. The shape was settled against two alternatives
 * and a decision-support round; `#72` built it, and the reasoning that produced
 * it is in that ticket and in the prototype it replaced.
 *
 * ## What the layout is doing, and why it is not arbitrary
 *
 * **Two panels, separately captioned, and different in kind.** Admission
 * control sits directly under the bio, because the profile you have just read
 * *is* its evidence and because it comes first — reject and there is nothing
 * left to check. The credentials are a working surface further down, in the one
 * panel on the page. Different in kind rather than merely ordered: that is what
 * keeps two independent axes from reading as two stages of one pipeline. A
 * profile can be approved and unverified, the spec calls that the normal case,
 * and if this screen ever makes it feel half-done admins will withhold approval
 * until they can verify — which collapses the two axes and empties the
 * directory.
 *
 * **There is no verify-a-profile action, and there must never be one.** The
 * only verb in the model is checking one credential; the badge is a rollup and
 * is not stored. `QueueActions` says so in the type as well as in the markup.
 *
 * **Flatness is not hierarchy.** An earlier draft answered "three panels of
 * identical weight" by deleting every panel, which removed the only structure
 * the page had. The palette is why: `surface` is `#ffffff` on a `#faf7f6` page,
 * a 3% step, and `stroke` is `#e0dddb`. A panel here needs both a surface *and*
 * a border to register at all, so there is exactly one and everything else is
 * page.
 *
 * ## Nothing renders a certificate, and nothing should
 *
 * `evidenceUrl` is submitted by an untrusted practitioner and the admin reading
 * it is the one principal who can set `verified`. So: an `<a>` with
 * `rel="noopener noreferrer"`, and nothing embedded — no `<iframe>`, `<embed>`
 * or `<object>` (the page could navigate the top frame away, or draw a fake
 * Bluehex sign-in inside the frame and phish the session that grants the
 * badge), no server-side fetch to proxy or screenshot (SSRF, against a host
 * running Supabase on `localhost:54321` and cloud metadata on
 * `169.254.169.254`), no remote subresource of any kind including an `<img>`
 * (it leaks the admin's address and the timing of the review back to the person
 * under review), and no PDF rendered inline (attacker-controlled binary parsed
 * in a browser holding admin rights).
 *
 * **The URL itself is shown as text, and that is the opposite decision rather
 * than a softening of it.** Text embeds nothing, frames nothing and issues no
 * request, and it is most of what the admin is judging: `Open certificate`
 * alone renders a Skilljar certificate page and a file on somebody's Drive
 * identically, and it hides the slug that is the only reason a reused
 * certificate is catchable by a human who reviewed another profile last week.
 *
 * ## The write path
 *
 * Every action is a member of `QueueActions`, each of which may return a
 * promise, and this component never talks to PostgREST. #14 hands it Server
 * Actions calling `approve_practitioner()`, `reject_practitioner()` and
 * `set_credential_verified()`; today it is handed a reducer over the fixtures,
 * so the workflow can be walked end to end and nothing persists.
 */

import { useEffect, useState } from "react";
import {
  badgeShows,
  checkable,
  countByFilter,
  outstanding,
  partitionQueue,
  queueFilters,
  queueOrders,
  stampVerification,
  unchecked,
  type AdminStatus,
  type QueueActions,
  type QueueCredential,
  type QueueFilter,
  type QueueOrder,
  type QueueProfile,
} from "./_lib/queue";

export function ReviewQueue({
  queue: initial,
  reviewer,
}: {
  queue: QueueProfile[];
  reviewer: string;
}) {
  const [queue, setQueue] = useState<QueueProfile[]>(initial);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [order, setOrder] = useState<QueueOrder>("oldest");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const patch = (profileId: string, change: (profile: QueueProfile) => QueueProfile) =>
    setQueue((current) =>
      current.map((profile) => (profile.id === profileId ? change(profile) : profile)),
    );

  /**
   * Fixture-backed, and the only thing in this file #14 replaces. Each member
   * is the local equivalent of one RPC; swapping in Server Actions changes this
   * object and nothing below it.
   */
  const actions: QueueActions = {
    /* Deliberately does NOT bump `updatedAt`. Drift means "the practitioner
       edited their profile since we checked it", and an admin changing the
       status is not that — bumping it here would put a profile you just
       approved straight back in the queue as drifted. The accepted false
       positives are the practitioner-invisible ones the spec names; this would
       be one this screen manufactured for itself. */
    setStatus: (profileId, status: AdminStatus) =>
      patch(profileId, (profile) => ({ ...profile, status })),

    setVerified: (profileId, credentialId, verified) =>
      /* `new Date()` here rather than in the render body: nothing re-renders
         while an admin reads a profile, so a timestamp captured at render
         records when the profile was opened. A session that opens one at 23:50
         and checks it at 00:05 would date the attestation yesterday. */
      patch(profileId, (profile) =>
        stampVerification(profile, credentialId, verified, {
          by: reviewer,
          at: new Date().toISOString(),
        }),
      ),

    setNote: (profileId, note) => patch(profileId, (profile) => ({ ...profile, reviewNote: note })),

    /* `null → A` claims a profile. `A → B` raises 23514 in `practitioners_guard`
       — admins included — so there is deliberately no way to reassign one, here
       or anywhere. A mis-assignment is recovered by unassigning first, which
       withdraws the profile while its ownership is in question. */
    assignOwner: (profileId) =>
      patch(profileId, (profile) =>
        profile.owner ? profile : { ...profile, owner: profile.contactEmail },
      ),
  };

  const { open, cleared } = partitionQueue(queue, { filter, order });
  const counts = countByFilter(queue);

  /* Navigation follows what is on screen: outstanding work first, finished
     profiles after it. */
  const ordered = [...open, ...cleared];
  const index = ordered.findIndex((profile) => profile.id === selectedId);
  const selected = ordered[index] ?? ordered[0];
  const position = index >= 0 ? index : ordered.length > 0 ? 0 : -1;
  const step = (delta: number) => {
    const target = ordered[position + delta];
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
    /* No dependency array on purpose: the handler closes over `position`, and
       re-binding one listener per render is free at this scale. */
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-14">
      {/* The queue ------------------------------------------------------- */}
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-sm font-medium">
          {open.length === 0
            ? filter === "all"
              ? "Nothing to review"
              : "Nothing of this kind"
            : `${open.length} ${open.length === 1 ? "profile needs" : "profiles need"} you`}
        </p>

        <QueueControls
          filter={filter}
          order={order}
          counts={counts}
          onFilter={setFilter}
          onOrder={setOrder}
        />

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
          <details className="mt-6">
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
              disabled={position <= 0}
              className="text-sm font-medium underline underline-offset-4 disabled:no-underline disabled:opacity-40"
            >
              ← Previous
            </button>
            <p className="text-sm text-t-muted">
              {position + 1} of {ordered.length}
              <span className="ml-2 hidden sm:inline">· ← → move</span>
            </p>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={position >= ordered.length - 1}
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
                one an admin is most likely to find telling. Five focus areas
                beside three services is a signal; the same eight in one row is
                decoration. */}
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
                {/* Three buttons for four statuses. `withdrawn` is the
                    practitioner's own lever — how somebody leaves without being
                    erased — and Bluehex taking a profile down is `pending` or
                    `rejected`. `AdminStatus` will not carry the fourth. */}
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

            <p className="mt-3 max-w-prose text-sm text-t-muted">
              Whether anybody else can see this profile, and nothing else. Independent of the
              badge below: most published profiles carry no badge, and that is the normal
              case rather than an unfinished one.
            </p>

            {!selected.owner ? (
              <div className="mt-5">
                <Action onClick={() => actions.assignOwner(selected.id)} quiet>
                  Assign owner
                </Action>
                <p className="mt-2 max-w-prose text-sm text-t-muted">
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

            <p className="mt-2 max-w-prose text-sm text-t-muted">
              Checked one at a time, against the certificate behind each one. There is no
              verifying a profile — the badge is what the rows below add up to.
            </p>

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
                Still open:{" "}
                {outstanding(selected)
                  .map((reason) => reason.label)
                  .join(" · ")
                  .toLowerCase()}
              </p>
            )}
            <p className="ml-auto text-sm text-t-muted">Signed in as {reviewer}</p>
          </div>
        </article>
      ) : null}
    </div>
  );
}

/**
 * Order and filter — the two things the drawing did not have.
 *
 * Both are local state over a list the page already holds whole, which is what
 * the public directory does with its own search and filters. When the queue
 * outgrows one fetch these become `.order()` and a predicate in the query; the
 * functions they call are already pure and take the whole list, so the move is
 * a change of caller rather than of rule.
 *
 * The filter's options are the `Reason` kinds, not a separate vocabulary. A
 * filter written against its own predicate is a second definition of queue
 * membership, and the two disagree the first time `outstanding()` changes.
 */
function QueueControls({
  filter,
  order,
  counts,
  onFilter,
  onOrder,
}: {
  filter: QueueFilter;
  order: QueueOrder;
  counts: Record<QueueFilter, number>;
  onFilter: (value: QueueFilter) => void;
  onOrder: (value: QueueOrder) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 border-y border-stroke py-4">
      <div>
        <p className="text-xs text-t-faint uppercase" id="queue-filter-label">
          Show
        </p>
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          role="group"
          aria-labelledby="queue-filter-label"
        >
          {queueFilters.map(({ value, label }) => (
            <Toggle
              key={value}
              pressed={filter === value}
              onClick={() => onFilter(value)}
              /* Nothing is disabled at zero. A control that vanishes or greys
                 out when its count is nil hides the answer an admin came for —
                 "is there any of this work?" — behind the act of asking. */
            >
              {label} <span className="tabular-nums opacity-60">{counts[value]}</span>
            </Toggle>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-t-faint uppercase" id="queue-order-label">
          Order
        </p>
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          role="group"
          aria-labelledby="queue-order-label"
        >
          {queueOrders.map(({ value, label }) => (
            <Toggle key={value} pressed={order === value} onClick={() => onOrder(value)}>
              {label}
            </Toggle>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * What the badge is doing, and why, in one line.
 *
 * The middle branch is the one worth reading. `unchecked` is what the badge is
 * waiting on; `checkable` is what an admin can move. Hae-Won Park is the
 * difference — one earned credential with no evidence URL — and calling that
 * "still unchecked" would describe as pending work what the row below correctly
 * calls permanent. The header has to make the same distinction `queue.ts` goes
 * out of its way to keep, or it re-creates the never-completing task.
 */
function badgeLine(profile: QueueProfile) {
  if (badgeShows(profile.credentials)) return "Badge showing";

  /* Nothing is pending on a profile nobody can see. */
  if (profile.status === "rejected" || profile.status === "withdrawn") {
    return "No badge — the profile is not visible";
  }

  /* Nothing claimed at all, which is a normal profile rather than a gap. */
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
         page, white on hover, ink when selected. */
      className={`w-full rounded-tight px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-ink text-t-invert" : "hover:bg-surface"
      }`}
    >
      <p className="font-medium">{profile.name}</p>
      <p className={`mt-0.5 text-sm ${selected ? "text-t-invert-muted" : "text-t-muted"}`}>
        {reasons.length > 0 ? reasons.map((reason) => reason.label).join(" · ") : "Done"}
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

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        {/* Label, kind and platform are all read off the embedded catalogue
            row. The practitioner chose an entry from a list Bluehex wrote, so
            the only untrusted string on this row is the URL. */}
        <p className="font-medium">{credential.entry.label}</p>
        <p className="mt-0.5 text-sm text-t-muted">
          {credential.entry.platform} {credential.entry.kind} · earned {credential.earnedAt}
        </p>

        {credential.verified ? (
          /* `verified_by` and `verified_at` in full strength rather than as
             muted bookkeeping. They are the substance of the attestation: the
             badge means this named human looked on this day. */
          <p className="mt-2 text-sm">
            Checked by {credential.verifiedBy} on {credential.verifiedAt?.slice(0, 10)}.
          </p>
        ) : null}

        {credential.evidenceUrl ? (
          /* A link and the URL as text. Nothing is embedded, nothing is
             fetched, and no subresource is requested — see the file header. The
             URL is on screen because it is a large part of what is being
             judged: `Open certificate` renders identically for a Skilljar
             certificate page and for a file on somebody's Drive, and it hides a
             slug an admin may have already read on another profile this week. */
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
             would otherwise be a queue item with no action that closes it.

             `Undo check` is still drawn as an absence, and the spec's open
             question is whether it is really a second attestation by a second
             named human. It stays as it is until that is answered, because the
             answer is a column. */
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

function Toggle({
  children,
  pressed,
  onClick,
}: {
  children: React.ReactNode;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        pressed
          ? "border-stroke-strong bg-ink text-t-invert"
          : "border-stroke bg-surface text-t-muted hover:text-t-bright"
      }`}
    >
      {children}
    </button>
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
