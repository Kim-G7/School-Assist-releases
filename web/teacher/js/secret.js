/* Scrambled passwords and PINs (A.Secret).
 *
 * A password or PIN is never stored as itself: only "pbkdf2-sha256$<rounds>$<salt>$<hash>" (PBKDF2 with HMAC-SHA-256,
 * a random 16-byte salt, 20,000 rounds). Checking one hashes what was typed with the same salt and compares.
 * The school hub checks them the same way with Node's crypto (server.cjs), and the two give identical results.
 *
 * Written in plain JavaScript because tablets open School Assist from the hub over http://, where the browser's
 * own crypto (crypto.subtle) is switched off. crypto.getRandomValues still works there, for the salt. */
(function (A) {
  "use strict";
  var ROUNDS = 20000;
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var W = new Int32Array(64);

  /** One SHA-256 block: the state H (8 words) moves on by the 16 words in M. */
  function compress(H, M) {
    var i, x, y;
    for (i = 0; i < 16; i++) W[i] = M[i];
    for (i = 16; i < 64; i++) {
      x = W[i - 15]; y = W[i - 2];
      W[i] = (W[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      var t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  /** SHA-256 of `bytes`, carrying on from state H after `before` bytes were already hashed into it. */
  function hashFrom(H, bytes, before) {
    var len = bytes.length, total = ((len + 9 + 63) >> 6) << 6, buf = new Uint8Array(total), M = new Int32Array(16), bits = (len + before) * 8;
    buf.set(bytes); buf[len] = 0x80;
    for (var i = 0; i < 4; i++) buf[total - 1 - i] = (bits / Math.pow(2, 8 * i)) & 255;
    var hi = Math.floor(bits / 4294967296);
    for (i = 0; i < 4; i++) buf[total - 5 - i] = (hi >>> (8 * i)) & 255;
    for (var off = 0; off < total; off += 64) {
      for (var j = 0; j < 16; j++) M[j] = (buf[off + 4 * j] << 24) | (buf[off + 4 * j + 1] << 16) | (buf[off + 4 * j + 2] << 8) | buf[off + 4 * j + 3];
      compress(H, M);
    }
    return H;
  }
  function wordsToBytes(H) { var out = new Uint8Array(32); for (var i = 0; i < 8; i++) { out[4 * i] = H[i] >>> 24; out[4 * i + 1] = (H[i] >>> 16) & 255; out[4 * i + 2] = (H[i] >>> 8) & 255; out[4 * i + 3] = H[i] & 255; } return out; }
  function sha256(bytes) { return wordsToBytes(hashFrom(new Int32Array(IV), bytes, 0)); }

  /** PBKDF2-HMAC-SHA-256, 32 bytes out. Each round is two SHA-256 blocks from the precomputed key states. */
  function pbkdf2(pass, salt, rounds) {
    var key = pass.length > 64 ? sha256(pass) : pass, k = new Uint8Array(64), ip = new Uint8Array(64), op = new Uint8Array(64), M = new Int32Array(16);
    k.set(key);
    for (var i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    var load = function (b) { for (var j = 0; j < 16; j++) M[j] = (b[4 * j] << 24) | (b[4 * j + 1] << 16) | (b[4 * j + 2] << 8) | b[4 * j + 3]; };
    var inner = new Int32Array(IV), outer = new Int32Array(IV);
    load(ip); compress(inner, M); load(op); compress(outer, M);
    // U1 = HMAC(pass, salt || 00 00 00 01)
    var msg = new Uint8Array(salt.length + 4); msg.set(salt); msg[salt.length + 3] = 1;
    var u = hashFrom(new Int32Array(inner), msg, 64);
    u = hashFrom(new Int32Array(outer), wordsToBytes(u), 64);
    var t = new Int32Array(u), H = new Int32Array(8), B = new Int32Array(16);
    B[8] = 0x80000000; B[15] = (64 + 32) * 8; // one block: 32 bytes of message after the 64-byte key block
    for (var r = 1; r < rounds; r++) {
      for (i = 0; i < 8; i++) { B[i] = u[i]; H[i] = inner[i]; }
      compress(H, B);
      for (i = 0; i < 8; i++) { B[i] = H[i]; u[i] = outer[i]; }
      compress(u, B);
      for (i = 0; i < 8; i++) t[i] ^= u[i];
    }
    return wordsToBytes(t);
  }

  function utf8(s) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(String(s));
    var b = unescape(encodeURIComponent(String(s))), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  function b64(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), out = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }

  var Secret = (A.Secret = {
    ROUNDS: ROUNDS,
    /** "pbkdf2-sha256$20000$<salt>$<hash>" for a password or PIN. */
    hash: function (secret) {
      var salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      return "pbkdf2-sha256$" + ROUNDS + "$" + b64(salt) + "$" + b64(pbkdf2(utf8(secret), salt, ROUNDS));
    },
    /** Does `secret` match the stored hash? (Compares every byte, so timing says nothing.) */
    verify: function (secret, stored) {
      var p = String(stored || "").split("$");
      if (p.length !== 4 || p[0] !== "pbkdf2-sha256") return false;
      var rounds = Number(p[1]);
      if (!(rounds >= 1000 && rounds <= 1000000)) return false;
      var want = unb64(p[3]), got = pbkdf2(utf8(secret), unb64(p[2]), rounds), diff = want.length ^ got.length;
      for (var i = 0; i < want.length && i < got.length; i++) diff |= want[i] ^ got[i];
      return diff === 0;
    },
    isHash: function (s) { return /^pbkdf2-sha256\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(String(s || "")); },
    _test: { sha256: sha256, pbkdf2: pbkdf2, utf8: utf8 },
  });
})(window.App);
