# Making a web app fill a phone

The layout rules this project uses, extracted so another app can adopt them.
Written after a sibling app rendered as a narrow strip down the middle of a
phone with two-thirds of the screen empty.

Each rule is here because leaving it out produced a specific, visible bug.

---

## 1. The viewport meta tag

**This is almost certainly your problem if content looks small and centred with
wide empty margins.**

Without it, a mobile browser assumes it is rendering a desktop page, lays out at
roughly **980 CSS pixels wide**, then scales the whole thing down to fit the
physical screen. A `max-w-md` container is 448px — inside an assumed 980px
viewport that is under half the width, centred, with everything shrunk. Exactly
the strip-down-the-middle look.

Next.js App Router:

```ts
// app/layout.tsx
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,      // keep zoom; disabling it is an accessibility failure
  viewportFit: "cover", // required for safe-area insets to report anything
};
```

Plain HTML:

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

**Do not set `maximumScale: 1` or `user-scalable=no`.** People pinch to read
serial numbers, hallmarks and small print. Blocking that is a real barrier for
anyone with imperfect eyesight, and it buys nothing.

`viewportFit: "cover"` is not optional if you want notch handling — without it
`env(safe-area-inset-*)` returns zero everywhere and rule 4 silently does
nothing.

---

## 2. Full height, honestly

```tsx
<html lang="en" className="h-full">
  <body className="min-h-full antialiased">
```

and the shell:

```tsx
<div className="min-h-dvh lg:flex">
  <aside>…sidebar, desktop only…</aside>
  <div className="flex min-w-0 flex-1 flex-col">
    <header className="sticky top-0 z-30">…</header>
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-8">
      {children}
    </main>
  </div>
</div>
```

Three things doing work here:

- **`min-h-dvh`** — the page fills the screen even when the content does not, so
  short screens do not end halfway down with a void underneath.
- **`min-w-0` on the flex child** — a flex item will not shrink below its
  content. Without this one long word anywhere widens the whole column.
- **`pb-24` on `main`** — clearance for the fixed bottom nav. Without it the last
  card sits underneath the navigation and cannot be reached.

---

## 3. `dvh`, never `vh`

On mobile Safari, `vh` measures the viewport **as if the browser toolbars were
hidden**. So `90vh` is taller than what is actually on screen, and the bottom of
a modal — usually its Confirm and Cancel buttons — sits underneath the browser
chrome with nothing indicating it is there.

```
max-h-[90vh]   ✗   extends under the toolbar
max-h-[90dvh]  ✓   fits what is visible
```

`dvh` is supported everywhere that matters now. Use it for every full-height or
near-full-height measurement.

---

## 4. Safe areas, at every screen edge

Anything pinned to an edge needs an inset or the notch and the home indicator
will sit on top of it. This matters most once the app is installed to the Home
Screen, because then it runs genuinely full-screen with no browser chrome
absorbing the gap.

```tsx
{/* bottom nav */}
<nav className="fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]">

{/* something floating above that nav */}
<div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))]">

{/* a full-screen overlay's close button */}
<button className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3">

{/* a bottom sheet's footer */}
<div className="pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
```

The `calc()` form is the one people forget. A bare `bottom-20` does not clear a
nav that is itself `5rem + safe-area` tall.

---

## 5. Nothing may push the page sideways

One overflowing element anywhere makes **every** screen look broken: the content
sits wider than the viewport, the page scrolls horizontally, and each card looks
clipped on the right while keeping its padding on the left. It reads as "the
layout is broken", not "one element is too wide".

```css
html, body {
  overflow-x: clip;
  max-width: 100%;
}

/* Grid and flex children default to min-width: auto and will not shrink
   below their content. One long word widens the whole column. */
main :where(.grid) > * {
  min-width: 0;
}
```

**`clip`, not `hidden`.** `overflow-x: hidden` turns the element into a scroll
container, which silently breaks `position: sticky` — and your header and bottom
nav almost certainly depend on it.

Then audit for the usual culprits:

| Pattern | Why it overflows |
|---|---|
| `w-screen`, `100vw` | ignores the scrollbar; wider than the viewport |
| fixed `w-[420px]` | narrower phones exist |
| `<table>` | needs a wrapper with `overflow-x-auto` |
| user text in a flex row | needs `min-w-0` and `truncate` or `break-words` |
| `-mx-*` | fine only if the parent's padding is larger |

---

## 6. Every multi-column grid needs a breakpoint

```
grid-cols-2                 ✗  two columns on a 320px phone
grid gap-3 sm:grid-cols-2   ✓  stacks on phones, splits from 640px
```

The exception is small stat tiles — two or three short numbers side by side are
fine unprefixed. Anything containing a sentence needs the breakpoint.

Button rows want `flex-wrap`, always. A row of three actions fits in English and
overflows in Tamil, and you will not notice until somebody switches language.

---

## 7. Installing to the Home Screen

iOS **ignores SVG** for home-screen icons and does **not** read the manifest for
one. With only an SVG, "Add to Home Screen" screenshots your page and uses that
— so a carefully designed app lands on the home screen showing a blurry login
form.

You need PNGs:

```ts
// app/layout.tsx
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Your App", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};
```

```json
{
  "name": "Your App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#faf8f5",
  "theme_color": "#b98900",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

The **maskable** variant is a separate image, not the same file relabelled.
Android crops maskable icons to whatever shape the launcher wants, taking up to
20% off each edge — so draw the artwork at about 72% scale with no rounded
corner of its own. The launcher supplies the shape.

Installing must be done in **Safari** on iOS. Chrome on iOS cannot add to the
Home Screen.

---

## 8. Printing, if you print anything

`window.print()` prints the entire page — navigation, every card, the lot. To
print one element:

```css
@media print {
  body * { visibility: hidden; }
  .print-target, .print-target * { visibility: visible; }
  .print-target {
    position: fixed;
    top: 0;
    left: 0;
  }
}
```

`visibility`, not `display: none` — hiding an ancestor takes the target down
with it, whereas visibility is inherited and can be turned back on for one
descendant. Use real units (`mm`, `pt`) for anything going on paper.

---

## The order to fix them in

1. **Viewport meta** — if this is missing, nothing else you change will look right
2. `min-h-dvh` on the shell, `min-w-0` on flex children
3. `overflow-x: clip` and the grid `min-width: 0` rule
4. Safe-area insets on anything pinned to an edge
5. `vh` → `dvh`
6. Breakpoints on grids, `flex-wrap` on button rows
7. PNG icons and the manifest

## How to check without a device

```bash
# any of these appearing is worth a look
grep -rn "100vh\|\[.*vh\]" src/
grep -rn "w-screen\|100vw" src/
grep -rnE '(^|[^:a-z-])grid-cols-[2-9]' src/ | grep -vE '(sm|md|lg):'
grep -rn "user-scalable=no\|maximum-scale=1" .
```

In browser devtools, device toolbar at **320px wide** — the narrowest phone
still in use. If the page scrolls sideways at 320px, something is too wide.
