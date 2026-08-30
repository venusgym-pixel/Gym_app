"use client";

import { useId, useState } from "react";

/* ============================================================================
   Charts.

   Every chart in this product was a row of coloured divs with a `title`
   attribute on each one. That is why the numbers could not be read: a native
   title needs a mouse to hover and a second of patience, and on a phone —
   where most of this app is used — it does not exist at all. There was no way
   to find out what any bar was worth.

   So the hover layer is treated as part of the chart rather than a nicety:
   every mark is a real focusable control that answers to tap, hover and
   keyboard alike, and every chart carries a table view underneath, because a
   tooltip should enhance the data and never be the only way to reach it.

   Geometry follows one set of specs across all of them: bars no thicker than
   24px with a 4px rounded end and a square baseline, a 2px gap in the surface
   colour between neighbours, hairline gridlines a single step off the surface,
   and labels that are selective rather than one per mark.
   ========================================================================= */

export interface Point {
  /** Short axis label. */
  label: string;
  value: number;
  /** Long form for the tooltip — a full date where the axis shows "Mon". */
  full?: string;
  /** An extra line in the tooltip: "3 members", "12 check-ins". */
  sub?: string;
}

interface Common {
  data: Point[];
  /** CSS colour for the marks. Passed in because admin and member surfaces
   *  run different palettes and the chart should not know which it is on. */
  color: string;
  /** Renders a value for the tooltip, the axis and the table. */
  format?: (n: number) => string;
  /** Reads out as the chart's purpose; also the table's caption. */
  caption: string;
  /** Surface behind the chart, for the 2px gaps and the marker rings. */
  surface?: string;
}

const plain = (n: number) => String(Math.round(n));

/* Axis ticks land on round numbers rather than on the data's own maximum:
   "2,000" is a number a reader can measure against, "1,847" is not. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * pow;
    if (candidate >= max) return candidate;
  }
  return 10 * pow;
}

/* ── the readout ──────────────────────────────────────────────────────────── */

function Tooltip({
  point, format, color, align,
}: {
  point: Point; format: (n: number) => string; color: string; align: "left" | "right" | "center";
}) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-md px-2.5 py-1.5 text-left whitespace-nowrap shadow-lg"
      style={{
        background: "var(--color-app-bg, #1c1a17)",
        border: "1px solid rgb(255 255 255 / 0.14)",
        left: align === "left" ? 0 : align === "right" ? undefined : "50%",
        right: align === "right" ? 0 : undefined,
        transform:
          align === "center"
            ? "translate(-50%, -100%)"
            : "translateY(-100%)",
      }}
    >
      {/* Value first and loudest: the reader already knows which bar they are
          pointing at, and came for the number. */}
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="h-[2px] w-3 rounded-pill"
              style={{ background: color }} />
        <span className="text-[13px] font-semibold text-neutral-100 tabular">
          {format(point.value)}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-400">
        {point.full ?? point.label}
      </div>
      {point.sub && (
        <div className="text-[11px] text-neutral-400">{point.sub}</div>
      )}
    </div>
  );
}

/* ── columns ──────────────────────────────────────────────────────────────── */

export function BarChart({
  data,
  color,
  format = plain,
  caption,
  surface = "var(--color-surface)",
  height = 128,
  /** Show every nth axis label, so 24 hours do not collide. */
  labelEvery = 1,
}: Common & { height?: number; labelEvery?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();

  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const peakIndex = data.reduce(
    (best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* Gridlines: hairline, solid, one step off the surface. They carry
            the values that are not directly labelled, so they are what makes
            a bar measurable rather than merely comparable. */}
        {[0, 0.5, 1].map((t) => (
          <div key={t} aria-hidden
               className="absolute inset-x-0 flex items-center"
               style={{ bottom: `${t * 100}%` }}>
            <span className="w-full border-t"
                  style={{ borderColor: "var(--color-neutral-300, rgb(255 255 255 / 0.09))" }} />
            <span className="ml-1.5 shrink-0 text-[10px] tabular"
                  style={{ color: "var(--app-ink-40, #8a8172)" }}>
              {format(max * t)}
            </span>
          </div>
        ))}

        <div
          className="absolute inset-0 flex items-end gap-[2px]"
          onPointerLeave={() => setActive(null)}
        >
          {data.map((d, i) => {
            const pct = max ? (d.value / max) * 100 : 0;
            const on = active === i;
            return (
              <button
                key={`${d.label}-${i}`}
                type="button"
                aria-label={`${d.full ?? d.label}: ${format(d.value)}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive((a) => (a === i ? null : i))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                /* The whole column is the hit target, not the painted bar —
                   a 4px-tall bar for a quiet day is otherwise unhittable. */
                className="group relative flex h-full flex-1 cursor-default items-end justify-center"
              >
                <span
                  className="block w-full transition-opacity"
                  style={{
                    maxWidth: 24,
                    height: `${Math.max(2, pct)}%`,
                    /* 4px rounded data-end, square where it meets the
                       baseline, so the bar reads as growing from the axis. */
                    borderRadius: "4px 4px 0 0",
                    background: d.value > 0 ? color : "var(--color-neutral-300, rgb(255 255 255 / 0.10))",
                    opacity: active === null || on ? 1 : 0.55,
                    outline: on ? `2px solid ${surface}` : undefined,
                  }}
                />
                {on && (
                  <Tooltip
                    point={d} format={format} color={color}
                    align={i < 2 ? "left" : i > data.length - 3 ? "right" : "center"}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={`${d.label}-l-${i}`}
                className="flex-1 text-center text-[10px] whitespace-nowrap"
                style={{ color: "var(--app-ink-40, #8a8172)" }}>
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>

      {/* One direct label, on the extreme. Sparing on purpose: a number over
          every column is chaos and goes unread. */}
      {data[peakIndex]?.value > 0 && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--app-ink-45, #7b7365)" }}>
          Peak {format(data[peakIndex].value)} · {data[peakIndex].full ?? data[peakIndex].label}
        </p>
      )}

      <TableToggle open={table} onToggle={() => setTable((t) => !t)} id={id} />
      {table && <ChartTable id={id} caption={caption} data={data} format={format} />}
    </div>
  );
}

/* ── a line over time ─────────────────────────────────────────────────────── */

export function LineChart({
  data,
  color,
  format = plain,
  caption,
  surface = "var(--color-app-surface)",
  target,
  targetLabel,
  height = 120,
}: Common & { target?: number | null; targetLabel?: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();

  const W = 300, H = 110, PAD = 10;
  const values = [...data.map((p) => p.value), ...(target != null ? [target] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  /* A flat series would divide by zero and draw a line off the top; give it a
     band to sit in the middle of. */
  const span = Math.max(0.5, hi - lo);
  const min = lo - span * 0.15;
  const max = hi + span * 0.15;

  const x = (i: number) => PAD + (i / Math.max(1, data.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);

  const path = data.map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(data.length - 1)} ${H} L${x(0)} ${H} Z`;

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             className="h-full w-full" role="img" aria-label={caption}>
          {target != null && (
            <line x1="0" y1={y(target)} x2={W} y2={y(target)}
                  stroke={color} strokeOpacity="0.4" strokeWidth="1.5"
                  strokeDasharray="4 5" />
          )}

          {/* A wash, not a block — the fill is context for the line, and a
              saturated area would out-shout the data. */}
          <path d={area} fill={color} fillOpacity="0.1" />
          <path d={path} fill="none" stroke={color} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />

          {data.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.value)}
                    r={active === i ? 5 : i === data.length - 1 ? 4.5 : 0}
                    fill={color} stroke={surface} strokeWidth="2"
                    vectorEffect="non-scaling-stroke" />
          ))}
        </svg>

        {/* One invisible column per point, so a reader aims at a date rather
            than at a 2px line. Each is at least a finger wide. */}
        <div className="absolute inset-0 flex" onPointerLeave={() => setActive(null)}>
          {data.map((p, i) => (
            <button
              key={i} type="button"
              aria-label={`${p.full ?? p.label}: ${format(p.value)}`}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive((a) => (a === i ? null : i))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="relative h-full flex-1 cursor-default"
            >
              {active === i && (
                <>
                  <span aria-hidden className="absolute inset-y-0 left-1/2 w-px"
                        style={{ background: color, opacity: 0.35 }} />
                  <Tooltip point={p} format={format} color={color}
                           align={i < 2 ? "left" : i > data.length - 3 ? "right" : "center"} />
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between text-[10px]"
           style={{ color: "var(--app-ink-40, #8a8172)" }}>
        <span>{data[0]?.full ?? data[0]?.label}</span>
        {target != null && targetLabel && <span>{targetLabel}</span>}
        <span>{data.at(-1)?.full ?? data.at(-1)?.label}</span>
      </div>

      <TableToggle open={table} onToggle={() => setTable((t) => !t)} id={id} />
      {table && <ChartTable id={id} caption={caption} data={data} format={format} />}
    </div>
  );
}

/* ── the way to the exact numbers ─────────────────────────────────────────── */

function TableToggle({
  open, onToggle, id,
}: { open: boolean; onToggle: () => void; id: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`${id}-table`}
      className="mt-2 text-[11px] font-semibold underline underline-offset-2"
      style={{ color: "var(--app-ink-45, #7b7365)" }}
    >
      {open ? "Hide the numbers" : "Show the numbers"}
    </button>
  );
}

/* Every value a tooltip shows, reachable without hovering anything. This is
   what makes the tooltip an enhancement rather than a gate — and it is the
   only version of the chart that works with a screen reader, in print, or
   when someone simply wants to read the column. */
function ChartTable({
  id, caption, data, format,
}: { id: string; caption: string; data: Point[]; format: (n: number) => string }) {
  return (
    <div id={`${id}-table`} className="mt-2 max-h-48 overflow-auto rounded-md"
         style={{ background: "var(--color-bg, rgb(255 255 255 / 0.03))" }}>
      <table className="w-full text-[11.5px]">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className="border-b last:border-0"
                style={{ borderColor: "var(--color-neutral-300, rgb(255 255 255 / 0.07))" }}>
              <th scope="row" className="px-2.5 py-1 text-left font-normal"
                  style={{ color: "var(--app-ink-55, #6f6759)" }}>
                {d.full ?? d.label}
              </th>
              <td className="px-2.5 py-1 text-right font-semibold tabular">
                {format(d.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
