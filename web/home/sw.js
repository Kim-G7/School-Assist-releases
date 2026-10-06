/* Service worker: keeps the whole app available offline once it has been opened.
   Bump VERSION whenever you change any file so devices pick up the update. */
var VERSION = "classroom-v21-home-mux5lmfs";
var FILES = [
  "./", "index.html", "school.config.js", "manifest.webmanifest", "css/app.css", "assets/icon.svg",
  "fonts/inter-latin-400-normal.woff2", "fonts/inter-latin-500-normal.woff2", "fonts/inter-latin-600-normal.woff2", "fonts/inter-latin-700-normal.woff2",
  "js/util.js", "js/theme.js", "js/store.js", "js/cloud.js", "js/model.js", "js/ui.js", "js/seed-syllabi.js", "js/seed.js", "js/app.js", "js/screen.js",
  "js/devices.js", "js/alerts.js", "js/timetable.js", "js/materials.js", "js/papers.js", "js/pdfview.js", "js/paperscan.js", "js/sitpaper.js", "js/marker.js", "js/pad.js", "js/sitqs.js", "js/subjects.js", "js/notescan.js", "js/tutor.js", "js/sylread.js", "js/tutoradmin.js", "js/primary.js", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "js/teacher.js", "js/student.js", "js/exam.js", "js/syllabus.js", "js/staff.js", "js/school.js", "js/updates.js", "js/settings.js", "js/sync.js",
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.indexOf("/api/") === 0) return;
  // Network first (so updates arrive when online), cache as the offline fallback.
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
    })
  );
});
