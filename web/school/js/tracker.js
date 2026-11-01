/* School Assist Teacher (1.6.2): My subjects, the syllabus tracker and the Teachers' overview.
 *   outlines  a subject's syllabus as its topics, read from the syllabus document (a PDF, js/sylread.js) or typed:
 *             { id, subject, levels: ["Form 1", …] (none: every one), title, file, topics: [{ id, n, title, parts: [{ n, title }] }] }
 *   coverage  one class's way through it in a school year: { id: "cov_<year>_<classId>_<subject>", classId, subject, year,
 *             outlineId, plan: { topicId: term 1–3 }, done: { topicId: when ticked }, teacherId }
 * My subjects (#/t/subjects): each subject a teacher teaches in each class they teach, and how far that class is through
 * its syllabus; for an admin also teachers' requests and everyone's subjects (they left Today in 1.6.2: a long list in a
 * big school). The tracker (#/t/tracker?c=…&s=…): the syllabus's topics, the term each is for (the teacher decides) and
 * a tick for each one taught. The Teachers' overview (#/t/overview, for the head or principal, their deputies and the
 * director): every teacher's pace, from the tracker, the registers and the mark book. */
(function (A) {
  "use strict";
  var P = A.Primary;
  if (!P) return; // School Assist Teacher only
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var T = (A.Tracker = {});
  var slug = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); };
  var pct = function (a, b) { return b ? Math.round(a / b * 100) : null; };
  var iso = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  /* ------------------------------------------------------------------ who sees what */
  // the school's leaders, by their role: the head or principal, their deputies and the director
  T.isLeader = function (u) { return P.isLeader(u); }; // (js/primary.js)
  T.nav = function (me) {
    var n = me.isAdmin ? P.asking().length : 0; // requests waiting for an answer
    return { href: "#/t/subjects", icon: "notebook", label: "My subjects", key: "subjects", match: ["subjects", "tracker"], count: n };
  };
  T.overviewNav = function (me) { return T.isLeader(me) ? { href: "#/t/overview", icon: "trend", label: "Teachers' overview", key: "overview" } : null; };

  /* ------------------------------------------------------------------ terms */
  /** A term's first and last day: the school's term dates (Settings → Learning areas and terms), else by month
      (January–April, May–August, September–December). */
  T.termRange = function (term, conf) {
    conf = conf || P.conf();
    var d = (conf.terms || {})[term] || {}, y = conf.year, m = { 1: ["01-01", "04-30"], 2: ["05-01", "08-31"], 3: ["09-01", "12-31"] }[term] || ["01-01", "12-31"];
    return d.opens && d.closes ? { opens: d.opens, closes: d.closes } : { opens: y + "-" + m[0], closes: y + "-" + m[1], guessed: true };
  };
  /** How much of a term has gone, 0 to 1 (a term before this one: all of it). */
  T.termGone = function (term, conf) {
    conf = conf || P.conf();
    if (term < conf.term) return 1;
    if (term > conf.term) return 0;
    var r = T.termRange(term, conf), a = Date.parse(r.opens + "T00:00:00"), b = Date.parse(r.closes + "T23:59:59"), n = A.now();
    return n <= a ? 0 : n >= b ? 1 : (n - a) / (b - a);
  };
  /** The school days (Monday to Friday) from `from` to `to` (YYYY-MM-DD), both counted. */
  function schoolDays(from, to) {
    var out = [], d = new Date(from + "T12:00:00"), end = new Date(to + "T12:00:00");
    for (var i = 0; d <= end && i < 400; i++) { var w = d.getDay(); if (w >= 1 && w <= 5) out.push(iso(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  /* ------------------------------------------------------------------ syllabuses and coverage */
  /** The syllabus a class uses for a subject: the one for its form or grade, else one for every form. */
  T.outlineFor = function (subject, level) {
    var list = S().filter("outlines", function (o) { return o.subject === subject; });
    return list.filter(function (o) { return (o.levels || []).indexOf(level) >= 0; })[0] || list.filter(function (o) { return !(o.levels || []).length; })[0] || null;
  };
  var covId = function (year, cid, subject) { return "cov_" + year + "_" + cid + "_" + slug(subject); };
  T.cov = function (cid, subject, year) { return S().get("coverage", covId(year || P.conf().year, cid, subject)); };
  /** A class's way through a subject's syllabus this year, for a term: the topics, those ticked, those planned for the
      term, and its pace. status: done (the term's topics all taught), ontrack, behind (fewer than the time gone says, or
      an earlier term's left), noplan (no term chosen for any topic), none (no syllabus). */
  T.stats = function (c, subject, conf, term) {
    conf = conf || P.conf(); term = term || conf.term;
    var o = T.outlineFor(subject, c.level);
    if (!o || !(o.topics || []).length) return { none: true, status: "none" };
    var cv = T.cov(c.id, subject, conf.year) || {}, plan = cv.plan || {}, done = cv.done || {}, ids = o.topics.map(function (t) { return t.id; });
    var ticked = ids.filter(function (id) { return done[id]; }), inTerm = ids.filter(function (id) { return Number(plan[id]) === term; });
    var termDone = inTerm.filter(function (id) { return done[id]; }).length;
    var left = ids.filter(function (id) { return plan[id] && Number(plan[id]) < term && !done[id]; }).length; // from an earlier term
    var planned = ids.filter(function (id) { return plan[id]; }).length, gone = T.termGone(term, conf), expected = inTerm.length * gone;
    var status = !planned ? "noplan" : !inTerm.length ? (left ? "behind" : "done") : termDone >= inTerm.length && !left ? "done" : termDone + 0.5 >= expected && !left ? "ontrack" : "behind";
    var r = T.termRange(term, conf), from = Date.parse(r.opens + "T00:00:00"), to = Math.min(A.now(), Date.parse(r.closes + "T23:59:59"));
    var weeks = Math.max(1, (to - from) / (7 * A.DAY)), inTermTicks = ids.filter(function (id) { return done[id] >= from && done[id] <= to + A.DAY; }).length, last = 0;
    ticked.forEach(function (id) { if (done[id] > last) last = done[id]; });
    return { outline: o, cov: cv, total: ids.length, done: ticked.length, pct: pct(ticked.length, ids.length), planned: planned, termPlanned: inTerm.length, termDone: termDone,
      termPct: pct(termDone, inTerm.length), left: left, expected: Math.round(expected * 10) / 10, status: status, last: last, perWeek: to > from ? Math.round(inTermTicks / weeks * 10) / 10 : 0 };
  };
  var STATUS = { done: ["good", "checkCircle", "Finished"], ontrack: ["good", "trend", "On track"], behind: ["bad", "alert", "Behind"], noplan: ["warn", "clock", "Not planned"], none: ["", "book", "No syllabus"] };
  T.chip = function (st) { var s = STATUS[st] || STATUS.none; return '<span class="badge ' + s[0] + '">' + I(s[1]) + s[2] + "</span>"; };
  var toneOf = function (st) { return st === "behind" ? "bad" : st === "noplan" ? "warn" : "good"; };

  /** Who teaches what where, from the records, once for a page: { tt: teacher → class → subjects (the timetable),
      work: the same from their marks, assessments and tracker }. */
  function teachIndex() {
    var tt = {}, work = {}, add = function (ix, t, c, s) { if (t && c && s) ((ix[t] = ix[t] || {})[c] = ix[t][c] || {})[s] = 1; };
    S().filter("timetable", function (s) { return !s.scope; }).forEach(function (s) { var c = M.cls(s.classId); add(tt, s.teacherId || (c && c.teacherId), s.classId, s.area); });
    S().all("assessments").forEach(function (a) { add(work, a.createdBy, a.classId, a.area); });
    S().filter("reportmarks", function (r) { return r.mark != null; }).forEach(function (r) { add(work, r.teacherId, r.classId, r.subject); });
    S().all("coverage").forEach(function (r) { add(work, r.teacherId, r.classId, r.subject); });
    return { tt: tt, work: work };
  }
  /** Each subject a teacher teaches in each class they teach: the subjects they have marked or tracked there, and those
      of their lessons on the timetable that are theirs; in a class with none of these yet (their own class, or one the
      head gave them), every subject of theirs. */
  T.pairs = function (u, ix) {
    ix = ix || teachIndex();
    var areas = P.conf().areas.filter(function (a) { return (u.areas || []).indexOf(a) >= 0; }), out = [];
    P.teachClasses(u, true).forEach(function (c) {
      var got = {}, w = (ix.work[u.id] || {})[c.id] || {}, t = (ix.tt[u.id] || {})[c.id] || {};
      Object.keys(w).forEach(function (s) { got[s] = 1; });
      Object.keys(t).forEach(function (s) { if (areas.indexOf(s) >= 0) got[s] = 1; });
      // only the subjects the class's form takes (Subjects by form, js/primary.js)
      var list = Object.keys(got).filter(function (s) { return P.offers(c, s); });
      (list.length ? list : areas.filter(function (s) { return P.offers(c, s); })).forEach(function (s) { out.push({ c: c, subject: s }); });
    });
    var order = P.conf().areas;
    return out.sort(function (a, b) { return (order.indexOf(a.subject) - order.indexOf(b.subject)) || M.levelIndex(a.c.level) - M.levelIndex(b.c.level) || a.c.name.localeCompare(b.c.name); });
  };
  /** Who teaches each subject in each class: "classId|subject" → [teacher ids], teachers before admins (made once for a
      piece of work, such as a school's report cards). */
  var whoCache = null;
  T.whoTeaches = function () {
    if (whoCache) return whoCache;
    var ix = teachIndex(), out = {};
    P.staffTeachers().slice().sort(function (a, b) { return (a.isAdmin ? 1 : 0) - (b.isAdmin ? 1 : 0); }).forEach(function (u) {
      T.pairs(u, ix).forEach(function (x) { var k = x.c.id + "|" + x.subject; (out[k] = out[k] || []).push(u.id); });
    });
    whoCache = out;
    setTimeout(function () { whoCache = null; }, 0);
    return out;
  };
  var trackerHref = function (c, s) { return "#/t/tracker?c=" + c.id + "&s=" + encodeURIComponent(s); };
  /** May `me` plan and tick this class's subject? Only its teacher (they teach it there), an admin too; leaders may look. */
  function canEdit(me, c, s) { return P.mayMark(me, c.id, s); }
  var mayAddSyllabus = function (me, subject) { return me.isAdmin || P.myAreas(me).indexOf(subject) >= 0; };

  /* ------------------------------------------------------------------ My subjects */
  function card(me, x, conf) {
    var st = T.stats(x.c, x.subject, conf), name = '<div><b>' + esc(x.subject) + '</b><div class="muted small">' + esc(P.classLabel(x.c)) + "</div></div>";
    if (st.none) return '<div class="card card-pad trk-card"><div class="row spread top">' + name + T.chip("none") + '</div><p class="small muted mt-sm">Add the subject\'s syllabus (its document, a PDF) and its topics come from it.</p>' +
      (mayAddSyllabus(me, x.subject) ? '<div class="row mt"><button class="btn btn-sm btn-primary" data-act="trk-outline" data-subject="' + esc(x.subject) + '" data-level="' + esc(x.c.level || "") + '">' + I("upload") + "Add the syllabus</button></div>" : "") + "</div>";
    return '<a class="card card-pad trk-card click" href="' + trackerHref(x.c, x.subject) + '"><div class="row spread top">' + name + T.chip(st.status) + "</div>" +
      '<div class="mt"><div class="row spread small"><span>Whole syllabus</span><b class="tnum">' + st.done + " of " + st.total + " topics · " + st.pct + "%</b></div>" + UI.bar(st.pct) + "</div>" +
      '<div class="mt-sm"><div class="row spread small"><span>Term ' + conf.term + '</span><b class="tnum">' + (st.termPlanned ? st.termDone + " of " + st.termPlanned + " planned" : "none planned") + "</b></div>" + UI.bar(st.termPct || 0, toneOf(st.status)) + "</div></a>";
  }
  A.route("t/subjects", function (p, q, me) {
    var conf = P.conf(), pairs = T.pairs(me);
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">My subjects</h2><p class="muted">Term ' + conf.term + " " + esc(conf.year) + " · how far each class is through its syllabus</p></div>" +
      (me.isAdmin ? "" : P.asks(me) ? '<button class="btn btn-ghost" data-act="psubj-unask">Take back my request</button>'
        : '<button class="btn" data-act="psubj-ask">' + I("edit") + "Ask to change my subjects or classes</button>") + "</div>";
    if (!me.isAdmin && P.asks(me)) html += '<div class="callout mb">' + I("clock") + "<div>Your request is with the head: they agree or say no.</div></div>";
    html += P.requestsCard(me);
    html += pairs.length ? '<div class="grid g-2 mb">' + pairs.map(function (x) { return card(me, x, conf); }).join("") + "</div>"
      : '<div class="card mb">' + UI.empty("book", "No subjects here yet", me.isAdmin ? "Admins record every subject's marks. The subjects you teach yourself show here once you have them (Change, below) and teach them in a class." : "The head gives you your subjects and the classes you teach them in. Ask, above.") + "</div>";
    html += P.subjectTeachersCard(me) + (me.isAdmin ? outlinesCard(me) : "");
    return { title: "My subjects", html: html };
  }, { role: "teacher" });
  /** The school's syllabuses (admins): add, check and change them. */
  function outlinesCard(me) {
    var list = S().all("outlines").sort(function (a, b) { return a.subject.localeCompare(b.subject); });
    return '<div class="card mb"><div class="card-head">' + I("library") + '<h3>Syllabuses</h3><span class="sub">' + list.length + '</span><span class="grow"></span><button class="btn btn-sm" data-act="trk-outline">' + I("plus") + "Add a syllabus</button></div>" +
      (list.length ? list.map(function (o) {
        return '<div class="list-row"><div class="grow"><div class="title">' + esc(o.subject) + " · " + esc(o.title || "syllabus") + '</div><div class="meta"><span>' + o.topics.length + " topics</span>" +
          '<span class="sep"></span><span>' + esc((o.levels || []).length ? o.levels.join(", ") : "Every form") + "</span>" + (o.file ? '<span class="sep"></span><span>From ' + esc(o.file) + "</span>" : "") + "</div></div>" +
          '<button class="btn btn-sm btn-ghost" data-act="trk-outline" data-id="' + o.id + '">' + I("edit") + "Check or change</button></div>";
      }).join("") : '<div class="card-body muted small">No syllabus yet. Add each subject\'s syllabus document (a PDF) and School Assist reads its topics; then teachers plan their terms and tick what they have taught.</div>') + "</div>";
  }

  /* ------------------------------------------------------------------ a syllabus: read from its document, or typed */
  var tidy = function (s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    // "NUMBERS AND SETS" → "Numbers and sets"
    return s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s;
  };
  var normName = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  /** The topics as lines: "1 Numbers", then its parts "1.1 Number concepts". */
  T.topicsText = function (topics) {
    return (topics || []).map(function (t) { return (t.n ? t.n + " " : "") + t.title + (t.parts || []).map(function (x) { return "\n" + (x.n ? x.n + " " : "- ") + x.title; }).join(""); }).join("\n");
  };
  /** Lines back into topics; a topic keeps its id (and so its ticks and term) when its name is the same as before. */
  T.parseTopics = function (text, old) {
    var byName = {}, out = [], cur = null;
    (old || []).forEach(function (t) { byName[normName(t.title)] = t; });
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var l = line.trim();
      if (!l || /^\d{1,2}(\.\d{1,2})*\.?$/.test(l)) return;
      var part = /^(?:[-•*–]\s+|(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+)(.+)$/.exec(l);
      if (part && cur) { cur.parts.push({ n: part[1] || "", title: tidy(part[2]).slice(0, 200) }); return; }
      var m = /^(?:(?:topic|theme|unit|section)\s+)?(\d{1,2})(?:\.0)?[.:)]?\s+(.+)$/i.exec(l);
      var title = tidy(m ? m[2] : l).slice(0, 160), was = byName[normName(title)];
      cur = { id: was ? was.id : A.uid("tp"), n: m ? m[1] : String(out.length + 1), title: title, parts: [] };
      if (was) delete byName[normName(title)];
      out.push(cur);
    });
    return out;
  };
  A.act["trk-outline"] = function (el) {
    var me = M.me(), st = M.structure(), conf = P.conf();
    var o = el.getAttribute("data-id") ? S().get("outlines", el.getAttribute("data-id")) : null;
    var subject = o ? o.subject : el.getAttribute("data-subject") || "", level = el.getAttribute("data-level") || "";
    if (!o && subject) o = T.outlineFor(subject, level);
    if (subject && !mayAddSyllabus(me, subject)) { UI.toast("Only the subject's teachers and admins change its syllabus", "bad"); return; }
    var levels = o ? o.levels || [] : level ? [level] : [], fileName = o ? o.file || "" : "";
    var subjects = me.isAdmin ? conf.areas : P.myAreas(me);
    UI.modal({
      title: o ? "Syllabus: " + o.subject : "Add a syllabus", size: "wide",
      body: '<form id="trk-o" class="form-grid">' +
        (subject ? '<div class="field"><span class="label">Subject</span><b>' + esc(subject) + "</b></div>" : '<label class="field"><span>Subject</span><select class="select" name="subject">' + subjects.map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("") + "</select></label>") +
        '<label class="field"><span>Its name</span><input class="input" name="title" value="' + esc(o ? o.title || "" : "") + '" placeholder="e.g. ZIMSEC O Level Mathematics 4004"></label>' +
        '<div class="field full"><span class="label">' + esc(st.levelLabel) + "s it is for</span><div class=\"row wrap\" style=\"gap:4px 14px\">" + st.levels.map(function (l) {
          return '<label class="check"><input type="checkbox" data-lvl="' + esc(l) + '"' + (levels.indexOf(l) >= 0 ? " checked" : "") + "> " + esc(l) + "</label>";
        }).join("") + '</div><span class="hint">None ticked: every one.</span></div>' +
        '<div class="field full"><span class="label">The syllabus document</span><div class="row wrap"><label class="btn btn-sm">' + I("upload") + 'Read its PDF<input type="file" accept="application/pdf,.pdf" id="trk-file" hidden></label>' +
        '<span class="small muted" id="trk-note">' + (fileName ? "Read from " + esc(fileName) + "." : "School Assist reads its topics, for you to check below.") + "</span></div></div>" +
        '<label class="field full"><span>Its topics, one a line</span><textarea class="textarea" name="topics" rows="14" placeholder="1 Numbers&#10;1.1 Number concepts&#10;2 Sets">' + esc(T.topicsText(o ? o.topics : [])) + "</textarea>" +
        '<span class="hint">"1 Numbers" is a topic and "1.1 Number concepts" one of its parts. Change, add or remove lines as you like: a topic keeps its ticks while its name stays the same.</span></label></form>',
      onMount: function (m) {
        var input = m.querySelector("#trk-file"), note = m.querySelector("#trk-note"), f = m.querySelector("#trk-o");
        input.addEventListener("change", function () {
          var file = input.files && input.files[0];
          if (!file) return;
          if (!A.SylRead) { note.textContent = "This copy can't read PDFs: type the topics below."; return; }
          note.textContent = "Reading " + file.name + "…";
          A.SylRead.read(file, function (n, of) { note.textContent = "Reading page " + n + " of " + of + "…"; }).then(function (r) {
            var list = (r.topics || []).map(function (t) { return { n: t.n, title: tidy(t.title), parts: (t.outline || []).filter(function (x) { return x.title; }).map(function (x) { return { n: x.n || "", title: tidy(x.title) }; }) }; });
            if (!list.length) { note.textContent = "No topics were found in " + file.name + ". Type them below, or copy them from the document."; return; }
            f.topics.value = T.topicsText(list); fileName = file.name;
            if (!f.title.value.trim() && r.title) f.title.value = tidy(r.title).slice(0, 120);
            note.textContent = list.length + " topics read from " + file.name + ". Check them below, then save.";
          }, function (e) { note.textContent = "That file couldn't be read (" + (e && e.message ? e.message : e) + "). Type the topics below."; });
        });
      },
      foot: (o && me.isAdmin ? [{ label: "Delete", cls: "btn-danger", onClick: function () {
        return UI.confirm("Delete the " + o.subject + " syllabus? The classes' ticks are kept, and come back with a syllabus of the same topics.", { danger: true, ok: "Delete" }).then(function (ok) { if (!ok) return false; S().remove("outlines", o.id); UI.toast("Syllabus deleted"); A.render(); });
      } }] : []).concat([{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var f = m.querySelector("#trk-o"), subj = subject || (f.subject && f.subject.value);
        var topics = T.parseTopics(f.topics.value, o ? o.topics : []);
        if (!subj) { UI.toast("Choose the subject", "bad"); return false; }
        if (!topics.length) { UI.toast("Read the syllabus's PDF, or type its topics", "bad"); return false; }
        var lv = Array.prototype.map.call(f.querySelectorAll("[data-lvl]:checked"), function (x) { return x.getAttribute("data-lvl"); });
        S().put("outlines", Object.assign({}, o || { id: A.uid("out"), createdBy: me.id }, { subject: subj, levels: lv, title: f.title.value.trim().slice(0, 120), file: fileName || null, topics: topics, by: me.id }));
        UI.toast("The " + subj + " syllabus is saved: " + topics.length + " topics"); A.render();
      } }]),
    });
  };

  /* ------------------------------------------------------------------ the tracker */
  function putCov(cid, s, change) {
    var me = M.me(), conf = P.conf(), c = M.cls(cid), id = covId(conf.year, cid, s), o = T.outlineFor(s, c && c.level);
    var cur = S().get("coverage", id) || { id: id, classId: cid, subject: s, year: String(conf.year), plan: {}, done: {} };
    var rec = Object.assign({}, cur, { plan: Object.assign({}, cur.plan), done: Object.assign({}, cur.done), outlineId: o ? o.id : cur.outlineId || null });
    // the teacher whose tracker it is (an admin ticking for them leaves it theirs)
    if (!rec.teacherId || (!me.isAdmin && rec.teacherId !== me.id)) rec.teacherId = me.id;
    change(rec, o);
    S().put("coverage", rec);
  }
  A.route("t/tracker", function (p, q, me) {
    var c = q.c && M.cls(q.c), s = q.s, conf = P.conf();
    if (!c || !s) return { redirect: "#/t/subjects" };
    var edit = canEdit(me, c, s);
    if (!edit && !T.isLeader(me) && !me.isAdmin) return { redirect: "#/t/subjects" };
    var st = T.stats(c, s, conf), o = st.outline, back = edit ? { label: "My subjects", href: "#/t/subjects" } : { label: c.name, href: "#/t/others/" + c.id + "?v=syllabus" };
    var crumbs = [back, { label: s + " · " + c.name }];
    var head = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">' + esc(s) + " · " + esc(P.classLabel(c)) + '</h2><p class="muted">' + (o ? esc(o.title || s + " syllabus") + " · " : "") + "Term " + conf.term + " " + esc(conf.year) +
      (st.cov && st.cov.teacherId && M.user(st.cov.teacherId) ? " · " + esc(M.user(st.cov.teacherId).name) : "") + "</p></div>" +
      (o && mayAddSyllabus(me, s) ? '<button class="btn" data-act="trk-outline" data-id="' + o.id + '">' + I("book") + "Syllabus</button>" : "") + "</div>";
    if (!o) return { title: s, crumbs: crumbs, html: head + '<div class="card">' + UI.empty("book", "No syllabus yet", "Add the " + s + " syllabus (its document, a PDF): its topics come from it, and then you choose which are for which term and tick them as you teach them.",
      mayAddSyllabus(me, s) ? '<button class="btn btn-primary" data-act="trk-outline" data-subject="' + esc(s) + '" data-level="' + esc(c.level || "") + '">' + I("upload") + "Add the syllabus</button>" : "") + "</div>" };
    var cv = st.cov || {}, plan = cv.plan || {}, done = cv.done || {}, f = /^[123n]$/.test(q.t || "") ? q.t : "";
    var html = head;
    html += '<div class="grid g-4 mb">' + UI.stat("book", st.pct + "%", "Whole syllabus", false, st.done + " of " + st.total + " topics taught") +
      UI.stat("target", st.termPlanned ? st.termDone + " / " + st.termPlanned : "—", "Term " + conf.term + " topics", true) +
      UI.stat("trend", st.perWeek, "Topics a week this term") + '<div class="card stat"><div>' + T.chip(st.status) + '<div class="lbl mt-sm">' +
      (st.status === "behind" ? (st.left ? st.left + " left from an earlier term" : "about " + Math.ceil(st.expected - st.termDone) + " behind the time gone") : st.status === "noplan" ? "Choose a term for each topic" : st.status === "done" ? "This term's topics are taught" : "As far as the time gone") + "</div></div></div></div>";
    // tools: spread the topics over the terms, or take another class's plan
    var others = S().filter("coverage", function (r) { return r.subject === s && r.classId !== c.id && String(r.year) === String(conf.year) && Object.keys(r.plan || {}).length; })
      .map(function (r) { return M.cls(r.classId); }).filter(function (x) { return x && x.level === c.level; });
    if (edit) html += '<div class="row wrap mb">' + '<button class="btn btn-sm" data-act="trk-auto" data-c="' + c.id + '" data-s="' + esc(s) + '">' + I("calendar") + "Spread the topics over the three terms</button>" +
      (others.length ? '<select class="select sm" style="width:auto" data-change="trk-copy" data-c="' + c.id + '" data-s="' + esc(s) + '" aria-label="Use the plan of another class"><option value="">Use the plan of…</option>' + others.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + "</option>"; }).join("") + "</select>" : "") + "</div>";
    var count = function (t) { return o.topics.filter(function (x) { return t === "n" ? !plan[x.id] : Number(plan[x.id]) === Number(t); }).length; };
    var base = trackerHref(c, s);
    html += '<div class="pill-tabs sm"><button class="' + (!f ? "on" : "") + '" data-act="goto" data-href="' + base + '">All topics <span class="muted">(' + o.topics.length + ")</span></button>" +
      ["1", "2", "3", "n"].map(function (t) { var n = count(t); return n || t === String(conf.term) ? '<button class="' + (f === t ? "on" : "") + '" data-act="goto" data-href="' + base + "&t=" + t + '">' + (t === "n" ? "No term yet" : "Term " + t) + ' <span class="muted">(' + n + ")</span></button>" : ""; }).join("") + "</div>";
    var rows = o.topics.filter(function (t) { return !f || (f === "n" ? !plan[t.id] : Number(plan[t.id]) === Number(f)); });
    html += '<div class="card">' + (rows.length ? rows.map(function (t) {
      var d = done[t.id], dis = edit ? "" : " disabled";
      return '<div class="list-row trk-row' + (d ? " done" : "") + '"><label class="check trk-tick"><input type="checkbox" data-change="trk-done" data-c="' + c.id + '" data-s="' + esc(s) + '" data-t="' + t.id + '"' + (d ? " checked" : "") + dis + ' aria-label="Taught: ' + esc(t.title) + '"></label>' +
        '<div class="grow"><div class="title">' + (t.n ? '<span class="muted tnum">' + esc(t.n) + "</span> " : "") + esc(t.title) + "</div>" +
        ((t.parts || []).length ? '<div class="small muted">' + esc(t.parts.map(function (x) { return x.title; }).join(" · ")) + "</div>" : "") +
        (d ? '<div class="small" style="color:var(--good)">' + I("check") + " Taught " + esc(A.fmtDate(d)) + "</div>" : "") + "</div>" +
        '<select class="select sm trk-term" data-change="trk-term" data-c="' + c.id + '" data-s="' + esc(s) + '" data-t="' + t.id + '" aria-label="Term for ' + esc(t.title) + '"' + dis + ">" +
        ['<option value="">No term</option>'].concat([1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (Number(plan[t.id]) === n ? " selected" : "") + ">Term " + n + "</option>"; })).join("") + "</select></div>";
    }).join("") : UI.empty("book", "No topics here", f === "n" ? "Every topic has its term." : "Choose this term for some topics, from All topics.")) + "</div>";
    if (!edit) html += '<p class="small muted mt">Only the teacher of ' + esc(s) + " in " + esc(c.name) + " and admins change this.</p>";
    return { title: s + " · " + c.name, crumbs: crumbs, html: html };
  }, { role: "teacher" });
  A.act["trk-done"] = function (el) {
    var t = el.getAttribute("data-t"), on = el.checked;
    putCov(el.getAttribute("data-c"), el.getAttribute("data-s"), function (r) { if (on) r.done[t] = A.now(); else delete r.done[t]; });
    A.render();
  };
  A.act["trk-term"] = function (el) {
    var t = el.getAttribute("data-t"), v = Number(el.value) || 0;
    putCov(el.getAttribute("data-c"), el.getAttribute("data-s"), function (r) { if (v) r.plan[t] = v; else delete r.plan[t]; });
    A.render();
  };
  A.act["trk-auto"] = function (el) {
    var cid = el.getAttribute("data-c"), s = el.getAttribute("data-s"), c = M.cls(cid), o = c && T.outlineFor(s, c.level), cv = T.cov(cid, s);
    if (!o) return;
    var go = function () {
      putCov(cid, s, function (r) { var n = o.topics.length; r.plan = {}; o.topics.forEach(function (t, i) { r.plan[t.id] = 1 + Math.floor(i * 3 / n); }); });
      UI.toast("The topics are spread over the three terms, in the syllabus's order. Change any you like."); A.render();
    };
    if (cv && Object.keys(cv.plan || {}).length) UI.confirm("Spread every topic over the three terms, in the syllabus's order? The terms chosen now are replaced (ticks stay).", { ok: "Spread them" }).then(function (ok) { if (ok) go(); });
    else go();
  };
  A.act["trk-copy"] = function (el) {
    var from = el.value, cid = el.getAttribute("data-c"), s = el.getAttribute("data-s"), src = from && T.cov(from, s), fc = from && M.cls(from);
    if (!src) return;
    UI.confirm("Use " + fc.name + "'s term plan for " + s + "? The terms chosen here are replaced (ticks stay).", { ok: "Use it" }).then(function (ok) {
      if (!ok) { el.value = ""; return; }
      putCov(cid, s, function (r) { r.plan = Object.assign({}, src.plan); });
      UI.toast("Plan copied from " + fc.name); A.render();
    });
  };

  /* ------------------------------------------------------------------ Teachers' overview (leaders) */
  /** One teacher's term: syllabus (from the tracker), registers of their own classes, and their mark book. */
  function teacherTerm(u, conf, term, ix, eot) {
    var pairs = T.pairs(u, ix), sts = pairs.map(function (x) { return { x: x, st: T.stats(x.c, x.subject, conf, term) }; });
    var syl = sts.filter(function (y) { return !y.st.none; }), sum = function (k) { return syl.reduce(function (a, y) { return a + (y.st[k] || 0); }, 0); };
    var status = !pairs.length || !syl.length ? "none" : syl.some(function (y) { return y.st.status === "behind"; }) ? "behind" : syl.every(function (y) { return y.st.status === "done"; }) ? "done"
      : syl.some(function (y) { return y.st.status === "ontrack" || y.st.status === "done"; }) ? "ontrack" : "noplan";
    // registers: each school day of the term so far, for each class of their own (from when it was made)
    var r = T.termRange(term, conf), today = A.isoDate(), end = today < r.closes ? today : r.closes, own = P.homerooms().filter(function (c) { return c.teacherId === u.id; });
    var reg = { due: 0, taken: 0, last: null, p: 0, n: 0 };
    if (end >= r.opens) own.forEach(function (c) {
      var made = c.createdAt ? iso(new Date(c.createdAt)) : r.opens;
      schoolDays(made > r.opens ? made : r.opens, end).forEach(function (d) {
        reg.due++;
        var rec = M.register(c.id, d);
        if (!rec) return;
        reg.taken++; if (!reg.last || d > reg.last) reg.last = d;
        Object.keys(rec.marks || {}).forEach(function (id) { var v = rec.marks[id]; if (v === "E") return; reg.n++; if (v === "P" || v === "L") reg.p++; });
      });
    });
    // the mark book: their pieces of work this term, and the end-of-term marks of their subjects in their classes
    var work = S().filter("assessments", function (a) { return a.createdBy === u.id && String(a.year) === String(conf.year) && Number(a.term) === term; }).length;
    var marks = { got: 0, need: 0 };
    pairs.forEach(function (x) { var got = eot[x.c.id + "|" + x.subject] || {}, kids = P.pupils(x.c); marks.need += kids.length; marks.got += kids.filter(function (k) { return got[k.id]; }).length; });
    var last = 0;
    syl.forEach(function (y) { if (y.st.last > last) last = y.st.last; });
    return { u: u, pairs: pairs, sts: sts, status: status, termPlanned: sum("termPlanned"), termDone: sum("termDone"), total: sum("total"), done: sum("done"), perWeek: Math.round(sum("perWeek") * 10) / 10,
      own: own, reg: reg, work: work, marks: marks, lastTick: last };
  }
  /** The pupils with an end-of-term mark, by class and subject, for a term (once for a page): "classId|subject" → { pupil: 1 }. */
  function eotIndex(conf, term) {
    var ix = {};
    S().filter("reportmarks", function (r) { return r.mark != null && r.studentId && String(r.year) === String(conf.year) && Number(r.term) === term; }).forEach(function (r) { var k = r.classId + "|" + r.subject; (ix[k] = ix[k] || {})[r.studentId] = 1; });
    return ix;
  }
  function termPills(base, term) {
    return '<div class="pill-tabs sm">' + [1, 2, 3].map(function (t) { return '<button class="' + (t === term ? "on" : "") + '" data-act="goto" data-href="' + base + (base.indexOf("?") < 0 ? "?" : "&") + "term=" + t + '">Term ' + t + "</button>"; }).join("") + "</div>";
  }
  var guessNote = function (conf, term) {
    return T.termRange(term, conf).guessed ? '<div class="callout mb">' + I("info") + "<div>Term " + term + "'s dates aren't set, so it is taken as " + esc(T.termRange(term, conf).opens) + " to " + esc(T.termRange(term, conf).closes) +
      ". For an exact pace, an admin sets them in Settings → Learning areas and terms.</div></div>" : "";
  };
  A.route("t/overview", function (p, q, me) {
    if (!T.isLeader(me)) return { redirect: "#/t/home" };
    var conf = P.conf(), term = Number(q.term) || conf.term, ix = teachIndex(), eot = eotIndex(conf, term), f = q.f || "";
    var rows = P.staffTeachers().map(function (u) { return teacherTerm(u, conf, term, ix, eot); });
    var by = function (st) { return rows.filter(function (r) { return r.status === st; }).length; };
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Teachers\' overview</h2><p class="muted">Term ' + term + " " + esc(conf.year) + " · every teacher's pace, from the syllabus tracker, the registers and the mark book</p></div>" + termPills("#/t/overview" + (f ? "?f=" + f : ""), term) + "</div>";
    html += guessNote(conf, term);
    var regs = rows.reduce(function (a, r) { a.due += r.reg.due; a.taken += r.reg.taken; return a; }, { due: 0, taken: 0 });
    html += '<div class="grid g-4 mb">' + UI.stat("users", rows.length, "Teachers") + UI.stat("checkCircle", by("done") + by("ontrack"), "On track or finished", false, by("done") + " finished this term's topics") +
      UI.stat("alert", by("behind"), "Behind", by("behind") > 0) + UI.stat("check", regs.due ? pct(regs.taken, regs.due) + "%" : "—", "Registers taken this term", false, regs.taken + " of " + regs.due + " school days, all classes") + "</div>";
    var FILTERS = [["", "Everyone"], ["behind", "Behind"], ["ontrack", "On track"], ["done", "Finished"], ["noplan", "Not planned"], ["none", "No syllabus"]];
    html += '<div class="pill-tabs sm">' + FILTERS.map(function (x) {
      var n = x[0] ? by(x[0]) : rows.length;
      return n || !x[0] ? '<button class="' + (f === x[0] ? "on" : "") + '" data-act="goto" data-href="#/t/overview?term=' + term + (x[0] ? "&f=" + x[0] : "") + '">' + x[1] + ' <span class="muted">(' + n + ")</span></button>" : "";
    }).join("") + "</div>";
    var shown = rows.filter(function (r) { return !f || r.status === f; });
    var cellSyl = function (r) { return r.termPlanned ? UI.pctCell(pct(r.termDone, r.termPlanned), toneOf(r.status), r.termDone + " of " + r.termPlanned + " topics planned for term " + term) : '<span class="muted small">' + (r.total ? "none planned" : "—") + "</span>"; };
    html += '<div class="card table-wrap"><table class="table ov-table"><thead><tr><th>Teacher</th><th>Syllabus, term ' + term + '</th><th>Whole syllabus</th><th class="num">Pace</th><th>Registers</th><th>Mark book</th><th>Status</th></tr></thead><tbody>' +
      (shown.length ? shown.map(function (r) {
        return '<tr class="click" data-href="#/t/overview/' + r.u.id + "?term=" + term + '"><td><div class="row" style="gap:10px">' + A.avatar(r.u, "sm") + "<div><b>" + esc(r.u.name) + '</b><div class="small muted">' + esc((r.u.title || "Teacher") + " · " + (r.pairs.length ? r.pairs.length + " subject" + (r.pairs.length === 1 ? "" : "s") + " and class" + (r.pairs.length === 1 ? "" : "es") : "nothing to teach yet")) + "</div></div></div></td>" +
          "<td>" + cellSyl(r) + "</td><td>" + (r.total ? UI.pctCell(pct(r.done, r.total), "", r.done + " of " + r.total + " topics") : '<span class="muted">—</span>') + "</td>" +
          '<td class="num tnum" data-tip="Topics ticked a week this term">' + (r.total ? r.perWeek : "—") + "</td>" +
          "<td>" + (r.reg.due ? UI.pctCell(pct(r.reg.taken, r.reg.due), pct(r.reg.taken, r.reg.due) >= 90 ? "good" : pct(r.reg.taken, r.reg.due) >= 70 ? "warn" : "bad", r.reg.taken + " of " + r.reg.due + " school days" + (r.reg.last ? ", last " + A.fmtDate(Date.parse(r.reg.last + "T12:00:00")) : "")) : '<span class="muted small">' + (r.own.length ? "—" : "no class of their own") + "</span>") + "</td>" +
          '<td class="small">' + r.work + " piece" + (r.work === 1 ? "" : "s") + " of work" + (r.marks.need ? '<div class="muted">end of term ' + pct(r.marks.got, r.marks.need) + "% entered</div>" : "") + "</td>" +
          "<td>" + T.chip(r.status) + "</td></tr>";
      }).join("") : '<tr><td colspan="7">' + UI.empty("users", "No one here", "") + "</td></tr>") + "</tbody></table></div>";
    html += '<p class="small muted mt">Finished: the term\'s topics are all taught. On track: as many as the time gone in the term. Behind: fewer, or topics left from an earlier term. The registers are those of each teacher\'s own class.</p>';
    return { title: "Teachers' overview", html: html };
  }, { role: "teacher" });
  A.route("t/overview/:id", function (p, q, me) {
    var u = M.user(p.id);
    if (!T.isLeader(me) || !u || u.role !== "teacher") return { redirect: "#/t/overview" };
    var conf = P.conf(), term = Number(q.term) || conf.term, eot = eotIndex(conf, term), r = teacherTerm(u, conf, term, teachIndex(), eot);
    var html = '<div class="row wrap spread mb"><div class="row" style="gap:12px">' + A.avatar(u) + '<div><h2 style="font-size:22px">' + esc(u.name) + '</h2><p class="muted">' + esc(u.title || "Teacher") + (u.isAdmin ? " · admin" : "") +
      ((u.areas || []).length ? " · " + esc(u.areas.join(", ")) : "") + "</p></div></div>" + termPills("#/t/overview/" + u.id, term) + "</div>";
    html += guessNote(conf, term);
    html += '<div class="grid g-4 mb">' + UI.stat("target", r.termPlanned ? pct(r.termDone, r.termPlanned) + "%" : "—", "Term " + term + "'s topics taught", false, r.termDone + " of " + r.termPlanned) +
      UI.stat("trend", r.total ? r.perWeek : "—", "Topics a week") + UI.stat("check", r.reg.due ? pct(r.reg.taken, r.reg.due) + "%" : "—", "Registers taken", false, r.reg.taken + " of " + r.reg.due + " school days") +
      UI.stat("edit", r.work, "Pieces of work marked", false, r.marks.need ? "End of term marks: " + pct(r.marks.got, r.marks.need) + "% entered" : "") + "</div>";
    html += '<div class="card mb"><div class="card-head">' + I("book") + "<h3>Syllabus</h3>" + T.chip(r.status) + "</div>" + (r.sts.length ? r.sts.map(function (y) {
      var st = y.st;
      return '<a class="list-row click" href="' + trackerHref(y.x.c, y.x.subject) + '"><div class="grow"><div class="title">' + esc(y.x.subject) + " · " + esc(P.classLabel(y.x.c)) + "</div>" +
        (st.none ? '<div class="meta"><span>No syllabus yet</span></div>' : '<div class="meta"><span>Term ' + term + ": " + (st.termPlanned ? st.termDone + " of " + st.termPlanned + " topics" : "none planned") + '</span><span class="sep"></span><span>Whole syllabus ' + st.done + " of " + st.total + "</span>" +
          (st.last ? '<span class="sep"></span><span>Last ticked ' + esc(A.fmtDate(st.last)) + "</span>" : "") + "</div>") + "</div>" +
        (st.none ? "" : '<div style="width:140px">' + UI.bar(st.termPct || 0, toneOf(st.status)) + "</div>") + T.chip(st.status) + "</a>";
    }).join("") : '<div class="card-body muted small">No subjects and classes yet.</div>') + "</div>";
    html += '<div class="card mb"><div class="card-head">' + I("check") + "<h3>Registers</h3></div>" + (r.own.length ? r.own.map(function (c) {
      var made = c.createdAt ? iso(new Date(c.createdAt)) : null, rg = T.termRange(term, conf), today = A.isoDate(), end = today < rg.closes ? today : rg.closes;
      var days = end >= rg.opens ? schoolDays(made && made > rg.opens ? made : rg.opens, end) : [], missed = days.filter(function (d) { return !M.register(c.id, d); });
      return '<div class="list-row"><div class="grow"><div class="title">' + esc(P.classLabel(c)) + '</div><div class="meta"><span>' + (days.length - missed.length) + " of " + days.length + " school days taken</span>" +
        (missed.length ? '<span class="sep"></span><span>Not taken: ' + esc(missed.slice(-6).map(function (d) { return A.fmtDate(Date.parse(d + "T12:00:00")); }).join(", ")) + (missed.length > 6 ? " and " + (missed.length - 6) + " more" : "") + "</span>" : "") + "</div></div>" +
        UI.scoreBadge(pct(days.length - missed.length, days.length)) + "</div>";
    }).join("") + (r.reg.n ? '<div class="card-body small muted">Pupils present: ' + pct(r.reg.p, r.reg.n) + "% of the marks this term.</div>" : "") : '<div class="card-body muted small">No class of their own: no registers to take.</div>') + "</div>";
    html += '<div class="card"><div class="card-head">' + I("edit") + "<h3>Mark book</h3></div>" + (r.pairs.length ? r.pairs.map(function (x) {
      var n = S().filter("assessments", function (a) { return a.createdBy === u.id && a.classId === x.c.id && a.area === x.subject && String(a.year) === String(conf.year) && Number(a.term) === term; }).length;
      var pupils = P.pupils(x.c), kids = pupils.length, has = eot[x.c.id + "|" + x.subject] || {}, got = pupils.filter(function (k) { return has[k.id]; }).length;
      return '<div class="list-row"><div class="grow"><div class="title">' + esc(x.subject) + " · " + esc(P.classLabel(x.c)) + '</div><div class="meta"><span>' + n + " piece" + (n === 1 ? "" : "s") + " of work</span>" +
        '<span class="sep"></span><span>End of term marks: ' + got + " of " + kids + " pupils</span></div></div>" + UI.scoreBadge(pct(got, kids)) + "</div>";
    }).join("") : '<div class="card-body muted small">Nothing yet.</div>') + "</div>";
    return { title: u.name, crumbs: [{ label: "Teachers' overview", href: "#/t/overview?term=" + term }, { label: u.name }], html: html };
  }, { role: "teacher" });
})(window.App);
