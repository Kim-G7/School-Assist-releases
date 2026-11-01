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
  /** Has this device had the school hub's records since the person signed in here? Until then it may not have the
      school's codes, and must not make new ones over them. */
  var hubSynced = function () {
    var m = (A.Store.state && A.Store.state.meta) || {}, me = M.me();
    return !!(m.lastSyncAt && me && m.syncUser === me.id);
  };
  var codesWait = null, codesPulled = false;
  function codesAfterSync() {
    if (codesWait) return;
    // everything again from the hub: a device that joined before anyone signed in on it wasn't sent the codes, and
    // later syncs only bring what changed
    A.Store.state.meta.serverSince = 0;
    codesWait = A.Sync.syncNow().then(function () { codesWait = null; codesPulled = true; var b = document.getElementById("staff-codes"); if (b) b.innerHTML = codesInner(M.ensureStaffCodes()); },
      function () { codesWait = null; var b = document.getElementById("staff-codes"); if (b) b.innerHTML = codesInner(null).replace("Loading…", "The codes show when this device reaches the school hub."); });
  }
  /** The school's codes, made the first time an admin needs them. They start with the school's abbreviation (ECS),
      the one on its licence and student numbers, unless an admin chose another (prefixSet). */
  M.ensureStaffCodes = function () {
    var c = M.staffCodes(), ab = M.idAbbr();
    if (c && c.admin && c.teacher) {
      // codes made from the school's full name before 1.6.2 (ECGS-…): the same codes, with the school's abbreviation
      // (the old ones still work: M.codeRole goes by the random part)
      if (!c.prefixSet && /^[A-Z]{2,6}$/.test(ab) && c.prefix !== ab) {
        var re = function (code) { return ab + "-" + String(code).split("-").slice(-2).join("-"); };
        c = S().put("settings", Object.assign({}, c, { prefix: ab, admin: re(c.admin), teacher: re(c.teacher), was: c.prefix }));
      }
      return c;
    }
    // a device on the school hub without the codes: it gets all the hub's records first rather than making new codes over
    // the school's (how ECS's codes became ECGS-… on 23 Oct); only a hub that has none gets new ones
    if (A.Sync && A.Sync.hubMode() && (!codesPulled || !hubSynced())) { codesAfterSync(); return null; }
    var p = (c && c.prefixSet && c.prefix) || ab;
    return S().put("settings", { id: "staffcodes", prefix: p, prefixSet: !!(c && c.prefixSet) || undefined, admin: M.makeStaffCode(p), teacher: M.makeStaffCode(p), madeAt: A.now() });
  };
  /** "admin", "teacher" or null. The random part decides: ECGS-4K7-9QP and ECS-4K7-9QP are the same code. */
  var part = function (code) { var n = norm(code); return n.length >= 8 && /^[A-Z]{2,6}$/.test(n.slice(0, -6)) ? n.slice(-6) : n; };
  M.codeRole = function (code) {
    var c = M.staffCodes(), n = part(code);
    if (!c || !n) return null;
    if (c.admin && part(c.admin) === n) return "admin";
    if (c.teacher && part(c.teacher) === n) return "teacher";
    return null;
  };

  /* ------------------------------------------------------------ who used this device last */
  var KEY = "sca-last-user";
  A.LastUser = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    set: function (u, extra) {
      if (!u) return;
      try { localStorage.setItem(KEY, JSON.stringify(Object.assign({ id: u.id, name: u.name, role: u.role, isAdmin: !!u.isAdmin, studentNo: u.studentNo || null, at: A.now() }, extra || {}))); } catch (e) { /* private mode */ }
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
    var now = A.now();
    S().filter("users", function (x) { return x.role === "teacher" && x.isAdmin && x.status !== "pending"; }).forEach(function (adm) {
      S().put("alerts", Object.assign({ id: "al_" + rec.kind + "_" + adm.id + "_" + now.toString(36), teacherId: adm.id, createdAt: now }, rec));
    });
  };
  /** Someone an alert was about has been dealt with (approved, declined, given a new password): it counts as read
      for every admin, so the bell doesn't keep showing done work. */
  M.alertsDone = function (aboutId) {
    if (!aboutId) return;
    var now = A.now();
    S().filter("alerts", function (a) { return a.aboutId === aboutId && !a.readAt; }).forEach(function (a) { S().put("alerts", Object.assign({}, a, { readAt: now })); });
    if (A.Alerts) A.Alerts.refreshBell();
  };
  A.act["login-forget-last"] = function () { A.LastUser.forget(); if (A.redrawLogin) A.redrawLogin(); };

  /* ------------------------------------------------------------ staff names: "Mrs Moyo" (1.6.2)
     Staff give their gender (with it Mr, Mrs, Miss or Ms) and last name, and the app calls them by those: user.hon,
     lastName, firstName (optional) and sex; user.name is "Mrs Moyo", or "Mrs T. Moyo" when the staff has two. */
  M.HONS = [["Mr", "Male (Mr)", "M"], ["Mrs", "Female (Mrs)", "F"], ["Miss", "Female (Miss)", "F"], ["Ms", "Female (Ms)", "F"]];
  var tidy = function (s) {
    s = String(s || "").trim().replace(/\s+/g, " ").slice(0, 40);
    // "moyo" or "MOYO" → "Moyo"; a name typed with its own capitals (McDonald) stays as it is
    return s === s.toLowerCase() || s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : s;
  };
  M.staffName = function (hon, last, first, id) {
    var base = hon + " " + tidy(last), f = tidy(first);
    var twin = S().filter("users", function (u) { return u.role === "teacher" && u.id !== id && !u.leftAt && String(u.name).toLowerCase() === base.toLowerCase(); }).length;
    return twin && f ? hon + " " + f.charAt(0) + ". " + tidy(last) : base;
  };
  /** A first guess from a name typed before 1.6.2 ("Mrs L Madzivanyika" → Mrs, Madzivanyika, L), for the form to show. */
  M.nameGuess = function (u) {
    if (u.lastName) return { hon: u.hon || "", lastName: u.lastName, firstName: u.firstName || "" };
    var m = /^(mr|mrs|ms|miss)\.?\s+/i.exec(u.name || ""), words = String(u.name || "").replace(m ? m[0] : "", "").trim().split(/\s+/).filter(Boolean);
    var hon = m ? M.HONS.filter(function (h) { return h[0].toLowerCase() === m[1].toLowerCase(); })[0][0] : "";
    return { hon: hon, lastName: words.length > 1 || m ? words[words.length - 1] || "" : "", firstName: words.length > 1 ? words.slice(0, -1).join(" ") : "" };
  };
  /** The gender, last name and first name fields (one form-grid's worth). */
  M.nameFields = function (v, you) {
    v = v || {};
    return '<label class="field"><span>Gender</span><select class="select" name="hon"><option value="">Choose…</option>' + M.HONS.map(function (h) {
        return '<option value="' + h[0] + '"' + (v.hon === h[0] ? " selected" : "") + ">" + h[1] + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Last name</span><input class="input" name="lastName" value="' + esc(v.lastName || "") + '" autocomplete="family-name" placeholder="e.g. Moyo"></label>' +
      '<label class="field full"><span>First name <span class="muted">(optional)</span></span><input class="input" name="firstName" value="' + esc(v.firstName || "") + '" autocomplete="given-name" placeholder="e.g. Tendai">' +
      '<span class="hint">School Assist calls ' + (you ? "you" : "them") + " by title and last name, e.g. Mrs Moyo.</span></label>";
  };
  /** The fields read back: { hon, lastName, firstName, sex } or { error }. */
  M.nameRead = function (form, you) {
    var hon = String((form.querySelector("[name=hon]") || {}).value || ""), h = M.HONS.filter(function (x) { return x[0] === hon; })[0];
    var last = tidy((form.querySelector("[name=lastName]") || {}).value), first = tidy((form.querySelector("[name=firstName]") || {}).value);
    if (!h) return { error: you ? "Choose your gender: Mr, Mrs, Miss or Ms." : "Choose their gender: Mr, Mrs, Miss or Ms." };
    if (last.replace(/[^A-Za-z]/g, "").length < 2) return { error: you ? "Enter your last name." : "Enter their last name." };
    return { hon: h[0], lastName: last, firstName: first, sex: h[2] };
  };
  /** The record's name fields from M.nameRead. */
  M.nameRec = function (n, id) { return { hon: n.hon, lastName: n.lastName, firstName: n.firstName || null, sex: n.sex, name: M.staffName(n.hon, n.lastName, n.firstName, id) }; };
  /** Staff who registered before 1.6.2 are asked once (on their home page) for their gender and last name. */
  var laterKey = function (me) { return "sca-name-later-" + me.id; };
  A.nameNudge = function (me) {
    if (!me || me.role !== "teacher" || me.lastName || (A.SchoolId && A.SchoolId.isDemo())) return "";
    try { if (localStorage.getItem(laterKey(me))) return ""; } catch (e) { /* private mode: ask */ }
    return '<div class="callout mb">' + I("user") + '<div class="grow"><b>How should School Assist call you?</b> Add your gender and last name, and it shows you as Mr or Mrs and your last name, e.g. Mrs Moyo.</div>' +
      '<div class="row"><button class="btn btn-sm btn-ghost" data-act="my-name-later">Later</button><button class="btn btn-sm btn-primary" data-act="my-name">' + I("edit") + "Add them</button></div></div>";
  };
  A.act["my-name-later"] = function () { try { localStorage.setItem(laterKey(M.me()), "1"); } catch (e) { /* private mode */ } A.render(); };
  A.act["my-name"] = function () {
    var me = M.me(); if (!me) return;
    UI.modal({
      title: "My name", body: '<form id="my-name" class="form-grid">' + M.nameFields(M.nameGuess(me), true) + "</form>",
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var n = M.nameRead(m.querySelector("#my-name"), true);
        if (n.error) { UI.toast(n.error, "bad"); return false; }
        var rec = M.nameRec(n, me.id);
        S().patch("users", me.id, rec);
        if (A.LastUser && A.LastUser.get() && A.LastUser.get().id === me.id) A.LastUser.set(Object.assign({}, me, rec), {});
        UI.toast("You're " + rec.name + " now"); A.render();
      } }],
    });
  };

  /* ------------------------------------------------------------ offline: registering as staff */
  M.pendingStaff = function () { return S().filter("users", function (u) { return u.role === "teacher" && u.status === "pending"; }).sort(function (a, b) { return (a.registeredAt || 0) - (b.registeredAt || 0); }); };
  var typed = {}; // what was typed, kept when the form comes back with a message
  A.staffRegisterForm = function (msg) {
    return '<form data-submit="staff-register" class="mt">' +
      '<label class="field"><span>School staff code</span><input class="input" name="code" value="' + esc(typed.code || "") + '" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="e.g. ' + esc(M.idAbbr()) + '-4K7-9QP"><span class="hint">Your school gives teachers one code and admins another. Ask an admin for yours.</span></label>' +
      '<div class="form-grid">' + M.nameFields(typed.n, true) + "</div>" +
      // School Assist Teacher: the subjects ticked are the ones they record end-of-term marks for, in the classes ticked
      (A.Primary ? A.Primary.areaChecks(typed.areas).replace("Subjects they teach", "Subjects you teach").replace("They record the end-of-term marks of these, in every class. The head records any.", "You record their marks in the classes you teach.") +
          A.Primary.newAreaField(typed.areasNew) + A.Primary.classChecks(typed.classIds, "Classes you teach").replace("Their own class and the classes of their lessons on the timetable count too.", "Your own class and the classes of your lessons on the timetable count too.") + A.Primary.homeClassField(typed.homeAsk)
        : '<label class="field"><span>Subjects you teach</span><input class="input" name="subjects" value="' + esc(typed.subjects || "") + '" placeholder="e.g. Mathematics, Physics"></label>') +
      '<label class="field"><span>Your role</span>' + A.UI.selectOther("title", A.ROLES, typed.title || "Teacher", "Your role") + "</label>" +
      (A.staffPassword() ? '<label class="field"><span>Choose a password</span><input class="input" name="pin" type="password" autocomplete="new-password" placeholder="8 or more characters, letters and a number"></label>' +
        '<label class="field"><span>Type it again</span><input class="input" name="pin2" type="password" autocomplete="new-password"></label>'
        : '<label class="field"><span>Choose a 4-digit PIN</span><input class="input" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>' +
        '<label class="field"><span>Type it again</span><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>') +
      (msg || "") + '<button class="btn btn-primary btn-lg btn-block mt" type="submit">' + I("key") + "Register</button></form>";
  };
  A.act["staff-register"] = function (form) {
    var f = UI.formData(form);
    if (A.Primary) { f.areas = A.Primary.areasPicked(form); f.areasNew = A.Primary.newAreasTyped(form, f.areas); f.subjects = f.areas.join(", "); f.classIds = A.Primary.classesPicked(form); f.homeAsk = (form.querySelector("[name=homeAsk]") || {}).value || null; }
    f.n = M.nameRead(form, true);
    typed = { code: f.code, n: { hon: f.hon, lastName: f.lastName, firstName: f.firstName }, subjects: f.subjects, areas: f.areas, areasNew: f.areasNew, classIds: f.classIds, homeAsk: f.homeAsk, title: f.title };
    var fail = function (m) { A.loginMessage(m); };
    // a device that doesn't keep the codes (1.6: a new or student device) asks the school hub
    if (!M.staffCodes() && A.Sync && A.Sync.hubMode()) return A.Sync.checkStaffCode(f.code).then(function (role) { register(f, role, fail); }, function (e) { fail(e.message); });
    if (!M.staffCodes()) return fail("This school hasn't made its staff codes yet. Ask an admin to open Settings → People → Teachers.");
    register(f, M.codeRole(f.code), fail);
  };
  function register(f, role, fail) {
    if (!role) return fail("That staff code isn't right. Check it with an admin.");
    if (f.n.error) return fail(f.n.error);
    if (A.Primary && role !== "admin" && !(f.areas || []).length && !(f.areasNew || []).length) return fail("Tick the subjects you teach (or type one that isn't listed): you record their marks.");
    var pw = A.staffPassword();
    if (pw && A.staffPasswordProblem(f.pin)) return fail(A.staffPasswordProblem(f.pin));
    if (!pw && !/^\d{4}$/.test(f.pin)) return fail("The PIN must be 4 digits.");
    if (f.pin !== f.pin2) return fail(pw ? "The two passwords are different. Type them again." : "The two PINs are different. Type them again.");
    var id = A.uid("t");
    var u = S().put("users", Object.assign({ id: id, role: "teacher", isAdmin: role === "admin", status: "pending", pw: pw || undefined,
      title: String(f.title || "").trim().slice(0, 60) || (role === "admin" ? "Admin" : "Teacher"), subjects: String(f.subjects || "").trim(), registeredAt: A.now() }, M.nameRec(f.n, id),
      A.Primary ? { areas: f.areas || [], classIds: f.classIds || [], areasNew: (f.areasNew || []).length ? f.areasNew : null, areasNewAt: (f.areasNew || []).length ? A.now() : null, homeAsk: f.homeAsk || null, homeAskAt: f.homeAsk ? A.now() : null } : {}));
    M.setPin(u.id, f.pin, u.id);
    typed = {};
    M.alertAdmins({ kind: "staff", aboutId: u.id, title: "New " + role + ": " + u.name, body: u.name + " registered as " + (role === "admin" ? "an admin" : "a teacher") + (u.subjects ? " (" + u.subjects + ")" : "") + " and is waiting for an admin to approve them in Settings → People." +
      ((u.areasNew || []).length ? " They also teach " + u.areasNew.join(", ") + ", which isn't on the school's list: add it on the Today page." : "") });
    A.loginDone("staffasked", u);
  }

  /* ------------------------------------------------------------ admins: approving staff */
  A.act["staff-decide"] = function (el) {
    var id = el.getAttribute("data-id"), yes = el.getAttribute("data-yes") === "1", u = M.user(id), me = M.me();
    if (!u || !me || !me.isAdmin) return;
    var full = yes && A.Licence && A.Licence.teacherLimit && A.Licence.teacherLimit();
    if (full) { UI.toast(full, "bad"); return; }
    var go = function () {
      if (A.Cloud) {
        return A.Cloud.admin("staff-decide", { appId: id, approve: yes }).then(function () { return A.Sync.syncNow().catch(function () {}); })
          .then(function () { UI.toast(yes ? u.name + " can sign in now" : u.name + "'s registration was declined"); A.render(); })
          .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      }
      if (yes) {
        S().put("users", Object.assign({}, u, { status: "approved", approvedBy: me.id, approvedAt: A.now() }, u.homeAsk ? { homeAsk: null, homeAskAt: null } : {}));
        // the class they chose when registering is theirs now (School Assist Teacher: only admins make classes)
        var hc = u.homeAsk && A.Primary && S().get("classes", u.homeAsk);
        if (hc && !hc._deleted) A.Primary.takeClass(u, hc, true);
        // approved staff get their number (KHS-TC4, KHS-AD2): only then, so declined registrations leave no gaps
        if (!u.staffNo) M.giveStaffNo(u).then(function () { A.render(); });
      } else S().remove("users", id);
      M.alertsDone(id);
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
        '<div class="meta"><span>' + esc(u.email || u.subjects || "") + "</span>" + ((u.areasNew || []).length ? '<span class="sep"></span><span>Not on the list: ' + esc(u.areasNew.join(", ")) + "</span>" : "") +
          (u.homeAsk && S().get("classes", u.homeAsk) ? '<span class="sep"></span><span>Class teacher of ' + esc(S().get("classes", u.homeAsk).name) + "</span>" : "") + (u.registeredAt ? '<span class="sep"></span><span>Registered ' + esc(A.relTime(u.registeredAt)) + "</span>" : "") + "</div></div>" +
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
    return "<h3>" + I("key") + " Staff sign-up codes</h3><p class=\"muted small mt-sm\">For registering on the sign-in screen. Give the admin code to admins only.</p>" +
      '<div class="mt">' + row("admin", c.admin) + row("teacher", c.teacher) + "</div>" +
      '<form class="row wrap mt" data-submit="staff-prefix" style="gap:8px"><label class="small" for="sp-in">School abbreviation</label><input id="sp-in" class="input sm" name="prefix" value="' + esc(c.prefix) + '" maxlength="6" style="width:110px;text-transform:uppercase" aria-label="School abbreviation"><button class="btn btn-sm" type="submit">Use it for new codes</button></form>';
  }
  A.mountStaffCodes = function () {
    if (!A.Cloud) return;
    var box = document.getElementById("staff-codes"); if (!box) return;
    A.Cloud.admin("staff-codes", { prefix: M.idAbbr() }).then(function (c) { var b = document.getElementById("staff-codes"); if (b) b.innerHTML = codesInner(c); })
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
      var c = M.ensureStaffCodes(), patch = {};
      if (!c) { UI.toast("Wait a moment: this device is getting the school's codes from the hub", "bad"); return; }
      patch[role] = M.makeStaffCode(c.prefix);
      S().patch("settings", "staffcodes", patch); UI.toast("New " + role + " code made"); A.render();
    });
  };
  A.act["staff-prefix"] = function (form) {
    var p = String(form.prefix.value || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (p.length < 3 || p.length > 6) { UI.toast("Use 3 to 6 letters, e.g. WWC or SGHS", "bad"); return; }
    UI.confirm("Make new codes starting with " + p + "? The old codes stop working for new registrations.", { ok: "Make new codes" }).then(function (ok) {
      if (!ok) return;
      if (A.Cloud) return A.Cloud.admin("staff-codes-new", { role: "both", prefix: p }).then(function (c) { var b = document.getElementById("staff-codes"); if (b) b.innerHTML = codesInner(c); UI.toast("New codes made"); }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      S().put("settings", { id: "staffcodes", prefix: p, prefixSet: p !== M.idAbbr() || undefined, admin: M.makeStaffCode(p), teacher: M.makeStaffCode(p), madeAt: A.now() });
      UI.toast("New codes made"); A.render();
    });
  };
})(window.App);
