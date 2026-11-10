/* Which copy of a record to keep when two meet: on the hub (server.cjs, hub-link.cjs) and on each device (js/store.js).
 *
 *  - Most records: the newest updatedAt wins.
 *  - A mark sheet or a register (SHEETS) holds one mark for each student, and two people can be at it at once: each
 *    student's mark comes from whichever copy changed it last, so nobody's marks vanish (2026-11-09).
 *    marksAt: { student: when } says when a mark changed, or when it was cleared. A mark with no time there changed at
 *    the record's updatedAt, so a sheet saved in one go carries no extra times.
 *  - A device whose date is set ahead can't win: a time more than FUTURE ahead of the hub's is taken as now (clamp).
 */
(function (make) {
  if (typeof module !== "undefined" && module.exports) module.exports = make();
  else window.App.Sheets = make();
})(function () {
  "use strict";
  var SHEETS = { assessments: true, attendance: true };
  var FUTURE = 5 * 60000;
  var own = function (o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); };
  var isSheet = function (coll) { return own(SHEETS, coll); };
  /** A name that would reach the language's own objects ("constructor", "__proto__"): never a collection or a record id. */
  var badName = function (n) { return n in Object.prototype; };
  var at = function (r, s) { return own(r.marksAt, s) ? Number(r.marksAt[s]) || 0 : Number(r.updatedAt) || 0; };
  var said = function (r, s) { return own(r.marks, s) || own(r.marksAt, s); };
  function students(a, b) {
    var seen = Object.create(null);
    [a && a.marks, a && a.marksAt, b && b.marks, b && b.marksAt].forEach(function (m) { if (m) Object.keys(m).forEach(function (k) { seen[k] = 1; }); });
    return Object.keys(seen);
  }
  function setTimes(rec, times) { if (Object.keys(times).length) rec.marksAt = times; else delete rec.marksAt; }
  /** The sheet both copies make. */
  function merge(a, b) {
    var ua = Number(a.updatedAt) || 0, ub = Number(b.updatedAt) || 0, newer = ub > ua ? b : a, top = Math.max(ua, ub);
    var out = Object.assign({}, newer, { updatedAt: top }), marks = {}, times = {};
    students(a, b).forEach(function (s) {
      var w = !said(a, s) ? b : !said(b, s) ? a : at(b, s) > at(a, s) ? b : at(a, s) > at(b, s) ? a : newer, t = at(w, s);
      if (own(w.marks, s)) marks[s] = w.marks[s];
      if (!own(w.marks, s) || t !== top) times[s] = t;
    });
    out.marks = marks;
    setTimes(out, times);
    return out;
  }
  /** Do these two copies hold the same marks from the same moments? */
  function same(a, b) {
    return students(a, b).every(function (s) { return own(a.marks, s) === own(b.marks, s) && (!own(a.marks, s) || a.marks[s] === b.marks[s]) && at(a, s) === at(b, s); });
  }
  /** What to keep when `rec` arrives and `cur` is held: a record, or null to keep `cur` as it is. */
  function pick(coll, cur, rec) {
    var cu = cur ? Number(cur.updatedAt) || 0 : 0, ru = Number(rec.updatedAt) || 0;
    if (cur && !cur._deleted && !rec._deleted && isSheet(coll)) { var m = merge(cur, rec); return ru > cu || !same(m, cur) ? m : null; }
    return !cur || cu < ru ? rec : null;
  }
  /** On a save: the times of the marks that didn't change stay, so this device's copy doesn't claim them. */
  function stamp(prev, rec) {
    var top = rec.updatedAt, times = {};
    students(prev, rec).forEach(function (s) {
      var has = own(rec.marks, s), had = own(prev.marks, s);
      if (has !== had || (has && rec.marks[s] !== prev.marks[s])) { if (!has) times[s] = top; return; } // (a new mark's time is the sheet's)
      if (said(prev, s) && (!has || at(prev, s) !== top)) times[s] = at(prev, s);
    });
    setTimes(rec, times);
    return rec;
  }
  /** `rec` with no time more than FUTURE ahead of `now`. */
  function clamp(rec, now) {
    var limit = now + FUTURE, ahead = (Number(rec.updatedAt) || 0) > limit, late = !!rec.marksAt && Object.keys(rec.marksAt).some(function (s) { return Number(rec.marksAt[s]) > limit; });
    if (!ahead && !late) return rec;
    var out = Object.assign({}, rec);
    if (ahead) out.updatedAt = now;
    if (late) { out.marksAt = {}; Object.keys(rec.marksAt).forEach(function (s) { out.marksAt[s] = Math.min(Number(rec.marksAt[s]) || 0, now); }); }
    return out;
  }
  return { FUTURE: FUTURE, isSheet: isSheet, badName: badName, merge: merge, same: same, pick: pick, stamp: stamp, clamp: clamp };
});
