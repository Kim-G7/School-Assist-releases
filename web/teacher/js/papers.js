/* Exam papers and marking schemes.
 *   - Upload many files at once: each is sorted into a question paper, a marking scheme or
 *     another document (examiner report, insert...) from its file name, and every marking
 *     scheme is paired with its paper. Cambridge names (0610_s23_qp_42 / 0610_s23_ms_42) and
 *     plain names ("Paper 1 June 2023" / "Paper 1 June 2023 marking scheme") both work.
 *   - Students see each paper with its marking scheme. By default the scheme opens only after
 *     they say they have finished the paper; the admin can also show it straight away or never.
 * Papers are materials of kind "pastpaper"; schemes are kind "markscheme" with `paperId`. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  /* ------------------------------------------------------------ the rules */
  M.markSchemeFor = function (paperId) {
    return S().find("materials", function (m) { return m.kind === "markscheme" && m.paperId === paperId; });
  };
  M.paperDone = function (sid, paperId) { return !!S().get("receipts", "pd_" + paperId + "_" + sid); };
  M.papersDone = function (paperId) { return S().filter("receipts", function (r) { return r.kind === "paper-done" && r.paperId === paperId; }); };
  M.canSeeMarkScheme = function (ms, sid) {
    if (!ms || ms.msVisibility === "hidden") return false;
    return ms.msVisibility === "always" || M.paperDone(sid, ms.paperId);
  };
  /** A library list without the marking schemes that are shown on their own paper's row. */
  M.libraryList = function (mats) {
    return mats.filter(function (m) { return !(m.kind === "markscheme" && m.paperId && S().get("materials", m.paperId)); });
  };
  M.isExamItem = function (m) { return m.kind === "pastpaper" || m.kind === "markscheme" || m.kind === "insert"; };
  /** A paper's insert (reading texts, maps, photographs), shown beside the questions in the exam room. */
  M.insertFor = function (paperId) { return S().find("materials", function (m) { return m.kind === "insert" && m.paperId === paperId; }); };
  /** Newest exam session first, then by paper. */
  M.byExamSession = function (a, b) { return (b.sortKey || b.year || 0) - (a.sortKey || a.year || 0) || a.title.localeCompare(b.title, undefined, { numeric: true }); };
  M.MS_SHOW = { after: "After they finish the paper", always: "Straight away", hidden: "Never (only you)" };

  /* ------------------------------------------------ reading a file name */
  var SESSION = { s: "May/June", w: "Oct/Nov", m: "Feb/March" };
  var CAM_TYPE = { qp: "qp", sp: "qp", ms: "ms", sm: "ms", er: "Examiner report", gt: "Grade thresholds", "in": "Insert", ci: "Confidential instructions", pm: "Pre-release material", sf: "Source files" };
  var MS_WORDS = /\s(ms|mark\s?schemes?|marking\s?schemes?|markschemes?|mark\s?sch|marking\s?guides?|memo|memorandum|answers?(\s?key)?|solutions?)\s/;
  var TYPE_WORDS = /\s(qp|question\s?papers?|questions?|ms|mark\s?schemes?|marking\s?schemes?|markschemes?|mark\s?sch|marking\s?guides?|memo|memorandum|answers?(\s?key)?|solutions?)(?=\s)/g;
  var OTHER_WORDS = /\s(examiners?\s?reports?|grade\s?thresholds?|inserts?)\s/;
  var MONTHS = { january: "jan", february: "feb", march: "mar", april: "apr", june: "jun", july: "jul", august: "aug", september: "sep", sept: "sep", october: "oct", november: "nov", december: "dec" };

  function titleCase(s) { return s.replace(/\s+/g, " ").trim().replace(/^./, function (c) { return c.toUpperCase(); }); }

  /** { type: "qp" | "ms" | "other", key (for pairing), title, year, code } from a file name. */
  A.examFileInfo = function (name) {
    var base = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "");
    var cam = /^(\d{4})[_\-\s]+([smw])(\d{2})[_\-\s]+([a-z]{2})(?:[_\-\s]*(\d)(\d)?)?/i.exec(base);
    if (cam && CAM_TYPE[cam[4].toLowerCase()]) {
      var t = CAM_TYPE[cam[4].toLowerCase()], yr = 2000 + Number(cam[3]);
      var paper = cam[5] ? "Paper " + cam[5] + (cam[6] ? ", variant " + cam[6] : "") : "";
      var when = SESSION[cam[2].toLowerCase()] + " " + yr;
      return {
        type: t === "qp" || t === "ms" ? t : "other", code: cam[1], year: yr, sortKey: yr + ({ m: 0.1, s: 0.2, w: 0.3 })[cam[2].toLowerCase()],
        key: cam[1] + "_" + cam[2].toLowerCase() + cam[3] + "_" + (cam[5] || "") + (cam[6] || ""),
        title: t === "qp" || t === "ms" ? when + (paper ? " · " + paper : "") : t + ": " + when + (paper ? " · " + paper : ""),
      };
    }
    var low = " " + base.toLowerCase().replace(/[_\-.()[\]]+/g, " ").replace(/\s+/g, " ") + " ";
    var type = OTHER_WORDS.test(low) ? "other" : MS_WORDS.test(low) ? "ms" : "qp";
    var key = low.replace(TYPE_WORDS, " ")
      .replace(/\bpaper\s?(\d)/g, "p$1").replace(/\bp\s(\d)\b/g, "p$1")
      .replace(/[a-z]+/g, function (w) { return MONTHS[w] || w; })
      .replace(/\s+/g, " ").trim();
    var clean = base.replace(/[_]+/g, " ").replace(/\s*[-–]\s*/g, " ").replace(/\s+/g, " ");
    if (type === "ms") clean = (" " + clean + " ").replace(/\s(ms|mark(ing)?\s?schemes?|markschemes?|mark\s?sch|marking\s?guides?|memo(randum)?|answers?(\s?key)?|solutions?)(?=\s)/gi, " ");
    if (type === "qp") clean = (" " + clean + " ").replace(/\s(qp|question\s?papers?)(?=\s)/gi, " ");
    // four-digit numbers, even when joined by underscores (Paper2_2021): the year, and the exam code (4004, 0610)
    var fours = (base.match(/(?:^|[^0-9])(\d{4})(?=[^0-9]|$)/g) || []).map(function (x) { return x.replace(/[^0-9]/g, ""); });
    var year = fours.filter(function (n) { return /^(19|20)\d\d$/.test(n); })[0];
    var code = fours.filter(function (n) { return n !== year; })[0];
    return { type: type, key: key, title: titleCase(clean) || base, year: year ? Number(year) : null, code: code || null };
  };

  /* ---------------------------------------------------- choosing what to add */
  A.addMaterialChooser = function (opts) {
    opts = opts || {};
    var card = function (act, icon, title, text) {
      return '<button class="role-card" data-choose="' + act + '"><div class="ico">' + I(icon) + "</div><b>" + title + "</b><span>" + text + "</span></button>";
    };
    UI.modal({
      title: "What are you adding?", size: "wide", foot: [{ label: "Cancel" }],
      body: '<div class="upload-choices">' +
        card("study", "book", "Study material", "Notes, textbooks, videos, audio, pictures and written handouts.") +
        card("papers", "award", "Exam papers", "Question papers, and their marking schemes if you have them. Choose many files at once: they are sorted and paired for you.") +
        card("schemes", "key", "Marking schemes", "For exam papers already in the library. Each one is matched to its paper.") +
        "</div>",
      onMount: function (el, close) {
        el.querySelector(".upload-choices").addEventListener("click", function (e) {
          var b = e.target.closest("[data-choose]"); if (!b) return;
          var c = b.getAttribute("data-choose");
          close();
          if (c === "study") A.materialModal(opts);
          else A.examBatchModal(Object.assign({}, opts, { mode: c }));
        });
      },
    });
  };

  /* ------------------------------------------------ exam papers, in a batch
     opts: { mode: "papers" | "schemes", classId?, syllabusId?, paperId? } */
  A.examBatchModal = function (opts) {
    opts = opts || {};
    var schemesOnly = opts.mode === "schemes";
    var me = M.me(), classes = M.myClasses(me), syllabi = {};
    classes.forEach(function (c) { var s = M.syllabus(c.syllabusId); if (s) syllabi[s.id] = s; });
    if (opts.syllabusId) { var s0 = M.syllabus(opts.syllabusId); if (s0) syllabi[s0.id] = s0; }
    var paper0 = opts.paperId ? S().get("materials", opts.paperId) : null;
    var dest = paper0 ? (paper0.classId ? "c:" + paper0.classId : "s:" + paper0.syllabusId)
      : opts.syllabusId ? "s:" + opts.syllabusId : opts.classId ? "c:" + opts.classId : Object.keys(syllabi)[0] ? "s:" + Object.keys(syllabi)[0] : classes[0] ? "c:" + classes[0].id : "";
    var destOptions = Object.keys(syllabi).map(function (id) { return '<option value="s:' + id + '"' + (dest === "s:" + id ? " selected" : "") + ">Everyone studying " + esc(M.syllabusTitle(syllabi[id])) + "</option>"; }).join("") +
      classes.map(function (c) { return '<option value="c:' + c.id + '"' + (dest === "c:" + c.id ? " selected" : "") + ">Only " + esc(M.className(c)) + "</option>"; }).join("");
    var items = []; // { file, type, title, key, year, forRef }

    function destSyl(form) { var d = form.dest.value.split(":"); return d[0] === "c" ? (M.cls(d[1]) || {}).syllabusId : d[1]; }
    /** Papers already in the library for the chosen subject. */
    function existingPapers(form) {
      var sid = destSyl(form);
      return S().filter("materials", function (m) {
        var c = M.cls(m.classId);
        return m.kind === "pastpaper" && (m.syllabusId === sid || (c && c.syllabusId === sid));
      }).sort(M.byExamSession);
    }
    function paperKey(m) { return m.paperKey || A.examFileInfo(m.fileName || m.title).key; }

    /** Pair every marking scheme with a paper: one in this batch first, then one already here. */
    function pair(form) {
      var qps = items.map(function (it, i) { return it.type === "qp" ? i : -1; }).filter(function (i) { return i >= 0; });
      var have = existingPapers(form);
      items.forEach(function (it) {
        if (it.type !== "ms" || it.manual) return;
        var b = qps.filter(function (i) { return items[i].key === it.key; })[0];
        var p = have.filter(function (m) { return paperKey(m) === it.key; })[0];
        it.forRef = b != null ? "b:" + b : p ? "p:" + p.id : "";
      });
      var loose = items.filter(function (it) { return it.type === "ms" && !it.forRef; });
      if (paper0 && loose.length === 1) loose[0].forRef = "p:" + paper0.id;       // "add marking scheme" on one paper
      else if (qps.length === 1 && loose.length === 1) loose[0].forRef = "b:" + qps[0]; // one of each: they go together
    }

    function rowsHtml(form) {
      if (!items.length) return "";
      var have = existingPapers(form);
      var qpOptions = function (it) {
        var batch = items.map(function (x, i) { return x.type === "qp" ? '<option value="b:' + i + '"' + (it.forRef === "b:" + i ? " selected" : "") + ">" + esc(x.title) + " (in this upload)</option>" : ""; }).join("");
        var old = have.map(function (m) { return '<option value="p:' + m.id + '"' + (it.forRef === "p:" + m.id ? " selected" : "") + ">" + esc(m.title) + (M.markSchemeFor(m.id) ? " (replaces its scheme)" : "") + "</option>"; }).join("");
        return '<option value="">Which paper is this for?</option>' + (batch ? '<optgroup label="In this upload">' + batch + "</optgroup>" : "") + (old ? '<optgroup label="Already in the library">' + old + "</optgroup>" : "");
      };
      return items.map(function (it, i) {
        var typeSel = '<select class="select sm" data-bt="type" data-i="' + i + '" aria-label="What this file is">' +
          [["qp", "Question paper"], ["ms", "Marking scheme"], ["other", "Other document"], ["skip", "Don't upload"]].map(function (o) { return '<option value="' + o[0] + '"' + (it.type === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>";
        var detail = it.type === "ms"
          ? '<select class="select sm' + (it.forRef ? "" : " invalid") + '" data-bt="for" data-i="' + i + '" aria-label="Paper this marking scheme is for">' + qpOptions(it) + "</select>"
          : it.type === "skip" ? '<span class="small muted">Left out</span>'
          : '<input class="input sm" data-bt="title" data-i="' + i + '" value="' + esc(it.title) + '" aria-label="Title">';
        return '<div class="batch-row' + (it.type === "skip" ? " skipped" : "") + '"><div class="batch-file">' + I(it.type === "ms" ? "key" : it.type === "qp" ? "award" : "file") +
          '<div><div class="name">' + esc(it.file.name) + '</div><div class="tiny muted">' + A.fmtBytes(it.file.size) + (it.file.size > 50 * 1048576 && A.Cloud ? ' · <span class="text-bad">over 50 MB: too big to share online</span>' : "") + "</div></div></div>" +
          typeSel + detail + "</div>";
      }).join("");
    }
    function summary() {
      var n = { qp: 0, ms: 0, other: 0 }, loose = 0;
      items.forEach(function (it) { if (n[it.type] != null) n[it.type]++; if (it.type === "ms" && !it.forRef) loose++; });
      if (!items.length) return "";
      var parts = [];
      if (n.qp) parts.push(n.qp + " question paper" + (n.qp === 1 ? "" : "s"));
      if (n.ms) parts.push(n.ms + " marking scheme" + (n.ms === 1 ? "" : "s"));
      if (n.other) parts.push(n.other + " other document" + (n.other === 1 ? "" : "s"));
      return '<div class="callout ' + (loose ? "warn" : "") + ' mt">' + I(loose ? "alert" : "checkCircle") + "<div>" + (parts.join(", ") || "Nothing to upload") + "." +
        (n.ms ? (loose ? " <b>" + loose + " marking scheme" + (loose === 1 ? " needs" : "s need") + " a paper</b>: choose it in the list." : " Every marking scheme is paired with its paper.") : "") + "</div></div>";
    }

    var body = '<form id="batch-form">' +
      '<p class="muted small">' + (schemesOnly ? "Choose the marking schemes. Each one is matched to its exam paper by its file name; check the pairs before you save."
        : "Choose all the question papers and marking schemes at once. Each file is sorted by its name (for example <code>0610_s23_qp_42.pdf</code> and <code>0610_s23_ms_42.pdf</code>, or <i>Paper 1 June 2023</i> and <i>Paper 1 June 2023 marking scheme</i>) and every marking scheme is paired with its paper. Check the list before you save.") + "</p>" +
      '<div class="form-grid mt"><label class="field full"><span>Subject</span><select class="select" name="dest">' + destOptions + "</select></label>" +
      (schemesOnly ? "" : '<label class="field full"><span>Topical test for one topic <span class="muted">(optional)</span></span><select class="select" name="topicId"></select>' +
        '<span class="hint">For topical questions: the papers appear in that topic\'s tutor and in Test mode under Topical tests.</span></label>') + "</div>" +
      '<label class="file-drop mt" id="batch-drop">' + I("upload") + '<div class="mt-sm"><b>Choose files</b> or drop them here</div><div class="tiny">PDFs or photos of the pages. Several at once is fine.</div><input type="file" name="files" multiple accept=".pdf,image/*"></label>' +
      '<div id="batch-list" class="batch-list"></div><div id="batch-sum"></div>' +
      '<div class="divider"></div><div class="label">Students see marking schemes</div>' +
      '<div class="seg" id="batch-show">' + Object.keys(M.MS_SHOW).map(function (k) { return '<button type="button" data-v="' + k + '" class="' + (k === "after" ? "on" : "") + '">' + esc(M.MS_SHOW[k]) + "</button>"; }).join("") + "</div>" +
      '<p class="tiny muted mt-sm">"After they finish the paper": the student taps <i>I\'ve finished it</i>, then the marking scheme opens so they can mark their own answers.</p>' +
      '<label class="check mt"><input type="checkbox" name="offline" checked><span><b>Students can save them on their device</b> <span class="tiny muted">so they open with no internet.</span></span></label>' +
      "</form>";

    UI.modal({
      title: schemesOnly ? "Add marking schemes" : "Add exam papers", size: "wide", body: body,
      foot: [{ label: "Cancel" }, {
        label: "Save to the library", cls: "btn-primary", icon: "upload", onClick: function (el, btn) {
          var form = el.querySelector("#batch-form"), todo = items.filter(function (it) { return it.type !== "skip"; });
          if (!todo.length) { UI.toast("Choose at least one file", "bad"); return false; }
          if (todo.some(function (it) { return it.type === "ms" && !it.forRef; })) { UI.toast("Choose the paper for each marking scheme, or mark it Other document", "bad"); return false; }
          if (todo.some(function (it) { return it.type !== "ms" && !String(it.title).trim(); })) { UI.toast("Give every paper a title", "bad"); return false; }
          var d = form.dest.value.split(":"), show = el.querySelector("#batch-show .on").getAttribute("data-v"), offline = form.offline.checked;
          var where = { classId: d[0] === "c" ? d[1] : null, syllabusId: d[0] === "s" ? d[1] : null, audience: "all", createdBy: me.id, offline: offline };
          if (form.topicId && form.topicId.value) Object.assign(where, { topicId: form.topicId.value, topical: true });
          var made = {}, count = 0, button = el.querySelector(".modal-foot .btn-primary");
          var order = todo.filter(function (it) { return it.type !== "ms"; }).concat(todo.filter(function (it) { return it.type === "ms"; }));
          return order.reduce(function (p, it) {
            return p.then(function () {
              count++; if (button) button.textContent = "Saving " + count + " of " + order.length + "…";
              // a question paper's front page gives its time allowed, marks and calculator rule
              var cover = it.type === "qp" && A.PdfView && /pdf/i.test(it.file.type || it.file.name) ? A.PdfView.readCover(it.file).catch(function () { return {}; }) : Promise.resolve({});
              return Promise.all([A.Files.fromInput(it.file), cover]).then(function (both) {
                var fr = both[0], meta = both[1] || {};
                var rec = Object.assign({}, where, { fileId: fr.id, fileName: fr.name, fileType: fr.type, fileSize: fr.size, year: it.year || null, sortKey: it.sortKey || it.year || null });
                if (it.type === "qp") ["durationMin", "totalMarks", "calculator", "needs", "answerRule"].forEach(function (k) { if (meta[k] != null) rec[k] = meta[k]; });
                if (it.type === "qp") Object.assign(rec, { kind: "pastpaper", title: it.title.trim(), paperKey: it.key });
                else if (it.type === "other") Object.assign(rec, { kind: "pdf", title: it.title.trim() });
                else {
                  var ref = it.forRef.split(":"), paper = ref[0] === "b" ? made[ref[1]] : S().get("materials", ref[1]);
                  var old = M.markSchemeFor(paper.id);
                  if (old) S().remove("materials", old.id); // one marking scheme per paper: the new one replaces it
                  Object.assign(rec, { kind: "markscheme", paperId: paper.id, title: "Marking scheme: " + paper.title, msVisibility: show,
                    classId: paper.classId || null, syllabusId: paper.syllabusId || null });
                }
                var saved = S().put("materials", rec);
                made[items.indexOf(it)] = saved;
              });
            });
          }, Promise.resolve()).then(function () {
            // read the questions of every paper that now has its marking scheme, for typed answers in Test mode
            var papersToScan = [];
            Object.keys(made).forEach(function (k) {
              var m = made[k], p = m && (m.kind === "markscheme" ? S().get("materials", m.paperId) : m.kind === "pastpaper" ? m : null);
              if (p && papersToScan.indexOf(p) < 0 && M.markSchemeFor(p.id) && A.PaperScan) papersToScan.push(p);
            });
            if (!papersToScan.length) return;
            var typed = 0;
            return papersToScan.reduce(function (p, paper, i) {
              return p.then(function () {
                if (button) button.textContent = "Reading the questions " + (i + 1) + " of " + papersToScan.length + "…";
                return A.PaperScan.forPaper(S().get("materials", paper.id)).then(function (ok) { if (ok) typed++; });
              });
            }, Promise.resolve()).then(function () {
              UI.toast(typed + " of " + papersToScan.length + " paper" + (papersToScan.length === 1 ? "" : "s") + " can be sat with typed answers");
            });
          }).then(function () {
            var nq = todo.filter(function (it) { return it.type === "qp"; }).length, nm = todo.filter(function (it) { return it.type === "ms"; }).length;
            var no = todo.length - nq - nm, parts = [nq ? nq + " paper" + (nq === 1 ? "" : "s") : "", nm ? nm + " marking scheme" + (nm === 1 ? "" : "s") : "", no ? no + " other document" + (no === 1 ? "" : "s") : ""].filter(Boolean);
            UI.toast("Added " + (parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]));
            location.hash = "#/t/materials?t=papers";
            A.render();
          }).catch(function (e) { UI.toast("Could not save: " + (e.message || e), "bad"); if (button) button.textContent = "Save to the library"; return false; });
        },
      }],
      onMount: function (el) {
        var form = el.querySelector("#batch-form"), input = form.querySelector("[name=files]");
        function draw() { el.querySelector("#batch-list").innerHTML = rowsHtml(form); el.querySelector("#batch-sum").innerHTML = summary(); }
        function add(list) {
          Array.prototype.forEach.call(list, function (f) {
            if (items.some(function (it) { return it.file.name === f.name && it.file.size === f.size; })) return;
            var info = A.examFileInfo(f.name);
            items.push({ file: f, type: schemesOnly ? "ms" : info.type, title: info.title, key: info.key, year: info.year, sortKey: info.sortKey, code: info.code });
          });
          // subject from the exam code in the file names (0610, 4004, ...)
          var codes = items.map(function (it) { return it.code; }).filter(Boolean);
          if (codes.length && codes.every(function (c) { return c === codes[0]; })) {
            var match = Object.keys(syllabi).filter(function (id) { return String(syllabi[id].code || "") === codes[0]; })[0];
            if (match && form.dest.value !== "s:" + match && !paper0) { form.dest.value = "s:" + match; topics(); }
          }
          pair(form); draw();
        }
        input.addEventListener("change", function () { add(input.files); input.value = ""; });
        var drop = el.querySelector("#batch-drop");
        drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
        drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
        drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); add(e.dataTransfer.files); });
        // the topics of the chosen subject, for topical tests
        function topics() {
          if (!form.topicId) return;
          var d = form.dest.value.split(":"), syl = M.syllabus(d[0] === "c" ? (M.cls(d[1]) || {}).syllabusId : d[1]);
          form.topicId.innerHTML = '<option value="">No: exam papers (whole papers)</option>' + (syl ? syl.topics.map(function (t, i) { return '<option value="' + t.id + '">' + (i + 1) + ". " + esc(t.title) + "</option>"; }).join("") : "");
        }
        topics();
        form.dest.addEventListener("change", function () { items.forEach(function (it) { it.manual = false; }); topics(); pair(form); draw(); });
        el.querySelector("#batch-list").addEventListener("change", function (e) {
          var t = e.target, i = Number(t.getAttribute("data-i")), it = items[i]; if (!it) return;
          if (t.getAttribute("data-bt") === "type") { it.type = t.value; it.manual = false; pair(form); draw(); }
          if (t.getAttribute("data-bt") === "for") { it.forRef = t.value; it.manual = true; draw(); }
        });
        el.querySelector("#batch-list").addEventListener("input", function (e) {
          var t = e.target, it = items[Number(t.getAttribute("data-i"))];
          if (it && t.getAttribute("data-bt") === "title") it.title = t.value;
        });
        el.querySelector("#batch-show").addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          el.querySelectorAll("#batch-show button").forEach(function (x) { x.classList.toggle("on", x === b); });
        });
      },
    });
  };

  /* ------------------------------------------------------------- actions */
  A.act["add-ms"] = function (el, e) {
    if (e) e.stopPropagation();
    A.examBatchModal({ mode: "schemes", paperId: el.getAttribute("data-paper") });
  };
  A.act["paper-done"] = function (el, e) {
    if (e) e.stopPropagation();
    var paper = S().get("materials", el.getAttribute("data-id")), me = M.me();
    if (!paper || !me) return;
    UI.confirm("Have you finished “" + paper.title + "”? The marking scheme opens so you can mark your own answers.", { ok: "Yes, I've finished" }).then(function (ok) {
      if (!ok) return;
      S().put("receipts", { id: "pd_" + paper.id + "_" + me.id, kind: "paper-done", paperId: paper.id, studentId: me.id, doneAt: Date.now() });
      UI.toast("Marking scheme unlocked");
      A.render();
      var ms = M.markSchemeFor(paper.id);
      if (ms) A.openMaterial(ms);
    });
  };
})(window.App);
