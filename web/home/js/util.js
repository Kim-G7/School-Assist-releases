/* Shared helpers: escaping, dates, ids, icons, a tiny markdown renderer. */
window.App = window.App || {};

(function (A) {
  "use strict";

  /* Which edition this copy is: "demo" (Greenfield High School, to explore) or "home" (one admin,
     one student, for revising at home). The desktop build passes it as ?edition=home; a web copy
     can set `edition` in school.config.js. */
  A.edition = (function () {
    var q = typeof location !== "undefined" && /[?&]edition=([a-z]+)/.exec(location.search);
    return (q && q[1]) || (window.SCHOOL_CONFIG && window.SCHOOL_CONFIG.edition) || "demo";
  })();

  A.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  A.uid = function (prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  A.clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  A.pct = function (a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; };
  A.sum = function (arr, fn) { return arr.reduce(function (t, x) { return t + (fn ? fn(x) : x); }, 0); };
  A.avg = function (arr) { return arr.length ? A.sum(arr) / arr.length : null; };
  A.byId = function (arr) { var m = {}; arr.forEach(function (x) { m[x.id] = x; }); return m; };
  A.debounce = function (fn, ms) {
    var t; return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); };
  };

  /* Deterministic PRNG so demo data looks the same on every device. */
  A.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  A.shuffle = function (arr, rand) {
    var a = arr.slice(), r = rand || Math.random;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };

  /* ------------------------------------------------------------- dates */
  var DAY = 86400000;
  A.DAY = DAY;
  A.pad = function (n) { return (n < 10 ? "0" : "") + n; };
  A.isoDate = function (ts) { var d = new Date(ts == null ? Date.now() : ts); return d.getFullYear() + "-" + A.pad(d.getMonth() + 1) + "-" + A.pad(d.getDate()); };
  A.startOfDay = function (ts) { var d = new Date(ts == null ? Date.now() : ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  A.fmtDate = function (ts) { if (!ts) return "—"; var d = new Date(ts); return WD[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()]; };
  A.fmtDateLong = function (ts) { if (!ts) return "—"; var d = new Date(ts); return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear(); };
  A.fmtTime = function (ts) { var d = new Date(ts); return A.pad(d.getHours()) + ":" + A.pad(d.getMinutes()); };
  A.fmtDateTime = function (ts) { return ts ? A.fmtDate(ts) + ", " + A.fmtTime(ts) : "—"; };
  A.relTime = function (ts) {
    if (!ts) return "never";
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < DAY / 1000) return Math.round(s / 3600) + " h ago";
    var d = Math.round(s / 86400);
    return d === 1 ? "yesterday" : d < 7 ? d + " days ago" : A.fmtDate(ts);
  };
  A.dueLabel = function (ts) {
    if (!ts) return { text: "No due date", tone: "" };
    var now = Date.now(), days = Math.round((A.startOfDay(ts) - A.startOfDay()) / DAY), t = A.fmtTime(ts);
    if (ts < now) {
      if (days === 0) return { text: "Was due today at " + t, tone: "bad" };
      var d = Math.max(1, Math.round((now - ts) / DAY));
      return { text: "Overdue by " + d + (d === 1 ? " day" : " days"), tone: "bad" };
    }
    var mins = Math.round((ts - now) / 60000);
    if (mins <= 60) return { text: "Due in " + Math.max(1, mins) + " min", tone: "bad" };
    if (days === 0) return { text: "Due today, " + t, tone: "warn" };
    if (days === 1) return { text: "Due tomorrow, " + t, tone: "warn" };
    if (days < 7) return { text: "Due " + WD[new Date(ts).getDay()] + ", " + t, tone: "" };
    return { text: "Due " + A.fmtDate(ts) + ", " + t, tone: "" };
  };
  A.WD = WD;
  A.MON = MON;
  /** "07:30" → minutes after midnight */
  A.hm = function (s) { var p = String(s || "0:0").split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); };
  A.mondayOf = function (ts) { var d = new Date(A.startOfDay(ts)); var wd = d.getDay() || 7; d.setDate(d.getDate() - (wd - 1)); return d.getTime(); };
  A.fmtDuration = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + A.pad(m) : m) + ":" + A.pad(s);
  };
  A.fmtMinutes = function (sec) { var m = Math.round(sec / 60); return m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : ""); };
  A.greeting = function () { var h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

  /* ----------------------------------------------------------- people */
  A.initials = function (name) {
    var parts = String(name || "?").replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, "").split(/\s+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  };
  var AV = ["#2a78d6", "#1f8a5b", "#8a4fd1", "#c2410c", "#0e7490", "#b4235a", "#4a3aa7", "#7c5a12", "#1d6fa3", "#9a3412"];
  A.avatar = function (user, size) {
    var h = 0, id = (user && user.id) || "x";
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return '<span class="avatar ' + (size || "") + '" style="background:' + AV[h % AV.length] + '" aria-hidden="true">' + A.esc(A.initials(user && user.name)) + "</span>";
  };
  A.firstName = function (name) { return String(name || "").replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, "").split(/\s+/)[0]; };

  /* ------------------------------------------------------------ icons */
  var P = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    library: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    tasks: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>',
    chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    wifi: '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0M12 20h.01"/>',
    wifiOff: '<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M12 20h.01"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    play: '<path d="M6 3l14 9-14 9z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="m12 19-7-7 7-7M19 12H5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    cap: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    present: '<path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M7 21l5-5 5 5"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    layers: '<path d="m12 2-10 5 10 5 10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2a5.56 5.56 0 0 0 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    shrink: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    minus: '<path d="M5 12h14"/>',
    school: '<path d="m4 6 8-4 8 4M18 10l4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2M14 22v-4a2 2 0 0 0-4 0v4M18 5v17M6 5v17"/><circle cx="12" cy="9" r="2"/>',
    notebook: '<path d="M2 6h4M2 10h4M2 14h4M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5M9.5 12H16M9.5 16H14"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/>',
    circle: '<circle cx="12" cy="12" r="10"/>',
    video: '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    audio: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    tablet: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M12 18h.01"/>',
    laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"/>',
    grid: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    beaker: '<path d="M4.5 3h15M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3M6 14h12"/>',
  };
  A.icon = function (name, cls) {
    return '<svg class="i ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || P.circle) + "</svg>";
  };

  /* ------------------------------------------------ markdown-lite notes
     Supports: # ## ### headings, - / * bullets, 1. lists, > callouts,
     | tables |, **bold**, *italic*, `code`, and [[formula]] blocks. */
  function inline(s) {
    return A.esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\^\{(.+?)\}/g, "<sup>$1</sup>")
      .replace(/\^([−-]?\w+(?:\.\d+)?)/g, "<sup>$1</sup>")
      .replace(/_\{(.+?)\}/g, "<sub>$1</sub>");
  }
  /** Inline formatting only, keeping line breaks: for questions, options, examples. */
  A.inl = function (s) { return String(s == null ? "" : s).split("\n").map(inline).join("<br>"); };
  A.md = function (src) {
    if (Array.isArray(src)) src = src.join("\n"); // notes written as a list of lines
    var lines = String(src || "").replace(/\r/g, "").split("\n");
    var out = [], i = 0;
    while (i < lines.length) {
      var ln = lines[i];
      if (!ln.trim()) { i++; continue; }
      var m;
      if ((m = ln.match(/^(#{1,3})\s+(.*)$/))) { out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); i++; continue; }
      if ((m = ln.match(/^\[\[(.*)\]\]\s*$/))) { out.push('<span class="formula">' + inline(m[1]) + "</span>"); i++; continue; }
      if (/^\s*[-*]\s+/.test(ln)) {
        var items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push("<li>" + inline(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>"); i++; }
        out.push("<ul>" + items.join("") + "</ul>"); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(ln)) {
        var oi = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { oi.push("<li>" + inline(lines[i].replace(/^\s*\d+[.)]\s+/, "")) + "</li>"); i++; }
        out.push("<ol>" + oi.join("") + "</ol>"); continue;
      }
      if (/^>\s?/.test(ln)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(inline(lines[i].replace(/^>\s?/, ""))); i++; }
        out.push("<blockquote>" + q.join("<br>") + "</blockquote>"); continue;
      }
      if (/^\|.*\|\s*$/.test(ln)) {
        var rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        var html = "<table>", hasHead = rows.length > 1 && /^\|\s*:?-{2,}/.test(rows[1]);
        rows.forEach(function (r, idx) {
          if (hasHead && idx === 1) return;
          var tag = hasHead && idx === 0 ? "th" : "td";
          var cells = r.trim().slice(1, -1).split("|");
          html += "<tr>" + cells.map(function (c) { return "<" + tag + ">" + inline(c.trim()) + "</" + tag + ">"; }).join("") + "</tr>";
        });
        out.push(html + "</table>"); continue;
      }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+[.)]\s|>|\||\[\[)/.test(lines[i])) { para.push(inline(lines[i])); i++; }
      if (para.length) out.push("<p>" + para.join("<br>") + "</p>");
      else { out.push("<p>" + inline(ln) + "</p>"); i++; }
    }
    return out.join("\n");
  };
  A.plain = function (src, n) {
    var t = String(src || "").replace(/[#>*`|[\]_^{}]/g, "").replace(/\s+/g, " ").trim();
    return n && t.length > n ? t.slice(0, n - 1) + "…" : t;
  };

  /* ------------------------------------------------------------ files */
  A.download = function (filename, data, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };
  A.readText = function (file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(file); });
  };
  A.readDataURL = function (file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
  };
  A.fmtBytes = function (b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB"; };
  A.slug = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };
  A.normAnswer = function (s) { return String(s == null ? "" : s).toLowerCase().replace(/[\s,]+/g, " ").replace(/[.;:!?'"]/g, "").trim(); };
})(window.App);
