/* Reading a past paper into questions.
 * The question paper is split into questions, each question into the parts that carry marks
 * ("[2]" at the right margin), and each part into its answer spaces (the dotted lines). The
 * marking scheme's table (Question | Answer | Marks | Guidance) is read row by row and every
 * part gets its row. Positions are kept, so the exam room shows each question cut out of the
 * real paper (diagrams, tables and formulas as printed) and the results show the scheme's own
 * row beside the student's answer. Cambridge papers are laid out very regularly, which is what
 * makes this possible; anything that doesn't fit falls back to the plain PDF sitting.
 *
 * A.PaperScan.scan(questionPaperBlob, markSchemeBlob) → Promise of
 *   { v, kind: "mcq" | "written", pages, qs: [ { n, marks, clips: [[page, top, bottom]...],
 *       units: [ { id: "2(a)(i)", label, marks, at: [page, y], text, boxes: [{ label, unit, lines }],
 *                  input: "choice" | "boxes" | "work", ms: { answer, guide, marks, clips } } ] } ],
 *     msPages, check: { marks, linked, units } } */
(function (A) {
  "use strict";
  var VERSION = 1;

  /* ------------------------------------------------------------ reading a page */
  function page(doc, n) {
    return doc.getPage(n).then(function (p) {
      var vp = p.getViewport({ scale: 1 });
      return p.getTextContent().then(function (tc) {
        var out = [];
        tc.items.forEach(function (it) {
          var s = it.str, t = it.transform;
          if (!s || !s.trim()) return;
          if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) return; // turned text: margin notes, rotated tables
          if (/[\u0000-\u0008\u000e-\u001f]/.test(s)) return; // barcode fonts
          var h = Math.abs(t[3]) || it.height || 10;
          if (h < 6) return; // tiny barcode strings
          out.push({ s: s, x: t[4], y: vp.height - t[5], w: it.width, h: h });
        });
        var head = vp.height > 700 ? 60 : 50, foot = vp.height - 45;
        var body = out.filter(function (it) { return it.y > head && it.y < foot && !/^\*\s?\d{6,}\s?\*$/.test(it.s); });
        return { n: n, w: vp.width, h: vp.height, top: head, bottom: foot, items: body, lines: lines(body), all: out };
      });
    });
  }
  function pages(doc) {
    var list = [];
    for (var i = 1; i <= doc.numPages; i++) list.push(i);
    return Promise.all(list.map(function (n) { return page(doc, n); }));
  }

  /** Group items into lines. Small raised text (powers) joins its line as "^2". */
  function lines(items) {
    var its = items.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var hs = its.map(function (i) { return i.h; }).sort(function (a, b) { return a - b; });
    var normal = hs.length ? hs[Math.floor(hs.length / 2)] : 11;
    var out = [];
    its.forEach(function (it) {
      var l = out.length ? out[out.length - 1] : null;
      if (l && Math.abs(l.y - it.y) <= 2.5) l.items.push(it); else out.push({ y: it.y, items: [it] });
    });
    // lines made only of small text close to a normal line: powers (above) and subscripts (below)
    var keep = [];
    out.forEach(function (l, i) {
      var small = l.items.every(function (it) { return it.h < normal * 0.8; });
      if (small) {
        var host = null, best = 9;
        [out[i - 1], out[i + 1]].forEach(function (o) {
          if (!o || o.items.every(function (it) { return it.h < normal * 0.8; })) return;
          var d = Math.abs(o.y - l.y);
          if (d < best) { best = d; host = o; }
        });
        if (host) {
          l.items.forEach(function (it) { it.sup = it.y < host.y - 1; host.items.push(it); });
          l.merged = true;
          return;
        }
      }
      keep.push(l);
    });
    keep.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      l.x = l.items[0].x;
      l.x2 = Math.max.apply(null, l.items.map(function (i) { return i.x + i.w; }));
      l.h = Math.max.apply(null, l.items.map(function (i) { return i.h; }));
      l.text = text(l.items);
    });
    return keep.sort(function (a, b) { return a.y - b.y; });
  }
  function text(items) {
    var s = "", sup = "";
    function flush() { if (sup) { s += "^" + (sup.length > 1 ? "(" + sup + ")" : sup); sup = ""; } }
    items.forEach(function (it, i) {
      var prev = items[i - 1];
      if (it.sup && prev) { sup += it.s.trim(); return; }
      flush();
      if (prev && it.x - (prev.x + prev.w) > 1.5 && !/\s$/.test(s) && !/^\s/.test(it.s)) s += " ";
      s += it.s;
    });
    flush();
    return s.replace(/\s+/g, " ").trim();
  }
  var DOTS = /[.…]{6,}/;
  var MARK = /\[\s*(\d{1,2})\s*\]\s*$/;

  /* ------------------------------------------------------------ the question paper */
  function readPaper(P) {
    var body = P.slice(1).filter(function (p) { return !/BLANK PAGE/.test(p.lines.map(function (l) { return l.text; }).join(" ")); });
    // the margin where question numbers sit: the most common x of lines that start with a number
    var xs = {};
    body.forEach(function (p) {
      p.lines.forEach(function (l) {
        if (/^[1-9]\d?$/.test(l.items[0].s.trim()) && l.x < 80) { var k = Math.round(l.x); xs[k] = (xs[k] || 0) + 1; }
      });
    });
    var qx = Number(Object.keys(xs).sort(function (a, b) { return xs[b] - xs[a]; })[0]) || 50;
    // better: where question 1 itself sits (code listings and tables can outnumber the questions)
    var one = null;
    body.some(function (p) { return p.lines.some(function (l) { var t = l.items[0].s.trim(); if (l.x < 80 && (/^1(\s|$)/.test(t) || (/^Either$/.test(t) && l.items[1] && /^1(\s*\(a\))?$/.test(l.items[1].s.trim())))) { one = l.x; return true; } return false; }); });
    if (one != null) qx = one;
    var headed = body.some(function (p) { return p.lines.some(function (l) { return /^Question \d{1,2}$/.test(l.text) && l.x < qx + 10; }); });

    // walk every line in reading order: questions, parts, marks, answer spaces
    var qs = [], q = null, expected = 1, letter = "", roman = "", unit = null, labelAt = null;
    function label() { return q.n + (letter ? "(" + letter + ")" : "") + (roman ? "(" + roman + ")" : ""); }
    function openUnit(p, y) { unit = { at: [p.n, y], lines: [], boxes: [] }; }
    body.forEach(function (p) {
      p.lines.forEach(function (l) {
        var first = l.items[0], t0 = first.s.trim(), m;
        var second = l.items[1] ? l.items[1].s.trim() : "";
        var nextX = l.items[1] ? l.items[1].x : null;
        // a question number, or the one after it when a question has no text (a page that is all picture)
        var num = function (n) { return n === expected || (n > expected && n <= expected + 2 && nextX != null && Math.abs(nextX - qx - 22) < 7); };
        var startsQ = (headed && (m = /^Question (\d{1,2})$/.exec(l.text)) && l.x < qx + 10 && Number(m[1]) === expected) ||
          Math.abs(first.x - qx) < 4 && (((m = /^([1-9]\d?)(?:\s|$)/.exec(t0)) && num(Number(m[1]))) ||
            // literature: "Either 1 Read this poem…" / "Or 2 How does…"
            (/^(Either|Or)$/.test(t0) && /^\d{1,2}(\s*\([a-z]\))?$/.test(second) && parseInt(second, 10) === expected));
        if (startsQ) {
          if (m && /^\d+$/.test(m[1]) && Number(m[1]) > expected && !headed) expected = Number(m[1]);
          q = { n: expected, units: [], start: [p.n, l.y - l.h - 4] };
          qs.push(q); expected++; letter = ""; roman = "";
          labelAt = [p.n, l.y - l.h - 4];
          openUnit(p, labelAt[1]);
        }
        if (!q) return;
        // part labels: (a) near the margin, (i) further in
        l.items.forEach(function (it) {
          var s = it.s.trim(), lm;
          if (it.x > qx + 80) return;
          if ((lm = /^\(([a-h]|[j-z])\)$/.exec(s)) && it.x < qx + 35) { letter = lm[1]; roman = ""; labelAt = [p.n, l.y - l.h - 2]; if (!unit.lines.length || unit.closed) openUnit(p, labelAt[1]); else unit.at = unit.at || labelAt; }
          else if ((lm = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$/.exec(s)) && (it.x >= qx + 35 || !letter)) { roman = lm[1]; labelAt = [p.n, l.y - l.h - 2]; if (!unit.lines.length || unit.closed) openUnit(p, labelAt[1]); }
          else if ((lm = /^\(([a-h])\)\s*\((i|ii|iii|iv|v|vi)\)$/.exec(s))) { letter = lm[1]; roman = lm[2]; labelAt = [p.n, l.y - l.h - 2]; openUnit(p, labelAt[1]); }
        });
        if (unit.closed) openUnit(p, l.y - l.h - 2);
        unit.lines.push(l);
        var last = l.items[l.items.length - 1], mk = MARK.exec(last.s);
        if (mk && !/total/i.test(last.s) && last.x + last.w > p.w * 0.7) {
          unit.id = label(); unit.marks = Number(mk[1]); unit.end = [p.n, l.y + 4]; unit.closed = true;
          var prev = q.units.length && q.units[q.units.length - 1];
          if (prev && prev.id === unit.id) { prev.marks += unit.marks; prev.lines = prev.lines.concat(unit.lines); prev.end = unit.end; }
          else q.units.push(unit);
        }
      });
    });
    // where each question ends: where the next one starts; the last one ends at its last mark
    qs.forEach(function (x, i) {
      var nx = qs[i + 1], clips = [];
      var lastU = x.units.length ? x.units[x.units.length - 1] : null;
      var endPage = nx ? nx.start[0] : lastU && lastU.end ? lastU.end[0] : x.start[0];
      body.forEach(function (p) {
        if (p.n < x.start[0] || p.n > endPage) return;
        var from = p.n === x.start[0] ? x.start[1] : p.top, to = p.bottom;
        if (nx && p.n === nx.start[0]) to = nx.start[1] - 2;
        if (!nx && lastU && lastU.end && p.n === lastU.end[0]) to = Math.min(to, lastU.end[1] + 6);
        if (to - from < 12) return;
        clips.push([p.n, Math.max(p.top - 8, Math.round(from)), Math.round(to)]);
      });
      x.clips = clips;
    });
    return { qs: qs, qx: qx };
  }

  /** The answer spaces in a part: dotted lines, grouped into boxes with their labels and units. */
  function boxes(u) {
    var out = [], cur = null, cells = 0;
    u.lines.forEach(function (l) {
      var t = l.text.replace(MARK, "").trim();
      var runs = t.split(/[.…]{6,}/);
      if (runs.length < 2) { cur = null; return; }
      if (runs.length > 3) { cells++; cur = null; return; } // a table of dotted cells
      var before = runs[0].trim(), after = runs[runs.length - 1].trim();
      if (runs.length === 3) { // "..... and ....." or a sentence with a gap in it
        out.push({ label: t.replace(/[.…]{6,}/g, " ___ ").replace(/\s+/g, " ").trim(), unit: "", lines: 1, inline: true });
        cur = null; return;
      }
      if (!before && cur && !after) { cur.lines++; return; }
      if (before && before.length > 28) { // a sentence with the gap at its end: "transports hormones ....."
        out.push({ label: (before + " ___ " + after).trim(), unit: "", lines: 1, inline: true });
        cur = null; return;
      }
      if (/chosen question number/i.test(before)) { cur = null; return; } // "Please write your chosen question number here"
      cur = { label: before.replace(/[:\s]+$/, ""), unit: after.replace(/^[.…\s]+/, ""), lines: 1 };
      out.push(cur);
    });
    if (cells) return { table: true, list: [] };
    return { list: out };
  }

  /* ------------------------------------------------------------ the marking scheme */
  /** Where a heading word sits on a line, even when it is printed in pieces ("Q" "uestion"). */
  function word(l, w) {
    var joined = "", owner = [];
    l.items.forEach(function (it) { var s = it.s.replace(/\s+/g, "").toLowerCase(); for (var i = 0; i < s.length; i++) { joined += s[i]; owner.push(it); } });
    var at = joined.indexOf(w);
    if (at < 0) return null;
    var a = owner[at], b = owner[at + w.length - 1];
    return { x0: a.x, x1: b.x + b.w, joined: joined };
  }
  /** Fractions are printed as two stacked lines ("4" over "7"): join them as "4/7". */
  function fractions(items) {
    var out = items.slice(), used = {};
    out.forEach(function (a, i) {
      if (used[i] || a.s.trim().length > 14) return;
      out.forEach(function (b, j) {
        if (used[i] || used[j] || i === j || b.s.trim().length > 14) return;
        var dy = b.y - a.y, ca = a.x + a.w / 2, cb = b.x + b.w / 2;
        if (dy < 8 || dy > 17 || Math.abs(ca - cb) > Math.max(a.w, b.w) / 2 + 2 || Math.abs(a.h - b.h) > 2) return;
        var mid = (a.y + b.y) / 2;
        var beside = out.some(function (m, k) { return k !== i && k !== j && Math.abs(m.y - mid) < 3.5 && (m.x > Math.max(a.x + a.w, b.x + b.w) - 1 || m.x + m.w < Math.min(a.x, b.x) + 1) && Math.abs(m.x - ca) < 90; });
        if (!beside) return;
        var wrap = function (t) { t = t.trim(); return /[\s+\-–−×]/.test(t) ? "(" + t + ")" : t; };
        used[i] = used[j] = true;
        out.push({ s: wrap(a.s) + "/" + wrap(b.s), x: Math.min(a.x, b.x), y: mid, w: Math.max(a.w, b.w), h: a.h, page: a.page });
      });
    });
    return out.filter(function (_, k) { return !used[k]; });
  }
  function textOf(items) {
    var byPage = {};
    items.forEach(function (i) { (byPage[i.page] = byPage[i.page] || []).push(i); });
    return Object.keys(byPage).sort(function (a, b) { return a - b; }).map(function (n) {
      return lines(fractions(byPage[n])).map(function (l) { return l.text; }).join("\n");
    }).join("\n").trim();
  }
  function readScheme(P) {
    var rows = [], row = null;
    P.forEach(function (p) {
      var head = null;
      p.lines.forEach(function (l) {
        var qh = word(l, "question"), ah = word(l, "answer");
        if (qh && ah && ah.x0 > qh.x1 && qh.joined.length <= 45) {
          var mh = word(l, "marks");
          head = { labelMax: qh.x1 + 6, markC: mh ? (mh.x0 + mh.x1) / 2 : p.w - 60, y: l.y };
          return;
        }
        if (!head || l.y <= head.y) return;
        var lab = l.items.filter(function (i) { return i.x < head.labelMax; });
        var labText = lab.map(function (i) { return i.s; }).join("").replace(/\s+/g, "");
        var m = /^(\d{1,2})((?:\([a-z]{1,2}\))*)((?:\([ivx]{1,5}\))*)$/.exec(labText);
        var rest = l.items.filter(function (i) { return i.x >= head.labelMax; });
        if (m) {
          row = { label: labText, ans: [], guide: [], marks: null, clips: [[p.n, Math.round(l.y - l.h - 3), null]] };
          rows.push(row);
        } else if (lab.length && !row) return;
        if (!row) return;
        if (row.clips[row.clips.length - 1][0] !== p.n) row.clips.push([p.n, Math.round(head.y + 4), null]);
        rest.forEach(function (i) {
          var c = i.x + i.w / 2, it = Object.assign({ page: p.n }, i);
          if (row.marks == null && /^\d{1,2}$/.test(i.s.trim()) && Math.abs(c - head.markC) < 45) { row.marks = Number(i.s.trim()); return; }
          if (i.x > head.markC + 25) row.guide.push(it); else if (Math.abs(c - head.markC) >= 20 || !/^\d{1,2}$/.test(i.s.trim())) row.ans.push(it);
        });
        row.clips[row.clips.length - 1][2] = Math.round(l.y + 5);
      });
    });
    rows.forEach(function (r) { r.answer = textOf(r.ans); r.guide = textOf(r.guide); delete r.ans; });
    return rows;
  }

  /* ------------------------------------------------------------ putting them together */
  function norm(label) { return String(label).replace(/\s+/g, "").toLowerCase(); }

  A.PaperScan = {
    VERSION: VERSION,
    scan: function (qpBlob, msBlob) {
      return Promise.all([A.PdfView.doc(qpBlob), msBlob ? A.PdfView.doc(msBlob) : null]).then(function (docs) {
        return Promise.all([pages(docs[0]), docs[1] ? pages(docs[1]) : []]).then(function (both) {
          var qp = both[0], ms = both[1];
          docs.forEach(function (d) { if (d) d.destroy(); });
          return build(qp, ms);
        });
      });
    },
    _read: { page: page, lines: lines, paper: readPaper, scheme: readScheme },

    /** Can a scan be trusted for typed answers? Its marks must add up to the paper's total (or more,
     *  when students choose questions) and most parts must have their scheme row (essays excepted). */
    usable: function (scan, totalMarks) {
      var ch = scan.check || {}, units = ch.units || 0;
      if (!units || !ch.questions) return false;
      if (scan.kind === "mcq") return ch.linked >= units * 0.9 && (!totalMarks || ch.marks === totalMarks);
      var essays = 0;
      scan.qs.forEach(function (q) { q.units.forEach(function (u) { if (u.input === "essay") essays++; }); });
      return (!totalMarks || ch.marks >= totalMarks * 0.95) && (ch.linked >= units * 0.5 || essays >= units * 0.5);
    },
    /** Scan a paper in the library with its marking scheme, keep the scan as a file, and turn on
     *  typed answers when it matches the paper. Used after the admin uploads papers. */
    forPaper: function (paper) {
      var ms = A.M.markSchemeFor(paper.id);
      if (!ms || !/pdf/i.test(paper.fileType || paper.fileName || "")) return Promise.resolve(null);
      return Promise.all([A.Files.get(paper.fileId), A.Files.get(ms.fileId)]).then(function (f) {
        if (!f[0] || !f[0].blob || !f[1] || !f[1].blob) return null;
        return A.PaperScan.scan(f[0].blob, f[1].blob).then(function (scan) {
          var need = /answer (one|two|three|four|five|six)\b/i.exec(paper.answerRule || ""), n = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
          scan.qs.forEach(function (q) {
            q.units.forEach(function (u) { if (u.marks == null && paper.totalMarks && need) u.marks = Math.round(paper.totalMarks / n[need[1].toLowerCase()]); });
            q.marks = q.units.reduce(function (s, u) { return s + (Number(u.marks) || 0); }, 0);
          });
          scan.check.marks = scan.qs.reduce(function (s, q) { return s + q.marks; }, 0);
          var blob = new Blob([JSON.stringify(scan)], { type: "application/json" });
          return A.Files.fromInput(new File([blob], (paper.fileName || "paper").replace(/\.pdf$/i, "") + ".json", { type: "application/json" })).then(function (fr) {
            var ok = A.PaperScan.usable(scan, paper.totalMarks);
            A.Store.patch("materials", paper.id, { scanFileId: fr.id, scanOk: ok, scanKind: scan.kind, qCount: scan.check.questions });
            return ok;
          });
        });
      }).catch(function () { return null; });
    },
  };

  function build(QP, MS) {
    var paper = readPaper(QP), rows = readScheme(MS);
    var byLabel = {};
    rows.forEach(function (r) { var k = norm(r.label); if (!byLabel[k]) byLabel[k] = r; });
    var letters = rows.length && rows.every(function (r) { return /^\d{1,2}$/.test(r.label); }) &&
      rows.filter(function (r) { return /^[A-D]$/.test(r.answer.trim()); }).length >= rows.length * 0.9;
    var out = { v: VERSION, kind: letters ? "mcq" : "written", pages: QP.length, msPages: MS.length, sizes: {}, qs: [] };
    QP.forEach(function (p) { out.sizes[p.n] = [Math.round(p.w), Math.round(p.h)]; });
    MS.forEach(function (p) { out.sizes["ms" + p.n] = [Math.round(p.w), Math.round(p.h)]; });
    var linked = 0, units = 0, marks = 0;
    paper.qs.forEach(function (q) {
      var Q = { n: q.n, clips: q.clips, units: [] };
      if (out.kind === "mcq") {
        var r = byLabel[String(q.n)];
        Q.units.push({ id: String(q.n), label: "", marks: 1, at: q.start, input: "choice", text: q.units.length ? "" : "", key: r ? r.answer.trim() : null, ms: r ? { answer: r.answer, marks: r.marks || 1, clips: r.clips } : null });
        if (r) linked++;
      } else {
        q.units.forEach(function (u) {
          var b = boxes(u), row = byLabel[norm(u.id)];
          // a scheme row may cover several parts ("3(b)" for 3(b)(i) and 3(b)(ii))
          if (!row) {
            var parent = u.id.replace(/\([ivx]+\)$/, "");
            if (parent !== u.id && byLabel[norm(parent)]) row = byLabel[norm(parent)];
          }
          var textLines = u.lines.map(function (l) { return l.text; }).filter(function (t) { return !/^[.…\s]+(\[\d+\])?$/.test(t); });
          Q.units.push({
            id: u.id, label: u.id.replace(/^\d+/, ""), marks: u.marks, at: u.at,
            text: textLines.join("\n").replace(/[.…]{6,}/g, "…").slice(0, 1500),
            input: b.table ? "work" : b.list.length ? "boxes" : "work", table: !!b.table, boxes: b.list,
            ms: row ? { label: row.label, answer: row.answer.slice(0, 2500), guide: row.guide.slice(0, 1500), marks: row.marks, clips: row.clips, shared: norm(row.label) !== norm(u.id) } : null,
          });
          if (row) linked++;
        });
      }
      if (!Q.units.length && out.kind !== "mcq") {
        // an essay question with no marks printed beside it (literature, compositions): one long answer
        Q.units.push({ id: String(q.n), label: "", marks: null, at: q.start, text: q.clips.length ? "" : "", input: "essay", boxes: [], ms: byLabel[String(q.n)] ? { label: String(q.n), answer: byLabel[String(q.n)].answer.slice(0, 2500), guide: byLabel[String(q.n)].guide.slice(0, 1500), marks: byLabel[String(q.n)].marks, clips: byLabel[String(q.n)].clips } : null });
      }
      Q.units.forEach(function (u) { if (u.input === "boxes" && u.boxes.length === 1 && u.boxes[0].lines >= 12) u.input = "essay"; });
      Q.marks = Q.units.reduce(function (s, u) { return s + (u.marks || 0); }, 0);
      units += Q.units.length; marks += Q.marks;
      out.qs.push(Q);
    });
    // papers answered in a separate answer booklet print no answer lines: every part gets a writing box
    var anyBoxes = out.qs.some(function (q) { return q.units.some(function (u) { return u.input === "boxes"; }); });
    if (out.kind !== "mcq" && !anyBoxes) out.qs.forEach(function (q) { q.units.forEach(function (u) { if (u.input === "work" && !u.table) { u.input = "essay"; u.booklet = true; } }); });
    for (var i = out.qs.length - 2; i >= 0; i--) {
      var a = out.qs[i], b = out.qs[i + 1];
      if (a.units.length === 1 && a.units[0].marks == null && b.units.length === 1 && b.units[0].marks) { a.units[0].marks = b.units[0].marks; a.marks = a.units[0].marks; a.choice = b.choice = true; }
    }
    out.check = { units: units, linked: linked, marks: marks, questions: out.qs.length };
    return out;
  }
})(window.App);
