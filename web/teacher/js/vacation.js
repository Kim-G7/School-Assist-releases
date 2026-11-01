/* Vacation mode (School Assist Teacher: with Premium, and with Standard paid for a year; js/licence.js). In the
 * holidays a teacher keeps working (a holiday class, its register, marks, schemes) in a space of their own on their
 * own device. The space is a second copy of the app's records under its own name in the device's storage
 * (js/store.js picks it at start-up). It holds the school's settings and the teacher's own account (and, if they
 * want, their class's pupils), and it is never synced: nothing in it reaches the school hub, so the school's records
 * never get a second copy of a pupil, an ID or a class.
 * Starting and stopping save what is open, then reload the app into the other space. Signing out stops it. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var V = (A.Vacation = {});
  var FLAG = "sca-vacation";
  // settings that always follow the school (the rest are copied once, then the holiday space keeps its own)
  var FOLLOW = ["licence", "clock", "features", "branding", "school"];

  V.on = function () { return !!(A.Store && A.Store.vacation); };
  V.built = function () { return !!A.Primary; }; // School Assist Teacher, and the School edition's staff since 2026-10-28
  /** May this teacher start it? Their school's plan has it, and the admin turned it on. */
  V.allowed = function () { return V.built() && !!A.Licence && A.Licence.isOn("vacation"); };

  V.nav = function (me) {
    if (!V.built() || me.role !== "teacher" || (!V.on() && !(A.Licence && A.Licence.has("vacation")))) return null;
    return { href: "#/t/vacation", icon: "sun", label: V.on() ? "Vacation mode: on" : "Vacation mode", key: "vacation", count: V.on() ? "!" : 0 };
  };
  /** On every page while it is on: where the records go, and the way back. */
  V.bar = function () {
    if (!V.on()) return "";
    return '<div class="callout vac-bar mb">' + I("sun") + '<div class="grow"><b>Vacation mode.</b> What you do now stays on this device, apart from the school\'s records.</div>' +
      '<button class="btn btn-sm" data-act="vacation-stop">Back to school records</button></div>';
  };

  V.start = function (withClass) {
    var me = M.me();
    if (!me || V.on() || !V.allowed()) return Promise.resolve(false);
    var school = S().state;
    return S().flush().then(function () { return S().space.read(me.id); }).then(function (st) {
      var fresh = !st || !st.colls;
      if (fresh) { st = S().empty(); st.meta.seededAt = A.now(); st.meta.vacationSince = A.now(); }
      var put = function (coll, rec) { if (rec && !rec._deleted) st.colls[coll][rec.id] = JSON.parse(JSON.stringify(rec)); };
      Object.keys(school.colls.settings || {}).forEach(function (id) { if (fresh || FOLLOW.indexOf(id) >= 0 || !st.colls.settings[id]) put("settings", school.colls.settings[id]); });
      put("users", me);
      put("credentials", M.credential(me.id));
      if (withClass && A.Primary) {
        var c = A.Primary.cls(me);
        if (c) { put("classes", c); (c.studentIds || []).forEach(function (id) { put("users", M.user(id)); }); }
      }
      st.meta.deviceId = school.meta.deviceId;
      st.meta.vacationOf = me.id;
      st.meta.lastOpened = A.now();
      return S().space.write(me.id, st);
    }).then(function () {
      try { localStorage.setItem(FLAG, me.id); } catch (e) { UI.toast("This device can't keep a second space (private browsing?)", "bad"); return false; }
      location.reload();
      return true;
    });
  };
  V.stop = function () {
    if (!V.on()) return Promise.resolve();
    S().state.meta.lastClosed = A.now();
    return S().flush().then(function () {
      try { localStorage.removeItem(FLAG); } catch (e) { /* nothing kept */ }
      location.hash = "";
      location.reload();
    });
  };

  // only the teacher whose holiday space it is uses it: signing out (or anyone else) goes back to the school's records
  var render = A.render;
  A.render = function () {
    if (V.on()) { var me = M.me(); if (!me || me.id !== S().vacation) { V.stop(); return; } }
    return render.apply(this, arguments);
  };

  /* ------------------------------------------------------------------ the Vacation mode page */
  A.route("t/vacation", function (p, q, me) {
    if (!V.built()) return { redirect: "#/t/home" };
    var html = '<div class="mb"><h2 style="font-size:22px">Vacation mode</h2><p class="muted">Keep working in the holidays without touching the school\'s records.</p></div>';
    if (V.on()) {
      var since = S().state.meta.vacationSince;
      html += '<div class="card card-pad" style="max-width:760px"><h3>' + I("sun") + " You are in vacation mode</h3>" +
        '<p class="mt-sm">Your holiday class, registers, marks and plans are kept on this device only, in a space of their own. Nothing here goes to the school, so the school\'s records get no second pupils, IDs or classes.</p>' +
        (since ? '<p class="small muted mt-sm">Holiday records since ' + esc(A.fmtDateLong(since)) + ".</p>" : "") +
        '<div class="row wrap mt"><button class="btn btn-primary" data-act="vacation-stop">' + I("school") + "Back to school records</button></div>" +
        '<p class="tiny muted mt">They stay here for next time. Signing out also takes you back to the school\'s records.</p></div>';
      return { title: "Vacation mode", html: html };
    }
    if (!A.Licence.has("vacation")) {
      html += '<div class="card card-pad" style="max-width:760px"><h3>' + I("lock") + " Not on your school's plan</h3>" +
        '<p class="mt-sm">Vacation mode comes with Premium, and with the yearly Standard package. To add it, contact Golden Technologies.</p></div>';
      return { title: "Vacation mode", html: html };
    }
    if (!V.allowed()) {
      html += '<div class="card card-pad" style="max-width:760px"><h3>' + I("info") + " Not turned on yet</h3>" +
        '<p class="mt-sm">' + (me.isAdmin ? 'Your plan includes it. Turn it on for your teachers in <a href="#/t/settings?s=licence">Settings → Plan &amp; licence</a>.' : "Your school's plan includes it. Ask an admin to turn it on in Settings → Plan & licence.") + "</p></div>";
      return { title: "Vacation mode", html: html };
    }
    var c = A.Primary && A.Primary.cls(me);
    html += '<div class="card card-pad" style="max-width:760px"><h3>' + I("sun") + " Work in the holidays</h3>" +
      '<p class="mt-sm">Holiday lessons, extra classes or tuition: in vacation mode you add a holiday class and its pupils, take registers and keep marks as usual. It all stays on this device, in a space of its own, and never reaches the school, so the school\'s records get no second pupils, IDs or classes.</p>' +
      '<div id="vac-before" class="small muted mt-sm"></div>' +
      (c ? '<label class="check mt"><input type="checkbox" id="vac-class"> Start with a copy of my class (' + esc(c.name || "my class") + ", " + (c.studentIds || []).length + " pupils)</label>" : "") +
      '<div class="row wrap mt"><button class="btn btn-primary" data-act="vacation-start">' + I("sun") + "Start vacation mode</button></div>" +
      '<p class="tiny muted mt">Other teachers and the school see none of it. Back at school, choose Back to school records (or sign out).</p></div>';
    return {
      title: "Vacation mode", html: html,
      mount: function () {
        S().space.read(me.id).then(function (st) {
          var box = document.getElementById("vac-before");
          if (!box || !st || !st.colls) return;
          var n = Object.keys(st.colls.users || {}).filter(function (id) { var u = st.colls.users[id]; return u && !u._deleted && u.role === "student"; }).length;
          box.innerHTML = I("info") + " Your holiday records from before are still here" + (n ? " (" + n + " pupil" + (n === 1 ? "" : "s") + ")" : "") +
            (st.meta.lastClosed ? ", last used " + esc(A.fmtDateLong(st.meta.lastClosed)) : "") + '. <button class="btn btn-sm btn-ghost" data-act="vacation-clear">Delete them</button>';
        });
      },
    };
  }, { role: "teacher" });

  A.act["vacation-start"] = function () {
    var box = document.getElementById("vac-class");
    V.start(!!(box && box.checked));
  };
  A.act["vacation-stop"] = function () { V.stop(); };
  A.act["vacation-clear"] = function () {
    var me = M.me();
    if (!me || V.on()) return;
    UI.confirm("Delete your holiday records on this device? The school's records are not touched.", { ok: "Delete", danger: true }).then(function (ok) {
      if (!ok) return;
      S().space.drop(me.id).then(function () { UI.toast("Holiday records deleted"); A.render(); });
    });
  };
})(window.App);
