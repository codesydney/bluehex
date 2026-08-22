"use client";

/**
 * The profile editor: a stepped form with the live preview alongside it
 * throughout. Decided 2026-08-15, from two of the three shapes that were drawn
 * — neither was right on its own and each fixes the other's main weakness.
 *
 * **The steps are for the first-timer.** Publishing a profile means handing
 * credentials to a stranger to be checked, and one long form asks for all of
 * that at once with no account of what is about to happen to it. Pacing it buys
 * the *What happens next* step, which is the only place in the flow where the
 * two Bluehex-owned axes can be explained at the moment they become true.
 *
 * **The preview stops the pacing from hiding the whole.** A wizard's usual
 * failure is that you never see the thing you are making until you have
 * finished making it. Here it is on screen from the first keystroke, and the
 * step nav is free rather than a track, so nothing traps you.
 *
 * The single long form was the better shape for *editing* — coming back to fix
 * a typo wants the field, not a journey — and that is the known loss. If
 * editing an existing profile turns out to be awkward in steps it should become
 * a flat form reusing these same field components, with the stepped version
 * kept for first submission. Worth deciding when there is a real profile to
 * edit.
 *
 * Note what is absent: nothing here sets `verified` or `status`. Both are shown
 * read-only on the last step, because this is the only place a practitioner
 * ever learns who decides, and a form that merely *omitted* them would leave
 * people assuming the fields were coming later.
 */

import { useEffect, useRef, useState } from "react";
import type { CatalogueEntry } from "@/lib/practitioners";
import {
  badgeState,
  catalogueProgress,
  claimedCredentials,
  newCredential,
  pickableEntries,
  previewPractitioner,
  statusCopy,
  toWritePayload,
  type BluehexControlled,
  type ProfileDraft,
} from "@/lib/profile-draft";
import { submitProfile, type SaveResult } from "@/lib/profile-save";
import { errorFor, stepForField, validateDraft } from "@/lib/profile-validation";
import { CredentialFields } from "./credential-fields";
import {
  CountrySelect,
  Field,
  FocusPicker,
  ServicesPicker,
  TextArea,
  TextInput,
} from "./fields";
import { RowPreview } from "./row-preview";

/** The order the steps are in. `stepForField` indexes into this. */
const steps = ["You", "Credentials", "Contact", "Review"] as const;

export function ProfileForm({
  draft,
  onChange,
  controlled,
  catalogue,
}: {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  controlled: BluehexControlled;
  catalogue: CatalogueEntry[];
}) {
  const [step, setStep] = useState(0);
  /* Errors exist from the first render and are shown only once somebody has
     asked for the form to be checked. Validating as you type turns a field you
     have not finished filling in into a mistake you have already made. */
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLOListElement>(null);
  /* Nothing has moved on the first render, so nothing should take focus from
     wherever the page put it. */
  const navigated = useRef(false);

  const errors = validateDraft(draft);
  const shown = checked ? errors : [];
  const error = (field: string) => errorFor(shown, field);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const goTo = (next: number) => {
    navigated.current = true;
    setStep(next);
  };

  /* Moving to a step moves focus to its heading. Without this a keyboard or
     screen-reader user presses Next and stays where they were: the panel below
     has been replaced and nothing said so, and the next Tab continues from the
     old position. The heading is `tabIndex={-1}` so it takes focus
     programmatically without joining the tab order. */
  useEffect(() => {
    if (!navigated.current) return;
    headingRef.current?.focus();
  }, [step]);

  /* A failed check moves focus to the summary instead, because the summary is
     what says why nothing happened. Keyed on the attempt count rather than on
     the error list, so pressing the button twice with the same errors moves
     focus twice — the second press should not feel like nothing. */
  useEffect(() => {
    if (attempts === 0) return;
    summaryRef.current?.focus();
  }, [attempts]);

  const badge = badgeState(draft, controlled);
  const person = previewPractitioner(draft, controlled, catalogue);

  async function check() {
    setChecked(true);
    setResult(null);

    if (errors.length > 0) {
      /* Take them to the first thing that needs them rather than announcing a
         problem three steps away. `navigated` is cleared so the step change
         below does not pull focus off the summary and onto a heading. */
      navigated.current = false;
      setStep(stepForField(errors[0].field));
      setAttempts((count) => count + 1);
      return;
    }

    setPending(true);
    try {
      setResult(await submitProfile(toWritePayload(draft)));
    } catch {
      /* The seam cannot throw today and the real one will. Handling it here
         rather than when it starts happening is the difference between an error
         message and an unhandled rejection in somebody's console. */
      setResult({
        ok: false,
        message: "Something went wrong on the way to Bluehex. Nothing was saved — try again.",
      });
    } finally {
      setPending(false);
    }
  }

  /* Arrow keys move between steps, which is what a screen reader user expects
     of a list of buttons that navigates. Home and End go to the ends. The
     buttons carry a roving `tabIndex`, so Tab passes the whole nav in one
     press rather than in four. */
  function onNavKeyDown(event: React.KeyboardEvent<HTMLOListElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: step - 1,
      ArrowRight: step + 1,
      Home: 0,
      End: steps.length - 1,
    };

    const next = moves[event.key];
    if (next === undefined || next < 0 || next > steps.length - 1) return;

    event.preventDefault();
    /* Focus stays on the nav, moving to the button that was arrowed to — so
       `navigated` is cleared rather than set, or the effect above would pull
       focus onto the heading and end the arrow-key sequence after one press. */
    navigated.current = false;
    setStep(next);
    navRef.current?.querySelectorAll("button")[next]?.focus();
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:gap-16">
      {/* The preview, present on every step ------------------------------
          First in the document and second in the grid past `lg`. On a phone
          that puts it above the fields, where it can be seen while they are
          being filled in — which is the whole reason it exists, and it would be
          a screen away at the bottom of the page otherwise. */}
      <section
        aria-labelledby="preview-heading"
        className="lg:order-2 lg:sticky lg:top-28 lg:self-start"
      >
        <h2 id="preview-heading" className="text-xs font-medium tracking-wide text-t-faint uppercase">
          How you will appear
        </h2>
        <div className="mt-3">
          <RowPreview person={person} controlled={controlled} />
        </div>
        <p className="mt-4 text-xs text-t-muted">
          Your email, phone and note never appear here — there is nowhere on this row for
          them. Neither does a certificate link unless you switch its opt-in on.
        </p>
      </section>

      <div className="lg:order-1">
        {/* What needs doing, across every step. Above the nav rather than
            inside a panel, because the problems it lists are not all on the
            step being looked at. */}
        {checked && shown.length > 0 ? (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            className="mb-8 rounded-card border border-danger/30 bg-surface p-5"
          >
            <p className="text-sm font-medium">
              {shown.length === 1 ? "One thing needs you" : `${shown.length} things need you`} before
              this can be submitted.
            </p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {shown.map((item) => (
                <li key={`${item.field}-${item.message}`} className="text-xs text-t-muted">
                  <span className="font-medium text-t-bright">
                    {steps[stepForField(item.field)]}
                  </span>{" "}
                  — {item.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Steps are clickable and in no required order. A wizard that traps you
            is worse than no wizard, and nothing here has to be done first. */}
        <nav aria-label="Profile sections">
          <ol ref={navRef} onKeyDown={onNavKeyDown} className="flex flex-wrap items-center gap-1.5">
            {steps.map((label, index) => (
              <li key={label} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={index === step ? "step" : undefined}
                  tabIndex={index === step ? 0 : -1}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    index === step
                      ? "bg-ink text-t-invert"
                      : "text-t-muted hover:bg-surface hover:text-t-bright"
                  }`}
                >
                  <span aria-hidden="true" className="mr-1.5 text-xs opacity-60">
                    {index + 1}
                  </span>
                  {label}
                  <span className="sr-only">
                    , step {index + 1} of {steps.length}
                  </span>
                </button>
                {index < steps.length - 1 ? (
                  <span aria-hidden="true" className="text-t-faint">
                    ·
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10">
          {step === 0 ? (
            <StepPanel headingRef={headingRef} title="Who you are" note="All of this is public.">
              <Field label="Name" error={error("name")}>
                {(control) => (
                  <TextInput
                    {...control}
                    value={draft.name}
                    onChange={(value) => set("name", value)}
                  />
                )}
              </Field>

              <Field label="Headline" hint="One line. What you do." optional>
                {(control) => (
                  <TextInput
                    {...control}
                    value={draft.headline}
                    onChange={(value) => set("headline", value)}
                    placeholder="e.g. Staff engineer, agent platforms"
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Where you are" hint="However specific you like." optional>
                  {(control) => (
                    <TextInput
                      {...control}
                      value={draft.location}
                      onChange={(value) => set("location", value)}
                    />
                  )}
                </Field>
                <Field
                  label="Country"
                  hint="Drives the location filter."
                  error={error("countryCode")}
                  optional
                >
                  {(control) => (
                    <CountrySelect
                      {...control}
                      value={draft.countryCode}
                      onChange={(value) => set("countryCode", value)}
                    />
                  )}
                </Field>
              </div>

              <Field
                label="About you"
                hint="Searchable, but the directory row does not print it."
                optional
              >
                {(control) => (
                  <TextArea
                    {...control}
                    value={draft.bio}
                    onChange={(value) => set("bio", value)}
                  />
                )}
              </Field>

              {/* Services before focus, because it is the more consequential
                  answer: it is what a visitor filters the roster by, and focus
                  is read afterwards on the profile page. The order of two
                  adjacent pickers is the cheapest way to say which one
                  matters. */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">What you can be hired for</span>
                <ServicesPicker
                  value={draft.services}
                  onChange={(value) => set("services", value)}
                  error={error("services")}
                />
                <p className="text-xs text-t-muted">
                  This is what the directory filters on — it is the question a visitor
                  arrives with. Self-described, and the Verified badge does not cover it: it
                  attests to credentials a human checked, never to an offer of work.
                </p>
              </div>

              <Field
                label="Availability"
                hint="A sentence, not a calendar. “Evenings and weekends”, “booked until March”. Nobody browses by this — it is read once, by someone who has already decided they are interested."
                optional
              >
                {(control) => (
                  <TextInput
                    {...control}
                    value={draft.availability}
                    onChange={(value) => set("availability", value)}
                    placeholder="e.g. Evenings and weekends"
                  />
                )}
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">What you know</span>
                <FocusPicker value={draft.focus} onChange={(value) => set("focus", value)} />
                <p className="text-xs text-t-muted">
                  Shown on your profile page rather than on the directory row. Knowing RAG
                  does not tell somebody whether they can hire you for an afternoon, which is
                  why the filters ask the question above instead. Self-described, and outside
                  what the badge attests to.
                </p>
              </div>

              {/* Links are public and belong on this step, not on Contact. That
                  is not tidiness: the Contact step's whole demonstration is that
                  you type an address and the preview does not move, and a
                  published link on the same panel would contradict it. The test
                  the model applies is a route to a *page* against a route to a
                  *person* — so the two live one step apart and each says which
                  it is holding. */}
              <div className="flex flex-col gap-4 border-t border-stroke pt-5">
                <div>
                  <p className="text-sm font-medium">Where to find you</p>
                  <p className="mt-1 text-xs text-t-muted">
                    All four are published on your profile. They are links to pages rather
                    than ways of reaching you personally, which is exactly why they can be
                    public while your email address on the Contact step cannot.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Website" error={error("websiteUrl")} optional>
                    {(control) => (
                      <TextInput
                        {...control}
                        type="url"
                        value={draft.websiteUrl}
                        onChange={(value) => set("websiteUrl", value)}
                        placeholder="https://"
                      />
                    )}
                  </Field>
                  <Field label="GitHub" error={error("githubUrl")} optional>
                    {(control) => (
                      <TextInput
                        {...control}
                        type="url"
                        value={draft.githubUrl}
                        onChange={(value) => set("githubUrl", value)}
                        placeholder="https://github.com/…"
                      />
                    )}
                  </Field>
                  <Field label="LinkedIn" error={error("linkedinUrl")} optional>
                    {(control) => (
                      <TextInput
                        {...control}
                        type="url"
                        value={draft.linkedinUrl}
                        onChange={(value) => set("linkedinUrl", value)}
                        placeholder="https://www.linkedin.com/in/…"
                      />
                    )}
                  </Field>
                  <Field
                    label="Booking page"
                    hint="If you have one, this is how somebody reaches you without Bluehex in the way."
                    error={error("bookingUrl")}
                    optional
                  >
                    {(control) => (
                      <TextInput
                        {...control}
                        type="url"
                        value={draft.bookingUrl}
                        onChange={(value) => set("bookingUrl", value)}
                        placeholder="https://"
                      />
                    )}
                  </Field>
                </div>

                <p className="text-xs text-t-muted">
                  Editing any of these never affects your badge. A repository looks like
                  evidence of work; it is not evidence <em>Bluehex checked</em>, which is the
                  only thing the badge claims.
                </p>
              </div>
            </StepPanel>
          ) : null}

          {step === 1 ? (
            <StepPanel
              headingRef={headingRef}
              title="Your credentials"
              note="Claude Certifications and Anthropic Academy courses, picked from the list Bluehex keeps. Only what you have finished — there is nothing to enter for a course you have not completed, and the catalogue below shows where you are without you having to claim anything."
            >
              <Progress draft={draft} catalogue={catalogue} />

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
                      <span className="sr-only"> credential {index + 1}</span>
                    </button>
                  </div>
                  <CredentialFields
                    credential={credential}
                    catalogue={catalogue}
                    verified={Boolean(controlled.verified[credential.key])}
                    errors={shown}
                    /* `unique (practitioner_id, catalogue_id)` — you cannot claim
                       the same credential twice, so the picker greys out what is
                       already on the profile rather than letting the insert be
                       refused after the fact. */
                    taken={draft.credentials
                      .map((item) => item.catalogueId)
                      .filter((id) => id !== "")}
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
              headingRef={headingRef}
              title="How Bluehex reaches you"
              note="None of this is published — unlike the links on the first step, which are. The difference is what they reach: a page can be public, a person's address cannot. Enquiries come through Bluehex rather than going to you directly, so your address never appears on your profile — watch the preview as you type and you will see it does not move."
            >
              <Field
                label="Email"
                hint="Where work enquiries should go. Can differ from the address you sign in with."
                error={error("contactEmail")}
              >
                {(control) => (
                  <TextInput
                    {...control}
                    type="email"
                    value={draft.contactEmail}
                    onChange={(value) => set("contactEmail", value)}
                  />
                )}
              </Field>
              <Field label="Phone" optional>
                {(control) => (
                  <TextInput
                    {...control}
                    type="tel"
                    value={draft.contactPhone}
                    onChange={(value) => set("contactPhone", value)}
                  />
                )}
              </Field>
              <Field label="Anything we should know" optional>
                {(control) => (
                  <TextArea
                    {...control}
                    rows={2}
                    value={draft.contactNote}
                    onChange={(value) => set("contactNote", value)}
                  />
                )}
              </Field>
            </StepPanel>
          ) : null}

          {step === 3 ? (
            <StepPanel headingRef={headingRef} title="What happens next">
              {/* The reason the stepped shape was chosen. Two independent things
                  happen to a submitted profile and they are easy to conflate. */}
              <ol className="flex flex-col gap-5">
                <ReviewStep n={1} title="Bluehex checks it is a real person">
                  Someone reads the profile and approves it. That is what puts it in the
                  directory — it does not mean anything has been vouched for, and a published
                  profile with no badge is the normal case rather than a half-finished one.
                </ReviewStep>
                <ReviewStep n={2} title="Bluehex checks each credential, one at a time">
                  Each one gets opened and read against the name on it. The Verified badge
                  appears once every credential on your profile has been checked — so adding a
                  fourth later leaves the first three checked and waits on the new one, rather
                  than dropping the badge until somebody re-reads all four.
                </ReviewStep>
                <ReviewStep n={3} title="You can edit any time">
                  Editing does not send it back to the queue. Changing what a credential
                  claims — which credential it is, when you earned it, or its certificate
                  link — clears that credential&apos;s check until Bluehex looks again, and you
                  can watch the ✓ leave the preview as you change it. Switching the
                  certificate link&apos;s publish opt-in does not, because that changes who can
                  see the claim rather than the claim. Neither do your bio, your focus areas,
                  what you offer or your links, which the badge never covered.
                </ReviewStep>
              </ol>

              <BluehexDecides badge={badge} controlled={controlled} />
            </StepPanel>
          ) : null}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-stroke pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
              className="inline-flex h-12 items-center rounded-full border border-stroke-strong px-6 font-medium transition-colors hover:bg-ink hover:text-t-invert disabled:cursor-not-allowed disabled:border-stroke disabled:text-t-faint disabled:hover:bg-transparent disabled:hover:text-t-faint"
            >
              Back
            </button>

            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => goTo(step + 1)}
                className="inline-flex h-12 items-center rounded-full bg-ink px-6 font-medium text-t-invert transition-colors hover:bg-ink-tint"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={check}
                disabled={pending}
                aria-busy={pending || undefined}
                className="inline-flex h-12 items-center rounded-full bg-ink px-6 font-medium text-t-invert transition-colors hover:bg-ink-tint disabled:cursor-progress disabled:opacity-70"
              >
                {pending ? "Checking…" : "Submit for review"}
              </button>
            )}
          </div>

          {/* The seam. It is not a spinner that resolves into a success — see
              `profile-save.ts` — and it says which of the two it is rather than
              leaving somebody to wonder whether their profile went anywhere. */}
          {result && !result.ok ? (
            <p role="alert" className="max-w-xl rounded-tight bg-surface p-4 text-sm text-t-muted">
              {result.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Progress against the whole catalogue — what replaced the in-progress
 * credential.
 *
 * The premise it rests on is that the catalogue is a known set Bluehex wrote,
 * so showing somebody the entries they do not hold requires no assertion *from*
 * them. There is nothing to type and therefore nothing to be unfalsifiable
 * about: an entry you have not earned is an entry you have not earned.
 *
 * **The wording is the load-bearing part of this component and it is not a
 * matter of taste.** The argument that deleted in-progress rows was that
 * "working towards" is an unfalsifiable claim nobody can check. A heading
 * saying *In progress* over the unearned half of the catalogue makes exactly
 * that claim automatically, on the practitioner's behalf, for every credential
 * they have never opened — which is strictly worse than the rows that were
 * removed, because those were at least opt-in. **Earned** and **Not earned**
 * describe the record. "In progress", "Working towards", "Studying" and "Up
 * next" describe a person's intent, and none of them may appear here however
 * naturally they come.
 *
 * **This is the editor and only the editor.** "2 of 24" reads as encouragement
 * to its owner and as eight percent to an employer, so the public surfaces show
 * what somebody holds and never what they lack. The list is folded away rather
 * than laid out, because the step's job is entering credentials: expanded,
 * two dozen rows of mostly "not earned" is the same discouraging reading the
 * public page is being spared, delivered to the one person it is meant to
 * encourage.
 */
function Progress({ draft, catalogue }: { draft: ProfileDraft; catalogue: CatalogueEntry[] }) {
  const { held, total } = catalogueProgress(draft, catalogue);
  /* Built from `claimedCredentials` rather than from the raw list, so the tick
     in this checklist and the figure above it answer the same question. A row
     with a credential picked and no date yet is a state of the form. */
  const holdings = new Set(claimedCredentials(draft).map((credential) => credential.catalogueId));

  return (
    <div className="rounded-card bg-surface p-5">
      <p className="text-sm">
        <strong className="font-medium">
          {held} of {total}
        </strong>{" "}
        Claude credentials{held === 0 ? " so far" : ""}.
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-t-muted">See the whole catalogue</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          {pickableEntries(catalogue).map((item) => {
            const has = holdings.has(item.id);
            return (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full ${
                    has ? "bg-ink text-t-invert" : "border border-stroke"
                  }`}
                >
                  {has ? <span className="text-[8px]">✓</span> : null}
                </span>
                <span className={has ? "" : "text-t-muted"}>
                  {item.label}
                  <span className="sr-only">{has ? " — earned" : " — not earned"}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-t-muted">
          Earned and not earned, and nothing else — not earned is the absence of a
          certificate, never a claim that you are working on one. Nobody but you sees this
          list against your name: your profile shows what you hold. Bluehex keeps the list;
          ask if something is missing.
        </p>
      </details>
    </div>
  );
}

/**
 * The two axes the practitioner does not own, rendered read-only.
 *
 * **Shown rather than omitted, which is the whole point.** A form that simply
 * left `status` and `verified` out would leave people assuming the fields were
 * coming later, or worse, that something they typed set them. This is the only
 * place in the product where a practitioner learns who decides.
 */
function BluehexDecides({
  badge,
  controlled,
}: {
  badge: ReturnType<typeof badgeState>;
  controlled: BluehexControlled;
}) {
  const status = statusCopy[controlled.status].axis;

  return (
    <div className="rounded-card bg-surface p-6">
      <h3 className="text-sm font-medium">What Bluehex decides, and this form does not</h3>

      <dl className="mt-4 flex flex-col gap-4">
        <div>
          <dt className="text-xs font-medium tracking-wide text-t-faint uppercase">
            Status · set by Bluehex
          </dt>
          <dd className="mt-1 text-sm">
            {status}.{" "}
            <span className="text-t-muted">
              Whether your profile is in the directory. Nothing on this form sets it.
            </span>
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium tracking-wide text-t-faint uppercase">
            Verified · set by Bluehex, per credential
          </dt>
          {/* Three counts, not two. This step's job is saying who decides what,
              and "waiting on Bluehex" over a credential with no certificate link
              names the wrong party — nobody at Bluehex can move it and the
              practitioner can, with one field. `badge.held` rather than the row
              count, so an added-and-untouched credential does not appear in a
              sentence beginning "Submitting". */}
          <dd className="mt-1 text-sm">
            <strong className="font-medium">Submitting {badge.held}</strong>{" "}
            {badge.held === 1 ? "credential" : "credentials"} — {badge.verified} already
            checked, {badge.awaitingCheck} waiting on Bluehex, {badge.awaitingProof} waiting
            on you.
            {badge.awaitingProof > 0 ? (
              <span className="mt-1.5 block text-t-muted">
                Waiting on you means the certificate link is missing. Bluehex cannot check a
                credential it has no proof of, so that one is yours to move.
              </span>
            ) : null}
            <span className="mt-1.5 block text-t-muted">
              The badge shows when every credential on the profile has been checked. You do
              not set it and neither does anything on this form — only Bluehex does.
            </span>
          </dd>
        </div>

        {controlled.reviewNote ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-t-faint uppercase">
              Note from Bluehex
            </dt>
            <dd className="mt-1 text-sm text-t-muted">{controlled.reviewNote}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function StepPanel({
  title,
  note,
  headingRef,
  children,
}: {
  title: string;
  note?: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      {/* `tabIndex={-1}` so moving to a step can put focus here without adding a
          heading to the tab order. */}
      <h2 ref={headingRef} tabIndex={-1} className="display-3">
        {title}
      </h2>
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
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-t-invert"
      >
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-t-muted">{children}</p>
      </div>
    </li>
  );
}
