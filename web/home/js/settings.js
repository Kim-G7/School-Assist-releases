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
    if (me.role === "teacher" && A.edition !== "teacher") sections.push(["subjects", A.Primary ? "My syllabuses" : "My subjects", "layers"]); // (School edition: My subjects is a page of its own, js/tracker.js)
    if (A.Primary && admin) sections.push(["primary", "Learning areas & terms", "book"]);
    // (not for students: the school decides where its records are, and a student can't point the app anywhere else)
    if (me.role !== "student" && (A.edition !== "teacher" || admin)) sections.push(["sync", "Offline & sync", "refresh"]); // School Assist Teacher: admins only
    if (admin) sections.push(["people", "People", "users"], ["devices", "Devices", "phone"]);
    if (me.role === "teacher" && A.edition !== "teacher") sections.push(["integrity", "Exam integrity", "shield"]);
    if (admin && A.edition !== "teacher" && A.AI && (!A.Licence || A.Licence.has("ai-marking"))) sections.push(["ai", "AI marking", "bulb"]); // Premium (hidden on Standard); online, or through the school hub
    if (admin && A.Licence && A.Licence.applies()) sections.push(["licence", "Plan & licence", "key"]);
    // (no "Share the app" for now: Golden Technologies brings School Assist on a flash drive, or the school uses it online)
    if (admin) sections.push(["data", "Backup & data", "database"]); // the online backup is in it too (SECTIONS.data)
    if (A.Updates) sections.push(["updates", "App updates", "download"]);
    sections.push(["account", me.role === "student" || A.Cloud || A.staffPassword(me) ? "My password" : "My PIN", "lock"]);
    var want = q.s === "backup" ? "data" : q.s; // (Online backup had a tab of its own before 1.6.2)
    var sec = sections.some(function (s) { return s[0] === want; }) ? want : sections[0][0];
    var base = me.role === "student" ? "#/s/settings" : "#/t/settings";
    var tabs = UI.tabs(sections.map(function (s) { return { href: base + "?s=" + s[0], label: s[1], icon: s[2], on: s[0] === sec }; }));
    var view = SECTIONS[sec](me, q);
    return { title: "Settings", html: tabs + (view.html || view), mount: view.mount };
  };

  var SECTIONS = {};
  SECTIONS.updates = function () { return A.Updates.section(); };
  SECTIONS.subjects = function (me) { return A.mySubjectsSection(me); };
  SECTIONS.primary = function (me) { return A.Primary.settingsSection(me); };
  SECTIONS.licence = function (me) { return A.Licence.section(me); };
  SECTIONS.share = function () { return A.SchoolId.shareSection(); };
  SECTIONS.backup = function (me) { return A.Backup.section(me); };

  /* ------------------------------------------------------------ appearance */
  SECTIONS.appearance = function (me) {
    var mode = A.Theme.mode();
    return '<div class="card card-pad" style="max-width:640px"><h3>Light or dark</h3><p class="muted small mt-sm">For this device only.</p>' +
      '<div class="seg mt">' + [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Match device", "sliders"]].map(function (m) {
        return '<button class="' + (mode === m[0] ? "on" : "") + '" data-act="set-mode" data-m="' + m[0] + '">' + I(m[2]) + m[1] + "</button>";
      }).join("") + "</div></div>" + (A.Screen ? screenCard(me) : "");
  };

  /* Full screen: this device, and (admins) whether students can leave it */
  function screenCard(me) {
    var Sc = A.Screen, admin = me.role === "teacher" && me.isAdmin, locked = Sc.locked();
    var row = function (act, on, title, text) {
      return '<label class="row top small mt" style="gap:12px;cursor:pointer"><span class="toggle"><input type="checkbox" data-change="' + act + '"' + (on ? " checked" : "") + ' aria-label="' + esc(title) + '"><span></span></span><span><b>' + esc(title) + "</b> " + esc(text) + "</span></label>";
    };
    var html = '<div class="card card-pad mt" style="max-width:640px"><h3>Full screen</h3>';
    if (Sc.kind !== "native") {
      html += locked
        ? '<div class="callout mt">' + I("lock") + "<div>Your school keeps students in full screen.</div></div>"
        : row("screen-open-full", Sc.openFull(), "Open in full screen on this device.", "");
    }
    if (admin && A.edition !== "teacher") { // School Assist Teacher has no student sign-ins
      html += '<div class="divider"></div>' + row("screen-student-lock", Sc.studentLock(), "Keep students in full screen.", "No exit or minimise button while a student is signed in.");
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
      '<label class="field"><span>Motto</span><input class="input" name="motto" value="' + esc(b.motto) + '"></label>' +
      '<label class="field full"><span>Vision <span class="muted">(on the sign-in screen)</span></span><textarea class="textarea" name="vision" rows="2">' + esc(b.vision) + "</textarea></label>" +
      '<label class="field full"><span>Mission</span><textarea class="textarea" name="mission" rows="2">' + esc(b.mission) + "</textarea></label>" +
      '<label class="field full"><span>Aims <span class="muted">(one per line)</span></span><textarea class="textarea" name="aims" rows="3">' + esc(b.aims) + "</textarea></label></div>" +
      '<div class="divider"></div><h3>Logo / crest</h3><div class="row wrap mt"><div id="brand-logo" style="width:84px;height:84px">' + A.Theme.logoHTML() + "</div>" +
      '<div class="grow"><label class="btn">' + I("upload") + 'Upload logo<input type="file" accept="image/*" id="brand-logo-in" hidden></label> <button type="button" class="btn btn-ghost" id="brand-logo-clear">Remove uploaded logo</button>' +
      '<p class="tiny muted mt-sm">PNG or SVG, square, under 500 KB. It is also the app\'s icon.</p></div></div>' +
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
        var current = function () { return { name: val("name").trim(), shortName: val("shortName").trim(), motto: val("motto"), vision: val("vision").trim(), mission: val("mission").trim(), aims: val("aims").trim(), logo: val("logo"), primary: val("primary"), secondary: val("secondary") }; };
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
    var linkCard = M.me().isAdmin && A.Sync.hubMode() ? '<div class="card card-pad mb" id="link-card"><h3>' + I("globe") + " Online copy</h3><p class=\"muted small mt-sm\">Asking the school hub…</p></div>" : "";
    // phones away from school through School Assist (1.8): on a school's hub computer only (the card stays hidden elsewhere)
    var relayCard = M.me().isAdmin && A.Sync.hubMode() && !A.multiHost ? '<div class="card card-pad mb" id="relay-card" hidden></div>' : "";
    var html = hubCard + whereCard() + relayCard + linkCard + '<div class="grid g-main"><div class="card card-pad"><h3>School hub address</h3><p class="muted small mt-sm">Empty: this device only.</p>' +
      '<form data-submit="sync-save" class="mt"><div class="row wrap"><input class="input grow" name="url" value="' + esc(cfg.url) + '" placeholder="http://192.168.1.20:8080" aria-label="Sync server address">' +
      '<button class="btn" type="submit">Save</button></div><label class="check mt-sm"><input type="checkbox" name="auto"' + (cfg.auto ? " checked" : "") + ">Sync automatically when online (every few seconds)</label></form></div>" +
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
    return { html: html + offlinePapersCard(M.me()), mount: function (root) { if (hubCard) mountHub(root); if (relayCard) mountRelay(root); if (linkCard) mountLink(root); mountWhere(); mountMove(); mountOffline(); } };
  };

  /* The app for every school (1.7): where this school's records are kept, School Assist's servers or the school's own. */
  function whereCard() {
    var me = M.me(), m = A.Store.state.meta;
    if (!me || !me.isAdmin || !((A.multiHost && m.multi) || m.joinLink)) return "";
    var mv = m.multi || {}, own = mv.hub, keptUntil = own && mv.movedFrom && !mv.erased && mv.eraseAt > A.now() ? mv.eraseAt : 0;
    // on the school's hub computer, reached through School Assist (1.8, hub-relay.cjs)
    if (mv.relay) return '<div class="card card-pad mb" id="where-card"><h3 class="row">' + I("database") + " Where the school's records are kept</h3>" +
      '<p class="mt-sm" style="max-width:680px"><b>On the school\'s hub computer</b>, at school. Away from school, devices reach it through School Assist (schoolassistapp.com), which passes each request on and keeps none of the school\'s records.</p>' +
      '<p class="small muted mt-sm" style="max-width:680px">While that computer is off or offline, everyone keeps working on their own device, and their changes go up when it is back.</p></div>';
    return '<div class="card card-pad mb" id="where-card"><h3 class="row">' + I("database") + " Where the school's records are kept</h3>" + (own
      ? '<p class="mt-sm" style="max-width:680px"><b>On the school\'s own server</b>, <code>' + esc(own) + "</code>. School Assist keeps only the school's code and this address: Golden Technologies holds none of the school's records.</p>" +
        (keptUntil ? '<p class="small mt-sm" style="max-width:680px">The school moved here from School Assist\'s servers. In case anything went wrong, School Assist keeps its copy until <b>' + esc(A.fmtDate(keptUntil)) + "</b>, then erases it by itself.</p>" +
          '<button class="btn btn-sm btn-danger mt-sm" data-act="move-erase">' + I("trash") + "Erase School Assist's copy now</button>" : "")
      : '<p class="mt-sm" style="max-width:680px"><b>On School Assist\'s servers</b> (schoolassistapp.com), run by Golden Technologies: each school\'s records apart from the others\', encrypted with a key of their own.</p>' +
        '<p class="small muted mt-sm" style="max-width:680px">To keep them at school instead, on a computer of the school\'s own, install School Assist on that computer and bring the school there with a move code. Phones keep this address and reach that computer through School Assist, which then keeps none of the school\'s records. ' +
        'Or, on a server in the school\'s own account: Golden Technologies sets one up with the school\'s IT person (its address and link key are printed then), and the records move there.</p>' +
        (A.Sync.hubMode() ? '<div id="move-slot" class="mt"></div>' : "")) + "</div>";
  }

  /* Where the school is, asked again (1.8): a school that moved onto its hub computer kept this address, so its devices
     learn it here rather than by following a new one. */
  function mountWhere() {
    var m = A.Store.state.meta, mv = m.multi;
    if (!A.multiHost || !mv || !mv.sid || mv.hub || mv.relay || !M.me() || !M.me().isAdmin) return;
    fetch(location.origin + "/api/schools/" + encodeURIComponent(mv.sid)).then(function (r) { return r.ok ? r.json() : null; }).then(function (w) {
      if (!w || !w.relay) return;
      mv.relay = true;
      A.Store.flush();
      var card = document.getElementById("where-card");
      if (card) card.outerHTML = whereCard();
    }, function () { /* offline: as it was */ });
  }

  /* Moving the school's records to its own server (1.7, hub-move.cjs, on School Assist's side). The move runs on the
     server; this page starts it and follows it. Devices keep their keys and follow by themselves (js/sync.js follow). */
  var STEPS = { check: "Checking the school's server", records: "Copying the records", files: "Copying the files", hold: "Holding changes for a moment",
    final: "Copying the last changes", devices: "Taking the devices' keys across", verify: "Checking the copy", "switch": "Switching to the school's server" };
  var moveTimer = null;
  function mb(b) { return !b ? "0 KB" : b >= 1048576 ? Math.round(b / 1048576) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function moveHtml(s) {
    if (s.state === "running") {
      var r = s.records || {}, f = s.files || {}, pct = s.step === "records" && r.total ? r.done / r.total : s.step === "files" && f.totalBytes ? f.bytes / f.totalBytes : null;
      return '<div class="row small" style="gap:8px"><span class="setup-spin sm" aria-hidden="true"></span><b>' + esc(STEPS[s.step] || "Moving") + "</b>" +
        (s.step === "records" && r.total ? " " + r.done + " of " + r.total : s.step === "files" && f.total ? " " + f.done + " of " + f.total + " (" + mb(f.bytes) + " of " + mb(f.totalBytes) + ")" : "") + "…</div>" +
        (pct != null ? '<div class="bar mt-sm" style="max-width:420px"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' : "") +
        '<p class="small muted mt-sm" style="max-width:680px">To <code>' + esc(s.to || "") + "</code>. Keep working: while the last changes copy, they wait on each device and go to the school's server by themselves.</p>";
    }
    return (s.state === "failed" ? '<div class="callout warn mb-sm" style="max-width:680px">' + I("alert") + "<div><b>The move stopped</b>: " + esc(s.error || "") + " The school carries on here as before, and a new try carries on where this one stopped.</div></div>" : "") +
      '<div class="row wrap"><button class="btn btn-primary" data-act="move-pass">' + I("monitor") + "Move to the school's computer</button>" +
      '<button class="btn" data-act="move-open">' + I("upload") + "Move to the school's own server</button></div>";
  }
  /* A move code (1.8): typed on the school's new hub computer (its set-up: Bring the school onto this computer), which
     then takes everything from School Assist. One at a time, for 30 minutes, used once. */
  A.act["move-pass"] = function () {
    var m = A.Store.state.meta, sid = (m.multi && m.multi.sid) || "";
    UI.modal({
      title: "Move to the school's computer", size: "lg",
      body: '<p style="max-width:640px">Everything ' + esc(A.Theme.get().name) + " has here moves onto a computer at school, which becomes the school's hub: every record, every uploaded file, and every registered device.</p>" +
        '<ul class="small mt-sm" style="max-width:640px;padding-left:18px">' +
        "<li>Phones and laptops keep this address and their keys: nobody joins again or signs in again. Away from school, School Assist passes their requests to that computer and keeps none of the school's records.</li>" +
        "<li>That computer should stay on and online during the school day. While it is off, everyone keeps working on their own device, and their changes go up when it is back.</li>" +
        "<li>School Assist keeps its copy for 7 days in case, then erases it (or sooner, from that computer).</li></ul>" +
        '<ol class="small mt" style="max-width:640px;padding-left:18px">' + "<li>Install School Assist on the school's computer (from Golden Technologies, or the school's flash drive).</li>" +
        "<li>On its first page, choose <b>Bring the school onto this computer</b>.</li><li>Type the school's code and the move code below.</li></ol>" +
        '<div id="pass-box" class="mt"><button class="btn btn-primary" data-act="move-pass-make">' + I("key") + "Make a move code</button></div>",
      foot: [{ label: "Close" }],
    });
    A.act["move-pass-make"] = function (el) {
      el.disabled = true;
      A.Sync.hubPost("/api/move/pass", { by: (M.me() || {}).name }).then(function (p) {
        var box = document.getElementById("pass-box");
        if (!box) return;
        box.innerHTML = '<div class="card card-pad"><dl class="kv">' + "<dt>School's code</dt>" + '<dd><code style="font-size:1.25em">' + esc(p.code || sid) + "</code></dd>" +
          '<dt>Move code</dt><dd><code style="font-size:1.6em;letter-spacing:.08em;user-select:all">' + esc(p.pass) + "</code></dd>" +
          "<dt>Lasts until</dt><dd>" + esc(A.fmtTime ? A.fmtTime(p.until) : new Date(p.until).toLocaleTimeString()) + " (30 minutes), once</dd></dl>" +
          '<p class="small muted mt-sm">' + "Making another code ends this one. Give it only to the person at the school's computer.</p>" +
          '<button class="btn btn-sm mt-sm" data-act="move-pass-make">' + I("refresh") + "Make a new code</button></div>";
      }, function (e) { el.disabled = false; UI.toast(e.message, "bad"); });
    };
  };
  function mountMove() {
    clearTimeout(moveTimer);
    var slot = document.getElementById("move-slot");
    if (!slot) return;
    A.Sync.hubPost("/api/move/status").then(function (s) {
      slot = document.getElementById("move-slot");
      if (!slot) return;
      if (s.state === "done" && s.to) return moved(s);
      slot.innerHTML = moveHtml(s);
      if (s.state === "running") moveTimer = setTimeout(mountMove, 1500);
    }, function (e) {
      // a hub with no move (a school's own server, an older hub): nothing to offer
      if (slot && !/replied 404|not allowed/i.test(e.message || "")) slot.innerHTML = '<p class="small muted">' + esc(e.message || "") + "</p>";
    });
  }
  /** The move is done: this device follows the school there now (the others do at their next sync). */
  function moved(s) {
    var m = A.Store.state.meta;
    if (s.hubComputer || /^relay:/.test(s.to || "")) return; // (onto the hub computer: the school keeps this address)
    A.Sync.follow({ moved: s.to, code: (m.multi && m.multi.sid) || s.code, name: A.Theme.get().name, eraseAt: s.eraseAt });
    UI.toast("Moved: " + ((s.counts || {}).records || 0) + " records, " + ((s.counts || {}).files || 0) + " files and " + ((s.counts || {}).devices || 0) + " devices are on the school's server now.");
    A.Sync.syncNow().catch(function () {}).then(function () { A.render(); });
  }
  A.act["move-open"] = function () {
    var name = A.Theme.get().name;
    UI.modal({
      title: "Move to the school's own server", size: "lg",
      body: '<p style="max-width:640px">Everything ' + esc(name) + ' has on School Assist\'s servers moves to a server in the school\'s own account: every record, every uploaded file, and every registered device.</p>' +
        '<ul class="small mt-sm" style="max-width:640px;padding-left:18px">' +
        "<li>Nobody joins again or signs in again: each device takes the school's new address by itself, with the key it has.</li>" +
        "<li>While the last changes copy (usually under a minute), changes wait on each device and go across by themselves. Nothing typed is lost.</li>" +
        "<li>School Assist keeps its copy for 7 days in case, then erases it. You can erase it sooner here.</li></ul>" +
        '<form data-submit="move-check" class="mt" style="max-width:560px">' +
        '<label class="field"><span>The school\'s server</span><input class="input" name="url" placeholder="https://your-school-assist.fly.dev" autocomplete="off" spellcheck="false" required></label>' +
        '<label class="field mt-sm"><span>Its link key</span><input class="input" name="key" type="password" autocomplete="off" spellcheck="false" required><span class="hint">Both were printed when the server was set up (scripts/online-hub.cjs). Keep the key with the backup key parts.</span></label>' +
        '<button class="btn mt" type="submit">' + I("search") + "Check the server</button></form>" +
        '<div id="move-plan" class="mt"></div>',
      foot: [{ label: "Close" }],
    });
  };
  var movePending = null;
  A.act["move-check"] = function (form) {
    var f = UI.formData(form), btn = form.querySelector("[type=submit]"), box = document.getElementById("move-plan");
    btn.disabled = true; btn.innerHTML = I("refresh") + "Checking…";
    A.Sync.hubPost("/api/move/check", { url: f.url, key: f.key }).then(function (p) {
      movePending = { url: f.url, key: f.key };
      btn.disabled = false; btn.innerHTML = I("search") + "Check again";
      box.innerHTML = '<div class="card card-pad"><dl class="kv"><dt>Server</dt><dd><code>' + esc(p.to) + "</code>" + (p.resume ? ' <span class="badge">Carrying on</span>' : ' <span class="badge good">Empty, ready</span>') + "</dd>" +
        "<dt>Records</dt><dd>" + p.records + "</dd><dt>Files</dt><dd>" + p.files + (p.sendFiles !== p.files ? " (" + p.sendFiles + " still to copy)" : "") + (p.files ? ", " + mb(p.bytes) + " to copy" : "") + "</dd>" +
        "<dt>Devices</dt><dd>" + p.devices + " registered (their keys go too)</dd>" + (p.room != null ? "<dt>Room there</dt><dd>" + mb(p.room) + " free</dd>" : "") + "</dl>" +
        (p.fits ? '<label class="check mt"><input type="checkbox" id="move-ok">I am moving ' + esc(p.school) + "'s records to <code>" + esc(p.to) + "</code></label>" +
          '<button class="btn btn-primary mt" data-act="move-go">' + I("upload") + "Move now</button>"
          : '<div class="callout warn mt">' + I("alert") + "<div>" + (p.tooBig.length ? p.tooBig.length + " file(s) are bigger than the school's server takes." : "The school's server hasn't room for the files. Make its disk bigger first (Golden Technologies can).") + "</div></div>") + "</div>";
    }, function (e) { btn.disabled = false; btn.innerHTML = I("search") + "Check the server"; box.innerHTML = '<div class="callout warn">' + I("alert") + "<div>" + esc(e.message) + "</div></div>"; });
  };
  A.act["move-go"] = function (el) {
    var ok = document.getElementById("move-ok");
    if (!ok || !ok.checked) return UI.toast("Tick the box first: it says where the records go.", "bad");
    if (!movePending) return;
    el.disabled = true;
    A.Sync.hubPost("/api/move/start", { url: movePending.url, key: movePending.key, confirm: true, by: (M.me() || {}).name }).then(function () {
      movePending = null;
      var back = el.closest(".modal-back");
      if (back) back.querySelector("[data-close]").click();
      mountMove();
    }, function (e) { el.disabled = false; UI.toast(e.message, "bad"); });
  };
  A.act["move-erase"] = function () {
    var m = A.Store.state.meta, mv = m.multi || {};
    UI.confirm("Erase School Assist's copy of the school's records now? The school's own server has everything; School Assist's copy can't be brought back after this.", { danger: true, ok: "Erase it" }).then(function (yes) {
      if (!yes || !mv.movedFrom) return;
      fetch(mv.movedFrom + "/api/move/erase", { method: "POST", headers: A.Sync.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ by: (M.me() || {}).name }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
          // erased (or already: its place answers only "moved" now)
          if (r.ok || r.status === 410) { mv.erased = true; A.Store.flush(); UI.toast("Erased. The school's records are only on its own server now."); A.render(); return; }
          UI.toast(j.error || "School Assist replied " + r.status + ".", "bad");
        }); }, function () { UI.toast("Can't reach School Assist just now. Try again.", "bad"); });
    });
  };
  /* Phones away from school (1.8, hub-relay.cjs): the school's records stay on its hub computer, and School Assist
     passes phones' requests to it. Only the hub computer itself turns it on or off. */
  function mountRelay(root) {
    var card = root.querySelector("#relay-card");
    if (!card) return;
    A.Sync.hubPost("/api/relay/status").then(function (s) { drawRelay(card, s); }, function () { card.hidden = true; }); // (an older hub: no card)
  }
  var relayTimer = null;
  function drawRelay(card, s) {
    clearTimeout(relayTimer);
    if (!card || !document.body.contains(card)) return;
    card.hidden = false;
    var head = function (badge) { return '<h3 class="row">' + I("phone") + "Phones away from school " + badge + "</h3>"; };
    if (s.bringing) {
      var b = s.bring || {};
      card.innerHTML = head('<span class="badge">' + I("refresh") + "Bringing the school here</span>") +
        '<p class="small mt-sm">' + esc(b.state === "failed" ? "It stopped: " + (b.error || "") + " Make a new move code on schoolassistapp.com and bring the school here again: it carries on where it stopped." : "Copying from schoolassistapp.com (" + (b.step || "starting") + ")…") + "</p>";
      if (b.state !== "failed") relayTimer = setTimeout(function () { A.Sync.hubPost("/api/relay/status").then(function (x) { drawRelay(card, x); }); }, 2000);
      return;
    }
    if (!s.on) {
      card.innerHTML = head('<span class="badge">Off</span>') +
        '<p class="muted small mt-sm" style="max-width:680px">' + "Devices reach the school's records on the school Wi-Fi only. Turned on, phones and laptops reach them from anywhere through School Assist (schoolassistapp.com): it passes each request to this computer and keeps none of the school's records. Keep this computer on and online during the school day.</p>" +
        (s.canChange ? '<button class="btn btn-primary mt" data-act="relay-on">' + I("globe") + "Turn on</button>" : '<p class="small muted mt">Turn it on on the hub computer itself.</p>');
      return;
    }
    var kept = s.eraseAt && s.eraseAt > A.now() && !(s.bring && s.bring.erased) ? s.eraseAt : 0;
    card.innerHTML = head(s.connected ? '<span class="badge good">' + I("check") + "On</span>" : '<span class="badge warn">' + I("alert") + "Not connected</span>") +
      '<dl class="kv mt"><dt>Phones join at</dt><dd><code style="user-select:all">' + esc(s.join) + "</code></dd>" +
      "<dt>Requests passed on</dt><dd>" + (s.served || 0) + " since School Assist started on this computer</dd>" +
      (s.lastError && !s.connected ? '<dt>Problem</dt><dd class="small">' + esc(s.lastError) + "</dd>" : "") + "</dl>" +
      '<p class="small muted mt-sm" style="max-width:680px">' + "School Assist passes each request to this computer and keeps none of the school's records. While this computer is off, devices keep their work and send it when it is back. Share the link or QR code from Settings → Devices.</p>" +
      (kept ? '<p class="small mt-sm" style="max-width:680px">The school moved here from schoolassistapp.com. In case anything went wrong, School Assist keeps its old copy until <b>' + esc(A.fmtDate(kept)) + "</b>, then erases it by itself.</p>" +
        (s.canChange ? '<button class="btn btn-sm btn-danger mt-sm" data-act="relay-erase">' + I("trash") + "Erase School Assist's copy now</button>" : "") : "") +
      (s.canChange ? '<div class="row wrap mt"><button class="btn btn-ghost" data-act="relay-off">' + I("x") + "Turn off</button></div>" : "");
    if (!s.connected) relayTimer = setTimeout(function () { A.Sync.hubPost("/api/relay/status").then(function (x) { drawRelay(card, x); }); }, 5000);
  }
  A.act["relay-on"] = function (el) {
    el.disabled = true; el.innerHTML = I("refresh") + "Turning on…";
    A.Sync.hubPost("/api/relay/on").then(function (s) { UI.toast("On: phones join at " + s.join); drawRelay(document.getElementById("relay-card"), s); },
      function (e) { el.disabled = false; el.innerHTML = I("globe") + "Turn on"; UI.toast(e.message, "bad"); });
  };
  A.act["relay-off"] = function () {
    UI.confirm("Turn off phones away from school? Devices then reach the school's records on the school Wi-Fi only, and the school's link stops working away from school.", { danger: true, ok: "Turn off" }).then(function (ok) {
      if (!ok) return;
      A.Sync.hubPost("/api/relay/off").then(function (s) { UI.toast("Turned off"); drawRelay(document.getElementById("relay-card"), s); }, function (e) { UI.toast(e.message, "bad"); });
    });
  };
  A.act["relay-erase"] = function () {
    UI.confirm("Erase School Assist's old copy of the school's records now? This computer has everything; the old copy can't be brought back after this.", { danger: true, ok: "Erase it" }).then(function (ok) {
      if (!ok) return;
      A.Sync.hubPost("/api/relay/erase").then(function (s) { UI.toast("Erased. The school's records are only on this computer now."); drawRelay(document.getElementById("relay-card"), s); }, function (e) { UI.toast(e.message, "bad"); });
    });
  };

  /* The school's online copy (1.7, hub-link.cjs): the hub computer keeps an online hub in the school's own account up
     to date, and takes its changes back, so phones reach the school's data from anywhere. Without one, the hub
     computer is the school's only copy, as before. Only the hub computer itself connects or disconnects it. */
  function mountLink(root) {
    var card = root.querySelector("#link-card");
    if (!card) return;
    A.Sync.hubPost("/api/link/status").then(function (s) { drawLink(card, s); }, function (e) {
      var old = /not allowed|replied 40[45]/i.test(e.message || "");
      card.innerHTML = '<h3 class="row">' + I("globe") + "Online copy</h3><p class=\"small muted mt-sm\">" +
        esc(old ? "The school hub is older than School Assist 1.7. Update it to keep an online copy." : e.message || "The school hub is out of reach.") + "</p>";
    });
  }
  function drawLink(card, s) {
    if (!card) return;
    var head = function (badge) { return '<h3 class="row">' + I("globe") + "Online copy " + badge + "</h3>"; };
    if (s.role === "online") {
      card.innerHTML = head('<span class="badge brand">This is the online hub</span>') +
        '<p class="muted small mt-sm" style="max-width:680px">Phones and laptops reach the school\'s records here from anywhere. The school\'s hub computer keeps it up to date and takes its changes back.</p>' +
        '<dl class="kv mt"><dt>Hub computer</dt><dd>' + (s.seenAt ? "copied " + A.relTime(s.seenAt) + (s.from ? " (" + esc(s.from) + ")" : "")
          : s.ready ? '<span class="muted">None connected yet</span>' : '<span class="muted">None can connect: this hub has no link key</span>') + "</dd></dl>";
      return;
    }
    if (!s.linked) {
      card.innerHTML = head('<span class="badge">Off</span>') +
        '<p class="muted small mt-sm" style="max-width:680px">The school\'s records are on the hub computer only, so devices reach them on the school Wi-Fi. With an online hub in the school\'s own account, this hub copies every change to it and back, and phones work from anywhere.</p>' +
        '<p class="small mt-sm" style="max-width:680px">No online hub yet? Golden Technologies sets one up with the school\'s IT person, in an account in the school\'s name. The school pays the host directly, and Golden Technologies gets no login to it.</p>' +
        (s.canConnect ? '<form data-submit="link-connect" class="mt" style="max-width:560px">' +
          '<label class="field"><span>Online hub address</span><input class="input" name="url" placeholder="https://your-school.fly.dev" autocomplete="off" spellcheck="false" required></label>' +
          '<label class="field mt-sm"><span>Link key</span><input class="input" name="key" type="password" autocomplete="off" spellcheck="false" required><span class="hint">Given when the online hub was set up. Keep it with the backup key parts.</span></label>' +
          '<button class="btn btn-primary mt" type="submit">' + I("link") + "Connect</button></form>"
          : '<p class="small muted mt">Connect it on the hub computer itself.</p>');
      return;
    }
    var files = s.files || {}, waiting = files.waiting || 0, kept = files.kept || 0;
    card.innerHTML = head(s.lastError ? '<span class="badge warn">' + I("alert") + "Not copying</span>" : '<span class="badge good">' + I("check") + "Connected</span>") +
      '<dl class="kv mt"><dt>Online hub</dt><dd><code>' + esc(s.url) + "</code></dd>" +
      "<dt>Last copied</dt><dd>" + (s.lastAt ? A.relTime(s.lastAt) : "not yet") + "</dd>" +
      "<dt>Changes</dt><dd>" + s.sent + " sent, " + s.received + " received</dd>" +
      (waiting ? "<dt>Files</dt><dd>" + waiting + " still to copy</dd>" : "") +
      (kept ? "<dt>Here only</dt><dd>" + kept + " file" + (kept === 1 ? "" : "s") + " too big for the online hub</dd>" : "") +
      (s.lastError ? '<dt>Problem</dt><dd class="small">' + esc(s.lastError) + "</dd>" : "") + "</dl>" +
      '<p class="small mt" style="max-width:680px">Away from school, phones and laptops open <b>' + esc(s.url) + "</b> and join with a staff code, or ask an admin to let them in under Settings → Devices (here too).</p>" +
      '<div class="row wrap mt"><button class="btn btn-primary" data-act="link-now">' + I("refresh") + "Copy now</button>" +
      (s.canConnect ? '<button class="btn btn-ghost" data-act="link-off">' + I("x") + "Disconnect</button>" : "") + "</div>";
  }
  A.act["link-connect"] = function (form) {
    var f = UI.formData(form), btn = form.querySelector("[type=submit]");
    btn.disabled = true; btn.innerHTML = I("refresh") + "Connecting… the first copy can take a minute";
    A.Sync.hubPost("/api/link/connect", { url: f.url, key: f.key }).then(function (s) {
      UI.toast(s.lastError ? "Connected, but the first copy had a problem: " + s.lastError : "Connected. The online hub has the school's records.", s.lastError ? "bad" : undefined);
      drawLink(document.getElementById("link-card"), s);
    }, function (e) { UI.toast(e.message, "bad"); btn.disabled = false; btn.innerHTML = I("link") + "Connect"; });
  };
  A.act["link-now"] = function (el) {
    el.disabled = true; el.innerHTML = I("refresh") + "Copying…";
    A.Sync.hubPost("/api/link/now").then(function (s) {
      UI.toast(s.lastError ? "Not copied: " + s.lastError : "Copied", s.lastError ? "bad" : undefined);
      drawLink(document.getElementById("link-card"), s);
    }, function (e) { UI.toast(e.message, "bad"); el.disabled = false; el.innerHTML = I("refresh") + "Copy now"; });
  };
  A.act["link-off"] = function () {
    UI.confirm("Disconnect the online hub? This computer stops copying to it. The online hub keeps its copy as it is now, so phones away from school stop seeing new changes.", { danger: true, ok: "Disconnect" }).then(function (ok) {
      if (!ok) return;
      A.Sync.hubPost("/api/link/disconnect").then(function (s) { UI.toast("Disconnected"); drawLink(document.getElementById("link-card"), s); }, function (e) { UI.toast(e.message, "bad"); });
    });
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
        '<p class="muted small mt-sm" style="max-width:680px">Only on the one computer that stays at school.</p>' +
        (h.running ? '<div class="label mt">Addresses for other devices</div>' + h.urls.slice(1).map(function (u) { return '<code class="pw-mask" style="display:inline-block;margin:0 8px 6px 0;font-size:14px">' + esc(u) + "</code>"; }).join("") +
          (h.urls.length < 2 ? '<p class="small">This computer is not on a network yet. Connect it to the school Wi-Fi.</p>' : '<p class="tiny muted">Other devices use this address.</p>') : "") +
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
      '<ul class="small mt-sm" style="padding-left:18px;line-height:1.8"><li>Saved on this device first; sent when online.</li>' +
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
    var users = S().filter("users", function (u) { return u.role === role && (!find || (u.name + " " + (u.studentNo || "") + " " + (u.staffNo || "")).toLowerCase().indexOf(find) >= 0); })
      .sort(function (a, b) { return role === "student" ? M.levelIndex(a.level) - M.levelIndex(b.level) || M.streamIndex(a.stream) - M.streamIndex(b.stream) || a.name.localeCompare(b.name) : A.rank(a.title) - A.rank(b.title) || a.name.localeCompare(b.name); }); // staff in the school's hierarchy
    var html = '<div class="row spread wrap mb">' + (A.edition === "teacher" ? '<p class="muted small" style="max-width:520px">The teachers who sign in on this device or the school hub. Pupils are added in <a href="#/t/pupils">My class</a>.</p><div class="hidden">' : '<div class="pill-tabs" style="margin:0">') + '<button class="' + (role === "student" ? "on" : "") + '" data-act="goto" data-href="#/t/settings?s=people&r=student">Students</button><button class="' + (role === "teacher" ? "on" : "") + '" data-act="goto" data-href="#/t/settings?s=people&r=teacher">Teachers</button></div>' +
      '<form data-submit="people-search" class="row"><input class="input sm" name="q" value="' + esc(q.q || "") + '" placeholder="Search name or ID" style="width:220px" aria-label="Search people"><button class="btn btn-sm" type="submit">' + I("search") + "</button></form>" +
      (A.Cloud ? (role === "student" ? '<button class="btn btn-primary" data-act="cloud-add-student">' + I("plus") + "Add student</button>" : '<button class="btn btn-primary" data-act="teacher-add">' + I("plus") + "Add teacher</button>") :
        '<button class="btn btn-primary" data-act="person-edit" data-role="' + role + '">' + I("plus") + "Add " + role + "</button>") + "</div>";
    if (!A.Cloud && A.School && role === "student") html += A.School.peopleHtml(me);
    if (A.Cloud) {
      html += A.pwRequestsHtml ? A.pwRequestsHtml(me) : "";
      users.sort(function (a, b) { return (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1); });
      if (role === "student") html += '<div class="callout mb">' + I("users") + '<div class="small"><b>Approve</b> new students here; their subjects in <a href="#/t/requests">Subject requests</a>. Forgotten password: <b>Edit</b>.</div></div>';
      else html += '<div class="callout mb">' + I("school") + '<div class="small">Teachers sign in with their email address. They see only the subjects they teach, and approve the students who ask to take them. Subjects without a teacher are yours.</div></div>';
    }
    if (role === "teacher" && A.staffAdminHtml) {
      html += A.staffAdminHtml(me);
      users = users.filter(function (u) { return u.status !== "pending"; });
    }
    if (A.Cloud) {
      // (handled above)
    } else if (role === "student") {
      html += '<div class="callout mb">' + I("key") + '<div class="small">Lost or stolen device: reset the password here, then sign the device out under <b>Devices</b>.</div></div>';
    }
    html += '<div class="card table-wrap"><table class="table"><thead><tr><th>Name</th>' + (role === "student" ? "<th>Student ID</th><th>Class</th><th>" + (A.Cloud ? "Status" : "Password") + "</th><th>Devices</th>" : (A.Cloud ? "" : "<th>Staff no.</th>") + "<th>Subjects</th><th>" + (A.Cloud ? "Sign-in" : "PIN") + "</th><th>Devices</th>") + "<th>Subject classes</th><th></th></tr></thead><tbody>" +
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
          pw = M.hasPassword(u.id) ? '<span class="badge good" data-tip="Kept scrambled: nobody can read it. Edit gives a new one.">' + I("check") + "Set</span>"
            : '<span class="badge warn" data-tip="The student sets a password the first time they sign in">Not set yet</span>';
        }
        return '<tr><td><div class="row">' + A.avatar(u, "sm") + "<b>" + esc(u.name) + "</b>" + (u.isAdmin ? ' <span class="badge accent">Admin</span>' : "") + (u.example ? ' <span class="badge brand">Example</span>' : "") + "</div></td>" +
          (role === "student" ? '<td class="small"><code>' + esc(u.studentNo || "") + '</code></td><td class="small">' + esc(M.studentHome(u)) + "</td><td>" + pw + "</td>" : (A.Cloud ? "" : '<td class="small"><code>' + esc(u.staffNo || "") + "</code></td>") + '<td class="small">' + esc(A.Cloud && !u.isAdmin ? cls.map(function (c) { return c.subject; }).join(", ") || "No subjects yet" : u.subjects || "") + "</td><td>" + (A.Cloud ? '<span class="small muted">Email and password</span>' : M.hasPassword(u.id) ? '<span class="badge good">' + I("check") + "PIN set</span>" : '<span class="badge warn">No PIN</span>') + "</td>") +
          "<td>" + devCell + '</td><td class="small muted">' + esc(subjectsOf(u, role, cls).join(", ")) + '</td><td class="num">' +
          (A.Cloud && role === "teacher" && !u.isAdmin
            ? '<div class="row" style="justify-content:flex-end;gap:6px"><button class="btn btn-sm" data-act="teacher-subjects" data-id="' + u.id + '">' + I("layers") + 'Subjects</button><button class="btn btn-sm btn-ghost" data-act="teacher-reset" data-id="' + u.id + '">' + I("key") + 'New password</button><button class="btn btn-sm btn-ghost" data-act="teacher-remove" data-id="' + u.id + '" aria-label="Remove ' + esc(u.name) + '">' + I("trash") + "</button></div>"
            : '<button class="btn btn-sm" data-act="person-edit" data-id="' + u.id + '">' + I("edit") + "Edit</button>") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    if (!users.length) html += '<div class="card mt">' + UI.empty("users", "Nobody matches") + "</div>";
    // staff from before 1.3.3 get their number (KHS-TC1, KHS-AD1) the first time an admin opens this list
    return role === "teacher" ? { html: html, mount: function () {
      if (A.mountStaffCodes) A.mountStaffCodes();
      if (me.isAdmin && !A.Cloud) M.numberStaff().then(function (n) { if (n && /s=people/.test(location.hash)) A.render(); });
    } } : html;
  };
  // a teacher's subjects: the ones they teach (School Assist Teacher's pages: user.areas) and their subject classes'
  function subjectsOf(u, role, cls) {
    var out = role !== "student" && A.Primary ? (u.areas || []).slice() : [];
    cls.forEach(function (c) { if (c.subject && out.indexOf(c.subject) < 0) out.push(c.subject); });
    return out;
  }
  A.act["people-search"] = function (form) { location.hash = "#/t/settings?s=people&r=" + (/r=teacher/.test(location.hash) ? "teacher" : "student") + "&q=" + encodeURIComponent(form.q.value.trim()); };
  A.act["reveal-pw"] = function (el) {
    var code = el.parentNode.querySelector(".pw-mask"), shown = code.textContent.indexOf("•") < 0;
    code.textContent = shown ? "••••••••" : code.getAttribute("data-pw");
    el.innerHTML = I(shown ? "eye" : "eyeOff");
  };
  A.act["person-edit"] = function (el) {
    var st = M.structure();
    var u = S().get("users", el.getAttribute("data-id")) || { role: el.getAttribute("data-role"), name: "", level: st.levels[0], stream: st.streams[0] };
    var isNew = !u.id, me = M.me(), cr = u.id && M.credential(u.id);
    UI.modal({
      title: isNew ? "Add " + u.role : "Edit " + u.name,
      onMount: function (el) {
        // a new student's suggested ID follows the form chosen
        var f = el.querySelector("#person-form");
        if (isNew && f && f.studentNo && f.level) f.level.addEventListener("change", function () { f.studentNo.placeholder = M.nextNumber(M.studentPrefix(f.level.value), "studentNo", 3); });
      },
      // staff: gender and last name ("Mrs Moyo", js/staff.js); students: their full name
      body: '<form id="person-form" class="form-grid">' + (u.role === "student" ? '<label class="field full"><span>Full name</span><input class="input" name="name" value="' + esc(u.name) + '"></label>' : M.nameFields(M.nameGuess(u))) +
        (u.role === "student"
          ? '<label class="field"><span>Student ID</span><input class="input" name="studentNo" value="' + esc(u.studentNo || "") + '"' + (isNew ? ' placeholder="' + esc(M.nextNumber(M.studentPrefix(u.level), "studentNo", 3)) + '"' : "") + ">" +
              (isNew ? '<span class="hint">Leave it empty for the next number in the form.</span>' : "") + "</label>" +
            '<label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option" + (l === u.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
            '<label class="field"><span>Class</span><select class="select" name="stream">' + st.streams.map(function (x) { return "<option" + (x === u.stream ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></label>" +
            (A.Cloud ? '<div class="field full"><span class="label">Password</span><div class="row wrap"><button type="button" class="btn btn-sm" data-act="cloud-reset" data-id="' + u.id + '">' + I("refresh") + 'Give a new password</button></div><span class="hint">You get a new password to pass on. Their old one stops working.</span></div>'
              : isNew ? '<p class="field small muted">The student creates a password the first time they sign in.</p>'
              : '<div class="field full"><span class="label">Password</span><div class="row wrap">' + (M.hasPassword(u.id) ? '<span class="badge good">' + I("check") + "Set</span>" : '<span class="badge warn">Not set yet</span>') +
                '<button type="button" class="btn btn-sm" data-act="give-pw" data-id="' + u.id + '">' + I("key") + 'Give a new password</button><button type="button" class="btn btn-sm btn-ghost" data-act="reset-pw" data-id="' + u.id + '">' + I("refresh") + 'Let them choose one</button></div><span class="hint">Passwords are kept scrambled, so nobody can read them.</span></div>')
          : (u.staffNo ? '<div class="field"><span class="label">Staff number</span><code style="font-size:16px">' + esc(u.staffNo) + "</code></div>" : "") +
            // School Assist Teacher: the subjects they teach (they record those end-of-term marks); otherwise a short text
            (A.Primary ? A.Primary.areaChecks(u.areas) + A.Primary.classChecks(u.classIds) : '<label class="field"><span>Subjects</span><input class="input" name="subjects" value="' + esc(u.subjects || "") + '"></label>') +
            '<label class="field"><span>Role</span>' + UI.selectOther("title", A.ROLES, u.title || (isNew ? "Teacher" : ""), "Role") + "</label>" +
            // PINs are kept scrambled: a new one can be set, the old one can't be read
            (A.Cloud ? "" : A.staffPassword() ? '<label class="field"><span>' + (isNew ? "Sign-in password" : "New password") + '</span><div class="pw-wrap"><input class="input" type="password" name="pin" autocomplete="new-password" value=""' + (isNew ? ' placeholder="8 or more characters, letters and a number"' : ' placeholder="Empty: keep the password"') + '><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="pw-toggle" aria-label="Show password">' + I("eye") + "</button></div></label>" : '<label class="field"><span>' + (isNew ? "Sign-in PIN (4 digits)" : "New PIN") + '</span><div class="pw-wrap"><input class="input" type="password" name="pin" inputmode="numeric" maxlength="4" autocomplete="off" value=""' + (isNew ? "" : ' placeholder="Empty: keep the PIN"') + '><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="pw-toggle" aria-label="Show PIN">' + I("eye") + "</button></div></label>") +
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
          var f = UI.formData(m.querySelector("#person-form")), n = u.role === "student" ? null : M.nameRead(m.querySelector("#person-form"));
          if (n && n.error) { UI.toast(n.error, "bad"); return false; }
          if (!n && !f.name.trim()) { UI.toast("Enter a name", "bad"); return false; }
          var rec = Object.assign({}, u, n ? M.nameRec(n, u.id) : { name: f.name.trim() });
          var pin = u.role === "student" || A.Cloud ? "" : String(f.pin || "").trim();
          delete rec.pin; // PINs from before 1.6 lived on the user
          var save = function (msg) {
            S().put("users", rec); if (pin) M.setPin(rec.id, pin, me.id);
            if (rec.role === "student" && A.Primary && A.Primary.withStudents) A.Primary.followClass(rec); // into the class of their form and stream
            UI.toast(msg || "Saved"); A.render();
          };
          if (u.role === "student") {
            var typed = f.studentNo.trim();
            if (!typed && !isNew) { UI.toast("Enter the student ID", "bad"); return false; }
            var clash = typed && M.studentById(typed);
            if (clash && clash.id !== u.id) { UI.toast("That student ID belongs to " + clash.name, "bad"); return false; }
            rec.level = f.level; rec.stream = f.stream;
            // empty for a new student: the next number in their form (KHS-FM1-004), from the school hub
            if (!typed) return M.claimStudentNo(f.level).then(function (no) { rec.studentNo = no; save(rec.name + "'s student ID is " + no); });
            rec.studentNo = typed;
          } else {
            var full = isNew && A.Licence && A.Licence.teacherLimit && A.Licence.teacherLimit();
            if (full) { UI.toast(full, "bad"); return false; }
            if (!A.Cloud && (isNew || pin) && A.staffPassword()) { var bad = A.staffPasswordProblem(pin); if (bad) { UI.toast(bad, "bad"); return false; } rec.pw = true; }
            else if (!A.Cloud && (isNew || pin) && !/^\d{4}$/.test(pin)) { UI.toast(isNew ? "Give them a 4-digit PIN" : "The new PIN must be 4 digits", "bad"); return false; }
            if (A.Primary) {
              rec.areas = A.Primary.areasPicked(m.querySelector("#person-form")); rec.subjects = rec.areas.join(", "); rec.areasAsked = null;
              if (m.querySelector("#person-form [data-cls]")) rec.classIds = A.Primary.classesPicked(m.querySelector("#person-form"));
              rec.classIdsAsked = null;
            } else rec.subjects = f.subjects;
            rec.title = f.title; rec.isAdmin = !!f.isAdmin; if (u.id === me.id) rec.isAdmin = true;
            if (isNew && !A.Cloud) return M.claimStaffNo(rec.isAdmin).then(function (no) { rec.staffNo = no; save(rec.name + "'s staff number is " + no); });
          }
          save();
        },
      }]),
    });
  };
  /** A new password for a student, shown once to pass on (it can't be looked up later). */
  A.act["give-pw"] = function (el) {
    var u = M.user(el.getAttribute("data-id"));
    UI.confirm("Give " + u.name + " a new password? Their old one stops working.", { ok: "New password" }).then(function (ok) {
      if (!ok) return;
      var pw = A.newPassword();
      M.setPassword(u.id, pw, M.me().id);
      document.querySelectorAll(".modal-back").forEach(function (x) { x.remove(); });
      UI.modal({ title: "New password for " + u.name,
        body: "<p>Give " + esc(A.firstName(u.name)) + ' these details now: the password is kept scrambled, so it can\'t be shown again.</p><dl class="kv mt"><dt>Student ID</dt><dd><b>' + esc(u.studentNo || "") + '</b></dd><dt>Password</dt><dd><code style="font-size:18px">' + esc(pw) + "</code></dd></dl>",
        foot: [{ label: "Done", cls: "btn-primary" }] });
      A.render();
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
      body: list.length ? deviceRow(list) : UI.empty("laptop", "No devices yet", "Devices appear here after the first sign-in."),
    });
  };
  var deviceRow = function (list) { return list.map(deviceRow1).join(""); };
  function deviceRow1(d) {
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
    var all = S().all("devices").sort(function (a, b) { return (b.lastSeenAt || 0) - (a.lastSeenAt || 0); });
    var signedIn = all.filter(function (d) { return d.signedIn; });
    var phones = signedIn.filter(function (d) { return d.type === "Phone"; });
    var owners = {};
    phones.forEach(function (d) { owners[d.userId] = 1; });
    var html = '<div class="grid g-4">' + UI.stat("laptop", signedIn.length, "Devices signed in") + UI.stat("phone", phones.length, "Phones", true, Object.keys(owners).length + " people use a phone") +
      UI.stat("tablet", signedIn.filter(function (d) { return d.type === "Tablet"; }).length, "Tablets") + UI.stat("users", Object.keys(signedIn.reduce(function (m, d) { m[d.userId] = 1; return m; }, {})).length, "Accounts in use") + "</div>" +
      // each kind of device a group of its own, its list shown when tapped
      devGroup("in", "laptop", "Signed in", signedIn) + devGroup("phones", "phone", "Phones", phones) +
      (A.edition === "teacher" ? "" : devGroup("students", "users", "Students' devices", all.filter(function (d) { return d.role === "student"; }))) +
      devGroup("out", "logout", "Signed out", all.filter(function (d) { return !d.signedIn; })) +
      '<p class="tiny muted mt">A device is recorded each time someone signs in. The network address shows once the device has synced with the school server. Rows marked "sample" are demo data.</p>';
    var hub = A.Sync && A.Sync.hubMode();
    if (hub) html = '<div class="card card-pad mb" id="hub-devices">' + hubDevicesHead() + '<p class="small mt">' + I("refresh") + " Asking the school hub…</p></div>" + html;
    html = (inviteCard() || '<div id="invite-slot"></div>') + html; // the app for every school: the invite first
    return { html: html, mount: function () { mountInvite(); if (hub) mountHubDevices(); } };
  };
  /* A group of devices, folded: its name and how many, the list when tapped (open ones stay open on a redraw). */
  var openGroups = {};
  function devGroup(key, icon, title, list, rows) {
    return '<details class="card dev-group mt" data-group="' + key + '"' + (openGroups[key] ? " open" : "") + '><summary><span class="row grow" style="gap:10px">' + I(icon) + "<b>" + esc(title) + '</b></span><span class="badge">' + list.length + '</span><span class="dev-chev">' + I("down") + "</span></summary>" +
      '<div class="dev-list">' + (list.length ? (rows || deviceRow)(list) : '<p class="small muted card-pad">None</p>') + "</div></details>";
  }
  document.addEventListener("toggle", function (e) { var g = e.target && e.target.getAttribute && e.target.getAttribute("data-group"); if (g) openGroups[g] = e.target.open; }, true);
  /* The app for every school (1.7): the school's join link and QR code, for teachers and students to open or scan. */
  function inviteLink() {
    var m = A.Store.state.meta, base = A.SchoolId && A.SchoolId.hubBase ? A.SchoolId.hubBase() : "";
    if (A.multiHost && base) return location.origin + "/join/" + base.slice(3);
    if (A.multiHost && m.multi && m.multi.sid) return location.origin + "/join/" + m.multi.sid; // a school on its own server
    return m.joinLink || ""; // another address of a school on School Assist (its hub says the link: /api/ping)
  }
  function inviteCard() {
    var link = inviteLink(), me = M.me();
    if (!link || !me || !me.isAdmin) return "";
    var codes = S().get("settings", "staffcodes"), code = link.split("/join/")[1];
    return '<div class="card card-pad mb" id="invite-card"><h3 class="row">' + I("link") + " Invite teachers and students</h3>" +
      '<p class="muted small mt-sm" style="max-width:680px">They open this link, or scan the code with their phone\'s camera, and join ' + esc(A.Theme.get().name) + ". Teachers let their device in with the staff code" + (codes ? " <code>" + esc(codes.teacher) + "</code>" : "") + "; other devices wait for an admin to let them in, on this page.</p>" +
      '<div class="row wrap top mt" style="gap:20px"><div class="invite-qr" id="invite-qr"></div><div class="grow"><div class="label">Link</div><code class="pw-mask" style="display:inline-block;font-size:14px;word-break:break-all">' + esc(link) + "</code>" +
      '<div class="row wrap mt-sm"><button class="btn" data-act="invite-copy">' + I("copy") + 'Copy the link</button><button class="btn" data-act="invite-print">' + I("download") + "Print it</button></div>" +
      '<p class="tiny muted mt-sm">Or type the school\'s code on the first page of School Assist: <b>' + esc(code) + "</b></p></div></div></div>";
  }
  var qrLoading = null;
  /** A QR code of `text` as SVG (vendor/qrcode, loaded the first time). */
  function qrSvg(text) {
    qrLoading = qrLoading || (window.qrcode ? Promise.resolve() : new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = "vendor/qrcode/qrcode.js"; sc.onload = ok;
      sc.onerror = function () { qrLoading = null; no(new Error("The QR code couldn't be made")); };
      document.head.appendChild(sc);
    }));
    return qrLoading.then(function () { var q = window.qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: "QR code: " + text }); });
  }
  function mountInvite() {
    // not known yet on this address: ask the school's hub for its join link, then show the invite
    if (!inviteLink() && M.me() && M.me().isAdmin && A.Sync && A.Sync.hubMode()) {
      fetch(A.Sync.config().url + "/api/ping").then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.join || !/^https:\/\//.test(j.join)) return;
        A.Store.state.meta.joinLink = j.join; A.Store.flush();
        var slot = document.getElementById("invite-slot");
        if (slot) { slot.outerHTML = inviteCard(); mountInvite(); }
      }).catch(function () { /* the hub is away for now */ });
      return;
    }
    var box = document.getElementById("invite-qr"), link = inviteLink();
    if (box && link) qrSvg(link).then(function (svg) { box.innerHTML = svg; }, function () { box.textContent = ""; });
  }
  A.act["invite-copy"] = function () {
    var link = inviteLink();
    var done = function () { UI.toast("Link copied: send it on WhatsApp or by SMS"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { UI.toast(link); }); else UI.toast(link);
  };
  A.act["invite-print"] = function () {
    var link = inviteLink(), b = A.Theme.get(), codes = S().get("settings", "staffcodes");
    qrSvg(link).then(function (svg) {
      UI.printSheet({ title: "Join " + b.name, pageWidth: 794, css: "@page{size:A4;margin:16mm}#print-root .inv{width:178mm;margin:0 auto;text-align:center;font-family:'Segoe UI',Arial,sans-serif;color:#111}#print-root .inv .logo{width:28mm;height:28mm;margin:0 auto}#print-root .inv .logo img,#print-root .inv .logo svg{width:100%;height:100%;object-fit:contain}#print-root .inv h1{font-size:22pt;margin:6mm 0 2mm}#print-root .inv .qr{width:110mm;height:110mm;margin:8mm auto}#print-root .inv .qr svg{width:100%;height:100%}#print-root .inv p{font-size:13pt;margin:2mm 0}#print-root .inv code{font-size:14pt}",
        html: '<section class="inv">' + A.Theme.logoHTML() + "<h1>" + esc(b.name) + "</h1><p>Scan with your phone's camera to open School Assist</p><div class=\"qr\">" + svg + "</div><p>or open <code>" + esc(link) + "</code></p>" +
          (codes ? "<p>Teachers: let your device in with the staff code <b>" + esc(codes.teacher) + "</b></p>" : "") + "</section>" });
    }, function (e) { UI.toast(e.message, "bad"); });
  };
  /* The hub's own list (1.6): only a registered device reaches the school's data. */
  function hubDevicesHead() {
    return "<h3>Registered with the school hub</h3>" +
      '<p class="muted small mt-sm">Only devices on this list can reach the school\'s data. A device joins with the school file, a staff code, or a code shown on its screen that an admin lets in here. The computer that runs the hub is always allowed.</p>';
  }
  var devTimer = null, devShown = "";
  function mountHubDevices() {
    clearTimeout(devTimer);
    Promise.all([A.Sync.hubPost("/api/joins"), A.Sync.hubPost("/api/devices")]).then(function (r) {
      var box = document.getElementById("hub-devices");
      if (!box) return;
      // while the page is open the list keeps itself up to date: a device that asks to join shows within 10 seconds
      devTimer = setTimeout(function () { if (document.getElementById("hub-devices")) mountHubDevices(); }, 10000);
      var joins = r[0].joins || [], devs = (r[1].devices || []).sort(function (a, b) { return (b.seenAt || 0) - (a.seenAt || 0); });
      A.joinsWaiting = joins.length;
      var now = JSON.stringify([joins, devs]);
      if (now === devShown && box.querySelector(".label")) return; // nothing new: the buttons stay put under a finger
      devShown = now;
      var thisId = A.Devices ? A.Devices.id() : null;
      box.innerHTML = hubDevicesHead() +
        '<div class="label mt">Waiting to join</div>' + (joins.length ? joins.map(function (j) {
          return '<div class="list-row"><div class="grow"><div class="title"><span class="join-code sm">' + esc(j.code) + "</span> " + esc(j.label || "A device") + (j.online ? ' <span class="badge">' + I("globe") + "Online hub</span>" : "") + "</div>" +
            '<div class="tiny muted">Asked ' + A.relTime(j.at) + (j.ip ? " · " + esc(j.ip) : "") + " · check the code matches the one on its screen</div></div>" +
            // side by side, together, on a phone too
            '<div class="row join-btns"><button class="btn btn-sm btn-primary" data-act="hub-join" data-code="' + esc(j.code) + '" data-ok="1">' + I("check") + "Let it in</button>" +
            '<button class="btn btn-sm" data-act="hub-join" data-code="' + esc(j.code) + '">' + I("x") + "Decline</button></div></div>";
        }).join("") : '<p class="small muted">No devices waiting.</p>') +
        devGroup("registered", "shield", "Devices", devs, function (list) { return list.map(function (d) {
          var who = (d.users || []).map(function (id) { var u = M.user(id); return u ? u.name : null; }).filter(Boolean);
          return '<div class="list-row"><div class="grow"><div class="title">' + esc(d.label || d.deviceId) + (d.deviceId === thisId ? ' <span class="badge brand">This device</span>' : "") + "</div>" +
            '<div class="tiny muted">Joined ' + A.relTime(d.at) + " (" + esc(d.how || "") + ") · last seen " + A.relTime(d.seenAt) + (d.ip ? " · " + esc(d.ip) : "") + "</div>" +
            (who.length ? '<div class="tiny">' + esc(who.slice(0, 6).join(", ")) + (who.length > 6 ? " and " + (who.length - 6) + " more" : "") + "</div>" : "") + "</div>" +
            (d.deviceId === thisId ? "" : '<button class="btn btn-sm btn-danger" data-act="hub-remove" data-id="' + esc(d.deviceId) + '" data-label="' + esc(d.label || "this device") + '">' + I("trash") + "Remove</button>") + "</div>";
        }).join(""); });
    }, function (e) {
      var box = document.getElementById("hub-devices");
      if (box) box.innerHTML = hubDevicesHead() + '<div class="callout warn mt">' + I("wifiOff") + "<div>" + esc(e.message || String(e)) + "</div></div>";
    });
  }
  /* An admin with School Assist open hears when a device asks to join (a pop-up once per code, and the count on
     Settings): so devices can be let in from the admin's phone. Every 20 seconds, on a school hub, while open in front. */
  var seenJoins = {};
  A.joinsWaiting = 0;
  function watchJoins() {
    var me = M.me();
    if (me && me.isAdmin && A.Sync && A.Sync.hubMode() && A.Sync.joinState().key && !document.hidden && navigator.onLine) {
      A.Sync.hubPost("/api/joins").then(function (r) {
        var joins = r.joins || [];
        A.joinsWaiting = joins.length;
        joins.forEach(function (j) {
          if (seenJoins[j.code]) return;
          seenJoins[j.code] = 1;
          if (A.Alerts && !document.getElementById("hub-devices")) A.Alerts.popup({ id: "join_" + j.code, kind: "join", title: "A device wants to join: " + j.code,
            body: (j.label || "A device") + ". Check the code on its screen, then let it in under Settings → Devices." });
        });
      }, function () { /* the hub is away for now */ });
    }
    setTimeout(watchJoins, 20000);
  }
  setTimeout(watchJoins, 4000);
  A.act["hub-join"] = function (el) {
    var ok = !!el.getAttribute("data-ok"), code = el.getAttribute("data-code");
    A.Sync.hubPost("/api/joins/decide", { code: code, ok: ok, by: M.me().name }).then(function () {
      UI.toast(ok ? "Let in. The device carries on by itself." : "Declined.");
      mountHubDevices();
    }, function (e) { UI.toast(e.message, "error"); });
  };
  A.act["hub-remove"] = function (el) {
    var id = el.getAttribute("data-id"), label = el.getAttribute("data-label");
    UI.confirm("Remove " + label + " from the school hub? It stops reaching the school's data at once. To use it again it has to join again.", { danger: true, ok: "Remove device" }).then(function (ok) {
      if (!ok) return;
      A.Sync.hubPost("/api/devices/block", { deviceId: id, by: M.me().name }).then(function () { UI.toast("Removed from the hub"); mountHubDevices(); }, function (e) { UI.toast(e.message, "error"); });
    });
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
      '<p class="muted small mt-sm">A paper is flagged when this share of its written answers matches the marking scheme word for word (' + Math.round(M.IDENTICAL * 100) + '% or more of the wording).</p>' +
      '<form data-submit="save-integrity" class="mt"><label class="field"><span>Flag a paper when this share of written answers is identical</span>' +
      '<div class="row"><input type="range" min="10" max="100" step="5" name="th" value="' + th + '" style="flex:1;accent-color:var(--brand)" oninput="this.form.thv.value=this.value+\'%\'"><output name="thv" class="bold tnum" style="width:48px;text-align:right">' + th + "%</output></div></label>" +
      '<button class="btn btn-primary mt" type="submit">' + I("check") + "Save</button></form>" +
      '<div class="divider"></div><h3>Pop-up notifications</h3><p class="muted small mt-sm">Also when the app is in the background.</p>' +
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
    if (A.Licence && !A.Licence.has("ai-marking")) return { html: A.Licence.lockedHtml("ai-marking") }; // Premium only
    var on = !!(S().get("settings", "ai") || {}).enabled, hub = A.AI.where() !== "cloud";
    return {
      html: '<div class="card card-pad" style="max-width:760px"><h3>AI marking for written answers</h3>' +
        '<p class="muted small mt-sm">Marks written answers against the marking scheme, with a line of feedback. Students can still change any mark.</p>' +
        '<ul class="small mt"><li>Students\' answers, the questions and the marking scheme are sent to Anthropic to be marked. Names are not sent.</li>' +
        '<li>It needs an Anthropic API key, billed by Anthropic per use: roughly US$0.05–0.30 per paper, depending on how much is written.</li>' +
        '<li>Each person can have up to 40 marking requests a day.</li>' +
        (hub ? "<li>Save the key on the hub computer.</li>" : "") + "</ul>" +
        '<div id="ai-status" class="callout mt">' + I("refresh") + "<div>Checking…</div></div>" +
        '<label class="check mt"><input type="checkbox" id="ai-on"' + (on ? " checked" : "") + '> <b>Mark written answers with AI</b></label>' +
        '<form data-submit="ai-key" class="mt"><label class="field"><span>Anthropic API key</span><div class="pw-wrap"><input class="input" type="password" name="key" autocomplete="off" placeholder="sk-ant-…"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="pw-toggle" aria-label="Show key">' + I("eye") + "</button></div>" +
        '<span class="hint">Create one at console.anthropic.com → API keys. ' + (hub ? "It is stored on the school hub computer, where only the marking service reads it" : "It is stored online where only the marking service can read it") + '; the app never shows it again.</span></label>' +
        '<div class="row wrap mt-sm"><button class="btn btn-primary" type="submit">' + I("key") + 'Save key</button><button class="btn btn-ghost" type="button" data-act="ai-key-clear">Remove the key</button></div></form></div>',
      mount: function () {
        var box = document.getElementById("ai-status");
        document.getElementById("ai-on").addEventListener("change", function () {
          S().put("settings", Object.assign({}, S().get("settings", "ai") || { id: "ai" }, { id: "ai", enabled: this.checked }));
          UI.toast(this.checked ? "AI marking is on" : "AI marking is off");
        });
        A.AI.status().then(function (st) {
          if (!box) return;
          box.className = "callout mt" + (st.configured ? "" : " warn");
          box.innerHTML = I(st.configured ? "checkCircle" : "alert") + "<div>" + (st.configured
            ? "<b>A key is saved</b> (ending " + esc(st.hint || "") + "). Last 30 days: " + st.month.requests + " marking request" + (st.month.requests === 1 ? "" : "s") +
              ", " + Math.round((st.month.input_tokens + st.month.output_tokens) / 1000) + "k tokens."
            : "<b>No key yet.</b> " + (st.canSetKey === false ? "Open School Assist on the hub computer and save the key there, then tick the box." : "Save an Anthropic API key below, then tick the box.")) + "</div>";
        }).catch(function (e) { if (box) box.innerHTML = I("wifiOff") + "<div>" + esc(e.message || String(e)) + "</div>"; });
      },
    };
  };
  A.act["ai-key"] = function (form) {
    var key = form.key.value.trim();
    if (!key) { UI.toast("Paste the key first", "bad"); return; }
    A.AI.saveKey(key).then(function () { form.key.value = ""; UI.toast("Key saved"); A.render(); })
      .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
  };
  A.act["ai-key-clear"] = function () {
    UI.confirm("Remove the AI key? AI marking stops until a new key is saved.", { danger: true, ok: "Remove" }).then(function (ok) {
      if (!ok) return;
      A.AI.saveKey("").then(function () { UI.toast("Key removed"); A.render(); }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
    });
  };

  /* ------------------------------------------------------------------ data */
  SECTIONS.data = function (me) {
    // the school hub's online backup first (js/backup.js), then this device's own backup and restore
    var online = me.isAdmin && A.Backup && A.Backup.applies() && A.SchoolId && A.SchoolId.id() ? A.Backup.section(me) : null;
    var counts = S().COLLS.map(function (c) { return [c, S().all(c).length]; }).filter(function (x) { return x[1]; });
    var html = '<div class="grid g-2"><div class="card card-pad"><h3>Back up</h3><p class="muted small mt-sm">Everything on this device in one file, for a flash drive.</p>' +
      '<label class="check mt"><input type="checkbox" id="bk-files" checked>Include uploaded PDFs and files (bigger file)</label>' +
      '<button class="btn btn-primary mt" data-act="backup">' + I("download") + "Download backup</button>" +
      '<div class="divider"></div><h3>Restore or merge</h3><p class="muted small mt-sm"><b>Merge</b> adds newer records from the file and keeps everything else. <b>Replace</b> makes this device an exact copy of the backup.</p>' +
      '<div class="row wrap mt"><label class="btn">' + I("upload") + 'Merge a backup<input type="file" accept=".json" data-change="restore" data-mode="merge" hidden></label><label class="btn btn-danger">' + I("upload") + 'Replace from backup<input type="file" accept=".json" data-change="restore" data-mode="replace" hidden></label></div></div>' +
      '<div class="card card-pad"><h3>On this device</h3><dl class="kv mt">' + counts.map(function (c) { return "<dt>" + esc(c[0]) + "</dt><dd>" + c[1] + "</dd>"; }).join("") + '<dt>Files</dt><dd id="file-count">…</dd></dl>' +
      demoCard() + "</div></div>";
    if (online) html = '<h3 class="row" style="gap:8px;margin-bottom:10px">' + I("upload") + " Online backup</h3>" + online.html + '<div class="divider"></div><h3 class="row" style="gap:8px;margin-bottom:10px">' + I("database") + " This device</h3>" + html;
    return {
      html: html,
      mount: function (root) {
        if (online && online.mount) online.mount(root);
        A.Files.all().then(function (fs) {
          var el = root.querySelector("#file-count");
          if (el) el.textContent = fs.length + " (" + A.fmtBytes(A.sum(fs, function (f) { return f.size || 0; })) + ")";
        });
      },
    };
  };
  /** The demo school: try it, rebuild it, or set the real school up. A real school's device: which school, and leaving it. */
  function demoCard() {
    var Id = A.SchoolId, rec = Id && Id.record();
    if (Id && Id.applies() && rec) {
      return '<div class="divider"></div><h3>The school on this device</h3><p class="muted small mt-sm">This device belongs to <b>' + esc(rec.name || A.Theme.get().name) + "</b>. Its records come from, and go to, the school hub; a hub of another school turns it away.</p>" +
        '<button class="btn btn-danger mt" data-act="leave-school">' + I("logout") + "Remove the school from this device</button>";
    }
    return '<div class="divider"></div><h3>Demo data</h3><p class="muted small mt-sm">A demo school to try things. It never goes to a school hub.</p>' +
      '<div class="row wrap mt"><button class="btn" data-act="reset-demo">' + I("refresh") + 'Reset demo data</button>' +
      (Id && Id.applies() ? '<button class="btn btn-primary" data-act="su-leave-demo">' + I("school") + "Set up my school</button>"
        : '<button class="btn btn-danger" data-act="start-empty">' + I("trash") + "Start empty</button>") + "</div>";
  }
  A.act["leave-school"] = function () {
    UI.confirm("Remove " + (A.SchoolId.record().name || "the school") + " from this device? Its records here are deleted (the school hub keeps them), the demo school comes back, and the device stops syncing until it joins a hub again.", { danger: true, ok: "Remove" }).then(function (ok) {
      if (!ok) return;
      A.Sync.setConfig({ url: "", auto: false });
      A.act.signout();
      S().reset().then(function () { if (A.LastUser) A.LastUser.forget(); A.Theme.apply(); UI.toast("The school was removed from this device"); A.render(); });
    });
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
    if (A.staffPassword(M.me())) return '<div class="card card-pad" style="max-width:480px"><h3>Change my password</h3><form data-submit="change-pin" class="mt">' +
      '<label class="field"><span>Current password</span><input class="input" type="password" name="old" autocomplete="current-password"></label>' +
      '<label class="field"><span>New password</span><input class="input" type="password" name="pin" autocomplete="new-password" placeholder="8 or more characters, letters and a number"></label>' +
      '<label class="field"><span>Type it again</span><input class="input" type="password" name="pin2" autocomplete="new-password"></label>' +
      '<button class="btn btn-primary mt" type="submit">' + I("lock") + "Change password</button></form></div>";
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
    var pw = A.staffPassword(me);
    if (M.checkSecret(me.id, f.old) !== true) { UI.toast(pw ? "Your current password is not right" : "Your current PIN is not right", "bad"); return; }
    if (pw) {
      var bad = A.staffPasswordProblem(f.pin);
      if (bad) { UI.toast(bad, "bad"); return; }
      if (f.pin !== f.pin2) { UI.toast("The two passwords are different", "bad"); return; }
      if (!me.pw) S().put("users", Object.assign({}, me, { pw: true }));
    } else if (!/^\d{4}$/.test(f.pin)) { UI.toast("The new PIN must be 4 digits", "bad"); return; }
    M.setPin(me.id, f.pin, me.id);
    UI.toast(pw ? "Password changed" : "PIN changed");
    form.reset();
  };
  A.act["change-password"] = function (form) {
    var me = M.me(), f = UI.formData(form), cr = M.credential(me.id), min = Number(CFG.minPasswordLength) || 6;
    if (M.checkSecret(me.id, f.old) !== true) { UI.toast("Your current password is not right", "bad"); return; }
    if (f.pw.length < min) { UI.toast("Use at least " + min + " characters", "bad"); return; }
    if (f.pw !== f.pw2) { UI.toast("The two new passwords are different", "bad"); return; }
    M.setPassword(me.id, f.pw, me.id);
    UI.toast("Password changed");
    form.reset();
  };
})(window.App);
