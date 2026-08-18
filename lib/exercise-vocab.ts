/* Shared vocabulary for the exercise library — importable from client
   components and server actions alike ("use server" modules may export only
   async functions, so these cannot live in lib/actions/exercises.ts).

   These match docs/ui-screens-spec.md T-12 and the seeded library. Equipment
   here is the coarse filter label; the specific machine is equipment_id. */

export const EQUIPMENT_KINDS = [
  "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Band",
] as const;

export const MUSCLES = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Legs", "Glutes", "Core", "Cardio", "Mobility",
] as const;

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
