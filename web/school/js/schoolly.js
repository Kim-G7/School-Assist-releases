/* Schoolly (2026-11-14): School Assist's own helper. It runs on each device and uses no AI service, so it costs nothing
 * however much it is used (a school's candidates sitting 2 000 papers a day included).
 *  - Reading a document word for word (Schoolly.read): a syllabus PDF or Word document is split by its headings into
 *    the parts a teacher looks for (aims, assessment objectives, the papers and their weighting, grading, the subject
 *    content, command words), each with its text as written, and its topics: numbered ones as js/sylread.js reads them,
 *    or, for a subject taught as skills (English Language: Reading R1 to R5, Writing W1 to W5), its skills and their
 *    objectives, or its papers. Before, a syllabus with no numbered topics read as "No topics were found".
 *  - Marking written answers (Schoolly.same, Schoolly.denied, Schoolly.explain: js/marker.js): each point of the
 *    marking scheme against the answer, allowing a spelling slip, another ending and common synonyms, and not crediting
 *    a point the answer denies ("does not increase"), with a line saying which points it found. Where it isn't sure,
 *    it says so and the teacher has the last word. The paid AI marking (Settings → AI marking) stays for schools that
 *    want it.
 *  - Finding the way (the Schoolly button at the top, 2026-11-15): a tour of the page on the screen, part by part
 *    (js/tour.js), in place of asking it how to do something; what can be done on each page (HELP) opens the tour.
 * Schoolly is rules and word matching, not a language model: it doesn't make answers up, and leaves what it can't
 * settle to the teacher. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI;
  var Sy = (A.Schoolly = {});

  /* ================================================================== reading a document */
  var KINDS = [
    ["objectives", /\bassessment objectives?\b|^AO\d\b/i, "Assessment objectives"],
    ["assessment", /\b(assessment overview|scheme of assessment|details of the assessment|components?|weightings?|how (?:the )?(?:syllabus|subject|qualification) is assessed|papers?\s+\d|assessment)\b/i, "Assessment: papers and weighting"],
    ["grading", /\b(grade descriptions?|grading|grades? available|grade thresholds|certification|grades)\b/i, "Grading"],
    ["command", /\b(command words|glossary)\b/i, "Command words"],
    ["content", /\b(subject content|syllabus content|content overview|topic content|the content|skills|content)\b/i, "Subject content"],
    ["aims", /\b(aims?|why choose|about (?:the|this) syllabus|syllabus overview|introduction|qualification overview|overview)\b/i, "Aims and overview"],
  ];
  Sy.KIND_LABEL = { aims: "Aims and overview", objectives: "Assessment objectives", assessment: "Assessment: papers and weighting", grading: "Grading", content: "Subject content", command: "Command words", other: "Other" };
  function kindOf(h) { for (var i = 0; i < KINDS.length; i++) if (KINDS[i][1].test(h)) return KINDS[i][0]; return "other"; }
  // the skills a language syllabus is set out in (R1, W2, S3, L1…)
  var SKILL = { R: "Reading", W: "Writing", S: "Speaking", L: "Listening", SL: "Speaking and listening", AO: "Assessment objectives" };
  var CODE = /^((?:AO|SL|[RWSL]))(\d{1,2})\b[.:)]?\s+(.{3,})$/;

  /** Sections and topics from a document's lines: [{ text, h (height), bold, page }]; body: the body text's height. */
  Sy.fromLines = function (lines, body) {
    body = body || 10;
    var isHead = function (l) {
      var t = String(l.text || "").trim();
      return t.length >= 3 && t.length <= 90 && (l.bold || l.h >= body * 1.12 || l.heading) && !/[.;,]$/.test(t) && !/^\d{1,3}$/.test(t) &&
        t.split(/\s+/).length <= 12 && /[A-Za-z]{2}/.test(t) && !CODE.test(t);
    };
    var sections = [], cur = null, top = null, ctx = "other";
    lines.forEach(function (l) {
      var t = String(l.text || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      if (isHead(l)) {
        var big = l.heading ? l.heading === 1 : l.h >= body * 1.3;
        cur = { heading: t, kind: kindOf(t), level: big ? 1 : 2, page: l.page || null, lines: [] };
        if (big) { top = cur; ctx = cur.kind; }
        else {
          if (top) cur.parent = top.heading;
          if (cur.kind === "other") cur.kind = ctx; else ctx = cur.kind;
        }
        sections.push(cur);
      } else {
        if (!cur) { cur = { heading: "Opening pages", kind: "aims", level: 1, page: l.page || null, lines: [] }; sections.push(cur); top = cur; }
        cur.lines.push(t);
      }
    });
    sections.forEach(function (s) { s.text = s.lines.join("\n"); s.words = s.text ? s.text.split(/\s+/).length : 0; s.label = Sy.KIND_LABEL[s.kind]; });
    var tp = topicsOf(sections);
    return { sections: sections.filter(function (s) { return s.words || s.level === 1 || s.kind !== "other"; }), topics: tp.topics, how: tp.how };
  };

  /** Topics when there are no numbered ones: the skills and their objectives; else the content's own headings; else the papers. */
  function topicsOf(sections) {
    var out = [];
    var pack = function (title, items) { var n = out.length + 1; out.push({ n: String(n), title: title, outline: items.map(function (x, j) { return { n: n + "." + (j + 1), title: x.title, points: x.points || [], sup: [] }; }) }); };
    // 1. skills: "R1 demonstrate understanding of explicit meanings", grouped by their letter
    var groups = [], byKey = {};
    sections.forEach(function (s) {
      var last = null;
      s.lines.forEach(function (t) {
        var m = CODE.exec(t);
        if (m) {
          var k = m[1], g = byKey[k];
          if (!g) { g = byKey[k] = { title: SKILL[k] && !/^(AO)$/.test(k) ? SKILL[k] : /reading|writing|speaking|listening/i.test(s.heading) ? s.heading : SKILL[k] || s.heading, items: [] }; groups.push(g); }
          if (!g.items.some(function (x) { return x.code === k + m[2]; })) { last = { code: k + m[2], title: k + m[2] + " " + m[3] }; g.items.push(last); } else last = null;
        } else if (last && /^[a-z(]/.test(t) && last.title.length < 300) last.title += " " + t; // (the objective runs on)
        else last = null;
      });
    });
    var skills = groups.filter(function (g) { return g.title !== "Assessment objectives"; });
    if (skills.length) { skills.forEach(function (g) { pack(g.title, g.items); }); return { topics: out, how: "skills" }; }
    // 2. the subject content's own headings, with what is under each
    var content = sections.filter(function (s) { return s.kind === "content" && s.level === 2 && s.words; });
    if (content.length >= 2) {
      content.forEach(function (s) { pack(s.heading, s.lines.filter(function (t) { return t.length > 3; }).slice(0, 40).map(function (t) { return { title: t.slice(0, 300) }; })); });
      return { topics: out, how: "headings" };
    }
    // 3. the papers: "Paper 1 Reading", "Component 2: Directed writing and composition"
    var papers = [];
    sections.forEach(function (s) {
      [s.heading].concat(s.lines).forEach(function (t, i) {
        var m = /^(paper|component)\s*(\d{1,2})\b\s*[:–—-]?\s*(.*)$/i.exec(t);
        if (m && m[3] && !papers.some(function (p) { return p.n === m[2]; })) papers.push({ n: m[2], title: (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) + " " + m[2] + ": " + m[3].replace(/\s+\d+\s*(hours?|hrs?|minutes?|mins?)\b.*$/i, "").slice(0, 120), points: s.lines.slice(i, i + 4) });
      });
    });
    papers.sort(function (a, b) { return Number(a.n) - Number(b.n); }).forEach(function (p) { pack(p.title, (p.points || []).filter(Boolean).map(function (t) { return { title: t.slice(0, 300) }; })); });
    return { topics: out, how: out.length ? "papers" : "" };
  }

  /** Numbered topics in plain lines ("1 Number", "1.1 Integers"), for Word documents. */
  function numbered(lines) {
    var topics = [], cur = null;
    lines.forEach(function (l) {
      var t = String(l.text || "").trim(), m;
      if ((m = /^(\d{1,2})\.(\d{1,2})\.?\s+(.{2,200})$/.exec(t))) {
        if (!cur || cur.n !== m[1]) { cur = { n: m[1], title: "Topic " + m[1], outline: [] }; topics.push(cur); }
        cur.outline.push({ n: m[1] + "." + m[2], title: m[3], points: [], sup: [] });
      } else if ((m = /^(\d{1,2})[.)]?\s+([A-Z].{2,110})$/.exec(t)) && !/[.;]$/.test(t)) {
        var had = topics.filter(function (x) { return x.n === m[1]; })[0];
        if (had) { if (/^Topic \d+$/.test(had.title)) had.title = m[2]; cur = had; }
        else { cur = { n: m[1], title: m[2], outline: [] }; topics.push(cur); }
      } else if (cur && cur.outline.length && t.length > 3) {
        var p = cur.outline[cur.outline.length - 1];
        if (p.points.length < 30) p.points.push(t.slice(0, 400));
      }
    });
    return topics.length >= 2 ? topics : [];
  }

  /* ---- Word documents (.docx): the paragraphs and their heading styles, word for word */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  /** One file out of a zip (a .docx is one). */
  function unzipOne(buf, want) {
    var b = new Uint8Array(buf), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error("This isn't a Word document (.docx)."));
    var n = u16(b, eocd + 10), at = u32(b, eocd + 16);
    for (var k = 0; k < n; k++) {
      if (u32(b, at) !== 0x02014b50) break;
      var method = u16(b, at + 10), size = u32(b, at + 20), nl = u16(b, at + 28), el = u16(b, at + 30), cl = u16(b, at + 32), off = u32(b, at + 42);
      var name = new TextDecoder().decode(b.subarray(at + 46, at + 46 + nl));
      if (name === want) {
        var start = off + 30 + u16(b, off + 26) + u16(b, off + 28), data = b.subarray(start, start + size);
        if (method === 0) return Promise.resolve(new TextDecoder().decode(data));
        if (method !== 8 || typeof DecompressionStream === "undefined") return Promise.reject(new Error("This copy can't open that Word document. Save it as a PDF and read that."));
        var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        // (read part by part and stopped past 30 MB: a small file that unpacks to gigabytes, a "zip bomb", never fills the memory)
        var reader = stream.getReader(), parts = [], got = 0;
        var pump = function () {
          return reader.read().then(function (r) {
            if (r.done) return new TextDecoder().decode(parts.length === 1 ? parts[0] : concat(parts, got));
            got += r.value.length;
            if (got > 30 * 1048576) { reader.cancel(); throw new Error("That Word document is too big to read. Save it as a PDF and read that."); }
            parts.push(r.value); return pump();
          });
        };
        return pump();
      }
      at += 46 + nl + el + cl;
    }
    return Promise.reject(new Error("No text was found in that Word document."));
  }
  function concat(parts, n) { var out = new Uint8Array(n), at = 0; parts.forEach(function (p) { out.set(p, at); at += p.length; }); return out; }
  function docxLines(xml) {
    // (a real Word document's text has no DOCTYPE or entities of its own: one that does is refused before any parsing,
    // so no external entity (XXE) or entity bomb is ever read; the browser's parser loads none anyway)
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("That Word document has parts School Assist won't read. Save it again from Word, or as a PDF.");
    if (xml.length > 30 * 1048576) throw new Error("That Word document is too big to read. Save it as a PDF and read that.");
    var doc = new DOMParser().parseFromString(xml, "application/xml"), W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", out = [];
    var ps = doc.getElementsByTagNameNS(W, "p");
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], style = p.getElementsByTagNameNS(W, "pStyle")[0], sv = style ? style.getAttributeNS(W, "val") || style.getAttribute("w:val") || "" : "";
      var runs = p.getElementsByTagNameNS(W, "r"), text = "", chars = 0, bold = 0;
      for (var r = 0; r < runs.length; r++) {
        var ts = runs[r].getElementsByTagNameNS(W, "t"), s = "";
        for (var t = 0; t < ts.length; t++) s += ts[t].textContent;
        if (runs[r].getElementsByTagNameNS(W, "tab").length) s = "\t" + s;
        var b = runs[r].getElementsByTagNameNS(W, "b")[0], on = b && (b.getAttributeNS(W, "val") || b.getAttribute("w:val") || "true") !== "false" && (b.getAttributeNS(W, "val") || b.getAttribute("w:val")) !== "0";
        text += s; chars += s.length; if (on) bold += s.length;
      }
      text = text.replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      var hm = /^(?:heading|kop|titre|berschrift)\s*(\d)$/i.exec(sv) || /^Heading(\d)$/.exec(sv), level = /^title$/i.test(sv) ? 1 : hm ? Math.min(2, Number(hm[1])) : 0;
      out.push({ text: text, h: level === 1 ? 16 : level === 2 ? 12.5 : 10, bold: chars > 0 && bold / chars > 0.6, heading: level || undefined });
    }
    return out;
  }
  Sy.readDocx = function (file) {
    return file.arrayBuffer().then(function (buf) { return unzipOne(buf, "word/document.xml"); }).then(function (xml) {
      var lines = docxLines(xml), title = "", code = "";
      lines.slice(0, 20).forEach(function (l) { var m = /\b(\d{4})\b/.exec(l.text); if (!code && m && !/20\d\d/.test(m[1]) && /[A-Za-z]/.test(l.text)) { code = m[1]; title = l.text; } });
      var r = Sy.fromLines(lines, 10), num = r.how === "skills" ? [] : numbered(lines);
      return { title: title || (lines[0] ? lines[0].text : ""), code: code, topics: num.length ? num : r.topics, sections: r.sections, by: num.length ? "numbers" : "schoolly", words: lines.reduce(function (a, l) { return a + l.text.split(/\s+/).length; }, 0) };
    });
  };
  /** Any syllabus document: a PDF (js/sylread.js, which asks Schoolly when it finds no numbered topics) or a Word document. */
  Sy.read = function (file, progress) {
    var docx = /\.docx$/i.test(file.name || "") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (docx) return Sy.readDocx(file);
    if (/\.doc$/i.test(file.name || "")) return Promise.reject(new Error("an old Word document (.doc): save it as .docx or PDF first"));
    return A.SylRead.read(file, progress);
  };
  Sy.ACCEPT = "application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  /** What Schoolly read, part by part, word for word (HTML), for a teacher to look through. */
  Sy.sectionsHtml = function (r) {
    var secs = (r && r.sections) || [];
    if (!secs.length) return "";
    var order = ["aims", "objectives", "assessment", "grading", "content", "command", "other"], by = {};
    secs.forEach(function (s) { (by[s.kind] = by[s.kind] || []).push(s); });
    return '<div class="schoolly-read"><div class="row" style="gap:8px">' + Sy.mark() + "<b>What Schoolly read</b>" + (r.code ? '<span class="subj-code">' + esc(r.code) + "</span>" : "") + '<span class="small muted">' + secs.length + " parts</span></div>" +
      order.filter(function (k) { return by[k]; }).map(function (k) {
        return '<details class="mt-sm"><summary class="small"><b>' + esc(Sy.KIND_LABEL[k]) + '</b> <span class="muted">(' + by[k].map(function (s) { return esc(s.heading); }).slice(0, 4).join(" · ") + (by[k].length > 4 ? " …" : "") + ")</span></summary>" +
          by[k].map(function (s) { return '<div class="schoolly-sec"><div class="small"><b>' + esc(s.heading) + "</b>" + (s.page ? ' <span class="muted">page ' + s.page + "</span>" : "") + '</div><div class="small">' + esc(s.text || "").replace(/\n/g, "<br>") + "</div></div>"; }).join("") + "</details>";
      }).join("") + "</div>";
  };

  /* ================================================================== marking written answers */
  var SYN = [
    ["increase", "rise", "risen", "grow", "higher", "more", "greater", "bigger", "larger", "raise", "gain", "go up", "goes up"],
    ["decrease", "fall", "fallen", "drop", "lower", "less", "fewer", "reduce", "decline", "smaller", "shrink", "go down", "goes down"],
    ["big", "large", "huge", "great"], ["small", "little", "tiny", "minute"], ["fast", "quick", "rapid", "speed"], ["slow", "gradual"],
    ["heat", "thermal", "warm", "hot"], ["cool", "cold", "chill"], ["kill", "destroy"], ["help", "aid", "assist"], ["use", "utilise", "utilize", "employ"],
    ["make", "produce", "form", "create", "generate"], ["need", "require"], ["stop", "prevent", "block", "inhibit"], ["show", "indicate", "demonstrate"],
    ["cause", "lead", "result"], ["water", "h2o"], ["carbon dioxide", "co2"], ["oxygen", "o2"], ["energy", "power"], ["move", "travel", "transport", "carry"],
    ["absorb", "take in", "soak"], ["release", "give out", "emit", "let out"], ["dissolve", "soluble"], ["poor", "low income"], ["rich", "wealthy", "high income"],
  ];
  var STEM = function (w) { return String(w).toLowerCase().replace(/(ies)$/, "y").replace(/(ing|ed|es|s|ly)$/, "").replace(/(e)$/, ""); };
  var group = {};
  SYN.forEach(function (g, i) { g.forEach(function (w) { if (!/\s/.test(w)) group[STEM(w)] = i; }); });
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var low = i;
      for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < low) low = cur[j]; }
      if (low > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  /** Are these the same word for marking: a spelling slip (photosynthsis), or a common synonym (rises / increases)? Both stemmed. */
  Sy.same = function (a, b) {
    if (a === b) return true;
    if (group[a] != null && group[a] === group[b]) return true;
    if (/^\d/.test(a) || /^\d/.test(b)) return false;
    var n = Math.min(a.length, b.length);
    return n >= 5 && lev(a, b, n >= 8 ? 2 : 1) <= (n >= 8 ? 2 : 1);
  };
  var NEG = /\b(not|no|never|isn['’]?t|doesn['’]?t|don['’]?t|didn['’]?t|cannot|can['’]?t|won['’]?t|wasn['’]?t|aren['’]?t|without|neither|nor)\b/i;
  /** Does the answer deny this word ("does not increase")? The point itself saying "not" is left alone. */
  Sy.denied = function (answer, word, point) {
    if (NEG.test(point || "")) return false;
    var clauses = String(answer || "").toLowerCase().replace(/[‘’']/g, "'").split(/[.;:!?\n]|,\s*(?:but|however|whereas|while)\b|\b(?:but|however|whereas)\b/);
    return clauses.some(function (c) {
      var toks = c.split(/[^a-z0-9']+/).filter(Boolean);
      for (var i = 0; i < toks.length; i++) {
        if (!Sy.same(STEM(toks[i]), word)) continue;
        for (var k = Math.max(0, i - 3); k < i; k++) if (NEG.test(toks[k])) return true;
      }
      return false;
    });
  };
  /** The note under a written answer's mark: the points found and not found; unsure when only part of a point is there. */
  Sy.explain = function (found, missed, unsure) {
    var cut = function (p) { p = String(p).replace(/\s+/g, " ").trim(); return p.length > 70 ? p.slice(0, 68) + "…" : p; };
    var s = "Schoolly found " + found.length + " of " + (found.length + missed.length) + " marking point" + (found.length + missed.length === 1 ? "" : "s");
    if (found.length) s += ": " + found.map(cut).join("; ");
    if (missed.length) s += ". Not found: " + missed.map(cut).join("; ");
    s += ".";
    if (unsure) s += " Schoolly isn't sure of this one: your teacher checks it.";
    return s;
  };

  /* ================================================================== finding the way */
  /** Schoolly's mark: a small rounded "S" with a spark, in the school's colour. */
  Sy.mark = function () { return '<span class="schoolly-mark" aria-hidden="true">S</span>'; };
  var HELP = [
    { who: "enrol", q: "Enter a new student", k: "add student register enrol new pupil admit learner register subjects", steps: ["Open Enter students.", "Press Enter a student.", "Type the name, choose the form and class, tick the subjects.", "Save: the student ID is made, and the subjects appear in the student's portal at once."], href: "#/t/enrol" },
    { who: "teacher", q: "Take the register", k: "attendance register present absent late roll call mark", steps: ["Open Register (or My class).", "Tap each student's mark: present, absent, late or excused.", "It saves by itself."], href: "#/t/register" },
    { who: "teacher", q: "Enter end-of-term marks", k: "marks end of term exam results mark book scores report", steps: ["Open Mark book.", "Choose the class and End of term.", "Type each student's mark and a comment."], href: "#/t/markbook" },
    { who: "teacher", q: "Record a topic test or mock test", k: "topic test mock test exam marks mark book record", steps: ["Open Mark book and choose the class.", "Press New marks: a topic test (choose its topic), a mock test or the end-of-term test.", "Type each student's mark: they count towards the students' syllabus progress."], href: "#/t/markbook" },
    { who: "teacher", q: "Add notes for a topic", k: "notes topic co-teacher tutor short notes upload textbook", steps: ["Open Co-teacher and choose the subject.", "Press Add notes beside the topic: short notes typed in, or a document.", "The students' tutor teaches the topic from them."], href: "#/t/tutor" },
    { who: "teacher", q: "Plan the term's topics", k: "scheme of work plan term topics record of work taught", steps: ["Open Schemes & records and choose the class and subject.", "Give each of the syllabus's topics its term.", "Tick each topic when it has been taught."], href: "#/t/schemes" },
    { who: "admin", q: "Make or print report cards", k: "report cards print pdf term results reports", steps: ["Open Report cards (admins only: a card has every one of a student's subjects).", "Choose the term.", "Press Make every report card, or a class's Print. The desktop app saves PDFs in Documents."], href: "#/t/reportcards" },
    { who: "admin", q: "Change how report cards look", k: "report card format columns grading scale colours title contact address", steps: ["Open Report cards, then Format.", "Change the columns, the grading scale, the colours or the school's details at the foot.", "Save."], href: "#/t/reportcards" },
    { who: "subjects", q: "Set subject codes", k: "subject codes code 0580 igcse a level o level subjects list add subject", steps: ["Open Settings → Subjects & codes.", "Type each subject's code (e.g. Mathematics 0580).", "Use Add a subject for one the school is adding."], href: "#/t/settings?s=subjectcodes" },
    { who: "admin", q: "Let a device in", k: "device join let in code phone tablet waiting approve", steps: ["Open Settings → People & devices.", "Under Devices to let in, press Let it in beside the device's code."], href: "#/t/settings?s=people" },
    { who: "admin", q: "Add a teacher or change someone's details", k: "teacher staff add person password reset people account", steps: ["Open Settings → People & devices.", "Find the person, or add one.", "Edit gives a new password if they forgot theirs."], href: "#/t/settings?s=people" },
    { who: "admin", q: "Send a notice", k: "notice announcement meeting message staff send", steps: ["Open Notices.", "Press New notice, write it and choose who it is for.", "Send: it pops up on their devices."], href: "#/t/notices" },
    { who: "teacher", q: "See the timetable", k: "timetable lessons periods schedule week today", steps: ["Open Timetable."], href: "#/t/timetable" },
    { who: "teacher", q: "Read a syllabus document", k: "syllabus document pdf word read topics upload scheme outline", steps: ["Open Schemes & records or My subjects, and press Add the syllabus (or open the Syllabus library).", "Choose the school's or a ready-made one, or Read its document (PDF or Word).", "Schoolly reads it part by part; check the topics and save. It goes in the Syllabus library once, and Co-teacher lists its topics for notes."], href: "#/t/subjects" },
    { who: "teacher", q: "Set class work, a quiz or homework", k: "task homework assignment test set work class quiz classwork", steps: ["Open your subject class.", "Press New task: class work, homework, an assignment or a quiz.", "Set the due date and publish. Its marks go in the class's Gradebook."], href: "#/t/classes" },
    { who: "teacher", q: "Record marks from a test on paper", k: "record marks paper test hardcopy quiz class work gradebook mark book type marks", steps: ["Open your subject class's Gradebook and press Record marks (a topic test, mock or end-of-term test: the Mark book's Record marks).", "Say what it was, the day it was done and what it is out of.", "Type each student's mark: nothing is sent to the students to do, and each sees their mark."], href: "#/t/classes" },
    { who: "teacher", q: "Mark written answers", k: "marking written answers mark papers ai marking schoolly scheme", steps: ["Written answers are marked against the marking scheme by Schoolly as soon as a paper is handed in, on the device, for nothing.", "Each mark says which points were found; where Schoolly isn't sure, check it and change the mark."], href: "#/t/classes" },
    { who: "admin", q: "Turn on vacation mode", k: "vacation holiday mode school closed", steps: ["Open Vacation mode.", "Choose the dates."], href: "#/t/vacation" },
    { who: "admin", q: "Send parents the link", k: "parents link join whatsapp guardian", steps: ["Open Settings → Parents.", "Make the link, then copy it or print its QR code."], href: "#/t/settings?s=parents" },
    { who: "finance", q: "Record a fee payment", k: "fees payment receipt bursar accountant school fees balance", steps: ["Open School fees.", "Find the student, then Record a payment.", "The receipt is made by itself."], href: "#/t/fees" },
    { who: "admin", q: "Delete a student or teacher", k: "delete remove student teacher account left school erase", steps: ["Open Settings → People & devices and choose the person.", "Press Delete: it says what goes. A student who left: choose Left the school, and their marks and reports are kept.", "Delete everything erases their account, sign-in, work and marks on every device. Only admins can."], href: "#/t/settings?s=people" },
    { who: "admin", q: "Check the school's records", k: "check records links broken missing relational database data health fix", steps: ["Open Settings → Backup & data.", "Press Check the records: anything pointing at a record that isn't there is listed.", "Fix mends what it safely can."], href: "#/t/settings?s=data" },
    { who: "admin", q: "Back up the school's records", k: "backup restore data safe copy", steps: ["Open Settings → Backup & data.", "Make a backup now, or let the hub make one every Friday."], href: "#/t/settings?s=data" },
    { who: "student", q: "Sit a test or past paper", k: "exam mode test paper past paper practise revision sit", steps: ["Open Exam mode.", "Choose a subject and a paper, then start.", "When you hand it in, your marks come with the points you got."], href: "#/s/exam" },
    { who: "student", q: "See my subjects", k: "my subjects subjects codes classes registered", steps: ["Open My subjects: each subject with its code and teacher."], href: "#/s/subjects" },
    { who: "student", q: "Study a topic", k: "study learn topic notes continue tutor", steps: ["Open Home and press Continue, or open My subjects and choose a topic."], href: "#/s/home" },
    { who: "student", q: "Find books and notes", k: "library books notes files materials", steps: ["Open Library."], href: "#/s/library" },
    { who: "student", q: "See my tasks and homework", k: "tasks homework due assignment", steps: ["Open My tasks."], href: "#/s/tasks" },
    { who: "student", q: "See my timetable", k: "timetable lessons today week", steps: ["Open Timetable."], href: "#/s/timetable" },
    { who: "student", q: "See my progress", k: "progress results marks how am i doing", steps: ["Open My progress."], href: "#/s/progress" },
    { who: "all", q: "Sign out", k: "sign out log out leave", steps: ["Press the sign-out button at the foot of the menu (on a phone, at the top)."], href: "" },
    { who: "all", q: "Forgot my password", k: "forgot password pin reset can't sign in", steps: ["On the sign-in page, press Forgot your password?", "An admin gives you a new one."], href: "" },
    { who: "all", q: "Notification sound", k: "sound notification chime ding mute quiet alert noise", steps: ["New notifications play a short sound.", "To turn it off on this device, open the bell (teachers) or Notifications (students) and untick the sound."], href: "" },
    { who: "all", q: "Delete my account", k: "delete my account erase remove close account", steps: ["Open Settings → My password, then Delete my account.", "Type your password and DELETE.", "Everything of yours is erased. To come back you start from the beginning."], href: "" },
    { who: "all", q: "Light or dark mode", k: "dark mode light theme colours night", steps: ["Press the moon (or sun) at the top."], href: "" },
  ];
  function forMe(h, me) {
    if (!me) return false;
    if (h.who === "all") return true;
    if (me.role === "student") return h.who === "student";
    var fin = A.Fees && A.Fees.isFinance && A.Fees.isFinance(me);
    if (h.who === "finance") return fin || me.isAdmin;
    if (fin) return false;
    if (h.who === "enrol") return !!(A.Enrol && A.Enrol.nav && A.Enrol.nav(me));
    if (h.who === "subjects") return !!(A.Subjects && A.Subjects.mayEdit(me));
    if (h.who === "admin") return !!me.isAdmin;
    return h.who === "teacher";
  }
  /** What this person can do on the page at `hash` (the tour's welcome card): HELP's entries for that page. */
  Sy.helpFor = function (me, hash) {
    var at = String(hash || "").split("?"), path = at[0], s = /(?:^|&)s=([^&]+)/.exec(at[1] || "");
    return HELP.filter(function (h) {
      if (!h.href || !forMe(h, me)) return false;
      var hp = h.href.split("?"), hs = /(?:^|&)s=([^&]+)/.exec(hp[1] || "");
      return hp[0] === path && (!hs || (s && s[1] === hs[1]));
    });
  };
  /** The S at the top: a tour of the page (js/tour.js); a dot on it until the person has had one on this device. */
  Sy.button = function (me) {
    if (!me) return "";
    var isNew = A.Tour && A.Tour.isNew(me);
    return '<button class="btn btn-ghost btn-icon schoolly-btn' + (isNew ? " new" : "") + '" data-act="schoolly" data-tip="Schoolly: a tour of this page" aria-label="Schoolly: a tour of this page">' + Sy.mark() + "</button>";
  };
  A.act.schoolly = function () { if (A.Tour) A.Tour.start(); };
})(window.App);
