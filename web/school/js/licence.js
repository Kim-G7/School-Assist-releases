/* The school's licence: which school this copy of School Assist belongs to, and which plan it is on.
 *
 *  - Golden Technologies gives each school a key (scripts/licence.cjs issue). The admin pastes it into
 *    Settings → Plan & licence. It is saved as the settings record "licence", so it reaches the school
 *    hub and every device like any other setting, and it sets the school's name.
 *  - A key is signed with Golden Technologies' private key and checked here with the public half
 *    (js/licence-key.js). Changing a single letter of a key, or writing one by hand, makes it invalid.
 *    The check runs in plain JavaScript, so it works offline and on any device, including tablets that
 *    open the app from the hub over http:// (where the browser's own crypto is switched off).
 *  - Plans: Standard (US$2,000 a term) is School Assist as it is; Premium (US$4,000 a term) adds the
 *    Premium features below. Premium features stay off until the school's admin turns them on.
 *  - When an update brings a new feature, the admins hear about it in their notifications: on Premium as
 *    something they can turn on, on Standard as news of what Premium offers.
 *  - A school keeps ONE key. Each payment extends it with a renewal (scripts/licence.cjs renew): a short signed
 *    note "licence GT-0007 is paid until 30 April 2027 (Premium)". An admin's device online fetches it by itself
 *    (school.config.js → licenceFeed: the public releases repository), or the admin pastes the renewal code
 *    where the key goes. A renewal can also change the plan (Standard ↔ Premium).
 *  - After the paid date there are 30 days' grace with a reminder; after that Premium features switch
 *    off and staff see a notice until a new key is entered. Standard features keep working.
 *  - Premium features are hidden from Standard schools (no locked rows, no announcements): only a Premium key
 *    from Golden Technologies shows and unlocks them.
 *  - A master key (scripts/licence.cjs master) unlocks everything for a short time on any school, in either
 *    edition: a stand-in when something goes wrong with a school's own key. It never renames the school, and
 *    the school's own key replaces it (pasted in the same place).
 *  - Home (the home-study edition) needs no key. */
(function (A) {
  "use strict";
  var esc = A.esc, I = A.icon, M = A.M, UI = A.UI, S = function () { return A.Store; };
  var CFG = window.SCHOOL_CONFIG || {};
  var GRACE_DAYS = 30, DAY = 86400000;

  var PLANS = {
    standard: { name: "Standard", fee: "US$2,000 a term" },
    premium: { name: "Premium", fee: "US$4,000 a term" },
  };
  /** Premium features. `built: false` ones are on the way; an update that builds one flips it to true. */
  var FEATURES = [
    { id: "ai-marking", name: "AI marking", built: true, about: "Written answers in practice papers are marked against the marking scheme, with a line of feedback for the student." },
    { id: "consultation", name: "Consultation mode", built: false },
    { id: "vacation", name: "Vacation mode", built: false },
    { id: "parent-monitor", name: "Parent and student monitoring", built: false },
  ];

  /* ------------------------------------------------------------------ checking a key
     Ed25519 signature check (RFC 8032) with BigInt, and SHA-512 (FIPS 180-4) to go with it. Only
     public data passes through here, so it doesn't need to be constant-time. Tested against Node's
     own Ed25519 (scripts/licence.cjs). */
  var Ed = (function () {
    if (typeof BigInt !== "function") return null;
    var N = BigInt, ZERO = N(0), ONE = N(1), TWO = N(2), EIGHT = N(8), B255 = N(255);
    var MASK = (ONE << N(64)) - ONE;
    function pow(b, e, m) { var r = ONE; b %= m; while (e > ZERO) { if (e & ONE) r = (r * b) % m; b = (b * b) % m; e >>= ONE; } return r; }

    // SHA-512's constants are the fractional parts of the square and cube roots of the first primes
    function iroot(n, k) {
      var K = N(k), x = ONE << N(Math.ceil(n.toString(2).length / k) + 1), y;
      for (;;) { y = ((K - ONE) * x + n / (k === 2 ? x : x * x)) / K; if (y >= x) return x; x = y; }
    }
    var primes = [], c = 2;
    while (primes.length < 80) { if (primes.every(function (p) { return c % p; })) primes.push(c); c++; }
    var H0 = primes.slice(0, 8).map(function (p) { return iroot(N(p) << N(128), 2) & MASK; });
    var K = primes.map(function (p) { return iroot(N(p) << N(192), 3) & MASK; });
    var SH = []; for (var s = 0; s < 64; s++) SH.push(N(s));
    function rotr(x, n) { return ((x >> SH[n]) | (x << SH[64 - n])) & MASK; }
    function sha512(msg) {
      var len = msg.length, total = Math.ceil((len + 17) / 128) * 128, buf = new Uint8Array(total), i, j, t;
      buf.set(msg); buf[len] = 0x80;
      for (i = 0, t = len * 8; i < 6; i++, t = Math.floor(t / 256)) buf[total - 1 - i] = t % 256;
      var h = H0.slice(), w = new Array(80);
      for (var off = 0; off < total; off += 128) {
        for (t = 0; t < 16; t++) { var v = ZERO; for (j = 0; j < 8; j++) v = (v << EIGHT) | N(buf[off + t * 8 + j]); w[t] = v; }
        for (t = 16; t < 80; t++) {
          var a15 = w[t - 15], a2 = w[t - 2];
          w[t] = ((rotr(a2, 19) ^ rotr(a2, 61) ^ (a2 >> SH[6])) + w[t - 7] + (rotr(a15, 1) ^ rotr(a15, 8) ^ (a15 >> SH[7])) + w[t - 16]) & MASK;
        }
        var a = h[0], b = h[1], cc = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (t = 0; t < 80; t++) {
          var t1 = (hh + (rotr(e, 14) ^ rotr(e, 18) ^ rotr(e, 41)) + ((e & f) ^ ((e ^ MASK) & g)) + K[t] + w[t]) & MASK;
          var t2 = ((rotr(a, 28) ^ rotr(a, 34) ^ rotr(a, 39)) + ((a & b) ^ (a & cc) ^ (b & cc))) & MASK;
          hh = g; g = f; f = e; e = (d + t1) & MASK; d = cc; cc = b; b = a; a = (t1 + t2) & MASK;
        }
        h[0] = (h[0] + a) & MASK; h[1] = (h[1] + b) & MASK; h[2] = (h[2] + cc) & MASK; h[3] = (h[3] + d) & MASK;
        h[4] = (h[4] + e) & MASK; h[5] = (h[5] + f) & MASK; h[6] = (h[6] + g) & MASK; h[7] = (h[7] + hh) & MASK;
      }
      var out = new Uint8Array(64);
      for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) out[i * 8 + j] = Number((h[i] >> N(56 - 8 * j)) & B255);
      return out;
    }

    // the curve: edwards25519, points in extended coordinates [X, Y, Z, T]
    var P = (ONE << N(255)) - N(19);
    var L = (ONE << N(252)) + N("27742317777372353535851937790883648493");
    function md(a) { a %= P; return a < ZERO ? a + P : a; }
    function inv(a) { return pow(md(a), P - TWO, P); }
    var D = md(N(-121665) * inv(N(121666))), D2 = md(D * TWO), SQRT_M1 = pow(TWO, (P - ONE) / N(4), P);
    function le(bytes) { var r = ZERO; for (var i = bytes.length - 1; i >= 0; i--) r = (r << EIGHT) | N(bytes[i]); return r; }
    function xFor(y, sign) {
      var y2 = md(y * y), u = md(y2 - ONE), v = md(D * y2 + ONE), v3 = md(v * v * v);
      var x = md(u * v3 * pow(md(u * v3 * v3 * v), (P - N(5)) / EIGHT, P)), vx2 = md(v * x * x);
      if (vx2 !== u) { if (vx2 === md(-u)) x = md(x * SQRT_M1); else return null; }
      if (x === ZERO && sign) return null;
      if (Number(x & ONE) !== sign) x = md(-x);
      return x;
    }
    function decode(bytes) {
      var b = Array.prototype.slice.call(bytes), sign = b[31] >> 7;
      b[31] &= 0x7f;
      var y = le(b);
      if (y >= P) return null;
      var x = xFor(y, sign);
      return x === null ? null : [x, y, ONE, md(x * y)];
    }
    function add(p, q) {
      var a = md((p[1] - p[0]) * (q[1] - q[0])), b = md((p[1] + p[0]) * (q[1] + q[0]));
      var c2 = md(p[3] * D2 * q[3]), d = md(p[2] * TWO * q[2]);
      var e = b - a, f = d - c2, g = d + c2, h = b + a;
      return [md(e * f), md(g * h), md(f * g), md(e * h)];
    }
    function mul(k, p) { var q = [ZERO, ONE, ONE, ZERO]; while (k > ZERO) { if (k & ONE) q = add(q, p); p = add(p, p); k >>= ONE; } return q; }
    function encode(p) {
      var zi = inv(p[2]), x = md(p[0] * zi), y = md(p[1] * zi), out = new Uint8Array(32);
      for (var i = 0; i < 32; i++) { out[i] = Number(y & B255); y >>= EIGHT; }
      if (x & ONE) out[31] |= 0x80;
      return out;
    }
    var GY = md(N(4) * inv(N(5))), GX = xFor(GY, 0), G = [GX, GY, ONE, md(GX * GY)];

    /** Is `sig` (64 bytes) a valid signature of `msg` by the public key `pub` (32 bytes)? */
    function verify(sig, msg, pub) {
      if (sig.length !== 64 || pub.length !== 32) return false;
      var pt = decode(pub);
      if (!pt) return false;
      var sc = le(sig.subarray(32));
      if (sc >= L) return false;
      var hin = new Uint8Array(64 + msg.length);
      hin.set(sig.subarray(0, 32)); hin.set(pub, 32); hin.set(msg, 64);
      var k = le(sha512(hin)) % L;
      var r = encode(add(mul(sc, G), mul(k, [md(-pt[0]), pt[1], pt[2], md(-pt[3])]))); // [s]B - [k]A must be R
      for (var i = 0; i < 32; i++) if (r[i] !== sig[i]) return false;
      return true;
    }
    return { verify: verify, sha512: sha512 };
  })();

  function binary(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return atob(s); }
  function bytes(bin) { var out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255; return out; }

  var cache = {};
  /** { ok, data, key } for a pasted key, { ok, renewal: true, data, key } for a renewal code, or { ok: false, error }. */
  function read(key) {
    var k = String(key || "").replace(/\s+/g, ""), parts = k.split(".");
    if (cache[k]) return cache[k];
    var r;
    if (parts.length !== 3 || (parts[0] !== "SA1" && parts[0] !== "SA1R")) r = { ok: false, error: "That isn't a School Assist key. Check that you copied all of it." };
    else if (!Ed || !window.SA_LICENCE_KEY) r = { ok: false, error: "This device can't check keys. Update its browser, or enter the key on the school hub computer." };
    else {
      try {
        if (!Ed.verify(bytes(binary(parts[2])), bytes(parts[0] + "." + parts[1]), bytes(binary(window.SA_LICENCE_KEY)))) {
          r = { ok: false, error: "This key isn't valid. It may have been copied wrongly or changed." };
        } else {
          var d = JSON.parse(decodeURIComponent(escape(binary(parts[1])))), want = A.edition === "teacher" ? "teacher" : "school";
          r = parts[0] === "SA1R" ? { ok: true, renewal: true, data: d, key: k }
            : d.master && d.ed === "*" ? { ok: true, master: true, data: d, key: k }
            : d.ed !== want
            ? { ok: false, data: d, error: d.ed === "teacher" ? "This key is for School Assist Teacher, not this app." : "This key is for School Assist, not School Assist Teacher." }
            : { ok: true, data: d, key: k };
        }
      } catch (e) { r = { ok: false, error: "This key is damaged. Copy it again." }; }
    }
    return (cache[k] = r);
  }
  function longDate(iso) { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); }

  /* ------------------------------------------------------------------ the school's licence */
  var Lic = (A.Licence = { PLANS: PLANS, FEATURES: FEATURES, read: read, Ed: Ed });

  /** Keys are for the school editions; Home needs none. */
  Lic.applies = function () { return A.edition !== "home"; };

  /** The key's details, extended by a renewal of the same licence that runs later (or changes the plan). */
  function withRenewal(d, code) {
    var rr = code ? read(code) : null;
    if (!rr || !rr.ok || !rr.renewal || rr.data.no !== d.no || (rr.data.until <= d.until && (rr.data.plan || d.plan) === d.plan)) return d;
    return Object.assign({}, d, { until: rr.data.until > d.until ? rr.data.until : d.until, plan: rr.data.plan || d.plan, renewed: rr.data.issued || true });
  }
  Lic.withRenewal = withRenewal;
  /** state: home | trial (no key) | invalid | active | grace (paid date passed, 30 days' grace) | expired */
  Lic.status = function () {
    if (!Lic.applies()) return { state: "home" };
    var rec = A.Store && A.Store.state ? S().get("settings", "licence") : null;
    if (!rec || !rec.key || rec._deleted) return { state: "trial" };
    var r = read(rec.key);
    if (!r.ok) return { state: "invalid", error: r.error };
    var d = withRenewal(r.data, rec.renewal), end = Date.parse(d.until + "T23:59:59"), now = Date.now();
    var graceLeft = Math.ceil((end + GRACE_DAYS * DAY - now) / DAY);
    return { state: now <= end ? "active" : graceLeft > 0 ? "grace" : "expired", data: d, plan: d.plan,
      daysLeft: Math.ceil((end - now) / DAY), graceLeft: graceLeft };
  };
  /** The plan in force: "premium", "standard", or "" (trial, invalid or expired). */
  Lic.plan = function () { var st = Lic.status(); return st.state === "home" ? "premium" : st.state === "active" || st.state === "grace" ? st.plan : ""; };
  Lic.abbr = function () { var st = Lic.status(); return (st.data && !st.data.master && st.data.abbr) || ""; };
  /** Is the school running on a temporary master key? */
  Lic.isMaster = function () { var st = Lic.status(); return !!(st.data && st.data.master); };
  /** May this school use the feature? (Its plan includes it.) */
  Lic.has = function (id) {
    var f = FEATURES.filter(function (x) { return x.id === id; })[0];
    return !f || Lic.plan() === "premium";
  };
  /** Is the feature in use: on the plan, and turned on by the admin. */
  Lic.isOn = function (id) {
    if (!Lic.has(id)) return false;
    if (id === "ai-marking") return !!(S().get("settings", "ai") || {}).enabled;
    return !!((S().get("settings", "features") || {}).on || {})[id];
  };

  /* ------------------------------------------------------------------ telling the admins about new features */
  var announced = false;
  Lic.announce = function (me) {
    if (announced || !me || !me.isAdmin || !Lic.applies()) return;
    announced = true;
    var st = Lic.status();
    if ((st.state !== "active" && st.state !== "grace") || st.plan !== "premium") return; // Standard schools don't hear about what they can't use
    var rec = S().get("settings", "features") || { id: "features" }, seen = rec.seen || [];
    var fresh = FEATURES.filter(function (x) { return x.built && seen.indexOf(x.id) < 0; });
    if (!fresh.length) return;
    var now = Date.now();
    var admins = S().filter("users", function (u) { return u.role === "teacher" && u.isAdmin && u.status !== "pending"; });
    fresh.forEach(function (x) {
      admins.forEach(function (adm) {
        S().put("alerts", { id: "al_feature_" + x.id + "_" + adm.id, teacherId: adm.id, kind: "feature", createdAt: now,
          title: "New for your school: " + x.name,
          body: (x.about ? x.about + " " : "") + "It stays off until you turn it on in Settings → Plan & licence." });
      });
    });
    S().put("settings", Object.assign({}, rec, { id: "features", seen: seen.concat(fresh.map(function (x) { return x.id; })) }));
  };

  /* ------------------------------------------------------------------ the notice at the top of the page */
  var SNOOZE = "sca-licence-snooze";
  function bar(text, act) {
    return '<div class="callout warn licence-bar">' + I("key") + '<div class="grow small">' + text + "</div>" + (act || "") + "</div>";
  }
  Lic.banner = function (me) {
    if (!me || me.role !== "teacher" || !Lic.applies()) return "";
    var st = Lic.status(), admin = !!me.isAdmin, where = '<a href="#/t/settings?s=licence">Settings → Plan &amp; licence</a>';
    if (admin) setTimeout(function () { Lic.announce(me); Lic.checkOnline(me); }, 0);
    var d = st.data || {};
    if (st.state === "expired") {
      return bar("<b>This school's School Assist licence ended on " + esc(longDate(d.until)) + ".</b> Premium features are off. " +
        (admin ? "Once Golden Technologies has the payment, the renewal arrives by itself when this computer is online, or enter the renewal code in " + where + "." : "Please ask the school office to renew it."));
    }
    if (!admin) return "";
    if (st.state === "invalid") return bar("<b>The School Assist key saved here doesn't work.</b> " + esc(st.error) + " Enter the key Golden Technologies gave your school in " + where + ".");
    if (st.state === "grace") return bar("<b>Your School Assist licence ended on " + esc(longDate(d.until)) + ".</b> Everything keeps working for " + st.graceLeft + " more day" + (st.graceLeft === 1 ? "" : "s") + ". Once Golden Technologies has the payment, the renewal arrives by itself when this computer is online (or enter the renewal code in " + where + ").");
    if (st.state === "active" && d.master) return bar("<b>This school is using a temporary master key</b> (until " + esc(longDate(d.until)) + "). Enter the school's own key from Golden Technologies in " + where + " when it arrives.");
    if (st.state === "active" && st.daysLeft <= 14) return bar("Your School Assist licence runs until " + esc(longDate(d.until)) + " (" + st.daysLeft + " day" + (st.daysLeft === 1 ? "" : "s") + "). Next term's payment renews the same key.");
    if (st.state === "trial") {
      var until = 0; try { until = Number(localStorage.getItem(SNOOZE)) || 0; } catch (e) { /* private mode */ }
      if (Date.now() < until) return "";
      return bar("This copy of School Assist isn't activated yet. Enter your school's key in " + where + ".",
        '<button class="btn btn-sm btn-ghost" data-act="licence-snooze">Not now</button>');
    }
    return "";
  };
  A.act["licence-snooze"] = function () {
    try { localStorage.setItem(SNOOZE, String(Date.now() + 7 * DAY)); } catch (e) { /* private mode */ }
    A.render();
  };

  /* ------------------------------------------------------------------ Settings → Plan & licence */
  function contact() {
    var c = CFG.company || {};
    return esc(c.name || "Golden Technologies") + (c.phone || c.email ? " (" + esc([c.phone, c.email].filter(Boolean).join(", ")) + ")" : "");
  }
  Lic.section = function (me) {
    var st = Lic.status(), d = st.data || {}, plan = Lic.plan(), html = '<div class="card card-pad" style="max-width:760px">';
    if (st.state === "trial") {
      html += '<h3>Not activated yet</h3><p class="muted small mt-sm">Paste the school\'s key from Golden Technologies.</p>';
    } else if (st.state === "invalid") {
      html += '<h3>The saved key doesn\'t work</h3><div class="callout warn mt">' + I("alert") + "<div>" + esc(st.error) + "</div></div>";
    } else if (d.master) {
      html += "<h3>" + I("key") + " Temporary master key</h3>" +
        '<p class="muted small mt-sm">Golden Technologies unlocked every feature for ' + esc(A.Theme.get().name) + " until " + esc(longDate(d.until)) + (st.state !== "active" ? " (that date has passed)" : " (" + st.daysLeft + " day" + (st.daysLeft === 1 ? "" : "s") + " left)") +
        ". It stands in for the school's own key: paste that below when Golden Technologies sends it, and it replaces this one.</p>" +
        '<dl class="kv mt"><dt>Plan</dt><dd><b>Premium</b> (everything unlocked)</dd><dt>Master key</dt><dd>' + esc(d.no) + "</dd></dl>";
    } else {
      var when = st.state === "active" ? "until " + longDate(d.until) + " (" + st.daysLeft + " day" + (st.daysLeft === 1 ? "" : "s") + " left)"
        : st.state === "grace" ? "ended " + longDate(d.until) + ": " + st.graceLeft + " days' grace left" : "ended " + longDate(d.until);
      html += "<h3>" + esc(d.name) + "</h3>" +
        '<dl class="kv mt"><dt>Plan</dt><dd><b>' + esc((PLANS[d.plan] || {}).name || d.plan) + "</b>" + (st.state === "expired" ? " (expired: Premium features are off)" : "") + "</dd>" +
        "<dt>Paid</dt><dd>" + esc(when) + "</dd><dt>School code</dt><dd>" + esc(d.abbr) + " · " + esc(d.sid) + "</dd><dt>Licence</dt><dd>" + esc(d.no) + "</dd></dl>";
    }
    if (st.data && st.data.renewed) html += '<p class="tiny muted mt-sm">' + I("refresh") + " Renewed: the same key, paid until " + esc(longDate(d.until)) + ".</p>";
    html += '<form data-submit="licence-apply" class="mt"><label class="field"><span>' + (st.state === "trial" ? "School Assist key" : "Renewal code, or a new key") + "</span>" +
      '<textarea class="input" name="key" rows="3" spellcheck="false" autocomplete="off" placeholder="' + (st.state === "trial" ? "SA1.…" : "SA1R.… (renewal) or SA1.… (key)") + '" style="font-family:monospace;font-size:12px"></textarea>' +
      '<span class="hint">' + (st.state === "trial" ? "Paste the whole key, or open the key file." : "Renewals arrive by themselves when online.") + "</span></label>" +
      '<div class="row wrap mt-sm"><button class="btn btn-primary" type="submit">' + I("key") + 'Activate</button><label class="btn btn-ghost">' + I("upload") + 'Open key file<input type="file" id="licence-file" accept=".txt,.sakey,text/plain" hidden></label></div></form></div>';

    // the two plans, and what Premium holds
    // a Standard (or not yet activated) school sees no Premium features at all: nothing locked to look at
    var rows = plan !== "premium" ? "" : FEATURES.map(function (f) {
      var right = !f.built ? '<span class="muted small">Coming soon</span>'
        : '<label class="check" style="margin:0"><input type="checkbox" data-licence-feature="' + f.id + '"' + (Lic.isOn(f.id) ? " checked" : "") + "> On</label>";
      return '<div class="list-row"><div class="grow"><div class="title">' + esc(f.name) + "</div>" + (f.about ? '<div class="meta"><span>' + esc(f.about) + "</span></div>" : "") + "</div>" + right + "</div>";
    }).join("");
    // School Assist Teacher has one plan (priced per teacher): no Standard / Premium comparison
    if (A.edition !== "teacher") html += '<div class="card mt" style="max-width:760px"><div class="card-head">' + I("layers") + "<h3>Plans</h3></div>" +
      '<div class="card-pad" style="padding-top:0"><p class="small"><b>Standard</b> · ' + PLANS.standard.fee + (plan === "standard" ? " · <b>your plan</b>" : "") +
      "</p>" +
      '<p class="small mt"><b>Premium</b> · ' + PLANS.premium.fee + (plan === "premium" ? " · <b>your plan</b>" : "") +
      "</p></div>" +
      rows + (plan === "premium"
        ? '<p class="tiny muted" style="padding:10px 20px 14px">Want something made for your school? Tell ' + contact() + ", at your monthly visit or any time.</p>"
        : '<p class="tiny muted" style="padding:10px 20px 14px">To move to Premium, ask ' + contact() + " for a Premium key.</p>") + "</div>";
    return {
      html: html,
      mount: function () {
        var file = document.getElementById("licence-file");
        if (file) file.addEventListener("change", function () {
          var f = file.files && file.files[0];
          if (!f) return;
          var fr = new FileReader();
          fr.onload = function () { var ta = document.querySelector("form[data-submit=licence-apply] textarea"); if (ta) ta.value = String(fr.result || "").trim(); };
          fr.readAsText(f);
        });
        Array.prototype.forEach.call(document.querySelectorAll("[data-licence-feature]"), function (box) {
          box.addEventListener("change", function () {
            var id = box.getAttribute("data-licence-feature"), on = box.checked;
            if (id === "ai-marking") S().put("settings", Object.assign({}, S().get("settings", "ai") || {}, { id: "ai", enabled: on }));
            else {
              var rec = S().get("settings", "features") || { id: "features" };
              var map = Object.assign({}, rec.on || {}); map[id] = on;
              S().put("settings", Object.assign({}, rec, { id: "features", on: map }));
            }
            UI.toast(on ? "Turned on" + (id === "ai-marking" ? ". Save an AI key in Settings → AI marking if you haven't." : "") : "Turned off");
          });
        });
      },
    };
  };

  /** What a locked Premium feature shows instead of itself. */
  Lic.lockedHtml = function (id) {
    var f = FEATURES.filter(function (x) { return x.id === id; })[0] || { name: "This feature" }, st = Lic.status();
    return '<div class="card card-pad" style="max-width:760px"><h3>' + I("lock") + " " + esc(f.name) + " is part of School Assist Premium</h3>" +
      (f.about ? '<p class="muted small mt-sm">' + esc(f.about) + "</p>" : "") +
      '<p class="small mt">Your school is ' + (st.state === "trial" ? "not activated yet" : st.state === "expired" ? "on an expired licence" : "on the Standard plan") +
      '. See <a href="#/t/settings?s=licence">Plan &amp; licence</a> to change that.</p></div>';
  };

  /** Save a renewal for this school's key (asking first when someone pasted it). */
  function applyRenewal(r, ask) {
    var rec = S().get("settings", "licence"), cur = rec && rec.key ? read(rec.key) : null;
    if (!cur || !cur.ok) { if (ask) UI.toast("Enter the school's key first, then the renewal code.", "bad"); return Promise.resolve(false); }
    if (r.data.no !== cur.data.no) { if (ask) UI.toast("That renewal is for licence " + r.data.no + ", not this school's (" + cur.data.no + ").", "bad"); return Promise.resolve(false); }
    var before = withRenewal(cur.data, rec.renewal), after = withRenewal(cur.data, r.key);
    if (after.until === before.until && after.plan === before.plan) { if (ask) UI.toast("This school is already paid until " + longDate(before.until) + ".", "bad"); return Promise.resolve(false); }
    var plan = (PLANS[after.plan] || {}).name || after.plan;
    return (ask ? UI.confirm("Renew School Assist for " + cur.data.name + ": " + plan + " plan, paid until " + longDate(after.until) + "?", { ok: "Renew" }) : Promise.resolve(true)).then(function (ok) {
      if (!ok) return false;
      S().put("settings", Object.assign({}, rec, { renewal: r.key, renewedAt: Date.now() }));
      if (A.Sync && A.Sync.maybe) A.Sync.maybe();
      if (ask) UI.toast("Renewed: paid until " + longDate(after.until));
      else {
        var now = Date.now();
        S().filter("users", function (u) { return u.role === "teacher" && u.isAdmin && u.status !== "pending"; }).forEach(function (adm) {
          S().put("alerts", { id: "al_renewed_" + r.data.no + "_" + after.until + "_" + adm.id, teacherId: adm.id, kind: "feature", createdAt: now,
            title: "School Assist renewed: paid until " + longDate(after.until), body: "Thank you. The " + plan + " plan carries on with the same key." });
        });
      }
      A.render();
      return true;
    });
  }
  /** An admin's device online: has Golden Technologies published a renewal for this key? (Twice a day at most.) */
  var LAST_CHECK = "sca-licence-check";
  Lic.checkOnline = function (me) {
    if (!me || !me.isAdmin || !Lic.applies() || !navigator.onLine || typeof fetch !== "function") return;
    var feed = CFG.licenceFeed, rec = S().get("settings", "licence"), cur = rec && rec.key ? read(rec.key) : null;
    if (!feed || !cur || !cur.ok) return;
    var last = 0; try { last = Number(localStorage.getItem(LAST_CHECK)) || 0; } catch (e) { /* private mode */ }
    if (Date.now() - last < 12 * 3600000) return;
    try { localStorage.setItem(LAST_CHECK, String(Date.now())); } catch (e) { /* private mode */ }
    var base = feed.replace(/\/?$/, "/"), get = function (name) { return fetch(base + name, { cache: "no-store" }).then(function (res) { return res.ok ? res.json() : null; }); };
    // index.json lists the licences that have a renewal, so a key without one asks for nothing that isn't there
    return get("index.json")
      .then(function (index) { return index && index[cur.data.no] ? get(encodeURIComponent(cur.data.no) + ".json") : null; })
      .then(function (j) { var rr = j && j.renewal ? read(j.renewal) : null; return rr && rr.ok && rr.renewal ? applyRenewal(rr, false) : false; })
      .catch(function () { return false; });
  };

  A.act["licence-apply"] = function (form) {
    var text = form.key.value;
    if (!text.trim()) { UI.toast("Paste the key first", "bad"); return; }
    var r = read(text);
    if (!r.ok) { UI.toast(r.error, "bad"); return; }
    if (r.renewal) { applyRenewal(r, true); form.key.value = ""; return; }
    var d = r.data, b = A.Theme.get(), plan = (PLANS[d.plan] || {}).name || d.plan;
    if (r.master) {
      UI.confirm("Use Golden Technologies' temporary master key until " + longDate(d.until) + "? Every feature unlocks for " + b.name + ". Replace it with the school's own key when it arrives.", { ok: "Use it" }).then(function (ok) {
        if (!ok) return;
        var me = M.me();
        S().put("settings", { id: "licence", key: r.key, appliedAt: Date.now(), appliedBy: me ? me.id : null, master: true });
        form.key.value = "";
        if (A.Sync && A.Sync.maybe) A.Sync.maybe();
        UI.toast("Master key in use until " + longDate(d.until));
        A.render();
      });
      return;
    }
    UI.confirm("Activate School Assist for " + d.name + " on the " + plan + " plan, paid until " + longDate(d.until) + "?" +
      (b.name !== d.name ? " The school's name in the app becomes \"" + d.name + "\"." : ""), { ok: "Activate" }).then(function (ok) {
      if (!ok) return;
      var me = M.me(), was = S().get("settings", "licence");
      S().put("settings", { id: "licence", key: r.key, appliedAt: Date.now(), appliedBy: me ? me.id : null });
      var old = S().get("settings", "branding") || {};
      if (b.name !== d.name) S().put("settings", Object.assign({}, old, { id: "branding", name: d.name, shortName: old.shortName && old.shortName !== b.name ? old.shortName : d.name }));
      var sch = S().get("settings", "school"); // the school's own record follows the key (its name, and the abbreviation in student numbers)
      if (sch && (sch.name !== d.name || sch.abbr !== d.abbr)) S().put("settings", Object.assign({}, sch, { name: d.name, abbr: d.abbr }));
      // features already in the app when a school first activates are on this page; only later ones are announced
      if (!was || !was.key) {
        var rec = S().get("settings", "features") || { id: "features" };
        S().put("settings", Object.assign({}, rec, { id: "features", seen: FEATURES.filter(function (x) { return x.built; }).map(function (x) { return x.id; }) }));
      }
      form.key.value = "";
      if (A.Sync && A.Sync.maybe) A.Sync.maybe();
      A.Theme.apply();
      UI.toast("Activated: " + d.name + ", " + plan);
      A.render();
    });
  };
})(window.App);
