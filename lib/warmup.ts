/* ============================================================================
   Warm-up arithmetic.

   Kept out of the component so it can be tested as what it is — a calculation
   a member loads onto a bar — without dragging React into a node test.
   ========================================================================= */

/**
 * Ramp sets up to the first working weight.
 *
 * Percentages rather than fixed jumps, so this reads the same for someone
 * benching 40kg and someone benching 140kg. Rounded to 2.5kg because that is
 * the smallest plate pair on most floors, and floored at the empty bar for
 * barbell lifts — 40% of 50kg is 20kg, which IS the bar, and telling someone
 * to load 17.5kg on a barbell is nonsense.
 */
export function rampSets(topKg: number, barbell: boolean) {
  if (!Number.isFinite(topKg) || topKg <= 0) return [];

  const floor = barbell ? 20 : 2.5;
  const round = (w: number) => Math.max(floor, Math.round(w / 2.5) * 2.5);

  const raw = [
    { weight: round(topKg * 0.4), reps: 8 },
    { weight: round(topKg * 0.6), reps: 5 },
    { weight: round(topKg * 0.8), reps: 3 },
  ];

  /* A light top set collapses these into the same number, and three identical
     sets read as a bug. Keep only strictly increasing ones below the working
     weight. */
  const out: typeof raw = [];
  for (const s of raw) {
    if (s.weight >= topKg) break;
    if (out.length && s.weight <= out[out.length - 1].weight) continue;
    out.push(s);
  }
  return out;
}
