/* Sitting a past paper under exam conditions.
 *   1. Cover: the paper's own time allowed, total marks and rules (no calculator, what you will
 *      need), read from its front page when it was uploaded.
 *   2. The exam room: the question paper and a countdown that keeps running even if the app is
 *      closed. When time is up, pens down.
 *   3. Marking: the marking scheme opens, the student marks their own answers and records the mark.
 * A sitting is the student's "pd_<paper>_<student>" receipt: startedAt, endsAt, doneAt, score. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  M.paperSitting = function (sid, paperId) { return S().get("receipts", "pd_" + paperId + "_" + sid); };
  /** Finished (the marking scheme opens), not just started. */
  M.paperDone = function (sid, paperId) { var r = M.paperSitting(sid, paperId); return !!(r && r.doneAt); };

  /** The rules printed on the paper, plus the exam room's own. */
  M.paperRules = function (paper) {
    var out = [];
    if (paper.calculator === "no") out.push({ icon: "x", text: "No calculator", strong: true });
    else if (paper.calculator === "yes") out.push({ icon: "check", text: "Calculator allowed" });
    if (paper.needs) out.push({ icon: "list", text: "You will need: " + paper.needs });
    if (paper.answerRule) out.push({ icon: "info", text: paper.answerRule });
    out.push({ icon: "pen", text: "Write your answers on paper, numbered as in the question paper." });
    out.push({ icon: "lock", text: "No notes, textbooks or phones. The clock can't be paused." });
    return out;
  };
  M.paperChips = function (paper) {
    return (paper.durationMin ? '<span class="badge">' + I("clock") + A.fmtMinutes(paper.durationMin * 60) + "</span>" : "") +
      (paper.totalMarks ? '<span class="badge">' + paper.totalMarks + " marks</span>" : "") +
      (paper.calculator === "no" ? '<span class="badge warn">' + I("x") + "No calculator</span>" : paper.calculator === "yes" ? '<span class="badge">Calculator</span>' : "") +
      (A.SitQs && A.SitQs.ready(paper) ? '<span class="badge brand" data-tip="Type your answers beside each question; they are marked against the marking scheme">' + I("pen") + "Typed answers</span>" : "");
  };
  function scoreText(r) { return r && r.score != null && r.total ? r.score + "/" + r.total + " (" + Math.round((r.score / r.total) * 100) + "%)" : ""; }
  M.paperScoreText = scoreText;

  /** Sittings that were finished (not just started). */
  M.papersDone = function (paperId) {
    return S().filter("receipts", function (r) { return r.kind === "paper-done" && r.paperId === paperId && r.doneAt; });
  };

  /** Can this paper be sat with no internet? (saved by js/sync.js → A.Offline) */
  A.offlineChip = function (p) {
    if (!A.Offline) return "";
    if (A.Offline.ready(p)) return '<span class="badge good" data-tip="Saved on this device: you can sit it with no internet">' + I("download") + "On this device</span>";
    return navigator.onLine ? "" : '<span class="badge warn" data-tip="Not saved on this device yet">' + I("wifiOff") + "Needs internet</span>";
  };
  /** How many of these papers can be sat with no internet, for a list's heading. */
  function savedText(papers) {
    var saved = papers.filter(A.Offline.ready).length, on = navigator.onLine;
    if (saved === papers.length) return "all on this device";
    if (!saved) return on ? "none on this device yet" : "none on this device, so they need the internet";
    return saved + " on this device" + (on ? "" : ": you are offline, so sit those");
  }
  A.offlineSummary = function (papers) { return A.Offline && papers.length ? " · " + savedText(papers) : ""; };

  /** Test mode: the subject's past papers, grouped by exam session (newest open). */
  A.pastPaperList = function (me, papers) {
    var groups = [], by = {};
    papers.forEach(function (p) {
      var parts = String(p.title).split(" · "), key = parts.length > 1 ? parts[0] : p.year ? String(p.year) : "Other papers";
      if (!by[key]) { by[key] = { title: key, items: [] }; groups.push(by[key]); }
      by[key].items.push({ p: p, name: parts.length > 1 ? parts.slice(1).join(" · ") : p.title });
    });
    var sat = papers.map(function (p) { return M.paperSitting(me.id, p.id); }).filter(function (r) { return r && r.doneAt; });
    var marked = sat.filter(function (r) { return r.score != null && r.total; });
    var head = '<div class="section-title" data-offline-list><h2>Past papers</h2><span class="sub">Real exam papers, each with its own time allowed and rules</span></div>' +
      '<p class="small muted mb">' + papers.length + " papers · you have sat " + sat.length + (marked.length ? " · average mark " + Math.round(A.avg(marked.map(function (r) { return r.score / r.total * 100; }))) + "%" : "") +
      A.offlineSummary(papers) + "</p>";
    return head + groups.map(function (g, gi) {
      var done = g.items.filter(function (x) { return M.paperDone(me.id, x.p.id); }).length;
      return '<details class="card paper-group"' + (gi === 0 ? " open" : "") + '><summary class="card-head"><h3>' + esc(g.title) + '</h3><span class="sub">' + g.items.length + " paper" + (g.items.length === 1 ? "" : "s") + (done ? " · " + done + " sat" : "") + "</span></summary>" +
        g.items.map(function (x) {
          var r = M.paperSitting(me.id, x.p.id), running = r && r.startedAt && !r.doneAt && Date.now() < r.endsAt, ms = M.markSchemeFor(x.p.id);
          var status = running ? '<span class="badge warn">' + I("clock") + "In progress</span>" : r && r.doneAt ? (scoreText(r) ? '<span class="badge good">' + I("award") + esc(scoreText(r)) + "</span>" : '<span class="badge">Sat · not marked</span>') : "";
          return '<div class="list-row"><div class="grow"><div class="title">' + esc(x.name) + '</div><div class="row wrap mt-sm" style="gap:6px">' + M.paperChips(x.p) + A.offlineChip(x.p) + status + "</div></div>" +
            (r && r.doneAt && r.mode === "qs" ? '<a class="btn btn-sm" href="#/s/paper-result/' + x.p.id + '">' + I("key") + (r.pending ? "Finish marking" : "Your marks") + "</a>" :
              r && r.doneAt && ms && M.canSeeMarkScheme(ms, me.id) ? '<a class="btn btn-sm" href="#/s/sit/' + x.p.id + '?mark=1">' + I("key") + (r.score != null ? "Marking" : "Mark it") + "</a>" : "") +
            '<a class="btn btn-sm' + (running ? " btn-danger" : r && r.doneAt ? "" : " btn-primary") + '" href="#/s/sit/' + x.p.id + '">' + I("clock") + (running ? "Continue" : r && r.doneAt ? "Sit again" : "Sit it") + "</a></div>";
        }).join("") + "</details>";
    }).join("");
  };

  var viewer = null;
  function closeViewer() { if (viewer) { viewer.destroy(); viewer = null; } }
  function file(mat) {
    return A.Files.get(mat.fileId).then(function (rec) {
      if (rec && rec.blob) return rec.blob;
      if (!navigator.onLine || !A.Sync) return null;
      return A.Sync.fetchFile(mat.fileId, mat.offline !== false).then(function (r) { return r && r.blob; });
    });
  }
  function finish(r, timeUp) {
    var now = Date.now(), end = Math.min(now, r.endsAt || now);
    return S().put("receipts", Object.assign({}, r, { doneAt: end, timeUsedSec: Math.round((end - r.startedAt) / 1000), timeUp: !!timeUp }));
  }
  function exitFs() { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); }

  A.route("s/sit/:id", function (p, q, me) {
    var paper = S().get("materials", p.id);
    if (!paper || paper.kind !== "pastpaper" || !M.materialVisibleTo(paper, me.id)) return { redirect: "#/s/exam" };
    var c = M.cls(paper.classId), syl = M.syllabus(paper.syllabusId || (c && c.syllabusId)), b = A.Theme.get();
    var back = syl ? "#/s/test/" + syl.id : "#/s/library";
    var r = M.paperSitting(me.id, paper.id), ms = M.markSchemeFor(paper.id);
    var running = r && r.startedAt && !r.doneAt;
    if (running && Date.now() >= r.endsAt) { r = finish(r, true); running = false; }
    if (r && r.doneAt && r.mode === "qs" && !r.marks) return { redirect: "#/s/paper-result/" + paper.id }; // time ran out while away: mark it
    var top = function (middle, right) {
      return '<div class="exam-top">' + A.Theme.logoHTML() + '<div class="grow" style="min-width:0">' + middle + "</div>" + right + "</div>";
    };
    if (r && r.doneAt && r.mode === "qs" && q.mark) return { redirect: "#/s/paper-result/" + paper.id };

    /* ------------------------------------------------ 2a. typed answers, question by question */
    if (running && r.mode === "qs") {
      var room = A.SitQs.room(paper, r, me, top);
      return {
        html: room.html,
        mount: function () {
          room.mount();
          A.SitQs.tick();
          var timer = setInterval(A.SitQs.tick, 1000);
          var onVis = function () {
            var cur = M.paperSitting(me.id, paper.id);
            if (!cur || cur.doneAt) return;
            if (document.hidden) S().put("receipts", Object.assign({}, cur, { leftCount: (cur.leftCount || 0) + 1 }));
            else UI.toast("You left the exam screen. The clock kept running.", "bad");
          };
          var onUnload = function (e) { e.preventDefault(); e.returnValue = ""; };
          document.addEventListener("visibilitychange", onVis);
          window.addEventListener("beforeunload", onUnload);
          A.cleanup = function () { clearInterval(timer); A.SitQs.close(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("beforeunload", onUnload); };
        },
      };
    }

    /* ------------------------------------------------ 2b. the exam room with the PDF */
    if (running) {
      return {
        html: '<div class="exam-room sit-room">' + top('<b class="nowrap">' + esc(paper.title) + '</b><div class="small muted">' + esc(me.name) + (syl ? " · " + esc(syl.subject) : "") + "</div>",
          (paper.calculator === "no" ? '<span class="badge warn hide-sm">' + I("x") + "No calculator</span>" : "") +
          '<div class="timer" id="sit-timer" role="timer">' + I("clock") + '<span id="sit-time">--:--</span></div>' +
          '<button class="btn btn-primary" data-act="sit-finish" data-id="' + paper.id + '">' + I("check") + "Finish</button>") +
          '<div class="sit-body" id="sit-pdf"></div></div>',
        mount: function () {
          file(paper).then(function (blob) {
            var host = document.getElementById("sit-pdf"); if (!host) return;
            if (blob) viewer = A.PdfView.open(host, blob);
            else host.innerHTML = UI.empty("wifiOff", "The paper isn't on this device", "Connect to the internet once to download it.");
          });
          var tick = function () {
            var cur = M.paperSitting(me.id, paper.id), el = document.getElementById("sit-time");
            if (!cur || !el || cur.doneAt) return;
            var left = Math.max(0, Math.round((cur.endsAt - Date.now()) / 1000));
            el.textContent = A.fmtDuration(left);
            var box = document.getElementById("sit-timer");
            box.classList.toggle("warn", left <= 300 && left > 60);
            box.classList.toggle("crit", left <= 60);
            if (left === 300) UI.toast("5 minutes left");
            if (left <= 0) {
              finish(cur, true); exitFs();
              UI.modal({ title: "Time's up", body: '<p>Pens down. Stop writing now.</p><p class="muted small mt-sm">Next, mark your answers with the marking scheme.</p>', foot: [{ label: "Mark my paper", cls: "btn-primary" }] });
              A.render();
            }
          };
          tick();
          var timer = setInterval(tick, 1000);
          var onVis = function () {
            var cur = M.paperSitting(me.id, paper.id);
            if (!cur || cur.doneAt) return;
            if (document.hidden) S().put("receipts", Object.assign({}, cur, { leftCount: (cur.leftCount || 0) + 1 }));
            else UI.toast("You left the exam screen. The clock kept running.", "bad");
          };
          var onUnload = function (e) { e.preventDefault(); e.returnValue = ""; };
          document.addEventListener("visibilitychange", onVis);
          window.addEventListener("beforeunload", onUnload);
          A.cleanup = function () { clearInterval(timer); closeViewer(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("beforeunload", onUnload); };
        },
      };
    }

    /* ------------------------------------------------ 3. marking */
    if (r && r.doneAt && r.mode !== "qs" && (q.mark || r.score == null)) {
      var total = r.total || paper.totalMarks || "";
      return {
        html: '<div class="exam-room sit-room">' + top('<b>Mark your paper</b><div class="small muted">' + esc(paper.title) + " · " + (r.timeUp ? "time was up" : "finished in " + A.fmtMinutes(r.timeUsedSec || 0)) + "</div>",
          '<div class="seg hide-sm" id="sit-which"><button type="button" class="on" data-w="ms"' + (ms ? "" : " disabled") + ">Marking scheme</button><button type=\"button\" data-w=\"qp\">Question paper</button></div>" +
          '<a class="btn btn-ghost" href="' + back + '">' + I("x") + "Close</a>") +
          '<div class="sit-body" id="sit-pdf"></div>' +
          '<form class="sit-mark" data-submit="sit-save" data-id="' + paper.id + '">' + I("award") + "<b>Your mark</b>" +
          '<input class="input" name="score" inputmode="numeric" value="' + (r.score != null ? r.score : "") + '" aria-label="Your mark" style="width:90px">' +
          '<span>out of</span><input class="input" name="total" inputmode="numeric" value="' + esc(String(total)) + '" aria-label="Total marks" style="width:90px">' +
          '<button class="btn btn-primary" type="submit">' + I("check") + "Save my mark</button></form></div>",
        mount: function () {
          var show = function (which) {
            closeViewer();
            var mat = which === "ms" && ms ? ms : paper, host = document.getElementById("sit-pdf");
            file(mat).then(function (blob) {
              if (!document.getElementById("sit-pdf")) return;
              if (blob) viewer = A.PdfView.open(host, blob);
              else host.innerHTML = UI.empty("wifiOff", "Not on this device yet", "Connect to the internet once to download it.");
            });
          };
          show(ms ? "ms" : "qp");
          if (!ms) UI.toast("There's no marking scheme for this paper yet. You can still record a mark.");
          var seg = document.getElementById("sit-which");
          if (seg) seg.addEventListener("click", function (e) {
            var bt = e.target.closest("button"); if (!bt || bt.disabled) return;
            seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === bt); });
            show(bt.getAttribute("data-w"));
          });
          A.cleanup = closeViewer;
        },
      };
    }

    /* ------------------------------------------------ 1. the cover */
    var rules = M.paperRules(paper);
    var done = r && r.doneAt;
    var typed = A.SitQs && A.SitQs.ready(paper);
    if (typed) rules = rules.filter(function (x) { return !/^Write your answers on paper/.test(x.text); });
    var how = typed
      ? '<div class="callout mt">' + I("pen") + "<div><b>You'll answer on screen.</b> Each question is shown as printed, with space beside it for your answers" +
        (paper.calculator === "no" ? " and room for your working" : "") + ". When you finish, your answers are marked against the marking scheme." +
        '<div class="small mt-sm"><label class="check"><input type="checkbox" id="sit-onpaper">I\'d rather write on paper and mark it myself</label></div></div></div>'
      : '<div class="callout mt">' + I("file") + "<div><b>Write your answers on paper.</b> This paper is shown as a PDF" + (paper.scanFileId ? " (its layout doesn't suit typed answers)" : "") + ". When you finish, you mark it with the marking scheme.</div></div>";
    return {
      html: '<div class="exam-room">' + top('<b>' + esc(b.name) + '</b><div class="small muted">Examination room</div>', '<a class="btn btn-ghost" href="' + back + '">' + I("x") + "Leave</a>") +
        '<div class="exam-cover"><div class="card card-pad">' + (syl ? '<span class="badge brand">' + esc(M.syllabusTitle(syl)) + "</span>" : "") +
        '<h2 class="mt-sm" style="font-size:26px">' + esc(paper.title) + "</h2>" +
        '<div class="kv mt"><dt>Candidate</dt><dd>' + esc(me.name) + (me.studentNo ? " · " + esc(me.studentNo) : "") + "</dd>" +
        "<dt>Time allowed</dt><dd>" + (paper.durationMin ? "<b>" + A.fmtMinutes(paper.durationMin * 60) + "</b>" : '<select class="select sm" id="sit-mins">' + [45, 60, 75, 90, 105, 120, 150, 180].map(function (m) { return "<option value=\"" + m + "\"" + (m === 90 ? " selected" : "") + ">" + A.fmtMinutes(m * 60) + "</option>"; }).join("") + '</select> <span class="small muted">not printed on this paper</span>') + "</dd>" +
        (paper.totalMarks ? "<dt>Total marks</dt><dd>" + paper.totalMarks + "</dd>" : "") + "</div>" +
        '<div class="label mt">Rules</div><ul class="sit-rules">' + rules.map(function (x) { return '<li class="' + (x.strong ? "strong" : "") + '">' + I(x.icon) + "<span>" + esc(x.text) + "</span></li>"; }).join("") + "</ul>" +
        how +
        (done ? '<div class="callout mt">' + I("checkCircle") + "<div>You sat this paper on " + A.fmtDate(r.doneAt) + (scoreText(r) ? ". Your mark: <b>" + scoreText(r) + "</b>" : ". You haven't recorded a mark yet.") +
          '<div class="row wrap mt-sm"><a class="btn btn-sm" href="' + (r.mode === "qs" ? "#/s/paper-result/" + paper.id : "#/s/sit/" + paper.id + "?mark=1") + '">' + I("key") + (r.score != null ? "Look at the marking again" : "Mark it now") + "</a></div></div></div>" : "") +
        '<label class="check mt"><input type="checkbox" id="sit-fs" checked>Use full screen</label>' +
        '<button class="btn btn-primary btn-lg btn-block mt" id="sit-start" data-act="sit-start" data-id="' + paper.id + '" disabled>' + I("refresh") + "Getting the paper ready…</button>" +
        '<p class="tiny muted mt-sm">The clock starts when you press Start and keeps running even if you close the app.</p></div></div></div>',
      mount: function () {
        // make sure the paper (and its questions, for typed answers) is on this device before the clock can start
        Promise.all([file(paper), typed ? A.SitQs.scan(paper) : null]).then(function (both) {
          var btn = document.getElementById("sit-start"); if (!btn) return;
          if (typed && !both[1]) { var box = document.getElementById("sit-onpaper"); if (box) { box.checked = true; box.disabled = true; } }
          if (both[0]) { btn.disabled = false; btn.innerHTML = I("play") + (done ? "Sit it again" : "Start the exam"); }
          else btn.innerHTML = I("wifiOff") + "Connect to the internet to download this paper";
        });
      },
    };
  }, { role: "student", bare: true });

  A.act["sit-start"] = function (el) {
    var paper = S().get("materials", el.getAttribute("data-id")), me = M.me(), prev = M.paperSitting(me.id, paper.id) || {};
    var mins = paper.durationMin || Number((document.getElementById("sit-mins") || {}).value) || 90;
    var fs = document.getElementById("sit-fs");
    if (fs && fs.checked) { if (A.Screen && A.Screen.kind === "desktop") A.Screen.enter(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); }
    var history = (prev.history || []).concat(prev.doneAt ? [{ doneAt: prev.doneAt, score: prev.score, total: prev.total, mode: prev.mode || "pdf" }] : []);
    var now = Date.now(), onPaper = document.getElementById("sit-onpaper");
    var mode = A.SitQs && A.SitQs.ready(paper) && !(onPaper && onPaper.checked) ? "qs" : "pdf";
    S().put("receipts", { id: "pd_" + paper.id + "_" + me.id, kind: "paper-done", paperId: paper.id, studentId: me.id, startedAt: now, endsAt: now + mins * 60000,
      durationMin: mins, doneAt: null, score: null, total: paper.totalMarks || null, leftCount: 0, history: history.slice(-10), mode: mode, answers: {}, flags: {}, qi: 0 });
    A.render();
  };
  A.act["sit-finish"] = function (el) {
    var me = M.me(), r = M.paperSitting(me.id, el.getAttribute("data-id"));
    if (!r) return;
    var left = Math.max(0, Math.round((r.endsAt - Date.now()) / 60000));
    UI.confirm("Finish now? " + (left ? "You still have " + left + " minute" + (left === 1 ? "" : "s") + ". " : "") + "Then you mark your answers with the marking scheme.", { ok: "Finish and mark" }).then(function (ok) {
      if (!ok) return;
      finish(M.paperSitting(me.id, r.paperId), false); exitFs();
      A.render();
    });
  };
  A.act["sit-save"] = function (form) {
    var me = M.me(), id = form.getAttribute("data-id"), r = M.paperSitting(me.id, id);
    var score = Number(form.score.value), total = Number(form.total.value);
    if (!(total > 0)) { UI.toast("Enter the paper's total marks", "bad"); return; }
    if (!(score >= 0) || form.score.value === "" || score > total) { UI.toast("Enter your mark, from 0 to " + total, "bad"); return; }
    S().put("receipts", Object.assign({}, r, { score: score, total: total, markedAt: Date.now() }));
    UI.toast("Saved: " + score + "/" + total + " (" + Math.round((score / total) * 100) + "%)");
    var paper = S().get("materials", id), c = paper && M.cls(paper.classId), syl = paper && M.syllabus(paper.syllabusId || (c && c.syllabusId));
    location.hash = syl ? "#/s/test/" + syl.id : "#/s/library";
  };
})(window.App);
