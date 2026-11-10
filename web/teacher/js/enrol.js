/* Entering students (School Assist, 2026-11-09).
 *
 * The school's top staff enter each student and register their class and subjects; students no longer choose their
 * own. By default that is heads, principals, deputies and heads of department; an admin can change which roles may
 * (settings "enrol"), since each school decides this for itself. The hub keeps to the same list (hub-access.cjs).
 *
 * Each subject teacher hears about a student added to their subject (an alert, kind "enrol").
 */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var En = (A.Enrol = {});
  var same = function (a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); };
  var slug = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };

  /** School Assist with its class pages; School Assist Teacher's teachers add their own pupils, and Home is online. */
  En.applies = function () { return A.edition !== "teacher" && A.edition !== "home" && !A.Cloud && !!A.Primary; };
  var byDefault = function (title) { var r = A.rank(title); return r === 2 || r === 3 || r === 5; }; // heads and principals, deputies, heads of department
  var rolesRec = function () { return S().get("settings", "enrol"); };
  /** May this person enter students? */
  En.may = function (me) {
    if (!me || me.role !== "teacher" || !En.applies() || (A.Fees && A.Fees.isFinance(me))) return false;
    var r = rolesRec();
    return r && r.roles ? r.roles.some(function (x) { return same(x, me.title); }) : byDefault(me.title);
  };
  En.nav = function (me) { return En.applies() && (En.may(me) || me.isAdmin) ? { href: "#/t/enrol", icon: "users", label: "Enter students", key: "enrol" } : null; };

  var homes = function (level) { return A.Primary.homerooms().filter(function (c) { return c.level === level; }); };
  /** The subject class (with its syllabus and students) a student of this form and stream joins for a subject, if there is one. */
  function subjectClass(level, stream, subject) {
    var list = S().filter("classes", function (c) { return !c.homeroom && same(c.subject, subject) && c.level === level && (!c.stream || same(c.stream, stream)); });
    return list.filter(function (c) { return same(c.stream, stream); })[0] || list[0] || null;
  }
  /** Who teaches a subject to this class: its subject class, then the timetable, then the teachers' own subjects. */
  function teacherFor(home, level, stream, subject) {
    var sc = subjectClass(level, stream, subject);
    if (sc && sc.teacherId) return sc.teacherId;
    if (!home) return null;
    var slot = S().find("timetable", function (s) { return s.classId === home.id && !s.scope && s.teacherId && same(s.area, subject); });
    if (slot) return slot.teacherId;
    var who = A.Tracker ? A.Tracker.whoTeaches()[home.id + "|" + subject] : null;
    return who && who.length ? who[0] : null;
  }
  En.teacherFor = teacherFor;

  /* A subject with no class yet for the student's form and stream (2026-11-10): one is made, taught by whoever the
     timetable says, on the school's Cambridge syllabus for the subject (or the ready-made one) when there is one, so the
     student has the subject in their portal at once: Exam mode, Tutor, the library. The admin and the teacher sort out
     anything else between them. Before, the student waited in no class at all. */
  var letters = function (s) { return String(s || "").toLowerCase().replace(/[^a-z]/g, ""); };
  var ALIAS = { english: ["englishfirstlanguage", "englishlanguage"], englishlanguage: ["englishfirstlanguage", "englishlanguage"], accounts: ["accounting"], principlesofaccounts: ["accounting"],
    literature: ["literatureinenglish"], englishliterature: ["literatureinenglish"], business: ["businessstudies", "business"], businessstudies: ["businessstudies", "business"],
    informationtechnology: ["ict", "informationtechnology"], ict: ["ict", "informationtechnology"] };
  /** Cambridge's level for a form: IGCSE for Forms 1 to 4, AS & A Level for the sixth form, none for anything else. */
  function cambridgeLevel(level) { return /form\s*[56]|lower\s*6|upper\s*6|sixth|a.?level/i.test(level || "") ? "AS & A Level" : /form\s*[1-4]\b/i.test(level || "") ? "IGCSE" : null; }
  function syllabusFor(level, subject, lib, me) {
    var want = cambridgeLevel(level), keys = [letters(subject)].concat(ALIAS[letters(subject)] || []);
    if (!want) return null;
    var fit = function (s) { return !!s && !s._deleted && s.board === "Cambridge" && s.level === want && keys.indexOf(letters(s.subject)) >= 0; };
    var have = S().filter("syllabi", fit)[0];
    if (have) return have;
    var src = (lib || []).filter(fit)[0];
    return src && A.addLibrarySyllabus ? A.addLibrarySyllabus(src, me) : null;
  }
  function makeClass(level, stream, subject, home, lib, me) {
    var base = "c_" + slug(home ? home.id.replace(/^cls_/, "") : level + "-" + (stream || "all")) + "_" + slug(subject), id = base;
    for (var n = 2; S().get("classes", id); n++) id = base + "-" + n;
    var syl = syllabusFor(level, subject, lib, me);
    return S().put("classes", { id: id, name: home ? home.name : [level, stream].filter(Boolean).join(" "), level: level, stream: stream || null, subject: subject,
      teacherId: teacherFor(home, level, stream, subject) || null, syllabusId: syl ? syl.id : null, room: "", studentIds: [], currentTerm: (A.Primary.conf() || {}).term || 1,
      sequential: false, topicAccess: {}, madeFor: "students", createdBy: me.id });
  }
  /** The subjects that have no class yet for this form and stream. */
  var missing = function (level, stream, subjects) { return subjects.filter(function (t) { return !subjectClass(level, stream, t); }); };

  /* ------------------------------------------------------------------ the student's form */
  function subjectBoxes(level, home, stream, ticked) {
    var list = A.Primary.levelAreas(level);
    return list.map(function (a) {
      var t = M.user(teacherFor(home, level, stream, a));
      return '<label class="check en-subject"><input type="checkbox" name="subj" value="' + esc(a) + '"' + (ticked.indexOf(a) >= 0 ? " checked" : "") + "><span>" + esc(a) + (t ? '<small class="muted">' + esc(t.name) + "</small>" : "") + "</span></label>";
    }).join("");
  }
  function modal(u, preset) {
    var st = M.structure(), isNew = !u, me = M.me();
    var cur = u || Object.assign({ name: "", level: st.levels[0], stream: st.streams[0] }, preset || {});
    var chosenHome = u ? M.homeroomOf(u.id) : null;
    var ticked = cur.registered ? cur.registered.slice() : u ? M.classesForStudent(u.id).map(function (c) { return c.subject; }) : [];
    var classField = function (level) {
      var h = homes(level);
      return h.length ? '<select class="select" name="home">' + h.map(function (c) { return '<option value="' + esc(c.id) + '"' + ((chosenHome && chosenHome.id === c.id) || (!chosenHome && same(c.stream, cur.stream)) ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select>"
        : '<select class="select" name="stream">' + st.streams.map(function (x) { return "<option" + (same(x, cur.stream) ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select>";
    };
    UI.modal({
      title: isNew ? "Enter a student" : "Edit " + u.name, size: "wide",
      body: '<form id="en-form" class="form-grid"><label class="field full"><span>Full name</span><input class="input" name="name" value="' + esc(cur.name) + '" autocomplete="off"></label>' +
        (isNew ? "" : '<label class="field full"><span>Student ID</span><input class="input" name="studentNo" value="' + esc(cur.studentNo || "") + '" autocomplete="off"></label>') + // (a new student's is issued when they are saved)
        '<label class="field"><span>Sex</span><select class="select" name="sex"><option value=""></option><option value="M"' + (cur.sex === "M" ? " selected" : "") + '>Male</option><option value="F"' + (cur.sex === "F" ? " selected" : "") + ">Female</option></select></label>" +
        '<label class="field"><span>Date of birth</span><input class="input" type="date" name="dob" value="' + esc(cur.dob || "") + '"></label>' +
        '<label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option" + (l === cur.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Class</span><span id="en-class">' + classField(cur.level) + "</span></label>" +
        (A.Parents ? A.Parents.fields(cur) : "") +
        '<div class="field full"><div class="row spread"><span class="label">Subjects</span><button type="button" class="btn btn-sm btn-ghost" id="en-all">Tick them all</button></div><div class="en-subjects" id="en-subjects"></div><span class="hint">Each subject\'s teacher is told when a student is added.' + (isNew ? " The student's ID is issued when you save." : "") + "</span></div></form>",
      onMount: function (m) {
        var f = m.querySelector("#en-form"), box = m.querySelector("#en-subjects");
        var place = function () {
          var homeEl = f.querySelector("[name=home]"), home = homeEl ? M.cls(homeEl.value) : null;
          return { level: f.level.value, home: home, stream: home ? home.stream : (f.querySelector("[name=stream]") || {}).value };
        };
        var draw = function () {
          var keep = box.children.length ? Array.prototype.map.call(box.querySelectorAll("input:checked"), function (x) { return x.value; }) : ticked, p = place();
          box.innerHTML = subjectBoxes(p.level, p.home, p.stream, keep);
        };
        draw();
        f.level.addEventListener("change", function () {
          chosenHome = null;
          m.querySelector("#en-class").innerHTML = classField(f.level.value);
          draw();
        });
        m.querySelector("#en-class").addEventListener("change", draw);
        m.querySelector("#en-all").addEventListener("click", function () { box.querySelectorAll("input").forEach(function (x) { x.checked = true; }); });
      },
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", icon: "check", onClick: function (m) { return save(u, m, me); } }],
    });
  }
  function save(u, m, me) {
    var form = m.querySelector("#en-form"), f = UI.formData(form), name = f.name.trim(), typed = String(f.studentNo || "").trim();
    if (name.length < 2) { UI.toast("Enter the student's full name", "bad"); return false; }
    var clash = typed && M.studentById(typed);
    if (clash && (!u || clash.id !== u.id)) { UI.toast("That student ID belongs to " + clash.name, "bad"); return false; }
    if (u && !typed) { UI.toast("Enter the student ID", "bad"); return false; }
    var subjects = Array.prototype.map.call(form.querySelectorAll("[name=subj]:checked"), function (x) { return x.value; });
    if (!subjects.length) { UI.toast("Tick the subjects this student takes", "bad"); return false; }
    var home = f.home ? M.cls(f.home) : null, stream = home ? home.stream : f.stream;
    var wasHome = u ? M.homeroomOf(u.id) : null, moved = !!u && ((wasHome && wasHome.id) !== (home && home.id) || u.level !== f.level);
    var rec = Object.assign({}, u || { id: A.uid("s"), role: "student", enteredBy: me.id, enteredAt: A.now() }, { name: name, level: f.level, stream: stream || null, sex: f.sex, dob: f.dob, registered: subjects });
    if (A.Parents && A.Parents.available()) rec.parents = A.Parents.readFields(f);
    var lib = null;
    var finish = function () {
      var saved = S().put("users", rec);
      if (home) A.Primary.placeStudent(saved, home); else A.Primary.followClass(saved);
      apply(saved, home, u ? (u.registered || M.classesForStudent(u.id).map(function (c) { return c.subject; })) : [], moved, me, !u, lib);
      if (A.Sync) A.Sync.maybe();
      UI.toast(u ? "Saved" : name + " is entered: " + rec.studentNo);
      A.render();
    };
    rec.studentNo = typed;
    // a subject with no class for this form yet takes its Cambridge syllabus from the ready-made list (once loaded, kept)
    var ready = missing(f.level, stream, subjects).length && A.loadSyllabusLibrary ? A.loadSyllabusLibrary().then(function (l) { lib = l; }, function () { /* offline: the class, without a syllabus */ }) : Promise.resolve();
    return ready.then(function () {
      if (typed) return finish();
      return M.claimStudentNo(f.level).then(function (no) { rec.studentNo = no; finish(); });
    });
  }
  /** Into the subject classes of the subjects ticked (made when a form has none yet), out of the others, and each
      teacher told of what is new to them: the subject teachers, and the class teacher of a student new to their class. */
  function apply(u, home, before, moved, me, isNew, lib) {
    var ticks = u.registered, level = u.level, stream = u.stream;
    M.classesForStudent(u.id).forEach(function (c) {
      var keep = ticks.some(function (t) { return same(t, c.subject); }) && subjectClass(level, stream, c.subject) === c;
      if (keep) return;
      S().put("classes", Object.assign({}, c, { studentIds: c.studentIds.filter(function (x) { return x !== u.id; }) }));
      if (c.syllabusId) S().put("enrolments", Object.assign({}, S().get("enrolments", "en_" + u.id + "_" + c.syllabusId) || { id: "en_" + u.id + "_" + c.syllabusId, studentId: u.id, syllabusId: c.syllabusId, classId: c.id }, { status: "dropped", droppedAt: A.now(), decidedBy: me.id }));
    });
    var fresh = moved ? ticks : ticks.filter(function (t) { return !before.some(function (b) { return same(b, t); }); });
    ticks.forEach(function (t) {
      var c = subjectClass(level, stream, t) || makeClass(level, stream, t, home, lib, me);
      if ((c.studentIds || []).indexOf(u.id) < 0) S().put("classes", Object.assign({}, c, { studentIds: (c.studentIds || []).concat([u.id]) }));
      if (c.syllabusId) S().put("enrolments", { id: "en_" + u.id + "_" + c.syllabusId, studentId: u.id, syllabusId: c.syllabusId, classId: c.id, status: "approved", requestedAt: A.now(), decidedAt: A.now(), decidedBy: me.id });
    });
    var classWord = stream || (home && home.name) || "";
    fresh.forEach(function (t) {
      var tid = teacherFor(home, level, stream, t);
      if (!tid || tid === me.id) return;
      S().put("alerts", { id: "al_enrol_" + u.id + "_" + slug(t) + "_" + tid, teacherId: tid, kind: "enrol", createdAt: A.now(), title: "New student in your " + t + " subject",
        body: (me.title || "An admin") + " added student " + u.name + " to your " + t + " subject to " + level + (classWord ? " class " + classWord : "") + "." });
    });
    // the class teacher of a student new to their class
    if (home && home.teacherId && home.teacherId !== me.id && (isNew || moved)) {
      S().put("alerts", { id: "al_enrol_" + u.id + "_class_" + home.teacherId, teacherId: home.teacherId, kind: "enrol", href: "#/t/pupils", createdAt: A.now(), title: "New student in your class",
        body: (me.title || "An admin") + " added student " + u.name + " to your class " + home.name + "." });
    }
  }

  /* ------------------------------------------------------------------ the page */
  A.route("t/enrol", function (p, q, me) {
    if (!En.nav(me)) return { redirect: A.home(me) };
    var st = M.structure(), level = st.levels.indexOf(q.f) >= 0 ? q.f : st.levels[0], list = homes(level), cls = q.c ? list.filter(function (c) { return c.id === q.c; })[0] : null, may = En.may(me);
    var kids = M.students().filter(function (u) { return u.level === level && !u.leftAt && u.status !== "declined" && (!cls || (cls.studentIds || []).indexOf(u.id) >= 0); });
    var head = '<div class="row wrap spread mb"><p class="muted">Students are entered here, with their class and subjects. Students no longer choose their own.</p><div class="row wrap">' +
      (me.isAdmin ? '<button class="btn" data-act="en-roles">' + I("shield") + "Who enters students</button>" : "") + (may ? '<button class="btn btn-primary" data-act="en-new" data-level="' + esc(level) + '" data-stream="' + esc(cls ? cls.stream || "" : "") + '">' + I("plus") + "Enter a student</button>" : "") + "</div></div>";
    if (!may) head += '<div class="callout warn mb">' + I("info") + '<div class="small">Your role (' + esc(me.title || "none") + ") isn't on this school's list of who enters students. Change it with <b>Who enters students</b>.</div></div>";
    var forms = '<div class="pill-tabs">' + st.levels.map(function (l) { return '<button class="' + (l === level ? "on" : "") + '" data-act="goto" data-href="#/t/enrol?f=' + encodeURIComponent(l) + '">' + esc(l) + "</button>"; }).join("") + "</div>";
    var classes = list.length > 1 ? '<div class="pill-tabs sub"><button class="' + (!cls ? "on" : "") + '" data-act="goto" data-href="#/t/enrol?f=' + encodeURIComponent(level) + '">All</button>' + list.map(function (c) { return '<button class="' + (cls === c ? "on" : "") + '" data-act="goto" data-href="#/t/enrol?f=' + encodeURIComponent(level) + "&c=" + c.id + '">' + esc(c.name) + "</button>"; }).join("") + "</div>" : "";
    var rows = kids.map(function (u) {
      var h = M.homeroomOf(u.id), n = (u.registered || M.classesForStudent(u.id).map(function (c) { return c.subject; })).length;
      return "<tr><td><b>" + esc(u.name) + '</b></td><td class="tnum">' + esc(u.studentNo || "") + "</td><td>" + esc(h ? h.name : [u.level, u.stream].filter(Boolean).join(" ")) + "</td><td>" + (n ? n + " subject" + (n === 1 ? "" : "s") : '<span class="badge warn">None yet</span>') + '</td><td class="num">' + (may ? '<button class="btn btn-sm" data-act="en-edit" data-id="' + esc(u.id) + '">' + I("edit") + "Edit</button>" : "") + "</td></tr>";
    }).join("");
    return { title: "Enter students", html: head + forms + classes + (rows ? '<div class="card table-wrap"><table class="table"><thead><tr><th>Student</th><th>Student ID</th><th>Class</th><th>Subjects</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<div class="card">' + UI.empty("users", "No students in " + level + " yet") + "</div>"),
      mount: function () { if (q.add && may) modal(null, { level: level, stream: cls ? cls.stream : undefined }); } };
  }, { role: "teacher" });
  A.act["en-new"] = function (el) { modal(null, { level: el.getAttribute("data-level"), stream: el.getAttribute("data-stream") || undefined }); };
  A.act["en-edit"] = function (el) { modal(M.user(el.getAttribute("data-id"))); };
  En.open = modal;
  A.act["en-roles"] = function () {
    var r = rolesRec(), on = function (t) { return r && r.roles ? r.roles.some(function (x) { return same(x, t); }) : byDefault(t); };
    var titles = A.ROLES.filter(function (t) { return !/^(bursar|accountant|teacher)$/i.test(t); });
    S().filter("users", function (u) { return u.role === "teacher" && u.title; }).forEach(function (u) { if (!/^(bursar|accountant)$/i.test(u.title) && !titles.some(function (t) { return same(t, u.title); })) titles.push(u.title); });
    UI.modal({ title: "Who enters students", sub: "Ask the school who should do this, and tick those roles.",
      body: '<form id="en-roles" class="en-subjects">' + titles.map(function (t) { return '<label class="check en-subject"><input type="checkbox" name="r" value="' + esc(t) + '"' + (on(t) ? " checked" : "") + "><span>" + esc(t) + "</span></label>"; }).join("") + "</form>",
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var roles = Array.prototype.map.call(m.querySelectorAll("[name=r]:checked"), function (x) { return x.value; });
        if (!roles.length) { UI.toast("Tick at least one role", "bad"); return false; }
        S().put("settings", { id: "enrol", roles: roles }); UI.toast("Saved"); A.render();
      } }] });
  };

  /** A student's subjects, as the school registered them. */
  En.studentPage = function (me) {
    var home = M.homeroomOf(me.id), level = me.level, stream = me.stream;
    var names = (me.registered || []).slice();
    M.classesForStudent(me.id).forEach(function (c) { if (!names.some(function (n) { return same(n, c.subject); })) names.push(c.subject); });
    names.sort();
    var html = '<div class="callout mb">' + I("info") + "<div>These are the subjects the school registered for you. If one is wrong, tell your class teacher or the school office.</div></div>" +
      '<div class="card">' + (names.length ? names.map(function (n) { var t = M.user(teacherFor(home, level, stream, n)); return '<div class="list-row"><div class="grow"><div class="title">' + esc(n) + '</div><div class="meta"><span>' + (t ? esc(t.name) : "Teacher not set yet") + "</span></div></div></div>"; }).join("") : UI.empty("layers", "No subjects yet", "The school registers your subjects.")) + "</div>";
    return { title: "My subjects", html: html };
  };
})(window.App);
