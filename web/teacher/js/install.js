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
    /** The install block: on the sign-in page, and in More on a phone. */
    html: function () {
      if (!Install.can()) return "";
      return '<div class="install-box">' +
        '<button class="btn install-btn" data-act="install-app">' + A.icon("download") + "Install the app</button>" +
        (Install.apple() ? '<p class="small">On iPhone or iPad: tap <b>Share</b>, then <b>Add to Home Screen</b>.' + (A.Sync && A.Sync.hubMode && A.Sync.hubMode() ? " Open it from the home screen; it shows a code once more for an admin to let in." : "") + "</p>"
          : '<p class="small install-hint">Install adds School Assist to this device like any app. It opens full screen and works without the internet.</p>') +
        "</div>";
    },
  };
  A.act["install-app"] = function () {
    if (!installEvent) {
      if (Install.apple()) {
        A.UI.modal({ title: "Install " + (A.Theme.get().shortName || "School Assist"), size: "sm", body: '<ol class="install-steps"><li>Tap <b>Share</b> ' + A.icon("upload") + " at the bottom of Safari (at the top on an iPad).</li>" +
          "<li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open " + A.esc(A.Theme.get().shortName || "School Assist") + " from the home screen." +
          (A.Sync && A.Sync.hubMode && A.Sync.hubMode() ? " It shows a code once: an admin lets it in under Settings → Devices, then you sign in." : "") + "</li></ol>",
          foot: [{ label: "OK", cls: "btn-primary" }] });
        return;
      }
      A.UI.toast("Use your browser's menu: Install app (or Add to Home screen)");
      return;
    }
    installEvent.prompt();
    installEvent.userChoice.then(function (c) { if (c && c.outcome === "accepted") A.UI.toast("Installing School Assist"); installEvent = null; });
  };
})(window.App);
