/* Online accounts for the home edition (Supabase): sign-in, registration with incremental
   student IDs (HOME-001, HOME-002, ...), admin approval, sync and library files.
   On only in the home edition when school.config.js → home.cloud has a url and a key.
   The app still works offline; this only adds sign-in and the online copy of the data.
   Server side: cloud/migrations (tables, sync rules) and cloud/functions (register, setup-admin, admin). */
(function (A) {
  "use strict";
  var CFG = window.SCHOOL_CONFIG || {};
  var C = A.edition === "home" && CFG.home && CFG.home.cloud;
  if (!C || !C.url || !C.key) { A.Cloud = null; return; }

  var SKEY = "sca-cloud-session";
  var EMAIL_DOMAIN = "students.home-study.invalid"; // students sign in with an ID; this address is never emailed
  var session = read();
  var refreshing = null;

  function read() { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function keep(s) {
    session = s;
    try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) { /* private mode */ }
  }
  /** `as` is the session the request belongs to, taken when it started (a sign-out may clear it meanwhile). */
  function headers(as, extra) {
    var h = { apikey: C.key };
    if (as) h.Authorization = "Bearer " + as.access_token;
    return Object.assign(h, extra || {});
  }
  function asJson(r) {
    return r.text().then(function (t) {
      var j = null;
      try { j = t ? JSON.parse(t) : null; } catch (e) { j = { message: t }; }
      if (!r.ok) {
        var err = new Error(friendly(j, r.status));
        err.status = r.status; err.code = j && j.code;
        throw err;
      }
      return j;
    });
  }
  function friendly(j, status) {
    var m = (j && (j.error_description || j.msg || j.message || j.error)) || "";
    if (/invalid login credentials/i.test(m)) return "That ID (or email) and password don't match.";
    if (status === 0 || /failed to fetch/i.test(m)) return "Can't reach School Assist online. Check the internet connection.";
    return m || "School Assist online replied " + status + ".";
  }
  function net(p) {
    return p.catch(function (e) {
      if (e instanceof TypeError) { var x = new Error("Can't reach School Assist online. Check the internet connection."); x.offline = true; throw x; }
      throw e;
    });
  }
  function token(grant, body) {
    return net(fetch(C.url + "/auth/v1/token?grant_type=" + grant, { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify(body) }))
      .then(asJson).then(function (t) {
        keep({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in || 3600) * 1000, profile: session && session.profile || null });
        return session;
      });
  }
  /** A valid access token, refreshed shortly before it runs out. */
  function fresh() {
    if (!session) return Promise.reject(new Error("Sign in online first."));
    if (Date.now() < session.expires_at - 60000) return Promise.resolve(session);
    if (!refreshing) {
      refreshing = token("refresh_token", { refresh_token: session.refresh_token })
        .catch(function (e) { if (e.status === 400 || e.status === 401) keep(null); throw e; })
        .then(function (s) { refreshing = null; return s; }, function (e) { refreshing = null; throw e; });
    }
    return refreshing;
  }
  function call(path, body, method) {
    return fresh().then(function (as) {
      return net(fetch(C.url + path, { method: method || "POST", headers: headers(as, { "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) }));
    }).then(asJson);
  }

  var Cloud = (A.Cloud = {
    url: C.url,
    session: function () { return session; },
    profile: function () { return session && session.profile; },
    emailFor: function (studentNo) { return String(studentNo).trim().toLowerCase() + "@" + EMAIL_DOMAIN; },

    /** Students sign in with their ID (HOME-002), the admin with an email address. */
    signIn: function (login, password) {
      var email = /@/.test(login) ? login.trim().toLowerCase() : Cloud.emailFor(login);
      return token("password", { email: email, password: password }).then(Cloud.refreshProfile);
    },
    refreshProfile: function () {
      return call("/rest/v1/rpc/my_profile", {}).then(function (p) {
        if (!p) { keep(null); throw new Error("This sign-in has no School Assist account."); }
        session.profile = p; keep(session); return p;
      });
    },
    signOut: function () {
      var s = session;
      keep(null);
      if (s) fetch(C.url + "/auth/v1/logout", { method: "POST", headers: { apikey: C.key, Authorization: "Bearer " + s.access_token } }).catch(function () {});
    },
    register: function (name, level, password, subjects) {
      return net(fetch(C.url + "/functions/v1/register", { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify({ name: name, level: level, password: password, subjects: subjects || [] }) })).then(asJson);
    },
    /** A teacher or admin registers with the school's staff code (cloud/functions/register-staff). */
    registerStaff: function (f) {
      return net(fetch(C.url + "/functions/v1/register-staff", { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify(f) })).then(asJson);
    },
    /** The subjects on offer, for registering (no sign-in needed). */
    subjects: function () {
      return net(fetch(C.url + "/rest/v1/rpc/public_subjects", { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: "{}" })).then(asJson);
    },
    setupAdmin: function (f) {
      return net(fetch(C.url + "/functions/v1/setup-admin", { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify(f) })).then(asJson);
    },
    rpc: function (fn, args) { return call("/rest/v1/rpc/" + fn, args || {}); },
    admin: function (action, body) { return call("/functions/v1/admin", Object.assign({ action: action }, body || {})); },
    /** AI marking of written answers (cloud/functions/mark). */
    markAI: function (payload) { return call("/functions/v1/mark", payload); },
    changePassword: function (pw) { return call("/auth/v1/user", { password: pw }, "PUT"); },
    /** Forgot the password (no sign-in): { action: "reset", login, code, password } or { action: "ask", login, name, note }. */
    recover: function (body) {
      return net(fetch(C.url + "/functions/v1/recover", { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify(body) })).then(asJson);
    },
    /** A new recovery code for the signed-in person (shown once; only its hash is kept). */
    makeRecoveryCode: function () { return Cloud.rpc("make_recovery_code").then(function (c) { Cloud.recoveryAt = Date.now(); return c; }); },
    /** When this person's recovery code was made: a time, 0 for none, undefined until known. */
    recoveryAt: undefined,
    checkRecovery: function () {
      if (Cloud.recoveryAt !== undefined || Cloud._checking || !session || !navigator.onLine) return;
      Cloud._checking = true;
      Cloud.rpc("recovery_status").then(function (t) {
        Cloud.recoveryAt = t ? new Date(t).getTime() : 0;
        if (!t && A.render) A.render();
      }).catch(function () { /* try again another time */ }).then(function () { Cloud._checking = false; });
    },

    /** Library files: PDFs, videos and pictures, up to 50 MB each on the free plan. */
    upload: function (f) {
      return fresh().then(function (as) {
        return fetch(C.url + "/storage/v1/object/library/" + encodeURIComponent(f.id), {
          method: "POST", body: f.blob, headers: headers(as, { "Content-Type": f.type || "application/octet-stream" }),
        });
      }).then(function (r) {
        if (r.ok) return true;
        return r.text().then(function (t) {
          if (/already exists|Duplicate/i.test(t)) return true; // uploaded before
          if (r.status === 413 || /too large|exceeded/i.test(t)) throw new Error("“" + (f.name || f.id) + "” is bigger than 50 MB, the most the free plan stores. Share a smaller copy.");
          throw new Error("Upload failed (" + r.status + ")");
        });
      });
    },
    download: function (id) {
      return fresh().then(function (as) {
        return fetch(C.url + "/storage/v1/object/authenticated/library/" + encodeURIComponent(id), { headers: headers(as) });
      }).then(function (r) { return r.ok ? r.blob() : null; });
    },
  });

  /* ------------------------------------------------ install from the website
     Chrome and Edge (Windows, Android) offer a real install prompt; iPhone and iPad
     use Share → Add to Home Screen. */
  A.act = A.act || {}; // the page's action list (js/app.js keeps these)
  var installEvent = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvent = e;
    document.documentElement.classList.add("can-install");
  });
  window.addEventListener("appinstalled", function () { installEvent = null; document.documentElement.classList.remove("can-install"); });
  A.Install = {
    installed: function () { try { return matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } },
    apple: function () { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); },
    /** The login page's install block (web only; the desktop app is already installed). */
    html: function () {
      if (window.desktop || A.Install.installed() || !/^https?:$/.test(location.protocol)) return "";
      return '<div class="install-box">' +
        '<button class="btn install-btn" data-act="install-app">' + A.icon("download") + "Install the app</button>" +
        (A.Install.apple() ? '<p class="small">On iPhone or iPad: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>'
          : '<p class="small install-hint">Install adds School Assist to this device like any app. It opens full screen and works without the internet.</p>') +
        "</div>";
    },
  };
  A.act["install-app"] = function () {
    if (!installEvent) {
      A.UI.toast(A.Install.apple() ? "Tap Share, then Add to Home Screen" : "Use your browser's menu: Install app (Chrome or Edge)");
      return;
    }
    installEvent.prompt();
    installEvent.userChoice.then(function (c) { if (c && c.outcome === "accepted") A.UI.toast("Installing School Assist"); installEvent = null; });
  };

  /* ------------------------------------------------------- admin: people */
  function done(msg) { A.UI.toast(msg); return A.Sync.syncNow().catch(function () {}).then(function () { A.render(); }); }
  function fail(e) { A.UI.toast(e.message || String(e), "bad"); }
  function showPassword(title, u, pw) {
    A.UI.modal({
      title: title, size: "",
      body: '<p>Give ' + A.esc(A.firstName(u.name)) + ' these details. They can change the password later in Settings → My password.</p>' +
        '<dl class="kv mt"><dt>Student ID</dt><dd><b>' + A.esc(u.studentNo) + '</b></dd><dt>Password</dt><dd><code style="font-size:18px">' + A.esc(pw) + "</code></dd></dl>" +
        '<p class="tiny muted mt">This password is shown once. Write it down now.</p>',
      foot: [{ label: "Done", cls: "btn-primary" }],
    });
  }
  A.act["cloud-approve"] = function (el) {
    var id = el.getAttribute("data-id"), yes = el.getAttribute("data-yes") === "1", u = A.M.user(id) || { name: "this student" };
    el.disabled = true;
    Cloud.rpc("approve_student", { p_app_id: id, p_approve: yes })
      .then(function () { return done(yes ? A.firstName(u.name) + " is approved. Their subjects are in Subject requests." : u.name + " was declined"); })
      .catch(function (e) { el.disabled = false; fail(e); });
  };
  /* ------------------------------------------------ recovery codes */
  /** Show a recovery code once, with a copy button. `fresh`: made just now for a new account. */
  A.showRecoveryCode = function (code, fresh, then) {
    A.UI.modal({
      title: "Your recovery code",
      body: '<p class="muted">' + (fresh ? "One more thing. " : "") + "If you ever forget your password, this code lets you choose a new one on the sign-in screen (Forgot your password?).</p>" +
        '<div class="id-big mt" style="user-select:all">' + A.esc(code) + "</div>" +
        '<div class="row mt" style="justify-content:center"><button type="button" class="btn btn-sm" id="rc-copy">' + A.icon("copy") + "Copy</button></div>" +
        '<div class="callout warn mt">' + A.icon("alert") + "<div><b>Write it down now</b> and keep it somewhere safe (not on this device only). It is shown once. You can make a new one in Settings → My password.</div></div>",
      foot: [{ label: "I've written it down", cls: "btn-primary", icon: "check" }],
      onMount: function (el) {
        el.querySelector("#rc-copy").addEventListener("click", function () {
          var b = this;
          try { navigator.clipboard.writeText(code).then(function () { b.innerHTML = A.icon("check") + "Copied"; }, function () {}); } catch (e) { /* select it instead */ }
        });
      },
      onClose: function () { if (then) then(); },
    });
  };
  A.act["make-recovery"] = function () {
    var go = function () {
      Cloud.makeRecoveryCode().then(function (code) { A.showRecoveryCode(code, false, function () { A.render(); }); })
        .catch(function (e) { A.UI.toast(e.message || String(e), "bad"); });
    };
    if (Cloud.recoveryAt) A.UI.confirm("Make a new recovery code? The old one stops working.", { ok: "Make a new code" }).then(function (ok) { if (ok) go(); });
    else go();
  };
  /** A reminder on the home page for accounts without a recovery code. */
  A.recoveryNote = function () {
    if (!Cloud.session()) return "";
    Cloud.checkRecovery();
    if (Cloud.recoveryAt !== 0) return "";
    return '<div class="callout mb">' + A.icon("key") + '<div class="grow"><b>Make a recovery code.</b> If you ever forget your password, it lets you choose a new one yourself.</div>' +
      '<button class="btn btn-sm btn-primary" data-act="make-recovery">' + A.icon("key") + "Make it now</button></div>";
  };

  /* ------------------------------------------------ "I forgot my password" requests (the admin's app only) */
  A.pwRequestList = function () {
    return A.Store.filter("pwrequests", function (r) { return !r.doneAt && !r._deleted; }).sort(function (a, b) { return b.askedAt - a.askedAt; });
  };
  A.pwRequestsHtml = function (me) {
    if (!me || !me.isAdmin) return "";
    var list = A.pwRequestList(); if (!list.length) return "";
    return '<div class="card mb pwreq"><div class="card-head">' + A.icon("key") + "<h3>Asked for a new password</h3><span class=\"sub\">" + list.length + "</span></div>" + list.map(function (r) {
      var u = A.M.user(r.appId);
      return '<div class="list-row"><div class="grow"><div class="title">' + A.esc((u && u.name) || r.name || r.login) + ' <span class="muted small">' + A.esc(r.studentNo || r.email || r.login) + "</span></div>" +
        '<div class="meta"><span>' + A.esc(A.relTime(r.askedAt)) + "</span>" + (r.said && String(r.name || "").toLowerCase().indexOf(r.said.toLowerCase()) < 0 ? '<span class="sep"></span><span>Says they are ' + A.esc(r.said) + "</span>" : "") +
        (r.note ? '<span class="sep"></span><span>\u201c' + A.esc(r.note) + "\u201d</span>" : "") + "</div></div>" +
        '<button class="btn btn-sm btn-primary" data-act="pwreq-reset" data-id="' + A.esc(r.id) + '">' + A.icon("refresh") + "Give a new password</button>" +
        '<button class="btn btn-sm btn-ghost" data-act="pwreq-done" data-id="' + A.esc(r.id) + '" data-tip="Dismiss">' + A.icon("x") + "</button></div>";
    }).join("") + '<p class="tiny muted" style="padding:0 20px 14px">Check it really is them before you pass on a new password.</p></div>';
  };
  A.act["pwreq-reset"] = function (el) {
    var r = A.Store.get("pwrequests", el.getAttribute("data-id")); if (!r) return;
    var u = A.M.user(r.appId) || { id: r.appId, name: r.name, studentNo: r.studentNo };
    A.UI.confirm("Give " + u.name + " a new password? Their old one stops working.", { ok: "New password" }).then(function (ok) {
      if (!ok) return;
      Cloud.admin("reset", { appId: r.appId }).then(function (res) {
        A.Store.patch("pwrequests", r.id, { doneAt: Date.now() });
        showPassword("New password for " + u.name, u, res.password);
        A.render();
      }).catch(fail);
    });
  };
  A.act["pwreq-done"] = function (el) { A.Store.patch("pwrequests", el.getAttribute("data-id"), { doneAt: Date.now() }); A.render(); };

  A.act["cloud-reset"] = function (el) {
    var id = el.getAttribute("data-id"), u = A.M.user(id);
    A.UI.confirm("Give " + u.name + " a new password? Their old one stops working.", { ok: "New password" }).then(function (ok) {
      if (!ok) return;
      Cloud.admin("reset", { appId: id }).then(function (r) {
        document.querySelectorAll(".modal-back").forEach(function (x) { x.remove(); });
        showPassword("New password for " + u.name, u, r.password);
      }).catch(fail);
    });
  };
  A.act["cloud-add-student"] = function () {
    var st = A.M.structure();
    A.UI.modal({
      title: "Add a student", sub: "They get the next ID and join the subjects you tick straight away.",
      body: '<form id="cloud-add" class="form-grid"><label class="field full"><span>Full name</span><input class="input" name="name" autocomplete="off"></label>' +
        '<label class="field full"><span>' + A.esc(st.levelLabel) + '</span><select class="select" name="level">' + st.levels.map(function (l) { return "<option>" + A.esc(l) + "</option>"; }).join("") + "</select></label>" +
        '<div class="field full"><span class="label">Subjects</span><div class="subj-picker">' + A.subjectPicker(A.M.offeredSubjects(), {}) + "</div></div></form>",
      foot: [{ label: "Cancel" }, { label: "Add student", cls: "btn-primary", onClick: function (m) {
        var f = A.UI.formData(m.querySelector("#cloud-add"));
        if (f.name.trim().length < 2) { A.UI.toast("Enter the student's name", "bad"); return false; }
        Cloud.admin("create", { name: f.name.trim(), level: f.level, subjects: A.pickedSubjects(m.querySelector("#cloud-add")) }).then(function (r) {
          return done("Added " + f.name.trim() + " as " + r.studentNo).then(function () {
            showPassword(f.name.trim() + " is ready", { name: f.name.trim(), studentNo: r.studentNo }, r.password);
          });
        }).catch(fail);
      } }],
    });
  };
  A.act["cloud-remove"] = function (el) {
    var id = el.getAttribute("data-id"), u = A.M.user(id);
    A.UI.confirm("Remove " + u.name + "? Their sign-in is deleted and they leave every subject.", { danger: true, ok: "Remove" }).then(function (ok) {
      if (!ok) return;
      Cloud.admin("remove", { appId: id }).then(function () {
        document.querySelectorAll(".modal-back").forEach(function (x) { x.remove(); });
        return done(u.name + " was removed");
      }).catch(fail);
    });
  };
})(window.App);
