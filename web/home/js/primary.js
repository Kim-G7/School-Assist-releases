/* School Assist Teacher (edition "teacher"): for class teachers, in a primary or a high school, where most learners
 * have no device. Only teachers sign in (each with a PIN); pupils are records the teacher looks after. The school
 * chooses at set-up how its classes are named (ECD and Grades, Grades, ECD, or Forms); with Forms the app speaks of
 * students and subjects instead of pupils and learning areas (P.reword).
 *   Today          register status, quick actions, birthdays, the term at a glance
 *   My class       pupils and their profiles (guardian, health, notes), adding many at once, Excel export
 *   Register       the morning register, and each pupil's days this term
 *   Mark book      exercises, tests and continuous assessment per learning area, as a quick grid
 *   Reports        termly reports with marks, descriptors, position and attendance, printed for the class
 *   Schemes        scheme of work per learning area per term, and the record of work (what was taught)
 *   Timetable      each class's week by learning area and teacher; "My timetable" across classes (the head sets it up)
 * Everything is kept on the device (and on a school hub, if the school runs one): no cloud.
 * Data: pupils are "users" with role student and pupil:true; a class is a "classes" record with
 * homeroom:true; "assessments", "reports", "schemes" and "pnotes" are this edition's own collections. */
(function (A) {
  "use strict";
  // (2026-10-28) the School edition has all of it too, for its staff: its students also sign in (their own pages are
  // js/student.js) and its teachers keep the subject classes, materials and library of School Assist (P.withStudents)
  if (A.edition === "home") { A.Primary = null; return; }
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var P = (A.Primary = {});
  /** The School edition: students sign in, and the School edition's own teaching pages sit beside these. */
  P.withStudents = A.edition !== "teacher";

  /* ------------------------------------------------------------------ the school's set-up */
  var AREAS = ["English", "Mathematics", "Indigenous Language", "Science and Technology", "Social Science", "Agriculture",
    "Physical Education", "Visual and Performing Arts", "ICT", "Family, Religion and Moral Education"];
  var BANDS = [[80, "Excellent"], [70, "Very good"], [60, "Good"], [50, "Satisfactory"], [40, "Fair"], [0, "Needs support"]];
  var LEVELS = ["ECD A", "ECD B", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"];
  // how the school names its classes, chosen at set-up (settings "structure".system)
  var SYSTEMS = {
    ecdgrade: { name: "ECD and Grade (ECD A, ECD B, Grade 1 to 7)", label: "Grade", levels: LEVELS, def: "Grade 4" },
    grade: { name: "Grade (Grade 1 to 7)", label: "Grade", levels: LEVELS.slice(2), def: "Grade 4" },
    ecd: { name: "ECD (ECD A, ECD B)", label: "Level", levels: LEVELS.slice(0, 2), def: "ECD B" },
    form: { name: "Form (Form 1 to 4, Lower 6, Upper 6)", label: "Form", levels: ["Form 1", "Form 2", "Form 3", "Form 4", "Lower 6", "Upper 6"], def: "Form 1" },
  };
  // a high school's subjects (Forms), in place of the learning areas
  var SUBJECTS = ["English", "Mathematics", "Combined Science", "Indigenous Language", "Geography", "History", "Heritage Studies", "Agriculture",
    "Computer Science", "Commerce", "Accounts", "Family and Religious Studies", "Physical Education"];
  P.SYSTEMS = SYSTEMS;
  /** How this school names its classes: "ecdgrade", "grade", "ecd" or "form". */
  P.system = function (store) {
    var st = (store || S()).get("settings", "structure") || {};
    if (SYSTEMS[st.system]) return st.system;
    // (a School edition school without its own list: the levels it came with, Form 1 to 4)
    var lv = st.levels && st.levels.length ? st.levels : !store && P.withStudents ? M.structure().levels : [];
    return lv.some(function (l) { return /^(form|lower|upper)\b/i.test(l); }) ? "form" : "ecdgrade";
  };
  P.isForm = function () { return P.system() === "form"; };
  /** Set how the school names its classes: its levels, and (while they are still the ones it came with) its subjects
      or learning areas to match. */
  P.applySystem = function (key, store) {
    var Store = store || S(), sys = SYSTEMS[key] || SYSTEMS.ecdgrade, put = function (c, r) { return Store.put(c, r, { silent: true }); };
    var st = Store.get("settings", "structure") || { streamStyle: "colours", streams: ["Blue", "Green", "Red", "Yellow"] };
    put("settings", Object.assign({}, st, { id: "structure", system: SYSTEMS[key] ? key : "ecdgrade", levelLabel: sys.label, levels: sys.levels }));
    var pc = Store.get("settings", "primary") || { bands: BANDS, year: String(A.date().getFullYear()) }, cur = (pc.areas || []).join("|");
    if (!cur || cur === AREAS.join("|") || cur === SUBJECTS.join("|")) put("settings", Object.assign({}, pc, { id: "primary", areas: key === "form" ? SUBJECTS : AREAS }));
    return sys;
  };
  var KINDS = ["Exercise", "Test", "Homework", "CALA", "Mid-term test", "End of term exam"];
  var COMMENTS = [
    "A hardworking pupil who takes part well in class.", "Reads fluently and writes neatly. Keep it up.",
    "Good progress this term. More practice with mental maths will help.", "Capable, but needs to finish classwork on time.",
    "Polite and helpful to others.", "Needs support with reading: reading at home every day will help.",
    "Shows great interest in Science and Technology.", "Should concentrate more during lessons.",
    "A pleasure to teach.", "Has improved a lot this term.",
  ];
  P.conf = function () {
    var c = S().get("settings", "primary") || {};
    return {
      areas: c.areas && c.areas.length ? c.areas : P.isForm() ? SUBJECTS : AREAS, bands: c.bands && c.bands.length ? c.bands : BANDS,
      year: String(c.year || A.date().getFullYear()), term: Number(c.term) || termByMonth(A.isoDate()), terms: c.terms || {}, head: c.head || "", headSig: c.headSig || "",
      levelAreas: c.levelAreas || {},
    };
  };
  /* Subjects by form (2026-10-26): the subjects each form takes (Settings → Learning areas and terms → Subjects by form;
     settings primary.levelAreas: { "Form 1": [...], ... }). A teacher records marks, plans and tracks only the subjects a
     class's form takes, and only those are on its report cards. A form with none listed takes every subject. */
  P.levelAreas = function (level) {
    var conf = P.conf(), l = conf.levelAreas[level];
    return Array.isArray(l) && l.length ? conf.areas.filter(function (a) { return l.indexOf(a) >= 0; }) : conf.areas.slice();
  };
  /** Does this class's form take this subject? */
  P.offers = function (c, area) { var l = c ? P.conf().levelAreas[c.level] : null; return !Array.isArray(l) || !l.length || l.indexOf(area) >= 0; };
  /** The subjects a teacher teaches that this class's form takes. */
  P.ownAreasIn = function (me, c) { return P.ownAreas(me).filter(function (a) { return P.offers(c, a); }); };
  /** The school's forms in twos (Form 1 and 2, Form 3 and 4, Lower 6 and Upper 6), as Settings sets their subjects. */
  P.levelGroups = function () {
    var lv = M.structure().levels || [], out = [];
    for (var i = 0; i < lv.length; i += 2) out.push(lv.slice(i, i + 2));
    return out;
  };
  /** The learning areas (subjects) a teacher records end-of-term marks for: the ones they teach (user.areas, chosen when
      they register or by the head in Settings → People); the head and other admins, every one. */
  P.myAreas = function (me) {
    var all = P.conf().areas;
    if (!me) return [];
    if (me.isAdmin) return all;
    return all.filter(function (a) { return (me.areas || []).indexOf(a) >= 0; });
  };
  // the school's leaders, by their role: everyone above the teachers in the school's hierarchy (A.rank: directors, the
  // RA, the principal, the deputy, the senior master and senior lady, heads of department)
  P.isLeader = function (u) { return !!u && u.role === "teacher" && A.rank(u.title) < A.RANK_STAFF; };
  /** The subjects a person teaches themselves, an admin too (the school's subjects among theirs). */
  P.ownAreas = function (me) { return me ? P.conf().areas.filter(function (a) { return (me.areas || []).indexOf(a) >= 0; }) : []; };
  /** May `me` change this subject's marks in this class? Only its teacher: a subject they teach, in a class they teach.
      Admins too (1.6.2, ECS: an admin could enter any subject's marks for any pupil); the leaders see the rest. */
  P.mayMark = function (me, classId, area) { return !!me && P.ownAreas(me).indexOf(area) >= 0 && P.offers(M.cls(classId), area) && P.teachClasses(me, true).some(function (c) { return c.id === classId; }); };
  /** Tick boxes of the school's learning areas (subjects), for a teacher's own. */
  P.areaChecks = function (chosen) {
    chosen = chosen || [];
    return '<div class="field full"><span class="label">Subjects they teach</span><div class="row wrap" style="gap:4px 14px">' + P.conf().areas.map(function (a) {
      return '<label class="check"><input type="checkbox" data-area="' + esc(a) + '"' + (chosen.indexOf(a) >= 0 ? " checked" : "") + "> " + esc(a) + "</label>";
    }).join("") + '</div><span class="hint">They record the end-of-term marks of these, in every class. The head records any.</span></div>';
  };
  P.areasPicked = function (root) { return Array.prototype.map.call(root.querySelectorAll("[data-area]:checked"), function (x) { return x.getAttribute("data-area"); }); };
  /** A subject that isn't on the school's list: typed when registering or asking, for the admins to add (user.areasNew). */
  P.newAreaField = function (typed) {
    return '<label class="field full"><span>A subject that isn\'t listed? <span class="muted">(optional)</span></span><input class="input" name="areasNew" maxlength="120" value="' + esc((typed || []).join(", ")) + '" placeholder="e.g. Agriculture, Music"><span class="hint">The admins are asked to add it to the school\'s subjects.</span></label>';
  };
  /** The subjects typed there that the school doesn't have yet; one it has is added to `picked` (ticked) instead. */
  P.newAreasTyped = function (root, picked) {
    var all = P.conf().areas, known = all.map(function (a) { return a.toLowerCase(); }), out = [];
    String((root.querySelector("[name=areasNew]") || {}).value || "").split(/[,;\n]/).forEach(function (x) {
      x = x.trim().replace(/\s+/g, " ").slice(0, 60);
      var i = known.indexOf(x.toLowerCase());
      if (i >= 0) { if (picked && picked.indexOf(all[i]) < 0) picked.push(all[i]); return; }
      if (x.length > 1 && out.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) out.push(x);
    });
    return out.slice(0, 5);
  };
  /** Tick boxes of the school's classes, for the ones a teacher teaches (user.classIds). Empty when it has none yet. */
  P.classChecks = function (chosen, label) {
    var all = homerooms(); chosen = chosen || [];
    if (!all.length) return "";
    return '<div class="field full"><span class="label">' + esc(label || "Classes they teach") + '</span><div class="row wrap" style="gap:4px 14px">' + all.map(function (c) {
      return '<label class="check"><input type="checkbox" data-cls="' + c.id + '"' + (chosen.indexOf(c.id) >= 0 ? " checked" : "") + "> " + esc(classLabel(c)) + "</label>";
    }).join("") + '</div><span class="hint">Their own class and the classes of their lessons on the timetable count too.</span></div>';
  };
  P.classesPicked = function (root) { return Array.prototype.map.call(root.querySelectorAll("[data-cls]:checked"), function (x) { return x.getAttribute("data-cls"); }); };
  function termByMonth(date) { var m = Number(String(date).slice(5, 7)); return m <= 4 ? 1 : m <= 8 ? 2 : 3; }
  /** Which term a date (YYYY-MM-DD) is in: the school's term dates if set, else by month. */
  function termOf(date, conf) {
    conf = conf || P.conf();
    for (var t = 1; t <= 3; t++) { var d = conf.terms[t] || {}; if (d.opens && d.closes && date >= d.opens && date <= d.closes) return t; }
    return termByMonth(date);
  }
  P.descriptor = function (pct, conf) {
    if (pct == null) return "";
    var b = (conf || P.conf()).bands.slice().sort(function (a, b2) { return b2[0] - a[0]; });
    for (var i = 0; i < b.length; i++) if (pct >= b[i][0]) return b[i][1];
    return b[b.length - 1][1];
  };

  /* ------------------------------------------------------------------ classes and pupils */
  P.classes = function (me) {
    return S().filter("classes", function (c) { return c.homeroom && c.teacherId === me.id; }) // an admin's too: another class is in View other classes
      .sort(function (a, b) { return M.levelIndex(a.level) - M.levelIndex(b.level) || a.name.localeCompare(b.name); });
  };
  /** The classes a teacher teaches, for the mark book: their own class, the ones they chose when registering or an admin
      gave them (user.classIds), those of their lessons on the timetable and those they have marked; an admin, every class
      (own: only those, for an admin too). */
  P.teachClasses = function (me, own) {
    if (!me) return [];
    var all = homerooms(); if (me.isAdmin && !own) return all;
    var ids = me.classIds || [], tt = {};
    S().filter("timetable", function (s) { return s.teacherId === me.id; }).forEach(function (s) { tt[s.classId] = 1; });
    // and the classes they have already marked
    S().filter("assessments", function (a) { return a.createdBy === me.id; }).forEach(function (a) { tt[a.classId] = 1; });
    S().filter("reportmarks", function (r) { return r.teacherId === me.id && r.mark != null; }).forEach(function (r) { tt[r.classId] = 1; });
    return all.filter(function (c) { return c.teacherId === me.id || ids.indexOf(c.id) >= 0 || tt[c.id]; });
  };
  function pickKey(me) { return "sca-pclass-" + me.id; }
  /** The class the teacher is working with: one of their own (another class is seen in View other classes). */
  P.cls = function (me) {
    var list = P.classes(me), want = null;
    try { want = localStorage.getItem(pickKey(me)); } catch (e) { /* this device only */ }
    return list.filter(function (c) { return c.id === want; })[0] || list.filter(function (c) { return c.teacherId === me.id; })[0] || list[0] || null;
  };
  P.pupils = function (c) { return c ? M.studentsOf(c) : []; };
  function age(dob) {
    if (!dob) return null;
    var b = new Date(dob + "T12:00:00"), n = A.date(), a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a >= 0 && a < 30 ? a : null;
  }
  function sexName(s) { return s === "F" ? "Girl" : s === "M" ? "Boy" : ""; }
  function classSwitch(me, c, here) {
    var list = P.classes(me);
    if (list.length < 2) return "";
    return '<select class="select sm pclass-pick" data-change="pclass-pick" data-here="' + esc(here) + '" aria-label="Class">' + list.map(function (x) {
      var t = M.user(x.teacherId);
      return '<option value="' + x.id + '"' + (x.id === c.id ? " selected" : "") + ">" + esc(x.name + (t && t.id !== me.id ? " · " + t.name : "")) + "</option>";
    }).join("") + "</select>";
  }
  A.act["pclass-pick"] = function (el) {
    var me = M.me(); try { localStorage.setItem(pickKey(me), el.value); } catch (e) { /* this device only */ }
    A.render();
  };
  /** The page's class, or a page asking for one. */
  function needClass(me, title) {
    var c = P.cls(me);
    if (c) return { c: c };
    // only admins make classes (1.6.2: teachers making their own made the same class twice); a teacher takes on one the
    // school has, with its pupils and records, when the head agrees
    var asked = me.homeAsk && S().get("classes", me.homeAsk);
    return { view: { title: title, html: '<div class="card">' + (me.isAdmin && !homerooms().length
      ? UI.empty("users", "No class yet", "Create the school's classes: each one's form or grade, stream and class teacher. Then add their pupils.", '<button class="btn btn-primary" data-act="pclass-new">' + I("plus") + "Create a class</button>")
      : me.isAdmin ? UI.empty("users", "No class of your own", "The school's classes, their class teachers and students are in View other classes, where you also create and edit them. To be a class teacher yourself, take one on.",
        '<a class="btn btn-primary" href="#/t/others">' + I("users") + 'View other classes</a> <button class="btn" data-act="pclass-choose">Take on a class</button>')
      : asked && !asked._deleted ? UI.empty("clock", "Waiting for the head", "You asked to be the class teacher of " + asked.name + ". When the head agrees, its pupils and registers are yours here.", '<button class="btn" data-act="psubj-unask">Take back my request</button>')
      : UI.empty("users", "No class of your own", "A class teacher chooses their class: the school's classes and their pupils are there already. The head agrees. A subject teacher needs none: your subjects and classes are in My subjects.",
        '<button class="btn btn-primary" data-act="pclass-choose">' + I("users") + "Choose my class</button>")) + "</div>" } };
  }
  /** u becomes the class teacher of c (its pupils, registers and marks with it). A teacher has one class of their own,
      so one they had before goes back to the head to give (no class teacher), unless keep. */
  P.takeClass = function (u, c, keep) {
    if (!keep) homerooms().forEach(function (x) { if (x.id !== c.id && x.teacherId === u.id) S().patch("classes", x.id, { teacherId: null }); });
    S().patch("classes", c.id, { teacherId: u.id });
  };
  /** The registration's "your class" list (js/staff.js): the school's classes, for a class teacher to take on. */
  P.homeClassField = function (chosen) {
    var all = homerooms();
    if (!all.length) return "";
    return '<label class="field full"><span>Your class <span class="muted">(if you are a class teacher)</span></span><select class="select" name="homeAsk"><option value="">I\'m not a class teacher</option>' + all.map(function (c) {
      var t = M.user(c.teacherId);
      return '<option value="' + c.id + '"' + (chosen === c.id ? " selected" : "") + ">" + esc(classLabel(c) + (t ? " · now " + t.name + "'s" : "")) + "</option>";
    }).join("") + '</select><span class="hint">Its pupils and records are yours when an admin approves you.</span></label>';
  };
  /** A teacher chooses the class they are the class teacher of, from the school's: the head agrees (an admin takes it). */
  A.act["pclass-choose"] = function () {
    var me = M.me(), list = homerooms(), mine = list.filter(function (c) { return c.teacherId === me.id; });
    if (!list.length) { UI.toast("The school has no classes yet: the head creates them", "bad"); return; }
    UI.modal({
      title: mine.length ? "Change my class" : "Choose my class", sub: me.isAdmin ? "It becomes yours, with its pupils and records." : "The head agrees, then it is yours with its pupils and records.",
      body: '<form id="pchoose">' + list.map(function (c) {
        var t = M.user(c.teacherId), n = P.pupils(c).length;
        return '<label class="list-row check"><input type="radio" name="cls" value="' + c.id + '"' + (c.teacherId === me.id ? " checked" : "") + '><div class="grow"><div class="title">' + esc(classLabel(c)) + "</div>" +
          '<div class="meta"><span>' + n + " pupil" + (n === 1 ? "" : "s") + '</span><span class="sep"></span><span>' + (t ? (t.id === me.id ? "Your class" : "Class teacher: " + esc(t.name)) : "No class teacher") + "</span></div></div></label>";
      }).join("") + '<p class="small muted" style="padding:10px 20px">Your class isn\'t here? Ask the head to create it.</p></form>', flush: true,
      foot: [{ label: "Cancel" }, { label: me.isAdmin ? "Take this class" : "Ask the head", cls: "btn-primary", onClick: function (m) {
        var v = (m.querySelector("[name=cls]:checked") || {}).value, c = v && S().get("classes", v);
        if (!c) { UI.toast("Choose a class", "bad"); return false; }
        if (c.teacherId === me.id) return true;
        if (me.isAdmin) {
          P.takeClass(me, c, true);
          try { localStorage.setItem(pickKey(me), c.id); } catch (e) { /* this device only */ }
          UI.toast(c.name + " is your class now"); A.render(); return true;
        }
        S().patch("users", me.id, { homeAsk: c.id, homeAskAt: A.now() });
        M.alertAdmins({ kind: "subjects", aboutId: me.id, title: me.name + " asks to be the class teacher of " + c.name, body: me.name + " asks to take on " + c.name + " as its class teacher" + (M.user(c.teacherId) ? " (now " + M.user(c.teacherId).name + "'s class)" : "") + ". Agree or say no in My subjects." });
        UI.toast("Sent: the head agrees or says no"); A.render(); return true;
      } }],
    });
  };

  /* ------------------------------------------------------------------ navigation */
  P.nav = function (me) {
    var c = P.cls(me), today = A.isoDate(), taken = c && M.register(c.id, today);
    return [
      { href: "#/t/home", icon: "home", label: "Today", key: "home" },
      A.Notices ? A.Notices.nav(me) : null,
      A.Tracker ? A.Tracker.nav(me) : null, // My subjects (js/tracker.js)
      { href: "#/t/pupils", icon: "users", label: "My class", key: "pupils", match: ["pupils", "pupil"] },
      { href: "#/t/others", icon: "school", label: "View other classes", key: "others", match: ["others"] },
      { href: "#/t/register", icon: "check", label: "Register", key: "register", count: c && !taken && M.isSchoolDay(A.now()) ? "!" : 0 },
      { href: "#/t/timetable", icon: "grid", label: "Timetable", key: "timetable" },
      { href: "#/t/markbook", icon: "edit", label: "Mark book", key: "markbook", match: ["markbook", "assessment"] },
      { href: "#/t/reports", icon: "file", label: "Reports", key: "reports" },
      me.isAdmin && A.Report ? { href: "#/t/reportcards", icon: "download", label: "Report cards", key: "reportcards" } : null,
      { href: "#/t/schemes", icon: "book", label: "Schemes & records", key: "schemes" },
      A.Tracker ? A.Tracker.overviewNav(me) : null, // the Teachers' overview, for the school's leaders
      A.Vacation ? A.Vacation.nav(me) : null,
      { href: me.isAdmin && A.joinsWaiting ? "#/t/settings?s=devices" : "#/t/settings", icon: "sliders", label: "Settings", key: "settings", count: me.isAdmin ? A.joinsWaiting || 0 : 0 }, // devices waiting to join
    ].filter(Boolean);
  };

  /* ------------------------------------------------------------------ first run: the school and the class */
  P.needsSetup = function () { return !S().filter("users", function (u) { return u.role === "teacher"; }).length; };
  P.seed = function (Store) {
    var put = function (c, r) { return Store.put(c, r, { silent: true }); };
    var T = (window.SCHOOL_CONFIG || {}).teacher || {};
    if (!Store.get("settings", "structure")) put("settings", { id: "structure", system: "ecdgrade", levelLabel: "Grade", levels: LEVELS, streamStyle: "colours", streams: ["Blue", "Green", "Red", "Yellow"] });
    if (!Store.get("settings", "primary")) put("settings", { id: "primary", areas: AREAS, bands: BANDS, year: String(A.date().getFullYear()), terms: T.terms || {} });
    if (!Store.get("settings", "branding")) put("settings", { id: "branding", name: T.name || "My School", shortName: T.shortName || "My School", motto: T.motto || "" });
  };
  var unnamed = function (n) { return n === "My School" || n === "My Primary School"; }; // the name before set-up
  /** The choice of how classes are named, and the class list that follows it (set-up and the first teacher's form). */
  P.systemFields = function (sysKey, level, names) {
    var sys = SYSTEMS[sysKey] || SYSTEMS.ecdgrade, none = !!(names && names.none) && level === ""; // (level "": no class of their own)
    return '<label class="field"><span>' + esc((names && names.system) || "Classes are named by") + '</span><select class="select" name="system" data-change="psys-pick">' +
      Object.keys(SYSTEMS).map(function (k) { return '<option value="' + k + '"' + (k === (SYSTEMS[sysKey] ? sysKey : "ecdgrade") ? " selected" : "") + ">" + esc(SYSTEMS[k].name) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>' + esc((names && names.level) || "Your class") + '</span><select class="select" name="level">' + ((names && names.none) ? '<option value=""' + (none ? " selected" : "") + ">" + esc(names.none) + "</option>" : "") +
      sys.levels.map(function (l) { return "<option" + (!none && l === (sys.levels.indexOf(level) >= 0 ? level : sys.def) ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>";
  };
  // a different naming chosen: the class list changes with it (what was typed on the form stays)
  A.act["psys-pick"] = function (el) {
    var sel = el.form && el.form.querySelector("select[name=level]"), sys = SYSTEMS[el.value] || SYSTEMS.ecdgrade;
    if (!sel) return;
    var none = sel.querySelector('option[value=""]');
    sel.innerHTML = (none ? none.outerHTML : "") + sys.levels.map(function (l) { return "<option" + (l === sys.def ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("");
  };
  /** The sign-in panel's own steps: set-up on a new device; teachers are chosen straight away (no student role). */
  P.loginStep = function (L, back, msg) {
    if (L.step === "role" || (L.step === "who" && P.needsSetup())) { L.step = P.needsSetup() ? "tsetup" : "who"; L.role = "teacher"; }
    if (L.step !== "tsetup") return null;
    var st = M.structure(), b = A.Theme.get();
    var opt = function (list, cur) { return list.map(function (x) { return "<option" + (x === cur ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); };
    return '<h2 style="font-size:24px">Set up School Assist Teacher</h2><p class="muted small mt-sm">Your school, your name and PIN, and your class. Everything stays on this device. You can change it all later in Settings.</p>' +
      '<form data-submit="tsetup" class="mt">' +
      '<label class="field"><span>School name</span><input class="input" name="school" value="' + esc(unnamed(b.name) ? "" : b.name) + '" placeholder="e.g. Sunrise School" autocomplete="organization"></label>' +
      '<label class="field"><span>Your name</span><input class="input" name="name" placeholder="e.g. Mrs T. Moyo" autocomplete="name"></label>' +
      '<div class="form-grid"><label class="field"><span>Your PIN (4 digits)</span><input class="input" name="pin" inputmode="numeric" maxlength="4" autocomplete="off"></label>' +
      '<label class="field"><span>Type it again</span><input class="input" name="pin2" inputmode="numeric" maxlength="4" autocomplete="off"></label>' +
      P.systemFields(P.system(), null) +
      '<label class="field"><span>Stream</span><input class="input" name="stream" value="Blue" placeholder="e.g. Blue, A, Lion"></label></div>' +
      '<label class="check mt"><input type="checkbox" name="sample" checked> Add 30 sample learners with a week of registers and some marks, to try it out (remove them later with one button)</label>' +
      msg + '<button class="btn btn-primary btn-lg btn-block mt" type="submit">' + I("check") + "Set up and sign in</button></form>" + (A.SchoolId ? A.SchoolId.joinLink() : "");
  };
  A.act.tsetup = function (form) {
    var f = UI.formData(form), err = "";
    if (f.school.trim().length < 3) err = "Enter the school's name.";
    else if (f.name.trim().length < 3) err = "Enter your name.";
    else if (!/^\d{4}$/.test(f.pin)) err = "Your PIN is 4 digits.";
    else if (f.pin !== f.pin2) err = "The two PINs are different.";
    if (err) { A.loginMessage(err); return; }
    var now = A.now(), b = S().get("settings", "branding") || { id: "branding" };
    P.applySystem(f.system);
    S().put("settings", Object.assign({}, b, { name: f.school.trim(), shortName: f.school.trim().replace(/\s+(primary|junior|high|secondary)?\s*school$/i, "") || f.school.trim() }));
    var me = S().put("users", { id: A.uid("t"), role: "teacher", name: f.name.trim(), title: "Teacher", isAdmin: true, staffNo: M.schoolAbbr(f.school.trim()) + "-AD1", subjects: "Class teacher" });
    M.setPin(me.id, f.pin, me.id);
    if (A.SchoolId) S().put("settings", { id: "school", schoolId: A.SchoolId.newId(), name: f.school.trim(), abbr: M.schoolAbbr(f.school.trim()), createdBy: me.id });
    var c = S().put("classes", { id: A.uid("cls"), homeroom: true, name: M.homeClassName(f.level, f.stream.trim()), level: f.level, stream: f.stream.trim() || null,
      subject: "Class", teacherId: me.id, studentIds: [], syllabusId: null, createdAt: now });
    if (f.sample) samplePupils(c, me);
    A.Theme.apply();
    A.loginDone("who");
    M.signIn(me.id);
    A.schoolFolder(me);
    if (A.LastUser) A.LastUser.set(me, {});
    location.hash = "#/t/home";
    A.render();
  };
  /** The set-up page (js/setup.js): the first teacher's own class, and sample pupils to try it with. */
  P.setupClass = function (me, level, stream, sample) {
    var c = S().put("classes", { id: A.uid("cls"), homeroom: true, name: M.homeClassName(level, stream || ""), level: level, stream: stream || null,
      subject: "Class", teacherId: me.id, studentIds: [], syllabusId: null });
    if (sample) samplePupils(c, me);
    return c;
  };
  P.LEVELS = LEVELS;
  A.act["pclass-new"] = function () { if (M.me().isAdmin) classModal(null); else A.act["pclass-choose"](); };
  /** o.keepPick: not made "my class" on this device (an admin adding a form's class from the timetable); o.after(rec). */
  function classModal(c, o) {
    o = o || {};
    if (!M.me().isAdmin) return A.act["pclass-choose"](); // only admins make and change classes
    var me = M.me(), st = M.structure(), teachers = S().filter("users", function (u) { return u.role === "teacher"; });
    c = c || { level: "Grade 4", stream: "", teacherId: me.id };
    UI.modal({
      title: c.id ? "Edit class" : "New class",
      body: '<form id="pcls" class="form-grid"><label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option" + (l === c.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Stream</span><input class="input" name="stream" value="' + esc(c.stream || "") + '" placeholder="e.g. Blue"></label>' +
        (me.isAdmin ? '<label class="field full"><span>Class teacher</span><select class="select" name="teacherId"><option value=""' + (c.teacherId ? "" : " selected") + ">No class teacher yet</option>" + teachers.map(function (t) { return '<option value="' + t.id + '"' + (t.id === c.teacherId ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select></label>" : "") + "</form>",
      foot: (c.id ? [{ label: "Delete class", cls: "btn-danger", onClick: function () {
        var pupils = P.pupils(c), n = pupils.length;
        return UI.confirm("Delete " + c.name + "?" + (n ? " Its " + n + " pupil" + (n === 1 ? "" : "s") + " leave with it." : "") + " Its timetable goes too; registers and marks are kept in old reports.", { danger: true, ok: "Delete" }).then(function (ok) {
          if (!ok) return false;
          // pupils in no other class leave the school's lists, as "Remove from class" does
          var others = {};
          S().filter("classes", function (x) { return x.id !== c.id; }).forEach(function (x) { (x.studentIds || []).forEach(function (id) { others[id] = 1; }); });
          pupils.forEach(function (u) { if (!others[u.id]) S().patch("users", u.id, { leftAt: A.now() }); });
          S().filter("timetable", function (s) { return s.classId === c.id; }).forEach(function (s) { S().remove("timetable", s.id); });
          S().remove("classes", c.id);
          try { if (localStorage.getItem(pickKey(me)) === c.id) localStorage.removeItem(pickKey(me)); } catch (e) { /* this device only */ }
          UI.toast(c.name + " deleted"); A.render();
        });
      } }] : []).concat([{ label: "Cancel" }, { label: c.id ? "Save" : "Create class", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#pcls"));
        var twin = P.sameClass(f.level, f.stream, c.id);
        if (twin) { UI.toast(twin.name + " already exists. Use that class, or give this one another stream.", "bad"); return false; }
        var rec = S().put("classes", Object.assign({}, c, { homeroom: true, level: f.level, stream: f.stream.trim() || null, name: M.homeClassName(f.level, f.stream.trim()),
          subject: "Class", teacherId: f.teacherId || null, studentIds: c.studentIds || [], syllabusId: null }));
        // the School edition: the students who signed up for this form and stream join it (one with no class yet)
        if (P.withStudents) rec = P.gather(rec);
        if (!o.keepPick) try { localStorage.setItem(pickKey(me), rec.id); } catch (e) { /* this device only */ }
        UI.toast(c.id ? "Class saved" : rec.name + " created");
        if (o.after) o.after(rec); else A.render();
      } }]),
    });
  }
  /** u joins class c (the School edition: a student who signed up, put in their class): out of any other class of the
      school's, and their form and stream become c's. */
  P.placeStudent = function (u, c) {
    if (!u || !c || !c.homeroom) return;
    homerooms().forEach(function (x) { if (x.id !== c.id && (x.studentIds || []).indexOf(u.id) >= 0) S().patch("classes", x.id, { studentIds: x.studentIds.filter(function (y) { return y !== u.id; }) }); });
    if ((c.studentIds || []).indexOf(u.id) < 0) S().patch("classes", c.id, { studentIds: (c.studentIds || []).concat([u.id]) });
    if (u.level !== c.level || (u.stream || null) !== (c.stream || null)) S().patch("users", u.id, { level: c.level, stream: c.stream || null });
  };
  /** A student whose form or stream an admin changed (Settings → People): into the school's class of that form and
      stream, or out of their old one when the school has none. */
  P.followClass = function (u) {
    var key = function (s) { return String(s || "").trim().toLowerCase(); };
    var to = homerooms().filter(function (c) { return c.level === u.level && key(c.stream) === key(u.stream); })[0];
    if (to) return P.placeStudent(u, to);
    homerooms().forEach(function (x) { if ((x.studentIds || []).indexOf(u.id) >= 0 && (x.level !== u.level || key(x.stream) !== key(u.stream))) S().patch("classes", x.id, { studentIds: x.studentIds.filter(function (y) { return y !== u.id; }) }); });
  };
  /** The students of c's form and stream who are in none of the school's classes yet join it (the School edition). */
  P.gather = function (c) {
    var key = function (s) { return String(s || "").trim().toLowerCase(); }, inOne = {};
    homerooms().forEach(function (x) { (x.studentIds || []).forEach(function (id) { inOne[id] = 1; }); });
    var add = M.students().filter(function (u) { return !inOne[u.id] && u.status !== "pending" && u.status !== "declined" && u.level === c.level && u.stream && key(u.stream) === key(c.stream); }).map(function (u) { return u.id; });
    return add.length ? S().patch("classes", c.id, { studentIds: (c.studentIds || []).concat(add) }) : c;
  };
  A.act["pclass-edit"] = function () { var me = M.me(), c = P.cls(me); if (!me.isAdmin) A.act["pclass-choose"](); else if (c) classModal(c); };
  /** Another class of the same form or grade and stream (case and spaces aside): a second "Form 1 Green" is refused. */
  P.sameClass = function (level, stream, exceptId) {
    var key = function (s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); };
    return homerooms().filter(function (x) { return x.id !== exceptId && x.level === level && key(x.stream) === key(stream); })[0] || null;
  };

  /* sample pupils: names, birthdays for the grade, a week of registers and some marks */
  var FIRST_M = ["Tanaka", "Tinashe", "Kudakwashe", "Takudzwa", "Farai", "Tawanda", "Simbarashe", "Tatenda", "Munashe", "Kundai", "Ropafadzo", "Nkosana", "Sipho", "Blessing", "Tafara"];
  var FIRST_F = ["Rufaro", "Nyasha", "Tariro", "Ruvimbo", "Chiedza", "Vimbai", "Rumbidzai", "Anesu", "Thandiwe", "Nokuthula", "Tsitsi", "Chipo", "Rutendo", "Fadzai", "Mufaro"];
  var SURN = ["Moyo", "Ncube", "Dube", "Sibanda", "Chikwanha", "Mutasa", "Banda", "Chirwa", "Mhlanga", "Nyathi", "Mpofu", "Zhou", "Gumbo", "Marufu", "Ndlovu", "Matare", "Shumba", "Mapfumo", "Chigumba", "Makoni"];
  /** About how old a class's learners are: ECD A 4, ECD B 5, Grade 1 6 … Grade 7 12, Form 1 13 … Upper 6 18. */
  function levelAge(level) {
    var s = String(level || ""), n = parseInt((/\d+/.exec(s) || ["0"])[0], 10);
    if (/^ecd\s*a/i.test(s)) return 4; if (/^ecd/i.test(s)) return 5;
    if (/^grade/i.test(s) && n) return 5 + n; if (/^form/i.test(s) && n) return 12 + n;
    if (/^lower/i.test(s)) return 17; if (/^upper/i.test(s)) return 18;
    return 9;
  }
  /** o: { seed, offset } (the demo school's classes each get their own names) */
  function samplePupils(c, me, o) {
    o = o || {};
    var rand = A.rng(o.seed || 4096), now = A.now(), ids = [], ageYears = levelAge(c.level), off = o.offset || 0;
    for (var i = 0; i < 30; i++) {
      var girl = i % 2 === 1, first = (girl ? FIRST_F : FIRST_M)[(Math.floor(i / 2) + off) % 15], last = SURN[(i * 7 + off * 3) % SURN.length];
      var dob = new Date(A.date().getFullYear() - ageYears - (rand() < 0.3 ? 1 : 0), Math.floor(rand() * 12), 1 + Math.floor(rand() * 27));
      var u = S().put("users", { id: A.uid("p"), role: "student", pupil: true, sample: true, name: first + " " + last, sex: girl ? "F" : "M", dob: A.isoDate(dob.getTime()),
        guardian: (rand() < 0.5 ? "Mr " : "Mrs ") + last, phone: "077" + String(1000000 + Math.floor(rand() * 8999999)), level: c.level, stream: c.stream, health: i === 4 ? "Asthma: has an inhaler in her bag" : "" }, { silent: true });
      ids.push(u.id);
    }
    S().put("classes", Object.assign({}, c, { studentIds: ids }), { silent: true });
    // the last five school days' registers
    var d = A.startOfDay(now), done = 0;
    while (done < 5) {
      d -= A.DAY;
      if (!M.isSchoolDay(d)) continue;
      var marks = {};
      ids.forEach(function (id) { var r = rand(); marks[id] = r < 0.88 ? "P" : r < 0.94 ? "L" : r < 0.98 ? "A" : "E"; });
      S().put("attendance", { id: "att_" + c.id + "_" + A.isoDate(d), classId: c.id, date: A.isoDate(d), marks: marks, takenBy: me.id }, { silent: true });
      done++;
    }
    // two marked pieces of work in four of the school's learning areas (or subjects)
    var conf = P.conf(), term = conf.term, ar = conf.areas, has = function (n) { return ar.indexOf(n) >= 0; };
    var work = has("Science and Technology") && has("Social Science")
      ? [["Mathematics", "Mental maths test", 20], ["Mathematics", "Fractions exercise", 10], ["English", "Spelling test", 20], ["English", "Comprehension", 15],
        ["Science and Technology", "Plants test", 25], ["Science and Technology", "CALA: growing beans", 30], ["Indigenous Language", "Reading aloud", 10], ["Social Science", "Map work", 20]]
      : [[ar[1] || ar[0], "Test 1", 20], [ar[1] || ar[0], "Exercise 1", 10], [ar[0], "Comprehension", 15], [ar[0], "Composition", 20],
        [ar[2] || ar[0], "Topic test", 25], [ar[2] || ar[0], "Practical project", 30], [ar[3] || ar[0], "Exercise 1", 10], [ar[4] || ar[0], "Test 1", 20]];
    work.filter(function (a) { return has(a[0]); }).forEach(function (a, k) {
      var marks2 = {}, skill = {};
      ids.forEach(function (id, n) { skill[id] = skill[id] || 0.45 + ((n * 37) % 50) / 100; marks2[id] = Math.max(0, Math.min(a[2], Math.round(a[2] * (skill[id] + (rand() - 0.5) * 0.3)))); });
      S().put("assessments", { id: A.uid("as"), classId: c.id, area: a[0], title: a[1], kind: /test/i.test(a[1]) ? "Test" : /CALA/.test(a[1]) ? "CALA" : "Exercise",
        date: A.isoDate(now - (k + 1) * 3 * A.DAY), outOf: a[2], year: conf.year, term: term, marks: marks2, sample: true }, { silent: true });
    });
    S().changed("users");
  }

  /**
   * The demo school (the set-up page's "Open the demo school"): a head and two class teachers, three classes of 30
   * learners each with a week of registers and marks, end-of-term marks and report comments for the head's class
   * (so report cards can be made). Named by Grades (with ECD), or by Forms for a high school. Every PIN is 1234.
   * It never goes to a school hub (meta.demo, js/setup.js).
   */
  P.DEMO_PIN = "1234";
  P.demo = function (Store, key) {
    key = SYSTEMS[key] ? key : "ecdgrade";
    var form = key === "form", put = function (c, r) { return Store.put(c, r, { silent: true }); };
    Store.state.meta.demo = true;
    put("settings", { id: "branding", name: form ? "Riverside High School" : "Riverside School", shortName: form ? "Riverside High" : "Riverside", motto: "Learn, grow, lead" });
    P.applySystem(key, Store);
    P.seed(Store);
    var conf = P.conf(), lv = SYSTEMS[key].levels;
    var staff = [{ id: "t_head", name: "Mrs R. Dube", title: "Head", isAdmin: true, staffNo: "RS-AD1" },
      { id: "t_sibanda", name: "Mr K. Sibanda", title: "Class teacher", staffNo: "RS-TC1" }, { id: "t_moyo", name: "Ms T. Moyo", title: "Class teacher", staffNo: "RS-TC2" }];
    // the two class teachers each teach two subjects (they record those end-of-term marks, in every class); the head, any
    var ar = conf.areas;
    staff[1].areas = [ar[0], ar[1]]; staff[2].areas = [ar[2], ar[3]];
    staff.forEach(function (t) { put("users", Object.assign({ role: "teacher", subjects: t.areas ? t.areas.join(", ") : "Head" }, t)); M.setPin(t.id, P.DEMO_PIN, t.id); });
    // three classes: a younger, a middle and an older one
    var picks = key === "ecd" ? [["ECD A", "Blue"], ["ECD A", "Green"], ["ECD B", "Blue"]]
      : [[lv[Math.min(1, lv.length - 1)], "Blue"], [lv[Math.floor(lv.length / 2)], "Green"], [lv[lv.length - (form ? 3 : 1)], "Red"]];
    var classes = picks.map(function (p, i) {
      var c = put("classes", { id: "cls_demo_" + (i + 1), homeroom: true, name: M.homeClassName(p[0], p[1]), level: p[0], stream: p[1], subject: "Class", teacherId: staff[i].id, studentIds: [], syllabusId: null });
      samplePupils(c, staff[i], { seed: 4096 + i * 977, offset: i * 5 });
      return Store.get("classes", c.id);
    });
    // the head's class: end-of-term marks in four learning areas (or subjects), and the class teacher's comments
    var head = classes[0], slug = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x"; };
    var rand = A.rng(733), year = conf.year, term = conf.term;
    conf.areas.slice(0, 4).forEach(function (area, k) {
      (head.studentIds || []).forEach(function (sid, n) {
        var skill = 0.45 + ((n * 37 + k * 11) % 50) / 100, mark = Math.max(5, Math.min(100, Math.round(100 * (skill + (rand() - 0.5) * 0.25))));
        put("reportmarks", { id: "rm_" + year + "_t" + term + "_" + head.id + "_" + slug(area) + "_" + sid, year: String(year), term: Number(term), classId: head.id, subject: area, studentId: sid,
          mark: mark, outOf: 100, comment: mark >= 80 ? "Excellent" : mark >= 65 ? "Very good" : mark >= 50 ? "Good" : "Needs to work harder", teacherId: head.teacherId });
      });
    });
    (head.studentIds || []).forEach(function (sid, n) {
      put("reports", { id: "rep_" + sid + "_" + year + "_t" + term, pupilId: sid, year: String(year), term: Number(term), teacherComment: COMMENTS[n % COMMENTS.length],
        headComment: n % 3 === 0 ? "Keep working hard." : "", by: head.teacherId });
    });
  };

  /* ------------------------------------------------------------------ a high school's words */
  // with Forms the app says students and subjects; every screen, dialog and message is reworded as it is shown
  // (what people type, in inputs and text boxes, is never touched)
  var WORDS = [[/\bLearning areas\b/g, "Subjects"], [/\bLearning area\b/g, "Subject"], [/\blearning areas\b/g, "subjects"], [/\blearning area\b/g, "subject"],
    [/\bLEARNING AREAS?\b/g, function (m) { return /S$/.test(m) ? "SUBJECTS" : "SUBJECT"; }],
    [/\bPupils\b/g, "Students"], [/\bPupil\b/g, "Student"], [/\bpupils\b/g, "students"], [/\bpupil\b/g, "student"], [/\bPUPILS?\b/g, function (m) { return /S$/.test(m) ? "STUDENTS" : "STUDENT"; }]];
  var reword = function (s) { for (var i = 0; i < WORDS.length; i++) s = s.replace(WORDS[i][0], WORDS[i][1]); return s; };
  P.reword = function (s) { return P.isForm() ? reword(String(s == null ? "" : s)) : s; };
  var KEEP = { TEXTAREA: 1, INPUT: 1, SCRIPT: 1, STYLE: 1, OPTION: 1 };
  function rewordTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { var p = root.parentNode; if (p && !KEEP[p.nodeName] && !p.isContentEditable && /pupil|learning area/i.test(root.nodeValue)) { var v = reword(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
    if (root.nodeType !== 1 || KEEP[root.nodeName] && root.nodeName !== "INPUT" && root.nodeName !== "TEXTAREA") return;
    ["placeholder", "title", "aria-label"].forEach(function (a) { var v = root.getAttribute && root.getAttribute(a); if (v && /pupil|learning area/i.test(v)) root.setAttribute(a, reword(v)); });
    if (KEEP[root.nodeName]) return;
    for (var c = root.firstChild; c; c = c.nextSibling) rewordTree(c);
  }
  if (typeof MutationObserver !== "undefined") {
    var watch = function () {
      new MutationObserver(function (list) {
        if (!P.isForm()) return;
        list.forEach(function (m) { if (m.type === "characterData") rewordTree(m.target); else Array.prototype.forEach.call(m.addedNodes, rewordTree); });
        if (/pupil|learning area/i.test(document.title)) document.title = reword(document.title);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
  }

  /* ------------------------------------------------------------------ View other classes
     Every teacher and admin sees the school's classes, form by form, each with its class teacher and students; an admin
     also sees a class's marks and syllabus. Nothing is changed here: a class's own teachers change its students, marks
     and syllabus (1.6.2, ECS: admins used to switch to any class on Today, in the mark book and in reports). Admins make
     and edit the classes here. */
  A.route("t/others", function (p, q, me) {
    var all = homerooms(), levels = M.structure().levels.slice();
    all.forEach(function (c) { var L = c.level || "No form"; if (levels.indexOf(L) < 0) levels.push(L); });
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">View other classes</h2><p class="muted">The school\'s classes, form by form, with their class teachers and students</p></div></div>';
    if (!all.length && !me.isAdmin) return { title: "View other classes", html: html + '<div class="card">' + UI.empty("users", "No classes yet", "The head creates the school's classes.") + "</div>" };
    levels.forEach(function (L) {
      var list = all.filter(function (c) { return (c.level || "No form") === L; });
      if (!list.length && !me.isAdmin) return;
      html += '<div class="card mb"><div class="card-head">' + I("users") + "<h3>" + esc(L) + '</h3><span class="sub">' + list.length + " class" + (list.length === 1 ? "" : "es") + "</span>" +
        (me.isAdmin && L !== "No form" ? '<span class="grow"></span><button class="btn btn-sm" data-act="pclass-new-level" data-level="' + esc(L) + '">' + I("plus") + "New class</button>" : "") + "</div>" +
        (list.length ? list.map(function (c) {
          var t = M.user(c.teacherId), n = P.pupils(c).length;
          return '<a class="list-row click" href="#/t/others/' + c.id + '"><div class="grow"><div class="title">' + esc(c.name) + (c.teacherId === me.id ? ' <span class="badge brand">Your class</span>' : "") + "</div>" +
            '<div class="meta"><span>' + (t ? "Class teacher: " + esc(t.name) : "No class teacher yet") + '</span><span class="sep"></span><span>' + n + " student" + (n === 1 ? "" : "s") + "</span></div></div>" + I("right") + "</a>";
        }).join("") : '<div class="card-body muted small">No class yet.</div>') + "</div>";
    });
    return { title: "View other classes", html: html };
  }, { role: "teacher" });
  /** The subjects of a class: those with end-of-term marks or Mark book work there this term, or taught there. */
  function classAreas(c, conf, term) {
    var got = {}, who = A.Tracker ? A.Tracker.whoTeaches() : {};
    S().filter("reportmarks", function (r) { return r.classId === c.id && r.subject && r.mark != null && String(r.year) === String(conf.year) && Number(r.term) === term; }).forEach(function (r) { got[r.subject] = 1; });
    S().filter("assessments", function (a) { return a.classId === c.id && String(a.year) === String(conf.year) && Number(a.term) === term; }).forEach(function (a) { got[a.area] = 1; });
    Object.keys(who).forEach(function (k) { var i = k.indexOf("|"); if (k.slice(0, i) === c.id) got[k.slice(i + 1)] = 1; });
    return conf.areas.filter(function (a) { return got[a]; }).concat(Object.keys(got).filter(function (a) { return conf.areas.indexOf(a) < 0; }));
  }
  A.route("t/others/:id", function (p, q, me) {
    var c = M.cls(p.id);
    if (!c || !c.homeroom) return { redirect: "#/t/others" };
    var t = M.user(c.teacherId), kids = P.pupils(c), conf = P.conf(), term = Number(q.term) || conf.term, v = me.isAdmin && /^(marks|syllabus)$/.test(q.v || "") ? q.v : "students";
    var base = "#/t/others/" + c.id;
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">' + esc(classLabel(c)) + '</h2><p class="muted">' + (t ? "Class teacher: " + esc(t.name) : "No class teacher yet") + " · " + kids.length + " student" + (kids.length === 1 ? "" : "s") + "</p></div>" +
      (me.isAdmin ? '<div class="row wrap"><button class="btn" data-act="pclass-edit-id" data-id="' + c.id + '">' + I("edit") + "Edit the class</button></div>" : "") + "</div>";
    html += '<div class="callout mb">' + I("eye") + "<div>You can look: " + (c.teacherId === me.id ? "this is your class (change it in My class)." : "only " + esc(c.name) + "'s own teachers change its students, marks and syllabus.") + "</div></div>";
    if (me.isAdmin) html += '<div class="pill-tabs">' + [["students", "Students"], ["marks", "Marks"], ["syllabus", "Syllabus"]].map(function (x) {
      return '<button class="' + (v === x[0] ? "on" : "") + '" data-act="goto" data-href="' + base + (x[0] === "students" ? "" : "?v=" + x[0] + "&term=" + term) + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    if (v === "students") {
      html += kids.length ? '<div class="card table-wrap"><table class="table"><thead><tr><th class="num">No.</th><th>Student</th><th>Sex</th><th>Student ID</th><th class="num">Age</th></tr></thead><tbody>' + kids.map(function (u, i) {
        return '<tr><td class="num tnum">' + (i + 1) + "</td><td><b>" + esc(u.name) + "</b></td><td>" + esc(sexName(u.sex)) + '</td><td class="small">' + esc(u.studentNo || "") + '</td><td class="num tnum">' + (age(u.dob) == null ? "—" : age(u.dob)) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="card">' + UI.empty("users", "No students yet", "") + "</div>";
      return { title: c.name, crumbs: [{ label: "View other classes", href: "#/t/others" }, { label: c.name }], html: html };
    }
    var areas = classAreas(c, conf, term), termSel = '<select class="select sm" style="width:auto" data-change="pothers-term" data-href="' + base + "?v=" + v + '" aria-label="Term">' + [1, 2, 3].map(function (x) { return '<option value="' + x + '"' + (x === term ? " selected" : "") + ">Term " + x + "</option>"; }).join("") + "</select>";
    if (v === "marks") {
      var sc = P.scores(c, conf.year, term), slug = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x"; };
      var eot = function (u, a) { var r = S().get("reportmarks", "rm_" + conf.year + "_t" + term + "_" + c.id + "_" + slug(a) + "_" + u.id); return r && r.mark != null && Number(r.outOf) > 0 ? Math.round(Number(r.mark) / Number(r.outOf) * 100) : null; };
      html += '<div class="row wrap mb">' + termSel + "</div>";
      html += '<div class="card table-wrap mb"><div class="card-head">' + I("award") + "<h3>End of term marks · Term " + term + '</h3><span class="sub">%</span></div>' + (areas.length && kids.length ? '<table class="table pmb-grid"><thead><tr><th>Student</th>' +
        areas.map(function (a) { return '<th class="num" title="' + esc(a) + '">' + esc(short(a)) + "</th>"; }).join("") + "</tr></thead><tbody>" + kids.map(function (u) {
          return "<tr><td>" + esc(u.name) + "</td>" + areas.map(function (a) { var x = eot(u, a); return '<td class="num tnum">' + (x == null ? "—" : x) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table>" : '<div class="card-body muted small">No end-of-term marks yet.</div>') + "</div>";
      html += '<div class="card"><div class="card-head">' + I("edit") + "<h3>Mark book work · Term " + term + "</h3></div>" + (sc.list.length ? sc.list.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (a) {
        var n = kids.filter(function (u) { var x = (a.marks || {})[u.id]; return x != null && x !== ""; }).length, by = M.user(a.createdBy);
        return '<a class="list-row click" href="#/t/assessment/' + a.id + '"><div class="grow"><div class="title">' + esc(a.title) + '</div><div class="meta"><span>' + esc(a.area) + "</span>" + (by ? '<span class="sep"></span><span>' + esc(by.name) + "</span>" : "") +
          '<span class="sep"></span><span>out of ' + a.outOf + '</span><span class="sep"></span><span>' + n + " of " + kids.length + " marked</span></div></div>" + I("right") + "</a>";
      }).join("") : '<div class="card-body muted small">No work marked this term.</div>') + "</div>";
    } else {
      html += '<div class="row wrap mb">' + termSel + "</div>";
      html += '<div class="card">' + (areas.length && A.Tracker ? areas.map(function (a) {
        var st = A.Tracker.stats(c, a, conf, term), who = (A.Tracker.whoTeaches()[c.id + "|" + a] || []).map(function (id) { return (M.user(id) || {}).name; }).filter(Boolean);
        return '<a class="list-row click" href="#/t/tracker?c=' + c.id + "&s=" + encodeURIComponent(a) + '"><div class="grow"><div class="title">' + esc(a) + '</div><div class="meta"><span>' + esc(who.join(", ") || "No teacher yet") + "</span>" +
          (st.none ? '<span class="sep"></span><span>No syllabus yet</span>' : '<span class="sep"></span><span>Term ' + term + ": " + (st.termPlanned ? st.termDone + " of " + st.termPlanned + " topics" : "none planned") + '</span><span class="sep"></span><span>Whole syllabus ' + st.done + " of " + st.total + "</span>") + "</div></div>" +
          A.Tracker.chip(st.status) + "</a>";
      }).join("") : '<div class="card-body muted small">No subjects taught here yet.</div>') + "</div>";
    }
    return { title: c.name, crumbs: [{ label: "View other classes", href: "#/t/others" }, { label: c.name }], html: html };
  }, { role: "teacher" });
  A.act["pothers-term"] = function (el) { location.hash = el.getAttribute("data-href") + "&term=" + el.value; };
  A.act["pclass-edit-id"] = function (el) { var c = M.cls(el.getAttribute("data-id")); if (c && M.me().isAdmin) classModal(c, { keepPick: true }); };
  A.act["pclass-new-level"] = function (el) { if (M.me().isAdmin) classModal({ level: el.getAttribute("data-level"), stream: "", teacherId: null }, { keepPick: true }); };

  /* ------------------------------------------------------------------ Today */
  /** Today's lessons, from the timetable ("" when there are none). */
  function lessonsCard(me) {
    var lessons = P.todayLessons(me);
    return lessons.length ? '<div class="card mb"><div class="card-head">' + I("grid") + "<h3>Today's lessons</h3><span class=\"grow\"></span><a class=\"btn btn-sm btn-ghost\" href=\"#/t/timetable\">Full week " + I("right") + "</a></div>" +
      lessons.map(function (x) { return '<div class="list-row"><div class="tt-time"><b>' + x.p.start + "</b><span>" + x.p.end + '</span></div><div class="grow"><div class="title">' + esc(x.e.s.area) + '</div><div class="meta"><span>' + esc(x.e.c.name) + (x.e.s.room ? " · " + esc(x.e.s.room) : "") + "</span></div></div></div>"; }).join("") + "</div>" : "";
  }
  /** The School edition: students' work waiting to be marked in the teacher's subject classes ("" when they have none). */
  function workCard(me) {
    var classes = P.withStudents ? M.myClasses(me) : [], rows = [];
    if (!classes.length) return "";
    classes.forEach(function (c) {
      M.tasksForClass(c.id).forEach(function (t) { var n = M.taskCounts(t), w = Math.max(0, n.submitted - n.graded); if (w) rows.push({ t: t, c: c, w: w }); });
    });
    return '<div class="card mb"><div class="card-head">' + I("tasks") + "<h3>Students' work</h3><span class=\"grow\"></span><a class=\"btn btn-sm btn-ghost\" href=\"#/t/classes\">Subject classes " + I("right") + "</a></div>" +
      (rows.length ? rows.slice(0, 6).map(function (x) {
        return '<a class="list-row click" href="#/t/task/' + x.t.id + '"><div class="grow"><div class="title">' + esc(x.t.title) + '</div><div class="meta"><span>' + esc(M.className(x.c)) + "</span></div></div>" +
          '<span class="badge warn">' + x.w + " to mark</span></a>";
      }).join("") : '<div class="card-body muted small">Nothing waiting to be marked in your ' + classes.length + " subject class" + (classes.length === 1 ? "" : "es") + ".</div>") + "</div>";
  }
  A.route("t/home", function (p, q, me) {
    var nc = needClass(me, "Today"); if (nc.view) return { title: nc.view.title, html: A.nameNudge(me) + P.requestsNote(me) + nc.view.html.replace(/^<div class="card">/, '<div class="card mb">') + lessonsCard(me) + workCard(me) };
    var c = nc.c, kids = P.pupils(c), today = A.isoDate(), reg = M.register(c.id, today), conf = P.conf();
    var boys = kids.filter(function (u) { return u.sex === "M"; }).length, girls = kids.filter(function (u) { return u.sex === "F"; }).length;
    var week = M.recentRegisters(c.id, 5), wk = { p: 0, n: 0 };
    week.forEach(function (r) { Object.keys(r.marks || {}).forEach(function (id) { var v = r.marks[id]; if (v === "E") return; wk.n++; if (v === "P" || v === "L") wk.p++; }); });
    var asTerm = S().filter("assessments", function (a) { return a.classId === c.id && String(a.year) === conf.year && Number(a.term) === conf.term; });
    var hour = A.date().getHours(), hi = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    var school = M.isSchoolDay(A.now());
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:24px">' + hi + ", " + esc(greetName(me.name)) + '</h2><p class="muted">' + esc(A.fmtDateLong(A.now())) + " · " + esc(c.name) + " · Term " + conf.term + " " + esc(conf.year) + "</p></div>" + classSwitch(me, c, "home") + "</div>";
    html += A.nameNudge(me) + P.requestsNote(me);
    html += school && !reg ? '<div class="callout warn mb">' + I("clock") + '<div class="grow"><b>Today\'s register isn\'t taken yet.</b> It takes a minute.</div><a class="btn btn-primary" href="#/t/register">' + I("check") + "Take the register</a></div>"
      : reg ? '<div class="callout mb">' + I("checkCircle") + "<div>Today's register is done: " + count(reg.marks, "P", "L", kids) + " of " + kids.length + " in class.</div></div>" : "";
    html += '<div class="grid g-4 mb">' + UI.stat("users", kids.length, "Pupils", false, boys + " boys, " + girls + " girls") +
      UI.stat("check", wk.n ? Math.round(wk.p / wk.n * 100) + "%" : "—", "Attendance, last 5 days") +
      UI.stat("edit", asTerm.length, "Marked this term") +
      UI.stat("cap", kids.filter(function (u) { return age(u.dob) != null; }).length ? Math.round(A.avg(kids.map(function (u) { return age(u.dob); }).filter(function (x) { return x != null; })) * 10) / 10 : "—", "Average age") + "</div>";
    html += lessonsCard(me) + workCard(me);
    html += '<div class="grid g-main"><div class="card"><div class="card-head">' + I("bulb") + "<h3>Quick actions</h3></div><div class=\"card-body pquick\">" +
      [["#/t/register", "check", "Take the register"], ["#/t/markbook?new=1", "edit", "Enter marks"], ["#/t/timetable", "grid", "Timetable"], ["#/t/reports", "file", "Term reports"], ["#/t/schemes", "book", "Scheme of work"], ["#/t/pupils?add=1", "plus", "Add pupils"]].map(function (x) {
        return '<a class="pquick-btn" href="' + x[0] + '">' + I(x[1]) + "<span>" + esc(x[2]) + "</span></a>";
      }).join("") + "</div></div>";
    // birthdays in the next week
    var soon = kids.map(function (u) { return { u: u, d: nextBirthday(u.dob) }; }).filter(function (x) { return x.d != null && x.d <= 7; }).sort(function (a, b) { return a.d - b.d; });
    html += '<div class="card"><div class="card-head">' + I("award") + "<h3>Birthdays this week</h3></div>" + (soon.length ? soon.map(function (x) {
      return '<a class="list-row click" href="#/t/pupil/' + x.u.id + '">' + A.avatar(x.u, "sm") + '<div class="grow"><div class="title">' + esc(x.u.name) + '</div><div class="meta">' +
        (x.d === 0 ? "<b>Today</b>" : x.d === 1 ? "Tomorrow" : "In " + x.d + " days") + " · turns " + ((age(x.u.dob) || 0) + (x.d === 0 ? 0 : 1)) + "</div></div></a>";
    }).join("") : '<div class="card-body muted small">No birthdays in the next 7 days.</div>') + "</div></div>";
    return { title: "Today", html: html };
  }, { role: "teacher" });
  /* ---- Subjects and classes. Only an admin changes the subjects a teacher teaches and the classes they teach, and makes
     someone a class teacher (as in Settings → People). A teacher asks (user.areasAsked, classIdsAsked; areasNew: a subject
     the school doesn't have yet; homeAsk: the class they would be the class teacher of) and an admin agrees or says no, in
     My subjects (js/tracker.js). The hub keeps teachers' own devices from changing these themselves (hub-access.cjs). */
  function staffTeachers() {
    return S().filter("users", function (u) { return u.role === "teacher" && u.status !== "pending" && u.status !== "declined" && !u.leftAt; })
      .sort(P.byRank);
  }
  /** Staff in the school's order: by their place in the hierarchy (A.rank), admins first among equals, then by name. */
  P.byRank = function (a, b) { return A.rank(a.title) - A.rank(b.title) || (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0) || a.name.localeCompare(b.name); };
  P.staffTeachers = staffTeachers;
  var areaBadges = function (list, none) { return list.length ? list.map(function (a) { return '<span class="badge">' + esc(a) + "</span>"; }).join(" ") : '<span class="muted small">' + esc(none) + "</span>"; };
  P.areaBadges = areaBadges;
  var asks = function (u) { return Array.isArray(u.areasAsked) || Array.isArray(u.classIdsAsked) || (u.areasNew || []).length > 0 || !!u.homeAsk; };
  P.asks = asks;
  P.asking = function () { return staffTeachers().filter(asks); };
  var known = function (xs) { var all = P.conf().areas; return (xs || []).filter(function (a) { return all.indexOf(a) >= 0; }); };
  var classNames = function (ids) { return (ids || []).map(function (id) { var c = S().get("classes", id); return c && !c._deleted ? classLabel(c) : null; }).filter(Boolean); };
  /** What teachers have asked, for an admin to agree to or not ("" when nothing is waiting). */
  P.requestsCard = function (me) {
    var asked = me.isAdmin ? P.asking() : [];
    if (!asked.length) return "";
    return '<div class="card mb" id="p-requests"><div class="card-head">' + I("inbox") + '<h3>Requests from teachers</h3><span class="sub">' + asked.length + '</span></div><div class="card-body" style="padding-bottom:0">' + asked.map(function (u) {
      var bits = [];
      if (u.homeAsk) {
        var hc = S().get("classes", u.homeAsk), ht = hc && M.user(hc.teacherId);
        bits.push("<div>asks to be the class teacher of <b>" + esc(hc && !hc._deleted ? classLabel(hc) : "a class that is gone") + "</b>" +
          (ht && ht.id !== u.id ? ' <span class="small muted">(now ' + esc(ht.name) + "'s class: Agree makes it " + esc(u.name) + "'s, its pupils and records with it)</span>" : "") +
          homerooms().filter(function (x) { return x.teacherId === u.id && x.id !== u.homeAsk; }).map(function (x) { return '<div class="small muted">' + esc(x.name) + ", their class now, is then left without a class teacher.</div>"; }).join("") + "</div>");
      }
      if (Array.isArray(u.areasAsked)) bits.push('<div class="mt-sm">asks to teach ' + areaBadges(known(u.areasAsked), "no subjects") + '<div class="small muted mt-sm">Now: ' + esc(known(u.areas).join(", ") || "none") + "</div></div>");
      if (Array.isArray(u.classIdsAsked)) bits.push('<div class="mt-sm">' + (Array.isArray(u.areasAsked) ? "" : "asks to teach ") + "in " + esc(classNames(u.classIdsAsked).join(", ") || "no class of their choosing") + "</div>");
      if ((u.areasNew || []).length) bits.push('<div class="mt-sm">' + (bits.length ? "and also teaches " : "teaches ") + areaBadges(u.areasNew, "") + ", which " + (u.areasNew.length === 1 ? "isn't one" : "aren't") + " of the school's subjects yet. Agree adds " + (u.areasNew.length === 1 ? "it" : "them") + ".</div>");
      return '<div class="callout mb">' + I("info") + '<div class="grow"><b>' + esc(u.name) + "</b> " + bits.join("") + "</div>" +
        '<div class="row"><button class="btn btn-sm btn-ghost" data-act="psubj-no" data-id="' + u.id + '">Say no</button>' +
        '<button class="btn btn-sm btn-primary" data-act="psubj-yes" data-id="' + u.id + '">' + I("check") + "Agree</button></div></div>";
    }).join("") + "</div></div>";
  };
  /** On Today, for an admin: a line saying requests are waiting, and where. */
  P.requestsNote = function (me) {
    var n = me.isAdmin ? P.asking().length : 0;
    return n ? '<div class="callout mb">' + I("inbox") + '<div class="grow"><b>' + n + (n === 1 ? " teacher is" : " teachers are") + " waiting for an answer</b> about their subjects, classes or class.</div>" +
      '<a class="btn btn-sm btn-primary" href="#/t/subjects">Open My subjects</a></div>' : "";
  };
  /** The school's subjects and who teaches each one (My subjects, for every teacher); an admin changes a teacher's
      subjects and classes from here (a tap on their name). */
  P.subjectTeachersCard = function (me) {
    var areas = P.conf().areas, staff = staffTeachers(), who = {};
    staff.forEach(function (u) { known(u.areas).forEach(function (a) { (who[a] = who[a] || []).push(u); }); });
    var none = staff.filter(function (u) { return !known(u.areas).length; });
    var chip = function (u) { var name = esc(u.name) + (u.id === me.id ? " (you)" : ""); return me.isAdmin ? '<button type="button" class="badge chip-btn" data-act="psubj-edit" data-id="' + u.id + '">' + name + "</button>" : '<span class="badge">' + name + "</span>"; };
    return '<div class="card mb"><div class="card-head">' + I("book") + '<h3>Subjects and who teaches them</h3><span class="sub">' + areas.length + "</span></div>" +
      areas.map(function (a) {
        return '<div class="list-row"><div class="grow"><div class="title">' + esc(a) + '</div><div class="meta" style="flex-wrap:wrap;gap:4px">' + ((who[a] || []).length ? who[a].map(chip).join(" ") : '<span class="muted small">No teacher yet</span>') + "</div></div></div>";
      }).join("") +
      (none.length ? '<div class="list-row"><div class="grow"><div class="title">No subjects yet</div><div class="meta" style="flex-wrap:wrap;gap:4px">' + none.map(chip).join(" ") + "</div></div></div>" : "") +
      '<div class="card-body muted small">' + (me.isAdmin ? "Tap a teacher to change their subjects and the classes they teach." : "To change your own subjects, ask the head (above).") + "</div></div>";
  };
  function subjectsModal(u, o) {
    UI.modal({
      title: o.title, body: '<form id="psubj" class="form-grid">' + P.areaChecks(o.chosen) + (o.fresh ? P.newAreaField(u.areasNew, o.ask ? "" : "Added to the school's subjects and to theirs.") : "") +
        P.classChecks(o.classes, o.ask ? "Classes I teach" : "Classes they teach") +
        // an admin can make another teacher an admin too (or no longer one); not themselves, so the school keeps one
        (o.admin ? '<label class="check full"><input type="checkbox" name="isAdmin"' + (u.isAdmin ? " checked" : "") + "> Admin: can change classes, the timetable, people and everyone's subjects, and records every subject's marks</label>" : "") + "</form>",
      foot: [{ label: "Cancel" }, { label: o.ok, cls: "btn-primary", onClick: function (m) {
        var f = m.querySelector("#psubj");
        var areas = P.areasPicked(f), fresh = o.fresh ? P.newAreasTyped(f, areas) : [];
        return o.save(areas, !!(f.isAdmin && f.isAdmin.checked), P.classesPicked(f), fresh);
      } }],
    });
  }
  A.act["psubj-ask"] = function () {
    var me = M.me();
    subjectsModal(me, { title: "Ask to change my subjects or classes", ok: "Send to the head", ask: true, fresh: true, chosen: me.areas, classes: me.classIds, save: function (areas, admin, classIds, fresh) {
      var same = function (a, b) { return JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort()); };
      var ch = { areasAsked: same(areas, me.areas) ? null : areas, classIdsAsked: same(classIds, me.classIds) ? null : classIds, areasNew: fresh.length ? fresh : null, areasAskedAt: A.now() };
      if (!ch.areasAsked && !ch.classIdsAsked && !ch.areasNew) { UI.toast("Nothing changed", "bad"); return false; }
      S().patch("users", me.id, ch);
      M.alertAdmins({ kind: "subjects", aboutId: me.id, title: me.name + " asks to change their subjects", body: me.name + " asks to change the subjects or classes they teach" + (fresh.length ? ", and to add " + fresh.join(", ") + " to the school's subjects" : "") + ". Agree or say no in My subjects." });
      UI.toast("Sent: the head agrees or says no"); A.render();
    } });
  };
  var noAsk = { areasAsked: null, classIdsAsked: null, areasNew: null, areasAskedAt: null };
  A.act["psubj-unask"] = function () { S().patch("users", M.me().id, Object.assign({ homeAsk: null, homeAskAt: null }, noAsk)); UI.toast("Request taken back"); A.render(); };
  var setAreas = function (u, areas, classIds) {
    S().patch("users", u.id, Object.assign({ areas: areas, subjects: areas.join(", ") }, classIds ? { classIds: classIds } : {}, noAsk));
  };
  /** New subjects for the school's list (settings "primary"), as typed; those already there (any case) are not added twice. */
  function addAreas(list) {
    var rec = S().get("settings", "primary") || { id: "primary" }, have = P.conf().areas.slice(), low = have.map(function (a) { return a.toLowerCase(); }), out = [];
    (list || []).forEach(function (a) { var i = low.indexOf(String(a).toLowerCase()); if (i >= 0) out.push(have[i]); else { have.push(a); low.push(a.toLowerCase()); out.push(a); } });
    if (have.length !== P.conf().areas.length) S().put("settings", Object.assign({}, rec, { areas: have }));
    return out;
  }
  A.act["psubj-edit"] = function (el) {
    var me = M.me(), u = M.user(el.getAttribute("data-id")); if (!u || !me.isAdmin) return;
    subjectsModal(u, { title: u.name, ok: "Save", fresh: true, chosen: u.areasAsked || u.areas, classes: u.classIdsAsked || u.classIds, admin: u.id !== me.id, save: function (areas, admin, classIds, fresh) {
      addAreas(fresh).forEach(function (a) { if (areas.indexOf(a) < 0) areas.push(a); });
      setAreas(u, areas, classIds);
      if (u.id !== me.id && admin !== !!u.isAdmin) S().patch("users", u.id, { isAdmin: admin });
      if (!asks(M.user(u.id))) M.alertsDone(u.id);
      UI.toast(u.id !== me.id && admin !== !!u.isAdmin ? (admin ? u.name + " is now an admin" : u.name + " is no longer an admin") : "Saved"); A.render();
    } });
  };
  A.act["psubj-yes"] = function (el) {
    var u = M.user(el.getAttribute("data-id")); if (!u || !M.me().isAdmin) return;
    if (u.homeAsk) { var hc = S().get("classes", u.homeAsk); if (hc && !hc._deleted) P.takeClass(u, hc); S().patch("users", u.id, { homeAsk: null, homeAskAt: null }); u = M.user(u.id); }
    if (Array.isArray(u.areasAsked) || Array.isArray(u.classIdsAsked) || (u.areasNew || []).length) {
      var areas = Array.isArray(u.areasAsked) ? u.areasAsked.filter(function (a) { return P.conf().areas.indexOf(a) >= 0; }) : (u.areas || []).slice();
      addAreas(u.areasNew).forEach(function (a) { if (areas.indexOf(a) < 0) areas.push(a); });
      setAreas(u, areas, Array.isArray(u.classIdsAsked) ? u.classIdsAsked : null);
    }
    M.alertsDone(u.id);
    UI.toast("Done: " + u.name + "'s request"); A.render();
  };
  A.act["psubj-no"] = function (el) {
    var u = M.user(el.getAttribute("data-id")); if (!u || !M.me().isAdmin) return;
    S().patch("users", u.id, Object.assign({ homeAsk: null, homeAskAt: null }, noAsk)); M.alertsDone(u.id); UI.toast("Request declined"); A.render();
  };

  /** "Mrs T. Moyo" → "Mrs Moyo"; "Tendai Moyo" → "Tendai". */
  /** The greeting's name: "Mr Sibanda" for "Mr K. Sibanda"; a name with no title stays whole ("ECS Admin", not "ECS"). */
  function greetName(name) {
    var m = /^(mr|mrs|ms|miss|dr|prof|rev|pastor|sr|fr)\.?\s+/i.exec(name || ""), words = String(name || "").trim().split(/\s+/);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + " " + words[words.length - 1] : String(name || "").trim();
  }
  function count(marks, a, b, kids) { return kids.filter(function (u) { var v = (marks || {})[u.id]; return v === a || v === b; }).length; }
  function nextBirthday(dob) {
    if (!dob) return null;
    var now = A.startOfDay(A.now()), y = A.date().getFullYear(), m = Number(dob.slice(5, 7)) - 1, d = Number(dob.slice(8, 10));
    var t = new Date(y, m, d).getTime(); if (t < now) t = new Date(y + 1, m, d).getTime();
    return Math.round((t - now) / A.DAY);
  }

  /* ------------------------------------------------------------------ My class */
  A.route("t/pupils", function (p, q, me) {
    var nc = needClass(me, "My class"); if (nc.view) return nc.view;
    var c = nc.c, kids = P.pupils(c), samples = kids.filter(function (u) { return u.sample; }).length;
    var html = '<div class="row wrap spread mb"><div class="row wrap"><h2 style="font-size:22px">' + esc(c.name) + '</h2><span class="muted">' + kids.length + " pupils · " +
      kids.filter(function (u) { return u.sex === "M"; }).length + " boys · " + kids.filter(function (u) { return u.sex === "F"; }).length + " girls</span></div>" +
      '<div class="row wrap">' + classSwitch(me, c, "pupils") + (me.isAdmin ? '<button class="btn" data-act="pclass-edit">' + I("edit") + 'Class</button><button class="btn" data-act="pclass-new">' + I("plus") + "Another class</button>"
        : '<button class="btn" data-act="pclass-choose">' + I("users") + "Change my class</button>") +
      '<button class="btn" data-act="pupils-csv">' + I("download") + 'Excel (CSV)</button><button class="btn btn-primary" data-act="pupils-add">' + I("plus") + "Add pupils</button></div></div>";
    if (samples) html += '<div class="callout mb">' + I("info") + '<div class="grow"><b>' + samples + " sample pupils</b> are here so you can try everything. Remove them when you add your own class.</div>" +
      '<button class="btn btn-sm" data-act="pupils-clear-sample">' + I("trash") + "Remove sample pupils</button></div>";
    if (!kids.length) return { title: "My class", html: html + '<div class="card">' + UI.empty("users", "No pupils yet", "Add your class list: type the names, or paste them from a list, one per line.",
      '<button class="btn btn-primary" data-act="pupils-add">' + I("plus") + "Add pupils</button>") + "</div>", mount: function () { if (q.add) A.act["pupils-add"](); } };
    html += '<div class="card table-wrap"><table class="table"><thead><tr><th class="num">No.</th><th>Pupil</th><th>Sex</th><th class="num">Age</th><th>Guardian</th><th>Phone</th><th class="num">Attendance</th></tr></thead><tbody>' +
      kids.map(function (u, i) {
        var att = M.attendanceRate(u.id, c.id);
        return '<tr class="click" data-href="#/t/pupil/' + u.id + '" tabindex="0"><td class="num tnum">' + (i + 1) + '</td><td><div class="row">' + A.avatar(u, "sm") + "<b>" + esc(u.name) + "</b>" + (u.health ? ' <span class="badge warn" data-tip="' + esc(u.health) + '">' + I("alert") + "Health</span>" : "") + "</div></td>" +
          "<td>" + esc(sexName(u.sex)) + '</td><td class="num tnum">' + (age(u.dob) == null ? "—" : age(u.dob)) + "</td><td>" + esc(u.guardian || "") + '</td><td class="tnum">' + esc(u.phone || "") + "</td>" +
          '<td class="num">' + UI.pctCell(att, att == null ? "" : att >= 90 ? "good" : att >= 80 ? "warn" : "bad") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return { title: "My class", html: html, mount: function () { if (q.add) A.act["pupils-add"](); } };
  }, { role: "teacher" });

  A.act["pupils-add"] = function () {
    var c = P.cls(M.me()); if (!c) return;
    UI.modal({
      title: "Add pupils to " + c.name, size: "wide",
      sub: "One pupil per line. Add <b>, M</b> or <b>, F</b> after a name for boy or girl, and a date of birth if you have it, e.g. <code>Tanaka Moyo, M, 2016-05-14</code>. You can fill in guardians and phone numbers on each pupil's page.",
      body: '<textarea class="input" id="pupil-lines" rows="12" placeholder="Tanaka Moyo, M, 2016-05-14\nRufaro Ncube, F\nTinashe Dube, M"></textarea><p class="small muted mt-sm" id="pupil-count">0 pupils</p>',
      onMount: function (m) {
        var ta = m.querySelector("#pupil-lines");
        ta.addEventListener("input", function () { var n = parseLines(ta.value).length; m.querySelector("#pupil-count").textContent = n + " pupil" + (n === 1 ? "" : "s"); });
      },
      foot: [{ label: "Cancel" }, { label: "Add pupils", cls: "btn-primary", icon: "plus", onClick: function (m) {
        var rows = parseLines(m.querySelector("#pupil-lines").value);
        if (!rows.length) { UI.toast("Type at least one name", "bad"); return false; }
        var ids = (c.studentIds || []).slice();
        rows.forEach(function (r) { ids.push(S().put("users", { id: A.uid("p"), role: "student", pupil: true, name: r.name, sex: r.sex, dob: r.dob, level: c.level, stream: c.stream }, { silent: true }).id); });
        S().put("classes", Object.assign({}, c, { studentIds: ids }));
        UI.toast(rows.length + " pupil" + (rows.length === 1 ? "" : "s") + " added"); location.hash = "#/t/pupils"; A.render();
      } }],
    });
  };
  function parseLines(text) {
    return String(text || "").split(/\r?\n/).map(function (line) {
      var parts = line.split(/[,\t;]/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!parts.length || parts[0].length < 2) return null;
      var r = { name: parts[0].replace(/\s+/g, " "), sex: "", dob: "" };
      parts.slice(1).forEach(function (x) {
        if (/^(m|male|boy)$/i.test(x)) r.sex = "M"; else if (/^(f|female|girl)$/i.test(x)) r.sex = "F";
        else if (/^\d{4}-\d{2}-\d{2}$/.test(x)) r.dob = x;
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x)) { var d = x.split("/"); r.dob = d[2] + "-" + A.pad(Number(d[1])) + "-" + A.pad(Number(d[0])); }
      });
      return r;
    }).filter(Boolean);
  }
  A.act["pupils-clear-sample"] = function () {
    var c = P.cls(M.me());
    UI.confirm("Remove the sample pupils, their registers and the sample marks? Your own pupils stay.", { danger: true, ok: "Remove samples" }).then(function (ok) {
      if (!ok) return;
      var gone = {};
      S().filter("users", function (u) { return u.pupil && u.sample; }).forEach(function (u) { gone[u.id] = 1; S().remove("users", u.id); });
      S().filter("classes", function (x) { return x.homeroom; }).forEach(function (x) { S().put("classes", Object.assign({}, x, { studentIds: (x.studentIds || []).filter(function (id) { return !gone[id]; }) })); });
      S().filter("assessments", function (a) { return a.sample; }).forEach(function (a) { S().remove("assessments", a.id); });
      S().filter("attendance", function (r) { return c && r.classId === c.id && Object.keys(r.marks || {}).every(function (id) { return gone[id]; }); }).forEach(function (r) { S().remove("attendance", r.id); });
      UI.toast("Sample pupils removed"); A.render();
    });
  };
  A.act["pupils-csv"] = function () {
    var c = P.cls(M.me()), conf = P.conf(), sc = P.scores(c, conf.year, conf.term);
    var head = ["No.", "Name", "Sex", "Date of birth", "Age", "Guardian", "Phone", "Address", "Health"].concat(conf.areas.map(function (a) { return a + " %"; }), ["Average %", "Attendance %"]);
    var rows = P.pupils(c).map(function (u, i) {
      var s = sc.by[u.id] || { area: {} };
      return [i + 1, u.name, sexName(u.sex), u.dob || "", age(u.dob) == null ? "" : age(u.dob), u.guardian || "", u.phone || "", u.address || "", u.health || ""]
        .concat(conf.areas.map(function (a) { return s.area[a] == null ? "" : s.area[a]; }), [s.avg == null ? "" : s.avg, M.attendanceRate(u.id, c.id) == null ? "" : M.attendanceRate(u.id, c.id)]);
    });
    var csv = [head].concat(rows).map(function (r) { return r.map(function (x) { x = String(x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(","); }).join("\r\n");
    A.download(c.name.replace(/\s+/g, "-") + "-term-" + conf.term + "-" + conf.year + ".csv", "﻿" + csv, "text/csv");
  };

  /* ---- one pupil */
  A.route("t/pupil/:id", function (p, q, me) {
    var u = M.user(p.id);
    if (!u || !u.pupil) return { redirect: "#/t/pupils" };
    // only a pupil of a class this teacher has (the head: every class), even when the address is typed (a browser)
    var theirs = P.classes(me).filter(function (x) { return (x.studentIds || []).indexOf(u.id) >= 0; }), sel = P.cls(me);
    if (!theirs.length) return { redirect: "#/t/pupils" };
    var c = theirs.filter(function (x) { return sel && x.id === sel.id; })[0] || theirs[0];
    var conf = P.conf(), sc = c ? P.scores(c, conf.year, conf.term).by[u.id] : null, notes = S().filter("pnotes", function (n) { return n.pupilId === u.id; }).sort(function (a, b) { return b.at - a.at; });
    var att = termAttendance(c, u.id, conf.term, conf);
    var html = '<div class="card card-pad mb"><div class="row wrap top">' + A.avatar(u, "lg") + '<div class="grow"><h2 style="font-size:22px">' + esc(u.name) + '</h2><p class="muted">' +
      [esc(sexName(u.sex)), age(u.dob) != null ? age(u.dob) + " years (born " + esc(A.fmtDateLong(Date.parse(u.dob + "T12:00:00"))) + ")" : "", c ? esc(c.name) : ""].filter(Boolean).join(" · ") + "</p>" +
      (u.health ? '<div class="callout warn mt-sm">' + I("alert") + "<div><b>Health:</b> " + esc(u.health) + "</div></div>" : "") + "</div>" +
      '<button class="btn" data-act="pupil-edit" data-id="' + u.id + '">' + I("edit") + "Edit details</button></div>" +
      '<dl class="kv mt"><dt>Guardian</dt><dd>' + esc(u.guardian || "—") + "</dd><dt>Phone</dt><dd>" + esc(u.phone || "—") + "</dd><dt>Address</dt><dd>" + esc(u.address || "—") + "</dd>" +
      (u.birthNo ? "<dt>Birth entry no.</dt><dd>" + esc(u.birthNo) + "</dd>" : "") + "</dl></div>";
    html += '<div class="grid g-main"><div class="card"><div class="card-head">' + I("edit") + "<h3>Term " + conf.term + " marks</h3>" + (sc && sc.avg != null ? '<span class="sub">average ' + sc.avg + "%</span>" : "") + "</div>" +
      (sc && Object.keys(sc.area).length ? conf.areas.filter(function (a) { return sc.area[a] != null; }).map(function (a) {
        return '<div class="list-row"><div class="grow"><div class="title">' + esc(a) + '</div><div class="meta">' + esc(P.descriptor(sc.area[a], conf)) + "</div></div>" + UI.scoreBadge(sc.area[a]) + "</div>";
      }).join("") : '<div class="card-body muted small">No marks yet this term.</div>') +
      '<div class="card-foot"><span class="small muted">Present ' + att.present + " of " + att.days + " days this term" + (att.absent ? ", absent " + att.absent : "") + "</span></div></div>";
    html += '<div class="card"><div class="card-head">' + I("list") + '<h3>Notes</h3><span class="grow"></span><button class="btn btn-sm" data-act="pnote-add" data-id="' + u.id + '">' + I("plus") + "Add a note</button></div>" +
      (notes.length ? notes.map(function (n) {
        return '<div class="list-row"><div class="grow"><div class="meta"><span class="badge">' + esc(n.kind) + "</span> " + esc(A.fmtDateLong(n.at)) + '</div><div class="small mt-sm">' + esc(n.text) + "</div></div>" +
          '<button class="btn btn-ghost btn-icon btn-sm" data-act="pnote-del" data-id="' + n.id + '" aria-label="Delete note">' + I("trash") + "</button></div>";
      }).join("") : '<div class="card-body muted small">Behaviour, health, reading level, remedial work: anything worth remembering, with the date.</div>') + "</div></div>";
    return { title: u.name, crumbs: [{ label: "My class", href: "#/t/pupils" }, { label: u.name }], html: html };
  }, { role: "teacher" });
  A.act["pupil-edit"] = function (el) {
    var u = M.user(el.getAttribute("data-id")); if (!u) return;
    var f = function (name, label, type, extra) { return '<label class="field' + (extra || "") + '"><span>' + label + '</span><input class="input" name="' + name + '" type="' + (type || "text") + '" value="' + esc(u[name] || "") + '"></label>'; };
    UI.modal({
      title: "Edit " + u.name, size: "wide",
      body: '<form id="pupil-form" class="form-grid">' + f("name", "Full name") +
        '<label class="field"><span>Sex</span><select class="select" name="sex"><option value=""></option><option value="M"' + (u.sex === "M" ? " selected" : "") + '>Boy</option><option value="F"' + (u.sex === "F" ? " selected" : "") + ">Girl</option></select></label>" +
        f("dob", "Date of birth", "date") + f("birthNo", "Birth entry number (optional)") + f("guardian", "Parent or guardian") + f("phone", "Phone", "tel") + f("address", "Address", "text", " full") +
        f("health", "Health notes (allergies, asthma…)", "text", " full") + "</form>",
      foot: [{ label: "Remove from class", cls: "btn-danger", onClick: function () {
        return UI.confirm("Remove " + u.name + " from the class? Their marks and registers are kept in old reports.", { danger: true, ok: "Remove" }).then(function (ok) {
          if (!ok) return false;
          S().filter("classes", function (x) { return (x.studentIds || []).indexOf(u.id) >= 0; }).forEach(function (x) { S().put("classes", Object.assign({}, x, { studentIds: x.studentIds.filter(function (id) { return id !== u.id; }) })); });
          S().patch("users", u.id, { leftAt: A.now() });
          UI.toast(u.name + " removed"); location.hash = "#/t/pupils";
        });
      } }, { label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var d = UI.formData(m.querySelector("#pupil-form"));
        if (d.name.trim().length < 2) { UI.toast("Enter the pupil's name", "bad"); return false; }
        S().patch("users", u.id, { name: d.name.trim(), sex: d.sex, dob: d.dob, birthNo: d.birthNo.trim(), guardian: d.guardian.trim(), phone: d.phone.trim(), address: d.address.trim(), health: d.health.trim(), sample: false });
        UI.toast("Saved"); A.render();
      } }],
    });
  };
  A.act["pnote-add"] = function (el) {
    var id = el.getAttribute("data-id");
    UI.modal({
      title: "Add a note",
      body: '<form id="pnote" class="form-grid"><label class="field full"><span>About</span><select class="select" name="kind">' + ["General", "Behaviour", "Health", "Reading", "Remedial", "Parents"].map(function (k) { return "<option>" + k + "</option>"; }).join("") + "</select></label>" +
        '<label class="field full"><span>Note</span><textarea class="input" name="text" rows="4"></textarea></label></form>',
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var d = UI.formData(m.querySelector("#pnote"));
        if (!d.text.trim()) { UI.toast("Write the note", "bad"); return false; }
        S().put("pnotes", { pupilId: id, kind: d.kind, text: d.text.trim(), at: A.now(), by: M.me().id });
        UI.toast("Note saved"); A.render();
      } }],
    });
  };
  A.act["pnote-del"] = function (el) {
    UI.confirm("Delete this note?", { danger: true, ok: "Delete" }).then(function (ok) { if (ok) { S().remove("pnotes", el.getAttribute("data-id")); A.render(); } });
  };

  /* ------------------------------------------------------------------ Register */
  function termAttendance(c, pid, term, conf) {
    var out = { days: 0, present: 0, absent: 0, late: 0 };
    if (!c) return out;
    S().filter("attendance", function (r) { return r.classId === c.id && r.date.slice(0, 4) === conf.year && termOf(r.date, conf) === Number(term); }).forEach(function (r) {
      var v = (r.marks || {})[pid]; if (!v) return;
      out.days++;
      if (v === "P" || v === "L") out.present++;
      if (v === "A") out.absent++;
      if (v === "L") out.late++;
    });
    return out;
  }
  A.route("t/register", function (p, q, me) {
    var nc = needClass(me, "Register"); if (nc.view) return nc.view;
    var c = nc.c, kids = P.pupils(c), date = q.d || A.isoDate(), reg = M.register(c.id, date), marks = (reg && reg.marks) || {}, conf = P.conf();
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Register · ' + esc(c.name) + '</h2><p class="muted">' + esc(A.fmtDateLong(Date.parse(date + "T12:00:00"))) +
      (reg ? " · saved " + esc(A.relTime(reg.updatedAt)) : " · not taken yet") + "</p></div>" + '<div class="row wrap">' + classSwitch(me, c, "register") +
      '<input type="date" class="input sm" style="width:auto" value="' + date + '" data-change="preg-date" aria-label="Date"></div></div>';
    if (!kids.length) return { title: "Register", html: html + '<div class="card">' + UI.empty("users", "No pupils yet", "Add your class list first.", '<a class="btn btn-primary" href="#/t/pupils?add=1">' + I("plus") + "Add pupils</a>") + "</div>" };
    html += '<div class="card"><div class="card-body row wrap spread" style="border-bottom:1px solid var(--border)"><div class="small" id="preg-sum"></div><div class="row"><button class="btn btn-sm" data-act="preg-all">' + I("check") + "Everyone present</button></div></div>" +
      '<div id="preg-list" class="preg-list">' + kids.map(function (u, i) {
        var v = marks[u.id] || "";
        return '<div class="list-row" data-pid="' + u.id + '"><span class="tnum muted small" style="width:22px">' + (i + 1) + "</span>" + A.avatar(u, "sm") + '<div class="grow"><div class="title">' + esc(u.name) + "</div></div>" +
          '<div class="reg-btns" role="radiogroup" aria-label="' + esc(u.name) + '">' + ["P", "L", "A", "E"].map(function (k) {
            return '<button type="button" class="' + k + (v === k ? " on" : "") + '" data-act="preg-mark" data-k="' + k + '" aria-label="' + M.ATT[k] + '" data-tip="' + M.ATT[k] + '">' + k + "</button>";
          }).join("") + "</div></div>";
      }).join("") + "</div>" +
      '<div class="card-foot row spread"><span class="small muted">P present · L late · A absent · E excused</span><button class="btn btn-primary" data-act="preg-save" data-date="' + date + '">' + I("check") + "Save register</button></div></div>";
    // this term so far
    html += '<div class="card mt table-wrap"><div class="card-head">' + I("chart") + "<h3>Term " + conf.term + " so far</h3></div><table class=\"table\"><thead><tr><th>Pupil</th><th class=\"num\">Days</th><th class=\"num\">Present</th><th class=\"num\">Late</th><th class=\"num\">Absent</th><th class=\"num\">%</th></tr></thead><tbody>" +
      kids.map(function (u) {
        var t = termAttendance(c, u.id, conf.term, conf), pct = t.days ? Math.round(t.present / t.days * 100) : null;
        return "<tr><td>" + esc(u.name) + '</td><td class="num tnum">' + t.days + '</td><td class="num tnum">' + t.present + '</td><td class="num tnum">' + t.late + '</td><td class="num tnum">' + t.absent + '</td><td class="num">' + UI.pctCell(pct, pct == null ? "" : pct >= 90 ? "good" : pct >= 80 ? "warn" : "bad") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return { title: "Register", html: html, mount: function (root) { regSum(root); } };
  }, { role: "teacher" });
  function regSum(root) {
    var el = (root || document).querySelector("#preg-sum"); if (!el) return;
    var n = { P: 0, L: 0, A: 0, E: 0 }, none = 0;
    document.querySelectorAll("#preg-list .list-row").forEach(function (row) { var on = row.querySelector(".reg-btns .on"); if (on) n[on.getAttribute("data-k")]++; else none++; });
    el.innerHTML = '<span class="badge good">' + n.P + ' present</span> <span class="badge warn">' + n.L + ' late</span> <span class="badge bad">' + n.A + ' absent</span> <span class="badge">' + n.E + " excused</span>" + (none ? ' <span class="muted">' + none + " not marked</span>" : "");
  }
  A.act["preg-mark"] = function (el) { el.closest(".reg-btns").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b === el); }); regSum(); };
  A.act["preg-all"] = function () { document.querySelectorAll("#preg-list .reg-btns").forEach(function (row) { if (!row.querySelector(".on")) row.querySelector(".P").classList.add("on"); }); regSum(); };
  A.act["preg-date"] = function (el) { location.hash = "#/t/register?d=" + el.value; };
  A.act["preg-save"] = function (el) {
    var c = P.cls(M.me()), marks = {}, missing = 0;
    document.querySelectorAll("#preg-list .list-row").forEach(function (row) { var on = row.querySelector(".reg-btns .on"); if (on) marks[row.getAttribute("data-pid")] = on.getAttribute("data-k"); else missing++; });
    var save = function () { M.saveRegister(c.id, el.getAttribute("data-date"), marks); UI.toast("Register saved"); A.render(); };
    if (missing) UI.confirm(missing + " pupil" + (missing === 1 ? " is" : "s are") + " not marked. Save anyway?", { ok: "Save register" }).then(function (ok) { if (ok) save(); }); else save();
  };

  /* ------------------------------------------------------------------ Mark book */
  /** Each pupil's % per learning area for a term (marks over marks possible, across that term's work) and their average and position. */
  P.scores = function (c, year, term) {
    var conf = P.conf(), kids = P.pupils(c), by = {};
    var list = S().filter("assessments", function (a) { return c && a.classId === c.id && String(a.year) === String(year) && Number(a.term) === Number(term); });
    kids.forEach(function (u) {
      var got = {}, max = {};
      list.forEach(function (a) { var v = (a.marks || {})[u.id]; if (v == null || v === "") return; got[a.area] = (got[a.area] || 0) + Number(v); max[a.area] = (max[a.area] || 0) + Number(a.outOf); });
      var area = {}, raw = {}; Object.keys(max).forEach(function (k) { if (max[k] > 0) { area[k] = Math.round(got[k] / max[k] * 100); raw[k] = { got: got[k], max: max[k] }; } });
      var vals = conf.areas.map(function (k) { return area[k]; }).filter(function (x) { return x != null; });
      by[u.id] = { area: area, raw: raw, avg: vals.length ? Math.round(A.avg(vals)) : null };
    });
    // position by average (equal averages share a place)
    var ranked = kids.filter(function (u) { return by[u.id].avg != null; }).sort(function (a, b) { return by[b.id].avg - by[a.id].avg; });
    ranked.forEach(function (u, i) { by[u.id].pos = i && by[ranked[i - 1].id].avg === by[u.id].avg ? by[ranked[i - 1].id].pos : i + 1; });
    return { by: by, list: list, ranked: ranked.length };
  };
  /** The subjects and classes in a mark book: the ones a teacher teaches, an admin's too (another class's marks are seen
      in View other classes). */
  function mbAreas(me) { return P.ownAreas(me); }
  function mbClasses(me) { return P.teachClasses(me, true); }
  function mbKey(me) { return "sca-pmb-" + me.id; }
  /** The mark book's class: the one asked for (?c=), else the last one here, else one the teacher teaches. */
  function mbClass(me, q) {
    var list = mbClasses(me), want = q.c || q.ec || null, own = P.teachClasses(me, true)[0];
    if (!want) try { want = localStorage.getItem(mbKey(me)); } catch (e) { /* this device only */ }
    var c = list.filter(function (x) { return x.id === want; })[0] || (own && list.filter(function (x) { return x.id === own.id; })[0]) || list[0] || null;
    if (c) try { localStorage.setItem(mbKey(me), c.id); } catch (e) { /* this device only */ }
    return c;
  }
  /** The end-of-term marks and comments (they go on the report cards): each teacher records the subjects they teach,
      in the classes they teach; the head, every subject in every class. */
  function endOfTerm(me, c, conf, term, area, q) {
    if (!A.Report || !c) return "";
    var mine = P.ownAreasIn(me, c);
    if (!mine.length) return "";
    var etArea = mine.indexOf(area) >= 0 ? area : mine.indexOf(q.et) >= 0 ? q.et : mine[0];
    var kids = P.pupils(c), et = { year: String(conf.year), term: term, classId: c.id, subject: etArea }, ro = !P.mayMark(me, c.id, etArea);
    var base = "#/t/markbook?term={t}&c=" + c.id + "&et=" + encodeURIComponent(etArea) + (area ? "&a=" + encodeURIComponent(area) : "");
    return '<div class="card mb" id="pmb-eot"><div class="card-head">' + I("award") + "<h3>End of term · " + esc(etArea) + " · " + esc(c.name) + '</h3><span class="grow"></span>' +
      (mine.length > 1 ? '<select class="select sm" style="width:auto" data-change="pmb-et" data-term="' + term + '" data-c="' + c.id + '" aria-label="Subject">' + mine.map(function (a2) { return "<option" + (a2 === etArea ? " selected" : "") + ">" + esc(a2) + "</option>"; }).join("") + "</select>" : "") +
      '</div><div class="card-pad" style="padding-top:0"><p class="muted small mb">Each pupil\'s end-of-term mark and a comment in ' + esc(etArea) + " for " + esc(c.name) + ". They go on the report cards." + (ro ? " You can look at them: only the teacher of " + esc(etArea) + " in " + esc(c.name) + " changes them." : " You record the subjects you teach, in the classes you teach.") + "</p>" +
      (kids.length ? A.Report.entryBar(et, base, ro) + A.Report.entryTable(et, kids, ro) : UI.empty("users", "No pupils in " + c.name + " yet", "")) + "</div></div>";
  }
  A.act["pmb-class"] = function (el) {
    try { localStorage.setItem(mbKey(M.me()), el.value); } catch (e) { /* this device only */ }
    location.hash = "#/t/markbook?term=" + el.getAttribute("data-term") + "&c=" + encodeURIComponent(el.value);
  };
  A.route("t/markbook", function (p, q, me) {
    var conf = P.conf(), term = Number(q.term) || conf.term, classes = mbClasses(me), c = mbClass(me, q);
    // the subjects of theirs that this class's form takes (Subjects by form)
    var areas = c ? P.ownAreasIn(me, c) : mbAreas(me), area = areas.indexOf(q.a) >= 0 ? q.a : "";
    var termSel = '<select class="select sm" style="width:auto" data-change="pmb-term" data-c="' + (c ? c.id : "") + '" aria-label="Term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select>";
    var top = function (title, right) { return '<div class="row wrap spread mb"><div><h2 style="font-size:22px">' + title + '</h2><p class="muted">Term ' + term + " " + esc(conf.year) + "</p></div>" + (right ? '<div class="row wrap">' + right + "</div>" : "") + "</div>"; };
    if (!c && me.isAdmin && !homerooms().length) return needClass(me, "Mark book").view; // no class in the school yet
    // a teacher sees the subjects and classes they teach, and no others
    if (!c) return { title: "Mark book", html: top("Mark book") + '<div class="card">' + UI.empty("users", "No classes yet", "Your mark book has the classes you teach: your own class, the ones the head gives you and those of your lessons on the timetable. Another class's marks are in View other classes.", '<a class="btn" href="#/t/home">' + I("home") + "Today</a>") + "</div>" };
    if (!areas.length && mbAreas(me).length) return { title: "Mark book", html: top("Mark book · " + esc(c.name), pickOf(classes, c, term)) + '<div class="card">' + UI.empty("book", "None of your subjects in " + c.level,
      "The subjects you teach aren't taken in " + c.level + " (Settings → Learning areas and terms → Subjects by form). Choose another class.") + "</div>" };
    if (!areas.length) return { title: "Mark book", html: top("Mark book · " + esc(c.name)) + '<div class="card">' + UI.empty("book", "No subjects yet", "You record the marks of the subjects you teach. Ask the head to give you yours on the Today page.", '<a class="btn" href="#/t/home">' + I("home") + "Today</a>") + "</div>" };
    var sc = P.scores(c, conf.year, term), mineWork = sc.list.filter(function (a) { return areas.indexOf(a.area) >= 0; });
    var list = mineWork.filter(function (a) { return !area || a.area === area; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var kids = P.pupils(c), canNew = P.ownAreas(me).some(function (a2) { return P.mayMark(me, c.id, a2); });
    var pick = pickOf(classes, c, term);
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Mark book · ' + esc(c.name) + '</h2><p class="muted">Term ' + term + " " + esc(conf.year) + " · " + mineWork.length + " pieces of work marked</p></div>" +
      '<div class="row wrap">' + pick + termSel +
      (canNew ? '<button class="btn btn-primary" data-act="pas-new" data-c="' + c.id + '" data-a="' + esc(area) + '">' + I("plus") + "New marks</button>" : "") + "</div></div>";
    if (!canNew) html += '<div class="callout mb">' + I("eye") + "<div>You can look at " + esc(c.name) + "'s marks: only the teachers of its subjects change them.</div></div>";
    html += '<div class="pill-tabs sm"><button class="' + (!area ? "on" : "") + '" data-act="goto" data-href="#/t/markbook?term=' + term + "&c=" + c.id + '">' + (areas.length > 1 ? "All my subjects" : esc(areas[0])) + "</button>" + (areas.length > 1 ? areas.map(function (a) {
      var n = mineWork.filter(function (x) { return x.area === a; }).length;
      return n ? '<button class="' + (a === area ? "on" : "") + '" data-act="goto" data-href="#/t/markbook?term=' + term + "&c=" + c.id + "&a=" + encodeURIComponent(a) + '">' + esc(a) + ' <span class="muted">' + n + "</span></button>" : "";
    }).join("") : "") + "</div>";
    html += '<div class="card mb">' + (list.length ? list.map(function (a) {
      var vals = kids.map(function (u) { return (a.marks || {})[u.id]; }).filter(function (v) { return v != null && v !== ""; }).map(Number);
      var avg = vals.length ? Math.round(A.avg(vals) / a.outOf * 100) : null;
      return '<a class="list-row click" href="#/t/assessment/' + a.id + '"><div class="grow"><div class="title">' + esc(a.title) + '</div><div class="meta"><span>' + esc(a.area) + '</span><span class="sep"></span><span>' + esc(a.kind) +
        '</span><span class="sep"></span><span>' + esc(A.fmtDate(Date.parse(a.date + "T12:00:00"))) + '</span><span class="sep"></span><span>out of ' + a.outOf + '</span><span class="sep"></span><span>' + vals.length + " of " + kids.length + " marked</span></div></div>" + UI.scoreBadge(avg) + "</a>";
    }).join("") : UI.empty("edit", "Nothing marked yet", canNew ? "Add an exercise, test, homework or CALA task and enter each pupil's mark." : "", canNew ? '<button class="btn btn-primary" data-act="pas-new" data-c="' + c.id + '" data-a="' + esc(area) + '">' + I("plus") + "New marks</button>" : "")) + "</div>";
    // the end-of-term mark and comment of each subject this teacher teaches: they go on the report cards (js/reportcards.js)
    html += endOfTerm(me, c, conf, term, area, q);
    // the class at a glance: each pupil's % per learning area this term
    var shown = areas.filter(function (a2) { return mineWork.some(function (x) { return x.area === a2; }); });
    if (shown.length && kids.length) {
      html += '<div class="card table-wrap"><div class="card-head">' + I("chart") + "<h3>Term " + term + ' at a glance</h3><span class="sub">% per subject</span></div><table class="table pmb-grid"><thead><tr><th>Pupil</th>' +
        shown.map(function (a2) { return '<th class="num" title="' + esc(a2) + '">' + esc(short(a2)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        kids.map(function (u) {
          var s = sc.by[u.id];
          return '<tr class="click" data-href="#/t/pupil/' + u.id + '"><td>' + esc(u.name) + "</td>" + shown.map(function (a2) { return '<td class="num tnum">' + (s.area[a2] == null ? "—" : s.area[a2]) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    }
    return { title: "Mark book", html: html, mount: function () { if (q["new"]) assessmentModal(null, c.id, area); } };
  }, { role: "teacher" });
  function pickOf(classes, c, term) {
    return classes.length > 1 ? '<select class="select sm pclass-pick" data-change="pmb-class" data-term="' + term + '" aria-label="Class">' + classes.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === c.id ? " selected" : "") + ">" + esc(x.name) + "</option>";
    }).join("") + "</select>" : "";
  }
  function short(area) { return { "Science and Technology": "Science & Tech", "Indigenous Language": "Indigenous lang.", "Visual and Performing Arts": "VPA", "Family, Religion and Moral Education": "FAREME", "Physical Education": "PE" }[area] || area; }
  A.act["pmb-term"] = function (el) { location.hash = "#/t/markbook?term=" + el.value + (el.getAttribute("data-c") ? "&c=" + encodeURIComponent(el.getAttribute("data-c")) : ""); };
  A.act["pmb-et"] = function (el) { location.hash = "#/t/markbook?term=" + el.getAttribute("data-term") + "&et=" + encodeURIComponent(el.value) + (el.getAttribute("data-c") ? "&c=" + encodeURIComponent(el.getAttribute("data-c")) : ""); };
  A.act["pas-new"] = function (el) { assessmentModal(null, el && el.getAttribute ? el.getAttribute("data-c") : null, el && el.getAttribute ? el.getAttribute("data-a") : ""); };
  /** New or edited marks: only for a subject the teacher teaches, in a class they teach (an admin too). */
  function assessmentModal(a, classId, area) {
    var me = M.me(), conf = P.conf(), classes = P.teachClasses(me, true), want = (a && a.classId) || classId;
    var c = classes.filter(function (x) { return x.id === want; })[0] || (!want ? classes[0] : null);
    if (!c) { UI.toast(want && M.cls(want) ? "Only the teachers of " + M.cls(want).name + "'s subjects enter its marks" : "You have no classes yet: ask the head", "bad"); return; }
    var areas = P.ownAreasIn(me, c);
    if (!areas.length) { UI.toast(P.ownAreas(me).length ? "None of your subjects are taken in " + c.level : "You have no subjects yet: ask the head", "bad"); return; }
    if (a && areas.indexOf(a.area) < 0) { UI.toast("Only the teacher of " + a.area + " changes these marks", "bad"); return; }
    a = a || { area: areas.indexOf(area) >= 0 ? area : areas[0], title: "", kind: "Exercise", date: A.isoDate(), outOf: 10, term: conf.term, year: conf.year };
    var opts = areas.indexOf(a.area) >= 0 ? areas : [a.area].concat(areas);
    UI.modal({
      title: a.id ? "Edit " + a.title : "New marks · " + c.name,
      body: '<form id="pas" class="form-grid"><label class="field"><span>Subject</span><select class="select" name="area">' + opts.map(function (x) { return "<option" + (x === a.area ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Type</span><select class="select" name="kind">' + KINDS.map(function (x) { return "<option" + (x === a.kind ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field full"><span>Title</span><input class="input" name="title" value="' + esc(a.title) + '" placeholder="e.g. Fractions test, Spelling list 4"></label>' +
        '<label class="field"><span>Date</span><input class="input" type="date" name="date" value="' + esc(a.date) + '"></label>' +
        '<label class="field"><span>Out of</span><input class="input" type="number" min="1" max="1000" name="outOf" value="' + esc(a.outOf) + '"></label></form>',
      foot: (a.id ? [{ label: "Delete", cls: "btn-danger", onClick: function () {
        return UI.confirm("Delete " + a.title + " and its marks?", { danger: true, ok: "Delete" }).then(function (ok) { if (!ok) return false; S().remove("assessments", a.id); location.hash = "#/t/markbook?c=" + c.id; });
      } }] : []).concat([{ label: "Cancel" }, { label: a.id ? "Save" : "Next: enter marks", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#pas")), out = Number(f.outOf);
        if (!f.title.trim()) { UI.toast("Give it a title", "bad"); return false; }
        if (!(out > 0)) { UI.toast("Enter what it is out of", "bad"); return false; }
        var rec = S().put("assessments", Object.assign({}, a, { classId: c.id, area: f.area, kind: f.kind, title: f.title.trim(), date: f.date || A.isoDate(), outOf: out,
          year: String((f.date || A.isoDate()).slice(0, 4)), term: termOf(f.date || A.isoDate(), conf), marks: a.marks || {}, createdBy: a.createdBy || me.id }));
        location.hash = "#/t/assessment/" + rec.id; A.render();
      } }]),
    });
  }
  A.route("t/assessment/:id", function (p, q, me) {
    // its teacher changes it (a subject they teach, in a class they teach); a leader may look
    var a = S().get("assessments", p.id), c = a && M.cls(a.classId), edit = !!(a && c && P.mayMark(me, c.id, a.area));
    if (!a || !c || !(edit || me.isAdmin || P.isLeader(me))) return { redirect: "#/t/markbook" };
    var kids = P.pupils(c), marks = a.marks || {};
    var html = '<div class="card card-pad mb"><div class="row wrap top"><div class="grow"><h2 style="font-size:22px">' + esc(a.title) + '</h2><p class="muted">' + esc(a.area) + " · " + esc(a.kind) + " · " +
      esc(A.fmtDateLong(Date.parse(a.date + "T12:00:00"))) + " · out of <b>" + a.outOf + "</b> · " + esc(c.name) + "</p></div>" +
      (edit ? '<button class="btn" data-act="pas-edit" data-id="' + a.id + '">' + I("edit") + "Edit</button>" : "") + "</div>" +
      '<div class="row wrap mt" id="pas-sum"></div></div>' +
      '<div class="card"><div class="card-body small muted" style="border-bottom:1px solid var(--border)">' + (edit ? "Type each mark and press <b>Enter</b> to go to the next pupil. Marks save as you type; leave a box empty for a pupil who missed it."
        : "You can look at these marks: only the teacher of " + esc(a.area) + " in " + esc(c.name) + " changes them.") + "</div>" +
      '<div class="pas-grid" id="pas-grid">' + kids.map(function (u, i) {
        var v = marks[u.id];
        return '<label class="pas-row"><span class="tnum muted small">' + (i + 1) + '</span><span class="grow">' + esc(u.name) + '</span><input class="input pas-in tnum" type="number" inputmode="numeric" min="0" max="' + a.outOf + '" step="0.5" data-pid="' + u.id + '" value="' + (v == null ? "" : esc(v)) + '"' + (edit ? "" : " disabled") + ' aria-label="Mark for ' + esc(u.name) + '"><span class="pas-pct tnum muted small"></span></label>';
      }).join("") + "</div></div>";
    return {
      title: a.title, crumbs: [{ label: "Mark book", href: "#/t/markbook?c=" + c.id }, { label: a.title }], html: html,
      mount: function (root) {
        var ins = Array.prototype.slice.call(root.querySelectorAll(".pas-in")), save = A.debounce(function () { commit(a.id); }, 400);
        var show = function () {
          var vals = [];
          ins.forEach(function (inp) {
            var v = inp.value === "" ? null : Number(inp.value), bad = v != null && (isNaN(v) || v < 0 || v > a.outOf);
            inp.classList.toggle("bad", bad);
            inp.parentNode.querySelector(".pas-pct").textContent = v == null || bad ? "" : Math.round(v / a.outOf * 100) + "%";
            if (v != null && !bad) vals.push(v);
          });
          var avg = vals.length ? A.avg(vals) : null;
          root.querySelector("#pas-sum").innerHTML = '<span class="badge">' + vals.length + " of " + ins.length + " marked</span>" + (vals.length ? ' <span class="badge brand">Class average ' + Math.round(avg / a.outOf * 100) + "% (" + Math.round(avg * 10) / 10 + "/" + a.outOf + ")</span>" +
            ' <span class="badge good">Highest ' + Math.max.apply(null, vals) + '</span> <span class="badge warn">Lowest ' + Math.min.apply(null, vals) + "</span>" : "");
        };
        ins.forEach(function (inp, i) {
          if (!edit) return;
          inp.addEventListener("input", function () { show(); save(); });
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var next = ins[i + 1]; if (next) { next.focus(); next.select(); } else inp.blur(); } });
        });
        show();
        if (edit) A.cleanup = function () { commit(a.id); };
      },
    };
  }, { role: "teacher" });
  function commit(id) {
    var a = S().get("assessments", id), marks = {};
    if (!a) return;
    document.querySelectorAll(".pas-in").forEach(function (inp) {
      var v = inp.value === "" ? null : Number(inp.value);
      if (v != null && !isNaN(v) && v >= 0 && v <= a.outOf) marks[inp.getAttribute("data-pid")] = v;
    });
    if (!document.querySelector(".pas-in")) return;
    if (JSON.stringify(marks) !== JSON.stringify(a.marks || {})) S().put("assessments", Object.assign({}, a, { marks: marks }));
  }
  A.act["pas-edit"] = function (el) { assessmentModal(S().get("assessments", el.getAttribute("data-id"))); };

  /* ------------------------------------------------------------------ Reports */
  function reportRec(pid, year, term) { return S().get("reports", "rep_" + pid + "_" + year + "_t" + term) || { id: "rep_" + pid + "_" + year + "_t" + term, pupilId: pid, year: String(year), term: Number(term) }; }
  /* ------------------------------------------------------------------ Reports → Top students
     Each form's best ten across all its classes, and each class's best ten, by the average of the term's end-of-term
     marks (js/reportcards.js: every subject with a mark counts, each as a percentage). Equal averages share a
     position, so a tie at tenth shows them all. The head sees every form; a class teacher, their own class. */
  function reportTabs(on, term) {
    var t = term ? "term=" + term : "";
    return '<div class="pill-tabs"><button class="' + (on === "class" ? "on" : "") + '" data-act="goto" data-href="#/t/reports' + (t ? "?" + t : "") + '">Class reports</button>' +
      '<button class="' + (on === "top" ? "on" : "") + '" data-act="goto" data-href="#/t/reports?v=top' + (t ? "&" + t : "") + '">' + I("award") + "Top students</button></div>";
  }
  /** Every pupil's end-of-term average for a term: { pupilId: { avg, n } }. One mark per subject (the latest). */
  function termAverages(year, term) {
    var pre = "rm_" + year + "_t" + term + "_", last = {}, by = {};
    S().filter("reportmarks", function (r) { return r.id.indexOf(pre) === 0 && r.studentId && A.Report.pct(r) != null; }).forEach(function (r) {
      var k = r.studentId + "|" + r.subject;
      if (!last[k] || (r.updatedAt || 0) > (last[k].updatedAt || 0)) last[k] = r;
    });
    Object.keys(last).forEach(function (k) {
      var r = last[k], b = (by[r.studentId] = by[r.studentId] || { sum: 0, n: 0 });
      b.sum += A.Report.pct(r); b.n++;
    });
    Object.keys(by).forEach(function (id) { by[id].avg = Math.round(by[id].sum / by[id].n * 10) / 10; });
    return by;
  }
  function ranked(kids, av) {
    var list = kids.filter(function (u) { return av[u.id]; }).map(function (u) { return { u: u, avg: av[u.id].avg, n: av[u.id].n }; })
      .sort(function (a, b) { return b.avg - a.avg || b.n - a.n || a.u.name.localeCompare(b.u.name); });
    list.forEach(function (x, i) { x.pos = i && x.avg === list[i - 1].avg ? list[i - 1].pos : i + 1; });
    return list;
  }
  function topCard(title, sub, list, classOf) {
    var top = list.filter(function (x) { return x.pos <= 10; });
    return '<div class="card mb top-card"><div class="card-head">' + I("award") + "<h3>" + esc(title) + '</h3><span class="sub">' + esc(sub) + "</span></div>" +
      (top.length ? '<div class="table-wrap"><table class="table"><thead><tr><th class="num">Position</th><th>Pupil</th>' + (classOf ? "<th>Class</th>" : "") +
        '<th class="num">Average</th><th>Grade</th><th class="num">Subjects</th></tr></thead><tbody>' + top.map(function (x) {
          return '<tr class="' + (x.pos <= 3 ? "top-" + x.pos : "") + '"><td class="num tnum"><b>' + x.pos + "</b></td><td><b>" + esc(x.u.name) + "</b></td>" + (classOf ? "<td>" + esc(classOf(x.u)) + "</td>" : "") +
            '<td class="num tnum"><b>' + x.avg + '%</b></td><td>' + esc(A.Report.grade(x.avg)) + '</td><td class="num tnum">' + x.n + "</td></tr>";
        }).join("") + "</tbody></table></div>"
        : '<div class="card-pad" style="padding-top:0"><p class="muted small">No end-of-term marks yet.</p></div>') + "</div>";
  }
  function topView(me, q) {
    var conf = P.conf(), term = Number(q.term) || conf.term, av = termAverages(conf.year, term);
    var classes = homerooms().filter(function (c) { return me.isAdmin || c.teacherId === me.id; });
    var levels = []; classes.forEach(function (c) { var L = c.level || "No grade"; if (levels.indexOf(L) < 0) levels.push(L); });
    var level = levels.indexOf(q.level) >= 0 ? q.level : levels[0];
    var base = "#/t/reports?v=top&term=" + term;
    var html = reportTabs("top", term) + '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Top students · Term ' + term + " " + esc(conf.year) + '</h2><p class="muted">By the average of each pupil\'s end-of-term marks, over the subjects marked.</p></div>' +
      '<select class="select sm" style="width:auto" data-change="ptop-term" data-level="' + esc(level || "") + '" aria-label="Term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select></div>";
    if (!classes.length) return { title: "Reports", html: html + '<div class="card">' + UI.empty("award", "No classes yet", "Classes and their end-of-term marks show here.") + "</div>" };
    if (levels.length > 1) html += '<div class="pill-tabs sub">' + levels.map(function (L) { return '<button class="' + (L === level ? "on" : "") + '" data-act="goto" data-href="' + base + "&level=" + encodeURIComponent(L) + '">' + esc(L) + "</button>"; }).join("") + "</div>";
    var inLevel = classes.filter(function (c) { return (c.level || "No grade") === level; });
    var name = {}; inLevel.forEach(function (c) { P.pupils(c).forEach(function (u) { name[u.id] = c.name; }); });
    var everyone = []; inLevel.forEach(function (c) { P.pupils(c).forEach(function (u) { if (everyone.indexOf(u) < 0) everyone.push(u); }); });
    // the whole form (every stream) for the head, when it has more than one class
    if (me.isAdmin && inLevel.length > 1) html += topCard("Top ten in " + level, "All " + inLevel.length + " classes · " + everyone.length + " pupils", ranked(everyone, av), function (u) { return name[u.id]; });
    inLevel.forEach(function (c) { html += topCard("Top ten in " + c.name, P.pupils(c).length + " pupils", ranked(P.pupils(c), av)); });
    return { title: "Reports", html: html };
  }
  A.act["ptop-term"] = function (el) { location.hash = "#/t/reports?v=top&term=" + el.value + (el.getAttribute("data-level") ? "&level=" + encodeURIComponent(el.getAttribute("data-level")) : ""); };
  A.route("t/reports", function (p, q, me) {
    if (q.v === "top") return topView(me, q);
    var nc = needClass(me, "Reports"); if (nc.view) return nc.view;
    var c = nc.c, conf = P.conf(), term = Number(q.term) || conf.term, kids = P.pupils(c), sc = P.scores(c, conf.year, term);
    var done = kids.filter(function (u) { return reportRec(u.id, conf.year, term).teacherComment; }).length;
    var html = reportTabs("class", term) + '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Term ' + term + " reports · " + esc(c.name) + '</h2><p class="muted">' + done + " of " + kids.length + " have the class teacher's comment</p></div>" +
      '<div class="row wrap">' + classSwitch(me, c, "reports") + '<select class="select sm" style="width:auto" data-change="prep-term" aria-label="Term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select>" +
      // the report cards (js/reportcards.js): PDFs in the desktop app, printed in a browser
      '<button class="btn btn-primary" data-act="rc-make" data-scope="class" data-level="' + esc(c.level || "No grade") + '" data-key="' + esc(c.id) + '">' + I("download") + (window.desktop && window.desktop.reports ? "Make report cards" : "Print all reports") + "</button></div></div>";
    html += '<div class="callout mb">' + I("info") + "<div>Write each pupil's comment, then <b>" + (window.desktop && window.desktop.reports ? "Make report cards" : "Print all reports") + "</b>.</div></div>";
    html += kids.length ? '<div class="card table-wrap"><table class="table"><thead><tr><th>Pupil</th><th class="num">Average</th><th class="num">Position</th><th class="num">Days present</th><th>Teacher\'s comment</th><th></th></tr></thead><tbody>' +
      kids.map(function (u) {
        var s = sc.by[u.id], r = reportRec(u.id, conf.year, term), att = termAttendance(c, u.id, term, conf);
        return "<tr><td><b>" + esc(u.name) + '</b></td><td class="num">' + UI.scoreBadge(s.avg) + '</td><td class="num tnum">' + (s.pos ? s.pos + " / " + sc.ranked : "—") + '</td><td class="num tnum">' + att.present + " / " + att.days + "</td>" +
          '<td class="small">' + (r.teacherComment ? esc(r.teacherComment) : '<span class="muted">Not written yet</span>') + "</td>" +
          '<td class="nowrap"><button class="btn btn-sm" data-act="prep-edit" data-id="' + u.id + '" data-term="' + term + '">' + I("edit") + 'Comments</button> <button class="btn btn-sm btn-ghost" data-act="rc-make" data-scope="student" data-level="' + esc(c.level || "No grade") + '" data-key="' + esc(c.id) + '" data-sid="' + u.id + '">' + I("download") + (window.desktop && window.desktop.reports ? "PDF" : "Print") + "</button></td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="card">' + UI.empty("users", "No pupils yet", "Add your class list first.") + "</div>";
    return { title: "Reports", html: html };
  }, { role: "teacher" });
  A.act["prep-term"] = function (el) { location.hash = "#/t/reports?term=" + el.value; };
  A.act["prep-edit"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), conf = P.conf(), term = Number(el.getAttribute("data-term")), r = reportRec(u.id, conf.year, term), me = M.me();
    UI.modal({
      title: u.name + ": term " + term + " report", size: "wide",
      body: '<form id="prep" class="form-grid"><label class="field full"><span>Class teacher\'s comment</span><textarea class="input" name="teacherComment" rows="3">' + esc(r.teacherComment || "") + "</textarea></label>" +
        '<div class="full row wrap pcomment-bank">' + COMMENTS.map(function (t) { return '<button type="button" class="btn btn-sm btn-ghost" data-act="pcomment" data-t="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div></form>",
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#prep"));
        S().put("reports", Object.assign({}, r, { teacherComment: f.teacherComment.trim(), by: me.id }));
        UI.toast("Saved"); A.render();
      } }],
    });
  };
  A.act.pcomment = function (el) {
    var ta = el.closest("form").querySelector("[name=teacherComment]"), t = el.getAttribute("data-t");
    ta.value = (ta.value.trim() ? ta.value.trim() + " " : "") + t; ta.focus();
  };
  /** One pupil's A4 report. */
  P.reportHtml = function (u, c, term, sc, conf) {
    var b = A.Theme.get(), s = sc.by[u.id] || { area: {} }, r = reportRec(u.id, conf.year, term), att = termAttendance(c, u.id, term, conf), next = conf.terms[term + 1] || {};
    var teacher = M.user(c.teacherId);
    return '<section class="preport">' +
      '<header class="preport-head">' + A.Theme.logoHTML() + '<div class="grow"><h1>' + esc(b.name) + "</h1>" + (b.motto ? "<p>" + esc(b.motto) + "</p>" : "") + "</div>" +
      '<div class="preport-term"><b>Term ' + term + " report</b><span>" + esc(conf.year) + "</span></div></header>" +
      '<table class="preport-who"><tr><th>Pupil</th><td><b>' + esc(u.name) + "</b></td><th>Class</th><td>" + esc(c.name) + "</td></tr>" +
      "<tr><th>Age</th><td>" + (age(u.dob) == null ? "—" : age(u.dob) + " years") + "</td><th>Position</th><td>" + (s.pos ? s.pos + " of " + sc.ranked : "—") + "</td></tr>" +
      "<tr><th>Days present</th><td>" + att.present + " of " + att.days + "</td><th>Average</th><td>" + (s.avg == null ? "—" : s.avg + "%") + "</td></tr></table>" +
      '<table class="preport-marks"><thead><tr><th>Learning area</th><th class="num">Mark</th><th>Achievement</th></tr></thead><tbody>' +
      conf.areas.map(function (a) { var v = s.area[a]; return "<tr><td>" + esc(a) + '</td><td class="num">' + (v == null ? "—" : v + "%") + "</td><td>" + esc(P.descriptor(v, conf)) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<div class="preport-comment"><b>Class teacher\'s comment</b><p>' + esc(r.teacherComment || "") + "</p><span>" + esc(teacher ? teacher.name : "") + " · signature ____________________</span></div>" +
      '<div class="preport-comment preport-sign"><b>Head\'s signature</b>' + (conf.headSig ? '<img src="' + esc(conf.headSig) + '" alt="The head\'s signature">' : "<p>____________________</p>") + "</div>" +
      '<footer class="preport-foot">' + (next.opens ? "Next term begins on " + esc(A.fmtDateLong(Date.parse(next.opens + "T12:00:00"))) + ". " : "") + "Descriptors: " +
      conf.bands.slice().sort(function (a, b2) { return b2[0] - a[0]; }).map(function (x) { return esc(x[1]) + " " + x[0] + "%+"; }).join(", ") + ".</footer></section>";
  };
  A.act["prep-print"] = function (el) {
    var me = M.me(), c = P.cls(me), conf = P.conf(), term = Number(el.getAttribute("data-term")) || conf.term, sc = P.scores(c, conf.year, term), id = el.getAttribute("data-id");
    var kids = P.pupils(c).filter(function (u) { return !id || u.id === id; });
    P.print(kids.map(function (u) { return P.reportHtml(u, c, term, sc, conf); }).join(""));
  };
  /** Print some pages on their own (the app's own page is hidden while printing). */
  P.print = function (html, title) { UI.printSheet({ title: title || "Print", html: html, pageWidth: 718 }); };

  /* ------------------------------------------------------------------ Schemes and records */
  function schemeId(c, area, year, term) { return "sch_" + c.id + "_" + year + "_t" + term + "_" + area.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  /* Schemes & records: the term's work in a learning area (its topics, listed once), each ticked when it is taught
     (the record of work: the date it was taught). schemes record { classId, area, year, term, rows: [{ topic, taught, taughtAt }] }
     (schemes kept before 1.6.2 had a week, objectives, activities, resources and an evaluation per row: their topics show here). */
  /* Whose schemes (2026-10-26): a teacher's own subjects only, in the classes they teach (one subject: no list to
     choose from); admins and the school's leaders also look at every other subject's, in any class, without changing
     them. */
  A.route("t/schemes", function (p, q, me) {
    var conf = P.conf(), term = Number(q.term) || conf.term, viewer = me.isAdmin || P.isLeader(me);
    var teach = P.teachClasses(me, true), all = homerooms();
    // (Subjects by form: a subject of theirs that none of their classes takes isn't listed)
    var own = P.ownAreas(me).filter(function (a) { return !teach.length || teach.some(function (x) { return P.offers(x, a); }); });
    if (!own.length && !viewer) return { title: "Schemes & records", html: '<div class="card">' + UI.empty("book", "No subjects of yours yet", "Your scheme of work is for the subjects you teach. Ask an admin to add yours (My subjects shows them).", '<a class="btn" href="#/t/subjects">' + I("book") + "My subjects</a>") + "</div>" };
    var others = viewer ? conf.areas.filter(function (a) { return own.indexOf(a) < 0; }) : [];
    var area = own.concat(others).indexOf(q.a) >= 0 ? q.a : own[0] || others[0];
    if (!area) return { title: "Schemes & records", html: '<div class="card">' + UI.empty("book", "No subjects yet", "Add the school's subjects in Settings → Subjects and terms.") + "</div>" };
    var mineArea = own.indexOf(area) >= 0, classes = (mineArea && teach.length ? teach : viewer ? all : teach).filter(function (x) { return P.offers(x, area); });
    if (!classes.length) return { title: "Schemes & records", html: '<div class="card">' + UI.empty("users", "No classes yet", "Your scheme of work is kept for each class you teach " + area + " in. Ask an admin to add your classes (My subjects).") + "</div>" };
    var home = P.cls(me), c = classes.filter(function (x) { return x.id === q.c; })[0] || (home && classes.filter(function (x) { return x.id === home.id; })[0]) || classes[0];
    var edit = P.mayMark(me, c.id, area);
    var id = schemeId(c, area, conf.year, term), rows = schemeRowsOf(id), taught = rows.filter(function (r) { return r.taught; }).length;
    var opt = function (a) { var n = schemeRowsOf(schemeId(c, a, conf.year, term)).length; return '<option value="' + esc(a) + '"' + (a === area ? " selected" : "") + ">" + esc(a) + (n ? " (" + n + ")" : "") + "</option>"; };
    var areaPick = own.length + others.length < 2 ? "" : '<select class="select sm" style="width:auto" data-change="psch-go" data-k="a" aria-label="Subject">' +
      (others.length && own.length ? '<optgroup label="Your subjects">' + own.map(opt).join("") + '</optgroup><optgroup label="Other subjects (view only)">' + others.map(opt).join("") + "</optgroup>" : own.concat(others).map(opt).join("")) + "</select>";
    var classPick = classes.length < 2 ? "" : '<select class="select sm" style="width:auto" data-change="psch-go" data-k="c" aria-label="Class">' + classes.map(function (x) { return '<option value="' + x.id + '"' + (x.id === c.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>";
    var who = (A.Tracker && A.Tracker.whoTeaches()[c.id + "|" + area] || []).map(function (uid) { var u = M.user(uid); return u ? u.name : ""; }).filter(Boolean);
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Scheme of work · ' + esc(area) + '</h2><p class="muted">' + esc(c.name) + " · Term " + term + " " + esc(conf.year) + (rows.length ? " · " + taught + " of " + rows.length + " topics taught" : "") + "</p></div>" +
      '<div class="row wrap" id="psch-picks" data-a="' + esc(area) + '" data-c="' + esc(c.id) + '" data-term="' + term + '">' + classPick +
      '<select class="select sm" style="width:auto" data-change="psch-go" data-k="term" aria-label="Term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select>" +
      areaPick + (rows.length ? '<button class="btn" data-act="psch-print">' + I("download") + "Print</button>" : "") + "</div></div>";
    if (!edit) html += '<div class="callout mb">' + I("eye") + "<div>View only: " + esc(area) + " in " + esc(c.name) + (who.length ? " is " + esc(who.join(" and ")) + "'s to plan and tick" : " has no teacher on record yet") + ".</div></div>";
    html += '<div class="card" id="psch" data-id="' + esc(id) + '" data-class="' + esc(c.id) + '" data-area="' + esc(area) + '" data-term="' + term + '">' +
      '<div class="card-head">' + I("book") + "<h3>Term " + term + " work</h3>" + (rows.length && edit ? '<span class="grow"></span><span class="muted small">Tick each topic when it has been taught</span>' : "") + "</div>" +
      (rows.length ? rows.map(function (r, i) {
        return '<div class="list-row psch-topic' + (r.taught ? " done" : "") + '"><label class="row grow" style="gap:10px;' + (edit ? "cursor:pointer" : "") + '"><input type="checkbox"' + (edit ? ' data-change="psch-tick" data-i="' + i + '"' : " disabled") + (r.taught ? " checked" : "") + ' aria-label="Taught">' +
          '<span class="grow"><span class="title">' + esc(r.topic) + "</span>" + (r.taught ? '<span class="meta"> · taught' + (r.taughtAt ? " " + esc(A.fmtDate(Date.parse(r.taughtAt + "T12:00:00"))) : "") + "</span>" : "") + "</span></label>" +
          (edit ? '<button class="btn btn-ghost btn-icon btn-sm" data-act="psch-del" data-i="' + i + '" aria-label="Remove ' + esc(r.topic) + '">' + I("trash") + "</button>" : "") + "</div>";
      }).join("") : edit ? "" : '<div class="card-pad"><p class="muted small">No topics planned for this term yet.</p></div>') +
      (edit ? '<div class="card-pad"><label class="field"><span>' + (rows.length ? "More topics" : "This term's topics in " + esc(area)) + ' <span class="muted">(one per line, or paste a list)</span></span>' +
        '<textarea class="input" id="psch-new" rows="' + (rows.length ? 2 : 6) + '" placeholder="e.g. Fractions&#10;Decimals&#10;Measurement"></textarea></label>' +
        '<div class="row mt-sm"><button class="btn btn-primary" data-act="psch-add">' + I("plus") + "Add the topics</button></div></div>" : "") + "</div>";
    return { title: "Schemes & records", html: html };
  }, { role: "teacher" });
  /** Only the subject's own teacher, in a class they teach, changes its scheme (the page shows the rest view only). */
  function schemeMine(x) { return !!x && P.mayMark(M.me(), x.classId, x.area); }
  function schemeRowsOf(id) { var r = S().get("schemes", id); return ((r && r.rows) || []).filter(function (x) { return x && String(x.topic || "").trim(); }); }
  function schemeHere() {
    var t = document.getElementById("psch");
    return t ? { id: t.getAttribute("data-id"), classId: t.getAttribute("data-class"), area: t.getAttribute("data-area"), term: Number(t.getAttribute("data-term")) } : null;
  }
  function putScheme(x, rows) {
    var cur = S().get("schemes", x.id);
    S().put("schemes", Object.assign({}, cur || { id: x.id }, { classId: x.classId, area: x.area, year: P.conf().year, term: x.term, rows: rows }));
  }
  A.act["psch-add"] = function () {
    var x = schemeHere(), box = document.getElementById("psch-new"); if (!schemeMine(x) || !box) return;
    var add = box.value.split(/\r?\n/).map(function (s) { return s.replace(/^\s*[-•*\d.)]+\s*/, "").trim().slice(0, 200); }).filter(Boolean), rows = schemeRowsOf(x.id), n = 0;
    if (!add.length) { UI.toast("Type the topics, one per line", "bad"); box.focus(); return; }
    add.forEach(function (t) { if (!rows.some(function (r) { return r.topic.toLowerCase() === t.toLowerCase(); })) { rows.push({ topic: t, taught: false }); n++; } });
    putScheme(x, rows);
    UI.toast(n ? n + " topic" + (n === 1 ? "" : "s") + " added" : "Those topics are already there");
    A.render();
  };
  A.act["psch-tick"] = function (el) {
    var x = schemeHere(); if (!schemeMine(x)) return;
    var rows = schemeRowsOf(x.id), r = rows[Number(el.getAttribute("data-i"))]; if (!r) return;
    r.taught = el.checked; r.taughtAt = el.checked ? A.isoDate() : "";
    putScheme(x, rows);
    A.render();
  };
  A.act["psch-del"] = function (el) {
    var x = schemeHere(); if (!schemeMine(x)) return;
    var rows = schemeRowsOf(x.id), i = Number(el.getAttribute("data-i")), r = rows[i]; if (!r) return;
    UI.confirm("Remove " + r.topic + " from this term's work?", { danger: true, ok: "Remove" }).then(function (ok) { if (!ok) return; rows.splice(i, 1); putScheme(x, rows); A.render(); });
  };
  // the class, term or subject chosen: the page again with the others kept
  A.act["psch-go"] = function (el) {
    var box = document.getElementById("psch-picks"); if (!box) return;
    var v = { c: box.getAttribute("data-c"), term: box.getAttribute("data-term"), a: box.getAttribute("data-a") };
    v[el.getAttribute("data-k")] = el.value;
    location.hash = "#/t/schemes?c=" + encodeURIComponent(v.c) + "&term=" + v.term + "&a=" + encodeURIComponent(v.a);
  };
  A.act["psch-print"] = function () {
    var x = schemeHere(); if (!x) return;
    var c = S().get("classes", x.classId), conf = P.conf(), rows = schemeRowsOf(x.id), b = A.Theme.get();
    P.print('<section class="preport pscheme"><header class="preport-head">' + A.Theme.logoHTML() + '<div class="grow"><h1>' + esc(b.name) + "</h1><p>Scheme of work and record of work</p></div>" +
      '<div class="preport-term"><b>' + esc(x.area) + "</b><span>" + esc(c ? c.name : "") + " · Term " + x.term + " " + esc(conf.year) + "</span></div></header>" +
      '<table class="preport-marks"><thead><tr><th>#</th><th>Topic</th><th>Taught</th><th>Date</th></tr></thead><tbody>' +
      rows.map(function (r, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(r.topic) + "</td><td>" + (r.taught ? "✓" : "") + "</td><td>" + (r.taughtAt ? esc(A.fmtDate(Date.parse(r.taughtAt + "T12:00:00"))) : "") + "</td></tr>"; }).join("") +
      "</tbody></table></section>");
  };

  /* ------------------------------------------------------------------ Timetable
     Each class's week: which learning area in each period, and who teaches it (the class teacher, unless the head
     names another teacher for that lesson, e.g. PE or ICT). The head opens a form (Form 1, Form 2…), then one of its
     classes, and sets that class's week; a form without a class yet can have one added there. "My timetable" is every
     lesson a teacher gives, in any class, each with its form and class (on a phone, a list day by day). The head chooses how it works (settings "ttmode", shared with js/timetable.js): the same every week, one
     for each month, or one for each term; a month or term without its own uses the usual week. Bell times: the
     school's (settings "bells", js/timetable.js's Bell times), primary-school periods until the head sets them.
     Slots are "timetable" records { classId, day 1–5, periodId, area, teacherId, room, scope }. */
  P.BELLS = [
    { id: "p1", label: "1", start: "07:30", end: "08:05" }, { id: "p2", label: "2", start: "08:05", end: "08:40" }, { id: "p3", label: "3", start: "08:40", end: "09:15" },
    { id: "brk", label: "Break", start: "09:15", end: "09:45", isBreak: true }, { id: "p4", label: "4", start: "09:45", end: "10:20" }, { id: "p5", label: "5", start: "10:20", end: "10:55" },
    { id: "p6", label: "6", start: "10:55", end: "11:30" }, { id: "lun", label: "Lunch", start: "11:30", end: "12:15", isBreak: true }, { id: "p7", label: "7", start: "12:15", end: "12:50" },
    { id: "p8", label: "8", start: "12:50", end: "13:25" },
  ];
  var TT_MODES = { week: "Week by week", month: "Monthly", term: "By term" };
  var WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  function ttMode() { var m = A.TT ? A.TT.mode() : "week"; return TT_MODES[m] ? m : "week"; }
  var monthKey = function (d) { return "m:" + d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); };
  /** The timetable shown: { key (null = the usual week), label, nav (moving between months or terms), now (it is the current one) }. */
  function ttShown(q, base) {
    var mode = ttMode(), conf = P.conf();
    if (mode === "month") {
      var mo = Number(q.m) || 0, d = A.date(); d.setDate(15); d.setMonth(d.getMonth() + mo);
      var key = monthKey(d);
      return { key: key, now: mo === 0, label: A.TT.keyLabel(key), nav: '<div class="seg">' + [[mo - 1, I("left") + "Previous"], [0, "This month"], [mo + 1, "Next " + I("right")]].map(function (x) {
        return '<button class="' + (x[0] === mo && x[0] === 0 ? "on" : "") + '" data-act="goto" data-href="' + base + "&m=" + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" };
    }
    if (mode === "term") {
      var t = [1, 2, 3].indexOf(Number(q.t)) >= 0 ? Number(q.t) : conf.term;
      return { key: "t:Term " + t, now: t === conf.term, label: "Term " + t, nav: '<div class="seg">' + [1, 2, 3].map(function (n) {
        return '<button class="' + (n === t ? "on" : "") + '" data-act="goto" data-href="' + base + "&t=" + n + '">Term ' + n + "</button>"; }).join("") + "</div>" };
    }
    return { key: null, now: true, label: "Every week", nav: "" };
  }
  /** The key in force today (for Today's lessons). */
  function ttKeyNow() { var m = ttMode(); return m === "month" ? monthKey(A.date()) : m === "term" ? "t:Term " + P.conf().term : null; }
  function homerooms() { return S().filter("classes", function (c) { return c.homeroom; }).sort(function (a, b) { return M.levelIndex(a.level) - M.levelIndex(b.level) || a.name.localeCompare(b.name); }); }
  function hasOwn(classId, key) { return !!key && S().filter("timetable", function (s) { return s.classId === classId && s.scope === key; }).length > 0; }
  /** A class's lessons in force for `key`: its own for that month or term, or else its usual week. */
  function slotsOf(classId, key) {
    var all = S().filter("timetable", function (s) { return s.classId === classId; });
    var own = key ? all.filter(function (s) { return s.scope === key; }) : [];
    return own.length ? own : all.filter(function (s) { return !s.scope; });
  }
  var teacherOf = function (s, c) { return s.teacherId || (c && c.teacherId) || null; };
  /** A lesson's room, for staff only: students hear theirs from the teacher. */
  var roomOf = function (s) { var me = M.me(); return me && me.role === "teacher" ? s.room || "" : ""; };
  /** "Form 1A", or "Form 1 · Lions" when the class's name doesn't say its form. */
  P.homerooms = homerooms;
  var classLabel = function (c) { return !c ? "" : !c.level || String(c.name || "").indexOf(c.level) === 0 ? c.name : c.level + " · " + c.name; };
  P.classLabel = function (c) { return classLabel(c); };
  /** Every lesson a teacher gives, in any class. */
  function lessonsOf(me, key) {
    var out = [];
    homerooms().forEach(function (c) { slotsOf(c.id, key).forEach(function (s) { if (teacherOf(s, c) === me.id) out.push({ s: s, c: c }); }); });
    return out;
  }
  /* ---- The school day (1.6.2, ECS): it starts and ends at the school's times, with a normal period of 30 to 45 minutes and
     the breaks where the school has them; the timetable's columns come from it. Each lesson has its own start and is a
     half period (15 to 22 minutes), a period, or a double period (one to two hours, as wide as its two periods).
     Settings "schoolday": { start, end, period (minutes), breaks: [{ label, start, mins }] }; a school without one: its
     bell times. A lesson: { classId, day, start: "08:10", mins, area, teacherId, room, scope }; lessons from before
     1.6.2 have a periodId instead, and keep that period's times. */
  var hhmm = function (m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  P.schoolDay = function () {
    var r = S().get("settings", "schoolday");
    if (r && r.start && r.end && r.period) return { start: r.start, end: r.end, period: Number(r.period), breaks: (r.breaks || []).slice().sort(function (a, b) { return A.hm(a.start) - A.hm(b.start); }) };
    var bells = A.TT.bells(), lens = {}, best = 40, n = 0;
    bells.forEach(function (b) { if (b.isBreak) return; var m = A.hm(b.end) - A.hm(b.start); lens[m] = (lens[m] || 0) + 1; if (lens[m] > n) { n = lens[m]; best = m; } });
    return { start: bells.length ? bells[0].start : "07:30", end: bells.length ? bells.at(-1).end : "13:30", period: best,
      breaks: bells.filter(function (b) { return b.isBreak; }).map(function (b) { return { label: b.label, start: b.start, mins: A.hm(b.end) - A.hm(b.start) }; }) };
  };
  /** The day's columns (minutes from midnight): periods of the normal length from the start, and the breaks where they
      fall (a period cut short by a break is shorter). */
  P.dayColumns = function (sd) {
    sd = sd || P.schoolDay();
    var t = A.hm(sd.start), end = A.hm(sd.end), out = [];
    var brks = sd.breaks.map(function (b) { var s0 = A.hm(b.start); return { label: b.label || "Break", start: s0, end: s0 + Number(b.mins || 0) }; }).filter(function (b) { return b.end > b.start; });
    for (var i = 0; t < end && i < 80; i++) {
      var b = brks.filter(function (x) { return x.start <= t && x.end > t; })[0];
      if (b) { out.push({ isBreak: true, label: b.label, start: t, end: Math.min(b.end, end) }); t = Math.min(b.end, end); continue; }
      var stop = Math.min.apply(null, brks.filter(function (x) { return x.start > t; }).map(function (x) { return x.start; }).concat([end, t + sd.period]));
      out.push({ start: t, end: stop }); t = stop;
    }
    return out;
  };
  /** The lengths a lesson can be: [key, name, minutes]. */
  P.lengths = function (sd) { sd = sd || P.schoolDay(); return [["half", "Half period", Math.round(sd.period / 2)], ["single", "Period", sd.period], ["double", "Double period", sd.period * 2]]; };
  /** A lesson's start and length in minutes: its own, or its period's from the bell times; null when it has neither. */
  function slotTime(s) {
    if (s.start) return { start: A.hm(s.start), mins: Number(s.mins) || P.schoolDay().period };
    var p = s.periodId && A.TT.period(s.periodId);
    return p ? { start: A.hm(p.start), mins: A.hm(p.end) - A.hm(p.start) } : null;
  }
  P.slotTime = slotTime;
  var U = 5; // the grid's step in minutes: each lesson is as wide as its time
  /** The week as a table, the way the school writes it: the days down the side, the times across, a break or lunch one
      column down the week, each lesson as wide as its time (the same lesson in the next period too: one cell). While it
      is edited, each free time is a cell to click, and each lesson shows its times. Every row keeps its height (a little
      taller on a bigger screen) and a lesson's words get smaller to fit its box (UI.fitText, [data-fit]), so a long
      subject or name never stretches the week. */
  function ttTable(entries, o) {
    var today = A.date().getDay(), sd = P.schoolDay(), cols = P.dayColumns(sd), day0 = cols.length ? cols[0].start : A.hm(sd.start), dayEnd = cols.length ? cols.at(-1).end : A.hm(sd.end);
    var w = function (m) { return Math.max(1, Math.round(m / U)); };
    var brks = cols.filter(function (c) { return c.isBreak; }), bounds = cols.map(function (c) { return c.end; });
    var same = function (list) { return list.map(function (e) { return [e.s.area, teacherOf(e.s, e.c), e.s.room || "", e.c ? e.c.id : ""].join("|"); }).sort().join("#"); };
    var inner = function (list) {
      return list.map(function (e) {
        var t = M.user(teacherOf(e.s, e.c)), other = e.c && t && t.id !== e.c.teacherId;
        return '<div class="tt-lesson"><b>' + esc(e.s.area) + "</b><span>" + esc(o.mine ? classLabel(e.c) : other ? t.name : "") + (roomOf(e.s) ? (o.mine || other ? " · " : "") + esc(roomOf(e.s)) : "") + "</span></div>";
      }).join("");
    };
    var head = '<tr><th class="tt-corner">Day</th>' + cols.map(function (c) {
      return '<th colspan="' + w(c.end - c.start) + '" class="' + (c.isBreak ? "tt-brk-h" : "") + '"><span>' + hhmm(c.start) + "</span><span>" + hhmm(c.end) + "</span></th>";
    }).join("") + "</tr>";
    var body = WEEKDAYS.map(function (d, i) {
      var day = i + 1, row = '<tr class="' + (o.now && day === today ? "today" : "") + '"><th>' + d + "</th>";
      var mine = entries.map(function (e) { var tm = e.s.day === day && slotTime(e.s); return tm ? { e: e, start: tm.start, end: tm.start + tm.mins } : null; }).filter(Boolean);
      var startsAfter = function (t) { return Math.min.apply(null, mine.filter(function (x) { return x.start > t; }).map(function (x) { return x.start; }).concat([dayEnd])); };
      for (var t = day0, guard = 0; t < dayEnd && guard < 400; guard++) {
        var b = brks.filter(function (x) { return x.start <= t && x.end > t; })[0];
        if (b) { if (!i) row += '<td class="tt-brk" colspan="' + w(b.end - b.start) + '" rowspan="' + WEEKDAYS.length + '"><span class="tt-brk-label" data-fit="13" style="height:calc(var(--tt-row) * ' + WEEKDAYS.length + ' - 16px)">' + esc(b.label) + "</span></td>"; t = b.end; continue; }
        var nextBreak = Math.min.apply(null, brks.filter(function (x) { return x.start > t; }).map(function (x) { return x.start; }).concat([dayEnd]));
        var here = mine.filter(function (x) { return x.start === t; });
        if (here.length) {
          var group = here.map(function (x) { return x.e; }), end = Math.min(Math.max.apply(null, here.map(function (x) { return x.end; })), nextBreak);
          if (!o.edit) for (var k = 0; k < 8 && end < nextBreak; k++) {
            var next = mine.filter(function (x) { return x.start === end; });
            if (!next.length || same(next.map(function (x) { return x.e; })) !== same(group)) break;
            end = Math.min(Math.max.apply(null, next.map(function (x) { return x.end; })), nextBreak);
          }
          row += '<td class="tt-cell' + (o.edit ? " edit" : "") + (end - t > sd.period ? " long" : "") + '" colspan="' + w(end - t) + '"' +
            (o.edit ? ' data-act="ptt-lesson" data-id="' + here[0].e.s.id + '" data-class="' + o.classId + '" data-key="' + esc(o.key || "") + '" tabindex="0" role="button"' : "") + '><div class="tt-box" data-fit>' + inner(group) +
            (o.edit ? '<span class="tt-when">' + hhmm(t) + "–" + hhmm(end) + "</span>" : "") + "</div></td>";
          t = end; continue;
        }
        // free: up to the next lesson, the end of this period, or the next break
        var stop = Math.min(startsAfter(t), Math.min.apply(null, bounds.filter(function (x) { return x > t; }).concat([dayEnd])), nextBreak);
        row += '<td class="tt-cell free' + (o.edit ? " edit" : "") + '" colspan="' + w(stop - t) + '"' +
          (o.edit ? ' data-act="ptt-cell" data-class="' + o.classId + '" data-day="' + day + '" data-start="' + hhmm(t) + '" data-key="' + esc(o.key || "") + '" tabindex="0" role="button" aria-label="Add a lesson, ' + d + " " + hhmm(t) + '"' : "") + '><div class="tt-box">' +
          (o.edit ? '<span class="tt-empty">' + I("plus") + "</span>" : "") + "</div></td>";
        t = stop;
      }
      return row + "</tr>";
    }).join("");
    return '<table class="tt tt-days"><colgroup><col class="tt-daycol">' + new Array(w(dayEnd - day0) + 1).join("<col>") + "</colgroup><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
  }
  function ttGrid(entries, o) {
    return '<div class="table-wrap' + (o.edit ? "" : " tt-wide") + '">' + ttTable(entries, o) + "</div>" + (o.edit ? "" : ttList(entries, o));
  }
  /** The same lessons as a list, day by day: what a phone shows instead of the wide grid. */
  function ttList(entries, o) {
    var today = A.date().getDay(), sd = P.schoolDay();
    return '<div class="tt-list">' + WEEKDAYS.map(function (d, i) {
      var list = entries.map(function (e) { var tm = e.s.day === i + 1 && slotTime(e.s); return tm ? { e: e, tm: tm } : null; }).filter(Boolean).sort(function (a, b) { return a.tm.start - b.tm.start; });
      if (!list.length) return "";
      return '<div class="tt-day' + (o.now && i + 1 === today ? " today" : "") + '"><h4>' + d + (o.now && i + 1 === today ? ' <span class="badge brand">Today</span>' : "") + "</h4>" + list.map(function (x) {
        var e = x.e, t = M.user(teacherOf(e.s, e.c)), other = e.c && t && t.id !== e.c.teacherId;
        var kind = x.tm.mins >= sd.period * 1.5 ? "Double period" : x.tm.mins <= sd.period * 0.6 ? "Half period" : "";
        return '<div class="tt-row"><div class="tt-time"><b>' + hhmm(x.tm.start) + "</b><span>" + hhmm(x.tm.start + x.tm.mins) + '</span></div><div class="grow"><b>' + esc(e.s.area) + "</b>" + (kind ? ' <span class="badge">' + kind + "</span>" : "") +
          '<div class="small muted">' + esc([o.mine ? classLabel(e.c) : other ? t.name : "", roomOf(e.s)].filter(Boolean).join(" · ")) + "</div></div></div>";
      }).join("") + "</div>";
    }).join("") + "</div>";
  }
  /** A class's week as it is now, to look at (a School edition student's Timetable, js/timetable.js); "" with no lessons. */
  P.classWeek = function (c) {
    var entries = c ? slotsOf(c.id, ttKeyNow()).map(function (s) { return { s: s, c: c }; }) : [];
    return entries.length ? ttGrid(entries, { now: true }) : "";
  };
  A.route("t/timetable", function (p, q, me) {
    var mode = ttMode(), all = homerooms();
    // a teacher sees the classes they teach in; the head sees every class
    var mineIds = {}; lessonsOf(me, null).forEach(function (e) { mineIds[e.c.id] = 1; });
    var classes = all.filter(function (c) { return me.isAdmin || c.teacherId === me.id || mineIds[c.id]; });
    // forms with a class this person may open (an admin sees every form, to add its first class)
    var levels = M.structure().levels.filter(function (L) { return me.isAdmin || classes.some(function (c) { return c.level === L; }); });
    classes.forEach(function (c) { if (c.level && levels.indexOf(c.level) < 0) levels.push(c.level); });
    var cur = q.c && classes.some(function (c) { return c.id === q.c; }) ? M.cls(q.c) : null;
    var form = cur ? cur.level : levels.indexOf(q.f) >= 0 ? q.f : null;
    var inForm = form ? classes.filter(function (c) { return c.level === form; }).sort(function (a, b) { return M.streamIndex(a.stream) - M.streamIndex(b.stream) || a.name.localeCompare(b.name); }) : [];
    if (form && !cur && inForm.length === 1) cur = inForm[0]; // one class in the form: straight to it
    var base = "#/t/timetable?" + (cur ? "c=" + cur.id : form ? "f=" + encodeURIComponent(form) : "v=mine") + (q.e === "1" ? "&e=1" : "");
    var shown = ttShown(q, base), edit = !!(me.isAdmin && cur && q.e === "1");
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Timetable</h2><p class="muted">' + esc(TT_MODES[mode]) + (shown.key ? " · " + esc(shown.label) : "") + "</p></div>" +
      (me.isAdmin ? '<div class="seg" role="group" aria-label="How the timetable works">' + Object.keys(TT_MODES).map(function (m) { return '<button class="' + (m === mode ? "on" : "") + '" data-act="ptt-mode" data-mode="' + m + '">' + esc(TT_MODES[m]) + "</button>"; }).join("") + "</div>" : "") + "</div>";
    html += '<div class="pill-tabs"><button class="' + (!form ? "on" : "") + '" data-act="goto" data-href="#/t/timetable?v=mine">My timetable</button>' +
      levels.map(function (L) { return '<button class="' + (form === L ? "on" : "") + '" data-act="goto" data-href="#/t/timetable?f=' + encodeURIComponent(L) + '">' + esc(L) + "</button>"; }).join("") + "</div>";
    if (form && (inForm.length > 1 || me.isAdmin)) html += '<div class="pill-tabs sub">' + inForm.map(function (c) {
      return '<button class="' + (cur && cur.id === c.id ? "on" : "") + '" data-act="goto" data-href="#/t/timetable?c=' + c.id + '">' + esc(c.name) + "</button>";
    }).join("") + (me.isAdmin ? '<button data-act="ptt-addclass" data-level="' + esc(form) + '">' + I("plus") + "Add a class</button>" : "") + "</div>";
    if (shown.nav) html += '<div class="row wrap mb">' + shown.nav + "</div>";
    if (form && !cur) {
      if (inForm.length) html += '<div class="row wrap mb"><span class="grow"></span><button class="btn" data-act="ptt-print" data-scope="form" data-level="' + esc(form) + '" data-key="' + esc(shown.key || "") + '">' + I("download") + "Print every " + esc(form) + " class</button></div>";
      html += '<div class="card">' + (inForm.length ? UI.empty("grid", "Choose a class", "Pick one of " + form + "'s classes above to see its timetable.")
        : UI.empty("grid", "No " + form + " class yet", me.isAdmin ? "Add one (its stream and class teacher), then set its timetable." : "", me.isAdmin ? '<button class="btn btn-primary" data-act="ptt-addclass" data-level="' + esc(form) + '">' + I("plus") + "Add a " + esc(form) + " class</button>" : "")) + "</div>";
      return { title: "Timetable", html: html };
    }
    if (!cur) {
      var mine = lessonsOf(me, shown.key);
      if (mine.length) html += '<div class="row wrap mb"><span class="grow"></span><button class="btn" data-act="ptt-print" data-scope="mine" data-key="' + esc(shown.key || "") + '">' + I("download") + "Print my timetable</button></div>";
      html += mine.length ? '<div class="card">' + ttGrid(mine, { mine: true, now: shown.now }) + "</div>"
        : '<div class="card">' + UI.empty("grid", "No lessons yet", me.isAdmin ? "Open a form above, then a class, and choose Edit to set its timetable." : "The head sets up each class's timetable; your lessons show here, with their form and class.") + "</div>";
      return { title: "Timetable", html: html };
    }
    var t = M.user(cur.teacherId), own = shown.key && hasOwn(cur.id, shown.key);
    html += '<div class="row wrap mb"><h3 style="font-size:17px">' + esc(classLabel(cur)) + '</h3><span class="muted small">' + (t ? "Class teacher: " + esc(t.name) : "") + '</span><span class="grow"></span>' +
      (edit ? "" : '<button class="btn" data-act="ptt-print" data-scope="class" data-class="' + cur.id + '" data-key="' + esc(shown.key || "") + '">' + I("download") + "Print</button>") +
      (me.isAdmin ? (edit ? '<button class="btn" data-act="ptt-day">' + I("clock") + 'School day</button><a class="btn btn-primary" href="#/t/timetable?c=' + cur.id + '">' + I("check") + "Done</a>"
        : '<a class="btn btn-primary" href="#/t/timetable?c=' + cur.id + '&e=1">' + I("edit") + "Edit</a>") : "") + "</div>";
    if (me.isAdmin && shown.key) html += '<div class="callout mb">' + I("info") + '<div class="grow">' + (own ? esc(shown.label) + " has its own timetable for " + esc(cur.name) + "." : esc(shown.label) + " uses the usual week for " + esc(cur.name) + ".") + "</div>" +
      (own ? '<button class="btn btn-sm" data-act="ptt-drop" data-class="' + cur.id + '" data-key="' + esc(shown.key) + '">Use the usual week</button>'
        : '<button class="btn btn-sm btn-primary" data-act="ptt-make" data-class="' + cur.id + '" data-key="' + esc(shown.key) + '">' + I("plus") + "Make one for " + esc(shown.label) + "</button>") + "</div>";
    var entries = slotsOf(cur.id, shown.key).map(function (s) { return { s: s, c: cur }; });
    html += '<div class="card">' + ttGrid(entries, { edit: edit, classId: cur.id, key: shown.key, now: shown.now }) + "</div>";
    if (edit) html += '<p class="small muted mt">Click a free time to add a lesson (a half period, a period or a double period, from the time you choose), or a lesson to change it. The columns come from the school day.</p>';
    return { title: "Timetable", html: html };
  }, { role: "teacher" });

  function copyWeek(classId, key) {
    S().filter("timetable", function (s) { return s.classId === classId && !s.scope; }).forEach(function (s) {
      S().put("timetable", Object.assign({}, s, { id: A.uid("tt"), scope: key, copiedFrom: s.id }));
    });
  }
  /** A lesson in a class's week, new (a click on a free time) or changed (a click on it): its subject, teacher, room,
      start and length. It must fit in the school day and not run into a break or another lesson of the class (two at
      the same start and length, such as two options, may share the time). */
  function lessonModal(c, day, key, slot, startText) {
    var conf = P.conf(), sd = P.schoolDay(), lens = P.lengths(sd), tm = slot ? slotTime(slot) : null, cols = P.dayColumns(sd);
    var start = tm ? hhmm(tm.start) : startText, mins = tm ? tm.mins : sd.period, day0 = A.hm(sd.start), dayEnd = cols.length ? cols.at(-1).end : A.hm(sd.end);
    var staff = S().filter("users", function (u) { return u.role === "teacher" && u.status !== "pending" && u.status !== "declined" && !u.leftAt; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var subj = P.levelAreas(c.level), tid0 = slot ? teacherOf(slot, c) : c.teacherId, area0 = slot ? slot.area : "";
    if (area0 && conf.areas.indexOf(area0) >= 0 && subj.indexOf(area0) < 0) subj = subj.concat([area0]);
    var listed = subj.indexOf(area0) >= 0;
    var clashOf = function (tid, st, en) {
      var other = null;
      homerooms().forEach(function (c2) {
        if (other || c2.id === c.id) return;
        slotsOf(c2.id, key).forEach(function (s) { var t2 = slotTime(s); if (!other && t2 && s.day === day && teacherOf(s, c2) === tid && st < t2.start + t2.mins && en > t2.start) other = { c: c2, t: t2 }; });
      });
      var u = M.user(tid);
      return other && u ? u.name + " teaches " + other.c.name + " then (" + hhmm(other.t.start) + "–" + hhmm(other.t.start + other.t.mins) + ")." : "";
    };
    UI.modal({
      title: c.name + " · " + WEEKDAYS[day - 1], sub: (slot ? "Change this lesson" : "A new lesson") + (key ? " · " + A.TT.keyLabel(key) : "") + " · the school day " + sd.start + " to " + sd.end,
      body: '<form id="ptt-form" class="form-grid"><label class="field"><span>Subject</span><select class="select" name="area">' + subj.map(function (a) { return "<option" + (a === area0 ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("") + '<option value=""' + (area0 && !listed ? " selected" : "") + ">Something else…</option></select></label>" +
        '<label class="field"><span>Or type it</span><input class="input" name="other" value="' + esc(area0 && !listed ? area0 : "") + '" placeholder="e.g. Assembly, LAB, Library"></label>' +
        '<label class="field"><span>Starts</span><input class="input" type="time" step="300" name="start" value="' + esc(start) + '"></label>' +
        '<label class="field"><span>Length</span><select class="select" name="mins">' + lens.map(function (l) { return '<option value="' + l[2] + '"' + (l[2] === mins ? " selected" : "") + ">" + l[1] + " (" + l[2] + " min)</option>"; }).join("") +
          (lens.some(function (l) { return l[2] === mins; }) ? "" : '<option value="' + mins + '" selected>' + mins + " min</option>") + "</select></label>" +
        '<label class="field"><span>Teacher</span><select class="select" name="teacherId">' + staff.map(function (u) { return '<option value="' + u.id + '"' + (u.id === tid0 ? " selected" : "") + ">" + esc(u.name) + (u.id === c.teacherId ? " (class teacher)" : "") + "</option>"; }).join("") +
        '</select><span class="hint" id="ptt-who"></span></label>' +
        '<label class="field"><span>Room <span class="muted">(optional)</span></span><input class="input" name="room" value="' + esc(slot && slot.room ? slot.room : "") + '" placeholder="e.g. Computer lab"></label></form>' +
        '<p class="small muted mt-sm" id="ptt-ends"></p><p class="small bad-text" id="ptt-clash"></p>',
      foot: (slot ? [{ label: "Remove", cls: "btn-danger", onClick: function () { S().remove("timetable", slot.id); UI.toast("Lesson removed"); A.render(); } }] : []).concat([{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#ptt-form")), area = (f.other || "").trim() || f.area, st = A.hm(f.start), len = Number(f.mins), en = st + len;
        if (!area) { UI.toast("Choose a subject or type one", "bad"); return false; }
        if (!f.start || st < day0 || en > dayEnd) { UI.toast("It must be in the school day, " + sd.start + " to " + hhmm(dayEnd), "bad"); return false; }
        var brk = cols.filter(function (x) { return x.isBreak && st < x.end && en > x.start; })[0];
        if (brk) { UI.toast("It runs into " + brk.label + " (" + hhmm(brk.start) + "–" + hhmm(brk.end) + "): start it after, or make it shorter", "bad"); return false; }
        var hit = S().filter("timetable", function (s) { return s.classId === c.id && s.day === day && (s.scope || null) === key && (!slot || s.id !== slot.id); }).filter(function (s) {
          var t2 = slotTime(s); return t2 && st < t2.start + t2.mins && en > t2.start && !(t2.start === st && t2.mins === len);
        })[0];
        if (hit) { var ht = slotTime(hit); UI.toast("It overlaps " + hit.area + " (" + hhmm(ht.start) + "–" + hhmm(ht.start + ht.mins) + ")", "bad"); return false; }
        S().put("timetable", Object.assign({}, slot || { id: A.uid("tt"), classId: c.id, day: day, scope: key || undefined },
          { start: hhmm(st), mins: len, periodId: null, area: area.slice(0, 60), teacherId: f.teacherId || c.teacherId || null, room: (f.room || "").trim().slice(0, 40) }));
        UI.toast(c.name + ": " + area + ", " + WEEKDAYS[day - 1] + " " + hhmm(st) + "–" + hhmm(en));
        A.render();
      } }]),
      onMount: function (m) {
        var f = m.querySelector("#ptt-form"), sel = f.teacherId, note = m.querySelector("#ptt-clash"), who = m.querySelector("#ptt-who"), ends = m.querySelector("#ptt-ends");
        var check = function () {
          var st = A.hm(f.start.value), en = st + Number(f.mins.value);
          ends.textContent = f.start.value ? "From " + hhmm(st) + " to " + hhmm(en) + "." : "";
          note.textContent = f.start.value ? clashOf(sel.value, st, en) : "";
        };
        // the teachers who teach the chosen subject (People → their subjects) come first, and one of them is picked
        var subject = function (keep) {
          var area = (f.other.value || "").trim() || f.area.value;
          Array.prototype.forEach.call(sel.options, function (op) {
            var u = M.user(op.value), teaches = !!(u && Array.isArray(u.areas) && u.areas.indexOf(area) >= 0);
            if (!u) return;
            op.textContent = u.name + (u.id === c.teacherId ? " (class teacher)" : "") + (teaches ? " · teaches " + area : "");
            op.dataset.teaches = teaches ? "1" : "";
          });
          var opts = Array.prototype.slice.call(sel.options), fit = opts.filter(function (op) { return op.dataset.teaches; });
          fit.concat(opts.filter(function (op) { return !op.dataset.teaches; })).forEach(function (op) { sel.appendChild(op); });
          var picked = sel.options[sel.selectedIndex];
          if (!keep && fit.length && (!picked || !picked.dataset.teaches)) sel.value = fit[0].value;
          who.textContent = fit.length ? fit.length + " teacher" + (fit.length === 1 ? " teaches " : "s teach ") + area : "";
          check();
        };
        f.area.addEventListener("change", function () { subject(false); }); f.other.addEventListener("input", function () { subject(false); });
        sel.addEventListener("change", check); f.start.addEventListener("input", check); f.mins.addEventListener("change", check);
        subject(!!slot);
      },
    });
  }
  A.act["ptt-cell"] = function (el) {
    if (!M.me().isAdmin) return;
    var cid = el.getAttribute("data-class"), c = M.cls(cid), key = el.getAttribute("data-key") || null;
    if (!c) return;
    // a month or term without its own timetable gets one (a copy of the usual week) when it's changed
    if (key && !hasOwn(cid, key)) copyWeek(cid, key);
    lessonModal(c, Number(el.getAttribute("data-day")), key, null, el.getAttribute("data-start"));
  };
  A.act["ptt-lesson"] = function (el) {
    if (!M.me().isAdmin) return;
    var cid = el.getAttribute("data-class"), c = M.cls(cid), key = el.getAttribute("data-key") || null, slot = S().get("timetable", el.getAttribute("data-id"));
    if (!c || !slot) return;
    if (key && (slot.scope || null) !== key) { // the usual week's lesson, in a month or term: that month or term gets its own copy, and this lesson is the copy's
      if (!hasOwn(cid, key)) copyWeek(cid, key);
      slot = S().filter("timetable", function (s) { return s.classId === cid && s.scope === key && s.copiedFrom === slot.id; })[0] || slot;
    }
    lessonModal(c, slot.day, key, slot);
  };
  /** The school day: its start and end, a normal period and the breaks; the timetable's columns come from it. */
  A.act["ptt-day"] = function () {
    if (!M.me().isAdmin) return;
    var sd = P.schoolDay();
    var row = function (b) {
      return '<tr><td><input class="input sm" name="label" value="' + esc(b.label || "") + '" style="width:130px" aria-label="Name"></td><td><input class="input sm" type="time" step="300" name="bstart" value="' + esc(b.start || "") + '" aria-label="Starts"></td>' +
        '<td><input class="input sm" type="number" min="5" max="120" step="5" name="bmins" value="' + esc(b.mins || 20) + '" style="width:84px" aria-label="Minutes"></td><td><button type="button" class="btn btn-ghost btn-icon btn-sm" data-del aria-label="Remove">' + I("x") + "</button></td></tr>";
    };
    var read = function (m) {
      var f = m.querySelector("#ptt-dayf"), brks = [];
      m.querySelectorAll("#ptt-brks tr").forEach(function (tr) { var g = function (n) { return tr.querySelector("[name=" + n + "]").value; }; if (g("bstart")) brks.push({ label: g("label").trim() || "Break", start: g("bstart"), mins: Number(g("bmins")) || 0 }); });
      return { start: f.start.value, end: f.end.value, period: Number(f.period.value), breaks: brks.sort(function (a, b) { return A.hm(a.start) - A.hm(b.start); }) };
    };
    var sum = function (m) {
      var d = read(m), cols = d.start && d.end && A.hm(d.end) > A.hm(d.start) ? P.dayColumns(d) : [];
      m.querySelector("#ptt-day-sum").textContent = cols.length ? cols.filter(function (c) { return !c.isBreak; }).length + " periods, " + d.start + " to " + d.end + (d.breaks.length ? ", with " + d.breaks.map(function (b) { return b.label + " at " + b.start; }).join(" and ") : "") + "." : "";
    };
    UI.modal({
      title: "The school day", sub: "The timetable's columns come from it. Lessons already set keep their times.", size: "wide",
      body: '<form id="ptt-dayf" class="form-grid"><label class="field"><span>School starts</span><input class="input" type="time" step="300" name="start" value="' + esc(sd.start) + '"></label>' +
        '<label class="field"><span>School ends</span><input class="input" type="time" step="300" name="end" value="' + esc(sd.end) + '"></label>' +
        '<label class="field full"><span>A normal period</span><select class="select" name="period">' + [30, 35, 40, 45].map(function (n) { return '<option value="' + n + '"' + (n === sd.period ? " selected" : "") + ">" + n + " minutes</option>"; }).join("") +
        (([30, 35, 40, 45]).indexOf(sd.period) < 0 ? '<option value="' + sd.period + '" selected>' + sd.period + " minutes</option>" : "") + '</select><span class="hint">A half period is half of it, a double period two of it.</span></label></form>' +
        '<h4 class="mt">Breaks</h4><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Starts</th><th>Minutes</th><th></th></tr></thead><tbody id="ptt-brks">' + sd.breaks.map(row).join("") + "</tbody></table></div>" +
        '<button type="button" class="btn btn-sm mt-sm" id="ptt-brk-add">' + I("plus") + 'Add a break</button><p class="small muted mt" id="ptt-day-sum"></p>',
      foot: [{ label: "Cancel" }, { label: "Save the school day", cls: "btn-primary", onClick: function (m) {
        var d = read(m), s0 = A.hm(d.start), e0 = A.hm(d.end), bad = "";
        if (!d.start || !d.end || e0 - s0 < 120) bad = "The school day ends at least two hours after it starts.";
        d.breaks.forEach(function (b, i) {
          var bs = A.hm(b.start), be = bs + b.mins, prev = d.breaks[i - 1];
          if (!bad && (b.mins < 5 || bs < s0 || be > e0)) bad = b.label + " must be in the school day.";
          if (!bad && prev && bs < A.hm(prev.start) + prev.mins) bad = b.label + " starts before " + prev.label + " ends.";
        });
        if (bad) { UI.toast(bad, "bad"); return false; }
        S().put("settings", Object.assign({ id: "schoolday" }, d, { by: M.me().id }));
        UI.toast("School day saved: " + P.dayColumns(d).filter(function (c) { return !c.isBreak; }).length + " periods"); A.render();
      } }],
      onMount: function (m) {
        m.querySelector("#ptt-brk-add").addEventListener("click", function () { m.querySelector("#ptt-brks").insertAdjacentHTML("beforeend", row({ label: "Break", start: "", mins: 20 })); });
        m.addEventListener("click", function (e) { var x = e.target.closest("[data-del]"); if (x) { x.closest("tr").remove(); sum(m); } });
        m.addEventListener("input", function () { sum(m); }); m.addEventListener("change", function () { sum(m); });
        sum(m);
      },
    });
  };
  /* ---- printing a timetable: a class, every class of a form, or my timetable, one A4 landscape page each */
  var TT_PRINT = "@page{size:A4 landscape;margin:10mm}" +
    "#print-root .tt-print{width:277mm;box-sizing:border-box;padding:0;color:#111;font-family:'Segoe UI',Arial,sans-serif;page-break-after:always;break-after:page}#print-root .tt-print:last-child{page-break-after:auto;break-after:auto}" +
    "#print-root .tt-print header{display:flex;align-items:center;gap:4mm;margin-bottom:5mm}#print-root .tt-print .logo{width:15mm;height:15mm;flex:none}#print-root .tt-print .logo svg,#print-root .tt-print .logo img{width:100%;height:100%;object-fit:contain}" +
    "#print-root .tt-print h1{font-size:15pt;margin:0}#print-root .tt-print .sub{font-size:11pt}" +
    "#print-root .tt-print table{width:100%;min-width:0;border-collapse:collapse;table-layout:fixed;font-size:8.5pt}#print-root .tt-print col.tt-daycol{width:22mm}" +
    "#print-root .tt-print th,#print-root .tt-print td{border:.6pt solid #555;background:#fff;color:#111;padding:1.2mm .8mm;text-align:center;vertical-align:middle;height:auto;box-shadow:none}" +
    "#print-root .tt-print thead th{background:#eef2f7;font-weight:600}#print-root .tt-print thead th span{display:block;font-size:7.5pt;color:#333}#print-root .tt-print tbody th{text-align:left;font-weight:700;padding-left:2mm}" +
    "#print-root .tt-print td.tt-brk{background:#f2f2f2}#print-root .tt-print td.tt-brk span{writing-mode:vertical-lr;text-orientation:upright;letter-spacing:2px;font-weight:800;color:#333}" +
    "#print-root .tt-print td.long{background:#f6f8fb}#print-root .tt-print .tt-lesson{border:0;background:none;padding:0;display:block}#print-root .tt-print .tt-lesson b{display:block;font-size:1em}#print-root .tt-print .tt-lesson span{display:block;font-size:.85em;color:#444}" +
    // the boxes keep the page's size and the words fit them (UI.fitText), as on the screen
    "#print-root .tt-print .tt-days{--tt-row:13mm}#print-root .tt-print td.tt-cell{padding:0}#print-root .tt-print .tt-box{padding:.6mm .8mm}" +
    "#print-root .tt-print tr.today th,#print-root .tt-print tr.today td{background:#fff;color:#111}";
  function ttPage(title, sub, entries, o) {
    var b = A.Theme.get();
    return '<div class="tt-print"><header>' + A.Theme.logoHTML() + "<div><h1>" + esc(b.name) + '</h1><div class="sub">' + esc(title) + (sub ? " · " + esc(sub) : "") + "</div></div></header>" + ttTable(entries, o) + "</div>";
  }
  A.act["ptt-print"] = function (el) {
    var me = M.me(), scope = el.getAttribute("data-scope"), key = el.getAttribute("data-key") || null, label = key ? A.TT.keyLabel(key) : "", pages = [];
    if (scope === "mine") pages.push(ttPage(me.name + "'s timetable", label, lessonsOf(me, key), { mine: true }));
    else {
      var list = scope === "form" ? homerooms().filter(function (c) { return c.level === el.getAttribute("data-level"); }) : [M.cls(el.getAttribute("data-class"))].filter(Boolean);
      list.forEach(function (c) { var t = M.user(c.teacherId); pages.push(ttPage(classLabel(c) + " timetable", [label, t ? "Class teacher: " + t.name : ""].filter(Boolean).join(" · "), slotsOf(c.id, key).map(function (s) { return { s: s, c: c }; }), {})); });
    }
    if (!pages.length) { UI.toast("Nothing to print", "bad"); return; }
    UI.printSheet({ title: pages.length === 1 ? "Timetable" : pages.length + " timetables", html: pages.join(""), css: TT_PRINT, pageWidth: 1047 });
  };
  A.act["ptt-addclass"] = function (el) {
    var me = M.me();
    if (!me || !me.isAdmin) return;
    classModal({ level: el.getAttribute("data-level"), stream: "", teacherId: me.id }, { keepPick: true, after: function (rec) { A.go("#/t/timetable?c=" + rec.id + "&e=1"); } });
  };
  A.act["ptt-make"] = function (el) {
    copyWeek(el.getAttribute("data-class"), el.getAttribute("data-key"));
    UI.toast(A.TT.keyLabel(el.getAttribute("data-key")) + " has its own timetable now: change it here");
    A.render();
  };
  A.act["ptt-drop"] = function (el) {
    var key = el.getAttribute("data-key"), cid = el.getAttribute("data-class");
    UI.confirm("Go back to the usual week for " + A.TT.keyLabel(key) + "? Its own changes are removed.", { ok: "Use the usual week" }).then(function (ok) {
      if (!ok) return;
      S().filter("timetable", function (s) { return s.classId === cid && s.scope === key; }).forEach(function (s) { S().remove("timetable", s.id); });
      A.render();
    });
  };
  A.act["ptt-mode"] = function (el) {
    var m = el.getAttribute("data-mode");
    if (!M.me().isAdmin || m === ttMode()) return;
    UI.confirm("Change the school's timetable to " + TT_MODES[m].toLowerCase() + "? Every teacher sees the change.", { ok: "Change it" }).then(function (ok) {
      if (!ok) return;
      S().put("settings", { id: "ttmode", mode: m, by: M.me().id });
      UI.toast("Timetable: " + TT_MODES[m]);
      A.go("#/t/timetable?v=mine");
    });
  };
  /** Today's lessons for the Today page (none on a weekend or with no timetable). */
  P.todayLessons = function (me) {
    var wd = A.date().getDay();
    if (wd < 1 || wd > 5) return [];
    return lessonsOf(me, ttKeyNow()).filter(function (e) { return e.s.day === wd; }).map(function (e) { var tm = slotTime(e.s); return tm ? { e: e, at: tm.start, p: { start: hhmm(tm.start), end: hhmm(tm.start + tm.mins) } } : null; })
      .filter(Boolean).sort(function (a, b) { return a.at - b.at; });
  };
  /** A School edition student's day on their home page, from their class's timetable (made class by class since 1.7):
      today's lessons, or the next school day's. "" when their class has no such timetable (the bell-time card shows). */
  P.studentToday = function (me) {
    var c = me && M.homeroomOf(me.id), slots = c ? slotsOf(c.id, ttKeyNow()) : [];
    if (!slots.length) return "";
    var day = A.TT.displayDay(), wd = new Date(day).getDay(), isToday = day === A.startOfDay(), d = A.date(), now = d.getHours() * 60 + d.getMinutes(), next = false;
    var rows = slots.filter(function (s) { return s.day === wd; }).map(function (s) { var tm = slotTime(s); return tm ? { s: s, start: tm.start, end: tm.start + tm.mins } : null; })
      .filter(Boolean).sort(function (a, b) { return a.start - b.start; }).map(function (x) {
        var t = M.user(teacherOf(x.s, c)), state = !isToday ? "later" : now >= x.end ? "done" : now >= x.start ? "now" : "later", badge = "";
        if (state === "now") badge = '<span class="badge accent">Now</span>';
        else if (state === "later" && isToday && !next) { next = true; badge = '<span class="badge brand">Next</span>'; }
        return '<div class="tt-row' + (state === "done" ? " past" : state === "now" ? " now" : "") + '"><div class="tt-time"><b>' + hhmm(x.start) + "</b><span>" + hhmm(x.end) + "</span></div>" +
          '<div class="grow"><div class="row wrap"><b>' + esc(x.s.area) + "</b>" + badge + '</div><div class="small muted">' + esc(t ? t.name : "") + "</div></div></div>"; // (no room: students hear it from the teacher)
      }).join("");
    return '<div class="card"><div class="card-head">' + I("grid") + "<h3>" + (isToday ? "Today's timetable" : WEEKDAYS[wd - 1] + "'s timetable") + '</h3><span class="sub">' + esc(c.name) + "</span>" +
      '<span class="grow"></span><a class="btn btn-sm btn-ghost" href="#/s/timetable">Full week ' + I("right") + "</a></div>" + (rows || UI.empty("grid", "No lessons on this day")) + "</div>";
  };

  /* ------------------------------------------------------------------ Settings → Learning areas & terms */
  P.settingsSection = function (me) {
    var conf = P.conf();
    var html = '<div class="card card-pad" style="max-width:760px"><h3>' + I("book") + " Learning areas and terms</h3>" +
      '<p class="muted small mt-sm">Used in the mark book, reports and schemes.</p>' +
      '<form id="pconf" class="form-grid mt"><label class="field"><span>School year</span><input class="input" name="year" value="' + esc(conf.year) + '"></label>' +
      '<label class="field"><span>Current term</span><select class="select" name="term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === conf.term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select></label>" +
      [1, 2, 3].map(function (t) {
        var d = conf.terms[t] || {};
        return '<label class="field"><span>Term ' + t + ' opens</span><input class="input" type="date" name="opens' + t + '" value="' + esc(d.opens || "") + '"></label><label class="field"><span>Term ' + t + ' closes</span><input class="input" type="date" name="closes' + t + '" value="' + esc(d.closes || "") + '"></label>';
      }).join("") +
      '<label class="field full"><span>Learning areas (one per line, in report order)</span><textarea class="input" name="areas" rows="10">' + esc(conf.areas.join("\n")) + "</textarea></label>" +
      '<label class="field full"><span>Report descriptors (lowest % for each, one per line)</span><textarea class="input" name="bands" rows="6">' + esc(conf.bands.map(function (b) { return b[0] + " " + b[1]; }).join("\n")) + "</textarea></label>" +
      "</form>" + sigBlock(me, conf) +
      (me.isAdmin ? '<div class="row mt"><button class="btn btn-primary" data-act="pconf-save">' + I("check") + "Save</button></div>" : '<p class="small muted mt">Only an admin can change these.</p>') + "</div>";
    return html + (P.isForm() ? subjectsByForm(me, conf) : "");
  };
  /* ---- Subjects by form: tick what each two forms take, or type a subject the school doesn't list yet */
  function subjectsByForm(me, conf) {
    var dis = me.isAdmin ? "" : " disabled";
    return '<div class="card card-pad mt" style="max-width:760px" id="psubf"><h3>' + I("layers") + " Subjects by form</h3>" +
      '<p class="muted small mt-sm">Tick the subjects each form takes. Teachers then record end-of-term marks only in those, and only those are on the form\'s report cards, so no pupil gets a mark in a subject they don\'t take. Forms with nothing ticked take every subject.</p>' +
      P.levelGroups().map(function (lv, gi) {
        var on = P.levelAreas(lv[0]), set = Array.isArray(conf.levelAreas[lv[0]]) && conf.levelAreas[lv[0]].length;
        return '<div class="psubf-group mt" data-levels="' + esc(lv.join("|")) + '"><div class="label">' + esc(lv.join(" and ")) + (set ? ' <span class="muted small">· ' + on.length + " subjects</span>" : ' <span class="muted small">· every subject for now</span>') + "</div>" +
          '<div class="row wrap mt-sm" style="gap:4px 14px">' + conf.areas.map(function (a) {
            return '<label class="check"><input type="checkbox" data-subf="' + esc(a) + '"' + (set && on.indexOf(a) >= 0 ? " checked" : "") + dis + "> " + esc(a) + "</label>";
          }).join("") + "</div>" +
          (me.isAdmin ? '<label class="field mt-sm" style="max-width:420px"><span>Another subject for ' + esc(lv.join(" and ")) + ' <span class="muted">(optional; commas between)</span></span><input class="input" data-subf-new="' + gi + '" maxlength="200" placeholder="e.g. Business Studies"></label>' : "") + "</div>";
      }).join("") +
      (me.isAdmin ? '<div class="row mt"><button class="btn btn-primary" data-act="psubf-save">' + I("check") + "Save subjects by form</button></div>" : "") + "</div>";
  }
  A.act["psubf-save"] = function () {
    var me = M.me(), box = document.getElementById("psubf"); if (!me || !me.isAdmin || !box) return;
    var cur = S().get("settings", "primary") || { id: "primary" }, conf = P.conf(), areas = conf.areas.slice(), la = Object.assign({}, conf.levelAreas);
    var low = function () { return areas.map(function (x) { return x.toLowerCase(); }); };
    box.querySelectorAll(".psubf-group").forEach(function (g) {
      var ticked = Array.prototype.map.call(g.querySelectorAll("[data-subf]:checked"), function (x) { return x.getAttribute("data-subf"); });
      var typed = ((g.querySelector("[data-subf-new]") || {}).value || "").split(/[,;\n]/).map(function (x) { return x.trim().replace(/\s+/g, " ").slice(0, 80); }).filter(Boolean);
      typed.forEach(function (t) { var i = low().indexOf(t.toLowerCase()); var name = i >= 0 ? areas[i] : t; if (i < 0) areas.push(t); if (ticked.indexOf(name) < 0) ticked.push(name); });
      g.getAttribute("data-levels").split("|").forEach(function (lv) { if (ticked.length) la[lv] = ticked.slice(); else delete la[lv]; });
    });
    S().put("settings", Object.assign({}, cur, { areas: areas, levelAreas: la }));
    UI.toast("Subjects by form saved"); A.render();
  };
  /* ---- the head's (or principal's) signature: signed once, on every report card printed or saved */
  function sigBlock(me, conf) {
    return '<div class="field full mt psig"><span class="label">The head\'s or principal\'s signature</span><span class="hint">Signed once here, it is on every report card printed or saved.</span>' +
      '<div class="psig-show">' + (conf.headSig ? '<img src="' + esc(conf.headSig) + '" alt="The head\'s signature">' : '<span class="muted small">No signature yet</span>') + "</div>" +
      (me.isAdmin ? '<div class="row wrap mt-sm"><button type="button" class="btn btn-sm" data-act="psig-draw">' + I("pen") + "Sign here</button>" +
        '<label class="btn btn-sm">' + I("upload") + 'Use a photo of it<input type="file" accept="image/*" data-change="psig-file" hidden></label>' +
        (conf.headSig ? '<button type="button" class="btn btn-sm btn-ghost" data-act="psig-clear">Remove</button>' : "") + "</div>" : "") + "</div>";
  }
  var putSig = function (url) { var cur = S().get("settings", "primary") || { id: "primary" }; S().put("settings", Object.assign({}, cur, { headSig: url || null })); A.render(); };
  /** A canvas's drawing, cut to what is drawn and at most 600 × 200, as a PNG (a photo: JPEG). */
  function sigImage(cv, photo) {
    var w = cv.width, h = cv.height, d = cv.getContext("2d").getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var i = (y * w + x) * 4; if (d[i + 3] > 0 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - 8); y0 = Math.max(0, y0 - 8); x1 = Math.min(w - 1, x1 + 8); y1 = Math.min(h - 1, y1 + 8);
    var s = Math.min(1, 600 / (x1 - x0 + 1), 200 / (y1 - y0 + 1)), out = document.createElement("canvas");
    out.width = Math.round((x1 - x0 + 1) * s); out.height = Math.round((y1 - y0 + 1) * s);
    var o = out.getContext("2d"); o.fillStyle = "#fff"; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
    return photo ? out.toDataURL("image/jpeg", 0.85) : out.toDataURL("image/png");
  }
  A.act["psig-draw"] = function () {
    if (!M.me().isAdmin) return;
    UI.modal({
      title: "The head's signature", sub: "Sign with a finger, a stylus or the mouse.", noFocus: true,
      body: '<canvas id="psig-pad" width="1200" height="400" style="width:100%;aspect-ratio:3/1;border:1px dashed var(--border-strong);border-radius:10px;background:#fff;touch-action:none;display:block"></canvas>',
      foot: [{ label: "Clear", onClick: function (m) { var cv = m.querySelector("#psig-pad"); cv.getContext("2d").clearRect(0, 0, cv.width, cv.height); return false; } }, { label: "Cancel" },
        { label: "Save the signature", cls: "btn-primary", onClick: function (m) { var url = sigImage(m.querySelector("#psig-pad")); if (!url) { UI.toast("Sign in the box first", "bad"); return false; } putSig(url); UI.toast("Signature saved: it is on every report card"); } }],
      onMount: function (m) {
        var cv = m.querySelector("#psig-pad"), g = cv.getContext("2d"), down = false, last = null;
        g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0b1f4b";
        var at = function (e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
        cv.addEventListener("pointerdown", function (e) { down = true; last = at(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
        cv.addEventListener("pointermove", function (e) { if (!down) return; var p = at(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; e.preventDefault(); });
        var up = function () { down = false; };
        cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
      },
    });
  };
  A.act["psig-file"] = function (el) {
    var file = el.files && el.files[0];
    if (!file || !M.me().isAdmin) return;
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var s = Math.min(1, 1200 / img.width), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      var out = sigImage(cv, true);
      if (!out) { UI.toast("No signature was found in that picture", "bad"); return; }
      putSig(out); UI.toast("Signature saved: it is on every report card");
    };
    img.onerror = function () { URL.revokeObjectURL(url); UI.toast("That picture couldn't be opened", "bad"); };
    img.src = url;
  };
  A.act["psig-clear"] = function () {
    UI.confirm("Remove the head's signature? The report cards then have a line to sign by hand.", { ok: "Remove", danger: true }).then(function (ok) { if (ok) { putSig(null); UI.toast("Signature removed"); } });
  };
  A.act["pconf-save"] = function () {
    if (!M.me() || !M.me().isAdmin) return;
    var f = UI.formData(document.getElementById("pconf")), terms = {};
    [1, 2, 3].forEach(function (t) { if (f["opens" + t] || f["closes" + t]) terms[t] = { opens: f["opens" + t], closes: f["closes" + t] }; });
    var areas = f.areas.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    var bands = f.bands.split(/\r?\n/).map(function (x) { var m = /^\s*(\d{1,3})\s*%?\s+(.+)$/.exec(x); return m ? [Number(m[1]), m[2].trim()] : null; }).filter(Boolean);
    if (!areas.length) { UI.toast("List at least one learning area", "bad"); return; }
    if (!bands.length) { UI.toast("List at least one descriptor, e.g. 80 Excellent", "bad"); return; }
    var cur = S().get("settings", "primary") || { id: "primary" };
    S().put("settings", Object.assign({}, cur, { year: f.year.trim(), term: Number(f.term), terms: terms, areas: areas, bands: bands }));
    UI.toast("Saved"); A.render();
  };
})(window.App);
