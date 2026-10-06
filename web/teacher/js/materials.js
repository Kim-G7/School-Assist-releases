/* Learning materials: PDFs, textbooks, past papers, videos, audio, images and written handouts.
 * Everything is stored inside the app, so students never have to follow outside links:
 *   - "Can be saved offline" (default): the file is kept on the student's device.
 *   - "Online only": students open it from the school server while connected. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  /** neutralPast: for teachers, or work already handed in, a past date is not "overdue". */
  A.dueBadge = function (ts, neutralPast) {
    var d = A.dueLabel(ts);
    if (neutralPast && ts && ts < Date.now()) d = { text: "Was due " + A.fmtDateTime(ts), tone: "" };
    return '<span class="badge ' + d.tone + '">' + I("clock") + esc(d.text) + "</span>";
  };

  M.MAT_KINDS = {
    pdf: { label: "Document", icon: "file", accept: ".pdf,.txt,image/*" },
    textbook: { label: "Textbook", icon: "library", accept: ".pdf" },
    pastpaper: { label: "Exam paper", icon: "award", accept: ".pdf,image/*" },
    markscheme: { label: "Marking scheme", icon: "key", accept: ".pdf,image/*" },
    insert: { label: "Insert", icon: "file", accept: ".pdf,image/*" },
    video: { label: "Video", icon: "video", accept: "video/*" },
    audio: { label: "Audio", icon: "audio", accept: "audio/*" },
    image: { label: "Picture", icon: "image", accept: "image/*" },
    note: { label: "Written handout", icon: "pen" },
    link: { label: "Web link (old)", icon: "link" },
  };

  /** What a library item is for. Students filter the library by these, and by tags. */
  M.MAT_CATS = { book: "Books", notes: "Notes", summary: "Summary notes", flashcards: "Flashcards", revision: "Revision", worksheet: "Worksheets", other: "Other" };
  /** What the tutor can teach from: PDFs of notes, summaries, flashcards, revision, worksheets and textbooks. */
  M.tutorable = function (m) {
    return !M.isExamItem(m) && /pdf/i.test(m.fileType || m.fileName || "") && ["notes", "summary", "flashcards", "revision", "worksheet", "book", "other"].indexOf(M.matCategory(m)) >= 0;
  };
  /** Read a library item for the tutor (on the admin's device; the result syncs to students). */
  A.tutorRead = function (mat, quiet, opts) {
    if (!A.NoteScan) return Promise.resolve(null);
    if (!quiet) UI.toast("Reading " + mat.title + " for the tutor…");
    return A.NoteScan.forMaterial(mat, opts).then(function (scan) {
      var now = S().get("materials", mat.id) || mat, n = Object.keys(now.topicPages || {}).length;
      if (!quiet) UI.toast("The tutor found " + n + " topic" + (n === 1 ? "" : "s") + " in its " + scan.pages + " page" + (scan.pages === 1 ? "" : "s") +
        (scan.cards.length ? " and made " + scan.cards.length + " flashcard" + (scan.cards.length === 1 ? "" : "s") : "") + ". Check its pages in Tutor content.");
      A.render();
      return scan;
    }).catch(function (e) { if (!quiet) UI.toast("Couldn't read it for the tutor: " + (e.message || e), "bad"); return null; });
  };
  A.act["tutor-read-mat"] = function (el, e) {
    if (e) e.stopPropagation();
    var mat = S().get("materials", el.getAttribute("data-id"));
    if (mat) A.tutorRead(mat);
  };
  M.matCategory = function (m) { return M.MAT_CATS[m.category] ? m.category : m.kind === "textbook" ? "book" : m.kind === "note" ? "notes" : "notes"; };
  M.TAG_IDEAS = ["revision", "summary", "formulas", "definitions", "key facts", "diagrams", "exam tips", "worked examples", "practice", "vocabulary"];
  M.tagsOf = function (m) { return (Array.isArray(m.tags) ? m.tags : []).map(function (t) { return String(t).trim().toLowerCase(); }).filter(Boolean); };

  A.audienceLabel = function (mat) {
    if (!mat.classId && mat.syllabusId) { var s = M.syllabus(mat.syllabusId); return "Everyone studying " + (s ? s.subject : "this syllabus"); }
    if (mat.audience === "all") { var c = M.cls(mat.classId); return c ? "Whole class · " + c.name : "Whole class"; }
    var n = (mat.audience || []).length;
    return n + (n === 1 ? " student" : " students");
  };

  function availability(mat, opts) {
    if (mat.kind === "note") return '<span class="badge good" data-tip="Written in the app">' + I("checkCircle") + "In the app</span>";
    if (mat.kind === "link") return '<span class="badge warn">' + I("link") + "Outside link</span>";
    if (mat.offline === false) return '<span class="badge warn" data-tip="Opens from the school server while connected">' + I("wifi") + "Online only</span>";
    if (A.Files.has(mat.fileId)) return '<span class="badge good" data-tip="Saved on this device: works with no internet">' + I("download") + "On this device</span>";
    return opts.student ? '<button class="btn btn-sm" data-act="save-offline" data-id="' + mat.id + '">' + I("download") + "Save offline</button>" : '<span class="badge">Not on this device</span>';
  }

  /** One row in a materials list. opts: { teacher, student, showClass } */
  A.materialRow = function (mat, opts) {
    opts = opts || {};
    var k = M.MAT_KINDS[mat.kind] || M.MAT_KINDS.pdf, c = M.cls(mat.classId), syl = M.syllabus(mat.syllabusId || (c && c.syllabusId));
    var topic = mat.topicId && syl ? M.topic(syl, mat.topicId) : null;
    var exam = examParts(mat, opts);
    return '<div class="list-row click" data-act="open-mat" data-id="' + mat.id + '" tabindex="0" role="button">' +
      '<div class="stat" style="padding:0"><div class="ico ' + (mat.kind === "note" ? "accent" : "") + '">' + I(k.icon) + "</div></div>" +
      '<div class="grow"><div class="title">' + esc(mat.title) + "</div>" +
      '<div class="meta"><span>' + (M.isExamItem(mat) ? k.label : esc(M.MAT_CATS[M.matCategory(mat)]) + (mat.kind !== "pdf" && mat.kind !== "note" ? " · " + k.label : "")) + "</span>" + (mat.author ? '<span class="sep"></span><span>' + esc(mat.author) + "</span>" : "") +
      M.tagsOf(mat).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
      (mat.fileSize ? '<span class="sep"></span><span>' + A.fmtBytes(mat.fileSize) + "</span>" : "") +
      (opts.showClass && c ? '<span class="sep"></span><span>' + esc(M.className(c)) + "</span>" : "") +
      (opts.showClass && !c && syl ? '<span class="sep"></span><span>' + esc(syl.subject) + "</span>" : "") +
      (topic ? '<span class="sep"></span><span>' + esc(topic.title) + "</span>" : "") +
      (opts.teacher ? '<span class="sep"></span><span>' + I("eye") + " " + esc(A.audienceLabel(mat)) + "</span>" : "") + exam.meta +
      (opts.teacher && (mat.tutorFileId || mat.topicPages) ? '<span class="sep"></span><span data-tip="What the tutor uses it for">' + I("cap") + " Tutor: " + Object.keys(mat.topicPages || {}).length + " topics" + (mat.tutorCards ? ", " + mat.tutorCards + " flashcards" : "") + "</span>" : "") + "</div></div>" +
      exam.button + (opts.teacher && M.tutorable(mat) ? (mat.tutorFileId || mat.topicPages ? '<button class="btn btn-sm btn-ghost" data-act="tutor-pages" data-id="' + mat.id + '" data-tip="Which pages are about which topic">' + I("layers") + "Pages per topic</button>"
        : '<button class="btn btn-sm btn-ghost" data-act="tutor-read-mat" data-id="' + mat.id + '" data-tip="Find its topics for the tutor">' + I("cap") + "Read for the tutor</button>") : "") + availability(mat, opts) +
      (opts.teacher ? '<button class="btn btn-ghost btn-icon btn-sm" data-act="del-mat" data-id="' + mat.id + '" data-tip="Remove" aria-label="Remove">' + I("trash") + "</button>" : "") +
      "</div>";
  };

  /** Exam papers: their marking scheme (and, for the admin, how many have finished it). */
  function examParts(mat, opts) {
    var out = { meta: "", button: "" };
    if (mat.kind === "markscheme" && !S().get("materials", mat.paperId)) { out.meta = '<span class="sep"></span><span class="warn-text">Its paper was removed</span>'; return out; }
    if (mat.kind !== "pastpaper" || !(opts.teacher || opts.student)) return out;
    var ms = M.markSchemeFor(mat.id), me = M.me();
    // the paper's own time allowed, marks and calculator rule (read from its front page)
    out.meta = (mat.durationMin ? '<span class="sep"></span><span>' + A.fmtMinutes(mat.durationMin * 60) + "</span>" : "") +
      (mat.totalMarks ? '<span class="sep"></span><span>' + mat.totalMarks + " marks</span>" : "") +
      (mat.calculator === "no" ? '<span class="sep"></span><span class="warn-text">No calculator</span>' : "");
    if (opts.teacher) {
      var sat = M.papersDone(mat.id), marked = sat.filter(function (r) { return r.score != null && r.total; });
      if (sat.length) out.meta += '<span class="sep"></span><span>' + sat.length + " sat" + (marked.length ? " · average " + Math.round(A.avg(marked.map(function (r) { return r.score / r.total * 100; }))) + "%" : "") + "</span>";
      if (ms) out.meta += '<span class="sep"></span><span>Scheme: ' + esc((M.MS_SHOW[ms.msVisibility] || M.MS_SHOW.after).toLowerCase()) + "</span>";
      out.button = ms ? '<button class="btn btn-sm" data-act="open-mat" data-id="' + ms.id + '">' + I("key") + "Marking scheme</button>"
        : '<button class="btn btn-sm btn-ghost" data-act="add-ms" data-paper="' + mat.id + '">' + I("plus") + "Marking scheme</button>";
    } else if (me) {
      // students sit the paper in the exam room; its marking scheme opens once they have finished
      var sit = M.paperSitting(me.id, mat.id), running = sit && sit.startedAt && !sit.doneAt && Date.now() < sit.endsAt;
      if (sit && sit.doneAt) out.meta += '<span class="sep"></span><span>' + (M.paperScoreText(sit) ? "Your mark " + M.paperScoreText(sit) : "Sat " + A.fmtDate(sit.doneAt)) + "</span>";
      out.button = '<button class="btn btn-sm' + (running ? " btn-danger" : sit && sit.doneAt ? "" : " btn-primary") + '" data-act="goto" data-href="#/s/sit/' + mat.id + '">' + I("clock") + (running ? "Continue" : sit && sit.doneAt ? "Sit again" : "Sit it") + "</button>" +
        (ms && M.canSeeMarkScheme(ms, me.id) ? '<button class="btn btn-sm" data-act="open-mat" data-id="' + ms.id + '">' + I("key") + "Marking scheme</button>" : "");
    }
    return out;
  }

  /* ------------------------------------------------------------ getting files */
  /** Local copy first; otherwise the school server (kept on the device unless online-only). */
  function getFile(mat) {
    return A.Files.get(mat.fileId).then(function (rec) {
      if (rec && rec.blob) return rec;
      if (!navigator.onLine || !A.Sync) return null;
      return A.Sync.fetchFile(mat.fileId, mat.offline !== false);
    });
  }
  A.act["save-offline"] = function (el, e) {
    if (e) e.stopPropagation();
    var mat = S().get("materials", el.getAttribute("data-id"));
    el.disabled = true; el.innerHTML = I("download") + "Saving…";
    A.Sync.fetchFile(mat.fileId, true).then(function (rec) {
      if (rec) { UI.toast("Saved. It now opens with no internet."); A.render(); }
      else { UI.toast("Couldn't download it. Connect to the school network and try again.", "bad"); el.disabled = false; el.innerHTML = I("download") + "Save offline"; }
    });
  };
  A.act["save-all-offline"] = function (el) {
    var me = M.me(), todo = M.materialsForStudent(me.id).filter(function (m) { return m.fileId && m.offline !== false && !A.Files.has(m.fileId) && !M.isExamItem(m); });
    el.disabled = true;
    var ok = 0;
    todo.reduce(function (p, m, i) {
      return p.then(function () { el.innerHTML = I("download") + "Saving " + (i + 1) + " of " + todo.length + "…"; return A.Sync.fetchFile(m.fileId, true).then(function (r) { if (r) ok++; }); });
    }, Promise.resolve()).then(function () {
      UI.toast(ok ? ok + " saved for offline use" : "Couldn't download. Connect to the school network and try again.", ok ? "" : "bad");
      A.render();
    });
  };

  /* ---------------------------------------------------------------- open */
  A.openMaterial = function (mat) {
    var me = M.me(), teacher = me && me.role === "teacher";
    if (mat.kind === "markscheme" && !teacher && !M.canSeeMarkScheme(mat, me.id)) {
      UI.modal({ title: mat.title, body: UI.empty("lock", "Finish the paper first", "Tap \u201cI've finished it\u201d on the paper, then its marking scheme opens.") });
      return;
    }
    if (mat.kind === "note") {
      UI.modal({ title: mat.title, sub: esc(A.audienceLabel(mat)), size: "wide", body: '<div class="prose">' + A.md(mat.body) + "</div>" });
      return;
    }
    if (mat.kind === "link" || (!mat.fileId && mat.url)) {
      if (!teacher) { UI.modal({ title: mat.title, body: UI.empty("link", "This is an outside website", "Ask your teacher to add the file to the library so you can open it here.") }); return; }
      window.open(mat.url, "_blank", "noopener");
      return;
    }
    getFile(mat).then(function (rec) {
      if (!rec || !rec.blob) {
        UI.modal({ title: mat.title, body: UI.empty("wifiOff", "Not on this device yet", mat.offline === false ? "This one is online only. Connect to the school network to open it." : "Connect to the school network once to download it. After that it opens with no internet.") });
        return;
      }
      var type = rec.type || mat.fileType || "";
      if (/pdf/.test(type) && A.PdfView) {
        var pv = null;
        UI.modal({
          title: mat.title, sub: esc((rec.name || "") + " · " + A.fmtBytes(rec.size || rec.blob.size || 0)), size: "full", flush: true, body: '<div class="pdf-host"></div>',
          foot: teacher ? [{ label: "Download", icon: "download", onClick: function () { A.download(rec.name || mat.title, rec.blob); return false; } }, { label: "Close", cls: "btn-primary" }] : [{ label: "Close", cls: "btn-primary" }],
          onMount: function (m) { pv = A.PdfView.open(m.querySelector(".pdf-host"), rec.blob); },
          onClose: function () { if (pv) pv.destroy(); },
        });
        return;
      }
      var url = URL.createObjectURL(rec.blob);
      var inner;
      if (/pdf/.test(type)) inner = '<iframe class="viewer" src="' + url + '#toolbar=1" title="' + esc(mat.title) + '"></iframe>';
      else if (/^video\//.test(type)) inner = '<div class="media-wrap"><video src="' + url + '" controls playsinline controlsList="nodownload" style="max-width:100%;max-height:100%"></video></div>';
      else if (/^audio\//.test(type)) inner = '<div class="media-wrap">' + I("audio", "big-ico") + '<audio src="' + url + '" controls controlsList="nodownload" style="width:min(520px,100%)"></audio></div>';
      else if (/^image\//.test(type)) inner = '<div class="media-wrap"><img src="' + url + '" alt="' + esc(mat.title) + '" style="max-width:100%;max-height:100%"></div>';
      else if (/^text\//.test(type)) inner = '<pre class="text-view" id="text-view">Loading…</pre>';
      else inner = UI.empty("file", rec.name, "This file type can't be shown inside the app. Ask your teacher to upload it as a PDF.");
      UI.modal({
        title: mat.title, sub: esc((rec.name || "") + " · " + A.fmtBytes(rec.size || rec.blob.size || 0)), size: "full", flush: true, body: inner,
        foot: teacher ? [{ label: "Download", icon: "download", onClick: function () { A.download(rec.name || mat.title, rec.blob); return false; } }, { label: "Close", cls: "btn-primary" }] : [{ label: "Close", cls: "btn-primary" }],
        onMount: function (m) { var tv = m.querySelector("#text-view"); if (tv) rec.blob.text().then(function (t) { tv.textContent = t; }); },
        onClose: function () { setTimeout(function () { URL.revokeObjectURL(url); }, 1000); },
      });
    });
  };
  A.act["open-mat"] = function (el, e) {
    if (e && e.target.closest("[data-act=save-offline], [data-act=del-mat]")) return;
    var mat = S().get("materials", el.getAttribute("data-id"));
    if (mat) A.openMaterial(mat);
  };
  A.act["del-mat"] = function (el, e) {
    e.stopPropagation();
    var mat = S().get("materials", el.getAttribute("data-id"));
    if (!mat) return;
    var ms = mat.kind === "pastpaper" ? M.markSchemeFor(mat.id) : null;
    UI.confirm("Remove \"" + mat.title + "\"" + (ms ? " and its marking scheme" : "") + "? Students will no longer see " + (ms ? "them" : "it") + ".", { ok: "Remove", danger: true }).then(function (ok) {
      if (!ok) return;
      S().remove("materials", mat.id);
      if (mat.fileId) A.Files.remove(mat.fileId).catch(function () {});
      if (ms) { S().remove("materials", ms.id); if (ms.fileId) A.Files.remove(ms.fileId).catch(function () {}); }
      UI.toast("Material removed");
      A.render();
    });
  };

  /* ------------------------------------------------------------ add modal
     opts: { classId?, syllabusId?, kind?, category?, topicId?, title?, intro? } */
  A.materialModal = function (opts) {
    opts = opts || {};
    if (opts.kind === "pastpaper" || opts.kind === "markscheme") return A.examBatchModal({ mode: opts.kind === "markscheme" ? "schemes" : "papers", classId: opts.classId, syllabusId: opts.syllabusId });
    var me = M.me(), classes = M.myClasses(me);
    var syllabi = {};
    classes.forEach(function (c) { var s = M.syllabus(c.syllabusId); if (s) syllabi[s.id] = s; });
    if (opts.syllabusId) { var s0 = M.syllabus(opts.syllabusId); if (s0) syllabi[s0.id] = s0; }
    var dest = opts.classId ? "c:" + opts.classId : opts.syllabusId ? "s:" + opts.syllabusId : classes[0] ? "c:" + classes[0].id : "";
    var destOptions = classes.map(function (c) { return '<option value="c:' + c.id + '"' + (dest === "c:" + c.id ? " selected" : "") + ">" + esc(M.className(c)) + "</option>"; }).join("") +
      Object.keys(syllabi).map(function (id) { return '<option value="s:' + id + '"' + (dest === "s:" + id ? " selected" : "") + ">Everyone studying " + esc(M.syllabusTitle(syllabi[id])) + "</option>"; }).join("");
    var kind0 = opts.kind && M.MAT_KINDS[opts.kind] && opts.kind !== "link" ? opts.kind : "pdf";
    var kinds = ["pdf", "textbook", "video", "audio", "image", "note"];
    var body =
      '<input type="hidden" name="kind" value="' + kind0 + '">' +
      '<div class="seg" id="mat-kind">' + kinds.map(function (k) { return '<button type="button" data-k="' + k + '" class="' + (kind0 === k ? "on" : "") + '">' + I(M.MAT_KINDS[k].icon) + esc(M.MAT_KINDS[k].label) + "</button>"; }).join("") + "</div>" +
      '<div class="form-grid mt">' +
      '<label class="field full"><span>Title</span><input class="input" name="title" required placeholder="e.g. Chapter 4 notes: Indices"></label>' +
      '<label class="field" data-hide="note"><span>Author / source <span class="muted">(optional)</span></span><input class="input" name="author" placeholder="e.g. School Maths Dept"></label>' +
      '<label class="field"><span>Kind of material</span><select class="select" name="category">' + Object.keys(M.MAT_CATS).map(function (c) { return '<option value="' + c + '"' + (c === (opts.category || "notes") ? " selected" : "") + ">" + esc(M.MAT_CATS[c]) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Tags <span class="muted">(optional, separated by commas)</span></span><input class="input" name="tags" placeholder="e.g. revision, formulas"><span class="hint tag-ideas">' + M.TAG_IDEAS.map(function (t) { return '<button type="button" class="tag tag-btn" data-tag="' + esc(t) + '">+ ' + esc(t) + "</button>"; }).join("") + "</span></label>" +
      '<label class="field"><span>Share with</span><select class="select" name="dest">' + destOptions + "</select></label>" +
      '<label class="field"><span>Topic <span class="muted">(optional)</span></span><select class="select" name="topicId"></select></label>' +
      "</div>" +
      '<div class="mt" data-hide="note">' +
      '<label class="file-drop" id="mat-drop">' + I("upload") + '<div class="mt-sm"><b>Choose a file</b> or drop it here</div><div class="tiny" id="mat-accept-hint">Stored inside the app, so students never leave it</div><input type="file" name="file"></label>' +
      '<div class="small muted mt-sm" id="mat-file-name"></div>' +
      '<details class="mt"><summary class="small bold" style="cursor:pointer">Or download it from a web address into the library</summary>' +
      '<div class="row mt-sm"><input class="input grow" name="fetchUrl" placeholder="https://…/file.pdf"><button type="button" class="btn" id="mat-fetch">' + I("download") + "Download</button></div>" +
      '<p class="tiny muted mt-sm">The file is copied into the library, so students open it here, not on the website. Some websites block this. If so, download the file in your browser first and then choose it above.</p></details>' +
      '<label class="check mt"><input type="checkbox" name="offline" checked><span><b>Students can save it on their device</b> <span class="tiny muted">Untick for online only: students open it from the school server while connected (good for very large videos).</span></span></label></div>' +
      '<label class="field mt" data-show="note"><span>Handout <span class="muted">(## headings, - bullets, **bold**, [[formula]])</span></span><textarea class="textarea" name="body" rows="8" placeholder="## Key points&#10;- …"></textarea></label>' +
      '<div class="mt" id="mat-audience"><span class="label">Who can see it?</span>' +
      '<div class="seg" id="mat-aud"><button type="button" data-a="all" class="on">Whole class</button><button type="button" data-a="some">Selected students</button></div>' +
      '<div class="mt-sm hidden" id="mat-students"></div></div>';

    var fetched = null;
    UI.modal({
      title: opts.title || "Add study material", size: "wide", body: (opts.intro ? '<div class="callout mb">' + I("info") + "<div>" + opts.intro + "</div></div>" : "") + '<form id="mat-form">' + body + "</form>",
      foot: [{ label: "Cancel" }, {
        label: "Add material", cls: "btn-primary", icon: "plus", onClick: function (el) {
          var f = UI.formData(el.querySelector("#mat-form")), kind = f.kind;
          if (!f.title.trim()) { UI.toast("Give the material a title", "bad"); return false; }
          var file = f.file || fetched;
          if (kind !== "note" && !file) { UI.toast("Choose a file to upload", "bad"); return false; }
          if (kind === "note" && !f.body.trim()) { UI.toast("Write the handout first", "bad"); return false; }
          var d = f.dest.split(":"), aud = el.querySelector("#mat-aud .on").getAttribute("data-a");
          var picked = aud === "some" ? UI.pickerValue(el.querySelector("#mat-students")) : [];
          if (d[0] === "c" && aud === "some" && !picked.length) { UI.toast("Choose at least one student", "bad"); return false; }
          var tags = String(f.tags || "").split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(function (t, i, all) { return t && all.indexOf(t) === i; }).slice(0, 8);
          var rec = { kind: kind, title: f.title.trim(), author: f.author || "", topicId: f.topicId || null, createdBy: me.id, offline: kind === "note" ? true : !!f.offline, category: f.category || "notes", tags: tags,
            classId: d[0] === "c" ? d[1] : null, syllabusId: d[0] === "s" ? d[1] : null, audience: d[0] === "c" && aud === "some" ? picked : "all" };
          if (kind === "note") rec.body = f.body;
          var save = file ? A.Files.fromInput(file).then(function (fr) { rec.fileId = fr.id; rec.fileName = fr.name; rec.fileType = fr.type; rec.fileSize = fr.size; }) : Promise.resolve();
          return save.then(function () {
            var saved = S().put("materials", rec);
            UI.toast("Added to the library");
            A.render();
            // notes, summaries and flashcards: read them for the tutor straight away
            if (M.tutorable(saved || rec)) A.tutorRead(S().get("materials", (saved || rec).id) || saved || rec);
          }).catch(function (e) { UI.toast("Could not save the file: " + e.message, "bad"); return false; });
        },
      }],
      onMount: function (el) {
        var form = el.querySelector("#mat-form"), firstTopic = opts.topicId || "";
        function destSyl() { var d = form.dest.value.split(":"); return d[0] === "c" ? (M.cls(d[1]) || {}).syllabusId : d[1]; }
        function refresh() {
          var kind = form.kind.value;
          el.querySelectorAll("[data-show]").forEach(function (x) { x.classList.toggle("hidden", x.getAttribute("data-show") !== kind); });
          el.querySelectorAll("[data-hide]").forEach(function (x) { x.classList.toggle("hidden", x.getAttribute("data-hide") === kind); });
          var input = form.querySelector("[name=file]");
          input.setAttribute("accept", (M.MAT_KINDS[kind] || {}).accept || "");
          el.querySelector("#mat-accept-hint").textContent = kind === "video" ? "MP4 or WebM video. Large videos can be set to online only." : kind === "audio" ? "MP3, M4A or WAV audio" : kind === "image" ? "PNG or JPG picture" : "PDF works best: it opens on every device";
          var syl = M.syllabus(destSyl()), cur = form.topicId.value || firstTopic; firstTopic = "";
          form.topicId.innerHTML = '<option value="">No specific topic</option>' + (syl ? syl.topics.map(function (t) { return '<option value="' + t.id + '"' + (t.id === cur ? " selected" : "") + ">" + esc(t.title) + "</option>"; }).join("") : "");
          var d = form.dest.value.split(":");
          el.querySelector("#mat-audience").classList.toggle("hidden", d[0] !== "c");
          if (d[0] === "c") el.querySelector("#mat-students").innerHTML = UI.picker({ students: M.studentsOf(M.cls(d[1])) });
        }
        el.querySelector("#mat-kind").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          el.querySelectorAll("#mat-kind button").forEach(function (x) { x.classList.toggle("on", x === b); });
          form.kind.value = b.getAttribute("data-k"); refresh();
        });
        el.querySelector("#mat-aud").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          el.querySelectorAll("#mat-aud button").forEach(function (x) { x.classList.toggle("on", x === b); });
          el.querySelector("#mat-students").classList.toggle("hidden", b.getAttribute("data-a") !== "some");
        });
        form.dest.addEventListener("change", refresh);
        el.querySelector(".tag-ideas").addEventListener("click", function (e) {
          var b = e.target.closest("[data-tag]"); if (!b) return;
          var cur = form.tags.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
          if (cur.indexOf(b.getAttribute("data-tag")) < 0) cur.push(b.getAttribute("data-tag"));
          form.tags.value = cur.join(", ");
        });
        var fileInput = form.querySelector("[name=file]");
        var showName = function (f) {
          el.querySelector("#mat-file-name").innerHTML = f ? "Selected: <b>" + esc(f.name) + "</b> (" + A.fmtBytes(f.size) + ")" + (f.size > 300 * 1048576 ? ' <span class="badge warn">Large: consider online only</span>' : "") : "";
          var tIn = form.querySelector("[name=title]");
          if (f && !tIn.value) { var nm = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); tIn.value = nm.charAt(0).toUpperCase() + nm.slice(1); }
          if (f && /^video\//.test(f.type) && form.kind.value !== "video") el.querySelector('#mat-kind [data-k="video"]').click();
          if (f && /^audio\//.test(f.type) && form.kind.value !== "audio") el.querySelector('#mat-kind [data-k="audio"]').click();
        };
        fileInput.addEventListener("change", function () { fetched = null; showName(fileInput.files[0]); });
        var drop = el.querySelector("#mat-drop");
        drop.addEventListener("dragover", function (e) { e.preventDefault(); });
        drop.addEventListener("drop", function (e) {
          e.preventDefault();
          var f = e.dataTransfer.files[0]; if (!f) return;
          try { var dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files; } catch (err) { fetched = f; }
          showName(f);
        });
        el.querySelector("#mat-fetch").addEventListener("click", function () {
          var url = form.fetchUrl.value.trim(), btn = this;
          if (!/^https?:\/\//i.test(url)) { UI.toast("Enter a full web address", "bad"); return; }
          if (!navigator.onLine) { UI.toast("You're offline, so nothing can be downloaded right now", "bad"); return; }
          btn.disabled = true; btn.textContent = "Downloading…";
          fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); }).then(function (blob) {
            var name = decodeURIComponent(url.split("/").pop().split("?")[0] || "download");
            fetched = new File([blob], name, { type: blob.type || "application/octet-stream" });
            showName(fetched);
            UI.toast("Downloaded into the library");
          }).catch(function () {
            UI.toast("That website doesn't allow downloads by apps. Save the file in your browser, then choose it above.", "bad");
          }).then(function () { btn.disabled = false; btn.innerHTML = I("download") + "Download"; });
        });
        refresh();
      },
    });
  };
})(window.App);
