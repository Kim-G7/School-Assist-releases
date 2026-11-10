/* Installing School Assist from its website (every edition: the cloud hub, the Home edition online), so it opens
   from the home screen like any app, full screen, and works without the internet.
   - Chrome and Edge (Android, Windows) offer a real install prompt (beforeinstallprompt).
   - iPhone and iPad: Share → Add to Home Screen. The home-screen app keeps its own storage, apart from Safari, so on
     a school hub it shows a join code once more for an admin to let in.
   Only on a secure address (https; localhost for trying it): a school hub on its Wi-Fi is plain http, where phones
   can't install a website. The desktop app is already installed. */
(function (A) {
  "use strict";
  A.act = A.act || {}; // the page's action list (js/app.js keeps these)
  var installEvent = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvent = e;
    document.documentElement.classList.add("can-install");
  });
  window.addEventListener("appinstalled", function () { installEvent = null; document.documentElement.classList.remove("can-install"); });
  var Install = A.Install = {
    installed: function () { try { return matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } },
    apple: function () { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); },
    /** Can this page be installed here? (Not the desktop app, not installed already, a secure address.) */
    can: function () {
      return !window.desktop && !Install.installed() && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
    },
    /** Let in already on this device's school (an iPhone's Home Screen app is let in with a number from here). */
    joined: function () { return !!(A.Sync && A.Sync.hubMode && A.Sync.hubMode() && A.Sync.joinState().key); },
    /** The install block: on the join pages ("join": not let in yet), the sign-in page, and in More on a phone. */
    html: function (where) {
      if (!Install.can()) return "";
      var apple = where === "join"
        ? "On iPhone or iPad, add it to the Home Screen first (tap <b>Share</b>, then <b>Add to Home Screen</b>) and join from the app there: it keeps its own place, apart from Safari."
        : "On iPhone or iPad: tap <b>Install the app</b> for the steps." + (Install.joined() ? " The Home Screen app is let in with a number from here, without asking an admin again." : "");
      return '<div class="install-box">' +
        '<button class="btn install-btn" data-act="install-app">' + A.icon("download") + "Install the app</button>" +
        (Install.apple() ? '<p class="small">' + apple + "</p>"
          : '<p class="small install-hint">Install adds School Assist to this device like any app. It opens full screen and works without the internet.</p>') +
        "</div>";
    },
  };
  // the school's name once this device has it (before that, the theme is the built-in sample school's)
  var name = function () {
    var t = A.Theme.get(), m = A.Store && A.Store.state && A.Store.state.meta, id = A.Theme.override || (A.SchoolId && A.SchoolId.id && A.SchoolId.id());
    return A.esc(id ? t.shortName || t.name : (m && m.multi && m.multi.name) || "School Assist");
  };
  A.act["install-app"] = function () {
    if (installEvent) {
      installEvent.prompt();
      installEvent.userChoice.then(function (c) { if (c && c.outcome === "accepted") A.UI.toast("Installing School Assist"); installEvent = null; });
      return;
    }
    if (Install.apple()) {
      // the Home Screen app keeps its own storage: a device let in here gives it a number, so no admin is asked again
      var carry = Install.joined();
      A.UI.modal({ title: "Install " + name(), size: "sm", body: '<ol class="install-steps"><li>Tap <b>Share</b> ' + A.icon("upload") + " at the bottom of Safari (at the top on an iPad).</li>" +
        "<li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open " + name() + " from the Home Screen." +
        (carry ? ' When it asks to join, type this number: <b class="carry-code">…</b> <span class="small muted carry-note">(making it)</span>' : A.Sync && A.Sync.hubMode && A.Sync.hubMode() ? " It shows a code once: an admin lets it in under Settings → People & devices, then you sign in." : "") + "</li></ol>",
        foot: [{ label: "OK", cls: "btn-primary" }],
        onMount: function (el) {
          if (!carry) return;
          var b = el.querySelector(".carry-code"), note = el.querySelector(".carry-note");
          A.Sync.carryCode().then(function (r) {
            if (b) b.textContent = String(r.code).replace(/^(\d{3})(\d{3})$/, "$1 $2");
            if (note) note.textContent = "(it works once, until " + A.fmtTime(r.until) + ")";
          }).catch(function () {
            // a school hub that doesn't make numbers yet (it needs the newer School Assist): an admin lets the app in
            if (b) b.parentNode.innerHTML = "Open " + name() + " from the Home Screen. It shows a code once: an admin lets it in under Settings → People & devices, then you sign in.";
          });
        } });
      return;
    }
    // Chrome on Android hasn't offered its install yet (it waits until the page has been used a little): its menu does it
    A.UI.modal({ title: "Install " + name(), size: "sm", body: '<ol class="install-steps"><li>Open the browser\'s menu: <b>⋮</b> at the top right in Chrome, or <b>≡</b> at the bottom in Samsung Internet.</li>' +
      "<li>Tap <b>Install app</b> or <b>Add to Home screen</b>" + (/Samsung/i.test(navigator.userAgent) ? " (in Samsung Internet: <b>Add page to</b> → <b>Home screen</b>)" : "") + ", then <b>Install</b>.</li>" +
      "<li>Open " + name() + " from the home screen. It is the same " + (/Mobile|Android/i.test(navigator.userAgent) ? "phone" : "device") + " to the school: nobody has to let it in again.</li></ol>",
      foot: [{ label: "OK", cls: "btn-primary" }] });
  };
})(window.App);
