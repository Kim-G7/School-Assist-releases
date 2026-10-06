/**
 * ============================================================================
 *  SCHOOL BRANDING & SETTINGS: the one file each school edits
 * ============================================================================
 *
 *  Change the values below, save, and refresh the app. Nothing else needs to
 *  be touched. Admin teachers can also change the name, colours, logo, class
 *  structure and timetable from inside the app (Settings). Those changes
 *  override this file and are shared to other devices through sync.
 *
 *  COLOURS: any CSS hex colour. The app works out every shade, hover state
 *  and readable text colour from these two automatically, in both light and
 *  dark mode, so even a bright yellow or pale blue stays legible.
 *
 *  LOGO: put your crest in the /assets folder and set `logo` to its path,
 *  e.g. "assets/crest.png". PNG, JPG, SVG and WebP all work. Leave it as ""
 *  to use the built-in crest drawn from your school initials and colours.
 */
window.SCHOOL_CONFIG = {
  name: "Greenfield High School",
  shortName: "Greenfield",
  motto: "Knowledge · Integrity · Excellence",

  logo: "", // e.g. "assets/crest.png"; "" = auto crest from initials + colours

  colors: {
    primary: "#1D4E89", // main brand colour: sidebar, buttons, headings
    secondary: "#E8A317", // accent: highlights, active states, badges
  },

  // "light" | "dark" | "system". Each user can still switch in the app.
  defaultTheme: "light",

  academicYear: "2026",
  term: "Term 3",
  terms: ["Term 1", "Term 2", "Term 3"],

  /* How the school separates classes. The streams can be letters (4A, 4B),
     colours (Form 4 Blue), animals (Form 4 Lion) or any names you like. */
  structure: {
    levelLabel: "Form", // "Form" | "Grade" | "Year"
    levels: ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Form 6"],
    streamStyle: "letters", // "letters" | "colours" | "animals" | "custom"
    streams: ["A", "B", "C"],
  },

  exam: {
    passMark: 50, // % needed to pass a test
    topicMasteryMark: 60, // % on a topic's practice quiz to count it as "completed"
    strongTopicMark: 70, // ≥ this % in a test = "concept you're good at"
  },

  /* Copy check: a written answer that is 90%+ the same words as the marking
     scheme counts as "identical". If this share of a student's written answers
     is identical, the paper is flagged. Each teacher can change it in Settings. */
  integrity: { copyThreshold: 50 },

  /* Full screen: every device opens School Assist full screen, like a kiosk.
     studentLock keeps students there (no exit or minimise button, F11 does nothing).
     Admins can change this in Settings → Appearance. */
  screen: { studentLock: true },

  /* The home edition: a copy for revising at home, for example on a USB stick. It starts with
     one admin and one student instead of the demo school, with every syllabus topic open.
     Build it with `npm run build:home`. The admin can rename both accounts in Settings → People. */
  home: {
    school: { name: "Home Study", shortName: "Home Study", motto: "Revise a little every day" },
    admin: { name: "Admin", title: "Admin", pin: "1234" },
    student: { name: "Student", studentNo: "HOME-001", level: "Form 4" },
    /* Online: students register for the next ID (HOME-001, HOME-002, ...), the admin approves
       them, and new notes and files reach everyone. The key is the public "publishable" key.
       Remove this line to keep the home edition offline-only (one admin, one student). */
    cloud: { url: "https://fogaebrxusaazguqohph.supabase.co", key: "sb_publishable_PuDfq50X8CibZ-uEvJ1qbA_QbZFQajK" },
  },

  // Exam boards and education levels offered as drop-downs when creating a syllabus: high school only for now.
  boards: ["ZIMSEC", "Cambridge", "Oxford AQA", "Pearson Edexcel", "AQA", "OCR", "International Baccalaureate", "School-based"],
  educationLevels: [
    "Form 1", "Form 2", "O-Level", "A-Level", "AS Level",
    "Cambridge Lower Secondary", "IGCSE", "AS & A Level", "International GCSE", "GCSE",
    "IB Middle Years", "IB Diploma",
  ],

  lessonTypes: ["Theory", "Discussion", "Practical", "Mock test"],

  // Teacher sign-in PIN for the demo accounts. Change or remove before real use.
  demoPin: "1234",
  // Students sign in with their student ID and a password they create the first time.
  minPasswordLength: 6,
  // Show the example student account on the sign-in screen (turn off for real use).
  showExampleStudent: true,
};

// Built by `npm run web:home`: this copy is the online home edition.
window.SCHOOL_CONFIG.edition = "home";
