import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { Button, SectionLabel } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Tell us about your project, or book a free 30-minute consultation.",
};

const BOOKING_URL =
  "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2fXA9Mpyae3jbldYGLyeNFKUM4f--cA-W-w5v1WUV0BtWG6eq1paYGH4Q6gNtE_iyUPynhSCXF";

/* Underline-style field, matching the original form's look. */
const fieldClasses =
  "w-full border-0 border-b border-stroke bg-transparent pb-3 text-base text-t-bright placeholder:text-t-muted focus:border-ink focus:outline-none";

export default function ContactPage() {
  return (
    <>
      <section className="container-x pt-32 pb-20 md:pt-44 md:pb-28">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-16">
          <SectionLabel className="md:w-40 md:shrink-0 md:pt-6">Contact</SectionLabel>

          <div className="w-full max-w-3xl">
            <h1 className="display-2">Let&apos;s talk about your project!</h1>

            <a
              href={`mailto:${site.email}?subject=Message%20from%20your%20site`}
              className="display-2 mt-2 inline-flex items-start gap-3 text-t-faint transition-colors hover:text-t-bright"
            >
              {site.email}
              <ArrowUpRight className="mt-2 size-[0.5em] shrink-0" />
            </a>

            <p className="mt-10 max-w-xl text-lg text-t-muted">
              Questions? We can help. Learn about our services and process, and reach out
              anytime.
            </p>

            {/*
              The form has no action yet — this repo has no backend. Point it at a
              Next.js route handler (or a form service) before shipping; until then
              the mailto link above is the working path.
            */}
            <form className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2">
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
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="container-x pb-8">
        <h2 className="text-3xl">Book a Call</h2>
        <p className="mt-3 text-t-muted">
          Grab a free 30-minute consultation at a time that suits you.
        </p>
        <Button
          href={BOOKING_URL}
          variant="outline"
          className="mt-8"
          icon={<ArrowRight className="size-4" />}
        >
          Book Your Free Consultation
        </Button>
      </section>
    </>
  );
}
