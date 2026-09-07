/* ============================================================================
   Service worker — deliberately close to doing nothing.

   Two reasons it exists:

     1. Chrome will not offer to install a PWA without a service worker that
        has a fetch handler.
     2. The build fonts and CSS can be served from cache, so the app opens
        instantly on a gym's patchy 4G instead of blocking on the network.

   What it very deliberately does NOT do is cache HTML. Every page here is
   server-rendered per session and carries someone's membership, payments or
   phone number. A cached page would be served to the next person to sign in
   on a shared front-desk browser, and a stale one would tell a member their
   membership is live after it lapsed. Both are worse than a spinner.

   So: immutable build assets are cache-first, everything else goes to the
   network and is never stored.
   ========================================================================= */

const CACHE = "fitwell-static-v1";

/* Where a shared payment receipt waits between Android's share sheet and the
   pay screen picking it up. Separate from the asset cache so clearing one
   never takes the other. */
const SHARE_CACHE = "fitwell-share";
const SHARE_KEY = "/__shared-proof";

/* /_next/static is content-hashed, so a URL's contents can never change —
   which is what makes cache-first safe here and nowhere else. */
const isImmutable = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  /^\/(icon-|apple-touch-icon)/.test(url.pathname);

self.addEventListener("install", (event) => {
  // Take over as soon as this version is ready rather than waiting for every
  // tab to close — an update that lands in a week is not an update.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== CACHE && n !== SHARE_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* ── the share target ──────────────────────────────────────────────────
     Android POSTs the shared file here. It is answered entirely on the
     device: the image is put in a cache and the browser is redirected to the
     pay screen, which picks it up.

     Deliberately not forwarded to the server. At this moment nobody has said
     which plan is being paid for, so an upload now would be a file with
     nothing to attach it to — and an abandoned share would leave it there
     forever. Nothing leaves the phone until the member presses Send.

     303 rather than 302: the redirect has to become a GET. A 302 re-sends
     the POST body to the pay screen, which would try to render a page from a
     multipart form. */
  if (request.method === "POST" && new URL(request.url).pathname === "/m/share-payment") {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const file = form.get("proof");
          if (file && file.size > 0) {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              SHARE_KEY,
              new Response(file, {
                headers: {
                  "content-type": file.type || "image/jpeg",
                  "x-filename": encodeURIComponent(file.name || "receipt.jpg"),
                },
              }),
            );
            return Response.redirect("/m/membership?shared=1", 303);
          }
        } catch {
          /* A share with nothing usable in it still has to land somewhere the
             member recognises, rather than on an error page. */
        }
        return Response.redirect("/m/membership", 303);
      })(),
    );
    return;
  }

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (!isImmutable(url)) return; // straight to the network, uncached

  event.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;

      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
