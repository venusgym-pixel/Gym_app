import Link from "next/link";
import type { ReactNode } from "react";
import { Barlow_Condensed, Inter } from "next/font/google";
import { Logo } from "@/components/ui/primitives";
import { site } from "@/lib/site-content";
import { EnquiryForm } from "./enquiry-form";

/* ============================================================================
   The public landing page — what a signed-out visitor sees at "/".

   Built around the one action that matters: booking a free trial. Every
   section either answers an objection (price, coaches, timings, "am I
   fit enough") or carries that CTA, and on a phone it never scrolls out of
   reach thanks to the sticky bar at the bottom.

   Same warm-dark palette as the member app, so the site, the app a member
   installs and the kiosk at the door read as one brand. Words live in
   lib/site-content.ts; photo slots render as labelled placeholders until
   real images are dropped into public/site/.
   ========================================================================= */

/* Barlow Condensed for headlines — extra-bold, uppercase and condensed, the
   register sports brands use for urgency — over Inter for anything a
   visitor actually has to read. Scoped to the landing page via the wrapper's
   CSS variables; the member app keeps Archivo. */
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-site-display",
  display: "swap",
});
const body = Inter({ subsets: ["latin"], variable: "--font-site-body", display: "swap" });

const WA = `https://wa.me/91${site.whatsapp}?text=${encodeURIComponent(`Hi ${site.name}, I'd like to book a free trial.`)}`;

const NAV = [
  ["Programs", "#programs"],
  ["Coaches", "#coaches"],
  ["Pricing", "#pricing"],
  ["Visit", "#visit"],
] as const;

export function Landing() {
  return (
    <div className={`site ${display.variable} ${body.variable} min-h-dvh bg-app-bg-deep text-app-ink antialiased`}>
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Pillars />
        <Programs />
        <AppShowcase />
        <Facilities />
        <Coaches />
        <Pricing />
        <Testimonials />
        <Visit />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <MobileBar />
      <LocalBusinessJsonLd />
    </div>
  );
}

/* ── layout helpers ───────────────────────────────────────────────────────── */

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

function Eyebrow({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <p className={`mb-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-app-accent ${center ? "justify-center" : ""}`}>
      <span className="h-px w-6 bg-app-accent" aria-hidden />
      {children}
    </p>
  );
}

function SectionTitle({ eyebrow, title, sub, center = false }: { eyebrow: string; title: ReactNode; sub?: string; center?: boolean }) {
  return (
    <div className={`mb-10 max-w-[720px] sm:mb-14 ${center ? "mx-auto text-center" : ""}`}>
      <Eyebrow center={center}>{eyebrow}</Eyebrow>
      <h2 className="text-[clamp(2.5rem,1.7rem+3.6vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.03em]">{title}</h2>
      {sub && <p className="mt-4 text-[17px] leading-relaxed text-app-ink/60">{sub}</p>}
    </div>
  );
}

/** A labelled stand-in for a real photo. Swap for next/image once the gym
    has shot its own space — stock photos are what visitors trust least. */
function Photo({ label, className = "", tone = "warm" }: { label: string; className?: string; tone?: "warm" | "sage" | "dark" }) {
  const bg = {
    warm: "radial-gradient(120% 90% at 20% 10%, #3a3d33 0%, #1c1d1a 45%, #0b0b0c 100%)",
    sage: "radial-gradient(120% 90% at 80% 10%, #2f3a14 0%, #161a0d 50%, #0b0b0c 100%)",
    dark: "radial-gradient(120% 90% at 50% 0%, #2a2a2e 0%, #141416 60%, #0b0b0c 100%)",
  }[tone];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: bg }} role="img" aria-label={`Placeholder: ${label}`}>
      <div className="site-grain absolute inset-0 opacity-40" aria-hidden />
      <span className="absolute bottom-3 left-3 rounded-pill border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/70 backdrop-blur">
        Photo · {label}
      </span>
    </div>
  );
}

function PrimaryCta({ children = "Book a free trial", href = "#trial", className = "" }: { children?: ReactNode; href?: string; className?: string }) {
  return (
    <a href={href}
      className={`group inline-flex items-center justify-center gap-2 rounded-pill bg-app-accent px-7 py-4 text-[15px] font-bold text-app-accent-ink transition hover:brightness-110 active:scale-[0.98] ${className}`}>
      {children}
      <Arrow className="transition group-hover:translate-x-0.5" />
    </a>
  );
}

function GhostCta({ children, href, className = "" }: { children: ReactNode; href: string; className?: string }) {
  return (
    <a href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-pill border border-white/20 px-7 py-4 text-[15px] font-semibold text-app-ink transition hover:border-white/50 hover:bg-white/5 ${className}`}>
      {children}
    </a>
  );
}

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-app-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/* ── header ───────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-app-bg-deep/70 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="text-[17px] font-extrabold tracking-[-0.02em]">{site.name}</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Sections">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="text-[14px] font-medium text-app-ink/65 transition hover:text-app-ink">{label}</a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-pill px-4 py-2 text-[14px] font-semibold text-app-ink/80 transition hover:bg-white/5 hover:text-app-ink">
            Member login
          </Link>
          <a href="#trial" className="hidden rounded-pill bg-app-accent px-5 py-2.5 text-[14px] font-bold text-app-accent-ink transition hover:brightness-110 sm:inline-flex">
            Free trial
          </a>
        </div>
      </Container>
    </header>
  );
}

/* ── hero ─────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden pt-16">
      <Photo label="Hero — your gym floor at golden hour" className="absolute inset-0 -z-10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-app-bg-deep/40 via-app-bg-deep/60 to-app-bg-deep" aria-hidden />

      <Container className="flex min-h-[calc(100svh-4rem)] flex-col justify-end pb-14 pt-24 sm:pb-20">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-pill border border-white/15 bg-black/30 px-3.5 py-1.5 text-[13px] text-app-ink/80 backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-app-good opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-app-good" />
          </span>
          {site.area}, {site.city} · Open today {site.hours[0].time}
        </div>

        <h1 className="max-w-[14ch] text-[clamp(3.5rem,1.8rem+8.5vw,8.5rem)] font-extrabold leading-[0.92] tracking-[-0.045em]">
          Stronger starts <em className="text-app-accent">here.</em>
        </h1>
        <p className="mt-6 max-w-[52ch] text-[clamp(1.05rem,0.95rem+0.4vw,1.25rem)] leading-relaxed text-app-ink/75">
          {site.tagline} Coached programs, serious equipment and an app that keeps you on track — at {site.name}, {site.area}.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <PrimaryCta />
          <GhostCta href="#pricing">See membership plans</GhostCta>
        </div>

        <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/10 pt-8 sm:grid-cols-4">
          {site.stats.map((s) => (
            <div key={s.label}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="site-display text-[clamp(2.25rem,1.6rem+2vw,3.25rem)]">{s.value}</dd>
              <dd className="mt-1 text-[13px] text-app-ink/55">{s.label}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

/* ── marquee ──────────────────────────────────────────────────────────────── */

function Marquee() {
  const words = ["Strength", "Conditioning", "Fat loss", "Mobility", "Personal training", "Hypertrophy", "Functional", "Recovery"];
  const row = [...words, ...words];
  return (
    <div className="overflow-hidden border-y border-white/5 bg-app-accent py-4 text-app-accent-ink" aria-hidden>
      <div className="site-marquee flex w-max gap-10 whitespace-nowrap">
        {row.map((w, i) => (
          <span key={i} className="flex items-center gap-10 text-[clamp(1.1rem,0.9rem+1vw,1.6rem)] font-extrabold uppercase tracking-[-0.01em]">
            {w}<span className="text-app-accent-ink/40">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── why us ───────────────────────────────────────────────────────────────── */

function Pillars() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionTitle
          eyebrow="Why members stay"
          title={<>Not just a gym membership.<br className="hidden sm:block" /> <span className="text-app-ink/45">A plan, a coach, and a reason to come back.</span></>}
        />
        <div className="grid gap-px overflow-hidden rounded-[28px] border border-white/8 bg-white/8 sm:grid-cols-2">
          {site.pillars.map((p, i) => (
            <div key={p.title} className="bg-app-bg-deep p-7 transition hover:bg-app-surface-2 sm:p-10">
              <span className="site-display text-[28px] text-app-accent">0{i + 1}</span>
              <h3 className="mt-4 text-[22px] font-bold tracking-[-0.02em]">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-app-ink/60">{p.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── programs ─────────────────────────────────────────────────────────────── */

function Programs() {
  const tones = ["warm", "sage", "dark"] as const;
  return (
    <section id="programs" className="scroll-mt-20 bg-app-bg py-24 sm:py-32">
      <Container>
        <SectionTitle eyebrow="Programs" title="Pick a goal. We'll build the path." sub="Every program starts with an assessment and a plan written for you — not a printout off the wall." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {site.programs.map((p, i) => (
            <article key={p.name} className="group relative overflow-hidden rounded-[24px] border border-white/8 bg-app-surface-2">
              <Photo label={p.name} tone={tones[i % 3]} className="aspect-[4/3] transition duration-500 group-hover:scale-[1.03]" />
              <div className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[20px] font-bold tracking-[-0.02em]">{p.name}</h3>
                  <span className="shrink-0 rounded-pill bg-white/6 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-app-ink/60">{p.tag}</span>
                </div>
                <p className="mt-2 text-[15px] text-app-ink/55">{p.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── the app — the differentiator most local gyms cannot claim ───────────── */

function AppShowcase() {
  const features = [
    ["QR check-in", "Scan at the door. Your visits and streak, tracked automatically."],
    ["Your workout, on your phone", "The plan your coach wrote, with sets, reps and rest timers."],
    ["Progress you can see", "Weight, measurements and lifts charted over time."],
    ["Never miss a renewal", "Reminders before you lapse, and pay by UPI in two taps."],
  ] as const;
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute -right-40 top-20 h-[520px] w-[520px] rounded-full bg-app-accent/15 blur-[120px]" aria-hidden />
      <Container className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <SectionTitle eyebrow="Member app included" title={<>Your gym, <em className="text-app-accent">in your pocket.</em></>}
            sub="Every membership comes with the app. No extra charge, nothing to download from a store — install it straight from the browser." />
          <ul className="grid gap-5 sm:grid-cols-2">
            {features.map(([t, b]) => (
              <li key={t} className="rounded-[20px] border border-white/8 bg-white/[0.02] p-5">
                <h3 className="text-[16px] font-bold">{t}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-app-ink/55">{b}</p>
              </li>
            ))}
          </ul>
        </div>
        <PhoneMock />
      </Container>
    </section>
  );
}

/** A drawn phone rather than a screenshot, so it never goes stale against
    the real member app and needs no asset. */
function PhoneMock() {
  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="rounded-[44px] border border-white/10 bg-gradient-to-b from-[#26262a] to-[#0e0e10] p-3 shadow-[0_40px_120px_-20px_rgba(212,255,58,0.22)]">
        <div className="overflow-hidden rounded-[34px] bg-app-bg px-5 pb-6 pt-8">
          <div className="mx-auto mb-6 h-5 w-24 rounded-pill bg-black" aria-hidden />
          <p className="text-[12px] text-app-ink/50">Good evening</p>
          <p className="text-[22px] font-extrabold tracking-[-0.02em]">Ready to train?</p>

          <div className="mt-5 rounded-[22px] bg-app-accent p-4 text-app-accent-ink">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-70">Today · Push day</p>
            <p className="mt-1 text-[18px] font-extrabold">6 exercises · 55 min</p>
            <div className="mt-3 h-1.5 rounded-pill bg-black/15"><div className="h-full w-2/5 rounded-pill bg-app-accent-ink" /></div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-[18px] bg-app-surface p-3.5">
              <p className="text-[24px] font-extrabold">12</p>
              <p className="text-[11px] text-app-ink/50">Day streak 🔥</p>
            </div>
            <div className="rounded-[18px] bg-app-surface p-3.5">
              <p className="text-[24px] font-extrabold text-app-good">−4.2</p>
              <p className="text-[11px] text-app-ink/50">kg this month</p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-[18px] bg-app-surface p-3.5">
            <div>
              <p className="text-[13px] font-semibold">Quarterly plan</p>
              <p className="text-[11px] text-app-good">Active · 48 days left</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-app-ink text-[10px] font-black text-app-bg">QR</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── facilities ───────────────────────────────────────────────────────────── */

function Facilities() {
  return (
    <section className="bg-app-bg py-24 sm:py-32">
      <Container>
        <SectionTitle eyebrow="The space" title="Built for training, kept like it matters." sub="[A sentence about the floor — size, equipment brands, cleanliness routine.]" />
        <div className="grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[220px] md:grid-cols-4">
          <Photo label={site.facilities[0]} className="col-span-2 row-span-2 rounded-[24px]" />
          <Photo label={site.facilities[1]} tone="sage" className="rounded-[24px]" />
          <Photo label={site.facilities[2]} tone="dark" className="rounded-[24px]" />
          <Photo label={site.facilities[3]} tone="dark" className="rounded-[24px]" />
          <Photo label={site.facilities[4]} className="rounded-[24px]" />
        </div>
        <ul className="mt-8 flex flex-wrap gap-2.5">
          {site.facilities.map((f) => (
            <li key={f} className="rounded-pill border border-white/10 px-4 py-2 text-[14px] text-app-ink/70">{f}</li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ── coaches ──────────────────────────────────────────────────────────────── */

function Coaches() {
  return (
    <section id="coaches" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <SectionTitle eyebrow="Coaches" title="Real coaches. Real certifications." sub="Every member is assigned a trainer who writes your plan and reviews your progress." />
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {site.trainers.map((t, i) => (
            <article key={i} className="w-[72%] shrink-0 snap-start sm:w-auto">
              <Photo label="Coach portrait" tone={i % 2 ? "dark" : "warm"} className="aspect-[3/4] rounded-[24px]" />
              <h3 className="mt-4 text-[18px] font-bold">{t.name}</h3>
              <p className="text-[14px] font-semibold text-app-accent">{t.role}</p>
              <p className="mt-1 text-[13px] text-app-ink/50">{t.cred}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── pricing ──────────────────────────────────────────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-app-bg py-24 sm:py-32">
      <Container>
        <SectionTitle center eyebrow="Membership" title="Simple plans. No hidden fees." sub="The price you see is the price at the desk. First session is on us." />
        <div className="grid items-stretch gap-5 lg:grid-cols-3">
          {site.plans.map((p) => (
            <article key={p.name}
              className={
                "relative flex flex-col rounded-[28px] p-8 " +
                (p.featured
                  ? "bg-app-accent text-app-accent-ink shadow-[0_30px_80px_-30px_rgba(212,255,58,0.45)] lg:-my-4 lg:py-12"
                  : "border border-white/10 bg-app-surface-2")
              }>
              {p.featured && (
                <span className="absolute -top-3 left-8 rounded-pill bg-app-ink px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-app-bg">Most popular</span>
              )}
              <h3 className="text-[18px] font-bold">{p.name}</h3>
              <p className={`mt-1 text-[14px] ${p.featured ? "text-app-accent-ink/70" : "text-app-ink/50"}`}>{p.note}</p>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="site-display text-[clamp(3rem,2.4rem+2.4vw,4rem)]">₹{p.price}</span>
                <span className={p.featured ? "text-app-accent-ink/70" : "text-app-ink/50"}>{p.per}</span>
              </p>
              <ul className="mt-7 grid gap-3 text-[15px]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    {p.featured ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    ) : <Check />}
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-9">
                <a href="#trial"
                  className={
                    "block rounded-pill px-6 py-3.5 text-center text-[15px] font-bold transition " +
                    (p.featured ? "bg-app-ink text-app-bg hover:opacity-90" : "border border-white/15 hover:bg-white/5")
                  }>
                  Start with a free trial
                </a>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-10 text-center text-[13px] text-app-ink/45">
          [Prices inclusive of GST.] Personal training priced separately — ask at the desk.
        </p>
      </Container>
    </section>
  );
}

/* ── testimonials ─────────────────────────────────────────────────────────── */

function Testimonials() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionTitle eyebrow="Members" title="Don't take our word for it." />
        <div className="grid gap-4 md:grid-cols-3">
          {site.testimonials.map((t, i) => (
            <figure key={i} className="flex flex-col rounded-[24px] border border-white/8 bg-white/[0.02] p-7">
              <div className="text-app-accent" aria-label="5 out of 5 stars">★★★★★</div>
              <blockquote className="mt-4 flex-1 text-[17px] leading-relaxed text-app-ink/85">“{t.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-app-avatar text-[14px] font-bold" aria-hidden>
                  {t.name.replace(/[^A-Za-z]/g, "").slice(0, 1) || "M"}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">{t.name}</span>
                  <span className="block text-[13px] text-app-ink/50">{t.meta}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── visit: timings + map ─────────────────────────────────────────────────── */

function Visit() {
  return (
    <section id="visit" className="scroll-mt-20 bg-app-bg py-24 sm:py-32">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <SectionTitle eyebrow="Visit us" title={<>Come see it <br className="hidden sm:block" />for yourself.</>} />
          <dl className="grid gap-6">
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/45">Address</dt>
              <dd className="mt-1.5 text-[17px] leading-relaxed">{site.address}</dd>
              <dd className="mt-2"><a href={site.mapLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-app-accent hover:underline">Get directions <Arrow /></a></dd>
            </div>
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/45">Hours</dt>
              {site.hours.map((h) => (
                <dd key={h.days} className="mt-1.5 flex justify-between gap-6 border-b border-white/8 pb-2 text-[16px]">
                  <span className="text-app-ink/70">{h.days}</span><span className="font-semibold tabular-nums">{h.time}</span>
                </dd>
              ))}
            </div>
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/45">Contact</dt>
              <dd className="mt-1.5 flex flex-wrap gap-2">
                <a href={`tel:+91${site.phone}`} className="rounded-pill border border-white/15 px-4 py-2 text-[14px] font-semibold hover:bg-white/5">Call</a>
                <a href={WA} target="_blank" rel="noopener noreferrer" className="rounded-pill border border-white/15 px-4 py-2 text-[14px] font-semibold hover:bg-white/5">WhatsApp</a>
                <a href={`mailto:${site.email}`} className="rounded-pill border border-white/15 px-4 py-2 text-[14px] font-semibold hover:bg-white/5">Email</a>
              </dd>
            </div>
          </dl>
        </div>
        <div className="min-h-[360px] overflow-hidden rounded-[28px] border border-white/8">
          {site.mapEmbedSrc ? (
            <iframe src={site.mapEmbedSrc} title={`Map to ${site.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              className="h-full min-h-[360px] w-full grayscale-[0.6] invert-[0.9] hue-rotate-180" />
          ) : (
            <Photo label="Google Map embed — set mapEmbedSrc" tone="dark" className="h-full min-h-[360px]" />
          )}
        </div>
      </Container>
    </section>
  );
}

/* ── FAQ — <details>, so it works with no JS and is keyboard-native ───────── */

function Faq() {
  return (
    <section className="py-24 sm:py-32">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <SectionTitle eyebrow="FAQ" title="Questions, answered." sub="Anything else? Message us on WhatsApp — a human replies." />
        <div className="divide-y divide-white/8 border-y border-white/8">
          {site.faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-app-ink/70 transition group-open:rotate-45 group-open:border-app-accent group-open:text-app-accent" aria-hidden>+</span>
              </summary>
              <p className="mt-3 max-w-[60ch] leading-relaxed text-app-ink/60">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── final CTA + enquiry form ─────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section id="trial" className="scroll-mt-20 pb-28 pt-8 sm:pb-32">
      <Container>
        <div className="relative grid gap-10 overflow-hidden rounded-[36px] border border-white/10 bg-app-surface-2 p-7 sm:p-12 lg:grid-cols-2 lg:p-16">
          <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-app-accent/20 blur-[100px]" aria-hidden />
          <div className="relative">
            <Eyebrow>Your first session is free</Eyebrow>
            <h2 className="text-[clamp(2.75rem,1.8rem+4.2vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.04em]">
              Walk in. <br />Train with a coach. <br /><em className="text-app-accent">Decide after.</em>
            </h2>
            <ul className="mt-8 grid gap-3 text-[16px] text-app-ink/75">
              <li className="flex gap-2.5"><Check />Full floor access for the session</li>
              <li className="flex gap-2.5"><Check />A coach walks you through the equipment</li>
              <li className="flex gap-2.5"><Check />Quick assessment and goal chat</li>
              <li className="flex gap-2.5"><Check />Zero pressure, no card required</li>
            </ul>
          </div>
          <div className="relative rounded-[28px] border border-white/8 bg-app-bg-deep/60 p-6 sm:p-8">
            <EnquiryForm whatsapp={site.whatsapp} gymName={site.name} />
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ── footer ───────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-white/8 pb-28 pt-14 md:pb-14">
      <Container className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <span className="text-[17px] font-extrabold">{site.name}</span>
          </div>
          <p className="mt-4 max-w-[36ch] text-[14px] leading-relaxed text-app-ink/50">{site.address}</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/45">Explore</p>
          <ul className="mt-3 grid gap-2 text-[14px] text-app-ink/70">
            {NAV.map(([l, h]) => <li key={h}><a href={h} className="hover:text-app-ink">{l}</a></li>)}
            <li><Link href="/login" className="hover:text-app-ink">Member login</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-ink/45">Follow</p>
          <ul className="mt-3 grid gap-2 text-[14px] text-app-ink/70">
            <li><a href={`https://instagram.com/${site.instagram}`} target="_blank" rel="noopener noreferrer" className="hover:text-app-ink">Instagram · @{site.instagram}</a></li>
            <li><a href={WA} target="_blank" rel="noopener noreferrer" className="hover:text-app-ink">WhatsApp</a></li>
          </ul>
        </div>
      </Container>
      <Container className="mt-12 flex flex-col justify-between gap-2 border-t border-white/8 pt-6 text-[12px] text-app-ink/40 sm:flex-row">
        <span>© {new Date().getFullYear()} {site.name}. All rights reserved.</span>
        <span>[GSTIN: 00XXXXX0000X0XX]</span>
      </Container>
    </footer>
  );
}

/* ── mobile sticky CTA — the trial is one thumb away on every scroll ──────── */

function MobileBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-app-bg-deep/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:hidden">
      <div className="flex gap-2">
        <a href={`tel:+91${site.phone}`} aria-label="Call the gym"
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-pill border border-white/15">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
          </svg>
        </a>
        <PrimaryCta className="h-[52px] flex-1 py-0" />
      </div>
    </div>
  );
}

/* ── structured data, so Google can show hours and address in results ────── */

function LocalBusinessJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    name: site.name,
    telephone: `+91${site.phone}`,
    email: site.email,
    address: { "@type": "PostalAddress", streetAddress: site.address, addressLocality: site.city, addressCountry: "IN" },
    openingHours: site.hours.map((h) => `${h.days} ${h.time}`),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />;
}
