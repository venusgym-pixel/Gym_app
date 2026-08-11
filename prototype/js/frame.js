/* ============================================================================
   Device frame + icon set.

   Vanilla port of ios-frame.jsx: the IOSDevice bezel (402×874, r48), dynamic
   island, status bar and home indicator. All the screens render dark, so the
   `dark` branch of the original is the only one carried over. IOSNavBar,
   IOSList and IOSKeyboard are not ported — no screen on this board uses them.
   ========================================================================= */

window.Frame = (function () {

  /* — icons ─────────────────────────────────────────────────────────────── */

  function stroke(d, o) {
    o = o || {};
    return '<svg width="' + (o.size || 24) + '" height="' + (o.size || 24) + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="' + (o.color || 'currentColor') + '" stroke-width="' + (o.w || 2.75) + '" ' +
      'stroke-linecap="round">' + d + '</svg>';
  }

  var ICON = {
    dumbbell: function (o) { return stroke('<path d="M6.5 6.5v11M17.5 6.5v11M4 9v6M20 9v6M6.5 12h11"/>', o); },
    check:    function (o) { return stroke('<path d="M5 13l4 4L19 7"/>', o); },
    plus:     function (o) { return stroke('<path d="M5 12h14M12 5v14"/>', o); },
    chevron:  function (o) { return stroke('<path d="M9 18l6-6-6-6"/>', o); },
    bell:     function (o) { return stroke('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>', o); },
    alert:    function (o) { return stroke('<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>', o); },
    xcircle:  function (o) { return stroke('<path d="M15 9l-6 6M9 9l6 6"/><circle cx="12" cy="12" r="9"/>', o); },
    torch:    function (o) { return stroke('<path d="M12 3v3M12 18v3M5 12H2M22 12h-3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="3.4"/>', o); },
    qr:       function (o) { return stroke('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M20 20h1M17 20v1"/>', o); }
  };

  /* — status bar (dark variant of IOSStatusBar) ─────────────────────────── */

  var STATUS_ICONS =
    '<svg width="19" height="12" viewBox="0 0 19 12">' +
      '<rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill="#fff"/>' +
      '<rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill="#fff"/>' +
      '<rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill="#fff"/>' +
      '<rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill="#fff"/>' +
    '</svg>' +
    '<svg width="17" height="12" viewBox="0 0 17 12">' +
      '<path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill="#fff"/>' +
      '<path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill="#fff"/>' +
      '<circle cx="8.5" cy="10.5" r="1.5" fill="#fff"/>' +
    '</svg>' +
    '<svg width="27" height="13" viewBox="0 0 27 13">' +
      '<rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="#fff" stroke-opacity="0.35" fill="none"/>' +
      '<rect x="2" y="2" width="20" height="9" rx="2" fill="#fff"/>' +
      '<path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill="#fff" fill-opacity="0.4"/>' +
    '</svg>';

  /* — frame ─────────────────────────────────────────────────────────────── */

  function device(content) {
    return '' +
      '<div class="ios">' +
        '<div class="ios-island"></div>' +
        '<div class="ios-status">' +
          '<div><span class="ios-time">9:41</span></div>' +
          '<div class="ios-icons">' + STATUS_ICONS + '</div>' +
        '</div>' +
        '<div class="ios-body"><div class="ios-scroll">' + content + '</div></div>' +
        '<div class="ios-home"><span></span></div>' +
      '</div>';
  }

  return { device: device, icon: ICON, stroke: stroke };
})();
