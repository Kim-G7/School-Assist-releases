/* Schoolly's tour of a page (2026-11-15), in place of asking it "how do I…": the S button at the top shows the page
 * the person is on, one thing at a time, the way a design tool shows its newcomers round. A welcome card says what
 * the page is for and what can be done there; then a spotlight moves from part to part (its tabs, its numbers, each
 * box to fill in, each button, its table or list), and a card beside it, with an arrow pointing at it, says what that
 * part does and how to use it: with the mouse, and with the keyboard (Tab, Enter, the arrow keys).
 *   Next, Back, the → and ← keys, the dots; Esc or × ends it. Nothing on the page can be pressed while it runs.
 * The parts are found on the page as it is drawn, for every page and every person (a teacher sees a teacher's buttons),
 * and described from what they are: a button by its words or its tip, a box by its label and example, a table by its
 * columns. Pages and buttons that need more than that have their own words below. It works offline, like the rest
 * of Schoolly, and changes nothing. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI;
  var T = (A.Tour = {});

  /* ------------------------------------------------------------------ what each page is for */
  var PAGES = [
    [/^t\/home/, "Today", "Your day at a glance: today's register, your lessons, students' work waiting to be marked, and the things you do most."],
    [/^t\/pupils/, "My class", "Your class's students: add a student, change their details, or open one to see everything about them."],
    [/^t\/pupil\//, "A student", "One student: their details, the subjects they take and who teaches them, their attendance and their marks."],
    [/^t\/others\/[^/?]+/, "the class", "Another class: its students, its marks and how far its syllabus is taught. View only: its own teachers change these."],
    [/^t\/others/, "View other classes", "Every class in the school, form by form, with its class teacher and students. Open one to see its students, marks and syllabus (view only)."],
    [/^t\/register/, "Register", "Today's register: mark each student present, absent, late or excused. It saves by itself."],
    [/^t\/timetable/, "Timetable", "The week's lessons: yours, or a class's. Each lesson shows its subject and its teacher."],
    [/^t\/markbook/, "Mark book", "The tests of the classes you teach: topic tests, mock tests and the end-of-term test, written on paper: Record marks and type each student's mark (class work and homework are in each subject class's Gradebook)."],
    [/^t\/assessment\//, "Marked work", "One piece of marked work: each student's mark out of the total, with the class's average, highest and lowest."],
    [/^t\/reports/, "Reports", "The term's reports: each student's marks and your comments, and the top students in each form. Admins make the report cards."],
    [/^t\/reportcards/, "Report cards", "Make, check and print the school's report cards, and choose how they look."],
    [/^t\/schemes/, "Schemes & records", "Each subject's scheme of work, from its syllabus: you give each topic its term and tick it when taught."],
    [/^t\/subjects/, "My subjects", "The subjects and classes you teach, and how far each syllabus is taught."],
    [/^t\/tracker/, "Syllabus tracker", "One subject in one class: its topics, which term each is for, and which are taught."],
    [/^t\/enrol/, "Enter students", "New students, each with their form, class and subjects."],
    [/^t\/notices/, "Notices", "Messages from the school's leaders to staff, students or parents."],
    [/^t\/overview/, "Teachers' overview", "Each teacher's term: how far their syllabuses are, their registers and their mark book."],
    [/^t\/settings/, "Settings", "The school's details, its people and devices, subjects and codes, backups and more."],
    [/^t\/fees/, "School fees", "Fees charged and paid, student by student, with receipts."],
    [/^t\/vacation/, "Vacation mode", "The dates the school is closed, when School Assist stays quiet."],
    [/^t\/parents/, "Parents", "Which parents use School Assist, and the link that lets them join."],
    [/^t\/classes/, "Subject classes", "The subject classes you teach, with their tasks and students' work."],
    [/^t\/task\//, "A task", "One piece of set work: who has received and handed it in, and your feedback. Its marks go in the class's Gradebook."],
    [/^t\/tutor/, "Co-teacher", "Every topic of your subjects' syllabuses, in the syllabus's order: add notes, short notes or a textbook for each, and the students' tutor teaches from them."],
    [/^t\/materials/, "Learning materials", "Textbooks, exam papers and other files for your subjects. Notes for a topic are in Co-teacher."],
    [/^t\/syllabi/, "Syllabus library", "Every syllabus of the school, each once, with its syllabus ID and code: those added here and those added from a class."],
    [/^t\/syllabus\//, "A syllabus", "One syllabus: its topics in order, its papers, grade boundaries and files."],
    [/^s\/home/, "Home", "Your day: today's lessons, what is due, and where you left off."],
    [/^s\/tasks/, "My tasks", "Work your teachers have set you, with when each is due."],
    [/^s\/timetable/, "Timetable", "Your week's lessons: each with its subject and its teacher."],
    [/^s\/exam/, "Exam mode", "Tests and past papers to sit, timed, with your marks and the points you got."],
    [/^s\/subjects/, "My subjects", "Your subjects, each with its code and teacher."],
    [/^s\/library/, "Library", "Books, notes and files from your teachers."],
    [/^s\/progress/, "My progress", "How you are doing, subject by subject."],
    [/^s\/settings/, "Settings", "Your password, light or dark, and this device."],
  ];
  // buttons that need more than their words (by what they say; the page's own tip comes first)
  var SAY = [
    [/^take the register/i, "Opens today's register for your class."],
    [/^enter marks/i, "Opens the mark book, to enter marks."],
    [/^print/i, "Makes a copy to print, or to save as a PDF."],
    [/^full week/i, "Opens the whole week's timetable."],
    [/^edit the class/i, "Changes the class: its name, form, stream and class teacher."],
    [/^edit$/i, "Changes this one's details."],
    [/^save/i, "Keeps the changes."],
    [/^done$/i, "Finishes changing, and shows the result."],
    [/^top students/i, "Each form's best students this term, by their average mark."],
    [/^syllabus$/i, "Opens the subject's syllabus: its topics, as read from its document."],
    [/^spread the topics/i, "Gives each topic a term, in the syllabus's order: change any you like afterwards."],
  ];

  /* ------------------------------------------------------------------ finding the page's parts */
  var visible = function (el) {
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
  };
  var words = function (el) { return String((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim(); };
  var lower = function (s) { return s.charAt(0).toLowerCase() + s.slice(1); };
  var labelOf = function (el) { return words(el) || el.getAttribute("aria-label") || (el.getAttribute("data-tip") || "").replace(/<[^>]+>/g, "") || el.getAttribute("title") || ""; };
  var headingNear = function (el) { var c = el.closest(".card"), h = c && c.querySelector(".card-head h3"); return h ? words(h) : ""; };
  var pageOf = function (href) {
    var path = String(href || "").replace(/^#\//, "").split("?")[0];
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i][0].test(path)) return PAGES[i];
    return null;
  };
  /** The page's parts, in the order they are on the screen: [{ el, kind }]. At most `max` of them, the most useful. */
  function parts(view, max) {
    var out = [], seen = new Set(), acts = {};
    var add = function (el, kind, rank) { if (!el || seen.has(el) || !visible(el) || el.closest(".tour")) return; seen.add(el); out.push({ el: el, kind: kind, rank: rank }); };
    var inside = function (el) { return out.some(function (p) { return p.el !== el && p.el.contains(el); }); };
    view.querySelectorAll(".pill-tabs, .seg, .tabs").forEach(function (el) { if (el.querySelectorAll("button, a").length > 1) add(el, "tabs", 1); });
    view.querySelectorAll(".grid").forEach(function (el) { if (el.querySelectorAll(":scope > .stat").length > 1) add(el, "stats", 2); });
    view.querySelectorAll("label.field, .field").forEach(function (el) {
      var c = el.querySelector("input:not([type=hidden]), select, textarea");
      if (c && visible(c) && !inside(el)) add(el, "field", 3);
    });
    view.querySelectorAll("input.input, select.select, textarea").forEach(function (el) {
      if (el.closest(".field") || el.closest(".pas-row") || el.closest("table") || el.closest(".list-row") || el.type === "hidden") return;
      add(el, "field", 3);
    });
    view.querySelectorAll(".btn, button[data-act], a[data-act]").forEach(function (el) {
      if (inside(el) || el.closest("table, .list-row, .tt, .pquick")) return;
      var key = (el.getAttribute("data-act") || el.getAttribute("href") || "") + "|" + labelOf(el);
      if (acts[key]) return;
      acts[key] = 1;
      add(el, "button", el.classList.contains("btn-primary") ? 2 : 4);
    });
    view.querySelectorAll(".pquick").forEach(function (el) { add(el, "quick", 2); });
    var tables = 0;
    view.querySelectorAll(".table-wrap").forEach(function (el) { if (tables < 2 && el.querySelector("table") && !inside(el)) { tables++; add(el, "table", 2); } });
    var lists = 0;
    view.querySelectorAll(".card").forEach(function (card) {
      var row = card.querySelector(":scope > a.list-row.click, :scope > .list-row.click, :scope > .list-row a.click");
      if (row && lists < 2 && !inside(row)) { lists++; add(row, "row", 3); }
    });
    if (out.length > max) out = out.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, max);
    return out.sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
  }

  /* ------------------------------------------------------------------ what to say about a part */
  var KEYS = {
    button: "Click it, or press Tab until it is outlined and then Enter.",
    link: "Click it to open that page; Back, at the top left, brings you here again.",
    field: "Click in the box and type. Tab moves to the next box, Shift+Tab to the one before.",
    select: "Click it and pick one, or Tab to it and choose with the arrow keys.",
    tabs: "Click one, or Tab to it and press Enter.",
  };
  function describe(p) {
    var el = p.el, k = p.kind, tip = (el.getAttribute("data-tip") || "").replace(/<[^>]+>/g, "");
    if (k === "tabs") {
      var names = Array.prototype.map.call(el.querySelectorAll("button, a"), function (b) { return words(b).replace(/\s*\(\d+\)$/, ""); }).filter(Boolean);
      var on = el.querySelector(".on"), heading = el.getAttribute("aria-label");
      return { title: heading || "Choose what to see", text: "These switch what the page shows: " + names.slice(0, 8).join(", ") + (names.length > 8 ? " and more" : "") + "." + (on ? " The one in colour, " + words(on).replace(/\s*\(\d+\)$/, "") + ", is open now." : ""), how: KEYS.tabs };
    }
    if (k === "stats") {
      var lbls = Array.prototype.map.call(el.querySelectorAll(".stat .lbl"), words).filter(Boolean);
      return { title: "At a glance", text: "This page's numbers: " + lbls.join(", ") + ".", how: el.querySelector("[data-tip]") ? "Point at a number for more about it." : "" };
    }
    if (k === "quick") {
      var q = Array.prototype.map.call(el.querySelectorAll("a, button"), words).filter(Boolean);
      return { title: headingNear(el) || "Quick actions", text: "The things you do most, one click away: " + q.join(", ") + ".", how: KEYS.button };
    }
    if (k === "table") {
      var t = el.querySelector("table"), n = t.querySelectorAll("tbody tr").length;
      // (the headings as written, not as the page shows them in capitals)
      var heads = Array.prototype.map.call(t.querySelectorAll("thead th"), function (th) { return String(th.textContent || "").replace(/\s+/g, " ").trim(); }).filter(Boolean);
      if (t.classList.contains("tt") || t.classList.contains("tt-days")) return { title: "The week", text: "The days down the side and the times across. Each lesson shows its subject and its teacher, written as Mrs Dube; a lesson that runs on is one long box.", how: el.scrollWidth > el.clientWidth + 2 ? "Slide it sideways to see the whole day." : "" };
      var how = [];
      if (el.classList.contains("boxed")) how.push("A long table scrolls inside its box; at its end the page carries on.");
      if (el.scrollWidth > el.clientWidth + 2) how.push("Slide it sideways (Shift and the mouse wheel, or a finger on a touch screen) to see every column.");
      if (t.querySelector("input, select")) how.push("Click a box in it to type; Enter or Tab moves on.");
      return { title: headingNear(el) || "The table", text: n + " row" + (n === 1 ? "" : "s") + (heads.length ? ", with " + heads.slice(0, 7).join(", ") + (heads.length > 7 ? " and more" : "") : "") + ".", how: how.join(" ") };
    }
    if (k === "row") {
      var title = words(el.querySelector(".title")) || words(el).slice(0, 60);
      return { title: headingNear(el) || "A list", text: "Each row is one item; open one to see it in full, such as " + title + ".", how: "Click a row, or Tab to it and press Enter." };
    }
    if (k === "field") {
      var c = el.matches("input, select, textarea") ? el : el.querySelector("input:not([type=hidden]), select, textarea");
      var name = el.matches("input, select, textarea") ? (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "This box") : words(el.querySelector(":scope > span, :scope > .label")) || c.getAttribute("aria-label") || "This box";
      name = name.replace(/\s*\(optional\)\s*$/i, ""); var opt = /\(optional\)/i.test(words(el));
      var ph = (c.getAttribute("placeholder") || "").replace(/^e\.g\.\s*/i, ""), hint = words(el.querySelector(".hint"));
      var type = c.tagName === "SELECT" ? "select" : c.tagName === "TEXTAREA" ? "textarea" : (c.getAttribute("type") || "text").toLowerCase();
      if (c.getAttribute("data-dmy") != null || type === "date" || el.querySelector("[data-dmy-text]")) type = "date";
      var text = type === "select" ? "Choose " + lower(name) + " from the list." + (c.getAttribute("data-change") ? " The page changes as soon as you choose." : "")
        : type === "checkbox" ? "Tick it for " + lower(name) + "."
        : type === "number" ? "Type " + lower(name) + " as a number" + (c.getAttribute("max") ? ", up to " + c.getAttribute("max") : "") + "."
        : type === "date" ? "The date for " + lower(name) + ": type it as day/month/year (dd/mm/yyyy), or press the calendar beside it."
        : type === "file" ? "Choose a file on this computer for " + lower(name) + "."
        : type === "search" ? "Type to find what you want: the list narrows as you type."
        : type === "textarea" ? "Write " + lower(name) + " here; it can take several lines."
        : "Type " + lower(name) + " here" + (ph ? ", for example " + ph : "") + ".";
      if (opt) text += " You can leave it empty.";
      if (hint) text += " " + hint;
      return { title: name, text: text, how: type === "select" ? KEYS.select : type === "checkbox" ? "Click it, or Tab to it and press Space." : KEYS.field };
    }
    // a button or a link
    var label = labelOf(el).replace(/\s+/g, " ").trim(), say = null;
    SAY.forEach(function (x) { if (!say && x[0].test(label)) say = x[1]; });
    var href = el.getAttribute("href") || el.getAttribute("data-href"), page = href && /^#\//.test(href) ? pageOf(href) : null;
    var text = tip && tip !== label ? tip : say || (page ? "Opens " + page[1] + ". " + page[2] : /^(add|new|make|print|save|edit|delete|remove|send|take|enter|upload|download|import|export|choose|open|show|use|spread|give|let|copy|mark|start|set|read|check|change|turn)\b/i.test(label) ? "Press it to " + lower(label) + "." : "Press it for " + lower(label) + ".");
    if (el.disabled || el.getAttribute("aria-disabled") === "true") text += " It can't be pressed just now.";
    if (el.classList.contains("btn-danger")) text += " It asks before anything is lost.";
    return { title: label || "A button", text: text, how: page ? KEYS.link : KEYS.button };
  }

  /* ------------------------------------------------------------------ the tour */
  var cur = null; // { steps, i, root, hole, pop }
  /** The page's own steps: a welcome, then its parts; on a person's home page also the menu and the top bar. */
  function steps(me) {
    var view = document.getElementById("view"), path = location.hash.replace(/^#\//, "");
    if (!view) return [];
    // the page's own title (a class's name, "English · Form 2A"), else the name it has here
    var pg = pageOf(location.hash), titleEl = document.querySelector(".topbar .page-title"), title = (titleEl && words(titleEl)) || (pg ? pg[1] : "this page");
    var can = A.Schoolly && A.Schoolly.helpFor ? A.Schoolly.helpFor(me, location.hash) : [];
    var hi = A.firstName(me.name);
    var out = [{ welcome: true, title: (path === A.home(me).replace(/^#\//, "") ? "Welcome, " : "Hello, ") + hi, text: "This is " + title + ". " + (pg ? pg[2] : "Let me show you round it."),
      can: can.map(function (h) { return h.q; }), how: "Next, or the → key, goes on; ← goes back; Esc ends the tour at any time." }];
    var home = A.home(me).replace(/^#\//, "").split("?")[0] === path.split("?")[0];
    if (home) {
      var nav = document.querySelector(".sidebar .nav"), bottom = document.querySelector(".bottom-nav");
      var menu = visible(nav) ? nav : visible(bottom) ? bottom : null;
      if (menu) out.push({ el: menu, title: "The menu", text: "Every page you use. The one you are on is in colour; a number beside a page is something waiting for you.", how: "Click a page, or Tab through them and press Enter." });
    }
    parts(view, 14).forEach(function (p) { var d = describe(p); out.push({ el: p.el, title: d.title, text: d.text, how: d.how }); });
    if (home) {
      var tools = document.querySelector(".topbar .top-actions");
      if (visible(tools)) out.push({ el: tools, title: "At the top", text: "S is Schoolly: this tour, on whichever page you are. The bell has your notifications, the moon or sun changes light and dark, and the last button fills the screen.", how: KEYS.button });
    }
    return out;
  }
  /** Where an element is: a path from the page, to find it again if the page is drawn again under the tour. */
  var pathOf = function (el) {
    var path = [];
    for (; el && el.id !== "view" && el !== document.body; el = el.parentElement) {
      var i = 1, s = el; while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
      path.unshift(el.tagName.toLowerCase() + ":nth-of-type(" + i + ")");
    }
    return (el && el.id === "view" ? "#view > " : "body > ") + path.join(" > ");
  };
  var targetOf = function (st) {
    if (!st.el) return null;
    if (document.contains(st.el)) return st.el;
    var again = st.path && document.querySelector(st.path);
    if (again) st.el = again;
    return again || null;
  };

  function draw() {
    var st = cur.steps[cur.i], n = cur.steps.length, last = cur.i === n - 1;
    cur.pop.className = "tour-pop" + (st.welcome ? " welcome" : "");
    cur.pop.innerHTML = '<div class="tour-arrow"></div><div class="tour-top">' + A.Schoolly.mark() + '<span class="tour-count">' + (st.welcome ? "Schoolly · a tour of this page" : cur.i + " of " + (n - 1)) + '</span><span class="grow"></span>' +
      '<button type="button" class="tour-x" data-tour="end" aria-label="End the tour">' + I("x") + "</button></div>" +
      '<h4 id="tour-title">' + esc(st.title) + "</h4><p>" + esc(st.text) + "</p>" +
      (st.can && st.can.length ? '<div class="tour-can"><b>Here you can</b><ul>' + st.can.slice(0, 5).map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul></div>" : "") +
      (st.how ? '<p class="tour-how">' + I("info") + "<span>" + esc(st.how) + "</span></p>" : "") +
      '<div class="tour-foot"><div class="tour-dots" aria-hidden="true">' + cur.steps.map(function (_, i) { return '<i class="' + (i === cur.i ? "on" : i < cur.i ? "done" : "") + '" data-tour-go="' + i + '"></i>'; }).join("") + "</div>" +
      (cur.i ? '<button type="button" class="btn btn-sm btn-ghost" data-tour="back">' + I("left") + "Back</button>" : "") +
      '<button type="button" class="btn btn-sm btn-primary" data-tour="next">' + (last ? "Done" : st.welcome ? "Show me" : "Next") + (last ? "" : I("right")) + "</button></div>";
    var el = targetOf(st);
    cur.root.classList.toggle("dim", !el);
    if (el) {
      var narrow = window.innerWidth < 640, r = el.getBoundingClientRect();
      if (narrow) window.scrollBy({ top: r.top - 90, behavior: "smooth" });
      else if (r.top < 70 || r.bottom > window.innerHeight - 20 || r.height > window.innerHeight - 90) el.scrollIntoView({ block: r.height > window.innerHeight - 140 ? "start" : "center", behavior: "smooth" });
    }
    place();
    var next = cur.pop.querySelector('[data-tour="next"]');
    if (next) next.focus({ preventScroll: true });
  }
  /** The spotlight on the part, and the card beside it with its arrow pointing at it (under the part when there is room,
      else above, else beside; on a phone a sheet at the foot of the screen). */
  function place() {
    if (!cur) return;
    var st = cur.steps[cur.i], el = targetOf(st), vw = window.innerWidth, vh = window.innerHeight, pop = cur.pop, hole = cur.hole, arrow = pop.querySelector(".tour-arrow");
    pop.style.left = pop.style.top = pop.style.bottom = "";
    pop.removeAttribute("data-side");
    if (!el) { hole.style.opacity = "0"; pop.setAttribute("data-side", "center"); return; }
    var r = el.getBoundingClientRect(), pad = 6, top = 0;
    var bar = document.querySelector(".topbar"); if (bar && getComputedStyle(bar).position === "sticky" && !el.closest(".topbar")) top = Math.max(0, bar.getBoundingClientRect().bottom);
    var x1 = Math.max(4, r.left - pad), y1 = Math.max(el.closest(".topbar, .sidebar, .bottom-nav") ? 4 : top + 2, r.top - pad), x2 = Math.min(vw - 4, r.right + pad), y2 = Math.min(vh - 4, r.bottom + pad);
    hole.style.opacity = y2 > y1 + 4 ? "1" : "0";
    hole.style.left = x1 + "px"; hole.style.top = y1 + "px"; hole.style.width = Math.max(0, x2 - x1) + "px"; hole.style.height = Math.max(0, y2 - y1) + "px";
    if (vw < 640) { pop.setAttribute("data-side", "sheet"); return; }
    var pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 14, side;
    if (y2 + gap + ph <= vh - 8) side = "below";
    else if (y1 - gap - ph >= 8) side = "above";
    else if (x2 + gap + pw <= vw - 8) side = "right";
    else if (x1 - gap - pw >= 8) side = "left";
    else side = "over";
    pop.setAttribute("data-side", side);
    var cx = (x1 + x2) / 2, cy = (Math.max(y1, 0) + Math.min(y2, vh)) / 2, left, ptop;
    if (side === "below" || side === "above" || side === "over") {
      left = Math.max(12, Math.min(vw - pw - 12, cx - pw / 2));
      ptop = side === "below" ? y2 + gap : side === "above" ? y1 - gap - ph : Math.max(12, vh - ph - 16);
      arrow.style.left = Math.max(18, Math.min(pw - 18, cx - left)) + "px"; arrow.style.top = "";
    } else {
      left = side === "right" ? x2 + gap : x1 - gap - pw;
      ptop = Math.max(12, Math.min(vh - ph - 12, cy - ph / 2));
      arrow.style.top = Math.max(18, Math.min(ph - 18, cy - ptop)) + "px"; arrow.style.left = "";
    }
    pop.style.left = left + "px"; pop.style.top = ptop + "px";
  }
  function go(i) {
    if (!cur) return;
    if (i < 0) return;
    if (i >= cur.steps.length) return T.end(true);
    cur.i = i; draw();
  }
  var onKey = function (e) {
    if (!cur) return;
    if (e.key === "Escape") { e.preventDefault(); T.end(false); }
    else if (e.key === "ArrowRight" || (e.key === "Enter" && !e.target.closest("[data-tour]"))) { e.preventDefault(); go(cur.i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(cur.i - 1); }
    else if (e.key === "Tab") { // the keyboard stays in the card
      var f = Array.prototype.slice.call(cur.pop.querySelectorAll("button")); if (!f.length) return;
      var at = f.indexOf(document.activeElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && at === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  var follow = function () { if (cur && !cur.raf) cur.raf = requestAnimationFrame(function () { if (cur) { cur.raf = 0; place(); } }); };
  var leave = function () { T.end(false, true); };

  /** Start the tour of the page on the screen. */
  T.start = function () {
    var me = M.me();
    if (!me || cur) return;
    var list = steps(me);
    if (!list.length) return;
    list.forEach(function (st) { if (st.el) st.path = pathOf(st.el); });
    var root = document.createElement("div");
    root.className = "tour";
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "tour-title");
    root.innerHTML = '<div class="tour-hole"></div><div class="tour-pop"></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add("touring");
    cur = { steps: list, i: 0, root: root, hole: root.querySelector(".tour-hole"), pop: root.querySelector(".tour-pop"), raf: 0, back: document.activeElement };
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tour]"), dot = e.target.closest("[data-tour-go]");
      if (b) { var w = b.getAttribute("data-tour"); if (w === "end") T.end(false); else go(cur.i + (w === "next" ? 1 : -1)); }
      else if (dot) go(Number(dot.getAttribute("data-tour-go")));
    });
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("hashchange", leave);
    try { localStorage.setItem("sa-tour-seen-" + me.id, "1"); } catch (e) { /* this device only */ }
    var btn = document.querySelector(".schoolly-btn"); if (btn) btn.classList.remove("new");
    draw();
  };
  /** End it (done: the last step was reached). */
  T.end = function (done, quiet) {
    if (!cur) return;
    var c = cur; cur = null;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", follow);
    window.removeEventListener("scroll", follow, true);
    window.removeEventListener("hashchange", leave);
    document.documentElement.classList.remove("touring");
    c.root.remove();
    if (!quiet && c.back && c.back.focus && document.contains(c.back)) c.back.focus({ preventScroll: true });
    if (done && !quiet) UI.toast("That's this page. Press S on any page for its tour.");
  };
  T.running = function () { return !!cur; };
  /** Has this person not had a tour yet on this device? (the S button has a dot until they have) */
  T.isNew = function (me) { try { return !!me && !localStorage.getItem("sa-tour-seen-" + me.id); } catch (e) { return false; } };
})(window.App);
