import Link from "next/link";
import { ArrowRight, Facebook, Instagram, LinkedIn, Sparkle } from "@/components/icons";
import { Card } from "@/components/ui";
import { site } from "@/lib/site";

const footerNav = [
  { label: "Home", href: "/" },
  { label: "Practitioners", href: "/#practitioners" },
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

export function SiteFooter() {
  return (
    <footer className="container-x pt-20 pb-16 md:pt-28">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column — navigation and policy documents */}
        <Card className="flex flex-col justify-between gap-10 self-start">
          <ul className="flex flex-col gap-3">
            {footerNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="display-3 font-display transition-colors hover:text-t-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <ul className="flex flex-col items-start gap-2">
            {documents.map((doc) => (
              <li key={doc.href}>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 text-sm text-t-muted transition-colors hover:text-t-bright"
                >
                  {doc.label}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {/* Right column — contact, legal, acknowledgement, socials */}
        <div className="flex flex-col gap-5">
          <Card className="py-7 md:py-7">
            <p className="flex items-center gap-3 text-lg">
              <Sparkle className="size-5 shrink-0" />
              <a
                href={`mailto:${site.email}?subject=Message%20from%20your%20site`}
                className="underline-offset-4 hover:underline"
              >
                {site.email}
              </a>
            </p>
          </Card>

          <Card className="flex flex-col gap-6 py-8 md:py-8">
            <p className="text-lg leading-snug">
              {site.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
            <p className="text-lg leading-snug">
              {site.legal.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </Card>

          <Card className="py-8 md:py-8">
            <p className="text-sm leading-relaxed text-t-muted">{site.acknowledgement}</p>
          </Card>

          <Card className="py-7 md:py-7">
            <div className="flex items-center gap-5">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-ink transition-opacity hover:opacity-60"
                >
                  <Icon className="size-6" />
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </footer>
  );
}
