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
};

export default nextConfig;
