/* ============================================================================
   Boot: paints the board, wires the action dispatcher, runs the 1s clock and
   drives the Flow view.

   Rendering strategy — static screens paint once; screens marked `dynamic`
   re-render their frame contents on every store notify. Scroll offsets are
   captured and restored around each re-render so the rest timer ticking once
   a second never yanks a scrolled screen back to the top.
   ========================================================================= */

(function () {
  'use strict';

  var board = document.getElementById('board');
  var flow = document.getElementById('flow');
  var rail = document.getElementById('flow-rail');
  var stage = document.getElementById('flow-device');
  var flowId = document.getElementById('flow-id');
  var flowName = document.getElementById('flow-name');

  var cells = {};        /* key -> the .ios-scroll element on the board */
  var current = 0;       /* flow view cursor */
  var mode = 'board';

  /* — build the board ───────────────────────────────────────────────────── */

  function buildBoard() {
    var html = '';
    var section = null;

    Screens.forEach(function (s) {
      if (s.section !== section) {
        section = s.section;
        html += '<div class="ghead">' + section + '</div>';
      }
      html += '<div class="gcell">' +
        '<div class="glabel"><span class="gid">' + s.id + '</span>' +
        '<span class="gname">' + s.name + '</span></div>' +
        Frame.device('<div data-cell="' + s.key + '"></div>') +
      '</div>';
    });

    board.innerHTML = html;

    Screens.forEach(function (s) {
      cells[s.key] = board.querySelector('[data-cell="' + s.key + '"]');
    });
  }

  /* — build the flow rail ───────────────────────────────────────────────── */

  function buildRail() {
    var html = '';
    var section = null;

    Screens.forEach(function (s, i) {
      if (s.section !== section) {
        section = s.section;
        html += '<div class="flow-rail-head">' + section + '</div>';
      }
      html += '<button type="button" class="flow-step" data-step="' + i + '">' +
        '<code>' + s.id + '</code><span>' + s.name.split(' · ')[0] + '</span></button>';
    });

    rail.innerHTML = html;
  }

  /* — scroll preservation ───────────────────────────────────────────────── */

  function capture(host) {
    var inner = host.querySelectorAll('[data-scroll]');
    return {
      host: host.parentNode.scrollTop,          /* the .ios-scroll wrapper */
      inner: [].map.call(inner, function (el) { return el.scrollTop; })
    };
  }

  function restore(host, snap) {
    host.parentNode.scrollTop = snap.host;
    var inner = host.querySelectorAll('[data-scroll]');
    [].forEach.call(inner, function (el, i) {
      if (snap.inner[i] != null) el.scrollTop = snap.inner[i];
    });
  }

  /* — paint one screen into a host element ──────────────────────────────── */

  function paint(host, screen, v) {
    var hadSheet = !!host.querySelector('.sheet');
    var snap = capture(host);

    host.innerHTML = screen.render(v);

    restore(host, snap);
    enhance(host);

    /* animate the rest sheet only on the tick it first appears */
    var sheet = host.querySelector('.sheet');
    if (sheet && !hadSheet) sheet.classList.add('is-entering');
  }

  /* Interactive elements in the design are plain divs. Give them button
     semantics so the prototype is keyboard-operable and screen-reader sane
     without changing a pixel. */
  function enhance(host) {
    [].forEach.call(host.querySelectorAll('[data-act]'), function (el) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
    });
  }

  /* — render ────────────────────────────────────────────────────────────── */

  function render(all) {
    var v = State.derive();

    if (mode === 'board') {
      Screens.forEach(function (s) {
        if (all || s.dynamic) paint(cells[s.key], s, v);
      });
    } else {
      var s = Screens[current];
      var host = stage.querySelector('[data-cell]');
      if (!host || host.getAttribute('data-cell') !== s.key) {
        stage.innerHTML = Frame.device('<div data-cell="' + s.key + '"></div>');
        host = stage.querySelector('[data-cell]');
      }
      paint(host, s, v);

      flowId.textContent = s.id;
      flowName.textContent = s.name;
      writeHash();
      [].forEach.call(rail.querySelectorAll('.flow-step'), function (b) {
        b.classList.toggle('is-on', +b.getAttribute('data-step') === current);
      });
    }
  }

  /* — action dispatch ───────────────────────────────────────────────────── */

  var ACT = {
    mode:     function (a) { State.act.mode(a[1]); },
    key:      function (a) { State.act.key(a[1]); },
    slide:    function ()  { State.act.slide(); },
    gender:   function (a) { State.act.gender(a[1]); },
    plan:     function (a) { State.act.plan(a[1]); },
    method:   function (a) { State.act.method(a[1]); },
    tab:      function (a) { State.act.tab(a[1]); },
    step:     function (a) { State.act.step(+a[1], a[2], +a[3]); },
    done:     function (a) { State.act.done(+a[1]); },
    restPlus: function ()  { State.act.restPlus(); },
    restSkip: function ()  { State.act.restSkip(); },
    weight:   function (a) { State.act.weight(+a[1]); }
  };

  function dispatch(el) {
    var parts = el.getAttribute('data-act').split(':');
    var fn = ACT[parts[0]];
    if (fn) fn(parts);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (el) dispatch(el);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    e.preventDefault();
    dispatch(el);
  });

  /* — deep links ────────────────────────────────────────────────────────── */

  /* #M-13 opens the flow view on that screen, so a single screen can be
     linked, bookmarked and shared without scrolling the board to find it. */
  function readHash() {
    var want = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!want) return false;
    for (var i = 0; i < Screens.length; i++) {
      if (Screens[i].key === want || Screens[i].id === want) { current = i; return true; }
    }
    return false;
  }

  function writeHash() {
    var next = '#' + Screens[current].key;
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  window.addEventListener('hashchange', function () {
    if (readHash() && mode === 'flow') render();
  });

  /* — board / flow toggle ───────────────────────────────────────────────── */

  function setMode(next) {
    mode = next;
    board.hidden = next !== 'board';
    flow.hidden = next !== 'flow';
    [].forEach.call(document.querySelectorAll('.board-mode'), function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-mode') === next);
    });
    render(true);
  }

  document.addEventListener('click', function (e) {
    var m = e.target.closest ? e.target.closest('[data-mode]') : null;
    if (m) return setMode(m.getAttribute('data-mode'));

    var step = e.target.closest ? e.target.closest('[data-step]') : null;
    if (step) { current = +step.getAttribute('data-step'); return render(); }

    var nav = e.target.closest ? e.target.closest('[data-flow]') : null;
    if (nav) {
      var d = nav.getAttribute('data-flow') === 'next' ? 1 : -1;
      current = (current + d + Screens.length) % Screens.length;
      render();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (mode !== 'flow') return;
    if (e.target.closest && e.target.closest('[data-act]')) return;
    if (e.key === 'ArrowRight') { current = (current + 1) % Screens.length; render(); }
    if (e.key === 'ArrowLeft')  { current = (current - 1 + Screens.length) % Screens.length; render(); }
  });

  /* — go ────────────────────────────────────────────────────────────────── */

  buildBoard();
  buildRail();
  State.subscribe(function () { render(); });
  setMode(readHash() ? 'flow' : 'board');
  setInterval(State.tick, 1000);
})();
