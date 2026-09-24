/**
 * YMU Mentoring — one-time setup, data import, and the menu.
 *
 * Run setupWorkbook() once. Then use the "YMU Mentoring" menu in the sheet.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('YMU Mentoring')
    .addItem('1. Set up workbook', 'setupWorkbook')
    .addItem('2. Load the 12 school sites', 'loadSites')
    .addItem('3. Load the ambassadors', 'loadMentors')
    .addItem('4. Locate the schools (for distance)', 'geocodeSites')
    .addItem('5. Load the school-year calendar', 'loadClosures')
    .addItem('6. Load the message templates', 'loadTemplates')
    .addItem('7. Create the feedback form', 'createFeedbackForm')
    .addItem('8. Import from the HTML tool…', 'showImportDialog')
    .addSeparator()
    .addItem('Create missing sessions', 'ensureSessions')
    .addItem('Create mentor links', 'issueMentorTokens')
    .addItem('Email mentors their links', 'emailMentorLinks')
    .addItem('Show all links (do not send)', 'showAllLinks')
    .addItem('Create student booking links', 'issueMenteeTokens')
    .addItem('Email students their links', 'emailMenteeLinks')
    .addSeparator()
    .addItem('Install automation', 'installTriggers')
    .addItem('Run the daily job now (test)', 'dailyTick')
    .addItem('Send due feedback forms now (test)', 'feedbackTick')
    .addSeparator()
    .addItem('Show the message schedule', 'showMessageSchedule')
    .addItem('Where is each cycle up to?', 'cycleReport')
    .addItem('Who still owes their availability?', 'intakeReport')
    .addItem('Feedback so far', 'feedbackSummary')
    .addItem('Check my email quota', 'checkQuota')
    .addToUi();
}

/** Creates every tab with the right headers, and the calendar. */
function setupWorkbook() {
  const ss = ss_();
  TABS.forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length)
      .setValues([HEADERS[name]])
      .setFontWeight('bold')
      .setBackground('#f1f3f4');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, HEADERS[name].length);
  });
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  getOrCreateCalendar_();
  ss.setSpreadsheetTimeZone(CFG.tz);
  loadTemplates();

  log_('Setup', 'Workbook and calendar ready');
  notify_(
    'Workbook ready.\n\nNext: menu → "Load the 12 school sites", then "Load the ambassadors".\n\n' +
    'Calendar "' + CFG.calendarName + '" is created and all invites will go on it.');
}

function getOrCreateCalendar_() {
  const found = CalendarApp.getCalendarsByName(CFG.calendarName);
  if (found && found.length) return found[0];
  const cal = CalendarApp.createCalendar(CFG.calendarName, {
    summary: 'One-on-one mentoring sessions between Student Ambassadors and afterschool students.',
    timeZone: CFG.tz
  });
  log_('Setup', 'Created calendar ' + CFG.calendarName);
  return cal;
}

function calendarId_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('calendarId');
  if (id) return id;
  id = getOrCreateCalendar_().getId();
  props.setProperty('calendarId', id);
  return id;
}

/* ====================================================================
   Reference data — the verified school sites
   Addresses confirmed against official MDCPS school sites, the district
   feeder-pattern listings, and the federal NCES/CCD directory.
   ==================================================================== */

const SITES_SEED = [
  ["Young Men's Preparatory Academy", '3001 NW 2nd Ave, Miami, FL 33127', '',
   'Tue 2:15-5:30; Wed 2:15-5:30; Thu 2:15-5:30'],
  ['Dr. Henry W. Mack / West Little River K-8 Center', '2450 NW 84th St, Miami, FL 33147', '',
   'Mon-Fri 3:00-6:00; Wed 2:00-6:00'],
  ['Carol City Middle School', '3737 NW 188th St, Miami Gardens, FL 33055', '',
   'Tue 4:00-6:00; Thu 4:00-6:00'],
  ['Miami Carol City Senior High School', '3301 Miami Gardens Dr, Miami Gardens, FL 33056', '',
   ''],   // hours not on the roster — mentors see no options until you add them
  ['Miami Beach Nautilus Middle School', '4301 N Michigan Ave, Miami Beach, FL 33140', '',
   'Tue 4:00-6:00; Thu 4:00-6:00'],
  ['Miami Beach Fienberg/Fisher K-8 Center', '1424 Drexel Ave, Miami Beach, FL 33139', '',
   'Tue 3:10-5:10; Wed 2:00-4:00; Thu 3:10-5:10'],
  ['Miami Beach Senior High School', '2231 Prairie Ave, Miami Beach, FL 33139', '',
   'Mon-Thu 2:30-5:30'],
  ['Coral Gables Senior High School', '450 Bird Rd, Coral Gables, FL 33146', '',
   'Fri 2:30-4:30'],
  ['Miami Northwestern Senior High School', '1100 NW 71st St, Miami, FL 33150', '',
   'Mon-Fri 2:30-5:00'],
  ['Henry E. S. Reeves K-8 Center', '2005 NW 111th St, Miami, FL 33167', '',
   'Tue 3:00-5:30; Wed 3:00-5:30; Thu 3:00-5:30'],
  ['Miami Central Senior High School', '1781 NW 95th St, Miami, FL 33147', '', ''],
  ['Booker T. Washington Senior High School', '1200 NW 6th Ave, Miami, FL 33136', '', '']
];

function loadSites() {
  const have = {};
  readTab_('Sites').forEach(function (s) { have[s.name] = true; });
  let added = 0;
  SITES_SEED.forEach(function (r) {
    if (have[r[0]]) return;
    appendRow_('Sites', {
      site_id: uid_('site'), name: r[0], address: r[1],
      staff_email: r[2], hours: r[3], active: true
    });
    added++;
  });
  const noHours = SITES_SEED.filter(function (r) { return !r[3]; }).length;
  notify_(
    added + ' sites added.\n\n' + noHours + ' of them have no program hours yet ' +
    '(Miami Carol City Senior, Miami Central, Booker T. Washington). Mentors at those ' +
    'sites will see no date options until you fill the "hours" column.\n\n' +
    'Format: "Tue 3:10-5:10; Wed 2:00-4:00" or "Mon-Fri 3:00-6:00".\n\n' +
    'Also worth adding: a staff_email for each site, so the site is on every invite.');
}

/* ====================================================================
   Reference data — the Student Ambassadors
   skill_level is inferred from grade and should be reviewed.
   ==================================================================== */

/* ====================================================================
   Reference data — the Student Ambassadors

   The real roster is NOT in this file and NOT in git: it is names, phone
   numbers and emails of minors and their parents.

   It lives in a separate script file named `Roster` holding one const:
       const MENTORS_SEED = [ [name, instruments, phone, email, grade,
                               school, g1name, g1email, g2name, g2email], ... ];

   Your copy is in  private/Roster.gs  (gitignored).
   The shape is documented in  apps-script/Roster.example.gs.
   Apps Script has no modules, so that top-level const is visible here.
   ==================================================================== */


/** "5 Voice, 5 Guitar, 2 Keys" — counted from the roster, never hardcoded. */
function instrumentTally_(seed) {
  const n = {};
  seed.forEach(function (r) { n[r[1]] = (n[r[1]] || 0) + 1; });
  return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || a.localeCompare(b); })
    .map(function (k) { return n[k] + ' ' + k; }).join(', ');
}

/**
 * Instrument is the one non-negotiable matching rule, so a programme whose
 * students play something no ambassador plays fails silently, every cycle.
 * This says so out loud at load time.
 */
function missingInstruments_(seed) {
  const have = {};
  seed.forEach(function (r) { have[String(r[1]).toLowerCase()] = true; });
  const wanted = ['Trumpet', 'Saxophone', 'Trombone', 'Violin'];
  const gaps = wanted.filter(function (w) { return !have[w.toLowerCase()]; });
  if (!gaps.length) return 'Every instrument the Jazz and Marching programmes need is covered.';
  return 'No ' + gaps.join(', ') + ' — Jazz and Marching Band students cannot be matched ' +
         'until you recruit for those, because instrument must match exactly.';
}

function gradeToLevel_(grade) {
  return ['Alumni', '12th', '11th'].indexOf(String(grade)) >= 0 ? 'Advanced' : 'Intermediate';
}

function loadMentors() {
  const have = {};
  readTab_('Mentors').forEach(function (m) { have[m.name] = true; });
  let added = 0;
  const seed = (typeof MENTORS_SEED !== 'undefined' && MENTORS_SEED) ? MENTORS_SEED : [];
  if (!seed.length) {
    notify_('No roster found.\n\n' +
      'The ambassador list is deliberately not in the code. Paste your ' +
      'private/Roster.gs into Apps Script as a SCRIPT file named "Roster", ' +
      'then run this again.');
    return;
  }
  seed.forEach(function (r) {
    if (have[r[0]]) return;
    appendRow_('Mentors', {
      mentor_id: uid_('mtr'), name: r[0], email: r[3], phone: r[2],
      grade: r[4], school: r[5], instruments: r[1],
      skill_level: gradeToLevel_(r[4]),
      guardian1_name: r[6], guardian1_email: r[7],
      guardian2_name: r[8], guardian2_email: r[9],
      site_prefs: '', active: true
    });
    added++;
  });
  notify_(
    added + ' ambassadors added.\n\n' +
    'Three need a decision before you pair them:\n' +
    '• Juan Romero is Alumni — if 18 or over he needs a background check and is not a peer mentor.\n' +
    '• Gabriel Bello-Diaz is in 8th grade — confirm he is mentoring, not being mentored.\n' +
    '• Gabriella Cimring — the roster spelled it "Cirming"; her email says Cimring.\n\n' +
    'Also: skill_level is inferred from grade. Review it.\n\n' +
    'Coverage: ' + seed.length + ' ambassadors — ' + instrumentTally_(seed) + '.\n' +
    missingInstruments_(seed));
}

/* ====================================================================
   Mentor access links

   Google only tells a web app who the visitor is when that visitor is in
   the same Workspace domain as the script owner. Ambassadors are on gmail,
   icloud and school addresses, so for them the address arrives blank and
   sign-in can never identify them. A private link carries the identity
   instead, exactly as it already does for students.
   ==================================================================== */

function mentorLink_(mentor) {
  if (!CFG.webAppUrl || !mentor.access_token) return '';
  return CFG.webAppUrl + '?m=' + mentor.access_token;
}

/** Creates a link for any mentor missing one. Safe to run again. */
function issueMentorTokens() {
  let made = 0;
  readTab_('Mentors').forEach(function (m) {
    if (m.access_token) return;
    setCell_('Mentors', m._row, 'access_token',
      Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
    made++;
  });
  log_('Tokens', 'Issued ' + made + ' mentor links');
  notify_(made + ' mentor links created.\n\n' +
    'Each ambassador now has an access_token on the Mentors tab. Their link is:\n\n' +
    (CFG.webAppUrl || '<your web app URL>') + '?m=THEIR_TOKEN\n\n' +
    'Use menu -> "Email mentors their links" to send them.\n\n' +
    'Treat these like passwords: the link is all somebody needs to act as that ' +
    'ambassador. It shows no student contact details.');
  return made;
}

/** Sends every active mentor their own link, with a parent copied in. */
function emailMentorLinks() {
  const rows = readTab_('Mentors').filter(function (m) {
    return (m.active === true || m.active === 'TRUE') && m.access_token && m.email;
  });
  if (!CFG.webAppUrl) { notify_('Set CFG.webAppUrl first.'); return 0; }

  let sent = 0, skipped = [];
  rows.forEach(function (m) {
    const to = [m.email, m.guardian1_email, m.guardian2_email]
      .filter(function (x) { return x && /@/.test(x); });
    if (!to.length) { skipped.push(m.name); return; }
    MailApp.sendEmail({
      to: to.join(','), name: CFG.coordinatorName,
      subject: 'Your YMU mentoring link',
      htmlBody: shell_(
        '<p>Hi ' + String(m.name).split(' ')[0] + ',</p>' +
        '<p>This is your own link for YMU mentoring. It is how you tell us which ' +
        'schools you can get to and when you are free.</p>' +
        '<p><a href="' + mentorLink_(m) + '" style="background:#3b4cca;color:#fff;' +
        'padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block;' +
        'font-weight:600">Open my page</a></p>' +
        '<p style="color:#6b7280;font-size:13px">This link is personal to you — please ' +
        'do not forward it. No sign-in needed; it works on a phone. If you lose it, ' +
        'just ask us for a new one.</p>' +
        '<p style="color:#6b7280;font-size:13px">Questions: ' +
        '<a href="mailto:' + CFG.coordinatorEmail + '">' + CFG.coordinatorEmail + '</a></p>')
    });
    sent++;
  });
  log_('Tokens', 'Emailed ' + sent + ' mentor links');
  notify_(sent + ' mentors emailed their link.' +
    (skipped.length ? '\n\nNo address on file for: ' + skipped.join(', ') : ''));
  return sent;
}

/**
 * Every link, on screen, sending nothing.
 *
 * For checking the links yourself before any of them reach a family. The
 * links are credentials, so this opens in a dialog rather than writing them
 * to a tab where they would sit in the file for good.
 */
function showAllLinks() {
  if (!CFG.webAppUrl) { notify_('Set CFG.webAppUrl in Config first.'); return; }

  function rowsFor(tab, tokenParam, emailField) {
    return readTab_(tab)
      .filter(function (r) { return (r.active === true || r.active === 'TRUE') && r.access_token; })
      .map(function (r) {
        return {
          name: r.name,
          who: r[emailField] || '(no address on file)',
          url: CFG.webAppUrl + '?' + tokenParam + '=' + r.access_token
        };
      });
  }

  const mentors = rowsFor('Mentors', 'm', 'email');
  const mentees = rowsFor('Mentees', 'token', 'guardian_email');

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function table(title, list, note) {
    if (!list.length) {
      return '<h3>' + esc(title) + '</h3><p class=none>Nobody yet. ' + esc(note) + '</p>';
    }
    return '<h3>' + esc(title) + ' <span class=n>' + list.length + '</span></h3>' +
      list.map(function (r) {
        return '<div class=row><div class=nm>' + esc(r.name) + '</div>' +
          '<div class=em>' + esc(r.who) + '</div>' +
          '<input readonly value="' + esc(r.url) + '" onclick="this.select()">' +
          '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">Test</a></div>';
      }).join('');
  }

  const html =
    '<style>' +
    'body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'margin:0;padding:16px;color:#16181d}' +
    'h3{font-size:14px;margin:18px 0 8px}h3:first-of-type{margin-top:4px}' +
    '.n{color:#6b7280;font-weight:400}' +
    '.warn{background:#fdecea;color:#b3261e;border-radius:8px;padding:11px 13px;margin:0 0 14px}' +
    '.row{display:grid;grid-template-columns:1fr 1fr 2.4fr auto;gap:8px;align-items:center;' +
    'padding:6px 0;border-bottom:1px solid #eee}' +
    '.nm{font-weight:600}.em{color:#6b7280;font-size:12px;overflow:hidden;text-overflow:ellipsis}' +
    'input{width:100%;font:11px ui-monospace,Menlo,monospace;padding:6px 7px;' +
    'border:1px solid #e3e6ea;border-radius:6px;background:#f6f7f9}' +
    'a{font-size:12px;font-weight:600;color:#3b4cca;text-decoration:none;white-space:nowrap}' +
    '.none{color:#6b7280}' +
    '</style>' +
    '<div class=warn><b>These links are passwords.</b> Anyone holding one can act as ' +
    'that person. Nothing has been emailed — use the menu when you are ready.</div>' +
    table('Mentors', mentors, 'Run "Create mentor links" first.') +
    table('Students', mentees, 'Add students to the Mentees tab, then run "Create student booking links".');

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(900).setHeight(600),
    'All access links — nothing sent');
}

/* ====================================================================
   Import from the single-file HTML tool
   Paste the JSON from its "Save / Load" tab.
   ==================================================================== */

function showImportDialog() {
  const html = HtmlService.createHtmlOutput(
    '<div style="font:13px -apple-system,sans-serif;padding:12px">' +
    '<p>Paste the JSON from the HTML tool’s <b>Save / Load</b> tab.</p>' +
    '<textarea id="j" style="width:100%;height:220px;font-family:monospace;font-size:11px"></textarea>' +
    '<p><button onclick="go()" style="padding:8px 14px">Import</button> ' +
    '<span id="s" style="color:#666"></span></p>' +
    '<script>function go(){document.getElementById("s").textContent="Working…";' +
    'google.script.run.withSuccessHandler(function(m){document.getElementById("s").textContent=m;})' +
    '.withFailureHandler(function(e){document.getElementById("s").textContent="Error: "+e.message;})' +
    '.importFromJson(document.getElementById("j").value);}<\/script></div>')
    .setWidth(560).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import from the HTML tool');
}

function importFromJson(jsonText) {
  const data = JSON.parse(jsonText);
  const map = {};   // old id -> new id
  let counts = { sites: 0, mentors: 0, mentees: 0, pairs: 0 };

  (data.locations || []).forEach(function (l) {
    const id = uid_('site');
    map[l.id] = id;
    appendRow_('Sites', {
      site_id: id, name: l.name, address: l.address || '',
      staff_email: l.staffEmail || '', hours: slotsToHours_(l.openSlots || []),
      active: l.active !== false
    });
    counts.sites++;
  });

  (data.mentors || []).forEach(function (m) {
    const id = uid_('mtr');
    map[m.id] = id;
    const g = m.guardians || [];
    appendRow_('Mentors', {
      mentor_id: id, name: m.name, email: m.contact || '', phone: m.phone || '',
      grade: m.grade || '', school: m.school || '',
      instruments: (m.instruments || []).join(', '),
      skill_level: m.skillLevel || '',
      guardian1_name: (g[0] || {}).name || '', guardian1_email: (g[0] || {}).email || '',
      guardian2_name: (g[1] || {}).name || '', guardian2_email: (g[1] || {}).email || '',
      site_prefs: (m.locationPrefs || []).map(function (x) { return map[x] || ''; }).join(', '),
      active: m.active !== false
    });
    counts.mentors++;
  });

  (data.mentees || []).forEach(function (m) {
    const id = uid_('mte');
    map[m.id] = id;
    appendRow_('Mentees', {
      mentee_id: id, name: m.name, guardian_email: m.contact || '',
      guardian_phone: m.phone || '', instrument: m.instrument || '',
      skill_level: m.skillLevel || '', site_id: map[m.homeLocation] || '',
      active: m.active !== false
    });
    counts.mentees++;
  });

  (data.pairs || []).filter(function (p) { return p.approved; }).forEach(function (p) {
    const id = uid_('pair');
    appendRow_('Pairs', {
      pair_id: id, mentor_id: map[p.mentorId] || '', mentee_id: map[p.menteeId] || '',
      instrument: p.instrument || '', site_id: map[p.locationId] || '',
      approved: true, notes: (p.flags || []).join(' | ')
    });
    counts.pairs++;
  });

  ensureSessions();
  log_('Import', JSON.stringify(counts));
  return 'Imported ' + counts.sites + ' sites, ' + counts.mentors + ' mentors, ' +
         counts.mentees + ' mentees, ' + counts.pairs + ' pairs. Sessions created.';
}

/** Turns the HTML tool's slot keys back into readable hours text. */
function slotsToHours_(openSlots) {
  const byDay = {};
  openSlots.forEach(function (k) {
    const parts = String(k).split('-').map(Number);
    (byDay[parts[0]] = byDay[parts[0]] || []).push(parts[1]);
  });
  return Object.keys(byDay).sort().map(function (di) {
    const bs = byDay[di].sort(function (a, b) { return a - b; });
    const first = parseClock_(CFG.blocks[bs[0]]);
    const last = parseClock_(CFG.blocks[bs[bs.length - 1]]);
    const endMin = last.h * 60 + last.min + CFG.sessionMinutes;
    const pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return CFG.days[di] + ' ' + (first.h - 12) + ':' + pad(first.min) +
           '-' + (Math.floor(endMin / 60) - 12) + ':' + pad(endMin % 60);
  }).join('; ');
}

/* ====================================================================
   Triggers
   ==================================================================== */

/**
 * Three triggers, and no more. Apps Script allows 20 per script, so anything
 * per-session would fall over immediately.
 *
 *   dailyTick        6am daily — reminders, chasing, cycle rollover, your digest
 *   feedbackTick     every 15 min — the form, a few minutes before a session ends
 *   onFeedbackSubmit on form submit — files the answers against the session
 */
function installTriggers() {
  const wanted = ['dailyTick', 'feedbackTick', 'onFeedbackSubmit'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (wanted.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('dailyTick').timeBased().atHour(6).everyDays(1)
    .inTimezone(CFG.tz).create();

  ScriptApp.newTrigger('feedbackTick').timeBased().everyMinutes(15).create();

  let formNote = '';
  const formId = PropertiesService.getScriptProperties().getProperty('feedbackFormId');
  if (formId) {
    try {
      ScriptApp.newTrigger('onFeedbackSubmit')
        .forForm(FormApp.openById(formId)).onFormSubmit().create();
      formNote = '\n\nForm responses will file themselves against the right session.';
    } catch (err) {
      formNote = '\n\nCould not attach the form trigger: ' + err.message;
    }
  } else {
    formNote = '\n\nNo feedback form yet — run "Create the feedback form" first, ' +
               'then install automation again to attach it.';
  }

  log_('Setup', 'Triggers installed');
  notify_(
    'Automation installed.\n\n' +
    '• Daily at 6am — reminders, chasing, cycle rollover, and your summary email\n' +
    '• Every 15 minutes — checks whether a session is finishing and sends the ' +
    'feedback form ' + CFG.feedbackMinutesBeforeEnd + ' minutes before the end' +
    formNote);
}

/** Emails each student (and their guardian) their private booking link. */
function emailMenteeLinks() {
  if (!CFG.webAppUrl) {
    notify_('Set webAppUrl in Config.gs first — the links are built from it.');
    return 0;
  }
  let sent = 0, skipped = [];
  readTab_('Mentees').forEach(function (m) {
    if (m.active !== true && m.active !== 'TRUE') return;
    if (!m.access_token) { skipped.push(m.name + ' (no link yet)'); return; }
    const to = [m.guardian_email, m.student_email]
      .filter(function (e) { return e && /@/.test(e); });
    if (!to.length) { skipped.push(m.name + ' (no email)'); return; }

    const pair = readTab_('Pairs').filter(function (p) {
      return p.mentee_id === m.mentee_id && (p.approved === true || p.approved === 'TRUE');
    })[0];
    const mentorName = pair ? getMentor_(pair.mentor_id).name : '';

    MailApp.sendEmail({
      to: to.join(','), cc: CFG.coordinatorEmail,
      subject: 'Pick your music mentoring times, ' + String(m.name).split(' ')[0],
      name: CFG.coordinatorName,
      htmlBody: shell_(
        '<p>Hello,</p>' +
        '<p>' + m.name + ' is taking part in one-on-one music mentoring this year' +
        (mentorName ? ' with Student Ambassador <b>' + mentorName + '</b>' : '') + '.</p>' +
        '<p>Use this private link to see when the mentor is free and pick the times ' +
        'that suit you. There is nothing to sign into:</p>' +
        '<p><a href="' + menteeLink_(m) + '" style="background:#9a3412;color:#fff;' +
        'padding:11px 19px;border-radius:8px;text-decoration:none;display:inline-block">' +
        'Choose your times</a></p>' +
        '<p style="color:#6b7280;font-size:13px">Keep this link private — it opens ' +
        m.name + "'s sessions. If you would rather sign in with a Google account, " +
        'reply and tell us which address to use.</p>')
    });
    sent++;
  });
  notify_(sent + ' student links emailed.' +
    (skipped.length ? '\n\nSkipped: ' + skipped.join(', ') : ''));
  return sent;
}

/** Where every mentor stands on the current cycle. */
function cycleReport() {
  const cycle = activeCycle_();
  if (!cycle) { notify_('The school year is over — no cycle is open.'); return; }
  const months = cycleMonths_(cycle).map(function (m) { return m.label; }).join(' and ');
  const rows = readTab_('Mentors').filter(function (m) {
    return m.active === true || m.active === 'TRUE';
  });

  const done = [], todo = [];
  rows.forEach(function (m) {
    const st = intakeStatus(m.mentor_id, cycle);
    if (!st.hasSites) { todo.push('• ' + m.name + ' — has not chosen schools yet'); return; }
    if (st.complete) { done.push(m.name); return; }
    const detail = st.perSite.map(function (p) {
      return p.name.split(' ').slice(0, 3).join(' ') + ' [' +
        (p.counts || []).map(function (c) { return c.label.slice(0, 3) + ':' + c.count; }).join(' ') + ']';
    }).join('  ');
    const lg = cycleLogFor_(m.mentor_id, cycle.id) || {};
    todo.push('• ' + m.name + ' — ' + detail +
      (lg.carried_on ? '  (carried forward ' + lg.carried_on + ')' : '') +
      (lg.prompted_on ? '  (asked ' + lg.prompted_on + ')' : ''));
  });

  const left = daysBetween_(todayIso_(), cycle.dueBy);
  notify_(
    'CYCLE ' + cycle.id + ' — ' + months + '\n' +
    'Due ' + prettyDate_(cycle.dueBy) +
      (left < 0 ? ' (' + Math.abs(left) + ' days ago)' : ' (in ' + left + ' days)') + '\n\n' +
    done.length + ' of ' + rows.length + ' ready: ' + (done.join(', ') || 'none yet') + '\n\n' +
    (todo.length ? 'Still needed:\n' + todo.join('\n') : 'Everybody is ready.') + '\n\n' +
    'Each mentor only ever needs ' + CFG.minSlotsPerMonth + ' times per month for ' +
    'this cycle — never the whole year.');
}

/** Confirms what this account is actually allowed to send. */
function checkQuota() {
  const left = MailApp.getRemainingDailyQuota();
  notify_(
    'This account can still send ' + left + ' email recipients today.\n\n' +
    'Google Workspace normally allows 1,500/day; a personal gmail account allows 100. ' +
    'At 100 pairs this system averages well under 100 a day, so anything at or above ' +
    'the Workspace figure is plenty of headroom.');
}


/** Who has not finished the availability form yet. */
function intakeReport() {
  const rows = readTab_('Mentors').filter(function (m) {
    return m.active === true || m.active === 'TRUE';
  });
  const done = [], todo = [];
  rows.forEach(function (m) {
    const st = intakeStatus(m.mentor_id);
    if (st.complete) { done.push(m.name); return; }
    let stage = !st.hasAddress ? 'no address yet'
              : !st.hasSites ? 'no schools chosen'
              : st.perSite.filter(function (p) { return !p.ok; })
                  .map(function (p) { return p.name + ' (' + p.count + ' slots)'; }).join(', ');
    todo.push('• ' + m.name + ' — ' + stage);
  });
  const left = daysBetween_(todayIso_(), CFG.intakeDeadline);
  notify_(
    done.length + ' of ' + rows.length + ' ambassadors have finished their availability.\n\n' +
    (todo.length ? 'Still outstanding:\n' + todo.join('\n') + '\n\n' : '') +
    'Deadline ' + prettyDate_(CFG.intakeDeadline) +
    (left < 0 ? ' — ' + Math.abs(left) + ' days ago.' : ' — ' + left + ' days away.'));
}
