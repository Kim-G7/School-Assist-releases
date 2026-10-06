/* Settings: appearance, branding, class structure, sync, people (passwords + devices),
   devices, exam integrity, backups, and your own PIN or password. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};

  A.route("t/settings", function (p, q, me) { return A.settingsView(me, q); }, { role: "teacher" });

  A.settingsView = function (me, q) {
    var admin = me.role === "teacher" && me.isAdmin;
    var sections = [["appearance", "Appearance", "sun"]];
    if (admin) sections.push(["branding", "School branding", "palette"], ["structure", "Classes & streams", "layers"]);
    if (me.role === "teacher" && A.edition !== "teacher") sections.push(["subjects", "My subjects", "layers"]);
    if (A.Primary) sections.push(["primary", "Learning areas & terms", "book"]);
    sections.push(["sync", "Offline & sync", "refresh"]);
    if (admin) sections.push(["people", "People", "users"], ["devices", "Devices", "phone"]);
    if (me.role === "teacher" && A.edition !== "teacher") sections.push(["integrity", "Exam integrity", "shield"]);
    if (admin && A.Cloud) sections.push(["ai", "AI marking", "bulb"]);
    if (admin) sections.push(["data", "Backup & data", "database"]);
    if (A.Updates) sections.push(["updates", "App updates", "download"]);
    sections.push(["account", me.role === "student" || A.Cloud ? "My password" : "My PIN", "lock"]);
    var sec = sections.some(function (s) { return s[0] === q.s; }) ? q.s : sections[0][0];
    var base = me.role === "student" ? "#/s/settings" : "#/t/settings";
    var tabs = UI.tabs(sections.map(function (s) { return { href: base + "?s=" + s[0], label: s[1], icon: s[2], on: s[0] === sec }; }));
    var view = SECTIONS[sec](me, q);
    return { title: "Settings", html: tabs + (view.html || view), mount: view.mount };
  };

  var SECTIONS = {};
  SECTIONS.updates = function () { return A.Updates.section(); };
  SECTIONS.subjects = function (me) { return A.mySubjectsSection(me); };
  SECTIONS.primary = function (me) { return A.Primary.settingsSection(me); };

  /* ------------------------------------------------------------ appearance */
  SECTIONS.appearance = function (me) {
    var mode = A.Theme.mode();
    return '<div class="card card-pad" style="max-width:640px"><h3>Light or dark</h3><p class="muted small mt-sm">Dark mode is easier on the eyes at night. This setting only affects this device.</p>' +
      '<div class="seg mt">' + [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Match device", "sliders"]].map(function (m) {
        return '<button class="' + (mode === m[0] ? "on" : "") + '" data-act="set-mode" data-m="' + m[0] + '">' + I(m[2]) + m[1] + "</button>";
      }).join("") + "</div></div>" + (A.Screen ? screenCard(me) : "");
  };

  /* Full screen: this device, and (admins) whether students can leave it */
  function screenCard(me) {
    var Sc = A.Screen, admin = me.role === "teacher" && me.isAdmin, locked = Sc.locked();
    var how = {
      desktop: "School Assist opens full screen with no title bar, like a kiosk, with no Windows kiosk account to set up. Use the buttons at the top right to minimise, leave full screen or close the app, or press F11.",
      browser: "Browsers only allow full screen after a tap, so it starts with your first tap or key press. Added to an Android tablet's home screen, it opens full screen straight away.",
      native: "The tablet app always runs full screen with the status and navigation bars hidden. Swipe in from the edge of the screen to show them for a moment.",
    }[Sc.kind];
    var row = function (act, on, title, text) {
      return '<label class="row top small mt" style="gap:12px;cursor:pointer"><span class="toggle"><input type="checkbox" data-change="' + act + '"' + (on ? " checked" : "") + ' aria-label="' + esc(title) + '"><span></span></span><span><b>' + esc(title) + "</b> " + esc(text) + "</span></label>";
    };
    var html = '<div class="card card-pad mt" style="max-width:640px"><h3>Full screen</h3><p class="muted small mt-sm">' + esc(how) + "</p>";
    if (Sc.kind !== "native") {
      html += locked
        ? '<div class="callout mt">' + I("lock") + "<div>Your school keeps students in full screen.</div></div>"
        : row("screen-open-full", Sc.openFull(), "Open in full screen on this device.", "Turn off to use School Assist in a normal window.");
    }
    if (admin) {
      html += '<div class="divider"></div>' + row("screen-student-lock", Sc.studentLock(), "Keep students in full screen.", "While a student is signed in there is no exit or minimise button and F11 does nothing, on every device in the school.") +
        '<p class="muted small mt-sm">The Windows key and Alt+Tab still work, because only a Windows kiosk account can block those. On tablets, use <b>App pinning</b> (Android: Settings → Security) or <b>Guided Access</b> (iPad: Settings → Accessibility) to keep a student inside the app during a test.</p>';
    }
    return html + "</div>";
  }
  A.act["set-mode"] = function (el) { A.Theme.setMode(el.getAttribute("data-m")); A.render(); };

  /* -------------------------------------------------------------- branding */
  SECTIONS.branding = function () {
    var b = A.Theme.get(), saved = S().get("settings", "branding");
    var html = '<div class="grid g-main"><div class="card card-pad"><form id="brand-form">' +
      '<h3>School identity</h3><div class="form-grid mt">' +
      '<label class="field full"><span>School name</span><input class="input" name="name" value="' + esc(b.name) + '"></label>' +
      '<label class="field"><span>Short name <span class="muted">(used when space is tight)</span></span><input class="input" name="shortName" value="' + esc(b.shortName) + '"></label>' +
      '<label class="field"><span>Motto</span><input class="input" name="motto" value="' + esc(b.motto) + '"></label></div>' +
      '<div class="divider"></div><h3>Logo / crest</h3><div class="row wrap mt"><div id="brand-logo" style="width:84px;height:84px">' + A.Theme.logoHTML() + "</div>" +
      '<div class="grow"><label class="btn">' + I("upload") + 'Upload logo<input type="file" accept="image/*" id="brand-logo-in" hidden></label> <button type="button" class="btn btn-ghost" id="brand-logo-clear">Remove uploaded logo</button>' +
      '<p class="tiny muted mt-sm">PNG or SVG with a transparent background works best, square, under 500 KB. With no logo, the app draws a crest from your initials and colours.</p></div></div>' +
      '<input type="hidden" name="logo" value="' + esc(saved && saved.logo != null ? saved.logo : "") + '">' +
      '<div class="divider"></div><h3>Colours</h3><p class="muted small mt-sm">Pick a preset or your school\'s exact colours. Text colours adjust automatically so everything stays readable.</p>' +
      '<div class="swatches mt">' + A.Theme.presets.map(function (p) {
        var on = p.primary.toLowerCase() === b.primary.toLowerCase() && p.secondary.toLowerCase() === b.secondary.toLowerCase();
        return '<button type="button" class="swatch ' + (on ? "on" : "") + '" data-p="' + p.primary + '" data-s="' + p.secondary + '"><span class="pair"><i style="background:' + p.primary + '"></i><i style="background:' + p.secondary + '"></i></span>' + esc(p.name) + "</button>";
      }).join("") + "</div>" +
      '<div class="form-grid mt">' +
      '<div class="field"><span class="label">Main colour</span><div class="row"><input type="color" class="color-input" id="c-primary" value="' + b.primary + '" aria-label="Main colour"><input class="input" name="primary" value="' + b.primary + '" maxlength="7"></div></div>' +
      '<div class="field"><span class="label">Accent colour</span><div class="row"><input type="color" class="color-input" id="c-secondary" value="' + b.secondary + '" aria-label="Accent colour"><input class="input" name="secondary" value="' + b.secondary + '" maxlength="7"></div></div></div>' +
      '<div class="row wrap mt-lg"><button type="button" class="btn btn-primary" id="brand-save">' + I("check") + 'Save branding</button><button type="button" class="btn" id="brand-reset">Reset to school.config.js</button></div></form></div>' +

      '<div class="stack-lg" style="align-self:start"><div class="card"><div class="card-head"><h3>Preview</h3></div><div class="card-body">' +
      '<div class="preview-box"><div style="background:var(--brand-side);color:var(--on-side);padding:14px;display:flex;gap:10px;align-items:center"><div style="width:40px;height:40px" id="pv-logo">' + A.Theme.logoHTML() + '</div><div><b id="pv-name">' + esc(b.name) + '</b><div class="tiny" style="color:var(--side-muted)" id="pv-motto">' + esc(b.motto) + "</div></div></div>" +
      '<div style="background:var(--brand-side);padding:0 10px 10px"><div class="nav-item active" style="margin:0">' + I("home") + '<span class="nav-label">Home</span></div><div class="nav-item" style="margin:0">' + I("cap") + '<span class="nav-label">Exam mode</span><span class="count">3</span></div></div>' +
      '<div style="padding:16px" class="stack"><div class="hero" style="padding:16px"><b>Good morning, Tafadzwa</b></div><div class="row wrap"><button type="button" class="btn btn-primary btn-sm">Primary</button><button type="button" class="btn btn-accent btn-sm">Accent</button><span class="badge brand">Badge</span><span class="badge accent">New</span></div>' + UI.bar(64) + '<a href="javascript:void 0">A link in your colours</a></div></div>' +
      '</div></div><div class="callout">' + I("info") + '<div class="small">These settings are saved on this device and shared with other devices when they sync. To set the defaults for every new installation, edit <code>school.config.js</code> in the app folder.</div></div></div></div>';
    return {
      html: html,
      mount: function (root) {
        var form = root.querySelector("#brand-form");
        var val = function (n) { return form.querySelector("[name=" + n + "]").value; };
        var current = function () { return { name: val("name").trim(), shortName: val("shortName").trim(), motto: val("motto"), logo: val("logo"), primary: val("primary"), secondary: val("secondary") }; };
        var valid = function (h) { return /^#[0-9a-f]{6}$/i.test(h); };
        var refresh = function () {
          var c = current();
          if (!valid(c.primary) || !valid(c.secondary)) return;
          A.Theme.preview({ primary: c.primary, secondary: c.secondary });
          root.querySelector("#pv-name").textContent = c.name;
          root.querySelector("#pv-motto").textContent = c.motto;
          var b = Object.assign({}, A.Theme.get(), c, { logo: c.logo || (window.SCHOOL_CONFIG || {}).logo || "" });
          var logo = b.logo ? '<div class="logo"><img src="' + esc(b.logo) + '" alt=""></div>' : '<div class="logo">' + A.Theme.crestSVG(b) + "</div>";
          root.querySelector("#pv-logo").innerHTML = logo;
          root.querySelector("#brand-logo").innerHTML = logo;
          root.querySelectorAll(".swatch").forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-p").toLowerCase() === c.primary.toLowerCase() && s.getAttribute("data-s").toLowerCase() === c.secondary.toLowerCase()); });
        };
        form.addEventListener("input", function (e) {
          if (e.target.id === "c-primary") form.querySelector("[name=primary]").value = e.target.value;
          if (e.target.id === "c-secondary") form.querySelector("[name=secondary]").value = e.target.value;
          if (e.target.name === "primary" && valid(e.target.value)) root.querySelector("#c-primary").value = e.target.value;
          if (e.target.name === "secondary" && valid(e.target.value)) root.querySelector("#c-secondary").value = e.target.value;
          refresh();
        });
        root.querySelectorAll(".swatch").forEach(function (s) {
          s.addEventListener("click", function () {
            form.querySelector("[name=primary]").value = root.querySelector("#c-primary").value = s.getAttribute("data-p");
            form.querySelector("[name=secondary]").value = root.querySelector("#c-secondary").value = s.getAttribute("data-s");
            refresh();
          });
        });
        root.querySelector("#brand-logo-in").addEventListener("change", function (e) {
          var f = e.target.files[0]; if (!f) return;
          if (f.size > 800 * 1024) { UI.toast("That image is over 800 KB. Please use a smaller logo.", "bad"); return; }
          A.readDataURL(f).then(function (d) { form.querySelector("[name=logo]").value = d; refresh(); });
        });
        root.querySelector("#brand-logo-clear").addEventListener("click", function () { form.querySelector("[name=logo]").value = ""; refresh(); });
        root.querySelector("#brand-save").addEventListener("click", function () {
          var c = current();
          if (!c.name) { UI.toast("Enter the school name", "bad"); return; }
          if (!valid(c.primary) || !valid(c.secondary)) { UI.toast("Colours must look like #1D4E89", "bad"); return; }
          S().put("settings", Object.assign({ id: "branding" }, c));
          A.Theme.apply();
          UI.toast("Branding saved");
          A.render();
        });
        root.querySelector("#brand-reset").addEventListener("click", function () {
          UI.confirm("Go back to the name, logo and colours in school.config.js?", { ok: "Reset" }).then(function (ok) {
            if (!ok) return;
            S().put("settings", { id: "branding" });
            A.Theme.apply();
            A.render();
          });
        });
        A.cleanup = function () { A.Theme.apply(); };
      },
    };
  };

  /* ------------------------------------------------------------------ sync */
  SECTIONS.sync = function () {
    if (A.Cloud) return cloudSyncSection();
    var st = A.Sync.status(), cfg = A.Sync.config();
    var hubCard = window.desktop && M.me().role === "teacher" ? '<div class="card card-pad mb" id="hub-card"><h3>' + I("monitor") + " School hub on this computer</h3><p class=\"muted small mt-sm\">Loading…</p></div>" : "";
    var html = hubCard + '<div class="grid g-main"><div class="card card-pad"><h3>How offline works</h3>' +
      '<ul class="small mt-sm" style="padding-left:18px;line-height:1.8"><li><b>Everything is saved on this device first</b>: registers, marks, tasks, study progress and test results. No internet is needed to use the app.</li>' +
      "<li>PDFs and textbooks are stored on the device too, so students can read them offline.</li>" +
      "<li>When a connection to the school sync server is available, changes are sent and received automatically. Each record belongs to one person (teacher or student), so offline changes never overwrite each other.</li>" +
      "<li>No network at all? Use <b>Backup & data</b> to move a file by USB stick or shared folder.</li></ul>" +
      '<div class="divider"></div><h3>School sync server</h3><p class="muted small mt-sm">Run <code>npm start</code> on one school computer and enter its address here (for example <code>http://192.168.1.20:8080</code>). Leave it empty to keep everything on this device only.</p>' +
      '<form data-submit="sync-save" class="mt"><div class="row wrap"><input class="input grow" name="url" value="' + esc(cfg.url) + '" placeholder="http://192.168.1.20:8080" aria-label="Sync server address">' +
      '<button class="btn" type="submit">Save</button></div><label class="check mt-sm"><input type="checkbox" name="auto"' + (cfg.auto ? " checked" : "") + ">Sync automatically when online (every 30 to 45 seconds)</label></form></div>" +
      '<div class="card card-pad" style="align-self:start"><h3>Status</h3><dl class="kv mt">' +
      "<dt>Connection</dt><dd>" + (navigator.onLine ? '<span class="badge good">' + I("wifi") + "Online</span>" : '<span class="badge warn">' + I("wifiOff") + "Offline</span>") + "</dd>" +
      "<dt>Sync server</dt><dd>" + (cfg.url ? esc(cfg.url) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>Last sync</dt><dd>" + (st.lastSyncAt ? A.relTime(st.lastSyncAt) : "never") + "</dd>" +
      "<dt>Waiting to send</dt><dd>" + st.pending + " change" + (st.pending === 1 ? "" : "s") + "</dd>" +
      (st.lastError ? '<dt>Last problem</dt><dd class="small">' + esc(st.lastError) + "</dd>" : "") +
      "<dt>Stored in</dt><dd>" + esc(S().backend) + "</dd></dl>" +
      '<button class="btn btn-primary btn-block mt" data-act="sync-now"' + (cfg.url ? "" : " disabled") + ">" + I("refresh") + "Sync now</button>" +
      (M.me().role === "student" ? '<div class="divider"></div><label class="row top small" style="gap:12px;cursor:pointer"><span class="toggle"><input type="checkbox" data-change="autosave"' + (autoSaveOn() ? " checked" : "") + ' aria-label="Save library files automatically"><span></span></span><span><b>Save new library files automatically</b> so they open with no internet. Turn off if this device is short of space.</span></label>' : "") +
      "</div></div>";
    return { html: html + offlinePapersCard(M.me()), mount: function (root) { if (hubCard) mountHub(root); mountOffline(); } };
  };
  function autoSaveOn() { try { return localStorage.getItem("sca-autosave") !== "off"; } catch (e) { return true; } }

  /* Students: the past papers kept on this device, one place for all of them (js/sync.js → A.Offline). */
  function size(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB"; }
  function offlinePapersCard(me) {
    if (!A.Offline || !me || me.role !== "student") return "";
    var O = A.Offline, rows = O.summary(me).map(function (r) { return Object.assign(r, { syl: M.syllabus(r.syllabusId) }); })
      .sort(function (a, b) { return String(a.syl ? a.syl.subject : "").localeCompare(String(b.syl ? b.syl.subject : "")); });
    if (!rows.length) return "";
    var kept = rows.filter(function (r) { return r.kept; });
    var ready = A.sum(kept, function (r) { return r.ready; }), total = A.sum(kept, function (r) { return r.total; });
    var missing = A.sum(kept, function (r) { return r.bytes - r.savedBytes; });
    var toggle = function (act, on, label, text) {
      return '<label class="row top small mt" style="gap:12px;cursor:pointer"><span class="toggle"><input type="checkbox" data-change="' + act + '"' + (on ? " checked" : "") + ' aria-label="' + esc(label) + '"><span></span></span><span>' + text + "</span></label>";
    };
    return '<div class="card mt" data-offline-panel><div class="card-head">' + I("download") + "<h3>Past papers on this device</h3>" +
      '<span class="sub">' + ready + " of " + total + " paper" + (total === 1 ? "" : "s") + " ready with no internet</span></div>" +
      '<div class="card-pad"><p class="small muted">Papers saved here open in Test mode, and in the tutor\'s topic tests, with no internet. Each comes with its insert and its marking scheme.</p>' +
      '<p class="small mt-sm" data-offline-job>' + O.statusText() + "</p>" +
      toggle("offline-auto", O.auto(), "Save past papers automatically", "<b>Save past papers automatically</b> for the subjects kept below, newest first.") +
      toggle("offline-data", O.mobileData(), "Use mobile data too", "<b>Use mobile data too.</b> Off: on phones that say they are on mobile data, saving waits for Wi-Fi.") +
      '<p class="tiny muted mt" data-storage></p></div>' +
      rows.map(function (r) {
        var pct = r.total ? Math.round(r.ready / r.total * 100) : 0;
        return '<div class="list-row"><div class="grow"><div class="title">' + esc(r.syl ? r.syl.subject : "Other papers") + '</div><div class="meta small">' +
          (r.kept ? r.ready + " of " + r.total + " papers ready · " + size(r.savedBytes) + " of " + size(r.bytes) : "Left out: opens only with the internet · " + size(r.bytes)) + "</div>" +
          (r.kept ? '<div class="mt-sm" style="max-width:320px">' + UI.bar(pct, pct >= 100 ? "good" : "") + "</div>" : "") + "</div>" +
          '<label class="row small" style="gap:8px;cursor:pointer"><span class="toggle"><input type="checkbox" data-change="offline-keep" data-id="' + esc(r.syllabusId) + '"' + (r.kept ? " checked" : "") +
          ' aria-label="Keep ' + esc(r.syl ? r.syl.subject : "these") + ' papers on this device"><span></span></span><span class="hide-sm">Keep</span></label></div>';
      }).join("") +
      (missing > 0 && !O.job().running ? '<div class="card-foot row"><span class="small muted grow">' + size(missing) + " still to save</span>" +
        '<button class="btn btn-primary" data-act="offline-now"' + (navigator.onLine ? "" : " disabled") + ">" + I("download") + "Save them now</button></div>" : "") + "</div>";
  }
  function mountOffline() {
    var el = document.querySelector("[data-storage]");
    if (!el || !navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (e) {
      if (e && e.usage != null) el.textContent = "School Assist uses " + size(e.usage) + " on this device" + (e.quota ? ", with room for about " + size(Math.max(0, e.quota - e.usage)) + " more." : ".");
    }).catch(function () { /* not available */ });
  }
  A.act["offline-auto"] = function (el) {
    A.Offline.setAuto(el.checked);
    UI.toast(el.checked ? "Past papers will be saved on this device" : "Past papers will only be saved when you open them");
    A.render();
  };
  A.act["offline-data"] = function (el) {
    A.Offline.setMobileData(el.checked);
    UI.toast(el.checked ? "Papers can be saved on mobile data too" : "Papers will wait for Wi-Fi");
  };
  A.act["offline-keep"] = function (el) {
    var id = el.getAttribute("data-id"), s = M.syllabus(id), name = s ? s.subject : "These";
    if (el.checked) {
      var O = A.Offline;
      O.keepSubject(id, true);
      UI.toast(name + " papers will be saved on this device" + (!O.auto() ? " when you tap Save them now" : !O.mobileData() && O.onMobileData() ? " when you are on Wi-Fi" : ""));
      A.render(); return;
    }
    UI.confirm("Leave " + name + " out? Its papers are removed from this device and open only with the internet.", { ok: "Leave it out" }).then(function (ok) {
      if (!ok) { el.checked = true; return; }
      A.Offline.keepSubject(id, false).then(function () { UI.toast(name + " papers removed from this device"); A.render(); });
    });
  };
  A.act["offline-now"] = function () {
    var go = function () { A.Offline.kick(true); A.render(); };
    if (A.Offline.onMobileData()) UI.confirm("You are on mobile data. Saving the papers can use a lot of it. Save them now anyway?", { ok: "Save now" }).then(function (ok) { if (ok) go(); });
    else go();
  };
  A.act.autosave = function (el) {
    try { localStorage.setItem("sca-autosave", el.checked ? "on" : "off"); } catch (e) { /* ignore */ }
    UI.toast(el.checked ? "New library files will be saved on this device" : "Library files will only be saved when you choose");
    if (el.checked && A.Sync) A.Sync.autoSave();
  };
  /* desktop app only: this computer can host the school hub for every other device */
  function mountHub(root) {
    var card = root.querySelector("#hub-card");
    if (!card) return;
    var draw = function (h) {
      var admin = M.me().isAdmin;
      card.innerHTML = '<div class="row wrap top"><div class="grow"><h3 class="row">' + I("monitor") + "School hub on this computer " + (h.running ? '<span class="badge good">' + I("wifi") + "Running</span>" : '<span class="badge">Off</span>') + "</h3>" +
        '<p class="muted small mt-sm" style="max-width:680px">Turn this on for the one computer that stays at school, for example in the office or staff room. Tablets, phones and other laptops on the school Wi-Fi then sync through it, with no internet needed.</p>' +
        (h.running ? '<div class="label mt">Addresses for other devices</div>' + h.urls.slice(1).map(function (u) { return '<code class="pw-mask" style="display:inline-block;margin:0 8px 6px 0;font-size:14px">' + esc(u) + "</code>"; }).join("") +
          (h.urls.length < 2 ? '<p class="small">This computer is not on a network yet. Connect it to the school Wi-Fi.</p>' : '<p class="tiny muted">On each tablet or phone: open this address in the browser, or enter it in Settings → Offline & sync.</p>') : "") +
        (h.error ? '<p class="form-msg">' + I("alert") + esc(h.error) + "</p>" : "") +
        '<p class="tiny muted mt-sm">Hub data folder: ' + esc(h.dataDir) + ". Back it up regularly. Windows may ask to allow School Assist on your network: choose <b>Private networks</b>.</p></div>" +
        '<div class="stack" style="min-width:220px">' + (admin ? (h.running
          ? '<button class="btn btn-danger btn-block" data-hub="stop">' + I("x") + "Stop the hub</button>"
          : '<label class="field"><span>Port</span><input class="input sm" id="hub-port" inputmode="numeric" value="' + h.port + '"></label><button class="btn btn-primary btn-block" data-hub="start">' + I("play") + "Start the hub</button>")
          : '<p class="small muted">Only an admin can turn the hub on or off.</p>') +
        '<button class="btn btn-block" data-hub="open">' + I("database") + "Open data folder</button></div></div>";
    };
    card.addEventListener("click", function (e) {
      var b = e.target.closest("[data-hub]");
      if (!b) return;
      var what = b.getAttribute("data-hub");
      if (what === "open") { window.desktop.hub.openData(); return; }
      b.disabled = true;
      if (what === "start") {
        var port = Number((card.querySelector("#hub-port") || {}).value) || 8080;
        window.desktop.hub.start(port).then(function (h) {
          if (!h.error) {
            A.Sync.setConfig({ url: "http://localhost:" + h.port, auto: true });
            UI.toast("The school hub is running. This computer now syncs through it.");
            A.Sync.syncNow().catch(function () {});
          }
          draw(h);
        });
      } else {
        window.desktop.hub.stop().then(function (h) {
          if (/localhost/.test(A.Sync.config().url || "")) A.Sync.setConfig({ url: "", auto: true });
          UI.toast("The school hub is off");
          draw(h);
        });
      }
    });
    window.desktop.hub.status().then(draw);
  }
  function cloudSyncSection() {
    var st = A.Sync.status(), p = A.Cloud.profile() || {}, me = M.me();
    return { mount: mountOffline, html: '<div class="grid g-main"><div class="card card-pad"><h3>Online and offline</h3>' +
      '<ul class="small mt-sm" style="padding-left:18px;line-height:1.8"><li><b>Everything is saved on this device first</b>, so School Assist works with no internet.</li>' +
      "<li>When you are online it sends your changes straight away and fetches new ones every 30 to 45 seconds: " + (me.role === "student" ? "new notes, tests and files from your admin, and your progress for the admin to see." : "students' progress and test results, and everything you add for them.") + "</li>" +
      "<li>Signed in online as <b>" + esc(p.name || me.name) + "</b>" + (p.student_no ? " (" + esc(p.student_no) + ")" : "") + ".</li></ul></div>" +
      '<div class="card card-pad" style="align-self:start"><h3>Status</h3><dl class="kv mt">' +
      "<dt>Connection</dt><dd>" + (navigator.onLine ? '<span class="badge good">' + I("wifi") + "Online</span>" : '<span class="badge warn">' + I("wifiOff") + "Offline</span>") + "</dd>" +
      "<dt>Last sync</dt><dd>" + (st.lastSyncAt ? A.relTime(st.lastSyncAt) : "never") + "</dd>" +
      "<dt>Waiting to send</dt><dd>" + st.pending + " change" + (st.pending === 1 ? "" : "s") + "</dd>" +
      (st.lastError ? '<dt>Last problem</dt><dd class="small">' + esc(st.lastError) + "</dd>" : "") + "</dl>" +
      '<button class="btn btn-primary btn-block mt" data-act="sync-now">' + I("refresh") + "Sync now</button>" +
      (me.role === "student" ? '<div class="divider"></div><label class="row top small" style="gap:12px;cursor:pointer"><span class="toggle"><input type="checkbox" data-change="autosave"' + (autoSaveOn() ? " checked" : "") + ' aria-label="Save library files automatically"><span></span></span><span><b>Save new library files automatically</b> so they open with no internet. Turn off if this device is short of space.</span></label>' : "") +
      "</div></div>" + offlinePapersCard(me) };
  }
  A.act["sync-save"] = function (form) {
    var f = UI.formData(form);
    A.Sync.setConfig({ url: f.url.trim().replace(/\/+$/, ""), auto: f.auto });
    UI.toast("Sync settings saved");
    A.render();
  };
  A.act["sync-now"] = function (el) {
    el.disabled = true; el.innerHTML = I("refresh") + "Syncing…";
    A.Sync.syncNow().then(function (r) {
      UI.toast("Synced: sent " + r.sent + ", received " + r.received);
    }).catch(function (e) {
      UI.toast("Sync failed: " + e.message, "bad");
    }).then(function () { A.render(); });
  };

  /* ---------------------------------------------------------------- people
     Admins see each student's class, password (to restore a lost or stolen
     account) and how many devices are signed in. */
  SECTIONS.people = function (me, q) {
    // School Assist Teacher: pupils are looked after in My class, so People is the teachers
    var role = A.edition === "teacher" ? "teacher" : q.r || "student", find = (q.q || "").toLowerCase();
    var users = S().filter("users", function (u) { return u.role === role && (!find || (u.name + " " + (u.studentNo || "")).toLowerCase().indexOf(find) >= 0); })
      .sort(function (a, b) { return role === "student" ? M.levelIndex(a.level) - M.levelIndex(b.level) || M.streamIndex(a.stream) - M.streamIndex(b.stream) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name); });
    var html = '<div class="row spread wrap mb">' + (A.edition === "teacher" ? '<p class="muted small" style="max-width:520px">The teachers who sign in on this device or the school hub. Pupils are added in <a href="#/t/pupils">My class</a>.</p><div class="hidden">' : '<div class="pill-tabs" style="margin:0">') + '<button class="' + (role === "student" ? "on" : "") + '" data-act="goto" data-href="#/t/settings?s=people&r=student">Students</button><button class="' + (role === "teacher" ? "on" : "") + '" data-act="goto" data-href="#/t/settings?s=people&r=teacher">Teachers</button></div>' +
      '<form data-submit="people-search" class="row"><input class="input sm" name="q" value="' + esc(q.q || "") + '" placeholder="Search name or ID" style="width:220px" aria-label="Search people"><button class="btn btn-sm" type="submit">' + I("search") + "</button></form>" +
      (A.Cloud ? (role === "student" ? '<button class="btn btn-primary" data-act="cloud-add-student">' + I("plus") + "Add student</button>" : '<button class="btn btn-primary" data-act="teacher-add">' + I("plus") + "Add teacher</button>") :
        '<button class="btn btn-primary" data-act="person-edit" data-role="' + role + '">' + I("plus") + "Add " + role + "</button>") + "</div>";
    if (A.Cloud) {
      html += A.pwRequestsHtml ? A.pwRequestsHtml(me) : "";
      users.sort(function (a, b) { return (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1); });
      if (role === "student") html += '<div class="callout mb">' + I("users") + '<div class="small">Students register themselves, get the next student ID and choose their subjects. <b>Approve</b> their account here; each subject is then approved by its teacher (or by you) in <a href="#/t/requests">Subject requests</a>. Forgotten password? Open <b>Edit</b> and give them a new one. You can\'t see passwords: they are stored scrambled online.</div></div>';
      else html += '<div class="callout mb">' + I("school") + '<div class="small">Teachers sign in with their email address. They see only the subjects they teach, and approve the students who ask to take them. Subjects without a teacher are yours.</div></div>';
    }
    if (role === "teacher" && A.staffAdminHtml) {
      html += A.staffAdminHtml(me);
      users = users.filter(function (u) { return u.status !== "pending"; });
    }
    if (A.Cloud) {
      // (handled above)
    } else if (role === "student") {
      html += '<div class="callout mb">' + I("key") + '<div class="small">Students create their own password the first time they sign in. If a device is lost or stolen, look up the password here or reset it, then sign that device out under <b>Devices</b> so nobody can change the student\'s work.</div></div>';
    }
    html += '<div class="card table-wrap"><table class="table"><thead><tr><th>Name</th>' + (role === "student" ? "<th>Student ID</th><th>Class</th><th>" + (A.Cloud ? "Status" : "Password") + "</th><th>Devices</th>" : "<th>Subjects</th><th>" + (A.Cloud ? "Sign-in" : "PIN") + "</th><th>Devices</th>") + "<th>Subject classes</th><th></th></tr></thead><tbody>" +
      users.map(function (u) {
        var cls = role === "student" ? M.classesForStudent(u.id) : M.classesForTeacher(u.id), dev = A.Devices.summary(u.id);
        var devCell = '<button class="btn btn-sm btn-ghost" data-act="person-devices" data-id="' + u.id + '">' + I(dev.phones ? "phone" : "laptop") + dev.count + (dev.phones ? ' <span class="badge warn">' + dev.phones + " phone" + (dev.phones > 1 ? "s" : "") + "</span>" : "") + "</button>";
        var pw = "";
        if (A.Cloud && role === "student") {
          pw = u.status === "pending" ? '<span class="badge warn">Waiting for approval</span> <button class="btn btn-sm btn-primary" data-act="cloud-approve" data-id="' + u.id + '" data-yes="1">' + I("check") + 'Approve</button> <button class="btn btn-sm btn-ghost" data-act="cloud-approve" data-id="' + u.id + '" data-yes="0">Decline</button>'
            : u.status === "declined" ? '<span class="badge">Declined</span> <button class="btn btn-sm" data-act="cloud-approve" data-id="' + u.id + '" data-yes="1">Approve</button>'
            : '<span class="badge good">' + I("check") + "Approved</span>";
          var waiting = M.enrolments ? M.enrolments(u.id).filter(function (e) { return e.status === "pending" || e.status === "drop_pending"; }).length : 0;
          if (waiting) pw += ' <a class="badge warn" href="#/t/requests">' + waiting + " subject request" + (waiting === 1 ? "" : "s") + " waiting</a>";
        } else if (role === "student") {
          var cr = M.credential(u.id);
          pw = cr && cr.password ? '<span class="pw-cell"><code class="pw-mask" data-pw="' + esc(cr.password) + '">••••••••</code><button class="btn btn-ghost btn-icon btn-sm" data-act="reveal-pw" aria-label="Show password" data-tip="Show password">' + I("eye") + "</button></span>"
            : '<span class="badge warn" data-tip="The student sets a password the first time they sign in">Not set yet</span>';
        }
        return '<tr><td><div class="row">' + A.avatar(u, "sm") + "<b>" + esc(u.name) + "</b>" + (u.isAdmin ? ' <span class="badge accent">Admin</span>' : "") + (u.example ? ' <span class="badge brand">Example</span>' : "") + "</div></td>" +
          (role === "student" ? '<td class="small"><code>' + esc(u.studentNo || "") + '</code></td><td class="small">' + esc(M.studentHome(u)) + "</td><td>" + pw + "</td>" : '<td class="small">' + esc(A.Cloud && !u.isAdmin ? cls.map(function (c) { return c.subject; }).join(", ") || "No subjects yet" : u.subjects || "") + "</td><td>" + (A.Cloud ? '<span class="small muted">Email and password</span>' : '<code class="pw-mask" data-pw="' + esc(u.pin || "") + '">••••</code><button class="btn btn-ghost btn-icon btn-sm" data-act="reveal-pw" aria-label="Show PIN">' + I("eye") + "</button>") + "</td>") +
          "<td>" + devCell + '</td><td class="small muted">' + cls.map(function (c) { return esc(c.subject); }).join(", ") + '</td><td class="num">' +
          (A.Cloud && role === "teacher" && !u.isAdmin
            ? '<div class="row" style="justify-content:flex-end;gap:6px"><button class="btn btn-sm" data-act="teacher-subjects" data-id="' + u.id + '">' + I("layers") + 'Subjects</button><button class="btn btn-sm btn-ghost" data-act="teacher-reset" data-id="' + u.id + '">' + I("key") + 'New password</button><button class="btn btn-sm btn-ghost" data-act="teacher-remove" data-id="' + u.id + '" aria-label="Remove ' + esc(u.name) + '">' + I("trash") + "</button></div>"
            : '<button class="btn btn-sm" data-act="person-edit" data-id="' + u.id + '">' + I("edit") + "Edit</button>") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    if (!users.length) html += '<div class="card mt">' + UI.empty("users", "Nobody matches") + "</div>";
    return role === "teacher" ? { html: html, mount: function () { if (A.mountStaffCodes) A.mountStaffCodes(); } } : html;
  };
  A.act["people-search"] = function (form) { location.hash = "#/t/settings?s=people&r=" + (/r=teacher/.test(location.hash) ? "teacher" : "student") + "&q=" + encodeURIComponent(form.q.value.trim()); };
  A.act["reveal-pw"] = function (el) {
    var code = el.parentNode.querySelector(".pw-mask"), shown = code.textContent.indexOf("•") < 0;
    code.textContent = shown ? "••••••••" : code.getAttribute("data-pw");
    el.innerHTML = I(shown ? "eye" : "eyeOff");
  };
  A.act["person-edit"] = function (el) {
    var st = M.structure();
    var u = S().get("users", el.getAttribute("data-id")) || { role: el.getAttribute("data-role"), name: "", pin: CFG.demoPin || "1234", level: st.levels[0], stream: st.streams[0] };
    var isNew = !u.id, me = M.me(), cr = u.id && M.credential(u.id);
    UI.modal({
      title: isNew ? "Add " + u.role : "Edit " + u.name,
      body: '<form id="person-form" class="form-grid"><label class="field full"><span>Full name</span><input class="input" name="name" value="' + esc(u.name) + '"></label>' +
        (u.role === "student"
          ? '<label class="field"><span>Student ID</span><input class="input" name="studentNo" value="' + esc(u.studentNo || "") + '"></label>' +
            '<label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option" + (l === u.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
            '<label class="field"><span>Class</span><select class="select" name="stream">' + st.streams.map(function (x) { return "<option" + (x === u.stream ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></label>" +
            (A.Cloud ? '<div class="field full"><span class="label">Password</span><div class="row wrap"><button type="button" class="btn btn-sm" data-act="cloud-reset" data-id="' + u.id + '">' + I("refresh") + 'Give a new password</button></div><span class="hint">You get a new password to pass on. Their old one stops working.</span></div>'
              : isNew ? '<p class="field small muted">The student creates a password the first time they sign in.</p>'
              : '<div class="field full"><span class="label">Password</span><div class="row wrap">' + (cr && cr.password ? '<code class="pw-mask" data-pw="' + esc(cr.password) + '">••••••••</code><button type="button" class="btn btn-sm btn-ghost" data-act="reveal-pw">' + I("eye") + "</button>" : '<span class="badge warn">Not set yet</span>') +
                '<button type="button" class="btn btn-sm" data-act="reset-pw" data-id="' + u.id + '">' + I("refresh") + 'Reset password</button></div><span class="hint">Resetting makes the student create a new password next time (they must enter their name and student ID).</span></div>')
          : '<label class="field"><span>Subjects</span><input class="input" name="subjects" value="' + esc(u.subjects || "") + '"></label><label class="field"><span>Title</span><input class="input" name="title" value="' + esc(u.title || "") + '" placeholder="e.g. Head of Science"></label>' +
            (A.Cloud ? "" : '<label class="field"><span>Sign-in PIN (4 digits)</span><input class="input" name="pin" inputmode="numeric" maxlength="4" value="' + esc(u.pin || "") + '"></label>') +
            '<label class="check full"><input type="checkbox" name="isAdmin"' + (u.isAdmin ? " checked" : "") + ">Admin: can change branding, classes and streams, the timetable, people, devices and backups</label>") +
        "</form>",
      foot: (isNew || u.id === me.id ? [] : A.Cloud ? [{ label: "Remove", cls: "btn-danger", onClick: function () {
        A.act["cloud-remove"]({ getAttribute: function () { return u.id; } }); return false;
      } }] : [{ label: "Delete", cls: "btn-danger", onClick: function () {
        return UI.confirm("Delete " + u.name + "? They will be removed from their classes.", { danger: true, ok: "Delete" }).then(function (ok) {
          if (!ok) return false;
          S().all("classes").forEach(function (c) { if (c.studentIds.indexOf(u.id) >= 0) S().patch("classes", c.id, { studentIds: c.studentIds.filter(function (x) { return x !== u.id; }) }); });
          S().remove("users", u.id); UI.toast("Deleted"); A.render();
        });
      } }]).concat([{ label: "Cancel" }, {
        label: "Save", cls: "btn-primary", onClick: function (m) {
          var f = UI.formData(m.querySelector("#person-form"));
          if (!f.name.trim()) { UI.toast("Enter a name", "bad"); return false; }
          var rec = Object.assign({}, u, { name: f.name.trim() });
          if (u.role === "student") {
            if (!f.studentNo.trim()) { UI.toast("Enter the student ID", "bad"); return false; }
            var clash = M.studentById(f.studentNo);
            if (clash && clash.id !== u.id) { UI.toast("That student ID belongs to " + clash.name, "bad"); return false; }
            rec.studentNo = f.studentNo.trim(); rec.level = f.level; rec.stream = f.stream;
          } else {
            if (!A.Cloud && !/^\d{4}$/.test(f.pin)) { UI.toast("The PIN must be 4 digits", "bad"); return false; }
            if (!A.Cloud) rec.pin = f.pin;
            rec.subjects = f.subjects; rec.title = f.title; rec.isAdmin = !!f.isAdmin; if (u.id === me.id) rec.isAdmin = true;
          }
          S().put("users", rec); UI.toast("Saved"); A.render();
        },
      }]),
    });
  };
  A.act["reset-pw"] = function (el) {
    var u = M.user(el.getAttribute("data-id"));
    UI.confirm("Reset " + u.name + "'s password? They will set a new one next time they sign in, using their name and student ID.", { ok: "Reset password" }).then(function (ok) {
      if (!ok) return;
      M.resetPassword(u.id, M.me().id);
      UI.toast("Password reset");
      document.querySelectorAll(".modal-back").forEach(function (x) { x.remove(); });
      A.render();
    });
  };
  A.act["person-devices"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), list = A.Devices.forUser(u.id, true);
    UI.modal({
      title: u.name + ": devices", sub: esc(u.studentNo ? u.studentNo + " · " + M.studentHome(u) : u.title || "Teacher"), size: "wide", flush: true,
      body: list.length ? list.map(deviceRow).join("") : UI.empty("laptop", "No devices yet", "Devices appear here after the first sign-in."),
    });
  };
  function deviceRow(d) {
    var ip = A.Devices.ip(d), u = M.user(d.userId) || {};
    return '<div class="list-row"><div class="stat" style="padding:0"><div class="ico ' + (d.type === "Phone" ? "accent" : "") + '">' + I(A.Devices.icon(d.type)) + '</div></div><div class="grow"><div class="title">' + esc(d.type) + (d.model ? " · " + esc(d.model) : "") + (A.Devices.isThis(d) ? ' <span class="badge brand">This device</span>' : "") + (d.sample ? ' <span class="badge">sample</span>' : "") + "</div>" +
      '<div class="meta"><span>' + esc(u.name || "") + '</span><span class="sep"></span><span>' + esc(d.os) + " · " + esc(d.browser) + '</span><span class="sep"></span><span>Screen ' + esc(d.screen || "?") + "</span>" + (ip ? '<span class="sep"></span><span>IP ' + esc(ip) + "</span>" : "") + "</div>" +
      '<div class="tiny muted">First signed in ' + A.fmtDateTime(d.firstSignInAt) + " · last seen " + A.relTime(d.lastSeenAt) + "</div></div>" +
      (d.signedIn ? '<span class="badge good">' + I("check") + "Signed in</span>" + (A.Devices.isThis(d) ? "" : '<button class="btn btn-sm btn-danger" data-act="device-signout" data-id="' + d.id + '">' + I("logout") + "Sign out</button>") : '<span class="badge">' + (d.revoked ? "Signed out by admin" : "Signed out") + "</span>") + "</div>";
  }
  A.act["device-signout"] = function (el) {
    var d = S().get("devices", el.getAttribute("data-id")), u = M.user(d.userId);
    UI.confirm("Sign " + (u ? u.name : "this account") + " out of this " + d.type.toLowerCase() + "? The next time it syncs it goes back to the sign-in screen.", { danger: true, ok: "Sign out device" }).then(function (ok) {
      if (!ok) return;
      A.Devices.revoke(d, M.me().id);
      UI.toast("Device will be signed out");
      document.querySelectorAll(".modal-back").forEach(function (x) { x.remove(); });
      A.render();
    });
  };

  /* --------------------------------------------------------------- devices */
  SECTIONS.devices = function (me, q) {
    var f = q.f || "all", all = S().all("devices").sort(function (a, b) { return (b.lastSeenAt || 0) - (a.lastSeenAt || 0); });
    var list = all.filter(function (d) { return f === "phones" ? d.type === "Phone" : f === "students" ? d.role === "student" : f === "out" ? !d.signedIn : d.signedIn; });
    var signedIn = all.filter(function (d) { return d.signedIn; });
    var phones = signedIn.filter(function (d) { return d.type === "Phone"; });
    var owners = {};
    phones.forEach(function (d) { owners[d.userId] = 1; });
    var html = '<div class="grid g-4">' + UI.stat("laptop", signedIn.length, "Devices signed in") + UI.stat("phone", phones.length, "Phones", true, Object.keys(owners).length + " people use a phone") +
      UI.stat("tablet", signedIn.filter(function (d) { return d.type === "Tablet"; }).length, "Tablets") + UI.stat("users", Object.keys(signedIn.reduce(function (m, d) { m[d.userId] = 1; return m; }, {})).length, "Accounts in use") + "</div>" +
      '<div class="pill-tabs mt">' + [["all", "Signed in"], ["phones", "Phones"], ["students", "Students only"], ["out", "Signed out"]].map(function (x) { return '<button class="' + (f === x[0] ? "on" : "") + '" data-act="goto" data-href="#/t/settings?s=devices&f=' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<div class="card">' + (list.length ? list.map(deviceRow).join("") : UI.empty("laptop", "No devices here")) + "</div>" +
      '<p class="tiny muted mt">A device is recorded each time someone signs in. The network address shows once the device has synced with the school server. Rows marked "sample" are demo data.</p>';
    return html;
  };

  /* ------------------------------------------------------ classes & streams */
  SECTIONS.structure = function () { return { html: structureHtml(), mount: A.structureMount }; };
  function structureHtml() {
    var st = M.structure();
    var styles = [["letters", "Letters", "4A, 4B, 4C"], ["colours", "Colours", "Form 4 Blue, Form 4 Green"], ["animals", "Animals", "Form 4 Lion, Form 4 Eagle"], ["custom", "Your own names", "e.g. Msasa, Mopane"]];
    return '<div class="grid g-main"><div class="card card-pad"><form id="struct-form">' +
      '<h3>How your school splits each year group</h3><p class="muted small mt-sm">Some schools use letters, some colours, some animals. Pick yours; class names across the app follow it.</p>' +
      '<div class="style-cards mt">' + styles.map(function (s) {
        return '<label class="style-card' + (st.streamStyle === s[0] ? " on" : "") + '"><input type="radio" name="streamStyle" value="' + s[0] + '"' + (st.streamStyle === s[0] ? " checked" : "") + ' hidden><b>' + s[1] + '</b><span class="tiny muted">' + s[2] + "</span></label>";
      }).join("") + "</div>" +
      '<div class="form-grid mt"><label class="field full"><span>Class names, in order <span class="muted">(comma separated)</span></span><input class="input" name="streams" value="' + esc(st.streams.join(", ")) + '"></label>' +
      '<label class="field"><span>Year groups are called</span><select class="select" name="levelLabel">' + ["Form", "Grade", "Year", "Level"].map(function (x) { return "<option" + (x === st.levelLabel ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Year groups, in order <span class="muted">(comma separated)</span></span><input class="input" name="levels" value="' + esc(st.levels.join(", ")) + '"></label></div>' +
      '<p class="small mt">Preview: <b id="struct-preview"></b></p>' +
      '<p class="tiny muted mt-sm">Changing names renames existing classes and students in the same position, for example A → Blue, B → Green.</p>' +
      '<button type="button" class="btn btn-primary mt" id="struct-save">' + I("check") + "Save</button></form></div>" +
      '<div class="card card-pad" style="align-self:start"><h3>Classes now</h3>' + structureSummary() + "</div></div>";
  }
  function structureSummary() {
    var counts = {};
    M.students().forEach(function (u) { var k = M.studentHome(u) || "No class"; counts[k] = (counts[k] || 0) + 1; });
    var keys = Object.keys(counts).sort();
    return keys.length ? '<div class="stack mt">' + keys.map(function (k) { return '<div class="row spread small"><b>' + esc(k) + "</b><span class=\"muted\">" + counts[k] + " students</span></div>"; }).join("") + "</div>" : '<p class="muted small mt">No students yet.</p>';
  }
  A.structureMount = function (root) {
    var form = root.querySelector("#struct-form");
    if (!form) return;
    var preview = function () {
      var lv = form.levels.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean), sm = form.streams.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      root.querySelector("#struct-preview").textContent = (lv[3] || lv[0] ? sm.slice(0, 3).map(function (x) { return M.homeClassName(lv[3] || lv[0], x); }).join(", ") : "");
    };
    form.addEventListener("change", function (e) {
      if (e.target.name === "streamStyle") {
        root.querySelectorAll(".style-card").forEach(function (c) { c.classList.toggle("on", c.querySelector("input").checked); });
        var preset = M.STREAM_PRESETS[e.target.value], n = M.structure().streams.length;
        if (preset) form.streams.value = preset.slice(0, Math.max(n, 2)).join(", ");
        else form.streams.value = "";
      }
      if (e.target.name === "levelLabel") {
        form.levels.value = form.levels.value.split(",").map(function (x) { return x.trim().replace(/^(Form|Grade|Year|Level)\b/, e.target.value); }).join(", ");
      }
      preview();
    });
    form.addEventListener("input", preview);
    root.querySelector("#struct-save").addEventListener("click", function () {
      var f = UI.formData(form), old = M.structure();
      var streams = f.streams.split(",").map(function (x) { return x.trim(); }).filter(Boolean), levels = f.levels.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      if (!streams.length || !levels.length) { UI.toast("Enter at least one year group and one class name", "bad"); return; }
      var mapS = {}, mapL = {};
      old.streams.forEach(function (x, i) { if (streams[i] && streams[i] !== x) mapS[x] = streams[i]; });
      old.levels.forEach(function (x, i) { if (levels[i] && levels[i] !== x) mapL[x] = levels[i]; });
      S().put("settings", { id: "structure", levelLabel: f.levelLabel, levels: levels, streamStyle: f.streamStyle, streams: streams });
      var moved = 0;
      S().filter("users", function (u) { return u.role === "student"; }).forEach(function (u) {
        var nl = mapL[u.level] || u.level, ns = mapS[u.stream] || u.stream;
        if (nl !== u.level || ns !== u.stream) { S().put("users", Object.assign({}, u, { level: nl, stream: ns })); moved++; }
      });
      S().all("classes").forEach(function (c) {
        var nl = mapL[c.level] || c.level, ns = c.stream ? mapS[c.stream] || c.stream : null;
        if (nl !== c.level || ns !== c.stream) S().put("classes", Object.assign({}, c, { level: nl, stream: ns, name: ns ? M.homeClassName(nl, ns) : c.name }));
      });
      S().all("timetable").forEach(function (t) {
        var nl = mapL[t.level] || t.level, ns = mapS[t.stream] || t.stream;
        if (nl !== t.level || ns !== t.stream) S().put("timetable", Object.assign({}, t, { level: nl, stream: ns }));
      });
      UI.toast("Saved" + (moved ? ": " + moved + " students renamed to the new class names" : ""));
      A.render();
    });
    preview();
  };

  /* -------------------------------------------------------- exam integrity */
  SECTIONS.integrity = function (me) {
    var th = M.copyThreshold(me.id);
    return '<div class="card card-pad" style="max-width:720px"><h3>Copying from the marking scheme</h3>' +
      '<p class="muted small mt-sm">After every online test, each written (structured) answer is compared with the marking scheme. An answer counts as <b>identical</b> when at least ' + Math.round(M.IDENTICAL * 100) + '% of its wording matches. You are shown how many answers were identical, and the paper is flagged when the share reaches your limit.</p>' +
      '<form data-submit="save-integrity" class="mt"><label class="field"><span>Flag a paper when this share of written answers is identical</span>' +
      '<div class="row"><input type="range" min="10" max="100" step="5" name="th" value="' + th + '" style="flex:1;accent-color:var(--brand)" oninput="this.form.thv.value=this.value+\'%\'"><output name="thv" class="bold tnum" style="width:48px;text-align:right">' + th + "%</output></div></label>" +
      '<button class="btn btn-primary mt" type="submit">' + I("check") + "Save</button></form>" +
      '<div class="divider"></div><h3>Pop-up notifications</h3><p class="muted small mt-sm">You get pop-ups inside the app when everyone has submitted, 5 minutes before work is due, and when a paper looks copied. You can also get them from your computer or tablet while the app is in the background.</p>' +
      '<button class="btn mt" data-act="notif-permission">' + I("bell") + (window.Notification && Notification.permission === "granted" ? "Device notifications are on" : "Turn on device notifications") + "</button></div>";
  };
  A.act["save-integrity"] = function (form) {
    S().patch("users", M.me().id, { copyThreshold: Number(form.th.value) });
    S().filter("alerts", function (a) { return a.kind === "copy" && a.teacherId === M.me().id && !a.readAt; }).forEach(function (a) { S().remove("alerts", a.id); });
    UI.toast("Saved. Papers are flagged at " + form.th.value + "% or more.");
    A.render();
  };
  A.act["notif-permission"] = function () {
    if (!window.Notification) { UI.toast("This browser can't show device notifications", "bad"); return; }
    Notification.requestPermission().then(function (p) { UI.toast(p === "granted" ? "Device notifications are on" : "Notifications were not allowed", p === "granted" ? "" : "bad"); A.render(); });
  };

  /* ------------------------------------------------------------- AI marking
     Past papers are marked by the app itself where the answer can be checked (multiple choice,
     numbers, algebra, short answers). With AI marking on, written explanations and essays are
     marked too, against the marking scheme, by Claude. It needs an Anthropic API key (paid per use). */
  SECTIONS.ai = function () {
    var on = !!(S().get("settings", "ai") || {}).enabled;
    return {
      html: '<div class="card card-pad" style="max-width:760px"><h3>AI marking for written answers</h3>' +
        '<p class="muted small mt-sm">The app already marks multiple choice, numbers, algebra and short answers. Written explanations and essays are left for students to mark with the scheme. ' +
        'With AI marking on, those answers are also marked against the marking scheme by Claude (Anthropic), with a line of feedback on each. Students can still change any mark.</p>' +
        '<ul class="small mt"><li>Students\' answers, the questions and the marking scheme are sent to Anthropic to be marked. Names are not sent.</li>' +
        '<li>It needs an Anthropic API key, billed by Anthropic per use: roughly US$0.05–0.30 per paper, depending on how much is written.</li>' +
        '<li>Each person can have up to 40 marking requests a day.</li></ul>' +
        '<div id="ai-status" class="callout mt">' + I("refresh") + "<div>Checking…</div></div>" +
        '<label class="check mt"><input type="checkbox" id="ai-on"' + (on ? " checked" : "") + '> <b>Mark written answers with AI</b></label>' +
        '<form data-submit="ai-key" class="mt"><label class="field"><span>Anthropic API key</span><div class="pw-wrap"><input class="input" type="password" name="key" autocomplete="off" placeholder="sk-ant-…"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="pw-toggle" aria-label="Show key">' + I("eye") + "</button></div>" +
        '<span class="hint">Create one at console.anthropic.com → API keys. It is stored online where only the marking service can read it; the app never shows it again.</span></label>' +
        '<div class="row wrap mt-sm"><button class="btn btn-primary" type="submit">' + I("key") + 'Save key</button><button class="btn btn-ghost" type="button" data-act="ai-key-clear">Remove the key</button></div></form></div>',
      mount: function () {
        var box = document.getElementById("ai-status");
        document.getElementById("ai-on").addEventListener("change", function () {
          S().put("settings", Object.assign({}, S().get("settings", "ai") || { id: "ai" }, { id: "ai", enabled: this.checked }));
          UI.toast(this.checked ? "AI marking is on" : "AI marking is off");
        });
        A.Cloud.admin("ai-status").then(function (st) {
          if (!box) return;
          box.className = "callout mt" + (st.configured ? "" : " warn");
          box.innerHTML = I(st.configured ? "checkCircle" : "alert") + "<div>" + (st.configured
            ? "<b>A key is saved</b> (ending " + esc(st.hint || "") + "). Last 30 days: " + st.month.requests + " marking request" + (st.month.requests === 1 ? "" : "s") +
              ", " + Math.round((st.month.input_tokens + st.month.output_tokens) / 1000) + "k tokens."
            : "<b>No key yet.</b> Save an Anthropic API key below, then tick the box.") + "</div>";
        }).catch(function (e) { if (box) box.innerHTML = I("wifiOff") + "<div>" + esc(e.message || String(e)) + "</div>"; });
      },
    };
  };
  A.act["ai-key"] = function (form) {
    var key = form.key.value.trim();
    if (!key) { UI.toast("Paste the key first", "bad"); return; }
    A.Cloud.admin("ai-key", { key: key }).then(function () { form.key.value = ""; UI.toast("Key saved"); A.render(); })
      .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
  };
  A.act["ai-key-clear"] = function () {
    UI.confirm("Remove the AI key? AI marking stops until a new key is saved.", { danger: true, ok: "Remove" }).then(function (ok) {
      if (!ok) return;
      A.Cloud.admin("ai-key", { key: "" }).then(function () { UI.toast("Key removed"); A.render(); }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
    });
  };

  /* ------------------------------------------------------------------ data */
  SECTIONS.data = function (me) {
    var counts = S().COLLS.map(function (c) { return [c, S().all(c).length]; }).filter(function (x) { return x[1]; });
    var html = '<div class="grid g-2"><div class="card card-pad"><h3>Back up</h3><p class="muted small mt-sm">Save everything on this device to a single file. Keep it on a USB stick or another computer, or use it to move data to a device with no network.</p>' +
      '<label class="check mt"><input type="checkbox" id="bk-files" checked>Include uploaded PDFs and files (bigger file)</label>' +
      '<button class="btn btn-primary mt" data-act="backup">' + I("download") + "Download backup</button>" +
      '<div class="divider"></div><h3>Restore or merge</h3><p class="muted small mt-sm"><b>Merge</b> adds newer records from the file and keeps everything else. <b>Replace</b> makes this device an exact copy of the backup.</p>' +
      '<div class="row wrap mt"><label class="btn">' + I("upload") + 'Merge a backup<input type="file" accept=".json" data-change="restore" data-mode="merge" hidden></label><label class="btn btn-danger">' + I("upload") + 'Replace from backup<input type="file" accept=".json" data-change="restore" data-mode="replace" hidden></label></div></div>' +
      '<div class="card card-pad"><h3>On this device</h3><dl class="kv mt">' + counts.map(function (c) { return "<dt>" + esc(c[0]) + "</dt><dd>" + c[1] + "</dd>"; }).join("") + '<dt>Files</dt><dd id="file-count">…</dd></dl>' +
      '<div class="divider"></div><h3>Demo data</h3><p class="muted small mt-sm">The app ships with a demo school so you can try every feature. When you are ready for real use, start empty: branding and your own account are kept.</p>' +
      '<div class="row wrap mt"><button class="btn" data-act="reset-demo">' + I("refresh") + 'Reset demo data</button><button class="btn btn-danger" data-act="start-empty">' + I("trash") + "Start empty</button></div></div></div>";
    return {
      html: html,
      mount: function (root) {
        A.Files.all().then(function (fs) {
          var el = root.querySelector("#file-count");
          if (el) el.textContent = fs.length + " (" + A.fmtBytes(A.sum(fs, function (f) { return f.size || 0; })) + ")";
        });
      },
    };
  };
  A.act.backup = function () {
    var withFiles = document.getElementById("bk-files").checked;
    S().exportAll(withFiles).then(function (data) {
      A.download(A.slug(A.Theme.get().shortName) + "-backup-" + A.isoDate() + ".json", JSON.stringify(data));
      UI.toast("Backup downloaded");
    });
  };
  A.act.restore = function (el) {
    var f = el.files[0], mode = el.getAttribute("data-mode");
    if (!f) return;
    var go = function () {
      A.readText(f).then(function (txt) { return S().importAll(JSON.parse(txt), mode); })
        .then(function () { A.Theme.apply(); UI.toast(mode === "replace" ? "Device restored from backup" : "Backup merged"); A.render(); })
        .catch(function (e) { UI.toast(e.message, "bad"); })
        .then(function () { el.value = ""; });
    };
    if (mode === "replace") UI.confirm("Replace ALL data on this device with the backup? Anything not in the backup is lost.", { danger: true, ok: "Replace" }).then(function (ok) { if (ok) go(); else el.value = ""; });
    else go();
  };
  A.act["reset-demo"] = function () {
    UI.confirm("Rebuild the demo school? All data on this device is replaced with fresh demo data.", { danger: true, ok: "Reset demo" }).then(function (ok) {
      if (!ok) return;
      S().reset().then(function () { UI.toast("Demo data rebuilt"); A.render(); });
    });
  };
  A.act["start-empty"] = function () {
    UI.confirm("Delete all classes, students, syllabuses, tasks and results on this device? Branding and your account are kept. Download a backup first if you might need it.", { danger: true, ok: "Start empty" }).then(function (ok) {
      if (!ok) return;
      S().startEmpty(M.me()).then(function () { UI.toast("Ready for your school"); location.hash = "#/t/home"; A.render(); });
    });
  };

  /* --------------------------------------------------------------- account */
  SECTIONS.account = function (me) {
    if (A.Cloud) {
      var min2 = me.role === "student" ? Number(CFG.minPasswordLength) || 6 : 8;
      return '<div class="card card-pad" style="max-width:480px"><h3>Change my password</h3><p class="muted small mt-sm">' + (me.role === "student" ? "You sign in with your student ID <b>" + esc(me.studentNo) + "</b> and this password." : "You sign in with your email address and this password.") + " You need to be online to change it.</p>" +
        '<form data-submit="cloud-change-password" class="mt"><label class="field"><span>New password</span><input class="input" type="password" name="pw" autocomplete="new-password"><span class="hint">At least ' + min2 + " characters.</span></label>" +
        '<label class="field"><span>Type it again</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>' +
        '<button class="btn btn-primary mt" type="submit">' + I("lock") + "Change password</button></form></div>" +
        recoveryCard();
    }
    if (me.role === "student") {
      var min = Number(CFG.minPasswordLength) || 6;
      return '<div class="card card-pad" style="max-width:480px"><h3>Change my password</h3><p class="muted small mt-sm">You sign in with your student ID <b>' + esc(me.studentNo) + '</b> and this password.</p><form data-submit="change-password" class="mt">' +
        '<input type="text" name="username" value="' + esc(me.studentNo) + '" autocomplete="username" hidden>' +
        '<label class="field"><span>Current password</span><input class="input" type="password" name="old" autocomplete="current-password"></label>' +
        '<label class="field"><span>New password</span><input class="input" type="password" name="pw" autocomplete="new-password"><span class="hint">At least ' + min + " characters.</span></label>" +
        '<label class="field"><span>Type it again</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>' +
        '<button class="btn btn-primary mt" type="submit">' + I("lock") + "Change password</button></form>" +
        '<p class="tiny muted mt">Forgot it? Ask an administrator to reset it. Your school administrators can see student passwords to protect accounts if a device is lost or stolen.</p></div>';
    }
    return '<div class="card card-pad" style="max-width:480px"><h3>Change my PIN</h3><form data-submit="change-pin" class="mt">' +
      '<label class="field"><span>Current PIN</span><input class="input" type="password" name="old" inputmode="numeric" maxlength="4" autocomplete="current-password"></label>' +
      '<label class="field"><span>New PIN (4 digits)</span><input class="input" type="password" name="pin" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>' +
      '<button class="btn btn-primary mt" type="submit">' + I("lock") + "Change PIN</button></form></div>";
  };
  /** The recovery code: for choosing a new password on the sign-in screen after forgetting it. */
  function recoveryCard() {
    A.Cloud.checkRecovery();
    var at = A.Cloud.recoveryAt;
    return '<div class="card card-pad mt" style="max-width:480px"><h3>Recovery code</h3><p class="muted small mt-sm">If you forget your password, the code lets you choose a new one on the sign-in screen (Forgot your password?). Keep it written down somewhere safe.</p>' +
      '<div class="row wrap mt" style="gap:10px">' + (at ? '<span class="badge good">' + I("checkCircle") + "Made " + esc(A.fmtDate(at)) + "</span>" : at === 0 ? '<span class="badge warn">' + I("alert") + "None yet</span>" : '<span class="badge">Checking…</span>') +
      '<span class="grow"></span><button class="btn' + (at ? "" : " btn-primary") + '" data-act="make-recovery"' + (navigator.onLine ? "" : " disabled") + ">" + I("key") + (at ? "Make a new code" : "Make my recovery code") + "</button></div>" +
      '<p class="tiny muted mt">Lost the code too? On the sign-in screen choose Forgot your password?, then Ask the admin.</p></div>';
  }
  A.act["cloud-change-password"] = function (form) {
    var f = UI.formData(form), min = M.me().role === "student" ? Number(CFG.minPasswordLength) || 6 : 8;
    if (f.pw.length < min) { UI.toast("Use at least " + min + " characters", "bad"); return; }
    if (f.pw !== f.pw2) { UI.toast("The two passwords are different", "bad"); return; }
    A.Cloud.changePassword(f.pw).then(function () { UI.toast("Password changed"); form.reset(); })
      .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
  };
  A.act["change-pin"] = function (form) {
    var me = M.me(), f = UI.formData(form);
    if (f.old !== String(me.pin)) { UI.toast("Your current PIN is not right", "bad"); return; }
    if (!/^\d{4}$/.test(f.pin)) { UI.toast("The new PIN must be 4 digits", "bad"); return; }
    S().patch("users", me.id, { pin: f.pin });
    UI.toast("PIN changed");
    form.reset();
  };
  A.act["change-password"] = function (form) {
    var me = M.me(), f = UI.formData(form), cr = M.credential(me.id), min = Number(CFG.minPasswordLength) || 6;
    if (!cr || cr.password !== f.old) { UI.toast("Your current password is not right", "bad"); return; }
    if (f.pw.length < min) { UI.toast("Use at least " + min + " characters", "bad"); return; }
    if (f.pw !== f.pw2) { UI.toast("The two new passwords are different", "bad"); return; }
    M.setPassword(me.id, f.pw, me.id);
    UI.toast("Password changed");
    form.reset();
  };
})(window.App);
