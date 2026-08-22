"use client";

/**
 * The directory row, drawn from the draft. **The preview is the mechanism, not
 * decoration.**
 *
 * What it demonstrates cannot be said as well in a sentence. On the Contact
 * step you type an email address and *this does not move* — which is the
 * model's rule that contact details are never published, shown instead of
 * asserted. Same for an evidence link with its opt-in switched off, and same
 * for `credentials_guard()`: repick a verified credential and its ✓ leaves,
 * while flipping the publish opt-in leaves it alone.
 *
 * The guarantee is structural rather than remembered. This component takes a
 * `Practitioner` — the shape `anon` is granted and nothing else — so there is
 * no `contactEmail` on the object to draw even by accident. The mapping is
 * `previewPractitioner`, and `profile-draft.test.ts` asserts that contact edits
 * leave its output identical.
 *
 * It reuses `CredentialMark` and `earnedLabel` from `@/components/credential-mark`
 * rather than drawing its own marks. That file exists because the roster and the
 * profile page had already disagreed about a date format once, and a preview
 * that drew a third variant would be teaching a practitioner something untrue
 * about how they will appear.
 */

import { CredentialMark, Tick, earnedLabel } from "@/components/credential-mark";
import { Badge } from "@/components/ui";
import { hasVerifiedBadge, type Practitioner } from "@/lib/practitioners";
import type { BluehexControlled } from "@/lib/profile-draft";
import { earnedDateProblem } from "@/lib/profile-validation";

export function RowPreview({
  person,
  controlled,
}: {
  person: Practitioner;
  controlled: BluehexControlled;
}) {
  return (
    <div className="rounded-card bg-surface p-6">
      <div className="flex flex-col gap-5">
        <div className="min-w-0">
          <p className={`font-medium break-words ${person.name === "" ? "text-t-faint italic" : ""}`}>
            {person.name === "" ? "Your name" : person.name}
          </p>
          {person.headline ? (
            <p className="mt-0.5 text-sm break-words text-t-muted">{person.headline}</p>
          ) : null}
          {person.location ? (
            <p className="mt-1.5 text-xs break-words text-t-faint">{person.location}</p>
          ) : null}
        </div>

        <div className="min-w-0">
          {hasVerifiedBadge(person.credentials) ? (
            <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-t-invert">
              <Tick className="size-2.5" />
              Verified by Bluehex
            </p>
          ) : null}

          {person.credentials.length === 0 ? (
            <p className="text-sm text-t-faint">No credentials listed.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {person.credentials.map((credential) => (
                <li key={credential.entry.id} className="flex items-start gap-2 text-sm">
                  <CredentialMark credential={credential} />
                  <span className="min-w-0">
                    <span className="break-words text-t-medium">{credential.entry.label}</span>
                    {/* A date that has not been filled in yet, or one the form
                        is about to refuse, has nothing to print — and
                        `earnedLabel` would print "Invalid Date" rather than
                        nothing. It is a state of the form; the field says what
                        is wrong with it. */}
                    {earnedDateProblem(credential.earnedAt) === null ? (
                      <span className="ml-2 text-xs whitespace-nowrap text-t-faint">
                        {earnedLabel(credential)}
                      </span>
                    ) : null}
                    {/* Present only once the opt-in is on: `evidenceUrl` here is
                        the generated `evidence_url_public` column, which is null
                        unless `evidence_public` is true. Not a link — the
                        preview is a drawing of a row, and a live `href` to a
                        certificate is not something to open from inside a form. */}
                    {credential.evidenceUrl ? (
                      <span className="ml-2 text-xs text-t-muted underline decoration-stroke underline-offset-4">
                        Certificate
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Services, matching the real row — the roster's third column is what
            you can be hired for, and `focus` is on the profile page. A preview
            that drew the wrong column would teach the wrong thing about which
            answer the directory uses. */}
        {person.services.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {person.services.map((item) => (
              <Badge key={item}>{item}</Badge>
            ))}
          </div>
        ) : null}

        {/* `View profile`, matching the real row, and deliberately not a link:
            a draft has no row and therefore no URL. One call to action per
            surface — the directory's job is to get you to a profile, the
            profile's job is to get you to enquire. */}
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-fit items-center rounded-full border border-stroke-strong px-4 text-sm font-medium text-t-faint"
        >
          View profile
        </span>
      </div>

      <p className="mt-5 border-t border-stroke pt-4 text-xs text-t-muted">
        {controlled.status === "approved"
          ? "Live in the directory."
          : "Not in the directory yet — waiting on Bluehex."}
      </p>
    </div>
  );
}
