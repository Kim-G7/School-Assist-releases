/* Marking a typed answer against the marking scheme (js/paperscan.js reads the scheme).
 *   choice    multiple choice: the letter must match the key
 *   auto      numbers, ranges, coordinates and algebra: the final answer must match
 *             (algebra is compared by trying both expressions at sample values)
 *   keywords  written answers: each marking point whose key words appear earns a mark.
 *             This is a suggested mark; the student can change it while reviewing.
 *   self      essays, diagrams, tables and anything the scheme can't settle: the student
 *             awards the mark with the scheme's own row shown beside their answer
 * A.Marker.mark(unit, answer, paper) → { got, max, how, note } */
(function (A) {
  "use strict";

  /* ------------------------------------------------------------ numbers */
  function clean(s) {
    return String(s || "").replace(/[\ue000-\uf8ff\u0000-\u0008]/g, " ").replace(/[–—−]/g, "-").replace(/×/g, "*").replace(/÷/g, "/").replace(/ /g, " ")
      .replace(/\s+/g, " ").trim();
  }
  var JARGON = /\b(oe|cao|isw|nfww|www|soi|awrt|ft|dep|final answers?|oe fraction|or better|in any order|any order|correct|seen|implied|only|accept|allow|condone|exact|isw)\b/gi;
  /** Number values in a string: 1.6, -5, 3/4, 2 1/2, 3.25*10^4, 10%. */
  /** "7.08 × 10^(–3)", "3.25 x 10^4" → "7.08e-3", "3.25e4" */
  function standard(t) { return t.replace(/(\d)\s*[*x×]\s*10\s*\^\s*\(?\s*(-?\d+)\s*\)?/g, "$1e$2"); }
  function numbers(s) {
    var t = standard(clean(s)).replace(/(\d),(\d{3})\b/g, "$1$2").replace(/(\d) (\d{3})\b/g, "$1$2");
    var out = [], re = /(-?\s?\d*\.?\d+(?:e-?\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/g, m;
    while ((m = re.exec(t))) {
      var raw = m[1].replace(/\s/g, ""), v = Number(raw);
      if (m[2]) v = v / Number(m[2]);
      var digits = raw.replace(/^-/, "").replace(/e.*/, "");
      if (!isNaN(v)) out.push({ v: v, dp: m[2] ? 9 : ((digits.split(".")[1] || "").length), sf: digits.replace(".", "").replace(/^0+/, "").length });
    }
    return out;
  }
  /** Student number s against the scheme's e: equal, or a correct rounding of it. */
  function sameNum(s, e) {
    if (Math.abs(s.v - e.v) < 1e-9 * Math.max(1, Math.abs(e.v))) return true;
    if (e.dp >= 9) return s.sf >= 3 && Math.abs(s.v - e.v) <= 0.5 * Math.pow(10, -s.dp) + 1e-12; // 0.571 for 4/7
    // an answer that rounds to the scheme's value (12.47 for 12.5)
    return Math.abs(s.v - e.v) <= 0.5 * Math.pow(10, -e.dp) + 1e-12 && s.dp >= e.dp;
  }

  /* ------------------------------------------------------------ algebra */
  /** A tiny expression evaluator: + - * / ^, brackets, implicit multiplication (3x, 2(x+1), xy). */
  function evaluator(src) {
    var s = clean(src).replace(/\*\*/g, "^").replace(/\s+/g, "");
    if (!s || /[^0-9a-zA-Z.+\-*/^()]/.test(s)) return null;
    var i = 0;
    function peek() { return s[i]; }
    function num() { var st = i; while (/[0-9.]/.test(s[i] || "")) i++; return Number(s.slice(st, i)); }
    function atom(env) {
      var c = peek();
      if (c === "(") { i++; var v = expr(env); if (s[i] !== ")") throw 0; i++; return v; }
      if (c === "-") { i++; return -factor(env); }
      if (c === "+") { i++; return factor(env); }
      if (/[0-9.]/.test(c || "")) return num();
      if (/[a-zA-Z]/.test(c || "")) { i++; if (!(c in env)) env[c] = 1.3 + Object.keys(env).length * 0.7; return env[c]; }
      throw 0;
    }
    function factor(env) { var b = atom(env); if (s[i] === "^") { i++; return Math.pow(b, factor(env)); } return b; }
    function term(env) {
      var v = factor(env);
      for (;;) {
        var c = peek();
        if (c === "*") { i++; v *= factor(env); }
        else if (c === "/") { i++; v /= factor(env); }
        else if (c && /[0-9a-zA-Z.(]/.test(c)) v *= factor(env); // implicit: 3x, 2(x+1)
        else return v;
      }
    }
    function expr(env) {
      var v = term(env);
      for (;;) { var c = peek(); if (c === "+") { i++; v += term(env); } else if (c === "-") { i++; v -= term(env); } else return v; }
    }
    return function (env) { i = 0; var v = expr(env); if (i !== s.length) throw 0; return v; };
  }
  /** The value of a number-only expression such as "168π" or "2.5e3", or null. */
  function numeric(src) {
    var f = evaluator(standard(clean(src)).replace(/π/g, "(3.141592653589793)").replace(/(\d)e(-?\d)/g, "$1*10^$2"));
    if (!f) return null;
    try { var env = {}, v = f(env); return Object.keys(env).length ? null : v; } catch (e) { return null; }
  }
  function sameExpr(a, b) {
    var fa = evaluator(a), fb = evaluator(b);
    if (!fa || !fb) return null;
    var vars = (clean(a + b).match(/[a-zA-Z]/g) || []).filter(function (v, k, arr) { return arr.indexOf(v) === k; });
    try {
      for (var t = 0; t < 4; t++) {
        var env = {};
        vars.forEach(function (v, k) { env[v] = 0.37 + t * 1.13 + k * 0.71; });
        var x = fa(Object.assign({}, env)), y = fb(Object.assign({}, env));
        if (!isFinite(x) || !isFinite(y)) return null;
        if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(y))) return false;
      }
      return true;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------ words */
  var STOP = ("the a an and or of to in on at by for from with as is are was were be been it its this that these those they them their there " +
    "which what when where who how why has have had do does did not no can may will would should could than then so such into onto " +
    "one two three any each more most less very also only just about idea ora owtte e.g eg ie i.e etc marks mark max award credit point points " +
    "answer answers allow accept ignore reject answer example examples might include including response responses candidate candidates " +
    "available suitable reference correct named valid stated").split(" ");
  var STOPS = {}; STOP.forEach(function (w) { STOPS[w] = 1; });
  function stem(w) { return w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s|ly)$/, "").replace(/(e)$/, ""); }
  function words(s) {
    return (String(s || "").toLowerCase().replace(/[‘’']/g, "").match(/[a-z0-9.]+/g) || []).map(function (w) { return w.replace(/^\.+|\.+$/g, ""); })
      .filter(function (w) { return /^\d+(\.\d+)?$/.test(w) || (w.length > 2 && !STOPS[w]); }).map(function (w) { return /^\d/.test(w) ? w : stem(w); });
  }
  /** A marking point as slots of alternatives: "(from) high / higher to low concentration" → [[high,higher],[low],[concentration]]. */
  function slots(point) {
    var p = String(point).replace(/\([^)]*\)/g, " ").replace(/\s*\/\s*/g, "/");
    var out = [];
    p.split(/\s+/).forEach(function (tok) {
      var alts = tok.split("/").map(function (a) { return words(a); }).filter(function (a) { return a.length; }).map(function (a) { return a[0]; });
      if (alts.length) out.push(alts);
    });
    return out;
  }
  function matches(point, have) {
    var sl = slots(point);
    if (!sl.length) return false;
    var mine = Object.keys(have);
    // the same word, or the same word with another ending (photosynthesise / photosynthesis)
    var seen = function (a) { return have[a] || (a.length >= 5 && mine.some(function (w) { var n = 0; while (n < a.length && a[n] === w[n]) n++; return n >= Math.max(5, Math.min(a.length, w.length) - 2); })); };
    var hit = sl.filter(function (alts) { return alts.some(seen); }).length;
    return sl.length <= 2 ? hit === sl.length : hit / sl.length >= 0.6;
  }
  /** The marking points in a scheme row: "vacuole ;" lines, bullets, or "... (1)" items. */
  function points(msAnswer) {
    var t = String(msAnswer || "");
    var lines = t.split("\n").map(function (l) { return l.trim(); }).filter(function (l) {
      return l && !/^(reject|ignore|note|do not|don['’]t|award|one mark|two marks|max|credit|accept other|other appropriate|points might|responses may|braille|any (one|two|three|four|\d))/i.test(l);
    });
    var out = [];
    lines.join("\n").split(/;|\n|•|\(1\)/).forEach(function (x) { x = x.replace(/^[-–•\s]+/, "").trim(); if (words(x).length || /^[A-Z0-9]{1,3}$/i.test(x)) out.push(x); });
    return out;
  }

  /** "Tick one box" questions in written papers: the options are lettered A, B, C… and the
   *  scheme's answer is a letter (or letters). Give them choice buttons instead of "answer on paper". */
  function adapt(u) {
    if (!u || u.input === "choice" || !u.ms || (u.boxes && u.boxes.length) || u.table) return u;
    var ans = String(u.ms.answer || "").split("\n")[0].replace(/\b[ABCM]\d\b/g, " ").replace(/[;.]/g, " ").trim();
    var km = /^([A-H])(?:\s*(?:,|and|&)?\s*([A-H]))?(?:\s*(?:,|and|&)?\s*([A-H]))?$/.exec(ans);
    if (!km) return u;
    var key = [km[1], km[2], km[3]].filter(Boolean);
    var letters = [];
    String(u.text || "").split("\n").forEach(function (l) {
      var m = /^([A-H])(?:\s+\S|$)/.exec(l.trim());
      if (m && letters.indexOf(m[1]) < 0) letters.push(m[1]);
    });
    letters.sort();
    var consecutive = letters.length >= 3 && letters.every(function (L, i) { return L === "ABCDEFGH"[i]; });
    if (!consecutive || key.some(function (k) { return letters.indexOf(k) < 0; })) return u;
    u.input = "choice"; u.options = letters; u.key = key.join(","); u.multi = key.length > 1 ? key.length : 0;
    return u;
  }

  var M = (A.Marker = {
    numbers: numbers, sameExpr: sameExpr, points: points, adapt: adapt,

    /** Is this a part the student must mark themselves (after seeing the scheme)? */
    selfOnly: function (u) {
      if (!u.ms || u.ms.shared) return true;
      if (u.input === "work" || u.input === "essay" || u.table) return true;
      return /\blevels?\b|\bAO\d|Table [AB]\b|marks are available for|indicative content|generic mark/i.test(u.ms.answer);
    },

    mark: function (u, ans, paper) {
      var max = Number(u.marks) || 0;
      var given = Array.isArray(ans) ? ans.join(" ; ") : String(ans == null ? "" : ans);
      if (u.input === "work") {
        // drawn on the diagram or on paper: only the student can say, unless they typed a number, word or letter we can check
        if (!given.trim() || !u.ms || u.ms.shared) return { got: null, max: max, how: "self" };
        var w = maths(u, [given], paper);
        if (w != null) return { got: w ? max : 0, max: max, how: "auto", note: w ? "" : "Your answer doesn't match the scheme. If your working earned marks, give them to yourself." };
        return { got: null, max: max, how: "self" };
      }
      if (!given.replace(/[;\s]/g, "")) return { got: 0, max: max, how: "blank" };
      if (u.input === "choice") {
        if (!u.key) return { got: null, max: max, how: "self" };
        var want = u.key.toUpperCase().split(",").filter(Boolean), got = String(ans).toUpperCase().split(",").map(function (x) { return x.trim(); }).filter(Boolean);
        if (want.length === 1) return { got: got.length === 1 && got[0] === want[0] ? max : 0, max: max, how: "auto", note: "Answer: " + want[0] };
        // "tick two boxes": a mark for each right tick, less one for each wrong one
        var right = got.filter(function (g) { return want.indexOf(g) >= 0; }).length, wrong = got.length - right;
        var score = max >= want.length ? Math.max(0, right - wrong) * Math.floor(max / want.length) : (right === want.length && !wrong ? max : 0);
        return { got: Math.min(max, score), max: max, how: "auto", note: "Answer: " + want.join(", ") };
      }
      if (M.selfOnly(u)) return { got: null, max: max, how: "self" };
      var r = maths(u, Array.isArray(ans) ? ans : [given], paper);
      if (r != null) return { got: r ? max : 0, max: max, how: "auto", note: r ? "" : "Your final answer doesn't match. If your working earned method marks, you can give them to yourself." };
      var have = {};
      words(given).forEach(function (w) { have[w] = 1; });
      // inline gaps ("The part labelled ___ is…") against the scheme's points one by one
      // schemes often start by repeating the question: those lines are not marking points
      var qw = {};
      words(u.text).forEach(function (w) { qw[w] = 1; });
      var pts = points(u.ms.answer).filter(function (p) {
        var w = words(p);
        return w.length < 3 || w.filter(function (x) { return qw[x]; }).length < w.length * 0.6;
      });
      if (Array.isArray(ans) && u.boxes && u.boxes.length > 1 && pts.length === u.boxes.length && pts.every(function (p) { return words(p).length <= 3; })) {
        var got = 0;
        ans.forEach(function (a, k) { var h = {}; words(a).forEach(function (w) { h[w] = 1; }); if (matches(pts[k], h) || clean(a).toLowerCase() === clean(pts[k]).toLowerCase()) got++; });
        return { got: Math.min(max, Math.round(got * max / pts.length)), max: max, how: "keywords" };
      }
      if (!pts.length) return { got: null, max: max, how: "self" };
      var hit = pts.filter(function (p) { return matches(p, have); }).length;
      return { got: Math.min(max, hit), max: max, how: "keywords" };
    },
  });

  /** Numbers and algebra: true / false when the scheme gives a final answer we can compare, null otherwise. */
  var UNITS = /(\d)\s*(?:m\s*\/\s*s(?:\s*\^\s*\(?2\)?)?|km\s*\/\s*h|km|cm(?:\^?[23])?|mm|kg|m(?:\^?[23])?|g|s|h|min|kJ|MJ|J|kW|W|V|A|Ω|N|kPa|Pa|kHz|Hz|°C|K|mol)(?![\w^])/g;
  function maths(u, boxes, paper) {
    // "[0].03" and "1.6[0]" have optional digits; "[x =] 70" has a label
    var ms = standard(String(u.ms.answer || "").replace(/[\ue000-\uf8ff]/g, " ").replace(/[–—−]/g, "-").replace(/×/g, "*")).replace(/\[(\d+)\]/g, "$1");
    var raw = ms.split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^braille/i.test(l); });
    // science schemes print mark codes: the final answer is the first line with an A or B mark; C and M lines are working
    if (raw.some(function (l) { return /\b[ABCM]\d\b/.test(l); })) {
      var fin = raw.filter(function (l) { return /\b[AB]\d\b/.test(l); })[0];
      if (!fin) return null;
      raw = [fin.replace(/\b[ABCM]\d\b/g, "")];
    }
    var first = raw.map(function (l) { return l.replace(JARGON, "").replace(/\[\s*\]/g, "").trim(); }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (!first || first.length > 80) return null;
    var student = boxes.map(function (b) { return clean(b).replace(/^[a-zA-Z]\s*=\s*/, "").replace(UNITS, "$1"); });
    // "26 000 m OR 26 km": any of the answers will do
    var alts = first.split(/\s+OR\s+/), res = null;
    for (var i = 0; i < alts.length; i++) {
      var r = one(u, alts[i].replace(UNITS, "$1").replace(/\(\s*[a-zA-Z°Ω%\/\s^0-9]{0,6}\)\s*$/, "").replace(/\(\s*\)/g, "").trim(), student);
      if (r === true) return true;
      if (r === false) res = false;
    }
    return res;
  }
  function one(u, first, student) {
    var all = student.join(" ; ");
    // "72 ⩽ half-life ⩽ 76"
    var between = /^(-?\d+(?:\.\d+)?)\s*[⩽≤<]\s*[^⩽≤<\d]*[⩽≤<]\s*(-?\d+(?:\.\d+)?)$/.exec(first);
    if (between) { var bv = numbers(all); return bv.length === 1 && bv[0].v >= Number(between[1]) - 1e-9 && bv[0].v <= Number(between[2]) + 1e-9; }
    // "4.4 to 4.6", "108 to 112"
    var range = /^(-?\d+(?:\.\d+)?)\s*to\s*(-?\d+(?:\.\d+)?)$/.exec(first.replace(/[a-zA-Z°$%]+$/g, "").trim());
    if (range) {
      var sv = numbers(all);
      if (sv.length !== 1) return false;
      return sv[0].v >= Number(range[1]) - 1e-9 && sv[0].v <= Number(range[2]) + 1e-9;
    }
    // labelled values "[x =] 70 and [y =] 65", coordinates, pairs of roots: compare the numbers
    // an exact value with π: "168 π" (the student may give 168π or 527.8)
    if (/π/.test(first) && !/[a-z]/i.test(first.replace(/π|e\d|e-\d/g, ""))) {
      var ev = numeric(first), sv2 = numeric(all);
      if (ev == null || sv2 == null) return null;
      var sn = numbers(all.replace(/π/g, ""));
      return Math.abs(ev - sv2) < 1e-6 * Math.abs(ev) || (!/π/.test(all) && sn.length === 1 && sn[0].sf >= 3 && Math.abs(sv2 - ev) <= 0.5 * Math.pow(10, -sn[0].dp) + 1e-9);
    }
    var letters = first.replace(/\[[^\]]*\]/g, "").replace(/\b(and|or)\b/g, " ").replace(/[()\s,;$%°]|cm|km|mm|kg|m\b|g\b|s\b/g, "");
    if (/^[-\d./e]+$/.test(letters)) {
      var exp = numbers(first.replace(/\[[^\]]*\]/g, " "));
      var got = numbers(all);
      if (!exp.length || got.length !== exp.length) return exp.length ? false : null;
      var ordered = /\(.*,.*\)/.test(first) || (u.boxes || []).some(function (b) { return /=\s*$|=$/.test(b.label || ""); });
      if (ordered) return exp.every(function (e, k) { return sameNum(got[k], e); });
      var left = got.slice();
      return exp.every(function (e) { var k = left.findIndex(function (g) { return sameNum(g, e); }); if (k < 0) return false; left.splice(k, 1); return true; });
    }
    // algebra: one expression
    var alg = first.replace(/\[[^\]]*\]/g, "").replace(/^[a-z]\s*=\s*/i, "").trim();
    if (/^[\w\s.+\-*/^()]+$/.test(alg) && /[a-z]/i.test(alg) && !/\b[a-z]{3,}\b/i.test(alg) && student.length === 1) {
      var same = sameExpr(student[0], alg);
      if (same == null) return null;
      if (same && /factoris/i.test(u.text || "") && !/\(/.test(student[0])) return false;
      if (same && /expand|multiply out/i.test(u.text || "") && /\(/.test(student[0])) return false;
      return same;
    }
    return null;
  }
})(window.App);
