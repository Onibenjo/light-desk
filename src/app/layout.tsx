import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque, Doto, Geist, Geist_Mono } from "next/font/google";
import { THEME_BOOT } from "./themeBoot";
import "./globals.css";

// Self-hosted at build time, so the booth wifi never decides whether the desk
// has its fonts. Roles are set in globals.css.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["wdth", "opsz"], variable: "--font-bricolage" });
const doto = Doto({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-doto" });
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });

export const metadata: Metadata = {
  title: "Lightdesk",
  description: "Citizens of Light Church — Mixlr chat desk",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0908" },
    { media: "(prefers-color-scheme: light)", color: "#f3efe8" },
  ],
  width: "device-width",
  initialScale: 1,
  // Installed to the home screen this fills the whole display, notch included,
  // which is what makes the safe-area gutters in globals.css do anything. No
  // maximumScale or userScalable here on purpose: pinch-zoom stays available.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_BOOT sets data-theme before React loads,
    // so the attribute differs from the server's markup by design.
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${bricolage.variable} ${doto.variable} ${atkinson.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh bg-ink-950 font-text text-ink-100 antialiased">
        <div aria-hidden="true" className="ambient" />
        <div className="relative z-[1]">{children}</div>
      </body>
    </html>
  );
}
