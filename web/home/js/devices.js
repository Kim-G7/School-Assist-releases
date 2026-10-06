/* Devices: every sign-in records which device was used (phone, tablet, laptop),
   so admins can see how many devices are signed in to each account and sign
   any of them out remotely. */
(function (A) {
  "use strict";
  var S = function () { return A.Store; };
  var KEY = "sca-device-id";
  var Dev = (A.Devices = {});

  Dev.id = function () {
    var id = null;
    try { id = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (!id) { id = A.uid("dev"); try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ } }
    return id;
  };
  var recId = function (uid) { return "dv_" + Dev.id() + "_" + uid; };

  Dev.detect = function () {
    var ua = navigator.userAgent || "", os = "Unknown", ver = "", browser = "Browser", model = "", type;
    if (/Android/i.test(ua)) { os = "Android"; ver = (ua.match(/Android\s([\d.]+)/) || [])[1] || ""; model = (ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/) || [])[1] || ""; }
    else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) { os = "iPadOS"; model = "iPad"; }
    else if (/iPhone|iPod/.test(ua)) { os = "iOS"; ver = ((ua.match(/OS (\d+)_/) || [])[1]) || ""; model = "iPhone"; }
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Linux/.test(ua)) os = "Linux";
    if (model === "K") model = "";
    if (/Electron/.test(ua)) browser = "Desktop app";
    else if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
    else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua)) browser = "Safari";
    var small = Math.min(screen.width, screen.height), touch = navigator.maxTouchPoints > 0;
    if (os === "iOS") type = "Phone";
    else if (os === "iPadOS") type = "Tablet";
    else if (os === "Android") type = /Mobile/.test(ua) || small < 600 ? "Phone" : "Tablet";
    else type = "Laptop";
    return { type: type, os: (os + (ver ? " " + ver.split(".")[0] : "")).trim(), browser: browser, model: model, screen: screen.width + "×" + screen.height, touch: touch };
  };

  /** Richer details where the browser offers them (Android model, Windows 11). */
  function refine(uid) {
    var uad = navigator.userAgentData;
    if (!uad || !uad.getHighEntropyValues) return;
    uad.getHighEntropyValues(["model", "platformVersion"]).then(function (h) {
      var cur = S().get("devices", recId(uid));
      if (!cur) return;
      var patch = {};
      if (h.model && !cur.model) patch.model = h.model;
      if (/^Windows/.test(cur.os) && h.platformVersion) patch.os = Number(h.platformVersion.split(".")[0]) >= 13 ? "Windows 11" : "Windows 10";
      if (Object.keys(patch).length) S().patch("devices", cur.id, patch);
    }).catch(function () { /* not available */ });
  }

  Dev.signIn = function (u) {
    var now = Date.now(), cur = S().get("devices", recId(u.id)) || {};
    S().put("devices", Object.assign({}, cur, Dev.detect(), {
      id: recId(u.id), deviceId: Dev.id(), userId: u.id, role: u.role,
      firstSignInAt: cur.firstSignInAt || now, signedInAt: now, lastSeenAt: now, signedIn: true,
    }));
    refine(u.id);
  };
  Dev.signOut = function (u) {
    var cur = u && S().get("devices", recId(u.id));
    if (cur) S().put("devices", Object.assign({}, cur, { signedIn: false, signedOutAt: Date.now() }));
  };
  /** Keep "last seen" fresh without flooding sync (at most every 10 minutes). */
  Dev.heartbeat = function (u) {
    var cur = S().get("devices", recId(u.id));
    if (!cur) { Dev.signIn(u); return; }
    if (Date.now() - (cur.lastSeenAt || 0) > 10 * 60000) S().put("devices", Object.assign({}, cur, { lastSeenAt: Date.now(), signedIn: true }));
  };
  /** An admin signed this device out after this sign-in. */
  Dev.isRevoked = function (u) {
    var rv = S().get("revocations", "rv_" + Dev.id() + "_" + u.id), cur = S().get("devices", recId(u.id));
    return !!(rv && cur && rv.revokedAt > (cur.signedInAt || 0));
  };
  Dev.revoke = function (dev, byId) {
    S().put("revocations", { id: "rv_" + dev.deviceId + "_" + dev.userId, deviceId: dev.deviceId, userId: dev.userId, revokedAt: Date.now(), by: byId });
    S().put("devices", Object.assign({}, dev, { signedIn: false, signedOutAt: Date.now(), revoked: true }));
  };

  Dev.forUser = function (uid, all) {
    return S().filter("devices", function (d) { return d.userId === uid && (all || d.signedIn); }).sort(function (a, b) { return (b.lastSeenAt || 0) - (a.lastSeenAt || 0); });
  };
  Dev.ip = function (dev) { var n = S().get("netinfo", "ni_" + dev.deviceId); return n ? n.ip : ""; };
  Dev.isThis = function (dev) { return dev.deviceId === Dev.id(); };
  Dev.icon = function (type) { return type === "Phone" ? "phone" : type === "Tablet" ? "tablet" : "laptop"; };
  Dev.label = function (d) { return (d.model ? d.model + " · " : "") + d.os + " · " + d.browser; };
  Dev.summary = function (uid) {
    var list = Dev.forUser(uid), phones = list.filter(function (d) { return d.type === "Phone"; }).length;
    return { count: list.length, phones: phones, list: list };
  };
})(window.App);
