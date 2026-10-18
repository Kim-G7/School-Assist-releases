/* The school hub's backup (desktop app: electron/backup.cjs, archive.cjs; server: cloud/functions/hub-backup, hub-recover).
 *   - Settings → Online backup (admins): on the hub computer, turn it on (parts 1 and 2 of the school's key are shown
 *     to write down), back up now, open the folder of backup files, and see the last and next backup; other admins see
 *     the hub's last backup.
 *   - Restoring the hub on another computer (the set-up page, or Settings on an admin's computer): ask, read the
 *     code to Golden Technologies, wait for their approval, type two parts of the key; this computer becomes the hub.
 *     Or, from the backup files (a flash drive), with two parts of the key and no internet.
 *   - A hub that Golden Technologies signed out erases the school's data and shows why (Backup.revokedNote). */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var desk = function () { return window.desktop && window.desktop.backup ? window.desktop : null; };
  var B = (A.Backup = {});
  var DAYFMT = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };
  var when = function (t) { return t ? new Date(t).toLocaleString(undefined, DAYFMT) : "never"; };
  var mb = function (n) { n = Number(n || 0); return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(n < 104857600 ? 1 : 0) + " MB"; };
  var REASONS = ["The hub computer was stolen", "The hub computer broke or won't start", "We are replacing the hub computer", "Something else"];

  B.applies = function () { return A.edition !== "home" && !A.Cloud; };

  /* ------------------------------------------------------------------ progress, from the desktop app */
  var progress = null;
  if (desk()) desk().backup.onProgress(function (p) {
    progress = p;
    var el = document.getElementById("bk-progress");
    if (el) el.innerHTML = progressText(p);
  });
  function progressText(p) {
    if (!p) return "";
    return '<div class="row small" style="gap:8px">' + '<span class="setup-spin sm" aria-hidden="true"></span>' + esc(p.step) + (p.of ? ": " + p.done + " of " + p.of : p.done ? ": " + p.done : "") + "…</div>";
  }

  /* ------------------------------------------------------------------ Settings → Online backup */
  B.section = function (me) {
    return { html: '<div id="bk-box" style="max-width:860px"><div class="card card-pad"><p class="muted">Checking the online backup…</p></div></div>', mount: function () { fill(me); } };
  };
  function fill(me) {
    var box = document.getElementById("bk-box");
    if (!box) return;
    if (!desk()) { box.innerHTML = statusCard(null); return; }
    desk().backup.status().then(function (st) {
      box = document.getElementById("bk-box");
      if (!box) return;
      var isHub = st.hub || st.enabled;
      box.innerHTML = (isHub ? hubCard(st) : statusCard(st) + restoreCard()) + aboutCard();
      if (!isHub) mountRestore();
    });
  }
  function explain() {
    return '<p class="muted small mt-sm">Every Friday afternoon the hub packs the school\'s data (people, classes, tasks, marks, registers, papers, books and notes, files) into one file, compresses it and locks it with the school\'s key. ' +
      "A copy stays in the school's folder in Documents, and it goes to the school's online backup. Nobody can open it without two of the three parts of the school's key: the school keeps parts 1 and 2, Golden Technologies keeps part 3 sealed. " +
      "If the hub computer is stolen, breaks or is replaced, another computer can become the hub with everything in it.</p>";
  }
  function hubCard(st) {
    if (!st.enabled) {
      var lic = S().get("settings", "licence");
      return '<div class="card card-pad"><h3>' + I("upload") + " Online backup</h3>" + explain() +
        (lic && lic.key && A.Licence && A.Licence.isMaster() ? '<div class="callout warn mt">' + I("key") + '<div class="small">The school is using Golden Technologies\' temporary master key. The online backup needs the school\'s own key: enter it in <a href="#/t/settings?s=licence">Plan &amp; licence</a> when it arrives.</div></div>'
          : lic && lic.key ? '<div class="setup-actions" style="justify-content:flex-start"><button class="btn btn-primary" data-act="bk-enable">' + I("shield") + "Turn on the online backup</button></div>"
          : '<div class="callout warn mt">' + I("key") + '<div class="small">The online backup comes with the school\'s plan. Enter the school\'s School Assist key in <a href="#/t/settings?s=licence">Plan &amp; licence</a> first.</div></div>') +
        '<div id="bk-msg"></div></div>';
    }
    var t = st.totals || {}, last = st.last || {}, split = st.keyScheme === "split3";
    return '<div class="card card-pad"><h3>' + I("upload") + " Online backup is on</h3>" +
      (!st.keyNoted ? '<div class="callout warn mt">' + I("alert") + '<div class="small grow">' +
        (split && st.keyChangedAt ? "<b>The school's key is now in three parts.</b> Write down parts 1 and 2: the old recovery key doesn't open the new backups. " : split ? "<b>Write down parts 1 and 2 of the school's key.</b> " : "<b>Write down the recovery key.</b> ") +
        'Without them the backup can\'t be opened. Keep them on paper, in two different safe places.</div><button class="btn btn-sm" data-act="bk-key">Show the key</button></div>' : "") +
      '<dl class="kv mt"><dt>Last backup</dt><dd>' + esc(when(st.lastOkAt)) + (st.lastOkAt && last.at ? ' <span class="muted small">(' + lastText(last) + ")</span>" : "") + "</dd>" +
      "<dt>Next backup</dt><dd>" + esc(st.nextAt && st.nextAt > Date.now() + 60000 ? when(st.nextAt) : "Now, while this computer is on") + "</dd>" +
      "<dt>Online</dt><dd>" + (t.archives ? t.archives + " sealed backup" + (t.archives === 1 ? "" : "s") + ", " + mb(t.bytes) : t.records != null ? t.records + " records, " + t.files + " files, " + mb(t.bytes) : "—") +
        (st.waiting ? ' <span class="badge warn">' + st.waiting + " waiting to go online</span>" : "") + "</dd>" +
      "<dt>On this computer</dt><dd>" + (st.localCopies ? st.localCopies + " backup file" + (st.localCopies === 1 ? "" : "s") + ' <button class="btn btn-sm btn-ghost" data-act="bk-folder">' + I("external") + "Open the folder</button>" : '<span class="muted">none yet</span>') + "</dd>" +
      "<dt>School</dt><dd>" + esc(st.school || "") + ' <span class="muted small">' + esc(st.backupId || "") + "</span></dd></dl>" +
      (st.lastError ? '<div class="callout warn mt">' + I("alert") + '<div class="small">The last try didn\'t finish: ' + esc(st.lastError) + " It tries again later.</div></div>" : "") +
      '<div id="bk-progress" class="mt">' + progressText(st.running ? st.progress || { step: "Backing up" } : null) + "</div>" +
      '<div class="row wrap mt" style="gap:8px"><button class="btn btn-primary" data-act="bk-run"' + (st.running ? " disabled" : "") + ">" + I("upload") + 'Back up now</button><button class="btn" data-act="bk-key">' + I("key") + (split ? "Show parts 1 and 2 of the key" : "Show the recovery key") + "</button></div>" +
      '<div id="bk-msg"></div>' + explain() +
      '<p class="tiny muted mt-sm">Copy the backup folder to a flash drive now and then, and keep it away from the hub computer: School Assist can restore the school from it even without the internet.</p></div>';
  }
  function lastText(l) {
    if (l.kind === "none") return "nothing changed";
    var what = l.records + " record" + (l.records === 1 ? "" : "s") + " and " + l.files + " file" + (l.files === 1 ? "" : "s");
    return l.kind === "full" ? "a full backup: " + what + ", " + mb(l.bytes) : l.kind === "changes" ? "this week's changes: " + what + ", " + mb(l.bytes) : what + " sent";
  }
  /** On other devices: what the hub last reported (the settings record "backupstatus", synced from the hub). */
  function statusCard(st) {
    var bs = S().get("settings", "backupstatus");
    return '<div class="card card-pad mb"><h3>' + I("upload") + " Online backup</h3>" +
      (bs && bs.lastOkAt ? '<dl class="kv mt"><dt>Last backup</dt><dd>' + esc(when(bs.lastOkAt)) + "</dd>" + (bs.totals ? "<dt>Online</dt><dd>" + (bs.totals.archives ? bs.totals.archives + " sealed backups, " : bs.totals.records + " records, " + bs.totals.files + " files, ") + mb(bs.totals.bytes) + "</dd>" : "") + "</dl>"
        : '<p class="muted small mt-sm">The hub computer hasn\'t made an online backup yet. Turn it on there, in Settings → Online backup.</p>') +
      (st ? "" : '<p class="tiny muted mt">The backup runs on the hub computer.</p>') + "</div>";
  }
  function aboutCard() {
    return '<div class="card card-pad mt"><h3>' + I("shield") + " If the hub computer is lost or stolen</h3>" +
      '<ol class="small mt-sm" style="padding-left:20px;display:grid;gap:4px"><li>Call Golden Technologies. They sign the lost hub out: if it ever connects to the internet again, School Assist erases the school\'s data on it.</li>' +
      "<li>On another computer with School Assist, choose <b>Restore from the online backup</b> (on the set-up page, or here on an admin's computer).</li>" +
      "<li>Read the request code to Golden Technologies. When they approve, type two parts of the school's key: the computer downloads everything and becomes the hub.</li></ol>" +
      '<p class="small mt-sm">No internet? With the backup files (the school\'s Backups folder copied to a flash drive) and parts 1 and 2, any computer with School Assist can become the hub: <b>Restore from backup files</b>.</p></div>';
  }
  A.act["bk-enable"] = function (el) {
    el.disabled = true;
    msg("Turning it on…");
    desk().backup.enable().then(function (r) {
      if (r.error) { el.disabled = false; return msg(esc(r.error), true); }
      showKey(r, true);
      fill(A.M.me());
    });
  };
  A.act["bk-folder"] = function () { desk().backup.openFolder(); };
  A.act["bk-run"] = function (el) {
    el.disabled = true;
    msg("");
    desk().backup.run().then(function (r) {
      if (r && r.error) msg(esc(r.error), true);
      else UI.toast(r ? (r.kind === "none" ? "Nothing changed since the last backup" : "Backed up: " + lastText(r)) : "Backed up");
      fill(A.M.me());
    });
  };
  A.act["bk-key"] = function () {
    UI.confirm("Show the school's key? Make sure nobody else can see the screen.", { ok: "Show it" }).then(function (ok) {
      if (ok) desk().backup.key().then(function (r) { if (r && (r.parts || r.recoveryKey)) showKey(r, false); });
    });
  };
  var KEYBOX = 'class="id-big mt-sm" style="font-family:var(--mono, monospace);letter-spacing:.05em;font-size:clamp(16px,3vw,24px);user-select:all;overflow-wrap:anywhere"';
  /** r: { parts: ["1-…", "2-…"] } (1.6), or { recoveryKey } (1.5). */
  function showKey(r, first) {
    var body = r.parts
      ? (first ? "<p>The first backup starts in a moment. The school's key is in <b>three parts</b>. Any two of them open the backup, so write parts 1 and 2 down now, on two pieces of paper:</p>" : "<p>Parts 1 and 2 of the school's key. Any two of the three parts open the backup.</p>") +
        '<div class="label mt">Part 1</div><div ' + KEYBOX + ">" + esc(r.parts[0]) + "</div>" +
        '<div class="label mt">Part 2</div><div ' + KEYBOX + ">" + esc(r.parts[1]) + "</div>" +
        '<ul class="small mt" style="padding-left:20px;display:grid;gap:4px"><li>Give each part to a different person (for example the head and the bursar), and keep them in two different safe places.</li>' +
        "<li>Don't keep them on the hub computer: if that is stolen, the key must not go with it.</li>" +
        "<li>Golden Technologies keeps <b>part 3</b>, sealed. On its own it opens nothing. If one of your parts is lost, they give part 3 to the school after checking who is asking.</li></ul>"
      : (first ? '<p>The first backup starts in a moment. This is the school\'s <b>recovery key</b>. It unlocks the backup, so write it down now:</p>' : "<p>This key unlocks the school's online backup.</p>") +
        "<div " + KEYBOX + ">" + esc(r.recoveryKey) + "</div>" +
        '<ul class="small mt" style="padding-left:20px;display:grid;gap:4px"><li>Write it on paper and keep it in the school safe, with the hub computer\'s details.</li><li>Don\'t keep it on the hub computer: if that is stolen, the key must not go with it.</li><li>With the next backup, School Assist changes it to a key in three parts, and shows you parts 1 and 2.</li></ul>';
    UI.modal({
      title: first ? "The online backup is on" : r.parts ? "The school's key" : "The school's recovery key",
      body: body,
      foot: [{ label: r.parts ? "I have written both down" : "I have written it down", cls: "btn-primary", onClick: function () { desk().backup.keyNoted().then(function () { fill(A.M.me()); }); } }],
    });
    if (first) setTimeout(function () { desk().backup.run().then(function () { fill(A.M.me()); }); }, 1500);
  }
  function msg(html, bad) { var el = document.getElementById("bk-msg"); if (el) el.innerHTML = html ? '<div class="callout mt' + (bad ? " warn" : "") + '">' + I(bad ? "alert" : "info") + '<div class="small">' + html + "</div></div>" : ""; }

  /* ------------------------------------------------------------------ restoring the hub on this computer */
  var R = { step: "loading", msg: "", pending: null, timer: null, where: "settings" };
  function restoreCard() {
    return '<div class="card card-pad mt"><h3>' + I("download") + " Make this computer the school hub</h3>" +
      '<p class="muted small mt-sm">If the hub computer was lost, stolen or broke: this computer downloads the school\'s online backup (or opens the backup files from a flash drive) and becomes the hub. Anything newer already on this computer is kept.</p><div id="bk-restore" class="mt"></div></div>';
  }
  /** Two parts of the key (1.6), or the one recovery key (1.5). */
  function keyFields(scheme) {
    var box = 'class="input" autocomplete="off" spellcheck="false" autocapitalize="characters" style="font-family:monospace;font-size:16px;letter-spacing:.05em"';
    if (scheme !== "split3") return '<label class="field"><span>Recovery key</span><input ' + box + ' name="key" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"></label>';
    return '<div class="form-grid"><label class="field full"><span>A part of the school\'s key</span><input ' + box + ' name="p1" placeholder="1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"></label>' +
      '<label class="field full"><span>Another part</span><input ' + box + ' name="p2" placeholder="2-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"><span class="hint">Parts 1 and 2 from the school\'s papers. If one is lost, Golden Technologies can read you part 3 after checking it\'s you.</span></label></div>';
  }
  var keyInput = function (form) { return form.p1 ? { parts: [form.p1.value, form.p2.value] } : { key: form.key.value }; };
  /** The restore steps, inside the set-up page (where = "setup") or Settings. */
  B.restoreHtml = function (where) { R.where = where || "settings"; return '<div id="bk-restore"></div>'; };
  function mountRestore() {
    if (!desk()) return;
    desk().backup.status().then(function (st) {
      var p = st.pendingRestore;
      R.pending = p;
      R.step = !p ? "form" : p.status === "approved" ? "key" : p.status === "pending" ? "wait" : "form";
      if (p && (p.status === "declined" || p.status === "expired")) { R.msg = p.status === "declined" ? "Golden Technologies declined the request " + p.code + ". Call them to find out why." : "The request " + p.code + " expired. Ask again."; desk().backup.cancel(); }
      paint();
      if (R.step === "wait") watch();
    });
  }
  B.mountRestore = mountRestore;
  function paint() {
    var el = document.getElementById("bk-restore");
    if (!el) { stopWatch(); return; }
    var m = R.msg ? '<p class="form-msg" role="alert">' + I("alert") + esc(R.msg) + "</p>" : "";
    if (R.step === "loading") { el.innerHTML = '<p class="muted small">Checking…</p>'; return; }
    if (R.step === "form") {
      el.innerHTML = '<form data-submit="bk-request">' +
        '<label class="field"><span>The school\'s School Assist key</span><textarea class="input" name="licence" rows="3" spellcheck="false" autocomplete="off" placeholder="SA1.…" style="font-family:monospace;font-size:12px"></textarea>' +
        '<span class="hint">From the school\'s records, or ask Golden Technologies to send it.</span></label>' +
        '<div class="form-grid"><label class="field"><span>Your full name</span><input class="input" name="name" autocomplete="name"></label>' +
        '<label class="field"><span>Your staff number</span><input class="input" name="staffNo" placeholder="e.g. KHS-AD1" autocapitalize="characters"></label>' +
        '<label class="field"><span>Phone number</span><input class="input" name="phone" inputmode="tel" autocomplete="tel"></label>' +
        '<label class="field"><span>What happened</span><select class="select" name="reason">' + REASONS.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("") + "</select></label></div>" +
        '<div class="callout mt">' + I("info") + '<div class="small">Golden Technologies phones the school to check every request before approving it. When they approve, the old hub computer is signed out: if it connects to the internet again, School Assist erases the school\'s data on it.</div></div>' +
        m + '<div class="setup-actions">' + (R.where === "setup" ? '<button type="button" class="btn btn-lg" data-act="su-to" data-step="school">' + I("back") + "Back</button>" : "<span></span>") +
        '<button class="btn btn-primary btn-lg" type="submit">' + I("send") + "Ask Golden Technologies</button></div></form>" +
        '<div class="callout mt">' + I("download") + '<div class="small grow"><b>No internet, or the school has its backup files?</b> Open them from the school\'s Backups folder or a flash drive, with parts 1 and 2 of the key. Golden Technologies doesn\'t need to approve this.</div>' +
        '<button class="btn btn-sm" data-act="bk-pick-folder">Restore from backup files</button></div>';
      return;
    }
    if (R.step === "folder") {
      var s = R.scan || { archives: [] }, a = s.archives;
      el.innerHTML = '<form data-submit="bk-restore-folder"><p class="small"><b>' + esc(s.school || "The school") + "</b>: " + a.length + " backup file" + (a.length === 1 ? "" : "s") + " in <code style=\"overflow-wrap:anywhere\">" + esc(s.folder) + "</code></p>" +
        '<ul class="small mt-sm" style="padding-left:20px;display:grid;gap:2px">' + a.map(function (x) { return "<li>" + esc(x.kind === "full" ? "Full backup" : "Changes") + " " + x.seq + " · " + esc(when(x.at)) + " · " + mb(x.bytes) + "</li>"; }).join("") + "</ul>" +
        (s.others ? '<p class="tiny muted">' + s.others + " file" + (s.others === 1 ? " is" : "s are") + " another school's or older, and left alone.</p>" : "") +
        '<div class="mt">' + keyFields("split3") + "</div>" + m +
        '<div class="setup-actions"><button type="button" class="btn btn-lg" data-act="bk-folder-back">' + I("back") + 'Back</button><button class="btn btn-primary btn-lg" type="submit">' + I("download") + "Restore the school</button></div></form>";
      return;
    }
    if (R.step === "wait") {
      var p = R.pending || {};
      el.innerHTML = '<div style="text-align:center"><p class="muted">Request for <b>' + esc(p.school || "the school") + "</b>. Call Golden Technologies and read them this code:</p>" +
        '<div class="id-big mt-sm">' + esc(p.code || "") + "</div>" +
        '<p class="small muted mt">This page checks every 20 seconds and moves on by itself when they approve. You can close School Assist and come back.</p>' +
        '<div class="row mt" style="justify-content:center;gap:8px"><button class="btn" data-act="bk-poll">' + I("refresh") + 'Check now</button><button class="btn btn-ghost" data-act="bk-cancel">Cancel the request</button></div></div>' + m;
      return;
    }
    if (R.step === "key") {
      var split = (R.pending || {}).keyScheme === "split3";
      el.innerHTML = '<form data-submit="bk-restore"><div class="callout mb">' + I("checkCircle") + '<div class="small"><b>Approved.</b> ' +
        (split ? "Type two parts of the school's key: parts 1 and 2 from the school's papers, or one of them and part 3, which Golden Technologies reads to you." : "Type the school's recovery key: from the paper in the school safe, or Golden Technologies reads it to you.") + "</div></div>" +
        keyFields(split ? "split3" : "single") +
        m + '<div class="setup-actions"><span></span><button class="btn btn-primary btn-lg" type="submit">' + I("download") + "Restore the school</button></div></form>";
      return;
    }
    if (R.step === "working") {
      el.innerHTML = '<p>Downloading and unlocking the school\'s backup. Keep this computer on and connected…</p><div id="bk-progress" class="mt">' + progressText(progress || { step: "Starting" }) + "</div>";
      return;
    }
    if (R.step === "joining") el.innerHTML = '<p>Starting the hub on this computer…</p><div class="setup-spin" aria-hidden="true"></div>';
  }
  function watch() {
    stopWatch();
    R.timer = setInterval(function () { if (!document.getElementById("bk-restore")) return stopWatch(); poll(true); }, 20000);
  }
  function stopWatch() { if (R.timer) { clearInterval(R.timer); R.timer = null; } }
  function poll(quiet) {
    return desk().backup.poll().then(function (p) {
      if (p && p.error) { if (!quiet) { R.msg = p.error; paint(); } return; }
      if (!p) { R.step = "form"; return paint(); }
      R.pending = p;
      if (p.status === "approved") { stopWatch(); R.step = "key"; R.msg = ""; paint(); UI.toast("Golden Technologies approved the restore"); }
      else if (p.status === "declined" || p.status === "expired") { stopWatch(); desk().backup.cancel(); R.step = "form"; R.msg = p.status === "declined" ? "Golden Technologies declined the request. Call them to find out why." : "The request expired. Ask again."; paint(); }
      else if (!quiet) UI.toast("Not approved yet");
    });
  }
  A.act["bk-request"] = function (form) {
    var f = UI.formData(form);
    if (!f.licence.trim()) { R.msg = "Paste the school's School Assist key."; return paint(); }
    if (f.name.trim().split(/\s+/).length < 2) { R.msg = "Enter your full name."; return paint(); }
    if (f.phone.replace(/\D/g, "").length < 7) { R.msg = "Enter a phone number Golden Technologies can call."; return paint(); }
    R.msg = ""; R.step = "loading"; paint();
    desk().backup.request({ licence: f.licence, name: f.name.trim(), staffNo: f.staffNo.trim(), phone: f.phone.trim(), reason: f.reason }).then(function (r) {
      if (r.error) { R.step = "form"; R.msg = r.error; return paint(); }
      R.pending = r; R.step = "wait"; paint(); watch();
    });
  };
  A.act["bk-poll"] = function () { poll(false); };
  A.act["bk-cancel"] = function () { stopWatch(); desk().backup.cancel().then(function () { R.step = "form"; R.msg = ""; paint(); }); };
  A.act["bk-restore"] = function (form) {
    var input = keyInput(form);
    R.msg = ""; R.step = "working"; progress = null; paint();
    desk().backup.restore(input).then(function (r) {
      if (r.error) { R.step = "key"; R.msg = r.error; return paint(); }
      R.step = "joining"; paint();
      return join(r);
    });
  };
  /* from a folder of backup files (1.6): no internet, no approval; two parts of the key */
  A.act["bk-pick-folder"] = function () {
    R.msg = "";
    desk().backup.pickFolder().then(function (s) {
      if (!s || s.cancelled) return;
      if (s.error) { R.msg = s.error; return paint(); }
      if (!s.archives.length) { R.msg = "There is no full School Assist backup in " + s.folder + ". Choose the folder with the .sabk files."; return paint(); }
      R.scan = s; R.step = "folder"; paint();
    });
  };
  A.act["bk-folder-back"] = function () { R.step = "form"; R.msg = ""; paint(); };
  A.act["bk-restore-folder"] = function (form) {
    var input = keyInput(form), folder = R.scan && R.scan.folder;
    R.msg = ""; R.step = "working"; progress = null; paint();
    desk().backup.restoreFolder(folder, input).then(function (r) {
      if (r.error) { R.step = "folder"; R.msg = r.error; return paint(); }
      R.step = "joining"; paint();
      return join(r);
    });
  };
  /** The hub runs on this computer now: sync with it. A new computer takes the school's records (and its look); an
      admin's computer sends anything newer it has and gets everything again. */
  function join(r) {
    var url = "http://localhost:" + ((r.hub && r.hub.port) || 8080), m = S().state.meta || {};
    if (A.SchoolId && A.SchoolId.id()) { m.serverSince = 0; m.lastPushAt = 0; }
    A.Sync.setConfig({ url: url, auto: true });
    return S().flush().then(function () { return A.Sync.syncNow(); }).catch(function () {}).then(function () {
      A.Theme.apply();
      UI.toast(r.school + " is restored: this computer is the school hub now (" + r.records + " records, " + r.files + " files)");
      if (R.where === "setup") { location.hash = ""; }
      A.render();
    });
  }

  /* ------------------------------------------------------------------ a computer that was signed out */
  /** On the set-up page after Golden Technologies signed this hub out and it erased the school's data. */
  B.revokedNote = function () {
    if (!desk()) return;
    desk().backup.status().then(function (st) {
      var v = st.revoked, card = document.querySelector(".setup-card");
      if (!v || !card || document.getElementById("bk-revoked")) return;
      var div = document.createElement("div");
      div.id = "bk-revoked"; div.className = "callout warn mb";
      div.innerHTML = I("shield") + '<div class="small grow"><b>This computer was signed out of ' + esc(v.school || "its school") + "</b> by Golden Technologies on " + esc(new Date(v.at).toLocaleDateString()) +
        ". The school's School Assist data was removed from it." + (v.reason ? " (" + esc(v.reason) + ")" : "") + '</div><button class="btn btn-sm" data-act="bk-revoked-ok">OK</button>';
      card.insertBefore(div, card.firstChild);
    });
  };
  A.act["bk-revoked-ok"] = function () { desk().backup.revokedSeen().then(function () { var el = document.getElementById("bk-revoked"); if (el) el.remove(); }); };
})(window.App);
