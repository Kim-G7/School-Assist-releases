/* School fees (School Assist Premium, 2026-11-09).
 *
 * The bursar and the accountant have a view of the system of their own: staff accounts with the title Bursar or
 * Accountant see and change only fees, and the hub sends them only what these pages need (hub-access.cjs, scope
 * "finance"). Nobody else receives these records.
 *
 *   feeschedules  "fs_config" { currency, transport, candidate } and "fs_<year>_t<term>" { amounts: { form: amount } }
 *   feeaccounts   "fa_<year>_t<term>_<student>" { due (this student's own amount, if different), plan: 1|2|3, stages: [{ amount, by }] }
 *   feepayments   { studentId, kind: "fees"|"transport", year, term, month: "2026-11", amount, date, method, ref, by }
 *   transportlist "tr_<student>" { studentId, route }
 *   candidates    "cand_<year>_<student>" { studentId, year, registered, date, candidateNo, amount }
 */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var F = (A.Fees = {});
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var STATUS = { full: ["good", "Fully paid"], half: ["warn", "Half paid"], none: ["bad", "Not paid"], unset: ["", "No fee set"] };
  var PAGES = ["fees", "fee", "feesetup", "transport", "candidates", "notices", "settings"];

  F.available = function () { return A.edition !== "teacher" && A.edition !== "home" && !A.Cloud && !!A.Licence && A.Licence.isOn("fees") && A.Sync.hubHasRules(); };
  /** The bursar's and accountant's accounts: fees and nothing else. */
  F.isFinance = function (u) { return !!u && u.role === "teacher" && /^(bursar|accountant)$/i.test(String(u.title || "").trim()) && F.available(); };
  F.allowed = function (page) { return PAGES.indexOf(page) >= 0; };
  F.nav = function (me) {
    return [
      { href: "#/t/fees", icon: "layers", label: "School fees", key: "fees", match: ["fee"] },
      { href: "#/t/transport", icon: "bus", label: "Transport", key: "transport" },
      { href: "#/t/candidates", icon: "award", label: "Candidates", key: "candidates" },
      { href: "#/t/feesetup", icon: "edit", label: "Fee amounts", key: "feesetup" },
      A.Notices && me ? A.Notices.nav(me) : null, // the school's notices to them (2026-11-10)
      { href: "#/t/settings", icon: "sliders", label: "Settings", key: "settings" },
    ].filter(Boolean);
  };
  /** Their notifications on the dashboard (2026-11-10): the school's notices to them and anything else for them, newest
      first, each opening its page. (A hub computer older than 1.8.3 sends them no notices: what they have shows.) */
  function notifications(me) {
    var N = A.Notices, Al = A.Alerts, items = [];
    if (N) N.forMe(me).filter(function (n) { return N.toMe(n, me); }).slice(0, 5).forEach(function (n) {
      var t = N.type(n.type), al = S().get("alerts", N.alertId(n, me)), fresh = al ? !al.readAt : n.createdAt > A.now() - 3 * 86400000;
      items.push({ at: n.createdAt, html: '<a class="list-row" href="#/t/notices"><div class="alert-ico">' + I(t.icon) + '</div><div class="grow"><div class="title">' + esc(t.label + ": " + n.title) + (fresh ? ' <span class="badge brand">New</span>' : "") + "</div>" +
        '<div class="meta"><span>' + esc(n.at ? A.fmtDateTime(n.at) : A.fmtDate(n.createdAt)) + "</span>" + (n.body ? '<span class="sep"></span><span>' + esc(String(n.body).replace(/\s+/g, " ").slice(0, 90)) + "</span>" : "") + "</div></div>" + I("right") + "</a>" });
    });
    if (Al) Al.mine(me.id).filter(function (a) { return a.kind !== "notice" && !a.readAt && !a.dismissedAt; }).slice(0, 5).forEach(function (a) {
      var href = Al.href(a), page = (href.split("?")[0].split("/")[2] || "");
      items.push({ at: a.createdAt, html: '<a class="list-row" href="' + esc(F.allowed(page) ? href : "#/t/fees") + '"><div class="alert-ico">' + I("bell") + '</div><div class="grow"><div class="title">' + esc(a.title || "") + ' <span class="badge brand">New</span></div>' +
        '<div class="meta"><span>' + esc(A.relTime(a.createdAt)) + "</span>" + (a.body ? '<span class="sep"></span><span>' + esc(String(a.body).slice(0, 90)) + "</span>" : "") + "</div></div>" + I("right") + "</a>" });
    });
    items.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return '<div class="section-title"><h2>Notifications</h2><span class="grow"></span>' + (N ? '<a class="btn btn-sm" href="#/t/notices">' + I("bell") + "All notices</a>" : "") + "</div>" +
      '<div class="card">' + (items.length ? items.slice(0, 5).map(function (x) { return x.html; }).join("") : UI.empty("bell", "Nothing new", "Notices from the school, such as staff meetings and events, show here.")) + "</div>";
  }

  /* ------------------------------------------------------------------ the head's read-only summary (hub-fees.cjs) */
  F.canSummary = function (u) { return !!u && u.role === "teacher" && A.rank(u.title) === 2 && F.available() && !F.isFinance(u); };
  F.headNav = function (me) { return F.canSummary(me) ? { href: "#/t/feesummary", icon: "layers", label: "School fees", key: "feesummary" } : null; };
  A.route("t/feesummary", function (p, q, me) {
    if (!F.canSummary(me)) return { redirect: A.home(me) };
    var t = [1, 2, 3].indexOf(Number(q.t)) >= 0 ? Number(q.t) : conf().term;
    return { title: "School fees", html: pills(t, "#/t/feesummary?") + '<div id="fee-summary"><div class="card card-pad muted">Asking the school hub…</div></div>', mount: function () {
      var box = document.getElementById("fee-summary");
      A.Sync.hubPost("/api/fees/summary", { term: t }).then(function (r) {
        if (!box.isConnected) return;
        var cash = function (n) { return esc(r.currency) + " " + (Math.round(n * 100) / 100).toLocaleString("en-US"); }, sum = function (k) { return r.forms.reduce(function (a, f) { return a + f[k]; }, 0); };
        box.innerHTML = '<div class="grid g-4">' + UI.stat("layers", cash(sum("due")), "Expected this term") + UI.stat("checkCircle", cash(sum("paid")), "Collected", true) + UI.stat("alert", cash(Math.max(0, sum("due") - sum("paid"))), "Still to come") + UI.stat("users", sum("full") + " of " + sum("students"), "Students fully paid") + "</div>" +
          '<div class="section-title"><h2>Forms</h2><span class="sub">read only: the bursar keeps these records</span></div><div class="card">' + (r.forms.length ? r.forms.map(function (f) {
            return '<div class="list-row"><div class="grow"><div class="title">' + esc(f.level) + '</div><div class="row wrap mt-sm" style="gap:6px"><span class="badge good">' + f.full + ' fully paid</span><span class="badge warn">' + f.half + ' half paid</span><span class="badge bad">' + f.none + " not paid</span></div>" + UI.bar(f.due ? Math.round(f.paid / f.due * 100) : 0) + '</div><div class="fee-sum tnum"><b>' + cash(f.paid) + "</b><span>of " + cash(f.due) + "</span></div></div>";
          }).join("") : UI.empty("users", "No students yet")) + "</div>";
      }).catch(function (e) { if (box.isConnected) box.innerHTML = '<div class="card">' + UI.empty("wifiOff", "Can't reach the school hub", e.message) + "</div>"; });
    } };
  }, { role: "teacher" });

  /* ------------------------------------------------------------------ the sums */
  var conf = function () { return A.Primary.conf(); };
  var config = function () { return S().get("feeschedules", "fs_config") || { id: "fs_config", currency: "US$", transport: 0, candidate: 0 }; };
  var money = function (n) { return config().currency + " " + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US"); };
  var today = function () { return A.isoDate(); };
  var num = function (v) { var n = Number(String(v == null ? "" : v).replace(/[^\d.]/g, "")); return isFinite(n) ? n : 0; };
  var schedule = function (y, t) { return S().get("feeschedules", "fs_" + y + "_t" + t) || { amounts: {} }; };
  var accountId = function (y, t, sid) { return "fa_" + y + "_t" + t + "_" + sid; };
  var account = function (y, t, sid) { return S().get("feeaccounts", accountId(y, t, sid)) || {}; };
  var students = function () { return M.students().filter(function (u) { return !u.leftAt && u.status !== "pending" && u.status !== "declined"; }); };
  function homeIndex() { var o = {}; S().filter("classes", function (c) { return c.homeroom; }).forEach(function (c) { (c.studentIds || []).forEach(function (id) { o[id] = c; }); }); return o; }
  var classOf = function (u, ix) { var h = ix[u.id]; return h ? h.name : [u.level, u.stream].filter(Boolean).join(" "); };
  function payments(sid, kind) { return S().filter("feepayments", function (p) { return p.studentId === sid && p.kind === kind; }); }
  /** What a student owes and has paid for a term, and where that leaves them. */
  function state(u, y, t, all) {
    var acc = account(y, t, u.id), set = (schedule(y, t).amounts || {})[u.level], due = acc.due != null && acc.due !== "" ? Number(acc.due) : Number(set) || 0;
    var paid = (all || payments(u.id, "fees")).filter(function (p) { return String(p.year) === String(y) && Number(p.term) === Number(t); }).reduce(function (a, p) { return a + Number(p.amount || 0); }, 0);
    return { due: due, paid: paid, balance: Math.max(0, due - paid), status: due <= 0 ? "unset" : paid >= due ? "full" : paid > 0 ? "half" : "none", acc: acc };
  }
  /** The payment plan's stages, each marked paid or not: what has been paid covers them in order. */
  function stages(st) {
    var list = st.acc.stages || [], left = st.paid;
    return list.map(function (x, i) {
      var amt = Number(x.amount) || 0, got = Math.min(left, amt); left -= got;
      return { n: i + 1, amount: amt, by: x.by, got: got, done: got >= amt && amt > 0, late: got < amt && !!x.by && x.by < today() };
    });
  }
  function planText(st) {
    var n = (st.acc.stages || []).length;
    if (n < 2) return "Once-off";
    var next = stages(st).filter(function (x) { return !x.done; })[0];
    return n + " stages" + (next ? " · stage " + next.n + (next.by ? " by " + A.fmtDate(Date.parse(next.by + "T12:00:00Z")) : "") + (next.late ? " (late)" : "") : "");
  }
  function byPeriod(q) { var c = conf(), t = [1, 2, 3].indexOf(Number(q.t)) >= 0 ? Number(q.t) : c.term; return { y: c.year, t: t, q: "&t=" + t }; }
  var pills = function (t, base) { return '<div class="pill-tabs">' + [1, 2, 3].map(function (n) { return '<button class="' + (n === t ? "on" : "") + '" data-act="goto" data-href="' + base + "t=" + n + '">Term ' + n + "</button>"; }).join("") + "</div>"; };
  var guard = function (me) { return F.isFinance(me) ? null : { redirect: A.home(me) }; };

  /* ------------------------------------------------------------------ the dashboard: forms, then students */
  A.route("t/fees", function (p, q, me) {
    var no = guard(me); if (no) return no;
    var per = byPeriod(q), base = "#/t/fees?", list = students(), forms = {}, ix = homeIndex(), order = M.structure().levels;
    var pay = {}; S().filter("feepayments", function (x) { return x.kind === "fees"; }).forEach(function (x) { (pay[x.studentId] = pay[x.studentId] || []).push(x); });
    list.forEach(function (u) { var k = u.level || "No form", f = (forms[k] = forms[k] || { level: k, kids: [], full: 0, half: 0, none: 0, unset: 0, due: 0, paid: 0 }), s = state(u, per.y, per.t, pay[u.id] || []); s.u = u; f.kids.push(s); f[s.status]++; f.due += s.due; f.paid += Math.min(s.paid, s.due || s.paid); });
    var rows = Object.keys(forms).map(function (k) { return forms[k]; }).sort(function (a, b) { var x = order.indexOf(a.level), y = order.indexOf(b.level); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    var form = q.f ? forms[q.f] : null;
    if (form) {
      var which = STATUS[q.s] ? q.s : "none", tabs = '<div class="pill-tabs">' + ["full", "half", "none"].map(function (k) { return '<button class="' + (k === which ? "on" : "") + '" data-act="goto" data-href="#/t/fees?f=' + encodeURIComponent(form.level) + per.q + "&s=" + k + '">' + STATUS[k][1] + " (" + form[k] + ")</button>"; }).join("") + "</div>";
      var shown = form.kids.filter(function (s) { return s.status === which; }).sort(function (a, b) { return classOf(a.u, ix).localeCompare(classOf(b.u, ix)) || a.u.name.localeCompare(b.u.name); });
      var body = shown.length ? shown.map(function (s) { return row(s, ix, per); }).join("") : UI.empty("users", "Nobody here");
      return { title: form.level, crumbs: [{ label: "School fees", href: "#/t/fees?t=" + per.t }, { label: form.level }], html: pills(per.t, "#/t/fees?f=" + encodeURIComponent(form.level) + "&") + tabs + '<div class="card">' + body + "</div>" + (form.unset ? '<p class="small muted mt">' + form.unset + " student" + (form.unset === 1 ? " has" : "s have") + " no fee set for this term.</p>" : "") };
    }
    var due = rows.reduce(function (a, f) { return a + f.due; }, 0), paid = rows.reduce(function (a, f) { return a + f.paid; }, 0), full = rows.reduce(function (a, f) { return a + f.full; }, 0);
    var html = pills(per.t, base) + '<div class="grid g-4">' + UI.stat("layers", money(due), "Expected this term") + UI.stat("checkCircle", money(paid), "Collected", true) + UI.stat("alert", money(Math.max(0, due - paid)), "Still to come") + UI.stat("users", full + " of " + list.length, "Students fully paid") + "</div>";
    if (!due) html += '<div class="callout warn mt">' + I("info") + '<div>No fees set for Term ' + per.t + ' yet. <a class="link" href="#/t/feesetup?t=' + per.t + '">Set the fee amounts</a>.</div></div>';
    html += notifications(me) + '<div class="section-title"><h2>Forms</h2></div><div class="card">' + (rows.length ? rows.map(function (f) {
      return '<a class="list-row" href="#/t/fees?f=' + encodeURIComponent(f.level) + per.q + '"><div class="grow"><div class="title">' + esc(f.level) + '</div><div class="row wrap mt-sm" style="gap:6px"><span class="badge good">' + f.full + ' fully paid</span><span class="badge warn">' + f.half + ' half paid</span><span class="badge bad">' + f.none + " not paid</span></div>" + UI.bar(f.due ? Math.round(f.paid / f.due * 100) : 0) + "</div>" + I("right") + "</a>";
    }).join("") : UI.empty("users", "No students yet", "Students appear here once the school enters them.")) + "</div>";
    return { title: "School fees", html: html };
  }, { role: "teacher" });
  function row(s, ix, per) {
    return '<a class="list-row" href="#/t/fee/' + s.u.id + "?t=" + per.t + '"><div class="grow"><div class="title">' + esc(s.u.name) + '</div><div class="meta"><span class="tnum">' + esc(s.u.studentNo || "") + '</span><span class="sep"></span><span>' + esc(classOf(s.u, ix)) + '</span><span class="sep"></span><span>' + esc(planText(s)) + '</span></div></div><div class="fee-sum tnum"><b>' + money(s.paid) + "</b><span>of " + money(s.due) + "</span></div>" + I("right") + "</a>";
  }

  /* ------------------------------------------------------------------ one student */
  A.route("t/fee/:id", function (p, q, me) {
    var no = guard(me); if (no) return no;
    var u = M.user(p.id); if (!u || u.role !== "student") return { redirect: "#/t/fees" };
    var per = byPeriod(q), s = state(u, per.y, per.t), ix = homeIndex(), list = payments(u.id, "fees").filter(function (x) { return String(x.year) === String(per.y) && Number(x.term) === per.t; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var st = stages(s), tone = STATUS[s.status];
    var html = pills(per.t, "#/t/fee/" + u.id + "?") + '<p class="muted mb"><span class="tnum">' + esc(u.studentNo || "") + "</span> · " + esc(classOf(u, ix)) + ' · <span class="badge ' + tone[0] + '">' + tone[1] + "</span></p>" +
      '<div class="grid g-3">' + UI.stat("layers", money(s.due), "Fee for Term " + per.t) + UI.stat("checkCircle", money(s.paid), "Paid", true) + UI.stat("alert", money(s.balance), "Balance") + "</div>" +
      '<div class="row wrap mt"><button class="btn btn-primary" data-act="fee-pay" data-id="' + u.id + '" data-t="' + per.t + '">' + I("plus") + 'Record a payment</button><button class="btn" data-act="fee-plan" data-id="' + u.id + '" data-t="' + per.t + '">' + I("calendar") + 'Payment plan</button><button class="btn btn-ghost" data-act="fee-due" data-id="' + u.id + '" data-t="' + per.t + '">' + I("edit") + "This student's fee</button></div>";
    html += '<div class="section-title"><h2>Payment plan</h2><span class="sub">' + esc(st.length > 1 ? st.length + " stages" : "Once-off") + "</span></div><div class=\"card\">" + (st.length > 1 ? st.map(function (x) {
      return '<div class="list-row"><div class="grow"><div class="title">Stage ' + x.n + '</div><div class="meta"><span>' + (x.by ? "By " + esc(A.fmtDate(Date.parse(x.by + "T12:00:00Z"))) : "No date") + '</span></div></div><span class="tnum small">' + money(x.got) + " of " + money(x.amount) + '</span><span class="badge ' + (x.done ? "good" : x.late ? "bad" : "") + '">' + (x.done ? "Paid" : x.late ? "Late" : "To pay") + "</span></div>";
    }).join("") : '<div class="card-pad small muted">Paid once-off. Use Payment plan to split it into two or three stages.</div>') + "</div>";
    html += '<div class="section-title"><h2>Payments</h2></div><div class="card">' + (list.length ? list.map(function (x) {
      return '<div class="list-row"><div class="grow"><div class="title tnum">' + money(x.amount) + '</div><div class="meta"><span>' + esc(A.fmtDate(Date.parse(x.date + "T12:00:00Z"))) + "</span>" + (x.method ? '<span class="sep"></span><span>' + esc(x.method) + "</span>" : "") + (x.ref ? '<span class="sep"></span><span>' + esc(x.ref) + "</span>" : "") + '</div></div><button class="btn btn-sm btn-ghost" data-act="fee-undo" data-id="' + x.id + '">' + I("x") + "Remove</button></div>";
    }).join("") : UI.empty("layers", "No payments this term")) + "</div>";
    return { title: u.name, crumbs: [{ label: "School fees", href: "#/t/fees?t=" + per.t }, { label: u.level || "", href: "#/t/fees?f=" + encodeURIComponent(u.level || "") + per.q }, { label: u.name }], html: html };
  }, { role: "teacher" });

  var METHODS = ["Cash", "EcoCash", "Bank transfer", "Swipe", "Other"];
  function payForm(amount) {
    return '<form id="fee-form" class="form-grid"><label class="field"><span>Amount (' + esc(config().currency) + ')</span><input class="input" name="amount" inputmode="decimal" value="' + esc(amount || "") + '" autocomplete="off"></label>' +
      '<label class="field"><span>Date</span><input class="input" type="date" name="date" value="' + today() + '"></label>' +
      '<label class="field"><span>How</span><select class="select" name="method">' + METHODS.map(function (m) { return "<option>" + m + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Receipt or reference (optional)</span><input class="input" name="ref" autocomplete="off"></label></form>';
  }
  function readPay(m, extra) {
    var f = UI.formData(m.querySelector("#fee-form")), amt = num(f.amount);
    if (!(amt > 0)) { UI.toast("Enter the amount", "bad"); return null; }
    if (!f.date) { UI.toast("Enter the date", "bad"); return null; }
    return Object.assign({ id: A.uid("pay"), amount: amt, date: f.date, method: f.method, ref: f.ref.trim(), by: M.me().id }, extra);
  }
  A.act["fee-pay"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), t = Number(el.getAttribute("data-t")), y = conf().year, s = state(u, y, t), next = stages(s).filter(function (x) { return !x.done; })[0];
    UI.modal({ title: "Payment: " + u.name, sub: "Term " + t + " · balance " + money(s.balance), body: payForm(next ? next.amount - next.got : s.balance || ""), foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
      var rec = readPay(m, { studentId: u.id, kind: "fees", year: String(y), term: t }); if (!rec) return false;
      S().put("feepayments", rec); UI.toast("Saved"); A.render();
    } }] });
  };
  A.act["fee-undo"] = function (el) {
    var id = el.getAttribute("data-id");
    UI.confirm("Remove this payment?", { danger: true, ok: "Remove" }).then(function (ok) { if (ok) { S().remove("feepayments", id); A.render(); } });
  };
  function saveAccount(y, t, sid, patch) { var id = accountId(y, t, sid); S().put("feeaccounts", Object.assign({ id: id, studentId: sid, year: String(y), term: t }, S().get("feeaccounts", id) || {}, patch)); }
  A.act["fee-due"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), t = Number(el.getAttribute("data-t")), y = conf().year, acc = account(y, t, u.id), set = (schedule(y, t).amounts || {})[u.level];
    UI.modal({ title: "This student's fee", sub: u.name + " · Term " + t + ". Leave it empty to use the form's fee" + (set ? " (" + money(set) + ")" : "") + ".", body: '<form id="fee-form"><label class="field"><span>Fee for this student</span><input class="input" name="due" inputmode="decimal" value="' + esc(acc.due == null ? "" : acc.due) + '" autocomplete="off"></label></form>',
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) { var v = UI.formData(m.querySelector("#fee-form")).due.trim(); saveAccount(y, t, u.id, { due: v === "" ? null : num(v), stages: null }); UI.toast("Saved"); A.render(); } }] });
  };
  /** Once-off, or two or three stages: the fee split evenly at first, each stage with its own amount and date. */
  A.act["fee-plan"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), t = Number(el.getAttribute("data-t")), y = conf().year, s = state(u, y, t), have = s.acc.stages || [], range = conf().terms[t] || {};
    if (s.due <= 0) return UI.toast("Set the fee first (Fee amounts)", "bad");
    var dateAt = function (i, n) { var a = Date.parse((range.opens || today()) + "T12:00:00Z"), b = Date.parse((range.closes || range.opens || today()) + "T12:00:00Z"); return new Date(a + (b - a) * i / Math.max(n, 1)).toISOString().slice(0, 10); };
    var rowsFor = function (n) {
      var split = Math.floor(s.due / n * 100) / 100, out = "";
      for (var i = 0; i < n; i++) {
        var h = have.length === n ? have[i] : { amount: i === n - 1 ? Math.round((s.due - split * (n - 1)) * 100) / 100 : split, by: dateAt(i, n) };
        out += '<div class="fee-stage"><b>Stage ' + (i + 1) + '</b><label class="field"><span>Amount</span><input class="input" name="a' + i + '" inputmode="decimal" value="' + esc(h.amount) + '"></label><label class="field"><span>Pay by</span><input class="input" type="date" name="b' + i + '" value="' + esc(h.by || "") + '"></label></div>';
      }
      return out;
    };
    UI.modal({ title: "Payment plan", sub: u.name + " · Term " + t + " · fee " + money(s.due),
      body: '<form id="fee-form"><label class="field"><span>How the parent pays</span><select class="select" name="plan"><option value="1"' + (have.length < 2 ? " selected" : "") + '>Once-off</option><option value="2"' + (have.length === 2 ? " selected" : "") + '>Two stages</option><option value="3"' + (have.length === 3 ? " selected" : "") + '>Three stages</option></select></label><div id="fee-stages"></div></form>',
      onMount: function (m) {
        var sel = m.querySelector("[name=plan]"), box = m.querySelector("#fee-stages"), draw = function () { box.innerHTML = sel.value === "1" ? "" : rowsFor(Number(sel.value)); };
        sel.addEventListener("change", draw); draw();
      },
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#fee-form")), n = Number(f.plan), list = [];
        for (var i = 0; n > 1 && i < n; i++) list.push({ amount: num(f["a" + i]), by: f["b" + i] });
        if (list.length && Math.abs(list.reduce(function (a, x) { return a + x.amount; }, 0) - s.due) > 0.009) { UI.toast("The stages must add up to " + money(s.due), "bad"); return false; }
        saveAccount(y, t, u.id, { plan: n, stages: list.length ? list : null }); UI.toast("Saved"); A.render();
      } }] });
  };

  /* ------------------------------------------------------------------ fee amounts */
  A.route("t/feesetup", function (p, q, me) {
    var no = guard(me); if (no) return no;
    var per = byPeriod(q), sch = schedule(per.y, per.t), c = config(), st = M.structure();
    var html = pills(per.t, "#/t/feesetup?") + '<form data-submit="fee-setup" data-t="' + per.t + '" class="card card-pad" style="max-width:620px"><div class="form-grid"><label class="field"><span>Currency</span><input class="input" name="currency" value="' + esc(c.currency) + '" autocomplete="off"></label><div class="field"></div>' +
      st.levels.map(function (l) { return '<label class="field"><span>' + esc(l) + " fee, Term " + per.t + '</span><input class="input" name="lv_' + esc(l) + '" inputmode="decimal" value="' + esc((sch.amounts || {})[l] || "") + '" autocomplete="off"></label>'; }).join("") +
      '<label class="field"><span>Transport, per month</span><input class="input" name="transport" inputmode="decimal" value="' + esc(c.transport || "") + '" autocomplete="off"></label><label class="field"><span>Candidate registration fee</span><input class="input" name="candidate" inputmode="decimal" value="' + esc(c.candidate || "") + '" autocomplete="off"></label></div>' +
      '<button class="btn btn-primary mt" type="submit">' + I("check") + "Save</button></form>";
    return { title: "Fee amounts", html: html };
  }, { role: "teacher" });
  A.act["fee-setup"] = function (form) {
    var d = UI.formData(form), t = Number(form.getAttribute("data-t")), y = conf().year, amounts = {};
    M.structure().levels.forEach(function (l) { var v = num(d["lv_" + l]); if (v > 0) amounts[l] = v; });
    S().put("feeschedules", { id: "fs_" + y + "_t" + t, year: String(y), term: t, amounts: amounts });
    S().put("feeschedules", { id: "fs_config", currency: d.currency.trim() || "US$", transport: num(d.transport), candidate: num(d.candidate) });
    UI.toast("Saved"); A.render();
  };

  /* ------------------------------------------------------------------ transport: who is on it, and each month's renewal */
  A.route("t/transport", function (p, q, me) {
    var no = guard(me); if (no) return no;
    var y = conf().year, nowM = today().slice(0, 7), month = /^\d{4}-\d{2}$/.test(q.m || "") ? q.m : nowM.slice(0, 4) === y ? nowM : y + "-01", ix = homeIndex();
    var on = S().all("transportlist").map(function (r) { return { r: r, u: M.user(r.studentId) }; }).filter(function (x) { return x.u && !x.u._deleted && !x.u.leftAt; }).sort(function (a, b) { return a.u.name.localeCompare(b.u.name); });
    var pay = {}; S().filter("feepayments", function (x) { return x.kind === "transport"; }).forEach(function (x) { (pay[x.studentId] = pay[x.studentId] || {})[x.month] = x; });
    var mname = MONTHS[Number(month.slice(5)) - 1], done = on.filter(function (x) { return (pay[x.u.id] || {})[month]; }), left = on.filter(function (x) { return !(pay[x.u.id] || {})[month]; });
    var tabs = '<div class="pill-tabs">' + MONTHS.map(function (m, i) { var k = y + "-" + ("0" + (i + 1)).slice(-2); return '<button class="' + (k === month ? "on" : "") + '" data-act="goto" data-href="#/t/transport?m=' + k + '">' + m + "</button>"; }).join("") + "</div>";
    var line = function (x, paid) {
      var got = MONTHS.filter(function (m, i) { return (pay[x.u.id] || {})[y + "-" + ("0" + (i + 1)).slice(-2)]; }).length, rec = (pay[x.u.id] || {})[month];
      return '<div class="list-row"><div class="grow"><div class="title">' + esc(x.u.name) + '</div><div class="meta"><span class="tnum">' + esc(x.u.studentNo || "") + '</span><span class="sep"></span><span>' + esc(classOf(x.u, ix)) + "</span>" + (x.r.route ? '<span class="sep"></span><span>' + esc(x.r.route) + "</span>" : "") + '<span class="sep"></span><span>' + got + " month" + (got === 1 ? "" : "s") + " paid this year</span></div></div>" +
        (paid ? '<span class="tnum small">' + money(rec.amount) + '</span><button class="btn btn-sm btn-ghost" data-act="tr-undo" data-id="' + rec.id + '">Undo</button>' : '<button class="btn btn-sm btn-primary" data-act="tr-renew" data-id="' + x.u.id + '" data-m="' + month + '">' + I("check") + "Renew</button>") + '<button class="btn btn-sm btn-ghost" data-act="tr-off" data-id="' + x.r.id + '" aria-label="Take off transport">' + I("x") + "</button></div>";
    };
    var html = '<div class="row wrap spread mb"><p class="muted">' + on.length + " student" + (on.length === 1 ? "" : "s") + ' on transport.</p><button class="btn btn-primary" data-act="tr-add">' + I("plus") + "Add a student</button></div>" + tabs +
      '<div class="section-title"><h2>Renewed for ' + mname + '</h2><span class="sub">' + done.length + '</span></div><div class="card">' + (done.length ? done.map(function (x) { return line(x, true); }).join("") : UI.empty("bus", "Nobody yet")) + "</div>" +
      '<div class="section-title"><h2>Not renewed for ' + mname + '</h2><span class="sub">' + left.length + '</span></div><div class="card">' + (left.length ? left.map(function (x) { return line(x, false); }).join("") : UI.empty("checkCircle", on.length ? "Everyone has renewed" : "No students on transport yet")) + "</div>";
    return { title: "Transport", html: html };
  }, { role: "teacher" });
  function pickStudent(title, onPick, skip) {
    var list = students().filter(function (u) { return !skip || !skip[u.id]; });
    UI.modal({ title: title, body: '<form id="fee-form"><label class="field"><span>Student</span><input class="input" name="who" list="fee-who" placeholder="Type a name or student ID" autocomplete="off"><datalist id="fee-who">' + list.map(function (u) { return '<option value="' + esc(u.name + " · " + (u.studentNo || "")) + '">'; }).join("") + '</datalist></label><label class="field"><span>Route (optional)</span><input class="input" name="route" autocomplete="off"></label></form>',
      foot: [{ label: "Cancel" }, { label: "Add", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#fee-form")), v = f.who.trim(), u = list.filter(function (x) { return (x.name + " · " + (x.studentNo || "")) === v || x.studentNo === v; })[0];
        if (!u) { UI.toast("Choose a student from the list", "bad"); return false; }
        onPick(u, f.route.trim());
      } }] });
  }
  A.act["tr-add"] = function () {
    var on = {}; S().all("transportlist").forEach(function (r) { on[r.studentId] = 1; });
    pickStudent("Add a student to transport", function (u, route) { S().put("transportlist", { id: "tr_" + u.id, studentId: u.id, route: route, from: today() }); UI.toast("Added"); A.render(); }, on);
  };
  A.act["tr-off"] = function (el) { var id = el.getAttribute("data-id"); UI.confirm("Take this student off transport? Their past payments are kept.", { danger: true, ok: "Take off" }).then(function (ok) { if (ok) { S().remove("transportlist", id); A.render(); } }); };
  A.act["tr-renew"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), m0 = el.getAttribute("data-m");
    UI.modal({ title: "Transport: " + u.name, sub: MONTHS[Number(m0.slice(5)) - 1] + " " + m0.slice(0, 4), body: payForm(config().transport || ""), foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
      var rec = readPay(m, { studentId: u.id, kind: "transport", year: m0.slice(0, 4), month: m0 }); if (!rec) return false;
      S().put("feepayments", rec); UI.toast("Saved"); A.render();
    } }] });
  };
  A.act["tr-undo"] = function (el) { var id = el.getAttribute("data-id"); UI.confirm("Undo this month's renewal?", { danger: true, ok: "Undo" }).then(function (ok) { if (ok) { S().remove("feepayments", id); A.render(); } }); };

  /* ------------------------------------------------------------------ candidate registration: Form 4 and A Level */
  var candidateLevels = function () { return M.structure().levels.filter(function (l) { return /form\s*4|lower\s*6|upper\s*6|o[\s-]?level|a[\s-]?level/i.test(l); }); };
  A.route("t/candidates", function (p, q, me) {
    var no = guard(me); if (no) return no;
    var levels = candidateLevels(), y = conf().year, ix = homeIndex();
    if (!levels.length) return { title: "Candidates", html: '<div class="card">' + UI.empty("award", "No exam forms", "This school has no Form 4, Lower 6 or Upper 6.") + "</div>" };
    var level = levels.indexOf(q.f) >= 0 ? q.f : levels[0], kids = students().filter(function (u) { return u.level === level; });
    var rec = function (u) { var r = S().get("candidates", "cand_" + y + "_" + u.id); return r && r.registered ? r : null; };
    var yes = kids.filter(rec), notYet = kids.filter(function (u) { return !rec(u); });
    var count = function (l) { return students().filter(function (u) { return u.level === l && rec(u); }).length + " of " + students().filter(function (u) { return u.level === l; }).length; };
    var tabs = '<div class="pill-tabs">' + levels.map(function (l) { return '<button class="' + (l === level ? "on" : "") + '" data-act="goto" data-href="#/t/candidates?f=' + encodeURIComponent(l) + '">' + esc(l) + " (" + count(l) + ")</button>"; }).join("") + "</div>";
    var line = function (u) {
      var r = rec(u);
      return '<div class="list-row"><div class="grow"><div class="title">' + esc(u.name) + '</div><div class="meta"><span class="tnum">' + esc(u.studentNo || "") + '</span><span class="sep"></span><span>' + esc(classOf(u, ix)) + "</span>" + (r && r.candidateNo ? '<span class="sep"></span><span>Candidate ' + esc(r.candidateNo) + "</span>" : "") + (r && r.amount ? '<span class="sep"></span><span>' + money(r.amount) + " paid</span>" : "") + "</div></div>" +
        (r ? '<button class="btn btn-sm btn-ghost" data-act="cand-undo" data-id="' + r.id + '">Undo</button>' : '<button class="btn btn-sm btn-primary" data-act="cand-reg" data-id="' + u.id + '">' + I("check") + "Register</button>") + "</div>";
    };
    return { title: "Candidate registration", html: tabs +
      '<div class="section-title"><h2>Registered</h2><span class="sub">' + yes.length + '</span></div><div class="card">' + (yes.length ? yes.map(line).join("") : UI.empty("award", "Nobody yet")) + "</div>" +
      '<div class="section-title"><h2>Not registered</h2><span class="sub">' + notYet.length + '</span></div><div class="card">' + (notYet.length ? notYet.map(line).join("") : UI.empty("checkCircle", kids.length ? "Everyone has registered" : "No students in " + level)) + "</div>" };
  }, { role: "teacher" });
  A.act["cand-reg"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), y = conf().year;
    UI.modal({ title: "Register: " + u.name, sub: u.level + " · " + y, body: '<form id="fee-form" class="form-grid"><label class="field"><span>Candidate number (optional)</span><input class="input" name="no" autocomplete="off"></label><label class="field"><span>Amount paid (optional)</span><input class="input" name="amount" inputmode="decimal" value="' + esc(config().candidate || "") + '" autocomplete="off"></label><label class="field"><span>Date</span><input class="input" type="date" name="date" value="' + today() + '"></label></form>',
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        var f = UI.formData(m.querySelector("#fee-form"));
        S().put("candidates", { id: "cand_" + y + "_" + u.id, studentId: u.id, year: String(y), registered: true, candidateNo: f.no.trim(), amount: num(f.amount), date: f.date, by: M.me().id });
        UI.toast("Saved"); A.render();
      } }] });
  };
  A.act["cand-undo"] = function (el) { var id = el.getAttribute("data-id"); UI.confirm("Mark this student as not registered?", { danger: true, ok: "Undo" }).then(function (ok) { if (ok) { S().remove("candidates", id); A.render(); } }); };
})(window.App);
