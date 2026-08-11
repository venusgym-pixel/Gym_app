/* ============================================================================
   State — vanilla port of the `class Component extends DCLogic` block that
   drives the design document. Same state shape, same transitions, same
   derived values; the Claude Design runtime's React binding is replaced by a
   tiny subscribe/notify store and an action dispatcher.

   Two deliberate departures from the source logic, both noted in README.md:
     · the rest ring tracks its own total, so "+30s" keeps the arc valid
       (the original divides by a fixed 90 and goes negative past 90s)
     · money is formatted through Intl en-IN rather than hard-coded strings
   ========================================================================= */

window.State = (function () {

  /* — reference data ────────────────────────────────────────────────────── */

  var MONTHLY_RATE = 3200;

  var PLANS = [
    { name: 'Monthly',   months: 1,  price: 3200,  dur: '1 month',   exp: '10 Sep 2026' },
    { name: 'Quarterly', months: 3,  price: 8500,  dur: '3 months',  exp: '10 Nov 2026' },
    { name: 'Annual',    months: 12, price: 28000, dur: '12 months', exp: '10 Aug 2027' }
  ];

  var METHODS = ['UPI', 'Card', 'Netbanking', 'Pay at gym'];
  var MODES   = ['OTP', 'Password'];
  var GENDERS = ['Male', 'Female', 'Other'];
  var TABS    = ['Weight', 'Strength', 'Measurements'];

  var TOUR = [
    { k: 'Check in', t: 'One tap at the door',
      b: 'Scan the QR at reception. Your streak and attendance record themselves.' },
    { k: 'Train',    t: 'Your trainer’s plan, on your phone',
      b: 'Every set logged, with last week’s numbers and the next target already suggested.' },
    { k: 'Track',    t: 'Proof it’s working',
      b: 'Weight, measurements and lifts over time — plus renewal reminders before you ever lapse.' }
  ];

  var EXERCISES = [
    { n: 'Barbell bench press',    m: '4 × 10 · 62.5 kg' },
    { n: 'Incline dumbbell press', m: '3 × 12 · 22 kg' },
    { n: 'Cable fly',              m: '3 × 15 · 15 kg' },
    { n: 'Triceps rope pushdown',  m: '3 × 12 · 25 kg' },
    { n: 'Overhead extension',     m: '3 × 12 · 18 kg' }
  ];

  var GST = 0.18;
  var RING_R = 54;
  var RING_C = 2 * Math.PI * RING_R;

  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function money(n) { return '₹' + inr.format(Math.round(n)); }

  /* — state ─────────────────────────────────────────────────────────────── */

  var state = {
    mode: 'OTP',
    otp: '',
    slide: 0,
    gender: 'Male',
    resend: 30,
    plan: 'Quarterly',
    method: 'UPI',
    restOn: false,
    rest: 90,
    restTotal: 90,
    weight: 74.2,
    tab: 'Weight',
    sets: [
      { w: 62.5, r: 10, done: false },
      { w: 62.5, r: 10, done: false },
      { w: 62.5, r: 8,  done: false },
      { w: 60,   r: 8,  done: false }
    ]
  };

  var listeners = [];

  function notify() { listeners.forEach(function (fn) { fn(); }); }

  function set(patch) {
    Object.assign(state, patch);
    notify();
  }

  /* — actions ───────────────────────────────────────────────────────────── */

  var actions = {

    mode: function (m) { set({ mode: m }); },

    key: function (k) {
      if (k === '') return;
      if (k === 'del') return set({ otp: state.otp.slice(0, -1) });
      set({ otp: (state.otp + k).slice(0, 6) });
    },

    slide: function () { set({ slide: (state.slide + 1) % TOUR.length }); },

    gender: function (g) { set({ gender: g }); },

    plan: function (p) { set({ plan: p }); },

    method: function (m) { set({ method: m }); },

    tab: function (t) { set({ tab: t }); },

    /* set logger — clamp at 0, keep one decimal (weight steps 2.5, reps 1) */
    step: function (i, field, delta) {
      set({
        sets: state.sets.map(function (x, j) {
          if (j !== i) return x;
          var next = Object.assign({}, x);
          next[field] = Math.max(0, +(x[field] + delta).toFixed(1));
          return next;
        })
      });
    },

    /* ticking a set on starts the 90s rest; ticking it off dismisses the sheet */
    done: function (i) {
      var justDone = !state.sets[i].done;
      set({
        sets: state.sets.map(function (x, j) {
          return j === i ? Object.assign({}, x, { done: !x.done }) : x;
        }),
        restOn: justDone,
        rest: justDone ? 90 : state.rest,
        restTotal: justDone ? 90 : state.restTotal
      });
    },

    restPlus: function () { set({ rest: state.rest + 30, restTotal: state.restTotal + 30 }); },

    restSkip: function () { set({ restOn: false, rest: 90, restTotal: 90 }); },

    weight: function (delta) { set({ weight: +(state.weight + delta).toFixed(1) }); }
  };

  /* — the 1s clock: resend countdown + rest countdown ───────────────────── */

  function tick() {
    var patch = null;
    if (state.resend > 0) patch = { resend: state.resend - 1 };
    if (state.restOn) {
      patch = patch || {};
      if (state.rest <= 1) { patch.restOn = false; patch.rest = 90; patch.restTotal = 90; }
      else patch.rest = state.rest - 1;
    }
    if (patch) set(patch);
  }

  /* — derived values (the design doc's renderVals) ──────────────────────── */

  function derive() {
    var s = state;
    var plan = PLANS.filter(function (p) { return p.name === s.plan; })[0] || PLANS[1];
    var tax = plan.price * GST;

    return {
      /* S-02 login */
      modes: MODES.map(function (m) { return { label: m, on: s.mode === m }; }),
      loginCta: s.mode === 'OTP' ? 'Send code' : 'Continue',

      /* S-03 OTP */
      digits: [0, 1, 2, 3, 4, 5].map(function (i) {
        return { d: s.otp[i] || '', filled: !!s.otp[i], next: s.otp.length === i };
      }),
      keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(function (k) {
        return { key: k, label: k === 'del' ? '⌫' : k, blank: k === '' };
      }),
      resendLabel: s.resend > 0
        ? 'Resend code in 0:' + String(s.resend).padStart(2, '0')
        : 'Resend code now',
      resendReady: s.resend === 0,

      /* S-05 onboarding tour */
      slideKicker: TOUR[s.slide].k,
      slideTitle: TOUR[s.slide].t,
      slideBody: TOUR[s.slide].b,
      slideCta: s.slide === TOUR.length - 1 ? 'Get started' : 'Next',
      dots: TOUR.map(function (_, i) { return { on: i === s.slide }; }),

      /* S-06 profile */
      genders: GENDERS.map(function (g) { return { label: g, on: s.gender === g }; }),

      /* M-03 plans */
      plans: PLANS.map(function (p) {
        var saving = MONTHLY_RATE * p.months - p.price;
        return {
          name: p.name, dur: p.dur, exp: p.exp,
          price: money(p.price),
          save: saving > 0 ? 'Save ' + money(saving) : '',
          on: s.plan === p.name
        };
      }),

      /* M-04 checkout / M-05 result */
      planName: plan.name,
      planPrice: money(plan.price),
      planTax: money(tax),
      planTotal: money(plan.price + tax),
      newExpiry: plan.exp,
      method: s.method,
      methods: METHODS.map(function (m) { return { label: m, on: s.method === m }; }),

      /* M-12 workout preview */
      exercises: EXERCISES,

      /* M-13 set logger */
      setRows: s.sets.map(function (x, i) {
        return {
          i: i,
          no: 'Set ' + (i + 1),
          prev: i < 3 ? 'prev 60×10' : 'prev 60×8',
          w: x.w.toFixed(1),
          r: String(x.r),
          done: x.done
        };
      }),
      doneCount: s.sets.filter(function (x) { return x.done; }).length + ' of ' + s.sets.length + ' sets',
      volume: s.sets.filter(function (x) { return x.done; })
        .reduce(function (a, x) { return a + x.w * x.r; }, 0).toFixed(0) + ' kg logged',

      /* M-14 rest sheet */
      restOn: s.restOn,
      restLabel: Math.floor(s.rest / 60) + ':' + String(s.rest % 60).padStart(2, '0'),
      restDash: (RING_C * (1 - Math.min(1, s.rest / s.restTotal))).toFixed(1) + ' ' + RING_C.toFixed(1),

      /* M-26 / M-27 progress */
      tabs: TABS.map(function (t) { return { label: t, on: s.tab === t }; }),
      tab: s.tab,
      weightVal: s.weight.toFixed(1)
    };
  }

  return {
    get raw() { return state; },
    derive: derive,
    act: actions,
    tick: tick,
    subscribe: function (fn) { listeners.push(fn); },
    money: money
  };
})();
