/* The tutor: learning a topic step by step from the notes in the library.
 * Notes, summary notes, flashcard PDFs and textbooks are read by js/notescan.js: which pages are
 * about which syllabus topic (the admin can change them in Tutor content, js/tutoradmin.js) and
 * flashcards. For a topic, the tutor puts together:
 *   What to study  what the syllabus says to learn for the topic (when its outline has been read)
 *   Read        the topic's pages of each document, whole, as printed, with their key points
 *   Flashcards  the topic's cards; the ones she doesn't know come back sooner (spaced repetition)
 *   Quick check a short quiz made from the cards, marked straight away; passing it completes the topic
 *   Topic test  topical test papers for the topic, sat like past papers
 * What she has done is kept in the topic's progress record (tutor: read, cards, check). */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var SCANS = {};
  var DAY = 86400000, BOXES = [0, 1, 3, 7, 14, 30]; // days until a card comes back, by how well it is known

  /* ------------------------------------------------------------ loading */
  function fileBlob(id, keep) {
    return A.Files.get(id).then(function (rec) {
      if (rec && rec.blob) return rec.blob;
      if (!navigator.onLine || !A.Sync || !A.Sync.fetchFile) return null;
      return A.Sync.fetchFile(id, keep !== false).then(function (r) { return r && r.blob; });
    }).catch(function () { return null; });
  }
  function loadScan(m) {
    if (SCANS[m.tutorFileId]) return Promise.resolve(SCANS[m.tutorFileId]);
    return fileBlob(m.tutorFileId).then(function (b) { return b ? b.text() : null; }).then(function (t) {
      if (!t) return null;
      var s = JSON.parse(t); SCANS[m.tutorFileId] = s; return s;
    }).catch(function () { return null; });
  }
  function sylOf(m) { var c = M.cls(m.classId); return m.syllabusId || (c && c.syllabusId); }

  /** Library items the tutor can use for a topic (known without opening them). */
  M.tutorMaterials = function (sid, sylId, topicId) {
    return M.materialsForStudent(sid).filter(function (m) {
      return (m.tutorFileId || m.topicPages) && !M.isExamItem(m) && sylOf(m) === sylId &&
        (!topicId || m.topicId === topicId || (m.tutorTopics || []).indexOf(topicId) >= 0 || !!(m.topicPages && m.topicPages[topicId]));
    });
  };

  /* ------------------------------------------------------------ pages per topic */
  /** [[3, 7], [12, 12]] → "3–7, 12" */
  M.pagesText = function (r) { return (r || []).map(function (x) { return x[0] === x[1] ? String(x[0]) : x[0] + "–" + x[1]; }).join(", "); };
  /** "3-7, 12" → [[3, 7], [12, 12]]; null when it can't be read. Pages past `max` are an error too. */
  M.parsePages = function (text, max) {
    var t = String(text || "").replace(/pages?|pp?\./gi, " ").trim(); if (!t) return [];
    var list = [], ok = t.split(/\s*[,;]\s*|\s+(?=\d+\s*(?:[-–—]|to|$|\s))/).filter(Boolean).every(function (part) {
      var m = /^(\d+)\s*(?:(?:[-–—]|to)\s*(\d+))?$/.exec(part.trim()); if (!m) return false;
      var a = Number(m[1]), b = Number(m[2] || m[1]); if (b < a) { var x = a; a = b; b = x; }
      if (a < 1 || (max && b > max)) return false;
      for (var p = a; p <= b; p++) list.push(p);
      return true;
    });
    return ok ? A.NoteScan.ranges(list) : null;
  };
  M.pageList = function (r) { var out = []; (r || []).forEach(function (x) { for (var p = x[0]; p <= x[1]; p++) out.push(p); }); return out; };
  /** The topics a document has pages or flashcards for. */
  M.tutorTopicsOf = function (pages, cards) {
    var out = Object.keys(pages || {}).filter(function (t) { return pages[t] && pages[t].length; });
    (cards || []).forEach(function (k) { if (k.topicId && out.indexOf(k.topicId) < 0) out.push(k.topicId); });
    return out;
  };
  /** A document's pages per topic; notes read before pages were kept are worked out from their sections. */
  M.matTopicPages = function (m, scan) {
    if (m.topicPages) return m.topicPages;
    var list = {};
    if (!scan) { if (m.topicId && m.pageCount) list[m.topicId] = [[1, m.pageCount]]; return list; }
    if (scan.topicPages) return scan.topicPages;
    scan.sections.forEach(function (s) { if (s.topicId) s.clips.forEach(function (c) { (list[s.topicId] = list[s.topicId] || []).push(c[0]); }); });
    Object.keys(list).forEach(function (t) { list[t] = A.NoteScan.ranges(list[t]); });
    return list;
  };
  var ORDER = { summary: 0, notes: 1, revision: 2, flashcards: 3, worksheet: 4, other: 4, book: 5 };
  /** Topical tests: exam papers set for one topic. */
  M.topicTests = function (sid, sylId, topicId) {
    return M.materialsForStudent(sid).filter(function (m) { return m.kind === "pastpaper" && m.topicId === topicId && sylOf(m) === sylId; });
  };
  /** Everything the tutor has for a topic. */
  function gather(me, syl, t) {
    var mats = M.tutorMaterials(me.id, syl.id, t.id);
    return Promise.all(mats.map(function (m) { return loadScan(m).then(function (scan) { return { m: m, scan: scan }; }); })).then(function (list) {
      var reads = [], cards = [];
      list.forEach(function (x) {
        var mine = function (topicId) { return topicId === t.id || (!topicId && x.m.topicId === t.id); };
        var pages = M.pageList(M.matTopicPages(x.m, x.scan)[t.id]);
        if (pages.length) {
          var points = [];
          if (x.scan) x.scan.sections.forEach(function (s) { if (s.topicId === t.id) points = points.concat(s.points); });
          reads.push({ key: x.m.id + ":p", m: x.m, pages: pages, points: points.slice(0, 40) });
        }
        if (x.scan) x.scan.cards.forEach(function (c) { if (mine(c.topicId)) cards.push({ key: x.m.id + ":" + c.id, m: x.m, c: c }); });
      });
      // short notes before long ones; the textbook last
      reads.sort(function (a, b) { return (ORDER[M.matCategory(a.m)] || 0) - (ORDER[M.matCategory(b.m)] || 0) || a.pages.length - b.pages.length; });
      return { reads: reads, cards: cards, tests: M.topicTests(me.id, syl.id, t.id), missing: list.filter(function (x) { return !x.scan && !x.m.topicPages; }).length };
    });
  }

  /* ------------------------------------------------------------ progress */
  function tutorState(me, t) { var r = M.topicProgress(me.id, t.id); return (r && r.tutor) || { read: {}, cards: {}, check: null }; }
  function saveTutor(me, syl, t, fn) {
    var cur = M.topicProgress(me.id, t.id) || { id: "pr_" + me.id + "_" + t.id, studentId: me.id, syllabusId: syl.id, topicId: t.id };
    var tu = JSON.parse(JSON.stringify(cur.tutor || { read: {}, cards: {}, check: null }));
    fn(tu);
    return S().put("progress", Object.assign({}, cur, { tutor: tu, lastStudiedAt: Date.now() }));
  }
  /** Cards due now (seen before and their time has come). */
  M.cardsDue = function (sid, sylId) {
    var now = Date.now(), n = 0;
    S().filter("progress", function (r) { return r.studentId === sid && (!sylId || r.syllabusId === sylId) && r.tutor; }).forEach(function (r) {
      Object.keys(r.tutor.cards || {}).forEach(function (k) { if ((r.tutor.cards[k].d || 0) <= now) n++; });
    });
    return n;
  };

  /* ------------------------------------------------------------ the steps */
  function steps(data, t) {
    var out = [];
    // the syllabus's own notes, unless they are only the "how to revise it" placeholder
    var notes = String(t.notes || "").replace(/##[^\n]*\n/g, "").trim(), placeholder = /How to revise it/i.test(t.notes || ""), outline = t.outline && t.outline.length;
    if (outline) out.push({ type: "study", label: "What to study" });
    if ((!placeholder && notes.length > 200) || (!data.reads.length && notes && !outline)) out.push({ type: "topic", label: "The topic in brief" });
    data.reads.forEach(function (x) { out.push({ type: "read", label: x.m.title, x: x, n: x.pages.length + (x.pages.length === 1 ? " page" : " pages") }); });
    if (data.cards.length) out.push({ type: "cards", label: "Flashcards", n: data.cards.length });
    if (quizCards(data.cards).length >= 3) out.push({ type: "check", label: "Quick check" });
    if (data.tests.length) out.push({ type: "test", label: "Topic test", n: data.tests.length });
    return out;
  }
  function stepDone(st, tu) {
    if (st.type === "read") return !!tu.read[st.x.key];
    if (st.type === "topic") return !!tu.read.topic;
    if (st.type === "study") return !!tu.read.study;
    if (st.type === "cards") return T.data.cards.every(function (x) { return tu.cards[x.key]; });
    if (st.type === "check") return !!(tu.check && tu.check.best >= M.EXAM.topicMasteryMark);
    if (st.type === "test") return T.data.tests.some(function (p) { return M.paperDone(T.me.id, p.id); });
    return false;
  }

  /* ------------------------------------------------------------ the page (a tab of the topic) */
  var T = { i: 0 };
  A.tutorTab = function (me, syl, t) {
    return {
      html: '<div id="tutor-root"><div class="card">' + UI.empty("refresh", "Getting the tutor ready…", "") + "</div></div>",
      mount: function () {
        T = { me: me, syl: syl, t: t, i: T.t === t ? T.i : null, flash: null, quiz: null };
        gather(me, syl, t).then(function (data) {
          T.data = data; T.steps = steps(data, t);
          if (T.i == null) {
            // start where she left off: the first step not done yet
            var tu = tutorState(me, t);
            T.i = Math.max(0, T.steps.findIndex(function (s) { return !stepDone(s, tu); }));
          }
          draw();
        });
        A.cleanup = closeViewer;
      },
    };
  };
  M.tutorHas = function (sid, sylId, topicId) { return M.tutorMaterials(sid, sylId, topicId).length > 0 || M.topicTests(sid, sylId, topicId).length > 0; };

  function draw() {
    var root = document.getElementById("tutor-root"); if (!root) return;
    if (!T.data.reads.length && !T.data.cards.length && !T.data.tests.length && !T.steps.some(function (s) { return s.type === "topic"; })) {
      root.innerHTML = '<div class="card">' + UI.empty("book", "The tutor has nothing for this topic yet", "When your teacher adds notes, summary notes or flashcards for " + T.t.title + ", the tutor takes you through them here, step by step." +
        (T.data.missing ? " Some notes aren't on this device yet: connect to the internet once." : "")) + "</div>";
      return;
    }
    var tu = tutorState(T.me, T.t), done = T.steps.filter(function (s) { return stepDone(s, tu); }).length;
    var pct = Math.round(done / T.steps.length * 100);
    root.innerHTML = '<div class="tutor"><aside class="card tutor-steps"><div class="tutor-prog"><div class="row spread small"><b>Your path</b><span class="tnum">' + done + " of " + T.steps.length + "</span></div>" + UI.bar(pct, pct >= 100 ? "good" : "") + "</div>" +
      '<ol class="tutor-list">' + T.steps.map(function (s, k) {
        var ok = stepDone(s, tu);
        return '<li><button class="tutor-step' + (k === T.i ? " on" : "") + (ok ? " done" : "") + '" data-act="tutor-go" data-i="' + k + '"><span class="tutor-dot">' + (ok ? I("check") : k + 1) + "</span><span class=\"grow\">" + esc(stepName(s)) + "</span>" +
          (s.n ? '<span class="tiny muted">' + s.n + "</span>" : "") + "</button></li>";
      }).join("") + "</ol></aside>" +
      '<section class="card card-pad tutor-main" id="tutor-main"></section></div>';
    drawStep();
  }
  function stepName(s) {
    return s.type === "read" ? s.label : s.type === "cards" ? "Flashcards" : s.type === "check" ? "Quick check" : s.type === "test" ? "Topic test" : s.label;
  }
  function foot(nextLabel, act) {
    return '<div class="row spread mt-lg tutor-foot"><button class="btn" data-act="tutor-go" data-i="' + (T.i - 1) + '"' + (T.i === 0 ? " disabled" : "") + ">" + I("left") + "Back</button>" +
      (act ? '<button class="btn btn-primary" data-act="' + act + '">' + nextLabel + " " + I("right") + "</button>" : "") + "</div>";
  }
  function closeViewer() { if (T.viewer) { try { T.viewer.destroy(); } catch (e) { /* gone */ } T.viewer = null; } }
  /** What the syllabus says to learn for a topic: its parts and their learning points. */
  A.outlineHtml = function (t, open) {
    return '<div class="outline">' + (t.outline || []).map(function (o, i) {
      var n = (o.points || []).length + (o.sup || []).length;
      // "(a) movement as…" items sit under the point before them
      var li = function (p, cls) { var sub = /^(\([a-z]{1,4}\)|•)\s/.test(p); return '<li class="' + cls + (sub ? " subpt" : "") + '">' + esc(sub ? p.replace(/^•\s/, "") : p) + "</li>"; };
      var pts = (o.points || []).map(function (p) { return li(p, ""); }).join("") +
        (o.sup || []).map(function (p, k) { return li(p, "sup").replace('">', '">' + (k === 0 || !/^(\([a-z]{1,4}\)|•)\s/.test(p) ? '<span class="badge">Extended</span> ' : "")); }).join("");
      return '<details class="outline-part"' + (open || i === 0 ? " open" : "") + '><summary><span class="outline-n tnum">' + esc(o.n || "") + '</span><span class="grow">' + esc(o.title) + "</span>" +
        (n ? '<span class="tiny muted">' + n + "</span>" : "") + "</summary>" + (pts ? "<ul>" + pts + "</ul>" : "") + "</details>";
    }).join("") + "</div>";
  };
  function drawStep() {
    var main = document.getElementById("tutor-main"), st = T.steps[T.i]; if (!main || !st) return;
    closeViewer();
    main.querySelectorAll("canvas").forEach(function (c) { c.width = 0; c.height = 0; });
    var head = '<div class="label">Step ' + (T.i + 1) + " of " + T.steps.length + "</div>";
    if (st.type === "topic") {
      main.innerHTML = head + '<h2 class="tutor-title">' + esc(T.t.title) + '</h2><div class="prose mt">' + A.md(T.t.notes) + "</div>" + foot("Got it", "tutor-read");
    } else if (st.type === "study") {
      main.innerHTML = head + '<h2 class="tutor-title">What to study</h2><p class="muted">What the syllabus says you need to know for ' + esc(T.t.title) + ". The next steps take you through it.</p>" +
        A.outlineHtml(T.t) + foot("Got it", "tutor-read");
    } else if (st.type === "read") {
      var x = st.x, mt = x.m;
      main.innerHTML = head + '<h2 class="tutor-title">' + esc(mt.title) + '</h2><div class="small muted">' + esc(M.MAT_CATS[M.matCategory(mt)] || "Notes") + " · " +
        (x.pages.length === 1 ? "page " : "pages ") + esc(M.pagesText(A.NoteScan.ranges(x.pages))) + "</div>" +
        '<div class="tutor-pages mt" id="tutor-pages"><div class="pdf-msg">' + I("refresh") + " Opening the pages…</div></div>" +
        (x.points.length ? '<details class="tutor-points mt"><summary class="bold">' + I("list") + " Key points (" + x.points.length + ")</summary><ul>" +
          x.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></details>" : "") +
        foot("I've read this", "tutor-read");
      var host = document.getElementById("tutor-pages"), tok = T.token = (T.token || 0) + 1;
      fileBlob(mt.fileId, mt.offline !== false).then(function (b) {
        if (tok !== T.token || !document.getElementById("tutor-pages")) return;
        if (!b) {
          host.innerHTML = '<div class="pdf-msg">' + I("wifiOff") + " These pages aren't on this device yet. Connect to the internet once to see them." + (x.points.length ? " The key points are below." : "") + "</div>";
          var det = main.querySelector(".tutor-points"); if (det) det.open = true;
          return;
        }
        T.viewer = A.PdfView.open(host, b, { pages: x.pages });
      });
    } else if (st.type === "cards") {
      drawCards(main, head);
    } else if (st.type === "check") {
      drawCheck(main, head);
    } else if (st.type === "test") {
      main.innerHTML = head + '<h2 class="tutor-title">Topic test</h2><p class="muted">Questions on ' + esc(T.t.title) + " only, sat against the clock and marked like past papers.</p>" +
        '<div class="card mt">' + T.data.tests.map(function (p) {
          var r = M.paperSitting(T.me.id, p.id);
          return '<div class="list-row"><div class="grow"><div class="title">' + esc(p.title) + '</div><div class="row wrap mt-sm" style="gap:6px">' + M.paperChips(p) + (r && r.doneAt && M.paperScoreText(r) ? '<span class="badge good">' + esc(M.paperScoreText(r)) + "</span>" : "") + "</div></div>" +
            '<a class="btn btn-sm btn-primary" href="#/s/sit/' + p.id + '">' + I("clock") + (r && r.doneAt ? "Sit again" : "Sit it") + "</a></div>";
        }).join("") + "</div>" + foot();
    }
    var sc = document.querySelector(".tutor"); if (sc && sc.getBoundingClientRect().top < 0) sc.scrollIntoView({ block: "start" });
  }
  A.act["tutor-go"] = function (el) { var i = Number(el.getAttribute("data-i")); if (i < 0 || i >= T.steps.length) return; T.i = i; T.flash = null; T.quiz = null; draw(); };
  A.act["tutor-read"] = function () {
    var st = T.steps[T.i];
    saveTutor(T.me, T.syl, T.t, function (tu) { tu.read[st.type === "topic" || st.type === "study" ? st.type : st.x.key] = Date.now(); });
    // everything read, and no quiz to pass: the topic counts as revised
    var tu = tutorState(T.me, T.t);
    if (!T.steps.some(function (s) { return s.type === "check"; }) && T.steps.filter(function (s) { return s.type === "read" || s.type === "topic" || s.type === "study"; }).every(function (s) { return stepDone(s, tu); })) M.markNotesRead(T.me.id, T.syl.id, T.t.id);
    if (T.i + 1 < T.steps.length) T.i++;
    draw();
  };

  /* ------------------------------------------------------------ flashcards */
  function queue() {
    var tu = tutorState(T.me, T.t), now = Date.now();
    var due = [], fresh = [], later = [];
    T.data.cards.forEach(function (x) { var st = tu.cards[x.key]; if (!st) fresh.push(x); else if ((st.d || 0) <= now) due.push(x); else later.push(x); });
    return { list: due.concat(fresh), later: later.length, total: T.data.cards.length };
  }
  function drawCards(main, head) {
    if (!T.flash) { var q = queue(); T.flash = { list: q.list, pos: 0, shown: false, later: q.later, total: q.total, right: 0 }; }
    var F = T.flash, x = F.list[F.pos];
    if (!x) {
      var later = queue().later;
      main.innerHTML = head + '<h2 class="tutor-title">Flashcards</h2>' + UI.empty("checkCircle", F.list.length ? "That's all the cards for now" : "No cards are due",
        later ? (later === 1 ? "This card comes" : "These " + later + " cards come") + " back in a day or more, to check you still remember " + (later === 1 ? "it" : "them") + "." : "") +
        foot(T.i + 1 < T.steps.length ? "Next step" : "", T.i + 1 < T.steps.length ? "tutor-next" : null);
      return;
    }
    main.innerHTML = head + '<h2 class="tutor-title">Flashcards</h2><div class="small muted">Card ' + (F.pos + 1) + " of " + F.list.length + " · say the answer to yourself, then turn the card</div>" +
      '<button class="flash mt' + (F.shown ? " flipped" : "") + '" data-act="flash-flip" aria-label="Turn the card"><span class="flash-side flash-front">' + esc(x.c.front) + "</span>" +
      (F.shown ? '<span class="flash-side flash-back">' + esc(x.c.back) + "</span>" : '<span class="tiny muted">Tap to see the answer</span>') + "</button>" +
      (F.shown ? '<div class="row wrap mt flash-rate"><button class="btn" data-act="flash-rate" data-v="0">' + I("x") + "Didn't know</button>" +
        '<button class="btn" data-act="flash-rate" data-v="1">Almost</button><button class="btn btn-primary" data-act="flash-rate" data-v="2">' + I("check") + "Knew it</button></div>" : "") +
      foot();
  }
  A.act["flash-flip"] = function () { if (!T.flash) return; T.flash.shown = !T.flash.shown; drawCards(document.getElementById("tutor-main"), '<div class="label">Step ' + (T.i + 1) + " of " + T.steps.length + "</div>"); };
  A.act["flash-rate"] = function (el) {
    var F = T.flash, x = F.list[F.pos], v = Number(el.getAttribute("data-v"));
    saveTutor(T.me, T.syl, T.t, function (tu) {
      var st = tu.cards[x.key] || { b: 0, n: 0 };
      st.n = (st.n || 0) + 1;
      st.b = v === 2 ? Math.min(BOXES.length - 1, (st.b || 0) + 1) : v === 1 ? Math.max(1, st.b || 0) : 0;
      st.d = v === 0 ? Date.now() + 60000 : Date.now() + BOXES[st.b] * DAY; // a card she didn't know comes back in this session
      tu.cards[x.key] = st;
    });
    if (v === 0) F.list.push(x); // again at the end
    F.pos++; F.shown = false;
    if (F.pos >= F.list.length) { draw(); return; }
    drawCards(document.getElementById("tutor-main"), '<div class="label">Step ' + (T.i + 1) + " of " + T.steps.length + "</div>");
    // the path on the left updates when every card has been seen
    var tu = tutorState(T.me, T.t);
    if (T.data.cards.every(function (c) { return tu.cards[c.key]; })) { var keep = T.flash; draw(); T.flash = keep; }
  };
  A.act["tutor-next"] = function () { if (T.i + 1 < T.steps.length) { T.i++; T.flash = null; T.quiz = null; draw(); } };

  /* ------------------------------------------------------------ quick check */
  function quizCards(cards) {
    return cards.filter(function (x) { var f = x.c.front.split(/\s+/).length, b = x.c.back.split(/\s+/).length; return f >= 1 && f <= 8 && b >= 3; });
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function makeQuiz() {
    var pool = quizCards(T.data.cards), terms = [];
    pool.forEach(function (x) { if (terms.indexOf(x.c.front) < 0) terms.push(x.c.front); });
    return shuffle(pool).slice(0, 8).map(function (x, i) {
      if (x.c.kind === "qa") return { x: x, type: "typed", prompt: x.c.front, answer: x.c.back };
      if (terms.length >= 4 && i % 3 !== 2) {
        var others = shuffle(terms.filter(function (t) { return t.toLowerCase() !== x.c.front.toLowerCase(); })).slice(0, 3);
        return { x: x, type: "choice", prompt: x.c.back, options: shuffle(others.concat(x.c.front)), answer: x.c.front };
      }
      return { x: x, type: "typed", prompt: x.c.back, answer: x.c.front };
    });
  }
  function same(given, want) {
    var norm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); };
    var g = norm(given), w = norm(want);
    if (!g) return false;
    if (g === w || g.replace(/s\b/g, "") === w.replace(/s\b/g, "")) return true;
    // long answers: most of the key words are there
    var ww = w.split(" ").filter(function (x) { return x.length > 3; }), gw = " " + g + " ";
    return ww.length >= 3 && ww.filter(function (x) { return gw.indexOf(" " + x.slice(0, 5)) >= 0; }).length >= ww.length * 0.6;
  }
  function drawCheck(main, head) {
    if (!T.quiz) T.quiz = { qs: makeQuiz(), done: false };
    var Q = T.quiz, tu = tutorState(T.me, T.t);
    main.innerHTML = head + '<h2 class="tutor-title">Quick check</h2><p class="muted small">' + Q.qs.length + " questions from this topic's notes. Score " + M.EXAM.topicMasteryMark + "% or more to complete the topic." +
      (tu.check ? " Your best so far: <b>" + tu.check.best + "%</b>." : "") + "</p>" +
      '<form data-submit="tutor-check" class="stack mt">' + Q.qs.map(function (q, k) {
        var res = Q.done ? (q.ok ? '<span class="badge good">' + I("check") + "Right</span>" : '<span class="badge bad">' + I("x") + "Answer: " + esc(q.answer) + "</span>") : "";
        var body = q.type === "choice"
          ? '<div class="opts">' + q.options.map(function (o, j) {
              var cls = Q.done ? (o === q.answer ? " right" : q.given === o ? " wrong" : "") : "";
              return '<label class="opt' + cls + '"><input type="radio" name="q' + k + '" value="' + esc(o) + '"' + (q.given === o ? " checked" : "") + (Q.done ? " disabled" : "") + ' style="margin-right:8px"><span class="letter">' + "ABCD"[j] + "</span><span>" + esc(o) + "</span></label>";
            }).join("") + "</div>"
          : '<input class="input" name="q' + k + '" autocomplete="off" value="' + esc(q.given || "") + '"' + (Q.done ? " disabled" : "") + ' placeholder="Your answer">';
        return '<div class="tutor-q"><div class="row spread wrap"><span class="qnum">Question ' + (k + 1) + "</span>" + res + "</div>" +
          '<div class="qprompt" style="font-size:16px">' + (q.type === "choice" ? "Which term matches this? " : q.x.c.kind === "qa" ? "" : "What is described here? ") + "<b>" + esc(q.prompt) + "</b></div>" + body + "</div>";
      }).join("") +
      (Q.done ? '<div class="callout ' + (Q.pct >= M.EXAM.topicMasteryMark ? "" : "warn") + '">' + I(Q.pct >= M.EXAM.topicMasteryMark ? "checkCircle" : "target") + "<div><b>" + Q.right + " of " + Q.qs.length + " right (" + Q.pct + "%).</b> " +
          (Q.pct >= M.EXAM.topicMasteryMark ? "Topic complete. Well done!" : "Go back over the flashcards you missed, then try again.") + "</div></div>" +
          '<div class="row wrap"><button type="button" class="btn" data-act="tutor-retry">' + I("refresh") + "New questions</button>" + (T.i + 1 < T.steps.length ? '<button type="button" class="btn btn-primary" data-act="tutor-next">Next step ' + I("right") + "</button>" : "") + "</div>"
        : '<button class="btn btn-primary" type="submit">' + I("check") + "Check my answers</button>") + "</form>" + foot();
  }
  A.act["tutor-check"] = function (form) {
    var Q = T.quiz;
    Q.qs.forEach(function (q, k) {
      var el = form.querySelector('[name="q' + k + '"]:checked') || (q.type === "typed" ? form.querySelector('[name="q' + k + '"]') : null);
      q.given = el ? el.value : "";
      q.ok = q.type === "choice" ? q.given === q.answer : same(q.given, q.answer);
    });
    Q.right = Q.qs.filter(function (q) { return q.ok; }).length; Q.pct = Math.round(Q.right / Q.qs.length * 100); Q.done = true;
    saveTutor(T.me, T.syl, T.t, function (tu) { tu.check = { best: Math.max(tu.check ? tu.check.best : 0, Q.pct), last: Q.pct, at: Date.now() }; });
    M.recordPractice(T.me.id, T.syl.id, T.t.id, Q.pct); // passing completes the topic, like practice questions
    // cards answered wrongly come back soon
    saveTutor(T.me, T.syl, T.t, function (tu) { Q.qs.forEach(function (q) { if (!q.ok) tu.cards[q.x.key] = Object.assign({}, tu.cards[q.x.key] || { n: 1 }, { b: 0, d: Date.now() }); }); });
    var keep = T.quiz; draw(); T.quiz = keep;
  };
  A.act["tutor-retry"] = function () { T.quiz = null; drawStep(); };

  /* ------------------------------------------------------------ flashcards due, across a subject */
  A.route("s/flashcards/:sid", function (p, q, me) {
    var syl = M.syllabus(p.sid);
    if (!syl || !M.syllabiForStudent(me.id).some(function (s) { return s.id === syl.id; })) return { redirect: "#/s/exam" };
    return {
      title: "Flashcards", crumbs: [{ label: "Exam mode", href: "#/s/exam" }, { label: syl.subject, href: "#/s/study/" + syl.id }, { label: "Flashcards" }],
      html: '<div id="fc-root"><div class="card">' + UI.empty("refresh", "Getting your cards…", "") + "</div></div>",
      mount: function () {
        var topics = syl.topics.filter(function (t) { return M.tutorMaterials(me.id, syl.id, t.id).length; });
        Promise.all(topics.map(function (t) { return gather(me, syl, t).then(function (d) { return { t: t, d: d }; }); })).then(function (list) {
          var root = document.getElementById("fc-root"); if (!root) return;
          var now = Date.now(), rows = list.map(function (x) {
            var tu = tutorState(me, x.t), due = 0, fresh = 0;
            x.d.cards.forEach(function (c) { var st = tu.cards[c.key]; if (!st) fresh++; else if ((st.d || 0) <= now) due++; });
            return { t: x.t, n: x.d.cards.length, due: due, fresh: fresh };
          }).filter(function (r) { return r.n; });
          root.innerHTML = rows.length ? '<p class="muted mb">Cards you haven\'t learned yet, and the ones due to be checked again. Open a topic to go through them.</p><div class="card">' + rows.map(function (r) {
            return '<a class="list-row" href="#/s/topic/' + syl.id + "/" + r.t.id + '/tutor"><div class="grow"><div class="title">' + esc(r.t.title) + '</div><div class="meta">' + r.n + " cards</div></div>" +
              (r.due ? '<span class="badge warn">' + r.due + " due</span>" : "") + (r.fresh ? '<span class="badge">' + r.fresh + " new</span>" : "") + (!r.due && !r.fresh ? '<span class="badge good">' + I("check") + "Up to date</span>" : "") + I("right") + "</a>";
          }).join("") + "</div>" : '<div class="card">' + UI.empty("book", "No flashcards yet", "Flashcards are made from the notes and flashcard sheets your teacher adds to the library.") + "</div>";
        });
      },
    };
  }, { role: "student" });
})(window.App);
