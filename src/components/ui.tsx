import Link from "next/link";
import { ArrowUpRight, Sparkle } from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "solid" | "outline" | "lime" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  solid: "bg-ink text-t-invert hover:bg-ink-tint",
  outline: "border border-stroke-strong text-t-bright hover:bg-ink hover:text-t-invert",
  lime: "bg-lime text-ink hover:brightness-95",
  ghost: "text-t-bright hover:text-t-muted",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-10 px-5 text-sm gap-2",
  md: "h-12 px-6 text-base gap-2.5",
  lg: "h-16 px-8 text-xl gap-3",
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
    "inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200",
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
      className={`flex items-center gap-2 text-sm font-medium text-t-medium ${className}`}
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
    quiet: "border-stroke text-t-muted",
    strong: "border-stroke-strong text-t-bright",
  };

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** White rounded panel — the repeating surface across every page. */
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
    <Tag className={`rounded-card bg-surface p-8 md:p-10 ${className}`}>{children}</Tag>
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
 * Page-title block used by every inner page: a starred eyebrow beside a large
 * heading, with optional supporting copy underneath.
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
    <header className="container-x pt-32 pb-16 md:pt-44 md:pb-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-16">
        <SectionLabel className="md:w-40 md:shrink-0 md:pt-4">{label}</SectionLabel>
        <div className="max-w-4xl">
          <h1 className="display-2">{title}</h1>
          {lead ? (
            <p className="mt-8 max-w-2xl text-lg text-t-muted md:text-xl">{lead}</p>
          ) : null}
          {children ? <div className="mt-10">{children}</div> : null}
        </div>
      </div>
    </header>
  );
}
