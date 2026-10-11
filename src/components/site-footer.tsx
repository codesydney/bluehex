import Image from "next/image";
import Link from "next/link";
import { Facebook, Instagram, LinkedIn } from "@/components/icons";
import { site } from "@/lib/site";

const footerNav = [
  { label: "Agent Exchange", href: "/" },
  { label: "Claude Practitioners", href: "/practitioners" },
  { label: "Meetups", href: "/meetups" },
  { label: "Contact", href: "/contact" },
];

const documents = [
  { label: "Privacy Policy", href: site.documents.privacy },
  { label: "Terms & conditions", href: site.documents.terms },
];

const socials = [
  { label: "LinkedIn", href: site.socials.linkedin, Icon: LinkedIn },
  { label: "Instagram", href: site.socials.instagram, Icon: Instagram },
  { label: "Facebook", href: site.socials.facebook, Icon: Facebook },
];

/** Xhibiter's footer layout: a brand column with the socials, then columns of
    links, and the legal line along the bottom. */
export function SiteFooter() {
  return (
    <footer className="border-t border-stroke bg-surface">
      <div className="container-x">
        <div className="grid grid-cols-6 gap-x-7 gap-y-14 pt-24 pb-12 md:grid-cols-12">
          <div className="col-span-full sm:col-span-3 md:col-span-4">
            <Link href="/" className="mb-6 inline-flex items-center gap-3">
              <Image
                src="/img/favicon/bluehex.svg"
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-full"
              />
              <span className="font-display text-lg text-t-bright">{site.name}</span>
            </Link>
            <p className="mb-8 text-t-muted">{site.tagline}</p>

            <div className="flex gap-5">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-t-faint transition-colors hover:text-ink"
                >
                  <Icon className="size-5" />
                </a>
              ))}
            </div>
          </div>

          <div className="col-span-full sm:col-span-3 md:col-span-2">
            <h3 className="mb-6 font-display text-sm text-t-bright">Explore</h3>
            <ul className="flex flex-col gap-1">
              {footerNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-t-muted transition-colors hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-full sm:col-span-3 md:col-span-3">
            <h3 className="mb-6 font-display text-sm text-t-bright">Get in touch</h3>
            <p className="mb-4">
              <a
                href={`mailto:${site.email}?subject=Message%20from%20your%20site`}
                className="text-t-muted transition-colors hover:text-ink"
              >
                {site.email}
              </a>
            </p>
            <p className="text-sm leading-relaxed text-t-muted">
              {site.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </div>

          <div className="col-span-full sm:col-span-3 md:col-span-3">
            <h3 className="mb-6 font-display text-sm text-t-bright">Acknowledgement</h3>
            <p className="text-sm leading-relaxed text-t-muted">{site.acknowledgement}</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-stroke py-8 text-sm text-t-muted sm:flex-row">
          <p className="text-center sm:text-left">
            {site.legal.map((line, index) => (
              <span key={line}>
                {index > 0 ? " · " : ""}
                {line}
              </span>
            ))}
          </p>
          <ul className="flex flex-wrap gap-4">
            {documents.map((doc) => (
              <li key={doc.href}>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-ink"
                >
                  {doc.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
