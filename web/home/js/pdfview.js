/* PDF reader that shows every page on every device, using pdf.js (bundled in vendor/pdfjs).
 * Safari on iPad and iPhone shows only the first page of a PDF placed in a frame, and Android
 * can't show PDFs inside an app at all, so the app draws the pages itself. Only the pages near
 * the screen are drawn, which keeps memory low on tablets.
 * Also reads a question paper's front page: time allowed, total marks, calculator rule and
 * what the candidate will need, so the exam room can use the paper's own timings and rules. */
(function (A) {
  "use strict";
  var I = A.icon, esc = A.esc;
  var loading = null;

  function script(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  /** Load pdf.js the first time a PDF is opened. */
  function lib() {
    if (loading) return loading;
    loading = script("vendor/pdfjs/pdf.min.js").then(function () {
      var L = window.pdfjsLib;
      L.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
      if (/^https?:$/.test(location.protocol)) return L;
      // desktop app (file://): a worker can't start from a file, so pdf.js runs its worker code on the page
      return script("vendor/pdfjs/pdf.worker.min.js").then(function () { return L; });
    });
    loading.catch(function () { loading = null; });
    return loading;
  }
  function openDoc(blob) {
    return lib().then(function (L) {
      return blob.arrayBuffer().then(function (buf) { return L.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; });
    });
  }

  var View = (A.PdfView = {
    /** The pdf.js document for a PDF blob (js/paperscan.js reads papers with it). */
    doc: openDoc,
    /** Show `blob` inside `el` (the viewer fills it). Returns { destroy }.
     *  opts.pages: only these page numbers (the tutor shows a topic's pages of a book). */
    open: function (el, blob, opts) {
      opts = opts || {};
      el.innerHTML = '<div class="pdf-wrap"><div class="pdf-bar"><span class="pdf-count small">Opening…</span><span class="grow"></span>' +
        '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-z="-1" aria-label="Zoom out" data-tip="Zoom out">' + I("minus") + "</button>" +
        '<button type="button" class="btn btn-ghost btn-sm" data-z="0" data-tip="Fit to width">Fit</button>' +
        '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-z="1" aria-label="Zoom in" data-tip="Zoom in">' + I("plus") + "</button></div>" +
        '<div class="pdf-scroll"><div class="pdf-pages"><div class="pdf-msg">' + I("refresh") + " Opening the paper…</div></div></div></div>";
      var scroll = el.querySelector(".pdf-scroll"), pages = el.querySelector(".pdf-pages"), count = el.querySelector(".pdf-count");
      var doc = null, slots = [], ratio = 1.414, zoom = 1, observer = null, dead = false;

      function width() { return Math.max(240, scroll.clientWidth - 24) * zoom; }
      function size() { slots.forEach(function (s) { s.style.width = width() + "px"; s.style.height = width() * (Number(s.dataset.ratio) || ratio) + "px"; }); }
      function clear(slot) {
        var c = slot.querySelector("canvas");
        if (c) { c.width = 0; c.height = 0; c.remove(); } // frees the memory straight away (iPad Safari)
        slot.dataset.drawn = "";
      }
      function draw(slot) {
        var want = String(zoom) + "@" + Math.round(width());
        if (dead || slot.dataset.drawn === want || !doc) return;
        slot.dataset.drawn = want;
        doc.getPage(Number(slot.dataset.n)).then(function (page) {
          if (dead || slot.dataset.drawn !== want) return;
          var base = page.getViewport({ scale: 1 }), cssW = width(), dpr = Math.min(window.devicePixelRatio || 1, 2);
          var vp = page.getViewport({ scale: (cssW / base.width) * dpr });
          slot.dataset.ratio = base.height / base.width;
          var c = document.createElement("canvas");
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          c.style.width = cssW + "px"; c.style.height = cssW * base.height / base.width + "px";
          slot.style.height = c.style.height;
          return page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise.then(function () {
            if (dead || slot.dataset.drawn !== want) { c.width = 0; return; }
            var old = slot.querySelector("canvas"); if (old) { old.width = 0; old.remove(); }
            slot.appendChild(c);
          });
        }).catch(function () { slot.dataset.drawn = ""; });
      }
      function near(slot) {
        var a = scroll.getBoundingClientRect(), b = slot.getBoundingClientRect();
        return b.bottom > a.top - 900 && b.top < a.bottom + 900;
      }
      function refresh() { if (!dead) slots.forEach(function (s) { if (near(s)) draw(s); else if (s.dataset.drawn) clear(s); }); }
      function pageNow() {
        var top = scroll.scrollTop + scroll.clientHeight / 3, n = slots.length ? Number(slots[0].dataset.n) : 1;
        slots.forEach(function (s) { if (s.offsetTop <= top) n = Number(s.dataset.n); });
        var k = 1; slots.forEach(function (s, i) { if (Number(s.dataset.n) === n) k = i + 1; });
        count.textContent = opts.pages ? "Page " + n + " · " + k + " of " + slots.length : "Page " + n + " of " + slots.length;
      }

      openDoc(blob).then(function (d) {
        if (dead) { d.destroy(); return; }
        doc = d;
        var list = [];
        for (var i = 1; i <= d.numPages; i++) if (!opts.pages || opts.pages.indexOf(i) >= 0) list.push(i);
        if (!list.length) list = [1];
        return d.getPage(list[0]).then(function (p1) {
          var v = p1.getViewport({ scale: 1 });
          ratio = v.height / v.width;
          pages.innerHTML = "";
          list.forEach(function (n) {
            var s = document.createElement("div");
            s.className = "pdf-page"; s.dataset.n = n;
            pages.appendChild(s); slots.push(s);
          });
          size(); pageNow();
          observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) { if (en.isIntersecting) draw(en.target); else if (en.target.dataset.drawn && !near(en.target)) clear(en.target); });
          }, { root: scroll, rootMargin: "900px 0px" });
          slots.forEach(function (s) { observer.observe(s); });
        });
      }).catch(function (e) {
        pages.innerHTML = '<div class="pdf-msg">' + I("alert") + " This PDF can't be shown here (" + esc(e.message || e) + ").</div>";
      });

      var onScroll = A.debounce(function () { pageNow(); refresh(); }, 80);
      scroll.addEventListener("scroll", onScroll);
      el.querySelector(".pdf-bar").addEventListener("click", function (e) {
        var b = e.target.closest("[data-z]"); if (!b || !doc) return;
        var z = Number(b.getAttribute("data-z")), mid = (scroll.scrollTop + scroll.clientHeight / 2) / Math.max(1, scroll.scrollHeight);
        zoom = z === 0 ? 1 : Math.max(0.5, Math.min(3, zoom + z * 0.25));
        size();
        scroll.scrollTop = mid * scroll.scrollHeight - scroll.clientHeight / 2;
        refresh(); pageNow();
      });
      var onResize = A.debounce(function () { size(); refresh(); }, 200);
      window.addEventListener("resize", onResize);
      return {
        destroy: function () {
          dead = true;
          if (observer) observer.disconnect();
          window.removeEventListener("resize", onResize);
          scroll.removeEventListener("scroll", onScroll);
          slots.forEach(clear);
          if (doc) doc.destroy();
        },
      };
    },

    /** One question's slice of a page: clip = [page, top, bottom] in PDF points (from js/paperscan.js).
     *  Draws it `cssWidth` wide without the page margins, and trims the blank space under it.
     *  Resolves to a canvas (its style size is set). */
    clip: function (doc, c, cssWidth) {
      return doc.getPage(c[0]).then(function (page) {
        var base = page.getViewport({ scale: 1 }), x0 = 40, x1 = base.width - 40;
        var dpr = Math.min(window.devicePixelRatio || 1, 2), s = (cssWidth / (x1 - x0)) * dpr;
        var top = Math.max(0, c[1]), bottom = Math.min(base.height, c[2] || base.height);
        var cv = document.createElement("canvas");
        cv.width = Math.round((x1 - x0) * s); cv.height = Math.max(1, Math.round((bottom - top) * s));
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
        var vp = page.getViewport({ scale: s, offsetX: -x0 * s, offsetY: -top * s });
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          // trim trailing blank rows (answer space left under the last line)
          var h = cv.height, w = cv.width, keep = h;
          try {
            var data = ctx.getImageData(0, 0, w, h).data, step = Math.max(1, Math.round(w / 300));
            for (var y = h - 1; y > 0; y--) {
              var ink = false;
              for (var x = 0; x < w; x += step) { var k = (y * w + x) * 4; if (data[k] < 200 || data[k + 1] < 200 || data[k + 2] < 200) { ink = true; break; } }
              if (ink) { keep = Math.min(h, y + Math.round(10 * dpr)); break; }
            }
          } catch (e) { /* tainted canvas: keep it all */ }
          if (keep < h - 4) {
            var out = document.createElement("canvas");
            out.width = w; out.height = keep;
            out.getContext("2d").drawImage(cv, 0, 0);
            cv.width = 0; cv.height = 0;
            cv = out;
          }
          cv.style.width = cssWidth + "px";
          cv.style.height = cv.height / dpr + "px";
          cv.dataset.scale = s / dpr; // CSS pixels per PDF point, to find a part's position
          cv.dataset.top = top;
          return cv;
        });
      });
    },

    /** The front page of a question paper: { durationMin, totalMarks, calculator: "yes"|"no", needs, answerRule }. */
    readCover: function (blob) {
      return openDoc(blob).then(function (doc) {
        return doc.getPage(1).then(function (p) { return p.getTextContent(); }).then(function (tc) {
          doc.destroy();
          return View.parseCover(tc.items.map(function (it) { return it.str + (it.hasEOL ? "\n" : " "); }).join(""));
        });
      });
    },
    parseCover: function (text) {
      var t = String(text || "").replace(/\s+/g, " "), out = {};
      var d = /\b(\d)\s*hours?(?:\s*(?:and\s*)?(\d{1,2})\s*min(?:ute)?s?)?\b|\b(\d{2,3})\s*min(?:ute)?s\b/i.exec(t);
      if (d) out.durationMin = d[3] ? Number(d[3]) : Number(d[1]) * 60 + Number(d[2] || 0);
      var m = /total marks? for this (?:paper|question paper) (?:is|are) (\d{1,3})/i.exec(t) || /\[\s*total\s*:?\s*(\d{1,3})\s*\]/i.exec(t);
      if (m) out.totalMarks = Number(m[1]);
      if (/calculators? (?:must|may|should) not be used|(?:must|may) not use a calculator|non[- ]calculator|without (?:the use of )?a calculator/i.test(t)) out.calculator = "no";
      else if (/use a calculator|calculators? (?:may|should|must) be used|calculator where appropriate|electronic calculator/i.test(t)) out.calculator = "yes";
      var n = /You will need:\s*(.+?)(?=\s*(?:INSTRUCTIONS|You must|You may|Answer (?:all|any|one|two|three|four|five|both|each|questions?)\b|●|•|●|$))/.exec(t); // case-sensitive: the front page prints "INSTRUCTIONS" in capitals
      if (n && n[1].trim().length > 2 && n[1].trim().length < 160) out.needs = n[1].trim().replace(/[.;,]$/, "");
      if (!out.calculator && out.needs && /calculator/i.test(out.needs)) out.calculator = "yes"; // "You will need: ... Calculator"
      var r = /(Answer (?:all|any|one|two|three|four|five|both|each|questions?)\b[^●•●]{0,140}?\.)/i.exec(t);
      if (r) out.answerRule = r[1].trim();
      return out;
    },
  });
})(window.App);
