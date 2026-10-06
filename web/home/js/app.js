/* App shell: router, sign-in, navigation, global event delegation, boot. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI;
  var CFG = window.SCHOOL_CONFIG || {};

  /* ----------------------------------------------------------------- router */
  var routes = [];
  A.act = A.act || {}; // js/cloud.js may have added its actions already
  A.route = function (pattern, fn, opts) { routes.push({ parts: pattern.split("/"), fn: fn, opts: opts || {} }); };
  A.go = function (hash) { if (location.hash === hash) A.render(); else location.hash = hash; };
  A.home = function (u) { return u && u.role === "student" ? "#/s/home" : "#/t/home"; };

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, ""), q = {}, qi = raw.indexOf("?");
    if (qi >= 0) {
      raw.slice(qi + 1).split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); });
      raw = raw.slice(0, qi);
    }
    return { path: raw, parts: raw ? raw.split("/").map(decodeURIComponent) : [], query: q };
  }
  function match(parts) {
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i], params = {}, ok = true;
      var required = r.parts.filter(function (p) { return p.slice(-1) !== "?"; }).length;
      if (parts.length < required || parts.length > r.parts.length) continue;
      for (var j = 0; j < r.parts.length; j++) {
        var rp = r.parts[j], v = parts[j];
        if (rp[0] === ":") { var name = rp.replace(/^:|\?$/g, ""); if (v == null && rp.slice(-1) !== "?") { ok = false; break; } params[name] = v; }
        else if (rp !== v) { ok = false; break; }
      }
      if (ok) return { route: r, params: params };
    }
    return null;
  }

  var lastPath = null;
  A.render = function () {
    var app = document.getElementById("app");
    if (!A.Store.state) return;
    if (A.cleanup) { var fn = A.cleanup; A.cleanup = null; try { fn(); } catch (e) { console.error(e); } }
    var me = M.me(), h = parseHash();
    if (me && A.Devices && A.Devices.isRevoked(me)) {
      A.loginNotice = "An administrator signed this device out of " + me.name + "'s account.";
      M.signOut(); me = null;
    }
    if (A.Screen) A.Screen.paint();
    if (!me) { lastPath = "login"; app.innerHTML = Login.html(); return; }
    if (A.Devices) A.Devices.heartbeat(me);
    var prefix = me.role === "student" ? "s" : "t";
    if (!h.parts.length || h.parts[0] !== prefix) { location.replace(A.home(me)); return; }
    var m = match(h.parts);
    if (!m) { location.replace(A.home(me)); return; }

    var view;
    try { view = m.route.fn(m.params, h.query, me) || {}; }
    catch (e) { console.error(e); view = { title: "Something went wrong", html: UI.empty("alert", "This page could not be shown", String(e.message || e)) }; }
    if (view.redirect) { location.replace(view.redirect); return; }

    var samePage = lastPath === h.path;
    var scroll = window.scrollY;
    // navigation strips keep their place when a page is redrawn (sidebar, settings tabs, filters)
    var kept = STRIPS.map(function (sel) { return Array.prototype.map.call(app.querySelectorAll(sel), function (el) { return { l: el.scrollLeft, t: el.scrollTop }; }); });
    if (!samePage) document.querySelectorAll(".modal-back").forEach(function (m) { m.remove(); });
    if (m.route.opts.bare) app.innerHTML = view.html;
    else app.innerHTML = shell(me, view, h);
    lastPath = h.path;
    STRIPS.forEach(function (sel, i) {
      app.querySelectorAll(sel).forEach(function (el, k) {
        var was = kept[i][k];
        if (was) { el.scrollLeft = was.l; el.scrollTop = was.t; }
        var on = el.querySelector(".active, .on, [aria-selected=true]");
        if (on) keepInView(el, on);
      });
    });
    UI.hydrate(app);
    if (view.mount) view.mount(app, m.params, h.query);
    A.boxLists(app);
    window.scrollTo(0, samePage ? scroll : 0);
    if (me.role === "teacher" && A.Alerts) setTimeout(A.Alerts.check, 400);
  };

  /* ------------------------------------------------------------------ long lists
     A list with many rows scrolls inside its own card (its heading stays on top) instead of
     stretching the whole page: subject pickers, materials, topics, people, tables, groups.
     Runs after every redraw, and again when a page fills a list in later. */
  var BOX_ROWS = 8;
  A.boxLists = function (root) {
    root = root || document;
    var rows = function (el, sel) { var n = 0; for (var i = 0; i < el.children.length; i++) if (el.children[i].matches(sel)) n++; return n; };
    root.querySelectorAll(".card, details.card").forEach(function (el) {
      el.classList.toggle("boxed", rows(el, ".list-row, .topic-row, .tutor-topic, .class-row, a.list-row, .mat-session") > BOX_ROWS);
    });
    root.querySelectorAll(".table-wrap").forEach(function (el) {
      var t = el.querySelector("table");
      el.classList.toggle("boxed", !!t && !t.classList.contains("tt") && t.querySelectorAll("tbody tr").length > BOX_ROWS + 4);
    });
    root.querySelectorAll(".subj-picker").forEach(function (el) { el.classList.toggle("boxed", el.querySelectorAll(".subj-pick").length > BOX_ROWS); });
    root.querySelectorAll(".grid.g-auto").forEach(function (el) { el.classList.toggle("boxed", el.children.length > 12); });
    root.querySelectorAll(".who-list").forEach(function (el) { el.classList.toggle("boxed", el.children.length > BOX_ROWS); });
  };
  // lists filled in after the page is drawn (pickers, tutor content, staff codes)
  if (window.MutationObserver) {
    var boxTimer = null;
    new MutationObserver(function () { clearTimeout(boxTimer); boxTimer = setTimeout(function () { var a = document.getElementById("app"); if (a) A.boxLists(a); }, 150); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------ shell */
  /** Scrolling strips whose place is kept across redraws. */
  var STRIPS = [".sidebar", ".sidebar .nav", ".tabs", ".pill-tabs", ".bottom-nav"];
  /** Scroll a strip just enough to show its selected item (no jump when it is already visible). */
  function keepInView(box, el) {
    var b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (box.scrollWidth > box.clientWidth + 4) {
      if (r.left < b.left) box.scrollLeft -= b.left - r.left + 16;
      else if (r.right > b.right) box.scrollLeft += r.right - b.right + 16;
    }
    if (box.scrollHeight > box.clientHeight + 4) {
      if (r.top < b.top) box.scrollTop -= b.top - r.top + 16;
      else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 16;
    }
  }
  function navItems(me) {
    if (A.edition === "teacher" && A.Primary && me.role !== "student") return A.Primary.nav(me);
    if (me.role === "student") {
      var newTasks = M.tasksForStudent(me.id).filter(function (t) { return M.taskStatus(t, me.id).key === "new"; }).length;
      return [
        { href: "#/s/home", icon: "home", label: "Home", key: "home" },
        { href: "#/s/tasks", icon: "tasks", label: "My tasks", key: "tasks", match: ["task"], count: newTasks },
        { href: "#/s/timetable", icon: "grid", label: "Timetable", key: "timetable" },
        { href: "#/s/exam", icon: "cap", label: "Exam mode", key: "exam", match: ["exam", "study", "topic", "test", "result", "sit", "paper-result"] },
        { href: "#/s/subjects", icon: "layers", label: "My subjects", key: "subjects", count: M.enrolments ? M.enrolments(me.id).filter(function (e) { return e.status === "declined"; }).length : 0 },
        { href: "#/s/library", icon: "library", label: "Library", key: "library" },
        { href: "#/s/notifications", icon: "bell", label: "Notifications", key: "notifications", count: M.unreadCount(me.id) },
        { href: "#/s/progress", icon: "chart", label: "My progress", key: "progress" },
        { href: "#/s/settings", icon: "sliders", label: "Settings", key: "settings" },
      ];
    }
    var toMark = 0;
    M.myClasses(me).forEach(function (c) {
      M.tasksForClass(c.id).forEach(function (t) { var n = M.taskCounts(t); toMark += Math.max(0, n.submitted - n.graded); });
    });
    return [
      { href: "#/t/home", icon: "home", label: "Home", key: "home" },
      { href: "#/t/classes", icon: "users", label: "My classes", key: "classes", match: ["classes", "class", "student", "task", "attempt"], count: toMark },
      { href: "#/t/requests", icon: "checkCircle", label: "Subject requests", key: "requests", count: M.subjectRequests ? M.subjectRequests(me).length : 0 },
      { href: "#/t/timetable", icon: "grid", label: "Timetable", key: "timetable" },
      { href: "#/t/syllabi", icon: "layers", label: "Syllabus library", key: "syllabi", match: ["syllabi", "syllabus"] },
      { href: "#/t/materials", icon: "library", label: "Learning materials", key: "materials" },
      { href: "#/t/tutor", icon: "cap", label: "Tutor content", key: "tutor" },
      { href: me.isAdmin && A.pwRequestList && A.pwRequestList().length ? "#/t/settings?s=people" : "#/t/settings", icon: "sliders", label: "Settings", key: "settings", count: me.isAdmin && A.pwRequestList ? A.pwRequestList().length : 0 },
    ];
  }

  function shell(me, view, h) {
    var b = A.Theme.get(), seg = h.parts[1];
    var items = navItems(me);
    var navHtml = items.map(function (it) {
      var on = it.key === seg || (it.match && it.match.indexOf(seg) >= 0);
      var html = '<a class="nav-item ' + (on ? "active" : "") + '" href="' + it.href + '" data-tip="' + esc(it.label) + '">' + I(it.icon) + '<span class="nav-label">' + esc(it.label) + "</span>" + (it.count ? '<span class="count">' + it.count + "</span>" : "") + "</a>";
      // a few classes are listed under My classes; with many (every subject, IGCSE and A level) the
      // My classes page groups and searches them instead of a long list here
      var mine = it.key === "classes" ? M.myClasses(me) : [];
      if (it.key === "classes" && mine.length <= 4) {
        html += mine.map(function (c) {
          var cOn = (seg === "class" && h.parts[2] === c.id);
          return '<a class="nav-item sub ' + (cOn ? "active" : "") + '" href="#/t/class/' + c.id + '"><span class="dot"></span><span class="nav-label">' + esc(c.name + " · " + c.subject) + "</span></a>";
        }).join("");
      }
      return html;
    }).join("");
    var bottom = items.slice(0, 5).map(function (it) {
      var on = it.key === seg || (it.match && it.match.indexOf(seg) >= 0);
      var short = it.label.replace(/^My /, "").split(" ")[0];
      return '<a href="' + it.href + '" class="' + (on ? "active" : "") + '">' + I(it.icon) + "<span>" + esc(short.charAt(0).toUpperCase() + short.slice(1)) + "</span>" + (it.count ? '<span class="count">' + it.count + "</span>" : "") + "</a>";
    }).join("");
    var sub = me.role === "student" ? M.studentHome(me) || "Student" : me.title || "Teacher";
    var bellN = me.role === "teacher" ? (A.Alerts ? A.Alerts.unread(me.id) : 0) : M.unreadCount(me.id);
    var bell = me.role === "teacher"
      ? '<button class="btn btn-ghost btn-icon bell" data-act="open-alerts" data-tip="Notifications" aria-label="Notifications">' + I("bell") + '<span class="bell-n' + (bellN ? "" : " hidden") + '" id="bell-count">' + bellN + "</span></button>"
      : '<a class="btn btn-ghost btn-icon bell" href="#/s/notifications" data-tip="Notifications" aria-label="Notifications">' + I("bell") + '<span class="bell-n' + (bellN ? "" : " hidden") + '" id="bell-count">' + bellN + "</span></a>";
    var crumbs = (view.crumbs || []).map(function (c) { return c.href ? '<a href="' + c.href + '">' + esc(c.label) + "</a>" : "<span>" + esc(c.label) + "</span>"; }).join(I("right"));

    return '<div class="shell">' +
      '<aside class="sidebar">' +
      '<div class="side-brand">' + A.Theme.logoHTML() + '<div class="brand-text"><div class="brand-name">' + esc(b.name) + '</div><div class="brand-motto">' + esc(b.motto) + "</div></div></div>" +
      '<nav class="nav" aria-label="Main">' + navHtml + "</nav>" +
      '<div class="side-foot"><div class="me">' + A.avatar(me) + '<div class="who"><b>' + esc(me.name) + "</b><span>" + esc(sub) + '</span></div><button class="side-btn" data-act="signout" data-tip="Sign out" aria-label="Sign out">' + I("logout") + "</button></div></div>" +
      "</aside>" +
      '<div class="main"><header class="topbar">' + A.Theme.logoHTML("mobile-brand") +
      '<div class="titles">' + (crumbs ? '<div class="crumbs">' + crumbs + "</div>" : "") + '<h1 class="page-title">' + esc(view.title || "") + "</h1></div>" +
      '<div class="top-actions">' + statusChip() + bell +
      '<button class="btn btn-ghost btn-icon" data-act="toggle-theme" data-tip="Light / dark mode" aria-label="Toggle dark mode">' + I(A.Theme.isDark() ? "sun" : "moon") + "</button>" +
      '<button class="btn btn-ghost btn-icon mobile-only-signout" data-act="signout" data-tip="Sign out" aria-label="Sign out">' + I("logout") + "</button>" +
      (A.Screen ? A.Screen.controls() : "") +
      "</div></header>" +
      '<main class="content" id="view">' + (view.html || "") + "</main></div>" +
      '<nav class="bottom-nav" aria-label="Main">' + bottom + "</nav></div>";
  }

  function statusChip() {
    var s = A.Sync ? A.Sync.status() : { state: "local" }, online = navigator.onLine;
    // just Online or Offline: what matters is whether new work can be sent and received
    var cls = online ? (s.state === "error" ? "error" : "") : "offline", txt = online ? "Online" : "Offline";
    var me = M.me(), href = me && me.role === "student" ? "#/s/settings?s=sync" : "#/t/settings?s=sync";
    // School Assist Teacher with no school hub: everything is simply on this device
    if (A.edition === "teacher" && s.state === "local") {
      return '<a class="status-chip" id="status-chip" href="' + href + '" data-tip="Saved on this device. To share with other teachers, set up a school hub in Settings → Offline &amp; sync."><span class="pip"></span><span class="txt">On this device</span></a>';
    }
    return '<a class="status-chip ' + cls + '" id="status-chip" href="' + href + '" data-tip="' + (online ? "Online: your work is sent and new work arrives automatically." : "Offline: everything is saved on this device and is sent when you're back online.") + '"><span class="pip"></span>' + (online ? "" : I("wifiOff")) + '<span class="txt">' + esc(txt) + "</span></a>";
  }
  A.refreshStatus = function () {
    var el = document.getElementById("status-chip");
    if (el) el.outerHTML = statusChip();
  };

  /* ------------------------------------------------------------------ login
     Teachers: pick your name, then your PIN.
     Students: student ID + password. The first time, a student confirms their
     name and student ID and creates a password. */
  var blank = function () {
    var p = A.Cloud && A.Cloud.profile();
    if (A.edition === "teacher") return { step: A.Primary && A.Primary.needsSetup() ? "tsetup" : "who", role: "teacher", userId: null, pin: "", q: "", msg: "", sid: "", name: "" };
    return { step: p && p.status === "pending" ? "pending" : "role", role: null, userId: null, pin: "", q: "", msg: "", sid: "", name: "" };
  };
  var L = blank();
  var MINPW = Number(CFG.minPasswordLength) || 6;
  var ID_EG = "e.g. " + (A.edition === "home" ? ((CFG.home || {}).student || {}).studentNo || "HOME-001" : "GHS-22-017");
  /** "Continue as …": whoever signed in last on this device (js/staff.js remembers it). */
  function lastUserCard() {
    var last = A.LastUser && A.LastUser.get();
    if (!last || !last.name) return "";
    var staff = last.role !== "student";
    return '<div class="last-user mb"><button class="last-user-go" data-act="login-continue">' + A.avatar({ name: last.name }, "") +
      '<span class="grow"><span class="tiny muted">Last signed in on this device</span><b>' + esc(last.name) + "</b><span class=\"tiny muted\">" +
      esc(staff ? (last.isAdmin ? "Admin" : "Teacher") : "Student" + (last.studentNo ? " · " + last.studentNo : "")) + "</span></span>" + I("right") + "</button>" +
      '<button class="btn btn-ghost btn-sm" data-act="login-forget-last" data-tip="Forget who used this device">Not you?</button></div>';
  }
  A.act["login-continue"] = function () {
    var last = A.LastUser && A.LastUser.get(); if (!last) return;
    L.msg = ""; L.role = last.role === "student" ? "student" : "teacher";
    if (L.role === "student") { L.sid = last.studentNo || ""; L.step = "student"; }
    else if (A.Cloud) { L.email = last.email || ""; L.step = "admin"; }
    else { L.userId = last.id; L.pin = ""; L.step = A.Store.get("users", last.id) ? "pin" : "who"; }
    redrawLogin();
  };
  /** The staff-code check: a teacher or admin signing in on a device a student used last. */
  function staffCodeStep(back, msg) {
    var last = (A.LastUser && A.LastUser.get()) || {}, who = L.codeFor || {};
    return back + '<div class="callout warn mt">' + I("shield") + "<div><b>This device was last used by " + esc(last.name || "a student") + ".</b> To sign in here as " + (who.isAdmin ? "an admin" : "a teacher") +
      ", enter your school's " + (who.isAdmin ? "admin" : "teacher") + " code as well. The admins are told about this sign-in.</div></div>" +
      '<form data-submit="staff-code-check" class="mt"><label class="field"><span>' + (who.isAdmin ? "Admin" : "Teacher") + ' code</span><input class="input" name="code" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="e.g. ' + esc(M.schoolAbbr ? M.schoolAbbr(A.Theme.get().name) : "ABC") + '-4K7-9QP"></label>' +
      msg + '<button class="btn btn-primary btn-lg btn-block mt" type="submit"' + (L.busy ? " disabled" : "") + ">" + I("check") + "Continue</button></form>";
  }

  var Login = {
    html: function () {
      var b = A.Theme.get();
      var left = '<section class="login-brand"><div style="position:relative;z-index:1">' + A.Theme.logoHTML() +
        "<h1>" + esc(b.name) + '</h1><p class="motto">' + esc(b.motto) + "</p>" +
        (A.edition === "teacher" ? "<ul><li>" + I("check") + "The morning register in a few taps</li><li>" + I("edit") + "Mark book and termly reports for the whole class</li><li>" + I("book") + "Schemes of work and the record of work</li><li>" + I("tablet") + "A class screen for the projector or TV</li><li>" + I("wifiOff") + "Works with no internet; pupils' records stay in the school</li>" : "<ul><li>" + I("users") + "Teachers: registers, tasks, marks and progress tracking</li><li>" + I("book") + "Students: notes, worked examples and practice questions</li><li>" + I("clock") + "Exam mode: timed papers with instant feedback</li><li>" + I("wifiOff") + "Works offline, then syncs when you are back online</li>") + "</ul></div>" +
        '<p class="small" style="position:relative;z-index:1;opacity:.8">' + esc((CFG.academicYear || "") + " · " + (CFG.term || "")) + "</p></section>";
      var notice = A.loginNotice ? '<div class="callout warn mb">' + I("shield") + "<div>" + esc(A.loginNotice) + "</div></div>" : "";
      var ctl = A.Screen ? '<div class="scr-float">' + A.Screen.controls() + "</div>" : "";
      var install = A.Install ? A.Install.html() : "";
      return '<div class="login">' + left + '<section class="login-panel"><div class="login-box">' + notice + '<div id="login-step">' + Login.step() + "</div>" + install + "</div></section>" + ctl + "</div>";
    },
    step: function () {
      var back = '<button class="btn btn-ghost btn-sm" data-act="login-back">' + I("back") + "Back</button>";
      var msg = L.msg ? '<p class="form-msg" role="alert">' + I("alert") + esc(L.msg) + "</p>" : "";
      if (A.Cloud) { var online = Login.cloudStep(back, msg); if (online != null) return online; }
      if (A.edition === "teacher" && A.Primary) { var pt = A.Primary.loginStep(L, back, msg); if (pt != null) return pt; }
      if (L.step === "staffcode") return staffCodeStep(back, msg);
      if (L.step === "staffreg") {
        return back + '<h2 class="mt" style="font-size:24px">Register as a teacher or admin</h2><p class="muted small mt-sm">Use the staff code your school gave you: the teacher code makes you a teacher, the admin code an admin. An admin approves you before you can sign in.</p>' + A.staffRegisterForm(msg);
      }
      if (L.step === "staffasked") {
        var su0 = L.staffUser || {};
        return '<div style="text-align:center" class="mt"><div class="big-ico" style="margin:0 auto;color:var(--good)">' + I("checkCircle") + '</div><h2 class="mt-sm" style="font-size:22px">You\'re registered, ' + esc(A.firstName(su0.name || "")) + "</h2>" +
          '<p class="muted mt-sm">An admin needs to approve you as ' + (su0.isAdmin ? "an admin" : "a teacher") + ". When they have, choose your name and enter your PIN" + (A.Cloud ? " (your email and password)" : "") + ".</p></div>" +
          '<button class="btn btn-primary btn-lg btn-block mt" data-act="login-goto" data-step="role">Back to sign in</button>';
      }
      if (L.step === "role") {
        return '<h2 style="font-size:26px">Welcome</h2><p class="muted mt-sm">Who is using this device?</p>' + lastUserCard() +
          '<div class="role-cards">' +
          '<button class="role-card" data-act="login-role" data-role="teacher"><div class="ico">' + I("school") + "</div><b>I'm a teacher</b><span>Classes, registers, tasks and marks</span></button>" +
          '<button class="role-card" data-act="login-role" data-role="student"><div class="ico">' + I("cap") + "</div><b>I'm a student</b><span>Sign in with your student ID</span></button>" +
          "</div>";
      }
      if (L.step === "who") {
        return (A.edition === "teacher" ? "" : back) + '<h2 class="mt" style="font-size:24px">Select your name</h2>' +
          msg + '<div class="mt"><input class="input" id="login-search" placeholder="Search by name…" value="' + esc(L.q) + '" data-input="login-search" autocomplete="off" aria-label="Search by name"></div>' +
          '<div class="who-list" id="who-list">' + Login.list() + "</div>" +
          '<div class="divider"></div><div class="row wrap spread"><span class="small">New teacher or admin?</span><button class="btn" data-act="login-goto" data-step="staffreg">' + I("plus") + "Register with the staff code</button></div>";
      }
      if (L.step === "pin") {
        var u = A.Store.get("users", L.userId) || {};
        var dots = [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < L.pin.length ? "on" : "") + '"></i>'; }).join("");
        var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map(function (k) {
          return '<button class="' + (k === "C" || k === "⌫" ? "fn" : "") + '" data-act="login-key" data-k="' + k + '">' + (k === "C" ? "Clear" : k) + "</button>";
        }).join("");
        return back + '<div style="text-align:center" class="mt">' + A.avatar(u, "lg") + '<h2 class="mt-sm" style="font-size:22px">' + esc(u.name) + '</h2><p class="muted small">Enter your 4-digit PIN</p>' +
          '<div class="pin-dots" id="pin-dots">' + dots + "</div></div>" + '<div class="keypad">' + keys + "</div>" +
          (CFG.demoPin && A.edition === "demo" ? '<p class="muted small" style="text-align:center;margin-top:18px">' + I("info") + " Demo PIN: <b>" + esc(CFG.demoPin) + "</b></p>" : "");
      }
      if (L.step === "student") {
        return back + '<h2 class="mt" style="font-size:24px">Student sign in</h2><p class="muted small mt-sm">Use your student ID and your password.</p>' +
          '<form data-submit="student-login" class="mt">' +
          '<label class="field"><span>Student ID</span><input class="input" name="sid" value="' + esc(L.sid) + '" autocomplete="username" autocapitalize="characters" spellcheck="false" placeholder="' + esc(ID_EG) + '"></label>' +
          '<label class="field"><span>Password</span><div class="pw-wrap"><input class="input" type="password" name="pw" autocomplete="current-password"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="pw-toggle" aria-label="Show password">' + I("eye") + "</button></div></label>" +
          msg + '<button class="btn btn-primary btn-lg btn-block mt" type="submit">Sign in</button></form>' +
          '<div class="divider"></div><div class="row wrap spread"><span class="small">First time signing in?</span><button class="btn" data-act="login-setup">' + I("key") + "Set up your account</button></div>" +
          Login.example();
      }
      if (L.step === "setup") {
        return back + '<h2 class="mt" style="font-size:24px">Set up your account</h2><p class="muted small mt-sm">Enter your full name and your student ID exactly as the school has them.</p>' +
          '<form data-submit="student-setup" class="mt">' +
          '<label class="field"><span>Full name</span><input class="input" name="name" value="' + esc(L.name) + '" autocomplete="name" placeholder="e.g. Tafadzwa Mhlanga"></label>' +
          '<label class="field"><span>Student ID</span><input class="input" name="sid" value="' + esc(L.sid) + '" autocapitalize="characters" spellcheck="false" placeholder="' + esc(ID_EG) + '"></label>' +
          msg + '<button class="btn btn-primary btn-lg btn-block mt" type="submit">Continue</button></form>' + Login.example();
      }
      if (L.step === "setpw") {
        var su = A.Store.get("users", L.userId) || {};
        return back + '<div class="row mt">' + A.avatar(su) + '<div><h2 style="font-size:22px">Hi ' + esc(A.firstName(su.name)) + ", create your password</h2><p class=\"muted small\">" + esc(su.studentNo) + " · " + esc(M.studentHome(su)) + "</p></div></div>" +
          '<form data-submit="student-setpw" class="mt"><input type="text" name="username" value="' + esc(su.studentNo) + '" autocomplete="username" hidden>' +
          '<label class="field"><span>New password</span><div class="pw-wrap"><input class="input" type="password" name="pw" autocomplete="new-password"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="pw-toggle" aria-label="Show password">' + I("eye") + '</button></div><span class="hint">At least ' + MINPW + " characters. Don't share it with anyone.</span></label>" +
          '<label class="field"><span>Type it again</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>' +
          msg + '<button class="btn btn-primary btn-lg btn-block mt" type="submit">' + I("lock") + "Create password and sign in</button></form>" +
          '<p class="tiny muted mt">From now on you sign in with your student ID and this password. If you forget it, an administrator can reset it for you.</p>';
      }
      return "";
    },
    /* Home edition online: students sign in with their ID (HOME-001…) or register for the next one;
       the admin signs in with an email address. Returns null for steps shared with the offline app. */
    cloudStep: function (back, msg) {
      var busy = L.busy ? '<div class="callout mt">' + I("refresh") + "<div>" + esc(L.busy === true ? "Signing in and fetching your subjects…" : L.busy) + "</div></div>" : "";
      var pw = function (name, label, auto, hint) {
        return '<label class="field"><span>' + label + '</span><div class="pw-wrap"><input class="input" type="password" name="' + name + '" autocomplete="' + auto + '"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="pw-toggle" aria-label="Show password">' + I("eye") + "</button></div>" + (hint ? '<span class="hint">' + hint + "</span>" : "") + "</label>";
      };
      var submit = function (label, icon) { return '<button class="btn btn-primary btn-lg btn-block mt" type="submit"' + (L.busy ? " disabled" : "") + ">" + (icon ? I(icon) : "") + label + "</button>"; };
      if (L.step === "role") {
        return '<h2 style="font-size:26px">Welcome</h2><p class="muted mt-sm">Who is signing in?</p>' + lastUserCard() +
          '<div class="role-cards">' +
          '<button class="role-card" data-act="login-role" data-role="student"><div class="ico">' + I("cap") + "</div><b>I'm a student</b><span>Sign in with your student ID, or register</span></button>" +
          '<button class="role-card" data-act="login-role" data-role="teacher"><div class="ico">' + I("school") + "</div><b>I'm a teacher or the admin</b><span>Subjects, lessons, files and students</span></button>" +
          "</div>" + (navigator.onLine ? "" : '<p class="small muted mt">' + I("wifiOff") + " You're offline. Signing in needs the internet the first time on each device.</p>");
      }
      if (L.step === "student" || L.step === "who") {
        if (L.role === "teacher") return null;
        return back + '<h2 class="mt" style="font-size:24px">Student sign in</h2><p class="muted small mt-sm">Use your student ID (for example ' + esc(ID_EG.replace(/^e\.g\. /, "")) + ") and your password.</p>" +
          '<form data-submit="cloud-student-login" class="mt">' +
          '<label class="field"><span>Student ID</span><input class="input" name="sid" value="' + esc(L.sid) + '" autocomplete="username" autocapitalize="characters" spellcheck="false" placeholder="' + esc(ID_EG) + '"></label>' +
          pw("pw", "Password", "current-password") + msg + busy + submit("Sign in") + "</form>" +
          '<div class="row mt-sm" style="justify-content:center"><button class="btn btn-ghost btn-sm" data-act="login-goto" data-step="forgot">' + I("key") + "Forgot your password?</button></div>" +
          '<div class="divider"></div><div class="row wrap spread"><span class="small">New here?</span><button class="btn" data-act="login-goto" data-step="register">' + I("plus") + "Register</button></div>";
      }
      if (L.step === "regboard") {
        var boards = boardsOf(L.offered || []);
        return back + '<div class="steps small muted mt">Step 2 of 3</div><h2 class="mt-sm" style="font-size:24px">Your exam board</h2><p class="muted small mt-sm">Which exams are you writing?</p>' +
          '<div class="role-cards one">' + boards.map(function (b) {
            return '<button class="role-card" data-act="reg-board" data-b="' + esc(b.name) + '"><div class="ico">' + I("award") + "</div><b>" + esc(b.name) + "</b><span>" + b.count + " subject" + (b.count === 1 ? "" : "s") + "</span></button>";
          }).join("") + "</div>" + msg;
      }
      if (L.step === "regsubjects") {
        var list = (L.offered || []).filter(function (x) { return M.boardName(x) === L.board; });
        return back + '<div class="steps small muted mt">Step 3 of 3</div><h2 class="mt-sm" style="font-size:24px">Your subjects</h2><p class="muted small mt-sm">' + esc(L.board) + ": tick every subject you are taking. Each subject's teacher approves it.</p>" +
          '<form data-submit="cloud-register" class="mt subj-picker">' + A.subjectPicker(list, L.chosen || {}) + msg + busy + submit("Register", "key") + "</form>";
      }
      if (L.step === "register") {
        var st = M.structure();
        return back + '<div class="steps small muted mt">Step 1 of 3</div><h2 class="mt-sm" style="font-size:24px">Register</h2><p class="muted small mt-sm">You get your student ID straight away. Next you choose your exam board and subjects; the admin approves you before you can start.</p>' +
          '<form data-submit="cloud-register-next" class="mt">' +
          '<label class="field"><span>Full name</span><input class="input" name="name" value="' + esc(L.name) + '" autocomplete="name" placeholder="First name and surname"></label>' +
          '<label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option" + (l === L.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
          pw("pw", "Choose a password", "new-password", "At least " + MINPW + " characters.") +
          '<label class="field"><span>Type it again</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>' +
          msg + busy + submit("Next: your subjects", "right") + "</form>";
      }
      if (L.step === "registered") {
        var r = L.registered || {};
        return '<div style="text-align:center" class="mt"><div class="big-ico" style="margin:0 auto;color:var(--good)">' + I("checkCircle") + '</div><h2 class="mt-sm" style="font-size:22px">You\'re registered, ' + esc(A.firstName(r.name || "")) + '</h2>' +
          '<p class="muted mt-sm">Your student ID is</p><div class="id-big">' + esc(r.studentNo || "") + '</div><p class="small mt-sm"><b>Write it down.</b> You sign in with this ID and your password.</p></div>' +
          msg + busy + '<button class="btn btn-primary btn-lg btn-block mt" data-act="cloud-registered-continue"' + (L.busy ? " disabled" : "") + ">Continue</button>";
      }
      if (L.step === "pending" && (A.Cloud.profile() || {}).role && (A.Cloud.profile() || {}).role !== "student") {
        var sp = A.Cloud.profile();
        return '<div style="text-align:center" class="mt"><div class="big-ico" style="margin:0 auto">' + I("clock") + '</div><h2 class="mt-sm" style="font-size:22px">Waiting for approval</h2>' +
          '<p class="muted mt-sm">Hi ' + esc(A.firstName(sp.name || "")) + ", you registered as " + (sp.role === "admin" ? "an admin" : "a teacher") + ". An admin needs to approve you before you can start.</p></div>" +
          msg + busy + '<button class="btn btn-primary btn-lg btn-block mt" data-act="cloud-check"' + (L.busy ? " disabled" : "") + ">" + I("refresh") + "Check again</button>" +
          '<button class="btn btn-ghost btn-block mt-sm" data-act="cloud-pending-signout">Sign out</button>';
      }
      if (L.step === "pending") {
        var p = (A.Cloud.profile() || {});
        return '<div style="text-align:center" class="mt"><div class="big-ico" style="margin:0 auto">' + I("clock") + '</div><h2 class="mt-sm" style="font-size:22px">Waiting for approval</h2>' +
          '<p class="muted mt-sm">Hi ' + esc(A.firstName(p.name || "")) + ", you're registered as</p><div class=\"id-big\">" + esc(p.student_no || "") + "</div>" +
          '<p class="small mt-sm">The admin needs to approve you before you can start. Check back after they tell you it\'s done. Your subjects are then approved by their teachers; you can use the app while you wait.</p></div>' +
          msg + busy + '<button class="btn btn-primary btn-lg btn-block mt" data-act="cloud-check"' + (L.busy ? " disabled" : "") + ">" + I("refresh") + "Check again</button>" +
          '<button class="btn btn-ghost btn-block mt-sm" data-act="cloud-pending-signout">Sign out</button>';
      }
      if (L.step === "admin" || (L.role === "teacher" && (L.step === "who" || L.step === "pin"))) {
        return back + '<h2 class="mt" style="font-size:24px">Teacher and admin sign in</h2>' +
          '<form data-submit="cloud-admin-login" class="mt">' +
          '<label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username" value="' + esc(L.email || "") + '"></label>' +
          pw("pw", "Password", "current-password") + msg + busy + submit("Sign in") + "</form>" +
          '<div class="row mt-sm" style="justify-content:center"><button class="btn btn-ghost btn-sm" data-act="login-goto" data-step="forgot">' + I("key") + "Forgot your password?</button></div>" +
          '<div class="divider"></div><div class="row wrap spread"><span class="small">New teacher or admin?</span><button class="btn" data-act="cloud-staffreg">' + I("plus") + "Register with the staff code</button></div>" +
          '<div class="row wrap spread mt-sm"><span class="small muted">Setting School Assist up for the first time?</span><button class="btn btn-ghost btn-sm" data-act="login-goto" data-step="setupAdmin">' + I("key") + "Set up the first admin</button></div>";
      }
      var who = L.role === "teacher" ? "Your email address" : "Student ID", whoVal = L.role === "teacher" ? L.email || "" : L.sid || "";
      if (L.step === "forgot") {
        return back + '<h2 class="mt" style="font-size:24px">Forgot your password?</h2><p class="muted small mt-sm">Choose how to get back in.</p>' +
          '<div class="role-cards one">' +
          '<button class="role-card" data-act="login-goto" data-step="forgotcode"><div class="ico">' + I("key") + "</div><b>I have my recovery code</b><span>It looks like ABCD-EFGH-JKMN. You choose a new password straight away.</span></button>" +
          '<button class="role-card" data-act="login-goto" data-step="forgotask"><div class="ico">' + I("send") + "</div><b>Ask the admin</b><span>The admin gives you a new password. Sign in with it, then change it in Settings.</span></button>" +
          "</div>" + msg;
      }
      if (L.step === "forgotcode") {
        return back + '<h2 class="mt" style="font-size:24px">Choose a new password</h2><p class="muted small mt-sm">Use the recovery code you wrote down when you made it.</p>' +
          '<form data-submit="cloud-recover" class="mt">' +
          '<label class="field"><span>' + who + '</span><input class="input" name="login" value="' + esc(whoVal) + '" autocomplete="username" autocapitalize="' + (L.role === "teacher" ? "off" : "characters") + '" spellcheck="false"></label>' +
          '<label class="field"><span>Recovery code</span><input class="input" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-JKMN"></label>' +
          pw("pw", "New password", "new-password", "At least " + MINPW + " characters.") +
          '<label class="field"><span>Type it again</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>' +
          msg + busy + submit("Set the new password", "check") + "</form>";
      }
      if (L.step === "forgotask") {
        return back + '<h2 class="mt" style="font-size:24px">Ask the admin</h2><p class="muted small mt-sm">The admin sees your request next time they open School Assist and gives you a new password.</p>' +
          '<form data-submit="cloud-askadmin" class="mt">' +
          '<label class="field"><span>' + who + '</span><input class="input" name="login" value="' + esc(whoVal) + '" autocomplete="username" autocapitalize="' + (L.role === "teacher" ? "off" : "characters") + '" spellcheck="false"></label>' +
          '<label class="field"><span>Your name</span><input class="input" name="name" value="' + esc(L.name || "") + '" autocomplete="name"></label>' +
          '<label class="field"><span>Message <span class="muted">(optional)</span></span><input class="input" name="note" maxlength="300" placeholder="e.g. I\'ll be at home after 4"></label>' +
          msg + busy + submit("Send to the admin", "send") + "</form>";
      }
      if (L.step === "recovered") {
        return '<div style="text-align:center" class="mt"><div class="big-ico" style="margin:0 auto;color:var(--good)">' + I("checkCircle") + '</div><h2 class="mt-sm" style="font-size:22px">Your new password is set</h2>' +
          '<p class="muted mt-sm">Your old recovery code is used up. This is your new one:</p><div class="id-big">' + esc(L.newCode || "") + '</div><p class="small mt-sm"><b>Write it down</b> somewhere safe. You need it if you forget your password again.</p></div>' +
          msg + busy + '<button class="btn btn-primary btn-lg btn-block mt" data-act="cloud-recovered-signin"' + (L.busy ? " disabled" : "") + ">Sign in</button>";
      }
      if (L.step === "asked") {
        return '<div style="text-align:center" class="mt"><div class="big-ico" style="margin:0 auto">' + I("send") + '</div><h2 class="mt-sm" style="font-size:22px">The admin has been asked</h2>' +
          '<p class="muted mt-sm">When they give you a new password, sign in with it. Then go to Settings, change it to one you choose, and make a recovery code so this is quicker next time.</p></div>' +
          '<button class="btn btn-primary btn-lg btn-block mt" data-act="login-goto" data-step="' + (L.role === "teacher" ? "admin" : "student") + '">Back to sign in</button>';
      }
      if (L.step === "staffcode") return staffCodeStep(back, msg);
      if (L.step === "cloudstaffreg") {
        var offer = L.offered || [];
        return back + '<h2 class="mt" style="font-size:24px">Register as a teacher or admin</h2><p class="muted small mt-sm">Use the staff code your school gave you: the teacher code makes you a teacher, the admin code an admin. An admin approves you before you can sign in.</p>' +
          '<form data-submit="cloud-staff-register" class="mt">' +
          '<label class="field"><span>School staff code</span><input class="input" name="code" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="e.g. ' + esc(M.schoolAbbr(A.Theme.get().name)) + '-4K7-9QP"></label>' +
          '<label class="field"><span>Full name</span><input class="input" name="name" autocomplete="name" value="' + esc(L.name || "") + '"></label>' +
          '<label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username" value="' + esc(L.email || "") + '"></label>' +
          pw("pw", "Choose a password", "new-password", "At least 8 characters.") +
          '<label class="field"><span>Type it again</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>' +
          (offer.length ? '<div class="field mt"><span class="label">Subjects you teach</span><span class="hint">Teachers: choose your level, then tick your subjects. An admin can skip this.</span><div class="subj-picker mt-sm">' + A.subjectPicker(offer, {}) + "</div></div>" : "") +
          msg + busy + submit("Register", "key") + "</form>";
      }
      if (L.step === "setupAdmin") {
        return back + '<h2 class="mt" style="font-size:24px">Set up the admin</h2><p class="muted small mt-sm">This works once. Use the setup code you were given.</p>' +
          '<form data-submit="cloud-setup-admin" class="mt">' +
          '<label class="field"><span>Setup code</span><input class="input" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>' +
          '<label class="field"><span>Your name</span><input class="input" name="name" autocomplete="name"></label>' +
          '<label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="username"></label>' +
          pw("pw", "Password", "new-password", "At least 8 characters.") +
          '<label class="field"><span>Type it again</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>' +
          msg + busy + submit("Create the admin", "shield") + "</form>";
      }
      return null;
    },
    list: function () {
      var list = A.Store.filter("users", function (u) { return u.role === "teacher" && (!L.q || u.name.toLowerCase().indexOf(L.q.toLowerCase()) >= 0); }).sort(M.byName);
      return list.map(function (u) {
        return '<button data-act="login-user" data-id="' + u.id + '">' + A.avatar(u) + '<div><b>' + esc(u.name) + '</b><div class="tiny muted">' + (u.status === "pending" ? "Waiting for an admin to approve" : esc(u.subjects || u.title || "")) + "</div></div></button>";
      }).join("") || '<div class="empty">No match.</div>';
    },
    /** One example account for trying the student side; the other students are test data. */
    example: function () {
      if (!CFG.showExampleStudent || A.Cloud) return "";
      var u = A.Store.find("users", function (x) { return x.role === "student" && x.example; });
      if (!u) return "";
      var has = M.hasPassword(u.id);
      return '<div class="callout mt">' + I("info") + '<div class="grow"><b>' + (A.edition === "home" ? "Your student account" : "Example student account") + '</b><div class="small mt-sm">Name: <b>' + esc(u.name) + "</b><br>Student ID: <b>" + esc(u.studentNo) + "</b></div>" +
        '<div class="tiny muted mt-sm">' + (has ? "A password has already been created for this account. Sign in with it. An admin can see or reset it in Settings → People." : "First time: choose Set up your account, enter this name and ID, then create any password.") + "</div>" +
        '<button class="btn btn-sm mt-sm" data-act="login-example">Use this account</button></div></div>';
    },
  };
  function redrawLogin() {
    var box = document.getElementById("login-step");
    if (!box) return;
    box.innerHTML = Login.step();
    var s = document.getElementById("login-search");
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); return; }
    var inputs = box.querySelectorAll("form input:not([hidden])");
    for (var i = 0; i < inputs.length; i++) if (!inputs[i].value) { inputs[i].focus(); break; }
  }
  function finishSignIn(u) {
    if (A.LastUser) A.LastUser.set(u, { email: A.Cloud && u.role !== "student" ? L.email || null : null });
    M.signIn(u.id);
    if (A.Devices) A.Devices.signIn(u);
    A.loginNotice = "";
    L = blank();
    location.hash = A.home(u).slice(1);
    A.render();
  }
  A.act["login-role"] = function (el) {
    L.role = el.getAttribute("data-role");
    L.step = L.role === "teacher" ? (A.Cloud ? "admin" : "who") : "student";
    L.q = ""; L.msg = ""; redrawLogin();
  };
  A.act["login-goto"] = function (el) { L.step = el.getAttribute("data-step"); L.msg = ""; redrawLogin(); };
  A.act["login-back"] = function () {
    L.msg = ""; L.pin = "";
    L.step = L.step === "pin" ? "who" : L.step === "setpw" ? "setup" : L.step === "setup" || L.step === "register" ? "student" : L.step === "setupAdmin" ? "admin"
      : L.step === "forgot" ? (L.role === "teacher" ? "admin" : "student") : L.step === "forgotcode" || L.step === "forgotask" ? "forgot"
      : L.step === "staffreg" ? "who" : L.step === "cloudstaffreg" ? "admin" : L.step === "staffcode" ? (A.Cloud ? "admin" : "who")
      : L.step === "regsubjects" ? (boardsOf(L.offered || []).length > 1 ? "regboard" : "register") : L.step === "regboard" ? "register" : "role";
    redrawLogin();
  };
  A.act["login-search"] = function (el) {
    L.q = el.value;
    var list = document.getElementById("who-list");
    if (list) list.innerHTML = Login.list();
  };
  A.act["login-user"] = function (el) {
    var u = A.Store.get("users", el.getAttribute("data-id"));
    if (u && u.status === "pending") { L.msg = u.name + " is waiting for an admin to approve them."; redrawLogin(); return; }
    L.userId = el.getAttribute("data-id"); L.pin = ""; L.step = "pin"; L.msg = ""; redrawLogin();
  };
  // for js/staff.js: messages and results on the sign-in screen
  A.redrawLogin = function () { redrawLogin(); };
  A.loginMessage = function (m) { loginFail(new Error(m)); };
  A.loginDone = function (step, u) { L = blank(); L.step = step; L.staffUser = u; redrawLogin(); };
  /** Signed in as staff (PIN or online): the staff code first on a device a student used last. */
  function staffGate(u, done) {
    if (!A.LastUser || !A.LastUser.needsCode(u)) return done();
    L.codeFor = u; L.codeDone = done; L.step = "staffcode"; L.msg = ""; L.busy = false; redrawLogin();
  }
  A.act["staff-code-check"] = function (form) {
    var code = form.code.value, u = L.codeFor, last = A.LastUser.get() || {};
    if (!u || !L.codeDone) return;
    if (!code.trim()) return loginFail(new Error("Enter the code."));
    if (A.Cloud) {
      L.busy = "Checking the code…"; L.msg = ""; redrawLogin();
      return A.Cloud.rpc("staff_code_ok", { p_code: code, p_student: last.name || "" }).then(function (ok) {
        L.busy = false;
        if (!ok) { A.Cloud.signOut(); L.step = "admin"; throw new Error("That code isn't right, so you've been signed out. The admins have been told."); }
        var done = L.codeDone; L.codeDone = null; done();
      }).catch(loginFail);
    }
    var codes = M.staffCodes && M.staffCodes(), want = u.isAdmin ? "admin" : "teacher";
    var ok = !codes || M.codeRole(code) === want || (want === "teacher" && M.codeRole(code) === "admin");
    M.alertAdmins({ kind: "device", title: (ok ? "Signed in on a student's device: " : "Wrong staff code: ") + u.name,
      body: (ok ? u.name + " signed in" : "Someone tried to sign in as " + u.name) + " on a device last used by " + (last.name || "a student") + (last.studentNo ? " (" + last.studentNo + ")" : "") + "." });
    if (!ok) { L.step = "who"; return loginFail(new Error("That code isn't right. The admins have been told.")); }
    var done = L.codeDone; L.codeDone = null; done();
  };
  A.act["cloud-staffreg"] = function () {
    L.step = "cloudstaffreg"; L.msg = ""; L.busy = "Fetching the subjects…"; redrawLogin();
    A.Cloud.subjects().then(function (list) { L.offered = list || []; }, function () { L.offered = []; }).then(function () { L.busy = false; redrawLogin(); });
  };
  A.act["cloud-staff-register"] = function (form) {
    var f = UI.formData(form);
    L.name = f.name.trim(); L.email = f.email.trim();
    if (!f.code.trim()) return loginFail(new Error("Enter your school's staff code."));
    if (L.name.split(/\s+/).length < 2) return loginFail(new Error("Enter your full name."));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(L.email)) return loginFail(new Error("Enter your email address."));
    if (f.pw.length < 8) return loginFail(new Error("Use at least 8 characters for your password."));
    if (f.pw !== f.pw2) return loginFail(new Error("The two passwords are different. Type them again."));
    L.busy = "Registering…"; L.msg = ""; redrawLogin();
    A.Cloud.registerStaff({ code: f.code.trim(), name: L.name, email: L.email, password: f.pw, subjects: A.pickedSubjects ? A.pickedSubjects(form) : [] }).then(function (r) {
      L.busy = false; L.step = "staffasked"; L.staffUser = { name: L.name, isAdmin: r.role === "admin" }; redrawLogin();
    }).catch(loginFail);
  };
  A.act["login-key"] = function (el) { pinKey(el.getAttribute("data-k")); };
  A.act["login-setup"] = function () { L.step = "setup"; L.msg = ""; redrawLogin(); };
  A.act["login-example"] = function () {
    var u = A.Store.find("users", function (x) { return x.role === "student" && x.example; });
    if (!u) return;
    L.sid = u.studentNo; L.msg = "";
    if (M.hasPassword(u.id)) L.step = "student"; else { L.step = "setup"; L.name = u.name; }
    redrawLogin();
  };
  A.act["pw-toggle"] = function (el) {
    var inp = el.parentNode.querySelector("input"), show = inp.type === "password";
    inp.type = show ? "text" : "password";
    el.innerHTML = I(show ? "eyeOff" : "eye");
    el.setAttribute("aria-label", show ? "Hide password" : "Show password");
  };
  A.act["student-login"] = function (form) {
    var sid = form.sid.value.trim(), pw = form.pw.value, u = M.studentById(sid);
    L.sid = sid;
    if (!sid || !pw) { L.msg = "Enter your student ID and password."; redrawLogin(); return; }
    if (u && !M.hasPassword(u.id)) { L.msg = "This account has no password yet. Choose \u201cSet up your account\u201d below."; redrawLogin(); return; }
    var cred = u && M.credential(u.id);
    if (!u || !cred || cred.password !== pw) {
      L.msg = "Student ID or password is not right.";
      redrawLogin();
      var box = document.querySelector(".login-box"); if (box) { box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake"); }
      return;
    }
    finishSignIn(u);
  };
  /* ------------------------------------------------------ online sign-in */
  function loginFail(e) {
    L.busy = false; L.msg = (e && e.message) || String(e); redrawLogin();
    var box = document.querySelector(".login-box"); if (box) { box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake"); }
  }
  /** After the online sign-in: fetch this person's copy of everything, then open the app. */
  function cloudFinish(p) {
    if (p.status === "pending") { L = blank(); L.step = "pending"; redrawLogin(); return; }
    if (p.status !== "approved") { A.Cloud.signOut(); return loginFail(new Error("Your registration was not approved. Ask the admin.")); }
    var S = A.Store;
    L.busy = true; L.msg = ""; redrawLogin();
    (S.state.meta.cloudUser !== p.app_id ? S.wipe() : Promise.resolve()).then(function () {
      S.state.meta.cloudUser = p.app_id; // someone else signing in on this device starts from an empty copy
      return A.Sync.syncNow();
    }).then(function () {
      // the admin's very first sign-in puts the starting subjects online
      if (p.role === "admin" && !S.all("syllabi").length) { A.Seed.cloudStart(S); return A.Sync.syncNow(); }
    }).then(function () {
      var u = S.get("users", p.app_id);
      if (!u) throw new Error("Your account isn't ready yet. Try again in a minute.");
      L.busy = false;
      finishSignIn(u);
    }).catch(loginFail);
  }
  A.cloudSignedOut = function (msg) {
    if (!M.me()) return;
    A.Cloud.signOut(); M.signOut();
    var pops = document.getElementById("alert-root"); if (pops) pops.innerHTML = "";
    A.loginNotice = msg || "";
    L = blank(); lastPath = null; location.hash = ""; A.render();
  };
  A.act["cloud-student-login"] = function (form) {
    var sid = form.sid.value.trim(), pw = form.pw.value;
    L.sid = sid;
    if (!sid || !pw) return loginFail(new Error("Enter your student ID and password."));
    if (/@/.test(sid)) return loginFail(new Error("That looks like an email address. Admins use \u201cI'm the admin\u201d."));
    L.busy = true; L.msg = ""; redrawLogin();
    A.Cloud.signIn(sid, pw).then(function (p) {
      if (p.role !== "student") { A.Cloud.signOut(); throw new Error("Use \u201cI'm the admin\u201d to sign in as the admin."); }
      cloudFinish(p);
    }).catch(loginFail);
  };
  A.act["cloud-admin-login"] = function (form) {
    var email = form.email.value.trim(), pw = form.pw.value;
    L.email = email;
    if (!email || !pw) return loginFail(new Error("Enter your email and password."));
    L.busy = true; L.msg = ""; redrawLogin();
    A.Cloud.signIn(email, pw).then(function (p) {
      if (p.role === "student") { A.Cloud.signOut(); throw new Error("That is a student account. Use \u201cI'm a student\u201d."); }
      if (p.status !== "approved") return cloudFinish(p);
      staffGate({ id: p.app_id, name: p.name, role: "teacher", isAdmin: p.role === "admin" }, function () { cloudFinish(p); });
    }).catch(loginFail);
  };
  /** Exam boards on offer ("Cambridge IGCSE"), with how many subjects each has. */
  function boardsOf(list) {
    var by = {};
    list.forEach(function (x) { var b = M.boardName(x) || "Other"; by[b] = (by[b] || 0) + 1; });
    return Object.keys(by).sort().map(function (b) { return { name: b, count: by[b] }; });
  }
  A.act["cloud-register-next"] = function (form) {
    var name = form.querySelector("[name=name]").value.trim().replace(/\s+/g, " "), level = form.level.value, pw = form.pw.value;
    L.name = name; L.level = level;
    if (name.split(" ").length < 2) return loginFail(new Error("Enter your first name and surname."));
    if (pw.length < MINPW) return loginFail(new Error("Use at least " + MINPW + " characters for your password."));
    if (pw !== form.pw2.value) return loginFail(new Error("The two passwords are different. Type them again."));
    L.regPw = pw;
    L.busy = "Fetching the subjects…"; L.msg = ""; redrawLogin();
    A.Cloud.subjects().then(function (list) {
      L.busy = false; L.offered = list || [];
      var boards = boardsOf(L.offered);
      if (!boards.length) throw new Error("There are no subjects to choose yet. Ask the admin.");
      if (boards.length === 1) { L.board = boards[0].name; L.step = "regsubjects"; } else L.step = "regboard";
      redrawLogin();
    }).catch(loginFail);
  };
  A.act["reg-board"] = function (el) { L.board = el.getAttribute("data-b"); L.step = "regsubjects"; L.msg = ""; redrawLogin(); };
  A.act["cloud-register"] = function (form) {
    var ids = A.pickedSubjects(form), chosen = {};
    ids.forEach(function (id) { chosen[id] = 1; });
    L.chosen = chosen;
    if (!ids.length) return loginFail(new Error("Tick the subjects you are taking."));
    var pw = L.regPw;
    L.busy = "Registering…"; L.msg = ""; redrawLogin();
    A.Cloud.register(L.name, L.level, pw, ids).then(function (r) {
      L = blank(); L.step = "registered"; L.registered = r; L.pw = pw;
      redrawLogin();
    }).catch(loginFail);
  };
  A.act["cloud-registered-continue"] = function () {
    var r = L.registered || {}, pw = L.pw;
    L.busy = true; redrawLogin();
    A.Cloud.signIn(r.studentNo, pw).then(function (p) {
      L.pw = null;
      return A.Cloud.makeRecoveryCode().then(function (code) {
        L.busy = false; redrawLogin();
        A.showRecoveryCode(code, true, function () { cloudFinish(p); });
      }, function () { cloudFinish(p); });
    }).catch(loginFail);
  };
  /* ------------------------------------------------------ forgot the password */
  A.act["cloud-recover"] = function (form) {
    var f = UI.formData(form), login = f.login.trim();
    if (L.role === "teacher") L.email = login; else L.sid = login;
    if (!login || !f.code.trim()) return loginFail(new Error("Enter your " + (L.role === "teacher" ? "email address" : "student ID") + " and recovery code."));
    if (f.pw.length < MINPW) return loginFail(new Error("Use at least " + MINPW + " characters for your password."));
    if (f.pw !== f.pw2) return loginFail(new Error("The two passwords are different. Type them again."));
    L.busy = "Checking your recovery code…"; L.msg = ""; redrawLogin();
    A.Cloud.recover({ action: "reset", login: login, code: f.code, password: f.pw }).then(function (r) {
      L.busy = false; L.step = "recovered"; L.newCode = r.code; L.recLogin = login; L.pw = f.pw;
      redrawLogin();
    }).catch(loginFail);
  };
  A.act["cloud-recovered-signin"] = function () {
    var login = L.recLogin, pw = L.pw;
    L.busy = true; L.msg = ""; redrawLogin();
    A.Cloud.signIn(login, pw).then(function (p) { L.pw = null; L.newCode = null; cloudFinish(p); }).catch(loginFail);
  };
  A.act["cloud-askadmin"] = function (form) {
    var f = UI.formData(form), login = f.login.trim();
    if (L.role === "teacher") L.email = login; else L.sid = login;
    L.name = f.name.trim();
    if (!login) return loginFail(new Error("Enter your " + (L.role === "teacher" ? "email address" : "student ID") + "."));
    L.busy = "Sending…"; L.msg = ""; redrawLogin();
    A.Cloud.recover({ action: "ask", login: login, name: f.name, note: f.note }).then(function () {
      L.busy = false; L.step = "asked"; redrawLogin();
    }).catch(loginFail);
  };
  A.act["cloud-check"] = function () {
    L.busy = "Checking…"; L.msg = ""; redrawLogin();
    A.Cloud.refreshProfile().then(function (p) {
      if (p.status === "pending") { L.busy = false; L.msg = "Not approved yet. Try again a little later."; redrawLogin(); return; }
      cloudFinish(p);
    }).catch(loginFail);
  };
  A.act["cloud-pending-signout"] = function () { A.Cloud.signOut(); L = blank(); redrawLogin(); };
  A.act["cloud-setup-admin"] = function (form) {
    var f = UI.formData(form);
    if (!f.code.trim() || !f.name.trim() || !f.email.trim()) return loginFail(new Error("Fill in every box."));
    if (f.pw.length < 8) return loginFail(new Error("Use at least 8 characters for the admin password."));
    if (f.pw !== f.pw2) return loginFail(new Error("The two passwords are different. Type them again."));
    L.busy = "Creating the admin…"; L.msg = ""; redrawLogin();
    A.Cloud.setupAdmin({ code: f.code.trim(), name: f.name.trim(), email: f.email.trim(), password: f.pw })
      .then(function () { return A.Cloud.signIn(f.email.trim(), f.pw); })
      .then(cloudFinish).catch(loginFail);
  };

  A.act["student-setup"] = function (form) {
    var name = form.querySelector("[name=name]").value.trim(), sid = form.sid.value.trim(), u = M.studentById(sid);
    L.name = name; L.sid = sid;
    if (!name || !sid) L.msg = "Enter both your full name and your student ID.";
    else if (!u) L.msg = "We can't find that student ID. Check it with your class teacher.";
    else if (!M.sameName(u.name, name)) L.msg = "That name doesn't match this student ID. Type your full name as the school has it.";
    else if (M.hasPassword(u.id)) L.msg = "This account already has a password. Sign in with it, or ask an administrator to reset it.";
    else { L.userId = u.id; L.step = "setpw"; L.msg = ""; }
    redrawLogin();
  };
  A.act["student-setpw"] = function (form) {
    var pw = form.pw.value, pw2 = form.pw2.value;
    if (pw.length < MINPW) L.msg = "Use at least " + MINPW + " characters.";
    else if (pw !== pw2) L.msg = "The two passwords are different. Type them again.";
    else {
      var u = A.Store.get("users", L.userId);
      M.setPassword(u.id, pw, u.id);
      UI.toast("Password created. Welcome, " + A.firstName(u.name) + "!");
      finishSignIn(u);
      return;
    }
    redrawLogin();
  };
  function pinKey(k) {
    if (k === "C") L.pin = "";
    else if (k === "⌫") L.pin = L.pin.slice(0, -1);
    else if (L.pin.length < 4) L.pin += k;
    redrawLogin();
    if (L.pin.length === 4) {
      var u = A.Store.get("users", L.userId);
      if (u && u.status === "pending") { L.pin = ""; L.step = "who"; L.msg = u.name + " is waiting for an admin to approve them."; redrawLogin(); return; }
      if (u && String(u.pin || "") === L.pin) staffGate(u, function () { finishSignIn(u); });
      else {
        var d = document.getElementById("pin-dots");
        if (d) d.classList.add("shake");
        setTimeout(function () { L.pin = ""; redrawLogin(); }, 380);
      }
    }
  }
  document.addEventListener("keydown", function (e) {
    if (M.me() || L.step !== "pin") return;
    if (/^[0-9]$/.test(e.key)) pinKey(e.key);
    else if (e.key === "Backspace") pinKey("⌫");
  });

  A.act.signout = function () {
    if (A.Devices) A.Devices.signOut(M.me());
    if (A.Cloud) { if (A.Sync) A.Sync.syncNow().catch(function () {}); A.Cloud.signOut(); }
    var pops = document.getElementById("alert-root"); if (pops) pops.innerHTML = ""; // the next person must not see them
    M.signOut();
    lastPath = null;
    location.hash = "";
    A.render();
  };
  A.act["toggle-theme"] = function () {
    A.Theme.setMode(A.Theme.isDark() ? "light" : "dark");
    A.render();
  };

  /* -------------------------------------------------------- event wiring */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (el && A.act[el.getAttribute("data-act")]) {
      if (el.tagName === "A" || el.tagName === "BUTTON") e.preventDefault();
      A.act[el.getAttribute("data-act")](el, e);
      return;
    }
    var row = e.target.closest("[data-href]");
    if (row && !e.target.closest("a, button, input, select, textarea, label")) location.hash = row.getAttribute("data-href").replace(/^#/, "");
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-submit]");
    if (!f) return;
    e.preventDefault();
    var fn = A.act[f.getAttribute("data-submit")];
    if (fn) fn(f, e);
  });
  document.addEventListener("change", function (e) {
    var el = e.target.closest("[data-change]");
    if (el && A.act[el.getAttribute("data-change")]) A.act[el.getAttribute("data-change")](el, e);
  });
  document.addEventListener("input", function (e) {
    var el = e.target.closest("[data-input]");
    if (el && A.act[el.getAttribute("data-input")]) A.act[el.getAttribute("data-input")](el, e);
  });
  document.addEventListener("keydown", function (e) {
    var row = e.target.closest && e.target.closest("[data-href]");
    if (row && e.key === "Enter" && e.target === row) location.hash = row.getAttribute("data-href").replace(/^#/, "");
  });
  window.addEventListener("online", A.refreshStatus);
  window.addEventListener("offline", A.refreshStatus);
  window.addEventListener("hashchange", A.render);

  /** Re-render after data arrives from another device, unless the user is typing. */
  A.softRefresh = function () {
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { A.refreshStatus(); return; }
    if (document.querySelector(".modal-back") || document.querySelector(".exam-room") || document.querySelector("[data-no-refresh]")) { A.refreshStatus(); return; }
    A.render();
  };

  /* ------------------------------------------------------------------- boot */
  A.boot = function () {
    A.Theme.apply();
    // ask the browser to keep offline data even when the device is short of space
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    A.Store.init().then(function () {
      A.Theme.apply();
      if (A.Sync) A.Sync.init();
      if (A.Alerts) A.Alerts.start();
      A.render();
    }).catch(function (e) {
      console.error(e);
      document.getElementById("app").innerHTML = '<div class="content">' + UI.empty("alert", "The app could not start", String(e && e.message || e)) + "</div>";
    });
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("[sw]", e); });
    }
  };
})(window.App);
