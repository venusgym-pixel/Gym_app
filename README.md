# Fitwell — Gym Management + Member Fitness Platform

Product definition, design handoff and a working member-app prototype for an
all-in-one gym platform with three connected experiences: **Admin** runs the gym,
**Trainer** coaches the members, **Member** trains and tracks.

The workflow the whole product exists to serve:

> Member joins → QR check-in → trainer assigned → fitness assessment → workout
> assigned → member logs workout → trainer reviews progress → membership expiry
> detected → automatic reminder → member renews → admin sees retention/revenue.

---

## What's here

| Path | What it is |
|---|---|
| [`gym_management_fitness_platform.md`](gym_management_fitness_platform.md) | The original product brief — 32 sections, feature-by-feature |
| [`docs/ui-screens-spec.md`](docs/ui-screens-spec.md) | **Design handoff.** Foundations, component library, 92 screens with IDs, tagged MVP/P2/Later, plus a 4-sprint prototype build order |
| [`docs/end-to-end-flow.md`](docs/end-to-end-flow.md) | **Engineering handoff.** Master lifecycle loop, 10 detailed journeys, 12 background jobs, state machines, RBAC matrix, notification matrix |
| [`docs/prototype.pdf`](docs/prototype.pdf) | Exported design board |
| [`prototype/`](prototype/) | Working, clickable member-app prototype — 19 screens |

---

## Running the prototype

No build step, no dependencies. Open the file:

```
prototype/index.html
```

Or serve it, if your browser is strict about local files:

```bash
cd prototype
python -m http.server 8000     # then open http://localhost:8000
```

### Two views

- **Board** — all 19 screens laid out on one canvas, the way the design was authored.
- **Flow** — one device at a time, walk the journey with the rail, the Previous/Next
  buttons, or the ← → arrow keys. Every screen is deep-linkable: `index.html#M-13`.

### What's actually live

Not a static mockup — these interactions run:

- OTP keypad with live digit boxes and a resend countdown
- Login mode toggle (OTP / Password) changing the CTA
- Onboarding tour advancing through 3 slides
- Plan selection driving the checkout subtotal, GST, total and new expiry date
- Payment-method selection carrying through to the success screen
- Set logger — weight (±2.5 kg) and rep (±1) steppers, running volume total
- Ticking a set starts the 90-second rest timer, with +30s and skip
- Progress tabs and the weight stepper on the measurement form

### Layout

```
prototype/
  index.html          board shell + flow shell
  css/tokens.css      design-system ramps, spacing, radii, app surface colours
  css/board.css       canvas chrome, screen labels, flow rail
  css/device.css      iOS device frame + app component primitives
  js/state.js         the store — state, actions, derived values
  js/frame.js         device frame (bezel, dynamic island, status bar) + icons
  js/screens.js       the 19 screens
  js/app.js           boot, render, event delegation, flow walker, deep links
```

---

## Design system

Warm-dark, Archivo throughout.

| Role | Value | Used for |
|---|---|---|
| Ground | `#191612` | screen background |
| Surface | `#231f19` | cards, inputs, keypad |
| Ink | `#f9f4ed` | primary text |
| Accent | `#f6a06b` | primary CTAs, active state, current values |
| Success | `#aebf92` | streaks, positive deltas, "assigned" chips |
| Streak | `#c67139 → #8c491a` | gradient on streak cards |

Radii `8 / 16 / 28`, pills at `999px`. Money is formatted `en-IN` (`₹10,030`),
dates as `DD MMM YYYY`.

---

## Notes on the implementation

Two deliberate departures from the source design, both intentional:

1. **The rest ring tracks its own total.** The original divides remaining time by
   a fixed `90`, so pressing "+30s" pushes the value past 100% and emits a
   negative `stroke-dasharray` — which is invalid, and the ring vanishes.
   [`state.js`](prototype/js/state.js) carries a `restTotal` alongside `rest` so
   the arc stays correct at any duration.

2. **Money is computed, not hard-coded.** Plan price, 18% GST, total and savings
   all derive from one `PLANS` table, so changing a price updates every screen.
   The rendered strings match the design's hard-coded ones exactly.

### Known gap in the design

On **M-26 Progress**, the Weight / Strength / Measurements tabs highlight on tap
but the content below never changes — the board only ever specified the Weight
state. The prototype is faithful to that. **Strength and Measurements panels
still need designing** before this screen is built for real.

---

## Roadmap

Phased, from the brief:

1. **Operations** — auth + RBAC, members, plans, payment tracking, QR attendance, reminder engine, dashboard
2. **Fitness** — exercise library, workout builder, assignment, tracker, trainer schedule, progress, assessments
3. **Nutrition** — BMR/TDEE/macros, food database, diet plans, food logging
4. **Growth** — lead CRM, trials, WhatsApp automation, inactivity detection, renewal automation, analytics
5. **Premium** — AI assistants, wearables, multi-location, white-label

The prototype covers the member-facing slice of phases 1–2.
