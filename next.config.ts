import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    How long the client-side router may reuse a page it has already fetched.

    Every admin page is force-dynamic, and the default for those is 0 — so
    going Members → Dashboard → Members refetched Members from the server,
    across the world, even though it had been on screen seconds earlier.
    Staff bounce between four or five screens constantly, and that is the
    navigation that felt worst.

    30 seconds is chosen against what the data actually is: attendance and
    payments change through the day, but not within half a minute of looking
    away, and every mutation calls revalidatePath, which evicts this cache
    regardless. So a stale number can only appear if someone ELSE changed it
    in the last 30 seconds — and reception refreshing after a colleague takes
    a payment is a page load, not a back-navigation.
  */
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },

  /*
    Origins allowed to request /_next/* in development.

    Next blocks cross-origin dev asset requests by default, which breaks the
    two ways this app actually gets tested on a phone: the LAN address, and an
    HTTPS tunnel. The tunnel matters specifically because getUserMedia — the
    QR scanner — only runs in a secure context, so a plain http:// LAN address
    can render every screen but never open the camera.

    Development only; Next ignores this in a production build.
  */
  allowedDevOrigins: [
    "192.168.1.35",          // Wi-Fi
    "192.168.1.2",           // Ethernet
    "*.trycloudflare.com",   // cloudflared quick tunnels
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],

  /*
    Security headers.

    These lived in netlify.toml first, and on the deployed site they reached
    static assets and nothing else: /login came back with no X-Frame-Options
    at all, because @netlify/plugin-nextjs serves every page through a
    function and Netlify's [[headers]] do not apply to function responses.
    The pages — the only things an attacker would frame — were the part left
    uncovered. Emitting them from Next covers SSR, static and dev alike.

    Strict-Transport-Security is deliberately absent: Netlify already sends
    it, with preload, and two sources would mean two header values.
  */
  async headers() {
    const base = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];

    /*
      camera=(self) on EVERY route, not just the scanner.

      The previous version denied camera everywhere and granted it back on
      /m/checkin alone, which looked like tidy least-privilege and silently
      broke the feature. Permissions-Policy binds to a DOCUMENT, not a URL,
      and the member app is a single-page app: you open it at /m and tap
      "Scan to check in", which is a client-side navigation. No new document
      is fetched, so the policy from /m — camera=() — was still in force and
      the browser rejected getUserMedia outright. No prompt, no entry in
      Chrome's site settings, just NotAllowedError.

      It only appeared to work when the route was loaded directly, which is
      the one way nobody actually reaches it.

      Same origin, one app, and the only camera use is the scanner, so
      granting it document-wide costs nothing real. microphone, geolocation
      and payment stay denied — nothing here uses them.
    */
    const permissions =
      "camera=(self), microphone=(), geolocation=(), payment=(self)";

    return [
      {
        source: "/:path*",
        headers: [...base, { key: "Permissions-Policy", value: permissions }],
      },
    ];
  },
};

export default nextConfig;
