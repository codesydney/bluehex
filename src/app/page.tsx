import Image from "next/image";
import { PractitionerDirectory } from "@/components/practitioner-directory";
import { Card, Button, SectionLabel } from "@/components/ui";
import { practitioners } from "@/lib/practitioners";
import { site } from "@/lib/site";

/* Communities Bluehex runs this directory alongside. Logos are the
   collaborators' own artwork, trimmed to their bounding box and given a
   transparent background — see public/img/partners/. */
const collaborators = [
  {
    name: "Seiment",
    href: "https://seiment.com/",
    logo: "/img/partners/seiment-logo.png",
    width: 246,
    height: 246,
  },
  {
    name: "Data Engineering Pilipinas",
    href: "https://dataengineering.ph/",
    logo: "/img/partners/data-engineering-pilipinas-logo.png",
    width: 480,
    height: 395,
  },
  {
    name: "Tutorials Dojo",
    href: "https://tutorialsdojo.com/",
    logo: "/img/partners/tutorials-dojo-logo.png",
    width: 200,
    height: 200,
  },
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

        <p className="mt-20 text-base font-medium tracking-wide text-t-medium uppercase md:text-lg">
          In collaboration with
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {collaborators.map((c) => (
            <a key={c.name} href={c.href} target="_blank" rel="noopener noreferrer">
              <Card className="flex items-center gap-5 border border-stroke py-8 transition-colors hover:border-stroke-strong md:py-8">
                <Image
                  src={c.logo}
                  alt=""
                  width={c.width}
                  height={c.height}
                  className="h-12 w-12 shrink-0 object-contain"
                />
                <span className="text-lg leading-snug">{c.name}</span>
              </Card>
            </a>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Practitioner directory — search, filters, profiles               */}
      {/* ---------------------------------------------------------------- */}
      <PractitionerDirectory practitioners={practitioners} />
    </>
  );
}
