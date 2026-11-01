/* Service worker: keeps the whole app available offline once it has been opened, and opens it from this device.
   Bump VERSION whenever you change any file: the new list is fetched and the next opening shows it. The PDF viewer
   (vendor/pdfjs, 1.5 MB) is not fetched up front: it is kept the first time a PDF opens. */
var VERSION = "classroom-v52";
var FILES = [
  "./", "index.html", "school.config.js", "manifest.webmanifest", "css/app.css", "assets/icon.svg", "assets/icon-180.png", "assets/icon-192.png", "assets/icon-512.png",
  "fonts/inter-latin-400-normal.woff2", "fonts/inter-latin-500-normal.woff2", "fonts/inter-latin-600-normal.woff2", "fonts/inter-latin-700-normal.woff2",
  "js/util.js", "js/secret.js", "js/theme.js", "js/store.js", "js/cloud.js", "js/install.js", "js/model.js", "js/ui.js", "js/seed-syllabi.js", "js/seed.js", "js/app.js", "js/screen.js",
  "js/devices.js", "js/alerts.js", "js/notices.js", "js/vacation.js", "js/timetable.js", "js/materials.js", "js/papers.js", "js/pdfview.js", "js/paperscan.js", "js/sitpaper.js", "js/marker.js", "js/pad.js", "js/sitqs.js", "js/subjects.js", "js/notescan.js", "js/tutor.js", "js/sylread.js", "js/tutoradmin.js", "js/primary.js", "js/tracker.js", "js/teacher.js", "js/student.js", "js/exam.js", "js/syllabus.js", "js/staff.js", "js/school.js", "js/licence-key.js", "js/licence.js", "js/setup.js", "js/backup.js", "js/reportcards.js", "js/updates.js", "js/settings.js", "js/sync.js",
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
  // (the app for every school: a school's own is /s/<code>/api/…)
  if (e.request.method !== "GET" || url.origin !== location.origin || /(^|\/)api\//.test(url.pathname)) return;
  // The app opens from this device at once, even on a slow connection, and each file is refreshed from the hub in the
  // background (an unchanged file costs a 304, no body): an update shows the next time the app is opened. A file not
  // kept yet (the PDF viewer, the first time a PDF opens) comes from the network and is kept for next time.
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (res) { if (res.ok) c.put(e.request, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net.catch(function () { return c.match("index.html"); });
    });
  }));
});
