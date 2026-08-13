/* ============================================================================
   Generate the PWA icons.

   Hand-rolled rather than pulled from a dependency: this draws flat shapes on
   a solid ground, which is a few dozen lines of zlib and CRC, against sharp's
   ~10MB of native binaries in the build image for one build-time task.

   Run: node scripts/make-icons.mjs
   Output: public/icon-192.png, icon-512.png, icon-maskable-512.png,
           apple-touch-icon.png

   Re-run only when the mark changes. The PNGs are committed, so Netlify never
   runs this.
   ========================================================================= */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0x19, 0x16, 0x12];      // --color-app-bg
const FG = [0xf6, 0xa0, 0x6b];      // --color-app-accent

/* ── PNG encoding ─────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of size*size*4. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // truecolour + alpha
  // 10..12: compression, filter, interlace — all 0

  /* Filter type 0 (None) on every scanline. The images are flat colour, so
     the smarter filters would buy nothing that deflate does not already. */
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── the mark ─────────────────────────────────────────────────────────────── */

/**
 * A dumbbell: two end blocks and a bar. Reads at 48px on a home screen, which
 * a letter "F" in a thin weight does not, and says what the app is without
 * depending on a font being available to the renderer.
 *
 * @param inset fraction of the canvas left as padding. Maskable icons need
 *   the mark inside the safe zone — Android crops to a circle on some
 *   launchers, and anything in the outer 20% can be cut off.
 */
function draw(size, { inset, radius }) {
  const px = Buffer.alloc(size * size * 4);

  const r = radius * size;
  const set = (x, y, [rr, gg, bb]) => {
    const i = (y * size + x) * 4;
    px[i] = rr; px[i + 1] = gg; px[i + 2] = bb; px[i + 3] = 255;
  };

  // Rounded-square ground.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x, x - (size - 1 - r), 0);
      const dy = Math.max(r - y, y - (size - 1 - r), 0);
      if (dx * dx + dy * dy <= r * r) set(x, y, BG);
      // Outside the corner radius stays transparent.
    }
  }

  const pad = size * inset;
  const w = size - pad * 2;

  /* Proportions of the dumbbell, as fractions of the drawable width.
     The blocks have to be roughly 5x the bar's thickness or the mark reads
     as a letter H — the first attempt did exactly that. */
  const barH    = w * 0.13;
  const blockW  = w * 0.17;
  const blockH  = w * 0.68;
  const collarW = w * 0.07;    // inner collar, the detail that says "weight"
  const collarH = w * 0.34;
  const cy      = size / 2;

  const rect = (x0, y0, x1, y1) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        if (x >= 0 && y >= 0 && x < size && y < size) set(x, y, FG);
      }
    }
  };

  // bar
  rect(pad + blockW, cy - barH / 2, size - pad - blockW, cy + barH / 2);
  // end blocks
  rect(pad, cy - blockH / 2, pad + blockW, cy + blockH / 2);
  rect(size - pad - blockW, cy - blockH / 2, size - pad, cy + blockH / 2);
  // collars, set just inboard of each block
  rect(pad + blockW * 1.35, cy - collarH / 2, pad + blockW * 1.35 + collarW, cy + collarH / 2);
  rect(size - pad - blockW * 1.35 - collarW, cy - collarH / 2,
       size - pad - blockW * 1.35, cy + collarH / 2);

  return px;
}

/* ── write them ───────────────────────────────────────────────────────────── */

mkdirSync("public", { recursive: true });

const outputs = [
  // Standard icons: rounded corners, generous mark.
  ["public/icon-192.png", 192, { inset: 0.20, radius: 0.18 }],
  ["public/icon-512.png", 512, { inset: 0.20, radius: 0.18 }],
  /* Maskable: square to the edges (the launcher applies its own shape) and
     the mark pulled well inside the 80% safe zone. */
  ["public/icon-maskable-512.png", 512, { inset: 0.28, radius: 0 }],
  /* iOS applies its own rounding and does NOT respect transparency — a
     transparent corner renders black — so this one is square too. */
  ["public/apple-touch-icon.png", 180, { inset: 0.20, radius: 0 }],
];

for (const [path, size, opts] of outputs) {
  writeFileSync(path, encodePng(size, draw(size, opts)));
  console.log(`  ${path}  ${size}×${size}`);
}

console.log("\nIcons written.");
