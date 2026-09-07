import type { MetadataRoute } from "next";

/* ============================================================================
   Web app manifest — what makes the member app installable.

   Without this file there is no "Install app" on Android at all: Chrome
   requires a manifest with a name, a start_url, a standalone display mode and
   an icon of at least 192px before it will offer installation. iOS would
   still allow Add to Home Screen (that is a Safari feature, not something a
   site opts into) but used a SCREENSHOT of the page as the icon, which is
   what made it look broken rather than like an app.

   start_url is /m, not /: a member installing this wants their gym app, not
   the router. Staff work on a desktop browser and have no reason to install
   anything — which is also why the shortcuts below are member-side only.
   ========================================================================= */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fitwell",
    short_name: "Fitwell",
    description: "Your gym membership, workouts and check-in.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",

    /* Matches --color-app-bg, so the splash screen and status bar are the
       same colour the app opens into — a white flash before a dark UI is the
       clearest tell that something is a web page in a costume. */
    background_color: "#191612",
    theme_color: "#191612",
    lang: "en-IN",
    categories: ["health", "fitness"],

    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /* Android launchers crop to their own shape — circle, squircle,
         teardrop. A "maskable" icon is drawn edge to edge with the mark
         inside the middle 80%, so no crop clips it. */
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],

    /* ── Android's share sheet ────────────────────────────────────────────
       After paying in GPay or PhonePe, the member's next move is Share. This
       puts Fitwell in that list, so the receipt goes straight into the app
       instead of becoming a screenshot they have to find again and upload.

       Installed apps only, and Android only — Web Share Target does not
       exist on iOS Safari, where the ordinary upload button remains the
       route. The POST is answered by the service worker rather than a server
       route, so the file never leaves the phone until the member has picked
       which plan they are paying for. */
    share_target: {
      action: "/m/share-payment",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [{ name: "proof", accept: ["image/*"] }],
      },
    },

    /* Long-press the installed icon. Both are one tap from the home screen
       anyway; these save the member the navigation when they are standing at
       the door with the queue behind them. */
    shortcuts: [
      { name: "Check in", short_name: "Check in", url: "/m/checkin" },
      { name: "Today's workout", short_name: "Workout", url: "/m/workout" },
    ],
  };
}
