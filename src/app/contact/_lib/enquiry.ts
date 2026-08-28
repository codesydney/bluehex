import { site } from "@/lib/site";

/**
 * What a visitor filled in, plus the practitioner the enquiry is about when it
 * came from a directory Enquire button. Every field is a raw form value —
 * trimming happens here so the caller never has to remember to.
 */
export type Enquiry = {
  name: string;
  email: string;
  phone: string;
  message: string;
  about?: string;
};

/**
 * EmailJS, the same account and template the Code.Sydney site sends through —
 * one inbox, one set of credentials, no new provider and no server-side send.
 * See `docs/adr/0003-enquiries-send-through-emailjs.md`.
 *
 * These three ids are configuration rather than secrets. EmailJS sends from the
 * browser by design, so all three are compiled into the page every visitor
 * downloads whatever this repository does with them; hiding them in an
 * environment variable would buy no secrecy and would add a way for production
 * to be silently misconfigured. What actually stops someone else's page sending
 * through this account is the allowed-origins list in the EmailJS dashboard,
 * which is not something the repository can hold.
 */
export const emailjs = {
  endpoint: "https://api.emailjs.com/api/v1.0/email/send",
  publicKey: "user_nEmQ6yi4aBPvlCKCkUAfK",
  serviceId: "service_9yexqpb",
  templateId: "template_rl4e2gy",
} as const;

const clean = (value: string) => value.trim();

/**
 * The four variables the shared template renders. It is Code.Sydney's template
 * and this repository cannot change it, so anything it has no variable for has
 * to travel inside `message` or not travel at all.
 *
 * Two things do. **Where the enquiry came from**, because the template renders
 * the same mail for both sites and the inbox would otherwise have no way to
 * tell a Bluehex enquiry from a Code.Sydney one. And **who it is about**, which
 * is the whole point of the directory's Enquire button.
 */
export function toTemplateParams(enquiry: Enquiry): Record<string, string> {
  const about = enquiry.about ? clean(enquiry.about) : "";

  const message = [
    `Sent from the ${site.name} contact form — ${site.origin}/contact`,
    ...(about ? [`Enquiring about: ${about}`] : []),
    "",
    clean(enquiry.message),
  ].join("\n");

  return {
    name: clean(enquiry.name),
    email: clean(enquiry.email),
    phone: clean(enquiry.phone),
    message,
  };
}

/**
 * The same enquiry as a `mailto:` the visitor's own mail client can open. It is
 * the fallback offered when a send fails, so a message is never lost to a
 * provider outage — and it is what the form did for every submission before
 * issue #2.
 */
export function mailtoHref(email: string, enquiry: Enquiry): string {
  const about = enquiry.about ? clean(enquiry.about) : "";
  const name = clean(enquiry.name);

  const body = [
    `Name: ${name}`,
    `Email: ${clean(enquiry.email)}`,
    `Phone: ${clean(enquiry.phone)}`,
    ...(about ? [`About: ${about}`] : []),
    "",
    clean(enquiry.message),
  ].join("\n");

  const query = new URLSearchParams({
    subject: about
      ? `Enquiry about ${about}, from ${name || "the website"}`
      : `Enquiry from ${name || "the website"}`,
    body,
  });

  /* `URLSearchParams.toString()` serialises as `application/x-www-form-
     urlencoded`, which writes a space as `+`. A mailto query is not form
     encoded — RFC 6068 wants percent-encoding, where `+` is a literal plus —
     so clients split on it and the strict ones open a compose window reading
     "Enquiry+about+Mara+Ellison". A literal plus in a field is already `%2B`
     by this point, so replacing every remaining `+` is safe.

     `URLSearchParams` is still what builds the query: it percent-encodes `&`,
     `?`, CR and LF, so no field value can inject a second mailto header. */
  return `mailto:${email}?${query.toString().replace(/\+/gu, "%20")}`;
}

/**
 * Hands the enquiry to EmailJS. Rejects on any non-2xx, because EmailJS answers
 * a refused send with a status and a one-line reason rather than a JSON body —
 * the reason is worth carrying into the console, but never onto the page, where
 * it would say more about the account than a visitor should see.
 */
export async function sendEnquiry(enquiry: Enquiry, signal?: AbortSignal): Promise<void> {
  const response = await fetch(emailjs.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      user_id: emailjs.publicKey,
      service_id: emailjs.serviceId,
      template_id: emailjs.templateId,
      template_params: toTemplateParams(enquiry),
    }),
  });

  if (!response.ok) {
    throw new Error(`EmailJS refused the send: ${response.status} ${await response.text()}`);
  }
}
