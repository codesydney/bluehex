import type { Metadata } from "next";
import { ContactForm } from "./contact-form";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { Button, SectionLabel } from "@/components/ui";
import { practitioners } from "@/lib/practitioners";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Tell us about your project, or book a free 30-minute consultation.",
};

const BOOKING_URL =
  "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2fXA9Mpyae3jbldYGLyeNFKUM4f--cA-W-w5v1WUV0BtWG6eq1paYGH4Q6gNtE_iyUPynhSCXF";

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  /* The directory's Enquire button carries who the enquiry is about. Read here
     rather than with `useSearchParams` in the form, which would need a Suspense
     boundary and push the whole page to client rendering for one string.

     It carries the profile **id**, not the display name, and the name shown is
     looked up from it. Two reasons, and the second is the serious one:

     1. Names are not identifiers. Two practitioners can share one, and the
        enquiry would not say which — the same argument that rules the display
        name out of a profile URL.
     2. The previous version echoed the query string straight into the page, the
        mailto subject and the mail body. That is unvalidated, attacker-supplied
        text rendered as if Bluehex wrote it, so `?about=<anything>` produced a
        page that appeared to endorse it. Resolving against the known set means
        anything that does not match simply shows no banner. */
  const requested = (await searchParams).about;
  const about =
    typeof requested === "string"
      ? practitioners.find((person) => person.id === requested)?.name
      : undefined;

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

            <ContactForm email={site.email} about={about} />
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
