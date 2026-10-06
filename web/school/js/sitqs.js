/* Sitting a past paper question by question, with typed answers marked against the scheme.
 * The paper's scan (js/paperscan.js) says where each question sits on the page, its parts and
 * marks, its answer spaces and its marking-scheme row. The exam room shows the question cut out
 * of the real paper on one side and the answer spaces on the other; multiple choice is A–D;
 * maths gets a working pad. When the paper ends, A.Marker marks what it can and the review
 * page shows every answer beside the scheme so the student can mark the rest.
 * A sitting is still the "pd_<paper>_<student>" receipt, with mode "qs", answers and marks. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var SCANS = {};

  /* ------------------------------------------------------------ loading */
  function blobOf(fileId, offline) {
    return A.Files.get(fileId).then(function (rec) {
      if (rec && rec.blob) return rec.blob;
      if (!navigator.onLine || !A.Sync || !A.Sync.fetchFile) return null;
      return A.Sync.fetchFile(fileId, offline !== false).then(function (r) { return r && r.blob; });
    });
  }
  var Q = (A.SitQs = {
    /** Can this paper be sat with typed answers? (it has a scan that matched the paper) */
    ready: function (paper) { return !!(paper && paper.scanFileId && paper.scanOk); },
    /** The scan for a paper, fetched once and kept in memory. */
    scan: function (paper) {
      if (SCANS[paper.id]) return Promise.resolve(SCANS[paper.id]);
      return blobOf(paper.scanFileId).then(function (b) {
        if (!b) return null;
        return b.text().then(function (t) {
          var s = JSON.parse(t);
          // "tick one box" parts get choice buttons (A.Marker.adapt), also for papers scanned before this existed
          s.qs.forEach(function (q) { q.units.forEach(function (u) { A.Marker.adapt(u); }); });
          SCANS[paper.id] = s; return s;
        });
      }).catch(function () { return null; });
    },
    blob: blobOf,
  });

  /* ------------------------------------------------------------ answers */
  function units(scan) { var out = []; scan.qs.forEach(function (q) { q.units.forEach(function (u) { out.push(u); }); }); return out; }
  function answered(v) { return Array.isArray(v) ? v.some(function (x) { return String(x || "").trim(); }) : v != null && String(v).trim() !== ""; }
  function qAnswered(q, r) { return q.units.some(function (u) { return answered((r.answers || {})[u.id]); }); }
  Q.paperTotal = function (paper, scan) {
    var sum = units(scan).reduce(function (s, u) { return s + (Number(u.marks) || 0); }, 0);
    return paper.totalMarks && (sum > paper.totalMarks || !sum) ? paper.totalMarks : sum || paper.totalMarks || 0;
  };
  /** Mark every part and total it. Marks the student gave themselves are kept. */
  Q.markAll = function (paper, scan, r) {
    var marks = {}, old = r.marks || {};
    units(scan).forEach(function (u) {
      var a = (r.answers || {})[u.id];
      if (old[u.id] && old[u.id].own) { marks[u.id] = old[u.id]; return; }
      var m = A.Marker.mark(u, a, paper);
      marks[u.id] = { got: m.got, max: m.max, how: m.how, note: m.note || "" };
    });
    return Object.assign({}, r, { marks: marks }, Q.totals(paper, scan, marks));
  };
  Q.totals = function (paper, scan, marks) {
    var got = 0, pending = 0, auto = 0;
    Object.keys(marks).forEach(function (k) {
      var m = marks[k];
      if (m.got == null) { pending++; return; }
      got += m.got;
      if (m.how === "auto" && !m.own) auto += m.got;
    });
    var total = Q.paperTotal(paper, scan);
    return { score: Math.min(got, total), total: total, pending: pending, autoScore: auto };
  };

  /* ------------------------------------------------------------ the exam room */
  var R = { i: 0, doc: null, pads: {}, pad: null, token: 0 };
  Q.room = function (paper, r, me, top) {
    var calc = paper.calculator === "no" ? '<span class="badge warn hide-sm">' + I("x") + "No calculator</span>" : "";
    var insert = M.insertFor ? M.insertFor(paper.id) : null;
    return {
      html: '<div class="exam-room sit-room qs-room">' + top('<b class="nowrap">' + esc(paper.title) + '</b><div class="small muted">' + esc(me.name) + '</div>',
        calc + (insert ? '<button class="btn btn-sm" data-act="qs-insert" data-id="' + insert.id + '">' + I("file") + '<span class="hide-sm">Insert</span></button>' : "") +
        '<button class="btn btn-sm" data-act="qs-whole" data-id="' + paper.id + '" data-tip="The whole question paper">' + I("book") + '<span class="hide-sm">Paper</span></button>' +
        '<div class="timer" id="sit-timer" role="timer">' + I("clock") + '<span id="sit-time">--:--</span></div>' +
        '<button class="btn btn-primary" data-act="qs-finish" data-id="' + paper.id + '">' + I("check") + '<span class="hide-sm">Finish</span></button>') +
        '<nav class="qs-nav" id="qs-nav" aria-label="Questions"></nav>' +
        '<div class="qs-body"><section class="qs-view" id="qs-view"><div class="pdf-msg">' + I("refresh") + " Opening the paper…</div></section>" +
        '<aside class="qs-panel" id="qs-panel"></aside></div></div>',
      mount: function () {
        R.paper = paper; R.me = me; R.i = r.qi || 0; R.pads = readPads(r.id);
        Q.scan(paper).then(function (scan) {
          R.scan = scan;
          if (!scan) { document.getElementById("qs-view").innerHTML = UI.empty("alert", "This paper's questions aren't on this device", "Connect to the internet once, then open it again."); return; }
          return blobOf(paper.fileId).then(function (blob) { return blob ? A.PdfView.doc(blob) : null; }).then(function (doc) {
            R.doc = doc;
            drawAll();
          });
        });
      },
    };
  };
  function cur() { return M.paperSitting(R.me.id, R.paper.id); }
  function save(patch) { var r = cur(); if (r) S().put("receipts", Object.assign({}, r, patch)); }
  function drawAll() { drawNav(); drawQuestion(); drawPanel(); }
  function drawNav() {
    var r = cur(), nav = document.getElementById("qs-nav");
    if (!r || !nav || !R.scan) return;
    var done = 0;
    nav.innerHTML = R.scan.qs.map(function (q, i) {
      var has = qAnswered(q, r); if (has) done++;
      return '<button class="' + (has ? "ans " : "") + ((r.flags || {})[q.n] ? "flag " : "") + (i === R.i ? "cur" : "") + '" data-act="qs-go" data-i="' + i + '" aria-label="Question ' + q.n + (has ? ", answered" : "") + '">' + q.n + "</button>";
    }).join("") + '<span class="qs-count small muted">' + done + " of " + R.scan.qs.length + " answered</span>";
    var b = nav.querySelector(".cur"); if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "center" });
  }
  function drawQuestion() {
    var view = document.getElementById("qs-view"), q = R.scan && R.scan.qs[R.i];
    if (!view || !q) return;
    var token = ++R.token;
    view.querySelectorAll("canvas").forEach(function (c) { c.width = 0; c.height = 0; });
    view.innerHTML = '<div class="qs-paper" id="qs-paper"></div>';
    view.scrollTop = 0;
    if (!R.doc) { view.innerHTML = UI.empty("wifiOff", "The paper isn't on this device", "Connect to the internet once to download it."); return; }
    var paperEl = view.querySelector("#qs-paper");
    var width = Math.min(860, Math.max(280, view.clientWidth - 32));
    q.clips.reduce(function (p, c) {
      return p.then(function () {
        if (token !== R.token) return;
        return A.PdfView.clip(R.doc, c, width).then(function (cv) {
          if (token !== R.token) { cv.width = 0; return; }
          cv.dataset.page = c[0];
          paperEl.appendChild(cv);
        });
      });
    }, Promise.resolve()).catch(function () { paperEl.innerHTML = '<div class="pdf-msg">' + I("alert") + " This question can't be shown. Use Paper at the top to see the whole paper.</div>"; });
  }
  /** Scroll the question to where a part starts. */
  function showPart(u) {
    var view = document.getElementById("qs-view"); if (!view || !u.at) return;
    var cvs = view.querySelectorAll("canvas");
    for (var k = 0; k < cvs.length; k++) {
      var c = cvs[k];
      if (Number(c.dataset.page) === u.at[0] && u.at[1] >= Number(c.dataset.top) - 2) {
        var y = c.offsetTop + (u.at[1] - Number(c.dataset.top)) * Number(c.dataset.scale) - 12;
        if (y > view.scrollTop + view.clientHeight - 80 || y < view.scrollTop) view.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
        return;
      }
    }
  }
  function isMaths() { return /^0580|^0620|^0625|^0653/.test(R.paper.fileName || "") || R.paper.calculator === "no"; }
  function drawPanel() {
    var panel = document.getElementById("qs-panel"), r = cur(), q = R.scan && R.scan.qs[R.i];
    if (!panel || !q || !r) return;
    if (R.pad) { R.pad.destroy(); R.pad = null; }
    var ans = r.answers || {}, marks = q.units.reduce(function (s, u) { return s + (Number(u.marks) || 0); }, 0);
    var mcq = q.units.length === 1 && q.units[0].input === "choice";
    var html = '<div class="qs-head"><div><div class="qnum">Question ' + q.n + " of " + R.scan.qs[R.scan.qs.length - 1].n + "</div>" +
      (marks ? '<div class="small muted">' + marks + " mark" + (marks === 1 ? "" : "s") + (q.choice ? " · you choose which questions to answer" : "") + "</div>" : "") + "</div>" +
      '<button class="btn btn-sm ' + ((r.flags || {})[q.n] ? "btn-accent" : "btn-ghost") + '" data-act="qs-flag">' + I("flag") + ((r.flags || {})[q.n] ? "Flagged" : "Flag") + "</button></div>";
    html += q.units.map(function (u) { return unitHtml(u, ans[u.id], mcq); }).join("");
    var numeric = !mcq && isMaths() && q.units.some(function (u) { return u.input === "boxes"; });
    if (numeric) html += '<details class="qs-work"' + (R.pads[q.n] && R.pads[q.n].length ? " open" : "") + '><summary>' + I("pen") + "Working space</summary><div id=\"qs-pad\"></div></details>";
    html += '<div class="qs-foot"><button class="btn" data-act="qs-move" data-d="-1"' + (R.i === 0 ? " disabled" : "") + ">" + I("left") + "Previous</button>" +
      (R.i + 1 < R.scan.qs.length ? '<button class="btn btn-primary" data-act="qs-move" data-d="1">Next ' + I("right") + "</button>" : '<button class="btn btn-primary" data-act="qs-finish">' + I("check") + "Finish</button>") + "</div>";
    panel.innerHTML = html;
    panel.scrollTop = 0;
    var det = panel.querySelector(".qs-work");
    if (det) {
      var mountPad = function () { if (det.open && !R.pad) R.pad = A.Pad.create(document.getElementById("qs-pad"), R.pads[q.n] || (R.pads[q.n] = []), function () { writePads(r.id, R.pads); }); };
      det.addEventListener("toggle", mountPad); mountPad();
    }
  }
  function unitHtml(u, a, mcq) {
    var head = '<div class="qs-ulabel"><b>' + esc(u.label || (mcq ? "" : "Answer")) + "</b>" + (u.marks ? '<span class="small muted">[' + u.marks + "]</span>" : "") + "</div>";
    if (u.input === "choice") {
      var picked = String(a || "").split(",").filter(Boolean), opts = u.options || ["A", "B", "C", "D"];
      return '<div class="qs-unit" data-u="' + esc(u.id) + '">' + (mcq ? "" : head) + (u.multi ? '<p class="small muted">Choose ' + u.multi + ".</p>" : "") +
        '<div class="opts qs-abcd" style="grid-template-columns:repeat(' + Math.min(opts.length, 4) + ',1fr)" role="' + (u.multi ? "group" : "radiogroup") + '" aria-label="Your answer">' + opts.map(function (L) {
          var on = picked.indexOf(L) >= 0;
          return '<button type="button" class="opt' + (on ? " sel" : "") + '" data-act="qs-pick" data-u="' + esc(u.id) + '" data-v="' + L + '" role="' + (u.multi ? "checkbox" : "radio") + '" aria-checked="' + on + '"><span class="letter">' + L + "</span></button>";
        }).join("") + "</div></div>";
    }
    var vals = Array.isArray(a) ? a : [a == null ? "" : a];
    var body = "";
    if (u.input === "boxes" && u.boxes && u.boxes.length) {
      body = u.boxes.map(function (b, k) {
        var v = esc(vals[k] || ""), label = b.label ? '<span class="qs-blabel">' + esc(b.label.replace(/___/g, "…")) + "</span>" : "";
        var field = b.lines >= 2 ? '<textarea class="textarea" rows="' + Math.min(10, Math.max(2, b.lines)) + '" data-input="qs-in" data-u="' + esc(u.id) + '" data-b="' + k + '">' + v + "</textarea>"
          : '<input class="input" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + v + '" data-input="qs-in" data-u="' + esc(u.id) + '" data-b="' + k + '">';
        return '<label class="qs-box">' + label + '<span class="qs-field">' + field + (b.unit ? '<span class="qs-unit-suffix">' + esc(b.unit) + "</span>" : "") + "</span></label>";
      }).join("");
    } else if (u.input === "essay") {
      body = '<textarea class="textarea qs-essay" rows="14" data-input="qs-in" data-u="' + esc(u.id) + '" data-b="0" placeholder="Write your answer here">' + esc(vals[0] || "") + '</textarea><div class="tiny muted qs-words">' + wordCount(vals[0]) + " words</div>";
    } else {
      body = '<p class="small muted qs-worknote">' + I("pen") + (u.table ? "Complete the table on paper" : "This part is answered on the diagram, a grid or a table") + ". Do it on paper; you'll compare it with the marking scheme at the end. If the answer is a number, word or letter, type it here and it is checked for you.</p>" +
        '<textarea class="textarea" rows="2" data-input="qs-in" data-u="' + esc(u.id) + '" data-b="0" placeholder="Your answer (optional)">' + esc(vals[0] || "") + "</textarea>";
    }
    return '<div class="qs-unit" data-u="' + esc(u.id) + '">' + head + body + "</div>";
  }
  function wordCount(t) { return (String(t || "").match(/\S+/g) || []).length; }
  function findUnit(id) { var f = null; R.scan.qs.forEach(function (q) { q.units.forEach(function (u) { if (u.id === id) f = u; }); }); return f; }
  var pending = {};
  var flush = A.debounce(function () {
    var r = cur(); if (!r) return;
    var answers = Object.assign({}, r.answers);
    Object.keys(pending).forEach(function (k) { answers[k] = pending[k]; });
    pending = {};
    save({ answers: answers });
    drawNav();
  }, 350);
  function collect(uid) {
    var els = document.querySelectorAll('#qs-panel [data-u="' + CSS.escape(uid) + '"][data-input]');
    var u = findUnit(uid), vals = [];
    els.forEach(function (el) { vals[Number(el.getAttribute("data-b"))] = el.value; });
    pending[uid] = u && u.input === "boxes" ? vals : vals[0] || "";
  }
  function flushNow() {
    document.querySelectorAll("#qs-panel [data-input=qs-in]").forEach(function (el) { collect(el.getAttribute("data-u")); });
    if (Object.keys(pending).length) {
      var r = cur(), answers = Object.assign({}, r.answers);
      Object.keys(pending).forEach(function (k) { answers[k] = pending[k]; });
      pending = {};
      save({ answers: answers });
    }
  }
  A.act["qs-in"] = function (el) {
    collect(el.getAttribute("data-u"));
    var wc = el.parentNode.querySelector(".qs-words"); if (wc) wc.textContent = wordCount(el.value) + " words";
    flush();
  };
  document.addEventListener("focusin", function (e) {
    var el = e.target.closest && e.target.closest("#qs-panel [data-u]");
    if (el && R.scan) { var u = findUnit(el.getAttribute("data-u")); if (u) showPart(u); }
  });
  A.act["qs-pick"] = function (el) {
    var r = cur(), answers = Object.assign({}, r.answers), uid = el.getAttribute("data-u"), v = el.getAttribute("data-v"), u = findUnit(uid);
    if (u && u.multi) {
      // "tick two boxes": toggle each letter
      var set = String(answers[uid] || "").split(",").filter(Boolean);
      set = set.indexOf(v) >= 0 ? set.filter(function (x) { return x !== v; }) : set.concat(v);
      answers[uid] = set.sort().join(",");
    } else answers[uid] = answers[uid] === v ? "" : v;
    save({ answers: answers });
    var now = String(answers[uid] || "").split(",");
    el.parentNode.querySelectorAll(".opt").forEach(function (o) { var on = now.indexOf(o.getAttribute("data-v")) >= 0; o.classList.toggle("sel", on); o.setAttribute("aria-checked", on); });
    drawNav();
    // a multiple-choice question on its own: straight on to the next question
    var q = R.scan.qs[R.i];
    if (answers[uid] && !(u && u.multi) && q.units.length === 1 && R.i + 1 < R.scan.qs.length) setTimeout(function () { if (cur() && !cur().doneAt) go(R.i + 1); }, 280);
  };
  function go(i) {
    flushNow();
    R.i = A.clamp(i, 0, R.scan.qs.length - 1);
    save({ qi: R.i });
    drawAll();
  }
  A.act["qs-go"] = function (el) { go(Number(el.getAttribute("data-i"))); };
  A.act["qs-move"] = function (el) { go(R.i + Number(el.getAttribute("data-d"))); };
  A.act["qs-flag"] = function () {
    var r = cur(), q = R.scan.qs[R.i], flags = Object.assign({}, r.flags);
    flags[q.n] = !flags[q.n];
    save({ flags: flags });
    drawNav(); drawPanel();
  };
  A.act["qs-whole"] = function (el) { openPdf(S().get("materials", el.getAttribute("data-id")), "The question paper"); };
  A.act["qs-insert"] = function (el) { openPdf(S().get("materials", el.getAttribute("data-id")), "Insert"); };
  function openPdf(mat, title) {
    if (!mat) return;
    blobOf(mat.fileId).then(function (blob) {
      if (!blob) { UI.toast("It isn't on this device yet. Connect to the internet once.", "bad"); return; }
      var pv = null;
      UI.modal({ title: title, sub: esc(mat.title), size: "full", flush: true, body: '<div class="pdf-host"></div>',
        foot: [{ label: "Back to the question", cls: "btn-primary" }],
        onMount: function (m) { pv = A.PdfView.open(m.querySelector(".pdf-host"), blob); },
        onClose: function () { if (pv) pv.destroy(); } });
    });
  }
  A.act["qs-finish"] = function () {
    flushNow();
    var r = cur(), blank = R.scan.qs.filter(function (q) { return !qAnswered(q, r); }).length;
    var left = Math.max(0, Math.round((r.endsAt - Date.now()) / 60000));
    UI.modal({
      title: "Finish the paper?", noFocus: true,
      body: "<p>You have answered <b>" + (R.scan.qs.length - blank) + " of " + R.scan.qs.length + "</b> questions." + (left ? " You still have " + left + " minute" + (left === 1 ? "" : "s") + "." : "") + "</p>" +
        (blank ? '<div class="callout warn mt">' + I("alert") + "<div>" + blank + " question" + (blank > 1 ? "s have" : " has") + " no answer.</div></div>" : "") +
        '<p class="small muted mt-sm">Your answers are then marked against the marking scheme.</p>',
      foot: [{ label: "Keep working" }, { label: "Finish and mark", cls: "btn-primary", onClick: function () { Q.finish(false); } }],
    });
  };
  /** End the sitting (the student finished, or time ran out) and mark it. */
  Q.finish = function (timeUp) {
    flushNow();
    var r = cur(); if (!r || r.doneAt) return;
    var now = Date.now(), end = Math.min(now, r.endsAt || now);
    var done = Object.assign({}, r, { doneAt: end, timeUsedSec: Math.round((end - r.startedAt) / 1000), timeUp: !!timeUp });
    if (R.scan) done = Q.markAll(R.paper, R.scan, done);
    S().put("receipts", done);
    Q.close();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    if (timeUp) UI.toast("Time's up. Pens down: your paper has been marked.");
    location.hash = "#/s/paper-result/" + R.paper.id;
  };
  Q.close = function () {
    R.token++;
    if (R.pad) { R.pad.destroy(); R.pad = null; }
    if (R.doc) { R.doc.destroy(); R.doc = null; }
  };
  Q.tick = function () {
    var r = cur(), el = document.getElementById("sit-time");
    if (!r || !el || r.doneAt) return;
    var left = Math.max(0, Math.round((r.endsAt - Date.now()) / 1000));
    el.textContent = A.fmtDuration(left);
    var box = document.getElementById("sit-timer");
    box.classList.toggle("warn", left <= 300 && left > 60);
    box.classList.toggle("crit", left <= 60);
    if (left === 300) UI.toast("5 minutes left");
    if (left <= 0) Q.finish(true);
  };
  // working pads stay on this device only (they can be big)
  function readPads(id) { try { return JSON.parse(localStorage.getItem("sca-pad-" + id) || "{}"); } catch (e) { return {}; } }
  function writePads(id, pads) { try { localStorage.setItem("sca-pad-" + id, JSON.stringify(pads)); } catch (e) { /* full: keep in memory */ } }

  /* ------------------------------------------------------------ AI marking (optional)
     Written answers the app can't check are sent to cloud/functions/mark with their question and
     scheme row; each comes back with a mark and a line of feedback. The student can still change it. */
  M.aiMarking = function () { return !!(A.AI && A.AI.where() && (S().get("settings", "ai") || {}).enabled); }; // online, or through the school hub
  function answerText(u, a) {
    if (Array.isArray(a) && u.boxes && u.boxes.length) return u.boxes.map(function (b, k) { return a[k] && String(a[k]).trim() ? (b.label ? b.label.replace(/___/g, "…") + ": " : "") + a[k] + (b.unit ? " " + b.unit : "") : ""; }).filter(Boolean).join("\n");
    return Array.isArray(a) ? a.join("\n") : String(a || "");
  }
  /** Which parts AI marking would take: answered, written, not already settled. */
  Q.aiItems = function (scan, r) {
    var marks = r.marks || {}, ans = r.answers || {};
    return units(scan).filter(function (u) {
      var m = marks[u.id];
      return u.input !== "choice" && u.input !== "work" && answered(ans[u.id]) && m && !m.own && (m.how === "self" || m.how === "keywords");
    });
  };
  Q.aiMark = function (paper, scan, sid) {
    var r = M.paperSitting(sid, paper.id), todo = Q.aiItems(scan, r);
    if (!todo.length) return Promise.resolve(0);
    var c = M.cls(paper.classId), syl = M.syllabus(paper.syllabusId || (c && c.syllabusId));
    var title = (syl ? M.syllabusTitle(syl) + " " : "") + paper.title, done = 0;
    var batches = [];
    for (var i = 0; i < todo.length; i += 20) batches.push(todo.slice(i, i + 20));
    return batches.reduce(function (p, batch) {
      return p.then(function () {
        var cur = M.paperSitting(sid, paper.id);
        return A.AI.mark({ paper: title, items: batch.map(function (u) {
          return { id: u.id, question: u.text || "", scheme: u.ms ? u.ms.answer : "(No row for this part in the marking scheme: mark it as a Cambridge examiner would, using the paper's level descriptors.)",
            guide: u.ms ? u.ms.guide : "", marks: u.marks, answer: answerText(u, (cur.answers || {})[u.id]) };
        }) }).then(function (res) {
          var now = M.paperSitting(sid, paper.id), marks = Object.assign({}, now.marks);
          (res.results || []).forEach(function (x) {
            if (!marks[x.id] || marks[x.id].own) return;
            marks[x.id] = Object.assign({}, marks[x.id], { got: x.marks, how: "ai", note: x.feedback });
            done++;
          });
          S().put("receipts", Object.assign({}, now, { marks: marks, aiAt: Date.now() }, Q.totals(paper, scan, marks)));
        });
      });
    }, Promise.resolve()).then(function () { return done; });
  };

  /* ------------------------------------------------------------ the results */
  var V = { filter: "all", doc: null, msDoc: null };
  A.route("s/paper-result/:id", function (p, q, me) {
    var paper = S().get("materials", p.id), r = paper && M.paperSitting(me.id, paper.id);
    if (!paper || !r || !r.doneAt) return { redirect: "#/s/exam" };
    if (r.mode !== "qs") return { redirect: "#/s/sit/" + paper.id + "?mark=1" };
    var c = M.cls(paper.classId), syl = M.syllabus(paper.syllabusId || (c && c.syllabusId));
    return {
      title: "Your marks", crumbs: [{ label: "Exam mode", href: "#/s/exam" }, syl ? { label: syl.subject, href: "#/s/test/" + syl.id } : null, { label: "Your marks" }].filter(Boolean),
      html: '<div id="pr-root"><div class="card">' + UI.empty("refresh", "Opening your marks…", "") + "</div></div>",
      mount: function () {
        V.paper = paper; V.me = me; V.ai = null; V.filter = "all";
        Q.scan(paper).then(function (scan) {
          V.scan = scan;
          var root = document.getElementById("pr-root");
          if (!root) return;
          if (!scan) { root.innerHTML = '<div class="card">' + UI.empty("wifiOff", "Your marks need the paper's questions", "Connect to the internet once, then open this again.") + "</div>"; return; }
          var cur2 = M.paperSitting(me.id, paper.id);
          if (!cur2.marks) { cur2 = Q.markAll(paper, scan, cur2); S().put("receipts", cur2); }
          drawResult();
          // written answers: AI marking, once, when it is on and there is internet
          if (M.aiMarking() && !cur2.aiAt && navigator.onLine && Q.aiItems(scan, cur2).length) {
            V.ai = "running"; drawResult();
            Q.aiMark(paper, scan, me.id).then(function (n) { V.ai = n ? "done" : null; V.aiN = n; })
              .catch(function (e) { V.ai = "failed"; V.aiErr = e.message || String(e); })
              .then(function () { if (document.getElementById("pr-root")) drawResult(); });
          }
        });
        A.cleanup = function () { if (V.doc) { V.doc.destroy(); V.doc = null; } if (V.msDoc) { V.msDoc.destroy(); V.msDoc = null; } };
      },
    };
  }, { role: "student" });

  function drawResult() {
    var root = document.getElementById("pr-root"); if (!root) return;
    var paper = V.paper, scan = V.scan, r = M.paperSitting(V.me.id, paper.id), marks = r.marks || {};
    var t = Q.totals(paper, scan, marks), pct = t.total ? Math.round((t.score / t.total) * 100) : 0;
    var c = M.cls(paper.classId), syl = M.syllabus(paper.syllabusId || (c && c.syllabusId));
    var toMark = [], wrong = 0, right = 0;
    units(scan).forEach(function (u) { var m = marks[u.id] || {}; if (m.got == null) toMark.push(u.id); else if (m.got === m.max && m.max) right++; else if (m.how !== "blank" || m.got < m.max) wrong++; });
    var html = "";
    if (r.timeUp) html += '<div class="callout warn mb">' + I("clock") + "<div><b>Time ran out</b>, so the paper ended by itself.</div></div>";
    html += '<div class="card card-pad"><div class="score-hero"><div class="grade-badge"><span>' + pct + '<small>%</small></span></div><div class="grow"><div class="small muted">' + esc(syl ? M.syllabusTitle(syl) : "") + '</div><h2 style="font-size:22px">' + esc(paper.title) + "</h2>" +
      '<div class="row wrap mt-sm"><span style="font-size:22px;font-weight:800" class="tnum">' + t.score + " / " + t.total + "</span>" +
      (t.pending ? '<span class="badge warn">' + I("pen") + t.pending + " part" + (t.pending === 1 ? "" : "s") + " for you to mark</span>" : '<span class="badge good">' + I("checkCircle") + "All marked</span>") + "</div>" +
      '<p class="small muted mt-sm">Finished ' + A.fmtDateTime(r.doneAt) + " · time used " + A.fmtMinutes(r.timeUsedSec || 0) + (r.durationMin ? " of " + A.fmtMinutes(r.durationMin * 60) : "") + " · " + t.autoScore + " marks checked automatically</p></div>" +
      UI.ring(pct, { size: 104, stroke: 10, tone: M.tone(pct), label: "Score" }) + "</div></div>";
    if (V.ai === "running") html += '<div class="callout mt">' + I("refresh") + "<div><b>Marking your written answers with AI…</b> This takes a moment. You can look through your answers meanwhile.</div></div>";
    if (V.ai === "done") html += '<div class="callout mt">' + I("bulb") + "<div><b>AI marked " + V.aiN + " written answer" + (V.aiN === 1 ? "" : "s") + "</b> against the marking scheme. Read the feedback under each one; if you disagree, change the mark.</div></div>";
    if (V.ai === "failed") html += '<div class="callout warn mt">' + I("alert") + "<div><b>AI marking didn't work:</b> " + esc(V.aiErr || "") + ' <button class="btn btn-sm" data-act="pr-ai">Try again</button></div></div>';
    if (!V.ai && M.aiMarking() && Q.aiItems(scan, r).length) html += '<div class="callout mt">' + I("bulb") + '<div class="grow">' + Q.aiItems(scan, r).length + ' written answer(s) can be marked by AI against the marking scheme.</div><button class="btn btn-sm btn-primary" data-act="pr-ai">' + I("bulb") + "Mark with AI</button></div>";
    if (t.pending) html += '<div class="callout mt">' + I("pen") + "<div><b>Mark the rest yourself.</b> Some answers (essays, diagrams and working) can't be checked automatically. For each one, compare your answer with the marking scheme and choose your mark. Your score updates as you go.</div></div>";
    html += '<div class="row wrap mt" style="gap:8px">' + [["all", "All questions"], ["mark", "To mark (" + toMark.length + ")"], ["wrong", "Lost marks"], ["right", "Full marks"]].map(function (f) {
      return '<button class="btn btn-sm' + (V.filter === f[0] ? " btn-primary" : "") + '" data-act="pr-filter" data-f="' + f[0] + '">' + f[1] + "</button>";
    }).join("") + '<span class="grow"></span><a class="btn btn-sm" href="#/s/sit/' + paper.id + '">' + I("refresh") + "Sit it again</a></div>";
    html += '<div class="stack mt">';
    scan.qs.forEach(function (q) {
      var us = q.units.filter(function (u) {
        var m = marks[u.id] || {};
        return V.filter === "all" || (V.filter === "mark" && m.got == null) || (V.filter === "wrong" && m.got != null && m.got < m.max) || (V.filter === "right" && m.got != null && m.got === m.max && m.max);
      });
      if (!us.length) return;
      var got = q.units.reduce(function (s, u) { var m = marks[u.id] || {}; return s + (m.got || 0); }, 0);
      html += '<div class="card"><div class="card-head"><h3>Question ' + q.n + '</h3><span class="sub tnum">' + got + " / " + (q.marks || "–") + '</span><span class="grow"></span>' +
        '<button class="btn btn-sm btn-ghost" data-act="pr-question" data-q="' + q.n + '">' + I("eye") + "Show the question</button></div>" +
        '<div class="pr-qclips" id="prq-' + q.n + '"></div>' +
        us.map(function (u) { return unitResult(u, (r.answers || {})[u.id], marks[u.id] || {}); }).join("") + "</div>";
    });
    html += "</div>";
    html += '<div class="row wrap mt-lg">' + (syl ? '<a class="btn btn-primary" href="#/s/test/' + syl.id + '">' + I("back") + "Back to test mode</a>" : "") + "</div>";
    root.innerHTML = html;
  }
  function yourAnswer(u, a) {
    if (!answered(a)) return '<span class="muted">No answer</span>';
    if (u.input === "choice") return "<b>" + esc(String(a).split(",").join(", ")) + "</b>";
    if (Array.isArray(a) && u.boxes && u.boxes.length) {
      return u.boxes.map(function (b, k) { return a[k] && String(a[k]).trim() ? (b.label ? '<span class="muted">' + esc(b.label.replace(/___/g, "…")) + "</span> " : "") + esc(a[k]) + (b.unit ? " " + esc(b.unit) : "") : ""; }).filter(Boolean).join("<br>");
    }
    return '<div style="white-space:pre-wrap">' + esc(Array.isArray(a) ? a.join("\n") : a) + "</div>";
  }
  function unitResult(u, a, m) {
    var badge = m.how === "blank" ? '<span class="badge">No answer</span>'
      : m.got == null ? '<span class="badge warn">' + I("pen") + "Mark it yourself</span>"
      : m.own ? '<span class="badge brand">You marked it</span>'
      : m.how === "auto" ? (m.got === m.max ? '<span class="badge good">' + I("check") + "Correct</span>" : '<span class="badge bad">' + I("x") + "Not correct</span>")
      : m.how === "ai" ? '<span class="badge brand">' + I("bulb") + "Marked by AI</span>"
      : '<span class="badge">' + I("bulb") + "Suggested mark</span>";
    var max = Number(u.marks) || Number(m.max) || 0;
    var buttons = max ? '<div class="row wrap pr-give"><span class="small bold">' + (m.got == null ? "Your mark:" : "Change the mark:") + "</span>" + Array.apply(null, { length: Math.min(max, 25) + 1 }).map(function (_, v) {
      return '<button class="btn btn-sm' + (m.got === v ? " btn-primary" : "") + '" data-act="pr-give" data-u="' + esc(u.id) + '" data-v="' + v + '">' + v + "</button>";
    }).join("") + "</div>" : "";
    var ms = u.ms ? '<div class="pr-ms">' + (u.ms.answer ? '<div class="small" style="white-space:pre-wrap">' + esc(u.ms.answer) + "</div>" : "") +
      (u.ms.guide ? '<div class="tiny muted mt-sm" style="white-space:pre-wrap">' + esc(u.ms.guide) + "</div>" : "") +
      (u.ms.clips && u.ms.clips.length ? '<button class="btn btn-sm btn-ghost mt-sm" data-act="pr-scheme" data-u="' + esc(u.id) + '">' + I("key") + "Show it as printed</button><div class=\"pr-msclip\"></div>" : "") + "</div>"
      : '<p class="small muted">This part has no row of its own in the marking scheme. Open the marking scheme from Test mode to check it.</p>';
    return '<div class="pr-unit"><div class="row spread wrap"><b>' + esc(u.id) + '</b><div class="row wrap">' + badge + '<b class="tnum small">' + (m.got == null ? "–" : m.got) + " / " + max + "</b></div></div>" +
      '<div class="grid g-2 mt-sm"><div><div class="label">Your answer</div><div class="small">' + yourAnswer(u, a) + "</div></div>" +
      '<div><div class="label">Marking scheme</div>' + ms + "</div></div>" +
      (m.note ? '<p class="tiny muted mt-sm">' + esc(m.note) + "</p>" : "") + (m.how === "blank" ? "" : buttons) + "</div>";
  }
  A.act["pr-filter"] = function (el) { V.filter = el.getAttribute("data-f"); drawResult(); };
  A.act["pr-ai"] = function () {
    if (!navigator.onLine) { UI.toast("AI marking needs the internet", "bad"); return; }
    V.ai = "running"; drawResult();
    Q.aiMark(V.paper, V.scan, V.me.id).then(function (n) { V.ai = n ? "done" : null; V.aiN = n; })
      .catch(function (e) { V.ai = "failed"; V.aiErr = e.message || String(e); })
      .then(function () { if (document.getElementById("pr-root")) drawResult(); });
  };
  A.act["pr-give"] = function (el) {
    var r = M.paperSitting(V.me.id, V.paper.id), marks = Object.assign({}, r.marks), uid = el.getAttribute("data-u");
    marks[uid] = Object.assign({}, marks[uid], { got: Number(el.getAttribute("data-v")), own: true });
    S().put("receipts", Object.assign({}, r, { marks: marks, markedAt: Date.now() }, Q.totals(V.paper, V.scan, marks)));
    var y = window.scrollY; drawResult(); window.scrollTo(0, y);
  };
  A.act["pr-question"] = function (el) {
    var n = Number(el.getAttribute("data-q")), host = document.getElementById("prq-" + n), q = V.scan.qs.find(function (x) { return x.n === n; });
    if (!host || !q) return;
    if (host.childNodes.length) { host.innerHTML = ""; return; }
    host.innerHTML = '<div class="pdf-msg">' + I("refresh") + " Opening…</div>";
    (V.doc ? Promise.resolve(V.doc) : blobOf(V.paper.fileId).then(function (b) { return b ? A.PdfView.doc(b) : null; }).then(function (d) { V.doc = d; return d; })).then(function (doc) {
      if (!doc) { host.innerHTML = '<p class="small muted">The paper isn\'t on this device.</p>'; return; }
      host.innerHTML = "";
      var w = Math.min(760, host.clientWidth || 600);
      return q.clips.reduce(function (p, c) { return p.then(function () { return A.PdfView.clip(doc, c, w).then(function (cv) { host.appendChild(cv); }); }); }, Promise.resolve());
    });
  };
  A.act["pr-scheme"] = function (el) {
    var uid = el.getAttribute("data-u"), u = units(V.scan).find(function (x) { return x.id === uid; }), host = el.nextElementSibling;
    if (!u || !host) return;
    if (host.childNodes.length) { host.innerHTML = ""; return; }
    var ms = M.markSchemeFor(V.paper.id);
    if (!ms) return;
    host.innerHTML = '<div class="pdf-msg">' + I("refresh") + " Opening…</div>";
    (V.msDoc ? Promise.resolve(V.msDoc) : blobOf(ms.fileId).then(function (b) { return b ? A.PdfView.doc(b) : null; }).then(function (d) { V.msDoc = d; return d; })).then(function (doc) {
      if (!doc) { host.innerHTML = '<p class="small muted">The marking scheme isn\'t on this device.</p>'; return; }
      host.innerHTML = "";
      var w = Math.min(700, host.parentNode.clientWidth || 420);
      return u.ms.clips.reduce(function (p, c) { return p.then(function () { return A.PdfView.clip(doc, c, w).then(function (cv) { host.appendChild(cv); }); }); }, Promise.resolve());
    });
  };
})(window.App);
