import Image from "next/image";
import { Card } from "@/components/ui";

/* Communities Bluehex runs alongside. Logos are the collaborators' own
   artwork, trimmed to their bounding box and given a transparent
   background — see public/img/partners/. */
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

/** The "In collaboration with" strip that closes a page hero. */
export function Collaborators() {
  return (
    <>
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
    </>
  );
}
