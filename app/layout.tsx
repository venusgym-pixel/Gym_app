import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

/* Self-hosted by next/font at build time — no request to Google at runtime,
   which matters because the member app must render offline from cache. */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fitwell",
    template: "%s · Fitwell",
  },
  description: "Gym management and member fitness platform",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fitwell",
  },
  /* iOS ignores the manifest's icons entirely and looks for this. Without it
     Safari uses a screenshot of the page as the home-screen icon. It also
     ignores transparency, so the file is square rather than rounded — a
     transparent corner would render black against the rounding iOS applies. */
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#191612",
  width: "device-width",
  initialScale: 1,
  /* The member app is a full-bleed phone UI; the set logger and QR scanner
     both break if the viewport rubber-bands on zoom. */
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
