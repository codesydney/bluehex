"use client";

import { useRef, useState } from "react";
import { type Enquiry, mailtoHref, sendEnquiry } from "./_lib/enquiry";
import { ArrowUpRight } from "@/components/icons";

/* Underline-style field, matching the original form's look. */
const fieldClasses =
  "w-full border-0 border-b border-stroke bg-transparent pb-3 text-base text-t-bright placeholder:text-t-muted focus:border-ink focus:outline-none";

type Status = { state: "idle" | "sending" } | { state: "sent" } | { state: "failed"; enquiry: Enquiry };

/**
 * Contact form.
 *
 * Submitting sends the enquiry through EmailJS — from the browser, with no
 * backend and no secret, into the inbox the Code.Sydney site already delivers
 * to. See `docs/adr/0003-enquiries-send-through-emailjs.md` for why that and
 * not a route handler.
 *
 * The `mailto:` this form used to perform for *every* submission is now the
 * failure path: if EmailJS refuses or the network is down, the visitor is
 * offered a link that opens their own mail client with everything they typed
 * already in it. That is the part worth protecting — a message the visitor has
 * written must never disappear because a third party is having a bad day. It is
 * also the answer for a visitor with JavaScript off, who never reaches this
 * handler at all: the page's `info@code.sydney` heading is a live link above
 * the form.
 *
 * `about` is the practitioner a directory enquiry concerns. Enquiries route
 * through Bluehex rather than to the practitioner directly — no address is
 * ever published on a profile — so this only has to say who was meant, and the
 * mail still comes here.
 */
export function ContactForm({ email, about }: { email: string; about?: string }) {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const statusRef = useRef<HTMLParagraphElement>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.state === "sending") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (field: string) => String(data.get(field) ?? "");

    const enquiry: Enquiry = {
      name: value("name"),
      email: value("email"),
      phone: value("phone"),
      message: value("message"),
      about,
    };

    /* The honeypot. A person never sees the field and cannot tab to it, so
       anything in it came from something filling every input on the page. Say
       "sent" and send nothing: telling a bot it was caught only teaches whoever
       wrote it to leave the field alone next time.

       This stops form-filling bots and nothing else — a script posting straight
       to EmailJS never loads this page. The control for that is the
       allowed-origins list in the EmailJS dashboard, not code in this repo. */
    if (value("website").trim()) {
      form.reset();
      setStatus({ state: "sent" });
      return;
    }

    setStatus({ state: "sending" });

    try {
      await sendEnquiry(enquiry);
      form.reset();
      setStatus({ state: "sent" });
    } catch (error) {
      console.error(error);
      setStatus({ state: "failed", enquiry });
    }

    /* The status text is the only thing that changes on submit, and it is below
       the button — a screen reader announces it through the live region, and
       moving focus there means everyone else lands on it too. */
    statusRef.current?.focus();
  };

  const sending = status.state === "sending";

  return (
    <form onSubmit={onSubmit} className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2">
      {about ? (
        <p className="rounded-tight bg-surface px-5 py-4 text-sm text-t-muted sm:col-span-2">
          Enquiring about <strong className="font-medium text-t-bright">{about}</strong>.
          Bluehex passes it on — practitioners are not contacted directly.
        </p>
      ) : null}

      <label className="block">
        <span className="sr-only">Your name</span>
        <input
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name*"
          required
          className={fieldClasses}
        />
      </label>

      <label className="block">
        <span className="sr-only">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email*"
          required
          className={fieldClasses}
        />
      </label>

      <label className="block">
        <span className="sr-only">Phone</span>
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="Phone*"
          required
          className={fieldClasses}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="sr-only">A few words about your project</span>
        <textarea
          name="message"
          rows={5}
          placeholder="A few words about your project*"
          required
          className={`${fieldClasses} resize-y`}
        />
      </label>

      {/* The honeypot. `hidden` rather than an offscreen `aria-hidden` wrapper:
          a hidden element is out of the layout, the tab order and the
          accessibility tree at once, where an offscreen one holding a focusable
          input is an `aria-hidden-focus` violation the /contact axe run would
          fail on. A bot filling every `input[name]` in the markup neither reads
          the attribute nor renders the page. */}
      <div hidden>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={sending}
          className="inline-flex h-16 items-center justify-center gap-3 rounded-full bg-ink px-8 text-xl font-medium text-t-invert transition-colors hover:bg-ink-tint disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending…" : "Submit"}
          <ArrowUpRight className="size-5" />
        </button>

        <p
          ref={statusRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="mt-4 max-w-lg text-sm text-t-muted focus:outline-none"
        >
          {status.state === "sent" ? (
            <span className="text-t-bright">
              Thanks — your message is on its way. We usually reply within a day or two.
            </span>
          ) : status.state === "failed" ? (
            <>
              That didn&apos;t send. Nothing you wrote is lost —{" "}
              <a
                href={mailtoHref(email, status.enquiry)}
                className="underline underline-offset-4 hover:text-t-bright"
              >
                open it in your email app
              </a>{" "}
              instead, or write to {email}.
            </>
          ) : (
            "We'll reply to the email address you give us."
          )}
        </p>
      </div>
    </form>
  );
}
