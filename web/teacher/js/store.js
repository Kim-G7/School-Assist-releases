/* Offline storage.
 *
 *  - All records live in memory and are written to IndexedDB on this device
 *    (falls back to LocalStorage), so the app keeps working with no network.
 *  - Uploaded files (PDFs, textbooks, images) are kept as Blobs in IndexedDB.
 *  - Every record carries `updatedAt`; deletes leave a tombstone. That is all
 *    js/sync.js needs to merge devices when a connection is available.
 *  - Each collection has ONE owner role (see OWNERS), so a teacher's laptop and
 *    a student's tablet never edit the same record while offline.
 */
(function (A) {
  "use strict";

  var DB_NAME = "school-classroom";
  var STATE_KEY = "state-v1";
  var LS_KEY = "sca-state-v1";
  var VERSION = 2; // bump when the data model changes; older demo data is rebuilt

  var COLLS = ["settings", "users", "credentials", "classes", "syllabi", "materials", "tasks", "submissions", "marks",
    "attendance", "messages", "receipts", "progress", "attempts", "timetable", "lessons", "alerts",
    "devices", "revocations", "netinfo", "enrolments", "pwrequests",
    "assessments", "reports", "schemes", "pnotes"]; // the last four: School Assist Teacher (js/primary.js)

  /* who writes each collection (a user may also change their own PIN / password) */
  var OWNERS = {
    settings: "admin", users: "admin", credentials: "admin", timetable: "admin", revocations: "admin",
    classes: "teacher", syllabi: "teacher", materials: "teacher", tasks: "teacher", marks: "teacher",
    attendance: "teacher", messages: "teacher", lessons: "teacher", alerts: "teacher",
    assessments: "teacher", reports: "teacher", schemes: "teacher", pnotes: "teacher",
    submissions: "student", receipts: "student", progress: "student", attempts: "student",
    devices: "device", netinfo: "server",
  };

  /* ------------------------------------------------------------ IndexedDB */
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("no indexedDB"));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode), s = t.objectStore(store), out;
        var r = fn(s);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var Files = (A.Files = {
    /** ids of files stored on this device, so screens can show "On this device" instantly */
    local: {},
    loadIndex: function () {
      return tx("files", "readonly", function (s) { return s.getAllKeys(); }).then(function (keys) {
        Files.local = {};
        (keys || []).forEach(function (k) { Files.local[k] = true; });
      }).catch(function () { /* no IndexedDB */ });
    },
    has: function (id) { return !!Files.local[id]; },
    put: function (rec) { return tx("files", "readwrite", function (s) { return s.put(rec); }).then(function () { Files.local[rec.id] = true; return rec; }); },
    get: function (id) { return tx("files", "readonly", function (s) { return s.get(id); }).catch(function () { return null; }); },
    remove: function (id) { delete Files.local[id]; return tx("files", "readwrite", function (s) { return s.delete(id); }); },
    all: function () { return tx("files", "readonly", function (s) { return s.getAll(); }).catch(function () { return []; }); },
    /** Store a File/Blob from an <input type=file>. Returns the file record. */
    fromInput: function (file) {
      var rec = { id: A.uid("file"), name: file.name, type: file.type || "application/octet-stream", size: file.size, blob: file, createdAt: Date.now(), uploaded: false };
      return Files.put(rec);
    },
    url: function (id) {
      return Files.get(id).then(function (rec) {
        if (rec && rec.blob) return URL.createObjectURL(rec.blob);
        if (A.Sync && A.Sync.fetchFile) return A.Sync.fetchFile(id).then(function (r) { return r ? URL.createObjectURL(r.blob) : null; });
        return null;
      });
    },
  });

  /* ----------------------------------------------------------------- Store */
  var listeners = {};
  var Store = (A.Store = {
    COLLS: COLLS,
    OWNERS: OWNERS,
    state: null,
    backend: "IndexedDB",

    init: function () {
      return idb()
        .then(function () { return tx("kv", "readonly", function (s) { return s.get(STATE_KEY); }); })
        .catch(function () {
          Store.backend = "LocalStorage";
          try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; }
        })
        .then(function (saved) {
          if (saved && saved.version !== VERSION) saved = null; // older demo data: rebuild
          Store.state = saved && saved.colls ? saved : Store.empty();
          COLLS.forEach(function (c) { if (!Store.state.colls[c]) Store.state.colls[c] = {}; });
          if (!Store.state.meta.deviceId) Store.state.meta.deviceId = A.uid("dev");
          if (!Store.state.meta.seededAt && A.Seed) {
            return Promise.resolve(A.Seed.run(Store)).then(function () {
              Store.state.meta.seededAt = Date.now();
              return Store.flush();
            });
          }
        })
        .then(function () { return Files.loadIndex(); });
    },

    empty: function () {
      var colls = {};
      COLLS.forEach(function (c) { colls[c] = {}; });
      return { version: VERSION, colls: colls, meta: { lastSyncAt: 0 } };
    },

    /* ----- reads (tombstones hidden) */
    all: function (coll) {
      var m = Store.state.colls[coll] || {}, out = [];
      for (var k in m) if (!m[k]._deleted) out.push(m[k]);
      return out;
    },
    get: function (coll, id) {
      var r = Store.state && Store.state.colls[coll] && Store.state.colls[coll][id];
      return r && !r._deleted ? r : null;
    },
    filter: function (coll, fn) { return Store.all(coll).filter(fn); },
    find: function (coll, fn) { return Store.all(coll).find(fn) || null; },

    /* ----- writes */
    put: function (coll, rec, opts) {
      if (!rec.id) rec.id = A.uid(coll.slice(0, 3));
      if (!rec.createdAt) rec.createdAt = Date.now();
      rec.updatedAt = Date.now();
      Store.state.colls[coll][rec.id] = rec;
      if (!(opts && opts.silent)) Store.changed(coll);
      return rec;
    },
    patch: function (coll, id, fields) {
      var cur = Store.get(coll, id) || { id: id };
      return Store.put(coll, Object.assign({}, cur, fields));
    },
    remove: function (coll, id) {
      var cur = Store.state.colls[coll][id];
      if (!cur) return;
      Store.state.colls[coll][id] = { id: id, _deleted: true, updatedAt: Date.now() };
      Store.changed(coll);
    },
    /** Used by sync + import: take a record exactly as given (keeps its updatedAt). */
    merge: function (coll, rec) {
      if (!Store.state.colls[coll] || !rec || !rec.id) return false;
      var cur = Store.state.colls[coll][rec.id];
      if (cur && (cur.updatedAt || 0) >= (rec.updatedAt || 0)) return false;
      Store.state.colls[coll][rec.id] = rec;
      return true;
    },
    changedSince: function (ts) {
      var out = {};
      COLLS.forEach(function (c) {
        var m = Store.state.colls[c], list = [];
        for (var k in m) if ((m[k].updatedAt || 0) > ts) list.push(m[k]);
        if (list.length) out[c] = list;
      });
      return out;
    },
    pendingCount: function () {
      var ts = Store.state.meta.lastPushAt || 0, n = 0;
      COLLS.forEach(function (c) { var m = Store.state.colls[c]; for (var k in m) if ((m[k].updatedAt || 0) > ts) n++; });
      return n;
    },

    changed: function (coll) {
      Store.save();
      Store.emit("change", coll);
    },
    save: A.debounce(function () { Store.flush(); }, 250),
    flush: function () {
      var snapshot = Store.state;
      if (Store.backend === "IndexedDB") {
        return tx("kv", "readwrite", function (s) { return s.put(snapshot, STATE_KEY); }).catch(function (e) {
          console.error("[store] save failed", e);
          if (A.UI) A.UI.toast("Could not save to this device: storage may be full", "bad");
        });
      }
      try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot)); } catch (e) { console.error(e); }
      return Promise.resolve();
    },

    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit: function (ev, data) { (listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); },

    /* ----- backup / restore (moving data by USB stick, email, shared folder) */
    exportAll: function (includeFiles) {
      var out = { app: "school-classroom", exportedAt: Date.now(), state: Store.state, files: [] };
      if (!includeFiles) return Promise.resolve(out);
      return Files.all().then(function (files) {
        return Promise.all(files.map(function (f) {
          return A.readDataURL(f.blob).then(function (d) { return { id: f.id, name: f.name, type: f.type, size: f.size, createdAt: f.createdAt, data: d }; });
        })).then(function (list) { out.files = list; return out; });
      });
    },
    importAll: function (data, mode) {
      if (!data || data.app !== "school-classroom" || !data.state) throw new Error("This is not a School Classroom backup file.");
      if (mode === "replace") {
        Store.state = data.state;
        COLLS.forEach(function (c) { if (!Store.state.colls[c]) Store.state.colls[c] = {}; });
        Store.state.version = VERSION;
      }
      else {
        COLLS.forEach(function (c) {
          var m = (data.state.colls && data.state.colls[c]) || {};
          for (var k in m) Store.merge(c, m[k]);
        });
      }
      var jobs = (data.files || []).map(function (f) {
        return fetch(f.data).then(function (r) { return r.blob(); }).then(function (blob) {
          return Files.put({ id: f.id, name: f.name, type: f.type, size: f.size, createdAt: f.createdAt, blob: blob, uploaded: false });
        });
      });
      return Promise.all(jobs).then(function () { return Store.flush(); }).then(function () { Store.emit("change", "*"); });
    },
    /** Online: someone else signed in on this device, so start from an empty copy and pull theirs. */
    wipe: function () {
      var deviceId = Store.state.meta.deviceId;
      Store.state = Store.empty();
      Store.state.meta.deviceId = deviceId;
      Store.state.meta.seededAt = Date.now();
      return Store.flush();
    },
    reset: function () {
      var branding = Store.state.colls.settings.branding;
      Store.state = Store.empty();
      Store.state.meta.deviceId = A.uid("dev");
      if (branding) Store.state.colls.settings.branding = branding;
      return Promise.resolve(A.Seed ? A.Seed.run(Store) : null).then(function () {
        Store.state.meta.seededAt = Date.now();
        return Store.flush();
      }).then(function () { Store.emit("change", "*"); });
    },
    /** Wipe the demo but keep branding and the signed-in admin, ready for a real school. */
    startEmpty: function (keepUser) {
      var branding = Store.state.colls.settings.branding;
      Store.state = Store.empty();
      Store.state.meta.deviceId = A.uid("dev");
      Store.state.meta.seededAt = Date.now();
      if (branding) Store.state.colls.settings.branding = branding;
      if (keepUser) Store.state.colls.users[keepUser.id] = Object.assign({}, keepUser, { updatedAt: Date.now() });
      return Files.all().then(function (files) {
        return Promise.all(files.map(function (f) { return Files.remove(f.id); }));
      }).catch(function () { /* ignore */ }).then(function () { return Store.flush(); }).then(function () { Store.emit("change", "*"); });
    },
  });
})(window.App);
