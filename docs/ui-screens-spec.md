# Gym Platform — UI Screen Spec (Design Handoff)

> **Purpose of this document:** hand this to a designer to produce a clickable prototype.
> Everything here is derived from `gym_management_fitness_platform.md`.
>
> **Prototype scope recommendation:** design the `MVP` screens first (~42 screens).
> `P2` and `Later` are listed so the design system is future-proof, but should not block the first prototype.

---

## 0. Design Foundations (build these before screens)

### 0.1 Platforms & canvases

| Product | Primary platform | Design canvas | Breakpoints |
|---|---|---|---|
| **Admin console** | Web, desktop-first | 1440 × 900 | 1440 / 1024 / 768 |
| **Trainer portal** | Tablet + mobile web (app later) | 834 × 1194 (tablet), 390 × 844 (mobile) | 834 / 390 |
| **Member app** | Native mobile (iOS + Android) | 390 × 844 | 390 / 430 |
| **Front-desk kiosk** | Tablet landscape, fixed | 1280 × 800 | single |

### 0.2 Theme direction

- **Member app** — dark-first. Energetic, high-contrast, big numbers, gym/athletic feel.
- **Admin console** — light-first. Dense, data-heavy, calm, scannable. Dark mode as secondary.
- **Trainer portal** — inherits admin light theme, but with member-app card patterns.
- All three must ship **light + dark** token sets.

### 0.3 Color tokens (semantic, not literal — designer picks the hex)

```
--bg-base / --bg-surface / --bg-elevated / --bg-inverse
--text-primary / --text-secondary / --text-muted / --text-inverse
--border-subtle / --border-strong
--brand-primary / --brand-primary-hover / --brand-subtle
--accent-energy         (streaks, PRs, gamification)

Status colors — these drive the whole product, define them first:
--status-active         (membership active, payment paid, session confirmed)
--status-expiring       (membership 1–30 days left, payment due soon)
--status-expired        (membership expired, payment overdue)
--status-frozen         (membership paused)
--status-risk           (member at risk / inactivity alert)
--status-trial          (trial / guest pass)
--status-info           (neutral system messages)
```

> **Note for designer:** membership status appears on ~20 screens. It needs a single
> chip/badge component with 6 variants (Active, Expiring, Expired, Frozen, Trial, Cancelled)
> that reads correctly at 11px in a table row and at 16px on a member's home screen.

### 0.4 Typography scale

```
Display   40 / 44   — dashboard hero numbers, workout weight logger
H1        32 / 40
H2        24 / 32
H3        20 / 28
Body-L    16 / 24
Body      14 / 20   — admin table default
Caption   12 / 16
Micro     11 / 14   — table meta, timestamps
Numeric   tabular-lining variant required for all tables/metrics
```

### 0.5 Spacing & radius

- 4pt base grid. Steps: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 8 (inputs, chips), 12 (cards), 16 (sheets), full (avatars, pills).
- Admin table row height: 52px. Member list row: 64px (touch).

### 0.6 Core component library (design once, reuse everywhere)

**Primitives**
Button (primary / secondary / ghost / destructive × sm/md/lg), Icon button, Input, Textarea,
Select, Multi-select, Date picker, Date-range picker, Time picker, Toggle, Checkbox, Radio,
Stepper (± numeric — used heavily in set logger), Search field, Segmented control, Tabs,
Chip / filter pill, Badge, Avatar (+ initials fallback), Tooltip, Divider.

**Composites**
- **Stat tile** — big number + label + delta + optional sparkline (admin dashboard, member progress)
- **Status chip** — 6 membership variants above
- **Member row** — avatar + name + plan + status + expiry + overflow menu
- **Data table** — sortable header, sticky first column, row select, bulk action bar, pagination, column chooser
- **Progress bar** — membership remaining (with color shifting by threshold), workout completion
- **Chart cards** — line (weight/strength over time), bar (attendance by day), donut (macro split), horizontal bar (peak hours)
- **Calendar** — day / week views with session blocks (trainer schedule, class schedule)
- **Exercise card** — thumbnail + name + muscle + equipment chips
- **Set-log row** — set # · previous · weight stepper · reps stepper · ✓ done
- **Timer** — circular countdown (rest timer)
- **Notification row** — icon by category + title + body + timestamp + read/unread
- **Bottom sheet / modal / side drawer**
- **Toast / inline alert / banner**
- **Empty state** — illustration + headline + body + CTA
- **QR display** and **QR scanner viewfinder**
- **Kanban column + lead card** (CRM pipeline)
- **Achievement badge** (locked / unlocked states)
- **Before/After comparison** (progress photos, assessments)

### 0.7 Required states for EVERY screen

Designers must deliver these variants (not just the happy path):

1. **Loading** — skeleton, not spinner, for lists and dashboards
2. **Empty** — first-run, no data yet, with a CTA
3. **Error** — request failed, with retry
4. **Offline** — member app must show cached workout + queued check-in
5. **Permission denied** — role can't see this (RBAC)
6. **Success/confirmation** — after destructive or financial actions
7. **Long content** — 40-char names, ₹12,50,000 amounts, 25-exercise workouts

### 0.8 Screen spec template (use this format for any new screen)

```
ID:            [A/T/M/S]-##
Name:
Role:          Admin | Trainer | Member | Shared | Kiosk
Platform:      Web | Tablet | Mobile
Phase:         MVP | P2 | Later
Purpose:       One sentence — what the user accomplishes here.
Entry points:  Which screens/notifications lead here.
Layout:        Header / body regions / footer or nav.
Key data:      Fields shown on screen.
Primary CTA:   The one action this screen exists for.
Secondary:     Other available actions.
States:        Which of the 7 states above apply + anything screen-specific.
Exits to:      Screens reachable from here.
Edge cases:    Business rules the design must accommodate.
```

---

## 1. Navigation Maps

### 1.1 Admin (left sidebar, persistent)

```
Dashboard
Members ──── All members · Expiring · Expired · At risk
Memberships ─ Plans · Freeze requests · Renewals
Payments ──── Transactions · Pending · Invoices
Attendance ── Today (live) · History · Analytics
Trainers ──── Trainers · Schedules · Performance
Classes ───── Schedule · Bookings
Leads (CRM) ─ Pipeline · Trials · Follow-ups
Messaging ─── Broadcast · Templates · Delivery log
Reports ───── Revenue · Retention · Attendance · Trainers
Settings ──── Gym profile · Staff & roles · Reminder rules · Payments · Integrations · Audit log
```

### 1.2 Trainer (bottom tab bar, 5 items)

```
[Today]  [Clients]  [Workouts]  [Schedule]  [More]
                                              └── Messages · Exercise library · Diet plans · Availability · Profile
```

### 1.3 Member (bottom tab bar, 5 items + center FAB)

```
[Home]  [Workout]  ( QR )  [Progress]  [More]
                                         └── Diet · Bookings · Classes · Payments · Achievements · Messages · Profile
```

> The **center QR button** is the single most-used action in the product. It must be the
> most prominent element in the member nav.

---

## 2. Shared / Auth Screens

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| S-01 | Splash | MVP | Brand + session restore | Logo, loader | — |
| S-02 | Role entry / Login | MVP | One login, role resolved by backend | Phone or email field, password/OTP toggle, "Login as Admin/Trainer/Member" is **NOT** a user choice — role comes from the account | Continue |
| S-03 | OTP verification | MVP | Verify phone | 6-digit input, resend timer 30s, change number | Verify |
| S-04 | Set / reset password | MVP | Staff accounts | New password, confirm, strength meter | Save |
| S-05 | Member onboarding carousel | MVP | 3 slides: check in · train · track | Illustrations, skip, dots | Get started |
| S-06 | Profile completion | MVP | First login for members created by admin | Photo upload, DOB, gender, emergency contact | Continue |
| S-07 | Notification center | MVP | All roles, filtered by category | Tabs (All / Membership / Workout / Sessions), unread dot, mark-all-read, swipe to dismiss | Tap → deep link |
| S-08 | Search (global) | P2 | Admin/trainer omnisearch | Recent, grouped results (members, exercises, invoices) | — |
| S-09 | Gym / location switcher | Later | Multi-location | List with active check | Switch |

---

## 3. ADMIN Screens

### 3.1 Dashboard

| ID | Screen | Phase | Notes |
|---|---|---|---|
| **A-01** | **Admin Dashboard** | **MVP** | The hero screen. Design this first. |

```
Layout:
  Greeting row       "Good morning, Admin" + date + gym switcher + notification bell
  KPI row (4 tiles)  Total members · Active · Expiring (30d) · Revenue this month
  KPI row 2 (4)      Today's attendance · New members (MTD) · Pending payments · PT sessions today
  Left column (2/3)  · Attendance chart (last 14 days, bar)
                     · Revenue chart (last 6 months, line)
                     · Today's trainer schedule (compact list)
  Right column (1/3) · Memberships expiring  → name, plan, days left, [Remind] [Renew]
                     · Members at risk       → name, last visit, attendance ▼%, [Message]
                     · Pending payments      → name, amount, days overdue, [Collect]
  Quick actions      [+ Add member] [Record payment] [Manual check-in] [Broadcast]

States: loading skeleton per card · empty (new gym, 0 members) · each list has its own empty state
Edge:   Revenue in ₹ with Indian lakh formatting (₹2.84L). Tiles must not reflow when 6-digit numbers appear.
```

### 3.2 Members

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| A-02 | Members list | MVP | Find and act on any member | Data table: photo, name, member ID, phone, plan, status chip, expiry, last visit, trainer, overflow. Filters: status, plan, trainer, expiry range, joined range. Bulk select → send reminder / export | + Add member |
| A-03 | Member profile — Overview | MVP | 360° view | Header: photo, name, ID, status chip, membership progress bar, quick actions (Renew · Freeze · Message · Check in). Body: personal info, membership summary, attendance summary, assigned trainer, fitness snapshot | Renew membership |
| A-04 | Member profile — Membership tab | MVP | History + current | Current plan card, renewal history table, freeze history, auto-renew toggle | Renew / Change plan |
| A-05 | Member profile — Attendance tab | MVP | Visit behaviour | Calendar heatmap, visits this month, avg/week, streak, last visit, session list | Manual check-in |
| A-06 | Member profile — Payments tab | MVP | Money trail | Transactions table, total paid, pending amount, invoice links | Record payment |
| A-07 | Member profile — Fitness tab | P2 | Assessment + progress | Height/weight/BF%, goal, level, target, injuries, assessment timeline (Day 0/30/60/90), weight chart | New assessment |
| A-08 | Member profile — Documents tab | P2 | Compliance | Waiver, T&C, consent, assessment PDF; uploaded/pending status | Upload |
| A-09 | Member profile — Notes tab | P2 | Staff notes | Timeline of notes with author + timestamp, internal-only badge | Add note |
| A-10 | Add / Edit member (wizard) | MVP | Onboard a member | **Step 1** Personal (name, photo, phone, email, DOB, gender, address, emergency contact) → **Step 2** Membership (plan, start date, computed expiry, amount, discount, payment method, paid/pending) → **Step 3** Fitness (height, weight, goal, level, injuries, assign trainer) → **Step 4** Review & confirm | Create member |
| A-11 | Expiring & expired worklist | MVP | Daily retention work | Segmented: 30d / 15d / 7d / 3d / 1d / Expired. Row: member, days, last reminder sent + channel, [Remind] [Renew] [Call] | Bulk remind |
| A-12 | Members at risk | P2 | Inactivity intervention | Risk score, last visit, attendance trend ▼, membership days left, recommended action, [Send re-engagement] | Send message |

### 3.3 Memberships & Payments

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| A-13 | Membership plans | MVP | Manage catalogue | Plan cards: name, duration, price, active members count, status toggle | + Add plan |
| A-14 | Create / edit plan | MVP | Define a plan | Name, duration (Monthly/Quarterly/6M/Annual/Custom-days), price, joining fee, PT sessions included, freeze days allowed, description, visible-to-members toggle | Save plan |
| A-15 | Assign / renew membership (modal) | MVP | The money moment | Member summary, plan select, start date, **auto-computed expiry**, amount, discount, tax, total, payment method, paid now / pending, send confirmation toggle | Confirm & collect |
| A-16 | Freeze membership (modal) | P2 | Pause | Freeze from date, number of days, reason, **preview: new expiry date**, freeze days remaining in plan | Freeze |
| A-17 | Payments / transactions | MVP | Financial ledger | Table: date, member, plan, amount, method, status, invoice #. Filters: date range, method, status. Totals bar: collected / pending / refunded | Record payment |
| A-18 | Record payment (modal) | MVP | Manual entry (cash/UPI) | Member search, amount, method, date, reference #, notes, attach receipt | Save |
| A-19 | Invoice / receipt detail | MVP | Printable document | Gym letterhead, invoice #, member, line items, tax, total, paid stamp, payment method | Download / Send |
| A-20 | Pending payments | MVP | Collections worklist | Member, amount, due since, reminders sent, [Remind] [Mark paid] | Bulk remind |

### 3.4 Attendance

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| A-21 | Attendance today (live) | MVP | Front-desk view | Live count, currently-in list, check-in feed (auto-updating), search to manual check-in | Manual check-in |
| A-22 | Manual check-in (modal) | MVP | Fallback when QR fails | Search by phone / member ID / name → member card with membership status → **blocks if expired** with renew CTA | Check in |
| A-23 | Attendance analytics | P2 | Patterns | Daily/weekly/monthly toggle, peak-hours heatmap (hour × weekday), attendance by trainer, top attendees, no-shows | Export |
| A-24 | Attendance history | MVP | Audit | Table: date, time, member, method (QR/manual/PIN), staff who marked it | Export |

### 3.5 Trainers, Classes, Staff

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| A-25 | Trainers list | MVP | Roster | Card grid: photo, name, specialisation, active clients, sessions this week, rating | + Add trainer |
| A-26 | Trainer detail | MVP | Performance + assignment | Profile, assigned clients list, schedule preview, stats (clients / sessions / client attendance %), availability | Assign clients |
| A-27 | Class schedule (admin) | P2 | Group classes | Weekly calendar grid, class blocks (type, trainer, capacity X/Y, room) | + Add class |
| A-28 | Create / edit class | P2 | Define a class | Type (Yoga/Zumba/CrossFit/HIIT/Strength/Cardio/Mobility), trainer, day+time, duration, capacity, recurring rule, waitlist on/off | Save |
| A-29 | Staff & roles | MVP | RBAC | Staff table: name, role (Admin/Manager/Trainer/Receptionist/Nutritionist), status, last active. Permission matrix view (role × module × view/edit/delete) | + Add staff |
| A-30 | Add staff / invite | MVP | Onboard staff | Name, phone, email, role select, module permission overrides, send invite | Send invite |

### 3.6 Leads (CRM) & Trials

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| A-31 | Lead pipeline (kanban) | P2 | Convert prospects | Columns: New → Contacted → Trial → Joined → Lost. Card: name, phone, source, interested plan, days in stage, owner, next follow-up. Drag between columns | + Add lead |
| A-32 | Lead detail | P2 | Work a lead | Contact info, source, interest, activity timeline (calls/messages/trial visits), follow-up scheduler, notes | Convert to member |
| A-33 | Trials & passes | P2 | Trial control | Active trials table: name, pass type (Free/1-day/7-day/15-day/Guest), days used/left, visits, [Convert] [Extend]. Alert strip: "trial ended, not converted" | Issue pass |

### 3.7 Messaging & Automation

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| A-34 | Reminder rules | MVP | Configure the automation engine | Timeline builder: 30d / 15d / 7d / 3d / 1d / Expired / Post-expiry+3 — each row: enabled toggle, channels (WhatsApp/SMS/Email/Push), template, send time. Plus: inactivity rules (7d / 14d absent), birthday, payment due | Save rules |
| A-35 | Message templates | MVP | Reusable copy | Template list by category, editor with variable chips `{{name}} {{days}} {{plan}} {{amount}} {{expiry}}`, per-channel preview (WhatsApp bubble, SMS, email) | Save template |
| A-36 | Broadcast composer | P2 | Announcements | Audience builder (all / by status / by plan / by trainer / custom segment → live count), channel select, message, schedule now-or-later, preview | Send |
| A-37 | Delivery log | P2 | Trust the automation | Table: timestamp, member, type, channel, status (Queued/Sent/Delivered/Read/Failed), retry action | Retry failed |

### 3.8 Reports & Settings

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| A-38 | Revenue report | MVP | Money over time | Date-range picker, revenue line chart, breakdown: membership vs PT vs other, by payment method, by plan, pending vs collected | Export CSV/PDF |
| A-39 | Retention report | P2 | Business health | Funnel: New / Renewed / Expired / Cancelled. Renewal rate %, churn %, cohort retention grid, avg member lifetime | Export |
| A-40 | Attendance report | P2 | Utilisation | Daily/weekly/monthly attendance, peak hours, attendance-by-trainer, low-attendance member list | Export |
| A-41 | Trainer performance | P2 | Coaching quality | Table: trainer, clients, sessions, client attendance %, client retention %, revenue attributed | Export |
| A-42 | Settings — Gym profile | MVP | Basics | Name, logo, address, phone, operating hours, holidays, timezone, currency | Save |
| A-43 | Settings — Payments | P2 | Gateway | Razorpay/UPI keys, payment link defaults, tax/GST %, invoice numbering, receipt footer | Save |
| A-44 | Settings — Integrations | P2 | Channels | WhatsApp Business API, SMS provider, email sender, push certs — each with connect status + test send | Connect |
| A-45 | Audit log | Later | Accountability | Who changed what, when — filterable by user/module/action | Export |

### 3.9 Kiosk

| ID | Screen | Phase | Purpose | Key elements |
|---|---|---|---|---|
| K-01 | Gym QR display | MVP | Wall/counter screen members scan | Huge QR (rotating token), gym name, "Scan to check in", live check-in count, current time |
| K-02 | Kiosk check-in result | MVP | Feedback at the door | Full-screen: photo, name, ✅ "Welcome back, Rahul" + streak, OR ⚠️ "Membership expired — see reception". Auto-dismiss 4s |

---

## 4. TRAINER Screens

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| T-01 | Today (dashboard) | MVP | What am I doing today | Date, "6 clients today", session list (time, client photo+name, focus, status chip: Upcoming/In progress/Done/No-show), alerts strip (clients who missed workouts, new assignments due) | Start session |
| T-02 | Schedule | MVP | Week view | Day/Week toggle, calendar with session blocks colour-coded by type (PT / Class / Blocked), tap block → T-03 | + Add session |
| T-03 | Session detail | MVP | Run one session | Client card, date/time/duration, planned workout, attendance mark (Present/No-show), session notes, [Reschedule] [Cancel] | Mark complete |
| T-04 | Clients list | MVP | My roster | Search + filter (goal, level, at-risk). Row: photo, name, goal chip, last session, plan compliance %, ⚠️ if inactive | — |
| T-05 | Client profile — Overview | MVP | Know the client | Header: photo, name, goal, level, membership status. Cards: current stats (weight/BF%/target), assigned plan, next session, adherence %, recent activity | Assign workout |
| T-06 | Client — Workouts tab | MVP | Program history | Assigned plans list (active/past), per-session log: date, workout name, completion %, total volume, [View detail] | Assign new |
| T-07 | Client — Progress tab | P2 | Results | Weight chart, body-fat chart, strength progression per lift (bench/squat/deadlift/press), measurement table with deltas, progress photo strip | Add entry |
| T-08 | Client — Measurements | P2 | Record body data | Form: weight, chest, waist, hip, biceps, thigh, body fat %, date, notes. Shows previous value + delta beside each field | Save |
| T-09 | Client — Notes tab | P2 | Coaching memory | Timeline notes, injury flags pinned to top | Add note |
| T-10 | Workout plan builder | MVP | Create a program | Plan name, goal, duration (weeks), split (days/week) → per-day: day name + focus (e.g. "Day 1 — Chest + Triceps") → add exercises from library → per exercise: sets, reps, weight, rest, tempo, notes. Reorder by drag. Save as template | Save plan |
| T-11 | Assign workout (modal) | MVP | Push to member | Select client(s), select plan or single-day workout, start date, repeat schedule, note to member, notify toggle | Assign |
| T-12 | Exercise library | MVP | Find exercises | Search + filter chips: muscle (Chest/Back/Shoulders/Biceps/Triceps/Legs/Glutes/Core/Cardio/Mobility), equipment (Barbell/Dumbbell/Cable/Machine/Bodyweight/Band), difficulty. Grid of exercise cards | + Add exercise |
| T-13 | Exercise detail | MVP | Teach the movement | Video player, name, primary muscle, secondary muscles, equipment, difficulty, step-by-step instructions, common mistakes, variations, [Add to workout] | Add to workout |
| T-14 | Add / edit exercise | P2 | Extend library | All fields from T-13 + video upload/URL, thumbnail, custom/global flag | Save |
| T-15 | Fitness assessment form | P2 | Baseline & re-tests | Assessment type (Initial / Day 30 / 60 / 90), weight, height, BF%, measurements, goal, fitness level, target, injuries, trainer remarks. Right panel shows previous assessment for comparison | Save assessment |
| T-16 | Assessment comparison | P2 | Prove the value | Before vs Current side-by-side: weight, BF%, measurements with deltas, photo comparison, strength gains | Share with member |
| T-17 | Diet plan builder | P2 | Nutrition prescription | Plan name, target calories/macros (prefilled from calculator), meals (Breakfast/Lunch/Snack/Dinner) → add foods from database with quantity → running calorie/macro total bar vs target | Assign to client |
| T-18 | Messages | P2 | Trainer ↔ client | Conversation list, chat thread, quick-reply templates, attach workout/plan | Send |
| T-19 | Availability | P2 | Bookable slots | Weekly grid, working hours per day, break blocks, max sessions/day, leave dates | Save |
| T-20 | Trainer profile | MVP | Own account | Photo, name, specialisations, bio, certifications, contact, notification prefs, logout | Save |

---

## 5. MEMBER Screens

### 5.1 Home & Membership

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| M-01 | Home | MVP | The daily hub | Greeting + avatar + bell. 🔥 Streak card. **Today's Workout card** (name, exercise count, est. duration) → [Start workout]. **Membership card** (progress bar, "23 days left", renew CTA if <15d). **Next session card** (trainer, time, [Reschedule]). Quick actions grid: Workout · Diet · Progress · Book trainer. Achievements strip | Start workout |
| M-02 | Membership detail | MVP | Status & history | Plan name, status chip, start/expiry dates, days remaining ring, amount paid, auto-renew toggle, freeze status, renewal history list | Renew now |
| M-03 | Plans / Renew | MVP | Choose a plan | Plan cards (duration, price, savings badge, features), current plan highlighted, promo code field | Continue to pay |
| M-04 | Checkout | MVP | Pay | Order summary, plan, amount, discount, tax, total, payment method (UPI / Card / Netbanking / Pay at gym) | Pay ₹X |
| M-05 | Payment result | MVP | Confirm | ✅ Success: new expiry date, receipt link, [Back to home] / ❌ Failure: reason, [Retry] [Choose another method] | Done |
| M-06 | Payment history | P2 | Records | Transactions list: date, plan, amount, status, [Invoice] | — |

### 5.2 Check-in

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| M-07 | QR scanner | MVP | Check in | Camera viewfinder with frame, torch toggle, "Scan the QR at the gym entrance", fallback link "Show my code instead" | — |
| M-08 | My QR / member code | MVP | Reverse scan | Member's own QR + member ID + PIN, brightness auto-boost | — |
| M-09 | Check-in success | MVP | Reward the action | ✅ animation, "Checked in at 6:32 PM", 🔥 streak count, visits this month, today's workout shortcut | Start workout |
| M-10 | Check-in blocked | MVP | Handle expiry at the door | ⚠️ "Membership expired 3 days ago", plan summary, [Renew now] [Pay at reception] | Renew now |
| M-11 | Attendance history | MVP | Consistency view | Month calendar with visited days marked, stats: visits, avg/week, last visit, longest streak. Bar chart by weekday | — |

### 5.3 Workout

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| M-12 | Today's workout | MVP | Preview before starting | Workout name (Chest + Triceps), assigned by trainer, est. duration, exercise list (name, sets × reps, target weight, thumbnail), [Swap]/[Skip] per exercise if allowed | Start workout |
| M-13 | Active workout — set logger | MVP | **The most important member screen** | Sticky header: exercise name, exercise 2/5, elapsed timer. Set rows: `Set 1 · prev 60×10 · [60 kg ▲▼] × [10 ▲▼] · ✓`. Suggestion line: "Previous 60×10 → Suggested 62.5×8–10". [+ Add set]. Bottom bar: [Previous] [Rest] [Next exercise]. Exercise info icon → M-15 | Log set ✓ |
| M-14 | Rest timer | MVP | Between sets | Circular countdown, preset chips (60s/90s/120s), +30s, skip, next-set preview. Can appear as bottom sheet over M-13 | Skip rest |
| M-15 | Exercise detail (member) | MVP | How do I do this | Same as T-13 but read-only, opened as sheet from the logger | Back to set |
| M-16 | Workout complete | MVP | Close the loop | 🎉 Summary: duration, exercises, total sets, total volume (kg), PRs hit, calories est. Optional: how did it feel (1–5) + note to trainer. New achievements unlocked | Done |
| M-17 | Workout history | MVP | Past sessions | List by date: workout name, duration, volume, completion %. Tap → detail with per-set data | — |
| M-18 | Workout plan overview | P2 | The full program | Weekly split (Day 1–6 + rest), current week indicator, completion per day, assigned trainer | — |
| M-19 | Exercise library (member) | P2 | Browse & learn | Same filters as T-12, read-only | — |

### 5.4 Diet & Nutrition

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| M-20 | Diet calculator — input | MVP | Get targets | Age, sex, height, weight, activity level (Sedentary → Very active, with descriptions), goal (Lose / Maintain / Gain muscle / Gain weight) | Calculate |
| M-21 | Diet calculator — result | MVP | The numbers | BMR, TDEE, **Daily target: Calories / Protein / Carbs / Fat / Water** as stat tiles + macro donut. Disclaimer: "General fitness guidance, not medical nutrition advice." | Save as my target |
| M-22 | My diet plan | P2 | Trainer-assigned meals | Day selector, meal cards (Breakfast / Lunch / Snack / Dinner) with foods + quantities + calories, daily total vs target bar | Log meal |
| M-23 | Food log (today) | P2 | Track intake | Ring: consumed / remaining calories, macro bars, meals with logged foods, water tracker (glasses) | + Add food |
| M-24 | Food search | P2 | Find a food | Search, recent, favourites, categories; row: name, serving, kcal | — |
| M-25 | Food detail / add | P2 | Log it | Name, serving size selector, quantity, macros recalculated live, meal selector | Add to log |

### 5.5 Progress

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| M-26 | Progress dashboard | MVP | Am I improving | Segmented: Weight / Measurements / Strength / Photos. Weight line chart with goal line + current vs start vs target, stat tiles (Δ weight, Δ BF%, workouts done) | + Log progress |
| M-27 | Add measurement | MVP | Record data | Date, weight, body fat %, chest, waist, hip, biceps, thigh — each showing last value + delta | Save |
| M-28 | Strength progress | P2 | PR tracking | Per-lift cards (Bench / Squat / Deadlift / Shoulder press / custom): current best, chart over time, PR history | — |
| M-29 | Progress photos | P2 | Visual proof | Grid by date, angle tabs (Front / Side / Back), camera with ghost-overlay of previous photo, privacy note | Take photo |
| M-30 | Photo comparison | P2 | Before vs now | Split view, date pickers on each side, slider, share (watermarked) | Share |
| M-31 | My assessments | P2 | Trainer-run tests | Timeline: Initial → Day 30 → 60 → 90, each with key metrics + [Compare] | — |

### 5.6 Booking, Classes, Social

| ID | Screen | Phase | Purpose | Key elements | Primary CTA |
|---|---|---|---|---|---|
| M-32 | Book a trainer | MVP | Get PT | Trainer list (photo, name, specialisation, rating, price/session), or pre-selected assigned trainer | Select trainer |
| M-33 | Select slot | MVP | Pick time | Date strip (next 14 days), available time slots grid, duration, session focus note | Confirm booking |
| M-34 | Booking confirmed | MVP | Receipt | ✅ trainer, date, time, duration, location, [Add to calendar] | Done |
| M-35 | My bookings | MVP | Manage sessions | Upcoming / Past tabs. Card: trainer, date/time, status, [Reschedule] [Cancel] with cancellation policy note | — |
| M-36 | Class schedule | P2 | Group classes | Day tabs, class cards: type, trainer, time, duration, spots left / Full → [Join waitlist] | Book |
| M-37 | Class booking confirm | P2 | Confirm | Class details, capacity, cancellation window, waitlist position if applicable | Book class |
| M-38 | Achievements | P2 | Motivation | Badge grid (locked greyed / unlocked coloured): First Workout, 7-Day Streak, 30-Day Streak, 100 Workouts, New PR, 10 Visits This Month. Progress ring on in-progress badges | Share |
| M-39 | Leaderboard & challenges | P2 | Competition | Monthly attendance leaderboard (🥇🥈🥉 + own rank pinned), active challenges card with progress, join/leave | Join challenge |
| M-40 | Messages | P2 | Talk to trainer/gym | Threads: my trainer, gym announcements (read-only) | Send |
| M-41 | Profile & settings | MVP | Account | Photo, personal info, fitness profile, assigned trainer, emergency contact, notification preferences per category+channel, language, privacy, help, logout, delete account | Save |

---

## 6. Prototype Build Order (what to give the designer first)

**Sprint 1 — the spine (12 screens, makes a demoable clickthrough)**
S-02, S-03, A-01, A-02, A-03, A-10, A-15, M-01, M-07, M-09, M-12, M-13

**Sprint 2 — operations (14 screens)**
A-11, A-13, A-14, A-17, A-18, A-21, A-22, A-24, A-34, A-35, M-02, M-03, M-04, M-05

**Sprint 3 — coaching (10 screens)**
T-01, T-04, T-05, T-06, T-10, T-11, T-12, T-13, M-16, M-17

**Sprint 4 — self-serve fitness (6 screens)**
M-20, M-21, M-26, M-27, M-32, M-33

Everything else is `P2` / `Later`.

---

## 7. Design rules the prototype must respect

1. **Membership status is the spine of the product.** One status component, 6 variants, used identically in admin tables, member home, and check-in results.
2. **Check-in must be reachable in ≤1 tap** from anywhere in the member app.
3. **The set logger must be usable one-handed, sweaty, at arm's length.** Steppers over keyboards. Minimum 48px touch targets. Screen stays awake.
4. **Admin must never lose a list position.** Row click opens a drawer or preserves scroll on back.
5. **Every financial action needs a confirmation step and a receipt.**
6. **Every automated message must be previewable before the rule goes live.**
7. **Indian formatting:** ₹, lakh/crore grouping (₹2,84,000 / ₹2.84L), DD MMM YYYY dates, 12-hour times with AM/PM.
8. **Empty states are onboarding.** A new gym with 0 members should still feel like a working product.
