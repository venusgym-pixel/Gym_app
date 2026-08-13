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

/*
  Some Android hosts ignore the viewport meta tag and lay the page out at a
  fixed ~980px, then scale the result down to fit. Everything then renders as
  a tiny centred strip: correct CSS, wrong canvas. The two that do it are
  Chrome with "Desktop site" enabled, and a plain WebView shortcut — what
  "Add to home screen" produces in Samsung Internet, Mi Browser and most
  in-app browsers, as opposed to Chrome's Install app.

  Rewriting the meta at runtime forces a re-layout at the real width. The
  guard is what keeps this from firing on a genuine tablet or laptop: it
  needs a viewport far wider than 700px while the physical screen is
  narrower than that, which only happens when the layout width is a fiction.

  Inline and before paint, so the correction lands before the first frame
  rather than as a visible reflow.
*/
const FIX_VIEWPORT = `(function(){try{
  var w=window.innerWidth, s=window.screen&&window.screen.width;
  if(w>700 && s && s<700){
    var m=document.querySelector('meta[name=viewport]');
    if(m){m.setAttribute('content',
      'width=device-width, initial-scale=1, viewport-fit=cover');}
  }
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FIX_VIEWPORT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
