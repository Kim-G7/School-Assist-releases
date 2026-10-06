/* Exam mode.
 *   Study mode: topic notes, worked examples, practice questions with instant feedback,
 *               and progress towards finishing the syllabus.
 *   Test mode:  timed papers in a distraction-free "exam room", auto-marked, with a
 *               grade and a breakdown of concepts the student is strong or weak in. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var LETTERS = "ABCDEFGH";

  function studentSyllabus(me, id) {
    var syl = M.syllabus(id);
    return syl && M.syllabiForStudent(me.id).some(function (s) { return s.id === id; }) ? syl : null;
  }

  /* ============================================================ EXAM HUB */
  A.route("s/exam", function (p, q, me) {
    var syllabi = M.syllabiForStudent(me.id);
    var html = '<div class="grid g-2">' +
      '<div class="card card-pad"><div class="row"><div class="stat" style="padding:0"><div class="ico">' + I("book") + '</div></div><h3 style="font-size:18px">Study mode</h3></div><p class="muted mt-sm">Work through the syllabus topic by topic: read the notes, follow the worked examples and test yourself with practice questions. Your progress bar shows how far you are from finishing the syllabus.</p></div>' +
      '<div class="card card-pad"><div class="row"><div class="stat" style="padding:0"><div class="ico accent">' + I("clock") + '</div></div><h3 style="font-size:18px">Test mode</h3></div><p class="muted mt-sm">Sit a full paper against the clock, just like the exam room: no notes, no going back after time runs out. You get a grade, your score, and the concepts you are good at or need to revise.</p></div></div>';
    html += '<div class="section-title"><h2>Your subjects</h2><span class="grow"></span><a class="btn btn-sm" href="#/s/subjects">' + I("layers") + "My subjects</a></div>";
    if (A.pendingSubjectsNote) html += A.pendingSubjectsNote(me);
    var card = function (syl) {
      var pr = M.syllabusProgress(me.id, syl), last = M.attemptsFor(me.id, syl.id)[0], en = M.enrolment && M.enrolment(me.id, syl.id), leaving = en && en.status === "drop_pending";
      return '<div class="card' + (leaving ? " is-greyed" : "") + '"><div class="card-body row">' + UI.ring(pr.pct, { size: 88, stroke: 9, sub: "done", label: syl.subject }) +
        '<div class="grow"><span class="badge brand">' + esc(syl.board + " " + syl.level) + "</span>" + (leaving ? ' <a class="badge warn" href="#/s/subjects" data-tip="You asked to drop it: waiting for your teacher">' + I("clock") + "Drop requested</a>" : "") +
        '<h3 class="mt-sm" style="font-size:18px">' + esc(syl.subject) + '</h3><p class="small muted">' + pr.done + " of " + pr.total + " topics completed" + (pr.prog ? " · " + pr.prog + " in progress" : "") + "</p>" +
        paperLine(me, syl, last) + "</div></div>" +
        '<div class="card-foot row"><a class="btn grow" href="#/s/study/' + syl.id + '">' + I("book") + 'Study mode</a><a class="btn btn-primary grow" href="#/s/test/' + syl.id + '">' + I("clock") + "Test mode</a></div></div>";
    };
    // grouped: sciences, arts, commercials, practicals
    var groups = M.byGroup ? M.byGroup(syllabi) : [{ group: { label: "", icon: "book" }, items: syllabi }];
    html += syllabi.length ? groups.map(function (g) {
      return (groups.length > 1 ? '<div class="group-title">' + I(g.group.icon) + esc(g.group.label) + "</div>" : "") + '<div class="grid g-auto">' + g.items.map(card).join("") + "</div>";
    }).join("") : '<div class="card">' + UI.empty("cap", "No subjects yet", "Add the subjects you are taking in My subjects. Your teachers approve them.") + "</div>";
    return { title: "Exam mode", html: html };
  }, { role: "student" });

  /** The subject card's last line: past papers sat (with the average mark) or the last practice test. */
  function paperLine(me, syl, last) {
    var sat = S().filter("receipts", function (r) {
      var m = r.kind === "paper-done" && r.studentId === me.id && r.doneAt && S().get("materials", r.paperId);
      if (!m) return false; var c = M.cls(m.classId); return (m.syllabusId || (c && c.syllabusId)) === syl.id;
    });
    var marked = sat.filter(function (r) { return r.score != null && r.total; });
    if (sat.length) return '<p class="small">Past papers sat: <b>' + sat.length + "</b>" + (marked.length ? " · average <b>" + Math.round(A.avg(marked.map(function (r) { return r.score / r.total * 100; }))) + "%</b>" : "") + "</p>";
    return last ? '<p class="small">Last test: <b>' + last.result.pct + "%</b> (grade " + esc(last.result.grade) + ")</p>" : '<p class="small muted">No papers sat yet</p>';
  }

  /* ============================================================ STUDY MODE */
  A.route("s/study/:sid", function (p, q, me) {
    var syl = studentSyllabus(me, p.sid);
    if (!syl) return { redirect: "#/s/exam" };
    var pr = M.syllabusProgress(me.id, syl), rel = M.releasedFor(me.id, syl.id), cls = M.classForSyllabus(me.id, syl.id), cur = (cls && cls.currentTerm) || 1;
    var carry = [];
    var allTerms = !!(cls && cls.allTerms); // home revision: every term open, nothing is "left over"
    for (var n = 1; n < (allTerms ? 1 : cur); n++) M.termReview(me.id, syl, n).unfinished.forEach(function (t) { if (rel[t.id]) carry.push({ t: t, term: n }); });
    var next = carry[0] ? carry[0].t : syl.topics.find(function (t) { return rel[t.id] && pr.byTopic[t.id].state !== "done"; });
    // books and notes (past papers are in Test mode)
    var mats = M.libraryList(M.materialsForStudent(me.id).filter(function (m) { var c = M.cls(m.classId); return (m.syllabusId || (c && c.syllabusId)) === syl.id && !M.isExamItem(m); }));
    var unlocked = syl.topics.filter(function (t) { return rel[t.id]; }).length;
    var tutorMats = M.tutorMaterials ? M.tutorMaterials(me.id, syl.id) : [], due = tutorMats.length ? M.cardsDue(me.id, syl.id) : 0;

    var html = '<div class="card card-pad"><div class="row wrap" style="gap:24px">' + UI.ring(pr.pct, { size: 132, stroke: 12, sub: "of syllabus", label: "Syllabus completed" }) +
      '<div class="grow"><span class="badge brand">' + esc(M.syllabusTitle(syl)) + '</span><h2 class="mt-sm" style="font-size:22px">' +
      (pr.pct >= 100 ? "Syllabus complete. Well done!" : pr.total - pr.done + " topics to go") + "</h2>" +
      '<p class="muted">' + pr.done + " completed · " + pr.prog + " in progress · " + (pr.total - pr.done - pr.prog) + " not started · about <b>" + A.fmtMinutes(pr.minsLeft * 60) + "</b> of study left</p>" +
      '<div class="mt-sm" style="max-width:520px">' + UI.bar(pr.pct, "good", true) + "</div>" +
      '<p class="tiny muted mt-sm">' + (syl.topics.some(function (t) { return (t.questions || []).length; }) ? "A topic counts as completed when you score " + M.EXAM.topicMasteryMark + "% or more in its practice questions. " : "A topic counts as completed when you tap “I've revised this topic”. ") + unlocked + " of " + syl.topics.length + " topics are open for you" + (cls ? (allTerms ? " · every term is open for revision" : " · " + esc(M.termName(cur)) + " is the current term") : "") + ".</p>" +
      '<div class="row wrap mt">' + (next ? '<a class="btn btn-primary" href="#/s/topic/' + syl.id + "/" + next.id + '">' + I("play") + "Continue: " + esc(next.title) + "</a>" : "") + '<a class="btn" href="#/s/test/' + syl.id + '">' + I("clock") + "Switch to test mode</a>" +
      (tutorMats.length ? '<a class="btn" href="#/s/flashcards/' + syl.id + '">' + I("layers") + "Flashcards" + (due ? ' <span class="badge warn">' + due + " due</span>" : "") + "</a>" : "") + "</div></div></div></div>";
    if (carry.length) {
      html += '<div class="card mt review-card"><div class="card-head">' + I("alert") + "<h3>Finish these first</h3><span class=\"sub\">unfinished from earlier terms</span></div>" +
        carry.map(function (x) { return A.topicRow(me, syl, x.t, syl.topics.indexOf(x.t), pr.byTopic[x.t.id], M.topicAccess(me.id, cls, syl, x.t)) .replace('class="topic-row"', 'class="topic-row" data-term="' + x.term + '"'); }).join("") + "</div>";
    }
    var termBlocks = M.syllabusTerms(syl).map(function (n) {
      var topics = syl.topics.filter(function (t) { return M.topicTerm(t) === n; }), r = M.termReview(me.id, syl, n);
      var label = allTerms ? r.done + " of " + r.total + " completed" : n < cur ? "Review · " + r.done + " of " + r.total + " completed" : n === cur ? "Current term" : "Opens later";
      var badge = allTerms ? (r.unfinished.length ? "brand" : "good") : n < cur ? (r.unfinished.length ? "warn" : "good") : n === cur ? "brand" : "";
      return '<div class="term-head"><b>' + esc(M.termName(n)) + '</b><span class="badge ' + badge + '">' + esc(label) + "</span></div>" +
        topics.map(function (t) { return A.topicRow(me, syl, t, syl.topics.indexOf(t), pr.byTopic[t.id], M.topicAccess(me.id, cls, syl, t)); }).join("");
    }).join("");
    html += '<div class="grid g-main mt"><div class="card"><div class="card-head"><h3>Syllabus topics</h3>' + (cls && cls.sequential ? '<span class="badge">' + I("list") + "Complete in order</span>" : "") + "</div>" + termBlocks + "</div>" +
      '<div class="card" style="align-self:start"><div class="card-head"><h3>Books and notes</h3></div>' + (mats.length ? mats.map(function (m) { return A.materialRow(m, { student: true }); }).join("") : UI.empty("library", "Nothing shared yet", "Past papers are in Test mode.")) + "</div></div>";
    return { title: syl.subject + ": study mode", crumbs: [{ label: "Exam mode", href: "#/s/exam" }, { label: syl.subject }], html: html };
  }, { role: "student" });

  /* ------------------------------------------------------------ topic page */
  var P = null; // practice session state
  var touched = {};
  A.route("s/topic/:sid/:tid/:tab?", function (p, q, me) {
    var syl = studentSyllabus(me, p.sid), t = syl && M.topic(syl, p.tid);
    if (!t) return { redirect: "#/s/exam" };
    var crumbs = [{ label: "Exam mode", href: "#/s/exam" }, { label: syl.subject, href: "#/s/study/" + syl.id }, { label: t.title }];
    var acc = M.topicAccess(me.id, M.classForSyllabus(me.id, syl.id), syl, t);
    if (!acc.open) {
      var why = acc.reason === "sequence" ? "Complete “" + acc.prev.title + "” first by scoring " + M.EXAM.topicMasteryMark + "% or more in its practice questions. Then this topic opens."
        : acc.reason === "term" ? "This topic is part of " + M.termName(acc.term) + ". It opens when your teacher starts that term."
          : "Your teacher has locked this topic for now. Keep working on the topics that are open.";
      return { title: t.title, crumbs: crumbs, html: '<div class="card">' + UI.empty("lock", M.lockText(acc), why, (acc.prev ? '<a class="btn btn-primary" href="#/s/topic/' + syl.id + "/" + acc.prev.id + '">Go to ' + esc(acc.prev.title) + "</a> " : "") + '<a class="btn" href="#/s/study/' + syl.id + '">Back to topics</a>') + "</div>" };
    }
    if (!touched[t.id]) { touched[t.id] = 1; M.touchTopic(me.id, syl.id, t.id); }
    var hasTutor = M.tutorHas && M.tutorHas(me.id, syl.id, t.id);
    var tab = p.tab || (hasTutor ? "tutor" : "notes"), rec = M.topicProgress(me.id, t.id), idx = syl.topics.indexOf(t);
    var prev = syl.topics[idx - 1], next = syl.topics[idx + 1];
    var base = "#/s/topic/" + syl.id + "/" + t.id;
    var tabs = UI.tabs([
      { href: base + "/tutor", label: "Tutor", icon: "cap", on: tab === "tutor", n: hasTutor ? M.tutorMaterials(me.id, syl.id, t.id).length + M.topicTests(me.id, syl.id, t.id).length : null },
      { href: base + "/notes", label: "Notes", icon: "book", on: tab === "notes" },
      { href: base + "/examples", label: "Worked examples", icon: "bulb", on: tab === "examples", n: (t.examples || []).length },
      { href: base + "/practice", label: "Practice questions", icon: "target", on: tab === "practice", n: (t.questions || []).length },
    ]);
    var st = M.topicState(rec, t), noQs = !(t.questions || []).length;
    var head = '<div class="row wrap mb"><span class="badge brand">Topic ' + (idx + 1) + " of " + syl.topics.length + "</span>" +
      (st === "done" ? '<span class="badge good">' + I("checkCircle") + (rec.practiceBest != null ? "Completed · best " + rec.practiceBest + "%" : "Revised") + "</span>" : st === "prog" ? '<span class="badge warn">In progress' + (rec.practiceBest != null ? " · best " + rec.practiceBest + "%" : "") + "</span>" : '<span class="badge">Not started</span>') +
      '<span class="muted small">~' + (t.estMinutes || 30) + " min</span></div>";
    var body = "";
    if (tab === "notes") {
      var mats = M.materialsForStudent(me.id).filter(function (m) { return m.topicId === t.id; });
      body = '<div class="grid g-main"><div class="card card-pad"><div class="prose"><h1>' + esc(t.title) + "</h1>" + A.md(t.notes) + "</div>" +
        '<div class="divider"></div><div class="row wrap spread">' + (rec && rec.notesReadAt ? '<span class="badge good">' + I("check") + (noQs ? "Revised " : "Read ") + A.relTime(rec.notesReadAt) + "</span>" : '<button class="btn btn-primary" data-act="notes-read" data-s="' + syl.id + '" data-t="' + t.id + '">' + I("check") + (noQs ? "I've revised this topic" : "I've read these notes") + "</button>") +
        (noQs && !(t.examples || []).length ? (next ? '<a class="btn" href="#/s/topic/' + syl.id + "/" + next.id + '">Next topic ' + I("right") + "</a>" : "")
          : '<a class="btn" href="' + base + '/examples">Next: worked examples ' + I("right") + "</a>") + "</div></div>" +
        '<div class="stack-lg" style="align-self:start">' +
        '<div class="card card-pad"><div class="label">In this topic</div><p class="small muted">' + esc(t.summary || "") + '</p><div class="kv mt"><dt>Worked examples</dt><dd>' + (t.examples || []).length + "</dd><dt>Practice questions</dt><dd>" + t.questions.length + "</dd><dt>To complete</dt><dd>" + (noQs ? "mark it revised" : "score " + M.EXAM.topicMasteryMark + "%+") + "</dd></div></div>" +
        (t.outline && t.outline.length && A.outlineHtml ? '<div class="card card-pad"><div class="label">What to study</div><p class="tiny muted">From the syllabus</p>' + A.outlineHtml(t) + "</div>" : "") +
        (mats.length ? '<div class="card"><div class="card-head"><h3>Related materials</h3></div>' + mats.map(function (m) { return A.materialRow(m); }).join("") + "</div>" : "") +
        '<div class="row">' + (prev ? '<a class="btn btn-sm grow" href="#/s/topic/' + syl.id + "/" + prev.id + '">' + I("left") + "Previous</a>" : "") + (next ? '<a class="btn btn-sm grow" href="#/s/topic/' + syl.id + "/" + next.id + '">Next topic' + I("right") + "</a>" : "") + "</div></div></div>";
    } else if (tab === "examples") {
      body = (t.examples || []).length ? '<div class="card card-pad" style="max-width:860px">' + t.examples.map(function (ex, i) {
        return '<div class="example"><div class="q"><span class="qnum">Example ' + (i + 1) + "</span><div class=\"mt-sm\">" + A.inl(ex.q) + '</div></div><div class="a hidden" id="ex-a-' + i + '"><div class="label">Solution</div>' + A.inl(ex.a) + "</div>" +
          '<div style="padding:10px 16px;border-top:1px solid var(--border)"><button class="btn btn-sm" data-act="show-sol" data-i="' + i + '">' + I("eye") + "Show solution</button></div></div>";
      }).join("") + '<div class="row mt"><span class="muted small grow">Try each one yourself before you look at the solution.</span><a class="btn btn-primary" href="' + base + '/practice">Practise now ' + I("right") + "</a></div></div>"
        : '<div class="card">' + UI.empty("bulb", "No worked examples for this topic yet") + "</div>";
    } else if (tab === "tutor" && A.tutorTab) {
      var tv = A.tutorTab(me, syl, t);
      return { title: t.title, crumbs: crumbs, html: head + tabs + tv.html, mount: tv.mount };
    } else {
      body = practiceView(me, syl, t, rec);
    }
    return { title: t.title, crumbs: crumbs, html: head + tabs + body };
  }, { role: "student" });

  A.act["notes-read"] = function (el) {
    M.markNotesRead(M.me().id, el.getAttribute("data-s"), el.getAttribute("data-t"));
    var syl = M.syllabus(el.getAttribute("data-s")), t = syl && M.topic(syl, el.getAttribute("data-t"));
    UI.toast(t && !(t.questions || []).length ? "Topic marked as revised" : "Nice. Now try the worked examples.");
    A.render();
  };
  A.act["show-sol"] = function (el) {
    var box = document.getElementById("ex-a-" + el.getAttribute("data-i"));
    var open = box.classList.toggle("hidden");
    el.innerHTML = open ? I("eye") + "Show solution" : I("x") + "Hide solution";
  };

  /* ------------------------------------------------------------ practice */
  function practiceView(me, syl, t, rec) {
    var key = syl.id + "/" + t.id;
    if (!P || P.key !== key) P = { key: key, started: false };
    var qs = t.questions || [];
    if (!qs.length) return '<div class="card">' + UI.empty("target", "No practice questions yet") + "</div>";
    if (!P.started) {
      return '<div class="card card-pad" style="max-width:720px"><h3 style="font-size:18px">Practice: ' + esc(t.title) + '</h3><p class="muted mt-sm">' + qs.length + " questions. Check each answer as you go and read the explanation. Score " + M.EXAM.topicMasteryMark + "% or more to complete this topic.</p>" +
        (rec && rec.practiceBest != null ? '<p class="mt-sm">Your best so far: <b>' + rec.practiceBest + "%</b> after " + rec.practiceAttempts + " " + (rec.practiceAttempts === 1 ? "try" : "tries") + ".</p>" : "") +
        '<button class="btn btn-primary btn-lg mt" data-act="px-start">' + I("play") + "Start practice</button></div>";
    }
    if (P.finished) {
      var pct = A.pct(P.got, P.total), done = pct >= M.EXAM.topicMasteryMark, idx = syl.topics.indexOf(t), next = syl.topics[idx + 1];
      return '<div class="card card-pad" style="max-width:720px"><div class="score-hero">' + UI.ring(pct, { size: 120, stroke: 12, tone: M.tone(pct), label: "Practice score" }) +
        '<div class="grow"><h3 style="font-size:20px">' + (done ? "Topic completed!" : "Keep practising") + '</h3><p class="muted">You scored ' + P.got + " out of " + P.total + " marks. " + (done ? "This topic now counts towards your syllabus progress." : "You need " + M.EXAM.topicMasteryMark + "% to complete the topic. Re-read the notes and try again.") + "</p>" +
        '<div class="row wrap mt"><button class="btn" data-act="px-start">' + I("refresh") + "Try again</button>" + (!done ? '<a class="btn" href="#/s/topic/' + syl.id + "/" + t.id + '/notes">' + I("book") + "Re-read notes</a>" : "") +
        (next ? '<a class="btn btn-primary" href="#/s/topic/' + syl.id + "/" + next.id + '">Next topic ' + I("right") + "</a>" : '<a class="btn btn-primary" href="#/s/test/' + syl.id + '">Take a test ' + I("right") + "</a>") + "</div></div></div></div>";
    }
    var q = P.order[P.i], checked = P.checked[q.id], ans = P.answers[q.id];
    var html = '<div class="card qcard" style="max-width:820px"><div class="row spread"><span class="qnum">Question ' + (P.i + 1) + " of " + P.order.length + " · " + (q.marks || 1) + " mark" + ((q.marks || 1) > 1 ? "s" : "") + '</span><span class="small muted">Score so far: ' + P.got + "</span></div>" +
      '<div class="mt-sm">' + UI.bar(A.pct(P.i, P.order.length)) + "</div>" +
      '<div class="qprompt">' + A.inl(q.prompt) + "</div>" + answerInput(q, ans, "px", checked) + '<div id="px-fb">' + (checked ? feedback(q, ans, checked) : "") + "</div>" +
      '<div class="row mt spread">';
    if (!checked) {
      html += q.type === "structured"
        ? '<button class="btn btn-primary" data-act="px-scheme">' + I("eye") + "Show mark scheme</button>"
        : '<button class="btn btn-primary" data-act="px-check">' + I("check") + "Check answer</button>";
      html += '<button class="btn btn-ghost" data-act="px-skip">Skip</button>';
    } else {
      html += '<span></span><button class="btn btn-primary" data-act="px-next">' + (P.i + 1 < P.order.length ? "Next question " + I("right") : "See my score " + I("right")) + "</button>";
    }
    return html + "</div></div>";
  }
  function feedback(q, ans, g) {
    if (q.type === "structured") {
      return '<div class="feedback info">' + I("list") + '<div class="grow"><b>Mark scheme</b><div class="small mt-sm">' + A.inl(q.markScheme) + "</div>" +
        (g.state === "self" && g.got == null ? '<div class="label mt">How did you do?</div><div class="row wrap">' +
          [[q.marks, "Full marks"], [Math.ceil(q.marks / 2), "Some marks"], [0, "No marks yet"]].map(function (o) { return '<button class="btn btn-sm" data-act="px-self" data-v="' + o[0] + '">' + o[1] + " (" + o[0] + ")</button>"; }).join("") + "</div>"
          : '<div class="mt-sm small">You gave yourself <b>' + g.got + " / " + q.marks + "</b>.</div>") + "</div></div>";
    }
    var ok = g.state === "right";
    return '<div class="feedback ' + (ok ? "good" : "bad") + '">' + I(ok ? "checkCircle" : "alert") + "<div><b>" + (ok ? "Correct!" : g.state === "blank" ? "Skipped." : "Not quite.") + "</b>" +
      (!ok ? " The answer is <b>" + A.inl(M.answerText(q)) + "</b>." : "") + (q.explanation ? '<div class="small mt-sm">' + A.inl(q.explanation) + "</div>" : "") + "</div></div>";
  }
  A.act["px-start"] = function () {
    var parts = location.hash.split("/"), syl = M.syllabus(parts[3]), t = M.topic(syl, parts[4]);
    P = { key: syl.id + "/" + t.id, started: true, i: 0, order: A.shuffle(t.questions), answers: {}, checked: {}, got: 0, total: 0, finished: false };
    location.hash = "#/s/topic/" + syl.id + "/" + t.id + "/practice";
    A.render();
  };
  function pxRecord(g) {
    var q = P.order[P.i];
    P.checked[q.id] = g;
    if (g.got != null) { P.got += g.got; }
    P.total += g.marks;
    A.render();
  }
  A.act["px-check"] = function () {
    var q = P.order[P.i], ans = P.answers[q.id];
    if (ans == null || ans === "") { UI.toast("Choose or type an answer first", "bad"); return; }
    pxRecord(M.gradeQuestion(q, ans));
  };
  A.act["px-skip"] = function () {
    var q = P.order[P.i];
    pxRecord({ state: "blank", got: 0, marks: Number(q.marks) || 1 });
  };
  A.act["px-scheme"] = function () {
    var q = P.order[P.i];
    P.checked[q.id] = { state: "self", got: null, marks: Number(q.marks) || 1 };
    A.render();
  };
  A.act["px-self"] = function (el) {
    var q = P.order[P.i], v = Number(el.getAttribute("data-v"));
    P.checked[q.id] = { state: "self", got: v, marks: Number(q.marks) || 1 };
    P.got += v; P.total += Number(q.marks) || 1;
    A.render();
  };
  A.act["px-next"] = function () {
    var q = P.order[P.i];
    if (P.checked[q.id] && P.checked[q.id].got == null) { UI.toast("Give yourself a mark first", "bad"); return; }
    if (P.i + 1 < P.order.length) { P.i++; A.render(); return; }
    P.finished = true;
    var parts = P.key.split("/");
    M.recordPractice(M.me().id, parts[0], parts[1], A.pct(P.got, P.total));
    A.render();
  };
  A.act["px-pick"] = function (el) {
    var q = P.order[P.i];
    if (P.checked[q.id]) return;
    P.answers[q.id] = el.getAttribute("data-v");
    el.parentNode.querySelectorAll(".opt").forEach(function (o) { o.classList.toggle("sel", o === el); });
  };
  A.act["px-input"] = function (el) { P.answers[P.order[P.i].id] = el.value; };

  /** Answer control for any question type. ctx = "px" (practice) or "ex" (exam). */
  function answerInput(q, ans, ctx, checked) {
    var dis = checked ? " disabled" : "";
    if (q.type === "mcq" || q.type === "tf") {
      var opts = q.type === "tf" ? [["true", "True"], ["false", "False"]] : (q.options || []).map(function (o, i) { return [String(i), o]; });
      var correct = String(q.answer);
      return '<div class="opts" role="radiogroup">' + opts.map(function (o, i) {
        var cls = String(ans) === o[0] ? "sel" : "";
        if (checked) cls = o[0] === correct ? "right" : String(ans) === o[0] ? "wrong" : "";
        return '<button type="button" class="opt ' + cls + '" data-act="' + ctx + '-pick" data-v="' + o[0] + '" role="radio" aria-checked="' + (String(ans) === o[0]) + '"' + dis + '><span class="letter">' + LETTERS[i] + "</span><span>" + A.inl(o[1]) + "</span></button>";
      }).join("") + "</div>";
    }
    if (q.type === "structured") {
      return '<textarea class="textarea" rows="7" placeholder="Write your full answer and working here…" data-input="' + ctx + '-input"' + dis + ">" + esc(ans || "") + "</textarea>";
    }
    return '<input class="input" style="max-width:360px;font-size:17px" ' + (q.type === "numeric" ? 'inputmode="decimal" placeholder="Your answer (a number)"' : 'placeholder="Type your answer"') + ' value="' + esc(ans || "") + '" data-input="' + ctx + '-input" autocomplete="off"' + dis + ">";
  }

  /* ============================================================ TEST MODE */
  A.route("s/test/:sid", function (p, q, me) {
    var syl = studentSyllabus(me, p.sid);
    if (!syl) return { redirect: "#/s/exam" };
    var atts = M.attemptsFor(me.id, syl.id), idx = M.questionIndex(syl), rel = M.releasedFor(me.id, syl.id);
    var relTopics = syl.topics.filter(function (t) { return rel[t.id]; });
    var taskTests = M.tasksForStudent(me.id).filter(function (t) { return t.test && t.test.syllabusId === syl.id && M.taskStatus(t, me.id).key !== "graded"; });
    var concepts = M.conceptSummary(atts);

    var html = '<div class="callout mb">' + I("clock") + "<div><b>Test mode works like the real exam room.</b> The timer starts when you press Start and keeps running even if you close the app. When time is up your paper is submitted automatically.</div></div>";
    if (taskTests.length) {
      html += '<div class="section-title"><h2>Set by your teacher</h2></div><div class="card">' + taskTests.map(function (t) {
        return '<a class="list-row" href="#/s/task/' + t.id + '"><span class="kind-bar k-test"></span><div class="grow"><div class="title">' + esc(t.title) + '</div><div class="meta">' + A.dueBadge(t.dueAt) + "</div></div>" + M.statusBadge(M.taskStatus(t, me.id)) + I("right") + "</a>";
      }).join("") + "</div>";
    }
    // past papers (PDF) to sit in the exam room, with their own time allowed and rules
    var all = M.libraryList(M.materialsForStudent(me.id)).filter(function (m) { var c = M.cls(m.classId); return m.kind === "pastpaper" && (m.syllabusId || (c && c.syllabusId)) === syl.id; }).sort(M.byExamSession);
    // topical tests (questions on one topic) first, grouped by topic; then whole past papers
    var topical = all.filter(function (m) { return m.topicId; }), past = all.filter(function (m) { return !m.topicId; });
    if (topical.length) {
      html += '<div class="section-title" data-offline-list><h2>Topical tests</h2><span class="sub">Questions on one topic at a time' + esc(A.offlineSummary(topical)) + "</span></div>" +
        syl.topics.filter(function (t) { return topical.some(function (m) { return m.topicId === t.id; }); }).map(function (t, gi) {
          var list = topical.filter(function (m) { return m.topicId === t.id; });
          return '<details class="card paper-group"' + (gi === 0 ? " open" : "") + '><summary class="card-head"><h3>' + esc(t.title) + '</h3><span class="sub">' + list.length + " test" + (list.length === 1 ? "" : "s") + "</span></summary>" +
            list.map(function (p) {
              var r = M.paperSitting(me.id, p.id);
              return '<div class="list-row"><div class="grow"><div class="title">' + esc(p.title) + '</div><div class="row wrap mt-sm" style="gap:6px">' + M.paperChips(p) + A.offlineChip(p) + (r && r.doneAt && M.paperScoreText(r) ? '<span class="badge good">' + esc(M.paperScoreText(r)) + "</span>" : "") + "</div></div>" +
                '<a class="btn btn-sm' + (r && r.doneAt ? "" : " btn-primary") + '" href="#/s/sit/' + p.id + '">' + I("clock") + (r && r.doneAt ? "Sit again" : "Sit it") + "</a></div>";
            }).join("") + "</details>";
        }).join("");
    }
    if (past.length) html += A.pastPaperList(me, past);
    // practice tests built from the syllabus's own questions
    var hasQs = (syl.papers || []).length || syl.topics.some(function (t) { return (t.questions || []).length; });
    if (hasQs) {
    html += '<div class="section-title"><h2>Exam papers</h2><span class="sub">' + esc(M.syllabusTitle(syl)) + "</span></div>";
    html += '<div class="grid g-auto">' + (syl.papers || []).map(function (pp) {
      var qs = pp.questionIds.filter(function (id) { return idx[id]; }), marks = A.sum(qs, function (id) { return Number(idx[id].q.marks) || 1; });
      var best = atts.filter(function (a) { return a.paperId === pp.id; }).reduce(function (b, a) { return Math.max(b, a.result.pct); }, -1);
      return '<div class="card"><div class="card-body"><h3 style="font-size:16px">' + esc(pp.title) + '</h3><div class="row wrap mt-sm"><span class="badge">' + I("clock") + pp.durationMin + ' min</span><span class="badge">' + qs.length + ' questions</span><span class="badge">' + marks + " marks</span>" + (best >= 0 ? '<span class="badge ' + M.tone(best) + '">best ' + best + "%</span>" : "") + "</div>" +
        '<p class="small muted mt-sm">' + esc(pp.instructions || "") + '</p></div><div class="card-foot"><button class="btn btn-primary btn-block" data-act="start-paper" data-s="' + syl.id + '" data-p="' + pp.id + '"' + (qs.length ? "" : " disabled") + ">" + I("play") + "Sit this paper</button></div></div>";
    }).join("") +
      '<div class="card"><div class="card-body"><h3 style="font-size:16px">Build your own test</h3><p class="small muted mt-sm">Pick topics you want to be tested on.</p>' +
      (relTopics.length ? '<form data-submit="start-custom" data-s="' + syl.id + '"><div class="pick-list mt-sm" style="max-height:170px">' + relTopics.map(function (t) { return '<label class="check small"><input type="checkbox" name="topicIds" value="' + t.id + '" checked>' + esc(t.title) + "</label>"; }).join("") + "</div>" +
        '<div class="form-grid mt-sm"><label class="field"><span>Questions</span><select class="select" name="count">' + [5, 10, 15, 20].map(function (n) { return '<option value="' + n + '"' + (n === 10 ? " selected" : "") + ">" + n + "</option>"; }).join("") + '</select></label><label class="field"><span>Minutes</span><select class="select" name="minutes">' + [5, 10, 15, 20, 30, 45, 60].map(function (n) { return '<option value="' + n + '"' + (n === 15 ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label></div>" +
        '<button class="btn btn-primary btn-block mt" type="submit">' + I("play") + "Build and start</button></form>" : '<p class="small mt-sm">Your teacher hasn\'t unlocked any topics yet.</p>') + "</div></div></div>";

    html += '<div class="grid g-2 mt-lg"><div class="card"><div class="card-head"><h3>Your results</h3></div>' + (atts.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Paper</th><th>Date</th><th class="num">Score</th><th>Grade</th></tr></thead><tbody>' + atts.map(function (a) {
      return '<tr class="click" data-href="#/s/result/' + a.id + '" tabindex="0"><td><b class="small">' + esc(a.title) + '</b></td><td class="small muted nowrap">' + A.fmtDate(a.finishedAt) + '</td><td class="num">' + UI.scoreBadge(a.result.pct) + '</td><td><span class="badge brand">' + esc(a.result.grade) + "</span></td></tr>";
    }).join("") + "</tbody></table></div>" : UI.empty("target", "No tests yet", "Your results and grades will be listed here.")) + "</div>" +
      '<div class="card"><div class="card-head"><h3>Concepts</h3><span class="sub">across your last 5 tests</span></div><div class="card-body">' + UI.toneLegend() + '<div class="mt">' +
      UI.hbars(concepts.map(function (x) { return { label: x.title, pct: x.pct, tone: x.tone, href: "#/s/topic/" + syl.id + "/" + x.id, tip: x.got + "/" + x.total + " marks · " + M.toneLabel(x.pct) }; }), { emptyTitle: "Take a test to see your strengths" }) + "</div></div></div></div>";
    }
    if (!all.length && !hasQs) html += '<div class="card">' + UI.empty("award", "No papers yet", "Past papers your admin adds appear here, ready to sit against the clock.") + "</div>";
    return { title: syl.subject + ": test mode", crumbs: [{ label: "Exam mode", href: "#/s/exam" }, { label: syl.subject }], html: html };
  }, { role: "student" });

  A.act["start-paper"] = function (el) {
    var att = M.createAttempt({ studentId: M.me().id, syllabusId: el.getAttribute("data-s"), paperId: el.getAttribute("data-p") });
    location.hash = "#/s/exam-room/" + att.id;
  };
  A.act["start-custom"] = function (form) {
    var topicIds = Array.prototype.map.call(form.querySelectorAll("[name=topicIds]:checked"), function (x) { return x.value; });
    if (!topicIds.length) { UI.toast("Pick at least one topic", "bad"); return; }
    var syl = M.syllabus(form.getAttribute("data-s"));
    var names = topicIds.map(function (id) { return M.topic(syl, id).title; });
    var att = M.createAttempt({ studentId: M.me().id, syllabusId: syl.id, topicIds: topicIds, count: Number(form.count.value), durationMin: Number(form.minutes.value),
      title: "Custom test: " + (names.length > 2 ? names.slice(0, 2).join(", ") + " +" + (names.length - 2) : names.join(", ")) });
    location.hash = "#/s/exam-room/" + att.id;
  };

  /* ============================================================ EXAM ROOM */
  var E = { idx: 0 };
  A.route("s/exam-room/:id", function (p, q, me) {
    var att = S().get("attempts", p.id);
    if (!att || att.studentId !== me.id) return { redirect: "#/s/exam" };
    if (att.status === "done") return { redirect: "#/s/result/" + att.id };
    if (att.status === "running" && Date.now() >= att.endsAt) {
      M.finishAttempt(att, true);
      return { redirect: "#/s/result/" + att.id };
    }
    var syl = M.syllabus(att.syllabusId), idx = M.questionIndex(syl), b = A.Theme.get();
    var total = A.sum(att.questionIds, function (id) { return idx[id] ? Number(idx[id].q.marks) || 1 : 0; });

    if (att.status === "ready") {
      var paper = att.paperId ? (syl.papers || []).find(function (x) { return x.id === att.paperId; }) : null;
      var html = '<div class="exam-room"><div class="exam-top">' + A.Theme.logoHTML() + '<div class="grow"><b>' + esc(b.name) + '</b><div class="small muted">Examination room</div></div><a class="btn btn-ghost" href="#/s/test/' + syl.id + '">' + I("x") + "Leave</a></div>" +
        '<div class="exam-cover"><div class="card card-pad"><span class="badge brand">' + esc(M.syllabusTitle(syl)) + '</span><h2 class="mt-sm" style="font-size:26px">' + esc(att.title) + "</h2>" +
        '<div class="kv mt"><dt>Candidate</dt><dd>' + esc(me.name) + (me.studentNo ? " · " + esc(me.studentNo) : "") + "</dd><dt>Time allowed</dt><dd>" + A.fmtMinutes(att.durationSec) + "</dd><dt>Questions</dt><dd>" + att.questionIds.length + "</dd><dt>Total marks</dt><dd>" + total + "</dd></div>" +
        (paper && paper.instructions ? '<div class="callout mt">' + I("info") + "<div>" + esc(paper.instructions) + "</div></div>" : "") +
        '<div class="label mt">Exam rules</div><ul class="rules small"><li>The timer starts when you press <b>Start exam</b> and cannot be paused.</li><li>When time runs out your answers are submitted automatically.</li><li>Notes and the library are closed until you finish.</li><li>Leaving the exam screen is recorded on your result, just as an invigilator would note it.</li><li>Flag questions to come back to them. Unanswered questions score zero.</li><li>Structured questions are marked by you against the marking scheme after you submit.</li></ul>' +
        '<label class="check mt"><input type="checkbox" id="ex-fs" checked>Use full screen</label>' +
        '<button class="btn btn-primary btn-lg btn-block mt" data-act="ex-begin" data-id="' + att.id + '">' + I("play") + "Start exam</button></div></div></div>";
      return { html: html };
    }
    if (E.att !== att.id) { E = { att: att.id, idx: 0 }; }
    var roomHtml = '<div class="exam-room"><div class="exam-top">' + A.Theme.logoHTML() + '<div class="grow" style="min-width:0"><b class="nowrap">' + esc(att.title) + '</b><div class="small muted">' + esc(me.name) + " · " + esc(syl.subject) + "</div></div>" +
      '<div class="timer" id="ex-timer" role="timer" aria-live="off">' + I("clock") + '<span id="ex-time">--:--</span></div>' +
      '<button class="btn btn-primary" data-act="ex-finish">' + I("check") + "Finish</button></div>" +
      '<div class="exam-body"><div id="ex-q"></div><aside class="exam-side"><div class="card card-pad"><div class="row spread"><b>Questions</b><span class="small muted" id="ex-count"></span></div><div class="palette mt" id="ex-palette"></div>' +
      '<div class="legend mt"><span><i style="background:var(--brand)"></i>Answered</span><span><i style="background:var(--surface);border:1.5px solid var(--border-strong)"></i>Not answered</span><span><i style="background:var(--serious);border-radius:99px"></i>Flagged</span></div>' +
      '<button class="btn btn-block mt" data-act="ex-finish">' + I("check") + "Submit paper</button></div></aside></div></div>";
    return {
      html: roomHtml,
      mount: function () {
        drawQuestion();
        tick();
        var timer = setInterval(tick, 1000);
        var onVis = function () {
          var cur = S().get("attempts", E.att);
          if (!cur || cur.status !== "running") return;
          if (document.hidden) S().put("attempts", Object.assign({}, cur, { leftCount: (cur.leftCount || 0) + 1 }));
          else UI.toast("You left the exam screen. This is noted on your result.", "bad");
        };
        var onUnload = function (e) { e.preventDefault(); e.returnValue = ""; };
        var onKey = function (e) {
          if (/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) return;
          if (e.key === "ArrowRight") move(1); else if (e.key === "ArrowLeft") move(-1);
        };
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("beforeunload", onUnload);
        document.addEventListener("keydown", onKey);
        A.cleanup = function () {
          clearInterval(timer);
          document.removeEventListener("visibilitychange", onVis);
          window.removeEventListener("beforeunload", onUnload);
          document.removeEventListener("keydown", onKey);
        };
      },
    };
  }, { role: "student", bare: true });

  function cur() { return S().get("attempts", E.att); }
  function tick() {
    var att = cur(), el = document.getElementById("ex-time");
    if (!att || !el || att.status !== "running") return;
    var left = Math.max(0, Math.round((att.endsAt - Date.now()) / 1000));
    el.textContent = A.fmtDuration(left);
    var box = document.getElementById("ex-timer");
    box.classList.toggle("warn", left <= 300 && left > 60);
    box.classList.toggle("crit", left <= 60);
    if (left === 300) UI.toast("5 minutes left");
    if (left <= 0) {
      var done = M.finishAttempt(att, true);
      exitFs();
      UI.toast("Time's up! Your paper has been submitted.");
      location.hash = "#/s/result/" + done.id;
    }
  }
  function drawQuestion() {
    var att = cur(); if (!att) return;
    var syl = M.syllabus(att.syllabusId), idx = M.questionIndex(syl);
    var qid = att.questionIds[E.idx], e = idx[qid];
    if (!e) return;
    var q = e.q, flagged = att.flags && att.flags[qid];
    document.getElementById("ex-q").innerHTML = '<div class="card qcard"><div class="row spread wrap"><span class="qnum">Question ' + (E.idx + 1) + " of " + att.questionIds.length + " · " + (q.marks || 1) + " mark" + ((q.marks || 1) > 1 ? "s" : "") + "</span>" +
      '<span class="badge">' + esc(M.Q_TYPES[q.type] || "") + "</span></div>" +
      '<div class="qprompt">' + A.inl(q.prompt) + "</div>" + answerInput(q, att.answers[qid], "ex") +
      '<div class="row mt spread wrap"><button class="btn" data-act="ex-move" data-d="-1"' + (E.idx === 0 ? " disabled" : "") + ">" + I("left") + "Previous</button>" +
      '<button class="btn ' + (flagged ? "btn-accent" : "btn-ghost") + '" data-act="ex-flag">' + I("flag") + (flagged ? "Flagged" : "Flag for review") + "</button>" +
      (E.idx + 1 < att.questionIds.length ? '<button class="btn btn-primary" data-act="ex-move" data-d="1">Next ' + I("right") + "</button>" : '<button class="btn btn-primary" data-act="ex-finish">' + I("check") + "Finish</button>") + "</div></div>";
    drawPalette();
    var inp = document.querySelector("#ex-q input, #ex-q textarea");
    if (inp && window.innerWidth > 900) inp.focus();
  }
  function drawPalette() {
    var att = cur(); if (!att) return;
    var answered = 0;
    document.getElementById("ex-palette").innerHTML = att.questionIds.map(function (qid, i) {
      var a = att.answers[qid], has = a != null && String(a).trim() !== "";
      if (has) answered++;
      return '<button class="' + (has ? "ans " : "") + (att.flags[qid] ? "flag " : "") + (i === E.idx ? "cur" : "") + '" data-act="ex-go" data-i="' + i + '" aria-label="Question ' + (i + 1) + (has ? ", answered" : "") + (att.flags[qid] ? ", flagged" : "") + '">' + (i + 1) + "</button>";
    }).join("");
    document.getElementById("ex-count").textContent = answered + " / " + att.questionIds.length + " answered";
  }
  function saveAnswer(val) {
    var att = cur(), qid = att.questionIds[E.idx], answers = Object.assign({}, att.answers);
    answers[qid] = val;
    S().put("attempts", Object.assign({}, att, { answers: answers }));
  }
  function move(d) {
    var att = cur();
    E.idx = A.clamp(E.idx + d, 0, att.questionIds.length - 1);
    drawQuestion();
    window.scrollTo(0, 0);
  }
  function exitFs() { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); }

  A.act["ex-begin"] = function (el) {
    var att = S().get("attempts", el.getAttribute("data-id"));
    var fs = document.getElementById("ex-fs");
    if (fs && fs.checked && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    M.startAttempt(att);
    E = { att: att.id, idx: 0 };
    A.render();
  };
  A.act["ex-pick"] = function (el) {
    saveAnswer(el.getAttribute("data-v"));
    el.parentNode.querySelectorAll(".opt").forEach(function (o) { o.classList.toggle("sel", o === el); o.setAttribute("aria-checked", o === el); });
    drawPalette();
  };
  var saveTyped = A.debounce(function (v) { saveAnswer(v); drawPalette(); }, 300);
  A.act["ex-input"] = function (el) { saveTyped(el.value); };
  A.act["ex-move"] = function (el) { flushTyped(); move(Number(el.getAttribute("data-d"))); };
  A.act["ex-go"] = function (el) { flushTyped(); E.idx = Number(el.getAttribute("data-i")); drawQuestion(); };
  A.act["ex-flag"] = function () {
    var att = cur(), qid = att.questionIds[E.idx], flags = Object.assign({}, att.flags);
    flags[qid] = !flags[qid];
    S().put("attempts", Object.assign({}, att, { flags: flags }));
    drawQuestion();
  };
  function flushTyped() {
    var inp = document.querySelector("#ex-q input, #ex-q textarea");
    if (inp) saveAnswer(inp.value);
  }
  A.act["ex-finish"] = function () {
    flushTyped();
    var att = cur(), blank = 0, flagged = 0;
    att.questionIds.forEach(function (qid) { var a = att.answers[qid]; if (a == null || String(a).trim() === "") blank++; if (att.flags[qid]) flagged++; });
    UI.modal({
      title: "Submit your paper?", noFocus: true,
      body: '<p>You have answered <b>' + (att.questionIds.length - blank) + " of " + att.questionIds.length + "</b> questions.</p>" +
        (blank ? '<div class="callout warn mt">' + I("alert") + "<div>" + blank + " question" + (blank > 1 ? "s are" : " is") + " unanswered and will score zero.</div></div>" : "") +
        (flagged ? '<p class="small muted mt-sm">' + flagged + " flagged for review.</p>" : "") +
        '<p class="small muted mt-sm">Time left: ' + A.fmtDuration(Math.max(0, (att.endsAt - Date.now()) / 1000)) + ". You cannot change your answers after submitting.</p>",
      foot: [{ label: "Keep working" }, {
        label: "Submit paper", cls: "btn-primary", onClick: function () {
          var done = M.finishAttempt(cur(), false);
          exitFs();
          location.hash = "#/s/result/" + done.id;
        },
      }],
    });
  };

  /* ============================================================ RESULTS */
  function resultView(att, me, readOnly) {
    var syl = M.syllabus(att.syllabusId), idx = M.questionIndex(syl), r = att.result || M.scoreAttempt(att);
    var student = M.user(att.studentId);
    var topics = Object.keys(r.perTopic).map(function (tid) { var x = r.perTopic[tid]; var pct = A.pct(x.got, x.total); return { id: tid, title: x.title, got: x.got, total: x.total, pct: pct, tone: M.tone(pct) }; })
      .sort(function (a, b) { return b.pct - a.pct; });
    var strong = topics.filter(function (x) { return x.pct >= M.EXAM.strongTopicMark; });
    var weak = topics.filter(function (x) { return x.pct < M.EXAM.strongTopicMark; }).sort(function (a, b) { return a.pct - b.pct; });
    var topicHref = function (x) { return readOnly ? null : "#/s/topic/" + syl.id + "/" + x.id; };

    var html = "";
    if (att.autoSubmitted) html += '<div class="callout warn mb">' + I("clock") + "<div><b>Time ran out</b>, so this paper was submitted automatically.</div></div>";
    if (att.leftCount) html += '<div class="callout warn mb">' + I("alert") + "<div>" + (readOnly ? esc(A.firstName(student.name)) + " left" : "You left") + " the exam screen <b>" + att.leftCount + (att.leftCount === 1 ? " time" : " times") + "</b> during this paper.</div></div>";
    if (r.pending) html += '<div class="callout mb">' + I("pen") + "<div><b>" + r.pending + " structured answer" + (r.pending > 1 ? "s need" : " needs") + " marking.</b> " + (readOnly ? "The student marks these against the scheme." : "Scroll down, compare your answer with the marking scheme and award yourself marks.") + "</div></div>";

    html += '<div class="card card-pad"><div class="score-hero"><div class="grade-badge">' + esc(r.grade) + '</div><div class="grow"><div class="small muted">' + esc(M.syllabusTitle(syl)) + '</div><h2 style="font-size:24px">' + esc(att.title) + '</h2><div class="row wrap mt-sm"><span style="font-size:22px;font-weight:800" class="tnum">' + r.got + " / " + r.total + '</span><span class="badge ' + (r.passed ? "good" : "bad") + '">' + I(r.passed ? "checkCircle" : "alert") + (r.passed ? "Pass" : "Below pass mark") + " · " + r.pct + "%</span></div>" +
      '<p class="small muted mt-sm">' + (readOnly ? esc(student.name) + " · " : "") + A.fmtDateTime(att.finishedAt) + " · time used " + A.fmtMinutes(att.timeUsedSec || 0) + " of " + A.fmtMinutes(att.durationSec) + "</p></div>" +
      UI.ring(r.pct, { size: 110, stroke: 11, tone: M.tone(r.pct), label: "Score" }) + "</div></div>";

    var integ = readOnly ? M.copyFlag(att, me.id) : null;
    if (integ && integ.written) {
      html += '<div class="card mt ' + (integ.flagged ? "flag-card" : "") + '"><div class="card-head">' + I("shield") + "<h3>Copy check against the marking scheme</h3><span class=\"grow\"></span>" +
        (integ.flagged ? '<span class="badge serious">' + I("alert") + "Possible copying</span>" : '<span class="badge good">' + I("checkCircle") + "Below your limit</span>") + '</div><div class="card-body"><div class="row wrap" style="gap:22px">' +
        '<div><div style="font-size:30px;font-weight:800" class="tnum">' + integ.identical + " / " + integ.written + '</div><div class="small muted">written answers identical to the marking scheme</div></div>' +
        '<div class="grow" style="min-width:220px"><div class="row spread small"><span>' + integ.pct + '% identical</span><span class="muted">your limit: ' + integ.threshold + "%</span></div>" +
        '<div class="bar lg ' + (integ.flagged ? "bad" : "good") + '" style="position:relative"><i style="width:' + integ.pct + '%"></i><span class="limit-mark" style="left:' + integ.threshold + '%"></span></div>' +
        '<p class="tiny muted mt-sm">An answer counts as identical when at least ' + Math.round(M.IDENTICAL * 100) + '% of its wording matches the marking scheme. Change your limit in <a href="#/t/settings?s=integrity">Settings → Exam integrity</a>.</p></div></div></div></div>';
    }
    html += '<div class="concepts mt"><div class="card"><div class="card-head">' + I("checkCircle") + "<h3>Concepts " + (readOnly ? "they are" : "you're") + " good at</h3></div><div class=\"card-body\">" +
      (strong.length ? strong.map(function (x) { return '<div class="concept"><span class="badge good tnum">' + x.pct + '%</span><div class="grow bold small">' + esc(x.title) + '</div><span class="small muted">' + x.got + "/" + x.total + "</span></div>"; }).join("") : '<p class="muted small">No topic reached ' + M.EXAM.strongTopicMark + "% this time. Keep going!</p>") + "</div></div>" +
      '<div class="card"><div class="card-head">' + I("target") + "<h3>Concepts to revise</h3></div><div class=\"card-body\">" +
      (weak.length ? weak.map(function (x) { return '<div class="concept"><span class="badge ' + x.tone + ' tnum">' + x.pct + '%</span><div class="grow bold small">' + esc(x.title) + '</div>' + (readOnly ? '<span class="small muted">' + x.got + "/" + x.total + "</span>" : '<a class="btn btn-sm" href="' + topicHref(x) + '">' + I("book") + "Revise</a>") + "</div>"; }).join("") : '<p class="muted small">Nothing below ' + M.EXAM.strongTopicMark + "%. Excellent!</p>") + "</div></div></div>";

    html += '<div class="card mt"><div class="card-head"><h3>Score by topic</h3><span class="grow"></span>' + UI.toneLegend() + '</div><div class="card-body">' +
      UI.hbars(topics.map(function (x) { return { label: x.title, pct: x.pct, tone: x.tone, href: topicHref(x), tip: x.title + ": " + x.got + "/" + x.total + " marks · " + M.toneLabel(x.pct) }; })) + "</div></div>";

    html += '<div class="section-title"><h2>Review answers</h2></div><div class="stack">';
    att.questionIds.forEach(function (qid, i) {
      var e = idx[qid]; if (!e) return;
      var q = e.q, ans = att.answers[qid], sm = att.selfMarks && att.selfMarks[qid], g = M.gradeQuestion(q, ans, sm);
      var badge = g.state === "right" ? '<span class="badge good">' + I("check") + "Correct</span>" : g.state === "wrong" ? '<span class="badge bad">' + I("x") + "Incorrect</span>" : g.state === "blank" ? '<span class="badge">Not answered</span>' : g.pending ? '<span class="badge warn">' + I("pen") + "Needs marking</span>" : '<span class="badge brand">Self-marked</span>';
      var yours = q.type === "mcq" ? (ans != null && ans !== "" ? LETTERS[Number(ans)] + ". " + A.inl(q.options[Number(ans)]) : "—") : q.type === "tf" ? (ans ? (ans === "true" ? "True" : "False") : "—") : ans ? A.inl(ans) : "—";
      var sim = integ && integ.perQ[qid] != null ? integ.perQ[qid] : null;
      if (sim != null) badge += '<span class="badge ' + (sim >= M.IDENTICAL ? "serious" : "") + '" data-tip="How much of this answer\'s wording matches the marking scheme">' + I("shield") + Math.round(sim * 100) + "% same as scheme</span>";
      html += '<div class="card qcard"><div class="row spread wrap"><span class="qnum">Question ' + (i + 1) + " · " + esc(e.topic.title) + '</span><div class="row wrap">' + badge + '<b class="tnum small">' + g.got + " / " + g.marks + "</b></div></div>" +
        '<div class="qprompt" style="font-size:16px">' + A.inl(q.prompt) + "</div>" +
        '<div class="grid g-2"><div><div class="label">' + (readOnly ? "Their" : "Your") + ' answer</div><div class="small">' + yours + "</div></div>" +
        '<div><div class="label">' + (q.type === "structured" ? "Marking scheme" : "Correct answer") + '</div><div class="small">' + A.inl(M.answerText(q)) + "</div></div></div>" +
        (q.explanation ? '<div class="feedback info small">' + I("bulb") + "<div>" + A.inl(q.explanation) + "</div></div>" : "") +
        (q.type === "structured" && ans && !readOnly ? '<div class="row wrap mt"><span class="small bold">Award yourself:</span>' + Array.apply(null, { length: (Number(q.marks) || 1) + 1 }).map(function (_, v) {
          return '<button class="btn btn-sm ' + (sm === v ? "btn-primary" : "") + '" data-act="self-mark" data-att="' + att.id + '" data-q="' + qid + '" data-v="' + v + '">' + v + "</button>";
        }).join("") + '<span class="small muted">out of ' + q.marks + "</span></div>" : "") + "</div>";
    });
    html += "</div>";

    if (!readOnly) {
      html += '<div class="row wrap mt-lg">' + (att.taskId ? '<a class="btn" href="#/s/task/' + att.taskId + '">' + I("back") + "Back to task</a>" : '<button class="btn btn-primary" data-act="retake" data-id="' + att.id + '">' + I("refresh") + "Try again</button>") +
        '<a class="btn" href="#/s/test/' + syl.id + '">Test mode</a><a class="btn" href="#/s/study/' + syl.id + '">Study mode</a></div>';
    }
    return html;
  }

  A.route("s/result/:id", function (p, q, me) {
    var att = S().get("attempts", p.id);
    if (!att || att.studentId !== me.id || att.status !== "done") return { redirect: "#/s/exam" };
    var syl = M.syllabus(att.syllabusId);
    return { title: "Your result", crumbs: [{ label: "Exam mode", href: "#/s/exam" }, { label: syl.subject, href: "#/s/test/" + syl.id }, { label: "Result" }], html: resultView(att, me, false) };
  }, { role: "student" });

  A.route("t/attempt/:id", function (p, q, me) {
    var att = S().get("attempts", p.id);
    if (!att || att.status !== "done") return { redirect: "#/t/home" };
    var u = M.user(att.studentId), c = M.classesForTeacher(me.id).find(function (x) { return x.syllabusId === att.syllabusId && x.studentIds.indexOf(att.studentId) >= 0; });
    if (!c) return { redirect: "#/t/home" };
    return { title: u.name + ": " + att.title, crumbs: [{ label: "My classes", href: "#/t/classes" }, { label: u.name, href: "#/t/student/" + u.id + "/" + c.id }, { label: "Test result" }], html: resultView(att, me, true) };
  }, { role: "teacher" });

  A.act["self-mark"] = function (el) {
    var att = S().get("attempts", el.getAttribute("data-att")), selfMarks = Object.assign({}, att.selfMarks);
    selfMarks[el.getAttribute("data-q")] = Number(el.getAttribute("data-v"));
    M.rescore(Object.assign({}, att, { selfMarks: selfMarks }));
    A.render();
  };
  A.act.retake = function (el) {
    var att = S().get("attempts", el.getAttribute("data-id")), cfg = att.config || {};
    var n = M.createAttempt({ studentId: att.studentId, syllabusId: att.syllabusId, paperId: cfg.paperId || att.paperId, topicIds: cfg.topicIds, count: cfg.count || att.questionIds.length, durationMin: cfg.durationMin || att.durationSec / 60, title: att.title });
    location.hash = "#/s/exam-room/" + n.id;
  };
})(window.App);
