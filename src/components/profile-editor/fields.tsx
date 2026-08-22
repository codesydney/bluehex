"use client";

/**
 * The editor's leaf inputs.
 *
 * Only leaf-level pieces live here and nothing here decides layout: the
 * grouping, ordering and pacing of the fields is the design that was settled,
 * and it lives in `profile-form.tsx`. `CredentialFields` is next door for the
 * same reason — it renders the inputs for one credential and not its container.
 *
 * What every control here shares is `Field`, which owns the three things that
 * are wrong in most hand-rolled forms: a label bound to its control by id, a
 * hint and an error message wired through `aria-describedby` so a screen reader
 * reads both, and `aria-invalid` so it says *which* control is the problem.
 * Doing that once is the reason this file exists.
 */

import { useId } from "react";
import { maxServices, services, type Service } from "@/lib/practitioners";
import { countries, focusSuggestions, servicesFull, toggleService } from "@/lib/profile-draft";

export const inputClasses =
  "w-full rounded-tight border border-stroke bg-surface px-3.5 py-2.5 text-sm text-t-bright outline-ink outline-offset-2 placeholder:text-t-faint focus:outline-2 aria-[invalid=true]:border-danger";

/**
 * What a control needs to be described and announced correctly. Spread it onto
 * the input rather than picking it apart — every property is load-bearing and a
 * missing one is silent.
 */
export type ControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  /** Marked on the field rather than on its neighbours — see `profile-form.tsx`. */
  optional?: boolean;
  children: (control: ControlProps) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-t-faint">Optional</span> : null}
      </label>

      {children({
        id,
        "aria-describedby": describedBy === "" ? undefined : describedBy,
        "aria-invalid": error ? true : undefined,
      })}

      {/* The hint comes before the error, so a reader who has just been told
          what is wrong is not then told what the field is for. */}
      {hint ? (
        <p id={hintId} className="text-xs text-t-muted">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/**
 * One message, announced when it appears.
 *
 * `role="alert"` rather than a bare paragraph: these arrive on submit, and a
 * message that appears with no announcement is invisible to anybody not looking
 * at the field. The arrow is decorative and hidden, because "right arrow" read
 * before every error is noise.
 */
export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-xs text-danger">
      <span aria-hidden="true">↳</span>
      <span>{children}</span>
    </p>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  ...control
}: ControlProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url" | "date";
}) {
  return (
    <input
      {...control}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={inputClasses}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 4,
  placeholder,
  ...control
}: ControlProps & {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      {...control}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClasses} resize-y`}
    />
  );
}

export function CountrySelect({
  value,
  onChange,
  ...control
}: ControlProps & { value: string; onChange: (value: string) => void }) {
  return (
    <select
      {...control}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClasses}
    >
      {/* `""` is the unset option, because a `<select>` has no null. It stops
          being `""` on the way out — see `toWritePayload`. */}
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
 * **The cap is the part that has to be drawn rather than described.** A
 * multi-select everyone maxes out is a filter that narrows nothing, so it is
 * capped at three — and a cap a form does not show is one somebody meets as an
 * error after they have already decided what they wanted. So the count is on
 * screen before it binds, and the options that would exceed it go `disabled`
 * rather than silently refusing a click. `practitioner_services_cap` enforces
 * it again in the database, because a rule enforced only in a form is not a
 * rule.
 */
export function ServicesPicker({
  value,
  onChange,
  error,
}: {
  value: Service[];
  onChange: (value: Service[]) => void;
  error?: string;
}) {
  const countId = useId();
  const errorId = `${countId}-error`;
  /* The cap and the picking rule are `@/lib/profile-draft`'s, so what the
     disabled state shows and what a click would do cannot disagree. */
  const full = servicesFull(value);
  const toggle = (service: Service) => onChange(toggleService(value, service));

  return (
    <div className="flex flex-col gap-2">
      {/* Named, because this control skips `Field` — without it a screen reader
          announces "Code review, toggle button, not pressed" with nothing
          saying what is being toggled. Described by the count, so the cap is
          heard rather than only seen, and by the error when there is one:
          `role="alert"` announces the message once as it appears, and without
          this a reader arriving at the control afterwards — which is what
          happens, since a failed check sends focus to the summary and they
          navigate from there — would hear the count and nothing else.

          No `aria-invalid`: it is not a global attribute and `group` is not
          among the roles that support it, so it would be dropped from the
          accessibility tree while looking like it works. */}
      <div
        role="group"
        aria-label="Services you offer"
        aria-describedby={error ? `${countId} ${errorId}` : countId}
        className="flex flex-wrap gap-1.5"
      >
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

      {/* Polite rather than assertive: the count changes on every pick, and an
          assertive region would interrupt the label of the button just pressed. */}
      <p id={countId} aria-live="polite" className="text-xs text-t-muted">
        {value.length} of {maxServices} picked.{" "}
        {full
          ? "That is the limit — unpick one to choose something else."
          : "Pick the ones somebody could actually hire you for. Leaving it empty is fine."}
      </p>

      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/**
 * `focus` is a `text[]` with no separate taxonomy. Suggestions plus free text,
 * so the common ones cluster without anyone being forced into a list.
 *
 * It does not drive the directory's filters — `services` does — which is what
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
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const toggle = (area: string) =>
    onChange(value.includes(area) ? value.filter((item) => item !== area) : [...value, area]);

  const add = (raw: string) => {
    const entry = raw.trim();
    if (entry === "" || value.includes(entry)) return false;
    onChange([...value, entry]);

    return true;
  };

  const custom = value.filter((item) => !focusSuggestions.includes(item));

  return (
    <div className="flex flex-col gap-3">
      {/* This control skips `Field`, so it carries its own names. Without them a
          screen reader announces "Agents, toggle button, not pressed" with
          nothing saying what is being toggled, and the free text input's only
          name would be its placeholder — which is not exposed as a name
          everywhere and vanishes as soon as anyone types. */}
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
            {area}
            <span aria-hidden="true"> ×</span>
          </button>
        ))}
      </div>

      <input
        id={inputId}
        type="text"
        aria-label="Add a focus area"
        aria-describedby={hintId}
        placeholder="Something else? Type it and press Enter"
        /* Enter adds rather than submits. The form has no `onSubmit` and the
           buttons are all `type="button"`, so nothing would be submitted — but
           relying on that is relying on a fact three files away. */
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (add(event.currentTarget.value)) event.currentTarget.value = "";
        }}
        /* Somebody who types and then clicks away has said what they meant, and
           losing it is the most common complaint about a control like this. */
        onBlur={(event) => {
          if (add(event.currentTarget.value)) event.currentTarget.value = "";
        }}
        className={inputClasses}
      />
      <p id={hintId} className="sr-only">
        Type a focus area and press Enter to add it. Added areas appear as buttons above;
        press one to remove it.
      </p>
    </div>
  );
}
