"use client";

import { useEffect, useRef } from "react";
import { encodeQr } from "@/lib/qr-encode";

/* A QR drawn on a canvas, shared by the kiosk and the member-claim screen.
   Always on white with a quiet zone: scanners fail on dark or flush-edged
   codes, and the one place this is used is a counter screen being read by
   somebody else's phone camera at arm's length. */
export function QrCode({ text, size = 190 }: { text: string; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const qr = encodeQr(text);
    const quiet = 2;
    const scale = Math.floor(el.width / (qr.length + quiet * 2));
    const offset = Math.floor((el.width - scale * qr.length) / 2);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.fillStyle = "#000000";
    for (let y = 0; y < qr.length; y++) {
      for (let x = 0; x < qr.length; x++) {
        if (qr[y][x]) ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
      }
    }
  }, [text, size]);

  return (
    <canvas
      ref={canvas}
      width={size}
      height={size}
      className="rounded-md"
      style={{ width: size, height: size, background: "#fff" }}
    />
  );
}
