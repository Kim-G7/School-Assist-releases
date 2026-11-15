/* Syllabus library: create, import (JSON), export and edit any exam board's syllabus:
   topics with notes, worked examples and question banks, mock papers and grade boundaries. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var DEFAULT_SCALE = [{ grade: "A", min: 75 }, { grade: "B", min: 65 }, { grade: "C", min: 50 }, { grade: "D", min: 40 }, { grade: "E", min: 30 }, { grade: "U", min: 0 }];

  function usedBy(syl) { return S().filter("classes", function (c) { return c.syllabusId === syl.id; }); }
  function qCount(syl) { return A.sum(syl.topics || [], function (t) { return (t.questions || []).length; }); }

  /* ================================================================ LIBRARY
     A panel for each exam board the school has syllabuses for (the boards its classes use first) and, inside
     it, a panel for each level those syllabuses are at: IGCSE, AS & A Level, International GCSE… Only levels
     that hold a syllabus get a panel. */
  // AS Level and A Level syllabuses share one panel, as the boards teach and examine them together; Cambridge
  // IGCSE and the International GCSE of Pearson Edexcel and Oxford AQA are different qualifications, so each
  // keeps its own. Any other level gets a panel under the name it was entered with.
  var LEVEL_NAMES = [
    { name: "IGCSE", re: /^(cambridge\s+)?igcse$/i },
    { name: "International GCSE", re: /^international\s+gcse$/i },
    { name: "O-Level", re: /^(o[\s-]*levels?|ordinary\s+level)$/i },
    { name: "AS & A Level", re: /^(cambridge\s+(international\s+)?)?(as\s*(&|and)\s*a|as|a|advanced(\s+subsidiary)?)[\s-]*levels?$/i },
  ];
  // school years first, then the exam levels in the order students reach them
  var LEVEL_ORDER = ["Form 1", "Form 2", "Cambridge Lower Secondary", "IB Middle Years", "IGCSE", "International GCSE", "GCSE", "O-Level", "AS & A Level", "IB Diploma"];
  function levelName(s) {
    var lv = String(s.level || "").trim(), hit = LEVEL_NAMES.filter(function (x) { return x.re.test(lv); })[0];
    return hit ? hit.name : lv || "Level not set";
  }
  function levelRank(name) { var i = LEVEL_ORDER.indexOf(name); return i >= 0 ? i : name === "Level not set" ? 999 : 500; }
  function count(n, one, many) { return n + " " + (n === 1 ? one : many); }
  // a panel folded away stays folded while the app is open
  var folded = {};
  document.addEventListener("toggle", function (e) {
    var k = e.target && e.target.getAttribute && e.target.getAttribute("data-panel");
    if (k) folded[k] = !e.target.open;
  }, true);

  /* ================================================================ ONE STORE (2026-11-15)
     Every syllabus is one record in "syllabi", with its syllabus ID, wherever it was added: in this library (new, from a
     file or the ready-made list) or from a class (My subjects, a class's syllabus tracker, View other classes). So it is
     the same here, in the tracker of every class that uses it and in Settings → Subjects & codes. Its code says which
     syllabus it is: the school can't have one twice (the same code and board; without a code, the same subject, level
     and board). A class finds its syllabus by the subject: a subject class by its own syllabusId; a form by the subject's
     record (js/catalogue.js: linked by subjectId, or the same code), else by the subject's name at the form or its level.
     School Assist Teacher's syllabuses of 1.6.2 to 1.8.5 ("outlines") come into the library keeping their topics' ids, so
     every class's ticks stay (Syl.adopt). */
  var Syl = (A.Syl = {});
  var key = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
  var normT = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  /** An exam board as a key: "" for the school's own, Cambridge however it is written. */
  function boardKey(b) { var k = key(b); return !k || k === "schoolbased" || k === "school" ? "" : /^(cie|caie|cambridge)/.test(k) ? "cambridge" : k; }
  function sameBoard(a, b) { var x = boardKey(a), y = boardKey(b); return !x || !y || x === y; }
  /** The names a subject goes by, as keys (English: English First Language, English Language…). */
  function names(subject) { var k = key(subject), al = (A.Enrol && A.Enrol.ALIAS && A.Enrol.ALIAS[k.replace(/[0-9]/g, "")]) || []; return [k].concat(al); }
  /** After a syllabus goes in: where its topics wait for notes (Co-teacher, where students sign in). */
  Syl.notesNote = function () { return A.Primary && A.Primary.withStudents ? ". Its topics are in Co-teacher, in order, waiting for notes" : ""; };
  Syl.sameSubject = function (a, b) { return names(a).indexOf(key(b)) >= 0 || names(b).indexOf(key(a)) >= 0; };
  var forms = function () { return (M.structure && M.structure().levels) || []; };
  var groupOfForm = function (level) { return A.Subjects ? A.Subjects.group(level) : "school"; };
  /** Its group of forms, as the school's subjects have them (js/catalogue.js): igcse, alevel or school. */
  Syl.group = function (s) {
    var n = levelName(s);
    if (n === "AS & A Level") return "alevel";
    if (/^(IGCSE|International GCSE|O-Level|GCSE)$/.test(n)) return "igcse";
    return groupOfForm((s.forms || [])[0] || s.level);
  };
  Syl.code = function (s) { return key(s && s.code); };
  /** What a syllabus is called: its own name, else "Cambridge IGCSE Mathematics (0580)". */
  Syl.title = function (s) { return (s && s.title) || M.syllabusTitle(s); };
  /** The school's syllabus that this one would be a second copy of (null: none). */
  Syl.twin = function (rec, exceptId) {
    var code = Syl.code(rec), subj = key(rec.subject), lv = key(levelName(rec));
    return S().filter("syllabi", function (s) {
      if (s.id === exceptId || !sameBoard(s.board, rec.board)) return false;
      var c = Syl.code(s);
      return code && c ? c === code : key(s.subject) === subj && key(levelName(s)) === lv;
    })[0] || null;
  };
  /** Does a syllabus suit a form? 0: made for it (on its list of forms, or its level is the form); 1: the form is at its
      level (IGCSE: Forms 1 to 4); -1: no. */
  function fit(s, level) {
    if ((s.forms || []).length) return s.forms.indexOf(level) >= 0 ? 0 : -1;
    if (!level) return 1;
    if (key(s.level) === key(level)) return 0;
    if (forms().some(function (l) { return key(l) === key(s.level); })) return -1; // (made for another form)
    return Syl.group(s) === groupOfForm(level) ? 1 : -1;
  }
  Syl.fits = function (s, level) { return fit(s, level) >= 0; };
  /** The syllabus a class uses for a subject (null: none yet). A subject class: its own. A form: the one linked to the
      subject's record or with its code, else one with the subject's name; one made for the form before one for its level. */
  Syl.forClass = function (subject, level, c) {
    if (c && !c.homeroom && c.syllabusId) { var own = M.syllabus(c.syllabusId); if (own) return own; }
    var rec = A.Subjects ? A.Subjects.find(subject, level || null) : null, code = rec ? key(rec.code) : "", ks = names(subject), best = null, rank = 99;
    S().all("syllabi").forEach(function (s) {
      var f = fit(s, level), linked = !!rec && (s.subjectId === rec.id || (!!code && Syl.code(s) === code));
      if (f < 0 || (!linked && ks.indexOf(key(s.subject)) < 0)) return;
      var r = (f === 0 ? 0 : 2) + (linked ? 0 : 1) + ((s.topics || []).length ? 0 : 10);
      if (r < rank) { rank = r; best = s; }
    });
    return best;
  };
  /** The syllabus of a subject's record (Settings → Subjects & codes). */
  Syl.forSubject = function (r) {
    var list = (r.forms || []).length ? r.forms : [r.group === "alevel" ? "AS & A Level" : r.group === "igcse" ? "IGCSE" : null], s = null;
    list.some(function (lv) { s = Syl.forClass(r.name, lv); return !!s; });
    return s;
  };
  /** The classes that use a syllabus: subject classes linked to it, and forms whose tracker takes it for a subject. */
  Syl.usedBy = function (s) {
    var out = S().filter("classes", function (c) { return !c.homeroom && c.syllabusId === s.id; }), P = A.Primary;
    if (!P || !P.levelAreas) return out;
    var code = Syl.code(s);
    S().filter("classes", function (c) { return c.homeroom; }).forEach(function (c) {
      var areas = (P.levelAreas(c.level) || []).filter(function (a) {
        if (!P.offers(c, a)) return false;
        if (Syl.sameSubject(a, s.subject)) return true;
        var r = A.Subjects && A.Subjects.find(a, c.level);
        return !!r && (r.id === s.subjectId || (!!code && key(r.code) === code));
      });
      if (areas.some(function (a) { return Syl.forClass(a, c.level, c) === s; })) out.push(c);
    });
    return out;
  };
  /** A syllabus for more forms: those that aren't at its level go on its list of forms (a syllabus without a list is for
      its level's forms: they go on the list first, so they keep it). */
  Syl.addForms = function (s, list) {
    var more = (list || []).filter(function (l) { return fit(s, l) < 0; });
    if (!more.length) return s;
    var to = (s.forms || []).length ? s.forms.slice() : forms().filter(function (l) { return fit(s, l) >= 0; });
    more.forEach(function (l) { if (to.indexOf(l) < 0) to.push(l); });
    return S().put("syllabi", Object.assign({}, s, { forms: to }));
  };
  /** A new syllabus for a subject at some forms, as a class adds it. With an exam code (the subject's, or one typed): the
      exam board's, at its level (IGCSE, AS & A Level); without: the school's own, at those forms. */
  Syl.draft = function (subject, list, rec, code) {
    list = list || [];
    rec = rec || (A.Subjects ? A.Subjects.find(subject, list[0] || null) : null);
    code = String(code || (rec && rec.code) || "").trim();
    var g = rec ? rec.group : groupOfForm(list[0] || ""), exam = !!code && g !== "school", all = forms().filter(function (l) { return groupOfForm(l) === g; });
    var whole = exam && all.length && list.length === all.length && all.every(function (l) { return list.indexOf(l) >= 0; });
    return { subject: subject, board: exam ? (rec && rec.board) || "Cambridge" : "School-based", level: exam ? (g === "alevel" ? "AS & A Level" : "IGCSE") : list.join(", ") || "School scheme",
      code: code, subjectId: rec ? rec.id : null, forms: whole ? [] : list.slice(),
      topics: [], papers: [], gradeScale: DEFAULT_SCALE.slice() };
  };
  /** The tracker's topics as a syllabus has them: [{ id, n, title, parts: [{ n, title }] }]. */
  Syl.topics = function (s) {
    return (s.topics || []).map(function (t, i) {
      var parts = (t.outline || t.parts || []).map(function (x) { return { n: x.n || "", title: x.title || "" }; }).filter(function (x) { return x.title; });
      var n = t.n || String(i + 1); // (its place in the syllabus: the board's part numbers needn't follow the topics' order)
      return { id: t.id, n: String(n), title: t.title, parts: parts };
    });
  };
  /** Topics typed or read for the tracker ({ id, n, title, parts }) into a syllabus's: a topic it had keeps its notes,
      examples, questions and term, and a part it had keeps what to study in it. */
  Syl.mergeTopics = function (lines, old) {
    var byId = {};
    (old || []).forEach(function (t) { byId[t.id] = t; });
    return lines.map(function (t) {
      var was = byId[t.id], had = (was && was.outline) || [];
      var outline = (t.parts || []).map(function (p) {
        var o = had.filter(function (x) { return (p.n && x.n === p.n) || normT(x.title) === normT(p.title); })[0];
        return Object.assign({ points: [], sup: [] }, o || {}, { n: p.n || "", title: p.title });
      });
      var out = Object.assign({}, was || { notes: "", examples: [], questions: [], estMinutes: 30, term: 1 }, { id: t.id, n: t.n, title: t.title, outline: outline });
      delete out.parts;
      return out;
    });
  };
  /** One of the older syllabuses ("outlines", 1.6.2 to 1.8.5) into the library: a syllabus with the same topic ids, or,
      when the school has that syllabus already, the classes' ticks move onto its topics of the same names. The old
      record stays, marked, for devices not updated yet. The syllabus it went into. */
  Syl.adopt = function (o) {
    if (!o || o.movedTo) return o ? M.syllabus(o.movedTo) : null;
    var lv = (o.levels || [])[0] || null, draft = Syl.draft(o.subject, o.levels || []), id = "syl_" + o.id;
    var have = M.syllabus(id) || Syl.twin(draft) || (lv ? null : Syl.forClass(o.subject, null));
    var topics = (o.topics || []).map(function (t) { return { id: t.id, n: t.n, title: t.title, parts: t.parts || [] }; });
    if (have && have.id === id) { /* (brought in already, from another device) */ }
    else if (have && (have.topics || []).length) {
      var byName = {}, map = {};
      have.topics.forEach(function (t) { byName[normT(t.title)] = t.id; });
      topics.forEach(function (t) { var to = byName[normT(t.title)]; if (to && to !== t.id) map[t.id] = to; });
      var move = function (m) { var out = {}; Object.keys(m || {}).forEach(function (k) { out[map[k] || k] = m[k]; }); return out; };
      S().filter("coverage", function (r) { return r.outlineId === o.id; }).forEach(function (r) {
        S().put("coverage", Object.assign({}, r, { plan: move(r.plan), done: move(r.done), syllabusId: have.id }));
      });
      have = Syl.addForms(have, o.levels || []);
    } else if (have) {
      have = S().put("syllabi", Object.assign({}, have, { topics: Syl.mergeTopics(topics, []), file: have.file || o.file || null }));
      have = Syl.addForms(have, o.levels || []);
    } else {
      have = S().put("syllabi", Object.assign(draft, { id: id, title: o.title || "", file: o.file || null, topics: Syl.mergeTopics(topics, []), createdBy: o.createdBy || o.by || null }));
    }
    S().put("outlines", Object.assign({}, o, { movedTo: have.id }));
    return have;
  };
  /* ================================================================ A STUDENT'S WAY THROUGH A SYLLABUS (2026-11-15)
     Each topic's evidence, from what the teachers set for it: the tutor's notes (Co-teacher) and flashcards, its quick check
     and practice questions, topic tests (the Mark book's, and the topical papers sat in the tutor) and mock tests. A topic
     is done when its quick check or practice reaches the mastery mark, or a topic test is passed; and the term's
     end-of-term test finishes the term: passed (the Mark book's test, or the end-of-term mark on the report card), every
     topic of that term counts as done for the student, so the term's work is finished. A topic's term is the one its
     class's scheme gives it (js/tracker.js: Schemes & records, the syllabus tracker), else the syllabus's. */
  var marksIx = null;
  function marks() {
    if (marksIx) return marksIx;
    marksIx = { topic: {}, mock: [], final: [], rm: {} };
    S().all("assessments").forEach(function (a) {
      var k = String(a.kind || "");
      if (/^topic test$/i.test(k) && a.topicId) (marksIx.topic[a.topicId] = marksIx.topic[a.topicId] || []).push(a);
      else if (/mock/i.test(k)) marksIx.mock.push(a);
      else if (/end of term/i.test(k)) marksIx.final.push(a);
    });
    S().filter("reportmarks", function (r) { return r.studentId && r.subject && r.mark != null && r.mark !== ""; }).forEach(function (r) { (marksIx.rm[r.studentId] = marksIx.rm[r.studentId] || []).push(r); });
    setTimeout(function () { marksIx = null; }, 0);
    return marksIx;
  }
  var pctOf = function (a, sid) { var v = (a.marks || {})[sid]; return v == null || v === "" || !(Number(a.outOf) > 0) ? null : Math.round(Number(v) / Number(a.outOf) * 100); };
  var passMark = function () { return (M.EXAM && M.EXAM.passMark) || 50; };
  /** The term a topic is for, for a student: their form's scheme for the subject (a topic it gave no term: none, 0), else,
      with no scheme yet, the syllabus's own. */
  function termsFor(sid, syl) {
    var P = A.Primary, home = M.homeroomOf ? M.homeroomOf(sid) : null, plan = {};
    if (P && A.Tracker && home) {
      var area = ((P.levelAreas && P.levelAreas(home.level)) || []).filter(function (a) { return Syl.sameSubject(a, syl.subject); })[0] || syl.subject;
      var cv = A.Tracker.cov(home.id, area);
      plan = (cv && cv.plan) || {};
    }
    var schemed = Object.keys(plan).length > 0;
    return function (t) { return schemed ? Number(plan[t.id]) || 0 : M.topicTerm(t); };
  }
  /** { byTopic: { topicId: { state: done | prog | none, term, ev: [{ k, label, pct, done }] } }, terms: { n: { done, label, pct } } } */
  Syl.studentTopics = function (sid, syl) {
    var ix = marks(), conf = A.Primary ? A.Primary.conf() : null, year = conf ? String(conf.year) : String(A.date().getFullYear()), termOf = termsFor(sid, syl), pass = passMark(), mastery = M.EXAM.topicMasteryMark;
    var subj = function (name) { return Syl.sameSubject(name, syl.subject); };
    // the end of each term: the Mark book's end-of-term test, else the end-of-term mark on the report card
    var terms = {};
    ix.final.filter(function (a) { return String(a.year) === year && subj(a.area); }).forEach(function (a) {
      var p = pctOf(a, sid); if (p == null) return;
      var n = Number(a.term), cur = terms[n];
      if (!cur || p > cur.pct) terms[n] = { done: p >= pass, label: a.title || "End of term test", pct: p };
    });
    (ix.rm[sid] || []).filter(function (r) { return String(r.year) === year && subj(r.subject); }).forEach(function (r) {
      var n = Number(r.term), p = Number(r.outOf) > 0 ? Math.round(Number(r.mark) / Number(r.outOf) * 100) : null;
      if (p != null && !terms[n]) terms[n] = { done: p >= pass, label: "End-of-term mark", pct: p };
    });
    var mocks = {};
    ix.mock.filter(function (a) { return String(a.year) === year && subj(a.area); }).forEach(function (a) {
      var p = pctOf(a, sid); if (p == null) return;
      var n = Number(a.term); if (!mocks[n] || p > mocks[n].pct) mocks[n] = { label: a.title || "Mock test", pct: p };
    });
    var byTopic = {};
    (syl.topics || []).forEach(function (t) {
      var ev = [], rec = M.topicProgress(sid, t.id), tu = (rec && rec.tutor) || {}, n = termOf(t);
      var read = Object.keys(tu.read || {}).length, cards = Object.keys(tu.cards || {}).length;
      if (read || (rec && rec.notesReadAt)) ev.push({ k: "notes", label: "Notes read" });
      if (cards) ev.push({ k: "cards", label: "Flashcards · " + cards });
      if (tu.check && tu.check.best != null) ev.push({ k: "check", label: "Quick check", pct: tu.check.best, done: tu.check.best >= mastery });
      if (rec && rec.practiceBest != null) ev.push({ k: "practice", label: "Practice", pct: rec.practiceBest, done: rec.practiceBest >= mastery });
      (ix.topic[t.id] || []).forEach(function (a) { var p = pctOf(a, sid); if (p != null) ev.push({ k: "test", label: a.title || "Topic test", pct: p, done: p >= pass }); });
      if (M.topicTests && M.paperSitting) M.topicTests(sid, syl.id, t.id).forEach(function (pp) {
        var r = M.paperSitting(sid, pp.id); if (!r || !r.doneAt) return;
        var p = r.total ? Math.round(r.score / r.total * 100) : null;
        ev.push({ k: "test", label: pp.title, pct: p, done: p != null && p >= pass });
      });
      if (mocks[n]) ev.push({ k: "mock", label: mocks[n].label, pct: mocks[n].pct });
      if (terms[n] && terms[n].done) ev.push({ k: "final", label: terms[n].label, pct: terms[n].pct, done: true });
      var noQs = !(t.questions || []).length && rec && rec.notesReadAt && !(tu.check && tu.check.best != null);
      var state = ev.some(function (e) { return e.done; }) || noQs ? "done" : ev.length || M.topicState(rec, t) !== "none" ? "prog" : "none";
      byTopic[t.id] = { state: state, term: n, ev: ev, rec: rec };
    });
    return { byTopic: byTopic, terms: terms, termOf: termOf };
  };
  /** The evidence of a topic as small badges. */
  Syl.evidenceHtml = function (x) {
    if (!x || !x.ev.length) return '<span class="muted small">Nothing yet</span>';
    return x.ev.map(function (e) { return '<span class="badge' + (e.done ? " good" : e.pct != null && e.pct < passMark() ? " warn" : "") + '">' + esc(e.label) + (e.pct != null ? " · " + e.pct + "%" : "") + "</span>"; }).join(" ");
  };
  /** One student's topics not done yet, term by term, in a pop-up: from a class's syllabus page or tracker. */
  A.act["syl-gaps"] = function (el) {
    var u = M.user(el.getAttribute("data-sid")), syl = M.syllabus(el.getAttribute("data-syl")), only = Number(el.getAttribute("data-term")) || 0;
    if (!u || !syl) return;
    var st = Syl.studentTopics(u.id, syl), byTerm = {};
    syl.topics.forEach(function (t, i) { var x = st.byTopic[t.id]; if (x.state !== "done" && (!only || x.term === only)) (byTerm[x.term] = byTerm[x.term] || []).push({ t: t, i: i, x: x }); });
    var ns = Object.keys(byTerm).map(Number).sort(function (a, b) { return (a || 9) - (b || 9); }), left = ns.reduce(function (s, n) { return s + byTerm[n].length; }, 0);
    UI.modal({ title: u.name, sub: esc(syl.subject) + " · " + (left ? left + " topic" + (left === 1 ? "" : "s") + " not done yet" : "every topic done") + (only ? " in Term " + only : ""), size: "wide",
      body: (ns.length ? ns.map(function (n) {
        var fin = st.terms[n];
        return '<div class="label mt">' + (n ? "Term " + n : "No term yet") + (fin ? ' <span class="badge ' + (fin.done ? "good" : "warn") + '">' + esc(fin.label) + " · " + fin.pct + "%" + (fin.done ? " · term finished" : "") + "</span>" : "") + "</div>" +
          '<div class="card">' + byTerm[n].map(function (y) {
            return '<div class="list-row"><span class="topic-num">' + (y.i + 1) + '</span><div class="grow"><div class="title">' + esc(y.t.title) + '</div><div class="row wrap mt-sm" style="gap:4px">' + Syl.evidenceHtml(y.x) + "</div></div></div>";
          }).join("") + "</div>";
      }).join("") : '<div class="card-pad">' + UI.empty("checkCircle", "Every topic done", u.name + " has finished every topic" + (only ? " of Term " + only : "") + ".") + "</div>") +
        '<p class="tiny muted mt">A topic is done when its quick check or practice reaches ' + M.EXAM.topicMasteryMark + "%, or its topic test is passed (" + passMark() + "%). Passing the end-of-term test finishes the term's topics.</p>",
      foot: [{ label: "Close", cls: "btn-primary" }] });
  };

  // an admin's device brings them in by itself, once it has the hub's records (as js/catalogue.js makes the subjects)
  setInterval(function () {
    var me = A.Store && A.Store.state && M.me ? M.me() : null;
    if (!me || !me.isAdmin || A.edition === "home" || A.Store.vacation) return;
    var list = S().filter("outlines", function (o) { return !o.movedTo && (o.topics || []).length; }), meta = S().state.meta || {};
    if (!list.length || (A.Sync && A.Sync.hubMode && A.Sync.hubMode() && !(meta.serverSince > 0 && A.now() - (meta.lastSyncAt || 0) < 5 * 60000))) return;
    list.forEach(Syl.adopt);
    A.render();
  }, 9000);

  function sylCard(s, used) {
    used = used || Syl.usedBy(s);
    return '<a class="card class-card" href="#/t/syllabus/' + s.id + '"><div class="band"></div><div class="body"><div class="row spread"><span class="badge brand">' + esc(s.level || "") + "</span>" + (s.code ? '<span class="muted small">' + esc(s.code) + "</span>" : "") + "</div>" +
      '<h3 class="mt-sm">' + esc(s.subject) + '</h3><div class="subj">' + esc(s.description || "") + '</div><div class="tiny muted mt-sm">Syllabus ID ' + esc(s.id) + "</div></div>" +
      '<div class="foot"><span>' + I("layers") + count((s.topics || []).length, "topic", "topics") + "</span><span>" + I("target") + count(qCount(s), "question", "questions") + "</span><span>" + I("clock") + count((s.papers || []).length, "paper", "papers") + "</span>" +
      (used.length ? '<span class="badge good">' + I("users") + used.map(function (c) { return esc(c.name); }).join(", ") + "</span>" : "") + "</div></a>";
  }

  A.route("t/syllabi", function (p, q, me) {
    // just the subjects this teacher (or admin) works with, unless they switch to All subjects
    var only = M.subjectFilter(me), every = S().all("syllabi");
    var all = only ? every.filter(function (s) { return only.indexOf(s.id) >= 0; }) : every, boards = Object.create(null); // keyed by names people type: no inherited keys
    var usedMap = {};
    all.forEach(function (s) {
      var name = String(s.board || "").trim() || "Other", lv = levelName(s), used = (usedMap[s.id] = Syl.usedBy(s)).length;
      var b = boards[name.toLowerCase()] = boards[name.toLowerCase()] || { name: name, levels: Object.create(null), n: 0, used: 0 };
      var l = b.levels[lv] = b.levels[lv] || { name: lv, items: [] };
      l.items.push(s); b.n++; b.used += used;
    });
    var list = Object.keys(boards).map(function (k) { return boards[k]; }).sort(function (a, b) {
      return (b.used > 0) - (a.used > 0) || b.used - a.used || b.n - a.n || a.name.localeCompare(b.name);
    });
    var html = '<div class="row spread wrap mb"><p class="muted" style="max-width:640px">Cambridge syllabuses (IGCSE and AS &amp; A Level), or your own school scheme. Each syllabus holds its topics, notes, worked examples, test questions, mock papers and grade boundaries.</p>' +
      '<div class="row wrap"><button class="btn" data-act="syl-template">' + I("download") + 'Template</button><label class="btn">' + I("upload") + 'Import file<input type="file" accept=".json,application/json" data-change="syl-import" hidden></label>' +
      (me.isAdmin ? '<button class="btn" data-act="syl-readymade">' + I("layers") + "Ready-made syllabuses</button>" : "") +
      '<button class="btn btn-primary" data-act="syl-new">' + I("plus") + "New syllabus</button></div></div>" + A.subjectScopeBar(me, true);
    html += list.map(function (b) {
      var bk = "board:" + b.name.toLowerCase();
      var levels = Object.keys(b.levels).map(function (k) { return b.levels[k]; }).sort(function (x, y) { return levelRank(x.name) - levelRank(y.name) || x.name.localeCompare(y.name); });
      return '<details class="card syl-board mb" data-panel="' + esc(bk) + '"' + (folded[bk] ? "" : " open") + '><summary class="card-head">' + I("school") + "<h3>" + esc(b.name) + '</h3><span class="sub">' +
        count(b.n, "syllabus", "syllabuses") + " · " + (b.used ? "used by " + count(b.used, "class", "classes") : "not used by a class yet") + "</span></summary>" +
        '<div class="syl-levels">' + levels.map(function (l) {
          var lk = bk + "/" + l.name.toLowerCase();
          var items = l.items.slice().sort(function (x, y) { return String(x.subject).localeCompare(String(y.subject)) || String(x.code || "").localeCompare(String(y.code || "")); });
          return '<details class="syl-level" data-panel="' + esc(lk) + '"' + (folded[lk] ? "" : " open") + "><summary>" + I("cap") + "<h4>" + esc(l.name) + '</h4><span class="sub">' + count(items.length, "syllabus", "syllabuses") + "</span></summary>" +
            '<div class="grid g-auto">' + items.map(function (s) { return sylCard(s, usedMap[s.id]); }).join("") + "</div></details>";
        }).join("") + "</div></details>";
    }).join("");
    if (!all.length) html += '<div class="card">' + (only && every.length ? UI.empty("layers", "None of your subjects yet", "Your subjects appear here once you teach a class. Switch to All subjects to see the whole library.")
      : UI.empty("layers", "No syllabuses yet", "Create one, or import a file shared by another school or teacher.")) + "</div>";
    html += '<div class="callout mt-lg">' + I("info") + '<div><b>Importing a syllabus</b>: download the template, fill in the topics, notes and questions (any text editor works), then use <b>Import file</b>. Export any syllabus to share it with other teachers or schools.</div></div>';
    return { title: "Syllabus library", html: html };
  }, { role: "teacher" });

  /* ------------------------------------------------------------- ready-made syllabuses
     Cambridge IGCSE and AS & A Level: topics and what to study, read from the official syllabus
     PDFs (syllabi/library.js, loaded only when this opens). An admin ticks the subjects to add. */
  function loadLibrary() {
    if (window.SYLLABUS_LIBRARY) return Promise.resolve(window.SYLLABUS_LIBRARY);
    return new Promise(function (ok, fail) {
      var el = document.createElement("script");
      el.src = "syllabi/library.js";
      el.onload = function () { window.SYLLABUS_LIBRARY ? ok(window.SYLLABUS_LIBRARY) : fail(new Error("The list of syllabuses is empty.")); };
      el.onerror = function () { fail(new Error("The list of syllabuses couldn't be loaded. Check the internet connection and try again.")); };
      document.head.appendChild(el);
    });
  }
  A.loadSyllabusLibrary = loadLibrary; // (js/enrol.js: a subject class made for a student takes its Cambridge syllabus)
  /** A ready-made syllabus into the school's own, each topic with a start on its notes: the record saved. */
  A.addLibrarySyllabus = function (lib, me) {
    var have = M.syllabus(lib.id) || Syl.twin(lib);
    if (have) return have; // (the school has it already: a syllabus is in the library once)
    var src = JSON.parse(JSON.stringify(lib)), sr = A.Subjects && A.Subjects.find(src.subject, src.level);
    src.createdBy = me ? me.id : null;
    if (sr) src.subjectId = sr.id;
    src.topics.forEach(function (t) {
      t.notes = t.notes || ["## In this topic", t.summary || t.title, "## How to revise it", "- Go through your class notes and textbook for this topic.",
        "- Check **What to study** and tick off each point you can explain.", "- When you feel confident, tap **I've revised this topic** below."].join("\n");
    });
    return S().put("syllabi", src);
  };
  A.act["syl-readymade"] = function () {
    UI.modal({
      title: "Ready-made syllabuses", size: "wide",
      body: '<p class="muted">Cambridge syllabuses with their topics and what to study in each, read from the official syllabus documents. Tick the ones your school teaches; you can add notes, examples and questions to them afterwards.</p><div id="rm-list" class="mt"><p class="muted small">' + I("refresh") + " Loading the list…</p></div>",
      foot: [{ label: "Cancel" }, { label: "Add selected", cls: "btn-primary", icon: "plus", onClick: function (box) {
        var picked = Array.prototype.map.call(box.querySelectorAll("#rm-list input:checked:not(:disabled)"), function (x) { return x.value; });
        if (!picked.length) { UI.toast("Tick at least one syllabus", "bad"); return false; }
        var me = M.me(), home = A.edition === "home", st = M.structure();
        var byId = {}; (window.SYLLABUS_LIBRARY || []).forEach(function (x) { byId[x.id] = x; });
        picked.forEach(function (id) {
          var src = A.addLibrarySyllabus(byId[id], me);
          // the home edition offers a subject to students through its revision class
          if (home && !S().get("classes", "c_cie_" + src.code)) {
            var lv = /A Level/.test(src.level) ? st.levels[st.levels.length - 1] : st.levels[Math.min(3, st.levels.length - 1)];
            S().put("classes", { id: "c_cie_" + src.code, name: "Revision", level: lv, stream: null, subject: src.subject, teacherId: A.Cloud ? "t_admin" : me.id,
              syllabusId: src.id, room: "", studentIds: [], currentTerm: 3, allTerms: true, sequential: false, topicAccess: {} });
          }
        });
        UI.toast(picked.length + " syllabus" + (picked.length === 1 ? "" : "es") + " added" + Syl.notesNote());
        A.render();
      } }],
      onMount: function (box) {
        loadLibrary().then(function (lib) {
          var groups = {};
          lib.forEach(function (x) { var k = x.board + " " + x.level; (groups[k] = groups[k] || []).push(x); });
          box.querySelector("#rm-list").innerHTML = Object.keys(groups).map(function (k) {
            var items = groups[k].slice().sort(function (a, b2) { return a.subject.localeCompare(b2.subject); });
            return '<div class="rm-group"><div class="row spread"><h4>' + esc(k) + '</h4><button type="button" class="btn btn-sm btn-ghost" data-rm-all="' + esc(k) + '">Tick all</button></div><div class="rm-items">' + items.map(function (x) {
              var have = !!(M.syllabus(x.id) || Syl.twin(x)), outline = x.topics.filter(function (t) { return t.outline && t.outline.length; }).length;
              return '<label class="rm-item' + (have ? " have" : "") + '"><input type="checkbox" value="' + esc(x.id) + '" data-group="' + esc(k) + '"' + (have ? " checked disabled" : "") + '><span class="grow"><b>' + esc(x.subject) + "</b> " + esc(x.code) +
                '<span class="tiny muted">' + x.topics.length + " topics" + (outline ? ", what to study for " + outline : "") + (have ? " · already added" : "") + "</span></span></label>";
            }).join("") + "</div></div>";
          }).join("");
          box.querySelector("#rm-list").addEventListener("click", function (e) {
            var b3 = e.target.closest("[data-rm-all]"); if (!b3) return;
            box.querySelectorAll('#rm-list input[data-group="' + b3.getAttribute("data-rm-all") + '"]:not(:disabled)').forEach(function (x) { x.checked = true; });
          });
        }).catch(function (e) { box.querySelector("#rm-list").innerHTML = '<div class="callout warn">' + I("alert") + "<div>" + esc(e.message || String(e)) + "</div></div>"; });
      },
    });
  };

  /* ------------------------------------------------------------- import/export */
  A.act["syl-template"] = function () { A.download("syllabus-template.json", JSON.stringify(A.syllabusTemplate(), null, 2)); };
  A.act["syl-export"] = function (el) {
    var s = M.syllabus(el.getAttribute("data-id")), out = JSON.parse(JSON.stringify(s));
    delete out.createdAt; delete out.updatedAt; delete out.createdBy;
    A.download(A.slug([s.board, s.level, s.subject, s.code].join(" ")) + ".json", JSON.stringify(out, null, 2));
  };
  A.act["syl-import"] = function (el) {
    var file = el.files[0];
    if (!file) return;
    A.readText(file).then(function (txt) {
      var data = JSON.parse(txt);
      var list = Array.isArray(data) ? data : data.syllabi || [data];
      var done = [];
      var next = function () {
        if (!list.length) {
          if (done.length) { UI.toast("Imported " + done.length + " syllabus" + (done.length > 1 ? "es" : "")); location.hash = "#/t/syllabus/" + done[0]; A.render(); }
          return;
        }
        var raw = list.shift(), res = A.normalizeSyllabus(raw);
        if (res.errors.length) {
          UI.modal({ title: "This file has problems", body: '<p class="muted">Fix these in the file and import it again:</p><ul class="small">' + res.errors.slice(0, 12).map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" });
          return;
        }
        var syl = res.syllabus, existing = (syl.id && M.syllabus(syl.id)) || Syl.twin(syl);
        var save = function (ok) {
          if (!ok) { next(); return; } // (the library keeps its own: a syllabus is in it once)
          if (existing) Object.assign(syl, { id: existing.id, forms: existing.forms, subjectId: existing.subjectId });
          var sr = !syl.subjectId && A.Subjects && A.Subjects.find(syl.subject, syl.level);
          if (sr) syl.subjectId = sr.id;
          syl.createdBy = M.me().id;
          S().put("syllabi", syl);
          done.push(syl.id);
          next();
        };
        if (existing) UI.confirm("\"" + M.syllabusTitle(existing) + "\" is in the library already (syllabus ID " + existing.id + "). Replace it with the imported version? The classes that use it keep it. (Cancel keeps the library's.)", { ok: "Replace" }).then(save);
        else save(true);
      };
      next();
    }).catch(function (e) { UI.toast("Could not read that file: " + e.message, "bad"); })
      .then(function () { el.value = ""; });
  };

  /** Validate + fill in ids/defaults for a syllabus coming from a file. */
  A.normalizeSyllabus = function (raw) {
    var errors = [], syl = JSON.parse(JSON.stringify(raw || {}));
    if (!syl.subject) errors.push("The syllabus needs a \"subject\".");
    if (!Array.isArray(syl.topics)) { errors.push("The syllabus needs a \"topics\" list."); syl.topics = []; }
    syl.board = syl.board || "School-based";
    syl.level = syl.level || "";
    syl.id = syl.id || "syl_" + A.slug([syl.board, syl.level, syl.subject, syl.code].join(" ")).replace(/-/g, "_");
    syl.gradeScale = Array.isArray(syl.gradeScale) && syl.gradeScale.length ? syl.gradeScale : DEFAULT_SCALE.slice();
    var seenT = {};
    syl.topics.forEach(function (t, ti) {
      var where = "Topic " + (ti + 1);
      if (!t.title) errors.push(where + " needs a \"title\".");
      t.id = t.id || syl.id + "_" + A.slug(t.title || "topic-" + (ti + 1)).replace(/-/g, "_");
      while (seenT[t.id]) t.id += "_x";
      seenT[t.id] = 1;
      t.notes = t.notes || "";
      if (Array.isArray(t.notes)) t.notes = t.notes.join("\n");
      t.examples = (t.examples || []).map(function (e) { return { q: e.q || e.question || "", a: e.a || e.answer || e.solution || "" }; });
      t.estMinutes = Number(t.estMinutes) || 30;
      t.term = Math.max(1, Math.min(6, Number(t.term) || 1));
      var seenQ = {};
      t.questions = (t.questions || []).map(function (qq, qi) {
        var qw = where + ", question " + (qi + 1);
        qq.type = qq.type || (Array.isArray(qq.options) ? "mcq" : "short");
        if (!M.Q_TYPES[qq.type]) errors.push(qw + ": unknown type \"" + qq.type + "\" (use mcq, tf, short, numeric or structured).");
        if (!qq.prompt) errors.push(qw + " needs a \"prompt\".");
        if (qq.type === "mcq") {
          if (!Array.isArray(qq.options) || qq.options.length < 2) errors.push(qw + " needs at least two \"options\".");
          else if (typeof qq.answer !== "number" || !qq.options[qq.answer]) errors.push(qw + ": \"answer\" must be the number of the correct option, counting from 0.");
        }
        if (qq.type === "tf") qq.answer = qq.answer === true || qq.answer === "true";
        if (qq.type === "numeric" && isNaN(Number(qq.answer))) errors.push(qw + ": \"answer\" must be a number.");
        if (qq.type === "short" && qq.answer == null) errors.push(qw + " needs an \"answer\" (text, or a list of accepted answers).");
        if (qq.type === "structured" && !qq.markScheme) errors.push(qw + " needs a \"markScheme\".");
        qq.marks = Number(qq.marks) || 1;
        qq.id = qq.id || t.id + "_q" + (qi + 1);
        while (seenQ[qq.id]) qq.id += "x";
        seenQ[qq.id] = 1;
        return qq;
      });
    });
    if (!Array.isArray(syl.papers) || !syl.papers.length) syl.papers = syl.topics.length ? A.defaultPapers(syl) : [];
    syl.papers.forEach(function (pp, i) { pp.id = pp.id || syl.id + "_p" + (i + 1); pp.durationMin = Number(pp.durationMin) || 30; pp.questionIds = pp.questionIds || []; });
    return { syllabus: syl, errors: errors };
  };

  A.syllabusTemplate = function () {
    return {
      board: "Cambridge", level: "IGCSE", subject: "Geography", code: "0460",
      description: "Replace this with your syllabus. Delete the example topic and add your own.",
      gradeScale: DEFAULT_SCALE,
      topics: [{
        title: "Weather and Climate",
        summary: "One short sentence shown in the topic list.",
        estMinutes: 40,
        term: 1,
        notes: "## Headings start with ##\nWrite paragraphs as normal text.\n- Bullet points start with a dash\n- **Bold** with double stars\n\n[[A formula or key fact goes in double square brackets]]\n\n> A tip or warning starts with >\n\n| Tables | use | pipes |\n|---|---|---|\n| a | b | c |",
        examples: [{ q: "A worked example question.", a: "Step 1…\nStep 2…\nAnswer." }],
        questions: [
          { type: "mcq", prompt: "Multiple choice: answer is the option number, counting from 0.", options: ["Correct option", "Wrong", "Wrong", "Wrong"], answer: 0, marks: 1, explanation: "Shown after the student answers." },
          { type: "tf", prompt: "True or false question.", answer: true, marks: 1, explanation: "" },
          { type: "short", prompt: "Short answer: list every accepted spelling.", answer: ["convectional rainfall", "convection rainfall"], marks: 1 },
          { type: "numeric", prompt: "Numeric answer, e.g. a calculation.", answer: 12.5, tolerance: 0.1, marks: 2 },
          { type: "structured", prompt: "Long answer that students mark themselves against the scheme.", markScheme: "Point one [1]\nPoint two [1]\nPoint three [1]", marks: 3 },
        ],
      }],
      papers: [],
    };
  };

  /* ------------------------------------------------------------- new / edit */
  function sylModal(existing) {
    var s = existing || { board: (CFG.boards || [])[0] || "Cambridge", level: "IGCSE", subject: "", code: "", description: "" };
    var boards = (CFG.boards || ["Cambridge", "School-based"]).slice();
    var levels = (CFG.educationLevels || ["IGCSE", "AS & A Level"]).slice();
    UI.modal({
      title: existing ? "Edit syllabus details" : "New syllabus",
      body: '<form id="syl-form" class="form-grid">' +
        '<label class="field"><span>Exam board</span>' + UI.selectOther("board", boards, s.board, "Exam board") + "</label>" +
        '<label class="field"><span>Education level</span>' + UI.selectOther("level", levels, s.level, "Education level") + "</label>" +
        '<label class="field"><span>Subject</span><input class="input" name="subject" value="' + esc(s.subject) + '" required></label>' +
        '<label class="field"><span>Syllabus code <span class="muted">(optional)</span></span><input class="input" name="code" value="' + esc(s.code || "") + '"></label>' +
        '<label class="field"><span>Group</span><select class="select" name="group">' + M.SUBJECT_GROUPS.map(function (g) { return '<option value="' + g.id + '"' + (M.groupOf(s) === g.id ? " selected" : "") + ">" + esc(g.label) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field full"><span>Short description</span><input class="input" name="description" value="' + esc(s.description || "") + '"></label></form>',
      foot: [{ label: "Cancel" }, {
        label: existing ? "Save" : "Create", cls: "btn-primary", onClick: function (el) {
          var f = UI.formData(el.querySelector("#syl-form"));
          if (!f.subject.trim()) { UI.toast("Enter the subject", "bad"); return false; }
          if (!f.board.trim() || !f.level.trim()) { UI.toast("Choose the exam board and the level", "bad"); return false; }
          var rec = Object.assign({}, existing || { topics: [], papers: [], gradeScale: DEFAULT_SCALE.slice(), createdBy: M.me().id }, {
            board: f.board.trim() || "School-based", level: f.level.trim(), subject: f.subject.trim(), code: f.code.trim(), description: f.description.trim(), group: f.group || "other",
          });
          var sr = A.Subjects && A.Subjects.find(rec.subject, rec.level);
          if (sr && !rec.subjectId) rec.subjectId = sr.id;
          if (sr && sr.code && !rec.code && boardKey(rec.board)) rec.code = String(sr.code); // (an exam board's syllabus: the subject's code)
          var tw = Syl.twin(rec, existing && existing.id);
          if (tw) { UI.toast(Syl.title(tw) + " is in the library already (syllabus ID " + tw.id + "). A syllabus goes in once: open that one.", "bad"); return false; }
          rec = S().put("syllabi", rec);
          UI.toast(existing ? "Saved" : "Syllabus created. Now add its topics.");
          location.hash = "#/t/syllabus/" + rec.id;
          A.render();
        },
      }],
    });
  }
  A.act["syl-new"] = function () { sylModal(null); };
  A.act["syl-edit"] = function (el) { sylModal(M.syllabus(el.getAttribute("data-id"))); };
  A.act["syl-delete"] = function (el) {
    var s = M.syllabus(el.getAttribute("data-id")), used = usedBy(s);
    if (used.length) { UI.toast("Used by " + used.map(M.className).join(", ") + ". Change those classes first.", "bad"); return; }
    var forms = Syl.usedBy(s).filter(function (c) { return c.homeroom; }).map(M.className);
    UI.confirm("Delete " + M.syllabusTitle(s) + " and all its topics and questions?" + (forms.length ? " " + forms.join(", ") + " follow it in their syllabus tracker: their ticks are kept, and come back with a syllabus of the same topics." : ""), { danger: true, ok: "Delete" }).then(function (ok) {
      if (!ok) return;
      S().remove("syllabi", s.id); UI.toast("Syllabus deleted"); location.hash = "#/t/syllabi";
    });
  };

  /* ================================================================ DETAIL */
  A.route("t/syllabus/:id/:tab?", function (p, q, me) {
    var syl = M.syllabus(p.id);
    if (!syl) return { redirect: "#/t/syllabi" };
    if (p.tab === "topic") return { redirect: "#/t/syllabus/" + syl.id };
    var tab = p.tab || "topics", used = Syl.usedBy(syl), base = "#/t/syllabus/" + syl.id;
    var files = M.libraryList(S().filter("materials", function (m) { return !m.classId && m.syllabusId === syl.id; }));
    var head = '<div class="card card-pad mb"><div class="row wrap top"><div class="grow"><div class="row wrap"><span class="badge brand">' + esc(syl.board) + '</span><span class="badge">' + esc(syl.level) + "</span>" + (syl.code ? '<span class="badge">' + esc(syl.code) + "</span>" : "") + "</div>" +
      '<h2 class="mt-sm" style="font-size:22px">' + esc(syl.subject) + '</h2><p class="muted small">' + esc(syl.title || syl.description || "") + "</p>" +
      '<p class="tiny muted">Syllabus ID <b class="tnum">' + esc(syl.id) + "</b>" + ((syl.forms || []).length ? " · for " + esc(syl.forms.join(", ")) : "") + "</p>" +
      '<p class="small mt-sm">' + syl.topics.length + " topics · " + qCount(syl) + " questions · " + (syl.papers || []).length + " papers · " + (used.length ? "used by " + used.map(M.className).map(esc).join(", ") : "not used by a class yet") + "</p></div>" +
      '<div class="row wrap"><button class="btn" data-act="syl-edit" data-id="' + syl.id + '">' + I("edit") + 'Details</button><button class="btn" data-act="syl-export" data-id="' + syl.id + '">' + I("download") + 'Export</button><button class="btn btn-danger btn-icon" data-act="syl-delete" data-id="' + syl.id + '" data-tip="Delete syllabus" aria-label="Delete syllabus">' + I("trash") + "</button></div></div></div>";
    var tabs = UI.tabs([
      { href: base + "/topics", label: "Topics & notes", icon: "book", on: tab === "topics", n: syl.topics.length },
      { href: base + "/papers", label: "Exam papers", icon: "clock", on: tab === "papers", n: (syl.papers || []).length },
      { href: base + "/grading", label: "Grade boundaries", icon: "award", on: tab === "grading" },
      { href: base + "/files", label: "Past papers & files", icon: "file", on: tab === "files", n: files.length },
    ]);
    var body = "";
    if (tab === "topics") {
      body = '<div class="row spread wrap mb"><p class="muted small">Each topic has notes, worked examples and questions. Students see the topics in this order.</p><div class="row wrap">' +
        (me.isAdmin ? '<button class="btn" data-act="syl-read-pdf" data-syl="' + syl.id + '" data-tip="Read the topics and what to study from the official syllabus PDF">' + I("layers") + "Read topics from the syllabus</button>" : "") +
        '<button class="btn" data-act="topic-terms" data-id="' + syl.id + '" data-tip="Share the topics out over the terms in syllabus order">' + I("calendar") + "Spread over the terms</button>" +
        '<button class="btn btn-primary" data-act="topic-add" data-id="' + syl.id + '">' + I("plus") + "Add topic</button></div></div>" +
        '<div class="card">' + (syl.topics.length ? syl.topics.map(function (t, i) {
          return '<div class="topic-row"><span class="topic-num">' + (i + 1) + '</span><div class="grow"><a class="bold" href="' + base + "/topic/" + t.id + '" style="color:inherit">' + esc(t.title) + '</a><div class="tiny muted">' + esc(t.summary || A.plain(t.notes, 90)) + "</div>" +
            '<div class="row wrap mt-sm"><select class="select sm term-pick" data-change="topic-term-set" data-id="' + syl.id + '" data-t="' + t.id + '" aria-label="Term for ' + esc(t.title) + '">' +
              termOptions(M.topicTerm(t)) + "</select>" + (t.outline && t.outline.length ? '<span class="badge good" data-tip="What to study, from the syllabus">' + I("list") + count(t.outline.length, "part", "parts") + " to study</span>" : "") + '<span class="badge">' + I("book") + (t.notes ? A.plain(t.notes).split(" ").length + " words" : "No notes") + '</span><span class="badge">' + I("bulb") + (t.examples || []).length + ' examples</span><span class="badge">' + I("target") + (t.questions || []).length + " questions</span></div></div>" +
            '<button class="btn btn-ghost btn-icon btn-sm" data-act="topic-move" data-id="' + syl.id + '" data-t="' + t.id + '" data-d="-1" aria-label="Move up"' + (i ? "" : " disabled") + ">" + I("up") + "</button>" +
            '<button class="btn btn-ghost btn-icon btn-sm" data-act="topic-move" data-id="' + syl.id + '" data-t="' + t.id + '" data-d="1" aria-label="Move down"' + (i < syl.topics.length - 1 ? "" : " disabled") + ">" + I("down") + "</button>" +
            '<a class="btn btn-sm" href="' + base + "/topic/" + t.id + '">' + I("edit") + "Edit</a>" +
            '<button class="btn btn-ghost btn-icon btn-sm" data-act="topic-del" data-id="' + syl.id + '" data-t="' + t.id + '" aria-label="Delete topic">' + I("trash") + "</button></div>";
        }).join("") : UI.empty("book", "No topics yet", "Add the first topic of this syllabus.")) + "</div>";
    } else if (tab === "papers") {
      var idx = M.questionIndex(syl);
      body = '<div class="row spread wrap mb"><p class="muted small">Mock papers students can sit in Test mode. Questions are picked from the topics you choose.</p><button class="btn btn-primary" data-act="paper-edit" data-id="' + syl.id + '">' + I("plus") + "New paper</button></div>" +
        '<div class="card">' + ((syl.papers || []).length ? syl.papers.map(function (pp) {
          var qs = pp.questionIds.filter(function (id) { return idx[id]; }), marks = A.sum(qs, function (id) { return Number(idx[id].q.marks) || 1; });
          return '<div class="list-row"><div class="stat" style="padding:0"><div class="ico accent">' + I("clock") + '</div></div><div class="grow"><div class="title">' + esc(pp.title) + '</div><div class="meta"><span>' + pp.durationMin + " minutes</span><span class=\"sep\"></span><span>" + qs.length + " questions</span><span class=\"sep\"></span><span>" + marks + " marks</span></div></div>" +
            '<button class="btn btn-sm" data-act="paper-edit" data-id="' + syl.id + '" data-p="' + pp.id + '">' + I("edit") + "Edit</button>" +
            '<button class="btn btn-ghost btn-icon btn-sm" data-act="paper-del" data-id="' + syl.id + '" data-p="' + pp.id + '" aria-label="Delete paper">' + I("trash") + "</button></div>";
        }).join("") : UI.empty("clock", "No papers yet")) + "</div>";
    } else if (tab === "grading") {
      var scale = (syl.gradeScale || DEFAULT_SCALE).slice().sort(function (a, b) { return b.min - a.min; });
      body = '<div class="card card-pad" style="max-width:560px"><p class="muted small">A student gets the highest grade whose minimum percentage they reach. Use your exam board\'s published boundaries or your school\'s own.</p>' +
        '<form data-submit="grades-save" data-id="' + syl.id + '"><table class="table mt"><thead><tr><th>Grade</th><th>Minimum %</th><th></th></tr></thead><tbody id="grade-rows">' +
        scale.map(gradeRow).join("") + '</tbody></table><div class="row mt"><button type="button" class="btn btn-sm" data-act="grade-add">' + I("plus") + 'Add grade</button><span class="grow"></span><button class="btn btn-primary" type="submit">' + I("check") + "Save boundaries</button></div></form></div>";
    } else {
      body = '<div class="row spread wrap mb"><p class="muted small">Past papers, marking schemes and the official syllabus document. Every student in a class using this syllabus can open them, even offline.</p><button class="btn btn-primary" data-act="add-material" data-syllabus="' + syl.id + '" data-kind="pastpaper">' + I("upload") + "Upload</button></div>" +
        '<div class="card">' + (files.length ? files.map(function (m) { return A.materialRow(m, { teacher: true }); }).join("") : UI.empty("file", "No files yet")) + "</div>";
    }
    return { title: syl.subject, crumbs: [{ label: "Syllabus library", href: "#/t/syllabi" }, { label: M.syllabusTitle(syl) }], html: head + tabs + body };
  }, { role: "teacher" });

  function gradeRow(g) {
    return '<tr><td><input class="input sm" name="grade" value="' + esc(g.grade) + '" style="width:90px" aria-label="Grade"></td><td><input class="input sm" name="min" inputmode="numeric" value="' + g.min + '" style="width:90px" aria-label="Minimum percent"></td><td><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="grade-del" aria-label="Remove">' + I("trash") + "</button></td></tr>";
  }
  A.act["grade-add"] = function () { document.getElementById("grade-rows").insertAdjacentHTML("beforeend", gradeRow({ grade: "", min: 0 })); };
  A.act["grade-del"] = function (el) { el.closest("tr").remove(); };
  A.act["grades-save"] = function (form) {
    var rows = [];
    form.querySelectorAll("#grade-rows tr").forEach(function (tr) {
      var g = tr.querySelector("[name=grade]").value.trim(), m = Number(tr.querySelector("[name=min]").value);
      if (g) rows.push({ grade: g, min: isNaN(m) ? 0 : A.clamp(m, 0, 100) });
    });
    if (!rows.length) { UI.toast("Add at least one grade", "bad"); return; }
    S().patch("syllabi", form.getAttribute("data-id"), { gradeScale: rows.sort(function (a, b) { return b.min - a.min; }) });
    UI.toast("Grade boundaries saved");
    A.render();
  };

  /* ------------------------------------------------------------- which term each topic is taught in */
  function terms() { var n = (CFG.terms || []).length || 3; var out = []; for (var i = 1; i <= n; i++) out.push(i); return out; }
  function termOptions(cur) { return terms().map(function (n) { return '<option value="' + n + '"' + (n === cur ? " selected" : "") + ">" + esc(M.termName(n)) + "</option>"; }).join(""); }
  A.act["topic-term-set"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-id")), tid = el.getAttribute("data-t"), n = Number(el.value);
    if (!syl) return;
    S().patch("syllabi", syl.id, { topics: syl.topics.map(function (t) { return t.id === tid ? Object.assign({}, t, { term: n }) : t; }) });
    UI.toast(M.topic(M.syllabus(syl.id), tid).title + ": " + M.termName(n));
  };
  /** Share a syllabus's topics out over the terms, in order (a teacher can change any of them after). */
  A.act["topic-terms"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-id")); if (!syl) return;
    var all = terms(), n = syl.topics.length;
    var plan = function (k, from) {
      // the topics from `from` on, in k equal runs
      var out = {};
      syl.topics.forEach(function (t, i) {
        if (i < from) return;
        out[t.id] = Math.min(k, Math.floor((i - from) * k / Math.max(1, n - from)) + 1);
      });
      return out;
    };
    var preview = function (map) {
      return all.map(function (term) {
        var list = syl.topics.filter(function (t) { return (map[t.id] || M.topicTerm(t)) === term; });
        return '<div class="term-col"><b>' + esc(M.termName(term)) + ' <span class="muted">' + list.length + "</span></b><ol>" + list.map(function (t) { return "<li>" + esc(t.title) + "</li>"; }).join("") + "</ol></div>";
      }).join("");
    };
    var current = plan(all.length, 0);
    UI.modal({
      title: "Spread " + syl.subject + " over the terms", size: "wide",
      body: '<p class="muted">The ' + n + " topics are shared out over " + all.length + " terms in the order of the syllabus. You can still change any topic's term on its row afterwards.</p>" +
        '<div class="term-plan mt" id="term-plan">' + preview(current) + "</div>",
      foot: [{ label: "Cancel" }, { label: "Use these terms", cls: "btn-primary", icon: "check", onClick: function () {
        S().patch("syllabi", syl.id, { topics: syl.topics.map(function (t) { return Object.assign({}, t, { term: current[t.id] || M.topicTerm(t) }); }) });
        UI.toast(syl.subject + ": topics spread over " + all.length + " terms");
        A.render();
      } }],
    });
  };

  A.act["topic-add"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-id"));
    var last = syl.topics[syl.topics.length - 1];
    var t = { id: A.uid("top"), title: "New topic", summary: "", estMinutes: 30, term: last ? M.topicTerm(last) : 1, notes: "", examples: [], questions: [] };
    S().patch("syllabi", syl.id, { topics: syl.topics.concat([t]) });
    location.hash = "#/t/syllabus/" + syl.id + "/topic/" + t.id;
  };
  A.act["topic-move"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-id")), topics = syl.topics.slice(), i = topics.findIndex(function (t) { return t.id === el.getAttribute("data-t"); }), j = i + Number(el.getAttribute("data-d"));
    if (j < 0 || j >= topics.length) return;
    var tmp = topics[i]; topics[i] = topics[j]; topics[j] = tmp;
    S().patch("syllabi", syl.id, { topics: topics });
    A.render();
  };
  A.act["topic-del"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-id")), tid = el.getAttribute("data-t"), t = M.topic(syl, tid);
    UI.confirm("Delete the topic \"" + t.title + "\" with its notes and " + t.questions.length + " questions?", { danger: true, ok: "Delete topic" }).then(function (ok) {
      if (!ok) return;
      S().patch("syllabi", syl.id, { topics: syl.topics.filter(function (x) { return x.id !== tid; }) });
      UI.toast("Topic deleted"); A.render();
    });
  };

  /* ---------------------------------------------------------------- papers */
  A.act["paper-edit"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-id")), pid = el.getAttribute("data-p");
    var pp = pid ? syl.papers.find(function (x) { return x.id === pid; }) : { title: "", durationMin: 45, instructions: "Answer all questions.", questionIds: [] };
    var idx = M.questionIndex(syl);
    var cur = {};
    pp.questionIds.forEach(function (id) { if (idx[id]) cur[idx[id].topic.id] = (cur[idx[id].topic.id] || 0) + 1; });
    UI.modal({
      title: pid ? "Edit paper" : "New exam paper", size: "wide",
      body: '<form id="paper-form"><div class="form-grid"><label class="field full"><span>Title</span><input class="input" name="title" value="' + esc(pp.title) + '" placeholder="e.g. November mock: Paper 1"></label>' +
        '<label class="field"><span>Time allowed (minutes)</span><input class="input" name="durationMin" inputmode="numeric" value="' + pp.durationMin + '"></label>' +
        '<label class="field"><span>Question types</span><select class="select" name="types"><option value="all">All types</option><option value="auto">Auto-marked only (Paper 1 style)</option><option value="structured">Structured only (Paper 2 style)</option></select></label>' +
        '<label class="field full"><span>Instructions to candidates</span><input class="input" name="instructions" value="' + esc(pp.instructions || "") + '"></label></div>' +
        '<div class="label mt">How many questions from each topic?</div><div class="card">' + syl.topics.map(function (t) {
          return '<div class="list-row"><div class="grow small bold">' + esc(t.title) + '<div class="tiny muted">' + t.questions.length + " available</div></div><input class=\"input sm\" style=\"width:80px\" inputmode=\"numeric\" data-topic=\"" + t.id + '" value="' + (cur[t.id] || 0) + '" aria-label="Questions from ' + esc(t.title) + '"></div>';
        }).join("") + '</div><p class="tiny muted mt-sm">Questions are picked at random each time you save. If a topic has fewer questions than you ask for, all of them are used.</p></form>',
      foot: [{ label: "Cancel" }, {
        label: "Save paper", cls: "btn-primary", onClick: function (m) {
          var form = m.querySelector("#paper-form"), f = UI.formData(form);
          if (!f.title.trim()) { UI.toast("Give the paper a title", "bad"); return false; }
          var ids = [];
          form.querySelectorAll("[data-topic]").forEach(function (inp) {
            var n = Number(inp.value) || 0, t = M.topic(syl, inp.getAttribute("data-topic"));
            var pool = t.questions.filter(function (q) { return f.types === "all" || (f.types === "structured" ? q.type === "structured" : q.type !== "structured"); });
            var keep = pool.filter(function (q) { return pp.questionIds.indexOf(q.id) >= 0; });
            var pick = keep.length === Math.min(n, pool.length) ? keep : A.shuffle(pool).slice(0, n);
            ids = ids.concat(pick.map(function (q) { return q.id; }));
          });
          if (!ids.length) { UI.toast("Choose at least one question", "bad"); return false; }
          var rec = Object.assign({}, pp, { id: pp.id || A.uid("pap"), title: f.title.trim(), durationMin: Number(f.durationMin) || 30, instructions: f.instructions, questionIds: ids });
          var papers = (syl.papers || []).filter(function (x) { return x.id !== rec.id; });
          var at = (syl.papers || []).findIndex(function (x) { return x.id === rec.id; });
          if (at >= 0) papers.splice(at, 0, rec); else papers.push(rec);
          S().patch("syllabi", syl.id, { papers: papers });
          UI.toast("Paper saved: " + ids.length + " questions");
          A.render();
        },
      }],
    });
  };
  A.act["paper-del"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-id")), pid = el.getAttribute("data-p");
    UI.confirm("Delete this paper? Students' past results are kept.", { danger: true, ok: "Delete" }).then(function (ok) {
      if (!ok) return;
      S().patch("syllabi", syl.id, { papers: syl.papers.filter(function (x) { return x.id !== pid; }) });
      A.render();
    });
  };

  /* ============================================================ TOPIC EDITOR */
  var D = null; // unsaved draft of the topic being edited
  A.route("t/syllabus/:id/topic/:tid", function (p, q, me) {
    var syl = M.syllabus(p.id), t = syl && M.topic(syl, p.tid);
    if (!t) return { redirect: syl ? "#/t/syllabus/" + syl.id : "#/t/syllabi" };
    if (!D || D.tid !== t.id) D = { sid: syl.id, tid: t.id, t: JSON.parse(JSON.stringify(t)), dirty: false };
    var d = D.t;
    var html = '<div class="card card-pad mb" style="position:sticky;top:78px;z-index:5"><div class="row wrap"><div class="grow"><b>Editing: ' + esc(d.title || "Untitled topic") + '</b><div class="tiny muted">' + esc(M.syllabusTitle(syl)) + " · changes are saved when you press Save</div></div>" +
      '<a class="btn" href="#/t/syllabus/' + syl.id + '" data-act="te-cancel">Cancel</a><button class="btn btn-primary" data-act="te-save">' + I("check") + "Save topic</button></div></div>";

    html += '<div class="card card-pad"><div class="form-grid"><label class="field full"><span>Topic title</span><input class="input" value="' + esc(d.title) + '" data-input="te-field" data-path="title"></label>' +
      '<label class="field"><span>One-line summary</span><input class="input" value="' + esc(d.summary || "") + '" data-input="te-field" data-path="summary"></label>' +
      '<label class="field"><span>Study time (minutes)</span><input class="input" inputmode="numeric" value="' + (d.estMinutes || 30) + '" data-input="te-field" data-path="estMinutes" data-num="1"></label>' +
      '<label class="field"><span>Term <span class="muted">(when the class studies it)</span></span><select class="select" data-change="te-term">' + [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (M.topicTerm(d) === n ? " selected" : "") + ">" + esc(M.termName(n)) + "</option>"; }).join("") + "</select></label></div></div>";

    html += '<div class="section-title"><h2>Notes</h2><span class="sub">## heading · - bullet · **bold** · [[formula]] · &gt; tip · | table | · x^2 · H_{2}O</span></div>' +
      '<div class="editor-split"><textarea class="textarea code" data-input="te-notes" data-path="notes" aria-label="Notes">' + esc(d.notes || "") + '</textarea><div class="preview prose" id="te-preview">' + A.md(d.notes) + "</div></div>";

    html += '<div class="section-title"><h2>Worked examples</h2><span class="grow"></span><button class="btn btn-sm" data-act="te-add-ex">' + I("plus") + "Add example</button></div>" +
      (d.examples.length ? d.examples.map(function (ex, i) {
        return '<div class="q-edit"><div class="row spread"><b class="small">Example ' + (i + 1) + '</b><button class="btn btn-ghost btn-icon btn-sm" data-act="te-del" data-list="examples" data-i="' + i + '" aria-label="Remove example">' + I("trash") + "</button></div>" +
          '<div class="form-grid mt-sm"><label class="field"><span>Question</span><textarea class="textarea" rows="3" data-input="te-field" data-path="examples.' + i + '.q">' + esc(ex.q) + '</textarea></label><label class="field"><span>Step-by-step solution</span><textarea class="textarea" rows="3" data-input="te-field" data-path="examples.' + i + '.a">' + esc(ex.a) + "</textarea></label></div></div>";
      }).join("") : '<div class="card">' + UI.empty("bulb", "No worked examples") + "</div>");

    html += '<div class="section-title"><h2>Questions</h2><span class="sub">used for practice and exam papers</span><span class="grow"></span>' +
      '<select class="select sm" style="width:auto" id="te-new-type" aria-label="Question type">' + Object.keys(M.Q_TYPES).map(function (k) { return '<option value="' + k + '">' + M.Q_TYPES[k] + "</option>"; }).join("") + '</select><button class="btn btn-sm" data-act="te-add-q">' + I("plus") + "Add question</button></div>" +
      (d.questions.length ? d.questions.map(qEditor).join("") : '<div class="card">' + UI.empty("target", "No questions yet") + "</div>");
    html += '<div class="row mt-lg"><span class="grow"></span><button class="btn btn-primary btn-lg" data-act="te-save">' + I("check") + "Save topic</button></div>";
    return { title: d.title || "Topic", crumbs: [{ label: "Syllabus library", href: "#/t/syllabi" }, { label: syl.subject, href: "#/t/syllabus/" + syl.id }, { label: "Edit topic" }], html: html };
  }, { role: "teacher" });

  function qEditor(q, i) {
    var P = "questions." + i + ".";
    var html = '<div class="q-edit"><div class="row wrap"><b class="small">Q' + (i + 1) + '</b><select class="select sm" style="width:auto" data-change="te-type" data-i="' + i + '" aria-label="Type">' +
      Object.keys(M.Q_TYPES).map(function (k) { return '<option value="' + k + '"' + (q.type === k ? " selected" : "") + ">" + M.Q_TYPES[k] + "</option>"; }).join("") + "</select>" +
      '<label class="row small" style="gap:6px">Marks <input class="input sm" style="width:64px" inputmode="numeric" value="' + (q.marks || 1) + '" data-input="te-field" data-path="' + P + 'marks" data-num="1"></label><span class="grow"></span>' +
      '<button class="btn btn-ghost btn-icon btn-sm" data-act="te-del" data-list="questions" data-i="' + i + '" aria-label="Remove question">' + I("trash") + "</button></div>" +
      '<label class="field mt-sm"><span>Question</span><textarea class="textarea" rows="2" data-input="te-field" data-path="' + P + 'prompt">' + esc(q.prompt || "") + "</textarea></label>";
    if (q.type === "mcq") {
      html += '<div class="label mt">Options: tick the correct one</div>' + (q.options || []).map(function (o, oi) {
        return '<div class="row mt-sm"><input type="radio" name="corr_' + i + '" ' + (q.answer === oi ? "checked" : "") + ' data-change="te-correct" data-i="' + i + '" data-v="' + oi + '" aria-label="Correct option" style="width:20px;height:20px;accent-color:var(--brand)"><input class="input sm grow" value="' + esc(o) + '" data-input="te-field" data-path="' + P + "options." + oi + '"><button class="btn btn-ghost btn-icon btn-sm" data-act="te-opt-del" data-i="' + i + '" data-o="' + oi + '" aria-label="Remove option">' + I("x") + "</button></div>";
      }).join("") + '<button class="btn btn-sm mt-sm" data-act="te-opt-add" data-i="' + i + '">' + I("plus") + "Option</button>";
    } else if (q.type === "tf") {
      html += '<label class="field mt-sm"><span>Correct answer</span><select class="select sm" style="width:auto" data-change="te-tf" data-i="' + i + '"><option value="true"' + (q.answer === true ? " selected" : "") + '>True</option><option value="false"' + (q.answer === false ? " selected" : "") + ">False</option></select></label>";
    } else if (q.type === "short") {
      html += '<label class="field mt-sm"><span>Accepted answers <span class="muted">(one per line; capitals and punctuation are ignored)</span></span><textarea class="textarea" rows="2" data-input="te-field" data-path="' + P + 'answer" data-lines="1">' + esc([].concat(q.answer || []).join("\n")) + "</textarea></label>";
    } else if (q.type === "numeric") {
      html += '<div class="form-grid mt-sm"><label class="field"><span>Correct value</span><input class="input sm" inputmode="decimal" value="' + (q.answer != null ? q.answer : "") + '" data-input="te-field" data-path="' + P + 'answer" data-num="1"></label>' +
        '<label class="field"><span>Allowed difference <span class="muted">(optional)</span></span><input class="input sm" inputmode="decimal" value="' + (q.tolerance != null ? q.tolerance : "") + '" data-input="te-field" data-path="' + P + 'tolerance" data-num="1" placeholder="e.g. 0.1"></label></div>';
    } else if (q.type === "structured") {
      html += '<label class="field mt-sm"><span>Marking scheme <span class="muted">(students mark themselves against this)</span></span><textarea class="textarea" rows="3" data-input="te-field" data-path="' + P + 'markScheme">' + esc(q.markScheme || "") + "</textarea></label>";
    }
    if (q.type !== "structured") html += '<label class="field mt-sm"><span>Explanation <span class="muted">(shown after answering)</span></span><textarea class="textarea" rows="2" data-input="te-field" data-path="' + P + 'explanation">' + esc(q.explanation || "") + "</textarea></label>";
    return html + "</div>";
  }

  function setPath(obj, path, val) {
    var parts = path.split("."), o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = val;
  }
  A.act["te-field"] = function (el) {
    if (!D) return;
    var v = el.value;
    if (el.getAttribute("data-num")) v = v.trim() === "" ? null : Number(v);
    if (el.getAttribute("data-lines")) v = el.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
    setPath(D.t, el.getAttribute("data-path"), v);
    D.dirty = true;
  };
  var preview = A.debounce(function () { var p = document.getElementById("te-preview"); if (p && D) p.innerHTML = A.md(D.t.notes); }, 200);
  A.act["te-term"] = function (el) { D.t.term = Number(el.value); D.dirty = true; };
  A.act["te-notes"] = function (el) { D.t.notes = el.value; D.dirty = true; preview(); };
  A.act["te-add-ex"] = function () { D.t.examples.push({ q: "", a: "" }); D.dirty = true; A.render(); };
  A.act["te-add-q"] = function () {
    var type = document.getElementById("te-new-type").value;
    var q = { id: A.uid(D.t.id + "_q"), type: type, prompt: "", marks: type === "structured" ? 3 : 1, explanation: "" };
    if (type === "mcq") { q.options = ["", "", "", ""]; q.answer = 0; }
    if (type === "tf") q.answer = true;
    if (type === "short") q.answer = [];
    if (type === "structured") q.markScheme = "";
    D.t.questions.push(q); D.dirty = true; A.render();
    setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 30);
  };
  A.act["te-del"] = function (el) { D.t[el.getAttribute("data-list")].splice(Number(el.getAttribute("data-i")), 1); D.dirty = true; A.render(); };
  A.act["te-type"] = function (el) {
    var q = D.t.questions[Number(el.getAttribute("data-i"))], type = el.value;
    q.type = type;
    if (type === "mcq") { q.options = q.options && q.options.length ? q.options : ["", "", "", ""]; q.answer = typeof q.answer === "number" ? q.answer : 0; }
    if (type === "tf") q.answer = q.answer === true;
    if (type === "short") q.answer = [].concat(q.answer == null ? [] : q.answer).map(String);
    if (type === "numeric") q.answer = isNaN(Number(q.answer)) ? 0 : Number(q.answer);
    if (type === "structured") q.markScheme = q.markScheme || "";
    D.dirty = true; A.render();
  };
  A.act["te-correct"] = function (el) { D.t.questions[Number(el.getAttribute("data-i"))].answer = Number(el.getAttribute("data-v")); D.dirty = true; };
  A.act["te-tf"] = function (el) { D.t.questions[Number(el.getAttribute("data-i"))].answer = el.value === "true"; D.dirty = true; };
  A.act["te-opt-add"] = function (el) { D.t.questions[Number(el.getAttribute("data-i"))].options.push(""); A.render(); };
  A.act["te-opt-del"] = function (el) {
    var q = D.t.questions[Number(el.getAttribute("data-i"))], o = Number(el.getAttribute("data-o"));
    if (q.options.length <= 2) { UI.toast("A multiple-choice question needs at least two options", "bad"); return; }
    q.options.splice(o, 1);
    if (q.answer === o) q.answer = 0; else if (q.answer > o) q.answer--;
    A.render();
  };
  A.act["te-cancel"] = function (el) {
    var go = function () { var sid = D.sid; D = null; location.hash = "#/t/syllabus/" + sid; };
    if (D && D.dirty) UI.confirm("Discard your unsaved changes to this topic?", { ok: "Discard", danger: true }).then(function (ok) { if (ok) go(); });
    else go();
  };
  A.act["te-save"] = function () {
    var t = D.t, errs = [];
    if (!String(t.title || "").trim()) errs.push("The topic needs a title.");
    t.questions.forEach(function (q, i) {
      if (!String(q.prompt || "").trim()) errs.push("Question " + (i + 1) + " has no question text.");
      if (q.type === "mcq") {
        q.options = q.options.map(function (o) { return String(o || ""); });
        if (q.options.filter(function (o) { return o.trim(); }).length < 2) errs.push("Question " + (i + 1) + " needs at least two options.");
        else if (!String(q.options[q.answer] || "").trim()) errs.push("Question " + (i + 1) + ": the ticked correct option is empty.");
      }
      if (q.type === "short" && !(q.answer || []).length) errs.push("Question " + (i + 1) + " needs at least one accepted answer.");
      if (q.type === "numeric" && (q.answer == null || isNaN(q.answer))) errs.push("Question " + (i + 1) + " needs a correct value.");
      if (q.type === "structured" && !String(q.markScheme || "").trim()) errs.push("Question " + (i + 1) + " needs a marking scheme.");
    });
    if (errs.length) { UI.modal({ title: "Please fix these first", body: "<ul class=\"small\">" + errs.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" }); return; }
    t.title = t.title.trim();
    t.examples = t.examples.filter(function (e) { return e.q.trim() || e.a.trim(); });
    var syl = M.syllabus(D.sid);
    S().patch("syllabi", syl.id, { topics: syl.topics.map(function (x) { return x.id === t.id ? t : x; }) });
    UI.toast("Topic saved. Students see the changes straight away.");
    var sid = D.sid; D = null;
    location.hash = "#/t/syllabus/" + sid;
  };
})(window.App);
