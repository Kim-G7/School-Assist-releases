/* The school's subjects, each a record with an id and its exam code (2026-11-14).
 *
 * Before, a subject was only its name, written into each class, timetable slot, mark and student, so each page worked out
 * a student's subjects its own way (Enter students said "None yet" for students with marks in eleven subjects). Now each
 * subject is one record in "subjects": { id, name, code, group, forms }, set up by the school's admins and heads of
 * department (Settings → Subjects & codes; filled in from the school's subjects and its Cambridge syllabuses the first
 * time), and the pages find a subject's students, classes and teachers through it, as a relational database does:
 *   - a student's subjects: user.subjectIds (Enter students saves them, with the names as before); else the subjects
 *     the school registered by name; else their subject classes and their form's timetable and end-of-term marks;
 *   - a subject's classes: class.subjectId, else its name at the subject's level;
 *   - its teachers: the teachers whose subjects include it (user.areas), its classes' teachers and the timetable's.
 * The same subject at two levels is two records (Mathematics 0580 at IGCSE, 9709 at AS & A Level), each with its own
 * students. A teacher who teaches both is a teacher of Mathematics: teachers aren't given codes. The code is for the
 * students' information, shown small beside the subject's name for everyone (Sub.label).
 * The names stay on the classes, slots and marks as before, so older devices and hubs carry on as they were. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var Sub = (A.Subjects = {});
  var letters = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
  var slug = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x"; };
  var alive = function (r) { return r && !r._deleted; };
  var notSubject = function (name) { return !name || /^class$/i.test(String(name).trim()); }; // (a form's own class is "Class")

  Sub.GROUPS = [
    { id: "igcse", label: "IGCSE (O Level)", forms: "Forms 1 to 4", board: "Cambridge" },
    { id: "alevel", label: "AS & A Level", forms: "Forms 5 and 6", board: "Cambridge" },
    { id: "school", label: "School subjects", forms: "No exam code needed", board: "" },
  ];
  /** The group of a form: IGCSE for Forms 1 to 4, AS & A Level for the sixth form, the school's own for anything else. */
  Sub.group = function (level) {
    var l = String(level || "");
    return /form\s*[56]|lower\s*6|upper\s*6|sixth|a.?level/i.test(l) ? "alevel" : /form\s*[1-4]\b|o.?level|igcse/i.test(l) ? "igcse" : "school";
  };
  Sub.groupLabel = function (g) { var x = Sub.GROUPS.filter(function (y) { return y.id === g; })[0]; return x ? x.label : ""; };

  Sub.all = function () {
    return S().filter("subjects", alive).sort(function (a, b) { return Sub.GROUPS.map(function (g) { return g.id; }).indexOf(a.group) - Sub.GROUPS.map(function (g) { return g.id; }).indexOf(b.group) || a.name.localeCompare(b.name); });
  };
  Sub.byId = function (id) { var r = id && S().get("subjects", id); return alive(r) ? r : null; };
  /** The record for a subject's name at a form's level (or at any level, when none is given). */
  Sub.find = function (name, level) {
    var k = letters(name);
    if (!k) return null;
    var list = S().filter("subjects", function (r) { return alive(r) && letters(r.name) === k; });
    if (!list.length) return null;
    if (level == null) return list.length === 1 ? list[0] : null; // (two levels with that name: which one isn't known)
    var g = Sub.group(level);
    return list.filter(function (r) { return (r.forms || []).indexOf(level) >= 0; })[0] || list.filter(function (r) { return r.group === g; })[0] || null;
  };
  Sub.code = function (name, level) { var r = Sub.find(name, level); return r && r.code ? String(r.code) : ""; };
  /** The code, small and quiet beside a subject's name. */
  Sub.tag = function (code) { return code ? ' <span class="subj-code" title="Subject code">' + esc(code) + "</span>" : ""; };
  /** A subject's name with its code (HTML). */
  Sub.label = function (name, level, code) { return esc(name) + Sub.tag(code != null ? code : Sub.code(name, level)); };

  /** The subjects of a student: [{ id, name, code, group }] (id "" for a subject the school hasn't a record of yet). */
  Sub.ofStudent = function (u) {
    if (!u) return [];
    var level = u.level, out = [], seen = {};
    var add = function (name, rec) {
      if (notSubject(name)) return;
      var k = letters(name);
      if (seen[k]) return;
      seen[k] = 1;
      rec = rec || Sub.find(name, level);
      out.push({ id: rec ? rec.id : "", name: rec ? rec.name : name, code: rec && rec.code ? String(rec.code) : "", group: rec ? rec.group : Sub.group(level) });
    };
    var ids = (u.subjectIds || []).map(Sub.byId).filter(Boolean);
    if (ids.length) { ids.forEach(function (r) { add(r.name, r); }); return out; }
    if (u.registered && u.registered.length) { u.registered.forEach(function (n) { add(n); }); return out; }
    // not registered subject by subject yet: what the school's records say they do
    M.classesForStudent(u.id).forEach(function (c) { if (!c.homeroom) add(c.subject); });
    var home = M.homeroomOf ? M.homeroomOf(u.id) : null;
    if (home) {
      var P = A.Primary, offered = function (a) { return !P || !P.offers || P.offers(home, a); };
      S().filter("timetable", function (s) { return s.classId === home.id && !s.scope && s.area; }).forEach(function (s) { if (offered(s.area)) add(s.area); });
      S().filter("reportmarks", function (r) { return r.studentId === u.id && r.subject && r.mark != null && r.mark !== ""; }).forEach(function (r) { add(r.subject); });
    }
    return out;
  };
  var takes = function (u, rec) { return Sub.ofStudent(u).some(function (x) { return x.id === rec.id || (!x.id && letters(x.name) === letters(rec.name) && Sub.group(u.level) === rec.group); }); };
  /** The students taking a subject (by their ids), in name order. */
  Sub.students = function (rec) {
    return M.students().filter(function (u) { return !u.leftAt && u.status !== "declined" && u.status !== "pending" && (rec.forms && rec.forms.length ? rec.forms.indexOf(u.level) >= 0 : Sub.group(u.level) === rec.group) && takes(u, rec); })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  };
  /** A subject's classes: those linked to it, and those with its name at its level. */
  Sub.classes = function (rec) {
    return S().filter("classes", function (c) { return alive(c) && !c.homeroom && (c.subjectId === rec.id || (!c.subjectId && letters(c.subject) === letters(rec.name) && Sub.group(c.level) === rec.group)); });
  };
  /** Who teaches a subject: teachers with it among their subjects, its classes' teachers, the timetable's. Teachers aren't
      given codes: one teaching it at IGCSE and at A Level is a teacher of both. */
  Sub.teachers = function (rec) {
    var ids = {}, k = letters(rec.name);
    S().filter("users", function (u) { return alive(u) && u.role === "teacher" && (u.areas || []).some(function (a) { return letters(a) === k; }); }).forEach(function (u) { ids[u.id] = 1; });
    Sub.classes(rec).forEach(function (c) { if (c.teacherId) ids[c.teacherId] = 1; });
    S().filter("timetable", function (s) { if (!s.teacherId || letters(s.area) !== k) return false; var c = M.cls(s.classId); return !!c && Sub.group(c.level) === rec.group; }).forEach(function (s) { ids[s.teacherId] = 1; });
    return Object.keys(ids).map(M.user).filter(Boolean).sort(function (a, b) { return a.name.localeCompare(b.name); });
  };
  /** The subjects a teacher teaches (records), by their own subjects, classes and timetable. */
  Sub.ofTeacher = function (t) { return Sub.all().filter(function (r) { return Sub.teachers(r).some(function (x) { return x.id === t.id; }); }); };

  /* ------------------------------------------------------------------ the first time: the school's subjects as records */
  var PRIMARY_LIKE = function () { return !!A.Primary && !!A.Primary.levelAreas; };
  /** The records the school's subjects need (each name at each level its forms take it), with codes from the school's
      own syllabuses or the ready-made Cambridge ones; and each class linked to its subject. Never changes a code or name
      the school set. Ids are made from the group and the name, so two admins' devices doing it at once agree. */
  Sub.ensure = function () {
    var me = M.me(), meta = (S().state && S().state.meta) || {};
    if (!me || !Sub.mayEdit(me) || !PRIMARY_LIKE() || A.edition === "home") return Promise.resolve(0);
    // a device of a school hub: only once it has the hub's records (made before then, a record could replace a code
    // someone set on another device)
    if (A.Sync && A.Sync.hubMode && A.Sync.hubMode() && !(meta.serverSince > 0 && A.now() - (meta.lastSyncAt || 0) < 5 * 60000)) return Promise.resolve(null); // (null: not yet, ask again)
    var want = {}, levels = M.structure().levels || [];
    var need = function (name, level) {
      if (notSubject(name)) return;
      var g = Sub.group(level), k = g + "|" + letters(name);
      (want[k] = want[k] || { name: String(name).trim(), group: g, forms: [] });
      if (level && want[k].forms.indexOf(level) < 0) want[k].forms.push(level);
    };
    levels.forEach(function (lv) { (A.Primary.levelAreas(lv) || []).forEach(function (a) { need(a, lv); }); });
    S().filter("classes", function (c) { return alive(c) && !c.homeroom && c.subject; }).forEach(function (c) { need(c.subject, c.level); });
    var lib = A.loadSyllabusLibrary ? A.loadSyllabusLibrary().catch(function () { return []; }) : Promise.resolve([]);
    return lib.then(function (list) {
      var made = 0;
      Object.keys(want).forEach(function (k) {
        var w = want[k], id = "sbj_" + w.group + "_" + slug(w.name), cur = S().get("subjects", id);
        if (alive(cur)) {
          var forms = (cur.forms || []).slice(); w.forms.forEach(function (f) { if (forms.indexOf(f) < 0) forms.push(f); });
          if (forms.length !== (cur.forms || []).length) S().put("subjects", Object.assign({}, cur, { forms: forms }));
          return;
        }
        if (cur && cur._deleted) return; // (the school took it off its list)
        S().put("subjects", { id: id, name: w.name, group: w.group, forms: w.forms, code: codeFor(w, list), board: w.group === "school" ? "" : "Cambridge", madeBy: me.id });
        made++;
      });
      // each class linked to its subject (once)
      S().filter("classes", function (c) { return alive(c) && !c.homeroom && c.subject && !c.subjectId; }).forEach(function (c) {
        var r = Sub.find(c.subject, c.level);
        if (r) S().put("classes", Object.assign({}, c, { subjectId: r.id }));
      });
      return made;
    });
  };
  // an admin's or head of department's device makes the records by itself a little after signing in, and again when the
  // school's subjects change (Learning areas & terms), so the codes are there on every page without opening Settings
  var ensuredFor = "";
  setInterval(function () {
    var me = M.me && S().state ? M.me() : null;
    if (!me || !Sub.mayEdit(me)) return;
    var p = S().get("settings", "primary") || {}, k = me.id + "|" + (p.updatedAt || 0) + "|" + S().filter("classes", function (c) { return !c.homeroom; }).length;
    if (k === ensuredFor) return;
    ensuredFor = k;
    Sub.ensure().then(function (n) { if (n === null) ensuredFor = ""; else if (n) A.render(); }, function () { ensuredFor = ""; });
  }, 8000);
  /** A subject's Cambridge code: the school's own syllabus for it at that level, else the ready-made one. */
  function codeFor(w, lib) {
    if (w.group === "school") return "";
    var lvl = w.group === "alevel" ? /a\s*level|as\s*&/i : /igcse|o\s*level/i, keys = [letters(w.name)].concat((A.Enrol && A.Enrol.ALIAS && A.Enrol.ALIAS[letters(w.name)]) || []);
    var fit = function (s) { return s && s.code && keys.indexOf(letters(s.subject)) >= 0 && lvl.test(s.level || ""); };
    var own = S().filter("syllabi", function (s) { return alive(s) && fit(s); })[0];
    if (own) return String(own.code);
    var ready = (lib || []).filter(fit)[0];
    return ready ? String(ready.code) : "";
  }

  /* ------------------------------------------------------------------ Settings → Subjects & codes */
  /** Admins and heads of department set the subjects and their codes; everyone sees the codes. */
  Sub.mayEdit = function (me) { return !!me && me.role === "teacher" && (me.isAdmin || A.rank(me.title) === 5); };
  Sub.section = function (me) {
    var edit = Sub.mayEdit(me), all = Sub.all();
    var html = '<div class="callout mb">' + I("info") + '<div class="small">Each subject has its own record and code, so it is the same subject everywhere: Enter students, timetables, mark books, report cards and the students\' portal, which show the code small beside its name. ' +
      "Its syllabus is the Syllabus library's with the same code, whether it was added there or from a class, and the school has each syllabus once. " +
      "The same subject at IGCSE and at AS &amp; A Level is two subjects, each with its own code and students; a teacher who teaches both simply teaches the subject. " +
      (edit ? "Admins and heads of department set them here." : "Admins and heads of department set them.") + "</div></div>";
    if (!all.length) html += '<div class="card">' + UI.empty("book", "No subjects yet", "They are made from the school's subjects (Learning areas & terms) the first time an admin opens this page.") + "</div>";
    Sub.GROUPS.forEach(function (g) {
      var list = all.filter(function (r) { return r.group === g.id; });
      if (!list.length && g.id !== "school") return;
      html += '<div class="card mb"><div class="card-head">' + I("book") + "<h3>" + esc(g.label) + '</h3><span class="sub">' + esc(g.forms) + " · " + list.length + " subject" + (list.length === 1 ? "" : "s") + "</span>" +
        (edit ? '<button class="btn btn-sm" style="margin-left:auto" data-act="sbj-add" data-group="' + g.id + '">' + I("plus") + "Add a subject</button>" : "") + "</div>" +
        (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Subject</th><th>Code</th><th>Syllabus</th><th>Forms</th><th class="num">Students</th><th>Teachers</th><th></th></tr></thead><tbody>' + list.map(function (r) {
          var n = Sub.students(r).length, t = Sub.teachers(r), sy = A.Syl ? A.Syl.forSubject(r) : null;
          return "<tr><td><b>" + esc(r.name) + '</b><div class="tiny muted">' + esc(r.id) + "</div></td>" +
            "<td>" + (edit ? '<input class="input sm tnum" style="width:96px" value="' + esc(r.code || "") + '" maxlength="12" placeholder="' + (g.id === "school" ? "none" : "e.g. 0580") + '" aria-label="' + esc(r.name) + ' code" data-change="sbj-code" data-id="' + esc(r.id) + '">' : r.code ? '<span class="tnum">' + esc(r.code) + "</span>" : '<span class="muted">—</span>') + "</td>" +
            // its syllabus in the Syllabus library, by its syllabus ID (one store: js/syllabus.js A.Syl)
            '<td class="small">' + (sy ? '<a href="#/t/syllabus/' + esc(sy.id) + '">' + esc(A.Syl.title(sy)) + '</a><div class="tiny muted tnum">' + esc(sy.id) + "</div>"
              : edit && A.Tracker ? '<button class="btn btn-sm btn-ghost" data-act="trk-outline" data-subject="' + esc(r.name) + '" data-level="' + esc((r.forms || [])[0] || "") + '" data-forms="' + esc((r.forms || []).join("|")) + '">' + I("plus") + "Add</button>" : '<span class="muted">None yet</span>') + "</td>" +
            '<td class="small">' + esc((r.forms || []).join(", ") || "—") + "</td>" +
            '<td class="num"><button class="btn btn-sm btn-ghost" data-act="sbj-students" data-id="' + esc(r.id) + '">' + n + "</button></td>" +
            '<td class="small">' + (t.length ? t.map(function (x) { return esc(x.name) + (x.staffNo && me.isAdmin ? ' <span class="subj-code">' + esc(x.staffNo) + "</span>" : ""); }).join(", ") : '<span class="muted">Nobody yet</span>') + "</td>" +
            '<td class="num">' + (edit ? '<button class="btn btn-sm btn-ghost btn-icon" data-act="sbj-edit" data-id="' + esc(r.id) + '" aria-label="Edit ' + esc(r.name) + '">' + I("edit") + "</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<div class="card-pad small muted">None.</div>') + "</div>";
    });
    // the teachers, each by their staff ID, with the subjects (and codes) they teach
    var staff = M.teachers ? M.teachers() : S().filter("users", function (u) { return alive(u) && u.role === "teacher" && u.status !== "declined"; });
    staff = staff.filter(function (u) { return !(A.Fees && A.Fees.isFinance && A.Fees.isFinance(u)); }).sort(function (a, b) { return String(a.staffNo || "~").localeCompare(String(b.staffNo || "~")) || a.name.localeCompare(b.name); });
    if (all.length && staff.length && me.isAdmin) html += '<div class="card mb"><div class="card-head">' + I("users") + '<h3>Teachers</h3><span class="sub">by staff ID, with the subjects they teach</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Staff ID</th><th>Teacher</th><th>Subjects</th></tr></thead><tbody>' +
      staff.map(function (t) {
        var subs = Sub.ofTeacher(t);
        return '<tr><td class="tnum">' + esc(t.staffNo || "—") + "</td><td><b>" + esc(t.name) + '</b><div class="tiny muted">' + esc(t.title || "") + "</div></td><td class=\"small\">" +
          (subs.length ? subs.map(function (r) { return esc(r.name) + Sub.tag(r.code) + ' <span class="tiny muted">' + esc(r.group === "alevel" ? "A" : r.group === "igcse" ? "IGCSE" : "") + "</span>"; }).join(", ") : '<span class="muted">—</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
    return { html: html, mount: function () {
      // the first time (or a subject added to Learning areas & terms since): the records are made, then the page again
      if (edit) Sub.ensure().then(function (n) { if (n) A.render(); }).catch(function () { /* the library didn't load: later */ });
    } };
  };
  A.act["sbj-code"] = function (el) {
    var r = Sub.byId(el.getAttribute("data-id")), v = el.value.trim().slice(0, 12);
    if (!r || !Sub.mayEdit(M.me()) || String(r.code || "") === v) return;
    S().put("subjects", Object.assign({}, r, { code: v }));
    UI.toast(r.name + (v ? ": code " + v : ": no code"));
  };
  A.act["sbj-students"] = function (el) {
    var r = Sub.byId(el.getAttribute("data-id"));
    if (!r) return;
    var list = Sub.students(r);
    UI.modal({ title: r.name + (r.code ? " · " + r.code : ""), sub: Sub.groupLabel(r.group) + " · " + list.length + " student" + (list.length === 1 ? "" : "s"), size: "wide", flush: true,
      body: list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Student ID</th><th>Student</th><th>Class</th></tr></thead><tbody>' + list.map(function (u) {
        var h = M.homeroomOf ? M.homeroomOf(u.id) : null;
        return '<tr><td class="tnum">' + esc(u.studentNo || "—") + "</td><td><b>" + esc(u.name) + "</b></td><td>" + esc(h ? h.name : [u.level, u.stream].filter(Boolean).join(" ")) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="card-pad">' + UI.empty("users", "No students take it yet") + "</div>",
      foot: [{ label: "Close", cls: "btn-primary" }] });
  };
  function editModal(r, group) {
    var me = M.me(), isNew = !r, levels = M.structure().levels || [], g = r ? r.group : group || "igcse";
    var formsOf = function (gid) { return levels.filter(function (l) { return Sub.group(l) === gid; }); };
    UI.modal({ title: isNew ? "Add a subject" : "Edit " + r.name, sub: Sub.groupLabel(g),
      body: '<form id="sbj-form" class="form-grid"><label class="field full"><span>Subject</span><input class="input" name="name" value="' + esc(r ? r.name : "") + '"' + (isNew ? "" : " readonly") + ' placeholder="e.g. Accounting" autocomplete="off"></label>' +
        (isNew ? "" : '<p class="tiny muted full" style="margin-top:-6px">Its name is how the timetable, mark books and older records know it, so it stays as it is.</p>') +
        '<label class="field"><span>Code</span><input class="input tnum" name="code" value="' + esc(r ? r.code || "" : "") + '" maxlength="12" placeholder="' + (g === "school" ? "none" : "e.g. 0452") + '" autocomplete="off"></label>' +
        '<div class="field full"><span class="label">Forms that take it</span><div class="row wrap" style="gap:12px">' + (formsOf(g).length ? formsOf(g) : levels).map(function (l) {
          return '<label class="check"><input type="checkbox" name="f_' + esc(l) + '"' + ((r ? (r.forms || []).indexOf(l) >= 0 : true) ? " checked" : "") + "> " + esc(l) + "</label>";
        }).join("") + "</div></div></form>",
      foot: (isNew ? [] : [{ label: "Remove", cls: "btn-ghost", onClick: function () {
        return UI.confirm("Take " + r.name + " (" + Sub.groupLabel(r.group) + ") off the school's subjects? Its marks and classes stay; it just has no record and code.", { danger: true, ok: "Remove" }).then(function (ok) {
          if (!ok) return false; S().remove("subjects", r.id); UI.toast(r.name + " removed"); A.render();
        });
      } }]).concat([{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var d = UI.formData(m.querySelector("#sbj-form")), name = (d.name || "").trim(), forms = (formsOf(g).length ? formsOf(g) : levels).filter(function (l) { return d["f_" + l]; });
        if (!name) { UI.toast("Give the subject's name", "bad"); return false; }
        var id = r ? r.id : "sbj_" + g + "_" + slug(name);
        if (isNew && Sub.byId(id)) { UI.toast(name + " is on the list already", "bad"); return false; }
        S().put("subjects", Object.assign({}, r || { id: id, name: name, group: g, board: g === "school" ? "" : "Cambridge", madeBy: me.id }, { code: String(d.code || "").trim().slice(0, 12), forms: forms }));
        // a new subject: on the forms' subject lists too (Learning areas & terms), so it can be ticked for students
        if (isNew && A.Primary && A.Primary.addArea) forms.forEach(function (l) { A.Primary.addArea(l, name); });
        UI.toast(isNew ? name + " added" : "Saved");
        A.render();
      } }]) });
  }
  A.act["sbj-add"] = function (el) { if (Sub.mayEdit(M.me())) editModal(null, el.getAttribute("data-group")); };
  A.act["sbj-edit"] = function (el) { if (Sub.mayEdit(M.me())) editModal(Sub.byId(el.getAttribute("data-id"))); };
})(window.App);
