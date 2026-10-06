/* Domain rules: who sees what, task status, progress, grading, statistics. */
(function (A) {
  "use strict";

  var S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var EXAM = Object.assign({ passMark: 50, topicMasteryMark: 60, strongTopicMark: 70 }, CFG.exam || {});
  var SESSION_KEY = "sca-session";

  var M = (A.M = { EXAM: EXAM });

  M.KINDS = {
    homework: { label: "Homework", icon: "notebook" },
    assignment: { label: "Assignment", icon: "file" },
    test: { label: "Test", icon: "target" },
    presentation: { label: "Presentation", icon: "present" },
  };
  M.kindBadge = function (kind) {
    var k = M.KINDS[kind] || M.KINDS.homework;
    return '<span class="badge k-' + kind + '">' + A.icon(k.icon) + k.label + "</span>";
  };

  /* ------------------------------------------------------------- session */
  M.me = function () {
    var id; try { id = localStorage.getItem(SESSION_KEY); } catch (e) { id = null; }
    return id ? S().get("users", id) : null;
  };
  M.signIn = function (id) { try { localStorage.setItem(SESSION_KEY, id); } catch (e) { /* ignore */ } };
  M.signOut = function () { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } };

  /* ---------------------------------------------------------- people/classes */
  M.user = function (id) { return S().get("users", id); };
  M.students = function () { return S().filter("users", function (u) { return u.role === "student"; }).sort(byName); };
  M.teachers = function () { return S().filter("users", function (u) { return u.role === "teacher"; }).sort(byName); };
  function byName(a, b) { return a.name.localeCompare(b.name); }
  M.byName = byName;

  M.cls = function (id) { return S().get("classes", id); };
  M.classesForTeacher = function (tid) {
    // online, every admin looks after the classes of subjects that have no teacher of their own
    var u = A.Cloud && S().get("users", tid), pool = u && u.isAdmin && tid !== "t_admin";
    return S().filter("classes", function (c) { return c.teacherId === tid || (pool && c.teacherId === "t_admin"); }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  };
  M.classesForStudent = function (sid) { return S().filter("classes", function (c) { return (c.studentIds || []).indexOf(sid) >= 0; }); };
  M.studentsOf = function (cls) { return (cls.studentIds || []).map(M.user).filter(Boolean).sort(byName); };
  M.className = function (c) { return c ? c.name + " · " + c.subject : "—"; };

  /* ------------------------------------------------ school class structure
     Levels (Form 1–6, Grade 1–7…) split into streams the school chooses:
     letters (4A), colours (Form 4 Blue), animals (Form 4 Lion) or custom. */
  M.STREAM_PRESETS = {
    letters: ["A", "B", "C", "D", "E"],
    colours: ["Blue", "Green", "Red", "Yellow", "White"],
    animals: ["Lion", "Eagle", "Elephant", "Cheetah", "Buffalo"],
  };
  M.structure = function () {
    var c = CFG.structure || {}, o = S().get("settings", "structure") || {};
    return {
      levelLabel: o.levelLabel || c.levelLabel || "Form",
      levels: (o.levels && o.levels.length ? o.levels : c.levels) || ["Form 1", "Form 2", "Form 3", "Form 4"],
      streamStyle: o.streamStyle || c.streamStyle || "letters",
      streams: (o.streams && o.streams.length ? o.streams : c.streams) || ["A", "B"],
    };
  };
  M.homeClassName = function (level, stream) {
    if (!level) return stream || "";
    if (!stream) return level;
    return /^[A-Z0-9]$/.test(stream) ? level + stream : level + " " + stream;
  };
  M.studentHome = function (u) { return u ? M.homeClassName(u.level, u.stream) : ""; };
  M.levelIndex = function (level) { var i = M.structure().levels.indexOf(level); return i < 0 ? 99 : i; };
  M.streamIndex = function (stream) { var i = M.structure().streams.indexOf(stream); return i < 0 ? 99 : i; };

  /* -------------------------------------------------- student passwords
     Students sign in with their student ID and a password they create the
     first time. Admins can see and reset passwords (Settings → People). */
  M.credential = function (uid) { return S().get("credentials", "cr_" + uid); };
  M.hasPassword = function (uid) { var c = M.credential(uid); return !!(c && c.password); };
  M.setPassword = function (uid, pw, by) {
    return S().put("credentials", { id: "cr_" + uid, userId: uid, password: pw, setAt: Date.now(), setBy: by || uid });
  };
  M.resetPassword = function (uid, by) {
    return S().put("credentials", { id: "cr_" + uid, userId: uid, password: null, resetAt: Date.now(), setBy: by });
  };
  M.studentById = function (no) {
    var key = String(no || "").trim().toLowerCase();
    return key ? S().find("users", function (u) { return u.role === "student" && String(u.studentNo || "").toLowerCase() === key; }) : null;
  };
  M.sameName = function (a, b) {
    var n = function (x) { return String(x || "").toLowerCase().replace(/[^a-z]/g, ""); };
    return !!n(a) && n(a) === n(b);
  };

  /* --------------------------------------------------------------- syllabi */
  M.syllabus = function (id) { return S().get("syllabi", id); };
  M.syllabusTitle = function (s) { return s ? s.board + " " + s.level + " " + s.subject + (s.code ? " (" + s.code + ")" : "") : "—"; };
  M.topic = function (syl, tid) { return syl ? (syl.topics || []).find(function (t) { return t.id === tid; }) || null : null; };
  M.questionIndex = function (syl) {
    var idx = {};
    (syl.topics || []).forEach(function (t) { (t.questions || []).forEach(function (q) { idx[q.id] = { q: q, topic: t }; }); });
    return idx;
  };
  M.allQuestions = function (syl) {
    var out = [];
    (syl.topics || []).forEach(function (t) { (t.questions || []).forEach(function (q) { out.push({ q: q, topic: t }); }); });
    return out;
  };
  M.syllabiForStudent = function (sid) {
    var seen = {}, out = [];
    M.classesForStudent(sid).forEach(function (c) {
      var s = M.syllabus(c.syllabusId);
      if (s && !seen[s.id]) { seen[s.id] = 1; out.push(s); }
    });
    return out;
  };
  /* -------------------------------------------------------- topic access
     Default: a topic is open when its term has been opened for the class.
     The teacher can override any topic (open / locked) with exceptions for
     chosen students, and can require topics to be completed in order. */
  M.topicTerm = function (t) { return Number(t && t.term) || 1; };
  M.syllabusTerms = function (syl) {
    var set = {};
    (syl.topics || []).forEach(function (t) { set[M.topicTerm(t)] = 1; });
    return Object.keys(set).map(Number).sort();
  };
  M.termName = function (n) { return ((CFG.terms || [])[n - 1]) || "Term " + n; };
  function baseOpen(sid, cls, t) {
    var ov = (cls.topicAccess || {})[t.id];
    var open = ov ? ov.mode === "open" : M.topicTerm(t) <= (cls.currentTerm || 1);
    if (ov && sid && (ov.except || []).indexOf(sid) >= 0) open = !open;
    return open;
  }
  /** Class-wide setting (ignores per-student exceptions). */
  M.topicClassSetting = function (cls, t) {
    var ov = (cls.topicAccess || {})[t.id];
    var open = ov ? ov.mode === "open" : M.topicTerm(t) <= (cls.currentTerm || 1);
    return { open: open, override: !!ov, except: (ov && ov.except) || [] };
  };
  /** -> { open, reason: term|teacher|student|sequence, prev?, term? } */
  M.topicAccess = function (sid, cls, syl, t) {
    if (!cls || !t) return { open: false, reason: "teacher" };
    if (!baseOpen(sid, cls, t)) {
      var ov = (cls.topicAccess || {})[t.id], mine = ov && (ov.except || []).indexOf(sid) >= 0;
      return { open: false, reason: mine ? "student" : ov ? "teacher" : "term", term: M.topicTerm(t) };
    }
    if (cls.sequential) {
      var i = syl.topics.indexOf(t);
      for (var j = i - 1; j >= 0; j--) {
        var p = syl.topics[j];
        if (!baseOpen(sid, cls, p)) continue;
        if (M.topicState(M.topicProgress(sid, p.id), p) !== "done") return { open: false, reason: "sequence", prev: p };
        break;
      }
    }
    return { open: true };
  };
  M.lockText = function (acc) {
    if (!acc || acc.open) return "";
    if (acc.reason === "term") return "Opens in " + M.termName(acc.term);
    if (acc.reason === "sequence") return "Finish \u201c" + acc.prev.title + "\u201d first";
    if (acc.reason === "student") return "Locked for you by your teacher";
    return "Locked by your teacher";
  };
  /** Map of topic ids this student may open in a syllabus. */
  M.releasedFor = function (sid, sylId) {
    var set = {}, syl = M.syllabus(sylId), cls = M.classForSyllabus(sid, sylId);
    if (!syl || !cls) return set;
    syl.topics.forEach(function (t) { if (M.topicAccess(sid, cls, syl, t).open) set[t.id] = true; });
    return set;
  };
  /** A finished term: what the student completed and what is still unfinished. */
  M.termReview = function (sid, syl, term) {
    var topics = syl.topics.filter(function (t) { return M.topicTerm(t) === term; });
    var unfinished = topics.filter(function (t) { return M.topicState(M.topicProgress(sid, t.id), t) !== "done"; });
    return { term: term, total: topics.length, done: topics.length - unfinished.length, unfinished: unfinished, pct: A.pct(topics.length - unfinished.length, topics.length) };
  };
  M.classForSyllabus = function (sid, sylId) {
    return M.classesForStudent(sid).find(function (c) { return c.syllabusId === sylId; }) || null;
  };

  /* ------------------------------------------------------------------ tasks */
  M.task = function (id) { return S().get("tasks", id); };
  M.isAssigned = function (task, sid) {
    var c = M.cls(task.classId);
    if (!c || (c.studentIds || []).indexOf(sid) < 0) return false;
    return task.assignedTo === "all" || (Array.isArray(task.assignedTo) && task.assignedTo.indexOf(sid) >= 0);
  };
  M.assignees = function (task) {
    var c = M.cls(task.classId);
    if (!c) return [];
    var ids = task.assignedTo === "all" ? c.studentIds || [] : (task.assignedTo || []).filter(function (id) { return (c.studentIds || []).indexOf(id) >= 0; });
    return ids.map(M.user).filter(Boolean).sort(byName);
  };
  M.tasksForClass = function (cid) { return S().filter("tasks", function (t) { return t.classId === cid; }).sort(byDue); };
  M.tasksForStudent = function (sid) { return S().filter("tasks", function (t) { return M.isAssigned(t, sid); }).sort(byDue); };
  function byDue(a, b) { return (a.dueAt || 9e15) - (b.dueAt || 9e15); }

  var subId = function (tid, sid) { return "sub_" + tid + "_" + sid; };
  M.submission = function (tid, sid) { return S().get("submissions", subId(tid, sid)); };
  M.mark = function (tid, sid) { return S().get("marks", "mk_" + tid + "_" + sid); };

  M.acknowledge = function (tid, sid) {
    var cur = M.submission(tid, sid) || { id: subId(tid, sid), taskId: tid, studentId: sid };
    if (cur.receivedAt) return cur;
    cur.receivedAt = Date.now();
    return S().put("submissions", Object.assign({}, cur));
  };
  M.submit = function (tid, sid, fields) {
    var cur = M.submission(tid, sid) || { id: subId(tid, sid), taskId: tid, studentId: sid };
    return S().put("submissions", Object.assign({}, cur, { receivedAt: cur.receivedAt || Date.now(), submittedAt: Date.now() }, fields));
  };
  M.setMark = function (tid, sid, score, feedback) {
    var id = "mk_" + tid + "_" + sid, cur = S().get("marks", id) || { id: id, taskId: tid, studentId: sid };
    var rec = Object.assign({}, cur);
    if (score !== undefined) rec.score = score === "" || score == null ? null : Number(score);
    if (feedback !== undefined) rec.feedback = feedback;
    rec.markedAt = Date.now();
    return S().put("marks", rec);
  };
  /** Teacher mark wins; otherwise an online test's auto-score is scaled to the task's max. */
  M.effectiveScore = function (task, sid) {
    var mk = M.mark(task.id, sid);
    if (mk && mk.score != null && !isNaN(mk.score)) return { score: mk.score, source: "teacher" };
    var sub = M.submission(task.id, sid);
    if (sub && sub.autoPct != null && task.maxMarks) return { score: Math.round((sub.autoPct / 100) * task.maxMarks * 10) / 10, source: "auto" };
    return null;
  };
  M.taskStatus = function (task, sid) {
    var sub = M.submission(task.id, sid), sc = M.effectiveScore(task, sid);
    if (sc) return { key: "graded", label: "Graded", tone: "good" };
    if (sub && sub.submittedAt) return { key: "submitted", label: task.kind === "presentation" ? "Ready" : "Submitted", tone: "brand" };
    var overdue = task.dueAt && task.dueAt < Date.now();
    if (sub && sub.receivedAt) return overdue ? { key: "overdue", label: "Overdue", tone: "bad" } : { key: "received", label: "Received", tone: "" };
    return overdue ? { key: "overdue", label: "Not received", tone: "bad" } : { key: "new", label: "New", tone: "accent" };
  };
  /** Only homework and assignments are handed in; tests and presentations are marked by the teacher. */
  M.canSubmit = function (task) { return task.kind === "homework" || task.kind === "assignment"; };
  M.needsMarking = function (task) {
    if (!task.maxMarks) return 0;
    return M.assignees(task).filter(function (u) { var s = M.submission(task.id, u.id); return s && s.submittedAt && !M.effectiveScore(task, u.id); }).length;
  };
  M.notSubmitted = function (task) {
    return M.assignees(task).filter(function (u) { var s = M.submission(task.id, u.id); return !s || !s.submittedAt; });
  };
  /** Labels a teacher sees on a task: all handed in, needs marking, due now / missing. */
  M.taskFlags = function (task) {
    var out = [], n = M.taskCounts(task), mark = M.needsMarking(task);
    if (M.canSubmit(task) && n.total && n.submitted === n.total) out.push('<span class="badge good">' + A.icon("checkCircle") + "All submitted</span>");
    if (mark) out.push('<span class="badge serious">' + A.icon("pen") + "Needs marking · " + mark + "</span>");
    if (M.canSubmit(task) && task.dueAt && Date.now() >= task.dueAt - 5 * 60000 && n.submitted < n.total) {
      out.push('<span class="badge bad">' + A.icon("alert") + (Date.now() < task.dueAt ? "Due now" : "Not submitted") + " · " + (n.total - n.submitted) + "</span>");
    }
    return out.join("");
  };
  M.statusBadge = function (st) { return '<span class="badge ' + st.tone + '">' + A.esc(st.label) + "</span>"; };
  M.taskCounts = function (task) {
    var who = M.assignees(task), rec = 0, subm = 0, graded = 0;
    who.forEach(function (u) {
      var s = M.submission(task.id, u.id);
      if (s && s.receivedAt) rec++;
      if (s && s.submittedAt) subm++;
      if (M.effectiveScore(task, u.id)) graded++;
    });
    return { total: who.length, received: rec, submitted: subm, graded: graded };
  };

  /* ---------------------------------------------------------- school day
     Work can only be due Monday to Friday, between 08:00 and 16:00. */
  M.DAY_START = "08:00";
  M.DAY_END = "16:00";
  M.isSchoolDay = function (ts) { var d = new Date(ts).getDay(); return d >= 1 && d <= 5; };
  M.schoolDays = function (from, count) {
    var out = [], d = A.startOfDay(from == null ? Date.now() : from);
    while (out.length < count) { if (M.isSchoolDay(d)) out.push(d); d = A.startOfDay(d + 36 * 3600000); }
    return out;
  };
  M.dueTimes = function () {
    var out = [];
    for (var m = A.hm(M.DAY_START); m <= A.hm(M.DAY_END); m += 30) out.push(A.pad(Math.floor(m / 60)) + ":" + A.pad(m % 60));
    return out;
  };
  /** Clamp any timestamp into school hours on a school day (used for seeds and imports). */
  M.toSchoolTime = function (ts) {
    var d = A.startOfDay(ts), mins = Math.round((ts - d) / 60000);
    mins = A.clamp(mins, A.hm(M.DAY_START), A.hm(M.DAY_END));
    while (!M.isSchoolDay(d)) d = A.startOfDay(d + 36 * 3600000);
    return d + mins * 60000;
  };

  /* --------------------------------------------------------------- messages */
  M.messagesForStudent = function (sid) {
    return S().filter("messages", function (m) {
      var c = M.cls(m.classId);
      if (!c || (c.studentIds || []).indexOf(sid) < 0) return false;
      return m.to === "all" || (Array.isArray(m.to) && m.to.indexOf(sid) >= 0);
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  };
  M.isRead = function (mid, sid) { return !!S().get("receipts", "rc_" + mid + "_" + sid); };
  M.markRead = function (mid, sid) {
    if (M.isRead(mid, sid)) return;
    S().put("receipts", { id: "rc_" + mid + "_" + sid, messageId: mid, studentId: sid, readAt: Date.now() });
  };
  M.unreadCount = function (sid) { return M.messagesForStudent(sid).filter(function (m) { return !M.isRead(m.id, sid); }).length; };
  M.recipients = function (msg) {
    var c = M.cls(msg.classId);
    if (!c) return [];
    return (msg.to === "all" ? c.studentIds : msg.to || []).map(M.user).filter(Boolean);
  };

  /* -------------------------------------------------------------- materials */
  M.materialVisibleTo = function (mat, sid) {
    if (mat.kind === "markscheme" && mat.msVisibility === "hidden") return false;
    if (mat.syllabusId && !mat.classId) {
      return M.classesForStudent(sid).some(function (c) { return c.syllabusId === mat.syllabusId; });
    }
    var c = M.cls(mat.classId);
    if (!c || (c.studentIds || []).indexOf(sid) < 0) return false;
    return mat.audience === "all" || (Array.isArray(mat.audience) && mat.audience.indexOf(sid) >= 0);
  };
  M.materialsForStudent = function (sid) {
    return S().filter("materials", function (m) { return M.materialVisibleTo(m, sid); }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  };
  M.MAT_KINDS = {
    pdf: { label: "PDF", icon: "file" },
    textbook: { label: "Textbook", icon: "library" },
    link: { label: "Web link", icon: "link" },
    note: { label: "Teacher note", icon: "pen" },
    pastpaper: { label: "Past paper", icon: "award" },
  };

  /* ------------------------------------------------------------- attendance */
  M.ATT = { P: "Present", A: "Absent", L: "Late", E: "Excused" };
  M.register = function (cid, date) { return S().get("attendance", "att_" + cid + "_" + date); };
  M.saveRegister = function (cid, date, marks) {
    return S().put("attendance", { id: "att_" + cid + "_" + date, classId: cid, date: date, marks: marks, takenBy: (M.me() || {}).id });
  };
  M.attendanceRate = function (sid, cid) {
    var present = 0, counted = 0;
    S().filter("attendance", function (r) { return (!cid || r.classId === cid) && r.marks && r.marks[sid]; }).forEach(function (r) {
      var v = r.marks[sid];
      if (v === "E") return;
      counted++;
      if (v === "P" || v === "L") present++;
    });
    return counted ? Math.round((present / counted) * 100) : null;
  };
  M.recentRegisters = function (cid, n) {
    return S().filter("attendance", function (r) { return r.classId === cid; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, n || 10);
  };

  /* --------------------------------------------------------------- progress */
  var prId = function (sid, tid) { return "pr_" + sid + "_" + tid; };
  M.topicProgress = function (sid, tid) { return S().get("progress", prId(sid, tid)); };
  /** topic (optional): a topic with no practice questions is done once its notes are marked as revised. */
  M.topicState = function (rec, topic) {
    if (!rec) return "none";
    if ((rec.practiceBest || 0) >= EXAM.topicMasteryMark) return "done";
    if (topic && !(topic.questions || []).length && rec.notesReadAt) return "done";
    if (rec.notesReadAt || rec.practiceAttempts) return "prog";
    if (rec.tutor && (Object.keys(rec.tutor.read || {}).length || Object.keys(rec.tutor.cards || {}).length)) return "prog"; // working through the tutor
    return "none";
  };
  M.markNotesRead = function (sid, sylId, tid) {
    var cur = M.topicProgress(sid, tid) || { id: prId(sid, tid), studentId: sid, syllabusId: sylId, topicId: tid };
    return S().put("progress", Object.assign({}, cur, { notesReadAt: cur.notesReadAt || Date.now(), lastStudiedAt: Date.now() }));
  };
  M.touchTopic = function (sid, sylId, tid) {
    var cur = M.topicProgress(sid, tid) || { id: prId(sid, tid), studentId: sid, syllabusId: sylId, topicId: tid };
    return S().put("progress", Object.assign({}, cur, { lastStudiedAt: Date.now() }));
  };
  M.recordPractice = function (sid, sylId, tid, pct) {
    var cur = M.topicProgress(sid, tid) || { id: prId(sid, tid), studentId: sid, syllabusId: sylId, topicId: tid };
    var rec = Object.assign({}, cur, {
      practiceAttempts: (cur.practiceAttempts || 0) + 1,
      practiceLast: pct,
      practiceBest: Math.max(cur.practiceBest || 0, pct),
      lastStudiedAt: Date.now(),
    });
    if (rec.practiceBest >= EXAM.topicMasteryMark && !rec.completedAt) rec.completedAt = Date.now();
    return S().put("progress", rec);
  };
  /** Syllabus coverage for one student. */
  M.syllabusProgress = function (sid, syl) {
    var topics = syl.topics || [], done = 0, prog = 0, minsLeft = 0, last = 0, byTopic = {};
    topics.forEach(function (t) {
      var rec = M.topicProgress(sid, t.id), st = M.topicState(rec, t);
      byTopic[t.id] = { rec: rec, state: st };
      if (st === "done") done++; else { minsLeft += t.estMinutes || 30; if (st === "prog") prog++; }
      if (rec && rec.lastStudiedAt > last) last = rec.lastStudiedAt;
    });
    return { total: topics.length, done: done, prog: prog, pct: A.pct(done, topics.length), minsLeft: minsLeft, lastStudiedAt: last, byTopic: byTopic };
  };

  /* ------------------------------------------------------------ exam engine */
  M.gradeFor = function (pct, syl) {
    var scale = (syl && syl.gradeScale && syl.gradeScale.length ? syl.gradeScale : [
      { grade: "A", min: 75 }, { grade: "B", min: 65 }, { grade: "C", min: 50 }, { grade: "D", min: 40 }, { grade: "E", min: 30 }, { grade: "U", min: 0 },
    ]).slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < scale.length; i++) if (pct >= scale[i].min) return scale[i].grade;
    return scale[scale.length - 1].grade;
  };
  M.Q_TYPES = {
    mcq: "Multiple choice", tf: "True / False", short: "Short answer", numeric: "Numeric answer", structured: "Structured (self-marked)",
  };
  /** → { state: right|wrong|blank|self, got, marks } */
  M.gradeQuestion = function (q, ans, selfMark) {
    var marks = Number(q.marks) || 1;
    if (q.type === "structured") {
      var has = ans != null && String(ans).trim() !== "";
      return { state: has ? "self" : "blank", got: has && selfMark != null ? A.clamp(Number(selfMark), 0, marks) : 0, marks: marks, pending: has && selfMark == null };
    }
    if (ans == null || ans === "") return { state: "blank", got: 0, marks: marks };
    var ok = false;
    if (q.type === "mcq") ok = Number(ans) === Number(q.answer);
    else if (q.type === "tf") ok = String(ans) === String(q.answer);
    else if (q.type === "numeric") {
      var m = String(ans).replace(/,/g, "").match(/-?\d*\.?\d+(e-?\d+)?/i);
      var v = m ? parseFloat(m[0]) : NaN, target = Number(q.answer);
      var tol = q.tolerance != null ? Number(q.tolerance) : Math.max(0.01, Math.abs(target) * 0.005);
      ok = !isNaN(v) && Math.abs(v - target) <= tol;
    } else {
      var accepted = [].concat(q.answer).map(A.normAnswer);
      ok = accepted.indexOf(A.normAnswer(ans)) >= 0;
    }
    return { state: ok ? "right" : "wrong", got: ok ? marks : 0, marks: marks };
  };
  M.answerText = function (q) {
    if (q.type === "mcq") return (q.options || [])[q.answer];
    if (q.type === "tf") return String(q.answer) === "true" ? "True" : "False";
    if (q.type === "structured") return q.markScheme || "";
    return [].concat(q.answer).join("  or  ");
  };

  /** opts: { studentId, syllabusId, paperId?, taskId?, topicIds?, count?, durationMin?, title? } */
  M.createAttempt = function (opts) {
    var syl = M.syllabus(opts.syllabusId), qids, title = opts.title, dur = opts.durationMin;
    var paper = opts.paperId ? (syl.papers || []).find(function (p) { return p.id === opts.paperId; }) : null;
    if (paper) {
      var idx = M.questionIndex(syl);
      qids = (paper.questionIds || []).filter(function (id) { return idx[id]; });
      title = title || paper.title;
      dur = dur || paper.durationMin;
    } else {
      var pool = M.allQuestions(syl).filter(function (x) { return !opts.topicIds || opts.topicIds.indexOf(x.topic.id) >= 0; });
      qids = A.shuffle(pool).slice(0, opts.count || 10).map(function (x) { return x.q.id; });
      title = title || "Custom test";
    }
    return S().put("attempts", {
      id: A.uid("att"), studentId: opts.studentId, syllabusId: syl.id, paperId: paper ? paper.id : null, taskId: opts.taskId || null,
      config: { paperId: opts.paperId || null, topicIds: opts.topicIds || null, count: opts.count || null, durationMin: dur || 30 },
      title: title, questionIds: qids, durationSec: Math.round((dur || 30) * 60), status: "ready",
      answers: {}, flags: {}, selfMarks: {}, leftCount: 0,
    });
  };
  M.startAttempt = function (att) {
    if (att.status !== "ready") return att;
    return S().put("attempts", Object.assign({}, att, { status: "running", startedAt: Date.now(), endsAt: Date.now() + att.durationSec * 1000 }));
  };
  M.scoreAttempt = function (att) {
    var syl = M.syllabus(att.syllabusId), idx = syl ? M.questionIndex(syl) : {}, got = 0, total = 0, pending = 0, perTopic = {};
    (att.questionIds || []).forEach(function (qid) {
      var e = idx[qid];
      if (!e) return;
      var g = M.gradeQuestion(e.q, att.answers[qid], att.selfMarks && att.selfMarks[qid]);
      got += g.got; total += g.marks; if (g.pending) pending++;
      var t = (perTopic[e.topic.id] = perTopic[e.topic.id] || { got: 0, total: 0, title: e.topic.title });
      t.got += g.got; t.total += g.marks;
    });
    var pct = A.pct(got, total);
    return { got: got, total: total, pct: pct, grade: M.gradeFor(pct, syl), perTopic: perTopic, pending: pending, passed: pct >= EXAM.passMark };
  };
  M.finishAttempt = function (att, auto) {
    var done = Object.assign({}, att, { status: "done", finishedAt: Date.now(), autoSubmitted: !!auto });
    done.timeUsedSec = Math.min(att.durationSec, Math.round((done.finishedAt - (att.startedAt || done.finishedAt)) / 1000));
    done.result = M.scoreAttempt(done);
    S().put("attempts", done);
    if (att.taskId) M.submit(att.taskId, att.studentId, { attemptId: att.id, autoPct: done.result.pct });
    return done;
  };
  M.rescore = function (att) {
    var rec = Object.assign({}, att, { result: M.scoreAttempt(att) });
    S().put("attempts", rec);
    if (att.taskId) M.submit(att.taskId, att.studentId, { attemptId: att.id, autoPct: rec.result.pct });
    return rec;
  };
  M.attemptsFor = function (sid, sylId) {
    return S().filter("attempts", function (a) { return a.studentId === sid && a.status === "done" && (!sylId || a.syllabusId === sylId); })
      .sort(function (a, b) { return b.finishedAt - a.finishedAt; });
  };
  M.runningAttempt = function (sid) {
    return S().find("attempts", function (a) { return a.studentId === sid && a.status === "running"; });
  };
  /** Topic strengths across the most recent attempts (up to 5). */
  M.conceptSummary = function (attempts) {
    var agg = {};
    attempts.slice(0, 5).forEach(function (a) {
      var pt = (a.result && a.result.perTopic) || {};
      Object.keys(pt).forEach(function (tid) {
        var x = (agg[tid] = agg[tid] || { id: tid, title: pt[tid].title, got: 0, total: 0 });
        x.got += pt[tid].got; x.total += pt[tid].total;
      });
    });
    return Object.keys(agg).map(function (k) { var x = agg[k]; x.pct = A.pct(x.got, x.total); x.tone = M.tone(x.pct); return x; })
      .sort(function (a, b) { return b.pct - a.pct; });
  };
  M.tone = function (pct) {
    if (pct == null) return "";
    return pct >= EXAM.strongTopicMark ? "good" : pct >= EXAM.passMark ? "warn" : "bad";
  };
  M.toneLabel = function (pct) {
    return pct >= EXAM.strongTopicMark ? "Strong" : pct >= EXAM.passMark ? "Developing" : "Needs work";
  };

  /* ------------------------------------------------------- exam integrity
     Written answers that are (nearly) word-for-word the marking scheme are
     counted. If the share of identical answers reaches the teacher's threshold
     the paper is flagged as possible copying. */
  M.IDENTICAL = 0.9;
  function normText(x) {
    return String(x || "").toLowerCase()
      .replace(/\[\s*\d+\s*\]/g, " ").replace(/\(maximum[^)]*\)/g, " ").replace(/any (one|two|three|four) of:?/g, " ")
      .replace(/[\u2022\u2013\u2014\-]/g, " ").replace(/[^a-z0-9\u00c0-\u024f\u0370-\u03ff\u2200-\u22ff+=\/.^ ]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function grams(words, n) { var out = {}; for (var i = 0; i + n <= words.length; i++) { var g = words.slice(i, i + n).join(" "); out[g] = (out[g] || 0) + 1; } return out; }
  M.similarity = function (answer, scheme) {
    var a = normText(answer), b = normText(scheme);
    if (!a || !b) return 0;
    if (a === b) return 1;
    var wa = a.split(" "), wb = b.split(" "), n = Math.min(wa.length, wb.length) < 4 ? 1 : 2;
    var ga = grams(wa, n), gb = grams(wb, n), inter = 0, ta = 0, tb = 0, k;
    for (k in ga) { ta += ga[k]; if (gb[k]) inter += Math.min(ga[k], gb[k]); }
    for (k in gb) tb += gb[k];
    return ta + tb ? (2 * inter) / (ta + tb) : 0;
  };
  M.copyThreshold = function (teacherId) {
    var t = teacherId && M.user(teacherId);
    if (t && t.copyThreshold != null) return Number(t.copyThreshold);
    return Number((CFG.integrity || {}).copyThreshold) || 50;
  };
  /** -> { written, identical, pct, perQ: {qid: similarity} } */
  M.integrity = function (att) {
    var syl = M.syllabus(att.syllabusId), idx = syl ? M.questionIndex(syl) : {}, perQ = {}, written = 0, identical = 0;
    (att.questionIds || []).forEach(function (qid) {
      var e = idx[qid];
      if (!e || e.q.type !== "structured") return;
      var ans = att.answers && att.answers[qid];
      if (!ans || !String(ans).trim()) return;
      written++;
      var sim = M.similarity(ans, e.q.markScheme);
      perQ[qid] = sim;
      if (sim >= M.IDENTICAL) identical++;
    });
    return { written: written, identical: identical, pct: A.pct(identical, written), perQ: perQ };
  };
  M.copyFlag = function (att, teacherId) {
    var r = M.integrity(att), th = M.copyThreshold(teacherId);
    r.threshold = th;
    r.flagged = r.written > 0 && r.identical > 0 && r.pct >= th;
    return r;
  };

  /* ------------------------------------------------------------ statistics */
  M.studentStats = function (sid, cls) {
    var syl = cls ? M.syllabus(cls.syllabusId) : null;
    var prog = syl ? M.syllabusProgress(sid, syl) : null;
    var tasks = cls ? M.tasksForClass(cls.id).filter(function (t) { return M.isAssigned(t, sid); }) : M.tasksForStudent(sid);
    var received = 0, submitted = 0, scores = [];
    tasks.forEach(function (t) {
      var s = M.submission(t.id, sid);
      if (s && s.receivedAt) received++;
      if (s && s.submittedAt) submitted++;
      var sc = M.effectiveScore(t, sid);
      if (sc && t.maxMarks) scores.push((sc.score / t.maxMarks) * 100);
    });
    var atts = M.attemptsFor(sid, syl ? syl.id : null);
    atts.forEach(function (a) { if (!a.taskId) scores.push(a.result.pct); });
    var lastAct = Math.max(prog ? prog.lastStudiedAt : 0, atts[0] ? atts[0].finishedAt : 0);
    return {
      attendance: M.attendanceRate(sid, cls ? cls.id : null),
      progress: prog,
      tasks: tasks.length, received: received, submitted: submitted,
      avgScore: scores.length ? Math.round(A.avg(scores)) : null,
      attempts: atts, lastActive: lastAct || null,
    };
  };
})(window.App);
