/* Reading a syllabus PDF (Cambridge and similar): its subject content, topic by topic.
 * The "Subject content" section of a syllabus lists the topics ("1 Characteristics and
 * classification of living organisms"), their parts ("1.1 Characteristics of living organisms") and
 * what candidates should be able to do in each ("Describe the characteristics of living organisms…").
 * Tables with a Supplement (or Extended) column keep those points apart, and Core/Extended
 * sections of the same topic (C1 / E1) are joined.
 * The admin reads the PDF in Tutor content; the topics of the subject then get:
 *   outline: [{ n: "1.1", title, points: [..], sup: [..] }]  (what to study, shown to students)
 * and topics the app doesn't have yet are added. Topics keep their ids, so progress stays.
 * A.SylRead.read(blob) → Promise of { title, code, topics: [{ n, title, outline }], pages: [from, to] } */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  var START = /^(?:\d{1,2}\.?\s+)?(?:subject content|syllabus content|content overview and subject content|topic content|the subject content)$/i;
  var END = /^(?:\d{1,2}\.?\s+)?(?:details of the assessment|assessment overview|what else you need to know|appendix(?:\s+\d+)?|glossary of command words|command words|practical assessment|mathematical requirements|safety in the laboratory|notes for use in qualitative analysis|assessment objectives|scheme of assessment|coursework|changes to this syllabus.*)$/i;
  var SKIP = /^((core|extended|supplement) (subject )?content|core|supplement|extended|candidates should be able to:?|learners should be able to:?|notes and guidance|notes and examples|notes|guidance|continued|\(continued\)|subject content|content|topic|sub-?topic)$/i;
  var RIGHT = /^(supplement|extended|notes and guidance|notes and examples|guidance|notes)$/i;
  // "1 Enzymes", "Theme 1: Population and settlement", "C1 Number" / "E1 Number" (Core and Extended),
  // "B1 …", "C1 …", "P1 …" (the Biology, Chemistry and Physics sections of a combined science)
  var TOPIC = /^(?:(?:[Tt]opic|[Tt]heme|[Uu]nit|[Ss]ection)\s+)?([A-Z]?)(\d{1,2})(?:[.:)]|\s*[–—-])?\s+(\S.{2,110})$/;
  var PART = /^([A-Z]?)(\d{1,2})\.(\d{1,2})\.?\s+([A-Z(].{1,140})$/; // not "6.02 × 10²³"
  var SUB = /^(?:[A-Z]?\d{1,2}\.\d{1,2}\.\d{1,2})\.?\s+(\S.*)$/;
  var SECTIONS = { B: "Biology", C: "Chemistry", P: "Physics" };
  // learning outcomes start with a command word; topic names don't
  var VERB = /^(describe|explain|state|define|identify|outline|investigate|list|use|know|understand|recall|suggest|compare|discuss|interpret|draw|show|sketch|deduce|determine|evaluate|apply|recognise|recognize|name|distinguish|relate|construct|plot|select|analyse|analyze|predict|write|convert|solve|find|carry|perform|measure|calculate|demonstrate|classify|appreciate|assess|justify|consider|choose|label|estimate|prove|derive|sketch|obtain)\b/i;
  var POINT = /^(?:\d{1,2}[.)]?|[•●▪■◦○–\-*·]|\([a-z]{1,4}\)|[a-h][.)])\s+/;

  function norm(s) { return String(s || "").toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim(); }

  function readAll(blob, progress) {
    return A.PdfView.doc(blob).then(function (doc) {
      var list = [];
      for (var i = 1; i <= Math.min(doc.numPages, 200); i++) list.push(i);
      return list.reduce(function (p, n) {
        return p.then(function (acc) {
          return A.NoteScan.readPage(doc, n).then(function (pg) { acc.push(pg); if (progress) progress(n, list.length); return acc; }, function () { acc.push({ n: n, w: 595, h: 842, items: [] }); return acc; });
        });
      }, Promise.resolve([])).then(function (P) { doc.destroy(); return P; }, function (e) { doc.destroy(); throw e; });
    });
  }

  /** The lines of the pages, without running headers and footers. */
  function pageLines(P) {
    var L = A.NoteScan.lines, seen = {}, pages = P.map(function (p) {
      var ls = L(p.items);
      ls.forEach(function (l) { l.page = p.n; l.pw = p.w; l.ph = p.h; if (l.y < 75 || l.y > p.h - 70) { var k = norm(l.text); seen[k] = (seen[k] || 0) + 1; } });
      return { p: p, lines: ls };
    });
    var often = Math.max(3, P.length * 0.25);
    pages.forEach(function (pg) {
      pg.lines = pg.lines.filter(function (l) {
        if ((l.y < 75 || l.y > pg.p.h - 70) && seen[norm(l.text)] >= often) return false;
        return !/^(back to contents page|www\.cambridgeinternational\.org.*|©.*|\d{1,3})$/i.test(l.text) && !/syllabus for \d{4}/i.test(l.text);
      });
    });
    return pages;
  }

  function read(blob, progress) {
    return readAll(blob, progress).then(function (P) {
      var pages = pageLines(P);
      var sizes = [];
      pages.forEach(function (pg) { pg.lines.forEach(function (l) { for (var i = 0; i < Math.min(l.text.length, 120); i++) sizes.push(Math.round(l.h * 2) / 2); }); });
      sizes.sort(function (a, b) { return a - b; });
      var body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;

      // the title page: "Cambridge IGCSE™ Biology 0610"
      var title = "", code = "";
      (pages[0] ? pages[0].lines : []).forEach(function (l) { var m = /\b(\d{4})\b/.exec(l.text); if (!code && m && /[A-Za-z]/.test(l.text) && !/20\d\d/.test(m[1])) { code = m[1]; title = l.text; } });

      // where the subject content is
      var from = -1, to = pages.length - 1;
      pages.forEach(function (pg, i) {
        if (from < 0 && i > 0 && pg.lines.some(function (l) { return START.test(l.text) && l.h >= body; })) from = i;
      });
      if (from >= 0) {
        for (var k = from + 1; k < pages.length; k++) if (pages[k].lines.some(function (l) { return END.test(l.text) && l.h >= body * 1.05; })) { to = k - 1; break; }
      } else from = 0;
      var topics = build(pages.slice(from, to + 1), body);
      // a topic with no heading of its own in the content pages takes its name from the syllabus's list of topics
      var names = {};
      pages.forEach(function (pg) { pg.lines.forEach(function (l) { l.cols.forEach(function (c) {
        var mm = /^(\d{1,2})\s+([A-Z][^.:;]{2,90}?)(?:\s*\.{2,}.*|\s+\d{1,3})?$/.exec(c.text);
        if (mm && !VERB.test(mm[2]) && !END.test(c.text) && !START.test(c.text) && !names[mm[1]]) names[mm[1]] = mm[2].trim();
      }); }); });
      topics.forEach(function (t) { if (/^Topic \d+$/.test(t.title) && names[t.n]) t.title = names[t.n]; t.title = t.title.replace(/\s*\(for Papers? [\d, and]+\)$/i, ""); });
      return { title: title, code: code, pages: [from + 1, to + 1], topics: topics };
    });
  }

  function build(pages, body) {
    var topics = [], topic = null, part = null, split = null, order = [];
    function isHead(l) { return l.bold || l.h >= body * 1.12; }
    /** The topic a heading or part number belongs to: "E1" joins "C1" (the Extended half of a Core topic). */
    var letters = {};
    function keyOf(prefix, n) {
      prefix = prefix || "";
      if (prefix) letters[prefix] = 1;
      // C and E are Core and Extended ("1 Number", "C1.6", "E1.6" are all topic 1) unless other
      // letters say they are sections (B1, C1, P1 in a combined science)
      var sections = Object.keys(letters).some(function (x) { return x !== "C" && x !== "E"; });
      if (!sections && (prefix === "C" || prefix === "E")) return String(n);
      if (prefix === "E" && topics.some(function (t) { return t.key === "C" + n; })) return "C" + n;
      return prefix + n;
    }
    function openTopic(prefix, n, t) {
      var key = keyOf(prefix, n);
      topic = topics.filter(function (x) { return x.key === key; })[0];
      if (!topic) {
        topic = { key: key, prefix: key.replace(/\d+$/, ""), n: n, title: t, outline: [] }; topics.push(topic);
        if (order.indexOf(topic.prefix) < 0) order.push(topic.prefix);
      } else if (/^Topic \S+$/.test(topic.title) && !/^Topic \S+$/.test(t)) topic.title = t; // named at last
      topic.ext = prefix === "E"; part = null;
    }
    function openPart(prefix, n, sub, t) {
      var key = keyOf(prefix, n);
      if (!topic || topic.key !== key) openTopic(prefix, n, "Topic " + key);
      var id = key.replace(/^[CE](?=\d)/, "") + "." + sub, ext = prefix === "E" || topic.ext;
      part = topic.outline.filter(function (o) { return o.n === id; })[0];
      // a part made up for text before the first numbered part (sub 0) keeps the topic's name
      if (!part) { part = { n: id, title: t, points: [], sup: [], real: sub > 0 }; topic.outline.push(part); part.named = sub === 0 && !!t; }
      else if (/^extended (content )?only\.?$/i.test(part.title) && t) { part.title = t; part.named = false; }
      else part.named = true;
      part.ext = ext; part.at = {};
    }
    /** A line of a point: a new point, or the one before running on (kept apart for each column).
     *  A line after "…limited to:" belongs to that point unless it is an item of its own ((a), •, 1). */
    function addPoint(p, l, supp, page) {
      if (!p) return;
      var t = l.text, key = supp || p.ext ? "sup" : "points", list = p[key], last = list[list.length - 1], at = p.at[key];
      var item = POINT.test(t), bullet = /^[•●▪■◦○–\-*·]\s+/.test(t);
      var fresh = item || !last || /[.;!?]$/.test(last) || !at ||
        (!/:$/.test(last) && at.page === page && (l.x < at.x - 4 || l.y - at.y > l.h * 2.2));
      var under = bullet && last && (/:$/.test(last) || /^• /.test(last));
      if (fresh) list.push((under ? "• " : "") + t.replace(/^\d{1,2}[.)]?\s+(?=[A-Z(])/, "").replace(/^[•●▪■◦○–\-*·]\s+/, "").slice(0, 400));
      else list[list.length - 1] = (last + " " + t).slice(0, 600);
      p.at[key] = { x: l.x, y: l.y, page: page };
    }
    // documents whose topics are plain numbered lines ("1 Terms used in nutrition"), with no parts
    var anyParts = function () { return topics.some(function (t) { return t.outline.some(function (o) { return o.real; }); }); };
    function plainHeading(l, prevY, m) {
      if (m[1] || !/^([A-Z]|[a-z][A-Z])/.test(m[3]) || /[.:;,]$/.test(l.text) || l.text.split(" ").length > 12 || VERB.test(m[3])) return false;
      var n = Number(m[2]), want = topic ? topic.n + 1 : 1;
      if (n !== want) return false;
      // a plain numbered line is a topic when its parts follow ("2 Biological molecules" … "2.1 Testing …"),
      // or, in a document without parts, when it stands apart from the text above it
      if (anyParts()) return !!firstParts[n];
      return prevY == null || l.y - prevY >= l.h * 1.8;
    }
    // which topics have parts anywhere ("2.1 …"): their plain "2 …" lines are headings
    var firstParts = {};
    pages.forEach(function (pg) { pg.lines.forEach(function (l) { var t = (l.cols[0] || l).text, mm = /^([A-Z]?)(\d{1,2})\.1\.?\s+[A-Z(]/.exec(t); if (mm && !mm[1]) firstParts[Number(mm[2])] = 1; }); });
    function text(items) { return A.NoteScan.lines(items).map(function (l) { return l.text; }).join(" ").trim(); }
    var CODE = /^([A-Z]?)(\d{1,2})\.(\d{1,2})\.?$/;
    var label = null; // a narrow left column holding a part's number and name (C1.1 / Types of number)
    pages.forEach(function (pg) {
      var lines = pg.lines;
      // a table with a right-hand column (Supplement, notes): split the page there
      var isRight = function (c, k) { return RIGHT.test(c.text) && (k > 0 || c.x > pg.p.w * 0.4); };
      var headRow = lines.filter(function (l) { return l.cols.some(isRight); })[0];
      if (headRow) {
        var rc = headRow.cols.filter(isRight)[0];
        split = { x: rc.x - 6, sup: /^(supplement|extended)$/i.test(rc.text) };
      } else if (split && !lines.some(function (l) { return l.items.some(function (i) { return i.x >= split.x; }); })) split = null;
      var coded = lines.filter(function (l) { return l.cols.length >= 2 && !RIGHT.test(l.cols[1].text) && (CODE.test(l.cols[0].text) || (PART.test(l.cols[0].text) && l.cols[0].text.split(" ").length <= 7)); });
      if (coded.length) label = { x: Math.min.apply(null, coded.map(function (l) { return l.cols[1].x; })) - 6 };
      else if (label && !lines.some(function (l) { return l.cols.length >= 2 && Math.abs(l.cols[1].x - label.x - 6) < 12; })) label = null;

      var prevY = null;
      lines.forEach(function (l) {
        var t = l.text, m, py = prevY;
        prevY = l.y;
        if (SKIP.test(t) || START.test(t)) return;
        // a heading across the page: a topic, or a part of one
        if (l.cols.length === 1 || !(split || label)) {
          if ((m = PART.exec(t)) && !SUB.test(t) && (l.cols.length === 1 || isHead(l))) { openPart(m[1], Number(m[2]), Number(m[3]), m[4].replace(/\s+\d{1,3}$/, "")); return; }
          if ((m = TOPIC.exec(t)) && t.split(" ").length <= 16 && !/[.;,]$/.test(t) && /^([A-Z(]|[a-z][A-Z])/.test(m[3]) && Number(m[2]) > 0 && (isHead(l) || plainHeading(l, py, m))) {
            openTopic(m[1], Number(m[2]), m[3].trim()); return;
          }
        }
        // a line of running text across the columns stays whole
        var whole = l.items.some(function (i) { return (split && i.x < split.x - 2 && i.x + i.w > split.x + 12) || (label && i.x < label.x - 2 && i.x + i.w > label.x + 12); });
        var lab = [], mid = [], rt = [];
        l.items.forEach(function (i) { (whole ? mid : split && i.x >= split.x ? rt : label && i.x < label.x ? lab : mid).push(i); });
        if (lab.length) {
          var lt = text(lab);
          if ((m = CODE.exec(lt))) openPart(m[1], Number(m[2]), Number(m[3]), "");
          else if ((m = PART.exec(lt)) && !SUB.test(lt)) openPart(m[1], Number(m[2]), Number(m[3]), m[4]);
          else if ((m = TOPIC.exec(lt)) && isHead(l) && !mid.length && !rt.length) { openTopic(m[1], Number(m[2]), m[3].trim()); return; }
          else if (part && !part.named && !SKIP.test(lt)) part.title = (part.title ? part.title + " " : "") + lt;
        }
        if (mid.length && topic) {
          var mt = text(mid), sub = SUB.exec(mt);
          if ((m = PART.exec(mt)) && !sub && mt.split(" ").length <= 12 && !/[.;,]$/.test(mt)) openPart(m[1], Number(m[2]), Number(m[3]), m[4]);
          else if (!SKIP.test(mt)) addPoint(part || ensurePart(), { text: sub ? sub[1] : mt, x: mid[0].x, y: l.y, h: l.h }, false, pg.p.n);
        }
        if (rt.length && split.sup && topic) {
          var rtext = text(rt);
          if (!SKIP.test(rtext)) addPoint(part || ensurePart(), { text: rtext, x: rt[0].x, y: l.y, h: l.h }, true, pg.p.n);
        }
      });
    });
    function ensurePart() { openPart(topic.prefix === "C" || topic.prefix === "E" ? "" : topic.prefix, topic.n, 0, topic.title); return part; }
    // sections (B1, C1, P1) keep their letters and names; Core/Extended (C1, E1) are just numbers
    var sectioned = order.some(function (x) { return x && x !== "C" && x !== "E"; });
    // tidy: numbers as text, in order, empty parts and noise out
    return topics.filter(function (t) { return t.title && !/^Topic \S+$/.test(t.title) || t.outline.length; })
      .sort(function (a, b) { return order.indexOf(a.prefix) - order.indexOf(b.prefix) || a.n - b.n; })
      .map(function (t) {
        var name = t.title.replace(/\s+/g, " ").replace(/\s*\.{3,}.*$/, "").replace(/\s*\(continued\)$/i, "").trim();
        return {
          n: sectioned ? t.key : String(t.n),
          title: sectioned && SECTIONS[t.prefix] ? SECTIONS[t.prefix] + ": " + name : name,
          outline: t.outline.map(function (o) {
            var n = /\.0$/.test(o.n) ? "" : sectioned || !/^[A-Z]/.test(o.n) ? o.n : o.n.replace(/^[A-Z]/, "");
            var pts = o.points.filter(useful);
            return { n: n, title: o.title.replace(/\s+/g, " ").replace(/\s*\(continued\)$/i, "").replace(/\s*(Learning outcomes|(AS |A )?Level subject content)(?=\s|$)/g, "").trim(), points: pts, sup: o.sup.filter(useful).filter(function (x) { return pts.indexOf(x) < 0; }) };
          }).filter(function (o) { return o.points.length || o.sup.length || o.n; }),
        };
      }).filter(function (t) { return t.outline.length; });
  }
  function useful(s) { return s && s.length > 3 && !SKIP.test(s); }

  /* ------------------------------------------------------------ joining it to the app's topics */
  var STOP = { and: 1, the: 1, of: 1, in: 1, to: 1, a: 1, an: 1, for: 1, with: 1, on: 1 };
  function wordsOf(s) { return (String(s || "").toLowerCase().match(/[a-z]{3,}/g) || []).filter(function (w) { return !STOP[w]; }).map(function (w) { return w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, ""); }); }
  function similar(a, b) {
    var uniq = function (w, i, all) { return all.indexOf(w) === i; };
    var x = wordsOf(a).filter(uniq), y = wordsOf(b).filter(uniq); if (!x.length || !y.length) return 0;
    var n = 0; x.forEach(function (w) { if (y.indexOf(w) >= 0) n++; });
    // the share of the shorter title's words; a tie goes to the closer match ("Environmental risks of
    // economic development" is that topic, not "Development")
    return n / Math.min(x.length, y.length) + 0.01 * n / Math.max(x.length, y.length);
  }

  /** How the syllabus lines up with the app's topics: [{ read, topic (the app's, or null), score }].
   *  Usually topic by topic. When the app's topics are the syllabus's parts (Physics: "Motion",
   *  "Pressure"… are parts 1.2, 1.8 of "Motion, forces and energy"), part by part instead, and
   *  several parts can go to one topic ("Mass, weight and density" ← 1.3 and 1.4). */
  function pairUp(syl, list, many) {
    var used = {};
    return list.map(function (r) {
      var best = null, bestScore = 0;
      syl.topics.forEach(function (t) {
        if (!many && used[t.id]) return;
        var sc = Math.max(similar(r.title, t.title), similar(r.title + " " + r.outline.map(function (o) { return o.title; }).join(" "), t.title) * 0.8);
        if (sc > bestScore) { bestScore = sc; best = t; }
      });
      if (best && bestScore >= 0.5) { used[best.id] = 1; return { read: r, topic: best, score: bestScore }; }
      return { read: r, topic: null, score: 0 };
    });
  }
  function match(syl, read) {
    var pairs = pairUp(syl, read.topics, false);
    // same number of topics and nothing matched by name: take them in order
    if (pairs.every(function (p) { return !p.topic; }) && read.topics.length === syl.topics.length) pairs.forEach(function (p, i) { p.topic = syl.topics[i]; p.byOrder = true; });
    var parts = [];
    read.topics.forEach(function (t) { t.outline.forEach(function (o) { if (o.n) parts.push({ n: o.n, title: o.title, outline: [o] }); }); });
    var byPart = parts.length > read.topics.length ? pairUp(syl, parts, true) : [];
    var covered = function (ps) { var ids = {}; ps.forEach(function (p) { if (p.topic) ids[p.topic.id] = 1; }); return Object.keys(ids).length; };
    if (covered(byPart) > covered(pairs)) { byPart.level = "part"; return byPart; }
    pairs.level = "topic";
    return pairs;
  }
  /** The subject's topics with what to study added (and new topics, if `addNew`). */
  function merge(syl, read, addNew) {
    var pairs = match(syl, read), topics = syl.topics.map(function (t) { return Object.assign({}, t); }), got = {};
    pairs.forEach(function (p) {
      var outline = p.read.outline.map(function (o) { return { n: o.n, title: o.title, points: o.points, sup: o.sup }; });
      if (p.topic) {
        var t = topics.filter(function (x) { return x.id === p.topic.id; })[0];
        // several parts can go to one topic: they add up
        if (got[t.id]) t.outline = t.outline.concat(outline); else { t.outline = outline; t.sylNo = p.read.n; }
        got[t.id] = 1;
        if (!t.summary) t.summary = outline.map(function (o) { return o.title; }).join(", ").slice(0, 300);
      } else if (addNew) {
        topics.push({ id: A.uid("top"), title: p.read.title, sylNo: p.read.n, term: 1, estMinutes: 30,
          summary: outline.map(function (o) { return o.title; }).join(", ").slice(0, 300), notes: "", examples: [], questions: [], outline: outline });
      }
    });
    // in the syllabus's order (topics it doesn't have keep their place after it)
    var order = {}; pairs.forEach(function (p, i) { if (p.topic && order[p.topic.id] == null) order[p.topic.id] = i; });
    topics.forEach(function (t, i) { if (order[t.id] == null) { var k = pairs.map(function (p) { return p.read.title; }).indexOf(t.title); order[t.id] = k >= 0 ? k : 1000 + i; } });
    topics.sort(function (a, b) { return order[a.id] - order[b.id]; });
    return topics;
  }

  A.SylRead = { read: read, match: match, merge: merge, _build: build };

  /* ------------------------------------------------------------ the admin's "Read topics from the syllabus" */
  A.act["syl-read-pdf"] = function (el) {
    var syl = M.syllabus(el.getAttribute("data-syl")); if (!syl) return;
    var result = null;
    UI.modal({
      title: "Read topics from the syllabus", size: "wide",
      body: '<p class="muted">Choose the official syllabus PDF for <b>' + esc(M.syllabusTitle(syl)) + "</b> (from the exam board's website). The app reads its subject content: the topics, their parts and what to study in each. You check it before anything changes.</p>" +
        '<label class="file-drop mt">' + I("upload") + '<div class="mt-sm"><b>Choose the syllabus PDF</b></div><input type="file" accept=".pdf,application/pdf" id="sr-file"></label>' +
        '<div id="sr-out" class="mt"></div>',
      foot: [{ label: "Cancel" }, { label: "Save topics", cls: "btn-primary", icon: "check", onClick: function (box) {
        if (!result) { UI.toast("Choose the syllabus PDF first", "bad"); return false; }
        var addNew = box.querySelector("#sr-new") ? box.querySelector("#sr-new").checked : false;
        var topics = merge(syl, result, addNew);
        S().patch("syllabi", syl.id, { topics: topics, outlineAt: Date.now(), outlineFrom: result.title || "" });
        var n = topics.filter(function (t) { return t.outline && t.outline.length; }).length;
        UI.toast("What to study is now shown for " + n + " topic" + (n === 1 ? "" : "s"));
        A.render();
      } }],
      onMount: function (box) {
        var out = box.querySelector("#sr-out");
        box.querySelector("#sr-file").addEventListener("change", function () {
          var f = this.files[0]; if (!f) return;
          result = null;
          out.innerHTML = '<div class="callout">' + I("refresh") + '<div>Reading the syllabus… <span id="sr-prog"></span></div></div>';
          read(f, function (n, of) { var p = box.querySelector("#sr-prog"); if (p) p.textContent = "page " + n + " of " + of; }).then(function (r) {
            if (!r.topics.length) { out.innerHTML = '<div class="callout warn">' + I("alert") + "<div>No topics were found in this PDF. Is it the syllabus (with a Subject content section)?</div></div>"; return; }
            if (r.code && syl.code && r.code !== syl.code) out.innerHTML = '<div class="callout warn mb">' + I("alert") + "<div>This looks like the syllabus for " + esc(r.code) + ", not " + esc(syl.code) + ". Check it's the right file.</div></div>";
            else out.innerHTML = "";
            result = r;
            var pairs = match(syl, r), fresh = pairs.filter(function (p) { return !p.topic; }).length;
            out.innerHTML += '<div class="small muted mb">Subject content on pages ' + r.pages[0] + "–" + r.pages[1] + ": " + r.topics.length + " topics, " +
              r.topics.reduce(function (a, t) { return a + t.outline.length; }, 0) + " parts.</div>" +
              '<div class="card sr-list">' + pairs.map(function (p) {
                var pts = p.read.outline.reduce(function (a, o) { return a + o.points.length + o.sup.length; }, 0);
                return '<details class="sr-topic"><summary><span class="tutor-num tnum">' + esc(p.read.n) + '</span><span class="grow"><b>' + esc(p.read.title) + '</b><span class="tiny muted"> · ' + p.read.outline.length + " parts, " + pts + " points</span></span>" +
                  (p.topic ? '<span class="badge good">' + (p.byOrder ? "In order: " : "Matches: ") + esc(p.topic.title) + "</span>" : '<span class="badge warn">New topic</span>') + "</summary>" +
                  A.outlineHtml({ outline: p.read.outline }) + "</details>";
              }).join("") + "</div>" +
              (pairs.level === "part" ? '<p class="small muted mt">The app’s topics are parts of the syllabus’s topics, so they were matched part by part.</p>' : "") +
              (fresh ? '<label class="check mt"><input type="checkbox" id="sr-new"' + (pairs.level === "part" ? "" : " checked") + '><span><b>Add the ' + fresh + " new topic" + (fresh === 1 ? "" : "s") + "</b> the app doesn't have yet</span></label>" : "") +
              '<p class="tiny muted mt">Topics keep their names, notes and students\' progress; what to study is added to each. Topics in the app that aren\'t in the PDF stay as they are.</p>';
          }).catch(function (e) { out.innerHTML = '<div class="callout warn">' + I("alert") + "<div>This PDF couldn't be read: " + esc(e.message || e) + "</div></div>"; });
        });
      },
    });
  };
})(window.App);
