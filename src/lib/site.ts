/**
 * Single source of truth for site-wide chrome: naming, nav structure, contact
 * details and social links. The header, the menu overlay and the footer all
 * read from here so a rename only has to happen once.
 */

export const site = {
  name: "Bluehex",
  caption: "A Code.Sydney company",
  tagline:
    "Claude practitioners from the Code.Sydney community. Find one, hire one.",
  /* Contact details carried over from the Code.Sydney site — Code.Sydney Pty
     Ltd is the legal entity trading as Bluehex, so these stay accurate. Swap
     the address/email here if Bluehex gets its own. */
  email: "info@code.sydney",
  address: ["526/368 Sussex St", "Sydney NSW 2000"],
  legal: ["© 2026 All Rights Reserved.", "Code.Sydney Pty Ltd T/A Bluehex, Vibecamp", "ABN 37 625 436 151"],
  acknowledgement:
    "We acknowledge and pay respects to the First Nations People of Australia, the land in which we live and work. We recognise the strength, resilience and capacity of Aboriginal people and pay respects to Elders past and present.",
  socials: {
    linkedin: "https://au.linkedin.com/company/code.sydney",
    instagram: "https://www.instagram.com/code.sydney/",
    facebook: "https://www.facebook.com/codesyd/",
  },
  /* Served from code.sydney rather than copied into public/. That host is a
     dedicated Fly machine with flat bandwidth; serving the same PDFs from
     Vercel would be metered egress for no benefit. */
  documents: {
    privacy:
      "https://code.sydney/static/pdf/Code.Sydney%20Website%20Privacy%20Policy%202026.pdf",
    terms: "https://code.sydney/static/pdf/Code.Sydney%20Client%20Terms%202026.pdf",
  },
  meetup: "https://www.meetup.com/codesydney/",
} as const;

export type NavGroup = {
  label: string;
  href?: string;
  items?: { label: string; href: string }[];
};

/**
 * The site is a single page plus a contact page, so most of these are in-page
 * anchors. Keep this list to routes and anchors that actually exist — the menu
 * overlay renders it verbatim and would otherwise link into a 404.
 */
export const navigation: NavGroup[] = [
  { label: "Home", href: "/" },
  { label: "Practitioners", href: "/#practitioners" },
  { label: "Contact", href: "/contact" },
];
