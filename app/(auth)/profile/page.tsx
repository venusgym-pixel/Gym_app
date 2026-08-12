"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserDb } from "@/lib/db/client";
import {
  Cta, ErrorNote, Hint, Label, PillInput, Screen, Sub, Title,
} from "@/components/ui/primitives";

/* ============================================================================
   S-06 · Profile completion

   Shown on a member's first sign-in, because reception created their record
   and only has a name and a phone number.

   This screen carries the DPDP Rule 10 gate. If the date of birth makes the
   member under 18, guardian details become mandatory before anything is
   saved — the schema stores that as a member_consents row of type 'guardian'.
   The rule is enforced here rather than by a trigger because reception
   legitimately creates member and consent in one transaction.
   ========================================================================= */

const GENDERS = ["Male", "Female", "Other"] as const;
type Gender = (typeof GENDERS)[number];

function ageOn(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

export default function ProfilePage() {
  const router = useRouter();

  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender>("Male");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianRelation, setGuardianRelation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = useMemo(() => ageOn(dob), [dob]);
  const isMinor = age !== null && age < 18;

  async function save() {
    if (!accepted) {
      setError("Please accept the waiver and terms to continue.");
      return;
    }
    if (isMinor && (!guardianName.trim() || !guardianPhone.trim())) {
      setError("A parent or guardian's name and phone are required for members under 18.");
      return;
    }

    setBusy(true);
    setError(null);

    const db = createBrowserDb();
    const { data: claims } = await db.auth.getClaims();
    const userId = claims?.claims?.sub as string | undefined;
    const gymId = (claims?.claims?.app_metadata as Record<string, unknown> | undefined)
      ?.gym_id as string | undefined;

    if (!userId || !gymId) {
      setBusy(false);
      setError("Your session expired. Please sign in again.");
      return;
    }

    /* Members write their own record through the browser client (ADR-2), so
       this stays portable to Expo. RLS confines the update to their own row. */
    const { error: profileErr } = await db
      .from("members")
      .update({
        date_of_birth: dob || null,
        gender,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
      })
      .eq("user_id", userId)
      .eq("gym_id", gymId);

    if (profileErr) {
      setBusy(false);
      setError("Couldn't save your details. Please try again.");
      return;
    }

    const { data: member } = await db
      .from("members")
      .select("id")
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .single();

    if (member) {
      const consents: Record<string, unknown>[] = [
        { gym_id: gymId, member_id: member.id, consent_type: "waiver", granted: true },
        { gym_id: gymId, member_id: member.id, consent_type: "terms", granted: true },
      ];

      if (isMinor) {
        consents.push({
          gym_id: gymId,
          member_id: member.id,
          consent_type: "guardian",
          granted: true,
          guardian_name: guardianName.trim(),
          guardian_phone: guardianPhone.trim(),
          guardian_relationship: guardianRelation.trim() || null,
          verification_method: "in_app_declaration",
        });
      }

      await db.from("member_consents").insert(consents);
    }

    setBusy(false);
    router.replace("/m");
    router.refresh();
  }

  return (
    <Screen className="pb-10">
      <Title className="text-[28px]">Finish your profile</Title>
      <Sub>Reception created your membership. Two minutes and you’re set.</Sub>

      <div className="mt-6 flex flex-col gap-4">
        <label className="block">
          <Label>Date of birth</Label>
          <PillInput
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </label>

        <div>
          <Label>Gender</Label>
          <div className="flex gap-[9px]">
            {GENDERS.map((g) => {
              const on = g === gender;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className="flex-1 rounded-pill py-3 text-[13px] font-semibold transition-colors"
                  style={{
                    background: on ? "rgb(246 160 107 / 0.16)" : "transparent",
                    border: `1px solid ${on ? "var(--color-app-accent)" : "var(--app-border-strong)"}`,
                    color: on ? "var(--color-app-accent)" : "var(--app-ink-70)",
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <Label>Emergency contact name</Label>
          <PillInput
            value={emergencyName}
            onChange={(e) => setEmergencyName(e.target.value)}
            placeholder="Priya S"
            autoComplete="name"
          />
        </label>

        <label className="block">
          <Label>Emergency contact phone</Label>
          <PillInput
            type="tel"
            inputMode="numeric"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
            placeholder="+91 98860 44120"
            autoComplete="tel"
          />
        </label>

        {/* DPDP Rule 10. Appears only when the DOB says it must. */}
        {isMinor && (
          <div
            className="flex flex-col gap-4 rounded-md p-4"
            style={{ background: "rgb(246 160 107 / 0.10)" }}
          >
            <div>
              <p className="text-[13px] font-semibold text-app-accent">
                Parent or guardian consent
              </p>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-60)" }}>
                You’re {age}. Indian data-protection rules require a parent or
                guardian to consent before we can process your information.
              </p>
            </div>

            <label className="block">
              <Label>Guardian name</Label>
              <PillInput
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <Label>Guardian phone</Label>
              <PillInput
                type="tel"
                inputMode="numeric"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <Label>Relationship</Label>
              <PillInput
                value={guardianRelation}
                onChange={(e) => setGuardianRelation(e.target.value)}
                placeholder="Mother, father, guardian"
              />
            </label>
          </div>
        )}
      </div>

      <label
        className="mt-5 flex cursor-pointer items-start gap-3 rounded-md p-4"
        style={{ background: "var(--color-app-surface)" }}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-[2px] h-5 w-5 flex-none accent-[var(--color-app-accent)]"
        />
        <span className="text-[12.5px] leading-[1.45]" style={{ color: "rgb(249 244 237 / 0.65)" }}>
          I accept the gym waiver and terms of use.
        </span>
      </label>

      <ErrorNote>{error}</ErrorNote>
      {isMinor && !error && (
        <Hint tone="accent">Guardian details are required before you can continue.</Hint>
      )}

      <Cta className="mt-6" onClick={save} loading={busy}>
        Continue
      </Cta>
    </Screen>
  );
}
