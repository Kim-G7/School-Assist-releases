/* Erasing a person from the school's records (2026-11-16), the same way everywhere: an admin's Delete (Settings → People
 * & devices), and someone deleting their own account (Settings → My password → Delete my account), which the school
 * hub does itself (hub-access.cjs eraseMe). This file is loaded by the app's page and required by the hub, so both
 * erase exactly the same records.
 *
 * Erasing works out the changes from the records and changes nothing itself: plan(colls, id) → [{ coll, id, rec }],
 * rec null for a record to remove (each device gets it as removed, as with any deletion), else the record as it is to be.
 *
 *   A student:  their account, sign-in, devices, password requests and parents' links; their work (submissions,
 *               progress, attempts, papers done, reading receipts, subject requests), their marks (tasks', the Mark
 *               book's, end-of-term marks and comments, reports, pupil notes) and their places in registers; they leave
 *               every class, task, notification and alert. A task or notification for them alone goes too.
 *   A teacher:  their account, sign-in, devices, alerts and password requests; their classes, lessons and syllabus
 *               records stay with no teacher, for an admin to give to someone else, and notices to them alone go.
 *               The school's work they made (tasks, materials, marks they gave, notices they sent) stays.
 * The fee records (the bursar's accounts, payments, transport and exam candidates) are kept: they are the school's
 * accounts, and only the bursar's and accountant's devices change them. */
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make();
  else (root.App = root.App || {}).EraseCore = make();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var alive = function (r) { return !!r && !r._deleted; };
  var vals = function (colls, name) { var c = colls[name] || {}; return Object.keys(c).map(function (k) { return c[k]; }).filter(alive); };
  var has = function (list, id) { return Array.isArray(list) && list.indexOf(id) >= 0; };
  var without = function (list, id) { return list.filter(function (x) { return x !== id; }); };
  var drop = function (obj, id) { var out = {}; Object.keys(obj || {}).forEach(function (k) { if (k !== id) out[k] = obj[k]; }); return out; };
  // a student's own records, by studentId; and theirs by pupilId (School Assist Teacher's pages)
  var BY_STUDENT = ["submissions", "receipts", "progress", "attempts", "enrolments", "marks", "reportmarks"];
  var BY_PUPIL = ["reports", "pnotes"];
  var FEES = ["feeschedules", "feeaccounts", "feepayments", "transportlist", "candidates"];

  function plan(colls, uid) {
    var out = [], seen = {};
    var put = function (coll, rec) { var k = coll + "/" + rec.id; if (!seen[k]) { seen[k] = 1; out.push({ coll: coll, id: rec.id, rec: rec }); } else out.forEach(function (x) { if (x.coll === coll && x.id === rec.id && x.rec) x.rec = rec; }); };
    var gone = function (coll, id) { var k = coll + "/" + id; if (seen[k]) { out.forEach(function (x) { if (x.coll === coll && x.id === id) x.rec = null; }); return; } seen[k] = 1; out.push({ coll: coll, id: id, rec: null }); };
    var u = (colls.users || {})[uid];
    if (!alive(u)) return out;
    var student = u.role === "student";

    gone("users", uid);
    vals(colls, "credentials").forEach(function (c) { if (c.userId === uid || c.id === "cr_" + uid) gone("credentials", c.id); });
    vals(colls, "devices").forEach(function (d) { if (d.userId === uid) gone("devices", d.id); });
    vals(colls, "pwrequests").forEach(function (r) { if (r.appId === uid || r.userId === uid) gone("pwrequests", r.id); });
    vals(colls, "alerts").forEach(function (a) {
      if (a.teacherId === uid || a.aboutId === uid || a.id === "al_reg_" + uid || a.id.indexOf("al_enrol_" + uid + "_") === 0) return gone("alerts", a.id);
      if (has(a.studentIds, uid)) { var left = without(a.studentIds, uid); if (!left.length && a.kind === "copy") gone("alerts", a.id); else put("alerts", Object.assign({}, a, { studentIds: left })); }
    });
    // in a class: out of its students, or (its teacher) the class keeps going with no teacher
    vals(colls, "classes").forEach(function (c) {
      var next = null;
      if (has(c.studentIds, uid)) next = Object.assign({}, c, { studentIds: without(c.studentIds, uid) });
      if (c.teacherId === uid) next = Object.assign({}, next || c, { teacherId: null });
      if (next) put("classes", next);
    });

    if (student) {
      BY_STUDENT.forEach(function (name) { vals(colls, name).forEach(function (r) { if (r.studentId === uid) gone(name, r.id); }); });
      BY_PUPIL.forEach(function (name) { vals(colls, name).forEach(function (r) { if (r.pupilId === uid) gone(name, r.id); }); });
      // the Mark book's marks and the registers: their entry out of each
      vals(colls, "assessments").forEach(function (a) {
        if ((a.marks && uid in a.marks) || (a.marksAt && uid in a.marksAt)) put("assessments", Object.assign({}, a, { marks: drop(a.marks, uid), marksAt: a.marksAt ? drop(a.marksAt, uid) : a.marksAt }));
      });
      vals(colls, "attendance").forEach(function (r) { if (r.marks && uid in r.marks) put("attendance", Object.assign({}, r, { marks: drop(r.marks, uid) })); });
      // set for them, or sent to them: by name; a task or notification for them alone goes
      vals(colls, "tasks").forEach(function (t) { if (has(t.assignedTo, uid)) { var to = without(t.assignedTo, uid); if (to.length) put("tasks", Object.assign({}, t, { assignedTo: to })); else gone("tasks", t.id); } });
      vals(colls, "messages").forEach(function (m) { if (has(m.to, uid)) { var to = without(m.to, uid); if (to.length) put("messages", Object.assign({}, m, { to: to })); else gone("messages", m.id); } });
      vals(colls, "materials").forEach(function (m) { if (has(m.audience, uid)) put("materials", Object.assign({}, m, { audience: without(m.audience, uid) })); });
      // parents follow only the children still at the school
      vals(colls, "parents").forEach(function (p) { if (has(p.studentIds, uid)) { var kids = without(p.studentIds, uid); if (kids.length) put("parents", Object.assign({}, p, { studentIds: kids })); else gone("parents", p.id); } });
    } else {
      // a teacher's lessons and syllabus records stay, with no teacher; notices to them alone go
      vals(colls, "timetable").forEach(function (s) { if (s.teacherId === uid) put("timetable", Object.assign({}, s, { teacherId: null })); });
      vals(colls, "coverage").forEach(function (r) { if (r.teacherId === uid) put("coverage", Object.assign({}, r, { teacherId: null })); });
      vals(colls, "notices").forEach(function (n) { if (has(n.to, uid)) { var to = without(n.to, uid); if (to.length) put("notices", Object.assign({}, n, { to: to })); else gone("notices", n.id); } });
      vals(colls, "users").forEach(function (x) { if (x.id !== uid && x.role === "teacher" && has(x.classIds, uid)) put("users", Object.assign({}, x, { classIds: without(x.classIds, uid) })); });
    }
    return out;
  }
  /** The plan in words' worth of numbers: { removed: { coll: n }, changed: { coll: n } }. */
  function summary(list) {
    var s = { removed: {}, changed: {} };
    list.forEach(function (x) { var k = x.rec ? "changed" : "removed"; s[k][x.coll] = (s[k][x.coll] || 0) + 1; });
    return s;
  }
  /** Is this the school's last admin? (They can't be deleted: someone must run the school.) */
  function lastAdmin(colls, uid) {
    var u = (colls.users || {})[uid];
    if (!alive(u) || !u.isAdmin) return false;
    return !vals(colls, "users").some(function (x) { return x.id !== uid && x.role === "teacher" && x.isAdmin && x.status !== "pending" && x.status !== "declined" && !x.leftAt; });
  }
  return { plan: plan, summary: summary, lastAdmin: lastAdmin, FEES: FEES, BY_STUDENT: BY_STUDENT };
});
