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
 * for the clearing rule: repick a verified credential and its ✓ leaves the
 * preview, while flipping the publish opt-in leaves it alone. That last pair is
 * `credentials_guard()`, mocked in `profile-editor.tsx`.
 *
 * The published links sit on the first step rather than beside the contact
 * details, and that placement is the model's own test drawn: a route to a page
 * is public, a route to a person is not. Putting them on the Contact step would
 * have broken the demonstration that step exists for.
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
import { catalogueEntry, pickable } from "../catalogue";
import {
  badgeState,
  catalogueProgress,
  newCredential,
  type BluehexControlled,
  type ProfileDraft,
} from "./draft";
import {
  CountrySelect,
  CredentialFields,
  Field,
  FocusPicker,
  ServicesPicker,
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

              {/* Services before focus, because it is the more consequential
                  answer now: it is what a visitor filters the roster by, and
                  focus is read afterwards on the profile page. The order of two
                  adjacent pickers is the cheapest way to say which one
                  matters. */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">What you can be hired for</span>
                <ServicesPicker
                  value={draft.services}
                  onChange={(value) => set("services", value)}
                />
                <p className="text-xs text-t-muted">
                  This is what the directory filters on — it is the question a visitor
                  arrives with. Self-described, and the Verified badge does not cover it:
                  it attests to credentials a human checked, never to an offer of work.
                </p>
              </div>

              <Field
                label="Availability"
                hint="A sentence, not a calendar. “Evenings and weekends”, “booked until March”. Nobody browses by this — it is read once, by someone who has already decided they are interested."
              >
                {(id) => (
                  <TextInput
                    id={id}
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
                  does not tell somebody whether they can hire you for an afternoon, which
                  is why the filters ask the question above instead.
                </p>
              </div>

              {/* Links are public and belong on this step, not on Contact.
                  That is not tidiness: the Contact step's whole demonstration
                  is that you type an address and the preview does not move, and
                  a published link on the same panel would contradict it. The
                  test the model actually applies is a route to a *page* against
                  a route to a *person* — so the two live one step apart and
                  each says why. */}
              <div className="flex flex-col gap-4 border-t border-stroke pt-5">
                <div>
                  <p className="text-sm font-medium">Where to find you</p>
                  <p className="mt-1 text-xs text-t-muted">
                    All four are published on your profile. They are links to pages rather
                    than ways of reaching you personally, which is exactly why they can be
                    public while your email address on the next step cannot.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Website">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="url"
                        value={draft.websiteUrl}
                        onChange={(value) => set("websiteUrl", value)}
                        placeholder="https://"
                      />
                    )}
                  </Field>
                  <Field label="GitHub">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="url"
                        value={draft.githubUrl}
                        onChange={(value) => set("githubUrl", value)}
                        placeholder="https://github.com/…"
                      />
                    )}
                  </Field>
                  <Field label="LinkedIn">
                    {(id) => (
                      <TextInput
                        id={id}
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
                  >
                    {(id) => (
                      <TextInput
                        id={id}
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
                  evidence of work; it is not evidence <em>Bluehex checked</em>, which is
                  the only thing the badge claims.
                </p>
              </div>
            </StepPanel>
          ) : null}

          {step === 1 ? (
            <StepPanel
              title="Your credentials"
              note="Claude Certifications and Anthropic Academy certificates, picked from the list Bluehex keeps. Only what you have finished — there is nothing to enter for a course you are partway through, and the track below shows where you are without you having to claim anything."
            >
              <Progress draft={draft} />

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
                    /* `unique (practitioner_id, catalogue_id)` — you cannot
                       claim the same credential twice, so the picker greys out
                       what is already on the profile rather than letting the
                       insert be refused after the fact. */
                    taken={draft.credentials.map((item) => item.catalogueId).filter(Boolean)}
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
              note="None of this is published — unlike the links on the first step, which are. The difference is what they reach: a page can be public, a person's address cannot. Enquiries come through Bluehex rather than going to you directly, so your address never appears on your profile — watch the preview as you type and you will see it does not move."
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
                  Each one gets opened and read against the name on it. The Verified badge
                  appears once every credential on your profile has been checked — so
                  adding a fourth later leaves the first three checked and waits on the
                  new one, rather than dropping the badge until somebody re-reads all
                  four.
                </ReviewStep>
                <ReviewStep n={3} title="You can edit any time">
                  Editing does not send it back to the queue. Changing what a credential
                  claims — which credential it is, when you earned it, or its certificate
                  link — clears that credential&apos;s check until Bluehex looks again, and
                  you can watch the ✓ leave the preview as you change it. Switching the
                  certificate link&apos;s publish opt-in does not, because that changes who
                  can see the claim rather than the claim. Neither do your bio, your focus
                  areas, what you offer or your links, which the badge never covered.
                </ReviewStep>
              </ol>

              {/* Three counts, not two. This step's whole job is saying who
                  decides what, and "waiting on Bluehex" over a credential with
                  no certificate link names the wrong party — nobody at Bluehex
                  can move it, and the practitioner can, with one field. The
                  credential panel already says so; the summary used to
                  contradict it two clicks later.

                  `badge.held` rather than the row count, so an added-and-untouched
                  credential does not appear in a sentence beginning "Submitting". */}
              <div className="rounded-card bg-surface p-6">
                <p className="text-sm">
                  <strong className="font-medium">Submitting {badge.held}</strong>{" "}
                  {badge.held === 1 ? "credential" : "credentials"} — {badge.verified}{" "}
                  already checked, {badge.awaitingCheck} waiting on Bluehex,{" "}
                  {badge.awaitingProof} waiting on you.
                </p>
                {badge.awaitingProof > 0 ? (
                  <p className="mt-1.5 text-sm text-t-muted">
                    Waiting on you means the certificate link is missing. Bluehex cannot
                    check a credential it has no proof of, so that one is yours to move.
                  </p>
                ) : null}
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

/**
 * Progress against the whole catalogue — what replaced the in-progress
 * credential.
 *
 * The premise it rests on is that the catalogue is a known set Bluehex wrote,
 * so showing somebody the entries they do not hold requires no assertion *from*
 * them. There is nothing to type and therefore nothing to be unfalsifiable
 * about: an entry you have not earned is an entry you have not earned.
 *
 * **This is the editor and only the editor.** "2 of 23" reads as encouragement
 * to its owner and as 9% to an employer, so the public profile shows what
 * somebody holds and never what they lack. The whole track is collapsed rather
 * than laid out, because the step's job is entering credentials and the track
 * is context for it — expanded, twenty-three rows of mostly "not yet" is the
 * same discouraging reading the public page is being spared.
 */
function Progress({ draft }: { draft: ProfileDraft }) {
  const { held, total } = catalogueProgress(draft);
  const holdings = new Set(draft.credentials.map((credential) => credential.catalogueId));

  return (
    <div className="rounded-card bg-surface p-5">
      <p className="text-sm">
        <strong className="font-medium">
          {held} of {total}
        </strong>{" "}
        Claude credentials{held === 0 ? " so far" : ""}.
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-t-muted">See the whole track</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          {pickable().map((item) => {
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
                  <span className="sr-only">{has ? " — held" : " — not held"}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-t-muted">
          Nobody but you sees this list against your name — your profile shows what you
          hold, not what you do not. Bluehex keeps the list; ask if something is missing.
        </p>
      </details>
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
            {draft.location ? (
              <p className="mt-1.5 text-xs break-words text-t-faint">{draft.location}</p>
            ) : null}
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
                  const verified = Boolean(controlled.verified[credential.key]);
                  /* Nothing picked yet is a state of the form, not of a
                     credential — the row still has to draw as something, and
                     saying so is better than inventing a label for it. */
                  const entry = credential.catalogueId
                    ? catalogueEntry(credential.catalogueId)
                    : null;
                  return (
                    <li key={credential.key} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full ${
                          verified ? "bg-ink text-t-invert" : "border border-stroke"
                        }`}
                      >
                        {verified ? <span className="text-[8px]">✓</span> : null}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`break-words ${
                            entry ? "text-t-medium" : "text-t-faint italic"
                          }`}
                        >
                          {entry ? entry.label : "Nothing picked yet"}
                        </span>
                        {credential.evidencePublic && credential.evidenceUrl ? (
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

          {/* Services, matching the real row — the roster's third column is
              what you can be hired for, and focus is on the profile page. A
              preview that drew the wrong column would be teaching the wrong
              thing about which answer the directory uses. */}
          <div className="flex flex-wrap gap-1.5">
            {draft.services.map((item) => (
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
