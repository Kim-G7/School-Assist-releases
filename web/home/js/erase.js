/* Deleting someone, and deleting your own account (2026-11-16).
 *
 * Who may delete a student or a teacher: the school's admins, in Settings → People & devices (the hub refuses any other
 * device's deletion of an account: hub-access.cjs mayWrite). A class teacher can't delete a student; they can say a
 * pupil has left (their records are kept). Enter students adds students and changes their subjects, and deletes no one.
 *
 * What a deletion erases is js/erase-core.js, the same on an admin's device and on the school hub:
 *   - an admin's Delete: the person and everything that is theirs, from this device (it reaches every device with the
 *     next sync). For a student who has left, "Left the school" keeps their marks and reports instead.
 *   - Delete my account (Settings → My password): a student or a teacher, with their password and the word DELETE. On a
 *     school hub the hub erases it (POST /api/erase-me, School Assist 1.8.7 or later); with no hub (one computer on its
 *     own), this device does. They are signed out, and to come back they start again from the beginning: a student is
 *     entered by the school again (a new account and password), a teacher registers with the staff code and waits for
 *     an admin. The school's last admin can't delete their account, nor be deleted.
 * Not online (School Assist Home): an admin removes accounts there (Settings → People). */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var Er = (A.Erase = {});
  var core = function () { return A.EraseCore; };
  Er.plan = function (uid) { return core().plan(S().state.colls, uid); };
  Er.lastAdmin = function (uid) { return core().lastAdmin(S().state.colls, uid); };
  /** Make the plan's changes on this device (they reach the others with the next sync). */
  Er.apply = function (list) { list.forEach(function (x) { if (x.rec) S().put(x.coll, x.rec); else S().remove(x.coll, x.id); }); return list; };

  /** What goes, in a few lines (HTML), for the person's own confirmation or an admin's. */
  Er.words = function (u, list, yours) {
    var s = core().summary(list), n = function () { var t = 0; for (var i = 0; i < arguments.length; i++) t += s.removed[arguments[i]] || 0; return t; };
    var ch = function (k) { return s.changed[k] || 0; }, them = yours ? "your" : "their", pl = function (k, w) { return k + " " + w + (k === 1 ? "" : "s"); };
    var li = [];
    li.push((yours ? "Your" : "Their") + " account, sign-in" + (n("devices") ? " and " + pl(n("devices"), "device") : ""));
    if (u.role === "student") {
      var work = n("submissions", "progress", "attempts", "receipts", "enrolments");
      var marks = n("marks", "reportmarks", "reports", "pnotes") + ch("assessments") + ch("attendance");
      if (work) li.push(pl(work, "record") + " of " + them + " work and progress");
      if (marks) li.push(pl(marks, "mark, report and register entry") .replace("entrys", "entries"));
      if (ch("classes")) li.push(them.charAt(0).toUpperCase() + them.slice(1) + " place in " + pl(ch("classes"), "class") + (n("tasks") ? " and " + pl(n("tasks"), "task") + " set for " + (yours ? "you" : "them") + " alone" : ""));
      if (n("parents") + ch("parents")) li.push("Their parents' link to " + (yours ? "you" : "them"));
    } else {
      if (n("alerts")) li.push(pl(n("alerts"), "notification"));
      if (ch("classes") + ch("timetable")) li.push((ch("classes") ? pl(ch("classes"), "class") : "") + (ch("classes") && ch("timetable") ? " and " : "") + (ch("timetable") ? pl(ch("timetable"), "lesson") : "") + " stay, with no teacher, for an admin to give to someone else");
    }
    return '<ul class="erase-list">' + li.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  };

  /* ------------------------------------------------------------------ an admin's Delete (Settings → People & devices) */
  /** Resolves true when they were deleted (or marked as gone). */
  Er.adminDelete = function (u) {
    var me = M.me();
    if (!me || !me.isAdmin || !u || u.id === me.id) return Promise.resolve(false);
    if (Er.lastAdmin(u.id)) { UI.toast(u.name + " is the school's only admin: make someone else an admin first", "bad"); return Promise.resolve(false); }
    var list = Er.plan(u.id), student = u.role === "student";
    return new Promise(function (resolve) {
      var done = function (v) { resolve(v); };
      UI.modal({
        title: "Delete " + u.name + "?", size: "wide",
        body: "<p>This erases, on every device:</p>" + Er.words(u, list, false) +
          (student ? '<div class="callout mt">' + I("info") + "<div>Has " + esc(A.firstName(u.name)) + " left the school? Choose <b>Left the school</b>: they leave their classes and can't sign in, and their marks and reports are kept for the school's records.</div></div>" : "") +
          '<p class="small muted mt">' + (student ? "The school's fee records for " + esc(A.firstName(u.name)) + " are kept: they are the bursar's accounts. " : "The work they made for the school (tasks, materials, marks they gave, notices) stays. ") + "Deleting can't be undone: download a backup first (Settings → Backup) if you might need it.</p>",
        foot: (student ? [{ label: "Left the school", icon: "logout", onClick: function () { Er.left(u); done(true); } }] : []).concat([{ label: "Cancel", onClick: function () { done(false); } }, { label: "Delete everything", cls: "btn-danger", icon: "trash", onClick: function () {
          if (Er.lastAdmin(u.id)) { UI.toast("They are the school's only admin now", "bad"); return false; }
          Er.apply(Er.plan(u.id));
          if (A.Sync && A.Sync.maybe) A.Sync.maybe();
          UI.toast(u.name + " is deleted");
          done(true);
        } }]),
        onClose: function () { done(false); },
      });
    });
  };
  /** A student who has left: out of their classes, can't sign in; their records stay. */
  Er.left = function (u) {
    S().filter("classes", function (c) { return (c.studentIds || []).indexOf(u.id) >= 0; }).forEach(function (c) { S().put("classes", Object.assign({}, c, { studentIds: c.studentIds.filter(function (x) { return x !== u.id; }) })); });
    S().put("users", Object.assign({}, u, { leftAt: A.now() }));
    if (A.Sync && A.Sync.maybe) A.Sync.maybe();
    UI.toast(u.name + " has left the school: their records are kept");
  };

  /* ------------------------------------------------------------------ Delete my account (Settings → My password) */
  Er.selfOn = function (me) { return !!me && (me.role === "student" || me.role === "teacher") && !A.Cloud && !(A.SchoolId && A.SchoolId.isDemo && A.SchoolId.isDemo()); };
  Er.selfCard = function (me) {
    if (!Er.selfOn(me)) return "";
    return '<div class="card card-pad mt erase-card" style="max-width:480px"><h3>Delete my account</h3><p class="muted small mt-sm">' +
      (me.role === "student" ? "Your account, your work, your marks and your progress are erased for good. To use School Assist again you start from the beginning: the school enters you again, with a new password."
        : "Your account and sign-in are erased for good. To use School Assist again you register with the school's staff code and wait for an admin.") + "</p>" +
      '<button class="btn btn-danger mt" data-act="erase-me">' + I("trash") + "Delete my account…</button></div>";
  };
  A.act["erase-me"] = function () {
    var me = M.me();
    if (!Er.selfOn(me)) return;
    if (Er.lastAdmin(me.id)) { UI.toast("You are the school's only admin. Make someone else an admin first.", "bad"); return; }
    var list = Er.plan(me.id);
    UI.modal({
      title: "Delete my account", sub: "This can't be undone", sticky: true,
      body: "<p>This erases, on every device:</p>" + Er.words(me, list, true) +
        '<p class="small muted mt">' + (me.role === "student" ? "To use School Assist again you start from the beginning: the school enters you again, and you set up a new password. The school's fee records are kept." : "To use School Assist again you register with the school's staff code and wait for an admin. The work you made for the school (tasks, materials, marks) stays.") + "</p>" +
        '<form id="erase-form" class="mt" onsubmit="return false"><label class="field"><span>Your password' + (me.role === "teacher" && !A.staffPassword(me) ? " or PIN" : "") + '</span><input class="input" type="password" name="secret" autocomplete="current-password"></label>' +
        '<label class="field"><span>Type DELETE to confirm</span><input class="input" name="word" autocomplete="off" autocapitalize="characters" spellcheck="false"></label></form>',
      foot: [{ label: "Cancel" }, { label: "Delete my account", cls: "btn-danger", icon: "trash", onClick: function (m) {
        var f = UI.formData(m.querySelector("#erase-form")), btn = m.querySelector(".modal-foot .btn-danger");
        if (String(f.word || "").trim() !== "DELETE") { UI.toast("Type DELETE, in capitals, to confirm", "bad"); return false; }
        if (!f.secret) { UI.toast("Type your password", "bad"); return false; }
        if (btn) btn.disabled = true;
        return Er.selfErase(me, f.secret).then(function () {
          setTimeout(function () {
            if (A.LastUser) A.LastUser.forget();
            A.loginNotice = "Your account is deleted. To use School Assist again, start from the beginning.";
            A.act.signout();
          }, 0);
          return true;
        }, function (e) { if (btn) btn.disabled = false; UI.toast(e.message || String(e), "bad"); return false; });
      } }],
    });
  };
  /** Erase this person's own account: through the school hub, or here when there is none. */
  Er.selfErase = function (me, secret) {
    if (A.Sync && A.Sync.hubMode && A.Sync.hubMode()) {
      return A.Sync.hubPost("/api/erase-me", { userId: me.id, secret: secret, confirm: "DELETE" }).then(function (j) {
        // the hub has erased it; this device forgets it too, now
        Er.apply(Er.plan(me.id));
        return S().flush ? S().flush().then(function () { return j; }) : j;
      }, function (e) {
        var m = String((e && e.message) || e);
        if (/replied 404/.test(m)) throw new Error("Your school's hub needs School Assist 1.8.7 or later for this. Ask an admin to delete your account.");
        if (e && e.code === "offline") throw new Error("Can't reach the school hub. Connect to the school's Wi-Fi and try again.");
        throw new Error(m);
      });
    }
    if (M.checkSecret(me.id, secret) !== true) return Promise.reject(new Error(me.role === "teacher" ? "That password or PIN isn't right." : "That password isn't right."));
    if (Er.lastAdmin(me.id)) return Promise.reject(new Error("You are the school's only admin. Make someone else an admin first."));
    Er.apply(Er.plan(me.id));
    return Promise.resolve({ ok: true });
  };
})(window.App);
