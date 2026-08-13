import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

    /* Camera is denied everywhere and granted back on the check-in route
       alone. Omitting the key entirely would not do that: the default
       allowlist for camera is already 'self', so silence means allowed. */
    const permissions = (camera: string) =>
      `camera=${camera}, microphone=(), geolocation=(), payment=(self)`;

    return [
      { source: "/:path*", headers: base },
      {
        source: "/m/checkin/:path*",
        headers: [{ key: "Permissions-Policy", value: permissions("(self)") }],
      },
      {
        // Everything that is not the scanner.
        source: "/((?!m/checkin).*)",
        headers: [{ key: "Permissions-Policy", value: permissions("()") }],
      },
    ];
  },
};

export default nextConfig;
