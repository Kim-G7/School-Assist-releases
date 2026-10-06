/* Staff sign-up codes, admin approval, and remembering who used this device.
 *
 * Sign-up codes: teachers and admins register themselves with the school's code, which starts
 * with the school's abbreviation: Winwood College → WWC-4K7-9QP, St Georges High School →
 * SGHS-M2X-8TR, Peterhouse College → PHC-…. There is one code for admins and a different one
 * for teachers; everyone in that role shares it. A new account waits until an admin approves
 * it. Only admins approve teachers and other admins (teachers approve students' subjects only).
 *   Offline (school hub): the codes are a settings record ("staffcodes").
 *   Online (home edition): the codes stay on the server (cloud/migrations/007_staff_codes.sql);
 *   registering goes through cloud/functions/register-staff, approving through cloud/functions/admin.
 *
 * This device remembers who signed in last (on this device only). The sign-in screen offers
 * "Continue as …", and when someone signs in as a teacher or admin on a device a student used
 * last, they must also enter the school's staff code for their role, and the admins are told. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  /* ------------------------------------------------------------ the school's abbreviation */
  var SMALL = { the: 1, of: 1, and: 1, for: 1, "&": 1, at: 1, de: 1 };
  // parts of one-word names: Winwood → Win·wood, Peterhouse → Peter·house, Greenfield → Green·field
  var PARTS = ["wood", "house", "field", "view", "vale", "dale", "brook", "gate", "hill", "side", "land", "mount", "ford", "stone", "wick", "well", "water", "crest", "ridge", "park", "bridge", "shire", "haven", "leigh", "lands"];
  function split(word) {
    var w = word.toLowerCase();
    for (var i = 0; i < PARTS.length; i++) {
      var p = PARTS[i];
      if (w.length > p.length + 2 && w.slice(-p.length) === p) return [word.slice(0, w.length - p.length), word.slice(w.length - p.length)];
    }
    return [word];
  }
  /** "Winwood College" → "WWC", "St Georges High School" → "SGHS", "Peter house College" → "PHC". */
  M.schoolAbbr = function (name) {
    var words = String(name || "School").replace(/[^A-Za-z&\s'-]/g, " ").split(/[\s-]+/).filter(function (w) { return w && !SMALL[w.toLowerCase()]; });
    var letters = [];
    words.forEach(function (w) { split(w.replace(/'/g, "")).forEach(function (p) { if (p) letters.push(p[0]); }); });
    var ab = letters.join("").toUpperCase();
    // at least three letters: take more of the last word ("Home Study" → "HST")
    var last = (words[words.length - 1] || "SCHOOL").toUpperCase().replace(/[^A-Z]/g, "");
    for (var k = 1; ab.length < 3 && k < last.length; k++) ab += last[k];
    while (ab.length < 3) ab += "X";
    return ab.slice(0, 6);
  };
  var ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function chunk() {
    var out = "", b = new Uint8Array(3);
    (window.crypto || window.msCrypto).getRandomValues(b);
    for (var i = 0; i < 3; i++) out += ABC[b[i] % ABC.length];
    return out;
  }
  M.makeStaffCode = function (abbr) { return abbr + "-" + chunk() + "-" + chunk(); };
  var norm = function (c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); };

  /* ------------------------------------------------------------ offline codes (school hub) */
  M.staffCodes = function () { return S().get("settings", "staffcodes") || null; };
  M.ensureStaffCodes = function () {
    var c = M.staffCodes();
    if (c && c.admin && c.teacher) return c;
    var ab = (c && c.prefix) || M.schoolAbbr(A.Theme.get().name);
    return S().put("settings", { id: "staffcodes", prefix: ab, admin: M.makeStaffCode(ab), teacher: M.makeStaffCode(ab), madeAt: Date.now() });
  };
  /** "admin", "teacher" or null. */
  M.codeRole = function (code) {
    var c = M.staffCodes(), n = norm(code);
    if (!c || !n) return null;
    if (norm(c.admin) === n) return "admin";
    if (norm(c.teacher) === n) return "teacher";
    return null;
  };

  /* ------------------------------------------------------------ who used this device last */
  var KEY = "sca-last-user";
  A.LastUser = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    set: function (u, extra) {
      if (!u) return;
      try { localStorage.setItem(KEY, JSON.stringify(Object.assign({ id: u.id, name: u.name, role: u.role, isAdmin: !!u.isAdmin, studentNo: u.studentNo || null, at: Date.now() }, extra || {}))); } catch (e) { /* private mode */ }
    },
    forget: function () { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } },
    /** Must `u` confirm the staff code here? A teacher or admin on a device a (different) student used last. */
    needsCode: function (u) {
      var last = A.LastUser.get();
      return !!(u && u.role !== "student" && last && last.role === "student" && last.id !== u.id);
    },
  };
  /** Tell every admin (offline: alert records; online the server does it in staff_code_ok). */
  M.alertAdmins = function (rec) {
    var now = Date.now();
    S().filter("users", function (x) { return x.role === "teacher" && x.isAdmin && x.status !== "pending"; }).forEach(function (adm) {
      S().put("alerts", Object.assign({ id: "al_" + rec.kind + "_" + adm.id + "_" + now.toString(36), teacherId: adm.id, createdAt: now }, rec));
    });
  };
  A.act["login-forget-last"] = function () { A.LastUser.forget(); if (A.redrawLogin) A.redrawLogin(); };

  /* ------------------------------------------------------------ offline: registering as staff */
  M.pendingStaff = function () { return S().filter("users", function (u) { return u.role === "teacher" && u.status === "pending"; }).sort(function (a, b) { return (a.registeredAt || 0) - (b.registeredAt || 0); }); };
  var typed = {}; // what was typed, kept when the form comes back with a message
  A.staffRegisterForm = function (msg) {
    return '<form data-submit="staff-register" class="mt">' +
      '<label class="field"><span>School staff code</span><input class="input" name="code" value="' + esc(typed.code || "") + '" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="e.g. ' + esc(M.schoolAbbr(A.Theme.get().name)) + '-4K7-9QP"><span class="hint">Your school gives teachers one code and admins another. Ask an admin for yours.</span></label>' +
      '<label class="field"><span>Full name</span><input class="input" name="name" value="' + esc(typed.name || "") + '" autocomplete="name" placeholder="e.g. Mrs Tendai Moyo"></label>' +
      '<label class="field"><span>Subjects you teach</span><input class="input" name="subjects" value="' + esc(typed.subjects || "") + '" placeholder="e.g. Mathematics, Physics"></label>' +
      '<label class="field"><span>Choose a 4-digit PIN</span><input class="input" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>' +
      '<label class="field"><span>Type it again</span><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>' +
      (msg || "") + '<button class="btn btn-primary btn-lg btn-block mt" type="submit">' + I("key") + "Register</button></form>";
  };
  A.act["staff-register"] = function (form) {
    var f = UI.formData(form), role = M.codeRole(f.code);
    typed = { code: f.code, name: f.name, subjects: f.subjects };
    var fail = function (m) { A.loginMessage(m); };
    if (!M.staffCodes()) return fail("This school hasn't made its staff codes yet. Ask an admin to open Settings → People → Teachers.");
    if (!role) return fail("That staff code isn't right. Check it with an admin.");
    if (f.name.trim().split(/\s+/).length < 2) return fail("Enter your full name.");
    if (!/^\d{4}$/.test(f.pin)) return fail("The PIN must be 4 digits.");
    if (f.pin !== f.pin2) return fail("The two PINs are different. Type them again.");
    var u = S().put("users", { id: A.uid("t"), role: "teacher", isAdmin: role === "admin", status: "pending", name: f.name.trim().replace(/\s+/g, " "),
      title: role === "admin" ? "Admin" : "Teacher", subjects: f.subjects.trim(), pin: f.pin, registeredAt: Date.now() });
    typed = {};
    M.alertAdmins({ kind: "staff", title: "New " + role + ": " + u.name, body: u.name + " registered as " + (role === "admin" ? "an admin" : "a teacher") + (u.subjects ? " (" + u.subjects + ")" : "") + " and is waiting for an admin to approve them in Settings → People." });
    A.loginDone("staffasked", u);
  };

  /* ------------------------------------------------------------ admins: approving staff */
  A.act["staff-decide"] = function (el) {
    var id = el.getAttribute("data-id"), yes = el.getAttribute("data-yes") === "1", u = M.user(id), me = M.me();
    if (!u || !me || !me.isAdmin) return;
    var go = function () {
      if (A.Cloud) {
        return A.Cloud.admin("staff-decide", { appId: id, approve: yes }).then(function () { return A.Sync.syncNow().catch(function () {}); })
          .then(function () { UI.toast(yes ? u.name + " can sign in now" : u.name + "'s registration was declined"); A.render(); })
          .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      }
      if (yes) S().put("users", Object.assign({}, u, { status: "approved", approvedBy: me.id, approvedAt: Date.now() }));
      else S().remove("users", id);
      UI.toast(yes ? u.name + " can sign in now" : u.name + "'s registration was declined");
      A.render();
    };
    if (yes) go(); else UI.confirm("Decline " + u.name + "'s registration?", { danger: true, ok: "Decline" }).then(function (ok) { if (ok) go(); });
  };
  /** Settings → People → Teachers (admins): the codes and anyone waiting. */
  A.staffAdminHtml = function (me) {
    if (!me || !me.isAdmin) return "";
    var pend = M.pendingStaff();
    var waiting = pend.length ? '<div class="card mb"><div class="card-head">' + I("users") + "<h3>Waiting for approval</h3><span class=\"sub\">" + pend.length + "</span></div>" + pend.map(function (u) {
      return '<div class="list-row"><div class="grow"><div class="title">' + esc(u.name) + ' <span class="badge' + (u.isAdmin ? " accent" : "") + '">' + (u.isAdmin ? "Admin" : "Teacher") + "</span></div>" +
        '<div class="meta"><span>' + esc(u.email || u.subjects || "") + "</span>" + (u.registeredAt ? '<span class="sep"></span><span>Registered ' + esc(A.relTime(u.registeredAt)) + "</span>" : "") + "</div></div>" +
        '<button class="btn btn-sm btn-primary" data-act="staff-decide" data-id="' + u.id + '" data-yes="1">' + I("check") + "Approve</button>" +
        '<button class="btn btn-sm btn-ghost" data-act="staff-decide" data-id="' + u.id + '" data-yes="0">Decline</button></div>';
    }).join("") + '<p class="tiny muted" style="padding:0 20px 14px">Only admins approve teachers and other admins.</p></div>' : "";
    return waiting + '<div class="card card-pad mb" id="staff-codes">' + codesInner(A.Cloud ? null : M.ensureStaffCodes()) + "</div>";
  };
  function codesInner(c) {
    if (!c) return "<h3>" + I("key") + " Staff sign-up codes</h3><p class=\"muted small mt-sm\">Loading…</p>";
    var row = function (role, code) {
      return '<div class="code-row"><span class="label">' + (role === "admin" ? "Admins" : "Teachers") + '</span><code class="staff-code">' + esc(code) + "</code>" +
        '<button class="btn btn-sm btn-ghost" data-act="staff-code-copy" data-code="' + esc(code) + '">' + I("copy") + "Copy</button>" +
        '<button class="btn btn-sm btn-ghost" data-act="staff-code-new" data-role="' + role + '">' + I("refresh") + "New code</button></div>";
    };
    return "<h3>" + I("key") + " Staff sign-up codes</h3><p class=\"muted small mt-sm\">Teachers and admins register themselves on the sign-in screen with these codes, then wait for an admin to approve them. Give the teacher code to teachers only and the admin code to admins only. A teacher or admin signing in on a device a student used last must enter their code too.</p>" +
      '<div class="mt">' + row("admin", c.admin) + row("teacher", c.teacher) + "</div>" +
      '<form class="row wrap mt" data-submit="staff-prefix" style="gap:8px"><label class="small" for="sp-in">School abbreviation</label><input id="sp-in" class="input sm" name="prefix" value="' + esc(c.prefix) + '" maxlength="6" style="width:110px;text-transform:uppercase" aria-label="School abbreviation"><button class="btn btn-sm" type="submit">Use it for new codes</button></form>';
  }
  A.mountStaffCodes = function () {
    if (!A.Cloud) return;
    var box = document.getElementById("staff-codes"); if (!box) return;
    A.Cloud.admin("staff-codes", { prefix: M.schoolAbbr(A.Theme.get().name) }).then(function (c) { var b = document.getElementById("staff-codes"); if (b) b.innerHTML = codesInner(c); })
      .catch(function (e) { box.innerHTML = codesInner(null).replace("Loading…", esc(e.message || String(e))); });
  };
  A.act["staff-code-copy"] = function (el) {
    var code = el.getAttribute("data-code");
    try { navigator.clipboard.writeText(code).then(function () { UI.toast("Copied " + code); }, function () { UI.toast(code); }); } catch (e) { UI.toast(code); }
  };
  A.act["staff-code-new"] = function (el) {
    var role = el.getAttribute("data-role");
    UI.confirm("Make a new " + role + " code? The old one stops working for new registrations (people who already signed up are not affected).", { ok: "New code" }).then(function (ok) {
      if (!ok) return;
      if (A.Cloud) return A.Cloud.admin("staff-codes-new", { role: role }).then(function (c) { var b = document.getElementById("staff-codes"); if (b) b.innerHTML = codesInner(c); UI.toast("New " + role + " code made"); }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      var c = M.ensureStaffCodes(), patch = {}; patch[role] = M.makeStaffCode(c.prefix);
      S().patch("settings", "staffcodes", patch); UI.toast("New " + role + " code made"); A.render();
    });
  };
  A.act["staff-prefix"] = function (form) {
    var p = String(form.prefix.value || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (p.length < 3 || p.length > 6) { UI.toast("Use 3 to 6 letters, e.g. WWC or SGHS", "bad"); return; }
    UI.confirm("Make new codes starting with " + p + "? The old codes stop working for new registrations.", { ok: "Make new codes" }).then(function (ok) {
      if (!ok) return;
      if (A.Cloud) return A.Cloud.admin("staff-codes-new", { role: "both", prefix: p }).then(function (c) { var b = document.getElementById("staff-codes"); if (b) b.innerHTML = codesInner(c); UI.toast("New codes made"); }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      S().put("settings", { id: "staffcodes", prefix: p, admin: M.makeStaffCode(p), teacher: M.makeStaffCode(p), madeAt: Date.now() });
      UI.toast("New codes made"); A.render();
    });
  };
})(window.App);
