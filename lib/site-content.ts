/* ============================================================================
   The public landing page's words, numbers and contact details.

   Everything a visitor reads on "/" comes from here, so filling in the real
   gym is one file and no JSX. Anything still in [square brackets] is a
   placeholder — `grep -n "\[" lib/site-content.ts` lists what is left.

   Kept out of the database on purpose: the page is for signed-out visitors,
   and RLS gives an anonymous session nothing to read. Plans and prices here
   are the marketing copy, not the billing source of truth in /admin/plans —
   keep the two in step by hand.
   ========================================================================= */

export const site = {
  name: "[Gym Name]",
  tagline: "[Your one-line promise — e.g. Train with intent.]",
  area: "[Area]",
  city: "[City]",

  /* 10-digit mobile, no +91. Used for tel: and wa.me links. */
  phone: "9000000000",
  whatsapp: "9000000000",
  email: "[hello@yourgym.in]",
  instagram: "[yourgym]",

  address: "[Building, Street, Area, City – PIN]",
  /* Paste the src of Google Maps → Share → Embed a map. Empty shows a
     placeholder panel instead of a broken frame. */
  mapEmbedSrc: "",
  mapLink: "https://maps.google.com/?q=[Gym+Name]",

  hours: [
    { days: "Mon – Sat", time: "[5:00 AM – 10:30 PM]" },
    { days: "Sunday", time: "[6:00 AM – 12:00 PM]" },
  ],

  /* Shown under the hero. Use real numbers or delete the row — invented
     ones are the fastest way to lose a visitor who checks. */
  stats: [
    { value: "[1,200+]", label: "Members trained" },
    { value: "[8,000]", label: "Sq ft floor" },
    { value: "[12]", label: "Certified coaches" },
    { value: "[4.9★]", label: "Google rating" },
  ],

  pillars: [
    {
      title: "Coached, not left alone",
      body: "Every member gets an assessment and a written plan from a trainer — then a check-in when progress stalls.",
    },
    {
      title: "Equipment that is free when you are",
      body: "[Brand] racks, plate-loaded machines and a full dumbbell run to [50 kg], laid out so peak hour does not mean waiting.",
    },
    {
      title: "An app that runs your membership",
      body: "QR check-in at the door, your workout on your phone, renewal reminders before you lapse — no paper cards.",
    },
    {
      title: "Honest pricing",
      body: "The price on this page is the price at the desk. No joining-fee surprises, no lock-in contracts.",
    },
  ],

  programs: [
    { name: "Strength & Conditioning", detail: "Barbell fundamentals, progressive programs", tag: "All levels" },
    { name: "Fat Loss", detail: "Training plus nutrition guidance, weekly check-ins", tag: "Popular" },
    { name: "Personal Training", detail: "1-on-1 sessions with a dedicated coach", tag: "Premium" },
    { name: "[Group Classes]", detail: "[HIIT, Zumba, Yoga — list what you run]", tag: "[Schedule]" },
    { name: "Women's Strength", detail: "[Dedicated slots / coach — or remove]", tag: "[Mornings]" },
    { name: "Transformation", detail: "[12-week program with before/after tracking]", tag: "[12 weeks]" },
  ],

  facilities: [
    "[Free-weights zone]",
    "[Cardio deck]",
    "[Functional turf]",
    "[Changing rooms & lockers]",
    "[Steam / shower]",
    "[Parking]",
  ],

  trainers: [
    { name: "[Coach Name]", role: "Head Coach", cred: "[Certification · 10 yrs]" },
    { name: "[Coach Name]", role: "Strength Coach", cred: "[Certification · 6 yrs]" },
    { name: "[Coach Name]", role: "Fat-loss Specialist", cred: "[Certification · 5 yrs]" },
    { name: "[Coach Name]", role: "Mobility & Yoga", cred: "[Certification · 4 yrs]" },
  ],

  /* Rupees, GST-inclusive if that is how you quote at the desk. */
  plans: [
    {
      name: "Monthly",
      price: "[2,499]",
      per: "/ month",
      note: "Try us without commitment",
      features: ["Full gym access", "Member app & QR check-in", "Starter assessment"],
      featured: false,
    },
    {
      name: "Quarterly",
      price: "[6,499]",
      per: "/ 3 months",
      note: "[Save ₹1,000]",
      features: ["Everything in Monthly", "Trainer-written workout plan", "Monthly progress check", "[1 freeze of 7 days]"],
      featured: true,
    },
    {
      name: "Annual",
      price: "[19,999]",
      per: "/ year",
      note: "[Lowest per-month price]",
      features: ["Everything in Quarterly", "[2 PT sessions included]", "[Freeze up to 30 days]", "[Guest passes]"],
      featured: false,
    },
  ],

  testimonials: [
    { quote: "[What a real member said — results, coaching, atmosphere.]", name: "[Member Name]", meta: "[Member since 2024]" },
    { quote: "[A second quote — ideally a different goal, e.g. strength vs fat loss.]", name: "[Member Name]", meta: "[Lost 12 kg]" },
    { quote: "[A third — the app, the cleanliness, the timings.]", name: "[Member Name]", meta: "[Morning regular]" },
  ],

  faqs: [
    { q: "Is the first visit really free?", a: "[Yes — one free trial session with a coach walkthrough. Bring ID and gym shoes.]" },
    { q: "Do I need experience?", a: "No. Every new member starts with an assessment and a plan pitched at where they are today." },
    { q: "Can I pause my membership?", a: "[Quarterly and annual plans can be frozen — see the plan for how many days.]" },
    { q: "How do I check in?", a: "Scan the QR at the entrance with the member app. Your visits, plan and renewal date all live there." },
    { q: "What are the payment options?", a: "[UPI, card or cash at the desk. Renewals can be paid by UPI from the app.]" },
    { q: "Is there parking?", a: "[Answer for your location.]" },
  ],
};

export type SiteContent = typeof site;
