"use server";

import { createServerDb, requireActor } from "@/lib/db/server";
import { can, type Module } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   Uploading a picture or a clip from the device.

   Everywhere this product asked for a URL, it was assuming someone had
   already put the file on the internet somewhere. Gym staff have the photo on
   the phone in their hand — asking them to host it first is asking them not
   to bother.

   The URL field stays beside this, and is not a fallback: a YouTube link is
   the right answer for a three-minute demonstration, and nothing here should
   push a gym into storing video it does not need to store.
   ========================================================================= */

/** Kept under the Server Action body limit, which is 6MB — see next.config. */
const MAX_BYTES = 5 * 1024 * 1024;

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"];
const VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

export interface UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Put a file in the gym's public bucket and hand back its URL.
 *
 * The `module` field is the thing the file belongs to — the caller must be allowed to
 * edit that, which is also what the storage policy checks. Passing it in
 * rather than assuming one permission keeps a trainer able to illustrate an
 * exercise without giving them the gym's settings.
 */
export async function uploadPublicAsset(form: FormData): Promise<UploadResult> {
  const actor = await requireActor();

  const scope = String(form.get("module") ?? "") as Module;
  if (!["exercises", "equipment", "settings"].includes(scope)) {
    return { ok: false, error: "Unknown upload." };
  }
  if (!can(actor.role as GymRole, scope, "edit")) {
    return { ok: false, error: "You cannot change this." };
  }

  const file = form.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Choose a file." };

  const kind = file.type.startsWith("video/") ? VIDEO : IMAGE;
  if (!kind.includes(file.type)) {
    return { ok: false, error: "Use a JPG, PNG, WEBP or MP4 file." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      /* Says what to do instead rather than only what went wrong: for a long
         clip the URL field beside this is the better answer anyway. */
      error: "That file is over 5MB. Use a shorter clip, or paste a link instead.",
    };
  }

  const db = await createServerDb();

  /* Gym id first: that segment is what the storage policy matches on, so it
     is the tenant boundary rather than tidiness. A fresh name every time
     because the bucket is CDN-cached and a reused one serves the old file. */
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${actor.gymId}/media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await db.storage
    .from("gym-public")
    .upload(path, file, { contentType: file.type });

  if (error) return { ok: false, error: `Could not upload — ${error.message}` };

  const { data } = db.storage.from("gym-public").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
