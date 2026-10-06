/* School Assist Teacher (edition "teacher"): for primary schools, where most pupils have no device.
 * Only teachers sign in (each with a PIN); pupils are records the teacher looks after.
 *   Today          register status, quick actions, birthdays, the term at a glance
 *   My class       pupils and their profiles (guardian, health, notes), adding many at once, Excel export
 *   Register       the morning register, and each pupil's days this term
 *   Mark book      exercises, tests and continuous assessment per learning area, as a quick grid
 *   Reports        termly reports with marks, descriptors, position and attendance, printed for the class
 *   Schemes        scheme of work per learning area per term, and the record of work (what was taught)
 *   Class screen   for a projector or TV: timer, name picker, flash words, quick sums
 * Everything is kept on the device (and on a school hub, if the school runs one): no cloud.
 * Data: pupils are "users" with role student and pupil:true; a class is a "classes" record with
 * homeroom:true; "assessments", "reports", "schemes" and "pnotes" are this edition's own collections. */
(function (A) {
  "use strict";
  if (A.edition !== "teacher") { A.Primary = null; return; }
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var P = (A.Primary = {});

  /* ------------------------------------------------------------------ the school's set-up */
  var AREAS = ["English", "Mathematics", "Indigenous Language", "Science and Technology", "Social Science", "Agriculture",
    "Physical Education", "Visual and Performing Arts", "ICT", "Family, Religion and Moral Education"];
  var BANDS = [[80, "Excellent"], [70, "Very good"], [60, "Good"], [50, "Satisfactory"], [40, "Fair"], [0, "Needs support"]];
  var LEVELS = ["ECD A", "ECD B", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"];
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
      areas: c.areas && c.areas.length ? c.areas : AREAS, bands: c.bands && c.bands.length ? c.bands : BANDS,
      year: String(c.year || new Date().getFullYear()), term: Number(c.term) || termByMonth(A.isoDate()), terms: c.terms || {}, head: c.head || "",
    };
  };
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
    return S().filter("classes", function (c) { return c.homeroom && (me.isAdmin || c.teacherId === me.id); })
      .sort(function (a, b) { return M.levelIndex(a.level) - M.levelIndex(b.level) || a.name.localeCompare(b.name); });
  };
  function pickKey(me) { return "sca-pclass-" + me.id; }
  /** The class the teacher is working with (their own first; an admin can switch). */
  P.cls = function (me) {
    var list = P.classes(me), want = null;
    try { want = localStorage.getItem(pickKey(me)); } catch (e) { /* this device only */ }
    return list.filter(function (c) { return c.id === want; })[0] || list.filter(function (c) { return c.teacherId === me.id; })[0] || list[0] || null;
  };
  P.pupils = function (c) { return c ? M.studentsOf(c) : []; };
  function age(dob) {
    if (!dob) return null;
    var b = new Date(dob + "T12:00:00"), n = new Date(), a = n.getFullYear() - b.getFullYear();
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
    return { view: { title: title, html: '<div class="card">' + UI.empty("users", "No class yet", "Create your class to start: its grade and stream, then add your pupils.",
      '<button class="btn btn-primary" data-act="pclass-new">' + I("plus") + "Create my class</button>") + "</div>" } };
  }

  /* ------------------------------------------------------------------ navigation */
  P.nav = function (me) {
    var c = P.cls(me), today = A.isoDate(), taken = c && M.register(c.id, today);
    return [
      { href: "#/t/home", icon: "home", label: "Today", key: "home" },
      { href: "#/t/pupils", icon: "users", label: "My class", key: "pupils", match: ["pupils", "pupil"] },
      { href: "#/t/register", icon: "check", label: "Register", key: "register", count: c && !taken && M.isSchoolDay(Date.now()) ? "!" : 0 },
      { href: "#/t/markbook", icon: "edit", label: "Mark book", key: "markbook", match: ["markbook", "assessment"] },
      { href: "#/t/reports", icon: "file", label: "Reports", key: "reports" },
      { href: "#/t/schemes", icon: "book", label: "Schemes & records", key: "schemes" },
      { href: "#/t/screen", icon: "tablet", label: "Class screen", key: "screen" },
      { href: "#/t/settings", icon: "sliders", label: "Settings", key: "settings" },
    ];
  };

  /* ------------------------------------------------------------------ first run: the school and the class */
  P.needsSetup = function () { return !S().filter("users", function (u) { return u.role === "teacher"; }).length; };
  P.seed = function (Store) {
    var put = function (c, r) { return Store.put(c, r, { silent: true }); };
    var T = (window.SCHOOL_CONFIG || {}).teacher || {};
    if (!Store.get("settings", "structure")) put("settings", { id: "structure", levelLabel: "Grade", levels: LEVELS, streamStyle: "colours", streams: ["Blue", "Green", "Red", "Yellow"] });
    if (!Store.get("settings", "primary")) put("settings", { id: "primary", areas: AREAS, bands: BANDS, year: String(new Date().getFullYear()), terms: T.terms || {} });
    if (!Store.get("settings", "branding")) put("settings", { id: "branding", name: T.name || "My Primary School", shortName: T.shortName || "Primary", motto: T.motto || "" });
  };
  /** The sign-in panel's own steps: set-up on a new device; teachers are chosen straight away (no student role). */
  P.loginStep = function (L, back, msg) {
    if (L.step === "role" || (L.step === "who" && P.needsSetup())) { L.step = P.needsSetup() ? "tsetup" : "who"; L.role = "teacher"; }
    if (L.step !== "tsetup") return null;
    var st = M.structure(), b = A.Theme.get();
    var opt = function (list, cur) { return list.map(function (x) { return "<option" + (x === cur ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); };
    return '<h2 style="font-size:24px">Set up School Assist Teacher</h2><p class="muted small mt-sm">Your school, your name and PIN, and your class. Everything stays on this device. You can change it all later in Settings.</p>' +
      '<form data-submit="tsetup" class="mt">' +
      '<label class="field"><span>School name</span><input class="input" name="school" value="' + esc(b.name === "My Primary School" ? "" : b.name) + '" placeholder="e.g. Sunrise Primary School" autocomplete="organization"></label>' +
      '<label class="field"><span>Your name</span><input class="input" name="name" placeholder="e.g. Mrs T. Moyo" autocomplete="name"></label>' +
      '<div class="form-grid"><label class="field"><span>Your PIN (4 digits)</span><input class="input" name="pin" inputmode="numeric" maxlength="4" autocomplete="off"></label>' +
      '<label class="field"><span>Type it again</span><input class="input" name="pin2" inputmode="numeric" maxlength="4" autocomplete="off"></label>' +
      '<label class="field"><span>Your class</span><select class="select" name="level">' + opt(st.levels, "Grade 4") + "</select></label>" +
      '<label class="field"><span>Stream</span><input class="input" name="stream" value="Blue" placeholder="e.g. Blue, A, Lion"></label></div>' +
      '<label class="check mt"><input type="checkbox" name="sample" checked> Add 30 sample pupils with a week of registers and some marks, to try it out (remove them later with one button)</label>' +
      msg + '<button class="btn btn-primary btn-lg btn-block mt" type="submit">' + I("check") + "Set up and sign in</button></form>";
  };
  A.act.tsetup = function (form) {
    var f = UI.formData(form), err = "";
    if (f.school.trim().length < 3) err = "Enter the school's name.";
    else if (f.name.trim().length < 3) err = "Enter your name.";
    else if (!/^\d{4}$/.test(f.pin)) err = "Your PIN is 4 digits.";
    else if (f.pin !== f.pin2) err = "The two PINs are different.";
    if (err) { A.loginMessage(err); return; }
    var now = Date.now(), b = S().get("settings", "branding") || { id: "branding" };
    S().put("settings", Object.assign({}, b, { name: f.school.trim(), shortName: f.school.trim().replace(/\s+(primary|junior)?\s*school$/i, "") || f.school.trim() }));
    var me = S().put("users", { id: A.uid("t"), role: "teacher", name: f.name.trim(), title: "Teacher", isAdmin: true, pin: f.pin, subjects: "Class teacher" });
    var c = S().put("classes", { id: A.uid("cls"), homeroom: true, name: M.homeClassName(f.level, f.stream.trim()), level: f.level, stream: f.stream.trim() || null,
      subject: "Class", teacherId: me.id, studentIds: [], syllabusId: null, createdAt: now });
    if (f.sample) samplePupils(c, me);
    A.Theme.apply();
    A.loginDone("who");
    M.signIn(me.id);
    if (A.LastUser) A.LastUser.set(me, {});
    location.hash = "#/t/home";
    A.render();
  };
  A.act["pclass-new"] = function () { classModal(null); };
  function classModal(c) {
    var me = M.me(), st = M.structure(), teachers = S().filter("users", function (u) { return u.role === "teacher"; });
    c = c || { level: "Grade 4", stream: "", teacherId: me.id };
    UI.modal({
      title: c.id ? "Edit class" : "New class",
      body: '<form id="pcls" class="form-grid"><label class="field"><span>' + esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option" + (l === c.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Stream</span><input class="input" name="stream" value="' + esc(c.stream || "") + '" placeholder="e.g. Blue"></label>' +
        (me.isAdmin ? '<label class="field full"><span>Class teacher</span><select class="select" name="teacherId">' + teachers.map(function (t) { return '<option value="' + t.id + '"' + (t.id === c.teacherId ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select></label>" : "") + "</form>",
      foot: [{ label: "Cancel" }, { label: c.id ? "Save" : "Create class", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#pcls"));
        var rec = S().put("classes", Object.assign({}, c, { homeroom: true, level: f.level, stream: f.stream.trim() || null, name: M.homeClassName(f.level, f.stream.trim()),
          subject: "Class", teacherId: f.teacherId || c.teacherId || me.id, studentIds: c.studentIds || [], syllabusId: null }));
        try { localStorage.setItem(pickKey(me), rec.id); } catch (e) { /* this device only */ }
        UI.toast(c.id ? "Class saved" : rec.name + " created"); A.render();
      } }],
    });
  }
  A.act["pclass-edit"] = function () { var c = P.cls(M.me()); if (c) classModal(c); };

  /* sample pupils: names, birthdays for the grade, a week of registers and some marks */
  var FIRST_M = ["Tanaka", "Tinashe", "Kudakwashe", "Takudzwa", "Farai", "Tawanda", "Simbarashe", "Tatenda", "Munashe", "Kundai", "Ropafadzo", "Nkosana", "Sipho", "Blessing", "Tafara"];
  var FIRST_F = ["Rufaro", "Nyasha", "Tariro", "Ruvimbo", "Chiedza", "Vimbai", "Rumbidzai", "Anesu", "Thandiwe", "Nokuthula", "Tsitsi", "Chipo", "Rutendo", "Fadzai", "Mufaro"];
  var SURN = ["Moyo", "Ncube", "Dube", "Sibanda", "Chikwanha", "Mutasa", "Banda", "Chirwa", "Mhlanga", "Nyathi", "Mpofu", "Zhou", "Gumbo", "Marufu", "Ndlovu", "Matare", "Shumba", "Mapfumo", "Chigumba", "Makoni"];
  function samplePupils(c, me) {
    var rand = A.rng(4096), now = Date.now(), ids = [], grade = Math.max(0, LEVELS.indexOf(c.level) - 2), ageYears = 6 + grade;
    for (var i = 0; i < 30; i++) {
      var girl = i % 2 === 1, first = (girl ? FIRST_F : FIRST_M)[Math.floor(i / 2) % 15], last = SURN[(i * 7) % SURN.length];
      var dob = new Date(new Date().getFullYear() - ageYears - (rand() < 0.3 ? 1 : 0), Math.floor(rand() * 12), 1 + Math.floor(rand() * 27));
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
    // two marked pieces of work in four learning areas
    var conf = P.conf(), term = conf.term;
    [["Mathematics", "Mental maths test", 20], ["Mathematics", "Fractions exercise", 10], ["English", "Spelling test", 20], ["English", "Comprehension", 15],
      ["Science and Technology", "Plants test", 25], ["Science and Technology", "CALA: growing beans", 30], ["Indigenous Language", "Reading aloud", 10], ["Social Science", "Map work", 20]].forEach(function (a, k) {
      var marks2 = {}, skill = {};
      ids.forEach(function (id, n) { skill[id] = skill[id] || 0.45 + ((n * 37) % 50) / 100; marks2[id] = Math.max(0, Math.min(a[2], Math.round(a[2] * (skill[id] + (rand() - 0.5) * 0.3)))); });
      S().put("assessments", { id: A.uid("as"), classId: c.id, area: a[0], title: a[1], kind: /test/i.test(a[1]) ? "Test" : /CALA/.test(a[1]) ? "CALA" : "Exercise",
        date: A.isoDate(now - (k + 1) * 3 * A.DAY), outOf: a[2], year: conf.year, term: term, marks: marks2, sample: true }, { silent: true });
    });
    S().changed("users");
  }

  /* ------------------------------------------------------------------ Today */
  A.route("t/home", function (p, q, me) {
    var nc = needClass(me, "Today"); if (nc.view) return nc.view;
    var c = nc.c, kids = P.pupils(c), today = A.isoDate(), reg = M.register(c.id, today), conf = P.conf();
    var boys = kids.filter(function (u) { return u.sex === "M"; }).length, girls = kids.filter(function (u) { return u.sex === "F"; }).length;
    var week = M.recentRegisters(c.id, 5), wk = { p: 0, n: 0 };
    week.forEach(function (r) { Object.keys(r.marks || {}).forEach(function (id) { var v = r.marks[id]; if (v === "E") return; wk.n++; if (v === "P" || v === "L") wk.p++; }); });
    var asTerm = S().filter("assessments", function (a) { return a.classId === c.id && String(a.year) === conf.year && Number(a.term) === conf.term; });
    var hour = new Date().getHours(), hi = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    var school = M.isSchoolDay(Date.now());
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:24px">' + hi + ", " + esc(greetName(me.name)) + '</h2><p class="muted">' + esc(A.fmtDateLong(Date.now())) + " · " + esc(c.name) + " · Term " + conf.term + " " + esc(conf.year) + "</p></div>" + classSwitch(me, c, "home") + "</div>";
    html += school && !reg ? '<div class="callout warn mb">' + I("clock") + '<div class="grow"><b>Today\'s register isn\'t taken yet.</b> It takes a minute.</div><a class="btn btn-primary" href="#/t/register">' + I("check") + "Take the register</a></div>"
      : reg ? '<div class="callout mb">' + I("checkCircle") + "<div>Today's register is done: " + count(reg.marks, "P", "L", kids) + " of " + kids.length + " in class.</div></div>" : "";
    html += '<div class="grid g-4 mb">' + UI.stat("users", kids.length, "Pupils", false, boys + " boys, " + girls + " girls") +
      UI.stat("check", wk.n ? Math.round(wk.p / wk.n * 100) + "%" : "—", "Attendance, last 5 days") +
      UI.stat("edit", asTerm.length, "Marked this term") +
      UI.stat("cap", kids.filter(function (u) { return age(u.dob) != null; }).length ? Math.round(A.avg(kids.map(function (u) { return age(u.dob); }).filter(function (x) { return x != null; })) * 10) / 10 : "—", "Average age") + "</div>";
    html += '<div class="grid g-main"><div class="card"><div class="card-head">' + I("bulb") + "<h3>Quick actions</h3></div><div class=\"card-body pquick\">" +
      [["#/t/register", "check", "Take the register"], ["#/t/markbook?new=1", "edit", "Enter marks"], ["#/t/screen", "tablet", "Class screen"], ["#/t/reports", "file", "Term reports"], ["#/t/schemes", "book", "Scheme of work"], ["#/t/pupils?add=1", "plus", "Add pupils"]].map(function (x) {
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
  /** "Mrs T. Moyo" → "Mrs Moyo"; "Tendai Moyo" → "Tendai". */
  function greetName(name) {
    var m = /^(mr|mrs|ms|miss|dr)\.?\s+/i.exec(name || ""), words = String(name || "").trim().split(/\s+/);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + " " + words[words.length - 1] : words[0] || "";
  }
  function count(marks, a, b, kids) { return kids.filter(function (u) { var v = (marks || {})[u.id]; return v === a || v === b; }).length; }
  function nextBirthday(dob) {
    if (!dob) return null;
    var now = A.startOfDay(Date.now()), y = new Date().getFullYear(), m = Number(dob.slice(5, 7)) - 1, d = Number(dob.slice(8, 10));
    var t = new Date(y, m, d).getTime(); if (t < now) t = new Date(y + 1, m, d).getTime();
    return Math.round((t - now) / A.DAY);
  }

  /* ------------------------------------------------------------------ My class */
  A.route("t/pupils", function (p, q, me) {
    var nc = needClass(me, "My class"); if (nc.view) return nc.view;
    var c = nc.c, kids = P.pupils(c), samples = kids.filter(function (u) { return u.sample; }).length;
    var html = '<div class="row wrap spread mb"><div class="row wrap"><h2 style="font-size:22px">' + esc(c.name) + '</h2><span class="muted">' + kids.length + " pupils · " +
      kids.filter(function (u) { return u.sex === "M"; }).length + " boys · " + kids.filter(function (u) { return u.sex === "F"; }).length + " girls</span></div>" +
      '<div class="row wrap">' + classSwitch(me, c, "pupils") + '<button class="btn" data-act="pclass-edit">' + I("edit") + "Class</button>" + (me.isAdmin ? '<button class="btn" data-act="pclass-new">' + I("plus") + "Another class</button>" : "") +
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
    var u = M.user(p.id), c = P.cls(me);
    if (!u || !u.pupil) return { redirect: "#/t/pupils" };
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
          S().patch("users", u.id, { leftAt: Date.now() });
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
        S().put("pnotes", { pupilId: id, kind: d.kind, text: d.text.trim(), at: Date.now(), by: M.me().id });
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
      var area = {}; Object.keys(max).forEach(function (k) { if (max[k] > 0) area[k] = Math.round(got[k] / max[k] * 100); });
      var vals = conf.areas.map(function (k) { return area[k]; }).filter(function (x) { return x != null; });
      by[u.id] = { area: area, avg: vals.length ? Math.round(A.avg(vals)) : null };
    });
    // position by average (equal averages share a place)
    var ranked = kids.filter(function (u) { return by[u.id].avg != null; }).sort(function (a, b) { return by[b.id].avg - by[a.id].avg; });
    ranked.forEach(function (u, i) { by[u.id].pos = i && by[ranked[i - 1].id].avg === by[u.id].avg ? by[ranked[i - 1].id].pos : i + 1; });
    return { by: by, list: list, ranked: ranked.length };
  };
  A.route("t/markbook", function (p, q, me) {
    var nc = needClass(me, "Mark book"); if (nc.view) return nc.view;
    var c = nc.c, conf = P.conf(), term = Number(q.term) || conf.term, area = q.a || "";
    var sc = P.scores(c, conf.year, term), list = sc.list.filter(function (a) { return !area || a.area === area; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var kids = P.pupils(c);
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Mark book · ' + esc(c.name) + '</h2><p class="muted">Term ' + term + " " + esc(conf.year) + " · " + sc.list.length + " pieces of work marked</p></div>" +
      '<div class="row wrap">' + classSwitch(me, c, "markbook") + '<select class="select sm" style="width:auto" data-change="pmb-term" aria-label="Term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select>" +
      '<button class="btn btn-primary" data-act="pas-new">' + I("plus") + "New marks</button></div></div>";
    html += '<div class="pill-tabs sm"><button class="' + (!area ? "on" : "") + '" data-act="goto" data-href="#/t/markbook?term=' + term + '">All learning areas</button>' + conf.areas.map(function (a) {
      var n = sc.list.filter(function (x) { return x.area === a; }).length;
      return n ? '<button class="' + (a === area ? "on" : "") + '" data-act="goto" data-href="#/t/markbook?term=' + term + "&a=" + encodeURIComponent(a) + '">' + esc(a) + ' <span class="muted">' + n + "</span></button>" : "";
    }).join("") + "</div>";
    html += '<div class="card mb">' + (list.length ? list.map(function (a) {
      var vals = kids.map(function (u) { return (a.marks || {})[u.id]; }).filter(function (v) { return v != null && v !== ""; }).map(Number);
      var avg = vals.length ? Math.round(A.avg(vals) / a.outOf * 100) : null;
      return '<a class="list-row click" href="#/t/assessment/' + a.id + '"><div class="grow"><div class="title">' + esc(a.title) + '</div><div class="meta"><span>' + esc(a.area) + '</span><span class="sep"></span><span>' + esc(a.kind) +
        '</span><span class="sep"></span><span>' + esc(A.fmtDate(Date.parse(a.date + "T12:00:00"))) + '</span><span class="sep"></span><span>out of ' + a.outOf + '</span><span class="sep"></span><span>' + vals.length + " of " + kids.length + " marked</span></div></div>" + UI.scoreBadge(avg) + "</a>";
    }).join("") : UI.empty("edit", "Nothing marked yet", "Add an exercise, test, homework or CALA task and enter each pupil's mark.", '<button class="btn btn-primary" data-act="pas-new">' + I("plus") + "New marks</button>")) + "</div>";
    // the class at a glance: each pupil's % per learning area this term
    var areas = conf.areas.filter(function (a2) { return sc.list.some(function (x) { return x.area === a2; }); });
    if (areas.length && kids.length) {
      html += '<div class="card table-wrap"><div class="card-head">' + I("chart") + "<h3>Term " + term + ' at a glance</h3><span class="sub">% per learning area</span></div><table class="table pmb-grid"><thead><tr><th>Pupil</th>' +
        areas.map(function (a2) { return '<th class="num" title="' + esc(a2) + '">' + esc(short(a2)) + "</th>"; }).join("") + '<th class="num">Average</th><th class="num">Position</th></tr></thead><tbody>' +
        kids.map(function (u) {
          var s = sc.by[u.id];
          return '<tr class="click" data-href="#/t/pupil/' + u.id + '"><td>' + esc(u.name) + "</td>" + areas.map(function (a2) { return '<td class="num tnum">' + (s.area[a2] == null ? "—" : s.area[a2]) + "</td>"; }).join("") +
            '<td class="num">' + UI.scoreBadge(s.avg) + '</td><td class="num tnum">' + (s.pos ? s.pos + " / " + sc.ranked : "—") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    return { title: "Mark book", html: html, mount: function () { if (q["new"]) A.act["pas-new"](); } };
  }, { role: "teacher" });
  function short(area) { return { "Science and Technology": "Science & Tech", "Indigenous Language": "Indigenous lang.", "Visual and Performing Arts": "VPA", "Family, Religion and Moral Education": "FAREME", "Physical Education": "PE" }[area] || area; }
  A.act["pmb-term"] = function (el) { location.hash = "#/t/markbook?term=" + el.value; };
  A.act["pas-new"] = function () { assessmentModal(null); };
  function assessmentModal(a) {
    var me = M.me(), c = P.cls(me), conf = P.conf();
    if (!c) { UI.toast("Create your class first", "bad"); return; }
    a = a || { area: conf.areas[0], title: "", kind: "Exercise", date: A.isoDate(), outOf: 10, term: conf.term, year: conf.year };
    UI.modal({
      title: a.id ? "Edit " + a.title : "New marks",
      body: '<form id="pas" class="form-grid"><label class="field"><span>Learning area</span><select class="select" name="area">' + conf.areas.map(function (x) { return "<option" + (x === a.area ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Type</span><select class="select" name="kind">' + KINDS.map(function (x) { return "<option" + (x === a.kind ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field full"><span>Title</span><input class="input" name="title" value="' + esc(a.title) + '" placeholder="e.g. Fractions test, Spelling list 4"></label>' +
        '<label class="field"><span>Date</span><input class="input" type="date" name="date" value="' + esc(a.date) + '"></label>' +
        '<label class="field"><span>Out of</span><input class="input" type="number" min="1" max="1000" name="outOf" value="' + esc(a.outOf) + '"></label></form>',
      foot: (a.id ? [{ label: "Delete", cls: "btn-danger", onClick: function () {
        return UI.confirm("Delete " + a.title + " and its marks?", { danger: true, ok: "Delete" }).then(function (ok) { if (!ok) return false; S().remove("assessments", a.id); location.hash = "#/t/markbook"; });
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
    var a = S().get("assessments", p.id), c = a && S().get("classes", a.classId);
    if (!a || !c) return { redirect: "#/t/markbook" };
    var kids = P.pupils(c), marks = a.marks || {};
    var html = '<div class="card card-pad mb"><div class="row wrap top"><div class="grow"><h2 style="font-size:22px">' + esc(a.title) + '</h2><p class="muted">' + esc(a.area) + " · " + esc(a.kind) + " · " +
      esc(A.fmtDateLong(Date.parse(a.date + "T12:00:00"))) + " · out of <b>" + a.outOf + "</b> · " + esc(c.name) + "</p></div>" +
      '<button class="btn" data-act="pas-edit" data-id="' + a.id + '">' + I("edit") + "Edit</button></div>" +
      '<div class="row wrap mt" id="pas-sum"></div></div>' +
      '<div class="card"><div class="card-body small muted" style="border-bottom:1px solid var(--border)">Type each mark and press <b>Enter</b> to go to the next pupil. Marks save as you type; leave a box empty for a pupil who missed it.</div>' +
      '<div class="pas-grid" id="pas-grid">' + kids.map(function (u, i) {
        var v = marks[u.id];
        return '<label class="pas-row"><span class="tnum muted small">' + (i + 1) + '</span><span class="grow">' + esc(u.name) + '</span><input class="input pas-in tnum" type="number" inputmode="numeric" min="0" max="' + a.outOf + '" step="0.5" data-pid="' + u.id + '" value="' + (v == null ? "" : esc(v)) + '" aria-label="Mark for ' + esc(u.name) + '"><span class="pas-pct tnum muted small"></span></label>';
      }).join("") + "</div></div>";
    return {
      title: a.title, crumbs: [{ label: "Mark book", href: "#/t/markbook" }, { label: a.title }], html: html,
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
          inp.addEventListener("input", function () { show(); save(); });
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var next = ins[i + 1]; if (next) { next.focus(); next.select(); } else inp.blur(); } });
        });
        show();
        A.cleanup = function () { commit(a.id); };
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
  A.route("t/reports", function (p, q, me) {
    var nc = needClass(me, "Reports"); if (nc.view) return nc.view;
    var c = nc.c, conf = P.conf(), term = Number(q.term) || conf.term, kids = P.pupils(c), sc = P.scores(c, conf.year, term);
    var done = kids.filter(function (u) { return reportRec(u.id, conf.year, term).teacherComment; }).length;
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Term ' + term + " reports · " + esc(c.name) + '</h2><p class="muted">' + done + " of " + kids.length + " have the class teacher's comment</p></div>" +
      '<div class="row wrap">' + classSwitch(me, c, "reports") + '<select class="select sm" style="width:auto" data-change="prep-term" aria-label="Term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select>" +
      '<button class="btn btn-primary" data-act="prep-print" data-term="' + term + '">' + I("download") + "Print all reports</button></div></div>";
    html += '<div class="callout mb">' + I("info") + "<div>Marks come from the mark book: each learning area is the pupil's marks over the marks possible this term. Write each pupil's comment, then <b>Print all reports</b> (one A4 page each; choose <b>Microsoft Print to PDF</b> to save them as a file).</div></div>";
    html += kids.length ? '<div class="card table-wrap"><table class="table"><thead><tr><th>Pupil</th><th class="num">Average</th><th class="num">Position</th><th class="num">Days present</th><th>Teacher\'s comment</th><th></th></tr></thead><tbody>' +
      kids.map(function (u) {
        var s = sc.by[u.id], r = reportRec(u.id, conf.year, term), att = termAttendance(c, u.id, term, conf);
        return "<tr><td><b>" + esc(u.name) + '</b></td><td class="num">' + UI.scoreBadge(s.avg) + '</td><td class="num tnum">' + (s.pos ? s.pos + " / " + sc.ranked : "—") + '</td><td class="num tnum">' + att.present + " / " + att.days + "</td>" +
          '<td class="small">' + (r.teacherComment ? esc(r.teacherComment) : '<span class="muted">Not written yet</span>') + "</td>" +
          '<td class="nowrap"><button class="btn btn-sm" data-act="prep-edit" data-id="' + u.id + '" data-term="' + term + '">' + I("edit") + 'Comments</button> <button class="btn btn-sm btn-ghost" data-act="prep-print" data-id="' + u.id + '" data-term="' + term + '">' + I("download") + "Print</button></td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="card">' + UI.empty("users", "No pupils yet", "Add your class list first.") + "</div>";
    return { title: "Reports", html: html };
  }, { role: "teacher" });
  A.act["prep-term"] = function (el) { location.hash = "#/t/reports?term=" + el.value; };
  A.act["prep-edit"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), conf = P.conf(), term = Number(el.getAttribute("data-term")), r = reportRec(u.id, conf.year, term), me = M.me();
    UI.modal({
      title: u.name + ": term " + term + " report", size: "wide",
      body: '<form id="prep" class="form-grid"><label class="field full"><span>Class teacher\'s comment</span><textarea class="input" name="teacherComment" rows="3">' + esc(r.teacherComment || "") + "</textarea></label>" +
        '<div class="full row wrap pcomment-bank">' + COMMENTS.map(function (t) { return '<button type="button" class="btn btn-sm btn-ghost" data-act="pcomment" data-t="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" +
        '<label class="field full"><span>Head\'s comment' + (me.isAdmin ? "" : " (the head can add it)") + '</span><textarea class="input" name="headComment" rows="2">' + esc(r.headComment || "") + "</textarea></label></form>",
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#prep"));
        S().put("reports", Object.assign({}, r, { teacherComment: f.teacherComment.trim(), headComment: f.headComment.trim(), by: me.id }));
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
      '<div class="preport-comment"><b>Head\'s comment</b><p>' + esc(r.headComment || "") + "</p><span>" + esc(conf.head || "Head") + " · signature ____________________</span></div>" +
      '<footer class="preport-foot">' + (next.opens ? "Next term begins on " + esc(A.fmtDateLong(Date.parse(next.opens + "T12:00:00"))) + ". " : "") + "Descriptors: " +
      conf.bands.slice().sort(function (a, b2) { return b2[0] - a[0]; }).map(function (x) { return esc(x[1]) + " " + x[0] + "%+"; }).join(", ") + ".</footer></section>";
  };
  A.act["prep-print"] = function (el) {
    var me = M.me(), c = P.cls(me), conf = P.conf(), term = Number(el.getAttribute("data-term")) || conf.term, sc = P.scores(c, conf.year, term), id = el.getAttribute("data-id");
    var kids = P.pupils(c).filter(function (u) { return !id || u.id === id; });
    P.print(kids.map(function (u) { return P.reportHtml(u, c, term, sc, conf); }).join(""));
  };
  /** Print some pages on their own (the app's own page is hidden while printing). */
  P.print = function (html) {
    var root = document.getElementById("print-root");
    if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
    root.innerHTML = html;
    document.body.classList.add("printing");
    var done = function () { document.body.classList.remove("printing"); root.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(function () { window.print(); setTimeout(function () { if (document.body.classList.contains("printing")) done(); }, 1000); }, 50);
  };

  /* ------------------------------------------------------------------ Schemes and records */
  function schemeId(c, area, year, term) { return "sch_" + c.id + "_" + year + "_t" + term + "_" + area.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  A.route("t/schemes", function (p, q, me) {
    var nc = needClass(me, "Schemes & records"); if (nc.view) return nc.view;
    var c = nc.c, conf = P.conf(), term = Number(q.term) || conf.term, area = conf.areas.indexOf(q.a) >= 0 ? q.a : conf.areas[0];
    var rec = S().get("schemes", schemeId(c, area, conf.year, term)), rows = (rec && rec.rows) || [];
    if (!rows.length) for (var w = 1; w <= 3; w++) rows.push({ week: String(w), topic: "", objectives: "", activities: "", resources: "", taught: false, evaluation: "" });
    var taught = rows.filter(function (r) { return r.taught; }).length;
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Scheme of work · ' + esc(area) + '</h2><p class="muted">' + esc(c.name) + " · Term " + term + " " + esc(conf.year) + (rec ? " · " + taught + " of " + rows.length + " weeks taught" : " · not started") + "</p></div>" +
      '<div class="row wrap">' + classSwitch(me, c, "schemes") + '<select class="select sm" style="width:auto" data-change="psch-area" data-term="' + term + '" aria-label="Learning area">' + conf.areas.map(function (a) {
        var has = S().get("schemes", schemeId(c, a, conf.year, term));
        return '<option value="' + esc(a) + '"' + (a === area ? " selected" : "") + ">" + esc(a) + (has ? " ✓" : "") + "</option>";
      }).join("") + "</select>" +
      '<select class="select sm" style="width:auto" data-change="psch-term" data-a="' + esc(area) + '" aria-label="Term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select>" +
      '<button class="btn" data-act="psch-print">' + I("download") + "Print</button></div></div>";
    html += '<div class="callout mb">' + I("info") + "<div>Plan each week before the term, then tick <b>Taught</b> and write the <b>evaluation</b> (what went well, who needs help) as you go: that is your record of work. It saves as you type.</div></div>";
    html += '<div class="card table-wrap"><table class="table psch" id="psch" data-id="' + schemeId(c, area, conf.year, term) + '" data-area="' + esc(area) + '" data-term="' + term + '"><thead><tr><th>Week</th><th>Topic / content</th><th>Objectives</th><th>Methods & activities</th><th>Resources</th><th>Taught</th><th>Evaluation (record of work)</th><th></th></tr></thead><tbody>' +
      rows.map(schemeRow).join("") + '</tbody></table><div class="card-foot"><button class="btn btn-sm" data-act="psch-add">' + I("plus") + "Add a week</button></div></div>";
    return {
      title: "Schemes & records", html: html,
      mount: function (root) {
        var save = A.debounce(saveScheme, 500);
        root.querySelector("#psch").addEventListener("input", save);
        root.querySelector("#psch").addEventListener("change", save);
        A.cleanup = saveScheme;
      },
    };
  }, { role: "teacher" });
  function schemeRow(r) {
    var ta = function (k) { return '<td><textarea class="input sm" rows="2" data-k="' + k + '">' + esc(r[k] || "") + "</textarea></td>"; };
    return '<tr><td><input class="input sm" style="width:56px" data-k="week" value="' + esc(r.week || "") + '"></td>' + ta("topic") + ta("objectives") + ta("activities") + ta("resources") +
      '<td class="num"><input type="checkbox" data-k="taught"' + (r.taught ? " checked" : "") + ' aria-label="Taught"></td>' + ta("evaluation") +
      '<td><button class="btn btn-ghost btn-icon btn-sm" data-act="psch-del" aria-label="Remove week">' + I("trash") + "</button></td></tr>";
  }
  function saveScheme() {
    var t = document.getElementById("psch"); if (!t) return;
    var c = P.cls(M.me()), conf = P.conf(), rows = [];
    t.querySelectorAll("tbody tr").forEach(function (tr) {
      var r = {}; tr.querySelectorAll("[data-k]").forEach(function (el) { r[el.getAttribute("data-k")] = el.type === "checkbox" ? el.checked : el.value; }); rows.push(r);
    });
    var id = t.getAttribute("data-id"), cur = S().get("schemes", id);
    var blank = rows.every(function (r) { return !r.topic && !r.objectives && !r.activities && !r.resources && !r.evaluation && !r.taught; });
    if (blank && !cur) return;
    if (cur && JSON.stringify(cur.rows) === JSON.stringify(rows)) return;
    S().put("schemes", Object.assign({}, cur || { id: id }, { classId: c.id, area: t.getAttribute("data-area"), year: conf.year, term: Number(t.getAttribute("data-term")), rows: rows }), { silent: true });
    S().save();
  }
  A.act["psch-add"] = function () {
    var tb = document.querySelector("#psch tbody"), n = tb.children.length + 1;
    tb.insertAdjacentHTML("beforeend", schemeRow({ week: String(n) }));
    saveScheme();
  };
  A.act["psch-del"] = function (el) { el.closest("tr").remove(); saveScheme(); };
  A.act["psch-area"] = function (el) { saveScheme(); location.hash = "#/t/schemes?term=" + el.getAttribute("data-term") + "&a=" + encodeURIComponent(el.value); };
  A.act["psch-term"] = function (el) { saveScheme(); location.hash = "#/t/schemes?term=" + el.value + "&a=" + encodeURIComponent(el.getAttribute("data-a")); };
  A.act["psch-print"] = function () {
    saveScheme();
    var t = document.getElementById("psch"), c = P.cls(M.me()), conf = P.conf(), rec = S().get("schemes", t.getAttribute("data-id")), b = A.Theme.get();
    var rows = (rec && rec.rows) || [];
    P.print('<section class="preport pscheme"><header class="preport-head">' + A.Theme.logoHTML() + '<div class="grow"><h1>' + esc(b.name) + "</h1><p>Scheme of work and record of work</p></div>" +
      '<div class="preport-term"><b>' + esc(t.getAttribute("data-area")) + "</b><span>" + esc(c.name) + " · Term " + t.getAttribute("data-term") + " " + esc(conf.year) + "</span></div></header>" +
      '<table class="preport-marks"><thead><tr><th>Week</th><th>Topic / content</th><th>Objectives</th><th>Methods & activities</th><th>Resources</th><th>Taught</th><th>Evaluation</th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + esc(r.week) + "</td><td>" + esc(r.topic) + "</td><td>" + esc(r.objectives) + "</td><td>" + esc(r.activities) + "</td><td>" + esc(r.resources) + "</td><td>" + (r.taught ? "✓" : "") + "</td><td>" + esc(r.evaluation) + "</td></tr>"; }).join("") +
      "</tbody></table></section>");
  };

  /* ------------------------------------------------------------------ Class screen (projector or TV) */
  var SCR = { tool: "timer", left: 0, total: 0, run: null, picked: [], words: [], wi: 0, sums: null };
  A.route("t/screen", function (p, q, me) {
    var c = P.cls(me), tool = q.tool || SCR.tool;
    SCR.tool = tool;
    var tabs = [["timer", "clock", "Timer"], ["names", "users", "Pick a name"], ["words", "book", "Flash words"], ["sums", "target", "Quick sums"]];
    var html = '<div class="pscreen" data-no-refresh><div class="row wrap spread pscreen-bar"><div class="pill-tabs" style="margin:0">' + tabs.map(function (t) {
      return '<button class="' + (t[0] === tool ? "on" : "") + '" data-act="goto" data-href="#/t/screen?tool=' + t[0] + '">' + I(t[1]) + t[2] + "</button>";
    }).join("") + '</div><button class="btn" data-act="pscr-full">' + I("expand") + "Full screen</button></div>" + '<div class="pscreen-stage" id="pscr-stage">' + screenTool(tool, c) + "</div></div>";
    return {
      title: "Class screen", html: html,
      mount: function () { if (tool === "timer") paintTimer(); A.cleanup = function () { clearInterval(SCR.run); SCR.run = null; }; if (tool === "timer" && SCR.left > 0 && SCR.going) startTimer(); },
    };
  }, { role: "teacher" });
  function screenTool(tool, c) {
    if (tool === "timer") {
      return '<div class="pscr-big tnum" id="pscr-time">0:00</div><div class="row wrap pscr-ctl">' + [1, 2, 3, 5, 10, 15].map(function (m) { return '<button class="btn btn-lg" data-act="pscr-set" data-m="' + m + '">' + m + " min</button>"; }).join("") +
        '<button class="btn btn-lg btn-primary" data-act="pscr-go">' + I("play") + "Start / pause</button></div>";
    }
    if (tool === "names") {
      var kids = P.pupils(c);
      return '<div class="pscr-big" id="pscr-name">' + (kids.length ? "Who's next?" : "Add your class first") + '</div><div class="row wrap pscr-ctl"><button class="btn btn-lg btn-primary" data-act="pscr-pick"' + (kids.length ? "" : " disabled") + ">" + I("refresh") + "Pick a name</button>" +
        '<span class="muted" id="pscr-left">' + (kids.length - SCR.picked.length) + " not picked yet</span><button class=\"btn btn-ghost\" data-act=\"pscr-reset\">Start again</button></div>";
    }
    if (tool === "words") {
      return SCR.words.length ? '<div class="pscr-big" id="pscr-word">' + esc(SCR.words[SCR.wi] || "") + '</div><div class="row wrap pscr-ctl"><button class="btn btn-lg" data-act="pscr-word" data-d="-1">' + I("left") + 'Back</button><span class="muted tnum" id="pscr-wn">' + (SCR.wi + 1) + " / " + SCR.words.length + '</span><button class="btn btn-lg btn-primary" data-act="pscr-word" data-d="1">Next' + I("right") + '</button><button class="btn btn-ghost" data-act="pscr-words-new">New list</button></div>'
        : '<div class="pscr-setup"><h3>Words to flash</h3><p class="muted">Type or paste this week\'s spelling or sight words, one per line or separated by commas.</p><textarea class="input" id="pscr-list" rows="6" placeholder="because, friend, school, beautiful"></textarea><button class="btn btn-primary btn-lg mt" data-act="pscr-words-go">' + I("play") + "Show them</button></div>";
    }
    var lv = c ? Math.max(1, LEVELS.indexOf(c.level) - 1) : 3, s = SCR.sums || newSum(lv);
    SCR.sums = s;
    return '<div class="pscr-big tnum" id="pscr-sum">' + esc(s.q) + ' = <span class="pscr-ans' + (s.shown ? "" : " hide") + '">' + s.a + '</span></div><div class="row wrap pscr-ctl"><button class="btn btn-lg" data-act="pscr-ans">Show the answer</button><button class="btn btn-lg btn-primary" data-act="pscr-sum-next">Next sum' + I("right") + '</button><span class="muted">Sums for ' + esc(c ? c.level : "Grade 3") + "</span></div>";
  }
  function newSum(grade) {
    var r = function (n) { return 1 + Math.floor(Math.random() * n); }, ops = grade <= 2 ? ["+", "−"] : grade <= 4 ? ["+", "−", "×"] : ["+", "−", "×", "÷"];
    var op = ops[Math.floor(Math.random() * ops.length)], top = grade <= 1 ? 10 : grade <= 2 ? 20 : grade <= 4 ? 100 : 1000, x, y, a;
    if (op === "+") { x = r(top); y = r(top); a = x + y; }
    else if (op === "−") { x = r(top); y = r(x); a = x - y; }
    else if (op === "×") { x = r(grade <= 4 ? 10 : 12); y = r(grade <= 4 ? 10 : 12); a = x * y; }
    else { y = r(12); a = r(12); x = a * y; }
    return { q: x + " " + op + " " + y, a: a, shown: false };
  }
  function paintTimer() {
    var el = document.getElementById("pscr-time"); if (!el) return;
    var m = Math.floor(SCR.left / 60), s = SCR.left % 60;
    el.textContent = m + ":" + A.pad(s);
    el.classList.toggle("done", SCR.total > 0 && SCR.left === 0);
  }
  function startTimer() {
    clearInterval(SCR.run);
    SCR.going = true;
    SCR.run = setInterval(function () { if (SCR.left > 0) SCR.left--; paintTimer(); if (SCR.left === 0) { clearInterval(SCR.run); SCR.going = false; } }, 1000);
  }
  A.act["pscr-set"] = function (el) { clearInterval(SCR.run); SCR.going = false; SCR.total = SCR.left = Number(el.getAttribute("data-m")) * 60; paintTimer(); };
  A.act["pscr-go"] = function () { if (SCR.going) { clearInterval(SCR.run); SCR.going = false; } else if (SCR.left > 0) startTimer(); };
  A.act["pscr-pick"] = function () {
    var kids = P.pupils(P.cls(M.me())), left = kids.filter(function (u) { return SCR.picked.indexOf(u.id) < 0; });
    if (!left.length) { SCR.picked = []; left = kids; }
    var el = document.getElementById("pscr-name"), spins = 12, k = 0;
    var spin = setInterval(function () {
      var u = left[Math.floor(Math.random() * left.length)];
      el.textContent = u.name;
      if (++k >= spins) { clearInterval(spin); SCR.picked.push(u.id); el.classList.add("picked"); document.getElementById("pscr-left").textContent = (kids.length - SCR.picked.length) + " not picked yet"; }
      else el.classList.remove("picked");
    }, 70);
  };
  A.act["pscr-reset"] = function () { SCR.picked = []; A.render(); };
  A.act["pscr-words-go"] = function () {
    SCR.words = document.getElementById("pscr-list").value.split(/[\n,;]+/).map(function (w) { return w.trim(); }).filter(Boolean); SCR.wi = 0;
    if (!SCR.words.length) { UI.toast("Type some words first", "bad"); return; }
    A.render();
  };
  A.act["pscr-words-new"] = function () { SCR.words = []; A.render(); };
  A.act["pscr-word"] = function (el) {
    SCR.wi = Math.max(0, Math.min(SCR.words.length - 1, SCR.wi + Number(el.getAttribute("data-d"))));
    document.getElementById("pscr-word").textContent = SCR.words[SCR.wi]; document.getElementById("pscr-wn").textContent = (SCR.wi + 1) + " / " + SCR.words.length;
  };
  A.act["pscr-ans"] = function () { if (SCR.sums) SCR.sums.shown = true; var a = document.querySelector(".pscr-ans"); if (a) a.classList.remove("hide"); };
  A.act["pscr-sum-next"] = function () { var c = P.cls(M.me()); SCR.sums = newSum(c ? Math.max(1, LEVELS.indexOf(c.level) - 1) : 3); A.render(); };
  A.act["pscr-full"] = function () {
    var el = document.querySelector(".pscreen");
    if (document.fullscreenElement) document.exitFullscreen(); else if (el && el.requestFullscreen) el.requestFullscreen().catch(function () { UI.toast("Full screen isn't available here", "bad"); });
  };

  /* ------------------------------------------------------------------ Settings → Learning areas & terms */
  P.settingsSection = function (me) {
    var conf = P.conf();
    var html = '<div class="card card-pad" style="max-width:760px"><h3>' + I("book") + " Learning areas and terms</h3>" +
      '<p class="muted small mt-sm">The learning areas in the mark book, the reports and the schemes of work, the term dates (they decide which term a register or a mark belongs to), and the descriptors on the reports.</p>' +
      '<form id="pconf" class="form-grid mt"><label class="field"><span>School year</span><input class="input" name="year" value="' + esc(conf.year) + '"></label>' +
      '<label class="field"><span>Current term</span><select class="select" name="term">' + [1, 2, 3].map(function (t) { return '<option value="' + t + '"' + (t === conf.term ? " selected" : "") + ">Term " + t + "</option>"; }).join("") + "</select></label>" +
      [1, 2, 3].map(function (t) {
        var d = conf.terms[t] || {};
        return '<label class="field"><span>Term ' + t + ' opens</span><input class="input" type="date" name="opens' + t + '" value="' + esc(d.opens || "") + '"></label><label class="field"><span>Term ' + t + ' closes</span><input class="input" type="date" name="closes' + t + '" value="' + esc(d.closes || "") + '"></label>';
      }).join("") +
      '<label class="field full"><span>Learning areas (one per line, in report order)</span><textarea class="input" name="areas" rows="10">' + esc(conf.areas.join("\n")) + "</textarea></label>" +
      '<label class="field full"><span>Report descriptors (lowest % for each, one per line)</span><textarea class="input" name="bands" rows="6">' + esc(conf.bands.map(function (b) { return b[0] + " " + b[1]; }).join("\n")) + "</textarea></label>" +
      '<label class="field full"><span>Head\'s name on reports</span><input class="input" name="head" value="' + esc(conf.head) + '" placeholder="e.g. Mr P. Chikore"></label></form>' +
      (me.isAdmin ? '<div class="row mt"><button class="btn btn-primary" data-act="pconf-save">' + I("check") + "Save</button></div>" : '<p class="small muted mt">Only an admin can change these.</p>') + "</div>";
    return html;
  };
  A.act["pconf-save"] = function () {
    var f = UI.formData(document.getElementById("pconf")), terms = {};
    [1, 2, 3].forEach(function (t) { if (f["opens" + t] || f["closes" + t]) terms[t] = { opens: f["opens" + t], closes: f["closes" + t] }; });
    var areas = f.areas.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    var bands = f.bands.split(/\r?\n/).map(function (x) { var m = /^\s*(\d{1,3})\s*%?\s+(.+)$/.exec(x); return m ? [Number(m[1]), m[2].trim()] : null; }).filter(Boolean);
    if (!areas.length) { UI.toast("List at least one learning area", "bad"); return; }
    if (!bands.length) { UI.toast("List at least one descriptor, e.g. 80 Excellent", "bad"); return; }
    var cur = S().get("settings", "primary") || { id: "primary" };
    S().put("settings", Object.assign({}, cur, { year: f.year.trim(), term: Number(f.term), terms: terms, areas: areas, bands: bands, head: f.head.trim() }));
    UI.toast("Saved"); A.render();
  };
})(window.App);
