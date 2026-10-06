/* Reading notes for the tutor.
 * Notes, summary notes, flashcard PDFs and textbooks uploaded to the library are read into:
 *   topicPages which pages are about which syllabus topic ({ topicId: [[from, to], …] }): the tutor
 *             shows a topic's pages whole, and the admin can change them in Tutor content
 *   sections  a heading and what follows it, where it sits on the page (so the tutor shows it as
 *             printed, diagrams and all) and its key points
 *   cards     flashcards: "term: definition" and "term – definition" lines, bold terms followed
 *             by their meaning, two-column tables (term | meaning), "Q: … A: …" pairs, and
 *             sentences of the form "X is a …"
 * and each section is matched to the syllabus topic it is about.
 * A.NoteScan.scan(blob, syllabus, topicId?, opts?) → Promise of { v, pages, sizes, sections, cards, topicPages }
 * opts.cards false: pages only (textbooks: their sentences would make poor flashcards) */
(function (A) {
  "use strict";
  var VERSION = 2, MAX_PAGES = 800;

  function readPage(doc, n) {
    return doc.getPage(n).then(function (p) {
      var vp = p.getViewport({ scale: 1 });
      // the fonts' names say which text is bold (headings, terms)
      return p.getOperatorList().then(function () { return p.getTextContent(); }, function () { return p.getTextContent(); }).then(function (tc) {
        var items = [];
        tc.items.forEach(function (it) {
          var s = it.str, t = it.transform;
          if (!s || !s.trim() || Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) return;
          var h = Math.abs(t[3]) || it.height || 10, font = null;
          try { if (p.commonObjs.has(it.fontName)) font = p.commonObjs.get(it.fontName); } catch (e) { /* not loaded */ }
          var fname = (font && (font.name || font.loadedName)) || "";
          items.push({ s: s, x: t[4], y: vp.height - t[5], w: it.width, h: h, bold: !!(font && font.bold) || /bold|black|heavy|semibold|demi/i.test(fname) });
        });
        return { n: n, w: vp.width, h: vp.height, items: items };
      });
    });
  }

  /** Lines, with the size of their text and whether they are bold. */
  function lines(items) {
    var its = items.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }), out = [];
    its.forEach(function (it) {
      var l = out.length ? out[out.length - 1] : null;
      if (l && Math.abs(l.y - it.y) <= Math.max(2.5, it.h * 0.3)) l.items.push(it); else out.push({ y: it.y, items: [it] });
    });
    out.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      l.x = l.items[0].x;
      l.x2 = Math.max.apply(null, l.items.map(function (i) { return i.x + i.w; }));
      l.h = Math.max.apply(null, l.items.map(function (i) { return i.h; }));
      var chars = 0, boldChars = 0;
      l.items.forEach(function (i) { chars += i.s.length; if (i.bold) boldChars += i.s.length; });
      l.bold = chars > 0 && boldChars / chars > 0.6;
      l.text = join(l.items);
      // a gap wide enough to be two columns of a table
      l.cols = [];
      var cur = [l.items[0]];
      for (var k = 1; k < l.items.length; k++) {
        var prev = l.items[k - 1], it = l.items[k];
        if (it.x - (prev.x + prev.w) > 28) { l.cols.push(cur); cur = [it]; } else cur.push(it);
      }
      l.cols.push(cur);
      l.cols = l.cols.map(function (c) { return { x: c[0].x, text: join(c), bold: c.every(function (i) { return i.bold; }) }; });
    });
    return out;
  }
  function join(items) {
    var s = "";
    items.forEach(function (it, i) {
      var prev = items[i - 1];
      if (prev && it.x - (prev.x + prev.w) > 1.5 && !/\s$/.test(s) && !/^\s/.test(it.s)) s += " ";
      s += it.s;
    });
    return s.replace(/\s+/g, " ").trim();
  }

  var BULLET = /^([•●▪■◦○▸►–\-*·]|\d{1,2}[.)]|[a-h][.)]|\([a-h]\)|\([ivx]+\))\s+/;
  var PRONOUN = /^(it|this|that|these|those|they|there|he|she|we|you|i|one|each|some|many|most|all|both|such|which|what|when|where|how|why)\b/i;

  /* ------------------------------------------------------------ words, for matching topics */
  var STOP = {};
  ("the a an and or of to in on at by for from with as is are was were be been it its this that these those they them their there " +
    "which what when where how why has have had do does did not no can may will would should could than then so such into onto also more most " +
    "use used using one two three each other some any all very only about between during over under after before notes note page topic chapter summary").split(" ").forEach(function (w) { STOP[w] = 1; });
  function stem(w) { return w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, ""); }
  function words(s) { return (String(s || "").toLowerCase().match(/[a-z]{3,}/g) || []).filter(function (w) { return !STOP[w]; }).map(stem); }
  function bag(list, weight, into) { into = into || {}; list.forEach(function (w) { into[w] = (into[w] || 0) + weight; }); return into; }

  /** The syllabus topic a piece of notes is about, or null when it isn't clear. */
  var THEIRS = {};
  function topicWords(t) {
    // the topic's title and summary, and what the syllabus says to study (its outline), if read
    var key = t.id + "|" + (t.outline ? t.outline.length : 0), got = THEIRS[key];
    if (got) return got;
    got = bag(words(t.title), 3, bag(words(t.summary), 2));
    (t.outline || []).forEach(function (o) { bag(words(o.title), 2, got); (o.points || []).forEach(function (p) { bag(words(p), 0.5, got); }); });
    THEIRS[key] = got;
    return got;
  }
  function bestTopic(syl, title, text) {
    if (!syl || !syl.topics || !syl.topics.length) return null;
    var mine = bag(words(title), 3, bag(words(text).slice(0, 400), 1));
    var best = null, second = 0, bestScore = 0;
    syl.topics.forEach(function (t) {
      var theirs = topicWords(t);
      var score = 0;
      Object.keys(mine).forEach(function (w) { if (theirs[w]) score += Math.min(mine[w], 6) * theirs[w]; });
      score = score / Math.sqrt(Object.keys(theirs).length + 1);
      if (score > bestScore) { second = bestScore; bestScore = score; best = t; } else if (score > second) second = score;
    });
    return best && bestScore >= 2 && bestScore >= second * 1.25 ? best.id : null;
  }

  /** A heading that names a topic ("Chapter 6 Plant nutrition", "5 Enzymes"): every word of the
   *  topic's title is in it. The topic with the most such words wins; a tie is no answer. */
  function titleTopic(syl, heading) {
    if (!syl || !heading || heading.split(" ").length > 14) return null;
    var hw = words(heading), best = null, bestN = 0, tie = false;
    if (!hw.length) return null;
    syl.topics.forEach(function (t) {
      var tw = words(t.title).filter(function (w, i, a) { return a.indexOf(w) === i; });
      if (!tw.length) return;
      var n = tw.filter(function (w) { return hw.indexOf(w) >= 0; }).length;
      if (n < tw.length && !(tw.length >= 3 && n / tw.length >= 0.66)) return;
      if (n > bestN) { best = t; bestN = n; tie = false; } else if (n === bestN) tie = true;
    });
    return best && !tie ? best.id : null;
  }

  /* ------------------------------------------------------------ flashcards */
  function clean(s) { return String(s || "").replace(BULLET, "").replace(/\s+/g, " ").trim(); }
  function cardFrom(point, boldLead) {
    var t = clean(point), m;
    if (t.length < 8) return null;
    // "Q: … A: …" in one point
    if ((m = /^(?:q|question)\s*[:.]\s*(.{5,}?)\s+(?:a|answer)\s*[:.]\s*(.{2,})$/i.exec(t))) return { front: m[1], back: m[2], kind: "qa" };
    // a bold term at the start: "Osmosis the movement of water…"
    if (boldLead && boldLead.length >= 2 && boldLead.length <= 60 && t.length > boldLead.length + 8 && t.indexOf(boldLead) === 0) {
      var rest = t.slice(boldLead.length).replace(/^[\s:–—\-=]+/, "").trim();
      if (words(rest).length >= 2) return { front: boldLead.replace(/[:–—\-=\s]+$/, ""), back: rest, kind: "term" };
    }
    // "Term: definition", "Term – definition", "Term - definition", "Term = definition"
    if ((m = /^([^:–—=]{2,50}?)\s*(?::|\s[–—-]\s|=)\s*(.{8,})$/.exec(t)) && m[1].split(/\s+/).length <= 6 && !PRONOUN.test(m[1]) && words(m[2]).length >= 2) {
      return { front: m[1].trim(), back: m[2].trim(), kind: "term" };
    }
    // "Diffusion is the net movement of…"
    if ((m = /^([A-Z][\w'’\-()]*(?:\s+[\w'’\-()]+){0,4}?)\s+(is|are|means|refers to|is called|is defined as)\s+((?:the|a|an)\s.{8,})$/.exec(t)) && !PRONOUN.test(m[1])) {
      return { front: m[1].trim(), back: m[3].replace(/\.$/, "").trim(), kind: "def", verb: m[2] };
    }
    return null;
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  /* ------------------------------------------------------------ the whole document */
  function build(P, syl, topicId, opts) {
    opts = opts || {};
    var all = [];
    P.forEach(function (p) {
      var ls = lines(p.items);
      // page furniture: page numbers, repeated headers and footers
      ls = ls.filter(function (l) { return !(/^\d{1,3}$/.test(l.text) && (l.y < 60 || l.y > p.h - 50)) && !/^(page \d+( of \d+)?|©.*|www\.\S+)$/i.test(l.text); });
      ls.forEach(function (l) { l.page = p.n; all.push(l); });
    });
    // the body text size, and what counts as a heading
    var sizes = [];
    all.forEach(function (l) { for (var i = 0; i < Math.min(l.text.length, 200); i++) sizes.push(Math.round(l.h * 2) / 2); });
    sizes.sort(function (a, b) { return a - b; });
    var body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 11;
    var tableRows = all.filter(function (l) { return l.cols.length === 2 && words(l.cols[0].text).length && l.cols[0].text.split(" ").length <= 8; }).length;
    var isTable = tableRows >= Math.max(4, all.length * 0.35); // a two-column flashcard table
    // contents and index pages list every topic with page numbers: they belong to no topic
    var listPage = {}, perPage = {};
    all.forEach(function (l) { var k = perPage[l.page] = perPage[l.page] || { n: 0, refs: 0 }; k.n++; if (/[A-Za-z].*\s\.*\s*\d{1,3}(,\s*\d{1,3})*$/.test(l.text)) k.refs++; });
    Object.keys(perPage).forEach(function (p) { if (perPage[p].refs >= 3 && perPage[p].refs >= perPage[p].n * 0.4) listPage[p] = 1; });
    var BACK = /^(contents|table of contents|index|glossary|answers|acknowledg\w*|about (this|the) (book|author)s?|preface|how to use this book|introduction|foreword)$/i;
    function heading(l, i) {
      var t = l.text;
      if (t.length > 90 || t.length < 2 || /[.,;]$/.test(t) || BULLET.test(t) || /^\d+(\.\d+)?$/.test(t)) return 0;
      if (isTable && l.cols.length > 1) return 0;
      if (l.h >= body * 1.45) return 1;
      if (l.h >= body * 1.15) return 2;
      if (/^(\d+(\.\d+){0,2}|[IVX]+\.|topic \d+|unit \d+|chapter \d+)\s+[A-Z]/i.test(t) && t.split(" ").length <= 12) return 2;
      if (l.bold && t.split(" ").length <= 10 && !/:\s*\S/.test(t)) {
        var next = all[i + 1];
        return next && !next.bold ? 3 : 0;
      }
      return 0;
    }
    var sections = [], cur = null;
    function open(title, level, l) {
      cur = { title: title, level: level, lines: [], clips: [[l.page, Math.max(0, Math.round(l.y - l.h - 6)), null]] };
      sections.push(cur);
    }
    all.forEach(function (l, i) {
      var lv = heading(l, i);
      if (lv) { open(l.text, lv, l); return; }
      if (!cur) open("", 9, l);
      if (cur.clips[cur.clips.length - 1][0] !== l.page) cur.clips.push([l.page, Math.max(0, Math.round(l.y - l.h - 6)), null]);
      cur.clips[cur.clips.length - 1][2] = Math.round(l.y + 6);
      cur.lines.push(l);
    });
    // a heading directly followed by another heading: the empty one joins the next (a document
    // title stays out of the section's name; a chapter name goes in front of its first heading)
    sections = sections.filter(function (s, i) {
      var nx = sections[i + 1];
      if (s.lines.length || !nx) return true;
      if (s.level >= nx.level && s.title && nx.title) nx.title = s.title + ": " + nx.title;
      else if (!nx.title) nx.title = s.title;
      else { nx.chapter = s.title; nx.level = Math.min(nx.level, s.level); } // "Chapter 6 Plant nutrition" over "Photosynthesis"
      if (nx.clips[0][0] === s.clips[0][0]) nx.clips[0][1] = Math.min(nx.clips[0][1], s.clips[0][1]);
      return false;
    });

    // the topic of each section: a heading naming a topic decides it for what follows, until the next
    // such heading; otherwise a chapter heading (or the first section) is matched by its words
    var current = topicId || null;
    function chooseTopic(s, text) {
      if (topicId) return topicId;
      if (listPage[s.clips[0][0]] || BACK.test(s.title || "")) { current = null; s.skip = true; return null; }
      var named = (s.chapter && titleTopic(syl, s.chapter)) || (s.title ? titleTopic(syl, s.title) : null);
      if (named) current = named;
      else if (!current || s.level <= 1) { var bt = bestTopic(syl, (s.chapter ? s.chapter + " " : "") + s.title, text); if (bt) current = bt; }
      return current;
    }
    var cards = [], seen = {};
    function addCard(c, s, sIdx) {
      if (!c || opts.cards === false) return;
      // labels and whole statements are not terms to learn
      if (/^(diagram|figure|fig\.?|note|notes|example|e\.?g\.?|table|key|tip|remember|hint|source|see|answer|question)$/i.test(c.front.trim())) return;
      if (c.kind === "term" && /\s(is|are|was|were|has|have|can|will)\s/i.test(" " + c.front + " ")) return;
      c.front = c.front.slice(0, 160); c.back = c.back.slice(0, 400);
      var key = c.front.toLowerCase() + "|" + c.back.toLowerCase().slice(0, 40);
      if (seen[key]) return;
      seen[key] = 1;
      c.id = "k" + hash(key); c.section = sIdx; c.topicId = s.topicId || null;
      cards.push(c);
    }
    var out = sections.map(function (s, sIdx) {
      // points: bullets (with their wrapped lines) and sentences
      var pts = [], cur2 = null, qa = null;
      s.lines.forEach(function (l) {
        var t = l.text;
        if (isTable && l.cols.length === 2) {
          // a line close under the last row is that row wrapping onto a second line
          var lastRow = cur2 && cur2.table ? cur2 : null, lastCard = cards[cards.length - 1];
          if (lastRow && lastRow.y != null && l.y - lastRow.y <= l.h * 1.5 && lastCard && lastCard.kind === "table") {
            lastCard.front += " " + l.cols[0].text; lastCard.back = (lastCard.back + " " + l.cols[1].text).slice(0, 400);
            lastRow.text = lastCard.front + ": " + lastCard.back; lastRow.y = l.y; return;
          }
          addCard({ front: l.cols[0].text, back: l.cols[1].text, kind: "table" }, s, sIdx);
          cur2 = { text: l.cols[0].text + ": " + l.cols[1].text, table: true, y: l.y }; pts.push(cur2); return;
        }
        if (isTable && cur2 && cur2.table && l.cols.length === 1 && l.x > (s.lines[0] ? s.lines[0].x : 0) + 40) {
          // a wrapped line in the meaning column
          var last = cards[cards.length - 1]; if (last) last.back = (last.back + " " + t).slice(0, 400);
          cur2.text += " " + t; cur2.y = l.y; return;
        }
        var q = /^(?:q\d*|question\s*\d*)\s*[:.)]\s*(.+)$/i.exec(t), a = /^(?:a|ans|answer)\s*[:.)]\s*(.+)$/i.exec(t);
        if (q) { qa = { front: q[1], back: "" }; return; }
        if (a && qa) { qa.back = a[1]; addCard({ front: qa.front, back: qa.back, kind: "qa" }, s, sIdx); qa = null; return; }
        var lead = l.items[0] && l.items[0].bold && !l.bold ? l.cols[0] && join(l.items.filter(function (i) { return i.bold; }).slice(0, 4)) : null;
        if (BULLET.test(t) || lead || !cur2 || /[.!?:]$/.test(cur2.text) || l.x < cur2.x - 4) {
          cur2 = { text: t, x: l.x, lead: lead }; pts.push(cur2);
        } else { cur2.text += " " + t; }
      });
      var text = pts.map(function (p) { return p.text; }).join("\n");
      s.topicId = chooseTopic(s, text);
      pts.forEach(function (p) {
        if (p.table) return; // table rows made their cards already
        // long paragraphs: their sentences
        var parts = p.text.length > 220 ? p.text.replace(/([.!?])\s+(?=[A-Z])/g, "$1\u0001").split("\u0001") : [p.text];
        parts.forEach(function (part, k) { addCard(cardFrom(part, k === 0 ? p.lead : null), s, sIdx); });
      });
      return {
        title: s.title || "", level: s.level, topicId: s.topicId, skip: s.skip || undefined, clips: s.clips.filter(function (c) { return c[2] && c[2] - c[1] > 8; }),
        points: pts.map(function (p) { return clean(p.text); }).filter(function (t) { return t.length > 2; }).slice(0, 40).map(function (t) { return t.slice(0, 500); }),
      };
    }).filter(function (s) { return s.points.length || s.clips.length; });
    // a section with no topic of its own takes the topic of the section before it (same chapter)
    var lastTopic = topicId || null;
    out.forEach(function (s) { if (s.skip) lastTopic = null; else if (s.topicId) lastTopic = s.topicId; else if (lastTopic) s.topicId = lastTopic; });
    cards.forEach(function (c) { if (!c.topicId && out[c.section]) c.topicId = out[c.section].topicId; });
    var sizesMap = {};
    P.forEach(function (p) { sizesMap[p.n] = [Math.round(p.w), Math.round(p.h)]; });
    return { v: VERSION, pages: P.length, sizes: sizesMap, sections: out, cards: cards, table: isTable, topicPages: topicPages(P.length, out, topicId) };
  }

  /** Whole pages per topic. A page goes with each topic that has a section on it; a page with no
   *  text of its own (a full-page diagram) goes with the page before it. Notes uploaded for one
   *  topic are all that topic. */
  function topicPages(n, sections, topicId) {
    var out = {};
    if (topicId) { out[topicId] = [[1, n]]; return out; }
    var on = {}, text = {};
    sections.forEach(function (s) {
      s.clips.forEach(function (c) {
        text[c[0]] = 1;
        if (s.topicId && (on[c[0]] = on[c[0]] || []).indexOf(s.topicId) < 0) on[c[0]].push(s.topicId);
      });
    });
    var last = [], list = {};
    for (var p = 1; p <= n; p++) {
      var here = on[p] || (text[p] ? [] : last);
      here.forEach(function (t) { (list[t] = list[t] || []).push(p); });
      if (here.length) last = [here[here.length - 1]]; else if (text[p]) last = [];
    }
    Object.keys(list).forEach(function (t) { out[t] = ranges(list[t]); });
    return out;
  }
  function ranges(pages) {
    var out = [];
    pages.slice().sort(function (a, b) { return a - b; }).forEach(function (p) {
      var r = out[out.length - 1];
      if (r && p <= r[1] + 1) r[1] = Math.max(r[1], p); else out.push([p, p]);
    });
    return out;
  }

  A.NoteScan = {
    VERSION: VERSION,
    scan: function (blob, syl, topicId, opts) {
      opts = opts || {};
      return A.PdfView.doc(blob).then(function (doc) {
        var list = [];
        for (var i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) list.push(i);
        return list.reduce(function (p, n) {
          return p.then(function (acc) {
            return readPage(doc, n).then(function (pg) { acc.push(pg); if (opts.progress) opts.progress(n, list.length); return acc; }, function () { acc.push({ n: n, w: 595, h: 842, items: [] }); return acc; });
          });
        }, Promise.resolve([]))
          .then(function (P) { doc.destroy(); return build(P, syl, topicId, opts); }, function (e) { doc.destroy(); throw e; });
      });
    },
    ranges: ranges,
    lines: lines,
    readPage: readPage,
    /** Read a library item for the tutor and keep the result as a file with the item. */
    forMaterial: function (mat, opts) {
      var c = A.M.cls(mat.classId), syl = A.M.syllabus(mat.syllabusId || (c && c.syllabusId));
      return A.Files.get(mat.fileId).then(function (rec) {
        if (!rec || !rec.blob) return A.Sync && A.Sync.fetchFile ? A.Sync.fetchFile(mat.fileId, true) : null;
        return rec;
      }).then(function (rec) {
        if (!rec || !rec.blob) throw new Error("The file isn't on this device");
        return A.NoteScan.scan(rec.blob, syl, mat.topicId || null, { cards: A.M.matCategory(mat) !== "book", progress: opts && opts.progress });
      }).then(function (scan) {
        var file = new File([JSON.stringify(scan)], (mat.fileName || "notes").replace(/\.pdf$/i, "") + ".tutor.json", { type: "application/json" });
        return A.Files.fromInput(file).then(function (fr) {
          // pages the admin set by hand stay as they are
          var cur = A.Store.get("materials", mat.id) || mat, pages = cur.topicPagesBy === "hand" && cur.topicPages ? cur.topicPages : scan.topicPages;
          A.Store.patch("materials", mat.id, { tutorFileId: fr.id, tutorTopics: A.M.tutorTopicsOf(pages, scan.cards), tutorSections: scan.sections.length, tutorCards: scan.cards.length, tutorAt: Date.now(),
            topicPages: pages, topicPagesBy: cur.topicPagesBy === "hand" ? "hand" : "scan", pageCount: scan.pages, tutorCardTopics: A.M.tutorTopicsOf({}, scan.cards) });
          return scan;
        });
      });
    },
    _test: { cardFrom: cardFrom, bestTopic: bestTopic, titleTopic: titleTopic, words: words },
  };
})(window.App);
