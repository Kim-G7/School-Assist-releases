/* Pop-ups at the top right, for everyone (A.Notify: new notices, tasks, marks, files, subject
 * decisions and requests, people waiting for approval), and teachers' alerts with the bell:
 *   - "All submitted": every student has handed in homework / an assignment → needs marking.
 *   - "Due now": 5 minutes before the due time, lists who has not submitted yet.
 *   - "Possible copying": a test's written answers match the marking scheme too closely.
 * Alerts are records (synced), so a teacher sees them on every device they use. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var Al = (A.Alerts = {});
  var ICON = { submitted: "checkCircle", due: "clock", copy: "shield", register: "users" };
  var TONE = { submitted: "good", due: "bad", copy: "serious", register: "good" };

  Al.mine = function (tid) {
    return S().filter("alerts", function (a) { return a.teacherId === tid; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  };
  Al.unread = function (tid) { return Al.mine(tid).filter(function (a) { return !a.readAt; }).length; };
  Al.href = function (a) { return a.kind === "register" ? "#/t/settings?s=people" : a.attemptId ? "#/t/attempt/" + a.attemptId : a.taskId ? "#/t/task/" + a.taskId : "#/t/home"; };

  Al.check = function () {
    var me = M.me();
    if (!me || me.role !== "teacher" || !S().state) return;
    var now = Date.now(), created = [];
    var add = function (rec) { if (!S().get("alerts", rec.id)) created.push(S().put("alerts", Object.assign({ teacherId: me.id, createdAt: now }, rec))); };
    // home edition online: someone registered and is waiting for the admin
    if (A.Cloud && me.isAdmin) {
      S().filter("users", function (u) { return u.role === "student" && u.status === "pending"; }).forEach(function (u) {
        add({ id: "al_reg_" + u.id, kind: "register", title: "New registration: " + u.name + " (" + u.studentNo + ")",
          body: u.name + (u.level ? ", " + u.level + "," : "") + " registered and is waiting for you. Approve them in Settings → People." });
      });
    }
    M.classesForTeacher(me.id).forEach(function (c) {
      M.tasksForClass(c.id).forEach(function (t) {
        if (!M.canSubmit(t)) return;
        var who = M.assignees(t), missing = M.notSubmitted(t);
        if (!who.length) return;
        if (!missing.length) {
          add({ id: "al_all_" + t.id, kind: "submitted", taskId: t.id, classId: c.id, title: "Everyone has submitted: " + t.title,
            body: "All " + who.length + " students in " + M.className(c) + " have handed in their work. It is ready for marking." });
        }
        if (t.dueAt && missing.length && now >= t.dueAt - 5 * 60000 && now <= t.dueAt + 72 * 3600000) {
          var mins = Math.max(1, Math.round((t.dueAt - now) / 60000));
          add({ id: "al_due_" + t.id, kind: "due", taskId: t.id, classId: c.id, studentIds: missing.map(function (u) { return u.id; }),
            title: (now < t.dueAt ? "Due in " + mins + " min: " : "Due work: ") + t.title,
            body: missing.length + " of " + who.length + " have not submitted: " + missing.map(function (u) { return u.name; }).join(", ") + "." });
        }
      });
      // written answers identical to the marking scheme
      S().filter("attempts", function (a) {
        return a.status === "done" && a.syllabusId === c.syllabusId && c.studentIds.indexOf(a.studentId) >= 0 && a.finishedAt > now - 14 * A.DAY;
      }).forEach(function (a) {
        var f = M.copyFlag(a, me.id);
        if (!f.flagged) return;
        var u = M.user(a.studentId);
        add({ id: "al_copy_" + a.id, kind: "copy", attemptId: a.id, classId: c.id, studentIds: [a.studentId],
          title: "Possible copying: " + (u ? u.name : "a student"),
          body: f.identical + " of " + f.written + " written answers in “" + a.title + "” are identical to the marking scheme (" + f.pct + "%). Your limit is " + f.threshold + "%." });
      });
    });
    created.slice(0, 4).forEach(Al.popup);
    if (created.length) Al.refreshBell();
  };

  /* ---------------------------------------------------------------- pop-ups */
  Al.popup = function (a) {
    var root = document.getElementById("alert-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "alert-pop " + (TONE[a.kind] || "");
    el.setAttribute("role", "alert");
    el.innerHTML = '<div class="alert-ico">' + I(ICON[a.kind] || "bell") + '</div><div class="grow"><b>' + esc(a.title) + '</b><p>' + esc(a.body) + "</p>" +
      '<div class="row mt-sm"><a class="btn btn-sm btn-primary" href="' + Al.href(a) + '" data-alert-open="' + a.id + '">' + (a.kind === "copy" ? "Review the paper" : a.kind === "due" ? "See who is missing" : a.kind === "register" ? "Approve or decline" : "Start marking") + "</a>" +
      '<button type="button" class="btn btn-sm btn-ghost" data-alert-dismiss="' + a.id + '">Dismiss</button></div></div>' +
      '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-alert-dismiss="' + a.id + '" aria-label="Close">' + I("x") + "</button>";
    root.appendChild(el);
    while (root.children.length > 4) root.firstElementChild.remove();
    if (document.hidden && window.Notification && Notification.permission === "granted") {
      try { new Notification(a.title, { body: a.body, icon: "assets/icon.svg", tag: a.id }); } catch (e) { /* not supported */ }
    }
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-alert-dismiss], [data-alert-open]");
    if (!t) return;
    var id = t.getAttribute("data-alert-dismiss") || t.getAttribute("data-alert-open");
    var a = S().get("alerts", id);
    if (a && !a.readAt) S().put("alerts", Object.assign({}, a, { readAt: Date.now() }));
    var pop = t.closest(".alert-pop");
    if (pop) pop.remove();
    Al.refreshBell();
  });

  /* -------------------------------------------------------------- bell list */
  Al.refreshBell = function () {
    var me = M.me(), el = document.getElementById("bell-count");
    if (!el || !me) return;
    var n = me.role === "teacher" ? Al.unread(me.id) : M.unreadCount(me.id);
    el.textContent = n;
    el.classList.toggle("hidden", !n);
  };
  A.act["open-alerts"] = function () {
    var me = M.me(), list = Al.mine(me.id);
    UI.modal({
      title: "Notifications", sub: "Submissions, due work and exam integrity", size: "wide", flush: true,
      body: list.length ? list.map(function (a) {
        return '<a class="list-row" href="' + Al.href(a) + '" data-alert-open="' + a.id + '"><div class="alert-ico ' + (TONE[a.kind] || "") + '">' + I(ICON[a.kind] || "bell") + '</div><div class="grow"><div class="title">' + (a.readAt ? "" : '<span class="badge accent" style="margin-right:6px">New</span>') + esc(a.title) + '</div><div class="small muted">' + esc(a.body) + '</div><div class="tiny muted mt-sm">' + A.relTime(a.createdAt) + "</div></div>" + I("right") + "</a>";
      }).join("") : UI.empty("bell", "No notifications yet", "You'll be told here when everyone has submitted, when work is due, and when a test needs checking."),
      foot: [{ label: "Mark all as read", onClick: function () { list.forEach(function (a) { if (!a.readAt) S().put("alerts", Object.assign({}, a, { readAt: Date.now() })); }); Al.refreshBell(); } }, { label: "Close", cls: "btn-primary" }],
    });
  };

  /* ---------------------------------------------------- what's new, for everyone
     New things since you last looked pop up at the top right: for students new notices, tasks,
     marks, library files and subject decisions; for teachers subject requests; for admins
     people waiting for approval and forgotten passwords. Each shows once on this device. */
  var N = (A.Notify = {});
  var stateKey = function (uid) { return "sca-news-" + uid; };
  function readState(uid) {
    try { var s = JSON.parse(localStorage.getItem(stateKey(uid)) || "null"); if (s && s.since) return s; } catch (e) { /* private mode */ }
    return { since: Date.now() - 120000, shown: {} }; // a first visit starts from now (not with a flood of old news)
  }
  function saveState(uid, s) {
    // anything older than a week isn't news any more, so what was shown before then can be forgotten
    s.since = Math.max(s.since, Date.now() - 7 * 86400000);
    Object.keys(s.shown).forEach(function (k) { if (s.shown[k] < s.since - 86400000) delete s.shown[k]; });
    try { localStorage.setItem(stateKey(uid), JSON.stringify({ since: s.since, shown: s.shown })); } catch (e) { /* private mode */ }
  }
  var clip = function (t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  function events(me) {
    var out = [];
    if (me.role === "student") {
      M.messagesForStudent(me.id).forEach(function (m) {
        if (M.isRead(m.id, me.id)) return;
        var from = M.user(m.fromId);
        out.push({ id: "msg_" + m.id, at: m.createdAt, icon: "bell", title: "New notice: " + (m.subject || "from your teacher"), body: (from ? from.name + ": " : "") + clip(m.body, 110), href: "#/s/notifications" });
      });
      M.tasksForStudent(me.id).forEach(function (t) {
        var c = M.cls(t.classId);
        out.push({ id: "task_" + t.id, at: t.createdAt, icon: "tasks", title: "New task: " + t.title, body: (c ? c.subject + ". " : "") + (t.dueAt ? "Due " + A.fmtDate(t.dueAt) + "." : ""), href: "#/s/task/" + t.id });
      });
      S().filter("marks", function (mk) { return mk.studentId === me.id && mk.markedAt; }).forEach(function (mk) {
        var t = S().get("tasks", mk.taskId);
        out.push({ id: "mark_" + mk.id + "_" + mk.markedAt, at: mk.markedAt, icon: "award", tone: "good", title: "Marked: " + (t ? t.title : "your work"),
          body: (mk.score != null && t && t.maxMarks ? "You got " + mk.score + " out of " + t.maxMarks + ". " : "") + clip(mk.feedback, 90), href: "#/s/task/" + mk.taskId });
      });
      M.materialsForStudent(me.id).forEach(function (m) {
        if (M.isExamItem && M.isExamItem(m)) return;
        var syl = M.syllabus(m.syllabusId || (M.cls(m.classId) || {}).syllabusId);
        out.push({ id: "mat_" + m.id, at: m.createdAt, icon: "library", title: "New in the library: " + m.title, body: syl ? syl.subject : "", href: "#/s/library", group: "mat" });
      });
      (M.enrolments ? M.enrolments(me.id) : []).forEach(function (e) {
        if (!e.decidedAt) return;
        var syl = M.syllabus(e.syllabusId);
        out.push({ id: "enrol_" + e.id + "_" + e.status, at: e.decidedAt, icon: e.status === "approved" ? "checkCircle" : "alert", tone: e.status === "approved" ? "good" : "bad",
          title: (syl ? syl.subject : "A subject") + (e.status === "approved" ? " is approved" : e.status === "declined" ? " was declined" : ": " + e.status), body: e.status === "approved" ? "You can start studying it now." : "Ask your teacher if you think this is a mistake.", href: "#/s/subjects" });
      });
    } else {
      (M.subjectRequests ? M.subjectRequests(me) : []).forEach(function (e) {
        var u = M.user(e.studentId), syl = M.syllabus(e.syllabusId), drop = e.status === "drop_pending";
        out.push({ id: "req_" + e.id + "_" + e.status, at: drop ? e.dropRequestedAt : e.requestedAt, icon: "checkCircle", title: (drop ? "Wants to drop " : "Wants to take ") + (syl ? syl.subject : "a subject"), body: (u ? u.name : "A student") + " is waiting for you.", href: "#/t/requests" });
      });
      if (me.isAdmin) {
        (M.pendingStaff ? M.pendingStaff() : []).forEach(function (u) {
          out.push({ id: "staff_" + u.id, at: u.registeredAt || u.createdAt, icon: "users", title: "New " + (u.isAdmin ? "admin" : "teacher") + " waiting: " + u.name, body: "Approve or decline them in Settings → People → Teachers.", href: "#/t/settings?s=people&r=teacher" });
        });
        (A.pwRequestList ? A.pwRequestList() : []).forEach(function (r) {
          out.push({ id: "pw_" + r.id + "_" + r.askedAt, at: r.askedAt, icon: "key", tone: "bad", title: (r.name || r.login) + " forgot their password", body: "Give them a new one from your home page or Settings → People.", href: "#/t/home" });
        });
      }
    }
    return out;
  }
  N.check = function () {
    var me = M.me();
    if (!me || !S().state) return;
    var st = readState(me.id), fresh = [];
    events(me).forEach(function (ev) { if (ev.at && ev.at > st.since - 60000 && !st.shown[ev.id]) fresh.push(ev); });
    if (!fresh.length) return;
    fresh.sort(function (a, b) { return a.at - b.at; });
    fresh.forEach(function (ev) { st.shown[ev.id] = Date.now(); });
    saveState(me.id, st);
    // lots of new library files at once: one pop-up for them all
    var mats = fresh.filter(function (e) { return e.group === "mat"; });
    if (mats.length > 2) fresh = fresh.filter(function (e) { return e.group !== "mat"; }).concat([{ id: "mats", icon: "library", title: mats.length + " new files in the library", body: clip(mats.map(function (e) { return e.title.replace(/^New in the library: /, ""); }).join(", "), 120), href: "#/s/library" }]);
    var show = fresh.slice(-3);
    if (fresh.length > 3) show[0] = { id: "more", icon: "bell", title: fresh.length - 2 + " updates", body: clip(fresh.slice(0, fresh.length - 2).map(function (e) { return e.title; }).join(" · "), 140), href: me.role === "student" ? "#/s/notifications" : "#/t/home" };
    show.forEach(N.pop);
  };
  /** A pop-up at the top right that goes away by itself. */
  N.pop = function (ev) {
    var root = document.getElementById("alert-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "alert-pop news " + (ev.tone || "");
    el.setAttribute("role", "status");
    el.innerHTML = '<div class="alert-ico">' + I(ev.icon || "bell") + '</div><div class="grow"><b>' + esc(ev.title) + "</b>" + (ev.body ? "<p>" + esc(ev.body) + "</p>" : "") +
      (ev.href ? '<div class="row mt-sm"><a class="btn btn-sm btn-primary" href="' + ev.href + '" data-news-close>Open</a></div>' : "") + "</div>" +
      '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-news-close aria-label="Close">' + I("x") + "</button>";
    root.appendChild(el);
    while (root.children.length > 5) root.firstElementChild.remove();
    var t = setTimeout(function () { el.classList.add("going"); setTimeout(function () { el.remove(); }, 300); }, 15000);
    el.addEventListener("mouseenter", function () { clearTimeout(t); });
    if (document.hidden && window.Notification && Notification.permission === "granted") {
      try { new Notification(ev.title, { body: ev.body || "", icon: "assets/icon.svg", tag: ev.id }); } catch (e) { /* not supported */ }
    }
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-news-close]");
    if (t) { var pop = t.closest(".alert-pop"); if (pop) pop.remove(); }
  });

  var timer = null;
  Al.start = function () {
    if (timer) return;
    timer = setInterval(function () { Al.check(); N.check(); }, 30000);
    S().on("change", A.debounce(function () { Al.check(); N.check(); }, 1500));
  };
})(window.App);
