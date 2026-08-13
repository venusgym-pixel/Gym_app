import { requireActor } from "@/lib/db/server";
import { Scanner } from "./scanner";

/* M-07 · QR check-in. Client component: it needs the camera. */
export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  await requireActor();
  return <Scanner />;
}
