"use client";

/**
 * One profile.
 *
 * It rendered in two containers for a while — a drawer over the directory on a
 * click, a page on a cold arrival, one component behind both. The drawer was cut
 * along with the route interception that produced it; see NOTES.md for why. What
 * is left is the page, which was always the half that had to work.
 *
 * What is here and not on the roster row: the bio, the earned dates, and the
 * credential sources. Three fields. The page is not justified by that depth —
 * it is justified by having a URL, which is a different argument and the one
 * that actually held.
 */

import { useState } from "react";
import { Badge } from "@/components/ui";
import { hasVerifiedBadge, profilePath, type Practitioner } from "@/lib/practitioners";
import { site } from "@/lib/site";
import { CredentialMark, earnedLabel } from "./credential-mark";

export function ProfileDetail({ person }: { person: Practitioner }) {
  const badged = hasVerifiedBadge(person.credentials);
  const [copied, setCopied] = useState(false);

  /* Absolute, because the point of the button is what a practitioner pastes
     into an application. The origin lives in `site.ts` with the rest of the
     site-wide facts rather than being spelled out here. */
  const shareUrl = `${site.origin}${profilePath(person)}`;

  const copy = () => {
    void navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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

        <ul className="mt-6 flex flex-col gap-5">
          {person.credentials.map((credential) => (
            <li key={`${credential.source}:${credential.label}`} className="flex items-start gap-3">
              <CredentialMark credential={credential} />
              <div className="min-w-0">
                <p className="break-words">{credential.label}</p>
                <p className="mt-0.5 text-sm text-t-faint">
                  {credential.source} · {earnedLabel(credential)}
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
                  <p className="mt-1.5 text-sm text-t-faint italic">
                    {credential.earnedAt ? "Certificate not published." : "Nothing to show yet."}
                  </p>
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
      </div>

      {person.focus.length > 0 ? (
        <div className="mt-8 flex flex-wrap gap-2 border-t border-stroke pt-7">
          {person.focus.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
      ) : null}

      {/* The id, not the name — see the comment in `contact/page.tsx`. The
          banner will not appear from here, because these are fixture people and
          `practitioners` is empty; wiring the fixture into a production lookup
          to make a drawing look complete would be the wrong trade. */}
      <a
        href={`/contact?about=${encodeURIComponent(person.id)}`}
        className="mt-9 inline-flex h-13 items-center justify-center rounded-full bg-ink px-7 font-medium text-t-invert transition-colors hover:bg-ink-tint"
      >
        Enquire about {person.name.split(" ")[0]}
      </a>
    </article>
  );
}
