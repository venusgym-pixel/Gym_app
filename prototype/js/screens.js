/* ============================================================================
   The 19 member-app screens from `Gym App Prototype.dc.html`.

   Each entry is { key, id, name, section, dynamic, render(v) } where `v` is
   the derived-value object from State.derive(). `dynamic: true` marks a screen
   whose output depends on state, so it re-renders on every store notify;
   static screens are painted once.

   Interaction is delegated: any element carrying data-act="action:arg:arg"
   is routed through app.js to State.act.
   ========================================================================= */

window.Screens = (function () {

  var I = Frame.icon;
  var INK = '#191612';   /* text/glyph colour on accent and sage fills */

  /* — small builders ────────────────────────────────────────────────────── */

  function circle(size, bg, inner) {
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:999px;' +
      'background:' + bg + ';display:grid;place-items:center">' + (inner || '') + '</div>';
  }

  function dots(list) {
    return '<div style="display:flex;gap:7px">' + list.map(function (d) {
      return '<span style="height:7px;border-radius:999px;width:' + (d.on ? 20 : 7) + 'px;' +
        'background:' + (d.on ? 'var(--app-accent)' : 'rgba(249,244,237,.25)') + '"></span>';
    }).join('') + '</div>';
  }

  /* `style` lands on the track, `optStyle` on each option — they must stay
     separate: padding/font-size set on the track would inherit into every
     option and stretch the pill. */
  function seg(items, action, style, optStyle) {
    return '<div class="seg" ' + (style || '') + '>' + items.map(function (m) {
      return '<div class="seg-opt' + (m.on ? ' is-on' : '') + '" data-act="' + action + ':' + m.label + '" ' +
        (optStyle || '') + '>' + m.label + '</div>';
    }).join('') + '</div>';
  }

  function field(label, value, extra) {
    return '<div><div class="label">' + label + '</div>' +
      '<div class="pill" ' + (extra || '') + '>' + value + '</div></div>';
  }

  /* — screens ───────────────────────────────────────────────────────────── */

  var list = [

    /* ══ AUTH & ONBOARDING ═══════════════════════════════════════════════ */

    {
      key: 'S-01', id: 'S-01', name: 'Splash · session restore',
      section: 'AUTH & ONBOARDING', dynamic: false,
      render: function () {
        return '<div class="scr scr--center" style="padding:40px;justify-content:center;gap:26px">' +
          circle(104, 'var(--app-accent)', I.dumbbell({ size: 46, color: INK })) +
          '<div>' +
            '<div class="head" style="font-size:30px">Fitwell</div>' +
            '<div class="sub" style="font-size:13px;margin-top:4px">Koramangala · Bengaluru</div>' +
          '</div>' +
          '<div style="margin-top:8px">' + dots([{ on: true }, {}, {}]) + '</div>' +
        '</div>';
      }
    },

    {
      key: 'S-02', id: 'S-02', name: 'Login · OTP or password',
      section: 'AUTH & ONBOARDING', dynamic: true,
      render: function (v) {
        return '<div class="scr" style="padding:96px 24px 40px">' +
          '<div style="margin-bottom:28px">' +
            circle(52, 'var(--app-accent)', I.dumbbell({ size: 24, color: INK })) +
          '</div>' +
          '<div class="head" style="font-size:32px;line-height:1.1">Welcome back</div>' +
          '<div class="sub" style="margin-top:8px;max-width:280px">' +
            'One login for members, trainers and staff — your role comes from your account.</div>' +
          seg(v.modes, 'mode', 'style="margin:28px 0 18px"') +
          '<div class="label">Phone number</div>' +
          '<div class="pill pill--row">' +
            '<span style="font-size:15px;color:var(--app-ink-60)">+91</span>' +
            '<span style="width:1px;height:18px;background:rgba(249,244,237,.15)"></span>' +
            '<span style="font-size:16px;letter-spacing:.02em">98450 21764</span>' +
          '</div>' +
          '<div class="hint" style="margin-top:10px;color:var(--app-ink-40)">' +
            'We’ll send a 6-digit code on WhatsApp and SMS.</div>' +
          '<div class="cta" style="margin-top:26px">' + v.loginCta + '</div>' +
          '<div class="muted" style="text-align:center;margin-top:18px;color:var(--app-ink-45)">' +
            'Trouble signing in? Ask reception</div>' +
        '</div>';
      }
    },

    {
      key: 'S-03', id: 'S-03', name: 'OTP · live keypad + resend timer',
      section: 'AUTH & ONBOARDING', dynamic: true,
      render: function (v) {
        var boxes = v.digits.map(function (d) {
          return '<div class="otpbox' + (d.filled ? ' is-filled' : '') + (d.next ? ' is-next' : '') + '">' +
            d.d + '</div>';
        }).join('');

        var keys = v.keys.map(function (k) {
          return '<div class="' + (k.blank ? 'is-blank' : '') + '"' +
            (k.blank ? '' : ' data-act="key:' + k.key + '"') + '>' + k.label + '</div>';
        }).join('');

        return '<div class="scr" style="padding:96px 24px 40px">' +
          '<div class="back" style="margin-bottom:24px">← Change number</div>' +
          '<div class="head" style="font-size:30px;line-height:1.12">Enter the code</div>' +
          '<div class="sub" style="margin-top:8px">Sent to +91 98450 21764</div>' +
          '<div style="display:flex;gap:9px;margin:30px 0 14px">' + boxes + '</div>' +
          '<div class="muted" style="' + (v.resendReady ? 'color:var(--app-accent)' : '') + '">' +
            v.resendLabel + '</div>' +
          '<div class="keypad">' + keys + '</div>' +
        '</div>';
      }
    },

    {
      key: 'S-04', id: 'S-04', name: 'Set password · staff accounts',
      section: 'AUTH & ONBOARDING', dynamic: false,
      render: function () {
        var secret = 'style="font-size:17px;letter-spacing:.22em;color:rgba(249,244,237,.8)"';
        var bar = function (on) {
          return '<span style="flex:1;height:5px;border-radius:999px;background:' +
            (on ? 'var(--app-good)' : 'rgba(249,244,237,.15)') + '"></span>';
        };
        return '<div class="scr" style="padding:96px 24px 40px">' +
          '<div class="back" style="margin-bottom:24px">← Back</div>' +
          '<div class="head" style="font-size:30px;line-height:1.12">Set a password</div>' +
          '<div class="sub" style="margin-top:8px;max-width:290px">' +
            'Staff accounts sign in with a password. Members can keep using OTP.</div>' +
          '<div class="stack" style="margin-top:28px">' +
            field('New password', '••••••••••', secret) +
            field('Confirm password', '••••••••••', secret) +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:18px">' +
            bar(1) + bar(1) + bar(1) + bar(0) +
          '</div>' +
          '<div class="good" style="font-size:12px;margin-top:9px">Strong — 12 characters, one number</div>' +
          '<div class="cta cta--push">Save password</div>' +
        '</div>';
      }
    },

    {
      key: 'S-05', id: 'S-05', name: 'Onboarding tour · 3 slides, tappable',
      section: 'AUTH & ONBOARDING', dynamic: true,
      render: function (v) {
        return '<div class="scr" style="padding:80px 24px 40px">' +
          '<div class="muted" style="align-self:flex-end;font-size:13px">Skip</div>' +
          '<div style="height:300px;border-radius:var(--radius-lg);background:var(--app-surface);' +
            'margin:14px 0 30px;display:grid;place-items:center;overflow:hidden;position:relative">' +
            '<div style="position:absolute;width:230px;height:230px;border-radius:999px;background:rgba(246,160,107,.12)"></div>' +
            '<div style="position:absolute;width:140px;height:140px;border-radius:999px;background:rgba(174,191,146,.16)"></div>' +
            '<span class="ghost" style="position:relative">illustration</span>' +
          '</div>' +
          '<div class="kicker">' + v.slideKicker + '</div>' +
          '<div class="head" style="font-size:30px;line-height:1.14;margin-top:10px">' + v.slideTitle + '</div>' +
          '<div style="font-size:14px;line-height:1.5;color:var(--app-ink-60);margin-top:12px;max-width:310px">' +
            v.slideBody + '</div>' +
          '<div style="margin-top:26px">' + dots(v.dots) + '</div>' +
          '<div class="cta cta--push" data-act="slide">' + v.slideCta + '</div>' +
        '</div>';
      }
    },

    {
      key: 'S-06', id: 'S-06', name: 'Profile completion · first login',
      section: 'AUTH & ONBOARDING', dynamic: true,
      render: function (v) {
        var genders = v.genders.map(function (g) {
          return '<div data-act="gender:' + g.label + '" style="flex:1;text-align:center;padding:12px;' +
            'border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;' +
            'background:' + (g.on ? 'rgba(246,160,107,.16)' : 'transparent') + ';' +
            'border:1px solid ' + (g.on ? 'var(--app-accent)' : 'var(--app-border-strong)') + ';' +
            'color:' + (g.on ? 'var(--app-accent)' : 'var(--app-ink-70)') + '">' + g.label + '</div>';
        }).join('');

        return '<div class="scr scr--scroll" style="padding:88px 24px 40px">' +
          '<div class="head">Finish your profile</div>' +
          '<div class="sub" style="margin-top:8px">Reception created your membership. Two minutes and you’re set.</div>' +
          '<div class="row" style="gap:16px;margin:24px 0 22px">' +
            '<div style="width:76px;height:76px;border-radius:999px;background:var(--app-surface);' +
              'border:1px dashed rgba(249,244,237,.25);display:grid;place-items:center" class="ghost">photo</div>' +
            '<div class="link" style="font-size:13px">Upload a photo</div>' +
          '</div>' +
          '<div class="stack">' +
            field('Date of birth', '14 Mar 1996', 'style="padding:14px 20px"') +
            '<div><div class="label">Gender</div><div style="display:flex;gap:9px">' + genders + '</div></div>' +
            field('Emergency contact', 'Priya S · +91 98860 44120', 'style="padding:14px 20px"') +
          '</div>' +
          '<div class="card card--sm row row--top" style="padding:14px 16px;margin-top:20px">' +
            '<span style="width:20px;height:20px;border-radius:5px;background:var(--app-accent);' +
              'display:grid;place-items:center;flex:none">' + I.check({ size: 13, color: INK, w: 3.4 }) + '</span>' +
            '<span style="font-size:12.5px;line-height:1.45;color:rgba(249,244,237,.65)">' +
              'I accept the gym waiver and terms of use.</span>' +
          '</div>' +
          '<div class="cta" style="margin-top:22px">Continue</div>' +
        '</div>';
      }
    },

    /* ══ HOME & CHECK-IN ═════════════════════════════════════════════════ */

    {
      key: 'M-01', id: 'M-01', name: 'Home · the daily hub',
      section: 'HOME & CHECK-IN', dynamic: false,
      render: function () {
        var quick = ['Diet', 'Progress', 'Book PT', 'Payments'].map(function (q) {
          return '<div class="card card--sm" style="padding:14px 6px;text-align:center;font-size:11px;' +
            'color:rgba(249,244,237,.75)">' + q + '</div>';
        }).join('');

        var tabs = ['Home', 'Workout', 'Progress', 'More'];

        return '<div class="scr scr--tabbed" style="padding:64px 20px 108px;gap:14px">' +

          /* header */
          '<div class="row">' +
            '<div class="avatar" style="width:44px;height:44px;background:var(--app-avatar);color:var(--app-accent)">RS</div>' +
            '<div class="grow" style="display:flex;flex-direction:column">' +
              '<span style="font-size:12px;color:var(--app-ink-55)">Good evening</span>' +
              '<span class="head" style="font-size:20px;line-height:1.15">Rahul</span>' +
            '</div>' +
            '<div class="iconbtn">' + I.bell({ size: 18, color: 'var(--app-ink)' }) +
              '<span style="position:absolute;top:7px;right:8px;width:7px;height:7px;border-radius:999px;' +
              'background:var(--app-accent)"></span></div>' +
          '</div>' +

          /* streak */
          '<div class="streak">' +
            '<div class="streak-orb"></div>' +
            '<div class="num" style="font-size:46px;color:#fff">12</div>' +
            '<div style="display:flex;flex-direction:column;gap:2px">' +
              '<span style="font:600 13px var(--font-body);color:#fff">day streak</span>' +
              '<span style="font-size:11.5px;color:rgba(255,255,255,.75)">Longest: 21 · keep it alive tonight</span>' +
            '</div>' +
          '</div>' +

          /* today's workout */
          '<div class="card" style="padding:20px">' +
            '<div class="between" style="align-items:flex-start">' +
              '<div>' +
                '<div class="kicker">Today’s workout</div>' +
                '<div class="head" style="font-size:26px;margin-top:6px">Chest + Triceps</div>' +
              '</div>' +
              '<span class="chip">Assigned</span>' +
            '</div>' +
            '<div style="display:flex;gap:18px;margin:14px 0 18px;font-size:12.5px;color:var(--app-ink-60)">' +
              '<span>5 exercises</span><span>18 sets</span><span>~52 min</span></div>' +
            '<div style="display:flex;gap:10px">' +
              '<div class="cta grow" style="padding:13px;font-size:15px">Start workout</div>' +
              '<div style="width:48px;border-radius:999px;border:1px solid var(--app-border-strong);' +
                'display:grid;place-items:center">' + I.plus({ size: 18, color: 'var(--app-ink)' }) + '</div>' +
            '</div>' +
          '</div>' +

          /* membership */
          '<div class="card">' +
            '<div class="between" style="margin-bottom:12px">' +
              '<span style="font:600 13.5px var(--font-body)">Quarterly · Active</span>' +
              '<span style="font:600 20px var(--font-body);color:var(--app-accent)">23' +
                '<span style="font-size:12px;color:var(--app-ink-55);font-weight:400"> days left</span></span>' +
            '</div>' +
            '<div class="bar"><i style="width:74%"></i></div>' +
            '<div class="between" style="margin-top:10px;font-size:11.5px;color:var(--app-ink-50)">' +
              '<span>12 Jun 2026</span><span>Expires 03 Sep 2026</span></div>' +
          '</div>' +

          /* next PT session */
          '<div class="card row" style="padding:16px 20px">' +
            '<div class="avatar" style="width:40px;height:40px;background:var(--app-avatar-2);' +
              'color:var(--app-good);font-size:13px">AK</div>' +
            '<div class="grow">' +
              '<div style="font:600 13.5px var(--font-body)">PT with Arjun</div>' +
              '<div style="font-size:11.5px;color:var(--app-ink-55)">Tomorrow · 7:00 AM · Strength</div>' +
            '</div>' +
            '<span class="link" style="font-size:11.5px">Reschedule</span>' +
          '</div>' +

          /* quick actions */
          '<div class="grid4" style="margin-top:2px">' + quick + '</div>' +
        '</div>' +

        /* bottom tab bar — QR is the centre FAB */
        '<div class="tabbar">' +
          '<span class="is-on">' + tabs[0] + '</span>' +
          '<span>' + tabs[1] + '</span>' +
          '<div style="width:64px;display:flex;justify-content:center">' +
            '<div class="tabbar-fab">' + I.qr({ size: 28, color: INK }) + '</div>' +
          '</div>' +
          '<span>' + tabs[2] + '</span>' +
          '<span>' + tabs[3] + '</span>' +
        '</div>';
      }
    },

    {
      key: 'M-07', id: 'M-07', name: 'QR scanner',
      section: 'HOME & CHECK-IN', dynamic: false,
      render: function () {
        return '<div class="scr scr--deep" style="padding:64px 24px 40px">' +
          '<div class="between">' +
            '<span class="head" style="font-size:17px">Check in</span>' +
            '<span style="width:38px;height:38px;border-radius:999px;background:var(--app-fill);' +
              'display:grid;place-items:center">' + I.torch({ size: 18, color: 'var(--app-ink)' }) + '</span>' +
          '</div>' +
          '<div class="viewport">' +
            '<span class="ghost">camera</span><i></i><i></i><i></i><i></i>' +
          '</div>' +
          '<div style="text-align:center;font-size:14px;color:rgba(249,244,237,.65);margin-top:28px;line-height:1.5">' +
            'Scan the QR at the gym entrance</div>' +
          '<div class="link" style="text-align:center;margin-top:12px">Show my code instead</div>' +
        '</div>';
      }
    },

    {
      key: 'M-09', id: 'M-09', name: 'Checked in · streak +1',
      section: 'HOME & CHECK-IN', dynamic: false,
      render: function () {
        return '<div class="scr scr--center">' +
          '<div style="margin-top:30px">' +
            circle(120, 'var(--app-good-soft)', circle(84, 'var(--app-good)', I.check({ size: 40, color: INK, w: 3.2 }))) +
          '</div>' +
          '<div class="head" style="font-size:30px;margin-top:26px">You’re in</div>' +
          '<div class="sub" style="margin-top:8px;color:var(--app-ink-60)">Checked in at 6:32 PM · Fitwell Koramangala</div>' +
          '<div style="display:flex;gap:12px;width:100%;margin-top:30px">' +
            '<div class="streak grow" style="display:block;padding:18px">' +
              '<div class="num" style="font-size:38px;color:#fff">13</div>' +
              '<div style="font-size:11.5px;color:rgba(255,255,255,.8);margin-top:4px">day streak</div></div>' +
            '<div class="card grow" style="padding:18px">' +
              '<div class="num" style="font-size:38px">15</div>' +
              '<div style="font-size:11.5px;color:var(--app-ink-55);margin-top:4px">visits in Aug</div></div>' +
          '</div>' +
          '<div class="card" style="width:100%;margin-top:12px;text-align:left">' +
            '<div class="kicker">Today’s workout</div>' +
            '<div class="head" style="font-size:22px;margin-top:6px">Chest + Triceps</div>' +
            '<div class="muted" style="margin-top:4px;color:var(--app-ink-55)">5 exercises · ~52 min</div>' +
          '</div>' +
          '<div class="cta cta--push cta--block">Start workout</div>' +
        '</div>';
      }
    },

    {
      key: 'M-10', id: 'M-10', name: 'Check-in blocked · expired',
      section: 'HOME & CHECK-IN', dynamic: false,
      render: function () {
        return '<div class="scr scr--center">' +
          '<div style="margin-top:30px">' +
            circle(120, 'rgba(246,160,107,.14)', I.alert({ size: 52, color: 'var(--app-accent)' })) +
          '</div>' +
          '<div class="head" style="font-size:28px;line-height:1.15;margin-top:26px">Membership expired<br>3 days ago</div>' +
          '<div class="sub" style="margin-top:10px;max-width:290px;color:var(--app-ink-60)">' +
            'Renew to check in. Renewing now starts your plan from today, 10 Aug 2026.</div>' +
          '<div class="card" style="width:100%;margin-top:26px;text-align:left">' +
            '<div class="between">' +
              '<span style="font:600 13.5px var(--font-body)">Quarterly plan</span>' +
              '<span class="chip chip--warn">Expired</span>' +
            '</div>' +
            '<div class="muted" style="margin-top:8px;color:var(--app-ink-55)">Ended 07 Aug 2026 · ₹8,500 · 38 visits used</div>' +
          '</div>' +
          '<div class="cta cta--push cta--block">Renew now</div>' +
          '<div class="muted" style="margin-top:14px">Or pay at reception</div>' +
        '</div>';
      }
    },

    /* ══ RENEWAL & PAYMENT ═══════════════════════════════════════════════ */

    {
      key: 'M-03', id: 'M-03', name: 'Plans · selection is live',
      section: 'RENEWAL & PAYMENT', dynamic: true,
      render: function (v) {
        var plans = v.plans.map(function (p) {
          return '<div data-act="plan:' + p.name + '" style="border-radius:var(--radius-lg);padding:18px 20px;' +
            'cursor:pointer;background:' + (p.on ? 'rgba(246,160,107,.10)' : 'var(--app-surface)') + ';' +
            'border:' + (p.on ? '2px solid var(--app-accent)' : '1px solid rgba(249,244,237,.14)') + '">' +
            '<div class="between between--base">' +
              '<span class="head" style="font-size:20px">' + p.name + '</span>' +
              '<span class="head accent" style="font-size:20px">' + p.price + '</span>' +
            '</div>' +
            '<div class="between" style="margin-top:6px;font-size:12px;color:var(--app-ink-55)">' +
              '<span>' + p.dur + ' · until ' + p.exp + '</span>' +
              '<span class="good" style="font-weight:600">' + p.save + '</span>' +
            '</div>' +
          '</div>';
        }).join('');

        return '<div class="scr scr--scroll">' +
          '<div class="back">← Back</div>' +
          '<div class="head" style="margin-top:18px">Choose a plan</div>' +
          '<div class="sub" style="margin-top:6px">Prices include 18% GST at checkout.</div>' +
          '<div class="stack" style="gap:12px;margin-top:22px">' + plans + '</div>' +
          '<div class="pill pill--row" style="margin-top:16px;padding:14px 20px">' +
            '<span style="font-size:13px;color:var(--app-ink-50)">Promo code</span>' +
            '<span class="link" style="margin-left:auto">Apply</span>' +
          '</div>' +
          '<div class="cta cta--push">Continue to pay</div>' +
        '</div>';
      }
    },

    {
      key: 'M-04', id: 'M-04', name: 'Checkout · totals follow the plan',
      section: 'RENEWAL & PAYMENT', dynamic: true,
      render: function (v) {
        var methods = v.methods.map(function (m) {
          return '<div data-act="method:' + m.label + '" class="row" style="border-radius:999px;padding:14px 20px;' +
            'cursor:pointer;background:var(--app-surface);' +
            'border:' + (m.on ? '2px solid var(--app-accent)' : '1px solid rgba(249,244,237,.14)') + '">' +
            '<span style="width:18px;height:18px;border-radius:999px;border:1px solid rgba(249,244,237,.3);' +
              'display:grid;place-items:center"><span style="width:9px;height:9px;border-radius:999px;' +
              'background:' + (m.on ? 'var(--app-accent)' : 'transparent') + '"></span></span>' +
            '<span style="font-size:14px">' + m.label + '</span>' +
          '</div>';
        }).join('');

        return '<div class="scr scr--scroll">' +
          '<div class="back">← Back</div>' +
          '<div class="head" style="margin-top:18px">Checkout</div>' +
          '<div class="card" style="margin-top:20px">' +
            '<div class="between" style="font-size:13.5px">' +
              '<span style="color:var(--app-ink-60)">' + v.planName + ' plan</span><span>' + v.planPrice + '</span></div>' +
            '<div class="between" style="font-size:13.5px;margin-top:10px">' +
              '<span style="color:var(--app-ink-60)">GST 18%</span><span>' + v.planTax + '</span></div>' +
            '<div class="divider"></div>' +
            '<div class="between between--base">' +
              '<span style="font:600 14px var(--font-body)">Total</span>' +
              '<span class="head accent" style="font-size:24px">' + v.planTotal + '</span></div>' +
            '<div class="good" style="font-size:12px;margin-top:10px">New expiry: ' + v.newExpiry + '</div>' +
          '</div>' +
          '<div class="label" style="margin:22px 0 10px">Payment method</div>' +
          '<div class="stack" style="gap:10px">' + methods + '</div>' +
          '<div class="cta" style="margin-top:24px">Pay ' + v.planTotal + '</div>' +
        '</div>';
      }
    },

    {
      key: 'M-05a', id: 'M-05', name: 'Payment success',
      section: 'RENEWAL & PAYMENT', dynamic: true,
      render: function (v) {
        return '<div class="scr scr--center">' +
          '<div style="margin-top:60px">' + circle(110, 'var(--app-good)', I.check({ size: 46, color: INK, w: 3.2 })) + '</div>' +
          '<div class="head" style="margin-top:26px">Payment successful</div>' +
          '<div class="sub" style="margin-top:8px;color:var(--app-ink-60)">' + v.planTotal + ' paid by ' + v.method + '</div>' +
          '<div class="card" style="padding:20px;width:100%;margin-top:26px">' +
            '<div class="kicker kicker--muted">Membership active until</div>' +
            '<div class="head accent" style="margin-top:8px">' + v.newExpiry + '</div>' +
            '<div class="muted" style="margin-top:8px;color:var(--app-ink-55)">Receipt sent on WhatsApp · Invoice INV-2026-0841</div>' +
          '</div>' +
          '<div class="cta cta--push cta--block">Check in now</div>' +
        '</div>';
      }
    },

    {
      key: 'M-05b', id: 'M-05', name: 'Payment failed · retry',
      section: 'RENEWAL & PAYMENT', dynamic: false,
      render: function () {
        return '<div class="scr scr--center">' +
          '<div style="margin-top:60px">' +
            circle(110, 'rgba(246,160,107,.14)', I.xcircle({ size: 46, color: 'var(--app-accent)' })) + '</div>' +
          '<div class="head" style="margin-top:26px">Payment failed</div>' +
          '<div class="sub" style="margin-top:8px;max-width:280px;color:var(--app-ink-60)">' +
            'Your bank declined the UPI mandate. Nothing was charged and your selection is saved.</div>' +
          '<div class="cta cta--push cta--block">Retry payment</div>' +
          '<div class="muted" style="margin-top:14px">Choose another method</div>' +
        '</div>';
      }
    },

    /* ══ WORKOUT ═════════════════════════════════════════════════════════ */

    {
      key: 'M-12', id: 'M-12', name: 'Today’s workout · preview',
      section: 'WORKOUT', dynamic: false,
      render: function () {
        var rows = State.derive().exercises.map(function (e) {
          return '<div class="row" style="gap:14px;padding:15px 0;border-bottom:1px solid var(--app-hairline)">' +
            '<div style="width:46px;height:46px;border-radius:var(--radius-md);background:var(--app-surface);' +
              'display:grid;place-items:center" class="ghost">img</div>' +
            '<div class="grow">' +
              '<div style="font:600 14px var(--font-body)">' + e.n + '</div>' +
              '<div style="font-size:12px;color:var(--app-ink-55);margin-top:2px">' + e.m + '</div>' +
            '</div>' +
            I.chevron({ size: 18, color: 'rgba(249,244,237,.4)' }) +
          '</div>';
        }).join('');

        return '<div class="scr scr--scroll">' +
          '<div class="kicker">Assigned by Arjun</div>' +
          '<div class="head" style="font-size:30px;margin-top:8px">Chest + Triceps</div>' +
          '<div class="sub" style="font-size:13px;margin-top:6px">Day 1 of 5 · 18 sets · est. 52 min</div>' +
          '<div style="display:flex;flex-direction:column;margin-top:20px">' + rows + '</div>' +
          '<div class="cta cta--push">Start workout</div>' +
        '</div>';
      }
    },

    {
      key: 'M-13', id: 'M-13', name: 'Set logger · steppers live, ✓ starts rest',
      section: 'WORKOUT', dynamic: true,
      render: function (v) {
        var rows = v.setRows.map(function (r) {
          return '<div class="setrow' + (r.done ? ' is-done' : '') + '">' +
            '<div style="width:52px">' +
              '<div style="font:600 12.5px var(--font-body)">' + r.no + '</div>' +
              '<div style="font-size:10.5px;color:var(--app-ink-45)">' + r.prev + '</div>' +
            '</div>' +
            '<div class="row" style="gap:6px">' +
              '<div class="stepper" data-act="step:' + r.i + ':w:-2.5">−</div>' +
              '<div style="width:56px;text-align:center">' +
                '<div class="head" style="font-size:17px">' + r.w + '</div>' +
                '<div style="font-size:9.5px;color:var(--app-ink-40)">kg</div></div>' +
              '<div class="stepper" data-act="step:' + r.i + ':w:2.5">+</div>' +
            '</div>' +
            '<div class="row" style="gap:6px">' +
              '<div class="stepper" style="width:30px;height:30px;font-size:16px" data-act="step:' + r.i + ':r:-1">−</div>' +
              '<div style="width:34px;text-align:center">' +
                '<div class="head" style="font-size:17px">' + r.r + '</div>' +
                '<div style="font-size:9.5px;color:var(--app-ink-40)">reps</div></div>' +
              '<div class="stepper" style="width:30px;height:30px;font-size:16px" data-act="step:' + r.i + ':r:1">+</div>' +
            '</div>' +
            '<div class="tick" data-act="done:' + r.i + '">' + I.check({ size: 19, w: 3.2 }) + '</div>' +
          '</div>';
        }).join('');

        var sheet = !v.restOn ? '' :
          '<div class="sheet">' +
            '<div class="kicker kicker--muted">Rest · M-14</div>' +
            '<div class="dial">' +
              '<svg width="128" height="128" viewBox="0 0 128 128">' +
                '<circle cx="64" cy="64" r="54" fill="none" stroke="rgba(249,244,237,.12)" stroke-width="9"></circle>' +
                '<circle cx="64" cy="64" r="54" fill="none" stroke="var(--app-accent)" stroke-width="9" ' +
                  'stroke-linecap="round" stroke-dasharray="' + v.restDash + '"></circle>' +
              '</svg>' +
              '<span class="head" style="font-size:32px">' + v.restLabel + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:10px">' +
              '<div data-act="restPlus" style="padding:11px 18px;border-radius:999px;' +
                'border:1px solid rgba(249,244,237,.2);font-size:13px;cursor:pointer">+30s</div>' +
              '<div data-act="restSkip" class="cta" style="padding:11px 22px;font-size:13.5px">Skip rest</div>' +
            '</div>' +
            '<div class="muted" style="font-size:12px">Next: Set 2 · 62.5 kg × 10</div>' +
          '</div>';

        return '<div class="scr scr--flush">' +
          '<div style="padding:66px 24px 16px;border-bottom:1px solid var(--app-border)">' +
            '<div class="between" style="font-size:12px;color:var(--app-ink-50)">' +
              '<span>Exercise 1 of 5</span><span>18:42 elapsed</span></div>' +
            '<div class="head" style="font-size:24px;margin-top:8px">Barbell bench press</div>' +
            '<div class="good" style="font-size:12.5px;margin-top:6px">Previous 60×10 → suggested 62.5 × 8–10</div>' +
          '</div>' +
          '<div class="grow" data-scroll style="overflow:auto;padding:16px 20px">' +
            rows +
            '<div class="dashed">+ Add set</div>' +
            '<div class="between" style="font-size:12px;color:var(--app-ink-50);margin-top:16px">' +
              '<span>' + v.doneCount + '</span><span>' + v.volume + '</span></div>' +
          '</div>' +
          '<div class="row" style="padding:14px 20px 30px;border-top:1px solid var(--app-border);gap:10px">' +
            '<div style="width:52px;height:48px;border-radius:999px;border:1px solid var(--app-border-strong);' +
              'display:grid;place-items:center;font-size:13px;color:var(--app-ink-60)">Prev</div>' +
            '<div class="cta grow" style="padding:15px;font-size:15px">Finish workout</div>' +
            '<div style="width:52px;height:48px;border-radius:999px;border:1px solid var(--app-border-strong);' +
              'display:grid;place-items:center;font-size:13px;color:var(--app-ink-60)">Next</div>' +
          '</div>' +
          sheet +
        '</div>';
      }
    },

    {
      key: 'M-16', id: 'M-16', name: 'Workout complete · summary',
      section: 'WORKOUT', dynamic: false,
      render: function () {
        var tile = function (n, l, accent) {
          return '<div class="card' + (accent ? ' card--accent' : '') + '" style="padding:16px">' +
            '<div class="num"' + (accent ? ' style="color:var(--app-accent)"' : '') + '>' + n + '</div>' +
            '<div style="font-size:11.5px;margin-top:2px;color:' +
              (accent ? 'var(--app-accent)' : 'var(--app-ink-55)') + '">' + l + '</div></div>';
        };

        var feel = [1, 2, 3, 4, 5].map(function (n) {
          var on = n === 3;
          return '<div style="flex:1;padding:13px;border-radius:999px;text-align:center;font-size:15px;' +
            'border:' + (on ? '2px solid var(--app-accent)' : '1px solid var(--app-border-strong)') + ';' +
            (on ? 'background:var(--app-accent-soft);color:var(--app-accent)' : 'color:var(--app-ink-60)') +
            '">' + n + '</div>';
        }).join('');

        return '<div class="scr scr--scroll" style="padding:76px 24px 40px">' +
          '<div style="text-align:center">' +
            '<div style="margin:0 auto;width:88px">' +
              circle(88, 'var(--app-good-soft)', I.check({ size: 40, color: 'var(--app-good)' })) + '</div>' +
            '<div class="head" style="margin-top:18px">Workout complete</div>' +
            '<div class="sub" style="font-size:13px;margin-top:6px">Chest + Triceps · 52 min</div>' +
          '</div>' +
          '<div class="grid2" style="margin-top:24px">' +
            tile('2,480', 'kg total volume') +
            tile('18', 'sets logged') +
            tile('1', 'new PR · bench 62.5', true) +
            tile('412', 'kcal est.') +
          '</div>' +
          '<div class="label" style="margin:22px 0 10px">How did it feel?</div>' +
          '<div style="display:flex;gap:8px">' + feel + '</div>' +
          '<div class="card card--sm" style="padding:14px 16px;margin-top:14px;font-size:13px;color:var(--app-ink-50)">' +
            'Note to Arjun — last set felt heavy</div>' +
          '<div class="cta cta--push">Done</div>' +
        '</div>';
      }
    },

    /* ══ PROGRESS ════════════════════════════════════════════════════════ */

    {
      key: 'M-26', id: 'M-26', name: 'Progress dashboard · tabs live',
      section: 'PROGRESS', dynamic: true,
      render: function (v) {
        var stat = function (n, l) {
          return '<div class="card card--sm" style="padding:14px">' +
            '<div class="num" style="font-size:20px">' + n + '</div>' +
            '<div style="font-size:10.5px;color:var(--app-ink-50)">' + l + '</div></div>';
        };

        var meas = function (name, val, delta) {
          return '<div class="rowline"><span style="color:var(--app-ink-70)">' + name + '</span>' +
            '<span>' + val + ' <span class="good" style="font-size:12px">' + delta + '</span></span></div>';
        };

        return '<div class="scr scr--scroll" style="padding:76px 24px 40px">' +
          '<div class="head">Progress</div>' +
          seg(v.tabs, 'tab', 'style="margin:18px 0 20px"', 'style="padding:9px;font-size:12px"') +
          '<div class="card" style="padding:20px">' +
            '<div class="between between--base">' +
              '<div>' +
                '<div class="num" style="font-size:34px">74.2<span style="font-size:15px;color:var(--app-ink-50)"> kg</span></div>' +
                '<div class="good" style="font-size:12px;margin-top:2px">−2.4 kg since 12 Jun</div>' +
              '</div>' +
              '<div class="hint" style="text-align:right">Target 71.0 kg</div>' +
            '</div>' +
            '<svg viewBox="0 0 300 110" style="width:100%;height:110px;margin-top:14px;overflow:visible" ' +
              'role="img" aria-label="Weight trending from 76.6 kg in June to 74.2 kg in August, against a 71.0 kg target line">' +
              '<line x1="0" y1="82" x2="300" y2="82" stroke="rgba(174,191,146,.5)" stroke-width="1.5" stroke-dasharray="4 5"></line>' +
              '<polyline points="4,18 52,26 100,34 148,44 196,40 244,58 296,66" fill="none" ' +
                'stroke="var(--app-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
              '<circle cx="296" cy="66" r="5" fill="var(--app-accent)"></circle>' +
            '</svg>' +
            '<div class="between" style="font-size:10.5px;color:var(--app-ink-40);margin-top:4px">' +
              '<span>Jun</span><span>Jul</span><span>Aug</span></div>' +
          '</div>' +
          '<div class="grid3" style="margin-top:12px">' +
            stat('−2.4', 'kg weight') + stat('−1.8', '% body fat') + stat('31', 'workouts') +
          '</div>' +
          '<div class="hint" style="margin-top:18px;color:var(--app-ink-50)">Latest measurements · 04 Aug</div>' +
          '<div style="display:flex;flex-direction:column;margin-top:8px">' +
            meas('Chest', '102 cm', '+1.0') +
            meas('Waist', '86 cm', '−3.0') +
            meas('Biceps', '34.5 cm', '+0.5') +
          '</div>' +
          '<div class="cta cta--push">+ Log progress</div>' +
        '</div>';
      }
    },

    {
      key: 'M-27', id: 'M-27', name: 'Log measurement · stepper live',
      section: 'PROGRESS', dynamic: true,
      render: function (v) {
        var row = function (name, val, prev) {
          return '<div class="row pill" style="padding:14px 20px">' +
            '<span class="grow" style="font-size:13.5px;color:var(--app-ink-70)">' + name + '</span>' +
            '<span style="font-size:14px">' + val + '</span>' +
            '<span style="font-size:11.5px;color:var(--app-ink-40);margin-left:10px">prev ' + prev + '</span>' +
          '</div>';
        };

        return '<div class="scr scr--scroll" style="padding:76px 24px 40px">' +
          '<div class="back">← Cancel</div>' +
          '<div class="head" style="margin-top:18px">Log progress</div>' +
          '<div class="sub" style="font-size:13px;margin-top:6px">10 Aug 2026 · last entry 04 Aug</div>' +
          '<div class="card" style="padding:20px;margin-top:22px;display:flex;flex-direction:column;' +
            'align-items:center;gap:14px">' +
            '<div class="hint" style="color:var(--app-ink-50)">Weight</div>' +
            '<div class="row" style="gap:18px">' +
              '<div class="stepper" style="width:48px;height:48px;font-size:24px" data-act="weight:-0.1">−</div>' +
              '<div class="num" style="font-size:44px;min-width:120px;text-align:center">' + v.weightVal + '</div>' +
              '<div class="stepper" style="width:48px;height:48px;font-size:24px" data-act="weight:0.1">+</div>' +
            '</div>' +
            '<div class="hint" style="color:var(--app-ink-45)">kg · previous 74.6</div>' +
          '</div>' +
          '<div class="stack" style="gap:12px;margin-top:16px">' +
            row('Body fat %', '19.2', '19.8') +
            row('Waist', '86.0', '89.0') +
            row('Chest', '102.0', '101.0') +
            row('Biceps', '34.5', '34.0') +
          '</div>' +
          '<div class="cta cta--push">Save entry</div>' +
        '</div>';
      }
    }
  ];

  return list;
})();
