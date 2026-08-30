import type { Metadata } from "next";
import { Funnel_Display, Funnel_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";
import "./globals.css";

const funnelDisplay = Funnel_Display({
  variable: "--font-funnel-display",
  subsets: ["latin"],
  display: "swap",
});

const funnelSans = Funnel_Sans({
  variable: "--font-funnel-sans",
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
      className={`${funnelDisplay.variable} ${funnelSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
