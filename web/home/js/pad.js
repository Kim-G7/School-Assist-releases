/* A working pad: space to write working with a finger, stylus or mouse (maths and calculations).
 * A.Pad.create(host, strokes, onChange) → { destroy }. Strokes are kept as plain numbers so the
 * exam room can remember each question's working on this device while the paper is being sat. */
(function (A) {
  "use strict";
  var I = A.icon;

  A.Pad = {
    create: function (host, strokes, onChange) {
      strokes = Array.isArray(strokes) ? strokes : [];
      host.innerHTML = '<div class="pad"><div class="pad-bar"><span class="small muted grow">Working (not marked)</span>' +
        '<button type="button" class="btn btn-sm on" data-tool="p">' + I("pen") + "Pen</button>" +
        '<button type="button" class="btn btn-sm" data-tool="e">' + I("x") + "Eraser</button>" +
        '<button type="button" class="btn btn-sm btn-ghost" data-tool="undo" aria-label="Undo">' + I("back") + "</button>" +
        '<button type="button" class="btn btn-sm btn-ghost" data-tool="clear">Clear</button></div>' +
        '<canvas class="pad-canvas"></canvas><button type="button" class="btn btn-ghost btn-sm btn-block" data-tool="more">' + I("plus") + "More space</button></div>";
      var cv = host.querySelector("canvas"), ctx = cv.getContext("2d"), tool = "p", cur = null, height = 320;
      strokes.forEach(function (s) { height = Math.max(height, s.h || 0); });
      function size() {
        var w = cv.parentNode.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.style.width = w + "px"; cv.style.height = height + "px";
        cv.width = Math.round(w * dpr); cv.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
      }
      function ink() { return getComputedStyle(host).getPropertyValue("--text").trim() || "#111"; }
      function line(s) {
        var p = s.p, w = cv.clientWidth / (s.w || cv.clientWidth);
        if (p.length < 2) return;
        ctx.globalCompositeOperation = s.t === "e" ? "destination-out" : "source-over";
        ctx.lineWidth = s.t === "e" ? 18 : 2.2;
        ctx.lineCap = ctx.lineJoin = "round";
        ctx.strokeStyle = ink();
        ctx.beginPath();
        ctx.moveTo(p[0] * w, p[1] * w);
        for (var i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * w, p[i + 1] * w);
        if (p.length === 2) ctx.lineTo(p[0] * w + 0.1, p[1] * w);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      function draw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(line); if (cur) line(cur); }
      function pos(e) { var r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10]; }
      function down(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        cur = { t: tool, w: cv.clientWidth, h: height, p: pos(e) };
        draw();
      }
      function move(e) { if (!cur) return; e.preventDefault(); var q = pos(e); cur.p.push(q[0], q[1]); line({ t: cur.t, w: cur.w, p: cur.p.slice(-4) }); }
      function up() { if (!cur) return; strokes.push(cur); cur = null; draw(); if (onChange) onChange(strokes); }
      cv.addEventListener("pointerdown", down);
      cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", up);
      host.querySelector(".pad").addEventListener("click", function (e) {
        var b = e.target.closest("[data-tool]"); if (!b) return;
        var t = b.getAttribute("data-tool");
        if (t === "p" || t === "e") {
          tool = t;
          host.querySelectorAll("[data-tool=p],[data-tool=e]").forEach(function (x) { x.classList.toggle("on", x === b); });
        } else if (t === "undo") { strokes.pop(); draw(); if (onChange) onChange(strokes); }
        else if (t === "clear") { if (strokes.length && confirmClear()) { strokes.length = 0; draw(); if (onChange) onChange(strokes); } }
        else if (t === "more") { height += 280; size(); }
      });
      function confirmClear() { return true; }
      var onResize = A.debounce(size, 150);
      window.addEventListener("resize", onResize);
      requestAnimationFrame(size);
      return { destroy: function () { window.removeEventListener("resize", onResize); cv.width = 0; cv.height = 0; } };
    },
  };
})(window.App);
