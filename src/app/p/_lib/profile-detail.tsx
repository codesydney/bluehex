"use client";

/**
 * One profile.
 *
 * It rendered in two containers for a while — a drawer over the directory on a
 * click, a page on a cold arrival, one component behind both. The drawer was cut
 * along with the route interception that produced it. What is left is the page,
 * which was always the half that had to work.
 *
 * What is here and not on the roster row: the bio, the earned dates, the
 * credential sources, and now `focus` — which the roster gave up when
 * `services` took the filter axis. The page is not justified by that depth —
 * it is justified by having a URL, which is a different argument and the one
 * that actually held.
 *
 * **The credentials block defaults to what this person holds**, with a control
 * revealing the rest of the catalogue — Earned, Not earned, All. The roster has
 * no equivalent and should not grow one: it is dense, and a progress figure
 * beside a name is a score nobody asked to be ranked by. The editor is where
 * progress against the whole catalogue belongs, because there the reader is the
 * practitioner looking at their own record.
 *
 * **`services`, `availability` and the four published links are in the model
 * and are not drawn here yet.** The links have been unrendered since the
 * columns landed; `services` and `availability` join them with this change.
 * All six are in the `anon` grant, so this page is where they belong — it is
 * the only surface a visitor reads before deciding to enquire, and
 * `availability` in particular is read exactly once, right there. Drawing them
 * is a design decision rather than a mechanical follow-on, which is why it is
 * flagged rather than guessed at.
 */

import { useId, useState } from "react";
import { CredentialMark, earnedLabel } from "@/components/credential-mark";
import { Badge } from "@/components/ui";
import {
  hasVerifiedBadge,
  profilePath,
  type CatalogueEntry,
  type Practitioner,
} from "@/lib/practitioners";
import { site } from "@/lib/site";

/**
 * Which slice of the catalogue the credentials block is showing.
 *
 * **The words are the decision.** "Not earned" is a fact about a record;
 * "In progress" is a claim about a person, and rendering twenty-two unearned
 * entries under that heading would assert on somebody's behalf that they are
 * working through courses they have never opened. That is the exact claim
 * in-progress credential rows were deleted for being — worse here, because the
 * rows were at least opt-in and this would be automatic. Anything implying
 * intent, effort or enrolment is out, however natural it sounds.
 */
type View = "earned" | "unearned" | "all";

export function ProfileDetail({
  person,
  catalogue = [],
}: {
  person: Practitioner;
  /**
   * Every credential that exists, so the page can show what this person has
   * not earned as well as what they have. `anon` reads the catalogue, which is
   * a list of courses Anthropic publishes and says nothing about anybody.
   *
   * Defaults to empty, and an empty catalogue simply means the control has
   * nothing to reveal and does not render — which is also what production does
   * until the query behind it lands.
   */
  catalogue?: CatalogueEntry[];
}) {
  const badged = hasVerifiedBadge(person.credentials);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>("earned");
  const viewLabelId = useId();

  const holdings = new Set(person.credentials.map((credential) => credential.entry.id));
  /* Retired entries are excluded: a course nobody can take any more is not
     something this person has failed to do. `active` filters the picker for the
     same reason, and a retired entry they *do* hold still renders above. */
  const unearned = catalogue.filter((entry) => entry.active && !holdings.has(entry.id));

  /* Absolute, because the point of the button is what a practitioner pastes
     into an application. The origin lives in `site.ts` with the rest of the
     site-wide facts rather than being spelled out here. */
  const shareUrl = `${site.origin}${profilePath(person)}`;

  /* Confirm after the fact, not before it. `navigator.clipboard` is undefined
     on any non-secure origin — a dev server reached over a LAN address rather
     than localhost — and where it does exist `writeText` rejects on a denied
     permission or an unfocused document. Optional chaining and a discarded
     promise both used to reach `setCopied(true)` regardless, so the button
     claimed a copy that had not happened. Pasting a profile link into an
     application is the reason this route exists, which makes that the one lie
     it cannot afford. */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Leave the label alone — nothing was copied, and the URL is in the
         address bar for anyone who needs it. */
    }
  };

  return (
    /* A white card, because `bg-page` is a warm off-white and body copy at
       `text-t-muted` on it reads as grey on grey. */
    <article className="mx-auto max-w-3xl rounded-card bg-surface p-8 md:p-12">
      <div className="flex flex-wrap items-center gap-3">
        {badged ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-t-invert">
            ✓ Verified by Bluehex
          </p>
        ) : (
          <p className="inline-flex items-center rounded-full border border-stroke px-4 py-1.5 text-sm font-medium text-t-muted">
            Self-listed
          </p>
        )}

        <button
          type="button"
          onClick={copy}
          className="text-xs text-t-faint underline underline-offset-4 hover:text-t-bright"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>

      <h1 className="display-2 mt-6 break-words">{person.name}</h1>
      {person.headline ? (
        <p className="mt-3 text-xl text-t-muted">{person.headline}</p>
      ) : null}
      {person.location ? <p className="mt-1.5 text-sm text-t-faint">{person.location}</p> : null}

      {person.bio ? (
        <p className="mt-8 max-w-2xl leading-relaxed text-t-muted">{person.bio}</p>
      ) : null}

      <div className="mt-9 border-t border-stroke pt-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xs font-medium tracking-wide text-t-faint uppercase">
            Credentials
          </h2>
          <p className="text-xs text-t-faint">
            {badged
              ? "Opened and read by a human at Bluehex"
              : "Not all of these have been checked"}
          </p>
        </div>

        {/* The rest of the catalogue is behind a control and never the default.
            The page opens on what this person holds, because that is what they
            are being read for — two dozen unearned entries above the fold would
            bury the three that are the point of the page.

            No count on any of these labels, deliberately. "1 of 23" is the
            progress figure, and it reads as encouragement to its owner in the
            editor and as four percent to an employer here. Opening the list is
            the visitor's choice; being handed the ratio is not. */}
        {unearned.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span id={viewLabelId} className="sr-only">
              Which credentials to show
            </span>
            <div
              role="group"
              aria-labelledby={viewLabelId}
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  ["earned", "Earned"],
                  ["unearned", "Not earned"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  aria-pressed={view === value}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    view === value
                      ? "border-ink bg-ink text-t-invert"
                      : "border-stroke text-t-muted hover:border-stroke-strong hover:text-t-bright"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {view === "unearned" ? null : (
          <ul className="mt-6 flex flex-col gap-5">
            {person.credentials.map((credential) => (
              <li key={credential.entry.id} className="flex items-start gap-3">
                <CredentialMark credential={credential} />
                <div className="min-w-0">
                  <p className="break-words">{credential.entry.label}</p>
                  <p className="mt-0.5 text-sm text-t-faint">
                    {credential.entry.source} · {earnedLabel(credential)}
                  </p>
                  {credential.evidenceUrl ? (
                    <a
                      href={credential.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-block text-sm underline underline-offset-4"
                    >
                      See the certificate
                    </a>
                  ) : (
                    /* One branch, not two. It used to also say "Nothing to show
                       yet" for a credential nobody had earned; every credential
                       is earned now, so an absent link means the holder kept the
                       certificate private — which is their call and not a gap. */
                    <p className="mt-1.5 text-sm text-t-faint italic">Certificate not published.</p>
                  )}
                </div>
              </li>
            ))}
            {person.credentials.length === 0 ? (
              <li className="text-sm text-t-faint">
                No credentials listed — here to be findable, not to be certified.
              </li>
            ) : null}
          </ul>
        )}

        {view === "earned" || unearned.length === 0 ? null : (
          <div className="mt-7">
            <h3 className="text-xs font-medium tracking-wide text-t-faint uppercase">
              Not earned
            </h3>
            {/* Said once, plainly, and it is the reason this list is safe to
                show at all. The catalogue belongs to Bluehex and describes the
                world; the absence of a row describes this profile and nothing
                about this person's plans. Without this sentence a reader
                supplies their own — and the one they supply is "in progress". */}
            <p className="mt-2 max-w-prose text-sm text-t-faint">
              The rest of the catalogue Bluehex keeps. It says what is not on{" "}
              {person.name.split(" ")[0]}&apos;s record, and nothing about what they are
              studying or intend to take — nobody here would know that.
            </p>
            <ul className="mt-5 flex flex-col gap-2">
              {unearned.map((entry) => (
                <li key={entry.id} className="text-sm text-t-muted">
                  {entry.label}
                  <span className="ml-2 text-xs text-t-faint">{entry.source}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {person.focus.length > 0 ? (
        <div className="mt-8 flex flex-wrap gap-2 border-t border-stroke pt-7">
          {person.focus.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
      ) : null}

      {/* The id, not the name — see the comment in `contact/page.tsx`, which
          resolves it back to a name against the same roster this page was
          resolved from. */}
      <a
        href={`/contact?about=${encodeURIComponent(person.id)}`}
        className="mt-9 inline-flex h-13 items-center justify-center rounded-full bg-ink px-7 font-medium text-t-invert transition-colors hover:bg-ink-tint"
      >
        Enquire about {person.name.split(" ")[0]}
      </a>
    </article>
  );
}
