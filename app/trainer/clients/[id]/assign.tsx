"use client";

import { useActionState } from "react";
import { assignPlan } from "@/lib/actions/workouts";
import { Feedback, Field, Select, Submit } from "@/components/admin/forms";
import type { ActionResult } from "@/lib/actions/members";

/* T-11 · Assign a plan. Replacing a live assignment closes the old one, so a
   member always has exactly one plan and "today's workout" stays unambiguous. */

export function AssignPlan({
  memberId, plans, currentPlanId,
}: {
  memberId: string;
  plans: { id: string; name: string; days_per_week: number }[];
  currentPlanId: string | null;
}) {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => assignPlan(form),
    null,
  );

  if (plans.length === 0) {
    return (
      <p className="text-[13px] text-neutral-600">
        No plans exist yet. Seed the starter split from the exercise library.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="member_id" value={memberId} />
      <Field label="Workout plan" required>
        <Select name="plan_id" defaultValue={currentPlanId ?? plans[0].id} required>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.days_per_week} days/week
            </option>
          ))}
        </Select>
      </Field>
      <Feedback state={state} />
      <Submit>{currentPlanId ? "Change plan" : "Assign plan"}</Submit>
    </form>
  );
}
