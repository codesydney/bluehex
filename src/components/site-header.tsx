"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Close } from "@/components/icons";
import { navigation, site } from "@/lib/site";

/**
 * Page header plus the full-screen menu overlay.
 *
 * This is the only interactive chrome on the site: the overlay toggles open,
 * takes focus and locks the background while it is, and closes on Escape or on
 * navigation. Everything else is static markup.
 */
export function SiteHeader() {
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // The wordmark and the Say Hello button scroll away with the page and fade
  // as they go, matching the original site — there the header is absolutely
  // positioned at the top of the document and picks up a hidden state on
  // scroll, while the menu button lives in a separate fixed wrapper so it is
  // always reachable. `scrolled` drives the fade; the scrolling-up half is the
  // absolute positioning doing its own work.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 24;

      // The faded header becomes inert, and focus must never be left inside an
      // inert subtree — it would strand the keyboard user on an element that no
      // longer takes input. Hand focus to the menu button, which outlives the
      // fade, before the state flips.
      if (next && headerRef.current?.contains(document.activeElement)) {
        menuButtonRef.current?.focus();
      }

      setScrolled(next);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const menuButton = menuButtonRef.current;
      const overlay = overlayRef.current;
      if (!menuButton || !overlay) return;
      const focusable = [
        menuButton,
        ...overlay.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    // Nav links close the overlay on click, but history navigation does not go
    // through them. Both events are needed: most of the nav is in-page anchors,
    // so back/forward often changes only the hash, which fires `hashchange`
    // without a `popstate`-driven route change.
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", close);
    window.addEventListener("hashchange", close);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // The overlay covers the page, so everything behind it is hidden from sight
    // but still in the tab order. Mark those siblings inert while it is open so
    // the keyboard cannot escape into content nobody can see. The overlay and
    // the menu button opt out by tagging themselves as menu layers.
    const backdrop = Array.from(document.body.children).filter(
      (element) => !element.hasAttribute("data-menu-layer") && !element.hasAttribute("inert"),
    );
    backdrop.forEach((element) => element.setAttribute("inert", ""));

    const previouslyFocused = document.activeElement;
    const menuButton = menuButtonRef.current;
    overlayRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", close);
      window.removeEventListener("hashchange", close);
      backdrop.forEach((element) => element.removeAttribute("inert"));

      // Send focus back where it came from, so closing the menu does not dump
      // the user at the top of the document.
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      } else {
        menuButton?.focus();
      }
    };
  }, [open, close]);

  return (
    <>
      <header
        ref={headerRef}
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
            {/* Screen readers keep the wordmark at every width — it is the only
                accessible name this link has, and the logo is decorative. */}
            <span className="sr-only text-base font-medium sm:not-sr-only sm:inline">
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
      <div data-menu-layer className="pointer-events-none fixed inset-x-0 top-0 z-50">
        <div className="container-x flex justify-end py-5">
          <button
            ref={menuButtonRef}
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

      {/* Menu overlay. A modal in behaviour, so it says so: the backdrop goes
          inert while it is open and focus moves in and back out again. */}
      <div
        data-menu-layer
        id="site-menu"
        ref={overlayRef}
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        tabIndex={-1}
        className="fixed inset-0 z-40 overflow-y-auto bg-surface focus:outline-none"
      >
        <div className="container-x flex min-h-full flex-col justify-between pt-28 pb-12">
          <nav aria-label="Main">
            <ul className="flex flex-col gap-6">
              {navigation.map((group) => (
                <li key={group.label}>
                  {group.href ? (
                    <Link
                      href={group.href}
                      onClick={close}
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
                              onClick={close}
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
