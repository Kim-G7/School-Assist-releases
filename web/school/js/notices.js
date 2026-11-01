/* Notices from the school's admins to its teachers (not in School Assist Home): a meeting, an assembly, an exam, a
 * change, an event or anything else. An admin writes one on the Notices page, to every teacher or to some. It is a
 * synced record (notices), and each teacher's own device turns the ones for them into a notification (js/alerts.js):
 * a pop-up once, and in the bell, on every device they use. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var Nt = (A.Notices = {});
  Nt.TYPES = [
    { key: "meeting", label: "Meeting", icon: "users" },
    { key: "assembly", label: "Assembly", icon: "flag" },
    { key: "exam", label: "Exam", icon: "edit" },
    { key: "change", label: "Change", icon: "refresh" },
    { key: "event", label: "Event", icon: "calendar" },
    { key: "general", label: "General", icon: "bell" },
  ];
  Nt.type = function (k) { return Nt.TYPES.filter(function (t) { return t.key === k; })[0] || Nt.TYPES[Nt.TYPES.length - 1]; };
  Nt.on = function () { return A.edition !== "home"; };
  var staff = function () { return M.teachers().filter(function (u) { return u.status !== "pending" && u.status !== "declined"; }); };

  /** The notices for this teacher (to everyone, or naming them), newest first. Admins also see every one sent. */
  Nt.forMe = function (me) {
    return S().filter("notices", function (n) {
      return n.to === "all" || (Array.isArray(n.to) && n.to.indexOf(me.id) >= 0) || !!me.isAdmin;
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  };
  Nt.toMe = function (n, me) { return n.fromId !== me.id && (n.to === "all" || (Array.isArray(n.to) && n.to.indexOf(me.id) >= 0)); };
  Nt.alertId = function (n, me) { return "al_notice_" + n.id + "_" + me.id; };
  /** Unread: a notice for me whose notification hasn't been opened or dismissed. */
  Nt.unread = function (me) {
    return Nt.forMe(me).filter(function (n) { if (!Nt.toMe(n, me)) return false; var a = S().get("alerts", Nt.alertId(n, me)); return a && !a.readAt; }).length;
  };
  Nt.nav = function (me) {
    if (!Nt.on() || me.role !== "teacher") return null;
    return { href: "#/t/notices", icon: "bell", label: "Notices", key: "notices", count: Nt.unread(me) };
  };
  Nt.alertText = function (n) {
    var t = Nt.type(n.type);
    return { title: t.label + ": " + n.title, body: (n.at ? A.fmtDateTime(n.at) + ". " : "") + String(n.body || "").replace(/\s+/g, " ").slice(0, 160) };
  };
  function whoTo(n) {
    if (n.to === "all") return "All teachers";
    var names = (n.to || []).map(function (id) { var u = M.user(id); return u ? u.name : null; }).filter(Boolean);
    return names.length > 3 ? names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more" : names.join(", ") || "Nobody";
  }

  /* ------------------------------------------------------------------ the Notices page */
  function card(n, me) {
    var t = Nt.type(n.type), from = M.user(n.fromId), past = n.at && n.at < A.startOfDay();
    return '<div class="card notice-card mb' + (past ? " past" : "") + '"><div class="row" style="align-items:flex-start;gap:12px">' +
      '<div class="alert-ico">' + I(t.icon) + '</div><div class="grow" style="min-width:0">' +
      '<div class="row wrap" style="gap:6px"><span class="badge">' + esc(t.label) + "</span>" + (n.at ? '<span class="badge ' + (past ? "" : "good") + '">' + I("clock") + esc(A.fmtDateTime(n.at)) + "</span>" : "") + "</div>" +
      '<h3 style="margin:6px 0 4px;font-size:17px">' + esc(n.title) + "</h3>" +
      (n.body ? '<p style="white-space:pre-wrap;margin:0">' + esc(n.body) + "</p>" : "") +
      '<p class="muted small" style="margin-top:8px">From ' + esc(from ? from.name : "the school") + " · " + esc(A.fmtDateTime(n.createdAt)) + (me.isAdmin ? " · To " + esc(whoTo(n)) : "") + "</p></div>" +
      (me.isAdmin ? '<button class="btn btn-ghost btn-icon btn-sm" data-act="notice-delete" data-id="' + n.id + '" aria-label="Delete this notice" data-tip="Delete">' + I("trash") + "</button>" : "") +
      "</div></div>";
  }
  A.route("t/notices", function (p, q, me) {
    if (!Nt.on()) return { redirect: "#/t/home" };
    var list = Nt.forMe(me);
    // opening the page reads them
    var read = 0;
    list.forEach(function (n) {
      var a = Nt.toMe(n, me) && S().get("alerts", Nt.alertId(n, me));
      if (a && !a.readAt) { S().put("alerts", Object.assign({}, a, { readAt: A.now() }), { silent: true }); read++; }
    });
    if (read) S().save(); // kept on the device (no redraw), and synced with the next sync
    if (A.Alerts) setTimeout(A.Alerts.refreshBell, 0);
    var html = '<div class="row wrap spread mb"><div><h2 style="font-size:22px">Notices</h2><p class="muted">' +
      (me.isAdmin ? "Tell your teachers about meetings, assemblies, exams and changes. They are notified on their phones and computers." : "Meetings, assemblies, exams and changes from the school.") + "</p></div>" +
      (me.isAdmin ? '<button class="btn btn-primary" data-act="notice-new">' + I("send") + "New notice</button>" : "") + "</div>";
    html += list.length ? list.map(function (n) { return card(n, me); }).join("")
      : '<div class="card">' + UI.empty("bell", "No notices yet", me.isAdmin ? "Send your first one: a staff meeting, an assembly or an exam." : "When the school sends a notice, it shows here and pops up on your screen.") + "</div>";
    return { title: "Notices", html: html };
  }, { role: "teacher" });

  A.act["notice-new"] = function () {
    var me = M.me();
    if (!me || !me.isAdmin) return;
    var others = staff().filter(function (u) { return u.id !== me.id; });
    UI.modal({
      title: "New notice", sub: "To your teachers", sticky: true,
      body: '<form class="stack" id="notice-form" onsubmit="return false">' +
        '<label class="field"><span>What is it about?</span><select class="select" name="type">' + Nt.TYPES.map(function (t) { return '<option value="' + t.key + '">' + esc(t.label) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Title</span><input class="input" name="title" maxlength="80" placeholder="e.g. Staff meeting in the library" required></label>' +
        '<label class="field"><span>Message</span><textarea class="input" name="body" rows="4" maxlength="1500" placeholder="What teachers need to know or bring"></textarea></label>' +
        '<div class="row wrap" style="gap:12px"><label class="field grow"><span>Date (if any)</span><input class="input" type="date" name="date"></label>' +
        '<label class="field grow"><span>Time</span><input class="input" type="time" name="time"></label></div>' +
        '<div class="field"><span>Send to</span><label class="check"><input type="radio" name="to" value="all" checked>All teachers (' + others.length + ")</label>" +
        '<label class="check"><input type="radio" name="to" value="some">Only the teachers I choose</label></div>' +
        '<div class="notice-pick hidden" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:6px 10px">' +
        (others.length ? others.map(function (u) { return '<label class="check"><input type="checkbox" name="pick" value="' + u.id + '"><span class="grow">' + esc(u.name) + '</span><span class="tiny muted">' + esc(u.title || "") + "</span></label>"; }).join("") : '<p class="muted small">No other teachers yet.</p>') +
        "</div></form>",
      onMount: function (el) {
        el.addEventListener("change", function (e) {
          if (e.target.name === "to") el.querySelector(".notice-pick").classList.toggle("hidden", e.target.value !== "some");
        });
      },
      foot: [{ label: "Cancel" }, { label: "Send", icon: "send", cls: "btn-primary", onClick: function (el) {
        var f = UI.formData(el.querySelector("#notice-form"));
        var title = String(f.title || "").trim();
        if (!title) { UI.toast("Give the notice a title.", "bad"); return false; }
        var picked = f.to === "some" ? [].concat(f.pick || []).filter(Boolean) : null;
        if (picked && !picked.length) { UI.toast("Choose at least one teacher.", "bad"); return false; }
        var at = null;
        if (f.date) { at = new Date(f.date + "T" + (f.time || "00:00")).getTime(); if (!f.time) at = A.startOfDay(at) + 8 * 3600000; }
        S().put("notices", { id: A.uid("nt"), type: f.type || "general", title: title.slice(0, 80), body: String(f.body || "").trim().slice(0, 1500),
          at: at && !isNaN(at) ? at : null, to: picked || "all", fromId: me.id, createdAt: A.now() });
        UI.toast(picked ? "Sent to " + picked.length + " teacher" + (picked.length === 1 ? "" : "s") + "." : "Sent to every teacher.");
        A.render();
        return true;
      } }],
    });
  };
  A.act["notice-delete"] = function (el) {
    var n = S().get("notices", el.getAttribute("data-id"));
    if (!n) return;
    UI.confirm("Delete “" + n.title + "”? Teachers won't see it any more.", { ok: "Delete", danger: true }).then(function (ok) {
      if (!ok) return;
      S().remove("notices", n.id);
      A.render();
    });
  };
})(window.App);
