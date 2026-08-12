"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Close } from "@/components/icons";
import { navigation, site } from "@/lib/site";

/**
 * Fixed page header plus the full-screen menu overlay.
 *
 * This is the only interactive chrome on the site: the overlay toggles open,
 * locks background scroll while it is, and closes on Escape or on navigation.
 * Everything else is static markup.
 */
export function SiteHeader() {
  const pathname = usePathname();

  // The wordmark and the Say Hello button scroll away with the page and fade
  // as they go, matching the original site — there the header is absolutely
  // positioned at the top of the document and picks up a hidden state on
  // scroll, while the menu button lives in a separate fixed wrapper so it is
  // always reachable. `scrolled` drives the fade; the scrolling-up half is the
  // absolute positioning doing its own work.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The overlay is open only while the route it was opened from is still the
  // current one, so navigating away — including via back/forward — closes it
  // without an effect: the header does not unmount on a soft navigation, and
  // resetting `open` from an effect would mean an extra render pass on every
  // route change. Nav links also close it on click, since most of them are
  // in-page anchors that leave the pathname untouched.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenedAt(null);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header
        className={`absolute inset-x-0 top-0 z-30 origin-top transition-[opacity,transform] duration-300 ${
          scrolled ? "scale-y-125 opacity-0" : "scale-y-100 opacity-100"
        }`}
        // Faded out means gone: without this the invisible Say Hello button
        // still swallows clicks over the top of the page.
        aria-hidden={scrolled}
        inert={scrolled}
      >
        <div className="container-x flex items-center justify-between py-5">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/img/favicon/bluehex.svg"
              alt=""
              width={44}
              height={44}
              className="size-11 rounded-full"
              priority
            />
            <span className="hidden text-base font-medium sm:inline">
              {site.name}
              <span className="text-t-muted"> | {site.caption}</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/contact"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-stroke-strong px-5 text-sm font-medium transition-colors hover:bg-ink hover:text-t-invert"
            >
              Say Hello
              <ArrowUpRight className="size-4" />
            </Link>

            {/* Holds the slot the fixed menu button occupies, so Say Hello
                lands beside it rather than underneath it. */}
            <span className="size-11" aria-hidden="true" />
          </div>
        </div>
      </header>

      {/* Menu button. Fixed rather than part of the header, so it survives the
          header scrolling away and stays the way back to the navigation. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
        <div className="container-x flex justify-end py-5">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="pointer-events-auto grid size-11 place-items-center rounded-full bg-ink text-t-invert transition-colors hover:bg-ink-tint"
          >
            {open ? (
              <Close className="size-5" />
            ) : (
              <span className="flex flex-col gap-1.5">
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Menu overlay */}
      <div
        id="site-menu"
        hidden={!open}
        className="fixed inset-0 z-40 overflow-y-auto bg-surface"
      >
        <div className="container-x flex min-h-full flex-col justify-between pt-28 pb-12">
          <nav aria-label="Main">
            <ul className="flex flex-col gap-6">
              {navigation.map((group) => (
                <li key={group.label}>
                  {group.href ? (
                    <Link
                      href={group.href}
                      onClick={() => setOpen(false)}
                      className="display-3 font-display transition-colors hover:text-t-muted"
                    >
                      {group.label}
                    </Link>
                  ) : (
                    <>
                      <p className="display-3 font-display text-t-faint">{group.label}</p>
                      <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
                        {group.items?.map((item) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className="text-base text-t-muted transition-colors hover:text-t-bright"
                            >
                              {item.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <p className="mt-16 text-sm text-t-muted">
            Made with care by{" "}
            <a
              href="https://code.sydney"
              target="_blank"
              rel="noopener noreferrer"
              className="text-t-bright underline-offset-4 hover:underline"
            >
              Code.Sydney
            </a>{" "}
            T/A{" "}
            <a
              href="https://bluehex.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-t-bright underline-offset-4 hover:underline"
            >
              Bluehex
            </a>
            ,{" "}
            <a
              href="https://vibecamp.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-t-bright underline-offset-4 hover:underline"
            >
              Vibecamp
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
