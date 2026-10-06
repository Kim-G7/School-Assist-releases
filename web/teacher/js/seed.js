/* Demo school data, generated relative to "today" so due dates always look current.
   Settings → Data → "Reset demo data" regenerates it; "Start empty" clears it. */
(function (A) {
  "use strict";

  var DAY = 86400000;
  var PIN = (window.SCHOOL_CONFIG && window.SCHOOL_CONFIG.demoPin) || "1234";

  /* ---------------------------------------------------- tiny PDF generator
     Builds a real, valid multi-page PDF (Helvetica, ASCII) so the offline PDF
     reader has something to open without shipping copyrighted books. */
  A.makePdf = function (title, sections) {
    var lines = [];
    sections.forEach(function (s) {
      if (s.h) lines.push({ t: s.h, b: true, size: 14, gap: 26 });
      (s.p || []).forEach(function (p) { wrap(p, 88).forEach(function (l) { lines.push({ t: l, size: 11, gap: 16 }); }); });
      lines.push({ t: "", size: 11, gap: 8 });
    });
    var pages = [], cur = [], y = 0, maxY = 690;
    lines.forEach(function (l) { if (y + l.gap > maxY) { pages.push(cur); cur = []; y = 0; } cur.push(l); y += l.gap; });
    if (cur.length) pages.push(cur);

    var objs = [];
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    var kids = [];
    pages.forEach(function (pg, i) {
      var pid = 5 + i * 2, cid = pid + 1;
      kids.push(pid + " 0 R");
      var s = "BT /F2 20 Tf 56 790 Td (" + pdfEsc(title) + ") Tj ET\n";
      s += "0.8 0.8 0.8 RG 56 776 m 539 776 l S\n";
      var yy = 750;
      pg.forEach(function (l) {
        yy -= l.gap - 10;
        if (l.t) s += "BT /" + (l.b ? "F2" : "F1") + " " + l.size + " Tf 56 " + yy + " Td (" + pdfEsc(l.t) + ") Tj ET\n";
        yy -= 10;
      });
      s += "BT /F1 9 Tf 56 40 Td (Page " + (i + 1) + " of " + pages.length + "  -  sample document generated for the demo) Tj ET\n";
      objs[pid] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents " + cid + " 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>";
      objs[cid] = "<< /Length " + s.length + " >>\nstream\n" + s + "endstream";
    });
    objs[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>";
    var out = "%PDF-1.4\n", offsets = [];
    for (var n = 1; n < objs.length; n++) { offsets[n] = out.length; out += n + " 0 obj\n" + objs[n] + "\nendobj\n"; }
    var xref = out.length;
    out += "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
    for (n = 1; n < objs.length; n++) out += ("0000000000" + offsets[n]).slice(-10) + " 00000 n \n";
    out += "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
    return new Blob([out], { type: "application/pdf" });
  };
  function pdfEsc(s) {
    return String(s).replace(/[−–—]/g, "-").replace(/×/g, "x").replace(/÷/g, "/").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/π/g, "pi").replace(/²/g, "^2").replace(/³/g, "^3").replace(/√/g, "sqrt").replace(/θ/g, "theta").replace(/°/g, " deg")
      .replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }
  function wrap(text, width) {
    var words = String(text).split(/\s+/), out = [], line = "";
    words.forEach(function (w) { if ((line + " " + w).trim().length > width) { out.push(line); line = w; } else line = (line + " " + w).trim(); });
    if (line) out.push(line);
    return out;
  }

  /* ----------------------------------------------------------------- data */
  var TEACHERS = [
    { id: "t_moyo", name: "Mrs T. Moyo", subjects: "Mathematics", isAdmin: true, title: "Head of Mathematics" },
    { id: "t_ncube", name: "Mr K. Ncube", subjects: "Biology", title: "Biology teacher" },
    { id: "t_chikomo", name: "Ms R. Chikomo", subjects: "Physics", title: "Physics teacher" },
  ];
  // [name, level, stream]. Tafadzwa (s01) is the example account: no password yet, so the
  // first sign-in shows the "set up your account" flow. Everyone else is test data.
  var STUDENTS = [
    ["Tafadzwa Mhlanga", "Form 4", "A"], ["Nyasha Dube", "Form 4", "A"], ["Tinashe Sibanda", "Form 4", "A"], ["Chipo Mutasa", "Form 4", "A"],
    ["Farai Gumbo", "Form 4", "A"], ["Rutendo Zvobgo", "Form 4", "A"], ["Tatenda Marufu", "Form 4", "A"], ["Kudzai Chirwa", "Form 4", "A"],
    ["Anesu Banda", "Form 4", "A"], ["Ruvimbo Nyoni", "Form 4", "A"], ["Takudzwa Phiri", "Form 4", "A"], ["Vimbai Mapfumo", "Form 4", "A"],
    ["Blessing Ndlovu", "Form 4", "A"], ["Panashe Mudzi", "Form 4", "A"],
    ["Munashe Hove", "Form 3", "B"], ["Tanaka Shumba", "Form 3", "B"], ["Rufaro Chari", "Form 3", "B"], ["Tapiwa Gora", "Form 3", "B"],
    ["Tariro Mpofu", "Form 3", "B"], ["Kundai Musariri", "Form 3", "B"], ["Ropafadzo Chiweshe", "Form 3", "B"], ["Tawanda Mlambo", "Form 3", "B"],
    ["Shingai Dzapasi", "Form 3", "B"], ["Nokutenda Sithole", "Form 3", "B"],
    ["Kudakwashe Moyo", "Form 4", "B"], ["Rumbidzai Sithole", "Form 4", "B"], ["Tinotenda Mhuri", "Form 4", "B"], ["Chiedza Nhamo", "Form 4", "B"],
    ["Tafara Zulu", "Form 4", "B"], ["Mazvita Ncube", "Form 4", "B"],
  ];
  var BELLS = [
    { id: "p1", label: "1", start: "08:00", end: "08:40" },
    { id: "p2", label: "2", start: "08:40", end: "09:20" },
    { id: "p3", label: "3", start: "09:20", end: "10:00" },
    { id: "brk", label: "Break", start: "10:00", end: "10:30", isBreak: true },
    { id: "p4", label: "4", start: "10:30", end: "11:10" },
    { id: "p5", label: "5", start: "11:10", end: "11:50" },
    { id: "p6", label: "6", start: "11:50", end: "12:30" },
    { id: "lun", label: "Lunch", start: "12:30", end: "13:15", isBreak: true },
    { id: "p7", label: "7", start: "13:15", end: "13:55" },
    { id: "p8", label: "8", start: "13:55", end: "14:35" },
    { id: "p9", label: "9", start: "14:35", end: "15:15" },
    { id: "clb", label: "Clubs & sport", start: "15:15", end: "16:00", isBreak: true },
  ];
  A.DEFAULT_BELLS = BELLS;
  var LESSON_PERIODS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
  // subjects taught by staff who are not in the app yet
  var OTHER = {
    E: ["English", "Mrs P. Dube", "Room 12"], S: ["Shona", "Mr T. Chari", "Room 12"], H: ["History", "Mrs L. Mpofu", "Room 14"],
    G: ["Geography", "Mr J. Gumbo", "Room 15"], C: ["Chemistry", "Mr S. Banda", "Lab 3"], CS: ["Computer Science", "Ms F. Hove", "Computer Lab"],
    PE: ["Physical Education", "Mr B. Nyoni", "Sports field"], HS: ["Heritage Studies", "Mrs R. Zvobgo", "Room 12"], L: ["Library", "Librarian", "Library"],
    M4B: ["Mathematics", "Mr D. Sibanda", "Room 16"], B3: ["Biology", "Mrs K. Phiri", "Lab 2"], B4B: ["Biology", "Mrs K. Phiri", "Lab 2"],
  };
  // Monday → Friday, periods 1–9
  var GRID = {
    "Form 4|A": [
      ["M", "M", "E", "S", "B", "C", "H", "P", "G"],
      ["E", "M", "B", "B", "S", "CS", "C", "H", "P"],
      ["M", "E", "C", "S", "P", "P", "HS", "G", "M"],
      ["B", "M", "E", "H", "CS", "S", "C", "PE", "PE"],
      ["M", "E", "S", "B", "G", "HS", "L", "C", "M"],
    ],
    "Form 4|B": [
      ["E", "S", "M4B", "M4B", "C", "B4B", "H", "P", "G"],
      ["M4B", "E", "S", "C", "B4B", "H", "CS", "G", "P"],
      ["E", "M4B", "S", "C", "P", "P", "G", "HS", "B4B"],
      ["S", "E", "M4B", "B4B", "H", "CS", "C", "PE", "PE"],
      ["M4B", "C", "E", "S", "HS", "B4B", "G", "L", "M4B"],
    ],
    "Form 3|B": [
      ["E", "S", "M", "M", "H", "G", "C", "B3", "PE"],
      ["M", "E", "S", "C", "HS", "G", "L", "H", "M"],
      ["S", "E", "M", "B3", "C", "H", "G", "CS", "L"],
      ["E", "S", "H", "M", "G", "C", "B3", "PE", "PE"],
      ["C", "E", "M", "S", "HS", "B3", "G", "CS", "L"],
    ],
  };

  A.Seed = {
    run: function (Store) {
      if (A.edition === "home") return A.Cloud ? null : runHome(Store); // online: everything comes from the cloud
      if (A.edition === "teacher") return A.Primary ? A.Primary.seed(Store) : null; // the first teacher sets the school up
      var M = A.M, now = Date.now(), rand = A.rng(20260925);
      var put = function (c, r) { return Store.put(c, r, { silent: true }); };
      var at = function (d, h) { return Math.min(now - 60000, A.startOfDay(now + d * DAY) + (h || 10) * 3600000 + Math.floor(rand() * 3600000)); };
      /** n = 0: today (or the next school day); n > 0: n school days ahead; n < 0: n school days back. */
      var schoolDay = function (n, time) {
        var d = A.startOfDay(now), left = Math.abs(n);
        if (n >= 0) { while (!M.isSchoolDay(d)) d = A.startOfDay(d + 36 * 3600000); }
        while (left > 0) {
          d = A.startOfDay(n > 0 ? d + 36 * 3600000 : d - 12 * 3600000);
          if (M.isSchoolDay(d)) left--;
        }
        return d + A.hm(time || "16:00") * 60000;
      };
      var seq = 0;

      /* staff, students and student passwords */
      TEACHERS.forEach(function (t) { put("users", Object.assign({ role: "teacher", pin: PIN }, t)); });
      var S = STUDENTS.map(function (row, i) {
        var id = "s" + A.pad(i + 1);
        var no = i < 14 ? "GHS-22-" + A.pad(i + 1) + "7" : i < 24 ? "GHS-23-" + A.pad(i - 13) + "4" : "GHS-22-5" + A.pad(i - 23);
        var u = put("users", { id: id, role: "student", name: row[0], level: row[1], stream: row[2], studentNo: no, example: i === 0 });
        if (id !== "s01") put("credentials", { id: "cr_" + id, userId: id, password: A.firstName(row[0]).toLowerCase() + "2026", setAt: at(-40 + i, 9), setBy: id });
        return u;
      });
      var ids = function (from, to) { return S.slice(from, to).map(function (s) { return s.id; }); };
      var ability = {};
      S.forEach(function (s, i) { ability[s.id] = i === 0 ? 0.74 : 0.35 + rand() * 0.6; });

      /* syllabi */
      A.SeedSyllabi.forEach(function (raw, i) {
        var syl = A.prepareSyllabus(JSON.parse(JSON.stringify(raw)), 11 + i, true);
        syl.papers = A.defaultPapers(syl);
        syl.createdBy = ["t_moyo", "t_ncube", "t_chikomo"][i];
        put("syllabi", syl);
      });
      var MATHS = "syl_zimsec_maths_4004", BIO = "syl_cie_biology_0610", PHY = "syl_oxaqa_physics_9203";

      /* subject classes. currentTerm = the term the teacher has opened. */
      var classes = [
        { id: "c_4a_maths", name: "Form 4A", level: "Form 4", stream: "A", subject: "Mathematics", teacherId: "t_moyo", syllabusId: MATHS, room: "Room 12", studentIds: ids(0, 14),
          currentTerm: 2, sequential: false,
          // Trigonometry is open, but locked for two students who still have Term 1 work to finish;
          // Statistics (Term 3) is opened early for one student who is ahead.
          topicAccess: { zm_trig: { mode: "open", except: ["s05", "s09"] }, zm_stats: { mode: "locked", except: ["s03"] } } },
        { id: "c_3b_maths", name: "Form 3B", level: "Form 3", stream: "B", subject: "Mathematics", teacherId: "t_moyo", syllabusId: MATHS, room: "Room 9", studentIds: ids(14, 24),
          currentTerm: 1, sequential: true, topicAccess: {} },
        { id: "c_4a_bio", name: "Form 4A", level: "Form 4", stream: "A", subject: "Biology", teacherId: "t_ncube", syllabusId: BIO, room: "Lab 2", studentIds: ids(0, 12),
          currentTerm: 2, sequential: false, topicAccess: {} },
        { id: "c_4_phy", name: "Form 4 Sciences", level: "Form 4", stream: null, subject: "Physics", teacherId: "t_chikomo", syllabusId: PHY, room: "Lab 1", studentIds: ids(0, 8).concat(ids(24, 28)),
          currentTerm: 3, sequential: false, topicAccess: {} },
      ];
      classes.forEach(function (c) { put("classes", c); });
      var openTopics = function (c) {
        var syl = Store.get("syllabi", c.syllabusId);
        return syl.topics.filter(function (t) { return M.topicTerm(t) <= c.currentTerm; }).map(function (t) { return t.id; });
      };

      /* attendance: last 12 school days, not today, so "Take register" has work to do */
      classes.forEach(function (c) {
        for (var k = 1; k <= 12; k++) {
          var ts = schoolDay(-k, "08:00"), marks = {};
          c.studentIds.forEach(function (sid) {
            var r = rand(), good = ability[sid] > 0.6 ? 0.03 : 0;
            marks[sid] = r < 0.86 + good ? "P" : r < 0.92 ? "L" : r < 0.98 ? "A" : "E";
          });
          put("attendance", { id: "att_" + c.id + "_" + A.isoDate(ts), classId: c.id, date: A.isoDate(ts), marks: marks, takenBy: c.teacherId });
        }
      });

      /* study progress: stronger students have studied further */
      classes.forEach(function (c) {
        openTopics(c).forEach(function (tid, i) {
          c.studentIds.forEach(function (sid) {
            if (sid === "s01") return;
            var ab = ability[sid];
            if (rand() > ab * 1.3 - i * 0.1) return;
            var best = Math.round(A.clamp(ab * 100 + (rand() - 0.45) * 40, 20, 100));
            var rec = { id: "pr_" + sid + "_" + tid, studentId: sid, syllabusId: c.syllabusId, topicId: tid, lastStudiedAt: at(-Math.floor(rand() * 14), 16) };
            if (rand() < 0.9) rec.notesReadAt = rec.lastStudiedAt - 1800000;
            if (rand() < 0.85) { rec.practiceAttempts = 1 + Math.floor(rand() * 3); rec.practiceBest = best; rec.practiceLast = best - Math.floor(rand() * 10); if (best >= 60) rec.completedAt = rec.lastStudiedAt; }
            put("progress", rec);
          });
        });
      });
      // the example student: Term 1 not quite finished in Maths and Biology, so the review shows up
      [["zm_sets", 90], ["zm_indices", 80], ["zm_linear", 45], ["zm_quadratics", 70], ["zm_mensuration", null], ["cb_living", 100], ["cb_cells", 67], ["cb_transport", 43], ["cb_enzymes", null], ["op_forces", 83]].forEach(function (p, i) {
        var syl = p[0].indexOf("zm") === 0 ? MATHS : p[0].indexOf("cb") === 0 ? BIO : PHY;
        var rec = { id: "pr_s01_" + p[0], studentId: "s01", syllabusId: syl, topicId: p[0], notesReadAt: at(-12 + i, 15), lastStudiedAt: at(-12 + i, 16) };
        if (p[1] != null) { rec.practiceAttempts = 1 + (i % 2); rec.practiceBest = p[1]; rec.practiceLast = p[1]; if (p[1] >= 60) rec.completedAt = rec.lastStudiedAt; }
        put("progress", rec);
      });

      /* exam attempts with real answers, so topic strengths are genuine */
      function simulate(sid, sylId, paperId, daysAgo, title, topicIds, count, taskId, copy) {
        var syl = Store.get("syllabi", sylId), idx = M.questionIndex(syl), qids;
        var paper = paperId ? syl.papers.find(function (p) { return p.id === paperId; }) : null;
        if (paper) qids = paper.questionIds.slice();
        else qids = A.shuffle(M.allQuestions(syl).filter(function (x) { return topicIds.indexOf(x.topic.id) >= 0; }), rand).slice(0, count).map(function (x) { return x.q.id; });
        var answers = {}, selfMarks = {}, ab = ability[sid];
        qids.forEach(function (qid, i) {
          var q = idx[qid].q, tIdx = syl.topics.indexOf(idx[qid].topic);
          var ok = rand() < A.clamp(ab + 0.12 - tIdx * 0.05 + (rand() - 0.5) * 0.2, 0.05, 0.97);
          if (!copy && rand() < 0.04) return; // left blank
          if (q.type === "mcq") answers[qid] = ok ? q.answer : (q.answer + 1) % q.options.length;
          else if (q.type === "tf") answers[qid] = String(ok ? q.answer : !q.answer);
          else if (q.type === "numeric") answers[qid] = String(ok ? q.answer : Number(q.answer) + 1 + i);
          else if (q.type === "short") answers[qid] = ok ? [].concat(q.answer)[0] : "not sure";
          else if (copy && (copy === true || i % 3 === 0)) { answers[qid] = q.markScheme; selfMarks[qid] = q.marks; }
          else { answers[qid] = "My working: " + ["I used the formula from the notes.", "I drew a diagram first, then substituted the values.", "Shown step by step on my answer sheet."][i % 3]; selfMarks[qid] = Math.round(q.marks * A.clamp(ab + (rand() - 0.5) * 0.4, 0, 1)); }
        });
        var dur = paper ? paper.durationMin * 60 : count * 90;
        var start = at(-daysAgo, 14);
        var att = {
          id: "att_seed_" + sid + "_" + ++seq, studentId: sid, syllabusId: sylId, paperId: paperId || null, taskId: taskId || null,
          config: { paperId: paperId || null, topicIds: topicIds || null, count: count || null, durationMin: dur / 60 },
          title: title || (paper && paper.title) || "Custom test", questionIds: qids, durationSec: dur, status: "done",
          answers: answers, flags: {}, selfMarks: selfMarks, leftCount: copy ? 3 : 0,
          startedAt: start, endsAt: start + dur * 1000, finishedAt: start + Math.round(dur * (0.6 + rand() * 0.38)) * 1000,
        };
        att.timeUsedSec = Math.round((att.finishedAt - att.startedAt) / 1000);
        att.result = M.scoreAttempt(att);
        put("attempts", att);
        return att;
      }
      simulate("s01", MATHS, MATHS + "_p1", 9);
      simulate("s01", MATHS, null, 4, "Custom test: Sets, Indices, Linear", ["zm_sets", "zm_indices", "zm_linear"], 12);
      simulate("s01", BIO, BIO + "_p1", 6);
      ids(1, 14).forEach(function (sid) {
        if (rand() < 0.75) simulate(sid, MATHS, MATHS + "_p1", 3 + Math.floor(rand() * 10));
        if (rand() < 0.4) simulate(sid, MATHS, null, 1 + Math.floor(rand() * 5), "Custom test", openTopics(classes[0]).slice(0, 4), 10);
      });
      ids(1, 12).forEach(function (sid) { if (rand() < 0.5) simulate(sid, BIO, BIO + "_p1", 2 + Math.floor(rand() * 8)); });
      // integrity demo: one paper copied word-for-word from the marking scheme, one partly
      simulate("s04", MATHS, MATHS + "_p2", 2, null, null, null, null, true);
      simulate("s06", MATHS, MATHS + "_p2", 3, null, null, null, null, "some");

      /* tasks: due Monday–Friday between 08:00 and 16:00 */
      var nowMin = (now - A.startOfDay(now)) / 60000;
      var inSchoolHours = M.isSchoolDay(now) && nowMin >= A.hm("08:00") && nowMin <= A.hm("15:50");
      // one homework due right now (or just gone), so the "due work" alert appears on sign-in
      var dueNow = inSchoolHours ? now + 4 * 60000 : M.isSchoolDay(now) && nowMin > A.hm("16:00") ? A.startOfDay(now) + A.hm("16:00") * 60000 : schoolDay(-1, "16:00");
      var tasks = [
        { id: "tk_indices_hw", classId: "c_4a_maths", kind: "homework", title: "Indices: Exercise 4.2", topicId: "zm_indices", maxMarks: 15, dueAt: schoolDay(2, "14:00"), createdAt: at(-1, 8),
          instructions: "Complete questions 1–15 in Exercise 4.2 of the revision booklet (Library → Form 4 Mathematics Revision Booklet). Show all your working in your exercise book." },
        { id: "tk_mens_hw", classId: "c_4a_maths", kind: "homework", title: "Mensuration: Exercise 7.1", topicId: "zm_mensuration", maxMarks: 12, dueAt: dueNow, createdAt: at(-3, 8),
          instructions: "Exercise 7.1 in the revision booklet: questions 1–3. Hand in your exercise book." },
        { id: "tk_stats_project", classId: "c_4a_maths", kind: "assignment", title: "Statistics survey project", topicId: "zm_stats", maxMarks: 40, dueAt: schoolDay(7, "16:00"), createdAt: at(-3, 9),
          instructions: "Choose a question to investigate, for example \"How long do learners take to travel to school?\".\n\n1. Collect data from at least 30 people.\n2. Organise it in a frequency table.\n3. Calculate the mean, median, mode and range.\n4. Draw a pie chart or a bar chart.\n5. Write a short conclusion (half a page).\n\nHand in your project book." },
        { id: "tk_sets_online", classId: "c_4a_maths", kind: "test", title: "Online test: Sets and Indices", topicId: "zm_sets", maxMarks: 20, dueAt: schoolDay(3, "12:00"), createdAt: at(-1, 13),
          instructions: "A timed 20-minute online test on Sets and Indices. It opens in exam mode: once you start, the timer keeps running.", test: { syllabusId: MATHS, topicIds: ["zm_sets", "zm_indices"], count: 10, durationMin: 20 } },
        { id: "tk_algebra_test", classId: "c_4a_maths", kind: "test", title: "Algebra class test (written)", topicId: "zm_linear", maxMarks: 50, dueAt: schoolDay(-4, "10:00"), createdAt: at(-9, 8),
          instructions: "Written test taken in class on linear equations and inequalities. Marks are recorded by your teacher." },
        { id: "tk_prob_present", classId: "c_4a_maths", kind: "presentation", title: "Presentation: probability in everyday life", topicId: "zm_prob", maxMarks: 20, dueAt: schoolDay(4, "11:00"), createdAt: at(0, 7),
          assignedTo: ["s01", "s03", "s07"],
          instructions: "Prepare a 5-minute group presentation on how probability is used in real life: weather forecasts, insurance, games of chance, sports.\n\nInclude at least one worked example with a tree diagram. Tafadzwa introduces, Tinashe presents the examples, Tatenda concludes and takes questions." },
        { id: "tk_linear_ws", classId: "c_4a_maths", kind: "homework", title: "Linear equations worksheet", topicId: "zm_linear", maxMarks: 20, dueAt: schoolDay(-2, "15:00"), createdAt: at(-7, 8),
          instructions: "Answer all 20 questions on the worksheet in your exercise book. Check each answer by substituting it back into the equation." },
        { id: "tk_venn_hw", classId: "c_3b_maths", kind: "homework", title: "Venn diagrams practice", topicId: "zm_sets", maxMarks: 12, dueAt: schoolDay(1, "13:00"), createdAt: at(-2, 8),
          instructions: "Draw Venn diagrams for questions 1–6 and use n(A ∪ B) = n(A) + n(B) − n(A ∩ B) for questions 7–12." },
        { id: "tk_sets_quiz3b", classId: "c_3b_maths", kind: "test", title: "Sets quiz (written)", topicId: "zm_sets", maxMarks: 25, dueAt: schoolDay(-4, "09:00"), createdAt: at(-8, 8), instructions: "Short written quiz taken in class." },
        { id: "tk_cells_label", classId: "c_4a_bio", kind: "homework", title: "Label a plant and an animal cell", topicId: "cb_cells", maxMarks: 10, dueAt: schoolDay(2, "09:00"), createdAt: at(-1, 11),
          instructions: "Draw and label a palisade cell and a cheek cell in your practical book. Label at least 6 structures and state one function of each." },
        { id: "tk_enzymes_online", classId: "c_4a_bio", kind: "test", title: "Online quiz: Enzymes", topicId: "cb_enzymes", maxMarks: 16, dueAt: schoolDay(4, "13:30"), createdAt: at(-1, 12),
          instructions: "15-minute online quiz on biological molecules and enzymes.", test: { syllabusId: BIO, topicIds: ["cb_enzymes"], count: 7, durationMin: 15 } },
        { id: "tk_osmosis_prac", classId: "c_4a_bio", kind: "assignment", title: "Osmosis practical write-up", topicId: "cb_transport", maxMarks: 25, dueAt: schoolDay(-3, "16:00"), createdAt: at(-8, 9),
          instructions: "Write up the potato-chip osmosis practical in your practical book: aim, method, results table, graph of % change in mass against sugar concentration, and conclusion." },
        { id: "tk_forces_ws", classId: "c_4_phy", kind: "homework", title: "Forces and motion worksheet", topicId: "op_forces", maxMarks: 20, dueAt: schoolDay(1, "15:30"), createdAt: at(-1, 10),
          instructions: "Complete the worksheet on speed, acceleration and F = ma. Give units in every answer." },
      ];
      tasks.forEach(function (t) { t.assignedTo = t.assignedTo || "all"; t.createdBy = (classes.find(function (c) { return c.id === t.classId; }) || {}).teacherId; put("tasks", t); });

      /* submissions (student side) + marks (teacher side) */
      tasks.forEach(function (t) {
        var c = classes.find(function (x) { return x.id === t.classId; });
        var who = t.assignedTo === "all" ? c.studentIds : t.assignedTo;
        var past = t.dueAt < now, age = (now - t.createdAt) / DAY, handIn = M.canSubmit(t);
        who.forEach(function (sid, wi) {
          var ab = ability[sid], sub = { id: "sub_" + t.id + "_" + sid, taskId: t.id, studentId: sid };
          if (sid === "s01") {
            var st = { tk_indices_hw: "", tk_mens_hw: "r", tk_stats_project: "r", tk_sets_online: "r", tk_algebra_test: "r", tk_prob_present: "", tk_linear_ws: "rs", tk_cells_label: "", tk_enzymes_online: "r", tk_osmosis_prac: "rs", tk_forces_ws: "r" }[t.id] || "";
            if (st.indexOf("r") >= 0) sub.receivedAt = t.createdAt + 3600000 * 5;
            if (st.indexOf("s") >= 0) { sub.submittedAt = Math.min(now - 3600000, t.dueAt - 3600000 * 20); sub.confirmedBook = true; sub.text = "All working is in my exercise book."; }
          } else if (t.id === "tk_venn_hw") {
            // every Form 3B student has handed in: the teacher gets an "all submitted" alert
            sub.receivedAt = t.createdAt + 3600000 * (2 + wi);
            sub.submittedAt = Math.min(now - 600000 * (wi + 1), t.createdAt + DAY + 3600000 * wi);
            sub.confirmedBook = true;
          } else {
            if (rand() < Math.min(0.95, 0.35 + age * 0.25 + ab * 0.2)) sub.receivedAt = t.createdAt + Math.floor(rand() * DAY * Math.max(0.3, Math.min(age, 2)));
            if (handIn && sub.receivedAt && (past ? rand() < 0.55 + ab * 0.45 : rand() < ab * 0.35)) {
              sub.submittedAt = Math.min(now - 3600000, sub.receivedAt + Math.floor(rand() * DAY * 2));
              sub.confirmedBook = true;
              if (rand() < 0.3) sub.text = ["Question 3 was hard.", "Done, book handed to the class monitor.", "I used the booklet for the examples."][wi % 3];
            }
          }
          if (t.test && sid !== "s01" && sub.receivedAt && rand() < ab * 0.5) {
            var a = simulate(sid, t.test.syllabusId, null, 1, t.title, t.test.topicIds, t.test.count, t.id);
            sub.submittedAt = a.finishedAt; sub.attemptId = a.id; sub.autoPct = a.result.pct;
          }
          if (sub.receivedAt || sub.submittedAt) put("submissions", sub);
          var gradeIt = t.id === "tk_algebra_test" || t.id === "tk_sets_quiz3b" || (sub.submittedAt && (t.id === "tk_linear_ws" || (t.id === "tk_osmosis_prac" && rand() < 0.5)));
          if (gradeIt && !t.test) {
            var score = Math.round(t.maxMarks * A.clamp(ab + (rand() - 0.5) * 0.25, 0.1, 1));
            if (sid === "s01") score = { tk_algebra_test: 37, tk_linear_ws: 17 }[t.id] || score;
            if (sid === "s01" && t.id === "tk_osmosis_prac") return;
            put("marks", { id: "mk_" + t.id + "_" + sid, taskId: t.id, studentId: sid, score: score, markedAt: Math.min(now, t.dueAt + DAY),
              feedback: score / t.maxMarks >= 0.75 ? "Excellent work, well done." : score / t.maxMarks >= 0.5 ? "Good effort. Check your working on the longer questions." : "Please see me. Re-read the notes and redo the practice questions." });
          }
        });
      });

      /* notifications from teachers to students */
      var msgs = [
        { id: "msg_mocks", classId: "c_4a_maths", fromId: "t_moyo", to: "all", createdAt: at(-1, 15), subject: "Mock examinations timetable",
          body: "Mock examinations start on " + A.fmtDateLong(schoolDay(10, "08:00")) + ". Paper 1 is on the Monday and Paper 2 on the Wednesday.\n\nUse Exam Mode → Test to practise under timed conditions, then revise any topic where you scored below 50%." },
        { id: "msg_groups", classId: "c_4a_maths", fromId: "t_moyo", to: ["s01", "s03", "s07"], createdAt: at(0, 7), subject: "Presentation groups",
          body: "You three are presenting on probability in everyday life. Details are under My Tasks. Meet me at break on Thursday to show me your outline." },
        { id: "msg_term2", classId: "c_4a_maths", fromId: "t_moyo", to: "all", createdAt: at(-5, 8), subject: "Term 2 topics are open",
          body: "Quadratic Equations, Mensuration and Trigonometry are now open in Exam Mode. If you have unfinished Term 1 topics, finish those first. They are listed at the top of your Study page." },
        { id: "msg_lab", classId: "c_4a_bio", fromId: "t_ncube", to: "all", createdAt: at(-2, 12), subject: "Food tests practical on Thursday",
          body: "Bring your lab coats. Read the Biological Molecules and Enzymes notes and the Food tests practical guide in the Library before the lesson." },
        { id: "msg_calc", classId: "c_4_phy", fromId: "t_chikomo", to: "all", createdAt: at(-3, 10), subject: "Calculators",
          body: "From next week every lesson needs a scientific calculator. Practise the Energy calculations in Exam Mode." },
        { id: "msg_3b", classId: "c_3b_maths", fromId: "t_moyo", to: "all", createdAt: at(-2, 9), subject: "Welcome to Mathematics",
          body: "This term we cover Sets, Indices and Linear Equations. Finish each topic before you move on to the next one." },
      ];
      msgs.forEach(function (m) { put("messages", m); });
      msgs.forEach(function (m) {
        var c = classes.find(function (x) { return x.id === m.classId; });
        (m.to === "all" ? c.studentIds : m.to).forEach(function (sid) {
          if (sid === "s01" && (m.id === "msg_mocks" || m.id === "msg_groups")) return;
          if (rand() < 0.8) put("receipts", { id: "rc_" + m.id + "_" + sid, messageId: m.id, studentId: sid, readAt: m.createdAt + Math.floor(rand() * DAY) });
        });
      });

      /* library: files are stored in the app (no outside links), so students never leave it */
      var mats = [
        { id: "mat_booklet", classId: "c_4a_maths", kind: "textbook", title: "Form 4 Mathematics Revision Booklet", author: "Greenfield Maths Department", audience: "all", fileId: "file_seed_booklet", offline: true, createdAt: at(-20, 9) },
        { id: "mat_alg", classId: "c_4a_maths", kind: "pdf", title: "Algebra: worked solutions", author: "Mrs T. Moyo", topicId: "zm_linear", audience: "all", fileId: "file_seed_alg", offline: true, createdAt: at(-10, 9) },
        { id: "mat_formula", classId: "c_4a_maths", kind: "note", title: "Mensuration formula sheet", topicId: "zm_mensuration", audience: "all", createdAt: at(-6, 9),
          body: "## Areas\n- Rectangle: l × w\n- Triangle: ½bh\n- Trapezium: ½(a + b)h\n- Circle: πr^2\n## Volumes\n- Prism: cross-section × length\n- Cylinder: πr^2h\n- Cone: ⅓πr^2h\n- Sphere: (4/3)πr^3\n> Learn these by heart: the exam gives only some of them." },
        { id: "mat_quad_extra", classId: "c_4a_maths", kind: "note", title: "Extra practice: quadratic equations", topicId: "zm_quadratics", audience: ["s03", "s05", "s01"], createdAt: at(-2, 14),
          body: "Try these before Friday:\n1. x^2 + 3x − 10 = 0\n2. x^2 − 6x + 9 = 0\n3. 2x^2 − 7x + 3 = 0\n4. x^2 − 5 = 0 (use the formula, 2 d.p.)\n> Answers: 1) 2, −5  2) 3  3) 3, ½  4) ±2.24" },
        { id: "mat_specimen", classId: null, syllabusId: MATHS, kind: "pastpaper", title: "Specimen Paper 1 (sample)", paperKey: "maths specimen p1", year: 2026, audience: "all", fileId: "file_seed_specimen", offline: true, createdAt: at(-30, 9) },
        { id: "mat_specimen_ms", classId: null, syllabusId: MATHS, kind: "markscheme", paperId: "mat_specimen", msVisibility: "after", title: "Marking scheme: Specimen Paper 1 (sample)", audience: "all", fileId: "file_seed_specimen_ms", offline: true, createdAt: at(-30, 9) },
        { id: "mat_foodtests", classId: "c_4a_bio", kind: "pdf", title: "Food tests practical guide", topicId: "cb_enzymes", audience: "all", fileId: "file_seed_food", offline: true, createdAt: at(-3, 9) },
        { id: "mat_biosum", classId: "c_4a_bio", kind: "pdf", title: "Cells and transport: summary sheet", topicId: "cb_transport", audience: "all", fileId: "file_seed_bio", offline: false, createdAt: at(-12, 9) },
        { id: "mat_circuits", classId: "c_4_phy", kind: "pdf", title: "Circuits practical guide", topicId: "op_electricity", audience: "all", fileId: "file_seed_circ", offline: true, createdAt: at(-5, 9) },
      ];
      var pdfs = [
        { id: "file_seed_booklet", name: "form4-maths-revision-booklet.pdf", blob: A.makePdf("Form 4 Mathematics Revision Booklet", bookletSections()) },
        { id: "file_seed_specimen", name: "maths-specimen-paper-1.pdf", blob: A.makePdf("Mathematics Specimen Paper 1 (sample)", specimenSections()) },
        { id: "file_seed_specimen_ms", name: "maths-specimen-paper-1-marking-scheme.pdf", blob: A.makePdf("Specimen Paper 1: Marking scheme (sample)", specimenSchemeSections()) },
        { id: "file_seed_food", name: "food-tests-practical.pdf", blob: A.makePdf("Food Tests: Practical Guide", foodSections()) },
        { id: "file_seed_alg", name: "algebra-worked-solutions.pdf", blob: A.makePdf("Algebra: Worked Solutions", algebraSections()) },
        { id: "file_seed_bio", name: "cells-and-transport-summary.pdf", blob: A.makePdf("Cells and Transport: Summary", bioSections()) },
        { id: "file_seed_circ", name: "circuits-practical-guide.pdf", blob: A.makePdf("Circuits Practical Guide", circuitSections()) },
      ];
      var byFile = {};
      pdfs.forEach(function (p) { byFile[p.id] = p; });
      // a few Form 4A students have already sat the specimen paper (its marking scheme is open to them)
      ["s02", "s03", "s06", "s09"].forEach(function (sid, i) { put("receipts", { id: "pd_mat_specimen_" + sid, kind: "paper-done", paperId: "mat_specimen", studentId: sid, doneAt: at(-6 + i, 17) }); });
      mats.forEach(function (m) {
        var f = byFile[m.fileId];
        if (f) { m.fileName = f.name; m.fileType = "application/pdf"; m.fileSize = f.blob.size; }
        m.createdBy = m.classId ? classes.find(function (c) { return c.id === m.classId; }).teacherId : "t_moyo";
        put("materials", m);
      });

      /* timetable: bells (08:00–16:00, Monday–Friday), a grid per class, and lesson types */
      put("settings", { id: "bells", periods: BELLS });
      var classFor = { "Form 4|A": { M: "c_4a_maths", B: "c_4a_bio", P: "c_4_phy" }, "Form 4|B": { P: "c_4_phy" }, "Form 3|B": { M: "c_3b_maths" } };
      Object.keys(GRID).forEach(function (key) {
        var lv = key.split("|")[0], st = key.split("|")[1];
        GRID[key].forEach(function (row, di) {
          row.forEach(function (code, pi) {
            var pid = LESSON_PERIODS[pi], base = "tt_" + A.slug(lv + st) + "_" + (di + 1) + "_" + pid, cid = (classFor[key] || {})[code];
            if (cid) {
              var cl = classes.find(function (c) { return c.id === cid; });
              put("timetable", { id: base, day: di + 1, periodId: pid, level: lv, stream: st, classId: cid, room: cl.room });
              if (code === "P") put("timetable", { id: base + "_opt", day: di + 1, periodId: pid, level: lv, stream: st, classId: null, subject: "Geography (option)", teacherName: "Mr J. Gumbo", room: "Room 15", exceptClassId: cid });
            } else {
              var o = OTHER[code];
              put("timetable", { id: base, day: di + 1, periodId: pid, level: lv, stream: st, classId: null, subject: o[0], teacherName: o[1], room: o[2] });
            }
          });
        });
      });
      // lesson types the teachers have already set for this week and next
      var TYPES = { c_4a_maths: ["Theory", "Discussion", "Theory", "Mock test"], c_3b_maths: ["Theory", "Discussion"], c_4a_bio: ["Practical", "Theory", "Discussion"], c_4_phy: ["Practical", "Theory"] };
      var monday = A.mondayOf(now);
      for (var w = 0; w < 2; w++) {
        for (var d = 1; d <= 5; d++) {
          var date = A.isoDate(monday + (w * 7 + d - 1) * DAY + 12 * 3600000);
          Store.filter("timetable", function (s) { return s.day === d && s.classId; }).forEach(function (s, i) {
            var list = TYPES[s.classId];
            if (!list || rand() < 0.25) return;
            var id = "ls_" + s.classId + "_" + date + "_" + s.periodId;
            if (Store.get("lessons", id)) return;
            var type = list[(d + i + w) % list.length];
            put("lessons", { id: id, classId: s.classId, date: date, periodId: s.periodId, type: type,
              note: type === "Practical" ? "Lab coats and practical books." : type === "Mock test" ? "Calculators, pens and mathematical instruments." : "" });
          });
        }
      }

      /* devices that have signed in (sample data for the admin's Devices view) */
      var DEV = [
        ["s02", "Phone", "Android 14", "Chrome", "Samsung SM-A155F", "412×915", 2, "192.168.1.41"],
        ["s02", "Laptop", "Windows 11", "Edge", "", "1366×768", 6, "192.168.1.63"],
        ["s03", "Tablet", "Android 13", "Chrome", "Lenovo TB-X606F", "800×1280", 1, "192.168.1.52"],
        ["s05", "Phone", "iOS 17", "Safari", "iPhone", "390×844", 0, "192.168.1.77"],
        ["s07", "Phone", "Android 13", "Chrome", "TECNO KI5k", "360×800", 3, "192.168.1.44"],
        ["s07", "Tablet", "Android 14", "Chrome", "Samsung SM-X200", "800×1340", 9, "192.168.1.58"],
        ["s09", "Tablet", "Android 14", "Chrome", "Samsung SM-X200", "800×1340", 0, "192.168.1.59"],
        ["s11", "Laptop", "Windows 10", "Chrome", "", "1280×720", 1, "192.168.1.66"],
        ["s16", "Phone", "Android 12", "Chrome", "itel A70", "360×760", 4, "192.168.1.81"],
        ["s25", "Tablet", "iPadOS 17", "Safari", "iPad", "820×1180", 2, "192.168.1.90"],
        ["t_ncube", "Laptop", "Windows 11", "Chrome", "", "1536×864", 0, "192.168.1.12"],
        ["t_chikomo", "Tablet", "Android 14", "Chrome", "Samsung SM-X710", "1600×2560", 1, "192.168.1.13"],
      ];
      DEV.forEach(function (d, i) {
        var devId = "dev_sample_" + (i + 1), u = Store.get("users", d[0]);
        put("devices", { id: "dv_" + devId + "_" + d[0], deviceId: devId, userId: d[0], role: u.role, type: d[1], os: d[2], browser: d[3], model: d[4], screen: d[5], touch: d[1] !== "Laptop",
          firstSignInAt: at(-20 - i, 8), lastSeenAt: at(-d[6], 9 + (i % 6)), signedIn: true, sample: true });
        put("netinfo", { id: "ni_" + devId, deviceId: devId, ip: d[7], at: at(-d[6], 9) });
      });

      return Promise.all(pdfs.map(function (p) {
        return A.Files.put({ id: p.id, name: p.name, type: "application/pdf", size: p.blob.size, blob: p.blob, createdAt: now, uploaded: false }).catch(function () { /* no IndexedDB */ });
      }));
    },
  };

  /* ---------------------------------------------------------- home edition
     One admin (a parent, guardian or older sibling) and one student, a revision class for
     every bundled syllabus with all three terms open, a welcome note and a how-to sheet. */
  /* Online: the admin's first sign-in creates the starting subjects in the cloud (no local
     accounts: the admin and students come from their online sign-ins). */
  A.Seed.cloudStart = function (Store) { runHome(Store, true); };

  function runHome(Store, online) {
    var CFG = window.SCHOOL_CONFIG || {}, H = CFG.home || {}, now = Date.now();
    var sch = H.school || {}, ad = H.admin || {}, st = H.student || {};
    var put = function (c, r) { return Store.put(c, r, { silent: true }); };
    if (!Store.get("settings", "branding")) {
      put("settings", { id: "branding", name: sch.name || "Home Study", shortName: sch.shortName || sch.name || "Home Study", motto: sch.motto || "",
        logo: CFG.logo || "", primary: (CFG.colors || {}).primary, secondary: (CFG.colors || {}).secondary });
    }
    if (!online) {
      put("users", { id: "t_admin", role: "teacher", name: ad.name || "Admin", title: ad.title || "Admin", subjects: "All subjects", isAdmin: true, pin: String(ad.pin || "1234") });
      put("users", { id: "s_home", role: "student", name: st.name || "Student", level: st.level || "Form 4", stream: null, studentNo: st.studentNo || "HOME-001", example: true });
    }

    var classes = A.SeedSyllabi.map(function (raw, i) {
      var syl = A.prepareSyllabus(JSON.parse(JSON.stringify(raw)), 11 + i, true);
      syl.papers = A.defaultPapers(syl);
      syl.createdBy = "t_admin";
      put("syllabi", syl);
      return put("classes", { id: "c_home_" + (i + 1), name: "Revision", level: st.level || "Form 4", stream: null, subject: syl.subject, teacherId: "t_admin",
        syllabusId: syl.id, room: "", studentIds: online ? [] : ["s_home"], currentTerm: 3, allTerms: true, sequential: false, topicAccess: {} });
    });
    if (!classes.length) return;
    put("messages", { id: "msg_home_welcome", classId: classes[0].id, fromId: "t_admin", to: "all", createdAt: now, subject: "Welcome to revision",
      body: "Everything here works without the internet and saves as you go." + (online ? " When you are online, new notes and files from your admin arrive by themselves." : "") + "\n\n" +
        "1. Open Exam mode → Study, pick a subject and read a topic's notes and worked examples.\n" +
        "2. Answer the practice questions until the topic shows as completed.\n" +
        "3. Use Exam mode → Test to sit a timed paper, then revise the concepts it says you are weak on.\n\n" +
        "Past papers and notes added by your admin appear in the Library. Good luck!" });
    put("materials", { id: "mat_home_howto", classId: classes[0].id, kind: "note", title: "How to revise with School Assist", audience: "all", createdAt: now,
      body: "## Every day\n- Pick **one topic** and study it in Exam mode: notes, then worked examples, then practice questions.\n- Aim for 60% or more on a topic's questions before moving on.\n" +
        "## Every week\n- Sit a **timed test** in Exam mode → Test, like the real exam.\n- Read *Concepts to revise* on the result page and go back to those topics.\n" +
        "## Before the exam\n- Do the past papers in the Library under timed conditions.\n- Check **My progress** for topics that are still unfinished.\n" +
        "> Short, regular sessions beat one long night before the exam." });
  }

  function algebraSections() {
    return [
      { h: "Worked solutions: linear equations", p: ["1. 4x - 7 = 13. Add 7: 4x = 20. Divide by 4: x = 5.", "2. 3(x + 2) = 21. Expand: 3x + 6 = 21. Subtract 6: 3x = 15, so x = 5.", "3. x/4 + 1 = 5. Subtract 1: x/4 = 4. Multiply by 4: x = 16."] },
      { h: "Simultaneous equations", p: ["Solve 2x + y = 11 and x - y = 1. Add the equations: 3x = 12, so x = 4. Then y = 3.", "Check by substituting into both equations before you move on."] },
      { h: "Inequalities", p: ["Solve -3x <= 12. Divide by -3 and reverse the sign: x >= -4.", "Show the answer on a number line with a closed circle at -4."] },
    ];
  }
  function bioSections() {
    return [
      { h: "Cells", p: ["Plant cells have a cell wall, chloroplasts and a large permanent vacuole. Animal cells do not.", "Mitochondria are the site of aerobic respiration. Ribosomes make proteins."] },
      { h: "Diffusion, osmosis, active transport", p: ["Diffusion: net movement of particles from high to low concentration. No energy needed.", "Osmosis: net movement of water through a partially permeable membrane, from a dilute to a concentrated solution.", "Active transport: movement against a concentration gradient using energy from respiration."] },
    ];
  }
  function circuitSections() {
    return [
      { h: "Safety", p: ["Switch off the power supply before changing a circuit. Report hot wires or components to your teacher."] },
      { h: "Practical 1: Ohm's law", p: ["Set up a resistor in series with an ammeter and a variable power supply. Connect a voltmeter in parallel with the resistor.", "Record V and I for five settings and plot V against I. The gradient is the resistance."] },
      { h: "Practical 2: series and parallel", p: ["Measure the current at different points in a series circuit: it is the same everywhere.", "In a parallel circuit, the currents in the branches add up to the total current."] },
    ];
  }

  function bookletSections() {
    return [
      { h: "How to use this booklet", p: ["Each chapter matches a topic in Exam Mode. Read the notes in the app first, then work through the exercise here. Answers are at the back of the printed copy."] },
      { h: "Exercise 4.1: Laws of indices", p: ["1. Simplify 3^4 x 3^2.   2. Simplify y^9 / y^4.   3. Simplify (2a^3)^2.   4. Evaluate 7^0.   5. Evaluate 4^-2."] },
      { h: "Exercise 4.2: Fractional and negative indices", p: [
        "1. 9^(1/2)   2. 27^(1/3)   3. 16^(1/4)   4. 32^(1/5)   5. 25^(-1/2)",
        "6. 8^(2/3)   7. 4^(3/2)   8. 81^(3/4)   9. (1/8)^(1/3)   10. 1000^(2/3)",
        "11. Solve 2^x = 32.   12. Solve 9^x = 27.   13. Solve 4^(x+1) = 8.   14. Simplify (x^(1/2))^6.   15. Evaluate 125^(-2/3).",
      ] },
      { h: "Exercise 4.3: Standard form", p: ["1. Write 356 000 in standard form.  2. Write 0.000 072 in standard form.  3. Calculate (2.5 x 10^6) x (4 x 10^-2).  4. Calculate (9 x 10^5) / (3 x 10^8)."] },
      { h: "Exercise 5.1: Linear equations", p: ["Solve: 1. 4x - 7 = 13   2. 3(x + 2) = 21   3. x/4 + 1 = 5   4. 5x - 3 = 2x + 9   5. (x + 1)/2 = (x - 2)/3"] },
      { h: "Exercise 6.1: Quadratic equations", p: ["Solve by factorising: 1. x^2 + 8x + 15 = 0   2. x^2 - 4x - 21 = 0   3. x^2 - 25 = 0   4. 2x^2 + 5x - 3 = 0", "Solve using the formula, giving answers to 2 decimal places: 5. x^2 + 3x - 1 = 0   6. 3x^2 - 2x - 4 = 0"] },
      { h: "Exercise 7.1: Mensuration", p: ["1. Find the area of a trapezium with parallel sides 6 cm and 10 cm and height 4 cm.", "2. Find the volume of a cylinder of radius 3.5 cm and height 10 cm (pi = 22/7).", "3. A sector has radius 14 cm and angle 90 degrees. Find its arc length and area."] },
    ];
  }
  function specimenSections() {
    return [
      { h: "Instructions to candidates", p: ["Answer ALL questions. Write your answers in the spaces provided. Time allowed: 2 hours 30 minutes. This is a SAMPLE paper produced for the demo; replace it with official past papers from your exam board."] },
      { h: "Section A", p: ["1. Express 0.000 405 in standard form. [2]", "2. Given that A = {1, 2, 3, 4, 5, 6} and B = {4, 5, 6, 7}, list A n B. [1]", "3. Solve the equation 3x - 5 = 16. [2]", "4. Evaluate 27^(2/3). [2]", "5. Factorise completely 2x^2 - 8. [2]"] },
      { h: "Section B", p: ["6. A bag contains 4 red and 5 blue counters. Two counters are taken without replacement. Find the probability that they are the same colour. [4]", "7. A ladder 6.5 m long reaches 6 m up a vertical wall. How far is its foot from the wall? [3]", "8. The marks of 8 learners are 12, 15, 11, 18, 15, 20, 9, 16. Find the mean, median and mode. [5]"] },
    ];
  }
  function specimenSchemeSections() {
    return [
      { h: "How to use this marking scheme", p: ["Mark your own answers after you have sat the paper. Method marks (M) are for a correct method; accuracy marks (A) for the correct answer that follows it; B marks stand alone. This is a SAMPLE marking scheme for the demo."] },
      { h: "Section A", p: ["1. 4.05 x 10^-4 (B2; B1 for 4.05 with the wrong power of 10)", "2. {4, 5, 6} (B1)", "3. 3x = 21 (M1), x = 7 (A1)", "4. (cube root of 27)^2 = 3^2 (M1) = 9 (A1)", "5. 2(x^2 - 4) (M1) = 2(x - 2)(x + 2) (A1)"] },
      { h: "Section B", p: ["6. P(both red) = 4/9 x 3/8 = 12/72 (M1); P(both blue) = 5/9 x 4/8 = 20/72 (M1); 12/72 + 20/72 (M1) = 32/72 = 4/9 (A1)", "7. 6.5^2 - 6^2 = 42.25 - 36 = 6.25 (M1); square root (M1); 2.5 m (A1)", "8. Mean = 116 / 8 = 14.5 (M1 A1); median = (15 + 15) / 2 = 15 (M1 A1); mode = 15 (B1)"] },
    ];
  }
  function foodSections() {
    return [
      { h: "Safety", p: ["Wear eye protection. Use a water bath, not a naked flame, to heat Benedict's solution. Ethanol is flammable: keep it away from heat."] },
      { h: "1. Starch", p: ["Add a few drops of iodine solution to the food sample. A blue-black colour shows starch is present; orange-brown means no starch."] },
      { h: "2. Reducing sugars", p: ["Add an equal volume of Benedict's solution and heat in a water bath at about 80 deg C for 5 minutes. Blue means none; green, yellow, orange or brick-red show increasing amounts of reducing sugar."] },
      { h: "3. Protein", p: ["Add biuret solution. A purple colour shows protein is present; it stays blue if there is none."] },
      { h: "4. Fats (ethanol emulsion test)", p: ["Shake the sample with ethanol, then pour the ethanol into a tube of water. A milky-white emulsion shows fat is present."] },
      { h: "5. Vitamin C", p: ["Add the food solution drop by drop to 1 cm3 of DCPIP. If the blue DCPIP turns colourless, vitamin C is present."] },
      { h: "Results table", p: ["Record: food sample | starch | reducing sugar | protein | fat | vitamin C. Write a conclusion describing which foods are good sources of each nutrient."] },
    ];
  }
})(window.App);
