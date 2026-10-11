import Image from "next/image";

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

/** The "In collaboration with" strip that closes a page hero. Deliberately
    quiet — a row of greyscale logos, like Xhibiter's partner strip — so it
    credits the collaborators without competing with the page's own actions.
    Each one still links out, and comes up to full strength on hover. */
export function Collaborators() {
  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold tracking-widest text-t-faint uppercase">
        In collaboration with
      </p>

      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
        {collaborators.map((c) => (
          <li key={c.name}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-t-muted opacity-60 grayscale transition duration-300 hover:text-t-bright hover:opacity-100"
            >
              <Image
                src={c.logo}
                alt=""
                width={c.width}
                height={c.height}
                className="h-9 w-9 object-contain"
              />
              <span className="font-display text-base">{c.name}</span>
              <span className="sr-only">, opens in a new tab</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
