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
 * Home (home study) syncs online instead and has none of this. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var DEMO_MARKERS = [["users", "t_ncube"], ["classes", "c_4a_maths"]]; // records only the demo school has

  function hash(s) { var h = 5381; s = String(s || ""); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function newId() { return "sch_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
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
  Id.boot = function () {
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
    var old = S().get("settings", "branding") || {};
    return S().startEmpty(null).then(function () {
      meta().demo = false;
      if (A.edition === "teacher" && A.Primary) A.Primary.seed(A.Store); // learning areas, grades, terms
      S().put("settings", Object.assign({}, old, { id: "branding", name: o.name, shortName: o.shortName || o.name, motto: o.motto || "",
        vision: o.vision || "", mission: o.mission || "", aims: o.aims || "", logo: o.logo || old.logo || "" },
        o.primary ? { primary: o.primary, secondary: o.secondary || o.primary } : {}));
      var admin = S().put("users", { id: A.uid("t"), role: "teacher", isAdmin: true, staffNo: o.abbr + "-AD1", name: o.admin, title: o.title || "Admin",
        subjects: A.edition === "teacher" ? (o.cls ? "Class teacher" : "") : "All subjects" });
      M.setPin(admin.id, o.pin, admin.id);
      S().put("settings", { id: "school", schoolId: newId(), name: o.name, abbr: o.abbr, createdBy: admin.id });
      S().put("settings", { id: "staffcodes", prefix: o.abbr, admin: M.makeStaffCode(o.abbr), teacher: M.makeStaffCode(o.abbr), madeAt: Date.now() });
      if (o.key) {
        S().put("settings", { id: "licence", key: o.key, appliedAt: Date.now(), appliedBy: admin.id });
        if (A.Licence) S().put("settings", { id: "features", seen: A.Licence.FEATURES.filter(function (f) { return f.built; }).map(function (f) { return f.id; }) });
      }
      if (A.edition === "teacher" && A.Primary && o.cls) A.Primary.setupClass(admin, o.cls.level, o.cls.stream, o.cls.sample);
      return S().flush().then(function () { return admin; });
    });
  };

  /** Join the hub's school: this device's own copy is replaced by the school's records. */
  Id.adopt = function (res, startedAt) {
    var m = meta();
    if (m.pack && res.school.id !== m.pack.schoolId) return Promise.reject(new Error("This hub belongs to " + (res.school.name || "another school") + ", not " + m.pack.name + "."));
    // what this device keeps: its id, its key to the hub (1.6) and the school file (its join secret, to join again)
    var deviceId = m.deviceId, hubKey = m.hubKey || null, pack = m.pack || null;
    if (M.me()) M.signOut();
    if (A.LastUser) A.LastUser.forget(); // that was someone in the demo school
    A.Store.state = A.Store.empty();
    m = meta();
    m.deviceId = deviceId; m.seededAt = Date.now(); m.demo = false; m.joinedAt = Date.now();
    if (hubKey) m.hubKey = hubKey;
    if (pack) m.pack = pack;
    var n = 0;
    Object.keys(res.changes || {}).forEach(function (c) { (res.changes[c] || []).forEach(function (r) { if (S().merge(c, r)) n++; }); });
    if (!Id.record()) A.Store.state.colls.settings.school = { id: "school", schoolId: res.school.id, name: res.school.name || "", updatedAt: 1 };
    m.serverSince = res.now; m.lastPushAt = startedAt; m.lastSyncAt = Date.now();
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
    if (m.pack || servedByHub()) return "connect";
    return "wizard";
  };
  Id.page = function (stage) {
    document.title = "School Assist";
    return '<div class="setup-page"><header class="setup-top"><img src="assets/icon.svg" alt="" class="setup-mark"><div><b>School Assist</b><span>by ' + esc((CFG.company && CFG.company.name) || "Golden Technologies") + "</span></div></header>" +
      '<main class="setup-main">' + (stage === "connect" ? connectHtml() : wizardHtml()) + "</main></div>";
  };
  Id.mount = function (stage) {
    if (stage === "connect" && !C.busy && !C.timer) Id.connect();
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
      .then(function (j) { clearTimeout(t); if (!j || j.app !== "school-assist") throw new Error("not a hub"); return j; }, function (e) { clearTimeout(t); throw e; });
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
    if (!id || lost.busy || !url || /localhost|127\.0\.0\.1/.test(url) || ++lost.n < 3 || Date.now() - lost.at < 10 * 60000) return;
    lost.busy = true; lost.at = Date.now();
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
    var logo = p.logo ? '<div class="logo"><img src="' + esc(p.logo) + '" alt=""></div>' : '<div class="logo"><img src="assets/icon.svg" alt=""></div>';
    return '<div class="setup-card setup-connect">' + logo + "<h1>" + esc(name || "Your school") + "</h1>" +
      (C.pendingCode ? '<p class="mt">This computer is waiting to join the school hub. Show an admin this code:</p><p class="join-code">' + esc(C.pendingCode) + '</p><p class="small muted">The admin lets it in under Settings → Devices. This page carries on by itself.</p><div class="setup-spin" aria-hidden="true"></div>'
        : C.error ? '<div class="callout warn mt" style="text-align:left">' + I("wifiOff") + "<div>" + esc(C.error) + "</div></div>" +
        '<button class="btn btn-primary btn-lg mt" data-act="su-connect">' + I("refresh") + "Try again</button>" +
        (meta().pack ? '<form data-submit="su-connect-at" class="mt-lg" style="text-align:left"><label class="field"><span>Or type the hub\'s address</span><input class="input" name="url" placeholder="e.g. 192.168.1.20:8080" autocomplete="off" spellcheck="false">' +
          '<span class="hint">It is on the hub computer, in Settings → Offline &amp; sync.</span></label><button class="btn" type="submit">' + I("wifi") + "Connect</button></form>" : "")
        : '<p class="muted mt">' + (C.searching ? "Looking for the school hub on the network…" : "Connecting to the school hub…") + '</p><div class="setup-spin" aria-hidden="true"></div>') +
      '<p class="tiny muted mt-lg">This copy of School Assist is set up for ' + esc(name || "your school") + ". It joins the school hub over the school Wi-Fi; then teachers and students sign in.</p></div>";
  }
  /** Find the school's hub (the school file's addresses, or the hub this page came from) and join it. */
  Id.connect = function () {
    if (C.busy) return;
    clearTimeout(C.timer); C.timer = null; C.busy = true; C.error = "";
    var m = meta(), urls = m.pack ? (m.pack.urls || []) : [location.origin];
    var tryOne = function (i) {
      if (i >= urls.length) return Promise.reject(new Error(m.pack ? "The school hub isn't answering. Connect this computer to the school Wi-Fi (the hub computer must be on), then try again." : "nohub"));
      return ping(urls[i]).then(function (j) {
        if (!j.school) throw new Error("The school isn't set up on the hub computer yet.");
        if (m.pack && j.school.id !== m.pack.schoolId) throw new Error("The hub at " + urls[i] + " belongs to " + j.school.name + ", not " + m.pack.name + ".");
        C.name = j.school.name;
        A.Sync.setConfig({ url: urls[i], auto: true });
        return A.Sync.syncNow();
      }, function () { return tryOne(i + 1); });
    };
    var search = function (e) {
      // the hub's address may have changed: look for this school's hub on the same network
      // (at most every 5 minutes on its own, so a laptop away from school doesn't keep searching; at once on "Try again")
      if (!m.pack || e.message.indexOf("isn't answering") < 0 || !urls.length || (!C.manual && Date.now() - (C.searchedAt || 0) < 300000)) throw e;
      C.searching = true; C.manual = false; C.searchedAt = Date.now(); redraw();
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
      // waiting for an admin to let it in: show the code, and look again every few seconds
      C.pendingCode = e.code === "pending" ? (A.Sync.joinState().code || "") : "";
      C.error = e.message || String(e);
      redraw();
      C.timer = setTimeout(function () { C.timer = null; if (Id.stage(M.me()) === "connect") Id.connect(); }, C.pendingCode ? 6000 : 20000);
    });
  };
  A.act["su-connect"] = function () { C.manual = true; Id.connect(); redraw(); };
  /** The hub's address typed on the "Connecting" page: tried first from now on. */
  A.act["su-connect-at"] = function (form) {
    var url = hubUrl(form.url.value), m = meta();
    if (!url || !m.pack) return;
    m.pack.urls = [url].concat((m.pack.urls || []).filter(function (u) { return u !== url; }));
    S().flush();
    C.manual = true; Id.connect(); redraw();
  };

  /* ------------------------------------------------------------------ the set-up page */
  var W = { step: "school", d: { title: "Head" }, msg: "" };
  function steps() {
    var list = [["school", "Your school"], ["person", "Person in charge"], ["key", "School Assist key"]];
    if (desk() && desk().hub) list.push(["hub", "School hub"]);
    list.push(["share", "Share the app"]);
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
      field("School name", "name", d.name, { full: true, ph: teacher ? "e.g. Sunrise Primary School" : "e.g. Kopje High School", attrs: 'autocomplete="organization"' }) +
      field("Short name", "short", d.short, { ph: teacher ? "e.g. Sunrise Primary" : "e.g. Kopje High" }, "Used where space is tight.") +
      field("Abbreviation", "abbr", d.abbr, { ph: teacher ? "e.g. SPS" : "e.g. KHS", attrs: 'maxlength="6" autocapitalize="characters"' }, teacher
        ? "2 to 6 letters. Starts every ID: pupils " + esc(d.abbr || "SPS") + "-GR4-001 (Grade 4, pupil 1), teachers " + esc(d.abbr || "SPS") + "-TC1, admins " + esc(d.abbr || "SPS") + "-AD1, and the staff codes."
        : "2 to 6 letters. Starts every ID: students " + esc(d.abbr || "KHS") + "-FM1-001 (Form 1, student 1), teachers " + esc(d.abbr || "KHS") + "-TC1, admins " + esc(d.abbr || "KHS") + "-AD1, and the staff codes.") +
      field("Motto", "motto", d.motto, { full: true, ph: "e.g. Knowledge is power" }) +
      '<div class="field full"><span class="label">School colours</span>' + coloursHtml() + "</div>" +
      field("Vision <span class=\"muted\">(optional)</span>", "vision", d.vision, { full: true, area: true, ph: "What the school wants to become" }) +
      field("Mission <span class=\"muted\">(optional)</span>", "mission", d.mission, { full: true, area: true, ph: "How it gets there" }) +
      field("Aims <span class=\"muted\">(optional, one per line)</span>", "aims", d.aims, { full: true, area: true, rows: 3, ph: "To ...\nTo ..." }) +
      "</div>" + msg + '<div class="setup-actions"><span></span><button class="btn btn-primary btn-lg" type="submit">Next' + I("right") + "</button></div></form>";
  };
  STEP.person = function (msg) {
    var d = W.d, teacher = A.edition === "teacher", levels = (A.Primary && A.Primary.LEVELS) || [];
    return "<h1>The person in charge</h1><p class=\"muted\">The head, or the ICT or computer teacher. This is the first admin: they approve the teachers and students who register, and look after the app. Other teachers and admins register later with the staff codes.</p>" +
      '<form data-submit="su-person" class="mt"><div class="form-grid">' +
      field("Full name", "admin", d.admin, { ph: "e.g. Mr T. Chirwa", attrs: 'autocomplete="name"' }) +
      field("Title", "title", d.title, { ph: "e.g. Head", attrs: 'list="su-titles"' }) +
      '<datalist id="su-titles"><option>Head</option><option>Deputy Head</option><option>ICT teacher</option><option>Computer teacher</option><option>Senior teacher</option></datalist>' +
      field("PIN (4 digits)", "pin", "", { attrs: 'type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"' }, "Used to sign in on this and every school computer.") +
      field("Type it again", "pin2", "", { attrs: 'type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"' }) + "</div>" +
      (teacher ? '<div class="divider"></div><h3>Your class</h3><p class="muted small">If you teach a class, School Assist starts with it ready for the register and the mark book.</p><div class="form-grid mt">' +
        '<label class="field"><span>Class</span><select class="select" name="level"><option value="">I don\'t teach a class</option>' + levels.map(function (l) { return "<option" + (l === (d.level || "Grade 4") ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
        field("Stream", "stream", d.stream == null ? "Blue" : d.stream, { ph: "e.g. Blue, A, Lion" }) + "</div>" +
        '<label class="check mt"><input type="checkbox" name="sample"' + (d.sample ? " checked" : "") + "> Add 30 sample pupils to try it out (remove them later with one button)</label>" : "") +
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
      '<div class="setup-actions"><span></span><button class="btn btn-lg" data-act="su-hub-on">' + I("monitor") + 'Turn on the hub</button><button class="btn btn-primary btn-lg" data-act="su-to" data-step="share">Next' + I("right") + "</button></div>";
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
  STEP.join = function (msg) {
    var d = W.d, eg = "192.168.1.20:8080";
    return "<h1>Join the school hub</h1><p class=\"muted\">For a computer at a school that already uses School Assist. The hub's address is on the hub computer, in Settings → Offline &amp; sync. Easier: use the copy of School Assist your school shares, which joins by itself.</p>" +
      '<form data-submit="su-join" class="mt">' + field("Hub address", "url", d.url, { ph: "e.g. " + eg, attrs: 'autocomplete="off" spellcheck="false"' }) +
      msg + '<div class="setup-actions"><button type="button" class="btn btn-lg" data-act="su-to" data-step="school">' + I("back") + 'Back</button><button class="btn btn-primary btn-lg" type="submit">' + I("wifi") + "Join</button></div></form>";
  };
  function wizardHtml() {
    var m = meta();
    if (m.setupStep && Id.id()) W.step = m.setupStep;
    var list = steps(), at = list.map(function (s) { return s[0]; }).indexOf(W.step);
    var bar = at < 0 ? "" : '<ol class="setup-steps">' + list.map(function (s, i) { return '<li class="' + (i < at ? "done" : i === at ? "on" : "") + '"><span>' + (i < at ? I("check") : i + 1) + "</span>" + esc(s[1]) + "</li>"; }).join("") + "</ol>";
    var msg = W.msg ? '<p class="form-msg" role="alert">' + I("alert") + esc(W.msg) + "</p>" : "";
    var links = W.step === "school" ? '<p class="setup-links">This school already uses School Assist? <button class="link" data-act="su-to" data-step="join">Join the school hub</button>' +
      (desk() && desk().pack ? ' or <button class="link" data-act="su-packfile">open the school file</button>' : "") +
      // the hub computer was lost, stolen or broke: this computer can become the hub from the online backup (js/backup.js)
      (desk() && desk().backup && A.Backup ? '<span class="sep"></span>Lost the hub computer? <button class="link" data-act="su-to" data-step="restore">Restore from the online backup</button>' : "") +
      (A.edition === "teacher" ? "" : '<span class="sep"></span>Just looking? <button class="link" data-act="su-demo">Open the demo school</button>') + "</p>" : "";
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
    if (A.edition === "teacher") { d.level = f.level; d.stream = f.stream.trim(); d.sample = !!f.sample; }
    if (d.admin.split(" ").length < 2) return fail("Enter the full name, for example Mr T. Chirwa.");
    if (!/^\d{4}$/.test(f.pin)) return fail("The PIN must be 4 digits.");
    if (f.pin !== f.pin2) return fail("The two PINs are different. Type them again.");
    d.pin = f.pin;
    go("key");
  };
  A.act["su-key"] = function (form) {
    var d = W.d, key = String(form.key.value || "").replace(/\s+/g, ""), lic = null;
    d.key = key;
    if (key) {
      lic = A.Licence ? A.Licence.read(key) : { ok: false, error: "This copy can't read keys." };
      if (!lic.ok) return fail(lic.error);
    }
    var o = { name: d.name, shortName: d.short || d.name, abbr: d.abbr, motto: d.motto, vision: (d.vision || "").trim(), mission: (d.mission || "").trim(), aims: (d.aims || "").trim(),
      logo: d.logo || "", primary: d.primary || "", secondary: d.secondary || "", admin: d.admin, title: d.title, pin: d.pin, key: lic ? lic.key : "",
      cls: A.edition === "teacher" && d.level ? { level: d.level, stream: d.stream, sample: d.sample } : null };
    if (lic && lic.renewal) return fail("That is a renewal code. Enter the school's key (it starts SA1.), or leave this empty for now.");
    // the key's name and abbreviation win (a temporary master key has none: the school keeps what was typed)
    if (lic && !lic.master) { o.name = lic.data.name; o.abbr = lic.data.abbr; if (!d.short || d.short === d.name) o.shortName = lic.data.name; }
    Id.create(o).then(function (admin) {
      M.signIn(admin.id);
      A.Theme.apply();
      A.schoolFolder(admin);
      if (A.LastUser) A.LastUser.set(admin, {});
      meta().setupStep = desk() && desk().hub ? "hub" : "share";
      W = { step: meta().setupStep, d: {}, msg: "" };
      return S().flush().then(function () { A.Theme.apply(); redraw(); UI.toast(o.name + " is set up"); });
    }).catch(function (e) { fail(e.message || String(e)); });
  };
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
    return '<div class="callout mb">' + I("info") + '<div class="grow small"><b>This is the demo school</b>, for trying School Assist.</div><button class="btn btn-sm btn-primary" data-act="su-leave-demo">' + I("school") + "Set up my school</button></div>";
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
      return { app: "school-assist-pack", v: 1, edition: A.edition === "teacher" ? "teacher" : "school", madeAt: Date.now(),
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
