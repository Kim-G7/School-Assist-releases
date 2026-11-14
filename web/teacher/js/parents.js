/* Parents (School Assist Premium, 2026-11-08).
 *
 * A school's admins make a link (Settings → Parents). A parent who opens it sees that school, not "join or set up a
 * school", and gives their own first and last name, their phone number and their child's student ID; the hub checks
 * them against the student's record (user.parents) and gives this phone a key that opens only that parent's children
 * (hub-parents.cjs).
 *
 * The parent's side keeps its own list on the phone (localStorage), one entry for each school whose link it has opened,
 * and never touches the school records of the rest of the app. A parent with children at several schools picks one, and
 * the name, badge, motto and colours follow.
 *
 * The admins' side: Parents in the menu (how many parents use School Assist, by form and then by class), and the
 * parents' names and phone numbers on each student, which are the school's check on who may see that student.
 */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  // a subject's name with its code, small beside it (js/catalogue.js, 2026-11-14)
  var subj = function (name, level, code) { return A.Subjects ? A.Subjects.label(name, level, code) : esc(name); };
  var KEY = "sca-parents-v1", BLANK = { name: "School Assist", shortName: "School Assist", motto: "", vision: "", mission: "", aims: "", logo: "", primary: "#1D4E89", secondary: "#E8A317" };
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], STATUS = { P: ["good", "Present"], L: ["warn", "Late"], A: ["bad", "Absent"], E: ["", "Excused"] };

  var Par = (A.Parents = {});
  var st = (function () { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } })();
  st.schools = st.schools || [];
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch (e) { st.schools.forEach(function (x) { if (x.school) x.school.logo = ""; }); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e2) { /* the phone is full */ } } // (the badges take the most room)
  }
  // V: this visit. pend: a school's link just opened; draft: its sign-up page; picked: a school chosen from the list
  var V = { pend: null, draft: null, picked: false, error: "", busy: false, brand: "", loading: false };

  /* a link opened: /?school=<code>&parent=<link> (/p/<code>/<link> leads here) */
  (function () {
    var q = location.search, link = /[?&]parent=([A-Za-z0-9]{16,40})/.exec(q), sid = /[?&]school=([a-z0-9-]{2,40})/.exec(q);
    if (!link || !sid || window.desktop) return;
    V.pend = { sid: sid[1], link: link[1] }; st.on = true; save();
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* an old browser */ }
  })();

  Par.active = function () { return !window.desktop && !!st.on; };
  var find = function (sid) { return st.schools.filter(function (x) { return x.sid === sid; })[0] || null; };
  var current = function () { return find(st.cur) || (st.schools.length === 1 ? st.schools[0] : null); };

  function call(base, what, body, key) {
    return fetch(base + "/api/parent/" + what, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, key ? { "X-SA-Key": key } : {}), body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          var e = new Error(j.error || "The school replied " + r.status + "."); e.info = j; e.status = r.status; throw e;
        });
      }, function () { var e = new Error("Can't reach the school just now. Check the internet and try again."); e.offline = true; throw e; });
  }
  /** Where the school's records are answered from (School Assist's own place for it, or a server of its own). */
  function hubOf(sid) {
    return fetch(location.origin + "/api/schools/" + sid).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "There is no school with that link."); return j.hub || location.origin + "/s/" + sid; });
    }, function () { throw new Error("Can't reach School Assist just now. Check the internet and try again."); });
  }
  function openLink() {
    var p = V.pend, had = find(p.sid);
    V.pend = null;
    if (had && had.key) { had.link = p.link; st.cur = p.sid; V.picked = true; save(); return A.render(); }
    V.busy = true; V.error = "";
    A.render();
    hubOf(p.sid).then(function (hub) {
      return call(hub, "school", { link: p.link }).then(function (j) { V.draft = { sid: p.sid, hub: hub, link: p.link, school: j.school }; });
    }).catch(function (e) { V.error = e.message; }).then(function () { V.busy = false; A.render(); });
  }

  /* -------------------------------------------------------------- the school on show */
  function brand(b, sid, link) {
    var id = (sid || "") + JSON.stringify(b).length;
    if (V.brand === id) return;
    V.brand = id;
    A.Theme.use(Object.assign({}, BLANK, b, { primary: b.primary || BLANK.primary, secondary: b.secondary || BLANK.secondary }));
    var man = document.querySelector('link[rel="manifest"]'), t = document.querySelector('meta[name="apple-mobile-web-app-title"]'), touch = document.querySelector('link[rel="apple-touch-icon"]');
    if (man && sid) man.setAttribute("href", "/s/" + sid + "/manifest.webmanifest?parent=" + encodeURIComponent(link || ""));
    if (t) t.setAttribute("content", String(b.shortName || b.name).slice(0, 30));
    if (touch && b.logo) touch.setAttribute("href", b.logo);
  }
  var badge = function (b) { return b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : A.Theme.crestSVG(Object.assign({}, BLANK, b, { primary: b.primary || BLANK.primary, secondary: b.secondary || BLANK.secondary })); };
  function about(b) {
    var aims = String(b.aims || "").split(/\n+/).map(function (x) { return x.replace(/^\s*([-•*]|\d+[.)])\s*/, "").trim(); }).filter(Boolean);
    return (b.vision ? '<div class="login-about"><h3>Our vision</h3><p>' + esc(b.vision) + "</p></div>" : "") +
      (b.mission ? '<div class="login-about"><h3>Our mission</h3><p>' + esc(b.mission) + "</p></div>" : "") +
      (aims.length ? '<div class="login-about"><h3>Our aims</h3><ol>' + aims.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ol></div>" : "");
  }

  /* -------------------------------------------------------------- the pages */
  Par.render = function (app) {
    if (V.pend) return openLink();
    if (V.busy) { brand(BLANK); app.innerHTML = '<div class="par-center"><div class="setup-spin" aria-hidden="true"></div><p class="muted mt">Opening the school…</p></div>'; return; }
    if (V.draft) { brand(V.draft.school, V.draft.sid, V.draft.link); app.innerHTML = signupPage(V.draft); return UI.hydrate(app); }
    if (st.schools.length > 1 && !V.picked) { brand(BLANK); app.innerHTML = schoolsPage(); return UI.hydrate(app); }
    var sc = current();
    if (!sc) { brand(BLANK); app.innerHTML = nonePage(); return UI.hydrate(app); }
    st.cur = sc.sid;
    brand(sc.school, sc.sid, sc.link);
    app.innerHTML = dashboard(sc);
    UI.hydrate(app);
    if (A.boxLists) A.boxLists(app);
    refresh(sc, false);
  };

  function signupPage(d) {
    var b = d.school;
    return '<div class="login par-login"><section class="login-brand"><div style="position:relative;z-index:1">' + A.Theme.logoHTML() + "<h1>" + esc(b.name) + '</h1><p class="motto">' + esc(b.motto) + "</p>" + about(b) + "</div></section>" +
      '<section class="login-panel"><div class="login-box"><h2>For parents</h2><p class="muted mt-sm">Follow your child at ' + esc(b.shortName || b.name) + ": attendance, subjects and teachers, marks, progress and the timetable.</p>" +
      (V.error ? '<p class="form-msg mt" role="alert">' + I("alert") + esc(V.error) + "</p>" : "") +
      '<form data-submit="par-signup" class="mt"><label class="field"><span>Your first name</span><input class="input" name="first" autocomplete="given-name" required></label>' +
      '<label class="field"><span>Your last name</span><input class="input" name="last" autocomplete="family-name" required></label>' +
      '<label class="field"><span>Your phone number</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" required><span class="hint">The number the school has for you.</span></label>' +
      '<label class="field"><span>Your child\'s student ID</span><input class="input" name="studentNo" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. ' + esc(b.abbr || "ABC") + '-FM1-001" required><span class="hint">The ID your child uses at school.</span></label>' +
      '<button class="btn btn-primary btn-lg btn-block mt" type="submit"' + (V.signing ? " disabled" : "") + ">" + I("right") + (V.signing ? "Checking…" : "Continue") + "</button></form>" +
      (A.Install ? A.Install.html("join") : "") + (st.schools.length ? '<p class="small mt"><button class="link" data-act="par-cancel">Back to your schools</button></p>' : "") + "</div></section></div>";
  }
  A.act["par-signup"] = function (form) {
    var d = V.draft, f = UI.formData(form);
    if (!d || V.signing) return;
    V.signing = true; V.error = ""; A.render();
    call(d.hub, "signup", { link: d.link, deviceId: "par-" + A.Devices.id(), label: A.Devices.detect ? deviceName() : "Parent's phone", first: f.first.trim(), last: f.last.trim(), phone: f.phone.trim(), studentNo: f.studentNo.trim() }).then(function (j) {
      st.schools = st.schools.filter(function (x) { return x.sid !== d.sid; }).concat([{ sid: d.sid, hub: d.hub, link: d.link, key: j.key, school: j.school, parent: j.parent, children: j.children, at: j.at }]);
      st.cur = d.sid; V.draft = null; V.picked = true; V.signing = false; save();
      location.hash = "#/p/progress";
      A.render();
    }).catch(function (e) { V.signing = false; V.error = e.message; A.render(); });
  };
  function deviceName() { var d = A.Devices.detect(); return [d.model || d.os, d.browser].filter(Boolean).join(" · ") || "Parent's phone"; }
  A.act["par-cancel"] = function () { V.draft = null; V.error = ""; A.render(); };

  function schoolsPage() {
    return '<div class="par-app"><main class="par-main"><h1 class="par-title">Your schools</h1><p class="muted mb">Choose a school to see your child there.</p><div class="card">' +
      st.schools.map(function (x) {
        var kids = (x.children || []).map(function (c) { return c.student.name; }).join(", ");
        return '<button class="list-row par-school" data-act="par-pick" data-sid="' + esc(x.sid) + '"><div class="logo par-badge">' + badge(x.school) + '</div><div class="grow"><div class="title">' + esc(x.school.name) + '</div><div class="meta"><span>' + esc(x.school.motto || "") + "</span></div>" +
          (kids ? '<div class="small muted">' + esc(kids) + "</div>" : "") + "</div>" + I("right") + "</button>";
      }).join("") + "</div>" + addSchool() + staffLink() + "</main></div>";
  }
  A.act["par-pick"] = function (el) { st.cur = el.getAttribute("data-sid"); V.picked = true; save(); location.hash = "#/p/progress"; A.render(); };
  function addSchool() {
    return '<form data-submit="par-add-link" class="card card-pad mt"><label class="field"><span>Got a link from another school?</span><input class="input" name="link" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste the link the school sent"></label><button class="btn mt-sm" type="submit">' + I("plus") + "Add the school</button></form>";
  }
  function staffLink() { return A.SchoolId && A.SchoolId.id && A.SchoolId.id() ? '<p class="small mt"><button class="link" data-act="par-staff">Open School Assist for staff and students</button></p>' : ""; }
  A.act["par-staff"] = function () { st.on = false; save(); V.brand = ""; A.Theme.use(null); location.hash = ""; A.render(); };
  A.act["par-add-link"] = function (form) {
    var t = String(form.link.value || "").trim(), m = /\/p\/([a-z0-9-]{2,40})\/([A-Za-z0-9]{16,40})/.exec(t) || (/[?&]school=([a-z0-9-]{2,40}).*[?&]parent=([A-Za-z0-9]{16,40})/.exec(t));
    if (!m) return UI.toast("That doesn't look like a school's link for parents.", "bad");
    document.querySelectorAll(".modal-back").forEach(function (x) { x.remove(); });
    V.pend = { sid: m[1], link: m[2] }; A.render();
  };
  function nonePage() {
    return '<div class="par-app"><main class="par-main"><div class="card card-pad"><h1 class="par-title">For parents</h1>' + (V.error ? '<p class="form-msg mt" role="alert">' + I("alert") + esc(V.error) + "</p>" : '<p class="muted mt-sm">Open the link your child\'s school sent you.</p>') + "</div>" + addSchool() + staffLink() + "</main></div>";
  }

  /* -------------------------------------------------------------- the child's pages */
  function route() {
    var h = String(location.hash || "").replace(/^#\/?/, ""), at = h.indexOf("?"), parts = (at < 0 ? h : h.slice(0, at)).split("/"), q = {};
    if (at >= 0) h.slice(at + 1).split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    return { tab: parts[0] === "p" && TABS[parts[1]] ? parts[1] : "progress", q: q };
  }
  var TABS = { progress: ["chart", "Progress"], attendance: ["calendar", "Attendance"], subjects: ["layers", "Subjects"], marks: ["edit", "Mark book"], timetable: ["grid", "Timetable"], fees: ["wallet", "Fees"] };
  var FEE_STATUS = { full: ["good", "Fully paid"], half: ["warn", "Part paid"], none: ["bad", "Not paid"], unset: ["", "No fee set yet"] };
  var monthName = function (m) { var t = Date.parse(m + "-15T12:00:00Z"); return isNaN(t) ? "" : new Date(t).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }); };
  var tone = function (p) { return p == null ? "" : p >= 60 ? "good" : p < 50 ? "bad" : ""; };
  var pctBadge = function (p) { return p == null ? '<span class="muted small">No marks yet</span>' : '<span class="badge ' + tone(p) + ' tnum">' + p + "%</span>"; };
  var dateText = function (d) { var t = Date.parse(d + "T12:00:00Z"); return isNaN(t) ? "" : A.fmtDate(t); };
  function dashboard(sc) {
    var r = route(), kids = sc.children || [], kid = kids.filter(function (c) { return c.student.id === r.q.c; })[0] || kids[0], b = sc.school;
    var head = '<header class="par-head"><div class="logo par-badge">' + badge(b) + '</div><div class="grow"><b>' + esc(b.name) + "</b>" + (b.motto ? "<span>" + esc(b.motto) + "</span>" : "") + "</div>" +
      '<button class="btn btn-icon par-menu" data-act="par-menu" aria-label="Your schools and settings">' + I("sliders") + "</button></header>";
    if (!kid) return '<div class="par-app">' + head + '<main class="par-main">' + note() + '<div class="card">' + UI.empty("users", "No child to show", "The school no longer lists your child. Ask the school office.") + "</div></main></div>";
    if (r.tab === "fees" && !kid.fees) r.tab = "progress"; // (a school with no fee records, or a hub from before this page)
    var c = kid.student.id, go = function (tab, more) { return "#/p/" + tab + "?c=" + encodeURIComponent(c) + (more || ""); };
    var who = kids.length > 1 ? '<div class="pill-tabs">' + kids.map(function (k) { return '<button class="' + (k === kid ? "on" : "") + '" data-act="goto" data-href="#/p/' + r.tab + "?c=" + encodeURIComponent(k.student.id) + '">' + esc(k.student.name.split(" ")[0]) + "</button>"; }).join("") + "</div>" : "";
    var tabs = '<nav class="par-tabs" aria-label="Your child">' + Object.keys(TABS).filter(function (t) { return t !== "fees" || kid.fees; }).map(function (t) { return '<a href="' + go(t) + '" class="' + (t === r.tab ? "on" : "") + '">' + I(TABS[t][0]) + "<span>" + TABS[t][1] + "</span></a>"; }).join("") + "</nav>";
    var title = '<div class="par-child"><h1 class="par-title">' + esc(kid.student.name) + '</h1><p class="muted small">' + esc([kid.student.studentNo, kid.student.className, "Term " + kid.term + " " + kid.year].filter(Boolean).join(" · ")) + "</p></div>";
    return '<div class="par-app">' + head + '<main class="par-main">' + note() + who + title + PAGES[r.tab](kid, r.q, go) + '<p class="tiny muted mt-lg">As the school had it ' + esc(A.relTime(sc.at)) + ".</p></main>" + tabs + "</div>";
  }
  var note = function () { return V.note ? '<div class="callout warn mb">' + I("wifiOff") + "<div>" + esc(V.note) + "</div></div>" : ""; };
  var section = function (title, sub, body) { return '<div class="card mt"><div class="card-head"><h3>' + esc(title) + "</h3>" + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</div>" + body + "</div>"; };
  var subjectRow = function (x) { return '<div class="list-row"><div class="grow"><div class="title">' + subj(x.subject, null) + "</div></div>" + pctBadge(x.average) + "</div>"; };

  var PAGES = {
    progress: function (k) {
      var p = k.progress, a = k.attendance.term;
      var html = '<div class="grid g-4">' + UI.stat("layers", p.syllabusPct == null ? "—" : p.syllabusPct + "%", "Syllabus covered", false, p.topicsDone + " of " + p.topicsTotal + " topics") +
        UI.stat("award", p.testsPassed + " of " + p.testsTaken, "Tests passed", true, p.passMark + "% or more is a pass") +
        UI.stat("chart", p.average == null ? "—" : p.average + "%", "Average mark", false, "Across the subjects with marks") +
        UI.stat("calendar", a.rate == null ? "—" : a.rate + "%", "Attendance", false, "This term") + "</div>";
      html += section("Strong subjects", "60% or more", p.strong.length ? p.strong.map(subjectRow).join("") : UI.empty("award", "None yet", "Subjects averaging 60% or more show here."));
      html += section("Needs extra effort", "below 50%", p.effort.length ? p.effort.map(subjectRow).join("") : UI.empty("checkCircle", "None", "No subject is averaging below 50%."));
      html += section("Syllabus covered", "by subject", p.syllabus.length ? p.syllabus.map(function (s) {
        return '<div class="list-row"><div class="grow"><div class="row spread small"><b>' + subj(s.subject, null) + '</b><span class="tnum">' + s.done + " of " + s.total + " topics · " + s.pct + "%</span></div>" + UI.bar(s.pct) + "</div></div>";
      }).join("") : UI.empty("layers", "No syllabus tracked yet", "The topics show here as the teachers cover them."));
      if (p.practice.taken) html += '<p class="small muted mt">Practice tests your child took in Exam mode: ' + p.practice.taken + (p.practice.average == null ? "" : ", averaging " + p.practice.average + "%") + ".</p>";
      return html;
    },
    attendance: function (k) {
      var t = k.attendance.term;
      var html = '<div class="grid g-4">' + UI.stat("checkCircle", t.present, "Present", true, "This term") + UI.stat("clock", t.late, "Late", false, "This term") + UI.stat("alert", t.absent, "Absent", false, "This term") + UI.stat("file", t.excused, "Excused", false, "This term") + "</div>";
      if (t.rate != null) html += '<p class="small muted mt">This term ' + t.rate + "% of school days attended; this year " + (k.attendance.year.rate == null ? "—" : k.attendance.year.rate + "%") + ".</p>";
      return html + section("Recent school days", "from the class register", k.attendance.recent.length ? k.attendance.recent.map(function (d) {
        var s = STATUS[d.status] || ["", d.status];
        return '<div class="list-row"><div class="grow">' + esc(dateText(d.date)) + '</div><span class="badge ' + s[0] + '">' + s[1] + "</span></div>";
      }).join("") : UI.empty("calendar", "No registers yet"));
    },
    subjects: function (k) {
      return (k.classTeacher ? '<p class="small mb">Class teacher: <b>' + esc(k.classTeacher) + "</b></p>" : "") + '<div class="card">' + (k.subjects.length ? k.subjects.map(function (x) {
        return '<div class="list-row"><div class="grow"><div class="title">' + subj(x.subject, null) + '</div><div class="meta"><span>' + esc(x.teacher || "Teacher not set yet") + "</span></div></div>" + pctBadge(x.average) + "</div>";
      }).join("") : UI.empty("layers", "No subjects yet")) + "</div>";
    },
    marks: function (k, q, go) {
      var terms = {}; k.marks.forEach(function (m) { if (m.year === k.year && m.term) terms[m.term] = 1; });
      var list = Object.keys(terms).map(Number).sort(), t = q.t === "all" ? "all" : Number(q.t) || (terms[k.term] ? k.term : "all");
      var shown = k.marks.filter(function (m) { return t === "all" || (m.year === k.year && m.term === t); });
      var extra = function (x) { return "&t=" + x + (q.s ? "&s=" + encodeURIComponent(q.s) : ""); };
      var pills = list.length > 1 ? '<div class="pill-tabs">' + list.map(function (n) { return '<button class="' + (n === t ? "on" : "") + '" data-act="goto" data-href="' + go("marks", extra(n)) + '">Term ' + n + "</button>"; }).join("") + '<button class="' + (t === "all" ? "on" : "") + '" data-act="goto" data-href="' + go("marks", extra("all")) + '">All</button></div>' : "";
      if (q.s) { // one subject's marks in full
        var mine = shown.filter(function (m) { return m.subject === q.s; });
        return '<p class="mb"><a class="link" href="' + go("marks", "&t=" + t) + '">' + I("left") + " Every subject</a></p><h2 class=\"par-sub\">" + esc(q.s) + "</h2>" + pills + '<div class="card">' + (mine.length ? mine.map(function (m) {
          return '<div class="list-row"><div class="grow"><div class="title">' + esc(m.title) + '</div><div class="meta">' + (m.kind !== m.title ? "<span>" + esc(m.kind) + "</span>" : "") + (m.date && m.kind !== "End of term" ? (m.kind !== m.title ? '<span class="sep"></span>' : "") + "<span>" + esc(dateText(m.date)) + "</span>" : "") + "</div>" + (m.comment ? '<div class="small mt-sm">' + esc(m.comment) + "</div>" : "") + '</div><span class="tnum small">' + m.mark + " / " + m.outOf + "</span>" + pctBadge(m.pct) + "</div>";
        }).join("") : UI.empty("edit", "No marks for this term")) + "</div>";
      }
      var names = {}; shown.forEach(function (m) { (names[m.subject] = names[m.subject] || []).push(m.pct); });
      var rows = Object.keys(names).sort().map(function (n) {
        var v = names[n], avg = Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length);
        return '<a class="list-row" href="' + go("marks", "&t=" + t + "&s=" + encodeURIComponent(n)) + '"><div class="grow"><div class="title">' + esc(n) + '</div><div class="meta"><span>' + v.length + " mark" + (v.length === 1 ? "" : "s") + "</span></div></div>" + pctBadge(avg) + I("right") + "</a>";
      }).join("");
      return pills + '<div class="card">' + (rows || UI.empty("edit", "No marks yet", "Marks show here as the teachers enter them.")) + "</div>";
    },
    timetable: function (k, q, go) {
      var ls = k.timetable.lessons, days = []; ls.forEach(function (l) { if (days.indexOf(l.day) < 0) days.push(l.day); });
      days.sort();
      if (!days.length) return '<div class="card">' + UI.empty("grid", "No timetable yet", "The school hasn't set this class's timetable.") + "</div>";
      // the whole week, day after day (2026-11-10: one day at a time before), however many lessons a day has
      var today = ((A.date().getDay() + 6) % 7) + 1;
      var mins = function (s) { return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)); }, hhmm = function (n) { return ("0" + Math.floor(n / 60)).slice(-2) + ":" + ("0" + (n % 60)).slice(-2); };
      return '<p class="small muted mb">The week at school. It is the same every week until the school changes it.</p>' + days.map(function (day) {
        var rows = ls.filter(function (l) { return l.day === day; }).map(function (l) { return { at: mins(l.start), to: mins(l.start) + l.mins, title: l.subject, who: l.teacher }; });
        k.timetable.breaks.forEach(function (b) { rows.push({ at: mins(b.start), to: mins(b.start) + Number(b.mins || 0), title: b.label, rest: true }); });
        rows.sort(function (a, b) { return a.at - b.at; });
        return '<h2 class="par-sub" id="par-day-' + day + '">' + DAYS[day - 1] + (day === today ? ' <span class="badge brand">Today</span>' : "") + '</h2><div class="card mb">' + rows.map(function (x) {
          return '<div class="tt-row' + (x.rest ? " par-rest" : "") + '"><div class="tt-time"><b>' + hhmm(x.at) + "</b><span>" + hhmm(x.to) + '</span></div><div class="grow"><b>' + esc(x.title) + "</b>" + (x.who ? '<div class="small muted">' + esc(x.who) + "</div>" : "") + "</div></div>";
        }).join("") + "</div>";
      }).join("");
    },
    fees: function (k, q, go) {
      var f = k.fees, cash = function (n) { return esc(f.currency) + " " + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US"); };
      var x = f.terms.filter(function (y) { return y.term === Number(q.t); })[0] || f.terms.filter(function (y) { return y.term === k.term; })[0] || f.terms[0], tone = FEE_STATUS[x.status];
      var open = f.terms.filter(function (y) { return y.due > 0 || y.paid > 0 || y.term === k.term; });
      var when = function (d) { return d ? "<span>" + esc(dateText(d)) + "</span>" : ""; };
      var slip = function (p) { return when(p.date) + (p.method ? '<span class="sep"></span><span>' + esc(p.method) + "</span>" : "") + (p.ref ? '<span class="sep"></span><span>' + esc(p.ref) + "</span>" : ""); };
      var html = (open.length > 1 ? '<div class="pill-tabs">' + open.map(function (y) { return '<button class="' + (y === x ? "on" : "") + '" data-act="goto" data-href="' + go("fees", "&t=" + y.term) + '">Term ' + y.term + "</button>"; }).join("") + "</div>" : "") +
        '<div class="row spread mb"><h2 class="par-sub" style="margin:0">School fees, Term ' + x.term + '</h2><span class="badge ' + tone[0] + '">' + tone[1] + "</span></div>" +
        '<div class="grid g-3">' + UI.stat("layers", cash(x.due), "Fee for the term") + UI.stat("checkCircle", cash(x.paid), "Paid", true) + UI.stat("alert", cash(x.balance), "Still to pay") + "</div>" + (x.due > 0 ? UI.bar(Math.min(100, Math.round(x.paid / x.due * 100))) : "");
      if (x.stages.length) html += section("Payment plan", x.stages.length + " stages", x.stages.map(function (s) {
        return '<div class="list-row"><div class="grow"><div class="title">Stage ' + s.n + '</div><div class="meta">' + (s.by ? "<span>By " + esc(dateText(s.by)) + "</span>" : "") + '</div></div><span class="tnum small">' + cash(s.got) + " of " + cash(s.amount) + '</span><span class="badge ' + (s.done ? "good" : s.late ? "bad" : "") + '">' + (s.done ? "Paid" : s.late ? "Late" : "To pay") + "</span></div>";
      }).join(""));
      html += section("Payments", "Term " + x.term, x.payments.length ? x.payments.map(function (p) {
        return '<div class="list-row"><div class="grow"><div class="title tnum">' + cash(p.amount) + '</div><div class="meta">' + slip(p) + "</div></div></div>";
      }).join("") : UI.empty("wallet", "No payments this term"));
      var b = f.transport;
      if (b) {
        var paidNow = b.months.filter(function (m) { return m.month === b.month; }).length > 0, n = b.months.length;
        var bus = (b.on && !paidNow ? '<div class="list-row"><div class="grow"><div class="title">' + esc(monthName(b.month)) + '</div><div class="meta">' + (b.monthly ? "<span>" + cash(b.monthly) + " a month</span>" : "") + '</div></div><span class="badge warn">Not paid yet</span></div>' : "") + b.months.map(function (m) {
          return '<div class="list-row"><div class="grow"><div class="title">' + esc(monthName(m.month)) + '</div><div class="meta">' + slip(m) + '</div></div><span class="tnum small">' + cash(m.amount) + '</span><span class="badge good">Paid</span></div>';
        }).join("");
        html += section("Bus fare", [b.route, n + " month" + (n === 1 ? "" : "s") + " paid this year"].filter(Boolean).join(" · "), bus || UI.empty("bus", "No bus fare paid this year"));
      }
      return html;
    },
  };

  /* -------------------------------------------------------------- keeping it up to date */
  function refresh(sc, force) {
    if (V.loading || (!force && A.now() - (V.asked || 0) < 60000 && V.askedFor === sc.sid)) return;
    V.loading = true; V.asked = A.now(); V.askedFor = sc.sid;
    call(sc.hub, "view", {}, sc.key).then(function (j) {
      V.loading = false;
      var was = JSON.stringify([sc.children, sc.school, V.note]);
      sc.children = j.children; sc.school = j.school; sc.parent = j.parent; sc.at = j.at; V.note = ""; save();
      if (was !== JSON.stringify([sc.children, sc.school, V.note])) quietly();
    }, function (e) {
      V.loading = false;
      var i = e.info || {};
      if (e.status === 410 && i.moved) { sc.hub = String(i.moved).replace(/\/+$/, ""); save(); V.asked = 0; return refresh(sc, true); } // the school moved to its own server
      if (i.removed || i.join || e.status === 401) { // no longer let in: back to the school's sign-up page
        st.schools = st.schools.filter(function (x) { return x !== sc; }); st.cur = ""; save();
        V.error = i.removed ? e.message : ""; V.pend = i.removed ? null : { sid: sc.sid, link: sc.link }; V.brand = "";
        if (i.removed) UI.toast(sc.school.name + ": " + e.message, "bad");
        return A.render();
      }
      var msg = e.offline || i.hubOffline ? "You're seeing what the school had when you last looked: it can't be reached just now." : e.message;
      if (msg !== V.note) { V.note = msg; quietly(); }
    });
  }
  function quietly() { if (!document.querySelector(".modal-back") && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) A.render(); }
  setInterval(function () { var sc = Par.active() && !document.hidden && !V.draft ? current() : null; if (sc) refresh(sc, true); }, 180000);
  document.addEventListener("visibilitychange", function () { var sc = Par.active() && !document.hidden && !V.draft ? current() : null; if (sc) refresh(sc, false); });

  /* -------------------------------------------------------------- the parent's menu */
  A.act["par-menu"] = function () {
    var sc = current();
    UI.modal({ title: "Your schools", size: "sm", foot: false, noFocus: true,
      body: (st.schools.length > 1 ? st.schools.map(function (x) { return '<button class="list-row par-school" data-act="par-pick" data-sid="' + esc(x.sid) + '"><div class="logo par-badge">' + badge(x.school) + '</div><div class="grow"><div class="title">' + esc(x.school.name) + "</div></div>" + (x === sc ? I("check") : I("right")) + "</button>"; }).join("") + '<div class="divider"></div>' : "") +
        '<form data-submit="par-add-child" class="mt-sm"><label class="field"><span>Another child at ' + esc((sc && (sc.school.shortName || sc.school.name)) || "this school") + '?</span><input class="input" name="studentNo" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Their student ID"></label><button class="btn mt-sm" type="submit">' + I("plus") + "Add the child</button></form>" +
        addSchool() + (A.Install ? A.Install.html("join") : "") +
        '<div class="row wrap mt"><button class="btn" data-act="toggle-theme">' + I(A.Theme.isDark() ? "sun" : "moon") + (A.Theme.isDark() ? "Light mode" : "Dark mode") + '</button><button class="btn btn-danger" data-act="par-leave">' + I("logout") + "Sign out of this school</button></div>" + staffLink(),
      onMount: function (el, close) { el.addEventListener("click", function (e) { if (e.target.closest('[data-act="par-pick"], [data-act="par-leave"], [data-act="par-staff"]')) setTimeout(close, 0); }); },
    });
  };
  A.act["par-add-child"] = function (form) {
    var sc = current(), n = String(form.studentNo.value || "").trim();
    if (!sc || !n) return;
    call(sc.hub, "child", { studentNo: n }, sc.key).then(function (j) {
      sc.children = j.children; sc.at = j.at; save();
      document.querySelectorAll(".modal-back").forEach(function (x) { x.remove(); });
      UI.toast("Added"); A.render();
    }).catch(function (e) { UI.toast(e.message, "bad"); });
  };
  A.act["par-leave"] = function () {
    var sc = current();
    if (!sc) return;
    UI.confirm("Sign out of " + sc.school.name + " on this phone?", { danger: true, ok: "Sign out" }).then(function (ok) {
      if (!ok) return;
      call(sc.hub, "leave", {}, sc.key).catch(function () { /* the phone forgets it anyway */ });
      st.schools = st.schools.filter(function (x) { return x !== sc; }); st.cur = ""; V.picked = false; V.brand = ""; V.note = ""; save();
      location.hash = ""; A.render();
    });
  };

  /* ================================================================ the school's side */
  /** School Assist Premium, turned on in Settings → Plan & licence; not the Teacher or Home editions. */
  Par.available = function () { return A.edition !== "teacher" && A.edition !== "home" && !A.Cloud && !!A.Licence && A.Licence.isOn("parent-monitor") && A.Sync.hubHasRules(); };
  Par.nav = function (me) { return me.isAdmin && Par.available() ? { href: "#/t/parents", icon: "users", label: "Parents", key: "parents" } : null; };

  /** The parents' names and phone numbers on a student's form: the school's check on who may see that student. */
  Par.fields = function (u) {
    if (!Par.available()) return "";
    var p = (u && u.parents) || [], f = function (i, part, label, extra) { return '<label class="field' + (extra || "") + '"><span>' + label + '</span><input class="input" name="par' + i + part + '" value="' + esc((p[i] || {})[part] || "") + '" autocomplete="off"' + (part === "phone" ? ' type="tel"' : "") + "></label>"; };
    return '<div class="field full"><span class="label">Parents or guardians</span><span class="hint">A parent joins the parents\' app with this name, this phone number and the student\'s ID, so write them as the parent will.</span></div>' +
      f(0, "first", "Parent's first name") + f(0, "last", "Parent's last name") + f(0, "phone", "Parent's phone", " full") + f(1, "first", "Second parent's first name") + f(1, "last", "Second parent's last name") + f(1, "phone", "Second parent's phone", " full");
  };
  Par.readFields = function (d, prefix) {
    return [0, 1].map(function (i) { return { first: String(d[(prefix || "") + "par" + i + "first"] || "").trim(), last: String(d[(prefix || "") + "par" + i + "last"] || "").trim(), phone: String(d[(prefix || "") + "par" + i + "phone"] || "").trim() }; }).filter(function (x) { return x.first && x.last; });
  };

  /** Who is where: the forms, each with its classes, its students and the parents using School Assist. */
  function census() {
    var home = {}, forms = {}, parents = S().filter("parents", function (p) { return !p.removedAt; });
    S().filter("classes", function (c) { return c.homeroom; }).forEach(function (c) { (c.studentIds || []).forEach(function (id) { home[id] = c; }); });
    var byStudent = {}, students = S().filter("users", function (u) { return u.role === "student" && !u.leftAt && u.status !== "pending" && u.status !== "declined"; });
    students.forEach(function (u) {
      var hr = home[u.id], level = u.level || (hr && hr.level) || "No form", key = hr ? hr.id : "x|" + level + "|" + (u.stream || ""), label = hr ? hr.name : (level + " " + (u.stream || "")).trim();
      var f = (forms[level] = forms[level] || { level: level, classes: {}, students: 0, parents: {}, reached: 0 });
      var c = (f.classes[key] = f.classes[key] || { key: key, label: label, level: level, students: [], parents: {}, reached: 0 });
      c.students.push(u); f.students++;
      byStudent[u.id] = { c: c, f: f };
    });
    var reached = {};
    parents.forEach(function (p) {
      (p.studentIds || []).forEach(function (id) {
        var at = byStudent[id];
        if (!at) return;
        at.c.parents[p.id] = 1; at.f.parents[p.id] = 1;
        if (!reached[id]) { reached[id] = 1; at.c.reached++; at.f.reached++; }
      });
    });
    var order = M.structure().levels || [], list = Object.keys(forms).map(function (k) { return forms[k]; }).sort(function (a, b) { var x = order.indexOf(a.level), y = order.indexOf(b.level); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.level.localeCompare(b.level); });
    list.forEach(function (f) { f.list = Object.keys(f.classes).map(function (k) { return f.classes[k]; }).sort(function (a, b) { return a.label.localeCompare(b.label); }); });
    return { forms: list, parents: parents, students: students, reached: Object.keys(reached).length, noName: students.filter(function (u) { return !(u.parents || []).some(function (x) { return x.first && x.last && x.phone; }); }).length };
  }
  var count = function (o) { return Object.keys(o).length; }, plural = function (n, s) { return n + " " + s + (n === 1 ? "" : "s"); }, use = function (n) { return plural(n, "parent") + (n === 1 ? " uses" : " use") + " School Assist"; };
  function row(href, title, meta, n, reached, total) {
    return '<a class="list-row" href="' + href + '"><div class="grow"><div class="title">' + esc(title) + '</div><div class="meta"><span>' + esc(meta) + "</span></div>" + UI.bar(total ? Math.round(reached / total * 100) : 0) + '</div><div class="par-num"><b class="tnum">' + n + "</b><span>" + (n === 1 ? "parent" : "parents") + "</span></div>" + I("right") + "</a>";
  }
  A.route("t/parents", function (p, q, me) {
    if (!me.isAdmin || !Par.available()) return { redirect: "#/t/home" };
    var c = census(), form = c.forms.filter(function (f) { return f.level === q.f; })[0], cls = null;
    c.forms.forEach(function (f) { f.list.forEach(function (k) { if (k.key === q.c) { cls = k; form = f; } }); });
    if (cls) return classPage(cls, form, q);
    if (form) return { title: form.level, crumbs: [{ label: "Parents", href: "#/t/parents" }, { label: form.level }],
      html: '<p class="muted mb">' + use(count(form.parents)) + " in " + esc(form.level) + "; " + form.reached + " of " + plural(form.students, "student") + ' have a parent on it.</p><div class="card">' + form.list.map(function (k) {
        return row("#/t/parents?c=" + encodeURIComponent(k.key), k.label, k.reached + " of " + plural(k.students.length, "student") + " have a parent on it", count(k.parents), k.reached, k.students.length);
      }).join("") + "</div>" };
    var html = '<div class="grid g-3">' + UI.stat("users", c.parents.length, "Parents using School Assist", true) + UI.stat("checkCircle", c.reached + " of " + c.students.length, "Students with a parent on it") + UI.stat("edit", c.noName, "Students with no parent's details", false, { note: "A parent can't join until the school has their name and phone number on the student." }) + "</div>";
    html += '<div class="row wrap spread mt mb"><h3>By form</h3><a class="btn btn-sm" href="#/t/settings?s=parents">' + I("link") + "The link for parents</a></div>";
    html += '<div class="card">' + (c.forms.length ? c.forms.map(function (f) { return row("#/t/parents?f=" + encodeURIComponent(f.level), f.level, f.reached + " of " + plural(f.students, "student") + " have a parent on it", count(f.parents), f.reached, f.students); }).join("") : UI.empty("users", "No students yet")) + "</div>";
    return { title: "Parents", html: html };
  }, { role: "teacher" });

  function classPage(k, form, q) {
    var href = "#/t/parents?c=" + encodeURIComponent(k.key), edit = q.e === "1", all = S().all("parents");
    var crumbs = [{ label: "Parents", href: "#/t/parents" }, { label: form.level, href: "#/t/parents?f=" + encodeURIComponent(form.level) }, { label: k.label }];
    var students = k.students.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (edit) {
      var box = function (u, i, part, hint) { var v = ((u.parents || [])[i] || {})[part] || ""; return '<input class="input sm"' + (part === "phone" ? ' type="tel"' : "") + ' name="' + u.id + "__par" + i + part + '" value="' + esc(v) + '" placeholder="' + hint + '" aria-label="' + esc(u.name) + ": " + hint + '" autocomplete="off">'; };
      return { title: k.label, crumbs: crumbs, html: '<p class="muted mb">Each parent joins with this name, this phone number and the student\'s ID, so write them as the parent will.</p><form data-submit="par-names" data-class="' + esc(k.key) + '"><div class="card table-wrap"><table class="table"><thead><tr><th>Student</th><th>Parent</th><th>Second parent</th></tr></thead><tbody>' +
        students.map(function (u) { return "<tr><td><b>" + esc(u.name) + '</b><div class="small muted">' + esc(u.studentNo || "") + '</div></td><td><div class="par-two">' + box(u, 0, "first", "First name") + box(u, 0, "last", "Last name") + box(u, 0, "phone", "Phone") + '</div></td><td><div class="par-two">' + box(u, 1, "first", "First name") + box(u, 1, "last", "Last name") + box(u, 1, "phone", "Phone") + "</div></td></tr>"; }).join("") +
        '</tbody></table></div><div class="row mt"><button class="btn btn-primary" type="submit">' + I("check") + 'Save</button><a class="btn" href="' + href + '">Cancel</a></div></form>' };
    }
    var html = '<div class="row wrap spread mb"><p class="muted">' + use(count(k.parents)) + "; " + k.reached + " of " + plural(k.students.length, "student") + ' have a parent on it.</p><a class="btn" href="' + href + '&e=1">' + I("edit") + "Parents' details</a></div>";
    html += '<div class="card table-wrap"><table class="table"><thead><tr><th>Student</th><th>Parents on the school\'s records</th><th>Using School Assist</th></tr></thead><tbody>' + students.map(function (u) {
      var on = all.filter(function (p) { return (p.studentIds || []).indexOf(u.id) >= 0; });
      return "<tr><td><b>" + esc(u.name) + '</b><div class="small muted">' + esc(u.studentNo || "") + "</div></td><td>" + ((u.parents || []).map(function (x) { return esc(x.first + " " + x.last) + " " + (x.phone ? '<span class="small muted tnum">' + esc(x.phone) + "</span>" : '<span class="badge warn">No phone yet</span>'); }).join("<br>") || '<span class="badge warn">No details yet</span>') + "</td><td>" +
        (on.map(function (p) {
          return '<div class="row wrap" style="gap:8px"><span>' + esc(p.first + " " + p.last) + '</span><span class="small muted">' + (p.removedAt ? "removed" : "seen " + esc(A.relTime(p.lastSeenAt || p.joinedAt))) + '</span><button class="btn btn-sm btn-ghost" data-act="par-remove" data-id="' + esc(p.id) + '">' + (p.removedAt ? "Let back in" : "Remove") + "</button></div>";
        }).join("") || '<span class="muted">Not yet</span>') + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    return { title: k.label, crumbs: crumbs, html: html };
  }
  A.act["par-names"] = function (form) {
    var d = UI.formData(form), n = 0;
    var ids = {}; Object.keys(d).forEach(function (name) { var at = name.indexOf("__par"); if (at > 0) ids[name.slice(0, at)] = 1; });
    Object.keys(ids).forEach(function (id) {
      var u = S().get("users", id), list = Par.readFields(d, id + "__");
      if (u && JSON.stringify(u.parents || []) !== JSON.stringify(list)) { S().patch("users", id, { parents: list }); n++; }
    });
    UI.toast(n ? "Saved " + plural(n, "student") : "Nothing changed");
    location.hash = "#/t/parents?c=" + encodeURIComponent(form.getAttribute("data-class"));
  };
  A.act["par-remove"] = function (el) {
    var p = S().get("parents", el.getAttribute("data-id"));
    if (!p) return;
    if (p.removedAt) { S().patch("parents", p.id, { removedAt: null }); return A.render(); }
    UI.confirm("Remove " + p.first + " " + p.last + "? They can no longer see their child in School Assist, and can't sign up again until you let them back in here.", { danger: true, ok: "Remove" }).then(function (ok) {
      if (ok) { S().patch("parents", p.id, { removedAt: A.now() }); A.render(); }
    });
  };

  /* Settings → Parents: the school's link */
  function linkUrl(r) {
    var m = S().state.meta, base = A.SchoolId && A.SchoolId.hubBase ? A.SchoolId.hubBase() : "";
    var sid = A.multiHost ? (base ? base.slice(3) : m.multi && m.multi.sid) : "";
    if (!r || !r.token) return "";
    if (sid) return location.origin + "/p/" + sid + "/" + r.token;
    return m.joinLink ? m.joinLink.replace("/join/", "/p/") + "/" + r.token : "";
  }
  var linkRec = function () { return S().get("settings", "parentlink"); };
  var online = function () { var m = S().state.meta; return !!(A.multiHost || m.joinLink); };
  Par.settings = function (me) {
    var r = linkRec(), link = linkUrl(r), c = census();
    var html = '<div class="card card-pad mb"><h3 class="row">' + I("link") + " The link for parents</h3>" +
      '<p class="muted small mt-sm" style="max-width:680px">Send parents this link. It opens ' + esc(A.Theme.get().name) + "'s own page, where each parent gives their first name, last name, phone number and their child's student ID. If they match the student's record, the parent sees only their own child.</p>";
    if (!online()) html += '<div class="callout warn mt">' + I("wifiOff") + '<div class="small">Parents reach the school over the internet. Turn on <b>Phones away from school</b> in Offline &amp; sync first, on the hub computer.</div></div>';
    else if (!r || !r.token) html += '<div class="row mt"><button class="btn btn-primary" data-act="par-make-link">' + I("link") + "Make the link</button></div>";
    else html += '<div class="row wrap top mt" style="gap:20px"><div class="invite-qr" id="par-qr"></div><div class="grow"><div class="label">Link</div><code class="pw-mask" style="display:inline-block;font-size:14px;word-break:break-all">' + esc(link) + "</code>" +
      '<div class="row wrap mt-sm"><button class="btn" data-act="par-copy">' + I("copy") + 'Copy the link</button><button class="btn" data-act="par-print">' + I("download") + 'Print it</button><button class="btn btn-ghost" data-act="par-new-link">' + I("refresh") + "Make a new link</button></div>" +
      '<p class="tiny muted mt-sm">Only people with this link can ask to join. A new link stops the old one for anyone who hasn\'t joined yet.</p></div></div>';
    html += "</div>";
    html += '<div class="callout"><div class="small">' + I("users") + " <b>" + use(c.parents.length) + ".</b> " + (c.noName ? "<b>" + plural(c.noName, "student") + "</b> " + (c.noName === 1 ? "has" : "have") + " no parent's name and phone number yet, so " + (c.noName === 1 ? "that student's parent" : "their parents") + " can't join: " : "") + '<a class="link" href="#/t/parents">see them by form and class</a>.</div></div>';
    return { html: html, mount: function () {
      var box = document.getElementById("par-qr"), u = linkUrl(linkRec());
      if (box && u && A.qrSvg) A.qrSvg(u).then(function (svg) { box.innerHTML = svg; }, function () { box.textContent = ""; });
      // a school's hub computer: School Assist's address for it comes from the hub
      if (!online() && A.Sync && A.Sync.hubMode()) fetch(A.Sync.config().url + "/api/ping").then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.join && /^https:\/\//.test(j.join) && /s=parents/.test(location.hash)) { S().state.meta.joinLink = j.join; S().flush(); A.render(); }
      }).catch(function () { /* the hub is away for now */ });
    } };
  };
  function newToken() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", b = crypto.getRandomValues(new Uint8Array(24)), s = "";
    for (var i = 0; i < b.length; i++) s += abc[b[i] % abc.length];
    return s;
  }
  function makeLink() { S().put("settings", { id: "parentlink", token: newToken(), at: A.now(), by: M.me().id }); if (A.Sync) A.Sync.maybe(); A.render(); }
  A.act["par-make-link"] = makeLink;
  A.act["par-new-link"] = function () {
    UI.confirm("Make a new link? The old link stops working for anyone who hasn't joined yet. Parents already on School Assist stay on it.", { ok: "Make a new link" }).then(function (ok) { if (ok) makeLink(); });
  };
  A.act["par-copy"] = function () {
    var link = linkUrl(linkRec()), done = function () { UI.toast("Link copied: send it on WhatsApp or by SMS"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { UI.toast(link); }); else UI.toast(link);
  };
  A.act["par-print"] = function () {
    var link = linkUrl(linkRec()), b = A.Theme.get();
    A.qrSvg(link).then(function (svg) {
      UI.printSheet({ title: "Parents of " + b.name, pageWidth: 794, css: "@page{size:A4;margin:16mm}#print-root .inv{width:178mm;margin:0 auto;text-align:center;font-family:'Segoe UI',Arial,sans-serif;color:#111}#print-root .inv .logo{width:28mm;height:28mm;margin:0 auto}#print-root .inv .logo img,#print-root .inv .logo svg{width:100%;height:100%}#print-root .inv .qr svg{width:80mm;height:80mm}#print-root .inv code{word-break:break-all}",
        html: '<section class="inv">' + A.Theme.logoHTML() + "<h1>" + esc(b.name) + "</h1><p>Parents: scan this with your phone's camera to follow your child's progress</p><div class=\"qr\">" + svg + "</div><p>or open <code>" + esc(link) + "</code></p><p>You will need your first name, your last name, the phone number the school has for you and your child's student ID.</p></section>" });
    }, function (e) { UI.toast(e.message, "bad"); });
  };
})(window.App);
