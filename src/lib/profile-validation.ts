import { maxServices } from "@/lib/practitioners";
import type { ProfileDraft } from "@/lib/profile-draft";

/**
 * What the editor checks before it would write anything.
 *
 * **The form validates and the database is the backstop, not the other way
 * round.** Every rule below has a constraint behind it, and the constraint is
 * what makes it a rule — but a domain violation surfaces through PostgREST as a
 * 400 naming `https_url`, which is not a message anyone should ever read. So
 * the shapes are checked here with words a person can act on, and the schema
 * still refuses whatever gets past.
 *
 * Pure functions over a draft, no rendering and no React. The form asks for the
 * whole list, renders each message beside its field, and uses `stepForField` to
 * take somebody to the first thing that needs them.
 */

export type FieldError = {
  /**
   * Which control this belongs to. Profile and contact fields use their draft
   * key; a credential's use `credentials.<key>.<field>`, because there are as
   * many of each as there are credentials.
   */
  field: string;
  message: string;
};

/**
 * The `public.https_url` domain, restated:
 *
 *   check (value ~* '^https://[^[:space:]/]+\.[^[:space:]]+$'
 *          and length(value) <= 2048)
 *
 * `https://` required and case-insensitive, a host with a dot in it, no
 * whitespace anywhere, 2048 characters. `http://` and `https://localhost` are
 * both refused, and so is `javascript:` — which is the reason the constraint
 * exists at all, since every one of these columns is rendered as an `href`.
 *
 * Deliberately not a URL parser, matching the spec: it rejects the shapes that
 * are dangerous or obviously wrong and lets a human read the rest.
 *
 * JavaScript's `\s` covers a few Unicode spaces that POSIX `[:space:]` does
 * not, so this is marginally stricter than the domain. That direction is the
 * safe one — the form refuses something the database would have taken, rather
 * than passing something it will not.
 */
const HTTPS_URL = /^https:\/\/[^\s/]+\.\S+$/i;
const MAX_URL_LENGTH = 2048;

/** `check (country_code ~ '^[A-Z]{2}$')`, restated. */
const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * Deliberately loose. `contact_email` has no check constraint — the column is
 * `not null` and nothing else — because an address is verified by sending mail
 * to it, not by a regular expression, and the strict ones reject real
 * addresses. This catches the typo and gets out of the way.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `YYYY-MM-DD`, which is what `<input type="date">` produces and `date` takes. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isHttpsUrl(value: string): boolean {
  return HTTPS_URL.test(value) && value.length <= MAX_URL_LENGTH;
}

/**
 * A real calendar day, and not one in the future.
 *
 * `new Date("2026-02-31")` rolls over to 3 March rather than throwing, so the
 * round trip through `toISOString` is what catches a day that does not exist.
 * The future check has no constraint behind it and is the one rule here that is
 * the form's alone: `earned_at` is the day on a certificate, and a certificate
 * dated next month has not been earned. Compared in UTC, because the column is
 * a `date` and a timezone would only invite the bug the spec avoided by not
 * making it a timestamp.
 */
export function earnedDateProblem(value: string, today = new Date()): string | null {
  if (!ISO_DATE.test(value)) return "Use a date in the format YYYY-MM-DD.";

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "That is not a date on the calendar.";
  if (parsed.toISOString().slice(0, 10) !== value) return "That is not a date on the calendar.";
  if (value > today.toISOString().slice(0, 10)) {
    return "That is in the future. Use the day on the certificate.";
  }

  return null;
}

const linkFields = [
  { key: "websiteUrl", label: "website" },
  { key: "githubUrl", label: "GitHub" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "bookingUrl", label: "booking page" },
] as const;

/**
 * Everything wrong with this draft, in the order the form asks for it.
 *
 * Order is load-bearing: the form sends somebody to the *first* error, so the
 * list has to run down the steps rather than by field type.
 */
export function validateDraft(draft: ProfileDraft, today = new Date()): FieldError[] {
  const errors: FieldError[] = [];

  /* You ------------------------------------------------------------- */

  if (draft.name.trim() === "") {
    errors.push({ field: "name", message: "Your name is needed — it is what the badge attests to." });
  }

  if (draft.countryCode !== "" && !COUNTRY_CODE.test(draft.countryCode)) {
    errors.push({ field: "countryCode", message: "Pick a country from the list." });
  }

  /* The cap is a trigger on `practitioner_services`, and the picker already
     disables what would exceed it — this catches a draft that arrived over the
     cap rather than a click, which is the only way it can happen. */
  if (draft.services.length > maxServices) {
    errors.push({
      field: "services",
      message: `Pick at most ${maxServices} services. Unpick one to choose something else.`,
    });
  }

  for (const { key, label } of linkFields) {
    const value = draft[key].trim();
    if (value !== "" && !isHttpsUrl(value)) {
      errors.push({ field: key, message: linkMessage(label, value) });
    }
  }

  /* Credentials ------------------------------------------------------ */

  for (const credential of draft.credentials) {
    const field = (name: string) => `credentials.${credential.key}.${name}`;

    if (credential.catalogueId === "") {
      errors.push({
        field: field("catalogueId"),
        /* Not "we will ignore it": an incomplete row is draft state that never
           reaches the database, and saying so is better than dropping somebody's
           half-finished answer without telling them. */
        message: "Choose which credential this is, or remove it.",
      });
    }

    if (credential.earnedAt === "") {
      errors.push({
        field: field("earnedAt"),
        message: "The day on the certificate is needed. Bluehex checks the date against it.",
      });
    } else {
      const problem = earnedDateProblem(credential.earnedAt, today);
      if (problem) errors.push({ field: field("earnedAt"), message: problem });
    }

    const evidenceUrl = credential.evidenceUrl.trim();
    if (evidenceUrl !== "" && !isHttpsUrl(evidenceUrl)) {
      errors.push({
        field: field("evidenceUrl"),
        message: linkMessage("certificate link", evidenceUrl),
      });
    }

    /* Publishing nothing is not an error and is not silently corrected either —
       the opt-in is meaningless without a URL, so the panel says so where the
       checkbox is rather than refusing the submission. */
  }

  /* Contact ---------------------------------------------------------- */

  const email = draft.contactEmail.trim();
  if (email === "") {
    errors.push({
      field: "contactEmail",
      message: "An email address is needed. It is how Bluehex reaches you, and it is never published.",
    });
  } else if (!EMAIL.test(email)) {
    errors.push({ field: "contactEmail", message: "That does not look like an email address." });
  }

  return errors;
}

/**
 * Why a link was refused, in the terms the person typed it in.
 *
 * Separating the `http://` case from the rest matters more than it looks: it is
 * the single most common way a valid address is refused, and "must start with
 * https://" is actionable where "that does not look like a link" is not.
 */
function linkMessage(label: string, value: string): string {
  if (value.length > MAX_URL_LENGTH) {
    return `That ${label} link is longer than ${MAX_URL_LENGTH} characters.`;
  }
  if (/^http:\/\//i.test(value)) {
    return `Links are published as they are typed, so this one has to be https://. Check whether the ${label} works with https.`;
  }

  return `That does not look like a link — a ${label} address starts with https:// and has a dot in it.`;
}

/** The first message for a field, or `undefined`. */
export function errorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((error) => error.field === field)?.message;
}

/**
 * Which step a field is on, so the form can take somebody to the first thing
 * that needs them rather than telling them something is wrong three steps away.
 *
 * The numbers are the indexes of `steps` in `profile-form.tsx`, which is the
 * one place the order is declared. A field this does not know about lands on
 * the first step, which is where somebody would start looking anyway.
 */
export function stepForField(field: string): number {
  if (field.startsWith("credentials.")) return 1;
  if (field === "contactEmail" || field === "contactPhone" || field === "contactNote") return 2;

  return 0;
}
