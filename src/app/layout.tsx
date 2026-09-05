import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lightdesk",
  description: "Citizens of Light Church — Mixlr chat desk",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  width: "device-width",
  initialScale: 1,
  // Installed to the home screen this fills the whole display, notch included,
  // which is what makes the safe-area gutters in globals.css do anything. No
  // maximumScale or userScalable here on purpose: pinch-zoom stays available.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-[#0b0b0f] text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
