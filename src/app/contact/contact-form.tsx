"use client";

import { ArrowUpRight } from "@/components/icons";

/* Underline-style field, matching the original form's look. */
const fieldClasses =
  "w-full border-0 border-b border-stroke bg-transparent pb-3 text-base text-t-bright placeholder:text-t-muted focus:border-ink focus:outline-none";

/**
 * Contact form.
 *
 * There is no backend in this repo, so submitting hands the message to the
 * visitor's mail client with the fields already filled in. That is a stopgap:
 * a plain `<form>` with no action performs a GET back to the same URL, which
 * looks like it worked and silently loses the enquiry. Replacing this with a
 * route handler or a form service is tracked in issue #2 — when that lands,
 * the mailto fallback should stay for anyone with JavaScript disabled.
 *
 * `about` is the practitioner a directory enquiry concerns. Enquiries route
 * through Bluehex rather than to the practitioner directly — no address is
 * ever published on a profile — so this only has to say who was meant, and the
 * mail still comes here.
 */
export function ContactForm({ email, about }: { email: string; about?: string }) {
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const value = (field: string) => String(data.get(field) ?? "").trim();

    const body = [
      `Name: ${value("name")}`,
      `Email: ${value("email")}`,
      `Phone: ${value("phone")}`,
      ...(about ? [`About: ${about}`] : []),
      "",
      value("message"),
    ].join("\n");

    const query = new URLSearchParams({
      subject: about
        ? `Enquiry about ${about}, from ${value("name") || "the website"}`
        : `Enquiry from ${value("name") || "the website"}`,
      body,
    });

    window.location.href = `mailto:${email}?${query}`;
  };

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

      <div className="sm:col-span-2">
        <button
          type="submit"
          className="inline-flex h-16 items-center justify-center gap-3 rounded-full bg-ink px-8 text-xl font-medium text-t-invert transition-colors hover:bg-ink-tint"
        >
          Submit
          <ArrowUpRight className="size-5" />
        </button>

        <p className="mt-4 text-sm text-t-muted">
          Opens in your email app with the message ready to send.
        </p>
      </div>
    </form>
  );
}
