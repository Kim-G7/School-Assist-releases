/* Timetable: Monday–Friday, 08:00–16:00.
 *   Admins build it (bell times + a grid per class).
 *   Teachers mark each upcoming lesson as Theory, Discussion, Practical or Mock test.
 *   Students see that label under the lesson.
 * The school chooses how its timetable works (settings "ttmode", admins and teachers):
 *   day    day to day: each date can have its own timetable, so dates are shown
 *   week   week by week: the same Monday–Friday every week (no dates)
 *   month  monthly: a Monday–Friday timetable for each month
 *   term   by term: a Monday–Friday timetable for each term
 * A slot's `scope` says which day ("d:2026-09-30"), month ("m:2026-09") or term ("t:Term 3") it
 * belongs to; slots without one are the usual weekly timetable, used wherever a class has
 * nothing of its own for that day, month or term. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var TT = (A.TT = {});
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  TT.TYPES = CFG.lessonTypes || ["Theory", "Discussion", "Practical", "Mock test"];
  var TYPE_ICON = { Theory: "book", Discussion: "message", Practical: "beaker", "Mock test": "clock" };
  TT.typeClass = function (t) { return "lt-" + A.slug(t || ""); };
  TT.typeChip = function (t) { return t ? '<span class="lt ' + TT.typeClass(t) + '">' + I(TYPE_ICON[t] || "circle") + esc(t) + "</span>" : ""; };

  TT.bells = function () {
    var rec = S().get("settings", "bells");
    return (rec && rec.periods && rec.periods.length ? rec.periods : A.DEFAULT_BELLS || [
      { id: "p1", label: "1", start: "08:00", end: "08:40" }, { id: "p2", label: "2", start: "08:40", end: "09:20" }, { id: "p3", label: "3", start: "09:20", end: "10:00" },
      { id: "brk", label: "Break", start: "10:00", end: "10:30", isBreak: true }, { id: "p4", label: "4", start: "10:30", end: "11:10" }, { id: "p5", label: "5", start: "11:10", end: "11:50" },
      { id: "p6", label: "6", start: "11:50", end: "12:30" }, { id: "lun", label: "Lunch", start: "12:30", end: "13:15", isBreak: true }, { id: "p7", label: "7", start: "13:15", end: "13:55" },
      { id: "p8", label: "8", start: "13:55", end: "14:35" }, { id: "p9", label: "9", start: "14:35", end: "15:15" }, { id: "clb", label: "Clubs & sport", start: "15:15", end: "16:00", isBreak: true },
    ]).slice().sort(function (a, b) { return A.hm(a.start) - A.hm(b.start); });
  };
  TT.period = function (id) { return TT.bells().find(function (p) { return p.id === id; }); };

  /* ------------------------------------------------------------- the timetable's type */
  TT.MODES = { day: "Day to day", week: "Week by week", month: "Monthly", term: "By term" };
  TT.mode = function () { var r = S().get("settings", "ttmode"); return r && TT.MODES[r.mode] ? r.mode : "week"; };
  var monthKey = function (ts) { var d = new Date(ts); return "m:" + d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); };
  var termNow = function () { return (S().get("settings", "term") || {}).term || CFG.term || M.termName(1); };
  /** The scope in force on a day (null: the usual weekly timetable). */
  TT.keyFor = function (dayTs) {
    var m = TT.mode();
    return m === "day" ? "d:" + A.isoDate(dayTs) : m === "month" ? monthKey(dayTs) : m === "term" ? "t:" + termNow() : null;
  };
  TT.keyLabel = function (key) {
    if (!key) return "the usual week";
    if (key.indexOf("d:") === 0) return A.fmtDateLong(new Date(key.slice(2) + "T12:00:00").getTime());
    if (key.indexOf("m:") === 0) { var d = new Date(key.slice(2) + "-15T12:00:00"); return A.MONTHS ? A.MONTHS[d.getMonth()] + " " + d.getFullYear() : d.toLocaleDateString(undefined, { month: "long", year: "numeric" }); }
    return key.slice(2);
  };
  /** Every slot in force for `key`: a class's own slots for it, or else its usual week. */
  TT.slots = function (key) {
    var groups = {}, out = [];
    S().all("timetable").forEach(function (s) {
      var g = groups[s.level + "|" + s.stream] = groups[s.level + "|" + s.stream] || { base: [], own: [] };
      if (!s.scope) g.base.push(s); else if (s.scope === key) g.own.push(s);
    });
    Object.keys(groups).forEach(function (k) { out = out.concat(key && groups[k].own.length ? groups[k].own : groups[k].base); });
    return out;
  };
  TT.hasOwn = function (level, stream, key) { return !!key && S().filter("timetable", function (s) { return s.scope === key && s.level === level && s.stream === stream; }).length > 0; };

  /* ------------------------------------------------------------- whose lessons */
  function describe(slot) {
    var c = slot.classId ? M.cls(slot.classId) : null, t = c ? M.user(c.teacherId) : null;
    return { slot: slot, cls: c, subject: c ? c.subject : slot.subject, teacher: t ? t.name : slot.teacherName || "", room: slot.room || (c && c.room) || "", group: c ? c.name : M.homeClassName(slot.level, slot.stream) };
  }
  TT.forStudent = function (u, key) {
    var seen = {}, out = [];
    TT.slots(key).forEach(function (s) {
      var mine;
      if (s.classId) { var c = M.cls(s.classId); mine = c && c.studentIds.indexOf(u.id) >= 0; }
      else {
        mine = s.level === u.level && s.stream === u.stream;
        if (mine && s.exceptClassId) { var ex = M.cls(s.exceptClassId); if (ex && ex.studentIds.indexOf(u.id) >= 0) mine = false; }
      }
      var key = s.day + "|" + s.periodId + "|" + (s.classId || s.id);
      if (mine && !seen[key]) { seen[key] = 1; out.push(describe(s)); }
    });
    return out;
  };
  TT.forTeacher = function (t, key) {
    var seen = {}, out = [];
    TT.slots(key).forEach(function (s) {
      var c = s.classId ? M.cls(s.classId) : null;
      if (!(c && c.teacherId === t.id) && s.teacherId !== t.id) return;
      var key = s.day + "|" + s.periodId + "|" + (s.classId || s.id);
      if (!seen[key]) { seen[key] = 1; out.push(describe(s)); }
    });
    return out;
  };
  TT.forHome = function (level, stream, key) {
    return TT.slots(key).filter(function (s) { return s.level === level && s.stream === stream; }).map(describe);
  };
  TT.lesson = function (classId, date, periodId) { return S().get("lessons", "ls_" + classId + "_" + date + "_" + periodId); };

  /** The school day to show: today, or the next school day at weekends. */
  TT.displayDay = function () {
    var d = A.startOfDay();
    while (!M.isSchoolDay(d)) d = A.startOfDay(d + 36 * 3600000);
    return d;
  };
  function nowInfo(dayTs, p) {
    if (A.startOfDay() !== dayTs) return "";
    var m = (Date.now() - dayTs) / 60000;
    if (m >= A.hm(p.start) && m < A.hm(p.end)) return "now";
    return m < A.hm(p.start) ? "later" : "done";
  }

  /* --------------------------------------------------------- today card */
  TT.todayCard = function (me) {
    var day = TT.displayDay(), wd = new Date(day).getDay(), date = A.isoDate(day), teacher = me.role === "teacher", key = TT.keyFor(day);
    var entries = (teacher ? TT.forTeacher(me, key) : TT.forStudent(me, key)).filter(function (e) { return e.slot.day === wd; });
    var isToday = day === A.startOfDay(), nextShown = false;
    var rows = TT.bells().filter(function (p) { return !p.isBreak; }).map(function (p) {
      var here = entries.filter(function (e) { return e.slot.periodId === p.id; });
      if (!here.length) return "";
      var state = nowInfo(day, p), badge = "";
      if (state === "now") badge = '<span class="badge accent">Now</span>';
      else if (state === "later" && !nextShown) { nextShown = true; badge = '<span class="badge brand">Next</span>'; }
      return here.map(function (e) {
        var ls = e.cls ? TT.lesson(e.cls.id, date, p.id) : null;
        var typeHtml = "";
        if (teacher && e.cls) {
          typeHtml = '<div class="lt-pick" role="group" aria-label="Lesson type">' + TT.TYPES.map(function (t) {
            return '<button type="button" class="lt ' + TT.typeClass(t) + (ls && ls.type === t ? " on" : "") + '" data-act="lesson-type" data-class="' + e.cls.id + '" data-date="' + date + '" data-period="' + p.id + '" data-type="' + esc(t) + '">' + I(TYPE_ICON[t]) + esc(t) + "</button>";
          }).join("") + "</div>";
        } else if (ls && ls.type) typeHtml = '<div class="mt-sm">' + TT.typeChip(ls.type) + (ls.note ? ' <span class="tiny muted">' + esc(ls.note) + "</span>" : "") + "</div>";
        return '<div class="tt-row ' + (state === "done" ? "past" : "") + (state === "now" ? " now" : "") + '"><div class="tt-time"><b>' + p.start + '</b><span>' + p.end + "</span></div>" +
          '<div class="grow"><div class="row wrap"><b>' + esc(e.subject) + "</b>" + badge + '</div><div class="small muted">' + esc(teacher ? e.group : e.teacher) + (e.room ? " · " + esc(e.room) : "") + "</div>" + typeHtml + "</div></div>";
      }).join("");
    }).join("");
    return '<div class="card"><div class="card-head">' + I("grid") + "<h3>" + (isToday ? "Today's timetable" : DAYS[wd - 1] + "'s timetable") + '</h3><span class="sub">' + (TT.mode() === "day" ? A.fmtDate(day) : DAYS[wd - 1]) + '</span><span class="grow"></span><a class="btn btn-sm btn-ghost" href="#/' + (teacher ? "t" : "s") + '/timetable">Full week ' + I("right") + "</a></div>" +
      (rows || UI.empty("grid", teacher ? "No lessons on this day" : "No lessons on this day", "")) +
      (teacher && rows ? '<div class="card-foot tiny muted">Tap Theory, Discussion, Practical or Mock test so students know what to expect.</div>' : "") + "</div>";
  };

  A.act["lesson-type"] = function (el) {
    var cid = el.getAttribute("data-class"), date = el.getAttribute("data-date"), pid = el.getAttribute("data-period"), type = el.getAttribute("data-type");
    var id = "ls_" + cid + "_" + date + "_" + pid, cur = S().get("lessons", id);
    if (cur && cur.type === type) S().put("lessons", Object.assign({}, cur, { type: null }));
    else S().put("lessons", Object.assign({ id: id, classId: cid, date: date, periodId: pid }, cur || {}, { type: type }));
    UI.toast(cur && cur.type === type ? "Lesson type cleared" : "Students will see: " + type);
    A.render();
  };

  /* ---------------------------------------------------------- week grid */
  /** entriesFor(dayTs) → the lessons of that column; opts.dated: show dates (day to day). */
  function weekGrid(entriesFor, monday, opts) {
    var bells = TT.bells(), today = A.startOfDay(), dated = opts.dated;
    var cols = DAYS.map(function (d, i) { var ts = A.startOfDay(monday + i * A.DAY + 12 * 3600000); return entriesFor(ts); });
    var head = "<tr><th></th>" + DAYS.map(function (d, i) {
      var ts = monday + i * A.DAY + 12 * 3600000, isToday = A.startOfDay(ts) === today && (dated || opts.thisWeek);
      return '<th class="' + (isToday ? "today" : "") + '">' + (dated ? d.slice(0, 3) + " <span>" + new Date(ts).getDate() + " " + A.MON[new Date(ts).getMonth()] + "</span>" : d) + "</th>";
    }).join("") + "</tr>";
    var body = bells.map(function (p) {
      if (p.isBreak) return '<tr class="tt-break"><th>' + esc(p.label) + "<span>" + p.start + "–" + p.end + '</span></th><td colspan="5">' + esc(p.label) + "</td></tr>";
      return '<tr><th><b>' + esc(p.label) + "</b><span>" + p.start + "–" + p.end + "</span></th>" + DAYS.map(function (d, i) {
        var dayTs = A.startOfDay(monday + i * A.DAY + 12 * 3600000), date = A.isoDate(dayTs), state = dated || opts.thisWeek ? nowInfo(dayTs, p) : "";
        var here = cols[i].filter(function (e) { return e.slot.day === i + 1 && e.slot.periodId === p.id; });
        var cls = "tt-cell" + (dayTs === today && (dated || opts.thisWeek) ? " today" : "") + (state === "now" ? " now" : "");
        if (opts.edit) return '<td class="' + cls + ' edit" data-act="tt-edit-cell" data-day="' + (i + 1) + '" data-period="' + p.id + '" data-key="' + esc(opts.keyOf ? opts.keyOf(dayTs) || "" : "") + '" tabindex="0" role="button">' + (here.map(function (e) {
          return '<div class="tt-lesson"><b>' + esc(e.subject) + "</b><span>" + esc(e.teacher) + "</span>" + (e.slot.exceptClassId ? '<span class="tiny">option</span>' : "") + "</div>";
        }).join("") || '<span class="tt-empty">' + I("plus") + "</span>") + "</td>";
        return '<td class="' + cls + '">' + here.map(function (e) {
          var ls = e.cls ? TT.lesson(e.cls.id, date, p.id) : null;
          var clickable = opts.teacher && e.cls;
          return '<div class="tt-lesson' + (clickable ? " click" : "") + '"' + (clickable ? ' data-act="tt-lesson" data-class="' + e.cls.id + '" data-date="' + date + '" data-period="' + p.id + '" tabindex="0" role="button"' : "") + ">" +
            "<b>" + esc(e.subject) + "</b><span>" + esc(opts.teacher ? e.group : e.teacher) + (e.room ? " · " + esc(e.room) : "") + "</span>" +
            (ls && ls.type ? TT.typeChip(ls.type) : clickable ? '<span class="tt-set">Set type</span>' : "") + "</div>";
        }).join("") + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<div class="table-wrap"><table class="tt"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>";
  }
  function weekNav(base, w, extra) {
    var monday = A.mondayOf(Date.now()) + w * 7 * A.DAY;
    return '<div class="row wrap mb"><div class="seg"><button data-act="goto" data-href="' + base + "?w=" + (w - 1) + (extra || "") + '">' + I("left") + 'Previous</button><button class="' + (w === 0 ? "on" : "") + '" data-act="goto" data-href="' + base + "?w=0" + (extra || "") + '">This week</button><button data-act="goto" data-href="' + base + "?w=" + (w + 1) + (extra || "") + '">Next ' + I("right") + "</button></div>" +
      '<span class="muted small">Week of ' + A.fmtDateLong(monday + 12 * 3600000) + "</span><span class=\"grow\"></span>" +
      '<div class="legend">' + TT.TYPES.map(function (t) { return TT.typeChip(t); }).join("") + "</div></div>";
  }

  /* ------------------------------------------------------------- routes */
  /** Which week, month or term is shown, and how to move between them. */
  function timeView(q, base, extra) {
    var mode = TT.mode(), w = Number(q.w) || 0, v = { mode: mode, monday: A.mondayOf(Date.now()), dated: mode === "day", thisWeek: true };
    if (mode === "day") {
      v.monday += w * 7 * A.DAY; v.thisWeek = w === 0; v.keyOf = function (ts) { return "d:" + A.isoDate(ts); };
      v.nav = weekNav(base, w, extra);
    } else if (mode === "month") {
      var mo = Number(q.m) || 0, d = new Date(); d.setDate(15); d.setMonth(d.getMonth() + mo);
      var key = monthKey(d.getTime()); v.keyOf = function () { return key; }; v.key = key; v.thisWeek = mo === 0;
      v.nav = '<div class="row wrap mb"><div class="seg"><button data-act="goto" data-href="' + base + "?m=" + (mo - 1) + (extra || "") + '">' + I("left") + 'Previous month</button><button class="' + (mo === 0 ? "on" : "") + '" data-act="goto" data-href="' + base + "?m=0" + (extra || "") + '">This month</button><button data-act="goto" data-href="' + base + "?m=" + (mo + 1) + (extra || "") + '">Next month ' + I("right") + "</button></div>" +
        '<span class="muted small">' + esc(TT.keyLabel(key)) + ': Monday to Friday</span><span class="grow"></span>' + legend() + "</div>";
    } else if (mode === "term") {
      var terms = CFG.terms && CFG.terms.length ? CFG.terms : [M.termName(1), M.termName(2), M.termName(3)], cur = q.t && terms.indexOf(q.t) >= 0 ? q.t : termNow();
      v.key = "t:" + cur; v.keyOf = function () { return v.key; }; v.thisWeek = cur === termNow();
      v.nav = '<div class="row wrap mb"><div class="seg">' + terms.map(function (t) { return '<button class="' + (t === cur ? "on" : "") + '" data-act="goto" data-href="' + base + "?t=" + encodeURIComponent(t) + (extra || "") + '">' + esc(t) + "</button>"; }).join("") + "</div>" +
        '<span class="muted small">' + esc(cur) + ': Monday to Friday</span><span class="grow"></span>' + legend() + "</div>";
    } else {
      v.keyOf = function () { return null; };
      v.nav = '<div class="row wrap mb"><span class="muted small">The same timetable every week, Monday to Friday</span><span class="grow"></span>' + legend() + "</div>";
    }
    return v;
  }
  function legend() { return '<div class="legend">' + TT.TYPES.map(function (t) { return TT.typeChip(t); }).join("") + "</div>"; }

  A.route("s/timetable", function (p, q, me) {
    var v = timeView(q, "#/s/timetable", "");
    return { title: "Timetable", html: v.nav + '<div class="card">' + weekGrid(function (ts) { return TT.forStudent(me, v.keyOf(ts)); }, v.monday, v) + "</div>" +
      '<p class="small muted mt">' + esc(M.studentHome(me)) + " · lessons run Monday to Friday, 08:00 to 16:00. The label under a lesson tells you what your teacher has planned.</p>" };
  }, { role: "student" });

  A.route("t/timetable", function (p, q, me) {
    var st = M.structure();
    var view = q.v || "mine", lv = q.l || st.levels[3] || st.levels[0], sm = q.s || st.streams[0];
    var homes = homeClasses();
    var tabs = '<div class="pill-tabs"><button class="' + (view === "mine" ? "on" : "") + '" data-act="goto" data-href="#/t/timetable?v=mine">My timetable</button>' +
      homes.map(function (h) { var on = view === "class" && h.level === lv && h.stream === sm; return '<button class="' + (on ? "on" : "") + '" data-act="goto" data-href="#/t/timetable?v=class&l=' + encodeURIComponent(h.level) + "&s=" + encodeURIComponent(h.stream) + '">' + esc(M.homeClassName(h.level, h.stream)) + "</button>"; }).join("") +
      (me.isAdmin ? '<button data-act="tt-add-home">' + I("plus") + "Class timetable</button>" : "") + "</div>";
    // how the school's timetable works: admins and teachers choose
    var mode = TT.mode();
    var html = '<div class="row wrap mb tt-mode"><span class="small bold">' + I("grid") + " Timetable type</span>" +
      '<div class="seg" role="group" aria-label="Timetable type">' + Object.keys(TT.MODES).map(function (m) {
        return '<button class="' + (m === mode ? "on" : "") + '" data-act="tt-mode" data-mode="' + m + '">' + esc(TT.MODES[m]) + "</button>";
      }).join("") + '</div><span class="tiny muted">' + esc({ day: "Every date can have its own timetable, so dates are shown.", week: "The same Monday to Friday timetable every week.", month: "A Monday to Friday timetable for each month.", term: "A Monday to Friday timetable for each term." }[mode]) + "</span></div>" + tabs;
    var extra = view === "mine" ? "&v=mine" : "&v=class&l=" + encodeURIComponent(lv) + "&s=" + encodeURIComponent(sm) + (q.e === "1" ? "&e=1" : "");
    var v = timeView(q, "#/t/timetable", extra);
    if (view === "mine") {
      html += v.nav + '<div class="card">' + weekGrid(function (ts) { return TT.forTeacher(me, v.keyOf(ts)); }, v.monday, Object.assign({ teacher: true }, v)) + "</div>" +
        '<p class="small muted mt">Tap a lesson to set its type (Theory, Discussion, Practical or Mock test) and add a note. Students see it under the lesson.</p>';
    } else {
      var edit = me.isAdmin && q.e === "1", key = v.key || null;
      // a month or term: its own timetable, or the usual week
      var own = key && TT.hasOwn(lv, sm, key);
      var scopeNote = !key || !me.isAdmin ? "" : '<div class="callout mb">' + I("info") + '<div class="grow">' + (own ? "<b>" + esc(TT.keyLabel(key)) + "</b> has its own timetable for " + esc(M.homeClassName(lv, sm)) + "."
        : esc(TT.keyLabel(key)) + " uses the usual weekly timetable for " + esc(M.homeClassName(lv, sm)) + ".") + "</div>" +
        (own ? '<button class="btn btn-sm" data-act="tt-scope-drop" data-key="' + esc(key) + '" data-l="' + esc(lv) + '" data-s="' + esc(sm) + '">Use the usual week</button>'
          : '<button class="btn btn-sm btn-primary" data-act="tt-scope-make" data-key="' + esc(key) + '" data-l="' + esc(lv) + '" data-s="' + esc(sm) + '">' + I("plus") + "Make one for " + esc(TT.keyLabel(key)) + "</button>") + "</div>";
      html += '<div class="row wrap mb"><h2 style="font-size:18px">' + esc(M.homeClassName(lv, sm)) + '</h2><span class="grow"></span>' +
        (me.isAdmin ? (edit ? '<button class="btn" data-act="tt-bells">' + I("clock") + 'Bell times</button><a class="btn btn-primary" href="#/t/timetable?v=class&l=' + encodeURIComponent(lv) + "&s=" + encodeURIComponent(sm) + '">' + I("check") + "Done editing</a>"
          : '<a class="btn btn-primary" href="#/t/timetable?v=class&l=' + encodeURIComponent(lv) + "&s=" + encodeURIComponent(sm) + '&e=1">' + I("edit") + "Edit timetable</a>") : "") + "</div>" +
        (edit ? '<div class="callout mb">' + I("info") + "<div>Click any lesson slot to add, change or remove a subject. You can put two subjects in one slot for option blocks, for example Physics or Geography." +
          (v.mode === "day" ? " In a day-to-day timetable a change is for that date only; the other dates keep the usual week." : "") + "</div></div>" : "") +
        (v.mode === "week" ? "" : v.nav) + scopeNote +
        '<div class="card">' + weekGrid(function (ts) { return TT.forHome(lv, sm, v.keyOf(ts)); }, v.monday, Object.assign({ edit: edit, level: lv, stream: sm }, v)) + "</div>";
      TT.editing = { level: lv, stream: sm };
    }
    return { title: "Timetable", html: html };
  }, { role: "teacher" });

  function homeClasses() {
    var seen = {}, out = [];
    S().all("timetable").forEach(function (s) { var k = s.level + "|" + s.stream; if (!seen[k]) { seen[k] = 1; out.push({ level: s.level, stream: s.stream }); } });
    return out.sort(function (a, b) { return M.levelIndex(a.level) - M.levelIndex(b.level) || M.streamIndex(a.stream) - M.streamIndex(b.stream); });
  }

  /* teacher: set the type + note of one lesson */
  A.act["tt-lesson"] = function (el) {
    var cid = el.getAttribute("data-class"), date = el.getAttribute("data-date"), pid = el.getAttribute("data-period");
    var c = M.cls(cid), p = TT.period(pid), cur = TT.lesson(cid, date, pid) || {};
    var syl = M.syllabus(c.syllabusId);
    UI.modal({
      title: M.className(c), sub: A.fmtDate(new Date(date + "T12:00:00").getTime()) + " · " + p.start + "–" + p.end,
      body: '<form id="ls-form"><span class="label">What kind of lesson is it?</span><div class="lt-pick big">' + TT.TYPES.map(function (t) {
        return '<label class="lt ' + TT.typeClass(t) + (cur.type === t ? " on" : "") + '"><input type="radio" name="type" value="' + esc(t) + '"' + (cur.type === t ? " checked" : "") + " hidden>" + I(TYPE_ICON[t]) + esc(t) + "</label>";
      }).join("") + "</div>" +
        '<label class="field mt"><span>Topic <span class="muted">(optional)</span></span><select class="select" name="topicId"><option value="">No specific topic</option>' + (syl ? syl.topics.map(function (t) { return '<option value="' + t.id + '"' + (cur.topicId === t.id ? " selected" : "") + ">" + esc(t.title) + "</option>"; }).join("") : "") + "</select></label>" +
        '<label class="field"><span>Note for students <span class="muted">(optional)</span></span><input class="input" name="note" value="' + esc(cur.note || "") + '" placeholder="e.g. Bring lab coats and calculators"></label></form>',
      foot: [{ label: "Clear", onClick: function () { if (cur.id) S().put("lessons", Object.assign({}, cur, { type: null, note: "", topicId: null })); A.render(); } }, { label: "Cancel" }, {
        label: "Save", cls: "btn-primary", onClick: function (m) {
          var f = UI.formData(m.querySelector("#ls-form"));
          S().put("lessons", Object.assign({ id: "ls_" + cid + "_" + date + "_" + pid, classId: cid, date: date, periodId: pid }, cur, { type: f.type || null, note: f.note, topicId: f.topicId || null }));
          UI.toast("Lesson updated");
          A.render();
        },
      }],
      onMount: function (m) {
        m.querySelectorAll(".lt-pick label").forEach(function (l) {
          l.addEventListener("click", function () { m.querySelectorAll(".lt-pick label").forEach(function (x) { x.classList.toggle("on", x === l); }); });
        });
      },
    });
  };

  /* admin: edit one cell of a class timetable */
  A.act["tt-edit-cell"] = function (el) {
    var day = Number(el.getAttribute("data-day")), pid = el.getAttribute("data-period"), ed = TT.editing, p = TT.period(pid), key = el.getAttribute("data-key") || null;
    // a day, month or term without its own timetable gets one (a copy of the usual week) when it's changed
    if (key && !TT.hasOwn(ed.level, ed.stream, key)) copyWeek(ed.level, ed.stream, key);
    var here = S().filter("timetable", function (s) { return s.level === ed.level && s.stream === ed.stream && s.day === day && s.periodId === pid && (s.scope || null) === key; });
    var classes = S().filter("classes", function (c) { return c.level === ed.level && (!c.stream || c.stream === ed.stream); });
    var clash = function (cid) {
      var c = M.cls(cid);
      if (!c) return "";
      var other = S().find("timetable", function (s) { if (s.day !== day || s.periodId !== pid || !s.classId || s.classId === cid) return false; var oc = M.cls(s.classId); return oc && oc.teacherId === c.teacherId; });
      return other ? M.user(c.teacherId).name + " already teaches " + M.className(M.cls(other.classId)) + " at this time." : "";
    };
    UI.modal({
      title: M.homeClassName(ed.level, ed.stream) + " · " + DAYS[day - 1] + " period " + p.label, sub: p.start + "–" + p.end,
      body: '<div id="cell-list">' + (here.length ? here.map(function (s) {
        var d = describe(s);
        return '<div class="list-row" style="padding:10px 0"><div class="grow"><b>' + esc(d.subject) + '</b><div class="small muted">' + esc(d.teacher) + (d.room ? " · " + esc(d.room) : "") + (s.exceptClassId ? " · for students not in " + esc(M.className(M.cls(s.exceptClassId))) : "") + '</div></div><button type="button" class="btn btn-sm btn-danger" data-remove="' + s.id + '">' + I("trash") + "Remove</button></div>";
      }).join("") : '<p class="muted small">Nothing in this slot yet.</p>') + "</div>" +
        '<div class="divider"></div><form id="cell-form"><span class="label">Add a lesson</span><div class="form-grid">' +
        '<label class="field full"><span>Class in the app</span><select class="select" name="classId"><option value="">Another subject (type it below)</option>' + classes.map(function (c) { return '<option value="' + c.id + '">' + esc(M.className(c)) + " · " + esc(M.user(c.teacherId).name) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Subject</span><input class="input" name="subject" placeholder="e.g. English"></label>' +
        '<label class="field"><span>Teacher</span><input class="input" name="teacherName" placeholder="e.g. Mrs P. Dube"></label>' +
        '<label class="field"><span>Room</span><input class="input" name="room" placeholder="e.g. Room 12"></label></div><p class="small bad-text mt-sm" id="cell-clash"></p></form>',
      foot: [{ label: "Close" }, {
        label: "Add to slot", cls: "btn-primary", onClick: function (m) {
          var f = UI.formData(m.querySelector("#cell-form"));
          if (!f.classId && !f.subject.trim()) { UI.toast("Choose a class or type a subject", "bad"); return false; }
          var c = f.classId ? M.cls(f.classId) : null;
          S().put("timetable", { id: A.uid("tt"), day: day, periodId: pid, level: ed.level, stream: ed.stream, classId: f.classId || null, scope: key || undefined,
            subject: c ? null : f.subject.trim(), teacherName: c ? null : f.teacherName.trim(), room: f.room.trim() || (c && c.room) || "" });
          UI.toast("Timetable updated");
          A.render();
        },
      }],
      onMount: function (m) {
        m.querySelectorAll("[data-remove]").forEach(function (b) {
          b.addEventListener("click", function () { S().remove("timetable", b.getAttribute("data-remove")); b.closest(".list-row").remove(); A.render(); });
        });
        m.querySelector("[name=classId]").addEventListener("change", function (e) {
          m.querySelector("#cell-clash").textContent = clash(e.target.value);
          ["subject", "teacherName"].forEach(function (n) { m.querySelector("[name=" + n + "]").disabled = !!e.target.value; });
        });
      },
    });
  };

  function copyWeek(level, stream, key) {
    S().filter("timetable", function (s) { return !s.scope && s.level === level && s.stream === stream; }).forEach(function (s) {
      S().put("timetable", Object.assign({}, s, { id: A.uid("tt"), scope: key, copiedFrom: s.id }));
    });
  }
  A.act["tt-scope-make"] = function (el) {
    copyWeek(el.getAttribute("data-l"), el.getAttribute("data-s"), el.getAttribute("data-key"));
    UI.toast(TT.keyLabel(el.getAttribute("data-key")) + " has its own timetable now: change it here");
    A.render();
  };
  A.act["tt-scope-drop"] = function (el) {
    var key = el.getAttribute("data-key"), l = el.getAttribute("data-l"), st = el.getAttribute("data-s");
    UI.confirm("Go back to the usual weekly timetable for " + TT.keyLabel(key) + "? Its own changes are removed.", { ok: "Use the usual week" }).then(function (ok) {
      if (!ok) return;
      S().filter("timetable", function (s) { return s.scope === key && s.level === l && s.stream === st; }).forEach(function (s) { S().remove("timetable", s.id); });
      A.render();
    });
  };
  A.act["tt-mode"] = function (el) {
    var m = el.getAttribute("data-mode"); if (m === TT.mode()) return;
    UI.confirm("Change the school's timetable to " + TT.MODES[m].toLowerCase() + "? Everyone sees the change.", { ok: "Change it" }).then(function (ok) {
      if (!ok) return;
      S().put("settings", { id: "ttmode", mode: m, by: M.me().id });
      UI.toast("Timetable type: " + TT.MODES[m]);
      location.hash = "#/t/timetable"; A.render();
    });
  };

  A.act["tt-add-home"] = function () {
    var st = M.structure();
    UI.modal({
      title: "New class timetable",
      body: '<form id="home-form" class="form-grid"><label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option>" + esc(l) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Class</span><select class="select" name="stream">' + st.streams.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select></label></form>",
      foot: [{ label: "Cancel" }, { label: "Create", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#home-form"));
        location.hash = "#/t/timetable?v=class&l=" + encodeURIComponent(f.level) + "&s=" + encodeURIComponent(f.stream) + "&e=1";
      } }],
    });
  };

  /* admin: bell times (must stay within 08:00–16:00) */
  A.act["tt-bells"] = function () {
    var rows = TT.bells();
    var row = function (p) {
      return '<tr><td><input class="input sm" name="label" value="' + esc(p.label) + '" style="width:110px" aria-label="Name"></td><td><input class="input sm" type="time" name="start" value="' + p.start + '" min="08:00" max="16:00" aria-label="Starts"></td><td><input class="input sm" type="time" name="end" value="' + p.end + '" min="08:00" max="16:00" aria-label="Ends"></td>' +
        '<td><label class="check small"><input type="checkbox" name="isBreak"' + (p.isBreak ? " checked" : "") + '>Break</label><input type="hidden" name="id" value="' + (p.id || A.uid("p")) + '"></td><td><button type="button" class="btn btn-ghost btn-icon btn-sm" data-del aria-label="Remove">' + I("trash") + "</button></td></tr>";
    };
    UI.modal({
      title: "Bell times", sub: "School day: Monday to Friday, 08:00 to 16:00", size: "wide",
      body: '<table class="table"><thead><tr><th>Name</th><th>Starts</th><th>Ends</th><th></th><th></th></tr></thead><tbody id="bell-rows">' + rows.map(row).join("") + '</tbody></table><button type="button" class="btn btn-sm mt-sm" id="bell-add">' + I("plus") + "Add period</button>",
      foot: [{ label: "Cancel" }, {
        label: "Save bell times", cls: "btn-primary", onClick: function (m) {
          var out = [], bad = "";
          m.querySelectorAll("#bell-rows tr").forEach(function (tr) {
            var g = function (n) { return tr.querySelector("[name=" + n + "]"); };
            var p = { id: g("id").value, label: g("label").value.trim() || "Period", start: g("start").value, end: g("end").value, isBreak: g("isBreak").checked };
            if (A.hm(p.start) < A.hm("08:00") || A.hm(p.end) > A.hm("16:00") || A.hm(p.end) <= A.hm(p.start)) bad = p.label + " must be between 08:00 and 16:00 and end after it starts.";
            out.push(p);
          });
          if (bad) { UI.toast(bad, "bad"); return false; }
          S().put("settings", { id: "bells", periods: out.sort(function (a, b) { return A.hm(a.start) - A.hm(b.start); }) });
          UI.toast("Bell times saved");
          A.render();
        },
      }],
      onMount: function (m) {
        m.querySelector("#bell-add").addEventListener("click", function () { m.querySelector("#bell-rows").insertAdjacentHTML("beforeend", row({ label: String(m.querySelectorAll("#bell-rows tr").length + 1), start: "15:15", end: "15:55" })); });
        m.addEventListener("click", function (e) { var d = e.target.closest("[data-del]"); if (d) d.closest("tr").remove(); });
      },
    });
  };
})(window.App);
