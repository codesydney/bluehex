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
  title: {
    default: `${site.name}`,
    template: `%s — ${site.name}`,
  },
  description: site.tagline,
  icons: {
    icon: [
      { url: "/img/favicon/bluehex.svg", type: "image/svg+xml" },
      { url: "/img/favicon/favico.ico", sizes: "any" },
    ],
    apple: "/img/favicon/apple-touch-icon.png",
  },
  openGraph: {
    title: `${site.name}`,
    description: site.tagline,
    siteName: site.name,
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${funnelDisplay.variable} ${funnelSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
