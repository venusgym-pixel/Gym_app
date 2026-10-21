"use client";

import { useState } from "react";

/* ============================================================================
   Free-trial enquiry on the landing page.

   Opens WhatsApp with the enquiry pre-written rather than posting to the
   leads table. A signed-out visitor has no session, and RLS rightly gives
   an anonymous caller no insert on leads — opening that up would mean a
   public, spammable write path into every gym's CRM. WhatsApp is where the
   desk already answers enquiries, and the owner logs it in A-31 from there.
   ========================================================================= */

const GOALS = ["Lose fat", "Build strength", "General fitness", "Personal training"] as const;
const SLOTS = ["Early morning", "Morning", "Evening", "Late evening"] as const;

export function EnquiryForm({ whatsapp, gymName }: { whatsapp: string; gymName: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [goal, setGoal] = useState<string>(GOALS[0]);
  const [slot, setSlot] = useState<string>(SLOTS[2]);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "").replace(/^91/, "");
    if (name.trim().length < 2) return setError("Tell us your name.");
    if (!/^[6-9]\d{9}$/.test(digits)) return setError("Enter a 10-digit mobile number.");
    setError(null);

    const text =
      `Hi ${gymName}! I'd like to book a free trial.\n` +
      `Name: ${name.trim()}\nPhone: ${digits}\nGoal: ${goal}\nPreferred time: ${slot}`;
    window.open(`https://wa.me/91${whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  const field =
    "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] " +
    "text-app-ink placeholder:text-app-ink/35 outline-none transition " +
    "focus:border-app-accent focus:bg-white/[0.07]";

  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      <label className="grid gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/55">Name</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)}
          autoComplete="name" placeholder="Your full name" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/55">Mobile</span>
        <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)}
          inputMode="numeric" autoComplete="tel-national" placeholder="10-digit number" />
      </label>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/55">Goal</legend>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip key={g} active={goal === g} onClick={() => setGoal(g)}>{g}</Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/55">Best time</legend>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((s) => (
            <Chip key={s} active={slot === s} onClick={() => setSlot(s)}>{s}</Chip>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-[14px] text-[#ff8a7a]">{error}</p>}

      <button type="submit"
        className="mt-2 rounded-pill bg-app-accent px-6 py-4 text-[16px] font-bold text-app-accent-ink transition hover:brightness-110 active:scale-[0.98]">
        Book my free trial on WhatsApp
      </button>
      <p className="text-center text-[12px] text-app-ink/45">
        We reply within working hours. No spam, no payment needed.
      </p>
    </form>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={
        "rounded-pill border px-3.5 py-2 text-[13px] font-medium transition " +
        (active
          ? "border-app-accent bg-app-accent/15 text-app-accent"
          : "border-white/10 text-app-ink/70 hover:border-white/25")
      }>
      {children}
    </button>
  );
}
