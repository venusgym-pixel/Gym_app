import { encodeQr } from "@/lib/qr-encode";

/* ============================================================================
   A QR rendered as SVG on the server.

   The canvas version in qr-code.tsx is right for a screen, and wrong for
   paper: a canvas is a raster bitmap that prints at whatever pixel density it
   happened to be drawn at, and browsers routinely drop canvas contents from
   print output altogether. An SVG prints at the printer's resolution, which is
   the difference between a code that scans from across the room and one that
   scans if you hold your phone just so.

   Server-rendered, so a poster page carries no JavaScript at all — worth
   having on a screen that exists to be printed once.

   One path of black rectangles rather than a rect per module: a 33x33 code is
   over a thousand elements, and print pipelines get noticeably slower.
   ========================================================================= */

export function QrSvg({
  text,
  title,
  className,
}: {
  text: string;
  title: string;
  className?: string;
}) {
  const grid = encodeQr(text);
  const n = grid.length;

  /* The quiet zone is not decoration — scanners need clear space around the
     code to find its edges, and four modules is what the spec asks for. */
  const quiet = 4;
  const span = n + quiet * 2;

  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      className={className}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <title>{title}</title>
      <rect width={span} height={span} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
