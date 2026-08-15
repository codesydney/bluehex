"use client";

/**
 * PROTOTYPE — leaf inputs shared by the three editor variants. Throwaway.
 *
 * Only leaf-level pieces live here. The variants disagree about structure —
 * how the fields are grouped, ordered, and paced — which is the whole question,
 * so nothing here decides layout. `CredentialFields` renders the inputs for one
 * credential but not its container, for the same reason.
 */

import { useId } from "react";
import {
  countries,
  focusSuggestions,
  jobFunctions,
  sources,
  type DraftCredential,
} from "./draft";

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
 * Job function. A closed set, unlike `headline` beside it, because "show me the
 * designers" is not answerable against prose. Single-select and nullable — see
 * the note on `ProfileDraft.jobFunction`.
 */
export function JobFunctionSelect({
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
      {jobFunctions.map((jobFunction) => (
        <option key={jobFunction} value={jobFunction}>
          {jobFunction}
        </option>
      ))}
    </select>
  );
}

/**
 * `focus` is a `text[]` with no separate taxonomy — the directory's filters are
 * built from whatever profiles actually claim. Suggestions plus free text, so
 * the common ones cluster without anyone being forced into a list.
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
      <div className="flex flex-wrap gap-1.5">
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
 * The inputs for one credential.
 *
 * Two things here are the spec rather than taste. "Still working towards this"
 * is how `earned_at` becomes null, because a working-towards credential is a
 * real row rather than a missing one — that is how a practitioner appears in
 * the directory before they have finished anything. And the evidence URL and
 * its publish opt-in are collected together, since the opt-in is meaningless
 * without the URL and asking later means asking twice.
 */
export function CredentialFields({
  credential,
  onChange,
  verified,
}: {
  credential: DraftCredential;
  onChange: (next: DraftCredential) => void;
  verified: boolean;
}) {
  const set = <K extends keyof DraftCredential>(key: K, value: DraftCredential[K]) =>
    onChange({ ...credential, [key]: value });

  const inProgress = credential.earnedAt === null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          {(id) => (
            <select
              id={id}
              value={credential.source}
              onChange={(event) =>
                set("source", event.target.value as DraftCredential["source"])
              }
              className={inputClasses}
            >
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="What it is called">
          {(id) => (
            <TextInput
              id={id}
              value={credential.label}
              onChange={(value) => set("label", value)}
              placeholder="e.g. Building with the Claude API"
            />
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex w-fit items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={inProgress}
            onChange={(event) => set("earnedAt", event.target.checked ? null : "2026-08-01")}
            className="size-4 accent-ink"
          />
          Still working towards this
        </label>

        {inProgress ? (
          <p className="text-xs text-t-muted">
            It will show on your profile as in progress. Bluehex cannot check it until it
            is earned, so it does not count for or against the badge.
          </p>
        ) : (
          <Field label="Earned on">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={credential.earnedAt ?? ""}
                onChange={(value) => set("earnedAt", value || null)}
              />
            )}
          </Field>
        )}
      </div>

      {inProgress ? null : (
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
      )}

      {/* Read-only. The practitioner can see the outcome and never set it. */}
      <p className="flex items-center gap-2 border-t border-stroke pt-3 text-xs text-t-muted">
        {inProgress
          ? "Not checkable yet — nothing to check until it is earned."
          : verified
            ? "✓ Checked by Bluehex."
            : "Waiting for Bluehex to check this."}
      </p>
    </div>
  );
}
