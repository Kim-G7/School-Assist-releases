/* Teacher views: dashboard, My Classes panel, class workspace (students, register,
   tasks, gradebook, notes, library, syllabus coverage), task detail, student profile. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function classCoverage(c) {
    var syl = M.syllabus(c.syllabusId);
    if (!syl || !c.studentIds.length) return 0;
    return Math.round(A.avg(c.studentIds.map(function (sid) { return M.syllabusProgress(sid, syl).pct; })));
  }
  function ownClass(id, me) {
    var c = M.cls(id);
    return c && c.teacherId === me.id ? c : null;
  }

  /* ================================================================= HOME */
  A.route("t/home", function (p, q, me) {
    var classes = M.myClasses(me), today = A.isoDate();
    var studentIds = uniq([].concat.apply([], classes.map(function (c) { return c.studentIds; })));
    var regDone = classes.filter(function (c) { return M.register(c.id, today); }).length;
    var toMark = [], activity = [], since = Date.now() - 7 * A.DAY;
    classes.forEach(function (c) {
      M.tasksForClass(c.id).forEach(function (t) {
        M.assignees(t).forEach(function (u) {
          var s = M.submission(t.id, u.id);
          if (!s) return;
          if (s.submittedAt && !M.effectiveScore(t, u.id)) toMark.push({ t: t, u: u, s: s, c: c });
          if (s.receivedAt > since) activity.push({ at: s.receivedAt, u: u, text: "received <b>" + esc(t.title) + "</b>", icon: "check" });
          if (s.submittedAt > since) activity.push({ at: s.submittedAt, u: u, text: (t.kind === "test" ? "completed" : "submitted") + " <b>" + esc(t.title) + "</b>", icon: "upload", href: "#/t/task/" + t.id });
        });
      });
    });
    var sylIds = uniq(classes.map(function (c) { return c.syllabusId; }));
    S().filter("attempts", function (a) { return a.status === "done" && a.finishedAt > since && studentIds.indexOf(a.studentId) >= 0 && sylIds.indexOf(a.syllabusId) >= 0 && !a.taskId; }).forEach(function (a) {
      activity.push({ at: a.finishedAt, u: M.user(a.studentId), text: "scored <b>" + a.result.pct + "%</b> in " + esc(a.title), icon: "target", href: "#/t/attempt/" + a.id });
    });
    // revised topics: one line per student and subject, not one per topic
    var revised = {};
    S().filter("progress", function (r) { return r.completedAt > since && studentIds.indexOf(r.studentId) >= 0; }).forEach(function (r) {
      var syl = M.syllabus(r.syllabusId), t = M.topic(syl, r.topicId);
      if (!t) return;
      var k = r.studentId + "|" + syl.id, g = revised[k] || (revised[k] = { at: 0, n: 0, last: t, syl: syl, sid: r.studentId });
      g.n++; if (r.completedAt > g.at) { g.at = r.completedAt; g.last = t; }
    });
    Object.keys(revised).forEach(function (k) {
      var g = revised[k];
      activity.push({ at: g.at, u: M.user(g.sid), icon: "checkCircle", text: g.n === 1 ? "revised <b>" + esc(g.last.title) + "</b> in " + esc(g.syl.subject) : "revised <b>" + g.n + " topics</b> in " + esc(g.syl.subject) });
    });
    // past papers sat
    S().filter("receipts", function (r) { return r.kind === "paper-done" && r.doneAt > since && studentIds.indexOf(r.studentId) >= 0; }).forEach(function (r) {
      var mat = S().get("materials", r.paperId), c2 = mat && M.cls(mat.classId), syl2 = mat && M.syllabus(mat.syllabusId || (c2 && c2.syllabusId));
      if (!mat) return;
      activity.push({ at: r.doneAt, u: M.user(r.studentId), icon: "award", text: "sat " + (syl2 ? esc(syl2.subject) + " " : "") + "<b>" + esc(mat.title) + "</b>" + (r.score != null && r.total ? " · " + Math.round(r.score / r.total * 100) + "%" : "") });
    });
    activity = activity.filter(function (x) { return x.u; }).sort(function (a, b) { return b.at - a.at; }).slice(0, 9);

    // students who may need support
    var support = [];
    classes.forEach(function (c) {
      M.studentsOf(c).forEach(function (u) {
        var st = M.studentStats(u.id, c), why = [];
        if (st.avgScore != null && st.avgScore < M.EXAM.passMark) why.push("average score " + st.avgScore + "%");
        if (st.attendance != null && st.attendance < 80) why.push("attendance " + st.attendance + "%");
        if (st.progress && st.progress.pct < 15) why.push("syllabus " + st.progress.pct + "% complete");
        if (why.length) support.push({ u: u, c: c, why: why });
      });
    });

    var noNotes = M.topicsWithoutNotes ? M.topicsWithoutNotes(me) : 0;
    var html = (A.pwRequestsHtml ? A.pwRequestsHtml(me) : "") + (A.recoveryNote ? A.recoveryNote() : "") + (A.subjectRequestsHtml ? A.subjectRequestsHtml(me, 5) : "") +
      (noNotes ? '<div class="callout mb">' + I("cap") + '<div class="grow"><b>' + noNotes + " topic" + (noNotes === 1 ? "" : "s") + " in your subjects " + (noNotes === 1 ? "has" : "have") + " no notes for the tutor yet.</b> Add notes for each topic, or read a whole textbook and the tutor finds its pages.</div>" +
        '<a class="btn btn-sm" href="#/t/tutor?f=missing">Tutor content ' + I("right") + "</a></div>" : "") +
      '<section class="hero"><h2>' + A.greeting() + ", " + esc(me.name) + "</h2><p>" + esc(A.fmtDateLong(Date.now())) + " · " + esc((window.SCHOOL_CONFIG || {}).term || "") + " · you teach " + classes.length + " classes and " + studentIds.length + " students</p>" +
      '<div class="hero-actions">' +
      '<button class="btn btn-accent" data-act="quick-register">' + I("calendar") + "Take register</button>" +
      '<button class="btn btn-light" data-act="new-task">' + I("plus") + "New task</button>" +
      '<button class="btn btn-light" data-act="new-note">' + I("send") + "Send a notification</button>" +
      '<button class="btn btn-light" data-act="add-material">' + I("upload") + "Upload material</button></div></section>" +

      '<div class="grid g-4 mt">' +
      UI.stat("users", classes.length, "My classes") +
      UI.stat("cap", studentIds.length, "Students") +
      UI.stat("pen", toMark.length, "Submissions to mark", true) +
      UI.stat("calendar", regDone + " / " + classes.length, "Registers taken today") + "</div>" +
      '<div class="mt">' + A.TT.todayCard(me) + "</div>" +

      '<div class="section-title"><h2>My classes</h2><span class="sub">' + classes.length + " class" + (classes.length === 1 ? "" : "es") + '</span><span class="grow"></span><a class="btn btn-sm" href="#/t/classes">' + I("users") + "All classes</a></div>" +
      (classes.length > 6 ? classFinder(classes) : '<div class="grid g-auto">' + classes.map(function (c) { return classCard(c, today); }).join("") + "</div>") +

      '<div class="grid g-main mt-lg">' +
      '<div class="card"><div class="card-head"><h3>Waiting to be marked</h3><span class="sub">' + toMark.length + "</span></div>" +
      (toMark.length ? toMark.slice(0, 7).map(function (x) {
        return '<a class="list-row" href="#/t/task/' + x.t.id + '">' + A.avatar(x.u, "sm") + '<div class="grow"><div class="title">' + esc(x.u.name) + '</div><div class="meta"><span>' + esc(x.t.title) + '</span><span class="sep"></span><span>' + esc(M.className(x.c)) + '</span><span class="sep"></span><span>' + A.relTime(x.s.submittedAt) + "</span></div></div>" + M.kindBadge(x.t.kind) + "</a>";
      }).join("") : UI.empty("checkCircle", "All caught up", "New submissions will appear here.")) + "</div>" +
      '<div class="card"><div class="card-head"><h3>Recent student activity</h3></div>' +
      (activity.length ? activity.map(function (x) {
        var inner = A.avatar(x.u, "sm") + '<div class="grow small"><b>' + esc(A.firstName(x.u.name)) + "</b> " + x.text + '<div class="tiny muted">' + A.relTime(x.at) + "</div></div>";
        return x.href ? '<a class="list-row" href="' + x.href + '">' + inner + "</a>" : '<div class="list-row">' + inner + "</div>";
      }).join("") : UI.empty("clock", "No activity this week")) + "</div></div>" +

      (support.length ? '<div class="card mt"><div class="card-head">' + I("alert") + "<h3>Students who may need support</h3><span class=\"sub\">based on scores, attendance and syllabus progress</span></div>" +
        support.slice(0, 6).map(function (x) {
          return '<a class="list-row" href="#/t/student/' + x.u.id + "/" + x.c.id + '">' + A.avatar(x.u, "sm") + '<div class="grow"><div class="title">' + esc(x.u.name) + '</div><div class="meta"><span>' + esc(M.className(x.c)) + "</span></div></div>" +
            x.why.map(function (w) { return '<span class="badge serious">' + esc(w) + "</span>"; }).join(" ") + "</a>";
        }).join("") + "</div>" : "");
    return { title: "Home", html: html };
  }, { role: "teacher" });

  function classCard(c, today) {
    var syl = M.syllabus(c.syllabusId), studs = M.studentsOf(c), cov = classCoverage(c), reg = M.register(c.id, today || A.isoDate());
    var faces = studs.slice(0, 5).map(function (u) { return A.avatar(u, "sm"); }).join("") + (studs.length > 5 ? '<span class="avatar sm more">+' + (studs.length - 5) + "</span>" : "");
    return '<a class="card class-card" href="#/t/class/' + c.id + '"><div class="band"></div><div class="body">' +
      '<div class="row spread"><span class="badge brand">' + esc(syl ? syl.board + " " + syl.level : "No syllabus") + '</span><span class="muted small">' + esc(c.room || "") + "</span></div>" +
      '<h3 class="mt-sm">' + esc(c.name) + '</h3><div class="subj">' + esc(c.subject) + "</div>" +
      '<div class="mt"><div class="row spread small"><span class="muted">Syllabus covered (class average)</span><b class="tnum">' + cov + "%</b></div>" + UI.bar(cov) + "</div></div>" +
      '<div class="foot"><div class="faces">' + faces + "</div><span>" + I("users") + studs.length + " students</span><span class=\"grow\"></span>" +
      (reg ? '<span class="badge good">' + I("check") + "Register taken</span>" : '<span class="badge warn">' + I("calendar") + "Register due</span>") + "</div></a>";
  }

  /* ============================================================ MY CLASSES */
  /** Many classes (every subject, IGCSE and A level): search them, or jump to a group. */
  function classFinder(classes) {
    var counts = {};
    classes.forEach(function (c) { var g = M.groupOf ? M.groupOf(M.syllabus(c.syllabusId)) : "other"; counts[g] = (counts[g] || 0) + 1; });
    return '<div class="card card-pad"><form class="row wrap" data-submit="class-find" style="gap:10px"><input class="input grow" name="q" placeholder="Find a class or subject" aria-label="Find a class or subject" style="min-width:200px">' +
      '<button class="btn" type="submit">' + I("search") + "Find</button></form>" +
      '<div class="row wrap mt-sm" style="gap:8px">' + (M.SUBJECT_GROUPS || []).filter(function (g) { return counts[g.id]; }).map(function (g) {
        return '<a class="btn btn-sm" href="#/t/classes?g=' + g.id + '">' + I(g.icon) + esc(g.label) + ' <span class="muted">' + counts[g.id] + "</span></a>";
      }).join("") + "</div></div>";
  }
  A.act["class-find"] = function (form) { location.hash = "#/t/classes?q=" + encodeURIComponent(form.q.value.trim()); };
  function classRow(c) {
    var syl = M.syllabus(c.syllabusId), studs = M.studentsOf(c), cov = classCoverage(c);
    var waiting = M.subjectRequests ? S().filter("enrolments", function (e) { return (e.status === "pending" || e.status === "drop_pending") && e.syllabusId === c.syllabusId; }).length : 0;
    return '<a class="list-row class-row" href="#/t/class/' + c.id + '" data-find="' + esc((c.subject + " " + c.name + " " + (syl ? syl.code + " " + syl.board + " " + syl.level : "")).toLowerCase()) + '">' +
      '<div class="grow"><div class="title">' + esc(c.subject) + (syl && syl.code ? ' <span class="muted small">' + esc(syl.code) + "</span>" : "") + "</div>" +
      '<div class="meta"><span>' + esc(c.name) + "</span><span class=\"sep\"></span><span>" + studs.length + " student" + (studs.length === 1 ? "" : "s") + "</span>" +
      (waiting ? '<span class="sep"></span><span class="warn-text">' + waiting + " waiting for approval</span>" : "") + "</div></div>" +
      '<div class="class-cov hide-sm"><div class="row spread tiny muted"><span>Syllabus covered</span><b class="tnum">' + cov + "%</b></div>" + UI.bar(cov) + "</div>" + I("right") + "</a>";
  }
  A.act["class-filter"] = function (el) {
    var f = el.value.trim().toLowerCase();
    document.querySelectorAll(".class-group").forEach(function (g) {
      var any = false;
      g.querySelectorAll(".class-row").forEach(function (r) { var on = !f || r.getAttribute("data-find").indexOf(f) >= 0; r.classList.toggle("hidden", !on); if (on) any = true; });
      g.classList.toggle("hidden", !any);
      if (f && any) g.open = true;
    });
  };

  A.route("t/classes", function (p, q, me) {
    var classes = M.myClasses(me), only = q.g || "", find = String(q.q || "").toLowerCase();
    var html = '<div class="row spread wrap mb"><p class="muted">Every class you teach. Open one for its students, register, tasks and progress.</p>' +
      '<button class="btn btn-primary" data-act="new-class">' + I("plus") + "New class</button></div>" + A.subjectScopeBar(me);
    if (!classes.length) {
      html += '<div class="card">' + UI.empty("users", "No classes yet", "Create your first class, choose its syllabus and add students.", '<button class="btn btn-primary" data-act="new-class">' + I("plus") + "New class</button>") + "</div>";
      return { title: "My classes", html: html };
    }
    // board and level first (Cambridge IGCSE, Cambridge A Level…), then the subject groups
    var levels = {};
    classes.forEach(function (c) { var syl = M.syllabus(c.syllabusId), k = syl ? M.boardName(syl) : "Other"; (levels[k] = levels[k] || []).push(c); });
    var levelNames = Object.keys(levels).sort();
    html += '<div class="row wrap mb" style="gap:10px"><input class="input grow" placeholder="Search subjects, codes or classes" value="' + esc(q.q || "") + '" data-input="class-filter" aria-label="Search classes" style="max-width:420px">' +
      '<div class="pill-tabs sm" style="margin:0"><a class="btn btn-sm' + (!only ? " btn-primary" : "") + '" href="#/t/classes">All</a>' +
      (M.SUBJECT_GROUPS || []).filter(function (g) { return classes.some(function (c) { return M.groupOf(M.syllabus(c.syllabusId)) === g.id; }); }).map(function (g) {
        return '<a class="btn btn-sm' + (only === g.id ? " btn-primary" : "") + '" href="#/t/classes?g=' + g.id + '">' + esc(g.label) + "</a>";
      }).join("") + "</div></div>";
    levelNames.forEach(function (lv) {
      if (levelNames.length > 1) html += '<div class="section-title"><h2>' + esc(lv) + "</h2></div>";
      var groups = M.SUBJECT_GROUPS.map(function (g) {
        return { g: g, items: levels[lv].filter(function (c) { return M.groupOf(M.syllabus(c.syllabusId)) === g.id; }).sort(function (a, b) { return a.subject.localeCompare(b.subject); }) };
      }).filter(function (x) { return x.items.length && (!only || x.g.id === only); });
      html += groups.map(function (x) {
        return '<details class="card class-group mb"' + (only || groups.length <= 2 || find ? " open" : x === groups[0] ? " open" : "") + '><summary class="card-head">' + I(x.g.icon) + "<h3>" + esc(x.g.label) + '</h3><span class="sub">' + x.items.length + " class" + (x.items.length === 1 ? "" : "es") + "</span></summary>" +
          x.items.map(classRow).join("") + "</details>";
      }).join("");
    });
    return { title: "My classes", html: html, mount: function () { var inp = document.querySelector("[data-input=class-filter]"); if (inp && inp.value) A.act["class-filter"](inp); } };
  }, { role: "teacher" });

  /* the old per-class student tables, kept for small schools: shown on the class pages instead */
  A.route("t/classes-all", function (p, q, me) {
    var classes = M.myClasses(me), html = "";
    classes.forEach(function (c) {
      var studs = M.studentsOf(c), syl = M.syllabus(c.syllabusId);
      html += '<div class="section-title"><h2>' + esc(M.className(c)) + '</h2><span class="sub">' + studs.length + " students · " + esc(M.syllabusTitle(syl)) + '</span><span class="grow"></span><a class="btn btn-sm" href="#/t/class/' + c.id + '">Open class ' + I("right") + "</a></div>" +
        '<div class="card table-wrap"><table class="table"><thead><tr><th>Student</th><th>Student ID</th><th>Attendance</th><th>Syllabus completed</th><th class="num">Avg score</th></tr></thead><tbody>' +
        studs.map(function (u) {
          var st = M.studentStats(u.id, c);
          return '<tr class="click" data-href="#/t/student/' + u.id + "/" + c.id + '" tabindex="0"><td><div class="row">' + A.avatar(u, "sm") + "<b>" + esc(u.name) + '</b></div></td><td class="muted">' + esc(u.studentNo || "") + "</td><td>" + UI.pctCell(st.attendance, M.tone(st.attendance == null ? null : st.attendance >= 90 ? 90 : st.attendance >= 80 ? 60 : 20)) + "</td><td>" + UI.pctCell(st.progress ? st.progress.pct : null) + '</td><td class="num">' + UI.scoreBadge(st.avgScore) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    });
    return { title: "My classes", html: html };
  }, { role: "teacher" });

  /* ========================================================= CLASS PAGE */
  var TABS = [
    ["students", "Students", "users"], ["register", "Register", "calendar"], ["tasks", "Tasks", "tasks"], ["gradebook", "Gradebook", "award"],
    ["notes", "Notifications", "bell"], ["library", "Library", "library"], ["syllabus", "Syllabus & terms", "layers"],
  ];
  A.route("t/class/:id/:tab?", function (p, q, me) {
    var c = ownClass(p.id, me);
    if (!c) return { redirect: "#/t/classes" };
    var tab = p.tab || "students", syl = M.syllabus(c.syllabusId);
    var counts = { students: c.studentIds.length, tasks: M.tasksForClass(c.id).length, library: S().filter("materials", function (m) { return m.classId === c.id; }).length };
    var head = '<div class="card card-pad mb"><div class="row wrap top"><div class="grow"><div class="row wrap"><span class="badge brand">' + esc(syl ? syl.board + " " + syl.level + " " + (syl.code || "") : "No syllabus") + "</span>" + (c.room ? '<span class="badge">' + esc(c.room) + "</span>" : "") + '<span class="badge accent">' + I("unlock") + esc(M.termName(c.currentTerm || 1)) + " open</span>" + (c.sequential ? '<span class="badge">' + I("list") + "Topics in order</span>" : "") + "</div>" +
      '<h2 class="mt-sm" style="font-size:22px">' + esc(c.name) + " · " + esc(c.subject) + '</h2><p class="muted small">' + c.studentIds.length + " students · class average " + classCoverage(c) + "% of the syllabus completed</p></div>" +
      '<div class="row wrap"><button class="btn" data-act="new-note" data-class="' + c.id + '">' + I("send") + "Notify</button>" +
      '<button class="btn" data-act="edit-class" data-id="' + c.id + '">' + I("edit") + "Edit</button>" +
      '<button class="btn btn-primary" data-act="new-task" data-class="' + c.id + '">' + I("plus") + "New task</button></div></div></div>";
    var tabs = UI.tabs(TABS.map(function (t) { return { href: "#/t/class/" + c.id + "/" + t[0], label: t[1], icon: t[2], on: t[0] === tab, n: counts[t[0]] }; }));
    var body = (CLASS_TABS[tab] || CLASS_TABS.students)(c, q, me);
    return {
      title: c.name + " · " + c.subject,
      crumbs: [{ label: "My classes", href: "#/t/classes" }, { label: c.name + " · " + c.subject }],
      html: head + tabs + (body.html || body),
      mount: body.mount,
    };
  }, { role: "teacher" });

  var CLASS_TABS = {};

  /* ---- students */
  CLASS_TABS.students = function (c) {
    var studs = M.studentsOf(c);
    if (!studs.length) return '<div class="card">' + UI.empty("users", "No students in this class yet", "", '<button class="btn btn-primary" data-act="add-students" data-class="' + c.id + '">' + I("plus") + "Add students</button>") + "</div>";
    return '<div class="row spread wrap mb"><p class="muted small">Tap a student to see everything they are learning and how they are doing.</p><button class="btn" data-act="add-students" data-class="' + c.id + '">' + I("plus") + "Add students</button></div>" +
      '<div class="card table-wrap"><table class="table"><thead><tr><th>Student</th><th>Attendance</th><th>Tasks received</th><th>Syllabus completed</th><th class="num">Avg score</th><th>Last studied</th></tr></thead><tbody>' +
      studs.map(function (u) {
        var st = M.studentStats(u.id, c);
        var att = st.attendance, attTone = att == null ? "" : att >= 90 ? "good" : att >= 80 ? "warn" : "bad";
        return '<tr class="click" data-href="#/t/student/' + u.id + "/" + c.id + '" tabindex="0"><td><div class="row">' + A.avatar(u, "sm") + "<div><b>" + esc(u.name) + '</b><div class="tiny muted">' + esc(u.studentNo || "") + "</div></div></div></td>" +
          "<td>" + UI.pctCell(att, attTone) + '</td><td class="tnum">' + st.received + " / " + st.tasks + "</td>" +
          "<td>" + UI.pctCell(st.progress ? st.progress.pct : null, "", st.progress ? st.progress.done + " of " + st.progress.total + " topics completed, " + st.progress.prog + " in progress" : "") + "</td>" +
          '<td class="num">' + UI.scoreBadge(st.avgScore) + '</td><td class="muted small nowrap">' + (st.lastActive ? A.relTime(st.lastActive) : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  };

  /* ---- register */
  CLASS_TABS.register = function (c, q) {
    var date = q.d || A.isoDate(), reg = M.register(c.id, date), marks = (reg && reg.marks) || {};
    var studs = M.studentsOf(c), recent = M.recentRegisters(c.id, 10).reverse();
    var html = '<div class="grid g-main"><div class="card"><div class="card-head"><h3>Register</h3><span class="grow"></span>' +
      '<input type="date" class="input sm" style="width:auto" value="' + date + '" data-change="reg-date" data-class="' + c.id + '" aria-label="Register date">' +
      "</div>" +
      '<div class="card-body row wrap spread" style="border-bottom:1px solid var(--border)"><div class="small" id="reg-summary"></div><div class="row"><button class="btn btn-sm" data-act="reg-all">' + I("check") + "Mark all present</button></div></div>" +
      '<div id="reg-list">' + studs.map(function (u) {
        var v = marks[u.id] || "";
        return '<div class="list-row" data-sid="' + u.id + '">' + A.avatar(u, "sm") + '<div class="grow"><div class="title">' + esc(u.name) + '</div><div class="meta">' + esc(u.studentNo || "") + "</div></div>" +
          '<div class="reg-btns" role="radiogroup" aria-label="' + esc(u.name) + '">' + ["P", "L", "A", "E"].map(function (k) {
            return '<button type="button" class="' + k + (v === k ? " on" : "") + '" data-act="reg-mark" data-k="' + k + '" data-tip="' + M.ATT[k] + '" aria-label="' + M.ATT[k] + '">' + k + "</button>";
          }).join("") + "</div></div>";
      }).join("") + "</div>" +
      '<div class="card-foot row spread"><span class="small muted">' + (reg ? "Last saved " + A.fmtDateTime(reg.updatedAt) : "Not taken yet for this date") + '</span><button class="btn btn-primary" data-act="reg-save" data-class="' + c.id + '" data-date="' + date + '">' + I("check") + "Save register</button></div></div>" +

      '<div class="card"><div class="card-head"><h3>Attendance rate</h3><span class="sub">present or late</span></div><div class="card-body">' +
      UI.hbars(studs.map(function (u) { var r = M.attendanceRate(u.id, c.id); return r == null ? null : { label: u.name, pct: r, tone: r >= 90 ? "good" : r >= 80 ? "warn" : "bad", href: "#/t/student/" + u.id + "/" + c.id }; }).filter(Boolean).sort(function (a, b) { return a.pct - b.pct; }), { emptyTitle: "No registers yet" }) +
      "</div></div></div>";

    if (recent.length) {
      html += '<div class="card mt"><div class="card-head"><h3>Last ' + recent.length + ' registers</h3><span class="grow"></span><div class="legend"><span><i class="att att-P" style="width:14px;height:14px"></i>Present</span><span><i class="att att-L" style="width:14px;height:14px"></i>Late</span><span><i class="att att-A" style="width:14px;height:14px"></i>Absent</span><span><i class="att att-E" style="width:14px;height:14px"></i>Excused</span></div></div>' +
        '<div class="card-body table-wrap"><table class="heat"><thead><tr><th></th>' + recent.map(function (r) {
          var d = new Date(r.date + "T12:00:00");
          return '<th><a href="#/t/class/' + c.id + "/register?d=" + r.date + '">' + ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()] + " " + d.getDate() + "</a></th>";
        }).join("") + "</tr></thead><tbody>" +
        studs.map(function (u) {
          return "<tr><th>" + esc(u.name) + "</th>" + recent.map(function (r) {
            var v = r.marks[u.id];
            return '<td><span class="att att-' + (v || "x") + '" data-tip="' + esc(u.name + " · " + r.date + ": " + (M.ATT[v] || "not marked")) + '">' + (v || "·") + "</span></td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div></div>";
    }
    return {
      html: html,
      mount: function (root) { regSummary(root); },
    };
  };
  function regSummary(root) {
    var el = root.querySelector("#reg-summary"); if (!el) return;
    var n = { P: 0, L: 0, A: 0, E: 0 }, total = 0, unmarked = 0;
    root.querySelectorAll("#reg-list .list-row").forEach(function (row) {
      total++;
      var on = row.querySelector(".reg-btns .on");
      if (on) n[on.getAttribute("data-k")]++; else unmarked++;
    });
    el.innerHTML = '<span class="badge good">' + n.P + " present</span> <span class=\"badge warn\">" + n.L + " late</span> <span class=\"badge bad\">" + n.A + " absent</span> <span class=\"badge\">" + n.E + " excused</span>" + (unmarked ? ' <span class="muted">· ' + unmarked + " not marked</span>" : "");
  }
  A.act["reg-mark"] = function (el) {
    var row = el.closest(".reg-btns");
    row.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b === el); });
    regSummary(document);
  };
  A.act["reg-all"] = function () {
    document.querySelectorAll("#reg-list .reg-btns").forEach(function (row) {
      if (!row.querySelector(".on")) row.querySelector(".P").classList.add("on");
    });
    regSummary(document);
  };
  A.act["reg-save"] = function (el) {
    var marks = {}, missing = 0;
    document.querySelectorAll("#reg-list .list-row").forEach(function (row) {
      var on = row.querySelector(".reg-btns .on");
      if (on) marks[row.getAttribute("data-sid")] = on.getAttribute("data-k"); else missing++;
    });
    var save = function () {
      M.saveRegister(el.getAttribute("data-class"), el.getAttribute("data-date"), marks);
      UI.toast("Register saved");
      A.render();
    };
    if (missing) UI.confirm(missing + " student(s) are not marked. Save anyway?", { ok: "Save register" }).then(function (ok) { if (ok) save(); });
    else save();
  };
  A.act["reg-date"] = function (el) { location.hash = "#/t/class/" + el.getAttribute("data-class") + "/register?d=" + el.value; };
  A.act["quick-register"] = function () {
    var me = M.me(), classes = M.myClasses(me);
    if (classes.length === 1) { location.hash = "#/t/class/" + classes[0].id + "/register"; return; }
    UI.modal({
      title: "Take register", sub: "Choose a class", foot: false, flush: true,
      body: classes.map(function (c) {
        var done = M.register(c.id, A.isoDate());
        return '<a class="list-row" href="#/t/class/' + c.id + '/register"><div class="grow"><div class="title">' + esc(M.className(c)) + '</div><div class="meta">' + c.studentIds.length + " students</div></div>" + (done ? '<span class="badge good">' + I("check") + "Taken</span>" : '<span class="badge warn">Due</span>') + I("right") + "</a>";
      }).join(""),
    });
  };

  /* ---- tasks */
  CLASS_TABS.tasks = function (c) {
    var tasks = M.tasksForClass(c.id).sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (!tasks.length) return '<div class="card">' + UI.empty("tasks", "No tasks yet", "Set homework, assignments, tests and presentations for this class.", '<button class="btn btn-primary" data-act="new-task" data-class="' + c.id + '">' + I("plus") + "New task</button>") + "</div>";
    return '<div class="card">' + tasks.map(function (t) { return taskRow(t); }).join("") + "</div>";
  };
  function taskRow(t, showClass) {
    var n = M.taskCounts(t), c = M.cls(t.classId);
    return '<a class="list-row" href="#/t/task/' + t.id + '"><span class="kind-bar k-' + t.kind + '"></span><div class="grow"><div class="title">' + esc(t.title) + "</div>" +
      '<div class="meta">' + M.kindBadge(t.kind) + A.dueBadge(t.dueAt, true) + (showClass ? "<span>" + esc(M.className(c)) + "</span>" : "") +
      (t.assignedTo !== "all" ? '<span class="badge">' + I("user") + n.total + " selected</span>" : "") + (t.test ? '<span class="badge brand">' + I("clock") + "Online test</span>" : "") + M.taskFlags(t) + "</div></div>" +
      '<div style="width:170px" class="small" data-tip="' + n.received + " of " + n.total + " received · " + n.submitted + " submitted · " + n.graded + ' graded"><div class="row spread"><span class="muted">Received</span><b class="tnum">' + n.received + "/" + n.total + "</b></div>" + UI.bar(A.pct(n.received, n.total)) +
      '<div class="row spread mt-sm"><span class="muted">' + (t.kind === "test" ? "Done" : "Submitted") + '</span><b class="tnum">' + n.submitted + "/" + n.total + "</b></div>" + UI.bar(A.pct(n.submitted, n.total), "accent") + "</div>" + I("right") + "</a>";
  }

  /* ---- gradebook */
  CLASS_TABS.gradebook = function (c) {
    var tasks = M.tasksForClass(c.id).filter(function (t) { return t.maxMarks; }).sort(function (a, b) { return (a.dueAt || 0) - (b.dueAt || 0); });
    var studs = M.studentsOf(c);
    if (!tasks.length) return '<div class="card">' + UI.empty("award", "Nothing to grade yet", "Tasks with a mark total appear here as columns.") + "</div>";
    var html = '<div class="row spread wrap mb"><p class="muted small">Type a mark and press Tab to save it. Online tests fill in automatically (grey), and you can overwrite them.</p><div class="row"><button class="btn btn-sm" data-act="new-task" data-class="' + c.id + '" data-kind="test">' + I("plus") + "Record a test</button><button class=\"btn btn-sm\" data-act=\"gb-csv\" data-class=\"" + c.id + '">' + I("download") + "Export CSV</button></div></div>" +
      '<div class="card table-wrap"><table class="table"><thead><tr><th class="sticky">Student</th>' +
      tasks.map(function (t) { return '<th class="num" data-tip="' + esc(t.title + " · " + M.KINDS[t.kind].label + " · due " + A.fmtDate(t.dueAt)) + '"><a href="#/t/task/' + t.id + '">' + esc(t.title.length > 16 ? t.title.slice(0, 15) + "…" : t.title) + '</a><div class="tiny">/ ' + t.maxMarks + "</div></th>"; }).join("") +
      '<th class="num">Average</th></tr></thead><tbody>' +
      studs.map(function (u) {
        var pcts = [];
        var cells = tasks.map(function (t) {
          if (!M.isAssigned(t, u.id)) return '<td class="num muted">n/a</td>';
          var mk = M.mark(t.id, u.id), eff = M.effectiveScore(t, u.id);
          if (eff) pcts.push((eff.score / t.maxMarks) * 100);
          var val = mk && mk.score != null ? mk.score : "";
          var ph = eff && eff.source === "auto" ? eff.score : "";
          return '<td class="num"><input class="cell" inputmode="decimal" value="' + val + '" placeholder="' + ph + '" data-change="gb-score" data-task="' + t.id + '" data-sid="' + u.id + '" data-max="' + t.maxMarks + '" aria-label="' + esc(u.name + " " + t.title) + '"></td>';
        }).join("");
        var avg = pcts.length ? Math.round(A.avg(pcts)) : null;
        return '<tr><td class="sticky"><a href="#/t/student/' + u.id + "/" + c.id + '" class="row">' + A.avatar(u, "sm") + esc(u.name) + "</a></td>" + cells + '<td class="num">' + UI.scoreBadge(avg) + "</td></tr>";
      }).join("") +
      '<tr><td class="sticky bold">Class average</td>' + tasks.map(function (t) {
        var sc = M.assignees(t).map(function (u) { var e = M.effectiveScore(t, u.id); return e ? (e.score / t.maxMarks) * 100 : null; }).filter(function (x) { return x != null; });
        return '<td class="num">' + UI.scoreBadge(sc.length ? Math.round(A.avg(sc)) : null) + "</td>";
      }).join("") + "<td></td></tr></tbody></table></div>";
    return html;
  };
  A.act["gb-score"] = function (el) {
    var v = el.value.trim(), max = Number(el.getAttribute("data-max"));
    if (v !== "" && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > max)) { UI.toast("Enter a mark between 0 and " + max, "bad"); el.focus(); return; }
    M.setMark(el.getAttribute("data-task"), el.getAttribute("data-sid"), v);
    UI.toast(v === "" ? "Mark cleared" : "Mark saved");
  };
  A.act["gb-csv"] = function (el) {
    var c = M.cls(el.getAttribute("data-class"));
    var tasks = M.tasksForClass(c.id).filter(function (t) { return t.maxMarks; });
    var rows = [["Student", "Student no."].concat(tasks.map(function (t) { return t.title + " (/" + t.maxMarks + ")"; }))];
    M.studentsOf(c).forEach(function (u) {
      rows.push([u.name, u.studentNo || ""].concat(tasks.map(function (t) { var e = M.effectiveScore(t, u.id); return e ? e.score : ""; })));
    });
    var csv = rows.map(function (r) { return r.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
    A.download(A.slug(c.name + " " + c.subject) + "-marks.csv", csv, "text/csv");
  };

  /* ---- notes (messages to students) */
  CLASS_TABS.notes = function (c) {
    var msgs = S().filter("messages", function (m) { return m.classId === c.id; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    return '<div class="row spread wrap mb"><p class="muted small">Notifications go to the whole class or to chosen students. You can see who has read them.</p><button class="btn btn-primary" data-act="new-note" data-class="' + c.id + '">' + I("send") + "New notification</button></div>" +
      '<div class="card">' + (msgs.length ? msgs.map(function (m) {
        var to = M.recipients(m), read = to.filter(function (u) { return M.isRead(m.id, u.id); }).length;
        return '<div class="list-row click" data-act="view-note" data-id="' + m.id + '" tabindex="0" role="button"><div class="stat" style="padding:0"><div class="ico">' + I("bell") + '</div></div><div class="grow"><div class="title">' + esc(m.subject) + '</div><div class="meta"><span>' + A.fmtDateTime(m.createdAt) + '</span><span class="sep"></span><span>' + (m.to === "all" ? "Whole class" : to.map(function (u) { return A.firstName(u.name); }).join(", ")) + "</span></div></div>" +
          '<div style="width:140px" class="small"><div class="row spread"><span class="muted">Read</span><b class="tnum">' + read + "/" + to.length + "</b></div>" + UI.bar(A.pct(read, to.length), "good") + "</div></div>";
      }).join("") : UI.empty("bell", "No notifications sent yet")) + "</div>";
  };
  A.act["view-note"] = function (el) {
    var m = S().get("messages", el.getAttribute("data-id")), to = M.recipients(m);
    UI.modal({
      title: m.subject, sub: A.fmtDateTime(m.createdAt) + " · " + esc(M.className(M.cls(m.classId))), size: "wide",
      body: '<div class="prose">' + A.md(m.body) + '</div><div class="divider"></div><div class="label">Read by</div><div class="grid g-2">' +
        to.map(function (u) {
          var r = S().get("receipts", "rc_" + m.id + "_" + u.id);
          return '<div class="row small">' + A.avatar(u, "sm") + '<span class="grow">' + esc(u.name) + "</span>" + (r ? '<span class="badge good">' + I("check") + A.relTime(r.readAt) + "</span>" : '<span class="badge">Not yet</span>') + "</div>";
        }).join("") + "</div>",
      foot: [{ label: "Delete", cls: "btn-danger", onClick: function () { S().remove("messages", m.id); UI.toast("Notification deleted"); A.render(); } }, { label: "Close", cls: "btn-primary" }],
    });
  };

  /* ---- library */
  CLASS_TABS.library = function (c) {
    var mats = M.libraryList(S().filter("materials", function (m) { return m.classId === c.id || (!m.classId && m.syllabusId === c.syllabusId); })).sort(function (a, b) { return b.createdAt - a.createdAt; });
    return '<div class="row spread wrap mb"><p class="muted small">PDFs, textbooks, past papers, videos and audio are stored inside the app, so students never leave it and can use them offline. You choose who can see each one.</p><button class="btn btn-primary" data-act="add-material" data-class="' + c.id + '">' + I("upload") + "Add material</button></div>" +
      '<div class="card">' + (mats.length ? mats.map(function (m) { return A.materialRow(m, { teacher: true }); }).join("") : UI.empty("library", "No materials yet", "Upload PDFs, textbooks, videos or write a handout.")) + "</div>";
  };

  /* ---- syllabus: terms, who may open which topic, and coverage */
  CLASS_TABS.syllabus = function (c) {
    var syl = M.syllabus(c.syllabusId);
    if (!syl) return '<div class="card">' + UI.empty("layers", "No syllabus linked", "Edit the class to choose a syllabus.") + "</div>";
    var studs = M.studentsOf(c), terms = M.syllabusTerms(syl), cur = c.currentTerm || 1, progress = {};
    studs.forEach(function (u) { progress[u.id] = M.syllabusProgress(u.id, syl); });

    var html = '<div class="card card-pad mb"><div class="row wrap top"><div class="grow"><h3 style="font-size:16px">Term content</h3><p class="small muted mt-sm">Students can open the topics of the term you have opened. Earlier terms stay open for revision, and their unfinished topics appear at the top of each student\'s Study page.</p></div>' +
      '<div class="seg" role="group" aria-label="Open term">' + terms.map(function (n) {
        return '<button class="' + (n === cur ? "on" : "") + '" data-act="open-term" data-class="' + c.id + '" data-term="' + n + '">' + (n <= cur ? I("unlock") : I("lock")) + esc(M.termName(n)) + "</button>";
      }).join("") + "</div></div>" +
      '<div class="divider"></div><label class="row top small" style="gap:12px;cursor:pointer"><span class="toggle"><input type="checkbox" ' + (c.sequential ? "checked" : "") + ' data-change="class-sequential" data-class="' + c.id + '" aria-label="Topics in order"><span></span></span>' +
      "<span><b>Topics in order.</b> A student must complete each topic (" + M.EXAM.topicMasteryMark + "% or more in its practice questions) before the next one opens, so nobody jumps ahead or skips a topic.</span></label>" +
      '<p class="tiny muted mt-sm">' + I("info") + " Use <b>Students…</b> on any topic to lock it for particular students, or to open it early for a student who is ahead.</p></div>";

    // read-only review of earlier terms
    for (var n = 1; n < cur; n++) {
      if (!syl.topics.some(function (t) { return M.topicTerm(t) === n; })) continue;
      var rows = studs.map(function (u) { return { u: u, r: M.termReview(u.id, syl, n) }; });
      var behind = rows.filter(function (x) { return x.r.unfinished.length; });
      var avg = Math.round(A.avg(rows.map(function (x) { return x.r.pct; })) || 0);
      html += '<div class="card mb review-card"><div class="card-head">' + I("eye") + "<h3>" + esc(M.termName(n)) + ' review</h3><span class="sub">summary only</span><span class="grow"></span><span class="badge ' + (behind.length ? "warn" : "good") + '">' + (studs.length - behind.length) + " of " + studs.length + " finished every topic</span></div>" +
        '<div class="card-body"><div class="row wrap top" style="gap:22px">' + UI.ring(avg, { size: 84, stroke: 9, sub: "covered", label: M.termName(n) + " covered" }) +
        '<div class="grow">' + (behind.length ? '<div class="label">Still unfinished</div>' + behind.slice(0, 8).map(function (x) {
          return '<div class="row wrap small" style="margin:6px 0">' + A.avatar(x.u, "sm") + '<a href="#/t/student/' + x.u.id + "/" + c.id + '"><b>' + esc(x.u.name) + "</b></a>" + x.r.unfinished.map(function (t) { return '<span class="badge">' + esc(t.title) + "</span>"; }).join("") + "</div>";
        }).join("") + (behind.length > 8 ? '<p class="tiny muted">and ' + (behind.length - 8) + " more</p>" : "") : '<p class="small">Everyone finished ' + esc(M.termName(n)) + ". Well done.</p>") + "</div></div></div></div>";
    }

    terms.forEach(function (n) {
      var topics = syl.topics.filter(function (t) { return M.topicTerm(t) === n; });
      html += '<div class="section-title"><h2>' + esc(M.termName(n)) + '</h2><span class="sub">' + (n < cur ? "Earlier term · open for revision" : n === cur ? "Current term" : "Not opened yet") + "</span></div>" +
        '<div class="card">' + topics.map(function (t) { return topicAccessRow(c, syl, t, studs, progress); }).join("") + "</div>";
    });

    html += '<div class="card mt"><div class="card-head"><h3>Who has covered what</h3><span class="sub">columns are topic numbers</span><span class="grow"></span><div class="legend"><span><i class="st-done"></i>Completed</span><span><i class="st-prog"></i>In progress</span><span><i class="st-none"></i>Not started</span><span><i class="st-lock" style="border:1px dashed var(--border-strong)"></i>Locked for them</span></div></div>' +
      '<div class="card-body table-wrap"><table class="heat"><thead><tr><th></th>' + syl.topics.map(function (t, i) { return '<th style="text-align:center" data-tip="Topic ' + (i + 1) + ": " + esc(t.title) + " (" + esc(M.termName(M.topicTerm(t))) + ')">' + (i + 1) + "</th>"; }).join("") + '<th style="padding-left:8px">Done</th></tr></thead><tbody>' +
      studs.map(function (u) {
        var pr = progress[u.id];
        return '<tr><th><a href="#/t/student/' + u.id + "/" + c.id + '">' + esc(u.name) + "</a></th>" + syl.topics.map(function (t) {
          var x = pr.byTopic[t.id], acc = M.topicAccess(u.id, c, syl, t), locked = !acc.open && x.state !== "done";
          var cls = locked ? "st-lock" : x.state === "done" ? "st-done" : x.state === "prog" ? "st-prog" : "st-none";
          var tipTxt = u.name + " · " + t.title + ": " + (locked ? M.lockText(acc).replace("for you ", "") : x.state === "done" ? "completed" : x.state === "prog" ? "in progress" : "not started") + (x.rec && x.rec.practiceBest != null ? " · best practice " + x.rec.practiceBest + "%" : "");
          return '<td class="cell ' + cls + '" data-tip="' + esc(tipTxt) + '">' + (x.state === "done" ? "✓" : locked ? I("lock") : x.state === "prog" ? "•" : "") + "</td>";
        }).join("") + '<td class="small bold tnum" style="padding-left:8px">' + pr.pct + "%</td></tr>";
      }).join("") + "</tbody></table></div></div>";
    return html;
  };
  function topicAccessRow(c, syl, t, studs, progress) {
    var i = syl.topics.indexOf(t), set = M.topicClassSetting(c, t), done = 0, prog = 0;
    studs.forEach(function (u) { var s = progress[u.id].byTopic[t.id].state; if (s === "done") done++; else if (s === "prog") prog++; });
    var names = set.except.map(function (id) { var u = M.user(id); return u ? A.firstName(u.name) : ""; }).join(", ");
    var status = set.open
      ? (set.except.length ? '<span class="badge warn" data-tip="Locked for ' + esc(names) + '">' + I("lock") + "Locked for " + set.except.length + "</span>" : '<span class="badge good">' + I("unlock") + "Open to all</span>")
      : (set.except.length ? '<span class="badge brand" data-tip="Open early for ' + esc(names) + '">' + I("unlock") + "Open for " + set.except.length + "</span>" : '<span class="badge">' + I("lock") + "Locked</span>");
    return '<div class="topic-row"><span class="topic-num ' + (set.open ? "" : "lock") + '">' + (i + 1) + '</span><div class="grow"><div class="title bold">' + esc(t.title) + '</div><div class="tiny muted">' + t.questions.length + " questions · " + (t.examples || []).length + " worked examples · ~" + (t.estMinutes || 30) + " min</div></div>" +
      '<div style="width:170px" class="small hide-sm" data-tip="' + done + " completed · " + prog + " in progress · " + (studs.length - done - prog) + ' not started"><div class="row spread"><span class="muted">Completed</span><b class="tnum">' + done + "/" + studs.length + "</b></div>" + UI.bar(A.pct(done, studs.length), "good") + "</div>" +
      status +
      '<button class="btn btn-sm" data-act="topic-access" data-class="' + c.id + '" data-topic="' + t.id + '">' + I("users") + "Students…</button>" +
      '<span class="toggle" data-tip="' + (set.open ? "Open for the class" : "Locked for the class") + '"><input type="checkbox" ' + (set.open ? "checked" : "") + ' data-change="topic-toggle" data-class="' + c.id + '" data-topic="' + t.id + '" aria-label="' + esc(t.title) + ' open for the class"><span></span></span></div>';
  }
  function saveOverride(c, t, mode, except) {
    var access = Object.assign({}, c.topicAccess || {}), deflt = M.topicTerm(t) <= (c.currentTerm || 1) ? "open" : "locked";
    if (mode === deflt && !except.length) delete access[t.id];
    else access[t.id] = { mode: mode, except: except };
    S().patch("classes", c.id, { topicAccess: access });
  }
  A.saveTopicOverride = saveOverride;
  A.act["topic-toggle"] = function (el) {
    var c = M.cls(el.getAttribute("data-class")), t = M.topic(M.syllabus(c.syllabusId), el.getAttribute("data-topic"));
    saveOverride(c, t, el.checked ? "open" : "locked", []);
    UI.toast(el.checked ? "“" + t.title + "” is open for the class" : "“" + t.title + "” is locked for the class");
    A.render();
  };
  A.act["topic-access"] = function (el) {
    var c = M.cls(el.getAttribute("data-class")), syl = M.syllabus(c.syllabusId), t = M.topic(syl, el.getAttribute("data-topic")), set = M.topicClassSetting(c, t);
    UI.modal({
      title: t.title, sub: esc(M.className(c)) + " · " + esc(M.termName(M.topicTerm(t))), size: "wide",
      body: '<span class="label">For the class</span><div class="seg" id="acc-mode"><button type="button" data-m="open" class="' + (set.open ? "on" : "") + '">' + I("unlock") + 'Open</button><button type="button" data-m="locked" class="' + (set.open ? "" : "on") + '">' + I("lock") + "Locked</button></div>" +
        '<div class="label mt" id="acc-label"></div><div id="acc-picker">' + UI.picker({ students: M.studentsOf(c), selected: set.except }) + "</div>",
      foot: [{ label: "Cancel" }, {
        label: "Save", cls: "btn-primary", onClick: function (m) {
          var mode = m.querySelector("#acc-mode .on").getAttribute("data-m");
          saveOverride(c, t, mode, UI.pickerValue(m.querySelector("#acc-picker")));
          UI.toast("Access updated");
          A.render();
        },
      }],
      onMount: function (m) {
        var label = function () {
          var open = m.querySelector("#acc-mode .on").getAttribute("data-m") === "open";
          m.querySelector("#acc-label").innerHTML = open ? "Lock it for these students <span class=\"muted\">(for example, students who must finish earlier topics first)</span>" : "Open it early for these students <span class=\"muted\">(for example, a student who is ahead)</span>";
        };
        m.querySelector("#acc-mode").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          m.querySelectorAll("#acc-mode button").forEach(function (x) { x.classList.toggle("on", x === b); });
          label();
        });
        label();
      },
    });
  };
  A.act["open-term"] = function (el) {
    var c = M.cls(el.getAttribute("data-class")), n = Number(el.getAttribute("data-term")), cur = c.currentTerm || 1;
    if (n === cur) return;
    UI.confirm(n > cur ? "Open " + M.termName(n) + " content for " + M.className(c) + "? Its topics unlock for students, and earlier terms become revision with a review of unfinished topics." : "Go back to " + M.termName(n) + "? Topics from later terms will be locked again.", { ok: n > cur ? "Open " + M.termName(n) : "Go back" }).then(function (ok) {
      if (!ok) return;
      S().patch("classes", c.id, { currentTerm: n });
      UI.toast(M.termName(n) + " is now open");
      A.render();
    });
  };
  A.act["class-sequential"] = function (el) {
    S().patch("classes", el.getAttribute("data-class"), { sequential: el.checked });
    UI.toast(el.checked ? "Students must now finish topics in order" : "Students can open any unlocked topic");
    A.render();
  };
  A.act["student-topic-lock"] = function (el) {
    var c = M.cls(el.getAttribute("data-class")), t = M.topic(M.syllabus(c.syllabusId), el.getAttribute("data-topic")), sid = el.getAttribute("data-sid");
    var set = M.topicClassSetting(c, t), ex = set.except.slice(), i = ex.indexOf(sid);
    if (i >= 0) ex.splice(i, 1); else ex.push(sid);
    saveOverride(c, t, set.open ? "open" : "locked", ex);
    UI.toast("Updated");
    A.render();
  };

  /* ============================================================ TASK DETAIL */
  A.route("t/task/:id", function (p, q, me) {
    var t = M.task(p.id), c = t && ownClass(t.classId, me);
    if (!t || !c) return { redirect: "#/t/home" };
    var syl = M.syllabus(c.syllabusId), topic = t.topicId ? M.topic(syl, t.topicId) : null, n = M.taskCounts(t);
    var who = M.assignees(t);
    var mats = (t.materialIds || []).map(function (id) { return S().get("materials", id); }).filter(Boolean);
    var testInfo = "";
    if (t.test) {
      var tsyl = M.syllabus(t.test.syllabusId), paper = t.test.paperId && tsyl ? (tsyl.papers || []).find(function (x) { return x.id === t.test.paperId; }) : null;
      testInfo = '<div class="callout mt">' + I("clock") + "<div><b>Online timed test · " + (paper ? paper.durationMin : t.test.durationMin) + " minutes.</b> " +
        (paper ? "Paper: " + esc(paper.title) + " (" + paper.questionIds.length + " questions)." : t.test.count + " questions from: " + t.test.topicIds.map(function (id) { var tp = M.topic(tsyl, id); return tp ? esc(tp.title) : ""; }).join(", ") + ".") +
        " Students take it in exam mode and it is marked automatically.</div></div>";
    }
    var html = '<div class="grid g-main"><div class="card card-pad"><div class="row wrap">' + M.kindBadge(t.kind) + A.dueBadge(t.dueAt, true) + M.taskFlags(t) + (t.maxMarks ? '<span class="badge">' + I("award") + t.maxMarks + " marks</span>" : "") +
      (topic ? '<span class="badge brand">' + I("book") + esc(topic.title) + "</span>" : "") + "</div>" +
      '<h2 class="mt-sm" style="font-size:22px">' + esc(t.title) + '</h2><p class="muted small">' + esc(M.className(c)) + " · set " + A.fmtDateTime(t.createdAt) + " · due " + A.fmtDateTime(t.dueAt) + " · " + (t.assignedTo === "all" ? "whole class" : who.length + " selected students: " + who.map(function (u) { return A.firstName(u.name); }).join(", ")) + "</p>" +
      '<div class="prose mt small">' + A.md(t.instructions || "") + "</div>" + testInfo +
      (mats.length ? '<div class="label mt">Attached materials</div><div class="card">' + mats.map(function (m) { return A.materialRow(m); }).join("") + "</div>" : "") +
      '<div class="row wrap mt"><button class="btn" data-act="edit-task" data-id="' + t.id + '">' + I("edit") + "Edit</button>" +
      '<button class="btn" data-act="remind-task" data-id="' + t.id + '">' + I("bell") + "Remind students</button>" +
      '<button class="btn btn-danger" data-act="del-task" data-id="' + t.id + '">' + I("trash") + "Delete</button></div></div>" +
      '<div class="grid" style="align-content:start">' + UI.stat("check", n.received + " / " + n.total, "Received") + UI.stat("upload", n.submitted + " / " + n.total, t.kind === "test" ? "Completed" : "Submitted") + UI.stat("award", n.graded + " / " + n.total, "Graded", true) + "</div></div>";

    html += '<div class="section-title"><h2>Students</h2><span class="sub">Type a mark and feedback. Everything saves as you go.</span></div>' +
      '<div class="card table-wrap"><table class="table"><thead><tr><th>Student</th><th>Received</th><th>' + (t.kind === "test" ? "Completed" : "Submitted") + "</th><th>Work</th>" + (t.maxMarks ? '<th class="num">Mark / ' + t.maxMarks + "</th>" : "") + "<th>Feedback</th></tr></thead><tbody>" +
      who.map(function (u) {
        var s = M.submission(t.id, u.id) || {}, mk = M.mark(t.id, u.id) || {}, eff = M.effectiveScore(t, u.id);
        var att = s.attemptId && S().get("attempts", s.attemptId), cf = att && M.copyFlag(att, me.id);
        var work = s.attemptId ? '<a class="btn btn-sm" href="#/t/attempt/' + s.attemptId + '">' + I("eye") + "View paper (" + s.autoPct + "%)</a>" + (cf && cf.flagged ? ' <span class="badge serious" data-tip="' + cf.identical + " of " + cf.written + ' written answers match the marking scheme">' + I("shield") + "Possible copying</span>" : "")
          : s.text || s.fileId ? '<button class="btn btn-sm" data-act="view-sub" data-task="' + t.id + '" data-sid="' + u.id + '">' + I("eye") + "View</button>" : '<span class="muted small">—</span>';
        return "<tr><td><a class=\"row\" href=\"#/t/student/" + u.id + "/" + c.id + '">' + A.avatar(u, "sm") + esc(u.name) + "</a></td>" +
          "<td>" + (s.receivedAt ? '<span class="badge good" data-tip="' + A.fmtDateTime(s.receivedAt) + '">' + I("check") + A.relTime(s.receivedAt) + "</span>" : '<span class="badge">Not yet</span>') + "</td>" +
          "<td>" + (s.submittedAt ? '<span class="badge brand" data-tip="' + A.fmtDateTime(s.submittedAt) + '">' + (s.confirmedBook ? I("check") + "Book handed in · " : "") + A.relTime(s.submittedAt) + "</span>" + (t.dueAt && s.submittedAt > t.dueAt ? ' <span class="badge bad">Late</span>' : "") : M.canSubmit(t) && t.dueAt && Date.now() > t.dueAt ? '<span class="badge bad">Not submitted</span>' : '<span class="muted small">—</span>') + "</td>" +
          "<td>" + work + "</td>" +
          (t.maxMarks ? '<td class="num"><input class="cell" inputmode="decimal" value="' + (mk.score != null ? mk.score : "") + '" placeholder="' + (eff && eff.source === "auto" ? eff.score : "") + '" data-change="gb-score" data-task="' + t.id + '" data-sid="' + u.id + '" data-max="' + t.maxMarks + '" aria-label="Mark for ' + esc(u.name) + '"></td>' : "") +
          '<td><input class="input sm" style="min-width:200px" value="' + esc(mk.feedback || "") + '" placeholder="Feedback for ' + esc(A.firstName(u.name)) + '" data-change="mark-feedback" data-task="' + t.id + '" data-sid="' + u.id + '"></td></tr>';
      }).join("") + "</tbody></table></div>";
    return { title: t.title, crumbs: [{ label: "My classes", href: "#/t/classes" }, { label: M.className(c), href: "#/t/class/" + c.id + "/tasks" }, { label: "Task" }], html: html };
  }, { role: "teacher" });

  A.act["mark-feedback"] = function (el) {
    M.setMark(el.getAttribute("data-task"), el.getAttribute("data-sid"), undefined, el.value);
    UI.toast("Feedback saved");
  };
  A.act["view-sub"] = function (el) {
    var s = M.submission(el.getAttribute("data-task"), el.getAttribute("data-sid")), u = M.user(s.studentId);
    UI.modal({
      title: u.name, sub: "Submitted " + A.fmtDateTime(s.submittedAt), size: "wide",
      body: '<div class="prose">' + A.md(s.text || "") + "</div>" + (s.fileId ? '<div class="mt"><button class="btn" data-act="open-file" data-id="' + s.fileId + '">' + I("file") + "Open attached file</button></div>" : ""),
    });
  };
  A.act["open-file"] = function (el) {
    A.openMaterial({ title: "Attachment", kind: "pdf", fileId: el.getAttribute("data-id") });
  };
  A.act["del-task"] = function (el) {
    var t = M.task(el.getAttribute("data-id"));
    UI.confirm("Delete \"" + t.title + "\"? Students' submissions and marks for it will be hidden.", { ok: "Delete task", danger: true }).then(function (ok) {
      if (!ok) return;
      S().remove("tasks", t.id);
      UI.toast("Task deleted");
      location.hash = "#/t/class/" + t.classId + "/tasks";
    });
  };
  A.act["remind-task"] = function (el) {
    var t = M.task(el.getAttribute("data-id"));
    var pending = M.assignees(t).filter(function (u) { var s = M.submission(t.id, u.id); return !s || !s.submittedAt; });
    if (!pending.length) { UI.toast("Everyone has already submitted"); return; }
    noteModal(M.cls(t.classId), pending.map(function (u) { return u.id; }), "Reminder: " + t.title,
      "This is a reminder that **" + t.title + "** is " + A.dueLabel(t.dueAt).text.toLowerCase() + ". Open My Tasks, mark it as received and submit it on time.");
  };

  /* ============================================================ STUDENT PROFILE */
  A.route("t/student/:id/:cid?", function (p, q, me) {
    var u = M.user(p.id);
    if (!u || u.role !== "student") return { redirect: "#/t/classes" };
    var myClasses = M.classesForTeacher(me.id).filter(function (c) { return c.studentIds.indexOf(u.id) >= 0; });
    var c = (p.cid && ownClass(p.cid, me)) || myClasses[0];
    if (!c) return { redirect: "#/t/classes" };
    var syl = M.syllabus(c.syllabusId), st = M.studentStats(u.id, c), pr = st.progress;
    var concepts = M.conceptSummary(st.attempts);
    var tasks = M.tasksForClass(c.id).filter(function (t) { return M.isAssigned(t, u.id); }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    var switcher = myClasses.length > 1 ? '<div class="seg">' + myClasses.map(function (x) { return '<button data-act="goto" data-href="#/t/student/' + u.id + "/" + x.id + '" class="' + (x.id === c.id ? "on" : "") + '">' + esc(x.subject) + "</button>"; }).join("") + "</div>" : "";
    var otherClasses = M.classesForStudent(u.id).map(function (x) { return esc(M.className(x)); }).join(" · ");

    var html = '<div class="card card-pad"><div class="row wrap">' + A.avatar(u, "lg") + '<div class="grow"><h2 style="font-size:22px">' + esc(u.name) + '</h2><p class="muted small">' + esc(u.studentNo || "") + " · " + esc(M.studentHome(u)) + " · " + otherClasses + "</p></div>" + switcher +
      '<button class="btn" data-act="new-note" data-class="' + c.id + '" data-to="' + u.id + '">' + I("send") + "Notify</button></div></div>" +
      '<div class="grid g-4 mt">' +
      UI.stat("layers", (pr ? pr.pct : 0) + "%", "Syllabus completed", false, pr ? pr.done + " of " + pr.total + " topics · about " + A.fmtMinutes(pr.minsLeft * 60) + " of study left" : "") +
      UI.stat("calendar", st.attendance == null ? "—" : st.attendance + "%", "Attendance") +
      UI.stat("award", st.avgScore == null ? "—" : st.avgScore + "%", "Average score", true) +
      UI.stat("tasks", st.submitted + " / " + st.tasks, "Tasks submitted") + "</div>";

    html += '<div class="grid g-2 mt"><div class="card"><div class="card-head"><h3>What they are learning</h3><span class="sub">' + esc(syl ? syl.subject : "") + " · lock or open topics just for " + esc(A.firstName(u.name)) + "</span></div>" +
      (syl ? syl.topics.map(function (t, i) {
        var x = pr.byTopic[t.id], rec = x.rec, acc = M.topicAccess(u.id, c, syl, t), set = M.topicClassSetting(c, t), mine = set.except.indexOf(u.id) >= 0;
        var label = x.state === "done" ? '<span class="badge good">' + I("checkCircle") + "Completed</span>" : !acc.open ? '<span class="badge">' + I("lock") + esc(M.lockText(acc).replace(" for you", "").replace("your teacher", "you")) + "</span>" : x.state === "prog" ? '<span class="badge warn">In progress</span>' : '<span class="badge">Not started</span>';
        var btn = acc.reason === "sequence" ? "" : '<button class="btn btn-sm btn-ghost" data-act="student-topic-lock" data-class="' + c.id + '" data-topic="' + t.id + '" data-sid="' + u.id + '" data-tip="' + (mine ? "Undo the exception for " + esc(A.firstName(u.name)) : set.open ? "Lock this topic for " + esc(A.firstName(u.name)) + " only" : "Open this topic early for " + esc(A.firstName(u.name)) + " only") + '">' + I(set.open !== mine ? "lock" : "unlock") + (set.open !== mine ? "Lock" : "Open") + "</button>";
        return '<div class="topic-row"><span class="topic-num ' + (x.state === "done" ? "done" : !acc.open ? "lock" : x.state === "prog" ? "prog" : "") + '">' + (i + 1) + '</span><div class="grow"><div class="bold small">' + esc(t.title) + ' <span class="tiny muted">' + esc(M.termName(M.topicTerm(t))) + '</span></div><div class="tiny muted">' +
          (rec ? (rec.notesReadAt ? "Read notes " + A.relTime(rec.notesReadAt) : "Notes not read") + (rec.practiceBest != null ? " · best practice " + rec.practiceBest + "% (" + rec.practiceAttempts + " tries)" : "") : "No activity yet") + "</div></div>" + label + btn + "</div>";
      }).join("") : "") + "</div>" +
      '<div class="card"><div class="card-head"><h3>Test performance by concept</h3><span class="sub">last 5 tests</span></div><div class="card-body">' + UI.toneLegend() + '<div class="mt">' +
      UI.hbars(concepts.map(function (x) { return { label: x.title, pct: x.pct, tone: x.tone, tip: x.title + ": " + x.got + "/" + x.total + " marks (" + x.pct + "%) · " + M.toneLabel(x.pct) }; }), { emptyTitle: "No tests taken yet" }) + "</div></div>" +
      '<div class="card-head" style="border-top:1px solid var(--border)"><h3>Exam-mode tests</h3></div>' +
      (st.attempts.length ? st.attempts.slice(0, 6).map(function (a) {
        var cf = M.copyFlag(a, me.id);
        return '<a class="list-row" href="#/t/attempt/' + a.id + '"><div class="grow"><div class="title small">' + esc(a.title) + '</div><div class="meta">' + A.fmtDateTime(a.finishedAt) + " · " + A.fmtMinutes(a.timeUsedSec) + "</div></div>" + (cf.flagged ? '<span class="badge serious">' + I("shield") + "Possible copying</span>" : "") + UI.scoreBadge(a.result.pct) + '<span class="badge brand">' + esc(a.result.grade) + "</span></a>";
      }).join("") : UI.empty("target", "No tests yet")) + "</div></div>";

    html += '<div class="section-title"><h2>Tasks</h2></div><div class="card">' + (tasks.length ? tasks.map(function (t) {
      var stt = M.taskStatus(t, u.id), eff = M.effectiveScore(t, u.id);
      return '<a class="list-row" href="#/t/task/' + t.id + '"><span class="kind-bar k-' + t.kind + '"></span><div class="grow"><div class="title">' + esc(t.title) + '</div><div class="meta">' + M.kindBadge(t.kind) + A.dueBadge(t.dueAt, true) + "</div></div>" +
        (eff ? '<b class="tnum">' + eff.score + " / " + t.maxMarks + "</b>" : "") + M.statusBadge(stt) + "</a>";
    }).join("") : UI.empty("tasks", "No tasks")) + "</div>" +
      '<div class="row mt"><button class="btn btn-danger" data-act="remove-student" data-class="' + c.id + '" data-sid="' + u.id + '">' + I("x") + "Remove from " + esc(M.className(c)) + "</button></div>";
    return { title: u.name, crumbs: [{ label: "My classes", href: "#/t/classes" }, { label: M.className(c), href: "#/t/class/" + c.id }, { label: "Student" }], html: html };
  }, { role: "teacher" });
  A.act.goto = function (el) { location.hash = el.getAttribute("data-href"); };
  A.act["remove-student"] = function (el) {
    var c = M.cls(el.getAttribute("data-class")), sid = el.getAttribute("data-sid"), u = M.user(sid);
    UI.confirm("Remove " + u.name + " from " + M.className(c) + "? Their past work is kept.", { ok: "Remove", danger: true }).then(function (ok) {
      if (!ok) return;
      S().patch("classes", c.id, { studentIds: c.studentIds.filter(function (x) { return x !== sid; }) });
      UI.toast(u.name + " removed from the class");
      location.hash = "#/t/class/" + c.id;
    });
  };

  /* ============================================================ MATERIALS */
  /* Learning materials: sections (textbooks, notes, exam papers), a subject, and a search that
     looks in the section you are in (or everything). Items are grouped by subject so the page
     stays short even with hundreds of past papers. */
  var MAT_SECTIONS = [["all", "Everything", "library"], ["books", "Textbooks", "book"], ["notes", "Notes", "file"], ["papers", "Exam papers", "award"]];
  function matSection(m) { return M.isExamItem(m) ? "papers" : M.matCategory(m) === "book" ? "books" : "notes"; }
  /** "May/June 2025" from an exam item's sort key (2025.2), or the start of its title. */
  function sessionName(m) {
    var k = Number(m.sortKey), y = Math.floor(k), n = Math.round((k - y) * 10);
    if (y > 1990 && ["", "Feb/March", "May/June", "Oct/Nov"][n]) return ["", "Feb/March", "May/June", "Oct/Nov"][n] + " " + y;
    return String(m.title || "").replace(/^(Marking scheme|Insert): /, "").split(" · ")[0];
  }
  A.route("t/materials", function (p, q, me) {
    var classes = M.myClasses(me), cids = classes.map(function (c) { return c.id; }), sids = classes.map(function (c) { return c.syllabusId; });
    var sec = MAT_SECTIONS.some(function (x) { return x[0] === q.t; }) ? q.t : "all", subj = q.s || "";
    // a marking scheme opens from its paper's row, so it doesn't get a row of its own
    var mine = M.libraryList(S().filter("materials", function (m) { return cids.indexOf(m.classId) >= 0 || (!m.classId && sids.indexOf(m.syllabusId) >= 0); }))
      .filter(function (m) { return !(m.kind === "markscheme" && m.paperId && S().get("materials", m.paperId)); });
    var sylOf = function (m) { var c = M.cls(m.classId); return m.syllabusId || (c && c.syllabusId) || ""; };
    var inSubj = mine.filter(function (m) { return !subj || sylOf(m) === subj; });
    var count = {}; inSubj.forEach(function (m) { count[matSection(m)] = (count[matSection(m)] || 0) + 1; });
    var mats = inSubj.filter(function (m) { return sec === "all" || matSection(m) === sec; });
    var link = function (t, s) { var parts = []; if (t && t !== "all") parts.push("t=" + t); if (s) parts.push("s=" + encodeURIComponent(s)); return "#/t/materials" + (parts.length ? "?" + parts.join("&") : ""); };
    var subjects = sids.filter(function (id, i) { return id && sids.indexOf(id) === i; }).map(M.syllabus).filter(Boolean).sort(function (a, b) { return a.subject.localeCompare(b.subject); });

    var html = '<div class="row spread wrap mb"><p class="muted" style="max-width:640px">Textbooks, notes and exam papers live inside the app. Choose a section and a subject, or search. Notes are also read for the tutor.</p>' +
      '<button class="btn btn-primary" data-act="add-material">' + I("upload") + "Add material</button></div>" + A.subjectScopeBar(me) +
      '<div class="pill-tabs mat-tabs">' + MAT_SECTIONS.map(function (x) {
        var n = x[0] === "all" ? inSubj.length : count[x[0]] || 0;
        return '<button class="' + (sec === x[0] ? "on" : "") + '" data-act="goto" data-href="' + link(x[0], subj) + '">' + I(x[2]) + esc(x[1]) + ' <span class="muted">' + n + "</span></button>";
      }).join("") + "</div>" +
      '<div class="row wrap mb mat-filters"><input class="input" data-input="mat-find" placeholder="Search ' + esc(sec === "all" ? "everything" : MAT_SECTIONS.filter(function (x) { return x[0] === sec; })[0][1].toLowerCase()) + ': title, subject, year, tag…" aria-label="Search">' +
      '<select class="select" data-change="mat-subject" aria-label="Subject"><option value="">All subjects</option>' +
      subjects.map(function (s) { return '<option value="' + s.id + '"' + (s.id === subj ? " selected" : "") + ">" + esc(s.subject + (s.code ? " " + s.code : "")) + "</option>"; }).join("") + "</select></div>";

    // grouped by subject; exam papers also by exam session
    var groups = {}, order = [];
    mats.forEach(function (m) { var k = sylOf(m); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(m); });
    order.sort(function (a, b) { var x = M.syllabus(a), y = M.syllabus(b); return (x ? x.subject : "~").localeCompare(y ? y.subject : "~"); });
    var openAll = !!subj || order.length <= 2;
    html += mats.length ? order.map(function (k) {
      var syl = M.syllabus(k), list = groups[k].slice().sort(function (a, b) { return M.isExamItem(a) && M.isExamItem(b) ? M.byExamSession(a, b) : M.isExamItem(a) - M.isExamItem(b) || b.createdAt - a.createdAt; });
      var lastSession = null;
      return '<details class="card paper-group mat-group"' + (openAll ? " open" : "") + '><summary class="card-head">' + I(syl ? (M.SUBJECT_GROUPS.filter(function (g) { return g.id === M.groupOf(syl); })[0] || {}).icon || "book" : "book") +
        "<h3>" + esc(syl ? syl.subject : "Other") + (syl ? ' <span class="muted small">' + esc(M.boardName(syl).replace(/^Cambridge /, "") + (syl.code ? " " + syl.code : "")) + "</span>" : "") + '</h3><span class="sub">' + list.length + " item" + (list.length === 1 ? "" : "s") + "</span></summary>" +
        list.map(function (m) {
          var head = "";
          if (M.isExamItem(m)) {
            var session = sessionName(m);
            if (session !== lastSession) { head = '<div class="mat-session tiny muted">' + esc(session) + "</div>"; lastSession = session; }
          }
          var find = " " + [m.title, m.fileName, syl ? syl.subject + " " + syl.code : "", M.MAT_CATS[M.matCategory(m)] || "", (m.tags || []).join(" "), m.series || ""].join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
          return head + A.materialRow(m, { teacher: true }).replace('<div class="list-row click"', '<div class="list-row click" data-find="' + esc(find) + '"');
        }).join("") + "</details>";
    }).join("") + '<div class="card hidden" id="mat-none">' + UI.empty("search", "Nothing matches", "Try another word, or search everything.") + "</div>"
      : '<div class="card">' + UI.empty("library", "Nothing here yet", sec === "papers" ? "Add exam papers with Add material." : "Add textbooks and notes with Add material.") + "</div>";
    return { title: "Learning materials", html: html };
  }, { role: "teacher" });
  A.act["mat-subject"] = function (el) {
    var m = /[?&]t=([a-z]+)/.exec(location.hash);
    location.hash = "#/t/materials?" + (m ? "t=" + m[1] + "&" : "") + (el.value ? "s=" + encodeURIComponent(el.value) : "");
  };
  A.act["mat-find"] = function (el) {
    // every word must start a word in the item (numbers must match whole: "paper 2" is not "paper 22")
    var f = el.value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(function (w) { return " " + w + (/^\d+$/.test(w) ? " " : ""); }), any = false;
    document.querySelectorAll(".mat-group").forEach(function (g) {
      var hits = 0;
      g.querySelectorAll("[data-find]").forEach(function (r) {
        var t = r.getAttribute("data-find"), on = f.every(function (w) { return t.indexOf(w) >= 0; });
        r.classList.toggle("hidden", !on); if (on) hits++;
      });
      g.querySelectorAll(".mat-session").forEach(function (h) { h.classList.toggle("hidden", !!f.length); });
      g.classList.toggle("hidden", !hits);
      if (f.length && hits) g.open = true;
      if (hits) any = true;
    });
    var none = document.getElementById("mat-none"); if (none) none.classList.toggle("hidden", any);
  };
  A.act["add-material"] = function (el) {
    var o = { classId: el.getAttribute("data-class") || null, syllabusId: el.getAttribute("data-syllabus") || null, kind: el.getAttribute("data-kind") || null };
    if (o.kind) A.materialModal(o); else A.addMaterialChooser(o); // study material, exam papers or marking schemes
  };

  /* ============================================================ MODALS */
  /* ---- new / edit class: form → class (letters, colours, animals…) → subject → students */
  function classModal(existing) {
    var me = M.me(), st = M.structure();
    var c = existing || { level: st.levels[0], stream: st.streams[0], subject: "", room: "", syllabusId: "", studentIds: [], currentTerm: 1 };
    var syllabi = S().all("syllabi").sort(function (a, b) { return M.syllabusTitle(a).localeCompare(M.syllabusTitle(b)); });
    UI.modal({
      title: existing ? "Edit class" : "New class", size: "wide",
      body: '<form id="cls-form" class="form-grid">' +
        '<label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option" + (l === c.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Class</span><select class="select" name="stream">' + st.streams.map(function (s) { return '<option value="' + esc(s) + '"' + (s === c.stream ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") +
        '<option value=""' + (existing && !c.stream ? " selected" : "") + ">Mixed group from several classes</option></select></label>" +
        '<label class="field hidden" id="cls-group"><span>Group name</span><input class="input" name="group" value="' + esc(existing && !c.stream ? c.name : "") + '" placeholder="e.g. Form 4 Sciences"></label>' +
        '<label class="field"><span>Subject</span><input class="input" name="subject" value="' + esc(c.subject) + '" placeholder="e.g. Mathematics" required></label>' +
        '<label class="field"><span>Syllabus</span><select class="select" name="syllabusId"><option value="">Choose…</option>' + M.byLevel(syllabi).map(function (l) {
          return '<optgroup label="' + esc(l.level) + '">' + l.items.sort(function (x, y) { return x.subject.localeCompare(y.subject); }).map(function (s) { return '<option value="' + s.id + '"' + (s.id === c.syllabusId ? " selected" : "") + ">" + esc(s.subject + (s.code ? " " + s.code : "")) + "</option>"; }).join("") + "</optgroup>";
        }).join("") + '</select><span class="hint">Not listed? Add it in the Syllabus library first.</span></label>' +
        '<label class="field"><span>Room <span class="muted">(optional)</span></span><input class="input" name="room" value="' + esc(c.room || "") + '"></label>' +
        '<div class="full"><div class="row wrap spread"><span class="label">Students</span><button type="button" class="btn btn-sm" id="cls-fill">' + I("users") + '<span id="cls-fill-label">Add the whole class</span></button></div>' +
        '<div id="cls-picker">' + UI.picker({ students: M.students(), selected: c.studentIds }) + "</div></div></form>",
      foot: (existing ? [{ label: "Delete class", cls: "btn-danger", onClick: function () {
        return UI.confirm("Delete " + M.className(c) + "? Tasks and registers stay in backups but the class disappears.", { danger: true, ok: "Delete" }).then(function (ok) {
          if (!ok) return false;
          S().remove("classes", c.id); UI.toast("Class deleted"); location.hash = "#/t/classes";
        });
      } }] : []).concat([{ label: "Cancel" }, {
        label: existing ? "Save" : "Create class", cls: "btn-primary", onClick: function (el) {
          var f = UI.formData(el.querySelector("#cls-form"));
          if (!f.subject.trim()) { UI.toast("Enter the subject", "bad"); return false; }
          if (!f.stream && !f.group.trim()) { UI.toast("Give the mixed group a name", "bad"); return false; }
          var rec = Object.assign({}, c, {
            level: f.level, stream: f.stream || null, name: f.stream ? M.homeClassName(f.level, f.stream) : f.group.trim(),
            subject: f.subject.trim(), room: f.room, syllabusId: f.syllabusId, studentIds: UI.pickerValue(el.querySelector("#cls-picker")), teacherId: c.teacherId || me.id,
          });
          if (!existing) { rec.currentTerm = 1; rec.topicAccess = {}; rec.sequential = false; }
          rec = S().put("classes", rec);
          UI.toast(existing ? "Class updated" : "Class created");
          location.hash = "#/t/class/" + rec.id;
          A.render();
        },
      }]),
      onMount: function (el) {
        var form = el.querySelector("#cls-form");
        var sync = function () {
          var mixed = !form.stream.value;
          el.querySelector("#cls-group").classList.toggle("hidden", !mixed);
          el.querySelector("#cls-fill-label").textContent = mixed ? "Add everyone in " + form.level.value : "Add everyone in " + M.homeClassName(form.level.value, form.stream.value);
        };
        form.level.addEventListener("change", sync);
        form.stream.addEventListener("change", sync);
        el.querySelector("#cls-fill").addEventListener("click", function () {
          var lv = form.level.value, sm = form.stream.value, n = 0;
          M.students().forEach(function (u) {
            if (u.level === lv && (!sm || u.stream === sm)) {
              var box = el.querySelector('#cls-picker input[value="' + u.id + '"]');
              if (box && !box.checked) { box.checked = true; n++; }
            }
          });
          el.querySelector("#cls-picker .picker-list input").dispatchEvent(new Event("change", { bubbles: true }));
          UI.toast(n ? n + " students added" : "They are already selected");
        });
        sync();
      },
    });
  }
  A.act["new-class"] = function () { classModal(null); };
  A.act["edit-class"] = function (el) { classModal(M.cls(el.getAttribute("data-id"))); };

  /* ---- add students (existing or new) */
  A.act["add-students"] = function (el) {
    var c = M.cls(el.getAttribute("data-class")), st = M.structure();
    var others = M.students().filter(function (u) { return c.studentIds.indexOf(u.id) < 0; });
    UI.modal({
      title: "Add students to " + M.className(c), size: "wide",
      body: '<div class="label">Students already at the school</div>' + UI.picker({ students: others, id: "add-picker", empty: "Every student is already in this class." }) +
        '<div class="divider"></div><div class="label">New students <span class="muted">(one per line: full name, student ID)</span></div>' +
        '<div class="form-grid"><label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" id="new-level">' + st.levels.map(function (l) { return "<option" + (l === c.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Class</span><select class="select" id="new-stream">' + st.streams.map(function (s) { return "<option" + (s === c.stream ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select></label></div>" +
        '<textarea class="textarea mt-sm" id="new-studs" rows="4" placeholder="Tendai Moyo, GHS-26-001&#10;Grace Banda, GHS-26-002"></textarea>' +
        '<p class="hint small muted mt-sm">New students sign in the first time with their name and student ID, then create their own password.</p>',
      foot: [{ label: "Cancel" }, {
        label: "Add to class", cls: "btn-primary", onClick: function (m) {
          var ids = UI.pickerValue(m.querySelector("#add-picker")), bad = [];
          var lv = m.querySelector("#new-level").value, sm = m.querySelector("#new-stream").value;
          m.querySelector("#new-studs").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (line) {
            var parts = line.split(","), name = parts[0].trim(), no = (parts[1] || "").trim();
            if (!no) { bad.push(name + " (no student ID)"); return; }
            if (M.studentById(no)) { bad.push(no + " (ID already used)"); return; }
            ids.push(S().put("users", { role: "student", name: name, studentNo: no, level: lv, stream: sm }).id);
          });
          if (bad.length) UI.toast("Skipped: " + bad.join(", "), "bad");
          if (!ids.length) { if (!bad.length) UI.toast("Choose or type at least one student", "bad"); return false; }
          S().patch("classes", c.id, { studentIds: uniq(c.studentIds.concat(ids)) });
          UI.toast(ids.length + " student(s) added");
          A.render();
        },
      }],
    });
  };

  /* ---- send a notification to students */
  function noteModal(cls, toIds, subject, body) {
    var me = M.me(), classes = M.myClasses(me);
    cls = cls || classes[0];
    if (!cls) { UI.toast("Create a class first", "bad"); return; }
    var some = toIds && toIds.length;
    UI.modal({
      title: "Send a notification", size: "wide",
      body: '<form id="note-form"><div class="form-grid">' +
        '<label class="field"><span>Class</span><select class="select" name="classId" id="note-class">' + classes.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cls.id ? " selected" : "") + ">" + esc(M.className(c)) + "</option>"; }).join("") + "</select></label>" +
        '<div class="field"><span class="label">Send to</span><div class="seg" id="note-to"><button type="button" data-a="all" class="' + (some ? "" : "on") + '">Whole class</button><button type="button" data-a="some" class="' + (some ? "on" : "") + '">Selected students</button></div></div>' +
        '<div class="full ' + (some ? "" : "hidden") + '" id="note-students-wrap"></div>' +
        '<label class="field full"><span>Subject</span><input class="input" name="subject" value="' + esc(subject || "") + '" required></label>' +
        '<label class="field full"><span>Message</span><textarea class="textarea" name="body" rows="6">' + esc(body || "") + "</textarea></label></div></form>",
      foot: [{ label: "Cancel" }, {
        label: "Send notification", cls: "btn-primary", icon: "send", onClick: function (el) {
          var f = UI.formData(el.querySelector("#note-form")), mode = el.querySelector("#note-to .on").getAttribute("data-a");
          var to = mode === "all" ? "all" : UI.pickerValue(el.querySelector("#note-students-wrap"));
          if (!f.subject.trim() || !f.body.trim()) { UI.toast("Write a subject and a message", "bad"); return false; }
          if (to !== "all" && !to.length) { UI.toast("Choose at least one student", "bad"); return false; }
          S().put("messages", { classId: f.classId, fromId: me.id, to: to, subject: f.subject.trim(), body: f.body.trim() });
          UI.toast("Notification sent");
          A.render();
        },
      }],
      onMount: function (el) {
        var fill = function () { el.querySelector("#note-students-wrap").innerHTML = UI.picker({ students: M.studentsOf(M.cls(el.querySelector("#note-class").value)), selected: toIds || [] }); };
        el.querySelector("#note-class").addEventListener("change", fill);
        el.querySelector("#note-to").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          el.querySelectorAll("#note-to button").forEach(function (x) { x.classList.toggle("on", x === b); });
          el.querySelector("#note-students-wrap").classList.toggle("hidden", b.getAttribute("data-a") !== "some");
        });
        fill();
      },
    });
  }
  A.act["new-note"] = function (el) {
    var cid = el.getAttribute("data-class"), to = el.getAttribute("data-to");
    noteModal(cid ? M.cls(cid) : null, to ? [to] : null);
  };

  /* ---- new / edit task. Due Monday–Friday, 08:00–16:00. */
  function taskModal(existing, cls, kind) {
    var me = M.me(), classes = M.myClasses(me);
    var firstDay = M.schoolDays(Date.now() + 36 * 3600000, 1)[0];
    var t = existing || { kind: kind || "homework", title: "", instructions: "", maxMarks: "", assignedTo: "all", classId: (cls || classes[0] || {}).id, dueAt: M.schoolDays(firstDay, 3)[2] + A.hm("16:00") * 60000, materialIds: [] };
    if (!t.classId) { UI.toast("Create a class first", "bad"); return; }
    var kinds = Object.keys(M.KINDS);
    var dueDay = A.startOfDay(t.dueAt), dueTime = A.fmtTime(t.dueAt);
    var days = M.schoolDays(Date.now(), 30);
    if (days.indexOf(dueDay) < 0) days.unshift(dueDay);
    var times = M.dueTimes();
    if (times.indexOf(dueTime) < 0) times.push(dueTime);
    UI.modal({
      title: existing ? "Edit task" : "New task", size: "wide",
      body: '<form id="task-form"><input type="hidden" name="kind" value="' + t.kind + '">' +
        '<div class="seg" id="task-kind">' + kinds.map(function (k) { return '<button type="button" data-k="' + k + '" class="' + (t.kind === k ? "on" : "") + '">' + I(M.KINDS[k].icon) + M.KINDS[k].label + "</button>"; }).join("") + "</div>" +
        '<div class="form-grid mt">' +
        '<label class="field"><span>Class</span><select class="select" name="classId" id="task-class"' + (existing ? " disabled" : "") + ">" + classes.map(function (c) { return '<option value="' + c.id + '"' + (c.id === t.classId ? " selected" : "") + ">" + esc(M.className(c)) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Topic <span class="muted">(optional)</span></span><select class="select" name="topicId" id="task-topic"></select></label>' +
        '<label class="field full"><span>Title</span><input class="input" name="title" value="' + esc(t.title) + '" placeholder="e.g. Exercise 4.2: Indices" required></label>' +
        '<label class="field full"><span>Instructions</span><textarea class="textarea" name="instructions" rows="5" placeholder="What should students do? Page numbers, questions, what to hand in…">' + esc(t.instructions || "") + "</textarea></label>" +
        '<label class="field"><span>Due date <span class="muted">(Monday to Friday)</span></span><select class="select" name="dueDay">' + days.map(function (d) { return '<option value="' + d + '"' + (d === dueDay ? " selected" : "") + ">" + (d === A.startOfDay() ? "Today, " : "") + A.fmtDate(d) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Due time <span class="muted">(08:00 to 16:00)</span></span><select class="select" name="dueTime">' + times.map(function (x) { return "<option" + (x === dueTime ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Marks out of <span class="muted">(blank if not marked)</span></span><input class="input" name="maxMarks" inputmode="numeric" value="' + (t.maxMarks || "") + '"></label>' +
        '<p class="field small muted" id="task-kind-hint" style="align-self:end"></p>' +
        "</div>" +
        '<div class="card card-pad mt hidden" id="task-test"><label class="check"><input type="checkbox" name="online" id="task-online"' + (t.test ? " checked" : "") + "><b>Online timed test</b>: students sit it in exam mode and it is marked automatically</label>" +
        '<div id="task-test-opts" class="form-grid mt ' + (t.test ? "" : "hidden") + '">' +
        '<label class="field full"><span>Questions from</span><select class="select" name="paperId" id="task-paper"></select></label>' +
        '<div class="field full" id="task-topics-wrap"><span class="label">Topics</span><div class="pick-list" id="task-topics"></div></div>' +
        '<label class="field"><span>Number of questions</span><input class="input" name="count" inputmode="numeric" value="' + ((t.test && t.test.count) || 10) + '"></label>' +
        '<label class="field"><span>Time limit (minutes)</span><input class="input" name="durationMin" inputmode="numeric" value="' + ((t.test && t.test.durationMin) || 20) + '"></label></div></div>' +
        '<div class="mt"><span class="label">Assign to</span><div class="seg" id="task-to"><button type="button" data-a="all" class="' + (t.assignedTo === "all" ? "on" : "") + '">Whole class</button><button type="button" data-a="some" class="' + (t.assignedTo !== "all" ? "on" : "") + '">Selected students</button></div>' +
        '<div class="mt-sm ' + (t.assignedTo === "all" ? "hidden" : "") + '" id="task-students"></div><p class="hint small muted mt-sm" id="task-pres-hint">For presentations, choose the student or group who will present.</p></div>' +
        '<div class="mt" id="task-mats-wrap"><span class="label">Attach materials from the class library <span class="muted">(optional)</span></span><div class="pick-list" id="task-mats"></div></div>' +
        "</form>",
      foot: [{ label: "Cancel" }, {
        label: existing ? "Save task" : "Set task", cls: "btn-primary", icon: "check", onClick: function (el) {
          var form = el.querySelector("#task-form"), f = UI.formData(form);
          var classId = existing ? t.classId : f.classId;
          if (!f.title.trim()) { UI.toast("Give the task a title", "bad"); return false; }
          var due = Number(f.dueDay) + A.hm(f.dueTime) * 60000;
          if (!M.isSchoolDay(due) || A.hm(f.dueTime) < A.hm(M.DAY_START) || A.hm(f.dueTime) > A.hm(M.DAY_END)) { UI.toast("Work can only be due Monday to Friday, 08:00 to 16:00", "bad"); return false; }
          if (M.canSubmit({ kind: f.kind }) && due < Date.now() + 5 * 60000 && (!existing || due !== t.dueAt)) { UI.toast("That due time has already passed. Choose a later time.", "bad"); return false; }
          var mode = el.querySelector("#task-to .on").getAttribute("data-a");
          var to = mode === "all" ? "all" : UI.pickerValue(el.querySelector("#task-students"));
          if (to !== "all" && !to.length) { UI.toast("Choose at least one student", "bad"); return false; }
          var rec = Object.assign({}, t, {
            kind: f.kind, classId: classId, title: f.title.trim(), instructions: f.instructions, topicId: f.topicId || null,
            dueAt: due, maxMarks: f.maxMarks ? Number(f.maxMarks) : null, assignedTo: to, createdBy: me.id,
            materialIds: Array.prototype.map.call(el.querySelectorAll("#task-mats input:checked"), function (x) { return x.value; }),
          });
          if (f.kind === "test" && f.online) {
            var c = M.cls(classId);
            var topicIds = Array.prototype.map.call(el.querySelectorAll("#task-topics input:checked"), function (x) { return x.value; });
            if (!f.paperId && !topicIds.length) { UI.toast("Choose a paper or at least one topic", "bad"); return false; }
            rec.test = f.paperId ? { syllabusId: c.syllabusId, paperId: f.paperId } : { syllabusId: c.syllabusId, topicIds: topicIds, count: Number(f.count) || 10, durationMin: Number(f.durationMin) || 20 };
            if (!rec.maxMarks) rec.maxMarks = 100;
          } else delete rec.test;
          if (existing && existing.dueAt !== rec.dueAt) { S().remove("alerts", "al_due_" + rec.id); }
          rec = S().put("tasks", rec);
          UI.toast(existing ? "Task updated" : "Task set: students will see it next time they open the app");
          location.hash = "#/t/task/" + rec.id;
          A.render();
        },
      }],
      onMount: function (el) {
        var form = el.querySelector("#task-form");
        var cur = function () { return M.cls(existing ? t.classId : form.querySelector("#task-class").value); };
        function refresh() {
          var c = cur(), syl = M.syllabus(c.syllabusId), kind = form.kind.value;
          var sel = form.querySelector("#task-topic"), was = sel.value || t.topicId || "";
          sel.innerHTML = '<option value="">None</option>' + (syl ? syl.topics.map(function (tp) { return '<option value="' + tp.id + '"' + (tp.id === was ? " selected" : "") + ">" + esc(tp.title) + "</option>"; }).join("") : "");
          el.querySelector("#task-students").innerHTML = UI.picker({ students: M.studentsOf(c), selected: Array.isArray(t.assignedTo) ? t.assignedTo : [] });
          var mats = S().filter("materials", function (m) { return m.classId === c.id || (!m.classId && m.syllabusId === c.syllabusId); });
          el.querySelector("#task-mats").innerHTML = mats.length ? mats.map(function (m) { return '<label class="check"><input type="checkbox" value="' + m.id + '"' + ((t.materialIds || []).indexOf(m.id) >= 0 ? " checked" : "") + ">" + I((M.MAT_KINDS[m.kind] || {}).icon) + esc(m.title) + "</label>"; }).join("") : '<p class="muted small" style="padding:8px 0">No materials in this class library yet.</p>';
          el.querySelector("#task-test").classList.toggle("hidden", kind !== "test");
          el.querySelector("#task-pres-hint").classList.toggle("hidden", kind !== "presentation");
          el.querySelector("#task-kind-hint").textContent = M.canSubmit({ kind: kind }) ? "Students tick “done and book handed in”. You are told when everyone has submitted, and 5 minutes before it is due." : kind === "presentation" ? "Presentations are marked by you after the student presents." : "Written tests: record the marks in the gradebook.";
          var pSel = el.querySelector("#task-paper");
          pSel.innerHTML = '<option value="">Build from topics…</option>' + (syl && syl.papers ? syl.papers.map(function (pp) { return '<option value="' + pp.id + '"' + (t.test && t.test.paperId === pp.id ? " selected" : "") + ">" + esc(pp.title) + " (" + pp.durationMin + " min)</option>"; }).join("") : "");
          var tids = (t.test && t.test.topicIds) || [];
          el.querySelector("#task-topics").innerHTML = syl ? syl.topics.map(function (tp) { return '<label class="check"><input type="checkbox" value="' + tp.id + '"' + (tids.indexOf(tp.id) >= 0 ? " checked" : "") + ">" + esc(tp.title) + ' <span class="muted small">' + tp.questions.length + " q</span></label>"; }).join("") : "";
          paperToggle();
        }
        function paperToggle() {
          var fromPaper = !!el.querySelector("#task-paper").value;
          el.querySelector("#task-topics-wrap").classList.toggle("hidden", fromPaper);
          el.querySelectorAll("#task-test-opts [name=count], #task-test-opts [name=durationMin]").forEach(function (x) { x.closest(".field").classList.toggle("hidden", fromPaper); });
        }
        el.querySelector("#task-kind").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          el.querySelectorAll("#task-kind button").forEach(function (x) { x.classList.toggle("on", x === b); });
          form.kind.value = b.getAttribute("data-k");
          if (form.kind.value === "presentation" && t.assignedTo === "all") el.querySelector("#task-to [data-a=some]").click();
          refresh();
        });
        el.querySelector("#task-to").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          el.querySelectorAll("#task-to button").forEach(function (x) { x.classList.toggle("on", x === b); });
          el.querySelector("#task-students").classList.toggle("hidden", b.getAttribute("data-a") !== "some");
        });
        el.querySelector("#task-online").addEventListener("change", function (e) { el.querySelector("#task-test-opts").classList.toggle("hidden", !e.target.checked); });
        el.querySelector("#task-paper").addEventListener("change", paperToggle);
        if (!existing) form.querySelector("#task-class").addEventListener("change", refresh);
        refresh();
      },
    });
  }
  A.act["new-task"] = function (el) {
    var cid = el.getAttribute("data-class");
    taskModal(null, cid ? M.cls(cid) : null, el.getAttribute("data-kind"));
  };
  A.act["edit-task"] = function (el) { taskModal(M.task(el.getAttribute("data-id"))); };
})(window.App);
