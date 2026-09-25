/**
 * YMU Mentoring — configuration and shared helpers.
 *
 * Everything you might want to change lives in CFG. Nothing below CFG needs
 * editing to get running.
 */

const CFG = {
  // ---- Program rules -------------------------------------------------
  schoolYearStart: 2026,          // the CALENDAR year the fall term starts in
  sessionMonths: [               // 7 sessions, October through April
    { n: 1, m: 10, y: 0, label: 'October'  },
    { n: 2, m: 11, y: 0, label: 'November' },
    { n: 3, m: 12, y: 0, label: 'December' },
    { n: 4, m: 1,  y: 1, label: 'January'  },
    { n: 5, m: 2,  y: 1, label: 'February' },
    { n: 6, m: 3,  y: 1, label: 'March'    },
    { n: 7, m: 4,  y: 1, label: 'April'    }
  ],
  sessionMinutes: 60,            // one hour per session
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  blocks: ['2:00','2:30','3:00','3:30','4:00','4:30','5:00','5:30'], // PM start times
  maxReschedules: 2,             // past this, the manager is alerted
  roomsPerSite: 1,              // one pair per site per time slot

  // ---- Collection cycles ------------------------------------------------
  // Availability is gathered two months at a time. A mentor is only ever
  // asked about the cycle in front of them.
  cycles: [
    { id: 'C1', collectFrom: '2026-09-23', dueBy: '2026-10-16', covers: [1, 2] }, // Oct, Nov
    { id: 'C2', collectFrom: '2026-11-02', dueBy: '2026-11-13', covers: [3, 4] }, // Dec, Jan
    { id: 'C3', collectFrom: '2027-01-04', dueBy: '2027-01-15', covers: [5, 6] }, // Feb, Mar
    { id: 'C4', collectFrom: '2027-03-01', dueBy: '2027-03-12', covers: [7]    }  // Apr
  ],
  carryForwardIfSilent: true,   // reuse last cycle's pattern when nobody replies

  // ---- Mentor intake ---------------------------------------------------
  suggestCount: 3,               // how many nearby schools to put forward
  maxSitePrefs: 5,               // how many they may choose in total
  minSlotsPerMonth: 2,           // every month needs this many offered times, per school
  encourageSlots: 6,             // what we ask for per month — more choice, better matching
  // A reschedule has to leave the mentee real choice, so this many usable
  // one-hour slots must remain besides the one being moved.
  minAlternativesToReschedule: 2,

  // ---- Reminder cadence ----------------------------------------------
  remindDaysBefore: 7,           // "one week before"
  nudgeWithinDays: 21,           // start chasing unbooked sessions this close to month end
  renudgeEveryDays: 7,           // then chase again this often
  chaseCloseoutAfterDays: 1,     // days after a session before asking how it went
  feedbackMinutesBeforeEnd: 5,   // form goes out this long before a session finishes

  // ---- People ---------------------------------------------------------
  coordinatorEmail: 'afterschool@ymu.org',
  coordinatorName: 'YMU Afterschool',
  managerDigest: true,           // daily summary email to the coordinator

  // ---- Automation safety ----------------------------------------------
  // Nothing automated goes out while this is true. The daily job still runs
  // and still reports what it WOULD have sent, so you can watch the system
  // work against real data without anyone receiving anything.
  automationPaused: false,
  dailyHour: 6,                  // 24h, in CFG.tz. 6 means the 6am run.

  // ---- Plumbing -------------------------------------------------------
  calendarName: 'YMU Mentoring', // a dedicated calendar, created on setup
  tz: 'America/New_York',
  // The deployed web app. Used to talk to the script itself.
  webAppUrl: 'https://script.google.com/macros/s/AKfycbyHufj8WmvfVsRzhCirXimjUM0T-JKtPYYyxFJU93UUYjDm6CvfALCZagwIBdDw9o0N/exec',

  // What goes in EMAILS. These are the stable public addresses, which forward
  // to whatever webAppUrl currently is. Google issues a new /exec URL on every
  // new deployment, so linking straight to it would break every link already
  // sitting in a mentor's or a family's inbox. Change docs/config.js instead.
  publicMentorUrl:  'https://afterschool-ymu.github.io/ymu-mentoring/mentor/',
  publicStudentUrl: 'https://afterschool-ymu.github.io/ymu-mentoring/student/',
  feedbackFormUrl: ''            // only needed if you use your own form instead
};

const TABS = ['Sites', 'Closures', 'Mentors', 'Availability', 'CycleLog', 'Mentees',
              'Pairs', 'Sessions', 'Templates', 'Feedback', 'Log'];

const HEADERS = {
  Sites:   ['site_id','name','address','staff_email','hours','lat','lng','active'],
  Mentors: ['mentor_id','name','email','phone','grade','school','instruments',
            'skill_level','guardian1_name','guardian1_email','guardian2_name',
            'guardian2_email','travel_from','travel_kind','travel_lat','travel_lng',
            'site_prefs','intake_done','last_intake_nudge','active',
            // Appended last on purpose: setCell_ maps fields to columns by
            // position, so inserting anywhere else would shift live data.
            'access_token'],
  // One row per specific date+time a mentor can do, at a specific school.
  Availability: ['mentor_id','site_id','date','time','added'],
  // Days no session may be scheduled. Blank site_id = district-wide.
  Closures: ['date','reason','site_id','source'],
  Mentees: ['mentee_id','name','student_email','guardian_email','guardian_phone',
            'instrument','skill_level','site_id','access_token','usual_day',
            'usual_time','active'],
  // One row per mentor per cycle: were they asked, did they update, did we carry it.
  CycleLog: ['mentor_id','cycle_id','prompted_on','updated_on','carried_on','short_warned_on'],
  // Every automated message, editable by the manager.
  Templates: ['key','label','audience','when_it_sends','frequency','enabled','subject','body'],
  // Feedback responses, matched back to a session.
  Feedback: ['received','session_id','from_role','from_name','rating','progress',
             'worked_on','concerns','raw'],
  Pairs:   ['pair_id','mentor_id','mentee_id','instrument','site_id','approved','notes'],
  Sessions:['session_id','pair_id','session_no','month','date','time','status',
            'reschedules','event_id','invite_sent','remind_week','remind_day',
            'remind_dayof','last_nudge','closeout_asked','feedback_sent','happened',
            'minutes','worked_on','follow_up','picked_by','notes'],
  Log:     ['when','what','detail']
};

/* ====================================================================
   Sheet access
   ==================================================================== */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('Missing tab "' + name + '". Run setupWorkbook first.');
  return s;
}

/** Reads a whole tab as an array of plain objects keyed by header name. */
function readTab_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i].every(function (c) { return c === '' || c === null; })) continue;
    const o = { _row: i + 1 };
    head.forEach(function (h, j) { if (h) o[h] = values[i][j]; });
    rows.push(o);
  }
  return rows;
}

/** Writes one field back to one row. */
function setCell_(tabName, row, field, value) {
  const sh = sheet_(tabName);
  const col = HEADERS[tabName].indexOf(field) + 1;
  if (col < 1) throw new Error('No column "' + field + '" on ' + tabName);
  sh.getRange(row, col).setValue(value);
}

function appendRow_(tabName, obj) {
  const sh = sheet_(tabName);
  sh.appendRow(HEADERS[tabName].map(function (h) {
    return obj[h] === undefined ? '' : obj[h];
  }));
}

function log_(what, detail) {
  try {
    sheet_('Log').appendRow([new Date(), what, detail || '']);
  } catch (e) { /* logging must never break a run */ }
}

/**
 * Shows a dialog when a person is driving the sheet, and quietly logs when
 * nobody is — these functions can also be called from a trigger or a test,
 * where SpreadsheetApp.getUi() throws.
 */
function notify_(message) {
  log_('Notice', String(message).replace(/\n+/g, ' ').slice(0, 300));
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) { /* no UI attached — the log line above is the record */ }
}

function uid_(prefix) {
  // 12 hex characters, not 8 — these ids are the only link between tabs, so a
  // collision would silently attach a session to the wrong pair.
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

/* ====================================================================
   Dates — all comparisons use yyyy-MM-dd strings to dodge timezone bugs
   ==================================================================== */

function todayIso_() {
  return Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM-dd');
}

function isoParts_(iso) {
  const p = String(iso).split('-').map(Number);
  return { y: p[0], m: p[1], d: p[2] };
}

/** Whole days from isoA to isoB. Negative means isoB is in the past. */
function daysBetween_(isoA, isoB) {
  const a = isoParts_(isoA), b = isoParts_(isoB);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86400000);
}

/** Mon=0 … Sun=6 for a yyyy-MM-dd string. */
function weekdayIndex_(iso) {
  const p = isoParts_(iso);
  return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}

function prettyDate_(iso) {
  if (!iso) return '';
  const p = isoParts_(iso);
  return Utilities.formatDate(new Date(p.y, p.m - 1, p.d), CFG.tz, 'EEE d MMM yyyy');
}

/** "3:30 PM" -> {h:15, min:30} */
function parseClock_(txt) {
  const m = String(txt).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[3] || 'PM').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return { h: h, min: min };
}

/** Combines a date string and a time label into a real Date in CFG.tz. */
function toDate_(iso, timeLabel) {
  const p = isoParts_(iso);
  const c = parseClock_(timeLabel) || { h: 15, min: 0 };
  return new Date(p.y, p.m - 1, p.d, c.h, c.min, 0);
}

/* ====================================================================
   Site hours
   Stored human-readably in the sheet, e.g.
     "Tue 3:10-5:10; Wed 2:00-4:00"
     "Mon-Fri 3:00-6:00; Wed 2:00-6:00"
   Later segments override earlier ones for the same day.
   ==================================================================== */

function parseHours_(text) {
  const out = {};
  if (!text) return out;
  String(text).split(/[;\n]+/).forEach(function (seg) {
    seg = seg.trim();
    if (!seg) return;
    const m = seg.match(/^([A-Za-z]{3})\s*(?:-\s*([A-Za-z]{3}))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) { log_('Could not read hours segment', seg); return; }
    const from = CFG.days.indexOf(titleCase_(m[1]));
    const to = m[2] ? CFG.days.indexOf(titleCase_(m[2])) : from;
    if (from < 0 || to < 0) { log_('Unknown weekday in hours', seg); return; }
    const s = parseClock_(m[3]), e = parseClock_(m[4]);
    if (!s || !e) { log_('Unknown time in hours', seg); return; }
    for (let i = from; i <= to; i++) {
      out[CFG.days[i]] = [s.h + s.min / 60, e.h + e.min / 60];
    }
  });
  return out;
}

function titleCase_(s) {
  return s.charAt(0).toUpperCase() + s.slice(1, 3).toLowerCase();
}

/** Which 30-minute blocks fit inside a site's window on a given weekday. */
function openBlocksOn_(site, dayIndex) {
  const hours = parseHours_(site.hours);
  const w = hours[CFG.days[dayIndex]];
  if (!w) return [];
  return CFG.blocks.filter(function (b) {
    const c = parseClock_(b);
    const start = c.h + c.min / 60;
    return start >= w[0] - 1e-9 && start + CFG.sessionMinutes / 60 <= w[1] + 1e-9;
  });
}

/* ====================================================================
   Lookups
   ==================================================================== */

function byId_(rows, idField, id) {
  for (let i = 0; i < rows.length; i++) if (rows[i][idField] === id) return rows[i];
  return null;
}

function getSite_(id)   { return byId_(readTab_('Sites'), 'site_id', id) || {}; }
function getMentor_(id) { return byId_(readTab_('Mentors'), 'mentor_id', id) || {}; }
function getMentee_(id) { return byId_(readTab_('Mentees'), 'mentee_id', id) || {}; }
function getPair_(id)   { return byId_(readTab_('Pairs'), 'pair_id', id) || {}; }

function monthInfo_(n) {
  for (let i = 0; i < CFG.sessionMonths.length; i++) {
    if (CFG.sessionMonths[i].n === Number(n)) return CFG.sessionMonths[i];
  }
  return null;
}

/**
 * Everyone who should be on a session's calendar invite and emails.
 * Both students are minors, so a parent and an adult are always included.
 */
function recipients_(pair) {
  const mentor = getMentor_(pair.mentor_id);
  const mentee = getMentee_(pair.mentee_id);
  const site   = getSite_(pair.site_id);
  const list = [
    mentor.email,
    mentor.guardian1_email,
    mentor.guardian2_email,
    mentee.guardian_email,
    site.staff_email,
    CFG.coordinatorEmail
  ];
  const seen = {}, out = [];
  list.forEach(function (e) {
    e = String(e || '').trim();
    if (!e || !/@/.test(e) || seen[e.toLowerCase()]) return;
    seen[e.toLowerCase()] = true;
    out.push(e);
  });
  return out;
}

function missingContacts_(pair) {
  const mentor = getMentor_(pair.mentor_id);
  const mentee = getMentee_(pair.mentee_id);
  const site   = getSite_(pair.site_id);
  const gaps = [];
  if (!mentor.email) gaps.push('mentor email');
  if (!mentor.guardian1_email) gaps.push("mentor's guardian email");
  if (!mentee.guardian_email) gaps.push('mentee guardian email');
  if (!site.staff_email) gaps.push('site staff email');
  return gaps;
}
