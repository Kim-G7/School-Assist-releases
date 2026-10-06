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

  /* ------------------------------------------------------------------ modal
     UI.modal({ title, sub, body, size, foot: [{label, cls, onClick(el) → false keeps it open}], onMount(el), onClose }) */
  UI.modal = function (o) {
    var root = document.getElementById("modal-root");
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
    var modalEl = back.querySelector(".modal");
    var close = function () {
      back.remove();
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
  document.addEventListener("mouseover", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    tip = tip || document.getElementById("tip");
    if (!tip) return;
    if (!t) { tip.classList.remove("on"); return; }
    tip.innerHTML = t.getAttribute("data-tip");
    tip.classList.add("on");
    placeTip(e);
  });
  document.addEventListener("mousemove", function (e) { if (tip && tip.classList.contains("on")) placeTip(e); });
  document.addEventListener("focusin", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    tip = tip || document.getElementById("tip");
    if (!t || !tip) return;
    var r = t.getBoundingClientRect();
    tip.innerHTML = t.getAttribute("data-tip"); tip.classList.add("on");
    tip.style.left = r.left + "px"; tip.style.top = r.bottom + 8 + "px";
  });
  document.addEventListener("focusout", function () { if (tip) tip.classList.remove("on"); });

  /* --------------------------------------------------------- small blocks */
  UI.empty = function (icon, title, text, action) {
    return '<div class="empty"><div class="ico">' + I(icon || "inbox") + "</div><b>" + esc(title) + "</b>" + (text ? "<p>" + esc(text) + "</p>" : "") + (action ? '<div class="mt">' + action + "</div>" : "") + "</div>";
  };
  UI.stat = function (icon, value, label, accent, tip) {
    return '<div class="card stat"' + (tip ? ' data-tip="' + esc(tip) + '"' : "") + '><div class="ico ' + (accent ? "accent" : "") + '">' + I(icon) + '</div><div><div class="val tnum">' + value + '</div><div class="lbl">' + esc(label) + "</div></div></div>";
  };
  UI.tabs = function (items) {
    return '<nav class="tabs" role="tablist">' + items.map(function (t) {
      return '<a href="' + t.href + '" class="' + (t.on ? "on" : "") + '" role="tab" aria-selected="' + !!t.on + '">' + (t.icon ? I(t.icon) : "") + esc(t.label) + (t.n != null ? ' <span class="n">' + t.n + "</span>" : "") + "</a>";
    }).join("") + "</nav>";
  };
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
  UI.hydrate = function (root) {
    (root || document).querySelectorAll(".js-line").forEach(drawLine);
  };
  window.addEventListener("resize", A.debounce(function () { UI.hydrate(); }, 150));
})(window.App);
