"use client";

/**
 * One credential's inputs, and the picker that is the whole of "a practitioner
 * cannot type a credential name".
 *
 * Three things here are the schema rather than taste.
 *
 * **You pick a credential and cannot type one.** There is no free text in a
 * credential anywhere in the model — `credential_catalogue` is Bluehex-owned
 * and `insert` on it belongs to `bluehex_admin` alone — and a `<select>` is
 * what that looks like on screen. The "Type" and "What it is called" pair this
 * replaced was the free-text hole: nothing stopped an AWS certification being
 * filed under Anthropic Academy and rendering on the page whose whole job is
 * credibility.
 *
 * **The date is required.** "Still working towards this" is gone with the row
 * it produced — `earned_at` is `not null`, so there is nothing to represent.
 * What replaced it is the progress surface beside these panels, which shows the
 * whole catalogue without anybody claiming a course they have not finished.
 *
 * **The evidence URL and its publish opt-in are collected together**, since the
 * opt-in is meaningless without the URL and asking later means asking twice —
 * and the second ask is the one that does not get answered.
 */

import { pickableEntries, type DraftCredential } from "@/lib/profile-draft";
import { credentialSource, type CatalogueEntry } from "@/lib/practitioners";
import { errorFor, type FieldError } from "@/lib/profile-validation";
import { Field, TextInput, inputClasses, type ControlProps } from "./fields";

/**
 * Which credential this is — one select over the catalogue, grouped by weight.
 *
 * **One control, not two.** The alternative was a source select feeding a
 * credential select, and it loses on every count that matters. A practitioner
 * knows what they hold, not which of Bluehex's buckets it files under, so
 * asking for the source first asks a question about our data model before the
 * one they came to answer. It also re-creates the pairing the catalogue exists
 * to delete: two selects means a stale pair is representable in between, and
 * the second control has to reset whenever the first moves. One select cannot
 * be in a state that disagrees with itself. Two dozen entries across two groups
 * is comfortably one `<select>`, and `<optgroup>` shows the weight distinction
 * without making it a separate decision. Revisit when the catalogue is long
 * enough that scrolling it is the complaint — a filter box over one list is the
 * next step, not a second select.
 *
 * Two things it does that a text input could not, both constraints from the
 * schema rather than manners:
 *
 *   - **Retired entries are not offered.** `pickableEntries` filters `active`,
 *     which hides a withdrawn course from new claims while leaving it readable
 *     for whoever earned it.
 *   - **A credential already on the profile is disabled**, because
 *     `unique (practitioner_id, catalogue_id)` refuses it. Free-text labels
 *     could never express that: `Prompt engineering` and `Prompt Engineering`
 *     are two different strings.
 */
function CatalogueSelect({
  value,
  taken,
  catalogue,
  onChange,
  ...control
}: ControlProps & {
  value: string;
  /** Catalogue ids already claimed elsewhere on this profile. */
  taken: string[];
  catalogue: CatalogueEntry[];
  onChange: (value: string) => void;
}) {
  /* Groups derived from the sorted list rather than from a separate list of
     sources, so there is one ordering fact instead of two that can disagree.
     The group's own name is `credentialSource`, which is the same string the
     public surfaces print under a credential — the picker and the profile page
     cannot describe the same entry two different ways.
     `sortOrder` decides the order inside a group and, through the first entry
     it yields, between them. */
  const groups = new Map<string, CatalogueEntry[]>();
  for (const item of pickableEntries(catalogue)) {
    const source = credentialSource(item);
    const group = groups.get(source);
    if (group) group.push(item);
    else groups.set(source, [item]);
  }

  return (
    <select
      {...control}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClasses}
    >
      <option value="">Choose a credential…</option>
      {[...groups].map(([source, entries]) => (
        <optgroup key={source} label={source}>
          {entries.map((item) => {
            /* Already on this profile, and not this row's own value —
               `unique (practitioner_id, catalogue_id)` refuses it, so the picker
               says so rather than letting the write fail after the fact. */
            const claimed = item.id !== value && taken.includes(item.id);
            return (
              <option key={item.id} value={item.id} disabled={claimed}>
                {item.label}
                {claimed ? " — already added" : ""}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}

export function CredentialFields({
  credential,
  catalogue,
  onChange,
  taken,
  verified,
  errors,
}: {
  credential: DraftCredential;
  catalogue: CatalogueEntry[];
  onChange: (next: DraftCredential) => void;
  taken: string[];
  verified: boolean;
  errors: FieldError[];
}) {
  const set = <K extends keyof DraftCredential>(key: K, value: DraftCredential[K]) =>
    onChange({ ...credential, [key]: value });

  const error = (field: string) => errorFor(errors, `credentials.${credential.key}.${field}`);

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Which credential"
        hint="Bluehex keeps this list. If something you hold is missing, say so and it gets added — you cannot type one in, which is what stops the list meaning anything anybody likes."
        error={error("catalogueId")}
      >
        {(control) => (
          <CatalogueSelect
            {...control}
            value={credential.catalogueId}
            taken={taken}
            catalogue={catalogue}
            onChange={(value) => set("catalogueId", value)}
          />
        )}
      </Field>

      <Field label="Earned on" hint="The day on the certificate." error={error("earnedAt")}>
        {(control) => (
          <TextInput
            {...control}
            type="date"
            value={credential.earnedAt}
            onChange={(value) => set("earnedAt", value)}
          />
        )}
      </Field>

      <div className="flex flex-col gap-3">
        <Field
          label="Certificate link"
          hint="A Skilljar certificate or share URL, starting with https://. This is what a human at Bluehex opens to check your name against the credential."
          error={error("evidenceUrl")}
        >
          {(control) => (
            <TextInput
              {...control}
              type="url"
              value={credential.evidenceUrl}
              onChange={(value) => set("evidenceUrl", value)}
              placeholder="https://"
            />
          )}
        </Field>

        <label className="flex w-fit items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={credential.evidencePublic}
            onChange={(event) => set("evidencePublic", event.target.checked)}
            className="mt-0.5 size-4 accent-ink"
          />
          <span>
            Show this link on my public profile
            <span className="mt-0.5 block text-xs text-t-muted">
              Off by default. Bluehex checks it either way — this only decides whether
              visitors can open it too, and switching it never affects your badge. Worth
              knowing: the certificate page shows your full legal name.
            </span>
          </span>
        </label>

        {/* Not an error, because it is not wrong — the opt-in with no URL is a
            state somebody can leave a form in and the database will take. It is
            said where the checkbox is rather than on submit, which is the whole
            of the difference between a hint and a refusal. */}
        {credential.evidencePublic && credential.evidenceUrl.trim() === "" ? (
          <p className="text-xs text-t-muted">
            There is no link to publish yet, so this does nothing until you add one.
          </p>
        ) : null}
      </div>

      {/* Read-only. The practitioner sees the outcome and never sets it.
          The middle branch is the state in-progress rows used to hide: an earned
          credential with nothing behind it is not a lie and not a rejection, it
          is a profile that can be approved and can never carry the badge until a
          link arrives. It is the one thing on this panel the practitioner can
          act on, so it says so. */}
      <p className="flex items-center gap-2 border-t border-stroke pt-3 text-xs text-t-muted">
        {verified
          ? "✓ Checked by Bluehex."
          : credential.evidenceUrl.trim() !== ""
            ? "Waiting for Bluehex to check this."
            : "Nothing to check yet — Bluehex needs the certificate link before it can."}
      </p>
    </div>
  );
}
