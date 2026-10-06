/* Tutor content (teachers and the admin): what the tutor has for each topic of a subject.
 * The topics come from the syllabus (and what to study in each, once the syllabus PDF has been
 * read: js/sylread.js). For every topic the teacher can see which pages of which documents the
 * tutor shows, add notes for just that topic, or change the pages. A whole textbook or set of notes
 * can be read at once: the tutor finds which pages are about which topic, and the teacher checks
 * them in "Pages per topic".
 * A document's pages are kept on it as topicPages: { topicId: [[from, to], …] } (PDF page numbers). */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  function sylOf(m) { var c = M.cls(m.classId); return m.syllabusId || (c && c.syllabusId) || ""; }
  function mySubjects(me) {
    var ids = [];
    M.myClasses(me).forEach(function (c) { if (c.syllabusId && ids.indexOf(c.syllabusId) < 0) ids.push(c.syllabusId); });
    return ids.map(M.syllabus).filter(Boolean).sort(function (a, b) { return a.subject.localeCompare(b.subject); });
  }
  /** The documents of a subject the tutor can teach from. */
  M.tutorDocs = function (sylId) {
    return S().filter("materials", function (m) { return sylOf(m) === sylId && M.tutorable(m); })
      .sort(function (a, b) { return a.title.localeCompare(b.title, undefined, { numeric: true }); });
  };
  /** For each topic of a subject: [{ m, r: ranges }] and how many flashcards. */
  function coverage(syl, docs) {
    var out = {};
    syl.topics.forEach(function (t) { out[t.id] = { docs: [], cards: 0 }; });
    docs.forEach(function (m) {
      var tp = M.matTopicPages(m, null);
      Object.keys(tp).forEach(function (tid) { if (out[tid] && tp[tid].length) out[tid].docs.push({ m: m, r: tp[tid] }); });
      (m.tutorCardTopics || []).forEach(function (tid) { if (out[tid]) out[tid].cards++; });
    });
    return out;
  }
  /** Topics of a teacher's subjects with nothing for the tutor yet (for the home page). */
  M.topicsWithoutNotes = function (me) {
    var n = 0;
    mySubjects(me).forEach(function (syl) {
      var cov = coverage(syl, M.tutorDocs(syl.id));
      syl.topics.forEach(function (t) { if (!cov[t.id].docs.length) n++; });
    });
    return n;
  };

  A.route("t/tutor", function (p, q, me) {
    var subjects = mySubjects(me);
    if (!subjects.length) return { title: "Tutor content", html: A.subjectScopeBar(me) + '<div class="card">' + UI.empty("cap", "No subjects yet", "Subjects appear here once you teach a class.") + "</div>" };
    var syl = M.syllabus(q.s) && subjects.some(function (s) { return s.id === q.s; }) ? M.syllabus(q.s) : subjects[0];
    var docs = M.tutorDocs(syl.id), cov = coverage(syl, docs), only = q.f === "missing";
    var topics = syl.topics; // in the syllabus's own order
    var ready = topics.filter(function (t) { return cov[t.id].docs.length; }).length, pct = topics.length ? Math.round(ready / topics.length * 100) : 0;
    var withOutline = topics.filter(function (t) { return t.outline && t.outline.length; }).length;

    var html = A.subjectScopeBar(me) + '<div class="row wrap mb tutor-admin-head"><select class="select" data-change="tutor-subject" aria-label="Subject">' +
      subjects.map(function (s) { return '<option value="' + s.id + '"' + (s.id === syl.id ? " selected" : "") + ">" + esc(s.subject + (s.code ? " " + s.code : "") + " · " + M.boardName(s)) + "</option>"; }).join("") + "</select>" +
      '<span class="grow"></span><button class="btn" data-act="tutor-add" data-syl="' + syl.id + '" data-whole="1">' + I("upload") + "Read a whole book or notes</button>" +
      (me.isAdmin ? '<button class="btn" data-act="syl-read-pdf" data-syl="' + syl.id + '">' + I("layers") + "Read topics from the syllabus</button>" : "") + "</div>" +
      '<div class="card card-pad mb"><div class="row spread wrap"><div><b>' + ready + " of " + topics.length + " topics</b> have notes for the tutor" +
      (withOutline ? "" : '<div class="small muted mt-sm">' + (me.isAdmin ? "Read the syllabus PDF to show what to study in each topic." : "The admin can read the syllabus PDF to show what to study in each topic.") + "</div>") + "</div>" +
      '<div class="pill-tabs sm" style="margin:0"><button class="' + (only ? "" : "on") + '" data-act="goto" data-href="#/t/tutor?s=' + syl.id + '">All topics</button><button class="' + (only ? "on" : "") + '" data-act="goto" data-href="#/t/tutor?s=' + syl.id + '&f=missing">Need notes (' + (topics.length - ready) + ")</button></div></div>" +
      '<div class="mt-sm">' + UI.bar(pct, pct >= 100 ? "good" : "") + "</div>" +
      '<p class="small muted mt">For each topic, add notes, summary notes or flashcards (the whole document goes with that topic), or read a whole textbook and the tutor finds its pages for each topic. Students see the pages whole, in order, then practise with flashcards and a quick check.</p></div>';

    html += '<div class="card mb">' + topics.filter(function (t) { return !only || !cov[t.id].docs.length; }).map(function (t, i) {
      var c = cov[t.id], has = c.docs.length, tests = S().filter("materials", function (m) { return m.kind === "pastpaper" && m.topicId === t.id; }).length;
      return '<div class="list-row tutor-topic"><div class="tutor-num tnum">' + (syl.topics.indexOf(t) + 1) + "</div>" +
        '<div class="grow"><div class="title">' + esc(t.title) + "</div>" +
        '<div class="meta">' + (has ? c.docs.map(function (d) { return '<span class="chip-doc" data-tip="' + esc(d.m.title) + '">' + I("file") + esc(d.m.title.length > 34 ? d.m.title.slice(0, 32) + "…" : d.m.title) + " · p. " + esc(M.pagesText(d.r)) + "</span>"; }).join("") : '<span class="warn-text">No notes yet</span>') +
        (c.cards ? '<span class="sep"></span><span>Flashcards</span>' : "") +
        (tests ? '<span class="sep"></span><span>' + tests + " topic test" + (tests === 1 ? "" : "s") + "</span>" : "") + "</div>" +
        (t.outline && t.outline.length ? '<details class="tutor-outline mt-sm"><summary class="small">' + I("list") + " What to study (" + t.outline.length + " part" + (t.outline.length === 1 ? "" : "s") + ")</summary>" + A.outlineHtml(t, true) + "</details>" : "") + "</div>" +
        '<div class="row wrap tutor-topic-btns"><button class="btn btn-sm' + (has ? "" : " btn-primary") + '" data-act="tutor-add" data-syl="' + syl.id + '" data-topic="' + t.id + '">' + I("plus") + "Add notes</button>" +
        (docs.length ? '<button class="btn btn-sm btn-ghost" data-act="tutor-topic-pages" data-syl="' + syl.id + '" data-topic="' + t.id + '">' + I("layers") + "Pages</button>" : "") + "</div></div>";
    }).join("") + (only && ready === topics.length ? UI.empty("checkCircle", "Every topic has notes", "") : "") + "</div>";

    html += '<div class="section-title"><h2>' + I("file") + " Documents the tutor reads</h2></div>" +
      '<div class="card">' + (docs.length ? docs.map(function (m) {
        var tp = M.matTopicPages(m, null), n = Object.keys(tp).length, read = m.tutorFileId || m.topicPages;
        return '<div class="list-row"><div class="grow"><div class="title">' + esc(m.title) + '</div><div class="meta"><span>' + esc(M.MAT_CATS[M.matCategory(m)] || "Notes") + "</span>" +
          (m.pageCount ? '<span class="sep"></span><span>' + m.pageCount + " pages</span>" : "") +
          '<span class="sep"></span><span>' + (read ? n + " topic" + (n === 1 ? "" : "s") + (m.topicPagesBy === "hand" ? " (checked)" : "") : "Not read yet") + "</span>" +
          (m.tutorCards ? '<span class="sep"></span><span>' + m.tutorCards + " flashcards</span>" : "") + "</div></div>" +
          (read ? '<button class="btn btn-sm" data-act="tutor-pages" data-id="' + m.id + '">' + I("layers") + "Pages per topic</button>" : '<button class="btn btn-sm" data-act="tutor-read-mat" data-id="' + m.id + '">' + I("cap") + "Read for the tutor</button>") + "</div>";
      }).join("") : UI.empty("file", "No notes for " + syl.subject + " yet", "Add notes for a topic above, or read a whole textbook.")) + "</div>";
    return { title: "Tutor content", html: html };
  }, { role: "teacher" });

  A.act["tutor-subject"] = function (el) { location.hash = "#/t/tutor?s=" + el.value; };

  /** Add notes for one topic (the whole document goes with it), or a whole book to be read. */
  A.act["tutor-add"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-syl")), t = M.topic(syl, el.getAttribute("data-topic"));
    if (t) {
      A.materialModal({ syllabusId: syl.id, topicId: t.id, category: "notes", title: "Add notes for " + t.title,
        intro: "The whole document goes with <b>" + esc(t.title) + "</b>: the tutor shows its pages in order and makes flashcards from it. For a book or notes on many topics, use <b>Read a whole book or notes</b>." });
    } else {
      A.materialModal({ syllabusId: syl.id, category: "book",
        title: "Read a whole book or notes", intro: "Choose a textbook or a set of notes for " + esc(syl.subject) + ". The tutor reads every page, finds which pages are about which topic, and then you can check them in <b>Pages per topic</b>. A big book takes a minute or two." });
    }
  };

  /* ------------------------------------------------------------ pages per topic, for one document */
  function previewer(el) {
    var pv = null;
    return {
      show: function (m, ranges) {
        var host = el.querySelector(".tp-preview"); if (!host) return;
        host.classList.remove("hidden");
        if (pv) { pv.destroy(); pv = null; }
        A.Files.get(m.fileId).then(function (rec) { return rec && rec.blob ? rec : A.Sync && navigator.onLine ? A.Sync.fetchFile(m.fileId, true) : null; }).then(function (rec) {
          if (!rec || !rec.blob) { host.innerHTML = '<div class="pdf-msg">' + I("wifiOff") + " The file isn't on this device.</div>"; return; }
          pv = A.PdfView.open(host, rec.blob, { pages: M.pageList(ranges) });
        });
      },
      close: function () { if (pv) pv.destroy(); pv = null; },
    };
  }
  A.act["tutor-pages"] = function (el, e) {
    if (e) e.stopPropagation();
    var m = S().get("materials", el.getAttribute("data-id")); if (!m) return;
    var syl = M.syllabus(sylOf(m)); if (!syl) { UI.toast("Choose a subject for it first", "bad"); return; }
    var tp = M.matTopicPages(m, null), max = m.pageCount || null, pv;
    UI.modal({
      title: "Pages per topic", size: "wide",
      body: '<p class="muted"><b>' + esc(m.title) + "</b>" + (max ? " · " + max + " pages" : "") + ". Type the pages about each topic, like <b>3-7, 12</b> (the PDF's own page numbers: 1 is the first page of the file). Leave a topic empty when the document has nothing on it.</p>" +
        (m.topicPagesBy !== "hand" && m.topicPages ? '<div class="callout mt">' + I("info") + "<div>These pages were found by the tutor. Check them: a page can be in more than one topic.</div></div>" : "") +
        '<div class="tp-list mt">' + syl.topics.map(function (t, i) {
          return '<label class="tp-row"><span class="tutor-num tnum">' + (i + 1) + '</span><span class="grow">' + esc(t.title) + '</span><input class="input sm" data-t="' + t.id + '" value="' + esc(M.pagesText(tp[t.id])) + '" placeholder="none" inputmode="numeric" aria-label="Pages about ' + esc(t.title) + '">' +
            '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-view="' + t.id + '" data-tip="See these pages" aria-label="See these pages">' + I("eye") + "</button></label>";
        }).join("") + "</div>" +
        '<div class="pdf-host tp-preview hidden mt"></div>',
      foot: [{ label: "Find the pages again", cls: "btn-ghost", icon: "refresh", onClick: function () {
        UI.confirm("Let the tutor find the pages again? The pages typed here are replaced.", { ok: "Find again" }).then(function (ok) {
          if (!ok) return;
          S().patch("materials", m.id, { topicPagesBy: "scan" });
          A.tutorRead(S().get("materials", m.id));
        });
      } }, { label: "Cancel" }, { label: "Save pages", cls: "btn-primary", icon: "check", onClick: function (box) {
        var pages = {}, bad = null;
        box.querySelectorAll("[data-t]").forEach(function (inp) {
          var r = M.parsePages(inp.value, max);
          inp.classList.toggle("invalid", r === null);
          if (r === null) { if (!bad) bad = inp; return; }
          if (r.length) pages[inp.getAttribute("data-t")] = r;
        });
        if (bad) { UI.toast("Those pages can't be read" + (max ? " (the document has " + max + " pages)" : "") + ". Type them like 3-7, 12", "bad"); bad.focus(); return false; }
        S().patch("materials", m.id, { topicPages: pages, topicPagesBy: "hand", tutorTopics: M.tutorTopicsOf(pages, (m.tutorCardTopics || []).map(function (t) { return { topicId: t }; })) });
        UI.toast("Pages saved: students see them in the tutor");
        if (pv) pv.close();
        A.render();
      } }],
      onMount: function (box) {
        pv = previewer(box);
        box.addEventListener("click", function (ev) {
          var b = ev.target.closest("[data-view]"); if (!b) return;
          ev.preventDefault();
          var inp = box.querySelector('[data-t="' + b.getAttribute("data-view") + '"]'), r = M.parsePages(inp.value, max);
          if (!r || !r.length) { UI.toast(r ? "No pages for this topic yet" : "Type the pages like 3-7, 12", r ? "" : "bad"); return; }
          pv.show(m, r);
          box.querySelector(".tp-preview").scrollIntoView({ block: "nearest" });
        });
      },
      onClose: function () { if (pv) pv.close(); },
    });
  };

  /* ------------------------------------------------------------ pages of every document, for one topic */
  A.act["tutor-topic-pages"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-syl")), t = M.topic(syl, el.getAttribute("data-topic")); if (!t) return;
    var docs = M.tutorDocs(syl.id), pv;
    UI.modal({
      title: "Pages for " + t.title, size: "wide",
      body: '<p class="muted">Which pages of each document are about <b>' + esc(t.title) + "</b>? Type them like <b>3-7, 12</b>, or leave empty.</p>" +
        (t.outline && t.outline.length ? '<details class="mt"><summary class="small bold">' + I("list") + " What to study</summary>" + A.outlineHtml(t, true) + "</details>" : "") +
        '<div class="tp-list mt">' + docs.map(function (m) {
          var r = M.matTopicPages(m, null)[t.id];
          return '<label class="tp-row"><span class="grow">' + esc(m.title) + ' <span class="tiny muted">' + esc(M.MAT_CATS[M.matCategory(m)] || "") + (m.pageCount ? " · " + m.pageCount + " pages" : "") + "</span></span>" +
            '<input class="input sm" data-m="' + m.id + '" value="' + esc(M.pagesText(r)) + '" placeholder="none" inputmode="numeric" aria-label="Pages of ' + esc(m.title) + '">' +
            '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-view="' + m.id + '" data-tip="See these pages" aria-label="See these pages">' + I("eye") + "</button></label>";
        }).join("") + "</div>" + '<div class="pdf-host tp-preview hidden mt"></div>',
      foot: [{ label: "Cancel" }, { label: "Save pages", cls: "btn-primary", icon: "check", onClick: function (box) {
        var bad = null, changes = [];
        box.querySelectorAll("[data-m]").forEach(function (inp) {
          var m = S().get("materials", inp.getAttribute("data-m")), r = M.parsePages(inp.value, m.pageCount || null);
          inp.classList.toggle("invalid", r === null);
          if (r === null) { if (!bad) bad = inp; return; }
          var tp = Object.assign({}, M.matTopicPages(m, null));
          if (M.pagesText(tp[t.id]) === M.pagesText(r)) return;
          if (r.length) tp[t.id] = r; else delete tp[t.id];
          changes.push([m, tp]);
        });
        if (bad) { UI.toast("Those pages can't be read. Type them like 3-7, 12", "bad"); bad.focus(); return false; }
        changes.forEach(function (x) {
          S().patch("materials", x[0].id, { topicPages: x[1], topicPagesBy: "hand", tutorTopics: M.tutorTopicsOf(x[1], (x[0].tutorCardTopics || []).map(function (k) { return { topicId: k }; })) });
        });
        UI.toast(changes.length ? "Pages saved" : "Nothing changed");
        if (pv) pv.close();
        A.render();
      } }],
      onMount: function (box) {
        pv = previewer(box);
        box.addEventListener("click", function (ev) {
          var b = ev.target.closest("[data-view]"); if (!b) return;
          ev.preventDefault();
          var m = S().get("materials", b.getAttribute("data-view")), inp = box.querySelector('[data-m="' + m.id + '"]'), r = M.parsePages(inp.value, m.pageCount || null);
          if (!r || !r.length) { UI.toast(r ? "No pages typed for this document" : "Type the pages like 3-7, 12", r ? "" : "bad"); return; }
          pv.show(m, r);
        });
      },
      onClose: function () { if (pv) pv.close(); },
    });
  };
})(window.App);
