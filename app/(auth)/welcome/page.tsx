"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cta, Dots, Kicker, Screen, Title } from "@/components/ui/primitives";

/* ============================================================================
   S-05 · Onboarding tour

   Three slides, shown once after a member's first sign-in. Copy is lifted from
   the prototype: it sells the loop the product is actually built around —
   check in, train, see proof.
   ========================================================================= */

const SLIDES = [
  {
    kicker: "Check in",
    title: "One tap at the door",
    body: "Scan the QR at reception. Your streak and attendance record themselves.",
  },
  {
    kicker: "Train",
    title: "Your trainer’s plan, on your phone",
    body: "Every set logged, with last week’s numbers and the next target already suggested.",
  },
  {
    kicker: "Track",
    title: "Proof it’s working",
    body: "Weight, measurements and lifts over time — plus renewal reminders before you ever lapse.",
  },
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  function advance() {
    if (last) router.replace("/profile");
    else setI((n) => n + 1);
  }

  return (
    <Screen>
      <button
        type="button"
        onClick={() => router.replace("/profile")}
        className="self-end text-[13px]"
        style={{ color: "var(--app-ink-50)" }}
      >
        Skip
      </button>

      {/* Illustration slot. Deliberately a placeholder: the design board marks
          this "illustration" and no asset has been produced yet. */}
      <div
        className="relative mt-[14px] mb-[30px] grid h-[300px] place-items-center overflow-hidden rounded-lg"
        style={{ background: "var(--color-app-surface)" }}
        aria-hidden
      >
        <div className="absolute h-[230px] w-[230px] rounded-pill"
             style={{ background: "rgb(246 160 107 / 0.12)" }} />
        <div className="absolute h-[140px] w-[140px] rounded-pill"
             style={{ background: "rgb(174 191 146 / 0.16)" }} />
      </div>

      <Kicker>{slide.kicker}</Kicker>
      <Title className="mt-[10px] text-[30px] leading-[1.14]">{slide.title}</Title>
      <p className="mt-3 max-w-[310px] text-[14px] leading-[1.5]"
         style={{ color: "var(--app-ink-60)" }}>
        {slide.body}
      </p>

      <div className="mt-[26px]">
        <Dots count={SLIDES.length} active={i} />
      </div>

      <Cta pinned onClick={advance}>{last ? "Get started" : "Next"}</Cta>
    </Screen>
  );
}
