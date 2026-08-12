/**
 * The published practitioner directory.
 *
 * The premise: anyone in the Code.Sydney community can build a public profile
 * that collects their Claude credentials — Anthropic Academy certificates and
 * Claude Certifications alike — so employers and customers can find them.
 * Both the already-certified and the working-towards are listed; the status is
 * shown rather than used as a filter for entry.
 *
 * REAL PEOPLE ONLY. Nothing here is placeholder copy — a profile goes in when
 * the person has agreed to be published and the credentials have been checked.
 * The home page renders open slots for the rest rather than inventing entries.
 */

export type CredentialSource = "Claude Certification" | "Anthropic Academy";

export type Credential = {
  source: CredentialSource;
  label: string;
  /** Left off until the credential is earned — drives the "in progress" state. */
  earned?: string;
};

export type Practitioner = {
  name: string;
  role: string;
  location: string;
  certified: boolean;
  bio: string;
  credentials: Credential[];
  focus: string[];
};

export const practitioners: Practitioner[] = [];

/**
 * How many cards the directory preview holds. Any slot not filled by a real
 * practitioner renders as an open invitation instead.
 */
export const directoryPreviewCount = 2;
