/* Report cards (School Assist and School Assist Teacher).
 *   - Each subject's teacher enters every student's END OF TERM mark and a COMMENT ("Excellent", "Poor effort"…):
 *     in the class Gradebook (School Assist) or the Mark book, per learning area (School Assist Teacher).
 *   - The admin makes A4 report cards from them, for the whole school, a form or grade, a class or one student
 *     (Report cards page). In the desktop app they are saved as PDFs in Documents, one folder per term:
 *       Term 3 2026 Report Cards\Form 1\Form 1A\Tatenda Banda-end-of-term-report-card.pdf
 *     ready to send by WhatsApp or email; in a browser they print.
 *   - The layout is Golden Technologies' report card: the school's logo, REPORT CARD and the school's name; the
 *     student, form and class; a table of subjects (Subject, Subject Mark, Class Average, Mark, Grade and Comment);
 *     the grading scale; the head's comment. Admins change it: the title, each column (what it shows, its heading,
 *     on or off, its place), extra rows, the grading scale, the comments teachers pick from, the colours.
 * Records: "reportmarks" (rm_<year>_t<term>_<class>_<subject>_<student>: mark, outOf, comment; rmc_… holds a
 * class's "marks out of"), settings "reportcard" (the format), "reports" (the head's and class teacher's comments,
 * shared with the Teacher edition's class reports: rep_<student>_<year>_t<term>). */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var R = (A.Report = {});
  var primary = function () { return A.edition === "teacher" && !!A.Primary; };
  var desk = function () { return window.desktop && window.desktop.reports ? window.desktop : null; };

  /* ------------------------------------------------------------------ the format */
  R.SOURCES = [
    ["subject", "Subject name"], ["raw", "Mark as entered (34 / 50)"], ["percent", "Mark (%)"], ["average", "Class average (%)"],
    ["grade", "Grade"], ["comment", "Teacher's comment"], ["teacher", "Subject teacher"], ["position", "Position in the class"],
    ["termwork", "Term work average (%)"], ["blank", "Blank (written by hand)"],
  ];
  R.SCALES = {
    template: { name: "Report card (A 90%, B 80%, C 60%, D)", grades: [["A", 90], ["B", 80], ["C", 60], ["D", 0]] },
    zimsec: { name: "ZIMSEC O Level (A 75%, B 65%, C 50%, D 40%, E 30%, U)", grades: [["A", 75], ["B", 65], ["C", 50], ["D", 40], ["E", 30], ["U", 0]] },
    cambridge: { name: "Cambridge IGCSE (A* 90% … G 20%, U)", grades: [["A*", 90], ["A", 80], ["B", 70], ["C", 60], ["D", 50], ["E", 40], ["F", 30], ["G", 20], ["U", 0]] },
    primary: { name: "Primary descriptors (Excellent 80% … Needs support)", grades: [["Excellent", 80], ["Very good", 70], ["Good", 60], ["Satisfactory", 50], ["Fair", 40], ["Needs support", 0]] },
  };
  function defaults() {
    var p = primary();
    return {
      title: "REPORT CARD",
      colours: "template",
      columns: [
        { label: p ? "Learning area" : "Subject", source: "subject", on: true },
        { label: p ? "Term work" : "Subject Mark", source: p ? "termwork" : "raw", on: true },
        { label: "Class Average", source: "average", on: true },
        { label: p ? "End of term" : "Mark", source: "percent", on: true },
        { label: p ? "Achievement" : "Grade", source: "grade", on: true },
        { label: "Comment", source: "comment", on: true },
      ],
      rows: [],
      grades: (p ? R.SCALES.primary : R.SCALES.template).grades.map(function (g) { return { grade: g[0], min: g[1] }; }),
      comments: ["Excellent", "Very good", "Good", "Satisfactory", "Fair", "Poor effort", "Needs to work harder", "Has improved"],
      show: { studentNo: !p, term: true, average: true, position: p, teacherComment: p },
      headLabel: "Head Comment",
      outOf: 100,
    };
  }
  /** The school's format: its own choices over the defaults. */
  R.format = function () {
    var d = defaults(), o = S().get("settings", "reportcard") || {};
    return {
      title: o.title || d.title, colours: o.colours || d.colours,
      columns: o.columns && o.columns.length ? o.columns : d.columns, rows: o.rows || d.rows,
      grades: (o.grades && o.grades.length ? o.grades : d.grades).slice().sort(function (a, b) { return b.min - a.min; }),
      comments: o.comments && o.comments.length ? o.comments : d.comments,
      show: Object.assign({}, d.show, o.show || {}), headLabel: o.headLabel || d.headLabel, outOf: Number(o.outOf) || d.outOf,
    };
  };
  R.grade = function (pct, f) {
    if (pct == null) return "";
    var g = (f || R.format()).grades;
    for (var i = 0; i < g.length; i++) if (pct >= g[i].min) return g[i].grade;
    return g.length ? g[g.length - 1].grade : "";
  };
  R.scaleText = function (f) {
    var g = (f || R.format()).grades;
    return g.map(function (x, i) { return x.grade + " = " + x.min + "%" + (i ? " - " + (g[i - 1].min - 1) + "%" : " - 100%"); }).join("   ");
  };

  /** The term the school is in, and its year. */
  R.termNow = function () {
    if (primary()) { var c = A.Primary.conf(); return { term: c.term, year: String(c.year) }; }
    var t = parseInt(String(CFG.term || "").replace(/\D/g, ""), 10), m = new Date().getMonth() + 1;
    return { term: t >= 1 && t <= 3 ? t : m <= 4 ? 1 : m <= 8 ? 2 : 3, year: String(new Date().getFullYear()) };
  };

  /* ------------------------------------------------------------------ end-of-term marks */
  var slug = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x"; };
  var key = function (ctx) { return ctx.year + "_t" + ctx.term + "_" + ctx.classId + "_" + slug(ctx.subject); };
  R.mark = function (ctx, sid) { return S().get("reportmarks", "rm_" + key(ctx) + "_" + sid); };
  R.outOf = function (ctx) { var r = S().get("reportmarks", "rmc_" + key(ctx)); return (r && Number(r.outOf)) || R.format().outOf; };
  R.pct = function (rec) { return rec && rec.mark != null && rec.mark !== "" && Number(rec.outOf) > 0 ? Math.round(Number(rec.mark) / Number(rec.outOf) * 100) : null; };
  /** Every student's mark in one class and subject this term, and the class average. */
  // every end-of-term mark grouped by class and subject, made once per piece of work (a page, a batch of PDFs):
  // without it a whole school's report cards would scan every mark for every row and freeze the page
  var groupsCache = null;
  function markGroups() {
    if (groupsCache) return groupsCache;
    groupsCache = {};
    S().filter("reportmarks", function (r) { return r.id.indexOf("rm_") === 0 && R.pct(r) != null; }).forEach(function (r) {
      var k = r.id.slice(0, r.id.length - String(r.studentId || "").length);
      (groupsCache[k] = groupsCache[k] || []).push(r);
    });
    setTimeout(function () { groupsCache = null; }, 0);
    return groupsCache;
  }
  R.classMarks = function (ctx) {
    var pre = "rm_" + key(ctx) + "_", list = (markGroups()[pre] || []).slice();
    var pcts = list.map(R.pct), sorted = pcts.slice().sort(function (a, b) { return b - a; });
    return { list: list, average: pcts.length ? Math.round(A.avg(pcts)) : null, position: function (p) { return p == null ? null : sorted.indexOf(p) + 1; }, count: pcts.length };
  };
  function save(ctx, sid, patch) {
    var cur = R.mark(ctx, sid) || { id: "rm_" + key(ctx) + "_" + sid, year: String(ctx.year), term: Number(ctx.term), classId: ctx.classId, subject: ctx.subject, studentId: sid };
    groupsCache = null; // the class's count and average include this mark at once
    return S().put("reportmarks", Object.assign({}, cur, { outOf: R.outOf(ctx), teacherId: (M.me() || {}).id }, patch));
  }
  function ctxOf(el) {
    return { year: el.getAttribute("data-year"), term: Number(el.getAttribute("data-term")), classId: el.getAttribute("data-class"), subject: el.getAttribute("data-subject") };
  }
  var data = function (ctx, sid) {
    return ' data-year="' + esc(ctx.year) + '" data-term="' + ctx.term + '" data-class="' + esc(ctx.classId) + '" data-subject="' + esc(ctx.subject) + '"' + (sid ? ' data-sid="' + esc(sid) + '"' : "");
  };
  /** The comments teachers pick from (any other text can be typed too). */
  R.datalist = function () { return '<datalist id="rm-comments">' + R.format().comments.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>"; };
  /** Above the marks: which term, and what the end-of-term mark is out of. */
  R.entryBar = function (ctx, termHref) {
    var t = R.termNow(), n = R.classMarks(ctx);
    return '<div class="rm-bar"><b>' + I("award") + " End of term</b>" +
      '<select class="select sm" style="width:auto" data-change="rm-term" data-href="' + esc(termHref) + '" aria-label="Term">' + [1, 2, 3].map(function (x) { return '<option value="' + x + '"' + (x === Number(ctx.term) ? " selected" : "") + ">Term " + x + " " + esc(ctx.year) + (x === t.term && String(ctx.year) === t.year ? " (now)" : "") + "</option>"; }).join("") + "</select>" +
      '<label class="row small" style="gap:6px">Marks out of <input class="input sm" style="width:70px" inputmode="numeric" value="' + R.outOf(ctx) + '" data-change="rm-outof"' + data(ctx) + ' aria-label="End of term marks out of"></label>' +
      '<span class="muted small rm-count">' + countText(n) + "</span></div>";
  };
  var countText = function (n) { return n.count + " marked" + (n.average != null ? " · class average " + n.average + "%" : ""); };
  R.entryHead = function (ctx) { return '<th class="num rm-col">End of term<div class="tiny">/ ' + R.outOf(ctx) + '</div></th><th class="rm-col">Comment</th>'; };
  R.entryCells = function (ctx, u) {
    var r = R.mark(ctx, u.id) || {}, p = R.pct(r);
    return '<td class="num rm-col"><input class="cell" inputmode="decimal" value="' + (r.mark == null ? "" : esc(r.mark)) + '" data-change="rm-mark"' + data(ctx, u.id) + ' aria-label="' + esc(u.name) + ' end of term mark"' + (p != null ? ' title="' + p + "% · " + esc(R.grade(p)) + '"' : "") + "></td>" +
      '<td class="rm-col"><input class="input sm rm-comment" list="rm-comments" value="' + esc(r.comment || "") + '" placeholder="e.g. Good" data-change="rm-comment"' + data(ctx, u.id) + ' aria-label="' + esc(u.name) + ' comment"></td>';
  };
  R.entryFoot = function (ctx) { var n = R.classMarks(ctx); return '<td class="num rm-col">' + UI.scoreBadge(n.average) + '</td><td class="rm-col"></td>'; };
  /** A whole table: student, end-of-term mark, %, grade, comment (School Assist Teacher's mark book). */
  R.entryTable = function (ctx, students) {
    return R.datalist() + '<div class="table-wrap"><table class="table"><thead><tr><th>Pupil</th>' + R.entryHead(ctx) + '<th class="num">%</th><th>Grade</th></tr></thead><tbody>' +
      students.map(function (u) {
        var p = R.pct(R.mark(ctx, u.id));
        return "<tr><td>" + esc(u.name) + "</td>" + R.entryCells(ctx, u) + '<td class="num">' + UI.scoreBadge(p) + "</td><td>" + esc(R.grade(p)) + "</td></tr>";
      }).join("") + '<tr><td class="bold">Class average</td>' + R.entryFoot(ctx) + "<td></td><td></td></tr></tbody></table></div>";
  };
  A.act["rm-mark"] = function (el) {
    var ctx = ctxOf(el), v = el.value.trim(), max = R.outOf(ctx);
    if (v !== "" && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > max)) { UI.toast("Enter a mark from 0 to " + max, "bad"); el.focus(); return; }
    save(ctx, el.getAttribute("data-sid"), { mark: v === "" ? null : Number(v) });
    var p = v === "" ? null : Math.round(Number(v) / max * 100);
    el.title = p == null ? "" : p + "% · " + R.grade(p);
    var cnt = document.querySelector(".rm-count");
    if (cnt) cnt.textContent = countText(R.classMarks(ctx));
    UI.toast(v === "" ? "End of term mark cleared" : "End of term mark saved: " + p + "% (" + R.grade(p) + ")");
  };
  A.act["rm-comment"] = function (el) {
    save(ctxOf(el), el.getAttribute("data-sid"), { comment: el.value.trim().slice(0, 200) });
    UI.toast("Comment saved");
  };
  A.act["rm-outof"] = function (el) {
    var ctx = ctxOf(el), n = Number(el.value);
    if (!(n >= 1 && n <= 1000)) { UI.toast("Marks out of: a number from 1 to 1000", "bad"); return; }
    S().put("reportmarks", { id: "rmc_" + key(ctx), year: String(ctx.year), term: ctx.term, classId: ctx.classId, subject: ctx.subject, outOf: n });
    var pre = "rm_" + key(ctx) + "_";
    S().filter("reportmarks", function (r) { return r.id.indexOf(pre) === 0; }).forEach(function (r) { S().put("reportmarks", Object.assign({}, r, { outOf: n })); });
    groupsCache = null;
    UI.toast("End of term marks are out of " + n);
    A.render();
  };
  A.act["rm-term"] = function (el) { location.hash = el.getAttribute("data-href").replace("{t}", el.value); };

  /* ------------------------------------------------------------------ one student's report */
  function homeClass(u) {
    if (primary()) {
      var c = S().find("classes", function (x) { return x.homeroom && (x.studentIds || []).indexOf(u.id) >= 0; });
      return c ? { level: c.level || "", name: c.name, cls: c } : { level: u.level || "", name: u.level || "No class" };
    }
    return { level: u.level || "", name: M.studentHome(u) || u.level || "No class" };
  }
  function comments(u, t) { return S().get("reports", "rep_" + u.id + "_" + t.year + "_t" + t.term) || {}; }
  /** Everything one student's card needs. */
  R.studentReport = function (u, t) {
    var f = R.format(), home = homeClass(u), rows = [];
    // without an end-of-term mark, the grade comes from the term's work only when the card shows that work
    var useWork = f.columns.some(function (x) { return x.on !== false && x.source === "termwork"; });
    if (primary()) {
      var c = home.cls, sc = c && A.Primary.scores ? A.Primary.scores(c, t.year, t.term) : null, conf = A.Primary.conf();
      conf.areas.forEach(function (area) {
        if (!c) return;
        var ctx = { year: t.year, term: t.term, classId: c.id, subject: area };
        rows.push(row(ctx, u, area, M.user(c.teacherId), sc && sc.by[u.id] ? sc.by[u.id].area[area] : null, useWork));
      });
    } else {
      M.classesForStudent(u.id).filter(function (c) { return !c.homeroom && c.subject; }).sort(function (a, b) { return a.subject.localeCompare(b.subject); }).forEach(function (c) {
        var ctx = { year: t.year, term: t.term, classId: c.id, subject: c.subject };
        rows.push(row(ctx, u, c.subject, M.user(c.teacherId), termWork(c, u), useWork));
      });
    }
    f.rows.forEach(function (x) { if (x && x.label) rows.push({ subject: x.label, extra: true }); });
    var pcts = rows.map(function (r) { return r.final; }).filter(function (x) { return x != null; });
    var com = comments(u, t);
    return { u: u, t: t, home: home, rows: rows, average: pcts.length ? Math.round(A.avg(pcts)) : null, head: com.headComment || "", teacher: com.teacherComment || "" };
  };
  function row(ctx, u, subject, teacher, termwork, useWork) {
    var rec = R.mark(ctx, u.id), p = R.pct(rec), cm = R.classMarks(ctx);
    // the grade and the overall average use the end-of-term mark; without one, the term's work (Gradebook or Mark book) if shown
    var final = p != null ? p : !useWork || termwork == null ? null : termwork;
    return { subject: subject, raw: rec && rec.mark != null ? rec.mark + (Number(rec.outOf) !== 100 ? " / " + rec.outOf : "") : "", percent: p, average: cm.average,
      grade: R.grade(final), final: final, comment: (rec && rec.comment) || "", teacher: teacher ? teacher.name : "", position: p == null ? "" : cm.position(p) + " / " + cm.count,
      termwork: termwork == null ? null : termwork };
  }
  /** The average of a student's marked tasks in a class (the Gradebook). */
  function termWork(c, u) {
    var pcts = M.tasksForClass(c.id).filter(function (tk) { return tk.maxMarks; }).map(function (tk) { var e = M.effectiveScore(tk, u.id); return e ? e.score / tk.maxMarks * 100 : null; }).filter(function (x) { return x != null; });
    return pcts.length ? Math.round(A.avg(pcts)) : null;
  }

  /* ------------------------------------------------------------------ the A4 page */
  var COLOURS = { template: { band: "#dfeaf6", ink: "#1b5e98", label: "#1f6fb5", th: "#6a9cc3", line: "#2b7bc8", scale: "#6a9cc3" } };
  function colours(f) {
    if (f.colours !== "school") return COLOURS.template;
    var b = A.Theme.get(), p = b.primary || "#1D4E89";
    return { band: tint(p, 0.86), ink: p, label: p, th: tint(p, 0.25), line: p, scale: tint(p, 0.2) };
  }
  function tint(hex, amt) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return hex;
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, mix = function (c) { return Math.round(c + (255 - c) * amt); };
    return "#" + [mix(r), mix(g), mix(b)].map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }
  R.CSS = "@page{size:A4;margin:0}" +
    ".rc{-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    ".rc{box-sizing:border-box;width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff;color:#1f2933;font-family:'Segoe UI','Open Sans',Arial,sans-serif;page-break-after:always;break-after:page}" +
    ".rc *{box-sizing:border-box}" +
    ".rc-head{position:absolute;left:0;right:0;top:12mm;height:37mm;background:var(--band);display:flex;align-items:center;gap:9mm;padding:0 16mm}" +
    ".rc-logo{width:36mm;height:28mm;display:flex;align-items:center;justify-content:center;flex:none}.rc-logo img,.rc-logo svg{max-width:100%;max-height:100%;object-fit:contain}" +
    ".rc-title{font-size:27pt;line-height:1;font-weight:800;color:var(--ink);letter-spacing:.4pt;margin:0}.rc-school{font-size:13pt;color:var(--ink);margin-top:3mm}" +
    ".rc-who{position:absolute;left:16mm;right:16mm;top:56mm;display:grid;grid-template-columns:1fr 1fr;column-gap:10mm;row-gap:2.6mm;font-size:11pt}" +
    ".rc-who div{display:flex;align-items:baseline;gap:2.5mm}.rc-who b{color:var(--label);min-width:21mm;font-weight:700}" +
    ".rc-who span{flex:1;border-bottom:.6pt solid #8a8f98;padding:0 1.5mm .6mm;min-height:5.2mm}" +
    ".rc-who .wide{grid-column:1/-1}" +
    ".rc-table{position:absolute;left:16mm;right:16mm;top:var(--top);border-collapse:collapse;width:178mm;table-layout:fixed}" +
    ".rc-table th{background:var(--th);color:#fff;font-weight:700;font-size:var(--thfs);padding:2.6mm 2mm;border:.75pt solid var(--th);text-align:center}" +
    ".rc-table td{border:.75pt solid var(--line);font-size:var(--fs);padding:0 2mm;height:var(--rh);text-align:center;vertical-align:middle;overflow:hidden}" +
    ".rc-table td.l{text-align:center}.rc-table td.c{font-size:calc(var(--fs) - 1pt);text-align:left}.rc-table tr.x td{color:#5b6573}" +
    ".rc-foot{position:absolute;left:0;right:0;bottom:12mm;background:var(--band);padding:5mm 16mm 6mm}" +
    ".rc-scale{color:var(--scale);font-weight:700;font-size:10.5pt}.rc-scale b{margin-right:4mm}" +
    ".rc-avg{color:var(--label);font-size:10.5pt;margin-top:1.5mm}" +
    ".rc-box{background:#fff;margin-top:4mm;padding:3mm 4.5mm;min-height:var(--bh)}.rc-box b{color:var(--label);font-size:11pt}.rc-box p{margin:1.5mm 0 0;font-size:10.5pt;white-space:pre-wrap}";

  /** One A4 report card (a <section>), for the preview, printing and PDFs. */
  R.page = function (rep, f) {
    f = f || R.format();
    var b = A.Theme.get(), c = colours(f), u = rep.u, t = rep.t;
    var cols = f.columns.filter(function (x) { return x.on !== false; });
    var who = [["Student", u.name], [primary() ? "Grade" : "Form", rep.home.level || "—"], ["Class", rep.home.name]];
    if (f.show.studentNo && u.studentNo) who.push(["Student ID", u.studentNo]);
    if (f.show.term) who.push(["Term", "Term " + t.term + " " + t.year]);
    var boxes = (f.show.teacherComment ? 1 : 0) + 1, n = Math.max(rep.rows.length, 1);
    var top = 56 + (1 + Math.ceil((who.length - 1) / 2)) * 8 + 6; // under the student's details: the name on its own line, then two a line
    var footH = 22 + boxes * 26, avail = 297 - 12 - footH - top - 14;
    var rh = Math.max(5.5, Math.min(11.5, avail / (n + 1))), fs = rh < 7 ? 8.5 : rh < 9 ? 9.5 : 11;
    // each column wide enough for its heading's longest word (e.g. "Achievement")
    var widths = cols.map(function (x) {
      var word = Math.max.apply(null, String(x.label || "").split(" ").map(function (w) { return w.length; }).concat([1]));
      return Math.max(x.source === "subject" ? 2.4 : x.source === "comment" ? 2.2 : x.source === "teacher" ? 1.8 : 1, word * 0.13);
    });
    var tw = widths.reduce(function (a, x) { return a + x; }, 0);
    var cell = function (r, x) {
      if (r.extra && x.source !== "subject") return "";
      var v = r[x.source];
      if (x.source === "percent" || x.source === "average" || x.source === "termwork") v = v == null ? "" : v + "%";
      return v == null ? "" : String(v);
    };
    return '<section class="rc" style="--band:' + c.band + ";--ink:" + c.ink + ";--label:" + c.label + ";--th:" + c.th + ";--line:" + c.line + ";--scale:" + c.scale + ";--top:" + top + "mm;--rh:" + rh.toFixed(1) + "mm;--fs:" + fs + "pt;--thfs:" + (cols.length > 6 ? 9.5 : 10.5) + "pt;--bh:" + (boxes > 1 ? 20 : 30) + 'mm">' +
      '<header class="rc-head"><div class="rc-logo">' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : A.Theme.crestSVG(b)) + '</div><div><h1 class="rc-title">' + esc(f.title) + '</h1><div class="rc-school">' + esc(b.name) + "</div></div></header>" +
      '<div class="rc-who">' + who.map(function (w, i) { return '<div class="' + (i === 0 ? "wide" : "") + '"><b>' + esc(w[0]) + "</b>:<span>" + esc(w[1]) + "</span></div>"; }).join("") + "</div>" +
      '<table class="rc-table"><colgroup>' + widths.map(function (w) { return '<col style="width:' + (w / tw * 100).toFixed(2) + '%">'; }).join("") + "</colgroup>" +
      "<thead><tr>" + cols.map(function (x) { return "<th>" + esc(x.label) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (rep.rows.length ? rep.rows.map(function (r) {
        return '<tr class="' + (r.extra ? "x" : "") + '">' + cols.map(function (x) { return '<td class="' + (x.source === "comment" ? "c" : "") + '">' + esc(cell(r, x)) + "</td>"; }).join("") + "</tr>";
      }).join("") : '<tr><td colspan="' + cols.length + '">No subjects</td></tr>') + "</tbody></table>" +
      '<footer class="rc-foot"><div class="rc-scale"><b>GRADING SCALE :</b>' + esc(R.scaleText(f)) + "</div>" +
      (f.show.average && rep.average != null ? '<div class="rc-avg">Overall average: <b>' + rep.average + "%</b>" + (f.show.position && rep.position ? " · Position in class: <b>" + esc(rep.position) + "</b>" : "") + "</div>" : "") +
      (f.show.teacherComment ? '<div class="rc-box"><b>Class Teacher\'s Comment :</b><p>' + esc(rep.teacher) + "</p></div>" : "") +
      '<div class="rc-box"><b>' + esc(f.headLabel) + " :</b><p>" + esc(rep.head) + "</p></div></footer></section>";
  };
  /** A whole HTML document for the PDF maker (desktop app) or the print window. */
  R.doc = function (pages) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>Report card</title><style>html,body{margin:0;padding:0;background:#fff}' + R.CSS + "</style></head><body>" + pages.join("") + "</body></html>";
  };

  /* ------------------------------------------------------------------ the students, by form and class */
  /** [{ level, classes: [{ key, name, students }] }], in the school's order. */
  R.groups = function () {
    var levels = {};
    var add = function (level, name, u, keyId) {
      var L = levels[level] = levels[level] || {};
      (L[keyId] = L[keyId] || { key: keyId, name: name, students: [] }).students.push(u);
    };
    if (primary()) {
      S().filter("classes", function (c) { return c.homeroom; }).forEach(function (c) {
        M.studentsOf(c).forEach(function (u) { add(c.level || "No grade", c.name, u, c.id); });
      });
    } else {
      M.students().filter(function (u) { return u.status !== "pending" && u.status !== "declined" && !u.example; }).forEach(function (u) {
        var name = M.studentHome(u) || "No class", lv = u.level || "No form";
        add(lv, name, u, "h_" + slug(name));
      });
    }
    return Object.keys(levels).sort(function (a, b) { return M.levelIndex(a) - M.levelIndex(b) || a.localeCompare(b); }).map(function (lv) {
      return { level: lv, classes: Object.keys(levels[lv]).map(function (k) { var g = levels[lv][k]; g.students.sort(function (a, b) { return a.name.localeCompare(b.name); }); return g; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); }) };
    });
  };
  /** Reports for a list of students in one class, with positions by overall average. */
  function classReports(students, t) {
    var reps = students.map(function (u) { return R.studentReport(u, t); });
    var ranked = reps.filter(function (r) { return r.average != null; }).sort(function (a, b) { return b.average - a.average; });
    ranked.forEach(function (r, i) { r.position = (i && ranked[i - 1].average === r.average ? ranked[i - 1].posN : i + 1); r.posN = r.position; r.position = r.position + " / " + ranked.length; });
    return reps;
  }
  var safe = function (s) { return String(s || "").replace(/[<>:"/\\|?*\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "Report"; };
  R.folderName = function (t) { return "Term " + t.term + " " + t.year + " Report Cards"; };
  /** The files for some groups: { path: "Form 1/Form 1A/Name-end-of-term-report-card.pdf", rep }. */
  function filesFor(groups, t, onlySid) {
    var out = [];
    groups.forEach(function (g) {
      g.classes.forEach(function (c) {
        var reps = classReports(c.students, t), names = {};
        reps.forEach(function (r) {
          if (onlySid && r.u.id !== onlySid) return;
          var name = safe(r.u.name);
          if (names[name]) name += " (" + safe(r.u.studentNo || r.u.id) + ")";
          names[name] = 1;
          out.push({ path: safe(g.level) + "/" + safe(c.name) + "/" + name + "-end-of-term-report-card.pdf", rep: r });
        });
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ the Report cards page (admins) */
  function termOf(q) { var n = R.termNow(); return { term: Number(q.term) || n.term, year: String(q.year || n.year) }; }
  function href(t, extra) { return "#/t/reportcards?term=" + t.term + "&year=" + t.year + (extra || ""); }
  A.route("t/reportcards", function (p, q, me) {
    if (!me.isAdmin) return { redirect: "#/t/home" };
    var t = termOf(q), groups = R.groups(), f = R.format(), total = 0;
    groups.forEach(function (g) { g.classes.forEach(function (c) { total += c.students.length; }); });
    var canPdf = !!desk();
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Report cards</h2><p class="muted">Term ' + t.term + " " + esc(t.year) + " · " + total + " student" + (total === 1 ? "" : "s") + "</p></div>" +
      '<div class="row wrap"><select class="select sm" style="width:auto" data-change="rc-term" aria-label="Term">' + [1, 2, 3].map(function (x) { return '<option value="' + x + '"' + (x === t.term ? " selected" : "") + ">Term " + x + "</option>"; }).join("") + "</select>" +
      '<input class="input sm" style="width:80px" inputmode="numeric" value="' + esc(t.year) + '" data-change="rc-year" aria-label="Year">' +
      '<button class="btn" data-act="rc-format">' + I("sliders") + "Format</button>" +
      (total ? '<button class="btn btn-primary" data-act="rc-make" data-scope="all">' + I("download") + (canPdf ? "Make every report card" : "Print every report card") + "</button>" : "") + "</div></div>" +
      '<div class="callout mb">' + I("info") + '<div class="small">' + (primary()
        ? "Each class teacher enters every pupil's <b>end of term</b> mark and a <b>comment</b> for each learning area: in the Mark book, under End of term."
        : "Each subject's teacher enters the <b>end of term</b> mark and a <b>comment</b> for every student: in the class's Gradebook, in the End of term and Comment columns.") +
      (canPdf ? " Saved in <b>Documents\\" + esc(R.folderName(t)) + "</b>." : "") + "</div></div>";
    if (!total) html += '<div class="card">' + UI.empty("users", "No students yet", primary() ? "Add the pupils to their classes first." : "Students appear here once they are approved.") + "</div>";
    groups.forEach(function (g) {
      var n = g.classes.reduce(function (a, c) { return a + c.students.length; }, 0);
      html += '<div class="card mb"><div class="card-head">' + I("users") + "<h3>" + esc(g.level) + '</h3><span class="sub">' + g.classes.length + " class" + (g.classes.length === 1 ? "" : "es") + " · " + n + " student" + (n === 1 ? "" : "s") + "</span>" +
        '<button class="btn btn-sm" style="margin-left:auto" data-act="rc-make" data-scope="level" data-level="' + esc(g.level) + '">' + I("download") + (canPdf ? "Make " : "Print ") + esc(g.level) + "</button></div>" +
        g.classes.map(function (c) {
          var open = q.c === c.key, st = progress(c.students, t);
          return '<div class="list-row"><div class="grow"><div class="title">' + esc(c.name) + '</div><div class="meta"><span>' + c.students.length + " student" + (c.students.length === 1 ? "" : "s") + "</span><span class=\"sep\"></span><span>" + st.done + " of " + st.of + " subject marks in" + "</span></div></div>" +
            '<a class="btn btn-sm btn-ghost" href="' + href(t, open ? "" : "&c=" + encodeURIComponent(c.key)) + '">' + (open ? "Hide students" : "Students") + "</a>" +
            '<button class="btn btn-sm" data-act="rc-make" data-scope="class" data-level="' + esc(g.level) + '" data-key="' + esc(c.key) + '">' + I("download") + (canPdf ? "Make PDFs" : "Print") + "</button></div>" +
            (open ? studentsTable(g, c, t) : "");
        }).join("") + "</div>";
    });
    return { title: "Report cards", html: '<style id="rc-css">' + R.CSS + "</style>" + html };
  }, { role: "teacher" });
  function progress(students, t) {
    var done = 0, of = 0;
    students.forEach(function (u) { R.studentReport(u, t).rows.forEach(function (r) { if (r.extra) return; of++; if (r.percent != null) done++; }); });
    return { done: done, of: of };
  }
  function studentsTable(g, c, t) {
    var reps = classReports(c.students, t);
    return '<div class="table-wrap" style="margin:0 16px 14px"><table class="table"><thead><tr><th>Student</th><th>ID</th><th class="num">Average</th><th class="num">Position</th><th>' + esc(R.format().headLabel) + "</th><th></th></tr></thead><tbody>" +
      reps.map(function (r) {
        return "<tr><td><b>" + esc(r.u.name) + '</b></td><td class="small">' + esc(r.u.studentNo || "") + '</td><td class="num">' + UI.scoreBadge(r.average) + '</td><td class="num tnum">' + esc(r.position || "—") + "</td>" +
          '<td><input class="input sm" style="min-width:220px" value="' + esc(r.head) + '" placeholder="Type the head\'s comment" data-change="rc-head" data-sid="' + r.u.id + '" data-term="' + t.term + '" data-year="' + esc(t.year) + '" aria-label="Head\'s comment for ' + esc(r.u.name) + '"></td>' +
          '<td class="nowrap"><button class="btn btn-sm btn-ghost" data-act="rc-preview" data-sid="' + r.u.id + '">Preview</button> <button class="btn btn-sm" data-act="rc-make" data-scope="student" data-level="' + esc(g.level) + '" data-key="' + esc(c.key) + '" data-sid="' + r.u.id + '">' + I("download") + (desk() ? "PDF" : "Print") + "</button></td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  var pageTerm = function () { var q = {}; (location.hash.split("?")[1] || "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ""); }); return termOf(q); };
  A.act["rc-term"] = function (el) { var t = pageTerm(); t.term = Number(el.value); location.hash = href(t); };
  A.act["rc-year"] = function (el) { var t = pageTerm(), y = el.value.replace(/\D/g, ""); if (y.length === 4) { t.year = y; location.hash = href(t); } };
  A.act["rc-head"] = function (el) {
    var t = { term: Number(el.getAttribute("data-term")), year: el.getAttribute("data-year") }, u = M.user(el.getAttribute("data-sid"));
    var cur = comments(u, t), id = "rep_" + u.id + "_" + t.year + "_t" + t.term;
    S().put("reports", Object.assign({ id: id, pupilId: u.id, year: String(t.year), term: t.term }, cur, { headComment: el.value.trim().slice(0, 600), by: (M.me() || {}).id }));
    UI.toast("Comment saved");
  };
  A.act["rc-preview"] = function (el) {
    var u = M.user(el.getAttribute("data-sid")), t = pageTerm();
    var g = R.groups(), files = filesFor(g, t, u.id), rep = files.length ? files[0].rep : R.studentReport(u, t);
    UI.modal({ title: u.name + ": report card", size: "wide", body: '<div class="rc-preview"><div class="rc-scale-box">' + R.page(rep) + "</div></div>", foot: [{ label: "Close" }] });
  };
  /** Make the PDFs (desktop app), or print (a browser). */
  A.act["rc-make"] = function (el) {
    var t = pageTerm(), scope = el.getAttribute("data-scope"), level = el.getAttribute("data-level"), k = el.getAttribute("data-key"), sid = el.getAttribute("data-sid");
    var groups = R.groups().filter(function (g) { return scope === "all" || g.level === level; }).map(function (g) {
      return { level: g.level, classes: g.classes.filter(function (c) { return scope === "all" || scope === "level" || c.key === k; }) };
    });
    var files = filesFor(groups, t, scope === "student" ? sid : null), f = R.format();
    if (!files.length) { UI.toast("No students there", "bad"); return; }
    if (!desk()) { R.print(files.map(function (x) { return R.page(x.rep, f); })); return; }
    make(files, t, f);
  };
  function make(files, t, f) {
    var box, done = 0, folder = R.folderName(t), cancelled = false, BATCH = 6;
    UI.modal({ title: "Making report cards", body: '<p id="rc-prog">Starting…</p><div class="bar mt"><i id="rc-bar" style="width:0%"></i></div>', foot: [{ label: "Stop", onClick: function () { cancelled = true; } }], onMount: function (m) { box = m; } });
    var tell = function () { var p = document.getElementById("rc-prog"), b = document.getElementById("rc-bar"); if (p) p.textContent = done + " of " + files.length + " report cards made…"; if (b) b.style.width = Math.round(done / files.length * 100) + "%"; };
    var dir = "";
    var next = function (i) {
      if (cancelled || i >= files.length) return Promise.resolve();
      var batch = files.slice(i, i + BATCH).map(function (x) { return { path: x.path, html: R.doc([R.page(x.rep, f)]) }; });
      return desk().reports.pdf({ school: (A.Theme.get() || {}).name || "", folder: folder, files: batch }).then(function (r) {
        if (r && r.error) throw new Error(r.error);
        dir = r.dir; done += batch.length; tell();
        return next(i + BATCH);
      });
    };
    tell();
    next(0).then(function () {
      document.querySelectorAll(".modal-back").forEach(function (m) { m.remove(); });
      done && UI.modal({
        title: done + " report card" + (done === 1 ? "" : "s") + " saved",
        body: '<p>They are in <code style="overflow-wrap:anywhere">' + esc(dir) + "</code>, one folder for each " + (primary() ? "grade" : "form") + " and class.</p>" +
          '<ul class="small mt" style="padding-left:20px;display:grid;gap:4px"><li><b>WhatsApp:</b> in a chat, attach → Document, and choose the PDFs (WhatsApp Desktop takes several at once).</li>' +
          "<li><b>Email:</b> attach the PDFs, or a whole class: right-click the class's folder → Send to → Compressed (zipped) folder, and attach the zip.</li>" +
          "<li><b>Printing:</b> open a PDF and print it, or select several in the folder, right-click → Print.</li></ul>",
        foot: [{ label: "Close" }, { label: "Open the folder", cls: "btn-primary", onClick: function () { desk().reports.open(dir); return false; } }],
      });
    }).catch(function (e) {
      document.querySelectorAll(".modal-back").forEach(function (m) { m.remove(); });
      UI.toast("Couldn't make the report cards: " + (e.message || e), "bad");
    });
  }
  /** Print some report cards (a browser: choose Save as PDF). */
  R.print = function (pages) {
    var root = document.getElementById("print-root");
    if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
    root.innerHTML = '<style>' + R.CSS + "</style>" + pages.join("");
    document.body.classList.add("printing");
    var done = function () { document.body.classList.remove("printing"); root.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(function () { window.print(); setTimeout(function () { if (document.body.classList.contains("printing")) done(); }, 1000); }, 50);
  };

  /* ------------------------------------------------------------------ the format, changed by an admin */
  A.act["rc-format"] = function () {
    var f = R.format();
    var colRow = function (x) {
      return '<div class="rc-colrow row" style="gap:6px"><input type="checkbox" data-k="on"' + (x.on !== false ? " checked" : "") + ' aria-label="Show this column">' +
        '<input class="input sm grow" data-k="label" value="' + esc(x.label) + '" aria-label="Heading">' +
        '<select class="select sm" style="width:auto" data-k="source" aria-label="What it shows">' + R.SOURCES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === x.source ? " selected" : "") + ">" + esc(s[1]) + "</option>"; }).join("") + "</select>" +
        '<button type="button" class="btn btn-sm btn-ghost btn-icon" data-move="-1" aria-label="Move up">' + I("up") + '</button><button type="button" class="btn btn-sm btn-ghost btn-icon" data-move="1" aria-label="Move down">' + I("down") + "</button>" +
        '<button type="button" class="btn btn-sm btn-ghost btn-icon" data-del aria-label="Remove">' + I("x") + "</button></div>";
    };
    var gradeRow = function (g) { return '<div class="rc-graderow row" style="gap:6px"><input class="input sm" style="width:110px" data-k="grade" value="' + esc(g.grade) + '" aria-label="Grade"><span class="small">from</span><input class="input sm" style="width:70px" inputmode="numeric" data-k="min" value="' + g.min + '" aria-label="Lowest mark"><span class="small">%</span><button type="button" class="btn btn-sm btn-ghost btn-icon" data-del aria-label="Remove">' + I("x") + "</button></div>"; };
    UI.modal({
      title: "Report card format", sub: "How every report card looks", size: "wide",
      body: '<form id="rc-fmt" class="form-grid">' +
        '<label class="field"><span>Title</span><input class="input" name="title" value="' + esc(f.title) + '"></label>' +
        '<label class="field"><span>Colours</span><select class="select" name="colours"><option value="template"' + (f.colours !== "school" ? " selected" : "") + '>Report card blue</option><option value="school"' + (f.colours === "school" ? " selected" : "") + ">The school's colours</option></select></label>" +
        '<div class="field full"><span class="label">Columns</span><div id="rc-cols" class="stack" style="gap:6px">' + f.columns.map(colRow).join("") + '</div><button type="button" class="btn btn-sm mt-sm" id="rc-addcol">' + I("plus") + "Add a column</button></div>" +
        '<label class="field full"><span>Extra rows <span class="muted">(one per line, under the subjects: e.g. Conduct, Attendance)</span></span><textarea class="input" name="rows" rows="2">' + esc(f.rows.map(function (r) { return r.label; }).join("\n")) + "</textarea></label>" +
        '<div class="field full"><span class="label">Grading scale</span><div class="row wrap" style="gap:6px;margin-bottom:6px">' + Object.keys(R.SCALES).map(function (k) { return '<button type="button" class="btn btn-sm btn-ghost" data-scale="' + k + '">' + esc(R.SCALES[k].name) + "</button>"; }).join("") + "</div>" +
        '<div id="rc-grades" class="stack" style="gap:6px">' + f.grades.map(gradeRow).join("") + '</div><button type="button" class="btn btn-sm mt-sm" id="rc-addgrade">' + I("plus") + "Add a grade</button></div>" +
        '<label class="field full"><span>Comments teachers pick from <span class="muted">(one per line; they can also type their own)</span></span><textarea class="input" name="comments" rows="4">' + esc(f.comments.join("\n")) + "</textarea></label>" +
        '<label class="field"><span>Comment box heading</span><input class="input" name="headLabel" value="' + esc(f.headLabel) + '"></label>' +
        '<label class="field"><span>New end-of-term marks are out of</span><input class="input" name="outOf" inputmode="numeric" value="' + f.outOf + '"></label>' +
        '<div class="field full"><span class="label">Also show</span><div class="row wrap" style="gap:14px">' +
        [["studentNo", "Student ID"], ["term", "Term and year"], ["average", "Overall average"], ["position", "Position in the class"], ["teacherComment", "Class teacher's comment box"]].map(function (s) {
          return '<label class="check"><input type="checkbox" name="show_' + s[0] + '"' + (f.show[s[0]] ? " checked" : "") + "> " + s[1] + "</label>";
        }).join("") + "</div></div></form>",
      foot: [{ label: "Back to the template", cls: "btn-ghost", onClick: function () {
        return UI.confirm("Go back to the original report card format?", { ok: "Go back" }).then(function (ok) { if (!ok) return false; S().put("settings", { id: "reportcard" }); UI.toast("Back to the template"); A.render(); });
      } }, { label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var form = m.querySelector("#rc-fmt"), d = UI.formData(form);
        var cols = Array.prototype.map.call(m.querySelectorAll(".rc-colrow"), function (r) {
          return { label: r.querySelector("[data-k=label]").value.trim() || "Column", source: r.querySelector("[data-k=source]").value, on: r.querySelector("[data-k=on]").checked };
        });
        var grades = Array.prototype.map.call(m.querySelectorAll(".rc-graderow"), function (r) { return { grade: r.querySelector("[data-k=grade]").value.trim(), min: Number(r.querySelector("[data-k=min]").value) }; })
          .filter(function (g) { return g.grade && g.min >= 0 && g.min <= 100; });
        if (!cols.some(function (c) { return c.on; })) { UI.toast("Keep at least one column", "bad"); return false; }
        if (!grades.length) { UI.toast("Keep at least one grade", "bad"); return false; }
        var show = {};
        ["studentNo", "term", "average", "position", "teacherComment"].forEach(function (k) { show[k] = !!d["show_" + k]; });
        S().put("settings", { id: "reportcard", title: d.title.trim() || "REPORT CARD", colours: d.colours, columns: cols,
          rows: d.rows.split("\n").map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return { label: x }; }),
          grades: grades, comments: d.comments.split("\n").map(function (x) { return x.trim(); }).filter(Boolean),
          headLabel: d.headLabel.trim() || "Head Comment", outOf: Math.max(1, Math.min(1000, Number(d.outOf) || 100)), show: show });
        UI.toast("Report card format saved");
        A.render();
      } }],
      onMount: function (m) {
        var cols = m.querySelector("#rc-cols"), grades = m.querySelector("#rc-grades");
        m.querySelector("#rc-addcol").addEventListener("click", function () { cols.insertAdjacentHTML("beforeend", colRow({ label: "New column", source: "blank", on: true })); });
        m.querySelector("#rc-addgrade").addEventListener("click", function () { grades.insertAdjacentHTML("beforeend", gradeRow({ grade: "", min: 0 })); });
        m.addEventListener("click", function (e) {
          var b = e.target.closest("[data-move],[data-del],[data-scale]");
          if (!b) return;
          if (b.hasAttribute("data-scale")) { grades.innerHTML = R.SCALES[b.getAttribute("data-scale")].grades.map(function (g) { return gradeRow({ grade: g[0], min: g[1] }); }).join(""); return; }
          var row = b.closest(".rc-colrow, .rc-graderow");
          if (b.hasAttribute("data-del")) { row.remove(); return; }
          var dir = Number(b.getAttribute("data-move"));
          if (dir < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
          if (dir > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
        });
      },
    });
  };
})(window.App);
