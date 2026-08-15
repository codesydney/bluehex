"use client";

/**
 * PROTOTYPE — leaf inputs for the editor. Throwaway.
 *
 * Only leaf-level pieces live here, and nothing here decides layout. Three
 * shapes were drawn against these same inputs, disagreeing about structure —
 * how the fields are grouped, ordered and paced — which was the whole question,
 * so structure deliberately lives in `profile-form.tsx` instead.
 * `CredentialFields` renders the inputs for one credential but not its
 * container, for the same reason. Nothing that lost stays on disk; `NOTES.md`
 * records which shape won and what the other two cost.
 */

import { useId } from "react";
import { pickable } from "../catalogue";
import {
  maxServices,
  services,
  type CatalogueEntry,
  type Service,
} from "@/lib/practitioners";
import { countries, focusSuggestions, type DraftCredential } from "./draft";

const inputClasses =
  "w-full rounded-tight border border-stroke bg-surface px-3.5 py-2.5 text-sm text-t-bright outline-ink outline-offset-2 placeholder:text-t-faint focus:outline-2";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-xs text-t-muted">{hint}</p> : null}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={inputClasses}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClasses} resize-y`}
    />
  );
}

export function CountrySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClasses}
    >
      <option value="">Not saying</option>
      {countries.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Services — what a visitor can buy, and the axis the directory filters on.
 *
 * A closed set, because free text does not filter: `1:1 tutoring`,
 * `one-on-one tutoring` and `tutoring` are three chips with one person behind
 * each. Multi-select, because a person genuinely does tutoring *and* code
 * review and forcing one would make the filter lie.
 *
 * **The cap is the part that had to be drawn rather than described.** A
 * multi-select everyone maxes out is a filter that narrows nothing, so the
 * column caps it at three — and a cap the form does not show is a cap somebody
 * meets as an error after they have already decided. So the count is on screen
 * before it binds, and the options that would exceed it go disabled rather than
 * silently refusing a click. The database enforces it again with a
 * `cardinality` check, because a rule enforced only in a form is not a rule.
 */
export function ServicesPicker({
  value,
  onChange,
}: {
  value: Service[];
  onChange: (value: Service[]) => void;
}) {
  const full = value.length >= maxServices;

  const toggle = (service: Service) => {
    if (value.includes(service)) {
      onChange(value.filter((item) => item !== service));
      return;
    }
    if (full) return;
    onChange([...value, service]);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Named, because this control skips `Field` — without it a screen reader
          announces "Code review, toggle button, not pressed" with nothing
          saying what is being toggled. */}
      <div role="group" aria-label="Services you offer" className="flex flex-wrap gap-1.5">
        {services.map((service) => {
          const picked = value.includes(service);
          return (
            <button
              key={service}
              type="button"
              onClick={() => toggle(service)}
              aria-pressed={picked}
              disabled={!picked && full}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                picked
                  ? "border-ink bg-ink text-t-invert"
                  : "border-stroke text-t-muted enabled:hover:border-stroke-strong enabled:hover:text-t-bright disabled:cursor-not-allowed disabled:text-t-faint"
              }`}
            >
              {service}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="text-xs text-t-muted">
        {value.length} of {maxServices} picked.{" "}
        {full
          ? "That is the limit — unpick one to choose something else."
          : "Pick the ones somebody could actually hire you for. Leaving it empty is fine."}
      </p>
    </div>
  );
}

/**
 * `focus` is a `text[]` with no separate taxonomy. Suggestions plus free text,
 * so the common ones cluster without anyone being forced into a list.
 *
 * It no longer drives the directory's filters — `services` does — which is what
 * lets it stay free text without the cost. Nobody filters on it, so
 * `Prompt engineering` and `prompt engineering` being two strings costs
 * nothing, where on the filter axis it would be the whole problem.
 */
export function FocusPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const toggle = (area: string) =>
    onChange(value.includes(area) ? value.filter((item) => item !== area) : [...value, area]);

  const custom = value.filter((item) => !focusSuggestions.includes(item));

  return (
    <div className="flex flex-col gap-3">
      {/* This is the one control that skips `Field`, so it carries its own
          names. Without them a screen reader announces "Agents, toggle button,
          not pressed" with nothing saying what is being toggled, and the free
          text input's only name would be its placeholder — which is not exposed
          as a name everywhere and vanishes as soon as anyone types. */}
      <div role="group" aria-label="Focus areas" className="flex flex-wrap gap-1.5">
        {focusSuggestions.map((area) => (
          <button
            key={area}
            type="button"
            onClick={() => toggle(area)}
            aria-pressed={value.includes(area)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              value.includes(area)
                ? "border-ink bg-ink text-t-invert"
                : "border-stroke text-t-muted hover:border-stroke-strong hover:text-t-bright"
            }`}
          >
            {area}
          </button>
        ))}
        {custom.map((area) => (
          <button
            key={area}
            type="button"
            onClick={() => toggle(area)}
            aria-pressed
            className="rounded-full border border-ink bg-ink px-3 py-1 text-xs font-medium text-t-invert"
          >
            {area} ×
          </button>
        ))}
      </div>
      <input
        type="text"
        aria-label="Add a focus area"
        placeholder="Something else? Type it and press Enter"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const entry = event.currentTarget.value.trim();
          if (entry && !value.includes(entry)) onChange([...value, entry]);
          event.currentTarget.value = "";
        }}
        className={inputClasses}
      />
    </div>
  );
}

/**
 * Which credential this is — one select over the catalogue, grouped by source.
 *
 * **One control, not two.** The alternative was a source select feeding a
 * credential select, and it loses on every count that matters here. A
 * practitioner knows what they hold, not which of Bluehex's two buckets it
 * files under, so asking for the source first asks a question about our data
 * model before the one they came to answer — and it re-creates the pairing the
 * catalogue exists to delete, since the second select has to reset whenever the
 * first changes and a stale pair is representable in between. Two dozen entries
 * across two groups is comfortably one `<select>`, and `<optgroup>` shows the
 * weight distinction without making it a separate decision.
 *
 * Two things it does that a text input could not, both of them constraints from
 * the schema rather than manners:
 *
 *   - **Retired entries are not offered.** `pickable()` filters `active`,
 *     which hides a withdrawn course from new claims while leaving it readable
 *     for whoever earned it.
 *   - **A credential already on the profile is disabled**, because
 *     `unique (practitioner_id, catalogue_id)` refuses it. Free-text labels
 *     could never express that: `Prompt engineering` and `Prompt Engineering`
 *     are two different strings.
 */
function CatalogueSelect({
  id,
  value,
  taken,
  onChange,
}: {
  id: string;
  value: string;
  /** Catalogue ids already claimed elsewhere on this profile. */
  taken: string[];
  onChange: (value: string) => void;
}) {
  /* The groups are derived from the sorted list rather than from a separate
     list of sources, so there is one ordering fact instead of two that can
     disagree. `sort_order` decides the order inside a group and, through the
     first entry it yields, between them. */
  const groups = new Map<string, CatalogueEntry[]>();
  for (const item of pickable()) {
    const group = groups.get(item.source);
    if (group) group.push(item);
    else groups.set(item.source, [item]);
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClasses}
    >
      <option value="">Choose a credential…</option>
      {[...groups].map(([source, entries]) => (
        <optgroup key={source} label={source}>
          {entries.map((item) => {
            /* Already on this profile, and not this row's own value —
               `unique (practitioner_id, catalogue_id)` refuses it, so the
               picker says so rather than letting the write fail. */
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

/**
 * The inputs for one credential.
 *
 * Three things here are the spec rather than taste.
 *
 * **You pick a credential and cannot type one.** There is no free text in a
 * credential anywhere in the model, and a select is what that looks like. The
 * "Type" and "What it is called" pair this replaced was the free-text hole:
 * nothing stopped an AWS certification being filed under Anthropic Academy and
 * rendering on the page whose whole job is credibility.
 *
 * **The date is required.** "Still working towards this" is gone with the row
 * it produced — `earned_at` is `not null`, so there is nothing to represent.
 * What replaced it is the progress surface on the Credentials step, which shows
 * the whole catalogue without anybody claiming a course they have not finished.
 *
 * **The evidence URL and its publish opt-in are collected together**, since the
 * opt-in is meaningless without the URL and asking later means asking twice.
 */
export function CredentialFields({
  credential,
  onChange,
  taken,
  verified,
}: {
  credential: DraftCredential;
  onChange: (next: DraftCredential) => void;
  taken: string[];
  verified: boolean;
}) {
  const set = <K extends keyof DraftCredential>(key: K, value: DraftCredential[K]) =>
    onChange({ ...credential, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Which credential"
        hint="Bluehex keeps this list. If something you hold is missing, say so and it gets added — you cannot type one in, which is what stops the list meaning anything anybody likes."
      >
        {(id) => (
          <CatalogueSelect
            id={id}
            value={credential.catalogueId}
            taken={taken}
            onChange={(value) => set("catalogueId", value)}
          />
        )}
      </Field>

      <Field label="Earned on" hint="The day on the certificate.">
        {(id) => (
          <TextInput
            id={id}
            type="date"
            value={credential.earnedAt}
            onChange={(value) => set("earnedAt", value)}
          />
        )}
      </Field>

      <div className="flex flex-col gap-3">
        <Field
          label="Certificate link"
          hint="A Skilljar certificate or share URL. This is what a human at Bluehex opens to check your name against the credential."
        >
          {(id) => (
            <TextInput
              id={id}
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
              visitors can open it too. Worth knowing: the certificate page shows your
              full legal name.
            </span>
          </span>
        </label>
      </div>

      {/* Read-only. The practitioner can see the outcome and never set it.
          The middle branch is the state that in-progress rows used to hide: an
          earned credential with nothing behind it is not a lie and not a
          rejection, it is a profile that can be approved and can never carry
          the badge until a link arrives. It is the one thing on this panel the
          practitioner can act on, so it says so. */}
      <p className="flex items-center gap-2 border-t border-stroke pt-3 text-xs text-t-muted">
        {verified
          ? "✓ Checked by Bluehex."
          : credential.evidenceUrl
            ? "Waiting for Bluehex to check this."
            : "Nothing to check yet — Bluehex needs the certificate link before it can."}
      </p>
    </div>
  );
}
