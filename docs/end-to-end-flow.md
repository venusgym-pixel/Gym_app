# Gym Platform — End-to-End Flow

> Companion to `ui-screens-spec.md`. Screen IDs (A-xx, T-xx, M-xx, S-xx, K-xx) refer to that document.

---

## 1. The Master Loop

This is the flow that makes the product a platform instead of a reminder app. Every feature exists to serve one of these steps.

```
  PROSPECT                   OPERATIONS                    COACHING                    RETENTION
 ─────────                  ───────────                   ─────────                   ───────────

 Lead captured
      │  A-31
      ▼
 Trial issued ─────────────► Trial QR check-in
      │  A-33                     │  M-07 / K-01
      ▼                           │
 Converted ──────────────────────►│
                                  ▼
                          Member created  A-10
                                  │
                                  ▼
                          Plan assigned + payment  A-15
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
            Welcome message              Trainer assigned  A-26
            (WhatsApp + app)                    │
                    │                           ▼
                    │                   Fitness assessment  T-15
                    │                           │
                    │                           ▼
                    │                   Workout plan built  T-10
                    │                           │
                    │                           ▼
                    │                   Workout assigned  T-11
                    │                           │
                    ▼                           ▼
            ┌───► QR check-in  M-07 ────► Member logs workout  M-13
            │           │                       │
            │           ▼                       ▼
            │   Attendance recorded      Set data saved  M-16
            │           │                       │
            │           │                       ▼
            │           │               Trainer reviews performance  T-06
            │           │                       │
            │           │                       ▼
            │           │               Trainer adjusts next workout  T-10
            │           │                       │
            │           └───────┬───────────────┘
            │                   ▼
            │           Progress tracked  M-26 / T-07
            │                   │
            │        ┌──────────┴──────────┐
            │        ▼                     ▼
            │  No check-in 7d      Expiry in 30/15/7/3/1d
            │        │                     │
            │        ▼                     ▼
            │  Inactivity alert    Renewal reminder ladder
            │  A-12 + auto msg     A-34 → WhatsApp/SMS/Push
            │        │                     │
            │        ▼                     ▼
            └── Re-engagement      Member renews  M-03 → M-04
                                          │
                                          ▼
                                  Admin sees retention + revenue
                                          A-01 / A-38 / A-39
```

---

## 2. Flow Detail by Journey

### 2.1 Lead → Member (Phase 4, but design the shape now)

| # | Actor | Action | Screen | System does |
|---|---|---|---|---|
| 1 | Walk-in / Instagram / referral | Enquiry captured | A-31 | Lead created, status `New`, owner assigned |
| 2 | Receptionist | Calls lead | A-32 | Status → `Contacted`, activity logged, follow-up date set |
| 3 | Admin | Issues trial pass | A-33 | Trial membership created (1/7/15 day), QR credential issued, welcome SMS sent |
| 4 | Lead | Visits gym, scans QR | M-07 / K-01 | Attendance logged against trial, status → `Trial` |
| 5 | System | Trial day 2 with no purchase | — | Task created for owner: **"Follow-up required"**, appears on A-01 |
| 6 | Admin | Converts | A-32 → A-10 | Lead record links to new member; status → `Joined` |
| 7 | System | — | — | If no conversion by trial end + 3 days → status `Lost`, reason captured |

**States:** `New → Contacted → Trial → Joined → Active` with `Lost` reachable from any stage.

---

### 2.2 Member onboarding (MVP — build first)

| # | Actor | Action | Screen | System does |
|---|---|---|---|---|
| 1 | Admin | Fills 4-step wizard | A-10 | Validates unique phone; generates member ID + QR credential |
| 2 | Admin | Selects plan, start date | A-10 step 2 | **Computes expiry = start + plan duration**; creates `membership` record `Active` |
| 3 | Admin | Records payment | A-10 step 2 / A-18 | Payment `Paid` or `Pending`; invoice generated |
| 4 | Admin | Assigns trainer | A-10 step 3 | Trainer–member link created; trainer notified |
| 5 | System | On save | — | Welcome WhatsApp + SMS; app invite with login link; member appears in A-02 and T-04 |
| 6 | Member | First login | S-02 → S-03 → S-05 → S-06 | Completes profile, accepts waiver |
| 7 | Trainer | Runs initial assessment | T-15 | Baseline stored as `Day 0`; schedules Day 30/60/90 reminders |
| 8 | Trainer | Builds + assigns plan | T-10 → T-11 | Member gets push: "Your workout plan is ready" |

**Key rule:** a member can exist without an app login (admin-created, offline member). Every member-facing automation must have a non-app channel (WhatsApp/SMS) fallback.

---

### 2.3 Daily check-in (MVP — the highest-frequency flow)

```
Member opens app ──► taps center QR button ──► M-07 scanner
                                                    │
                                        scans gym QR (K-01, rotating token)
                                                    │
                                                    ▼
                                        ┌── validate token freshness
                                        ├── validate member exists
                                        ├── validate membership status
                                        └── validate duplicate (same day, <30 min)
                                                    │
                        ┌───────────────────────────┼───────────────────────────┐
                        ▼                           ▼                           ▼
                    ACTIVE                     EXPIRING (<7d)               EXPIRED / FROZEN
                        │                           │                           │
                        ▼                           ▼                           ▼
                 M-09 success              M-09 success +               M-10 blocked
                 streak +1                 renewal banner               [Renew now] → M-03
                        │                           │                           │
                        ▼                           ▼                           ▼
                 K-02 shows                  K-02 shows                  K-02 shows ⚠️
                 "Welcome back"              "Renew soon"                "See reception"
                        │
                        ▼
              Attendance record written
              → streak recalculated
              → inactivity clock reset
              → A-21 live feed updates
              → achievement check fires
```

**Fallbacks, in order:** QR scan → member's own QR (M-08, scanned by front desk) → PIN / member ID → phone number lookup by staff (A-22).

**Offline:** member app queues the check-in with a timestamp and syncs when online. Kiosk must show a degraded-but-working mode.

---

### 2.4 The coaching loop (MVP — the differentiator)

```
TRAINER                                        MEMBER
   │                                              │
   │ T-10 builds plan                             │
   │ T-11 assigns to member ───── push ──────────►│ M-01 home shows "Today's Workout"
   │                                              │
   │                                              │ M-12 previews → Start
   │                                              │ M-13 logs each set
   │                                              │      · sees previous performance
   │                                              │      · sees suggested progression
   │                                              │ M-14 rest timer between sets
   │                                              │ M-16 completes → volume, PRs, feel-rating
   │                                              │
   │◄──────────── workout data saved ─────────────┤
   │                                              │
   │ T-06 sees: completion %, actual vs           │
   │      prescribed weight, missed sets,         │
   │      member's note                           │
   │                                              │
   │ T-07 sees progression charts                 │
   │                                              │
   │ T-10 adjusts next week's loads ──── push ───►│ M-18 updated plan
   │                                              │
   └──────────────── repeat weekly ───────────────┘

Every 30 days: T-15 re-assessment → T-16 before/after → M-31 member sees proof
```

**Progression rule for the prototype:** if the member completed all prescribed reps at the prescribed weight, suggest `+2.5 kg` (upper body) / `+5 kg` (lower body) next session. If they missed reps twice in a row, suggest holding weight. This is deterministic — AI comes in Phase 5.

---

### 2.5 Membership expiry → renewal (MVP — the revenue flow)

**Background job runs daily at a configured hour (e.g. 09:00 gym time).**

| Trigger | Audience | Channels | Member sees | Admin sees |
|---|---|---|---|---|
| Expiry − 30d | Active memberships | Push + Email | M-01 banner | A-11 (30d tab) |
| Expiry − 15d | Active | Push + WhatsApp | M-01 banner | A-11 |
| Expiry − 7d | Active | WhatsApp + SMS + Push | M-02 renew CTA prominent | A-01 "Expiring" card |
| Expiry − 3d | Active | WhatsApp + SMS + Push | Urgent banner | A-01 + daily digest |
| Expiry − 1d | Active | WhatsApp + SMS + Push | "Expires tomorrow" | A-01 |
| Expiry day | Active → **Expired** | WhatsApp + SMS | M-10 on next check-in | A-11 (Expired tab) |
| Expiry + 3d | Expired | WhatsApp | Win-back offer | Follow-up task |
| Expiry + 7d | Expired | Call task only | — | A-12 |

```
Reminder sent
     │
     ├─► Member taps deep link ──► M-03 plans ──► M-04 checkout ──► gateway
     │                                                                │
     │                                    ┌───────── success ─────────┤
     │                                    │                           │
     │                                    ▼                    failure ▼
     │                          new expiry = max(old expiry, today)   M-05 retry
     │                                    + plan duration
     │                                    │
     │                                    ├─► membership status → Active
     │                                    ├─► invoice generated (A-19)
     │                                    ├─► confirmation WhatsApp + receipt email
     │                                    └─► A-01 revenue tile updates
     │
     └─► No response by expiry+7d ──► admin call task ──► A-15 offline renewal (cash/UPI)
```

**Critical rule:** renewing *before* expiry extends from the existing expiry date, not from today. Renewing *after* expiry starts from today. Design must show the resulting date before the user pays.

---

### 2.6 Membership freeze (P2)

```
Member requests (call/app) ──► Admin A-16
                                  │
                                  ├─ freeze start date
                                  ├─ number of days (validated against plan's freeze allowance)
                                  └─ reason
                                  │
                                  ▼
                    Preview: "Expiry moves 12 Sep → 27 Sep"
                                  │
                                  ▼
                    Status → Frozen · expiry += frozen days
                    · reminder ladder paused
                    · inactivity detection paused
                    · check-in blocked (K-02 shows "Membership frozen")
                                  │
                                  ▼
                    On freeze end date → status → Active, reminders resume
```

---

### 2.7 Inactivity detection → re-engagement (P2 — the signature feature)

**Daily job:**

```
For each active member:
    days_since_last_visit = today − last_attendance_date

    if days_since_last_visit == 7:
        → auto WhatsApp: "We haven't seen you in a week 💪"
        → member flagged Watch

    if days_since_last_visit == 14:
        → auto WhatsApp + push
        → member flagged At Risk
        → appears on A-01 and A-12
        → task assigned to their trainer (T-01 alerts strip)

    if days_since_last_visit >= 21 AND membership expires within 30d:
        → flagged High Risk
        → admin call task, no auto-message (human touch)
```

**Risk score inputs for A-12:** days since last visit, attendance trend vs their own 30-day average, days to expiry, workout completion %, whether they have an assigned trainer, payment status.

Admin sees the card, picks a recommended action, one tap sends the message — the loop closes on A-01.

---

### 2.8 Payment (MVP for tracking, P2 for gateway)

```
                    ┌─── Online (member-initiated) ───┐        ┌─── Offline (admin-initiated) ───┐
                    │                                 │        │                                 │
              M-03 select plan                            A-15 assign/renew  or  A-18 record payment
                    │                                              │
              M-04 checkout                                   method: Cash / UPI / Card / Bank
                    │                                              │
        Razorpay / UPI / payment link                       reference number captured
                    │                                              │
        ┌───────────┴───────────┐                                  │
   success                  failure                                │
        │                       │                                  │
        ▼                       ▼                                  ▼
   Payment: Paid          Payment: Failed                    Payment: Paid | Pending
   Membership extended    M-05 retry / choose method         Membership extended if Paid
   Invoice A-19           Cart preserved                     Invoice A-19
   Receipt sent           Admin notified if repeated         Receipt sent
        │                                                          │
        └──────────────────────┬───────────────────────────────────┘
                               ▼
                    A-17 ledger · A-38 revenue report · A-01 revenue tile

Pending payments → A-20 worklist → reminder ladder (day 1, 3, 7) → admin call task
```

---

### 2.9 Personal training booking (MVP)

```
Member M-32 ──► picks trainer (or assigned trainer pre-selected)
        │
        ▼
   M-33 slot picker — shows only slots where:
        · trainer availability window (T-19) is open
        · no existing booking
        · member's membership is Active on that date
        · gym is open
        │
        ▼
   M-34 confirmed ──► trainer notified (T-01, T-02)
                  ──► calendar entry created both sides
        │
        ▼
   Reminders: 24h before (push + WhatsApp) · 1h before (push)
        │
        ▼
   Session day ──► T-03 trainer marks Present / No-show / Completed
        │
        ├─ Completed  → session deducted from package, notes saved, member can rate
        ├─ No-show    → policy applied (deduct or not), member notified
        └─ Cancelled  → by member (M-35, within cancellation window) or trainer (T-03)
                        → other party notified, slot released
```

Group classes (P2) follow the same shape with capacity + waitlist: when a booking is cancelled, the first waitlisted member is auto-promoted and notified.

---

### 2.10 Nutrition (Phase 3)

```
M-20 inputs (age, sex, height, weight, activity, goal)
        │
        ▼
   BMR (Mifflin-St Jeor)
        │
   × activity multiplier → TDEE
        │
   ± goal adjustment (−500 lose / 0 maintain / +300 gain)
        │
        ▼
   M-21 targets: calories, protein (g/kg), carbs, fat, water
        │
        ├──► saved to member fitness profile
        │
        ├──► Trainer T-17 builds a diet plan against those targets
        │         │
        │         ▼
        │    M-22 member sees meals by day
        │
        └──► M-23 daily food log against target
                  │
             M-24 search → M-25 add → running totals update
```

Disclaimer must be visible on M-21 and M-22: *general fitness guidance, not medical nutrition advice.*

---

## 3. Background Jobs (the automation engine)

| Job | Frequency | What it does | Surfaces on |
|---|---|---|---|
| Membership status sweep | Daily 00:05 | Active → Expiring → Expired; unfreeze due memberships | A-01, A-11 |
| Reminder dispatcher | Daily 09:00 | Evaluates A-34 rules, queues messages per channel | A-37 |
| Inactivity scan | Daily 09:15 | Computes days-since-visit, flags Watch / At Risk / High Risk | A-12, T-01 |
| Payment due reminders | Daily 10:00 | Pending payments at day 1, 3, 7 | A-20 |
| Session reminders | Hourly | 24h and 1h before PT sessions and classes | M-01, T-01 |
| Workout nudge | Daily, gym-hours | "Today's workout is ready" if assigned and not started | M-01 |
| Streak & achievement engine | On check-in / workout complete | Recalculates streaks, unlocks badges | M-09, M-38 |
| Assessment due | Daily | Day 30/60/90 re-assessment reminders to trainer | T-01 |
| Birthday | Daily 08:00 | Birthday wish + optional offer | — |
| Analytics rollup | Nightly | Pre-computes dashboard and report aggregates | A-01, A-38–41 |
| Delivery retry | Every 15 min | Retries failed WhatsApp/SMS up to 3× | A-37 |

**Design implication:** every automated message must be inspectable (A-37) and every rule must be previewable before it goes live (A-34/A-35). Automation people can't see is automation they turn off.

---

## 4. State Machines

**Membership**
```
Pending ──► Active ──► Expiring ──► Expired ──► Renewed(→Active)
              │  ▲                     │
              ▼  │                     └──► Lost (no renewal in 30d)
           Frozen┘
              │
              └──► Cancelled (refund path)
```

**Lead** — `New → Contacted → Trial → Joined → Active`, `Lost` from any state.

**Payment** — `Pending → Processing → Paid`, with `Failed → Pending` (retry) and `Paid → Refunded`.

**PT Session** — `Scheduled → Confirmed → In progress → Completed`, plus `Cancelled(by member|by trainer)` and `No-show`.

**Workout assignment** — `Assigned → Started → Completed`, plus `Skipped` and `Missed` (day passed, never started).

**Class booking** — `Booked → Attended`, plus `Waitlisted → Booked` (auto-promote), `Cancelled`, `No-show`.

---

## 5. Role Permission Matrix (drives A-29 and every "permission denied" state)

| Module | Admin | Manager | Trainer | Receptionist | Nutritionist | Member |
|---|---|---|---|---|---|---|
| Dashboard | Full | Full | Own clients | Ops only | Own clients | Own |
| Members | CRUD | CRUD | View assigned | Create + view | View assigned | Own profile |
| Memberships & plans | CRUD | CRUD | — | Assign + renew | — | View own |
| Payments | CRUD | View + collect | — | Collect | — | Own + pay |
| Attendance | Full | Full | Own clients | Mark + view | — | Own |
| Workouts | Full | View | CRUD for clients | — | — | Own, log only |
| Exercise library | CRUD | View | CRUD | View | View | View |
| Diet plans | Full | View | Create | — | CRUD | Own |
| Progress & measurements | View | View | CRUD for clients | — | View | Own |
| Trainers & staff | CRUD | View | — | — | — | — |
| Leads / CRM | Full | Full | — | Full | — | — |
| Messaging & broadcast | Full | Full | Own clients | Templates only | Own clients | Own threads |
| Reports | Full | Full | Own performance | — | — | — |
| Settings | Full | Limited | — | — | — | Own prefs |

---

## 6. Notification Matrix

| Event | Member | Trainer | Admin | Channels |
|---|---|---|---|---|
| Membership expiring (30/15/7/3/1d) | ✓ | — | digest | WA · SMS · Push · Email |
| Membership expired | ✓ | ✓ | ✓ | WA · SMS · Push |
| Payment due / overdue | ✓ | — | ✓ | WA · SMS · Push |
| Payment successful | ✓ | — | ✓ | Push · Email (receipt) |
| Renewal confirmed | ✓ | ✓ | ✓ | WA · Push |
| Checked in | ✓ | — | live feed | Push · in-app |
| Workout assigned | ✓ | — | — | Push · in-app |
| Today's workout ready | ✓ | — | — | Push |
| Workout completed | — | ✓ | — | in-app |
| Workout missed | ✓ | ✓ | — | Push · in-app |
| PT session in 24h / 1h | ✓ | ✓ | — | Push · WA |
| Session cancelled / rescheduled | ✓ | ✓ | ✓ | Push · WA |
| 7 / 14 days absent | ✓ | ✓ | ✓ | WA · Push · in-app |
| Achievement unlocked | ✓ | — | — | Push · in-app |
| Birthday | ✓ | — | — | WA · Push |
| New lead / trial expiring | — | — | ✓ | in-app |
| Broadcast announcement | ✓ | ✓ | — | WA · Push · in-app |

---

## 7. Build Sequence (aligned to the roadmap in the source doc)

| Phase | Delivers | Flows live | Screens |
|---|---|---|---|
| **1 — Operations** | Auth + RBAC, members, plans, payments tracking, QR attendance, reminder engine, dashboard | 2.2, 2.3, 2.5, 2.8 (tracking) | S-01…07, A-01…24, A-29/30, A-34/35, A-38, A-42, K-01/02, M-01…11, M-41 |
| **2 — Fitness** | Exercise library, workout builder, assignment, tracker, trainer schedule, progress, assessments | 2.4, 2.9 | T-01…16, T-20, M-12…19, M-26…28, M-32…35 |
| **3 — Nutrition** | BMR/TDEE/macros, food database, diet plans, food logging | 2.10 | T-17, M-20…25 |
| **4 — Growth** | Lead CRM, trials, WhatsApp automation, inactivity detection, renewal automation, analytics | 2.1, 2.6, 2.7, 2.8 (gateway) | A-12, A-16, A-31…33, A-36/37, A-39…41, A-43/44 |
| **5 — Premium** | AI workout/retention/diet assistants, wearables, multi-location, white-label | — | S-09, A-45 + new AI surfaces |

---

## 8. The One-Sentence Test

If a stakeholder asks what the product does, the answer traceable through this document is:

> **A member joins, checks in with a QR code, gets a trainer and a workout, logs every set, watches their progress, and the system renews them before they ever lapse — while the owner watches revenue and retention in one dashboard.**

Everything in `ui-screens-spec.md` should serve that sentence. Anything that doesn't is Phase 5.
