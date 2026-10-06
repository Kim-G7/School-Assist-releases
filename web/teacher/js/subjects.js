/* Subjects a student takes.
 *   Registering: the student picks an exam board and their subjects. Each subject is a request
 *   ("enrolment") that the subject's teacher approves; until then it stays locked, but the rest
 *   of the app works.
 *   Students can ask to drop a subject they take, or ask for one they left out (My subjects). A
 *   subject they asked to drop stays, greyed out, until its teacher (or the admin) answers: approved,
 *   it leaves their subjects; declined, it stays. They can take the request back until then.
 *   Teachers (and the admin) approve or decline requests for their subjects (Subject requests).
 *   The admin adds teachers and chooses who teaches which subject.
 * Online (home edition) the server does the approving (cloud/migrations/004); on a school hub
 * or a single device the same records are simply saved here. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };

  M.SUBJECT_GROUPS = [
    { id: "sciences", label: "Sciences", icon: "beaker" },
    { id: "arts", label: "Arts", icon: "book" },
    { id: "commercials", label: "Commercials", icon: "chart" },
    { id: "practicals", label: "Practicals", icon: "tablet" },
    { id: "other", label: "Other subjects", icon: "layers" },
  ];
  M.groupOf = function (syl) { var g = syl && syl.group; return M.SUBJECT_GROUPS.some(function (x) { return x.id === g; }) ? g : "other"; };
  /** Subjects (anything with .group, .subject) in their groups, in the groups' order. */
  M.byGroup = function (list) {
    return M.SUBJECT_GROUPS.map(function (g) {
      return { group: g, items: list.filter(function (s) { return M.groupOf(s) === g.id; }).sort(function (a, b) { return a.subject.localeCompare(b.subject); }) };
    }).filter(function (x) { return x.items.length; });
  };
  M.boardName = function (s) { return [s.board, s.level].filter(Boolean).join(" "); };

  /* ------------------------------------------------------------ enrolments */
  M.enrolments = function (sid) { return S().filter("enrolments", function (e) { return e.studentId === sid; }); };
  M.enrolment = function (sid, sylId) { return S().get("enrolments", "en_" + sid + "_" + sylId); };
  /** Requests waiting for this teacher (the admin sees them all): to join a subject ("pending") or to drop one ("drop_pending"). */
  M.subjectRequests = function (teacher) {
    return S().filter("enrolments", function (e) {
      if (e.status !== "pending" && e.status !== "drop_pending") return false;
      if (teacher.isAdmin) return true;
      return S().all("classes").some(function (c) { return c.syllabusId === e.syllabusId && c.teacherId === teacher.id; });
    }).sort(function (a, b) { return (a.dropRequestedAt || a.requestedAt || 0) - (b.dropRequestedAt || b.requestedAt || 0); });
  };
  M.teacherOf = function (sylId) {
    var c = S().find("classes", function (x) { return x.syllabusId === sylId; });
    return c && M.user(c.teacherId);
  };
  /** Subjects offered: syllabi that have a class to join. */
  M.offeredSubjects = function () {
    var withClass = {};
    S().all("classes").forEach(function (c) { if (c.syllabusId) withClass[c.syllabusId] = 1; });
    return S().filter("syllabi", function (s) { return withClass[s.id]; });
  };

  // the same actions without a server (as cloud/migrations/006 does online): keep the records here and move the
  // student in or out of the class. Asking to drop a subject keeps them in its class until the answer.
  function localPut(sid, sylId, status, by) {
    var now = Date.now(), id = "en_" + sid + "_" + sylId, prev = S().get("enrolments", id), rec;
    var c = S().find("classes", function (x) { return x.syllabusId === sylId; });
    if (status === "drop_pending" || (prev && prev.status === "drop_pending")) {
      // asking to leave, or the answer to it: how they joined stays as it was
      rec = Object.assign({ requestedAt: now }, prev, { id: id, studentId: sid, syllabusId: sylId, classId: c ? c.id : null, status: status });
      if (status === "drop_pending") Object.assign(rec, { dropRequestedAt: now, dropDecidedAt: null, dropDecidedBy: null, dropOutcome: null });
      else Object.assign(rec, { dropDecidedAt: now, dropDecidedBy: by || null, droppedAt: status === "dropped" ? now : null,
        dropOutcome: status === "dropped" ? "approved" : by === sid ? "withdrawn" : "declined" });
    } else {
      prev = prev || {};
      rec = { id: id, studentId: sid, syllabusId: sylId, classId: c ? c.id : null, status: status,
        requestedAt: status === "pending" || !prev.requestedAt ? now : prev.requestedAt,
        decidedAt: status === "approved" || status === "declined" ? now : null, decidedBy: by || null, droppedAt: status === "dropped" ? now : null };
    }
    S().put("enrolments", rec);
    var inClass = status === "approved" || status === "drop_pending";
    if (c && ((c.studentIds || []).indexOf(sid) >= 0) !== inClass) {
      var ids = (c.studentIds || []).filter(function (x) { return x !== sid; });
      if (inClass) ids.push(sid);
      S().put("classes", Object.assign({}, c, { studentIds: ids }));
    }
  }
  function online(fn, args) {
    return A.Cloud.rpc(fn, args).then(function (r) { return A.Sync.syncNow().catch(function () {}).then(function () { return r; }); });
  }
  M.requestSubjects = function (sid, ids) {
    if (A.Cloud) return online("request_subjects", { p_syllabi: ids });
    ids.forEach(function (id) { var e = M.enrolment(sid, id); if (!e || ["pending", "approved", "drop_pending"].indexOf(e.status) < 0) localPut(sid, id, "pending"); });
    return Promise.resolve({ requested: ids.length });
  };
  /** Drop a subject: one they take becomes a request for its teacher (or the admin) to answer; a subject that
      was only asked for (waiting, or declined) goes straight away. Resolves to the enrolment as it now is. */
  M.dropSubject = function (sid, sylId) {
    if (A.Cloud) return online("drop_subject", { p_syllabus: sylId });
    var e = M.enrolment(sid, sylId), inClass = M.classesForStudent(sid).some(function (c) { return c.syllabusId === sylId; });
    if (!e || e.status !== "drop_pending") localPut(sid, sylId, (e ? e.status === "approved" : inClass) ? "drop_pending" : "dropped", sid);
    return Promise.resolve(M.enrolment(sid, sylId));
  };
  /** Take back a request to drop a subject, before anyone answers it. */
  M.keepSubject = function (sid, sylId) {
    if (A.Cloud) return online("keep_subject", { p_syllabus: sylId });
    var e = M.enrolment(sid, sylId);
    if (e && e.status === "drop_pending") localPut(sid, sylId, "approved", sid);
    return Promise.resolve(M.enrolment(sid, sylId));
  };
  /** Answer a request: to join (approved: into the class) or to drop (approved: out of the class; declined: it stays). */
  M.decideSubject = function (sid, sylId, yes, by) {
    var e = M.enrolment(sid, sylId), drop = !!e && e.status === "drop_pending";
    if (A.Cloud) {
      var args = { p_student: sid, p_syllabus: sylId, p_approve: !!yes };
      if (drop) args.p_kind = "drop"; // so a request taken back meanwhile is not answered by mistake
      return online("decide_subject", args);
    }
    if (!e || (e.status !== "pending" && !drop)) return Promise.reject(new Error("This request was already answered."));
    localPut(sid, sylId, drop ? (yes ? "dropped" : "approved") : (yes ? "approved" : "declined"), by);
    return Promise.resolve(M.enrolment(sid, sylId));
  };

  /* ------------------------------------------------------------ picking subjects */
  // the exam levels in the order students reach them (IGCSE before AS & A Level)
  function levelOf(s) { return M.boardName(s) || "Other subjects"; }
  function levelRank(name) { return /igcse|gcse|o[\s-]?level/i.test(name) ? 1 : /\bas\b|a[\s-]?level/i.test(name) ? 2 : /other/i.test(name) ? 9 : 3; }
  M.byLevel = function (list) {
    var levels = {}, order = [];
    list.forEach(function (s) { var k = levelOf(s); if (!levels[k]) { levels[k] = []; order.push(k); } levels[k].push(s); });
    return order.sort(function (a, b) { return levelRank(a) - levelRank(b) || a.localeCompare(b); }).map(function (k) { return { level: k, items: levels[k] }; });
  };
  /** Checkboxes for subjects (registration, "Add subjects", the subjects a teacher teaches): a panel for each
      level (Cambridge IGCSE, Cambridge AS & A Level…) to choose from, and inside it the subjects in their groups,
      sciences together, arts together and so on. One level only: just the groups. */
  A.subjectPicker = function (list, chosen, name) {
    chosen = chosen || {};
    var groups = function (items) {
      return '<div class="subj-groups">' + M.byGroup(items).map(function (g) {
        return '<fieldset class="subj-group"><legend>' + I(g.group.icon) + esc(g.group.label) + ' <span class="n">' + g.items.length + "</span></legend>" + g.items.map(function (s) {
          return '<label class="subj-pick"><input type="checkbox" name="' + (name || "subjects") + '" value="' + esc(s.id) + '"' + (chosen[s.id] ? " checked" : "") + ">" +
            '<span class="grow">' + esc(s.subject) + "</span>" + (s.code ? '<span class="code tnum">' + esc(s.code) + "</span>" : "") + "</label>";
        }).join("") + "</fieldset>";
      }).join("") + "</div>";
    };
    var levels = M.byLevel(list);
    if (levels.length <= 1) return groups(list);
    // open on the level of the subjects already ticked, else the first
    var first = (levels.filter(function (l) { return l.items.some(function (s) { return chosen[s.id]; }); })[0] || levels[0]).level;
    return '<div class="subj-levels" role="tablist" aria-label="Level">' + levels.map(function (l) {
      var n = l.items.filter(function (s) { return chosen[s.id]; }).length, on = l.level === first;
      return '<button type="button" role="tab" class="subj-level' + (on ? " on" : "") + '" aria-selected="' + on + '" data-act="subj-level" data-k="' + esc(l.level) + '">' +
        '<span class="lv">' + I("cap") + esc(l.level) + '</span><span class="ct">' + l.items.length + " subjects" + '<b class="ticked">' + (n ? " · " + n + " ticked" : "") + "</b></span></button>";
    }).join("") + "</div>" + levels.map(function (l) {
      return '<div class="subj-level-panel' + (l.level === first ? "" : " hidden") + '" role="tabpanel" data-k="' + esc(l.level) + '">' + groups(l.items) + "</div>";
    }).join("");
  };
  A.act["subj-level"] = function (el) {
    var box = el.closest(".subj-picker") || el.parentNode.parentNode, k = el.getAttribute("data-k");
    box.querySelectorAll(".subj-level").forEach(function (b) { var on = b.getAttribute("data-k") === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    box.querySelectorAll(".subj-level-panel").forEach(function (p) { p.classList.toggle("hidden", p.getAttribute("data-k") !== k); });
  };
  // how many are ticked in each level, as boxes are ticked
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.closest || !t.closest(".subj-pick")) return;
    var box = t.closest(".subj-picker"); if (!box) return;
    box.querySelectorAll(".subj-level-panel").forEach(function (p) {
      var n = p.querySelectorAll(".subj-pick input:checked").length, k = p.getAttribute("data-k");
      box.querySelectorAll(".subj-level").forEach(function (b) { if (b.getAttribute("data-k") === k) b.querySelector(".ticked").textContent = n ? " · " + n + " ticked" : ""; });
    });
  });
  function picked(root, name) { return Array.prototype.map.call(root.querySelectorAll('[name="' + (name || "subjects") + '"]:checked'), function (x) { return x.value; }); }
  A.pickedSubjects = picked;

  /* ------------------------------------------------------------ the subjects a member of staff works with
     A teacher's subjects are those of the classes they teach (the admin chooses them). An admin looks after
     every subject, so each admin can tick the ones they work with; the classes, materials, tutor and syllabus
     pages then show those, with "All subjects" a tap away. Teachers have the same switch in the syllabus
     library. The ticked subjects are kept with the school's settings ("staffview"), so they follow the admin
     to every device; showing all or just theirs is a choice on each device. */
  var VIEW = "staffview";
  function viewRec() { return S().get("settings", VIEW) || { id: VIEW, mine: {} }; }
  /** The subjects an admin ticked (none: every subject). */
  M.chosenSubjects = function (me) { var ids = (viewRec().mine || {})[me.id]; return Array.isArray(ids) ? ids.filter(function (id) { return !!M.syllabus(id); }) : []; };
  function scopeKey(me) { return "sca-scope-" + me.id; }
  M.subjectScope = function (me) { try { return localStorage.getItem(scopeKey(me)) === "all" ? "all" : "mine"; } catch (e) { return "mine"; } };
  /** The subjects a member of staff works with: an admin's ticked ones; a teacher's classes' subjects and the syllabuses they made. */
  M.relevantSubjects = function (me) {
    if (!me || me.role !== "teacher") return [];
    if (me.isAdmin) return M.chosenSubjects(me);
    var ids = [];
    M.classesForTeacher(me.id).forEach(function (c) { if (c.syllabusId && ids.indexOf(c.syllabusId) < 0) ids.push(c.syllabusId); });
    S().all("syllabi").forEach(function (s) { if (s.createdBy === me.id && ids.indexOf(s.id) < 0) ids.push(s.id); });
    return ids;
  };
  /** The subjects in view on staff pages: a list of syllabus ids, or null for every subject. */
  M.subjectFilter = function (me) {
    if (!me || me.role !== "teacher" || M.subjectScope(me) === "all") return null;
    var ids = M.relevantSubjects(me);
    return me.isAdmin && !ids.length ? null : ids; // an admin who hasn't ticked any sees everything
  };
  /** The classes on a member of staff's pages: theirs, narrowed to their subjects. */
  M.myClasses = function (me) {
    var list = M.classesForTeacher(me.id), f = M.subjectFilter(me);
    return f ? list.filter(function (c) { return f.indexOf(c.syllabusId) >= 0; }) : list;
  };
  /** "My subjects | All subjects" at the top of a staff page. Admins also get "Choose my subjects". */
  A.subjectScopeBar = function (me, library) {
    if (!me || me.role !== "teacher" || (!me.isAdmin && !library)) return ""; // a teacher's other pages only hold their classes anyway
    // counted the way the page lists them: the whole library there, else the subjects of the classes they look after
    var pool = library ? S().all("syllabi").map(function (s) { return s.id; }) : M.classesForTeacher(me.id).map(function (c) { return c.syllabusId; }).filter(function (id, i, a) { return id && a.indexOf(id) === i; });
    var mine = M.relevantSubjects(me).filter(function (id) { return pool.indexOf(id) >= 0; }).length, all = pool.length, scope = M.subjectScope(me);
    if (me.isAdmin && !mine) {
      return '<div class="scope-bar"><span class="small muted">' + I("layers") + " Showing every subject (" + all + ").</span>" +
        '<button class="btn btn-sm" data-act="my-subjects">' + I("check") + "Choose my subjects</button></div>";
    }
    return '<div class="scope-bar"><div class="pill-tabs sm"><button class="' + (scope === "mine" ? "on" : "") + '" data-act="subject-scope" data-v="mine">' + I("user") + "My subjects (" + mine + ")</button>" +
      '<button class="' + (scope === "all" ? "on" : "") + '" data-act="subject-scope" data-v="all">' + I("layers") + "All subjects (" + all + ")</button></div>" +
      (me.isAdmin ? '<button class="btn btn-sm btn-ghost" data-act="my-subjects">' + I("edit") + "Change my subjects</button>" : "") + "</div>";
  };
  A.act["subject-scope"] = function (el) {
    var me = M.me(); try { localStorage.setItem(scopeKey(me), el.getAttribute("data-v")); } catch (e) { /* this device only */ }
    A.render();
  };
  A.act["my-subjects"] = function () {
    var me = M.me(), chosen = {};
    M.chosenSubjects(me).forEach(function (id) { chosen[id] = 1; });
    var list = S().all("syllabi");
    UI.modal({
      title: "My subjects", size: "wide", sub: "Tick the subjects you work with. Your classes, learning materials, tutor content and syllabus library then show just these, and All subjects is one tap away.",
      body: '<form id="my-subj" class="subj-picker">' + A.subjectPicker(list, chosen) + "</form>",
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", icon: "check", onClick: function (m) {
        var ids = picked(m.querySelector("#my-subj")), rec = viewRec(), mine = Object.assign({}, rec.mine || {});
        mine[me.id] = ids;
        S().put("settings", Object.assign({}, rec, { id: VIEW, mine: mine }));
        try { localStorage.setItem(scopeKey(me), "mine"); } catch (e) { /* this device only */ }
        UI.toast(ids.length ? "Showing your " + ids.length + " subject" + (ids.length === 1 ? "" : "s") : "Showing every subject");
        A.render();
      } }],
    });
  };
  /** Settings → My subjects. */
  A.mySubjectsSection = function (me) {
    var ids = me.isAdmin ? M.chosenSubjects(me) : M.relevantSubjects(me), list = ids.map(M.syllabus).filter(Boolean);
    var html = '<div class="card card-pad" style="max-width:760px"><h3>' + I("layers") + " My subjects</h3>" +
      '<p class="muted small mt-sm">' + (me.isAdmin
        ? "As an admin you look after every subject. Tick the ones you work with and your pages show just those; switch to <b>All subjects</b> at the top of a page whenever you need the rest."
        : "The subjects of the classes you teach. Your pages show these; the admin changes which subjects you teach.") + "</p>";
    html += list.length ? M.byLevel(list).map(function (l) {
      return '<h4 class="mt">' + esc(l.level) + '</h4><div class="row wrap mt-sm">' + M.byGroup(l.items).map(function (g) {
        return g.items.map(function (s) { return '<span class="badge">' + I(g.group.icon) + esc(s.subject) + (s.code ? " " + esc(s.code) : "") + "</span>"; }).join("");
      }).join("") + "</div>";
    }).join("") : '<p class="mt">' + (me.isAdmin ? "None ticked: every subject is shown." : "You don't teach a class yet.") + "</p>";
    if (me.isAdmin) html += '<div class="row wrap mt"><button class="btn btn-primary" data-act="my-subjects">' + I("check") + (list.length ? "Change my subjects" : "Choose my subjects") + "</button></div>";
    return html + "</div>";
  };

  /* ------------------------------------------------------------ student: My subjects */
  var STATUS = {
    approved: { label: "Taking it", tone: "good", icon: "checkCircle" },
    pending: { label: "Waiting for approval", tone: "warn", icon: "clock" },
    declined: { label: "Not approved", tone: "bad", icon: "x" },
    drop_pending: { label: "Drop requested", tone: "warn", icon: "clock" },
  };
  var WEEK = 7 * 86400000;
  A.route("s/subjects", function (p, q, me) {
    var ens = M.enrolments(me.id).filter(function (e) { return e.status !== "dropped"; });
    var byId = {}; ens.forEach(function (e) { byId[e.syllabusId] = e; });
    // subjects the student is in without an enrolment record (added before subjects were chosen)
    M.classesForStudent(me.id).forEach(function (c) { if (c.syllabusId && !byId[c.syllabusId]) byId[c.syllabusId] = { syllabusId: c.syllabusId, status: "approved" }; });
    var rows = Object.keys(byId).map(function (id) { var s = M.syllabus(id); return s ? Object.assign({ e: byId[id] }, s) : null; }).filter(Boolean);
    var n = function (st) { return rows.filter(function (r) { return r.e.status === st; }).length; };
    // subjects whose drop was approved in the last week: they have just left the list
    var gone = M.enrolments(me.id).filter(function (e) { return e.status === "dropped" && e.dropOutcome === "approved" && Date.now() - (e.dropDecidedAt || 0) < WEEK; })
      .map(function (e) { var s = M.syllabus(e.syllabusId); return s ? s.subject : ""; }).filter(Boolean);
    var html = '<div class="callout mb">' + I("info") + '<div>These are the subjects you are taking. <b>Drop</b> any you don\'t do: your teacher (or the admin) approves it, and until then it stays here, greyed out. Left one out? <b>Add subjects</b> and your teacher approves it.' +
      (A.Cloud && !navigator.onLine ? ' <b>You need the internet to change your subjects.</b>' : "") + "</div></div>" +
      (gone.length ? '<div class="callout mb">' + I("checkCircle") + "<div><b>Dropped:</b> " + esc(gone.join(", ")) + ". Your request was approved, so " + (gone.length === 1 ? "it has" : "they have") + " left your subjects.</div></div>" : "");
    html += '<div class="row spread wrap mb"><span class="small muted">' + (n("approved") + n("drop_pending")) + " subjects" +
      (n("pending") ? " · " + n("pending") + " waiting for approval" : "") + (n("drop_pending") ? " · " + n("drop_pending") + " asked to drop" : "") + "</span>" +
      '<button class="btn btn-primary" data-act="subj-add">' + I("plus") + "Add subjects</button></div>";
    html += rows.length ? M.byGroup(rows).map(function (g) {
      return '<div class="section-title"><h2>' + I(g.group.icon) + esc(g.group.label) + '</h2></div><div class="card">' + g.items.map(function (s) {
        var st = STATUS[s.e.status] || STATUS.approved, t = M.teacherOf(s.id), leaving = s.e.status === "drop_pending";
        var kept = s.e.status === "approved" && s.e.dropOutcome === "declined" && Date.now() - (s.e.dropDecidedAt || 0) < WEEK;
        var note = s.e.status === "pending" ? "Waiting for " + (t ? esc(t.name) : "your teacher") + " to approve it"
          : leaving ? "You asked to drop it. Waiting for " + (t ? esc(t.name) : "your teacher") + " to decide; until then you can still use it."
          : s.e.status === "declined" ? "Your teacher didn't approve this subject. Ask them, or remove it."
          : kept ? "Your request to drop it was declined " + esc(A.relTime(s.e.dropDecidedAt)) + ", so you are still taking it."
          : t && !t.isAdmin ? "Teacher: " + esc(t.name) : esc(M.boardName(s)) + (s.code ? " " + esc(s.code) : "");
        var btn = s.e.status === "approved" ? '<button class="btn btn-sm btn-ghost" data-act="subj-drop" data-id="' + esc(s.id) + '">' + I("x") + "Drop</button>"
          : leaving ? '<button class="btn btn-sm" data-act="subj-keep" data-id="' + esc(s.id) + '">' + I("refresh") + "Keep it</button>"
          : s.e.status === "pending" ? '<button class="btn btn-sm btn-ghost" data-act="subj-drop" data-id="' + esc(s.id) + '" data-cancel="1">Cancel request</button>'
          : '<button class="btn btn-sm btn-ghost" data-act="subj-drop" data-id="' + esc(s.id) + '" data-cancel="1">Remove</button>';
        return '<div class="list-row' + (leaving ? " is-greyed" : "") + '"><div class="grow"><div class="title">' + esc(s.subject) + '</div><div class="meta small">' + note + "</div></div>" +
          '<span class="badge ' + st.tone + '">' + I(st.icon) + st.label + "</span>" + btn + "</div>";
      }).join("") + "</div>";
    }).join("") : '<div class="card">' + UI.empty("layers", "No subjects yet", "Add the subjects you are taking. Your teachers approve them.") + "</div>";
    return { title: "My subjects", crumbs: [{ label: "Exam mode", href: "#/s/exam" }, { label: "My subjects" }], html: html };
  }, { role: "student" });

  A.act["subj-add"] = function () {
    var me = M.me(), have = {};
    M.enrolments(me.id).forEach(function (e) { if (e.status === "approved" || e.status === "pending") have[e.syllabusId] = 1; });
    M.classesForStudent(me.id).forEach(function (c) { have[c.syllabusId] = 1; });
    var mine = M.syllabiForStudent(me.id)[0], board = mine ? M.boardName(mine) : null;
    var list = M.offeredSubjects().filter(function (s) { return !have[s.id] && (!board || M.boardName(s) === board); });
    if (!list.length) list = M.offeredSubjects().filter(function (s) { return !have[s.id]; });
    if (!list.length) { UI.toast("You already have every subject there is"); return; }
    UI.modal({
      title: "Add subjects", sub: "Tick the subjects you take. Each one waits for its teacher to approve it.",
      body: '<form id="subj-add-form" class="subj-picker">' + A.subjectPicker(list, {}) + "</form>",
      foot: [{ label: "Cancel" }, { label: "Ask to join", cls: "btn-primary", onClick: function (m) {
        var ids = picked(m.querySelector("#subj-add-form"));
        if (!ids.length) { UI.toast("Tick at least one subject", "bad"); return false; }
        M.requestSubjects(me.id, ids).then(function () {
          UI.toast(ids.length === 1 ? "Asked to join 1 subject" : "Asked to join " + ids.length + " subjects");
          A.render();
        }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      } }],
    });
  };
  A.act["subj-drop"] = function (el) {
    var me = M.me(), id = el.getAttribute("data-id"), s = M.syllabus(id), cancel = el.getAttribute("data-cancel");
    var msg = cancel ? "Take back your request for " + s.subject + "?"
      : "Ask to drop " + s.subject + "? " + (M.teacherOf(id) && !M.teacherOf(id).isAdmin ? M.teacherOf(id).name : "Your teacher") + " (or the admin) decides. Until then it stays in your subjects, greyed out, and you can still use it. Your progress is kept either way.";
    UI.confirm(msg, { danger: !cancel, ok: cancel ? "Yes" : "Ask to drop it" }).then(function (ok) {
      if (!ok) return;
      M.dropSubject(me.id, id).then(function (r) {
        var st = (r && r.status) || ((M.enrolment(me.id, id) || {}).status);
        UI.toast(cancel ? "Done" : st === "drop_pending" ? "Asked to drop " + s.subject + ". It is greyed out until your teacher decides." : s.subject + " dropped");
        location.hash = "#/s/subjects"; A.render();
      }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
    });
  };
  A.act["subj-keep"] = function (el) {
    var me = M.me(), id = el.getAttribute("data-id"), s = M.syllabus(id);
    M.keepSubject(me.id, id).then(function () { UI.toast("You are keeping " + (s ? s.subject : "it")); A.render(); })
      .catch(function (e) { UI.toast(e.message || String(e), "bad"); A.render(); });
  };

  /** The line on the student's pages when subjects are still waiting. */
  A.pendingSubjectsNote = function (me) {
    var names = function (st) { return M.enrolments(me.id).filter(function (e) { return e.status === st; }).map(function (e) { var s = M.syllabus(e.syllabusId); return s ? s.subject : ""; }).filter(Boolean); };
    var join = names("pending"), drop = names("drop_pending"), parts = [];
    if (join.length) parts.push("<b>" + (join.length === 1 ? "1 subject is" : join.length + " subjects are") + " waiting for your teacher's approval:</b> " + esc(join.join(", ")) + ". They open as soon as they are approved.");
    if (drop.length) parts.push("<b>You asked to drop</b> " + esc(drop.join(", ")) + ". " + (drop.length === 1 ? "It stays" : "They stay") + ", greyed out, until your teacher decides.");
    if (!parts.length) return "";
    return '<div class="callout mb">' + I("clock") + "<div>" + parts.join(" ") + ' <a href="#/s/subjects">My subjects</a></div></div>';
  };

  /* ------------------------------------------------------------ teachers: subject requests */
  /** Requests to join, then requests to drop: one card each, only when there are any. */
  A.subjectRequestsHtml = function (me, limit) {
    var reqs = M.subjectRequests(me);
    var joins = reqs.filter(function (e) { return e.status === "pending"; }), drops = reqs.filter(function (e) { return e.status === "drop_pending"; });
    var card = function (list, drop) {
      if (!list.length) return "";
      var shown = limit ? list.slice(0, limit) : list;
      return '<div class="card mb"><div class="card-head">' + I(drop ? "x" : "users") + "<h3>" + (drop ? "Asking to drop a subject" : "Subject requests") + '</h3><span class="sub">' + list.length + " waiting</span><span class=\"grow\"></span>" +
        (!drop && list.length > 1 ? '<button class="btn btn-sm" data-act="subj-decide-all">' + I("check") + "Approve all</button>" : "") + "</div>" + shown.map(function (e) {
          var u = M.user(e.studentId) || { name: e.studentId }, s = M.syllabus(e.syllabusId) || { subject: e.syllabusId };
          var at = ' data-s="' + esc(e.studentId) + '" data-y="' + esc(e.syllabusId) + '"';
          return '<div class="list-row">' + A.avatar(u, "sm") + '<div class="grow"><div class="title">' + esc(u.name) + (u.studentNo ? ' <span class="muted small">' + esc(u.studentNo) + "</span>" : "") +
            '</div><div class="meta small">' + (drop ? "wants to drop" : "wants to take") + " <b>" + esc(s.subject) + "</b>" + (u.status === "pending" ? ' · <span class="warn-text">account not approved yet</span>' : "") + " · " + A.relTime(drop ? e.dropRequestedAt : e.requestedAt) + "</div></div>" +
            '<button class="btn btn-sm btn-primary" data-act="subj-decide"' + at + ' data-yes="1">' + I("check") + (drop ? "Approve drop" : "Approve") + "</button>" +
            '<button class="btn btn-sm btn-ghost" data-act="subj-decide"' + at + ' data-yes="0">' + (drop ? "Decline: keep it" : "Decline") + "</button></div>";
        }).join("") + (limit && list.length > limit ? '<div class="card-foot"><a class="btn btn-sm" href="#/t/requests">See all ' + list.length + "</a></div>" : "") + "</div>";
    };
    return card(joins, false) + card(drops, true);
  };
  A.route("t/requests", function (p, q, me) {
    var html = A.subjectRequestsHtml(me) || '<div class="card">' + UI.empty("checkCircle", "No subject requests", "When students ask to take your subjects, they appear here.") + "</div>";
    return { title: "Subject requests", html: html };
  }, { role: "teacher" });
  A.act["subj-decide"] = function (el) {
    var sid = el.getAttribute("data-s"), syl = el.getAttribute("data-y"), yes = el.getAttribute("data-yes") === "1", me = M.me();
    var drop = (M.enrolment(sid, syl) || {}).status === "drop_pending";
    el.disabled = true;
    M.decideSubject(sid, syl, yes, me.id).then(function () {
      var u = M.user(sid), s = M.syllabus(syl), who = u ? A.firstName(u.name) : "The student", what = s ? s.subject : "the subject";
      UI.toast(drop ? (yes ? who + " has dropped " + what : who + " is still taking " + what) : who + (yes ? " can now take " : " was declined for ") + what);
      A.render();
    }).catch(function (e) { el.disabled = false; UI.toast(e.message || String(e), "bad"); A.render(); });
  };
  A.act["subj-decide-all"] = function () {
    var me = M.me(), reqs = M.subjectRequests(me).filter(function (e) { return e.status === "pending"; }); // requests to join only: drops are answered one by one
    UI.confirm("Approve all " + reqs.length + " subject requests?", { ok: "Approve all" }).then(function (ok) {
      if (!ok) return;
      reqs.reduce(function (p, e) { return p.then(function () { return M.decideSubject(e.studentId, e.syllabusId, true, me.id); }); }, Promise.resolve())
        .then(function () { UI.toast("Approved " + reqs.length); A.render(); })
        .catch(function (e) { UI.toast(e.message || String(e), "bad"); A.render(); });
    });
  };

  /* ------------------------------------------------------------ the admin: teachers */
  function teacherSubjects(u) { return M.classesForTeacher(u.id).map(function (c) { return c.syllabusId; }); }
  function showSignIn(title, name, email, pw) {
    UI.modal({
      title: title, size: "",
      body: "<p>Give " + esc(A.firstName(name)) + " these details. They sign in with <b>I'm a teacher or the admin</b>, and can change the password in Settings.</p>" +
        '<dl class="kv mt"><dt>Email</dt><dd><b>' + esc(email) + '</b></dd><dt>Password</dt><dd><code style="font-size:18px">' + esc(pw) + "</code></dd></dl>" +
        '<p class="tiny muted mt">This password is shown once. Write it down now.</p>',
      foot: [{ label: "Done", cls: "btn-primary" }],
    });
  }
  A.act["teacher-add"] = function () {
    UI.modal({
      title: "Add a teacher", sub: "They approve students for their subjects and see those classes.",
      body: '<form id="teacher-add" class="form-grid"><label class="field full"><span>Full name</span><input class="input" name="name" autocomplete="off"></label>' +
        '<label class="field full"><span>Email address</span><input class="input" type="email" name="email" autocomplete="off"><span class="hint">They sign in with this address.</span></label>' +
        '<div class="field full"><span class="label">Subjects they teach</span><div class="subj-picker">' + A.subjectPicker(M.offeredSubjects(), {}) + "</div></div></form>",
      foot: [{ label: "Cancel" }, { label: "Add teacher", cls: "btn-primary", onClick: function (m) {
        var f = m.querySelector("#teacher-add"), name = f.name.value.trim(), email = f.email.value.trim(), subjects = picked(f);
        if (name.length < 2) { UI.toast("Enter the teacher's name", "bad"); return false; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { UI.toast("Enter the teacher's email address", "bad"); return false; }
        A.Cloud.admin("create-teacher", { name: name, email: email, subjects: subjects }).then(function (r) {
          return A.Sync.syncNow().catch(function () {}).then(function () { A.render(); showSignIn(name + " is ready", name, r.email, r.password); });
        }).catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      } }],
    });
  };
  A.act["teacher-subjects"] = function (el) {
    var u = M.user(el.getAttribute("data-id")), chosen = {};
    teacherSubjects(u).forEach(function (id) { chosen[id] = 1; });
    UI.modal({
      title: "Subjects " + u.name + " teaches", sub: "Subjects you take away go back to you (the admin).",
      body: '<form id="teacher-subj" class="subj-picker">' + A.subjectPicker(M.offeredSubjects(), chosen) + "</form>",
      foot: [{ label: "Cancel" }, { label: "Save", cls: "btn-primary", onClick: function (m) {
        A.Cloud.admin("teacher-subjects", { appId: u.id, subjects: picked(m.querySelector("#teacher-subj")) })
          .then(function () { return A.Sync.syncNow().catch(function () {}); }).then(function () { UI.toast("Saved"); A.render(); })
          .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
      } }],
    });
  };
  A.act["teacher-reset"] = function (el) {
    var u = M.user(el.getAttribute("data-id"));
    UI.confirm("Give " + u.name + " a new password? Their old one stops working.", { ok: "New password" }).then(function (ok) {
      if (!ok) return;
      A.Cloud.admin("reset", { appId: u.id }).then(function (r) { showSignIn("New password for " + u.name, u.name, r.email || "", r.password); })
        .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
    });
  };
  A.act["teacher-remove"] = function (el) {
    var u = M.user(el.getAttribute("data-id"));
    UI.confirm("Remove " + u.name + "? Their sign-in is deleted and their subjects come back to you.", { danger: true, ok: "Remove" }).then(function (ok) {
      if (!ok) return;
      A.Cloud.admin("remove", { appId: u.id }).then(function () { return A.Sync.syncNow().catch(function () {}); }).then(function () { UI.toast(u.name + " was removed"); A.render(); })
        .catch(function (e) { UI.toast(e.message || String(e), "bad"); });
    });
  };
})(window.App);
