import { PractitionerDirectory } from "@/components/practitioner-directory";
import { Card, Button, SectionLabel } from "@/components/ui";
import { practitioners } from "@/lib/practitioners";
import { site } from "@/lib/site";

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
          <Button href="#practitioners" size="lg">
            Find a practitioner
          </Button>
          <Button href="/contact" variant="outline" size="lg">
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
      {/* Practitioner directory — search, filters, profiles               */}
      {/* ---------------------------------------------------------------- */}
      <PractitionerDirectory practitioners={practitioners} />
    </>
  );
}
