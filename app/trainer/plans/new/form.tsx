"use client";

import { useActionState } from "react";
import { createPlan } from "@/lib/actions/plan-builder";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";
import type { ActionResult } from "@/lib/actions/members";

/* T-10, step one: name the plan and pick the split size. Success redirects
   into the editor with the days already scaffolded. */

export function NewPlanForm() {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => createPlan(form),
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <Field label="Plan name" required>
        <Input name="name" required minLength={2} placeholder="Push Pull Legs · intermediate" />
      </Field>
      <Field label="Goal" hint="Shows on the member's phone under the plan name.">
        <Input name="goal" placeholder="Build strength" />
      </Field>
      <Field label="Days per week" required>
        <Select name="days_per_week" defaultValue="3">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-neutral-700">
        <input type="checkbox" name="is_template" value="true" className="h-4 w-4" />
        Template — a starting point trainers copy from, shown first when assigning
      </label>

      <Feedback state={state} />
      <Submit>Create and open the editor</Submit>
    </form>
  );
}
