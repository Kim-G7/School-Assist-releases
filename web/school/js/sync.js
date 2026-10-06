/* Optional sync with the school server (server.cjs). The app never needs it to work:
   everything is saved on the device first, and sync runs whenever a connection exists.
   Merge rule: newest `updatedAt` wins per record; records have a single owner role. */
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
      c.url = /^https?:$/.test(location.protocol) && !/github\.io|claude\.ai/.test(location.host) ? location.origin : "";
      c.auto = true;
      c.probe = true;
    }
    return c;
  }

  var Sync = (A.Sync = {
    config: cfg,
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
      var changes = S.changedSince(meta.lastPushAt || 0), sent = 0;
      if (c.cloud) { delete changes.credentials; delete changes.netinfo; } // passwords live in the online sign-in
      Object.keys(changes).forEach(function (k) { sent += changes[k].length; });
      var request = c.cloud
        ? A.Cloud.rpc("sync", { p_since: meta.serverSince || 0, p_changes: changes })
        : fetch(c.url + "/api/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: A.Devices ? A.Devices.id() : meta.deviceId, since: meta.serverSince || 0, changes: changes }),
        }).then(function (r) {
          if (!r.ok) throw new Error("Server replied " + r.status);
          return r.json();
        });
      running = request.then(function (res) {
        var received = 0;
        Object.keys(res.changes || {}).forEach(function (coll) {
          (res.changes[coll] || []).forEach(function (rec) { if (S.merge(coll, rec)) received++; });
        });
        meta.lastPushAt = startedAt;
        meta.serverSince = res.now;
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
        if (quiet) { state = "local"; } else { state = "error"; lastError = e.message || String(e); }
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
              headers: { "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name || f.id) },
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
      return fetch(c.url + "/api/files/" + encodeURIComponent(id)).then(function (r) {
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
