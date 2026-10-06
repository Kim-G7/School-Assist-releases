/* Home features for the school edition (no cloud): what the home edition does online, done on the
 * device and the school hub instead.
 *   - Students register themselves: name, level and password, then their exam board and subjects.
 *     They get the next student ID (school initials, year, number: GHS-26-118) and an admin approves
 *     the account in Settings → People; each subject is then approved by its teacher (Subject requests).
 *   - "Forgot your password?" asks the admin, who sets a new one in Settings → People.
 *   - AI marking of written answers goes through the school hub (server.cjs), which keeps the
 *     school's Anthropic API key; the key is saved from the hub computer itself.
 * Online (home edition) js/cloud.js does all of this with Supabase; School Assist Teacher has no
 * student sign-in, so none of it applies there. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  /* ------------------------------------------------------------------ AI marking: online or via the hub */
  function hubUrl() {
    if (A.Cloud || !A.Sync) return "";
    var c = A.Sync.config();
    return c && c.url ? String(c.url).replace(/\/+$/, "") : "";
  }
  /** The hub's address on this computer, when this computer runs the hub (only it can save the key). */
  function localHub() {
    var d = window.desktop && window.desktop.hub;
    if (!d) return Promise.resolve("");
    return d.status().then(function (h) { return h && h.running ? "http://127.0.0.1:" + h.port : ""; }).catch(function () { return ""; });
  }
  function hubCall(base, path, body) {
    return fetch(base + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "The school hub replied " + r.status); return j; }); });
  }
  A.AI = {
    /** Where AI marking would run: "cloud", "hub" or "" (nowhere). */
    where: function () { return A.Cloud ? "cloud" : hubUrl() ? "hub" : ""; },
    status: function () {
      if (A.Cloud) return A.Cloud.admin("ai-status");
      return localHub().then(function (local) {
        var base = local || hubUrl();
        if (!base) throw new Error("Connect to the school hub first (Settings → Offline & sync).");
        return hubCall(base, "/api/ai/status").then(function (st) { st.local = !!local; return st; });
      });
    },
    saveKey: function (key) {
      if (A.Cloud) return A.Cloud.admin("ai-key", { key: key });
      // the hub only accepts the key from the computer it runs on, and says so otherwise
      return localHub().then(function (local) {
        var to = local || hubUrl();
        if (!to) throw new Error("Connect to the school hub first (Settings → Offline & sync).");
        return hubCall(to, "/api/ai/key", { key: key });
      });
    },
    mark: function (payload) {
      if (A.Cloud) return A.Cloud.markAI(payload);
      var base = hubUrl();
      if (!base) return Promise.reject(new Error("AI marking needs the school hub. Connect to it in Settings → Offline & sync."));
      var me = M.me();
      return hubCall(base, "/api/ai/mark", Object.assign({}, payload, { userId: me ? me.id : "" }));
    },
  };

  if (A.Cloud || A.edition === "teacher") { A.School = null; return; }

  /* ------------------------------------------------------------------ students registering themselves */
  var School = (A.School = {});
  /** The next student ID: the letters the school's IDs already use (else its initials), the year and a number (GHS-26-118). */
  School.nextId = function () {
    var seen = {}, letters = M.schoolAbbr(A.Theme.get().name), most = 0;
    S().filter("users", function (u) { return u.role === "student"; }).forEach(function (u) {
      var m = /^([A-Z]{2,6})-\d{2}-\d{2,4}$/.exec(String(u.studentNo || "")); if (m) seen[m[1]] = (seen[m[1]] || 0) + 1;
    });
    Object.keys(seen).forEach(function (k) { if (seen[k] > most) { most = seen[k]; letters = k; } });
    var prefix = letters + "-" + String(new Date().getFullYear()).slice(2) + "-", top = 0;
    S().filter("users", function (u) { return u.role === "student" && String(u.studentNo || "").indexOf(prefix) === 0; }).forEach(function (u) {
      var n = parseInt(String(u.studentNo).slice(prefix.length), 10); if (n > top) top = n;
    });
    return prefix + String(top + 1).padStart(3, "0");
  };
  School.register = function (name, level, pw, subjectIds) {
    var now = Date.now(), studentNo = School.nextId();
    var u = S().put("users", { id: A.uid("s"), role: "student", name: name, level: level, stream: null, studentNo: studentNo, status: "pending", registeredAt: now, selfRegistered: true });
    M.setPassword(u.id, pw, u.id);
    return M.requestSubjects(u.id, subjectIds).then(function () {
      M.alertAdmins({ kind: "register", title: "New student: " + name, body: name + " (" + studentNo + ", " + level + ") registered and is waiting for an admin to approve the account in Settings → People." });
      if (A.Sync) A.Sync.maybe();
      return { studentNo: studentNo, name: name };
    });
  };
  School.pending = function () { return S().filter("users", function (u) { return u.role === "student" && u.status === "pending"; }).sort(function (a, b) { return (a.registeredAt || 0) - (b.registeredAt || 0); }); };
  A.act["school-approve"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), yes = el.getAttribute("data-yes") === "1";
    if (!u) return;
    S().patch("users", u.id, { status: yes ? "approved" : "declined", decidedAt: Date.now(), decidedBy: M.me().id });
    UI.toast(yes ? u.name + " can sign in now. Their subjects wait for each teacher's approval." : u.name + " was declined");
    A.render();
  };

  /* ------------------------------------------------------------------ forgot the password: ask the admin */
  School.askAdmin = function (login, name, note) {
    var u = M.studentById ? M.studentById(login) : null;
    S().put("pwrequests", { id: A.uid("pwr"), login: login, studentNo: u ? u.studentNo : login, appId: u ? u.id : null, name: u ? u.name : name, said: name, note: String(note || "").slice(0, 300), askedAt: Date.now() });
    M.alertAdmins({ kind: "password", title: (u ? u.name : name || login) + " forgot their password", body: "Give them a new password in Settings → People. Check it really is them first." });
    if (A.Sync) A.Sync.maybe();
    return Promise.resolve();
  };
  A.pwRequestList = function () {
    return S().filter("pwrequests", function (r) { return !r.doneAt; }).sort(function (a, b) { return b.askedAt - a.askedAt; });
  };
  function newPassword() {
    var words = ["river", "maple", "sunny", "tiger", "cloud", "green", "lucky", "stone", "happy", "eagle"], r = function (n) { return Math.floor(Math.random() * n); };
    return words[r(words.length)] + "-" + words[r(words.length)] + "-" + (10 + r(90));
  }
  A.act["school-pw-reset"] = function (el) {
    var r = S().get("pwrequests", el.getAttribute("data-id")), u = r && M.user(r.appId);
    if (!u) { UI.toast("There's no student with that ID. Dismiss the request.", "bad"); return; }
    UI.confirm("Give " + u.name + " a new password? Their old one stops working.", { ok: "New password" }).then(function (ok) {
      if (!ok) return;
      var pw = newPassword();
      M.setPassword(u.id, pw, M.me().id);
      S().patch("pwrequests", r.id, { doneAt: Date.now() });
      UI.modal({
        title: "New password for " + u.name,
        body: "<p>Give " + esc(A.firstName(u.name)) + ' these details. They can change the password later in Settings → My password.</p><dl class="kv mt"><dt>Student ID</dt><dd><b>' + esc(u.studentNo) + '</b></dd><dt>Password</dt><dd><code style="font-size:18px">' + esc(pw) + "</code></dd></dl>",
        foot: [{ label: "Done", cls: "btn-primary" }],
      });
      A.render();
    });
  };
  A.act["school-pw-done"] = function (el) { S().patch("pwrequests", el.getAttribute("data-id"), { doneAt: Date.now() }); A.render(); };

  /** Settings → People → Students: registrations waiting for approval, and forgotten passwords. */
  School.peopleHtml = function (me) {
    if (!me || !me.isAdmin) return "";
    var html = "", pend = School.pending(), asks = A.pwRequestList();
    if (pend.length) {
      html += '<div class="card mb"><div class="card-head">' + I("users") + '<h3>Registered, waiting for approval</h3><span class="sub">' + pend.length + "</span></div>" + pend.map(function (u) {
        var subs = M.enrolments(u.id).map(function (e) { var s = M.syllabus(e.syllabusId); return s ? s.subject : ""; }).filter(Boolean);
        return '<div class="list-row">' + A.avatar(u, "sm") + '<div class="grow"><div class="title">' + esc(u.name) + ' <span class="muted small">' + esc(u.studentNo) + '</span></div><div class="meta"><span>' + esc(u.level || "") + "</span>" +
          (subs.length ? '<span class="sep"></span><span>' + esc(subs.join(", ")) + "</span>" : "") + '<span class="sep"></span><span>' + esc(A.relTime(u.registeredAt)) + "</span></div></div>" +
          '<button class="btn btn-sm btn-primary" data-act="school-approve" data-id="' + u.id + '" data-yes="1">' + I("check") + 'Approve</button><button class="btn btn-sm btn-ghost" data-act="school-approve" data-id="' + u.id + '" data-yes="0">Decline</button></div>';
      }).join("") + "</div>";
    }
    if (asks.length) {
      html += '<div class="card mb"><div class="card-head">' + I("key") + '<h3>Asked for a new password</h3><span class="sub">' + asks.length + "</span></div>" + asks.map(function (r) {
        var u = M.user(r.appId);
        return '<div class="list-row"><div class="grow"><div class="title">' + esc((u && u.name) || r.name || r.login) + ' <span class="muted small">' + esc(r.studentNo || r.login) + '</span></div><div class="meta"><span>' + esc(A.relTime(r.askedAt)) + "</span>" +
          (!u ? '<span class="sep"></span><span class="warn-text">No student has this ID</span>' : r.said && String(u.name).toLowerCase().indexOf(String(r.said).toLowerCase()) < 0 ? '<span class="sep"></span><span>Says they are ' + esc(r.said) + "</span>" : "") +
          (r.note ? '<span class="sep"></span><span>“' + esc(r.note) + "”</span>" : "") + "</div></div>" +
          (u ? '<button class="btn btn-sm btn-primary" data-act="school-pw-reset" data-id="' + r.id + '">' + I("refresh") + "Give a new password</button>" : "") +
          '<button class="btn btn-sm btn-ghost" data-act="school-pw-done" data-id="' + r.id + '" data-tip="Dismiss">' + I("x") + "</button></div>";
      }).join("") + '<p class="tiny muted" style="padding:0 20px 14px">Check it really is them before you pass on a new password.</p></div>';
    }
    return html;
  };
})(window.App);
