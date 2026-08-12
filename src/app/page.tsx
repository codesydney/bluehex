import Image from "next/image";
import { Sparkle } from "@/components/icons";
import { Badge, Button, Card, Marquee, SectionLabel } from "@/components/ui";
import { directoryPreviewCount, practitioners } from "@/lib/practitioners";
import { engagements, steps } from "@/lib/services";
import { site } from "@/lib/site";

/* The directory shows every published practitioner, then pads the row out with
   open slots so the grid reads as an invitation rather than a short list. */
const openSlots = Math.max(directoryPreviewCount - practitioners.length, 0);

/* Three plain facts under the hero. No invented numbers — every claim here is
   something the business can stand behind on day one. */
const heroFacts = [
  { label: "Based in", value: "Sydney, working Australia-wide and beyond" },
  { label: "Who does the work", value: "Practitioners who use Claude daily" },
  { label: "Scope", value: "Claude and Anthropic. Nothing else." },
];

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="container-x pt-36 pb-20 md:pt-48 md:pb-28">
        <SectionLabel>Claude and Anthropic specialists</SectionLabel>

        <h1 className="display-1 mt-8 max-w-6xl">We only do Claude.</h1>

        <p className="mt-10 max-w-2xl text-lg text-t-muted md:text-xl">{site.tagline}</p>

        <div className="mt-12 flex flex-wrap gap-4">
          <Button href="/contact" size="lg">
            Get Claude help
          </Button>
          <Button href="#practitioners" variant="outline" size="lg">
            Publish your profile
          </Button>
        </div>

        <dl className="mt-20 grid gap-5 md:grid-cols-3">
          {heroFacts.map((fact) => (
            <Card key={fact.label} className="py-8 md:py-8">
              <dt className="text-sm text-t-faint">{fact.label}</dt>
              <dd className="mt-3 text-lg leading-snug">{fact.value}</dd>
            </Card>
          ))}
        </dl>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Engagements                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section id="services" className="container-x scroll-mt-24 py-16 md:py-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-16">
          <div className="max-w-3xl">
            <SectionLabel>What we do</SectionLabel>
            <h2 className="display-2 mt-6">From your first prompt to production.</h2>
          </div>
          <p className="max-w-md text-t-muted">
            One subject, four scales. Whether it is a single person learning Claude Code or an
            organisation rolling it out to hundreds, it is the same practitioners doing the work.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {engagements.map((engagement) => (
            <Card key={engagement.title} className="flex flex-col gap-6 md:p-12">
              <Badge>{engagement.scale}</Badge>

              <h3 className="display-3 font-display">{engagement.title}</h3>

              <p className="text-t-muted">{engagement.blurb}</p>

              <ul className="mt-auto flex flex-col gap-2 border-t border-stroke pt-6">
                {engagement.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-t-medium">
                    <Sparkle className="mt-1 size-3.5 shrink-0 text-t-faint" />
                    {point}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Practitioner directory                                           */}
      {/* ---------------------------------------------------------------- */}
      <section id="practitioners" className="container-x scroll-mt-24 py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_7fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionLabel>The network</SectionLabel>
            <h2 className="display-2 mt-6">Claude practitioners, published.</h2>

            <p className="mt-8 text-t-muted">
              Every practitioner in the network gets a public profile that collects their Claude
              credentials in one place — Anthropic Academy certificates and Claude Certifications
              alike — so employers and customers can find them by what they can actually do.
            </p>

            <p className="mt-5 text-t-muted">
              You do not have to be certified to be listed. Start the profile while you are still
              working towards it; the status shows on the card, and the credentials go on as you
              earn them.
            </p>

            <Button href="/contact" className="mt-10">
              Start your profile
            </Button>
          </div>

          <ul className="grid auto-rows-fr gap-5 sm:grid-cols-2">
            {practitioners.map((person) => (
              <li key={person.name}>
                <Card className="flex h-full flex-col gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-medium">{person.name}</h3>
                      <p className="mt-1 text-sm text-t-muted">{person.role}</p>
                      <p className="text-sm text-t-faint">{person.location}</p>
                    </div>
                    <Badge tone={person.certified ? "strong" : "quiet"}>
                      {person.certified ? "Certified" : "In progress"}
                    </Badge>
                  </div>

                  <p className="text-sm leading-relaxed text-t-muted">{person.bio}</p>

                  <ul className="flex flex-col gap-2">
                    {person.credentials.map((credential) => (
                      <li
                        key={credential.label}
                        className="flex items-start gap-2.5 text-sm text-t-medium"
                      >
                        <Sparkle className="mt-1 size-3.5 shrink-0 text-t-faint" />
                        <span>
                          {credential.label}
                          <span className="block text-xs text-t-faint">
                            {credential.earned ?? "In progress"}
                            {credential.source === credential.label
                              ? ""
                              : ` · ${credential.source}`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    {person.focus.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                  </div>
                </Card>
              </li>
            ))}

            {/* Open slots. Deliberately not filled with invented people — the
                directory only ever shows practitioners who have agreed to be
                published and had their credentials checked. */}
            {Array.from({ length: openSlots }, (_, index) => (
              <li key={`open-${index}`}>
                <div className="flex h-full min-h-64 flex-col items-start justify-end gap-3 rounded-card border border-dashed border-stroke p-8 md:p-10">
                  <Sparkle className="size-6 text-t-faint" />
                  <p className="text-xl font-medium">Your profile here</p>
                  <p className="text-sm leading-relaxed text-t-muted">
                    Certified, or working towards it. Both belong in the directory.
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section id="how-it-works" className="container-x scroll-mt-24 py-16 md:py-24">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="display-2 mt-6 max-w-3xl">Three steps, one conversation.</h2>

        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card className="flex h-full flex-col gap-5">
                <span className="display-3 font-display text-t-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-medium">{step.title}</h3>
                <p className="text-sm leading-relaxed text-t-muted">{step.blurb}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Community                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="container-x py-16 md:py-24">
        <Card className="md:p-16">
          <SectionLabel>The community behind it</SectionLabel>
          <p className="display-3 mt-6 max-w-4xl font-display">
            Bluehex is the commercial arm of Code.Sydney. The goal is an army of Claude
            practitioners — in Sydney first, then Australia-wide, then everywhere else.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button href={site.meetup} variant="outline">
              Join the meetup
            </Button>
            <Button href="https://code.sydney" variant="ghost">
              About the community
            </Button>
          </div>
        </Card>
      </section>

      <div className="py-12 md:py-20">
        <Marquee phrases={["Learn Claude", "Build With Claude", "Ship With Claude"]} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Closing call to action                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="container-x">
        <div className="relative overflow-hidden rounded-block bg-ink px-8 py-16 md:px-16 md:py-24">
          <div className="relative z-10 max-w-2xl">
            <p className="display-2 flex flex-wrap items-center gap-4 text-t-invert">
              <Image
                src="/img/icons/300x300_obj-cta-01.webp"
                alt=""
                width={300}
                height={300}
                className="size-12 object-contain md:size-16"
              />
              Need Claude help? Start here.
            </p>

            <p className="mt-8 max-w-lg text-t-invert-muted">
              Tell us whether you are learning, building or rolling it out — we will match you with
              the right practitioner.
            </p>

            <Button href="/contact" variant="lime" size="lg" className="mt-10">
              Contact Us
            </Button>
          </div>

          {/* Decorative props, hidden on small screens where they would sit
              on top of the headline rather than beside it. */}
          <Image
            src="/img/illustrations/cta-img-01.webp"
            alt=""
            width={600}
            height={600}
            className="pointer-events-none absolute right-4 bottom-0 hidden w-64 object-contain lg:block xl:w-80"
          />
          <Image
            src="/img/illustrations/cta-img-02.webp"
            alt=""
            width={400}
            height={400}
            className="pointer-events-none absolute right-64 bottom-16 hidden w-32 object-contain lg:block xl:right-80 xl:w-40"
          />
        </div>
      </section>
    </>
  );
}
