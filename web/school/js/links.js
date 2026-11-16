/* How the school's records hold together (2026-11-16): each record that points at another (a class at its teacher, its
 * students, its syllabus and subject; a mark at its task and student; a sign-in at its person; a parent at their
 * children…) is checked to point at one that is there. Settings → Backup & data → Check the records, for admins.
 *
 *   A.Links.check() → [{ kind, coll, id, text, fix }]: what points at nothing (a record deleted, or never there), and
 *   students with no class of their own or in two. `fix` says whether Fix can mend it safely:
 *     - a list naming someone gone (a class's students, a parent's children, a teacher's classes) drops them;
 *     - a class or lesson whose teacher is gone keeps going with no teacher;
 *     - the sign-in, devices, work and marks of someone who is gone are erased (js/erase-core.js would have erased them).
 *   Anything else (a task of a deleted class, a mark of a deleted task) is listed for the school to look at: those are
 *   hidden from every page already, and are kept in case the class or task is brought back from a backup. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var L = (A.Links = {});
  var live = function (coll) { return S().all(coll).filter(function (r) { return r && !r._deleted; }); };
  var there = function (coll, id) { var r = id && S().get(coll, id); return !!r && !r._deleted; };
  var person = function (id, role) { var u = id && S().get("users", id); return !!u && !u._deleted && (!role || u.role === role); };
  var label = function (c) { return c ? (c.homeroom ? c.name : (c.name || "") + " · " + (c.subject || "")) : ""; };

  L.check = function () {
    var out = [], add = function (kind, coll, id, text, fix) { out.push({ kind: kind, coll: coll, id: id, text: text, fix: fix || null }); };
    var classes = live("classes"), users = live("users"), students = users.filter(function (u) { return u.role === "student"; });
    // classes: teacher, students, syllabus, subject
    classes.forEach(function (c) {
      if (c.teacherId && !person(c.teacherId, "teacher")) add("teacher", "classes", c.id, label(c) + ": its teacher is gone", "noTeacher");
      var dead = (c.studentIds || []).filter(function (id) { return !person(id, "student"); });
      if (dead.length) add("students", "classes", c.id, label(c) + ": " + dead.length + " of its students " + (dead.length === 1 ? "is" : "are") + " gone", "dropStudents");
      var dup = (c.studentIds || []).filter(function (id, i, a) { return a.indexOf(id) !== i; });
      if (dup.length) add("students", "classes", c.id, label(c) + ": " + dup.length + " student" + (dup.length === 1 ? "" : "s") + " listed twice", "dropStudents");
      if (!c.homeroom && c.syllabusId && !there("syllabi", c.syllabusId)) add("syllabus", "classes", c.id, label(c) + ": its syllabus is gone");
      if (!c.homeroom && c.subjectId && !there("subjects", c.subjectId)) add("subject", "classes", c.id, label(c) + ": its subject record is gone");
    });
    // students: one class of their own (the School edition's forms), and their subject classes at their form
    var homes = classes.filter(function (c) { return c.homeroom; });
    if (homes.length) students.forEach(function (u) {
      if (u.leftAt || u.status === "pending" || u.status === "declined") return;
      var mine = homes.filter(function (c) { return (c.studentIds || []).indexOf(u.id) >= 0; });
      if (!mine.length) add("homeroom", "users", u.id, u.name + " (" + (u.studentNo || "no ID") + ") isn't in a class of their own");
      if (mine.length > 1) add("homeroom", "users", u.id, u.name + " is in " + mine.length + " classes of their own: " + mine.map(function (c) { return c.name; }).join(", "));
      classes.forEach(function (c) { if (!c.homeroom && (c.studentIds || []).indexOf(u.id) >= 0 && c.level && u.level && c.level !== u.level) add("level", "classes", c.id, u.name + " (" + u.level + ") is in " + label(c) + " (" + c.level + ")"); });
    });
    users.filter(function (u) { return u.role === "teacher"; }).forEach(function (t) {
      var dead = (t.classIds || []).filter(function (id) { return !there("classes", id); });
      if (dead.length) add("classes", "users", t.id, t.name + ": " + dead.length + " of the classes given to them " + (dead.length === 1 ? "is" : "are") + " gone", "dropClassIds");
    });
    // what belongs to someone
    var owned = [["credentials", "userId", "sign-in"], ["devices", "userId", "device"]];
    owned.forEach(function (o) { live(o[0]).forEach(function (r) { if (r[o[1]] && !person(r[o[1]])) add("owner", o[0], r.id, "A " + o[2] + " of someone who is gone", "erase"); }); });
    ["submissions", "progress", "attempts", "enrolments", "marks", "reportmarks", "receipts"].forEach(function (coll) {
      live(coll).forEach(function (r) { if (r.studentId && !person(r.studentId, "student")) add("owner", coll, r.id, coll + ": a record of a student who is gone", "erase"); });
    });
    live("alerts").forEach(function (a) { if (a.teacherId && !person(a.teacherId)) add("owner", "alerts", a.id, "A notification for someone who is gone", "erase"); });
    live("parents").forEach(function (p) {
      var dead = (p.studentIds || []).filter(function (id) { return !person(id, "student"); });
      if (dead.length) add("parents", "parents", p.id, (A.Parents ? A.Parents.name(p) : p.last) + ": " + dead.length + " of their children " + (dead.length === 1 ? "is" : "are") + " gone", "dropStudents");
    });
    // the work of a class, task or syllabus
    live("tasks").forEach(function (t) { if (!there("classes", t.classId)) add("orphan", "tasks", t.id, "Task “" + t.title + "”: its class is gone"); });
    live("marks").forEach(function (m) { if (!there("tasks", m.taskId)) add("orphan", "marks", m.id, "A mark for a task that is gone"); });
    live("submissions").forEach(function (m) { if (!there("tasks", m.taskId)) add("orphan", "submissions", m.id, "Work handed in for a task that is gone"); });
    live("assessments").forEach(function (a) {
      if (!there("classes", a.classId)) add("orphan", "assessments", a.id, "Marks “" + a.title + "”: its class is gone");
      var dead = Object.keys(a.marks || {}).filter(function (id) { return !person(id, "student"); });
      if (dead.length) add("owner", "assessments", a.id, "“" + a.title + "”: marks of " + dead.length + " student" + (dead.length === 1 ? "" : "s") + " who are gone", "dropMarks");
    });
    live("enrolments").forEach(function (e) { if (e.syllabusId && !there("syllabi", e.syllabusId)) add("orphan", "enrolments", e.id, "A subject of a student, on a syllabus that is gone"); });
    live("coverage").forEach(function (r) {
      if (!there("classes", r.classId)) add("orphan", "coverage", r.id, "A syllabus record of a class that is gone");
      if (r.syllabusId && !there("syllabi", r.syllabusId)) add("syllabus", "coverage", r.id, "A class's syllabus record, on a syllabus that is gone");
    });
    live("timetable").forEach(function (s) {
      if (!there("classes", s.classId)) add("orphan", "timetable", s.id, "A lesson of a class that is gone");
      else if (s.teacherId && !person(s.teacherId, "teacher")) add("teacher", "timetable", s.id, "A lesson whose teacher is gone", "noTeacher");
    });
    live("attendance").forEach(function (r) { if (!there("classes", r.classId)) add("orphan", "attendance", r.id, "A register of a class that is gone"); });
    live("materials").forEach(function (m) { if (m.classId && !there("classes", m.classId)) add("orphan", "materials", m.id, "“" + m.title + "”: its class is gone"); });
    live("syllabi").forEach(function (s) { if (s.subjectId && !there("subjects", s.subjectId)) add("subject", "syllabi", s.id, (s.subject || "A syllabus") + ": its subject record is gone"); });
    return out;
  };

  /** Mend what can be mended safely (each problem's `fix`). Returns how many records changed. */
  L.repair = function (list) {
    var n = 0, done = {};
    (list || L.check()).forEach(function (p) {
      if (!p.fix) return;
      var k = p.coll + "/" + p.id + "/" + p.fix;
      if (done[k]) return;
      done[k] = 1;
      var r = S().get(p.coll, p.id);
      if (!r || r._deleted) return;
      if (p.fix === "erase") { S().remove(p.coll, p.id); n++; return; }
      if (p.fix === "noTeacher") { S().put(p.coll, Object.assign({}, r, { teacherId: null })); n++; return; }
      if (p.fix === "dropStudents") {
        var ids = (r.studentIds || []).filter(function (id, i, a) { return person(id, "student") && a.indexOf(id) === i; });
        if (p.coll === "parents" && !ids.length) S().remove("parents", r.id); else S().put(p.coll, Object.assign({}, r, { studentIds: ids }));
        n++; return;
      }
      if (p.fix === "dropClassIds") { S().put("users", Object.assign({}, r, { classIds: (r.classIds || []).filter(function (id) { return there("classes", id); }) })); n++; return; }
      if (p.fix === "dropMarks") {
        var keep = {}; Object.keys(r.marks || {}).forEach(function (id) { if (person(id, "student")) keep[id] = r.marks[id]; });
        S().put("assessments", Object.assign({}, r, { marks: keep })); n++;
      }
    });
    return n;
  };

  /* ------------------------------------------------------------------ Settings → Backup & data */
  L.card = function () {
    return '<div class="card card-pad mt"><div class="row wrap spread"><div><h3>Check the records</h3><p class="muted small mt-sm" style="max-width:640px">Every record that points at another (a class at its teacher, students and syllabus; a mark at its task and student; a sign-in at its person; a parent at their children) is checked to point at one that is there.</p></div>' +
      '<button class="btn" data-act="links-check">' + I("checkCircle") + "Check the records</button></div></div>";
  };
  var KINDS = { teacher: "Teachers", students: "Students in classes", syllabus: "Syllabuses", subject: "Subjects", homeroom: "Students' own classes", level: "Students' forms", classes: "Teachers' classes", owner: "Records of someone gone", parents: "Parents", orphan: "Records of something deleted" };
  A.act["links-check"] = function () {
    var list = L.check(), fixable = list.filter(function (p) { return p.fix; }).length, by = {};
    list.forEach(function (p) { (by[p.kind] = by[p.kind] || []).push(p); });
    UI.modal({
      title: "Check the records", sub: list.length ? list.length + " to look at" + (fixable ? ", " + fixable + " that Fix mends" : "") : "Everything points where it should", size: "wide",
      body: list.length ? Object.keys(by).map(function (k) {
        return '<div class="label mt">' + esc(KINDS[k] || k) + " · " + by[k].length + '</div><ul class="erase-list">' + by[k].slice(0, 30).map(function (p) { return "<li>" + esc(p.text) + (p.fix ? ' <span class="badge good">Fix mends it</span>' : "") + "</li>"; }).join("") + (by[k].length > 30 ? "<li>… and " + (by[k].length - 30) + " more</li>" : "") + "</ul>";
      }).join("") + '<p class="small muted mt">Fix doesn\'t delete classes, tasks or marks: those are listed for you to look at.</p>' : UI.empty("checkCircle", "All linked", "Every class, student, teacher, subject, syllabus, mark and sign-in points at a record that is there."),
      foot: [{ label: "Close" }].concat(fixable ? [{ label: "Fix " + fixable, cls: "btn-primary", icon: "check", onClick: function () { var n = L.repair(list); UI.toast(n + " record" + (n === 1 ? "" : "s") + " mended"); A.render(); } }] : []),
    });
  };
})(window.App);
