/* Full screen on every device: like a kiosk, with no kiosk account to set up.
   - Desktop app: the window opens full screen. There is no title bar, so the top
     bar shows minimise, exit full screen and close (or press F11).
   - Browsers (laptops, tablets): browsers only allow full screen after a tap or
     key press, so it starts on the first one. Installed to an Android home screen
     it opens full screen straight away (manifest "display": "fullscreen").
   - Android and iPhone apps: the app hides the system bars itself (docs/MOBILE.md).
   Schools can keep students in full screen (Settings → Appearance): no exit or
   minimise buttons, F11 does nothing, and a browser goes back to full screen on
   the next tap. */
(function (A) {
  "use strict";
  var I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var desk = window.desktop && window.desktop.screen;
  var cap = window.Capacitor;
  var native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var kind = desk ? "desktop" : native ? "native" : "browser";

  var deskState = { fullScreen: false, openFullScreen: true, locked: false };
  var sentLock = null;   // last lock value sent to the desktop window
  var ourExit = false;   // the next "left full screen" came from our own button
  var userLeft = false;  // the person left full screen: don't pull them back (unless kept in)
  try { userLeft = sessionStorage.getItem("sca-fs-left") === "1"; } catch (e) { /* private mode */ }

  function docFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function installedFull() { try { return matchMedia("(display-mode: fullscreen)").matches; } catch (e) { return false; } }
  function browserCan() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  function remember(left) {
    userLeft = left;
    try { if (left) sessionStorage.setItem("sca-fs-left", "1"); else sessionStorage.removeItem("sca-fs-left"); } catch (e) { /* ignore */ }
  }
  function requestDoc() {
    var el = document.documentElement;
    try {
      var r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
      if (r && r.catch) r.catch(function () { /* refused: no tap yet, or not allowed here */ });
    } catch (e) { /* not supported */ }
  }
  function exitDoc() {
    if (!docFull()) return;
    ourExit = true;
    try {
      var r = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen ? document.webkitExitFullscreen() : null;
      if (r && r.catch) r.catch(function () {});
    } catch (e) { /* ignore */ }
  }

  var Screen = A.Screen = {
    kind: kind,
    isFull: function () {
      if (kind === "desktop") return deskState.fullScreen;
      if (kind === "native") return true;
      return docFull() || installedFull();
    },
    /** Whether the app itself can switch full screen on and off here. */
    canToggle: function () { return kind === "desktop" || (kind === "browser" && browserCan() && !installedFull()); },

    /** This device: open in full screen. On unless someone turns it off. */
    openFull: function () {
      if (kind === "desktop") return deskState.openFullScreen;
      try { return localStorage.getItem("sca-fullscreen") !== "off"; } catch (e) { return true; }
    },
    setOpenFull: function (on) {
      if (kind === "desktop") return desk.setOpenFull(on).then(syncDesk);
      try { localStorage.setItem("sca-fullscreen", on ? "on" : "off"); } catch (e) { /* private mode */ }
      return Promise.resolve();
    },

    /** The school: students stay in full screen. On unless an admin turns it off. */
    studentLock: function () {
      var rec = S() && S().state ? S().get("settings", "screen") : null;
      if (rec && rec.studentLock != null) return !!rec.studentLock;
      return (CFG.screen || {}).studentLock !== false;
    },
    setStudentLock: function (on) { S().put("settings", { id: "screen", studentLock: !!on }); Screen.paint(); },
    locked: function () { var me = M.me(); return !!(me && me.role === "student" && Screen.studentLock()); },

    enter: function () {
      if (kind === "desktop") return desk.set(true).then(syncDesk);
      remember(false);
      requestDoc();
    },
    exit: function () {
      if (Screen.locked()) return;
      if (kind === "desktop") return desk.set(false).then(syncDesk);
      remember(true);
      exitDoc();
    },

    /** The window buttons. Every render includes all four; CSS shows the ones that apply. */
    controls: function () {
      return '<span class="scr-ctl">' +
        '<button class="btn btn-ghost btn-icon scr-enter" data-act="screen-enter" data-tip="Full screen" aria-label="Full screen">' + I("expand") + "</button>" +
        '<button class="btn btn-ghost btn-icon scr-min" data-act="screen-min" data-tip="Minimise" aria-label="Minimise">' + I("minus") + "</button>" +
        '<button class="btn btn-ghost btn-icon scr-exit" data-act="screen-exit" data-tip="Exit full screen" aria-label="Exit full screen">' + I("shrink") + "</button>" +
        '<button class="btn btn-ghost btn-icon scr-quit" data-act="screen-quit" data-tip="Close School Assist" aria-label="Close School Assist">' + I("x") + "</button>" +
        "</span>";
    },

    /** Keep the page's classes and the desktop window's lock in step. Called on every render. */
    paint: function () {
      var root = document.documentElement, locked = Screen.locked();
      root.classList.toggle("scr-full", Screen.isFull());
      root.classList.toggle("scr-can", Screen.canToggle());
      root.classList.toggle("scr-desktop", kind === "desktop");
      root.classList.toggle("scr-locked", locked);
      if (kind === "desktop" && sentLock !== locked) {
        sentLock = locked;
        desk.lock(locked).then(syncDesk);
      }
    },
  };

  function syncDesk(st) {
    if (st) deskState = st;
    Screen.paint();
    return st;
  }

  A.act["screen-enter"] = function () { Screen.enter(); };
  A.act["screen-exit"] = function () { Screen.exit(); };
  A.act["screen-min"] = function () { if (kind === "desktop") desk.minimize(); };
  A.act["screen-quit"] = function () { if (kind === "desktop") desk.quit(); };
  A.act["screen-open-full"] = function (el) {
    Screen.setOpenFull(el.checked).then(function () {
      if (el.checked && !Screen.isFull()) Screen.enter();
      UI.toast(el.checked ? "School Assist will open in full screen on this device" : "School Assist will open in a window on this device");
    });
  };
  A.act["screen-student-lock"] = function (el) {
    Screen.setStudentLock(el.checked);
    UI.toast(el.checked ? "Students stay in full screen" : "Students can leave full screen");
  };

  /* ------------------------------------------------------------- per device */
  if (kind === "desktop") {
    desk.onChange(function (full) { deskState.fullScreen = full; Screen.paint(); });
    desk.state().then(syncDesk);
  } else if (kind === "native") {
    // Android and iPhone: hide the status bar (the navigation bar is hidden natively, see docs/MOBILE.md)
    var bar = cap.Plugins && cap.Plugins.StatusBar;
    if (bar && bar.hide) bar.hide().catch(function () {});
  } else {
    // Browsers need a tap or key press before they allow full screen, so ask on the first one.
    var onGesture = function (e) {
      if (e.type === "keydown" && (e.key === "Escape" || e.key === "F11")) return;
      if (!browserCan() || docFull() || installedFull()) return;
      if (e.target.closest && e.target.closest(".scr-ctl")) return; // the button handles itself
      if (Screen.locked() || (Screen.openFull() && !userLeft)) requestDoc();
    };
    document.addEventListener("pointerup", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    var changed = function () {
      if (!docFull() && !ourExit && !Screen.locked()) remember(true); // they pressed Esc: leave them be
      ourExit = false;
      Screen.paint();
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("webkitfullscreenchange", changed);
  }
})(window.App);
