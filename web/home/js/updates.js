/* App updates in the desktop app (electron/updater.cjs does the work):
 *   - a bar at the bottom when a new version has been downloaded: "Restart now" opens it
 *   - Settings → App updates: the version in use, where updates come from, Check now,
 *     and going back to the version built into the .exe
 * Nothing here in the browser or the phone apps (they update from the website on their own). */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, UI = A.UI;
  var U = window.desktop && window.desktop.updates;
  if (!U) { A.Updates = null; return; }

  var last = null, dismissed = null;
  function bar(st) {
    last = st;
    var el = document.getElementById("update-bar");
    var show = st && st.ready && dismissed !== st.ready.date;
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "update-bar"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.innerHTML = I("download") + '<div class="grow"><b>A new version of the app is ready.</b> <span class="small">Restart it when you have a moment: your work is saved.</span></div>' +
      '<button class="btn btn-sm btn-primary" data-act="update-apply">' + I("refresh") + "Restart now</button>" +
      '<button class="btn btn-sm btn-ghost" data-act="update-later">Later</button>';
  }
  U.onChange(function (st) {
    bar(st);
    var box = document.getElementById("updates-card");
    if (box) box.outerHTML = card(st);
  });
  U.status().then(bar).catch(function () {});

  A.act["update-apply"] = function () {
    // a paper being sat keeps going: its answers are saved, but ask first
    var sitting = /#\/s\/sit\//.test(location.hash);
    (sitting ? UI.confirm("Restart now? You're sitting a paper: your answers so far are saved and the timer keeps running.", { ok: "Restart" }) : Promise.resolve(true))
      .then(function (ok) { if (ok) U.apply(); });
  };
  A.act["update-later"] = function () { if (last && last.ready) dismissed = last.ready.date; bar(last); };
  A.act["update-check"] = function (el) {
    el.disabled = true; el.innerHTML = I("refresh") + "Checking…";
    U.check().then(function (st) {
      UI.toast(st.lastError ? st.lastError : st.ready ? "A new version is ready" : st.needsNewApp ? "The newest version needs a new copy of the app (.exe)" : "You have the latest version", st.lastError ? "bad" : "");
    });
  };
  A.act["update-rollback"] = function () {
    UI.confirm("Go back to the version built into this copy of the app? It checks for updates again later.", { ok: "Go back" }).then(function (ok) { if (ok) U.rollback(); });
  };

  function when(v) { return v && v.date ? A.fmtDateLong ? A.fmtDateLong(Date.parse(v.date)) : new Date(v.date).toDateString() : "—"; }
  function ver(v) { return v ? "Version of " + esc(when(v)) + ' <span class="muted tnum">(' + esc(v.commit || "—") + ")</span>" : "—"; }
  /** The Settings card. */
  function card(st) {
    if (!st) return '<div class="card card-pad" id="updates-card"><p class="muted">Loading…</p></div>';
    var p = st.progress;
    return '<div class="card card-pad" id="updates-card" style="max-width:640px"><h3>' + I("download") + " App updates</h3>" +
      '<p class="muted small mt-sm">The app checks for a new version when it starts and every six hours while it\'s open, and downloads only what changed. Your work and files aren\'t touched.</p>' +
      '<dl class="kv mt"><dt>In use</dt><dd>' + ver(st.running) + "</dd>" +
      "<dt>Built into this copy</dt><dd>" + ver(st.builtIn) + "</dd>" +
      "<dt>Last checked</dt><dd>" + (st.checking ? "Checking now…" : st.lastCheck ? esc(A.relTime(st.lastCheck)) : "Not yet") + "</dd>" +
      (p ? "<dt>Downloading</dt><dd>" + p.done + " of " + p.total + " files</dd>" : "") +
      (st.lastError ? '<dt>Last problem</dt><dd class="small warn-text">' + esc(st.lastError) + "</dd>" : "") + "</dl>" +
      (st.needsNewApp ? '<div class="callout warn mt">' + I("alert") + "<div>The newest version needs a new copy of the app itself (the .exe). Ask for the latest School Assist Home.exe.</div></div>" : "") +
      (st.ready ? '<div class="callout mt">' + I("checkCircle") + '<div class="grow"><b>A new version is ready</b> (' + esc(st.ready.commit || "") + ", " + esc(when(st.ready)) + ").</div>" +
        '<button class="btn btn-sm btn-primary" data-act="update-apply">' + I("refresh") + "Restart now</button></div>" : "") +
      '<div class="row wrap mt">' + '<button class="btn btn-primary" data-act="update-check"' + (st.checking || !navigator.onLine ? " disabled" : "") + ">" + I("refresh") + (st.checking ? "Checking…" : "Check for updates") + "</button>" +
      (st.installed ? '<button class="btn btn-ghost" data-act="update-rollback">' + I("left") + "Go back to the built-in version</button>" : "") + "</div>" +
      (navigator.onLine ? "" : '<p class="tiny muted mt">' + I("wifiOff") + " You're offline. Updates are checked when you're back online.</p>") + "</div>";
  }
  A.Updates = {
    section: function () {
      return { html: card(null), mount: function () { U.status().then(function (st) { var box = document.getElementById("updates-card"); if (box) box.outerHTML = card(st); }); } };
    },
  };
})(window.App);
