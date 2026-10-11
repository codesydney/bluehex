import type { Metadata } from "next";
import { Cal_Sans, DM_Sans } from "next/font/google";
import Image from "next/image";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";
import "./globals.css";

/* Cal Sans for display, DM Sans for body — the Xhibiter pair. */
const calSans = Cal_Sans({
  variable: "--font-cal-sans",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  /* Every crawler resolves `og:image` as an absolute URL, and the file
     convention below emits a path. `metadataBase` is what the path is resolved
     against — without it Next warns at build time and falls back to localhost,
     which unfurls as nothing. `site.origin` is a constant, deliberately: reading
     an environment variable here would break `next build` with none set, which
     `src/lib/supabase/env.ts` exists to keep working. */
  metadataBase: new URL(site.origin),
  title: {
    default: `${site.name}`,
    template: `%s — ${site.name}`,
  },
  description: site.tagline,
  openGraph: {
    title: `${site.name}`,
    description: site.tagline,
    siteName: site.name,
    type: "website",
  },
  /* The card is 1200×630, and without this X renders it as a small square
     thumbnail — the one failure mode that looks deliberate. The image itself is
     not named here: `opengraph-image.png` sits beside this file and Next emits
     the `og:image` tags from it, `twitter:image` included. */
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${calSans.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <SiteHeader />
        <main className="relative isolate flex-1">
          {/* The Home 2 gradient behind the top of every page, faded out so it
              never ends on a hard edge. Pages that open with their own gradient
              band simply cover it. */}
          <Image
            src="/img/xhibiter/gradient.jpg"
            alt=""
            width={1920}
            height={900}
            priority
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[56rem] w-full object-cover object-top [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
          />
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
