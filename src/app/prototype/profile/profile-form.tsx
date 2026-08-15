"use client";

/**
 * The profile editor — the chosen design, and a mock.
 *
 * A combination of two of the three shapes that were drawn: the **stepped
 * form**, with the **live preview** alongside it throughout. Neither was right
 * on its own, and each fixes the other's main weakness.
 *
 * The steps are for the first-timer. Publishing a profile means handing
 * credentials to a stranger to be checked, and a single long form asks for all
 * of that at once with no account of what is about to happen to it. Pacing it
 * buys the "What happens next" step, which is the only place in the whole flow
 * where the two axes can be explained at the moment they become true.
 *
 * The preview is what stops the pacing from hiding the whole. A wizard's usual
 * failure is that you never see the thing you are making until you have
 * finished making it; here it is on screen from the first keystroke, and the
 * step nav is free rather than a track, so nothing traps you.
 *
 * The preview also does something no wording can. On the Contact step you type
 * an email address and **the preview does not move** — which is the model's
 * rule that contact details are never published, demonstrated instead of
 * asserted. Same for an evidence link with its opt-in switched off, and same
 * for the clearing rule: retype a verified credential's label and its ✓ leaves
 * the preview, while flipping the publish opt-in leaves it alone. That last
 * pair is `credentials_guard()`, mocked in `profile-editor.tsx`.
 *
 * Note what is absent: nothing here sets `verified` or `status`. Both are shown
 * read-only, because this is the only place a practitioner ever learns who
 * decides, and a form that merely *omitted* them would leave people assuming
 * the fields were coming later.
 *
 * **This is a drawing, not an implementation.** No validation, no persistence,
 * no auth. Kept so #14 has something to build from. See NOTES.md.
 */

import { useState } from "react";
import {
  badgeState,
  newCredential,
  type BluehexControlled,
  type ProfileDraft,
} from "./draft";
import {
  CountrySelect,
  CredentialFields,
  Field,
  FocusPicker,
  JobFunctionSelect,
  TextArea,
  TextInput,
} from "./fields";

const steps = ["You", "Credentials", "Contact", "Review"] as const;

export function ProfileForm({
  draft,
  onChange,
  controlled,
}: {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  controlled: BluehexControlled;
}) {
  const [step, setStep] = useState(0);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const badge = badgeState(draft, controlled);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
      {/* The form ------------------------------------------------------- */}
      <div>
        {/* Steps are clickable. A wizard that traps you is worse than no
            wizard, and nothing here has to be done in order. */}
        <ol className="flex flex-wrap items-center gap-1.5">
          {steps.map((label, index) => (
            <li key={label} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStep(index)}
                aria-current={index === step ? "step" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  index === step
                    ? "bg-ink text-t-invert"
                    : "text-t-muted hover:bg-surface hover:text-t-bright"
                }`}
              >
                <span className="mr-1.5 text-xs opacity-60">{index + 1}</span>
                {label}
              </button>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="text-t-faint">
                  ·
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-10">
          {step === 0 ? (
            <StepPanel title="Who you are" note="All of this is public.">
              <Field label="Name">
                {(id) => (
                  <TextInput id={id} value={draft.name} onChange={(value) => set("name", value)} />
                )}
              </Field>

              <Field label="Headline" hint="One line. What you do.">
                {(id) => (
                  <TextInput
                    id={id}
                    value={draft.headline}
                    onChange={(value) => set("headline", value)}
                    placeholder="e.g. Staff engineer, agent platforms"
                  />
                )}
              </Field>

              <Field
                label="Job function"
                hint="The kind of work you do, rather than the technology. What someone looking for a designer filters on."
              >
                {(id) => (
                  <JobFunctionSelect
                    id={id}
                    value={draft.jobFunction}
                    onChange={(value) => set("jobFunction", value)}
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Where you are" hint="However specific you like.">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={draft.location}
                      onChange={(value) => set("location", value)}
                    />
                  )}
                </Field>
                <Field label="Country" hint="Drives the location filter.">
                  {(id) => (
                    <CountrySelect
                      id={id}
                      value={draft.countryCode}
                      onChange={(value) => set("countryCode", value)}
                    />
                  )}
                </Field>
              </div>

              <Field label="About you" hint="Searchable, but the directory row does not print it.">
                {(id) => (
                  <TextArea id={id} value={draft.bio} onChange={(value) => set("bio", value)} />
                )}
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Focus areas</span>
                <FocusPicker value={draft.focus} onChange={(value) => set("focus", value)} />
                <p className="text-xs text-t-muted">
                  These drive the directory&apos;s filters. Self-described — the Verified
                  badge does not cover them.
                </p>
              </div>
            </StepPanel>
          ) : null}

          {step === 1 ? (
            <StepPanel
              title="Your credentials"
              note="Claude Certifications and Anthropic Academy certificates. Include what you are working towards — the directory lists both, and in-progress ones never count against you."
            >
              {draft.credentials.map((credential, index) => (
                <div key={credential.key} className="rounded-tight border border-stroke p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-medium tracking-wide text-t-faint uppercase">
                      Credential {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "credentials",
                          draft.credentials.filter((item) => item.key !== credential.key),
                        )
                      }
                      className="text-xs text-t-muted underline underline-offset-4 hover:text-t-bright"
                    >
                      Remove
                    </button>
                  </div>
                  <CredentialFields
                    credential={credential}
                    verified={Boolean(controlled.verified[credential.key])}
                    onChange={(next) =>
                      set(
                        "credentials",
                        draft.credentials.map((item) =>
                          item.key === credential.key ? next : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("credentials", [...draft.credentials, newCredential()])}
                className="w-fit rounded-full border border-stroke-strong px-4 py-2 text-sm font-medium transition-colors hover:bg-ink hover:text-t-invert"
              >
                Add a credential
              </button>
            </StepPanel>
          ) : null}

          {step === 2 ? (
            <StepPanel
              title="How Bluehex reaches you"
              note="None of this is published. Enquiries come through Bluehex rather than going to you directly, so your address never appears on your profile — watch the preview as you type and you will see it does not move."
            >
              <Field label="Email" hint="Where work enquiries should go. Can differ from your login.">
                {(id) => (
                  <TextInput
                    id={id}
                    type="email"
                    value={draft.contactEmail}
                    onChange={(value) => set("contactEmail", value)}
                  />
                )}
              </Field>
              <Field label="Phone" hint="Optional.">
                {(id) => (
                  <TextInput
                    id={id}
                    type="tel"
                    value={draft.contactPhone}
                    onChange={(value) => set("contactPhone", value)}
                  />
                )}
              </Field>
              <Field label="Anything we should know" hint="Optional.">
                {(id) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={draft.contactNote}
                    onChange={(value) => set("contactNote", value)}
                  />
                )}
              </Field>
            </StepPanel>
          ) : null}

          {step === 3 ? (
            <StepPanel title="What happens next">
              {/* The reason the stepped shape was chosen. Two independent things
                  happen to a submitted profile and they are easy to conflate. */}
              <ol className="flex flex-col gap-5">
                <ReviewStep n={1} title="Bluehex checks it is a real person">
                  Someone reads the profile and approves it. That is what puts it in the
                  directory — it does not mean anything has been vouched for, and a
                  published profile with no badge is the normal case rather than a
                  half-finished one.
                </ReviewStep>
                <ReviewStep n={2} title="Bluehex checks each credential, one at a time">
                  Every earned credential gets opened and read against the name on it. The
                  Verified badge appears once every earned credential has been checked.
                  {badge.inProgress > 0 ? (
                    <>
                      {" "}
                      The {badge.inProgress === 1 ? "one" : badge.inProgress} you are working
                      towards {badge.inProgress === 1 ? "does" : "do"} not count either way.
                    </>
                  ) : null}
                </ReviewStep>
                <ReviewStep n={3} title="You can edit any time">
                  Editing does not send it back to the queue. Changing what a credential
                  claims — its type, its name, when you earned it, or its certificate link —
                  clears that credential&apos;s check until Bluehex looks again, and you can
                  watch the ✓ leave the preview as you type. Switching the certificate
                  link&apos;s publish opt-in does not, because that changes who can see the
                  claim rather than the claim. Neither does your bio or focus areas, which
                  the badge never covered.
                </ReviewStep>
              </ol>

              <div className="rounded-card bg-surface p-6">
                <p className="text-sm">
                  <strong className="font-medium">
                    Submitting {draft.credentials.length}
                  </strong>{" "}
                  {draft.credentials.length === 1 ? "credential" : "credentials"} —{" "}
                  {badge.earned} earned, {badge.inProgress} in progress.
                </p>
                <p className="mt-1.5 text-sm text-t-muted">
                  You do not set the badge and neither does anything on this form. Only
                  Bluehex does.
                </p>
              </div>
            </StepPanel>
          ) : null}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-stroke pt-6">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            className="inline-flex h-12 items-center rounded-full border border-stroke-strong px-6 font-medium transition-colors hover:bg-ink hover:text-t-invert disabled:cursor-not-allowed disabled:border-stroke disabled:text-t-faint disabled:hover:bg-transparent disabled:hover:text-t-faint"
          >
            Back
          </button>

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="inline-flex h-12 items-center rounded-full bg-ink px-6 font-medium text-t-invert transition-colors hover:bg-ink-tint"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-12 items-center rounded-full bg-ink px-6 font-medium text-t-invert transition-colors hover:bg-ink-tint"
            >
              Submit for review
            </button>
          )}
        </div>
      </div>

      {/* The preview, present on every step ------------------------------ */}
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-xs font-medium tracking-wide text-t-faint uppercase">
          How you will appear
        </p>
        <RowPreview draft={draft} controlled={controlled} />
      </div>
    </div>
  );
}

function StepPanel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="display-3">{title}</h2>
      {note ? <p className="mt-3 max-w-xl text-sm text-t-muted">{note}</p> : null}
      <div className="mt-8 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function ReviewStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-t-invert">
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-t-muted">{children}</p>
      </div>
    </li>
  );
}

/**
 * The directory roster row, drawn from the draft. Public fields only — which is
 * the point. Nothing from the Contact step reaches this, and an evidence link
 * only appears once its opt-in is on.
 */
function RowPreview({
  draft,
  controlled,
}: {
  draft: ProfileDraft;
  controlled: BluehexControlled;
}) {
  const badge = badgeState(draft, controlled);

  return (
    <>
      <div className="mt-3 rounded-card bg-surface p-6">
        <div className="flex flex-col gap-5">
          <div className="min-w-0">
            <p className="font-medium break-words">{draft.name || "Your name"}</p>
            {draft.headline ? (
              <p className="mt-0.5 text-sm break-words text-t-muted">{draft.headline}</p>
            ) : null}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-t-faint">
              {draft.jobFunction ? (
                <span className="rounded-full border border-stroke px-2 py-0.5">
                  {draft.jobFunction}
                </span>
              ) : null}
              {draft.location ? <span className="break-words">{draft.location}</span> : null}
            </p>
          </div>

          <div className="min-w-0">
            {badge.shows ? (
              <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-t-invert">
                ✓ Bluehex checked these
              </p>
            ) : null}

            {draft.credentials.length === 0 ? (
              <p className="text-sm text-t-faint">No credentials listed.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {draft.credentials.map((credential) => {
                  const verified =
                    Boolean(credential.earnedAt) && Boolean(controlled.verified[credential.key]);
                  return (
                    <li key={credential.key} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full ${
                          verified
                            ? "bg-ink text-t-invert"
                            : credential.earnedAt
                              ? "border border-stroke"
                              : "border border-dashed border-stroke"
                        }`}
                      >
                        {verified ? <span className="text-[8px]">✓</span> : null}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`break-words ${
                            credential.earnedAt ? "text-t-medium" : "text-t-faint italic"
                          }`}
                        >
                          {credential.label || "Untitled credential"}
                        </span>
                        {credential.earnedAt &&
                        credential.evidencePublic &&
                        credential.evidenceUrl ? (
                          <span className="ml-2 text-xs text-t-muted underline decoration-stroke underline-offset-4">
                            Certificate
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {draft.focus.map((item) => (
              <span
                key={item}
                className="rounded-full border border-stroke px-3 py-1 text-xs font-medium text-t-muted"
              >
                {item}
              </span>
            ))}
          </div>

          {/* `View profile`, matching the real row. One call to action per
              surface: the directory's job is to get you to a profile, the
              profile's job is to get you to enquire — see the note above the
              link in `practitioner-directory.tsx`. A preview that draws the
              rejected shape is worse than no preview. */}
          <span className="inline-flex h-9 w-fit items-center rounded-full border border-stroke-strong px-4 text-sm font-medium">
            View profile
          </span>
        </div>

        <p className="mt-5 border-t border-stroke pt-4 text-xs text-t-muted">
          {controlled.status === "approved"
            ? "Live in the directory."
            : "Not in the directory yet — waiting on Bluehex."}
        </p>
      </div>

      <p className="mt-4 text-xs text-t-muted">
        Your email, phone and note never appear here. Neither does a certificate link unless
        you switch its opt-in on.
      </p>
    </>
  );
}
