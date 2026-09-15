import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so the booth wifi never decides whether the desk
// has its fonts. Roles are set in globals.css (`font-ui`, `font-text`).
const barlow = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
});
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: "Lightdesk",
  description: "Citizens of Light Church — Mixlr chat desk",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0c0b0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Installed to the home screen this fills the whole display, notch included,
  // which is what makes the safe-area gutters in globals.css do anything. No
  // maximumScale or userScalable here on purpose: pinch-zoom stays available.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${barlow.variable} ${atkinson.variable}`}>
      <body className="min-h-dvh bg-ink-950 font-text text-ink-100 antialiased">{children}</body>
    </html>
  );
}
