import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Sparkle } from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "solid" | "outline" | "lime" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  solid: "bg-ink text-t-invert shadow-xh-accent-volume hover:bg-ink-tint",
  outline:
    "bg-surface text-ink shadow-xh-white-volume hover:bg-ink-tint hover:text-t-invert hover:shadow-xh-accent-volume",
  lime: "bg-lime text-t-bright hover:brightness-95",
  ghost: "text-t-bright hover:text-t-muted",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-10 px-5 text-sm gap-2",
  md: "h-12 px-7 text-base gap-2.5",
  lg: "h-14 px-8 text-lg gap-3",
};

type ButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  className?: string;
  external?: boolean;
};

/**
 * Pill button. Renders a next/link for internal hrefs and a plain anchor for
 * anything external, mail or file — Link would needlessly hydrate those.
 */
export function Button({
  href,
  children,
  variant = "solid",
  size = "md",
  icon,
  className = "",
  external,
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-all duration-200",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  ].join(" ");

  const content = (
    <>
      <span>{children}</span>
      {icon ?? <ArrowUpRight className="size-[1.1em] shrink-0" />}
    </>
  );

  const isExternal =
    external ?? (href.startsWith("http") || href.startsWith("mailto:") || href.endsWith(".pdf"));

  if (isExternal) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Section furniture                                                  */
/* ------------------------------------------------------------------ */

/** Small starred label that sits above or beside a section heading. */
export function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`flex items-center gap-2 text-sm font-semibold tracking-wide text-ink uppercase ${className}`}
    >
      <Sparkle className="size-4 shrink-0" />
      {children}
    </p>
  );
}

/**
 * Small outlined pill. Used for credential chips and for the scale marker on
 * the engagement cards, so both read as the same class of metadata.
 */
export function Badge({
  children,
  tone = "quiet",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "strong";
  className?: string;
}) {
  const tones = {
    quiet: "border-stroke bg-xh-jacarta-50 text-t-medium",
    strong: "border-stroke-strong bg-surface text-ink",
  };

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** White rounded panel — the repeating surface across every page. Bordered,
    as Xhibiter's cards are, since the page behind it is near-white too. */
export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <Tag className={`rounded-card border border-stroke bg-surface p-8 md:p-10 ${className}`}>
      {children}
    </Tag>
  );
}

/**
 * Oversized band of faint text that scrolls horizontally past both page edges.
 *
 * The track holds two identical runs of the phrase list and travels exactly one
 * run's width, so the second run is sitting where the first started when the
 * animation loops — the seam never shows. Pure CSS: the keyframes live in
 * `globals.css` and honour `prefers-reduced-motion`.
 */
export function Marquee({
  phrases,
  className = "",
}: {
  phrases: string[];
  className?: string;
}) {
  const run = phrases.map((phrase) => (
    <span key={phrase} className="flex items-center gap-8 md:gap-14">
      <span className="display-2 font-display text-t-faint">{phrase}</span>
      <Sparkle className="size-8 shrink-0 text-t-faint md:size-12" />
    </span>
  ));

  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <div className="marquee-track flex w-max items-center whitespace-nowrap">
        <span className="flex items-center gap-8 pr-8 md:gap-14 md:pr-14">{run}</span>
        <span className="flex items-center gap-8 pr-8 md:gap-14 md:pr-14">{run}</span>
      </div>
    </div>
  );
}

/**
 * Page-title block used by every inner page: Xhibiter's page-title banner — a
 * centred eyebrow, heading and supporting copy over the soft gradient.
 */
export function PageHeader({
  label,
  title,
  lead,
  children,
}: {
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <GradientBand as="header" className="pt-36 pb-16 md:pt-44 md:pb-24">
      <div className="container-x flex flex-col items-center text-center">
        <SectionLabel>{label}</SectionLabel>
        <h1 className="display-2 mt-6 max-w-4xl">{title}</h1>
        {lead ? <p className="mt-6 max-w-2xl text-lg text-t-muted">{lead}</p> : null}
        {children ? <div className="mt-10">{children}</div> : null}
      </div>
    </GradientBand>
  );
}

/**
 * The top-of-page hero shared by the three directory tabs: Xhibiter's Home 2
 * hero — centred heading, lead and actions over the strong gradient, with
 * room underneath for whatever closes it (the collaborators strip).
 */
export function Hero({
  label,
  title,
  lead,
  actions,
  children,
}: {
  label?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <GradientBand className="pt-28 pb-20 md:pt-36">
      <div className="container-x">
        <div className="flex flex-col items-center py-16 text-center md:py-24">
          {label ? <SectionLabel className="mb-6">{label}</SectionLabel> : null}
          <h1 className="display-1 max-w-5xl">{title}</h1>
          {lead ? <p className="mt-6 max-w-2xl text-lg text-t-muted">{lead}</p> : null}
          {actions ? <div className="mt-8 flex flex-wrap justify-center gap-4">{actions}</div> : null}
        </div>
        {children}
      </div>
    </GradientBand>
  );
}

/**
 * A full-bleed band with the Xhibiter gradient behind it — `strong` is the
 * hero gradient, `soft` the paler one its sections use. The image is
 * decorative and sits behind the content on its own stacking layer.
 */
export function GradientBand({
  children,
  tone = "strong",
  as: Tag = "section",
  className = "",
  id,
}: {
  children: React.ReactNode;
  tone?: "strong" | "soft";
  as?: React.ElementType;
  className?: string;
  id?: string;
}) {
  return (
    <Tag id={id} className={`relative isolate ${className}`}>
      <Image
        src={tone === "strong" ? "/img/xhibiter/gradient.jpg" : "/img/xhibiter/gradient_light.jpg"}
        alt=""
        width={1920}
        height={900}
        priority={tone === "strong"}
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-top"
      />
      {children}
    </Tag>
  );
}

export function ExternalLinkDisclaimer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="mt-3 text-xs text-t-faint">
      {children}
    </p>
  );
}