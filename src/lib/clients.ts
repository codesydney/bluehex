/**
 * Client roster and testimonials, carried across from the Code.Sydney site.
 * Rendered by the home page grid and the reviews section.
 */

export type Client = {
  name: string;
  logo: string;
  /** Logo files vary wildly in aspect ratio, so each declares its own box. */
  href?: string;
  label?: string;
  blurb: string;
};

export const clients: Client[] = [
  {
    name: "Wundirra Community & Consultancy Services",
    logo: "/img/logos/Logo_Wundirra.png",
    href: "https://wundirra.org.au/",
    label: "wundirra.org.au",
    blurb:
      "Wundirra is proudly Aboriginal, women-led and women-centred. Built by women, for women. We exist to improve outcomes for mob, especially Aboriginal women and girls, through culture, healing, advocacy and self-determination.",
  },
  {
    name: "Prisoners Aid ACT",
    logo: "/img/logos/Logo_PAACT.svg",
    href: "https://www.paact.org.au/",
    label: "paact.org.au",
    blurb:
      "Prisoners Aid ACT aims at a ‘fair go’ for all those involved in the prison system, including the families of detainees and those in court facing imprisonment.",
  },
  {
    name: "The City of Parramatta Eisteddfod Society Inc.",
    logo: "/img/logos/Logo_Eisteddfod.svg",
    href: "https://www.eisteddfodparramatta.org.au/",
    label: "eisteddfodparramatta.org.au",
    blurb:
      "Established in 1951, this not-for-profit volunteer association runs a safe, encouraging performance arts event for young people across Greater Western Sydney and beyond.",
  },
  {
    name: "Sprky",
    logo: "/img/logos/Logo_Sprky.svg",
    href: "https://sprky.au/",
    label: "sprky.au",
    blurb: "Bespoke security camera installation with a full audit trail.",
  },
  {
    name: "Migram Ethical Marketplace",
    logo: "/img/logos/Logo_Migram.svg",
    href: "https://www.migram.au/",
    label: "migram.au",
    blurb:
      "Empowering migrants of refugee background to thrive and build inclusive communities.",
  },
  {
    name: "UST Alumni Australia",
    logo: "/img/logos/Logo_USTAA.svg",
    href: "https://ustaa.au/",
    label: "ustaa.au",
    blurb:
      "The official UST alumni association in Australia, reconnecting Thomasians and nurturing values of competence, compassion, and commitment.",
  },
  {
    name: "National Lived Experience Collective",
    logo: "/img/logos/Logo_NLEC.svg",
    href: "https://www.nlecollective.com.au/",
    label: "nlecollective.com.au",
    blurb:
      "Empowering voices with lived prison experience, connecting advocacy, insight, and opportunity for social change.",
  },
  {
    name: "Aus Phil Chamber of Commerce Inc",
    logo: "/img/logos/Logo_APCCI.svg",
    href: "https://www.apcci.au/",
    label: "apcci.au",
    blurb:
      "Building bridges for trade, innovation, and inclusive growth between Australian and Filipino businesses, with tailored support for members and partners.",
  },
  {
    name: "PAMAI",
    logo: "/img/logos/Logo_PAMAI.svg",
    href: "https://pamai.au",
    label: "pamai.au",
    blurb:
      "Elevating culture, empowering community, and promoting unity among Filipino-Australian and multicultural communities through events, advocacy, and collaboration.",
  },
  {
    name: "Lukas Carey",
    logo: "/img/logos/Logo_Lukas.svg",
    href: "https://www.lukascarey.com.au/",
    label: "lukascarey.com.au",
    blurb:
      "Doctor of Education and lived-experience academic advocating for convict criminology, policy input, and education pathways for people with incarceration experience.",
  },
  {
    name: "M Pleno & Associates",
    logo: "/img/logos/Logo_Pleno.svg",
    href: "https://www.pleno.au/",
    label: "pleno.au",
    blurb:
      "Registered Tax Agents (RTA), Chartered Tax Accountants (CTA), and Certified Public Accountants (CPA).",
  },
  {
    name: "Lloyd Consulting Co",
    logo: "/img/logos/Logo_Lloyd.svg",
    href: "https://www.lloydconsulting.co/",
    label: "lloydconsulting.co",
    blurb:
      "Change management expertise with lived-experience insight, supporting sustainable transformation and systemic change.",
  },
  {
    name: "Chance2Change",
    logo: "/img/logos/Logo_C2C.svg",
    blurb:
      "A lived-experience team delivering compassionate, high-standard cleaning — general cleans, hoarding support, and end-of-lease services — with dignity and care.",
  },
  {
    name: "BRD Accounting and Taxation Services",
    logo: "/img/logos/Logo_BRD.svg",
    href: "https://www.brdtaxation.com.au/",
    label: "brdtaxation.com.au",
    blurb:
      "Family-owned tax and accounting services in Granville with 30+ years of trusted, personalised support at competitive prices.",
  },
  {
    name: "The Many Faces of Albert M.G. Garcia",
    logo: "/img/logos/Logo_AG.svg",
    href: "https://www.albertmggarcia.au/",
    label: "albertmggarcia.au",
    blurb:
      "A biography of a life well lived and a legacy to inspire — capturing the passion, perseverance, and multi-faceted spirit of Albert M.G. Garcia.",
  },
];

export type Testimonial = {
  logo: string;
  quote: string;
  name: string;
  role: string;
};

export const testimonials: Testimonial[] = [
  {
    logo: "/img/logos/Logo_Wundirra.png",
    quote:
      "This has been the second time that Wundirra Community & Consultancy Services have engaged Code.Sydney on an IT project. The first was when I requested them to develop a landing page as an interim while waiting for the full website. Even though Code.Sydney are a volunteer group of developers, their dedication to the satisfactory completion of their projects is undertaken with the utmost professionalism. Code.Sydney kept me updated every step of the way ensuring that every detail is followed and well-executed. Another key differentiator is their level of support after going live, they are always ready to answer our call when help is needed and a regular monthly report of website activities is being generated which can help us determine future improvements.",
    name: "Carly Stanley (M.Crim)",
    role: "CEO & Founder, Wundirra Community & Consultancy Services",
  },
  {
    logo: "/img/logos/Logo_Eisteddfod.svg",
    quote:
      "The ethos and ethics of Code Sydney impressed the members of the Society. Code.Sydney was engaged by the Eisteddfod Society to design, produce and launch a brand new website that provided links to an established performance booking system. The new Website evolved quickly under the guidance of Team Leader, Legendary Stephen. Frequent and precise communication from Stephen and Engramar demonstrated the commitment from the team. Importantly Team Code Sydney was focused on delivering the messages and image that the Eisteddfod Society aimed to convey. During the weekly online meetings we witnessed the Fab Five collaborating to tweak features of the website. New outstanding website successfully launched and lauded by all!",
    name: "Sue Diserens",
    role: "Hon. Secretary and Convenor 2022, City of Parramatta Eisteddfod Society Inc.",
  },
  {
    logo: "/img/logos/Logo_PAACT.svg",
    quote:
      "Prisoners Aid (ACT) has been working with Code.Sydney for the last couple of years. We are extremely grateful for all the support they have provided us – ranging from revamping our website, updating our website and providing advice about a client management system. Thank you, Code.Sydney for always completing any requested work in a timely manner and with a smile.",
    name: "Dr. Caroline Doyle",
    role: "President, Prisoners Aid (ACT)",
  },
];
