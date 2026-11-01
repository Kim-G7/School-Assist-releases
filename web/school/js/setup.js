/* A school's identity, its set-up, and getting every other device to it.
 *
 *  - Every school has an id: the settings record "school" { schoolId, name, abbr }. The computer the school
 *    is set up on makes it; every other device gets it from the school hub.
 *  - A new install opens on the set-up page, a full page of its own (not the sign-in screen):
 *      1. the school: name, short name, abbreviation (student numbers, staff codes), motto, logo (also the
 *         app's icon), colours (or School Assist blue), vision, mission and aims
 *      2. the person in charge (the head, or the ICT or computer teacher): name, title, PIN; in School Assist
 *         Teacher also their class
 *      3. the School Assist key (or later)
 *      4. on the desktop app: make this computer the school hub
 *      5. share the app: on a flash drive, or as the school's own installer from Golden Technologies for the
 *         school website or a download link. Those copies carry the school file (electron/pack.cjs), so they
 *         open on the school's sign-in page and join the hub by themselves.
 *  - A device with the school file, or a tablet that opened the hub's address, goes straight to "Connecting to
 *    <school>" and then the school's sign-in page: no set-up, no "join".
 *  - If the hub's address changes (a new address on the school Wi-Fi), devices look for their school's hub on
 *    the network by themselves (Id.findHub); the address can also be typed on the "Connecting" page.
 *  - A device with no school never sends anything to a hub; the first time it reaches its school's hub it joins:
 *    its own copy is replaced by the school's (js/sync.js → SchoolId.adopt). A hub belongs to one school and turns
 *    other schools' devices away (server.cjs).
 *  - The demo school is only for trying the app: "Open the demo school" on the set-up page.
 *  - The app for every school (1.7, schoolassistapp.com, multi-hub.cjs): a device with no school first chooses: join
 *    its school (the link or QR code the school shares, https://<host>/join/<code>, or the school's code) or set a new
 *    school up (its School Assist key first, then the school and the person in charge). The school's hub is at
 *    /s/<code>/ on the same address; the school's key, or the school a link points to, decides the edition, and the
 *    app opens again as that edition when it isn't it already.
 * Home (home study) syncs online instead and has none of this. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var DEMO_MARKERS = [["users", "t_ncube"], ["classes", "c_4a_maths"]]; // records only the demo school has

  function hash(s) { var h = 5381; s = String(s || ""); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function newId() { return "sch_" + A.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function meta() { return A.Store.state.meta; }
  var desk = function () { return window.desktop || null; };

  var Id = (A.SchoolId = { newId: newId });
  Id.applies = function () { return A.edition !== "home"; };
  Id.record = function () { return A.Store && A.Store.state ? S().get("settings", "school") : null; };
  /** This device's school id, or null (the demo, or not set up yet). */
  Id.id = function () { var r = Id.record(); return r ? r.schoolId : null; };
  Id.isDemo = function () { return !!(A.Store.state && meta().demo); };
  /** The abbreviation that starts student numbers and staff codes (KHS). */
  Id.abbr = function () {
    var r = Id.record();
    return (A.Licence && A.Licence.abbr()) || (r && r.abbr) || M.schoolAbbr(A.Theme.get().name);
  };

  /** After loading: tell the demo apart, and give a school set up before school ids existed its id. */
  Id.migrate = function () {
    if (!Id.applies() || !A.Store.state || Id.record()) return;
    var m = meta();
    if (m.demo == null && DEMO_MARKERS.some(function (x) { return S().get(x[0], x[1]); })) { m.demo = true; S().flush(); return; }
    if (m.demo) return;
    if (!S().filter("users", function (u) { return u.role === "teacher"; }).length) return; // nothing set up yet
    var name = A.Theme.get().name; // the same on every device of that school, so they keep syncing together
    S().put("settings", { id: "school", schoolId: "sch_" + hash(name), name: name, abbr: M.schoolAbbr(name), from: "before school ids" });
  };

  /** At start: a desktop copy that came with the school file (and has no school yet) is that school's. */
  var linkSid = "";
  Id.boot = function () {
    // the app for every school, opened from a school's link (/?school=ecs, which /join/ecs leads to)
    if (A.multiHost && A.Store.state && !Id.id() && !Id.isDemo()) {
      linkSid = schoolCode(location.search);
      if (linkSid) try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* old browser */ }
    }
    var d = desk();
    if (!Id.applies() || Id.id() || Id.isDemo() || meta().pack || !d || !d.pack) return Promise.resolve();
    return d.pack.read().then(function (p) { if (p && editionOk(p)) return Id.provision(p); }).catch(function () {});
  };
  function editionOk(p) { return (p.edition || "school") === (A.edition === "teacher" ? "teacher" : "school"); }
  /** Take the school file: the school's look straight away, and its hub's addresses to join. */
  Id.provision = function (p) {
    var s = p.school || {};
    meta().pack = { schoolId: s.schoolId, name: s.name, urls: (p.hub && p.hub.urls) || [], logo: s.logo || "", join: (p.hub && p.hub.join) || "" };
    A.Store.state.colls.settings.branding = { id: "branding", name: s.name, shortName: s.shortName || s.name, motto: s.motto || "", vision: s.vision || "",
      mission: s.mission || "", aims: s.aims || "", logo: s.logo || "", primary: s.primary, secondary: s.secondary, updatedAt: 1 };
    A.Theme.apply();
    return S().flush();
  };

  /** "Set up a new school" on this device: an empty school with its first admin. Resolves with the admin. */
  Id.create = function (o) {
    var old = S().get("settings", "branding") || {}, was = meta();
    var keep = { deviceId: was.deviceId, hubKey: was.hubKey, multi: was.multi };
    return S().startEmpty(null).then(function () {
      meta().demo = false;
      if (A.multiHost && keep.multi) { Object.assign(meta(), keep); meta().multi = Object.assign({}, keep.multi, { setup: false, key: undefined }); } // (the key is in the school's settings now)
      if (A.Primary) A.Primary.seed(A.Store); // learning areas, grades, terms (the School edition's staff pages too, since 2026-10-28)
      S().put("settings", Object.assign({}, old, { id: "branding", name: o.name, shortName: o.shortName || o.name, motto: o.motto || "",
        vision: o.vision || "", mission: o.mission || "", aims: o.aims || "", logo: o.logo || old.logo || "" },
        o.primary ? { primary: o.primary, secondary: o.secondary || o.primary } : {}));
      var admin = S().put("users", { id: A.uid("t"), role: "teacher", isAdmin: true, staffNo: o.abbr + "-AD1", name: o.admin, title: o.title || "Admin", pw: o.pw || undefined,
        subjects: A.edition === "teacher" ? (o.cls ? "Class teacher" : "") : "All subjects" });
      M.setPin(admin.id, o.pin, admin.id);
      S().put("settings", { id: "school", schoolId: newId(), name: o.name, abbr: o.abbr, createdBy: admin.id, code: A.multiHost && keep.multi ? keep.multi.sid : undefined });
      S().put("settings", { id: "staffcodes", prefix: o.abbr, admin: M.makeStaffCode(o.abbr), teacher: M.makeStaffCode(o.abbr), madeAt: A.now() });
      if (o.key) {
        S().put("settings", { id: "licence", key: o.key, appliedAt: A.now(), appliedBy: admin.id });
        if (A.Licence) S().put("settings", { id: "features", seen: A.Licence.FEATURES.filter(function (f) { return f.built; }).map(function (f) { return f.id; }) });
      }
      if (A.Primary) A.Primary.applySystem(o.system || (A.Primary.withStudents ? "form" : "ecdgrade")); // ECD and Grades, Grades, ECD, or Forms
      if (A.Primary && o.cls) A.Primary.setupClass(admin, o.cls.level, o.cls.stream, o.cls.sample);
      return S().flush().then(function () { return admin; });
    });
  };

  /** Join the hub's school: this device's own copy is replaced by the school's records. */
  Id.adopt = function (res, startedAt) {
    var m = meta();
    if (m.pack && res.school.id !== m.pack.schoolId) return Promise.reject(new Error("This hub belongs to " + (res.school.name || "another school") + ", not " + m.pack.name + "."));
    // what this device keeps: its id, its key to the hub (1.6) and the school file (its join secret, to join again)
    var deviceId = m.deviceId, hubKey = m.hubKey || null, pack = m.pack || null, multi = m.multi || null;
    if (M.me()) M.signOut();
    if (A.LastUser) A.LastUser.forget(); // that was someone in the demo school
    A.Store.state = A.Store.empty();
    m = meta();
    m.deviceId = deviceId; m.seededAt = A.now(); m.demo = false; m.joinedAt = A.now();
    if (hubKey) m.hubKey = hubKey;
    if (pack) m.pack = pack;
    if (multi) m.multi = multi;
    var n = 0;
    Object.keys(res.changes || {}).forEach(function (c) { (res.changes[c] || []).forEach(function (r) { if (S().merge(c, r)) n++; }); });
    if (!Id.record()) A.Store.state.colls.settings.school = { id: "school", schoolId: res.school.id, name: res.school.name || "", updatedAt: 1 };
    m.serverSince = res.now; m.lastPushAt = startedAt; m.lastSyncAt = A.now();
    var files = A.Files && A.Files.all ? A.Files.all().then(function (fs) { return Promise.all(fs.map(function (f) { return A.Files.remove(f.id); })); }).catch(function () {}) : Promise.resolve();
    return files.then(function () { return S().flush(); }).then(function () { S().emit("change", "*"); return n; });
  };

  /* ------------------------------------------------------------------ which page */
  var notHub = false; // opened from a website that isn't a school hub (a hosted demo): the set-up page
  function servedByHub() { return /^https?:$/.test(location.protocol) && !A.staticHost() && !notHub; }
  /** "ready" (its school, or the demo: the sign-in page), "connect" (on its way to its school's hub), "wizard" (set-up). */
  Id.stage = function (me) {
    if (!Id.applies() || !A.Store.state) return "ready";
    var m = meta();
    if (m.setupStep && Id.id()) return me && me.isAdmin ? "wizard" : "ready";
    if (Id.id() || Id.isDemo()) return "ready";
    // the app for every school: choose first; then joining (connect) or setting it up (wizard)
    if (A.multiHost && !m.pack) return m.multi && m.multi.sid ? (m.multi.setup ? "wizard" : "connect") : "choose";
    if (m.pack || servedByHub()) return "connect";
    return "wizard";
  };
  Id.page = function (stage) {
    document.title = (stage === "connect" && ((meta().pack && meta().pack.name) || C.name)) || "School Assist";
    return '<div class="setup-page"><header class="setup-top"><img src="' + esc((meta().pack && meta().pack.logo) || "assets/icon.svg") + '" alt="" class="setup-mark" data-school-icon><div><b>School Assist</b><span>by ' + esc((CFG.company && CFG.company.name) || "Golden Technologies") + "</span></div></header>" +
      '<main class="setup-main">' + (stage === "choose" ? chooseHtml() : stage === "connect" ? connectHtml() : wizardHtml()) + "</main></div>";
  };
  Id.mount = function (stage) {
    // a device waiting to join a school's hub: the school's icon (the hub serves it to anyone, for home screens) in place
    // of School Assist's, when the hub has one
    if (stage === "connect" && servedByHub() && !(meta().pack && meta().pack.logo)) {
      var im = new Image();
      im.onload = function () { document.querySelectorAll("img[data-school-icon]").forEach(function (x) { x.src = im.src; }); };
      im.src = (A.multiHost && meta().multi ? schoolHub() : "") + "/school-icon.png";
    }
    if (stage === "choose" && linkSid) { var sid = linkSid; linkSid = ""; joinSchool(sid); }
    if (stage === "connect" && !C.busy && !C.timer && !C.waiting) Id.connect(); // (not while the code waits for an admin)
    if (stage === "wizard" && W.step === "hub") hubStatus();
    if (stage === "wizard" && W.step === "restore" && A.Backup) A.Backup.mountRestore();
    if (stage === "wizard" && A.Backup) A.Backup.revokedNote(); // this computer was a hub that Golden Technologies signed out
  };
  function redraw() { A.render(); window.scrollTo(0, 0); }

  /* ------------------------------------------------------------------ connecting to the school's hub */
  var C = { busy: false, error: "", name: "", timer: null };
  function ping(url, ms) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 5000);
    return fetch(String(url).replace(/\/+$/, "") + "/api/ping", ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(t);
        // the school moved its records to its own server (1.7): this device goes there
        if (j && j.moved && !ms && A.Sync.follow(j)) return ping(j.moved, 5000);
        // the school's records are on its hub computer, off just now (1.8, hub-relay.cjs): School Assist says so
        if (j && j.hubOffline) throw new Error(j.error || "The school's hub computer isn't online just now. Try again later.");
        if (!j || j.app !== "school-assist") throw new Error("not a hub");
        j.reached = String(url).replace(/\/+$/, ""); // (the address that answered)
        return j;
      }, function (e) { clearTimeout(t); throw e; });
  }
  /** Look for this school's hub on the network: every address of the local networks the known addresses are on
      (192.168.1.1 … .254), on the hub's port. Resolves with its address, or null. Takes up to about 20 seconds. */
  Id.findHub = function (schoolId, hints) {
    // the desktop app searches from its main process (electron/hubfind.cjs): a page can't open hundreds of connections at once
    var d = desk();
    if (d && d.hub && d.hub.find) return d.hub.find(schoolId, hints || []).catch(function () { return null; });
    var seen = {}, targets = [];
    var add = function (u) { if (!seen[u]) { seen[u] = 1; targets.push(u); } };
    (hints || []).forEach(function (h) { add(String(h).replace(/\/+$/, "")); });
    (hints || []).forEach(function (h) {
      var m = /^(https?:)\/\/(\d+)\.(\d+)\.(\d+)\.(\d+)(?::(\d+))?/.exec(String(h));
      if (!m || m[2] === "127") return;
      for (var i = 1; i < 255; i++) add(m[1] + "//" + m[2] + "." + m[3] + "." + m[4] + "." + i + ":" + (m[6] || "80"));
    });
    return new Promise(function (resolve) {
      var next = 0, busy = 0, done = false;
      var pump = function () {
        if (done) return;
        if (next >= targets.length && !busy) { done = true; resolve(null); return; }
        while (busy < 24 && next < targets.length) (function (u) {
          busy++;
          ping(u, 1500).then(function (j) { if (!done && j.school && j.school.id === schoolId) { done = true; resolve(u); } }, function () {})
            .then(function () { busy--; pump(); });
        })(targets[next++]);
      };
      pump();
    });
  };
  /** A device of a school whose hub stopped answering: after a few tries, look for it at a new address. */
  var lost = { n: 0, at: 0, busy: false };
  Id.lostHub = function (url) {
    var id = Id.id();
    if (!id || lost.busy || !url || /localhost|127\.0\.0\.1/.test(url) || ++lost.n < 3 || A.now() - lost.at < 10 * 60000) return;
    lost.busy = true; lost.at = A.now();
    Id.findHub(id, [url]).then(function (found) {
      lost.busy = false;
      if (!found || found === url) return;
      lost.n = 0;
      A.Sync.setConfig({ url: found, auto: true });
      UI.toast("Found the school hub at its new address, " + found.replace(/^https?:\/\//, ""));
      A.Sync.maybe();
    });
  };
  Id.hubOk = function () { lost.n = 0; };

  function connectHtml() {
    var p = meta().pack || {}, name = p.name || C.name;
    var logo = p.logo ? '<div class="logo"><img src="' + esc(p.logo) + '" alt=""></div>' : '<div class="logo"><img src="assets/icon.svg" alt="" data-school-icon></div>';
    return '<div class="setup-card setup-connect">' + logo + "<h1>" + esc(name || "Your school") + "</h1>" +
      (C.pendingCode ? '<p class="mt">This ' + thisDevice() + ' is waiting to join the school hub. Show an admin this code:</p><p class="join-code">' + esc(C.pendingCode) + '</p><p class="small muted">The admin lets it in under Settings → Devices. This page carries on by itself.</p><div class="setup-spin" aria-hidden="true"></div>' +
          // a teacher or admin needn't wait: the school's staff code lets this device in at once
          '<form data-submit="su-join-code" class="mt-lg" style="text-align:left"><label class="field"><span>Staff? Type the school\'s staff code instead</span><input class="input" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. ' + esc((name && M.schoolAbbr(name)) || "ABC") + '-4K7-9QP"></label><button class="btn" type="submit">' + I("key") + "Let this device in</button></form>"
        : C.error ? '<div class="callout warn mt" style="text-align:left">' + I("wifiOff") + "<div>" + esc(C.error) + "</div></div>" +
        '<button class="btn btn-primary btn-lg mt" data-act="su-connect">' + I("refresh") + "Try again</button>" +
        (meta().pack ? '<form data-submit="su-connect-at" class="mt-lg" style="text-align:left"><label class="field"><span>Or type the hub\'s address</span><input class="input" name="url" placeholder="e.g. 192.168.1.20:8080" autocomplete="off" spellcheck="false">' +
          '<span class="hint">It is on the hub computer, in Settings → Offline &amp; sync.</span></label><button class="btn" type="submit">' + I("wifi") + "Connect</button></form>" : "")
        : '<p class="muted mt">' + (C.searching ? "Looking for the school hub on the network…" : "Connecting to the school hub…") + '</p><div class="setup-spin" aria-hidden="true"></div>') +
      (A.multiHost && meta().multi ? '<p class="small mt"><button class="link" data-act="su-other-school">Not your school? Choose another</button></p>' : "") +
      '<p class="tiny muted mt-lg">This copy of School Assist is set up for ' + esc(name || "your school") + (location.protocol === "https:" ? ". It joins the school's online hub over the internet; then teachers and students sign in." // the cloud hub; a school's own hub is http on the Wi-Fi
        : ". It joins the school hub over the school Wi-Fi; then teachers and students sign in.") + "</p></div>";
  }
  /** Find the school's hub (the school file's addresses, or the hub this page came from) and join it. */
  Id.connect = function () {
    if (C.busy) return;
    clearTimeout(C.timer); C.timer = null; C.busy = true; C.error = "";
    var m = meta(), urls = m.pack ? (m.pack.urls || []) : [A.multiHost && m.multi ? schoolHub() : location.origin];
    var tryOne = function (i) {
      if (i >= urls.length) return Promise.reject(new Error(m.pack ? "The school hub isn't answering. Connect this computer to the school Wi-Fi (the hub computer must be on), then try again." : "nohub"));
      return ping(urls[i]).then(function (j) {
        if (!j.school) throw new Error("The school isn't set up on the hub computer yet.");
        if (m.pack && j.school.id !== m.pack.schoolId) throw new Error("The hub at " + urls[i] + " belongs to " + j.school.name + ", not " + m.pack.name + ".");
        C.name = j.school.name;
        A.Sync.setConfig({ url: j.reached || urls[i], auto: true });
        return A.Sync.syncNow();
      }, function () { return tryOne(i + 1); });
    };
    var search = function (e) {
      // the hub's address may have changed: look for this school's hub on the same network
      // (at most every 5 minutes on its own, so a laptop away from school doesn't keep searching; at once on "Try again")
      if (!m.pack || e.message.indexOf("isn't answering") < 0 || !urls.length || (!C.manual && A.now() - (C.searchedAt || 0) < 300000)) throw e;
      C.searching = true; C.manual = false; C.searchedAt = A.now(); redraw();
      return Id.findHub(m.pack.schoolId, urls).then(function (found) {
        C.searching = false;
        if (!found) throw e;
        m.pack.urls = [found].concat(urls.filter(function (u) { return u !== found; }));
        A.Sync.setConfig({ url: found, auto: true });
        return A.Sync.syncNow();
      });
    };
    tryOne(0).catch(search).then(function () {
      C.busy = false;
      if (!Id.id()) throw new Error("The hub didn't send the school's records. Try again.");
      A.Theme.apply(); redraw();
    }).catch(function (e) {
      C.busy = false; C.searching = false;
      if (e.message === "nohub") { notHub = true; redraw(); return; } // a website that isn't a hub: set up instead
      // waiting for an admin to let it in: show the code once, then wait quietly for the admin's answer
      C.pendingCode = e.code === "pending" ? (A.Sync.joinState().code || "") : "";
      C.error = e.message || String(e);
      redraw();
      if (C.pendingCode) return waitForApproval(A.now());
      C.timer = setTimeout(function () { C.timer = null; if (Id.stage(M.me()) === "connect") Id.connect(); }, 20000);
    });
  };
  /** The code is on the page: ask the hub, without redrawing, whether the admin has decided (every 10 seconds for the
   *  first two minutes, then every 30). Let in: carry on (Id.connect fetches the school). Turned away: say so. */
  /** What a person calls the device in their hand. */
  function thisDevice() { var ua = navigator.userAgent || ""; return /iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /iPhone|Android|Mobile/i.test(ua) ? "phone" : "computer"; }
  function waitForApproval(started) {
    clearTimeout(C.timer);
    C.waiting = true; // the page is not redrawn into a new attempt meanwhile (see the stage check above)
    C.timer = setTimeout(function () {
      C.timer = null;
      if (Id.stage(M.me()) !== "connect" || !C.pendingCode) { C.waiting = false; return; }
      A.Sync.joinCheck().then(function (r) {
        if (r.key) { C.pendingCode = ""; C.waiting = false; return Id.connect(); }
        if (r.code && r.code !== C.pendingCode) { C.pendingCode = r.code; redraw(); } // the old request ran out: a new code
        waitForApproval(started);
      }, function (e) {
        if (e.code === "declined" || e.code === "refused") { C.pendingCode = ""; C.waiting = false; C.error = e.message || String(e); redraw(); return; }
        waitForApproval(started); // no network for a moment: keep waiting
      });
    }, A.now() - started < 120000 ? 10000 : 30000);
  }
  A.act["su-connect"] = function () { C.manual = true; Id.connect(); redraw(); };
  /** A staff code typed while waiting to be let in: the hub lets this device in, and it carries on. */
  A.act["su-join-code"] = function (form) {
    var code = String(form.code.value || "").trim();
    if (!code) return;
    A.Sync.joinWithCode(code).then(function (r) {
      if (!r || !r.key) throw new Error("That staff code isn't right.");
      clearTimeout(C.timer); C.timer = null; C.pendingCode = ""; C.waiting = false; C.error = "";
      Id.connect(); redraw();
    }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
  };
  A.act["su-other-school"] = function () {
    var m = meta(); clearTimeout(C.timer);
    m.multi = null; m.hubKey = null; m.joinCode = null;
    C = { busy: false, error: "", name: "", timer: null }; Ch.msg = "";
    A.Sync.setConfig({ url: "", auto: true });
    S().flush().then(redraw);
  };
  /** The hub's address typed on the "Connecting" page: tried first from now on. */
  A.act["su-connect-at"] = function (form) {
    var url = hubUrl(form.url.value), m = meta();
    if (!url || !m.pack) return;
    m.pack.urls = [url].concat((m.pack.urls || []).filter(function (u) { return u !== url; }));
    S().flush();
    C.manual = true; Id.connect(); redraw();
  };

  /* ------------------------------------------------------------------ the app for every school: join or set up */
  var Ch = { msg: "", typed: "", busy: false, view: "join" };
  /** The chosen school's hub on this address ("/s/ecs"), or "" (a school on a server of its own, or none chosen yet). */
  function hubBase() { var m = A.Store && A.Store.state ? meta() : null; return A.multiHost && m && m.multi && m.multi.sid && !m.multi.hub ? "/s/" + m.multi.sid : ""; }
  Id.hubBase = hubBase;
  /** The chosen school's hub: here (/s/<code>) or the school's own server. */
  function schoolHub() { var m = meta(); return m.multi && m.multi.hub ? m.multi.hub : location.origin + hubBase(); }
  /** A server address as typed: "school.example.org" → "https://school.example.org". */
  function serverUrl(v) {
    v = String(v || "").trim().replace(/\/+$/, "");
    if (!v) return "";
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    return /^https:\/\/[\w.-]+(:\d+)?$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(v) ? v : "";
  }
  /** A school's code from what was typed or scanned: its link (…/join/ecs, …?school=ecs, …/s/ecs) or the code itself. */
  function schoolCode(v) {
    v = String(v || "").trim().toLowerCase();
    var m = /[?&]school=([a-z0-9-]{2,40})/.exec(v) || /\/(?:join|s)\/([a-z0-9-]{2,40})/.exec(v);
    if (m) return m[1];
    return /^[a-z0-9][a-z0-9-]{1,39}$/.test(v) ? v : "";
  }
  Id.schoolCode = schoolCode;
  /** The school's edition: when this app is the other one it opens again as the school's (the edition is read as the
      page loads, js/util.js). True when it is reloading. */
  function asEdition(ed) {
    if (ed !== "teacher" && ed !== "school") return false; // a school whose key can't be read: as it is
    var want = ed, now = A.edition === "teacher" ? "teacher" : "school";
    try { localStorage.setItem("sca-edition", want); } catch (e) { /* private mode: this page only */ }
    if (want === now) return false;
    location.reload();
    return true;
  }
  /** Join the school with this code: where it is (here, or its own server: the host's directory), then this device
      connects to it (and waits to be let in, or a teacher types the staff code). */
  function joinSchool(sid) {
    Ch.msg = ""; Ch.busy = true; redraw();
    var where = null;
    return fetch(location.origin + "/api/schools/" + sid).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "There is no school with the code " + sid + "."); return j; });
    }).then(function (w) { where = w; return ping(w.hub || location.origin + "/s/" + sid); }).then(function (j) {
      if (!j.school) throw new Error("That school isn't set up yet. Ask its head or ICT teacher.");
      var m = meta(), url = where.hub || location.origin + "/s/" + sid;
      m.multi = { sid: sid, name: j.school.name, hub: where.hub || undefined, relay: where.relay ? true : undefined }; m.hubKey = null; m.joinCode = null;
      C = { busy: false, error: "", name: j.school.name, timer: null };
      A.Sync.setConfig({ url: url, auto: true });
      return S().flush().then(function () { Ch.busy = false; if (!asEdition(j.edition || where.edition)) redraw(); });
    }).catch(function (e) {
      Ch.busy = false;
      Ch.msg = /not a hub|fetch|abort|json/i.test((e && e.message) || "") ? (where && where.hub ? "The school's server isn't answering. Try again in a while, or tell the school." : "There is no school with the code " + sid + ". Check the code with the school.") : (e && e.message) || String(e);
      redraw();
    });
  }
  Id.joinSchool = joinSchool;
  function chooseHtml() {
    if (Ch.view === "setup") return setupHtml();
    var scan = window.BarcodeDetector && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    return '<div class="setup-card setup-join"><div class="logo"><img src="assets/icon.svg" alt=""></div><h1>Join your school</h1>' +
      '<p class="muted">Type the code your school gave you, or open the link it sent. On a phone, scan the school\'s QR code with the camera.</p>' +
      (Ch.msg ? '<p class="form-msg mt" role="alert">' + I("alert") + esc(Ch.msg) + "</p>" : "") +
      '<form data-submit="su-join-school" class="mt"><label class="field"><span>School code</span><input class="input input-lg" name="school" value="' + esc(Ch.typed) + '" placeholder="Enter the school code" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="go"></label>' +
      '<button class="btn btn-primary btn-lg btn-block mt" type="submit"' + (Ch.busy ? " disabled" : "") + ">" + I("right") + (Ch.busy ? "Looking for it…" : "Join") + "</button>" +
      (scan ? '<button type="button" class="btn btn-lg btn-block mt-sm" data-act="su-scan">' + I("image") + "Scan the QR code</button>" : "") + "</form></div>" +
      '<p class="setup-links">Setting up a new school? <button class="link" data-act="su-view" data-v="setup">Set up a school</button></p>';
  }
  /** Setting a school up: the school's key from Golden Technologies; and, for a school with a server of its own, its
      address (the school's records stay there; School Assist keeps only where it is). */
  function setupHtml() {
    return '<div class="setup-card"><h1>Set up a school</h1><p class="muted">For the head or the ICT teacher, once. Golden Technologies gives every school a key: it sets the school up as School Assist or School Assist Teacher, on its plan.</p>' +
      (Ch.msg ? '<p class="form-msg mt" role="alert">' + I("alert") + esc(Ch.msg) + "</p>" : "") +
      '<form data-submit="su-setup-key" class="mt"><label class="field"><span>The school\'s key</span><textarea class="input" name="key" rows="3" spellcheck="false" autocomplete="off" placeholder="SA1.…" style="font-family:monospace;font-size:12px">' + esc(Ch.key || "") + "</textarea></label>" +
      '<label class="btn mt-sm">' + I("upload") + 'Open the key file<input type="file" accept=".txt,.sakey,text/plain" data-change="su-keyfile-first" hidden></label>' +
      '<details class="mt"' + (Ch.server ? " open" : "") + '><summary class="small"><b>The school has a server of its own</b> <span class="muted">(optional)</span></summary>' +
      '<label class="field mt-sm"><span>The school\'s server</span><input class="input" name="server" value="' + esc(Ch.server || "") + '" placeholder="e.g. https://kopje-school-assist.fly.dev" autocomplete="off" autocapitalize="none" spellcheck="false">' +
      '<span class="hint">Set up with Golden Technologies in the school\'s own account. The school\'s records are kept there; School Assist keeps only its code and this address. Leave it empty to keep them on School Assist\'s servers.</span></label></details>' +
      '<div class="setup-actions"><button type="button" class="btn btn-lg" data-act="su-view" data-v="join">' + I("back") + 'Back</button><button class="btn btn-primary btn-lg" type="submit">' + I("check") + "Set up the school</button></div></form></div>";
  }
  A.act["su-view"] = function (el) { Ch.view = el.getAttribute("data-v") === "setup" ? "setup" : "join"; Ch.msg = ""; redraw(); };
  A.act["su-join-school"] = function (form) {
    Ch.typed = form.school.value;
    var sid = schoolCode(Ch.typed);
    if (!sid) { Ch.msg = "Type the school's code (letters and numbers), as the school gave it."; return redraw(); }
    joinSchool(sid);
  };
  A.act["su-keyfile-first"] = function (el) {
    var f = el.files && el.files[0];
    if (f) A.readText(f).then(function (t) { Ch.key = String(t || "").trim(); redraw(); });
  };
  /** The school's key first: Golden Technologies signed it for this school; the hub gives the school its place and
      this device its first admin's key; then the school's details and the person in charge (the wizard). */
  A.act["su-setup-key"] = function (form) {
    var key = String(form.key.value || "").replace(/\s+/g, ""), lic = A.Licence ? A.Licence.readAny(key) : { ok: false, error: "This device can't check keys." };
    Ch.key = key; Ch.msg = "";
    if (!key) { Ch.msg = "Paste the school's key from Golden Technologies."; return redraw(); }
    if (!lic.ok) { Ch.msg = lic.error; return redraw(); }
    if (lic.renewal) { Ch.msg = "That is a renewal code. Enter the school's key (it starts SA1.)."; return redraw(); }
    if (lic.master) { Ch.msg = "A temporary master key can't set up a school. Use the school's own key."; return redraw(); }
    var own = String(form.server && form.server.value || "").trim(), hub = own ? serverUrl(own) : "";
    Ch.server = own;
    if (own && !hub) { Ch.msg = "Type the school's server address as it was given, starting https://"; return redraw(); }
    var dev = A.Devices && A.Devices.detect ? A.Devices.detect() : {};
    var me = JSON.stringify({ key: key, deviceId: A.Devices ? A.Devices.id() : meta().deviceId, label: [dev.model, dev.os, dev.browser].filter(Boolean).join(" · ") || "A device" });
    var post = function (url, body) {
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "School Assist replied " + r.status + "."); return j; }); });
    };
    // the school's own server: this device becomes its first admin's there, and School Assist notes where it is
    var go = hub ? post(hub + "/api/claim", me).then(function (j) {
      return post(location.origin + "/api/schools/register", JSON.stringify({ key: key, hub: hub })).then(function () { return Object.assign(j, { url: hub }); });
    }) : post(location.origin + "/api/schools/setup", me).then(function (j) { return Object.assign(j, { url: location.origin + j.base }); });
    go.then(function (j) {
      var m = meta();
      m.multi = { sid: j.sid, setup: true, key: key, name: j.name, hub: hub || undefined }; m.hubKey = j.key; m.joinCode = null;
      A.Sync.setConfig({ url: j.url, auto: true });
      W = { step: "school", d: {}, msg: "" }; Ch.key = ""; Ch.server = ""; Ch.view = "join";
      return S().flush().then(function () { if (!asEdition(j.edition)) redraw(); });
    }).catch(function (e) { Ch.msg = /fetch/i.test(e.message || "") ? (hub ? "The school's server isn't answering at " + hub + ". Check the address." : "School Assist can't be reached. Check the internet and try again.") : e.message || String(e); redraw(); });
  };
  /** The school's QR code, read with this device's camera (where the browser can: Android's Chrome). */
  A.act["su-scan"] = function () {
    var stream = null, done = false, det;
    try { det = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { UI.toast("This browser can't read QR codes. Scan it with the camera app instead.", "bad"); return; }
    var md = UI.modal({ title: "Scan the school's QR code", size: "sm", body: '<video id="su-video" playsinline muted style="width:100%;border-radius:10px;background:#000;aspect-ratio:1;object-fit:cover"></video><p class="small muted mt-sm">Hold the code inside the picture.</p>',
      foot: [{ label: "Cancel" }], onClose: function () { done = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); },
      onMount: function (m) {
        var v = m.querySelector("#su-video");
        var look = function () {
          if (done) return;
          det.detect(v).then(function (codes) {
            var sid = codes && codes.length ? schoolCode(codes[0].rawValue) : "";
            if (sid) { md.close(); joinSchool(sid); return; }
            setTimeout(look, 300);
          }, function () { setTimeout(look, 500); });
        };
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (st) { stream = st; v.srcObject = st; return v.play(); }).then(look)
          .catch(function () { md.close(); UI.toast("The camera isn't available. Scan the code with the camera app, or type the school's code.", "bad"); });
      } });
  };
  /* ------------------------------------------------------------------ the set-up page */
  var W = { step: "school", d: { title: "Head" }, msg: "" };
  var multiSetup = function () { var m = meta(); return A.multiHost && !!(m.multi && m.multi.setup); };
  function steps() {
    if (multiSetup()) return [["school", "Your school"], ["person", "Person in charge"]]; // the key came first (chooseHtml)
    var list = [["school", "Your school"], ["person", "Person in charge"], ["key", "School Assist key"]];
    if (desk() && desk().hub) list.push(["hub", "School hub"]);
    // (no "Share the app" step for now: Golden Technologies brings School Assist on a flash drive, or the school uses it online)
    return list;
  }
  function field(label, name, val, extra, hint) {
    return '<label class="field' + (extra && extra.full ? " full" : "") + '"><span>' + label + "</span>" +
      (extra && extra.area ? '<textarea class="textarea" name="' + name + '" rows="' + (extra.rows || 2) + '" placeholder="' + esc(extra.ph || "") + '">' + esc(val || "") + "</textarea>"
        : '<input class="input" name="' + name + '" value="' + esc(val || "") + '"' + (extra && extra.attrs ? " " + extra.attrs : "") + ' placeholder="' + esc((extra && extra.ph) || "") + '">') +
      (hint ? '<span class="hint">' + hint + "</span>" : "") + "</label>";
  }
  function logoPreview() {
    var d = W.d, b = A.Theme.get();
    return d.logo ? '<img src="' + esc(d.logo) + '" alt="">' : A.Theme.crestSVG({ name: d.name || "Your School", shortName: d.short || "", primary: d.primary || b.primary, secondary: d.secondary || b.secondary });
  }
  /** The school's colours: School Assist blue (with white) unless the school picks its own. */
  var DEFAULT_PAIR = { name: "School Assist blue", primary: "", secondary: "" };
  function coloursHtml() {
    var d = W.d, cfg = CFG.colors || {}, base = { primary: cfg.primary || "#1D4E89", secondary: cfg.secondary || "#E8A317" };
    var cur = { primary: d.primary || base.primary, secondary: d.secondary || base.secondary };
    var list = [DEFAULT_PAIR].concat(A.Theme.presets.filter(function (p) { return p.primary.toLowerCase() !== base.primary.toLowerCase() || p.secondary.toLowerCase() !== base.secondary.toLowerCase(); }));
    var on = function (p) { return p === DEFAULT_PAIR ? !d.primary : (d.primary || "").toLowerCase() === p.primary.toLowerCase() && (d.secondary || "").toLowerCase() === p.secondary.toLowerCase(); };
    return '<div class="swatches mt-sm">' + list.map(function (p) {
      var pr = p.primary || base.primary, se = p.secondary || base.secondary;
      return '<button type="button" class="swatch' + (on(p) ? " on" : "") + '" data-act="su-colour" data-p="' + esc(p.primary) + '" data-s="' + esc(p.secondary) + '"><span class="pair"><i style="background:' + pr + '"></i><i style="background:' + se + '"></i></span>' + esc(p === DEFAULT_PAIR ? p.name + " (default)" : p.name) + "</button>";
    }).join("") + "</div>" +
      '<div class="row wrap mt-sm" style="gap:16px"><label class="row small" style="gap:8px">Main colour <input type="color" class="color-input" value="' + cur.primary + '" data-change="su-colour-own" data-k="primary" aria-label="Main colour"></label>' +
      '<label class="row small" style="gap:8px">Accent colour <input type="color" class="color-input" value="' + cur.secondary + '" data-change="su-colour-own" data-k="secondary" aria-label="Accent colour"></label>' +
      '<span class="setup-swatch-preview" style="background:' + cur.primary + ";color:" + A.Theme.readableOn(cur.primary) + '"><b>' + esc(d.short || d.name || "Your school") + '</b><i style="background:' + cur.secondary + '"></i></span></div>' +
      '<span class="hint">No school colours? Leave School Assist blue: blue with white text. You can change them later in Settings → School branding.</span>';
  }
  A.act["su-colour"] = function (el) { keepTyped(); W.d.primary = el.getAttribute("data-p") || ""; W.d.secondary = el.getAttribute("data-s") || ""; redraw(); };
  A.act["su-colour-own"] = function (el) {
    keepTyped();
    var cfg = CFG.colors || {};
    if (!W.d.primary) { W.d.primary = cfg.primary || "#1D4E89"; W.d.secondary = cfg.secondary || "#E8A317"; }
    W.d[el.getAttribute("data-k")] = el.value;
    redraw();
  };
  var STEP = {};
  STEP.school = function (msg) {
    var d = W.d, teacher = A.edition === "teacher";
    return "<h1>Set up your school</h1><p class=\"muted\">School Assist becomes your school's own app: its name, logo and motto on every screen, on the sign-in page and on the app's icon.</p>" +
      '<form data-submit="su-school" class="mt"><div class="setup-logo"><div class="logo" id="su-logo">' + logoPreview() + "</div><div>" +
      '<label class="btn">' + I("upload") + "Upload the school logo<input type=\"file\" accept=\"image/*\" data-change=\"su-logo\" hidden></label>" +
      (d.logo ? ' <button type="button" class="btn btn-ghost" data-act="su-logo-clear">Remove</button>' : "") +
      '<p class="tiny muted mt-sm">PNG or SVG, square, under 800 KB. It is also the app\'s icon on every computer. No logo? The app draws a crest from the school\'s initials.</p></div></div>' +
      '<div class="form-grid mt">' +
      field("School name", "name", d.name, { full: true, ph: teacher ? "e.g. Sunrise School" : "e.g. Kopje High School", attrs: 'autocomplete="organization"' }) +
      field("Short name", "short", d.short, { ph: teacher ? "e.g. Sunrise" : "e.g. Kopje High" }, "Used where space is tight.") +
      field("Abbreviation", "abbr", d.abbr, { ph: teacher ? "e.g. SPS" : "e.g. KHS", attrs: 'maxlength="6" autocapitalize="characters"' }, teacher
        ? "2 to 6 letters. Starts every ID: learners " + esc(d.abbr || "SPS") + "-GR4-001 (Grade 4) or " + esc(d.abbr || "SPS") + "-FM1-001 (Form 1), teachers " + esc(d.abbr || "SPS") + "-TC1, admins " + esc(d.abbr || "SPS") + "-AD1, and the staff codes."
        : "2 to 6 letters. Starts every ID: students " + esc(d.abbr || "KHS") + "-FM1-001 (Form 1, student 1), teachers " + esc(d.abbr || "KHS") + "-TC1, admins " + esc(d.abbr || "KHS") + "-AD1, and the staff codes.") +
      field("Motto", "motto", d.motto, { full: true, ph: "e.g. Knowledge is power" }) +
      '<div class="field full"><span class="label">School colours</span>' + coloursHtml() + "</div>" +
      field("Vision <span class=\"muted\">(optional)</span>", "vision", d.vision, { full: true, area: true, ph: "What the school wants to become" }) +
      field("Mission <span class=\"muted\">(optional)</span>", "mission", d.mission, { full: true, area: true, ph: "How it gets there" }) +
      field("Aims <span class=\"muted\">(optional, one per line)</span>", "aims", d.aims, { full: true, area: true, rows: 3, ph: "To ...\nTo ..." }) +
      "</div>" + msg + '<div class="setup-actions"><span></span><button class="btn btn-primary btn-lg" type="submit">Next' + I("right") + "</button></div></form>";
  };
  STEP.person = function (msg) {
    var d = W.d, teacher = !!A.Primary, school = teacher && A.Primary.withStudents, levels = (A.Primary && A.Primary.LEVELS) || [];
    return "<h1>The person in charge</h1><p class=\"muted\">The head, or the ICT or computer teacher. This is the first admin: they approve the teachers and students who register, and look after the app. Other teachers and admins register later with the staff codes.</p>" +
      '<form data-submit="su-person" class="mt"><div class="form-grid">' +
      field("Full name", "admin", d.admin, { ph: "e.g. Mr T. Chirwa", attrs: 'autocomplete="name"' }) +
      '<label class="field"><span>Role</span>' + A.UI.selectOther("title", A.ROLES, d.title && d.title !== "Head" ? d.title : "Principal", "Role") + "</label>" +
      (A.staffPassword() ? field("Password", "pin", "", { attrs: 'type="password" autocomplete="new-password"', ph: "8 or more characters, letters and a number" }, "Used to sign in on every device.") +
        field("Type it again", "pin2", "", { attrs: 'type="password" autocomplete="new-password"' })
        : field("PIN (4 digits)", "pin", "", { attrs: 'type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"' }, "Used to sign in on this and every school computer.") +
        field("Type it again", "pin2", "", { attrs: 'type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"' })) + "</div>" +
      (teacher ? '<div class="divider"></div><h3>Your class</h3><p class="muted small">How the school names its classes (ECD and Grades, Grades, ECD, or Forms), and the class you teach: School Assist starts with it ready for the register and the mark book.</p><div class="form-grid mt">' +
        A.Primary.systemFields(d.system || (school ? "form" : "ecdgrade"), d.level == null && school ? "" : d.level, { level: "Class", none: "I don't teach a class" }) +
        field("Stream", "stream", d.stream == null ? "Blue" : d.stream, { ph: "e.g. Blue, A, Lion" }) + "</div>" +
        '<label class="check mt"><input type="checkbox" name="sample"' + (d.sample === true || (d.sample == null && !school) ? " checked" : "") + "> Add 30 sample learners with a week of registers and some marks, to try it out (remove them later with one button)</label>" : "") +
      msg + '<div class="setup-actions"><button type="button" class="btn btn-lg" data-act="su-back">' + I("back") + 'Back</button><button class="btn btn-primary btn-lg" type="submit">Next' + I("right") + "</button></div></form>";
  };
  STEP.key = function (msg) {
    var d = W.d;
    return "<h1>School Assist key</h1><p class=\"muted\">Golden Technologies gives every school a key: it says which school this is and its plan (Standard or Premium). Paste it, or open the key file. No key yet? Leave it empty: School Assist runs as a trial, and you add the key later in Settings → Plan &amp; licence.</p>" +
      '<form data-submit="su-key" class="mt"><label class="field"><span>Key</span><textarea class="input" name="key" rows="4" spellcheck="false" autocomplete="off" placeholder="SA1.…" style="font-family:monospace;font-size:12px">' + esc(d.key || "") + "</textarea></label>" +
      '<label class="btn mt-sm">' + I("upload") + 'Open the key file<input type="file" accept=".txt,.sakey,text/plain" data-change="su-keyfile" hidden></label>' +
      msg + '<div class="setup-actions"><button type="button" class="btn btn-lg" data-act="su-back">' + I("back") + 'Back</button><button class="btn btn-primary btn-lg" type="submit">' + I("check") + "Set up " + esc(d.short || d.name || "the school") + "</button></div></form>";
  };
  STEP.hub = function (msg) {
    return "<h1>Make this computer the school hub</h1><p class=\"muted\">The hub keeps everyone's work. Teachers' computers and students' tablets and phones connect to it over the school Wi-Fi. Keep this computer on during school hours, and give it a fixed address on the network (ask whoever looks after the Wi-Fi), so the copies you share always find it.</p>" +
      '<div id="su-hub" class="callout mt">' + I("refresh") + "<div>Checking…</div></div>" + msg +
      // another program on this computer may already use port 8080: the hub can use another one (devices are told it)
      '<label class="field mt" style="max-width:220px"><span>Port</span><input class="input sm" id="su-hub-port" inputmode="numeric" maxlength="5" value="' + (W.port || 8080) + '"><span class="hint">Leave 8080 unless the hub says the port is in use.</span></label>' +
      '<div class="setup-actions"><span></span><button class="btn btn-lg" data-act="su-hub-on">' + I("monitor") + 'Turn on the hub</button><button class="btn btn-primary btn-lg" data-act="su-finish">' + I("check") + "Finish</button></div>";
  };
  STEP.share = function (msg) {
    return "<h1>Share School Assist with your teachers and students</h1><p class=\"muted\">The copies you hand out are already set up for <b>" + esc(A.Theme.get().name) + "</b>: they open on the school's sign-in page with your logo and join the hub by themselves. Teachers and students only sign in, or create an account. Choose one way or more (later too, in Settings → Share the app).</p>" +
      Id.shareOptions() + msg + codesBox() +
      '<div class="setup-actions"><span></span><button class="btn btn-primary btn-lg" data-act="su-finish">' + I("check") + "Finish</button></div>";
  };
  STEP.restore = function () {
    return "<h1>Restore a school from its backup</h1><p class=\"muted\">For a school whose hub computer was lost, stolen or broke. This computer downloads the school's backup and becomes its hub. " +
      "You need the school's School Assist key, Golden Technologies' approval (they phone the school to check), and two parts of the school's key. " +
      "With the school's backup files (from a flash drive) and parts 1 and 2, no internet or approval is needed.</p>" + A.Backup.restoreHtml("setup");
  };
  /* A school set up on schoolassistapp.com coming onto this computer, its hub from now on (1.8, hub-relay.cjs): an admin
     makes a move code there; everything comes here through School Assist, and phones carry on at the school's address. */
  var BRING_STEPS = { check: "Checking this computer", records: "Copying the records", files: "Copying the files", hold: "Holding changes for a moment",
    final: "Copying the last changes", devices: "Taking the devices' keys across", verify: "Checking the copy", "switch": "Passing phones to this computer" };
  STEP.bring = function (msg) {
    var b = W.bring;
    if (b && b.state !== "failed") {
      var r = b.records || {}, f = b.files || {}, pct = b.step === "records" && r.total ? r.done / r.total : b.step === "files" && f.totalBytes ? f.bytes / f.totalBytes : null;
      return "<h1>Bringing " + esc(W.d.bringName || "the school") + " onto this computer</h1>" +
        '<div class="row mt" style="gap:10px"><span class="setup-spin" aria-hidden="true"></span><b>' + esc(BRING_STEPS[b.step] || "Starting") + "</b>" +
        (b.step === "records" && r.total ? " " + r.done + " of " + r.total : b.step === "files" && f.total ? " " + f.done + " of " + f.total : "") + "…</div>" +
        (pct != null ? '<div class="bar mt" style="max-width:460px"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' : "") +
        '<p class="muted mt">Keep School Assist open and this computer online. People can keep working meanwhile: for the last minute their changes wait on their devices, then come here by themselves.</p>';
    }
    return "<h1>Bring the school onto this computer</h1><p class=\"muted\">For a school that started on schoolassistapp.com and wants its records on a computer of its own at school. " +
      "Everything comes here: every record, every uploaded file, and every registered device, which carries on without joining again. Phones keep the school's address and reach this computer through School Assist, which then keeps none of the school's records.</p>" +
      '<ol class="small mt-sm" style="padding-left:18px;max-width:640px"><li>On schoolassistapp.com, an admin opens <b>Settings → Offline &amp; sync</b> and makes a <b>move code</b>. It lasts 30 minutes.</li>' +
      "<li>Type the school's code and the move code here.</li><li>From then on, keep this computer on and online during the school day: phones away from school reach the school through it.</li></ol>" +
      (b && b.error ? '<p class="form-msg" role="alert">' + I("alert") + esc("It stopped: " + b.error + " Nothing was lost. Make a new move code and try again: it carries on where it stopped.") + "</p>" : "") +
      '<form data-submit="su-bring" class="mt" style="max-width:440px">' + field("The school's code", "code", W.d.bringCode, { ph: "e.g. ecs", attrs: 'autocomplete="off" spellcheck="false" autocapitalize="none"' }) +
      field("Move code", "pass", "", { ph: "XXXX-XXXX-XX", attrs: 'autocomplete="off" spellcheck="false" autocapitalize="characters"' }) +
      msg + '<div class="setup-actions"><button type="button" class="btn btn-lg" data-act="su-to" data-step="school">' + I("back") + 'Back</button><button class="btn btn-primary btn-lg" type="submit">' + I("download") + "Bring it here</button></div></form>";
  };
  /** The hub on this computer, turned on if it isn't: { port, token }. */
  function hubOn() {
    var d = desk();
    return d.hub.status().then(function (h) {
      if (h.running) return h;
      return d.hub.start(W.port || h.port || 8080).then(function (s) { if (s.error) throw new Error(s.error); return d.hub.status(); });
    });
  }
  /** A call to the hub on this computer, as this computer's own app. */
  function hubHere(h, p, body) {
    return fetch("http://localhost:" + h.port + p, { method: "POST", headers: { "Content-Type": "application/json", "X-SA-Local": h.token }, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 404 || r.status === 405) throw new Error("This copy of School Assist is older than 1.8. Install the latest School Assist on this computer, then try again.");
          if (!r.ok) throw new Error(j.error || "The hub on this computer replied " + r.status + ".");
          return j;
        });
      });
  }
  var bringTimer = null;
  function followBring(h) {
    clearTimeout(bringTimer);
    hubHere(h, "/api/relay/status").then(function (s) {
      W.bring = s.bring || W.bring;
      if (s.name) W.d.bringName = s.name;
      if (W.bring && W.bring.state === "done") return broughtHere(h, W.bring);
      if (Id.stage(M.me()) === "wizard" && W.step === "bring") redraw();
      if (!W.bring || W.bring.state !== "failed") bringTimer = setTimeout(function () { followBring(h); }, 1500);
    }, function () { bringTimer = setTimeout(function () { followBring(h); }, 4000); });
  }
  /** The school is on this computer: this app joins its own hub, and it is the school's sign-in page from here. */
  function broughtHere(h, b) {
    A.Sync.setConfig({ url: "http://localhost:" + h.port, auto: true });
    return A.Sync.syncNow().catch(function () {}).then(function () {
      var c = b.counts || {};
      meta().setupStep = null;
      W = { step: "school", d: { title: "Head" }, msg: "" };
      return S().flush().then(function () {
        A.Theme.apply(); redraw();
        UI.toast((Id.id() ? A.Theme.get().name : "The school") + " is on this computer now: " + (c.records || 0) + " records, " + (c.files || 0) + " files and " + (c.devices || 0) + " devices. Sign in as usual.");
      });
    });
  }
  A.act["su-bring"] = function (form) {
    var f = UI.formData(form), btn = form.querySelector("[type=submit]");
    W.d.bringCode = f.code;
    if (!String(f.code || "").trim() || !String(f.pass || "").trim()) return fail("Type the school's code and the move code.");
    btn.disabled = true; btn.innerHTML = I("refresh") + "Starting…";
    var hub;
    hubOn().then(function (h) { hub = h; return hubHere(h, "/api/relay/bring", { code: f.code, pass: f.pass }); }).then(function (s) {
      W.bring = { state: "running", step: "check" }; W.msg = "";
      if (s.name) W.d.bringName = s.name;
      redraw(); followBring(hub);
    }).catch(function (e) { fail(e.message || String(e)); });
  };
  STEP.join = function (msg) {
    var d = W.d, eg = "192.168.1.20:8080";
    return "<h1>Join the school hub</h1><p class=\"muted\">For a computer at a school that already uses School Assist. The hub's address is on the hub computer, in Settings → Offline &amp; sync. Easier: use the copy of School Assist your school shares, which joins by itself.</p>" +
      '<form data-submit="su-join" class="mt">' + field("Hub address", "url", d.url, { ph: "e.g. " + eg, attrs: 'autocomplete="off" spellcheck="false"' }) +
      msg + '<div class="setup-actions"><button type="button" class="btn btn-lg" data-act="su-to" data-step="school">' + I("back") + 'Back</button><button class="btn btn-primary btn-lg" type="submit">' + I("wifi") + "Join</button></div></form>";
  };
  function wizardHtml() {
    var m = meta();
    if (m.setupStep && Id.id()) W.step = m.setupStep;
    // setting up with the key given on the first page: the key's name and abbreviation to start from
    if (multiSetup() && !W.d.key) {
      var lk = A.Licence ? A.Licence.readAny(m.multi.key) : null, kd = (lk && lk.ok && lk.data) || {};
      W.d = Object.assign({ title: "Head", key: m.multi.key, name: kd.name || "", short: kd.name || "", abbr: kd.abbr || "" }, W.d.name ? W.d : {});
      W.d.key = m.multi.key;
    }
    var list = steps(), at = list.map(function (s) { return s[0]; }).indexOf(W.step);
    var bar = at < 0 ? "" : '<ol class="setup-steps">' + list.map(function (s, i) { return '<li class="' + (i < at ? "done" : i === at ? "on" : "") + '"><span>' + (i < at ? I("check") : i + 1) + "</span>" + esc(s[1]) + "</li>"; }).join("") + "</ol>";
    var msg = W.msg ? '<p class="form-msg" role="alert">' + I("alert") + esc(W.msg) + "</p>" : "";
    var links = multiSetup() ? '<p class="setup-links">Not now? <button class="link" data-act="su-other-school">Back to the start</button></p>'
      : W.step === "school" ? '<p class="setup-links">This school already uses School Assist? <button class="link" data-act="su-to" data-step="join">Join the school hub</button>' +
      (desk() && desk().pack ? ' or <button class="link" data-act="su-packfile">open the school file</button>' : "") +
      // the hub computer was lost, stolen or broke: this computer can become the hub from the online backup (js/backup.js)
      (desk() && desk().backup && A.Backup ? '<span class="sep"></span>Lost the hub computer? <button class="link" data-act="su-to" data-step="restore">Restore from the online backup</button>' : "") +
      // a school that started on schoolassistapp.com: its records onto this computer (1.8)
      (desk() && desk().hub ? '<span class="sep"></span>Started on schoolassistapp.com? <button class="link" data-act="su-to" data-step="bring">Bring the school onto this computer</button>' : "") +
      '<span class="sep"></span>Just looking? <button class="link" data-act="su-demo">Open the demo school</button>' + "</p>" : "";
    return '<div class="setup-card">' + bar + STEP[W.step](msg) + "</div>" + links;
  }
  function go(step) {
    W.step = step; W.msg = "";
    // once the school exists, the remembered step moves too (wizardHtml goes back to it on every redraw)
    if (meta().setupStep && Id.id()) { meta().setupStep = step; S().flush(); }
    redraw();
  }
  A.act["su-to"] = function (el) { go(el.getAttribute("data-step")); };
  A.act["su-back"] = function () { go(W.step === "key" ? "person" : "school"); };
  A.act["su-logo"] = function (el) {
    var f = el.files && el.files[0];
    if (!f) return;
    if (f.size > 800 * 1024) { UI.toast("That image is over 800 KB. Please use a smaller logo.", "bad"); return; }
    keepTyped();
    A.readDataURL(f).then(function (d) { W.d.logo = d; redraw(); });
  };
  A.act["su-logo-clear"] = function () { keepTyped(); W.d.logo = ""; redraw(); };
  A.act["su-keyfile"] = function (el) {
    var f = el.files && el.files[0];
    if (f) A.readText(f).then(function (t) { W.d.key = String(t || "").trim(); redraw(); });
  };
  /** What has been typed on the school step, kept when the page is drawn again (a logo upload). */
  function keepTyped() {
    var f = document.querySelector("form[data-submit=su-school]");
    if (!f) return;
    ["name", "short", "abbr", "motto", "vision", "mission", "aims"].forEach(function (k) { if (f.elements[k]) W.d[k] = f.elements[k].value; });
  }
  function fail(m) { W.msg = m; redraw(); }
  A.act["su-school"] = function (form) {
    keepTyped();
    var d = W.d;
    d.name = d.name.trim().replace(/\s+/g, " "); d.short = d.short.trim().replace(/\s+/g, " ");
    d.abbr = String(d.abbr || "").toUpperCase().replace(/[^A-Z]/g, "") || M.schoolAbbr(d.name);
    if (d.name.length < 3) return fail("Enter the school's name.");
    if (!/^[A-Z]{2,6}$/.test(d.abbr)) return fail("The abbreviation is 2 to 6 letters, for example KHS.");
    go("person");
  };
  A.act["su-person"] = function (form) {
    var f = UI.formData(form), d = W.d;
    d.admin = f.admin.trim().replace(/\s+/g, " "); d.title = f.title.trim() || "Admin";
    if (A.Primary) { d.system = f.system; d.level = f.level; d.stream = f.stream.trim(); d.sample = !!f.sample; }
    if (d.admin.split(" ").length < 2) return fail("Enter the full name, for example Mr T. Chirwa.");
    var pw = A.staffPassword();
    if (pw && A.staffPasswordProblem(f.pin)) return fail(A.staffPasswordProblem(f.pin));
    if (!pw && !/^\d{4}$/.test(f.pin)) return fail("The PIN must be 4 digits.");
    if (f.pin !== f.pin2) return fail(pw ? "The two passwords are different. Type them again." : "The two PINs are different. Type them again.");
    d.pin = f.pin; d.pw = pw;
    if (multiSetup()) return setUp(d.key); // the key came first
    go("key");
  };
  A.act["su-key"] = function (form) { setUp(form.key.value); };
  function setUp(keyText) {
    var d = W.d, key = String(keyText || "").replace(/\s+/g, ""), lic = null;
    d.key = key;
    if (key) {
      lic = A.Licence ? A.Licence.read(key) : { ok: false, error: "This copy can't read keys." };
      if (!lic.ok) return fail(lic.error);
    }
    var o = { name: d.name, shortName: d.short || d.name, abbr: d.abbr, motto: d.motto, vision: (d.vision || "").trim(), mission: (d.mission || "").trim(), aims: (d.aims || "").trim(),
      logo: d.logo || "", primary: d.primary || "", secondary: d.secondary || "", admin: d.admin, title: d.title, pin: d.pin, key: lic ? lic.key : "",
      system: d.system, cls: A.Primary && d.level ? { level: d.level, stream: d.stream, sample: d.sample } : null };
    if (lic && lic.renewal) return fail("That is a renewal code. Enter the school's key (it starts SA1.), or leave this empty for now.");
    // the key's name and abbreviation win (a temporary master key has none: the school keeps what was typed)
    if (lic && !lic.master) { o.name = lic.data.name; o.abbr = lic.data.abbr; if (!d.short || d.short === d.name) o.shortName = lic.data.name; }
    Id.create(o).then(function (admin) {
      M.signIn(admin.id);
      A.Theme.apply();
      A.schoolFolder(admin);
      if (A.LastUser) A.LastUser.set(admin, {});
      meta().setupStep = desk() && desk().hub ? "hub" : null; // with no hub to turn on, set-up is done: home
      W = meta().setupStep ? { step: meta().setupStep, d: {}, msg: "" } : { step: "school", d: { title: "Head" }, msg: "" };
      if (!meta().setupStep) location.hash = "#/t/home";
      return S().flush().then(function () { A.Theme.apply(); redraw(); UI.toast(o.name + " is set up"); if (A.Sync && A.Sync.hubMode()) A.Sync.syncNow().catch(function () {}); });
    }).catch(function (e) { fail(e.message || String(e)); });
  }
  function hubStatus() {
    var d = desk(), box = document.getElementById("su-hub");
    if (!d || !d.hub || !box) return;
    d.hub.status().then(function (h) {
      var urls = (h.urls || []).filter(function (u) { return !/localhost|127\.0\.0\.1/.test(u); });
      box.className = "callout mt" + (h.running ? "" : " warn");
      box.innerHTML = I(h.running ? "checkCircle" : "monitor") + "<div>" + (h.running
        ? "<b>The hub is on.</b> " + (urls.length ? "Devices on the school Wi-Fi reach it at " + urls.map(function (u) { return "<code>" + esc(u) + "</code>"; }).join(" or ") + "." : "Connect this computer to the school Wi-Fi so other devices can reach it.")
        : "<b>The hub is off.</b> Turn it on: it starts by itself whenever School Assist opens on this computer.") + "</div>";
    });
  }
  A.act["su-hub-on"] = function () {
    var d = desk(), box = document.getElementById("su-hub-port"), port = Number(box && box.value);
    if (!(port >= 1024 && port <= 65535)) return fail("The port is a number from 1024 to 65535, for example 8080 or 8081.");
    W.port = port;
    d.hub.start(port).then(function (h) {
      if (h.error) return fail(h.error.replace(/Try another port, for example (\d+)\./, "Type another port above, for example $1, and turn the hub on again."));
      A.Sync.setConfig({ url: "http://localhost:" + h.port, auto: true });
      return A.Sync.syncNow().catch(function () {}).then(function () { W.msg = ""; redraw(); });
    });
  };
  A.act["su-finish"] = function () {
    meta().setupStep = null;
    W = { step: "school", d: { title: "Head" }, msg: "" };
    S().flush().then(function () { location.hash = "#/t/home"; redraw(); });
  };
  A.act["su-join"] = function (form) {
    var url = hubUrl(form.url.value);
    W.d.url = form.url.value;
    if (!url) return fail("Enter the hub's address.");
    ping(url).then(function (j) {
      if (!j.school) throw new Error("That hub has no school yet. Set the school up on the hub computer first.");
      return UI.confirm("Join " + (j.school.name || "this school") + "? Its classes, people and work are copied to this computer.", { ok: "Join" }).then(function (ok) {
        if (!ok) return;
        A.Sync.setConfig({ url: url, auto: true });
        return A.Sync.syncNow().then(function () {
          if (!Id.id()) throw new Error("The hub didn't send the school's records. Try again.");
          W = { step: "school", d: { title: "Head" }, msg: "" };
          A.Theme.apply(); redraw();
          UI.toast("This computer has joined " + (j.school.name || "the school"));
        });
      });
    }).catch(function (e) {
      fail(e && (e.name === "AbortError" || e.message === "not a hub" || /fetch/i.test(e.message)) ? "No School Assist hub answered at " + url + ". Check the address, and that this computer is on the school Wi-Fi." : (e && e.message) || String(e));
    });
  };
  /** "192.168.1.20:8080" → "http://192.168.1.20:8080" (the port defaults to the hub's 8080). */
  function hubUrl(s) {
    s = String(s || "").trim().replace(/\/+$/, "");
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = "http://" + s;
    if (!/:\d+$/.test(s.replace(/^https?:\/\//i, ""))) s += ":8080";
    return s;
  }
  A.act["su-packfile"] = function () {
    desk().pack.open().then(function (p) {
      if (!p) return;
      if (!editionOk(p)) return fail(p.edition === "teacher" ? "That school file is for School Assist Teacher." : "That school file is for School Assist, not School Assist Teacher.");
      return Id.provision(p).then(function () { redraw(); });
    }).catch(function (e) { fail(e.message || String(e)); });
  };
  A.act["su-demo"] = function () {
    if (A.edition === "teacher" && A.Primary) {
      // School Assist Teacher: a demo named by Grades (with ECD) or by Forms
      var open = function (sys) { A.demoSystem = sys; S().reset().then(function () { A.Theme.apply(); redraw(); }); };
      UI.modal({ title: "Open the demo school?", body: '<p>A made-up school (Riverside) for trying School Assist Teacher: a head and two class teachers, three classes of 30 learners with registers, marks and report comments. It never goes to a school hub, and you can set up your own school from it later. Every teacher\'s PIN is <b>' + esc(A.Primary.DEMO_PIN) + "</b>.</p>",
        foot: [{ label: "Cancel" }, { label: "Forms (a high school)", onClick: function () { open("form"); } }, { label: "Grades (with ECD)", cls: "btn-primary", onClick: function () { open("ecdgrade"); } }] });
      return;
    }
    UI.confirm("Open the demo school? It is a made-up school (Greenfield High) for trying School Assist. It never goes to a school hub, and you can set up your own school from it later.", { ok: "Open the demo" }).then(function (ok) {
      if (!ok) return;
      S().reset().then(function () { A.Theme.apply(); redraw(); });
    });
  };
  /** In the demo: back to the set-up page (the demo is removed). */
  A.act["su-leave-demo"] = function () {
    UI.confirm("Set up your school? The demo school is removed from this computer.", { ok: "Set up my school" }).then(function (ok) {
      if (!ok) return;
      if (M.me()) A.act.signout();
      S().startEmpty(null).then(function () { meta().demo = false; return S().flush(); }).then(function () {
        if (A.LastUser) A.LastUser.forget();
        W = { step: "school", d: { title: "Head" }, msg: "" };
        A.Theme.apply(); redraw();
      });
    });
  };
  /** On the demo school's sign-in page: what it is, and the way out. */
  Id.welcomeCard = function () {
    if (!Id.applies() || !Id.isDemo()) return "";
    return '<div class="callout mb">' + I("info") + '<div class="grow small"><b>This is the demo school</b>, for trying School Assist.' + (A.edition === "teacher" && A.Primary ? " Every teacher's PIN is <b>" + esc(A.Primary.DEMO_PIN) + "</b>." : "") + '</div><button class="btn btn-sm btn-primary" data-act="su-leave-demo">' + I("school") + "Set up my school</button></div>";
  };
  Id.joinLink = function () { return ""; };
  Id.loginStep = function () { return null; };

  /* ------------------------------------------------------------------ sharing the app */
  /** The school file: everything a copy needs to open as this school's and find its hub. Nothing secret. */
  Id.makePack = function () {
    var b = A.Theme.get(), r = Id.record() || {}, d = desk();
    // made on the hub computer, the school file carries the hub's join secret: its copies join the hub by themselves (1.6)
    var join = "";
    var urls = d && d.hub ? d.hub.status().then(function (h) { join = (h && h.running && h.join) || ""; return h && h.running ? h.urls : []; }).catch(function () { return []; }) : Promise.resolve([]);
    return urls.then(function (list) {
      list = (list || []).filter(function (u) { return !/localhost|127\.0\.0\.1/.test(u); });
      var c = A.Sync.config();
      if (c.url && !/localhost|127\.0\.0\.1/.test(c.url) && list.indexOf(c.url) < 0) list.push(c.url);
      return { app: "school-assist-pack", v: 1, edition: A.edition === "teacher" ? "teacher" : "school", madeAt: A.now(),
        school: { schoolId: r.schoolId, name: b.name, shortName: b.shortName, abbr: Id.abbr(), motto: b.motto, vision: b.vision, mission: b.mission, aims: b.aims,
          logo: b.logo || "", primary: b.primary, secondary: b.secondary },
        hub: { urls: list, join: join || undefined } };
    });
  };
  Id.shareOptions = function () {
    var d = desk(), flash = d && d.pack;
    var card = function (icon, title, text, button) {
      return '<div class="share-opt"><div class="share-ico">' + I(icon) + "</div><h3>" + title + '</h3><p class="small muted">' + text + "</p>" + button + "</div>";
    };
    var who = esc((CFG.company && CFG.company.name) || "Golden Technologies");
    return '<div class="share-opts mt">' +
      card("download", "Flash drive", "School Assist, ready for the school, copied onto a flash drive. Teachers and students copy the folder to their computer, or open it from the drive.",
        flash ? '<button class="btn btn-primary" data-act="su-share-flash">' + I("download") + "Copy to a flash drive</button>" : '<p class="tiny muted">Do this on the hub computer, in the School Assist app.</p>') +
      card("globe", "The school's website", "Your school's own School Assist installer, with your name and logo, to put on the school website. Save the school file and send it to " + who + ".",
        '<button class="btn" data-act="su-share-file">' + I("upload") + "Save the school file</button>") +
      card("link", "A download link", "No website? " + who + " puts your school's installer online for a while and sends you a link to share by WhatsApp or SMS. Students download the app itself, not a web page.",
        '<button class="btn" data-act="su-share-file">' + I("upload") + "Save the school file</button>") +
      '</div><div id="su-share-msg"></div>';
  };
  function shareMsg(html, warn) { var el = document.getElementById("su-share-msg"); if (el) el.innerHTML = '<div class="callout mt' + (warn ? " warn" : "") + '">' + I(warn ? "alert" : "checkCircle") + '<div class="small">' + html + "</div></div>"; }
  function packReady() {
    return Id.makePack().then(function (p) {
      if (!p.school.schoolId) throw new Error("Set the school up first.");
      if (!p.hub.urls.length) throw new Error("Turn the school hub on first (Settings → Offline & sync, on the hub computer), so the copies know where to find it.");
      return p;
    });
  }
  A.act["su-share-flash"] = function (el) {
    packReady().then(function (p) {
      el.disabled = true; shareMsg("Choose the flash drive. Copying takes a minute or two…");
      return desk().pack.copy(p).then(function (r) {
        el.disabled = false;
        if (!r) { shareMsg("Nothing copied.", true); return; }
        // School Assist 1.3.0 and 1.3.1 (installed, not portable) couldn't copy themselves; 1.3.2 can
        if (r.error && /Invalid package|app\.asar/i.test(r.error)) {
          shareMsg("This version of School Assist can't copy itself to a flash drive. Install School Assist 1.3.2 or newer on this computer " +
            "(<b>github.com/Kim-G7/School-Assist-releases/releases</b>), then try again. Or copy the portable School Assist file to the flash drive together with the school file.", true);
          return;
        }
        if (r.error) { shareMsg(esc(r.error), true); return; }
        shareMsg("<b>Copied</b> to <code>" + esc(r.dir) + "</code> (" + Math.round(r.bytes / 1048576) + " MB). Teachers and students open <b>" + esc(r.exe) + "</b> in that folder, or copy the folder to their computer first. It joins the hub by itself on the school Wi-Fi.");
      });
    }).catch(function (e) { el.disabled = false; shareMsg(esc(e.message || String(e)), true); });
  };
  A.act["su-share-file"] = function () {
    packReady().then(function (p) {
      A.download(A.slug(p.school.shortName || p.school.name) + ".sapack", JSON.stringify(p));
      var c = CFG.company || {}, who = esc(c.name || "Golden Technologies") + (c.phone || c.email ? " (" + esc([c.phone, c.email].filter(Boolean).join(", ")) + ")" : "");
      shareMsg("<b>Saved the school file.</b> Send it to " + who + ". You get back your school's own School Assist installer (your name and logo) and a download link, or a page for your website.");
    }).catch(function (e) { shareMsg(esc(e.message || String(e)), true); });
  };
  function codesBox() {
    var c = S().get("settings", "staffcodes");
    if (!c) return "";
    return '<div class="callout mt">' + I("key") + '<div class="small"><b>Staff codes.</b> Teachers register on the sign-in page with the teacher code <code>' + esc(c.teacher) + "</code>; other admins with <code>" + esc(c.admin) + "</code>. You approve them in Settings → People.</div></div>";
  }
  /** Settings → Share the app (admins). */
  Id.shareSection = function () {
    return '<div class="card card-pad" style="max-width:960px"><h3>Share School Assist with your teachers and students</h3><p class="muted small mt-sm">The copies you hand out are set up for ' + esc(A.Theme.get().name) +
      ": they open on the school's sign-in page with your logo and join the school hub by themselves. Teachers and students only sign in, or create an account.</p>" + Id.shareOptions() + codesBox() + "</div>";
  };
})(window.App);
