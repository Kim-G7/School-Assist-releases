/* Optional sync with the school server (server.cjs). The app never needs it to work:
   everything is saved on the device first, and sync runs whenever a connection exists.
   Merge rule: newest `updatedAt` wins per record; records have a single owner role.
   Schools: a device sends its school id with every sync. A device with no school yet (the demo, or a new
   install) sends nothing and, the first time it reaches a hub that has a school, joins it: its own copy is
   replaced by the school's (js/setup.js). A hub turns away a device of another school (server.cjs).
   Registered devices (1.6, hub-access.cjs): a device joins the hub once and sends its key (X-SA-Key) with every
   request; the hub computer's own app sends the hub's local token instead. People sign in through the hub when
   this device doesn't hold their record, and the hub sends each device only its people's share. */
(function (A) {
  "use strict";
  var KEY = "sca-sync";
  var timer = null, running = null, filesBusy = null, lastError = "", state = "local";
  // how often to sync: every 30–45 seconds while the app is on screen (a little random, so a school's devices
  // don't all ask at the same moment), every 2 minutes while it is hidden, and straight away on coming back
  var EVERY = 30000, SPREAD = 15000, HIDDEN = 120000;

  function cfg() {
    if (A.Cloud) return { url: A.Cloud.url, auto: true, cloud: true }; // home edition online
    var c = {};
    try { c = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { c = {}; }
    if (c.url == null) {
      // served by server.cjs? then sync with it by default
      c.url = /^https?:$/.test(location.protocol) && !A.staticHost() ? location.origin : "";
      c.auto = true;
      c.probe = true;
    }
    return c;
  }

  /* ------------------------------------------------------------ the hub's lock (1.6) */
  var localToken = null, localAsked = 0;
  function meta() { return (A.Store.state && A.Store.state.meta) || {}; }
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  // the desktop app knows the computer's name ("LAB-PC-07"): it leads the label admins see under Settings → Devices
  var computer = null;
  if (window.desktop && window.desktop.info) window.desktop.info().then(function (i) { computer = (i && i.computer) || null; }).catch(function () {});
  function deviceLabel() {
    var d = A.Devices && A.Devices.detect ? A.Devices.detect() : {};
    return [computer, d.model, d.os, d.browser].filter(Boolean).join(" · ") || "A device";
  }
  /** The hub computer's own app: the hub's local token, from the desktop app (asked again once a minute). */
  function prepLocal(c) {
    var d = window.desktop;
    if (!d || !d.hub || !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(c.url || "")) { localToken = null; return Promise.resolve(); }
    if (localToken && Date.now() - localAsked < 60000) return Promise.resolve();
    localAsked = Date.now();
    return d.hub.status().then(function (h) { localToken = (h && h.running && h.token) || null; }).catch(function () { localToken = null; });
  }
  /** Headers that tell the hub which device this is. */
  function headers(extra) {
    var h = Object.assign({}, extra || {}), m = meta();
    if (localToken) h["X-SA-Local"] = localToken;
    if (m.hubKey) h["X-SA-Key"] = m.hubKey;
    h["X-SA-User"] = currentUser(); // what comes down is for the person signed in now (hub-access.cjs forNow)
    return h;
  }
  function readJson(r) { return r.json().catch(function () { return {}; }); }
  /** The school file's joining secret: the one this device took at set-up, or (a copy updated to 1.6 by copying the new
      version over the old one) the school file now next to the app, when it is this school's. */
  function packSecret(m) {
    if (m.pack && m.pack.join) return Promise.resolve(m.pack.join);
    var d = window.desktop, mine = A.SchoolId && A.SchoolId.id();
    if (!d || !d.pack || !mine) return Promise.resolve("");
    return d.pack.read().then(function (p) {
      var s = p && p.school, j = p && p.hub && p.hub.join;
      if (!j || !s || s.schoolId !== mine) return "";
      m.pack = Object.assign({}, m.pack || {}, { join: j });
      return j;
    }).catch(function () { return ""; });
  }
  /** Register this device with the hub (once): the school file's secret, a staff code, or an admin's approval. */
  function join(c, staffCode) {
    var m = meta();
    return packSecret(m).then(function (secret) {
      return fetch(c.url + "/api/join", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: A.Devices ? A.Devices.id() : m.deviceId, label: deviceLabel(), secret: secret || undefined, staffCode: staffCode || undefined }) });
    })
      .then(function (r) {
        return readJson(r).then(function (j) {
          if (r.status === 200 && j.key) { m.hubKey = j.key; m.joinCode = null; m.blocked = false; m.oldHub = null; return A.Store.flush().then(function () { return { key: true }; }); }
          // a hub still on 1.5 has no /api/join (it answers 405, or 404): sync as before; once it is updated it
          // answers 401 "join" and this device joins
          if (r.status === 404 || r.status === 405) { m.oldHub = Date.now(); return { old: true }; }
          if (r.status === 202 && j.pending) { m.joinCode = j.code; return { pending: true, code: j.code }; }
          throw err(j.declined ? "declined" : "refused", j.error || "The school hub replied " + r.status + ".");
        });
      });
  }
  /** Before anything else: this device's key (or the hub computer's token). Rejects with code "pending" while an admin hasn't let it in. */
  function ready(c, staffCode) {
    return prepLocal(c).then(function () {
      if (localToken || meta().hubKey || meta().oldHub) return;
      return join(c, staffCode).then(function (r) {
        if (r.pending) throw err("pending", "This device is waiting to join the school hub. Show an admin this code: " + r.code + " (Settings → Devices).");
      });
    });
  }
  /** Who is signed in on this device now ("-": nobody), for the hub. */
  function currentUser() { var me = A.M && A.M.me ? A.M.me() : null; return me ? me.id : "-"; }
  /** Things the hub sends back besides the records: changes it refused (its own copy instead), and this device's share. */
  function keepToShare(res) {
    var S = A.Store;
    (res.restore || []).forEach(function (x) { S.replace(x.coll, x.id, x.rec); });
    if (!res.scope || res.scope === "admin") return;
    // known: whose records this device keeps now (the person signed in, on a computer students share); devKnown:
    // everyone who signs in here (their scrambled passwords stay, so they can sign in when the hub is off)
    var known = {}, devKnown = {}, m = meta(), sent = m.lastPushAt || 0;
    (res.known || []).forEach(function (id) { known[id] = 1; });
    (res.devKnown || res.known || []).forEach(function (id) { devKnown[id] = 1; });
    var drop = function (coll, keep) {
      var all = S.state.colls[coll] || {};
      Object.keys(all).forEach(function (id) { var r = all[id]; if ((r.updatedAt || 0) <= sent && !keep(r)) delete all[id]; }); // never a change not yet sent
    };
    // passwords: only the people who sign in here; PINs from before 1.6 never stay on a device
    drop("credentials", function (r) { return r._deleted || devKnown[r.userId]; });
    Object.keys(S.state.colls.users || {}).forEach(function (id) { var u = S.state.colls.users[id]; if (u && u.pin != null) { var p = Object.assign({}, u); delete p.pin; S.state.colls.users[id] = p; } });
    if (res.scope !== "student") return;
    // a student device keeps its own students' records only (a lab computer may hold others' from before 1.6)
    ["submissions", "receipts", "progress", "attempts", "enrolments", "marks", "reportmarks"].forEach(function (coll) { drop(coll, function (r) { return r._deleted || known[r.studentId]; }); });
    ["alerts", "netinfo", "assessments", "reports", "schemes", "pnotes"].forEach(function (coll) { drop(coll, function () { return false; }); });
    drop("pwrequests", function (r) { return known[r.appId]; });
    drop("devices", function (r) { return A.Devices && r.deviceId === A.Devices.id(); });
    // (1.6.1) what a teacher's or another student's session left here: messages to others, other classes' registers
    // and other students' details. Only their classes' messages to everyone, their own marks in the register, and
    // their classmates' names and IDs stay.
    var mine = {}, mates = {};
    Object.keys(S.state.colls.classes || {}).forEach(function (id) {
      var c = S.state.colls.classes[id];
      if (c && !c._deleted && (c.studentIds || []).some(function (s) { return known[s]; })) { mine[c.id] = 1; (c.studentIds || []).forEach(function (s) { mates[s] = 1; }); }
    });
    drop("messages", function (r) { return r._deleted || (Array.isArray(r.to) ? r.to.some(function (id) { return known[id]; }) : mine[r.classId]); });
    drop("attendance", function (r) { return r._deleted || mine[r.classId]; });
    Object.keys(S.state.colls.attendance || {}).forEach(function (id) {
      var r = S.state.colls.attendance[id];
      if (!r || r._deleted || (r.updatedAt || 0) > sent || !r.marks) return;
      var only = {}; Object.keys(r.marks).forEach(function (s) { if (known[s]) only[s] = r.marks[s]; });
      if (Object.keys(only).length !== Object.keys(r.marks).length) S.state.colls.attendance[id] = Object.assign({}, r, { marks: only });
    });
    drop("users", function (u) { return u._deleted || u.role !== "student" || known[u.id] || mates[u.id] || devKnown[u.id]; });
    Object.keys(S.state.colls.users || {}).forEach(function (id) {
      var u = S.state.colls.users[id];
      if (!u || u._deleted || u.role !== "student" || known[u.id] || (u.updatedAt || 0) > sent) return;
      S.state.colls.users[id] = { id: u.id, role: u.role, name: u.name, level: u.level, stream: u.stream, studentNo: u.studentNo, status: u.status, updatedAt: u.updatedAt, _serverAt: u._serverAt };
    });
    var codes = S.state.colls.settings && S.state.colls.settings.staffcodes;
    if (codes && (codes.updatedAt || 0) <= sent) delete S.state.colls.settings.staffcodes;
  }

  function hubAuth(path, o) {
    var c = cfg(), m = meta(), S = A.Store;
    if (!c.url || A.Cloud) return Promise.reject(err("nohub", "No school hub."));
    return ready(c, o.staffCode).then(function () {
      return fetch(c.url + path, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(o) });
    }).then(function (r) {
      return readJson(r).then(function (j) {
        if (r.status === 401 && j.join) { m.hubKey = null; m.oldHub = null; throw err("rejoin", "This device has to join the school hub again. Try once more."); }
        if (!r.ok) throw err(j.locked ? "locked" : j.needCode ? "needCode" : j.wrong ? "wrong" : j.hasPassword ? "hasPassword" : j.pending ? "pending" : j.declined ? "declined" : j.blocked ? "blocked" : "refused", j.error || "The school hub replied " + r.status + ".");
        if (j.user) S.merge("users", j.user);
        if (j.credential) S.merge("credentials", j.credential);
        if (j.added) m.serverSince = 0; // someone new here: everything they may see comes down at the next sync
        return S.flush().then(function () { return j; });
      });
    }, function (e) {
      if (e.code) throw e;
      throw err("offline", "Can't reach the school hub. Connect to the school Wi-Fi to sign in on this device the first time.");
    });
  }

  var Sync = (A.Sync = {
    config: cfg,
    headers: headers,
    /** Does this device sync with a school hub (not the demo, not online, not on its own)? */
    // (a hub still on 1.5 checks nothing itself: this device signs people in as 1.5 did, until the hub is updated)
    hubMode: function () { var c = cfg(); return !A.Cloud && !!c.url && !!(A.SchoolId && A.SchoolId.id()) && !meta().oldHub; },
    /** This device and the hub: { key, code } (code: the six letters an admin approves, while it waits). */
    joinState: function () { var m = meta(); return { key: !!m.hubKey || !!localToken, code: m.joinCode || null, blocked: !!m.blocked }; },
    /** Join with a staff code typed on this device (a teacher registering or signing in). */
    joinWithCode: function (code) { var c = cfg(); return c.url ? join(c, code) : Promise.reject(err("nohub", "No school hub.")); },
    /** Sign someone in through the hub: { userId | studentNo, secret, staffCode }. Resolves with { user, credential }; the
        error's code says why not: wrong, locked, needCode, pending, declined, offline. */
    hubSignIn: function (o) { return hubAuth("/api/signin", o); },
    /** "Set up your account" on a device that doesn't hold the student's record: the hub checks the name and ID and keeps the password. */
    hubSetup: function (o) { return hubAuth("/api/setup-password", o); },
    /** A staff code typed on this device: the hub says which role it is ("teacher" or "admin"). */
    checkStaffCode: function (code) {
      var c = cfg();
      if (!c.url || A.Cloud) return Promise.reject(err("nohub", "No school hub."));
      return ready(c, code).then(function () {
        return fetch(c.url + "/api/staffcode", { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ code: code }) });
      }).then(function (r) { return readJson(r).then(function (j) { if (!r.ok) throw err("refused", j.error || "The school hub replied " + r.status + "."); return j.role; }); },
        function (e) { if (e.code) throw e; throw err("offline", "Can't reach the school hub. Connect to the school Wi-Fi to register."); });
    },
    /** An admin's request to the hub: devices waiting to join, the registered ones, approving, removing. */
    /** This device's key to the hub (or the hub computer's token) before asking it anything else (js/model.js claimNumber). */
    ready: function () { var c = cfg(); return c.url && !A.Cloud ? ready(c) : Promise.resolve(); },
    hubPost: function (path, body) {
      var c = cfg();
      if (!c.url || A.Cloud) return Promise.reject(err("nohub", "No school hub."));
      return ready(c).then(function () {
        return fetch(c.url + path, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body || {}) });
      }).then(function (r) { return readJson(r).then(function (j) { if (!r.ok) throw err("refused", j.error || "The school hub replied " + r.status + "."); return j; }); });
    },
    setConfig: function (c) {
      if (A.Cloud) return;
      try { localStorage.setItem(KEY, JSON.stringify({ url: c.url, auto: !!c.auto })); } catch (e) { /* ignore */ }
      lastError = ""; state = c.url ? "ok" : "local";
      Sync.schedule();
    },
    status: function () {
      var meta = (A.Store.state && A.Store.state.meta) || {};
      return { state: cfg().url ? state : "local", lastSyncAt: meta.lastSyncAt || 0, pending: A.Store.state ? A.Store.pendingCount() : 0, lastError: lastError };
    },

    init: function () {
      window.addEventListener("online", function () { Sync.maybe(); });
      document.addEventListener("visibilitychange", function () { if (!document.hidden) Sync.catchUp(); Sync.schedule(); });
      window.addEventListener("focus", function () { Sync.catchUp(); });
      A.Store.on("change", A.debounce(function () { Sync.maybe(); }, 2500));
      Sync.schedule();
      Sync.maybe();
    },
    schedule: function () {
      clearTimeout(timer);
      var c = cfg();
      if (!c.url || !c.auto) return;
      timer = setTimeout(function () { Sync.maybe(); Sync.schedule(); }, document.hidden ? HIDDEN : EVERY + Math.floor(Math.random() * SPREAD));
    },
    /** Back on the app after a while: fetch what changed now rather than at the next turn. */
    catchUp: function () {
      var meta = (A.Store.state && A.Store.state.meta) || {};
      if (Date.now() - (meta.lastSyncAt || 0) > 10000) Sync.maybe();
    },
    maybe: function () {
      var c = cfg();
      if (!c.url || !c.auto || !navigator.onLine || running) return;
      if (c.cloud && !A.Cloud.session()) return;
      Sync.syncNow(c.probe).catch(function () { /* status shows it */ });
    },

    syncNow: function (quiet) {
      var c = cfg();
      if (!c.url) return Promise.reject(new Error("No sync server set"));
      if (c.cloud && !A.Cloud.session()) return Promise.reject(new Error("Sign in online to sync"));
      if (running) return running;
      var S = A.Store, meta = S.state.meta, startedAt = Date.now();
      // null: this device has no school yet (the demo, or a new install): it only receives
      var school = !c.cloud && A.SchoolId && A.SchoolId.applies() ? A.SchoolId.id() : undefined;
      var changes = school === null ? {} : S.changedSince(meta.lastPushAt || 0), sent = 0;
      // someone else signed in since the last sync (1.6.1): their own records come down again from the start
      var who = currentUser(), fresh = !c.cloud && meta.syncUser !== undefined && meta.syncUser !== who;
      if (c.cloud) { delete changes.credentials; delete changes.netinfo; } // passwords live in the online sign-in
      Object.keys(changes).forEach(function (k) { sent += changes[k].length; });
      var request = c.cloud
        ? A.Cloud.rpc("sync", { p_since: meta.serverSince || 0, p_changes: changes })
        : ready(c).then(function () { return fetch(c.url + "/api/sync", {
          method: "POST", headers: headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ deviceId: A.Devices ? A.Devices.id() : meta.deviceId, since: school === null ? 0 : meta.serverSince || 0, changes: changes, fresh: fresh || undefined,
            school: school, schoolName: school ? (A.SchoolId.record() || {}).name || A.Theme.get().name : undefined }),
        }); }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            // its key no longer works (the hub was replaced, or it joined again elsewhere): join again next time
            if (r.status === 401 && j.join) { meta.hubKey = null; meta.oldHub = null; throw err("rejoin", j.error || "This device has to join the school hub again."); }
            if (r.status === 403 && j.blocked) { meta.hubKey = null; meta.blocked = true; throw err("blocked", j.error); }
            if (!r.ok) throw new Error(j.error || "Server replied " + r.status);
            return j;
          });
        });
      running = request.then(function (res) {
        if (school === null) {
          // no school here yet: join the hub's school, if it has one
          meta.lastSyncAt = Date.now();
          if (!res.school) { state = "ok"; lastError = "This hub has no school yet. Set the school up on the hub computer."; A.refreshStatus(); return { sent: 0, received: 0 }; }
          return A.SchoolId.adopt(res, startedAt).then(function (n) {
            state = "ok"; lastError = "";
            A.Theme.apply(); A.render();
            if (A.UI) A.UI.toast("This device has joined " + (res.school.name || "the school"));
            Sync.files(c);
            return { sent: 0, received: n, joined: true };
          });
        }
        var received = 0;
        Object.keys(res.changes || {}).forEach(function (coll) {
          (res.changes[coll] || []).forEach(function (rec) { if (S.merge(coll, rec)) received++; });
        });
        if (!c.cloud) { if ((res.restore || []).length) received++; keepToShare(res); }
        if (A.SchoolId && A.SchoolId.hubOk) A.SchoolId.hubOk();
        meta.lastPushAt = startedAt;
        meta.serverSince = res.now;
        if (!c.cloud) meta.syncUser = who;
        meta.lastSyncAt = Date.now();
        state = "ok"; lastError = "";
        return S.flush().then(function () {
          // files go up and down in the background, so a big download never holds up the next sync
          Sync.files(c);
          if (received) {
            A.Theme.apply(); A.softRefresh();
            // new work and notices pop up now, not at the next 30-second check
            if (A.Alerts && A.Alerts.check) A.Alerts.check();
            if (A.Notify && A.Notify.check) A.Notify.check();
          } else A.refreshStatus();
          return { sent: sent, received: received };
        });
      }).catch(function (e) {
        // online account removed, or its sign-in ran out: back to the sign-in screen
        if (c.cloud && !e.offline && (/no school assist account/i.test(e.message || "") || !A.Cloud.session()) && A.cloudSignedOut) {
          A.cloudSignedOut("Please sign in again.");
        }
        // the hub didn't answer at all (not an error reply): maybe its address changed (js/setup.js looks for it)
        if (!c.cloud && e && e.name === "TypeError" && A.SchoolId && A.SchoolId.lostHub) A.SchoolId.lostHub(c.url);
        if (e && e.code === "pending") { state = "pending"; lastError = e.message; }
        else if (quiet) { state = "local"; } else { state = "error"; lastError = e.message || String(e); }
        A.refreshStatus();
        throw e;
      }).then(function (r) { running = null; return r; }, function (e) { running = null; throw e; });
      return running;
    },

    /** File uploads, then (students) offline saving: one run at a time, alongside the record sync. */
    files: function (c) {
      if (filesBusy) return filesBusy;
      filesBusy = Sync.pushFiles(c).then(function () { return Sync.autoSave(); }).catch(function (e) { console.warn("[sync] files", e); })
        .then(function () { filesBusy = null; });
      return filesBusy;
    },

    /** Upload files created on this device (PDFs, student attachments). */
    pushFiles: function (c) {
      return A.Files.all().then(function (files) {
        var todo = files.filter(function (f) { return !f.uploaded && f.blob; });
        return todo.reduce(function (p, f) {
          return p.then(function () {
            if (c.cloud) {
              return A.Cloud.upload(f).then(function () { f.uploaded = true; return A.Files.put(f); })
                .catch(function (e) { if (A.UI) A.UI.toast(e.message, "bad"); });
            }
            return fetch(c.url + "/api/files/" + encodeURIComponent(f.id), {
              method: "PUT", body: f.blob,
              headers: headers({ "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name || f.id) }),
            }).then(function (r) { if (r.ok) { f.uploaded = true; return A.Files.put(f); } });
          });
        }, Promise.resolve());
      }).catch(function (e) { console.warn("[sync] file upload", e); });
    },

    /** Download a file another device uploaded. persist=false opens it without keeping a copy (online-only). */
    fetchFile: function (id, persist) {
      var c = cfg();
      if (!c.url || !navigator.onLine) return Promise.resolve(null);
      if (c.cloud) {
        return A.Cloud.download(id).then(function (blob) {
          if (!blob) return null;
          var mat = A.Store.find("materials", function (m) { return m.fileId === id; });
          var rec = { id: id, name: (mat && mat.fileName) || id, type: blob.type, size: blob.size, blob: blob, createdAt: Date.now(), uploaded: true };
          return persist === false ? rec : A.Files.put(rec);
        }).catch(function () { return null; });
      }
      return fetch(c.url + "/api/files/" + encodeURIComponent(id), { headers: headers() }).then(function (r) {
        if (!r.ok) return null;
        var name = decodeURIComponent(r.headers.get("X-File-Name") || id);
        return r.blob().then(function (blob) {
          var rec = { id: id, name: name, type: blob.type, size: blob.size, blob: blob, createdAt: Date.now(), uploaded: true };
          return persist === false ? rec : A.Files.put(rec);
        });
      }).catch(function () { return null; });
    },

    /** Students: quietly save new library files that are allowed offline (Settings → Offline). */
    autoSave: function () {
      var me = A.M.me();
      if (!me || me.role !== "student" || !navigator.onLine || !cfg().url) return Promise.resolve();
      if (A.Offline) { A.Offline.tidy(me).catch(function () {}); A.Offline.kick(); } // past papers: in the background, so they never hold up sync
      var off; try { off = localStorage.getItem("sca-autosave") === "off"; } catch (e) { off = false; }
      if (off) return Promise.resolve();
      // study material here (exam papers are A.Offline's), with the tutor's reading of each document
      var ids = [];
      A.M.materialsForStudent(me.id).forEach(function (m) {
        if (!m.fileId || m.offline === false || A.M.isExamItem(m)) return;
        [m.fileId, m.tutorFileId].forEach(function (id) { if (id && !A.Files.has(id)) ids.push(id); });
      });
      return ids.reduce(function (p, id) { return p.then(function () { return Sync.fetchFile(id, true); }); }, Promise.resolve());
    },
  });

  /* ------------------------------------------------ past papers on this device
     A student's past papers, with their inserts, the typed-answer questions and the marking schemes
     they may see, are saved on the device in the background, so Test mode and the tutor's topic
     tests work with no internet. Newest papers first, a paper from each subject in turn, so every
     subject is usable early. All of it can be several hundred MB, so it waits for Wi-Fi when the
     phone says it is on mobile data, and stops before the device runs short of space.
     Settings → Offline & sync: turn it off, let it use mobile data, or leave a subject out. */
  function pref(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  var RESERVE = 300 * 1024 * 1024; // room left for the phone's own things
  var job = { running: false, done: 0, total: 0, stopped: "" }, shownAt = 0;
  function sylOf(m) { var c = A.M.cls(m.classId); return m.syllabusId || (c && c.syllabusId) || ""; }
  function sylOfItem(m) { var p = m.paperId && A.Store.get("materials", m.paperId); return sylOf(m) || (p ? sylOf(p) : ""); } // an insert or scheme: its paper's
  function room(size) {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(true);
    return navigator.storage.estimate().then(function (e) { return !e.quota || e.quota - (e.usage || 0) > (size || 0) + RESERVE; }).catch(function () { return true; });
  }
  // screens that show the progress update in place; the page redraws when a run ends
  function show(final) {
    if (!final && Date.now() - shownAt < 1500) return;
    shownAt = Date.now();
    document.querySelectorAll("[data-offline-job]").forEach(function (el) { el.innerHTML = A.Offline.statusText(); });
    if (final && document.querySelector("[data-offline-panel], [data-offline-list]") && A.softRefresh) A.softRefresh();
  }

  var Offline = (A.Offline = {
    auto: function () { return pref("sca-papers") !== "off"; },
    mobileData: function () { return pref("sca-papers-data") === "on"; },
    skipped: function () { try { return JSON.parse(pref("sca-papers-skip") || "[]"); } catch (e) { return []; } },
    setAuto: function (on) { setPref("sca-papers", on ? "on" : "off"); if (on) Offline.kick(); else Offline.stop(); },
    setMobileData: function (on) { setPref("sca-papers-data", on ? "on" : "off"); if (on) Offline.kick(); },
    /** The phone is on mobile data, or has asked apps to save data (browsers that can tell). */
    onMobileData: function () { var c = navigator.connection; return !!(c && (c.saveData || c.type === "cellular")); },
    job: function () { return job; },

    /** Everything Test mode needs, file by file, in the order to fetch it. */
    plan: function (me, all) {
      var mats = A.M.materialsForStudent(me.id), skip = all ? [] : Offline.skipped(), bySyl = {}, order = [], extras = {};
      mats.forEach(function (m) { if (m.paperId && (m.kind === "insert" || m.kind === "markscheme")) (extras[m.paperId] = extras[m.paperId] || []).push(m); });
      mats.filter(function (m) { return m.kind === "pastpaper" && m.fileId && m.offline !== false; }).sort(A.M.byExamSession).forEach(function (p) {
        var k = sylOf(p);
        if (skip.indexOf(k) >= 0) return;
        if (!bySyl[k]) { bySyl[k] = []; order.push(k); }
        bySyl[k].push(p);
      });
      var out = [], seen = {};
      function add(id, size, m, paper) { if (id && !seen[id]) { seen[id] = 1; out.push({ id: id, size: Number(size) || 0, mat: m, paper: paper, syllabusId: sylOf(paper) }); } }
      for (var i = 0; order.some(function (k) { return bySyl[k].length > i; }); i++) {
        order.forEach(function (k) {
          var p = bySyl[k][i]; if (!p) return;
          add(p.fileId, p.fileSize, p, p);
          add(p.scanFileId, 20000, p, p); // the questions, for typed answers
          (extras[p.id] || []).forEach(function (m) { if (m.offline !== false) add(m.fileId, m.fileSize, m, p); });
        });
      }
      return out;
    },
    /** A paper can be sat with no internet: it, its questions and its insert are on this device. */
    ready: function (p) {
      if (!p || !A.Files.has(p.fileId) || (p.scanFileId && !A.Files.has(p.scanFileId))) return false;
      var ins = A.M.insertFor && A.M.insertFor(p.id);
      return !ins || !ins.fileId || A.Files.has(ins.fileId);
    },
    /** Per subject: papers, how many are ready offline, and the space they take. */
    summary: function (me) {
      var subjects = {}, skip = Offline.skipped();
      Offline.plan(me, true).forEach(function (x) {
        var s = subjects[x.syllabusId] = subjects[x.syllabusId] || { syllabusId: x.syllabusId, papers: {}, bytes: 0, savedBytes: 0, kept: skip.indexOf(x.syllabusId) < 0 };
        s.papers[x.paper.id] = x.paper; s.bytes += x.size;
        if (A.Files.has(x.id)) s.savedBytes += x.size;
      });
      return Object.keys(subjects).map(function (k) {
        var s = subjects[k], ps = Object.keys(s.papers).map(function (id) { return s.papers[id]; });
        return Object.assign(s, { total: ps.length, ready: ps.filter(Offline.ready).length });
      });
    },
    statusText: function () {
      if (job.running) return A.icon("refresh") + " Saving papers on this device: " + job.done + " of " + job.total + " files";
      var me = A.M.me(), plan = me ? Offline.plan(me) : [];
      if (plan.length && plan.every(function (x) { return A.Files.has(x.id); })) return A.icon("check") + " All saved: these papers open with no internet.";
      if (!Offline.auto()) return "Saving past papers automatically is off.";
      return ({ wifi: A.icon("wifi") + " Waiting for Wi-Fi to save more papers (or allow mobile data below).",
        space: A.icon("alert") + " Stopped: this device is running short of space. Leave out a subject you don't need offline, or free some space.",
        offline: A.icon("wifiOff") + " No internet: saving carries on when you are back online." })[job.stopped] || "";
    },

    /** Start saving in the background (if it's on, the connection allows it, and anything is missing). */
    kick: function (force) {
      var me = A.M.me();
      if (job.running || !me || me.role !== "student" || !navigator.onLine || !A.Sync.config().url) return;
      if (A.Cloud && !A.Cloud.session()) return;
      if (!force && !Offline.auto()) return;
      if (!force && !Offline.mobileData() && Offline.onMobileData()) { if (job.stopped !== "wifi") { job.stopped = "wifi"; show(true); } return; }
      var todo = Offline.plan(me).filter(function (x) { return !A.Files.has(x.id); });
      if (!todo.length) { if (job.stopped) { job.stopped = ""; show(true); } return; }
      job = { running: true, done: 0, total: todo.length, stopped: "", force: !!force };
      var end = function (why) { job.running = false; job.stopped = why || ""; show(true); };
      var step = function (i) {
        if (!job.running) return end("");
        if (i >= todo.length) return end("");
        if (!navigator.onLine) return end("offline");
        if (!job.force && !Offline.mobileData() && Offline.onMobileData()) return end("wifi");
        if (Offline.skipped().indexOf(todo[i].syllabusId) >= 0) { job.done = i + 1; return step(i + 1); } // left out meanwhile
        return room(todo[i].size).then(function (ok) {
          if (!ok) return end("space");
          job.current = A.Sync.fetchFile(todo[i].id, true);
          return job.current.then(function () { job.done = i + 1; show(); return step(i + 1); });
        });
      };
      show(true);
      step(0).catch(function (e) { console.warn("[offline] papers", e); end(""); });
    },
    stop: function () { job.running = false; },

    /** A subject the student has dropped (the drop was approved): its papers leave this device,
        except any file a subject they still take needs. */
    tidy: function (me) {
      var dropped = {};
      A.M.enrolments(me.id).forEach(function (e) { if (e.status === "dropped") dropped[e.syllabusId] = 1; });
      if (!Object.keys(dropped).length) return Promise.resolve();
      var needed = {}, gone = [];
      Offline.plan(me, true).forEach(function (x) { needed[x.id] = 1; });
      A.Store.filter("materials", function (m) { return A.M.isExamItem(m) && dropped[sylOfItem(m)] && !A.M.materialVisibleTo(m, me.id); }).forEach(function (m) {
        [m.fileId, m.scanFileId].forEach(function (id) { if (id && !needed[id] && A.Files.has(id) && gone.indexOf(id) < 0) gone.push(id); });
      });
      return Promise.all(gone.map(function (id) { return A.Files.remove(id); }));
    },

    /** Keep a subject's papers on this device, or leave it out and free the space. */
    keepSubject: function (sylId, keep) {
      var skip = Offline.skipped().filter(function (x) { return x !== sylId; });
      if (!keep) skip.push(sylId);
      setPref("sca-papers-skip", JSON.stringify(skip));
      if (keep) { Offline.kick(); return Promise.resolve(); }
      // a file on its way down finishes first (the run then passes over this subject), then the space is freed;
      // files another subject still needs stay
      return Promise.resolve(job.running && job.current).then(function () {
        var me = A.M.me(), used = {};
        Offline.plan(me).forEach(function (x) { used[x.id] = 1; });
        var gone = Offline.plan(me, true).filter(function (x) { return x.syllabusId === sylId && !used[x.id] && A.Files.has(x.id); });
        return Promise.all(gone.map(function (x) { return A.Files.remove(x.id); }));
      });
    },
  });
  window.addEventListener("online", function () { setTimeout(function () { Offline.kick(); }, 3000); });
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener("change", function () { Offline.kick(); });
})(window.App);
