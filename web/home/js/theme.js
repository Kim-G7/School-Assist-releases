/* Branding engine: turns two school colours + a logo into the whole theme.
   Sources, later wins: school.config.js → Settings → Branding (synced record). */
(function (A) {
  "use strict";

  var CFG = window.SCHOOL_CONFIG || {};
  var THEME_KEY = "sca-theme";

  /* ------------------------------------------------------------ colour math */
  function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return { r: 29, g: 78, b: 137 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(c) {
    return "#" + [c.r, c.g, c.b].map(function (v) { var s = Math.round(A.clamp(v, 0, 255)).toString(16); return s.length < 2 ? "0" + s : s; }).join("");
  }
  function mix(a, b, w) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex({ r: x.r + (y.r - x.r) * w, g: x.g + (y.g - x.g) * w, b: x.b + (y.b - x.b) * w });
  }
  function lum(hex) {
    var c = hexToRgb(hex);
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function readableOn(bg) { return contrast(bg, "#ffffff") >= contrast(bg, "#0f172a") ? "#ffffff" : "#0f172a"; }
  /** Darken (on light bg) or lighten (on dark bg) until the contrast target is met. */
  function ensureContrast(color, bg, target) {
    var towards = lum(bg) > 0.4 ? "#000000" : "#ffffff";
    var c = color;
    for (var i = 1; i <= 20 && contrast(c, bg) < target; i++) c = mix(color, towards, i * 0.05);
    return c;
  }
  function alpha(hex, a) { var c = hexToRgb(hex); return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }
  A.color = { mix: mix, contrast: contrast, readableOn: readableOn, ensureContrast: ensureContrast, alpha: alpha };

  /* --------------------------------------------------------------- branding */
  var Theme = (A.Theme = {});

  Theme.presets = [
    { name: "Royal & Gold", primary: "#1D4E89", secondary: "#E8A317" },
    { name: "Forest", primary: "#1F6B45", secondary: "#E3B448" },
    { name: "Maroon", primary: "#7A1F2B", secondary: "#D9A441" },
    { name: "Navy & Red", primary: "#14213D", secondary: "#E63946" },
    { name: "Purple", primary: "#5B2A86", secondary: "#F2C14E" },
    { name: "Teal", primary: "#0F6E76", secondary: "#F28C28" },
    { name: "Sky", primary: "#3A86C8", secondary: "#FFD166" },
    { name: "Charcoal", primary: "#2F3640", secondary: "#44BD32" },
  ];

  Theme.get = function () {
    var o = (A.Store && A.Store.state && A.Store.get("settings", "branding")) || {};
    var colors = CFG.colors || {};
    var base = A.edition === "home" && CFG.home && CFG.home.school ? Object.assign({}, CFG, CFG.home.school) : CFG;
    return {
      name: o.name || base.name || "Our School",
      shortName: o.shortName || base.shortName || o.name || base.name || "School",
      motto: o.motto != null ? o.motto : base.motto || "",
      logo: o.logo != null && o.logo !== "" ? o.logo : base.logo || "",
      primary: o.primary || colors.primary || "#1D4E89",
      secondary: o.secondary || colors.secondary || "#E8A317",
    };
  };

  Theme.mode = function () {
    var m; try { m = localStorage.getItem(THEME_KEY); } catch (e) { m = null; }
    return m || CFG.defaultTheme || "light";
  };
  Theme.setMode = function (m) {
    try { localStorage.setItem(THEME_KEY, m); } catch (e) { /* private mode */ }
    Theme.apply();
  };
  Theme.isDark = function () {
    var m = Theme.mode();
    if (m === "dark") return true;
    if (m === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  Theme.vars = function (b, dark) {
    var p = b.primary, s = b.secondary;
    var surface = dark ? "#141a26" : "#ffffff";
    var side = dark ? mix(p, "#0b0f18", 0.55) : p;
    var onSide = readableOn(side);
    return {
      "--brand": p,
      "--brand-strong": dark ? mix(p, "#ffffff", 0.12) : mix(p, "#000000", 0.2),
      "--brand-soft": mix(surface, p, dark ? 0.24 : 0.12),
      "--brand-softer": mix(surface, p, dark ? 0.12 : 0.05),
      "--brand-text": ensureContrast(p, surface, 4.5),
      "--on-brand": readableOn(p),
      "--brand-side": side,
      "--on-side": onSide,
      "--side-muted": alpha(onSide, 0.72),
      "--side-hover": alpha(onSide, 0.1),
      "--side-active": alpha(onSide, 0.18),
      "--accent": s,
      "--accent-soft": mix(surface, s, dark ? 0.2 : 0.16),
      "--accent-text": ensureContrast(s, surface, 4.5),
      "--on-accent": readableOn(s),
    };
  };

  Theme.apply = function () {
    var b = Theme.get(), root = document.documentElement, mode = Theme.mode();
    if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
    var v = Theme.vars(b, Theme.isDark());
    Object.keys(v).forEach(function (k) { root.style.setProperty(k, v[k]); });

    document.title = b.name;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", v["--brand-side"]);
    var fav = document.querySelector('link[rel="icon"]');
    if (fav) fav.setAttribute("href", b.logo || "data:image/svg+xml;charset=utf-8," + encodeURIComponent(Theme.crestSVG(b)));
  };

  /** Apply colours without saving (live preview in Settings → Branding). */
  Theme.preview = function (b) {
    var v = Theme.vars(Object.assign(Theme.get(), b), Theme.isDark()), root = document.documentElement;
    Object.keys(v).forEach(function (k) { root.style.setProperty(k, v[k]); });
  };

  /** Default crest drawn from the school initials and colours. */
  Theme.crestSVG = function (b) {
    b = b || Theme.get();
    var words = String(b.name || b.shortName).split(/\s+/).filter(function (w) { return /^[A-Z]/.test(w); });
    var ini = words.length > 1 ? words.slice(0, 3).map(function (w) { return w[0]; }).join("") : String(b.shortName || b.name).slice(0, 2);
    ini = A.esc(ini.toUpperCase());
    var fill = mix(b.primary, "#000000", 0.12), on = readableOn(fill);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 108" role="img" aria-label="' + A.esc(b.name) + ' crest">' +
      '<path d="M50 4 93 17v37c0 26-19 43-43 50C26 97 7 80 7 54V17Z" fill="' + fill + '" stroke="' + b.secondary + '" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M50 13 85 23.5V54c0 21-15 35-35 41.5C30 89 15 75 15 54V23.5Z" fill="none" stroke="' + on + '" stroke-opacity=".3" stroke-width="1.5"/>' +
      '<text x="50" y="56" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" font-size="' + (ini.length > 2 ? 23 : ini.length > 1 ? 29 : 36) + '" fill="' + on + '">' + ini + "</text>" +
      '<path d="M29 68q10.5-5 21 0 10.5-5 21 0v12q-10.5-5-21 0-10.5-5-21 0Z" fill="' + b.secondary + '"/>' +
      '<path d="M50 68v12" stroke="' + fill + '" stroke-width="1.6"/></svg>';
  };

  Theme.logoHTML = function (cls) {
    var b = Theme.get();
    var inner = b.logo ? '<img src="' + A.esc(b.logo) + '" alt="' + A.esc(b.name) + ' logo">' : Theme.crestSVG(b);
    return '<div class="logo ' + (cls || "") + '">' + inner + "</div>";
  };

  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () { if (Theme.mode() === "system") Theme.apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
  }
})(window.App);
