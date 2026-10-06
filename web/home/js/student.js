/* Student views: home, tasks by subject (receive / hand in), library, notifications, progress. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  function subjectOf(task) { var c = M.cls(task.classId); return c ? c.subject : ""; }
  function teacherOf(cls) { var t = cls && M.user(cls.teacherId); return t ? t.name : ""; }

  /** Earlier-term topics the student has not finished yet, across all subjects. */
  function unfinishedFromEarlierTerms(me) {
    var out = [];
    M.syllabiForStudent(me.id).forEach(function (syl) {
      var cls = M.classForSyllabus(me.id, syl.id);
      if (!cls) return;
      for (var term = 1; term < (cls.allTerms ? 1 : cls.currentTerm || 1); term++) {
        M.termReview(me.id, syl, term).unfinished.forEach(function (t) {
          if (M.topicAccess(me.id, cls, syl, t).open) out.push({ syl: syl, t: t, term: term });
        });
      }
    });
    return out;
  }

  /* ================================================================= HOME */
  A.route("s/home", function (p, q, me) {
    var tasks = M.tasksForStudent(me.id);
    var fresh = tasks.filter(function (t) { return M.taskStatus(t, me.id).key === "new"; });
    var todo = tasks.filter(function (t) { var k = M.taskStatus(t, me.id).key; return k === "received" || k === "overdue"; })
      .sort(function (a, b) { return (a.dueAt || 9e15) - (b.dueAt || 9e15); });
    var syllabi = M.syllabiForStudent(me.id), msgs = M.messagesForStudent(me.id).slice(0, 4);
    var running = M.runningAttempt(me.id), attempts = M.attemptsFor(me.id), carry = unfinishedFromEarlierTerms(me);

    // "continue studying": unfinished earlier-term topic first, else the most recently studied open topic
    var next = carry[0] ? { syl: carry[0].syl, t: carry[0].t } : null;
    if (!next) syllabi.forEach(function (syl) {
      var rel = M.releasedFor(me.id, syl.id), pr = M.syllabusProgress(me.id, syl);
      syl.topics.forEach(function (t) {
        var x = pr.byTopic[t.id];
        if (!rel[t.id] || x.state === "done") return;
        var score = x.rec ? x.rec.lastStudiedAt || 1 : 0;
        if (!next || score > next.score) next = { syl: syl, t: t, score: score };
      });
    });

    var html = "";
    if (running) {
      var left = Math.max(0, Math.round((running.endsAt - Date.now()) / 1000));
      html += '<div class="callout warn mb">' + I("clock") + '<div class="grow"><b>You have an exam in progress: ' + esc(running.title) + ".</b> " + (left ? A.fmtDuration(left) + " left on the clock." : "Time is up, so open it to see your result.") + '</div><a class="btn btn-sm btn-primary" href="#/s/exam-room/' + running.id + '">Resume</a></div>';
    }
    if (A.pendingSubjectsNote) html += A.pendingSubjectsNote(me);
    if (A.recoveryNote) html += A.recoveryNote();
    html += '<section class="hero"><h2>' + A.greeting() + ", " + esc(A.firstName(me.name)) + "</h2><p>" +
      (fresh.length ? "You have " + fresh.length + " new " + (fresh.length === 1 ? "task" : "tasks") + " from your teachers." : "You're all caught up with your tasks.") + " " + esc(M.studentHome(me)) + " · " + esc(A.fmtDateLong(Date.now())) + "</p>" +
      '<div class="hero-actions">' + (next ? '<a class="btn btn-accent" href="#/s/topic/' + next.syl.id + "/" + next.t.id + '">' + I("play") + "Continue: " + esc(next.t.title) + "</a>" : "") +
      '<a class="btn btn-light" href="#/s/exam">' + I("cap") + "Exam mode</a></div></section>";

    html += '<div class="grid g-main mt"><div class="stack-lg">';
    html += '<div class="card"><div class="card-head"><h3>New from your teachers</h3><span class="sub">Let your teacher know you have received each one</span></div>' +
      (fresh.length ? fresh.map(function (t) {
        return '<div class="list-row"><span class="kind-bar k-' + t.kind + '"></span><div class="grow"><a class="title" href="#/s/task/' + t.id + '" style="color:inherit">' + esc(t.title) + '</a><div class="meta">' + M.kindBadge(t.kind) + "<span>" + esc(subjectOf(t)) + "</span>" + A.dueBadge(t.dueAt) + "</div></div>" +
          '<button class="btn btn-primary" data-act="ack" data-id="' + t.id + '">' + I("check") + "I've received it</button></div>";
      }).join("") : UI.empty("checkCircle", "Nothing new", "New homework, assignments, tests and presentations appear here.")) + "</div>";
    html += A.TT.todayCard(me);
    html += '<div class="card"><div class="card-head"><h3>To do</h3><span class="sub">received, not yet handed in</span><span class="grow"></span><a class="btn btn-sm btn-ghost" href="#/s/tasks">All tasks ' + I("right") + "</a></div>" +
      (todo.length ? todo.slice(0, 6).map(taskRow.bind(null, me)).join("") : UI.empty("tasks", "Nothing waiting")) + "</div>";
    html += "</div><div class=\"stack-lg\">";

    if (carry.length) {
      html += '<div class="card"><div class="card-head">' + I("alert") + "<h3>Unfinished from last term</h3></div>" + carry.slice(0, 5).map(function (x) {
        return '<a class="list-row" href="#/s/topic/' + x.syl.id + "/" + x.t.id + '"><div class="grow"><div class="title small">' + esc(x.t.title) + '</div><div class="meta">' + esc(x.syl.subject) + " · " + esc(M.termName(x.term)) + '</div></div><span class="badge warn">Finish it</span></a>';
      }).join("") + "</div>";
    }
    html += '<div class="card"><div class="card-head"><h3>My subjects</h3></div>' + (syllabi.length ? syllabi.map(function (syl) {
      var pr = M.syllabusProgress(me.id, syl);
      return '<div class="list-row">' + UI.ring(pr.pct, { size: 64, stroke: 7, label: syl.subject }) + '<div class="grow"><div class="title">' + esc(syl.subject) + '</div><div class="meta">' + pr.done + "/" + pr.total + " topics · ~" + A.fmtMinutes(pr.minsLeft * 60) + ' left</div><div class="row mt-sm"><a class="btn btn-sm" href="#/s/study/' + syl.id + '">' + I("book") + 'Study</a><a class="btn btn-sm" href="#/s/test/' + syl.id + '">' + I("clock") + "Test</a></div></div></div>";
    }).join("") : UI.empty("book", "No subjects yet", "Your teacher will add you to a class.")) + "</div>";

    html += '<div class="card"><div class="card-head"><h3>Notifications</h3><span class="grow"></span><a class="btn btn-sm btn-ghost" href="#/s/notifications">All ' + I("right") + "</a></div>" +
      (msgs.length ? msgs.map(function (m) { return noteRow(m, me); }).join("") : UI.empty("bell", "No notifications yet")) + "</div>";

    if (attempts[0]) {
      var a = attempts[0];
      html += '<a class="card card-pad" href="#/s/result/' + a.id + '" style="display:block;color:inherit"><div class="row"><div class="grade-badge" style="width:56px;height:56px;font-size:24px;border-radius:16px">' + esc(a.result.grade) + '</div><div class="grow"><div class="tiny muted">Last test · ' + A.relTime(a.finishedAt) + '</div><div class="bold">' + esc(a.title) + '</div><div class="small">' + a.result.got + " / " + a.result.total + " marks · " + a.result.pct + "%</div></div>" + I("right") + "</div></a>";
    }
    html += "</div></div>";
    return { title: "Home", html: html };
  }, { role: "student" });

  function taskRow(me, t) {
    var st = M.taskStatus(t, me.id), eff = M.effectiveScore(t, me.id);
    return '<a class="list-row" href="#/s/task/' + t.id + '"><span class="kind-bar k-' + t.kind + '"></span><div class="grow"><div class="title">' + esc(t.title) + '</div><div class="meta">' + M.kindBadge(t.kind) + A.dueBadge(t.dueAt, st.key === "submitted" || st.key === "graded") + "</div></div>" +
      (eff ? '<b class="tnum small">' + eff.score + " / " + t.maxMarks + "</b>" : "") + M.statusBadge(st) + I("right") + "</a>";
  }
  function noteRow(m, me) {
    var read = M.isRead(m.id, me.id), from = M.user(m.fromId);
    return '<div class="list-row click" data-act="read-note" data-id="' + m.id + '" tabindex="0" role="button">' + A.avatar(from || {}, "sm") + '<div class="grow"><div class="title">' + (read ? "" : '<span class="badge accent" style="margin-right:6px">New</span>') + esc(m.subject) + '</div><div class="meta"><span>' + esc(from ? from.name : "") + '</span><span class="sep"></span><span>' + A.relTime(m.createdAt) + "</span></div></div>" + I("right") + "</div>";
  }
  A.act.ack = function (el) {
    var me = M.me();
    M.acknowledge(el.getAttribute("data-id"), me.id);
    UI.toast("Your teacher can now see you received it");
    A.render();
  };
  A.act["read-note"] = function (el) {
    var me = M.me(), m = S().get("messages", el.getAttribute("data-id")), from = M.user(m.fromId);
    M.markRead(m.id, me.id);
    UI.modal({ title: m.subject, sub: esc((from ? from.name : "") + " · " + A.fmtDateTime(m.createdAt)), size: "wide", body: '<div class="prose">' + A.md(m.body) + "</div>", onClose: function () { A.render(); } });
  };

  /* ================================================================ TASKS
     One panel per subject the student takes, each listing that subject's tasks. */
  A.route("s/tasks", function (p, q, me) {
    var f = q.f || "all", all = M.tasksForStudent(me.id);
    var test = {
      all: function () { return true; },
      new: function (t) { return M.taskStatus(t, me.id).key === "new"; },
      todo: function (t) { var k = M.taskStatus(t, me.id).key; return k === "received" || k === "overdue"; },
      submitted: function (t) { return M.taskStatus(t, me.id).key === "submitted"; },
      graded: function (t) { return M.taskStatus(t, me.id).key === "graded"; },
    };
    var labels = { all: "All", new: "New", todo: "To do", submitted: "Handed in", graded: "Marked" };
    var pills = '<div class="pill-tabs">' + Object.keys(labels).map(function (k) { return '<button class="' + (k === f ? "on" : "") + '" data-act="goto" data-href="#/s/tasks?f=' + k + '">' + labels[k] + " (" + all.filter(test[k]).length + ")</button>"; }).join("") + "</div>";
    var classes = M.classesForStudent(me.id).sort(function (a, b) { return a.subject.localeCompare(b.subject); });
    var html = pills + '<div class="grid g-2">' + classes.map(function (c) {
      var list = all.filter(function (t) { return t.classId === c.id && (test[f] || test.all)(t); });
      var mine = all.filter(function (t) { return t.classId === c.id; });
      var fresh = mine.filter(test.new).length, todo = mine.filter(test.todo).length;
      return '<div class="card subject-panel"><div class="card-head"><div class="subject-dot"></div><div class="grow"><h3>' + esc(c.subject) + '</h3><div class="sub">' + esc(teacherOf(c)) + " · " + esc(c.name) + "</div></div>" +
        (fresh ? '<span class="badge accent">' + fresh + " new</span>" : "") + (todo ? '<span class="badge">' + todo + " to do</span>" : "") + "</div>" +
        (list.length ? list.map(taskRow.bind(null, me)).join("") : '<div class="empty small" style="padding:22px">' + (f === "all" ? "No tasks in " + esc(c.subject) + " yet." : "Nothing here.") + "</div>") + "</div>";
    }).join("") + "</div>";
    if (!classes.length) html += '<div class="card">' + UI.empty("tasks", "You're not in any class yet") + "</div>";
    return { title: "My tasks", html: html };
  }, { role: "student" });

  A.route("s/task/:id", function (p, q, me) {
    var t = M.task(p.id);
    if (!t || !M.isAssigned(t, me.id)) return { redirect: "#/s/tasks" };
    var c = M.cls(t.classId), syl = M.syllabus(c.syllabusId), topic = t.topicId ? M.topic(syl, t.topicId) : null;
    var sub = M.submission(t.id, me.id) || {}, mk = M.mark(t.id, me.id), eff = M.effectiveScore(t, me.id), st = M.taskStatus(t, me.id);
    var mats = (t.materialIds || []).map(function (id) { return S().get("materials", id); }).filter(function (m) { return m && M.materialVisibleTo(m, me.id); });
    var acc = topic ? M.topicAccess(me.id, c, syl, topic) : null;

    var html = '<div class="grid g-main"><div class="card card-pad"><div class="row wrap">' + M.kindBadge(t.kind) + A.dueBadge(t.dueAt, st.key === "submitted" || st.key === "graded") + M.statusBadge(st) + (t.maxMarks && !t.test ? '<span class="badge">' + I("award") + t.maxMarks + " marks</span>" : "") + (t.test ? '<span class="badge brand">' + I("clock") + "Online timed test</span>" : "") + "</div>" +
      '<h2 class="mt-sm" style="font-size:22px">' + esc(t.title) + '</h2><p class="muted small">' + esc(M.className(c)) + " · " + esc(teacherOf(c)) + " · set " + A.fmtDate(t.createdAt) + " · due " + A.fmtDateTime(t.dueAt) +
      (Array.isArray(t.assignedTo) ? " · with " + M.assignees(t).filter(function (u) { return u.id !== me.id; }).map(function (u) { return A.firstName(u.name); }).join(", ") : "") + "</p>" +
      '<div class="prose mt">' + A.md(t.instructions || "") + "</div>" +
      (topic ? '<div class="callout mt">' + I("book") + '<div class="grow">This task is on <b>' + esc(topic.title) + "</b>. " + (acc.open ? "Revise the notes and worked examples first." : esc(M.lockText(acc)) + ".") + "</div>" + (acc.open ? '<a class="btn btn-sm" href="#/s/topic/' + syl.id + "/" + topic.id + '">Open notes</a>' : "") + "</div>" : "") +
      (mats.length ? '<div class="label mt">Materials</div><div class="card">' + mats.map(function (m) { return A.materialRow(m); }).join("") + "</div>" : "") + "</div>";

    var side = '<div class="card card-pad">';
    if (!sub.receivedAt) {
      side += '<h3 style="font-size:16px">Have you got it?</h3><p class="muted small mt-sm">Tap below so ' + esc(teacherOf(c)) + " knows you've received this " + M.KINDS[t.kind].label.toLowerCase() + '.</p><button class="btn btn-primary btn-lg btn-block mt" data-act="ack" data-id="' + t.id + '">' + I("check") + "I've received it</button>";
    } else {
      side += '<div class="row small">' + I("checkCircle") + "<span>Received " + A.fmtDateTime(sub.receivedAt) + "</span></div>";
      if (t.test) {
        var att = sub.attemptId ? S().get("attempts", sub.attemptId) : null;
        var running = S().find("attempts", function (a) { return a.taskId === t.id && a.studentId === me.id && a.status !== "done"; });
        if (att && att.status === "done") side += '<div class="divider"></div><div class="small muted">Completed ' + A.fmtDateTime(att.finishedAt) + '</div><div class="row mt-sm"><div class="grade-badge" style="width:56px;height:56px;font-size:24px">' + esc(att.result.grade) + '</div><div><b style="font-size:20px">' + att.result.pct + '%</b><div class="small muted">' + att.result.got + " / " + att.result.total + ' marks</div></div></div><a class="btn btn-block mt" href="#/s/result/' + att.id + '">' + I("eye") + "Review answers</a>";
        else if (running) side += '<a class="btn btn-primary btn-lg btn-block mt" href="#/s/exam-room/' + running.id + '">' + I("play") + "Resume test</a>";
        else side += '<div class="divider"></div><p class="small">Timed test. Once you start, the clock keeps running even if you close the app.</p><button class="btn btn-primary btn-lg btn-block mt" data-act="start-task-test" data-id="' + t.id + '">' + I("play") + "Start test</button>";
      } else if (M.canSubmit(t)) {
        var locked = !!eff;
        if (sub.submittedAt) side += '<div class="callout mt" style="background:var(--good-soft);border-color:transparent">' + I("checkCircle") + "<div><b>Handed in " + A.fmtDateTime(sub.submittedAt) + ".</b> " + esc(teacherOf(c)) + " has been notified." + (sub.submittedAt > t.dueAt ? ' <span class="badge bad">Late</span>' : "") + "</div></div>";
        if (!locked) {
          side += '<div class="divider"></div><form data-submit="submit-task" data-id="' + t.id + '">' +
            '<label class="check confirm-box"><input type="checkbox" name="done"' + (sub.confirmedBook ? " checked" : "") + '><span><b>I\'ve done the work and submitted my book</b><span class="tiny muted" style="display:block">Tick this when your ' + (t.kind === "assignment" ? "assignment" : "exercise book") + " is with your teacher.</span></span></label>" +
            '<label class="field mt"><span>Note for your teacher <span class="muted">(optional)</span></span><textarea class="textarea" name="text" rows="3" placeholder="Anything your teacher should know?">' + esc(sub.text || "") + "</textarea></label>" +
            '<label class="field"><span>Photo of your work <span class="muted">(optional)</span></span><input type="file" name="file" class="input" accept="image/*,.pdf"></label>' +
            (sub.fileId ? '<p class="small mt-sm">' + I("file") + ' A photo is attached. <button type="button" class="btn btn-sm btn-ghost" data-act="open-file" data-id="' + sub.fileId + '">Open</button></p>' : "") +
            '<button class="btn btn-primary btn-lg btn-block mt" type="submit">' + I("send") + (sub.submittedAt ? "Update submission" : "Hand in and notify my teacher") + "</button></form>";
        }
      } else {
        side += '<div class="divider"></div><p class="small">' + (t.kind === "presentation" ? "You present this in class. " + esc(teacherOf(c)) + " will record your mark and feedback here afterwards." : "This test is written in class. " + esc(teacherOf(c)) + " will record your mark here.") + "</p>";
      }
    }
    side += "</div>";
    if (eff || (mk && mk.feedback)) {
      side += '<div class="card card-pad"><div class="label">Your mark</div>' + (eff ? '<div style="font-size:30px;font-weight:800" class="tnum">' + eff.score + ' <span class="muted" style="font-size:18px">/ ' + t.maxMarks + "</span></div>" + UI.bar(A.pct(eff.score, t.maxMarks), M.tone(A.pct(eff.score, t.maxMarks)), true) : "") +
        (mk && mk.feedback ? '<div class="callout mt">' + I("message") + "<div><b>" + esc(teacherOf(c)) + ":</b> " + esc(mk.feedback) + "</div></div>" : "") + "</div>";
    }
    html += '<div class="stack-lg">' + side + "</div></div>";
    return { title: t.title, crumbs: [{ label: "My tasks", href: "#/s/tasks" }, { label: subjectOf(t) }], html: html };
  }, { role: "student" });

  /** Tick the box, then confirm before the teacher is notified. */
  A.act["submit-task"] = function (form) {
    var me = M.me(), tid = form.getAttribute("data-id"), f = UI.formData(form), t = M.task(tid), c = M.cls(t.classId);
    if (!f.done) {
      UI.toast("Tick “I've done the work and submitted my book” first", "bad");
      form.querySelector(".confirm-box").classList.add("shake");
      setTimeout(function () { form.querySelector(".confirm-box").classList.remove("shake"); }, 400);
      return;
    }
    var already = M.submission(tid, me.id);
    UI.modal({
      title: already && already.submittedAt ? "Update your submission?" : "Ready to hand in?",
      body: '<div class="row top">' + I("send") + '<p>We will tell <b>' + esc(teacherOf(c)) + "</b> that you have done <b>" + esc(t.title) + "</b> and handed in your book." + (Date.now() > t.dueAt ? ' <span class="badge bad">This is late</span>' : "") + "</p></div>",
      noFocus: true,
      foot: [{ label: "Not yet" }, {
        label: "Yes, notify my teacher", cls: "btn-primary", icon: "check", onClick: function () {
          var save = f.file ? A.Files.fromInput(f.file).then(function (r) { return r.id; }) : Promise.resolve(undefined);
          return save.then(function (fileId) {
            var fields = { text: f.text.trim(), confirmedBook: true };
            if (fileId) fields.fileId = fileId;
            M.submit(tid, me.id, fields);
            UI.toast("Handed in. " + teacherOf(c) + " has been notified.");
            A.render();
          }).catch(function (e) { UI.toast("Could not save the photo: " + e.message, "bad"); return false; });
        },
      }],
    });
  };
  A.act["start-task-test"] = function (el) {
    var me = M.me(), t = M.task(el.getAttribute("data-id")), cfg = t.test;
    var att = M.createAttempt({ studentId: me.id, syllabusId: cfg.syllabusId, paperId: cfg.paperId, topicIds: cfg.topicIds, count: cfg.count, durationMin: cfg.durationMin, taskId: t.id, title: t.title });
    location.hash = "#/s/exam-room/" + att.id;
  };

  /* ============================================================== LIBRARY */
  A.route("s/library", function (p, q, me) {
    // the library is for books, notes, summaries and revision; past papers are sat in Exam mode → Test mode
    var all = M.materialsForStudent(me.id).filter(function (m) { return !M.isExamItem(m); }), subjects = {};
    var cat = q.k || "all", tag = q.tag || "", find = String(q.q || "").toLowerCase();
    var cats = {}, tags = {};
    all.forEach(function (m) { cats[M.matCategory(m)] = (cats[M.matCategory(m)] || 0) + 1; M.tagsOf(m).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    var mats = all.filter(function (m) {
      return (cat === "all" || M.matCategory(m) === cat) && (!tag || M.tagsOf(m).indexOf(tag) >= 0) &&
        (!find || (m.title + " " + (m.author || "") + " " + M.tagsOf(m).join(" ")).toLowerCase().indexOf(find) >= 0);
    });
    var named = {}; M.syllabiForStudent(me.id).forEach(function (s) { named[s.subject] = (named[s.subject] || 0) + 1; });
    mats.forEach(function (m) {
      var c = M.cls(m.classId), syl = M.syllabus(m.syllabusId || (c && c.syllabusId));
      var key = syl ? syl.subject + (named[syl.subject] > 1 ? " (" + String(syl.level || syl.code || "").replace(/^Cambridge /, "") + ")" : "") : "Other";
      (subjects[key] = subjects[key] || []).push(m);
    });
    var f = q.s || "all", keys = Object.keys(subjects).sort();
    var here = function (o) { var x = Object.assign({ s: q.s, k: q.k, tag: q.tag, q: q.q }, o), parts = []; Object.keys(x).forEach(function (k) { if (x[k] && x[k] !== "all") parts.push(k + "=" + encodeURIComponent(x[k])); }); return "#/s/library" + (parts.length ? "?" + parts.join("&") : ""); };
    var saveable = mats.filter(function (m) { return m.fileId && m.offline !== false && !A.Files.has(m.fileId) && !M.isExamItem(m); });
    var pills = '<div class="pill-tabs"><button class="' + (f === "all" ? "on" : "") + '" data-act="goto" data-href="' + here({ s: "" }) + '">All subjects (' + mats.length + ")</button>" +
      keys.map(function (k) { return '<button class="' + (f === k ? "on" : "") + '" data-act="goto" data-href="' + here({ s: k }) + '">' + esc(k) + " (" + subjects[k].length + ")</button>"; }).join("") + "</div>" +
      '<div class="row wrap lib-filters"><div class="pill-tabs sm"><button class="' + (cat === "all" ? "on" : "") + '" data-act="goto" data-href="' + here({ k: "" }) + '">Everything</button>' +
      Object.keys(M.MAT_CATS).filter(function (c) { return cats[c]; }).map(function (c) { return '<button class="' + (cat === c ? "on" : "") + '" data-act="goto" data-href="' + here({ k: c }) + '">' + esc(M.MAT_CATS[c]) + " (" + cats[c] + ")</button>"; }).join("") + "</div>" +
      '<form data-submit="lib-search" class="row"><input class="input sm" name="q" value="' + esc(q.q || "") + '" placeholder="Search the library" aria-label="Search the library" style="width:200px"><button class="btn btn-sm" type="submit">' + I("search") + "</button></form></div>" +
      (Object.keys(tags).length ? '<div class="row wrap lib-tags">' + (tag ? '<a class="tag on" href="' + here({ tag: "" }) + '">' + I("x") + esc(tag) + "</a>" : "") +
        Object.keys(tags).sort().filter(function (t) { return t !== tag; }).map(function (t) { return '<a class="tag" href="' + here({ tag: t }) + '">' + esc(t) + "</a>"; }).join("") + "</div>" : "");
    var html = '<div class="row wrap spread mb"><p class="muted" style="max-width:640px">Books, notes, summary notes and revision material from your teachers. Everything opens inside the app. Items marked <b>On this device</b> work with no internet.</p>' +
      (saveable.length ? '<button class="btn" data-act="save-all-offline">' + I("download") + "Save " + saveable.length + " for offline</button>" : '<span class="badge good">' + I("checkCircle") + "Study material is saved on this device</span>") + "</div>" + pills;
    (f === "all" ? keys : [f]).forEach(function (k) {
      if (!subjects[k]) return;
      var study = subjects[k];
      var papers = [];
      html += '<div class="section-title"><h2>' + esc(k) + "</h2></div>" +
        (study.length ? '<div class="card">' + study.map(function (m) { return A.materialRow(m, { student: true }); }).join("") + "</div>" : "") +
        (papers.length ? '<div class="card' + (study.length ? " mt" : "") + '"><div class="card-head">' + I("award") + "<h3>Exam papers</h3><span class=\"sub\">Sit a paper against its real clock, then mark it with the marking scheme</span></div>" +
          papers.map(function (m) { return A.materialRow(m, { student: true }); }).join("") + "</div>" : "");
    });
    if (!mats.length) html += '<div class="card">' + (all.length ? UI.empty("search", "Nothing matches", "Try another kind of material, tag or search.") : UI.empty("library", "Your library is empty", "Books, notes and revision material your teachers share will appear here. Past papers are in Exam mode, under Test mode.")) + "</div>";
    else html += '<p class="small muted mt">' + I("award") + ' Looking for past papers? They are in <a href="#/s/exam">Exam mode</a>: open a subject\'s <b>Test mode</b>.</p>';
    return { title: "Library", html: html };
  }, { role: "student" });

  A.act["lib-search"] = function (form) {
    var h = location.hash.replace(/([?&])q=[^&]*/, "$1").replace(/[?&]$/, ""), v = form.q.value.trim();
    location.hash = h + (v ? (h.indexOf("?") >= 0 ? "&" : "?") + "q=" + encodeURIComponent(v) : "");
  };

  /* ========================================================= NOTIFICATIONS */
  A.route("s/notifications", function (p, q, me) {
    var msgs = M.messagesForStudent(me.id);
    return { title: "Notifications", html: '<p class="muted mb">Messages from your teachers. Study notes for each topic are in Exam mode.</p><div class="card">' + (msgs.length ? msgs.map(function (m) { return noteRow(m, me); }).join("") : UI.empty("bell", "No notifications yet")) + "</div>" };
  }, { role: "student" });

  /* ============================================================= PROGRESS */
  A.route("s/progress", function (p, q, me) {
    var syllabi = M.syllabiForStudent(me.id);
    if (!syllabi.length) return { title: "My progress", html: '<div class="card">' + UI.empty("chart", "No subjects yet") + "</div>" };
    var sel = M.syllabus(q.s) || syllabi[0], pr = M.syllabusProgress(me.id, sel), atts = M.attemptsFor(me.id, sel.id).slice().reverse();
    var concepts = M.conceptSummary(M.attemptsFor(me.id, sel.id)), cls = M.classForSyllabus(me.id, sel.id), stats = M.studentStats(me.id, cls);
    var pills = syllabi.length > 1 ? '<div class="pill-tabs">' + syllabi.map(function (s) { return '<button class="' + (s.id === sel.id ? "on" : "") + '" data-act="goto" data-href="#/s/progress?s=' + s.id + '">' + esc(s.subject) + "</button>"; }).join("") + "</div>" : "";

    var html = pills + '<div class="grid g-4">' +
      UI.stat("layers", pr.pct + "%", "Syllabus completed", false, pr.done + " of " + pr.total + " topics") +
      UI.stat("clock", A.fmtMinutes(pr.minsLeft * 60), "Study time left (est.)") +
      UI.stat("award", stats.avgScore == null ? "—" : stats.avgScore + "%", "Average score", true) +
      UI.stat("calendar", stats.attendance == null ? "—" : stats.attendance + "%", "Attendance") + "</div>";

    html += '<div class="grid g-2 mt"><div class="card"><div class="card-head"><h3>Test scores over time</h3><span class="sub">' + esc(sel.subject) + "</span></div><div class=\"card-body\">" +
      UI.lineChart(atts.map(function (a) { return { label: A.fmtDate(a.finishedAt).slice(4), value: a.result.pct, tip: "<b>" + esc(a.title) + "</b><br>" + A.fmtDate(a.finishedAt) + " · " + a.result.pct + "% · grade " + esc(a.result.grade) }; }), { ref: M.EXAM.passMark, emptyTitle: "No tests yet", emptyText: "Take a test in Exam mode to start your graph." }) + "</div></div>" +
      '<div class="card"><div class="card-head"><h3>Concepts from your tests</h3><span class="sub">last 5 tests</span></div><div class="card-body">' + UI.toneLegend() + '<div class="mt">' +
      UI.hbars(concepts.map(function (x) { return { label: x.title, pct: x.pct, tone: x.tone, href: "#/s/topic/" + sel.id + "/" + x.id, tip: x.title + ": " + x.got + "/" + x.total + " marks · " + M.toneLabel(x.pct) }; }), { emptyTitle: "No tests yet" }) + "</div></div></div></div>";

    html += '<div class="section-title"><h2>Topics</h2><span class="sub">complete a topic by scoring ' + M.EXAM.topicMasteryMark + '% or more in its practice questions</span></div><div class="card">' +
      sel.topics.map(function (t, i) { return topicRow(me, sel, t, i, pr.byTopic[t.id], M.topicAccess(me.id, cls, sel, t)); }).join("") + "</div>";
    return { title: "My progress", html: html };
  }, { role: "student" });

  /** acc = M.topicAccess(...) result (or a boolean for "open"). */
  function topicRow(me, syl, t, i, x, acc) {
    if (typeof acc === "boolean") acc = { open: acc, reason: "teacher" };
    var rec = x.rec, lock = !acc.open;
    var badge = x.state === "done" ? '<span class="badge good">' + I("checkCircle") + "Completed</span>" : lock ? '<span class="badge">' + I("lock") + esc(M.lockText(acc)) + "</span>" : x.state === "prog" ? '<span class="badge warn">In progress</span>' : '<span class="badge">Not started</span>';
    var inner = '<span class="topic-num ' + (x.state === "done" ? "done" : lock ? "lock" : x.state === "prog" ? "prog" : "") + '">' + (x.state === "done" ? I("check") : lock ? I("lock") : i + 1) + '</span><div class="grow"><div class="bold">' + esc(t.title) + '</div><div class="tiny muted">' + esc(t.summary || "") + "</div>" +
      (rec && rec.practiceBest != null ? '<div class="row mt-sm" style="max-width:280px"><div class="grow">' + UI.bar(rec.practiceBest, M.tone(rec.practiceBest)) + '</div><span class="tiny muted nowrap">best ' + rec.practiceBest + "%</span></div>" : "") + "</div>" +
      (!lock && M.tutorHas && M.tutorHas(me.id, syl.id, t.id) ? '<span class="badge brand" data-tip="The tutor has notes and flashcards for this topic">' + I("cap") + "Tutor</span>" : "") + badge;
    return lock ? '<div class="topic-row locked">' + inner + "</div>" : '<a class="topic-row" href="#/s/topic/' + syl.id + "/" + t.id + '">' + inner + I("right") + "</a>";
  }
  A.topicRow = topicRow;

  /* ============================================================= SETTINGS */
  A.route("s/settings", function (p, q, me) { return A.settingsView(me, q); }, { role: "student" });
})(window.App);
