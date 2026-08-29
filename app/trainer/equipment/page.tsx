/* ============================================================================
   The equipment list, for trainers.

   Deliberately the same page as /admin/equipment rather than a copy: it
   already gates every control on can(role, 'equipment', …), so a trainer sees
   exactly what their permissions allow and there is no second implementation
   to drift out of step.

   It needs its own route because the proxy keeps trainers out of /admin
   entirely, and the sidebar there is full of screens they cannot open.
   ========================================================================= */
export { default } from "@/app/admin/equipment/page";

export const dynamic = "force-dynamic";
