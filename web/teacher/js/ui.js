/* UI kit: modal, toast, tooltip, charts and small building blocks. */
(function (A) {
  "use strict";
  var UI = (A.UI = {});
  var esc = A.esc, I = A.icon;

  /* ------------------------------------------------------------------ toast */
  UI.toast = function (msg, kind) {
    var root = document.getElementById("toast-root");
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.setAttribute("role", "status");
    el.innerHTML = I(kind === "bad" ? "alert" : "checkCircle") + "<span>" + esc(msg) + "</span>";
    root.appendChild(el);
    setTimeout(function () { el.style.transition = "opacity .3s"; el.style.opacity = "0"; }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  };

  /* While a pop-up is open the page behind it stays still: swipes and the wheel move only the pop-up. On iPhones
     overflow: hidden on the page is not enough, so the page is pinned where it was and put back when the last
     pop-up closes, however it closes (some are removed straight from the page). */
  var pinnedY = null, pinnedAt = "";
  function pinPage() {
    if (pinnedY != null) return;
    pinnedY = window.scrollY || 0; pinnedAt = location.hash;
    var b = document.body.style;
    b.position = "fixed"; b.top = -pinnedY + "px"; b.left = "0"; b.right = "0"; b.width = "100%";
    document.documentElement.classList.add("modal-open");
  }
  function unpinPage() {
    var root = document.getElementById("modal-root");
    if (pinnedY == null || (root && root.querySelector(".modal-back"))) return;
    var y = pinnedY, b = document.body.style;
    pinnedY = null;
    b.position = b.top = b.left = b.right = b.width = "";
    document.documentElement.classList.remove("modal-open");
    if (location.hash === pinnedAt) window.scrollTo(0, y); // a new page starts at the top
  }

  /* ------------------------------------------------------------------ modal
     UI.modal({ title, sub, body, size, foot: [{label, cls, onClick(el) → false keeps it open}], onMount(el), onClose }) */
  UI.modal = function (o) {
    var root = document.getElementById("modal-root");
    if (!root._pin && window.MutationObserver) { root._pin = new MutationObserver(unpinPage); root._pin.observe(root, { childList: true }); }
    var back = document.createElement("div");
    back.className = "modal-back";
    var foot = (o.foot || [{ label: "Close" }]).map(function (b, i) {
      return '<button type="button" class="btn ' + (b.cls || "") + '" data-mi="' + i + '">' + (b.icon ? I(b.icon) : "") + esc(b.label) + "</button>";
    }).join("");
    back.innerHTML =
      '<div class="modal ' + (o.size || "") + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title || "") + '">' +
      '<div class="modal-head"><div class="grow"><h3>' + esc(o.title || "") + "</h3>" + (o.sub ? '<div class="sub">' + o.sub + "</div>" : "") + "</div>" +
      '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">' + I("x") + "</button></div>" +
      '<div class="modal-body ' + (o.flush ? "flush" : "") + '">' + (o.body || "") + "</div>" +
      (o.foot === false ? "" : '<div class="modal-foot">' + foot + "</div>") + "</div>";
    root.appendChild(back);
    pinPage();
    var modalEl = back.querySelector(".modal");
    var close = function () {
      back.remove();
      unpinPage();
      document.removeEventListener("keydown", onKey);
      if (o.onClose) o.onClose();
    };
    var onKey = function (e) { if (e.key === "Escape" && root.lastElementChild === back) close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("mousedown", function (e) { if (e.target === back && !o.sticky) close(); });
    back.querySelector("[data-close]").addEventListener("click", close);
    back.querySelectorAll("[data-mi]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var b = (o.foot || [{ label: "Close" }])[Number(btn.getAttribute("data-mi"))];
        var r = b.onClick ? b.onClick(modalEl) : true;
        Promise.resolve(r).then(function (keep) { if (keep !== false) close(); });
      });
    });
    var first = modalEl.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select");
    if (first && !o.noFocus) setTimeout(function () { first.focus(); }, 30);
    if (o.onMount) o.onMount(modalEl, close);
    return { el: modalEl, close: close };
  };

  /** Pages to print, shown first as they will print: o = { title, html (the pages), css (their styles and @page),
      pageWidth (px, to fit them on the screen) }. They stay until Close, and Print opens the dialog from the tap: a
      phone's print dialog doesn't wait (the pages used to be gone before it printed), and a print started by the page
      again and again is blocked. */
  UI.printSheet = function (o) {
    var root = document.getElementById("print-root");
    if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
    root.innerHTML = '<div class="print-bar"><b class="grow">' + esc(o.title || "Print") + '</b><button type="button" class="btn btn-primary" data-print-now>' + I("download") + "Print or save as PDF</button>" +
      '<button type="button" class="btn" data-print-close>' + I("x") + "Close</button></div><style>" + (o.css || "") + '</style><div class="print-pages">' + o.html + "</div>";
    root.classList.add("open");
    document.body.classList.add("printing");
    var pages = root.querySelector(".print-pages");
    var fit = function () { pages.style.zoom = String(Math.min(1, Math.max(0.3, (root.clientWidth - 24) / (o.pageWidth || 794)))); };
    var key = function (e) { if (e.key === "Escape") close(); };
    var close = function () { root.classList.remove("open"); document.body.classList.remove("printing"); root.innerHTML = ""; window.removeEventListener("resize", fit); document.removeEventListener("keydown", key); };
    fit();
    UI.fitText(pages);
    window.addEventListener("resize", fit);
    document.addEventListener("keydown", key);
    root.querySelector("[data-print-now]").addEventListener("click", function () { window.print(); });
    root.querySelector("[data-print-close]").addEventListener("click", close);
    return { close: close };
  };

  UI.confirm = function (msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false;
      UI.modal({
        title: opts.title || "Are you sure?", body: '<p class="muted">' + esc(msg) + "</p>",
        foot: [
          { label: "Cancel", onClick: function () { done = true; resolve(false); } },
          { label: opts.ok || "Confirm", cls: opts.danger ? "btn-danger" : "btn-primary", onClick: function () { done = true; resolve(true); } },
        ],
        onClose: function () { if (!done) resolve(false); },
      });
    });
  };

  /** Collect named fields; checkbox groups with the same name become arrays. */
  UI.formData = function (root) {
    var out = {};
    root.querySelectorAll("[name]").forEach(function (el) {
      var n = el.name;
      if (el.type === "checkbox") {
        if (root.querySelectorAll('[name="' + n + '"]').length > 1) { out[n] = out[n] || []; if (el.checked) out[n].push(el.value); }
        else out[n] = el.checked;
      } else if (el.type === "radio") { if (el.checked) out[n] = el.value; }
      else if (el.type === "file") out[n] = el.files && el.files[0] ? el.files[0] : null;
      else out[n] = el.value;
    });
    return out;
  };

  /* ---------------------------------------------------------------- tooltip */
  var tip;
  function placeTip(e) {
    var x = e.clientX + 14, y = e.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  // a tip shown by a tap (phones send a mouseover with it) or by focus goes after 2 seconds; with a mouse it goes when the
  // pointer leaves what it's about, leaves the window, the page scrolls or changes under it, or after 5 seconds at rest
  // (2026-11-14: before, a tip stayed on whenever no other mouseover came, e.g. Parents' "Students with no parent's details")
  var tipTimer = null, lastTouch = 0, tipFor = null;
  var hideTip = function () { clearTimeout(tipTimer); tipFor = null; if (tip) tip.classList.remove("on"); };
  var tipBriefly = function (ms) { clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, ms || 2000); };
  document.addEventListener("mouseout", function (e) {
    if (!tipFor) return;
    var to = e.relatedTarget;
    if (!to || !tipFor.contains(to)) hideTip();
  }, true);
  window.addEventListener("blur", function () { hideTip(); });
  window.addEventListener("scroll", function () { if (tipFor) hideTip(); }, true);
  document.addEventListener("touchstart", function () { lastTouch = A.now(); }, { passive: true, capture: true });
  // a click (Back, a register mark…): its tip goes 2 seconds later, even if the pointer rests there (the page under it
  // may be new, so no "pointer left" ever comes)
  document.addEventListener("click", function () { if (tip && tip.classList.contains("on")) tipBriefly(); }, true);
  document.addEventListener("mouseover", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    tip = tip || document.getElementById("tip");
    if (!tip) return;
    if (!t) { hideTip(); return; }
    if (t === tipFor) return;
    tipFor = t;
    tip.innerHTML = t.getAttribute("data-tip");
    tip.classList.add("on");
    placeTip(e);
    tipBriefly(A.now() - lastTouch < 1000 ? 2000 : 5000);
  });
  document.addEventListener("mousemove", function (e) {
    if (!tip || !tip.classList.contains("on")) return;
    if (tipFor && !document.contains(tipFor)) return hideTip(); // (the page was drawn again under the pointer)
    placeTip(e);
  });
  document.addEventListener("focusin", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    tip = tip || document.getElementById("tip");
    if (!t || !tip) return;
    var r = t.getBoundingClientRect();
    tipFor = t; tip.innerHTML = t.getAttribute("data-tip"); tip.classList.add("on");
    tip.style.left = r.left + "px"; tip.style.top = r.bottom + 8 + "px";
    tipBriefly();
  });
  document.addEventListener("focusout", function () { hideTip(); });

  /* --------------------------------------------------------- small blocks */
  UI.empty = function (icon, title, text, action) {
    return '<div class="empty"><div class="ico">' + I(icon || "inbox") + "</div><b>" + esc(title) + "</b>" + (text ? "<p>" + esc(text) + "</p>" : "") + (action ? '<div class="mt">' + action + "</div>" : "") + "</div>";
  };
  /** A number on a card; tip: a hover tip, or { note } a line under the label (always there, nothing to hover). */
  UI.stat = function (icon, value, label, accent, tip) {
    var note = tip && typeof tip === "object" ? tip.note : "";
    return '<div class="card stat"' + (tip && !note ? ' data-tip="' + esc(tip) + '"' : "") + '><div class="ico ' + (accent ? "accent" : "") + '">' + I(icon) + '</div><div><div class="val tnum">' + value + '</div><div class="lbl">' + esc(label) + "</div>" +
      (note ? '<div class="tiny muted mt-sm">' + esc(note) + "</div>" : "") + "</div></div>";
  };
  UI.tabs = function (items) {
    return '<div class="tabs-wrap"><button type="button" class="tabs-arrow back" data-tabs-scroll="-1" aria-label="Scroll the tabs back" tabindex="-1">' + I("left") + "</button>" +
      '<nav class="tabs" role="tablist">' + items.map(function (t) {
        return '<a href="' + t.href + '" class="' + (t.on ? "on" : "") + '" role="tab" aria-selected="' + !!t.on + '">' + (t.icon ? I(t.icon) : "") + esc(t.label) + (t.n != null ? ' <span class="n">' + t.n + "</span>" : "") + "</a>";
      }).join("") + "</nav>" +
      '<button type="button" class="tabs-arrow fwd" data-tabs-scroll="1" aria-label="Scroll the tabs forward" tabindex="-1">' + I("right") + "</button></div>";
  };

  /* Tab strips wider than the screen (Settings has many sections) scroll properly with a mouse: arrows at
     the ends show when there is more that way, the mouse wheel scrolls the strip sideways, and on a
     computer a thin scrollbar shows (css .tabs-wrap). Phones and tablets swipe as before. */
  function stripEnds(wrap) {
    var s = wrap.querySelector(".tabs");
    if (!s) return;
    wrap.classList.toggle("more-back", s.scrollLeft > 2);
    wrap.classList.toggle("more-fwd", s.scrollLeft + s.clientWidth < s.scrollWidth - 2);
  }
  UI.strips = function (root) { (root || document).querySelectorAll(".tabs-wrap").forEach(stripEnds); };
  document.addEventListener("scroll", function (e) {
    var w = e.target.closest && e.target.classList.contains("tabs") && e.target.closest(".tabs-wrap");
    if (w) stripEnds(w);
  }, true);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-tabs-scroll]");
    if (!b) return;
    var s = b.parentNode.querySelector(".tabs");
    s.scrollBy({ left: Number(b.getAttribute("data-tabs-scroll")) * Math.max(120, s.clientWidth * 0.7), behavior: "smooth" });
  });
  document.addEventListener("wheel", function (e) {
    var s = e.target.closest && e.target.closest(".tabs, .pill-tabs");
    if (!s || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || s.scrollWidth <= s.clientWidth + 2) return;
    var room = e.deltaY > 0 ? s.scrollWidth - s.clientWidth - s.scrollLeft : s.scrollLeft;
    if (room <= 1) return; // at the end: the page scrolls as usual
    e.preventDefault();
    s.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
  }, { passive: false });
  UI.bar = function (pct, tone, lg) {
    return '<div class="bar ' + (tone || "") + (lg ? " lg" : "") + '" role="progressbar" aria-valuenow="' + (pct || 0) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + A.clamp(pct || 0, 0, 100) + '%"></i></div>';
  };
  UI.pctCell = function (pct, tone, tipText) {
    if (pct == null) return '<span class="muted">—</span>';
    return '<div class="pct-cell"' + (tipText ? ' data-tip="' + esc(tipText) + '"' : "") + ">" + UI.bar(pct, tone) + "<b>" + pct + "%</b></div>";
  };
  UI.toneBadge = function (pct) {
    if (pct == null) return '<span class="badge">No data</span>';
    var t = A.M.tone(pct), ic = t === "good" ? "checkCircle" : t === "warn" ? "trend" : "alert";
    return '<span class="badge ' + t + '">' + I(ic) + A.M.toneLabel(pct) + "</span>";
  };
  UI.scoreBadge = function (pct) {
    if (pct == null) return '<span class="muted">—</span>';
    return '<span class="badge ' + A.M.tone(pct) + ' tnum">' + pct + "%</span>";
  };

  /* --------------------------------------------------------- student picker
     Forms → a panel per class → students, with a search box on top.
     UI.picker({ students, selected, empty }) → html;  UI.pickerValue(root) → ids */
  UI.picker = function (o) {
    var M = A.M, sel = {}, groups = {};
    (o.selected || []).forEach(function (id) { sel[id] = 1; });
    (o.students || []).forEach(function (u) {
      var L = u.level || "Other", St = u.stream || "";
      groups[L] = groups[L] || {};
      (groups[L][St] = groups[L][St] || []).push(u);
    });
    var levels = Object.keys(groups).sort(function (a, b) { return M.levelIndex(a) - M.levelIndex(b) || a.localeCompare(b); });
    var n = Object.keys(sel).length;
    var html = '<div class="picker"' + (o.id ? ' id="' + o.id + '"' : "") + ">" +
      '<div class="picker-top"><div class="picker-search">' + I("search") + '<input class="input" type="search" placeholder="Search by name or student ID" data-pk="search" aria-label="Search students" autocomplete="off"></div>' +
      '<span class="picker-count" data-pk="count">' + n + ' selected</span><button type="button" class="btn btn-sm btn-ghost" data-pk="clear">Clear</button></div>';
    if (levels.length > 1) {
      html += '<div class="picker-levels" role="tablist"><button type="button" class="on" data-pk-level="*">All forms</button>' + levels.map(function (L) {
        var c = Object.keys(groups[L]).reduce(function (t, k) { return t + groups[L][k].length; }, 0);
        return '<button type="button" data-pk-level="' + esc(L) + '">' + esc(L) + ' <span class="n">' + c + "</span></button>";
      }).join("") + "</div>";
    }
    html += '<div class="picker-panels">';
    levels.forEach(function (L) {
      Object.keys(groups[L]).sort(function (a, b) { return M.streamIndex(a) - M.streamIndex(b) || a.localeCompare(b); }).forEach(function (St) {
        var list = groups[L][St].sort(M.byName);
        html += '<div class="picker-panel" data-level="' + esc(L) + '"><div class="picker-head"><b>' + esc(M.homeClassName(L, St)) + '</b><span class="muted small">' + list.length + ' students</span><span class="grow"></span>' +
          '<label class="check small"><input type="checkbox" data-pk="all">Select all</label></div><div class="picker-list">' +
          list.map(function (u) {
            return '<label class="check" data-q="' + esc((u.name + " " + (u.studentNo || "")).toLowerCase()) + '"><input type="checkbox" value="' + u.id + '"' + (sel[u.id] ? " checked" : "") + ">" + A.avatar(u, "sm") +
              '<span class="grow">' + esc(u.name) + '</span><span class="tiny muted">' + esc(u.studentNo || "") + "</span></label>";
          }).join("") + "</div></div>";
      });
    });
    html += '</div><p class="muted small picker-none' + ((o.students || []).length ? " hidden" : "") + '">' + esc((o.students || []).length ? "No student matches your search." : o.empty || "No students to choose from.") + "</p></div>";
    return html;
  };
  UI.pickerValue = function (root) {
    var p = root.classList && root.classList.contains("picker") ? root : root.querySelector(".picker");
    return p ? Array.prototype.map.call(p.querySelectorAll(".picker-list input:checked"), function (x) { return x.value; }) : [];
  };
  function pickerFilter(p) {
    var q = (p.querySelector("[data-pk=search]").value || "").trim().toLowerCase(), level = p.getAttribute("data-level-on") || "*", any = false;
    p.querySelectorAll(".picker-panel").forEach(function (panel) {
      var levelOk = level === "*" || q || panel.getAttribute("data-level") === level, visible = 0;
      panel.querySelectorAll(".picker-list .check").forEach(function (lab) {
        var ok = levelOk && (!q || lab.getAttribute("data-q").indexOf(q) >= 0);
        lab.classList.toggle("hidden", !ok);
        if (ok) visible++;
      });
      panel.classList.toggle("hidden", !visible);
      if (visible) any = true;
    });
    var none = p.querySelector(".picker-none");
    if (none && p.querySelectorAll(".picker-list .check").length) none.classList.toggle("hidden", any);
    pickerCount(p);
  }
  function pickerCount(p) {
    p.querySelector("[data-pk=count]").textContent = p.querySelectorAll(".picker-list input:checked").length + " selected";
    p.querySelectorAll(".picker-panel").forEach(function (panel) {
      var boxes = panel.querySelectorAll(".picker-list .check:not(.hidden) input"), on = 0;
      boxes.forEach(function (b) { if (b.checked) on++; });
      var all = panel.querySelector("[data-pk=all]");
      all.checked = boxes.length > 0 && on === boxes.length;
      all.indeterminate = on > 0 && on < boxes.length;
    });
  }
  document.addEventListener("input", function (e) {
    if (e.target.matches && e.target.matches(".picker [data-pk=search]")) pickerFilter(e.target.closest(".picker"));
  });
  document.addEventListener("change", function (e) {
    var p = e.target.closest && e.target.closest(".picker");
    if (!p) return;
    if (e.target.getAttribute("data-pk") === "all") {
      e.target.closest(".picker-panel").querySelectorAll(".picker-list .check:not(.hidden) input").forEach(function (b) { b.checked = e.target.checked; });
    }
    pickerCount(p);
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-pk-level], [data-pk=clear]");
    if (!t) return;
    var p = t.closest(".picker");
    if (t.getAttribute("data-pk") === "clear") { p.querySelectorAll(".picker-list input").forEach(function (b) { b.checked = false; }); pickerCount(p); return; }
    p.setAttribute("data-level-on", t.getAttribute("data-pk-level"));
    p.querySelectorAll("[data-pk-level]").forEach(function (b) { b.classList.toggle("on", b === t); });
    pickerFilter(p);
  });

  /* -------------------------------------------- drop-down with an "Other" entry
     Always lists every option (unlike a type-ahead list), plus a free-text fallback. */
  UI.selectOther = function (name, options, value, label) {
    var list = options.slice(), inList = !value || list.indexOf(value) >= 0;
    return '<div class="select-other"><select class="select" data-so="' + name + '" aria-label="' + esc(label || name) + '">' +
      (value ? "" : '<option value="">Choose…</option>') +
      list.map(function (o) { return "<option" + (o === value ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
      '<option value="__other"' + (inList ? "" : " selected") + ">Other (type it)…</option></select>" +
      '<input class="input mt-sm' + (inList ? " hidden" : "") + '" name="' + name + '" value="' + esc(value || "") + '" placeholder="Type it here" aria-label="' + esc(label || name) + '"></div>';
  };
  document.addEventListener("change", function (e) {
    if (!e.target.matches || !e.target.matches("select[data-so]")) return;
    var inp = e.target.parentNode.querySelector("input");
    if (e.target.value === "__other") { inp.classList.remove("hidden"); inp.value = ""; inp.focus(); }
    else { inp.classList.add("hidden"); inp.value = e.target.value; }
  });

  /* ----------------------------------------------------------------- charts */
  /** Progress ring (a meter, not a pie): one value against 100%. */
  UI.ring = function (pct, o) {
    o = o || {};
    var size = o.size || 104, sw = o.stroke || 10, r = (size - sw) / 2, c = 2 * Math.PI * r, v = A.clamp(pct || 0, 0, 100);
    var color = o.tone ? "var(--" + o.tone + ")" : "var(--brand-text)";
    return '<div class="ring-wrap" style="width:' + size + "px;height:" + size + 'px" role="img" aria-label="' + esc((o.label || "") + " " + v + "%") + '">' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="' + sw + '"/>' +
      (v > 0 ? '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + (c * v) / 100 + " " + c + '" transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')"/>' : "") +
      '</svg><div class="ring-label"><div><b class="tnum" style="font-size:' + Math.round(size / 5) + 'px">' + v + "%</b>" + (o.sub ? "<span>" + esc(o.sub) + "</span>" : "") + "</div></div></div>";
  };

  /** Horizontal bars: items [{label, pct, tone, tip, href}] on a shared 0–100 scale. */
  UI.hbars = function (items, opts) {
    opts = opts || {};
    if (!items.length) return UI.empty("chart", opts.emptyTitle || "No results yet", opts.emptyText || "");
    return '<div class="hbars">' + items.map(function (it) {
      var name = it.href ? '<a href="' + it.href + '">' + esc(it.label) + "</a>" : esc(it.label);
      return '<div class="hbar" data-tip="' + esc(it.tip || it.label + ": " + it.pct + "%") + '"><div class="name">' + name + '</div><div class="track"><i class="' + (it.tone || "") + '" style="width:' + Math.max(1.5, A.clamp(it.pct, 0, 100)) + '%"></i></div><div class="v">' + it.pct + "%</div></div>";
    }).join("") + "</div>";
  };
  UI.toneLegend = function () {
    var E = A.M.EXAM;
    return '<div class="legend"><span><i style="background:var(--good)"></i>Strong (' + E.strongTopicMark + "%+)</span><span><i style=\"background:var(--warn)\"></i>Developing (" + E.passMark + "–" + (E.strongTopicMark - 1) + "%)</span><span><i style=\"background:var(--bad)\"></i>Needs work (below " + E.passMark + "%)</span></div>";
  };

  /** Line chart placeholder, drawn at real width by UI.hydrate(). points: [{label, value, tip}] */
  UI.lineChart = function (points, o) {
    o = o || {};
    if (!points.length) return UI.empty("trend", o.emptyTitle || "No scores yet", o.emptyText || "");
    return '<div class="js-line" data-points="' + esc(JSON.stringify(points)) + '" data-ref="' + (o.ref != null ? o.ref : "") + '" data-height="' + (o.height || 210) + '"></div>';
  };
  function drawLine(el) {
    var pts = JSON.parse(el.getAttribute("data-points")), ref = el.getAttribute("data-ref"), H = Number(el.getAttribute("data-height")) || 210;
    var W = Math.max(260, el.clientWidth), pl = 38, pr = 14, pt = 12, pb = 28, iw = W - pl - pr, ih = H - pt - pb;
    var x = function (i) { return pl + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1)); };
    var y = function (v) { return pt + ih - (A.clamp(v, 0, 100) / 100) * ih; };
    var s = '<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Scores over time">';
    [0, 25, 50, 75, 100].forEach(function (g) {
      s += '<line class="gridline" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '"/><text class="axis-label" x="' + (pl - 8) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + "%</text>";
    });
    if (ref !== "" && ref != null) {
      s += '<line class="ref" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(Number(ref)) + '" y2="' + y(Number(ref)) + '"/><text class="axis-label" x="' + (W - pr) + '" y="' + (y(Number(ref)) - 5) + '" text-anchor="end">pass ' + ref + "%</text>";
    }
    var path = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1); }).join(" ");
    if (pts.length > 1) s += '<path class="area" d="' + path + " L" + x(pts.length - 1) + " " + y(0) + " L" + x(0) + " " + y(0) + ' Z"/><path class="line" d="' + path + '"/>';
    var every = Math.ceil(pts.length / Math.max(2, Math.floor(iw / 70)));
    pts.forEach(function (p, i) {
      if (i % every === 0 || i === pts.length - 1) s += '<text class="axis-label" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.label) + "</text>";
    });
    var colW = pts.length > 1 ? iw / (pts.length - 1) : iw;
    pts.forEach(function (p, i) {
      s += '<circle class="pt" cx="' + x(i) + '" cy="' + y(p.value) + '" r="4.5"/>';
      s += '<rect class="hit" x="' + (x(i) - colW / 2) + '" y="' + pt + '" width="' + colW + '" height="' + ih + '" data-tip="' + esc(p.tip || p.label + ": " + p.value + "%") + '"/>';
    });
    el.innerHTML = s + "</svg>";
  }
  /* ------------------------------------------------------------------ wide tables on touch screens
     One way per swipe: up and down moves the page (the table doesn't drift sideways under the finger), left and
     right slides the table (the page doesn't drift up and down). On touch screens the CSS lets the browser do only
     the up and down (touch-action: pan-y); the sideways slide is done here, with a short glide after a flick. */
  var COARSE = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
  UI.swipeLock = function (w) {
    if (w._swipe || !COARSE || !COARSE.matches) return;
    w._swipe = true;
    var g = null, glide = 0;
    w.addEventListener("touchstart", function (e) {
      cancelAnimationFrame(glide);
      var t = e.touches[0];
      g = e.touches.length === 1 && w.scrollWidth > w.clientWidth + 1 ? { x: t.clientX, y: t.clientY, left: w.scrollLeft, axis: "", lx: t.clientX, lt: e.timeStamp, v: 0 } : null;
    }, { passive: true });
    w.addEventListener("touchmove", function (e) {
      if (!g || e.touches.length !== 1) return;
      var t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
      // a slanting start the browser has already taken as up or down (the move can't be held back): the page carries
      // on and the table stays put, so the two never move at once (2026-10-26)
      if (!g.axis) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; g.axis = Math.abs(dx) > Math.abs(dy) && e.cancelable ? "x" : "y"; }
      if (g.axis !== "x") return;
      if (e.cancelable) e.preventDefault();
      w.scrollLeft = g.left - dx;
      var dt = e.timeStamp - g.lt;
      if (dt > 0) { g.v = 0.8 * ((g.lx - t.clientX) / dt) + 0.2 * g.v; g.lx = t.clientX; g.lt = e.timeStamp; }
    }, { passive: false });
    var end = function () {
      if (!g || g.axis !== "x") { g = null; return; }
      var v = Math.max(-4, Math.min(4, g.v)), last = performance.now();
      g = null;
      var step = function (now) {
        var dt = Math.min(32, now - last); last = now;
        w.scrollLeft += v * dt;
        v *= Math.pow(0.94, dt / 16);
        if (Math.abs(v) > 0.02) glide = requestAnimationFrame(step);
      };
      if (Math.abs(v) > 0.1) glide = requestAnimationFrame(step);
    };
    w.addEventListener("touchend", end);
    w.addEventListener("touchcancel", end);
  };
  /* A table or strip put on the page later (a list a page fills in when the hub answers, a pop-up's table) slides
     sideways too: the CSS lets touch screens move it only up and down, so without this it didn't move sideways at all. */
  if (COARSE && COARSE.matches && window.MutationObserver) {
    var lockQueued = false;
    new MutationObserver(function () {
      if (lockQueued) return;
      lockQueued = true;
      setTimeout(function () { lockQueued = false; document.querySelectorAll(".table-wrap, .tabs, .pill-tabs, .rc-preview").forEach(UI.swipeLock); }, 60);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------ words that fit their box
     A box marked [data-fit] keeps its size and its words get smaller until they fit (the timetable's lessons, 2026-10-26):
     from its largest size (data-fit, in px; else a quarter of the box's height, 9 to 15 px) down to 6 px, where a long word
     may break. Each time the page is drawn and the window changes size (UI.hydrate), and on a printed page (UI.printSheet). */
  UI.fitText = function (root) {
    (root || document).querySelectorAll("[data-fit]").forEach(function (el) {
      var h = el.clientHeight, w = el.clientWidth;
      if (!h || !w) return; // not on the screen (a phone shows the list instead of the grid)
      var max = Number(el.getAttribute("data-fit")) || Math.max(9, Math.min(15, h / 4)), min = 6;
      var fits = function (px) { el.style.fontSize = px + "px"; return el.scrollHeight <= h + 1 && el.scrollWidth <= w + 1; };
      el.classList.remove("fit-min");
      if (fits(max)) return;
      if (!fits(min)) { el.classList.add("fit-min"); return; }
      var lo = min, hi = max;
      while (hi - lo > 0.25) { var mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      fits(Math.floor(lo * 4) / 4);
    });
    // a group written alike (a timetable's lessons, 2026-11-15): every box takes the size the tightest one needs, so
    // one subject isn't big and the next small
    var groups = Array.prototype.slice.call((root || document).querySelectorAll("[data-fit-same]"));
    if (root && root.matches && root.matches("[data-fit-same]")) groups.push(root);
    groups.forEach(function (g) {
      var els = Array.prototype.filter.call(g.querySelectorAll(g.getAttribute("data-fit-same")), function (el) { return el.clientHeight && el.style.fontSize; });
      if (els.length < 2) return;
      var px = Math.min.apply(null, els.map(function (el) { return parseFloat(el.style.fontSize) || 99; }));
      els.forEach(function (el) { el.style.fontSize = px + "px"; });
    });
  };

  /* Typing boxes (2026-11-10): no suggestions from what was typed on this browser before (on a school's shared computer
     those are someone else's, and mean nothing here), and dates written dd/mm/yyyy whatever language the browser is in
     (a date box shows the browser's own order: mm/dd/yyyy on an American one). The date box stays in its form, hidden,
     holding yyyy-mm-dd as before; a text box beside it shows the date and takes it typed as dd/mm/yyyy, and its button
     opens the browser's calendar. Every box added to the page later is done the same way. */
  var TYPED = 'input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="tel"],input[type="number"],input[type="url"],textarea';
  var both = function (root, sel) { var out = root.matches && root.matches(sel) ? [root] : []; return out.concat(Array.prototype.slice.call(root.querySelectorAll(sel))); };
  UI.tidyInputs = function (root) {
    if (!root || !root.querySelectorAll) return;
    both(root, TYPED).forEach(function (el) {
      if (!el.hasAttribute("autocomplete")) el.setAttribute("autocomplete", "off");
      // (characters that show nothing or turn text around go as the box is left: util.js A.plain)
      if (!el.getAttribute("data-plain")) { el.setAttribute("data-plain", "1"); el.addEventListener("change", function () { var v = A.plain(el.value); if (v !== el.value) el.value = v; }, true); }
    });
    both(root, 'input[type="date"]').forEach(dmy);
  };
  UI.isoToDmy = function (v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; };
  /** "10/11/2026" (or 10-11-2026, 10.11.2026, 10112026) as "2026-11-10"; null when it isn't a real date. */
  UI.dmyToIso = function (t) {
    var s = String(t || "").trim(), m = /^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})$/.exec(s) || /^(\d{2})(\d{2})(\d{4})$/.exec(s);
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? y + "-" + A.pad(mo) + "-" + A.pad(d) : null;
  };
  function dmy(el) {
    if (el.getAttribute("data-dmy") || !el.parentNode) return;
    el.setAttribute("data-dmy", "1");
    var wrap = document.createElement("span"), txt = document.createElement("input"), btn = document.createElement("button");
    wrap.className = "dmy" + (/\bsm\b/.test(el.className) ? " sm" : "");
    if (el.style.width) wrap.style.width = el.style.width;
    txt.type = "text"; txt.className = el.className; txt.placeholder = "dd/mm/yyyy"; txt.maxLength = 10; txt.value = UI.isoToDmy(el.value);
    txt.setAttribute("inputmode", "numeric"); txt.setAttribute("autocomplete", "off"); txt.setAttribute("spellcheck", "false");
    if (el.getAttribute("aria-label")) txt.setAttribute("aria-label", el.getAttribute("aria-label"));
    txt.disabled = el.disabled; txt.readOnly = el.readOnly;
    btn.type = "button"; btn.className = "dmy-pick"; btn.tabIndex = -1; btn.setAttribute("aria-label", "Pick a date from the calendar"); btn.innerHTML = I("calendar");
    el.parentNode.insertBefore(wrap, el); wrap.appendChild(txt); wrap.appendChild(btn); wrap.appendChild(el);
    el.tabIndex = -1; el.setAttribute("aria-hidden", "true"); el.setAttribute("autocomplete", "off");
    var tell = function () { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    txt.addEventListener("input", function (e) {
      // the slashes go in as the day and the month are typed
      if (e.inputType && e.inputType.indexOf("insert") === 0 && /^(\d{2}|\d{1,2}\/\d{2})$/.test(txt.value)) txt.value += "/";
      var iso = UI.dmyToIso(txt.value);
      if (iso && iso !== el.value) { el.value = iso; tell(); }
      else if (!txt.value.trim() && el.value) { el.value = ""; tell(); }
      txt.classList.toggle("bad", txt.value.length >= 8 && !iso);
    });
    txt.addEventListener("blur", function () { if (txt.value.trim() && !UI.dmyToIso(txt.value)) { txt.value = UI.isoToDmy(el.value); txt.classList.remove("bad"); } });
    el.addEventListener("change", function () { if (UI.dmyToIso(txt.value) !== el.value) txt.value = UI.isoToDmy(el.value); }); // (picked on the calendar)
    btn.addEventListener("click", function () { if (txt.disabled || txt.readOnly) return; try { el.showPicker(); } catch (x) { txt.focus(); } });
  }
  if (window.MutationObserver) new MutationObserver(function (muts) {
    muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) UI.tidyInputs(n); }); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  UI.hydrate = function (root) {
    (root || document).querySelectorAll(".js-line").forEach(drawLine);
    UI.strips(root);
    UI.fitText(root);
  };
  window.addEventListener("resize", A.debounce(function () { UI.hydrate(); }, 150));
  // the app's own font arriving after the first drawing changes how much fits
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { UI.fitText(); });

  /* One scroll, the page's and its boxes' (2026-11-15). A long table or list scrolls in its own box (A.boxLists); the
     mouse wheel or touchpad over it used to stop dead at the box's last row, with more page below. Now:
     - a box partly out of sight: the page moves first, until the box is all on the screen (or its top reaches the top);
     - then the box scrolls, as the browser does it;
     - at the box's end, the page carries on in the same movement (a box inside another: that one first).
     The page glides (eased), so a wheel's steps don't jump. Pop-ups, the sidebar and anything outside the page's own
     content keep the browser's way. */
  (function () {
    var page = function () { return document.scrollingElement || document.documentElement; };
    var scrollerOf = function (el, stop) {
      for (; el && el !== stop && el.nodeType === 1; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 1) { var oy = getComputedStyle(el).overflowY; if (oy === "auto" || oy === "scroll") return el; }
      }
      return null;
    };
    var room = function (el, dy) { return dy > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop > 0.5 : el.scrollTop > 0.5; };
    // the eased glide: each element keeps where it is heading, so quick wheel steps add up instead of restarting
    var glide = function (el, dy, now) {
      var max = el.scrollHeight - el.clientHeight, g = el._glide || (el._glide = { to: null, raf: 0 });
      if (g.to == null) g.to = el.scrollTop;
      g.to = Math.max(0, Math.min(max, g.to + dy));
      if (now) { el.scrollTop = g.to; g.to = null; return; }
      if (g.raf) return;
      var step = function () {
        var d = g.to - el.scrollTop;
        if (g.to == null || Math.abs(d) < 0.75) { if (g.to != null) el.scrollTop = g.to; g.to = null; g.raf = 0; return; }
        var was = el.scrollTop;
        el.scrollTop = was + (Math.abs(d) < 2 ? d : d * 0.24);
        if (el.scrollTop === was) { g.to = null; g.raf = 0; return; } // it can't move (its end, or the page changed)
        g.raf = requestAnimationFrame(step);
      };
      g.raf = requestAnimationFrame(step);
    };
    var stopGlide = function () { var el = page(); if (el._glide) { el._glide.to = null; } };
    ["mousedown", "touchstart", "keydown"].forEach(function (t) { window.addEventListener(t, stopGlide, { passive: true }); });
    window.addEventListener("hashchange", stopGlide);
    window.addEventListener("wheel", function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.shiftKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (document.documentElement.classList.contains("modal-open")) return; // a pop-up: only it scrolls
      var content = e.target && e.target.closest && e.target.closest("#view");
      if (!content) return;
      var box = scrollerOf(e.target, content.parentElement);
      if (!box || box === page()) { stopGlide(); return; } // the page itself: the browser's own scrolling
      var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight * 0.9 : 1), pg = page();
      var small = e.deltaMode === 0 && Math.abs(dy) < 40; // a touchpad's own fine steps need no easing
      // 1. the box partly out of sight: bring it in first
      var bar = document.querySelector(".topbar"), top = bar && getComputedStyle(bar).position === "sticky" ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      // (where the box will be once the page's glide so far is done)
      var r = box.getBoundingClientRect(), bottom = window.innerHeight, pend = pg._glide && pg._glide.to != null ? pg._glide.to - pg.scrollTop : 0;
      var rt = r.top - pend, rb = r.bottom - pend;
      var take = dy > 0 ? Math.min(dy, rb - bottom, rt - top) : Math.max(dy, rt - top, rb - bottom);
      if ((dy > 0 ? take > 1 : take < -1) && room(pg, dy)) { e.preventDefault(); glide(pg, take, small); return; }
      // 2. the box, or a box around it, can still move that way: the browser scrolls the box itself as usual
      for (var b = box; b && b !== pg; b = scrollerOf(b.parentElement, content.parentElement)) {
        if (room(b, dy)) { if (b === box) return; e.preventDefault(); glide(b, dy, small); return; }
      }
      // 3. every box at its end: on to the page, in the same movement
      if (room(pg, dy)) { e.preventDefault(); glide(pg, dy, small); }
    }, { passive: false });
  })();
})(window.App);
