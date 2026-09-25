/**
 * YMU Mentoring — the coordinator's panel.
 *
 * Every tab of the spreadsheet, read back as something you can actually work
 * from: who has done what, who could pair with whom, what is booked, what is
 * missing. The Sheet stays the database and stays where you fix things by
 * typing in a cell. This is the view on top.
 *
 * Reached at ?panel=TOKEN with a token that belongs to no mentor and no
 * student, so a forwarded booking link can never open it.
 */

const PANEL_KEY = 'coordinatorToken';

function coordinatorToken_() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty(PANEL_KEY);
  if (!t) {
    t = 'co_' + Utilities.getUuid().replace(/-/g, '') +
        Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty(PANEL_KEY, t);
    log_('Panel', 'Coordinator token created');
  }
  return t;
}

function panelLink_() {
  const base = CFG.publicPanelUrl || CFG.webAppUrl;
  if (!base) return '';
  return base + '?' + (CFG.publicPanelUrl ? 'token' : 'panel') + '=' + coordinatorToken_();
}

function showPanelLink() {
  const ui = SpreadsheetApp.getUi();
  const link = panelLink_();
  if (!link) { notify_('Set publicPanelUrl or webAppUrl in Config first.'); return; }
  const html =
    '<style>body{font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'margin:0;padding:18px;color:#16181d}' +
    'input{width:100%;font:11.5px ui-monospace,Menlo,monospace;padding:9px;' +
    'border:1px solid #e3e6ea;border-radius:7px;background:#f6f7f9;margin:8px 0}' +
    'a.go{display:inline-block;background:#3b4cca;color:#fff;text-decoration:none;' +
    'font-weight:600;padding:10px 18px;border-radius:8px}' +
    '.warn{background:#fdf3e0;color:#9a6200;border-radius:8px;padding:11px 13px;margin:12px 0 0}' +
    '</style>' +
    '<p><b>Your panel link.</b> Bookmark it — it does not change.</p>' +
    '<input readonly value="' + link.replace(/"/g, '&quot;') + '" onclick="this.select()">' +
    '<p><a class="go" href="' + link + '" target="_blank" rel="noopener">Open the panel</a></p>' +
    '<div class="warn">This link is yours alone and opens everything. It is not a mentor ' +
    'or student token, so a forwarded booking link can never reach it. If it does get ' +
    'out, run <b>Reset the panel link</b>.</div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(620).setHeight(330),
                     'Coordination panel');
}

function resetPanelLink() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Reset the panel link?',
      'The current link stops working immediately and a new one is issued.\n\nGo ahead?',
      ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteProperty(PANEL_KEY);
  log_('Panel', 'Coordinator token reset');
  showPanelLink();
}

/* ====================================================================
   Everything the panel shows, in one call
   ==================================================================== */

function panelData_(token) {
  if (!token || token !== coordinatorToken_()) return { error: 'denied' };

  const today = todayIso_();
  const cycle = activeCycle_();
  const months = cycleMonths_(cycle);
  const on = function (r) { return r.active === true || r.active === 'TRUE'; };

  const mentorRows = readTab_('Mentors');
  const menteeRows = readTab_('Mentees');
  const siteRows   = readTab_('Sites');
  const allPairs   = readTab_('Pairs');
  const sessions   = readTab_('Sessions');
  const pairs = allPairs.filter(function (p) {
    return p.approved === true || p.approved === 'TRUE';
  });

  const siteName = function (id) { return getSite_(id).name || ''; };
  const inCycle = function (iso) {
    return months.some(function (m) { return String(iso).indexOf(m.prefix) === 0; });
  };

  /* ---- Ambassadors ------------------------------------------------------ */
  const mentors = mentorRows.filter(on).map(function (m) {
    const st = intakeStatus(m.mentor_id, cycle);
    const mine = availabilityFor(m.mentor_id, null);
    const offered = mine.filter(function (a) { return inCycle(a.date); });
    const pair = pairs.filter(function (p) { return p.mentor_id === m.mentor_id; })[0];

    let stage = 'not started';
    if (st.complete) stage = 'done';
    else if (offered.length) stage = 'picking times';
    else if (st.hasSites) stage = 'chose schools';
    else if (st.hasAddress) stage = 'gave address';

    const perMonth = months.map(function (mo) {
      return { label: mo.label,
               n: offered.filter(function (a) { return a.date.indexOf(mo.prefix) === 0; }).length };
    });

    return {
      id: m.mentor_id, name: m.name, plays: m.instruments, level: m.skill_level,
      grade: m.grade, school: m.school, email: m.email, phone: m.phone,
      guardian: m.guardian1_name, guardianEmail: m.guardian1_email,
      travel: m.travel_from, stage: stage, offered: offered.length, perMonth: perMonth,
      schools: (st.prefs || []).map(siteName),
      nudged: m.last_intake_nudge ? String(m.last_intake_nudge).slice(0, 10) : '',
      link: mentorLink_(m),
      pairedWith: pair ? (getMentee_(pair.mentee_id).name || '') : ''
    };
  }).sort(function (a, b) {
    const rank = { 'done': 0, 'picking times': 1, 'chose schools': 2,
                   'gave address': 3, 'not started': 4 };
    return rank[a.stage] - rank[b.stage] || String(a.name).localeCompare(String(b.name));
  });

  /* ---- Students --------------------------------------------------------- */
  const mentees = menteeRows.filter(on).map(function (m) {
    const pair = pairs.filter(function (p) { return p.mentee_id === m.mentee_id; })[0];
    const mySessions = pair
      ? sessions.filter(function (s) { return s.pair_id === pair.pair_id; }) : [];
    return {
      id: m.mentee_id, name: m.name, plays: m.instrument, level: m.skill_level,
      site: siteName(m.site_id), guardianEmail: m.guardian_email,
      studentEmail: m.student_email, phone: m.guardian_phone,
      usual: m.usual_day ? (m.usual_day + ' ' + m.usual_time) : '',
      link: menteeLink_(m),
      mentor: pair ? (getMentor_(pair.mentor_id).name || '') : '',
      booked: mySessions.filter(function (s) {
        return ['scheduled', 'rescheduled'].indexOf(s.status) >= 0; }).length,
      total: mySessions.length
    };
  }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

  /* ---- Schools ---------------------------------------------------------- */
  const sites = siteRows.filter(on).map(function (s) {
    return {
      id: s.site_id, name: s.name, address: s.address,
      staffEmail: s.staff_email || '', hours: readableHours_(s) || '',
      located: !!(s.lat && s.lng),
      mentors: mentors.filter(function (m) { return m.schools.indexOf(s.name) >= 0; }).length,
      students: mentees.filter(function (m) { return m.site === s.name; }).length
    };
  }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

  /* ---- Sessions --------------------------------------------------------- */
  const allSessions = sessions.map(function (s) {
    const pair = getPair_(s.pair_id);
    const iso = isoOf_(s.date);
    return {
      id: s.session_id, no: Number(s.session_no), month: s.month,
      date: iso || '', pretty: iso ? prettyDate_(iso) : '', time: s.time || '',
      status: s.status, away: iso ? daysBetween_(today, iso) : null,
      moved: Number(s.reschedules || 0),
      mentee: pair.pair_id ? (getMentee_(pair.mentee_id).name || '?') : '',
      mentor: pair.pair_id ? (getMentor_(pair.mentor_id).name || '?') : '',
      site: pair.pair_id ? siteName(pair.site_id) : '',
      orphan: !pair.pair_id,
      happened: s.happened || '', workedOn: s.worked_on || '', followUp: s.follow_up || ''
    };
  }).sort(function (a, b) {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.no - b.no;
  });

  /* ---- Messages --------------------------------------------------------- */
  let templates = [];
  try {
    templates = readTab_('Templates').map(function (t) {
      return { key: t.key, label: t.label, audience: t.audience,
               when: t.when_it_sends, frequency: t.frequency,
               on: t.enabled === true || t.enabled === 'TRUE',
               subject: t.subject };
    });
  } catch (e) { /* tab not made yet */ }

  /* ---- Feedback --------------------------------------------------------- */
  let feedback = [], avg = null;
  try {
    const rows = readTab_('Feedback');
    feedback = rows.slice(-25).reverse().map(function (f) {
      return { when: f.received ? String(f.received).slice(0, 10) : '',
               who: f.from_name || '', role: f.from_role || '',
               rating: f.rating || '', progress: f.progress || '',
               workedOn: f.worked_on || '', concerns: f.concerns || '' };
    });
    const nums = function (k) {
      return rows.map(function (f) { return Number(f[k]); })
                 .filter(function (n) { return n > 0; });
    };
    const mean = function (a) {
      return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 10) / 10 : null;
    };
    avg = { rating: mean(nums('rating')), progress: mean(nums('progress')), count: rows.length };
  } catch (e) { /* not made yet */ }

  /* ---- What quietly breaks a month -------------------------------------- */
  const gaps = [];
  const noStaff = sites.filter(function (s) { return !s.staffEmail.trim(); });
  if (noStaff.length) gaps.push({ level: 'bad', tab: 'schools',
    what: noStaff.length + ' of ' + sites.length + ' schools have no staff email',
    why: 'That address goes on every calendar invitation and is who the day-of coverage ' +
         'check asks. Without it, no adult at the school is told anything.' });
  const noHours = sites.filter(function (s) { return !s.hours.trim(); });
  if (noHours.length) gaps.push({ level: 'bad', tab: 'schools',
    what: noHours.length + ' schools have no programme hours: ' +
          noHours.map(function (s) { return s.name; }).join(', '),
    why: 'They do not appear at all in a mentor’s form, so nobody can choose them.' });
  const orphans = allSessions.filter(function (s) { return s.orphan; });
  if (orphans.length) gaps.push({ level: 'bad', tab: 'sessions',
    what: orphans.length + ' sessions point at a pair that no longer exists',
    why: 'Delete those rows on the Sessions tab before they get a date.' });
  pairs.forEach(function (p) {
    const missing = missingContacts_(p);
    if (missing.length) gaps.push({ level: 'warn', tab: 'students',
      what: (getMentee_(p.mentee_id).name || '?') + ' + ' +
            (getMentor_(p.mentor_id).name || '?') + ' — missing ' + missing.join(', '),
      why: 'Anyone missing here is silently left off invitations and reminders.' });
  });
  const uncovered = {};
  mentees.forEach(function (m) {
    const covered = mentors.some(function (mt) {
      return String(mt.plays || '').split(',').map(function (x) { return x.trim(); })
        .indexOf(String(m.plays).trim()) >= 0;
    });
    if (!covered) uncovered[m.plays] = (uncovered[m.plays] || 0) + 1;
  });
  Object.keys(uncovered).forEach(function (inst) {
    gaps.push({ level: 'warn', tab: 'matching',
      what: uncovered[inst] + ' student(s) play ' + inst + ' and no ambassador does',
      why: 'Instrument is the one rule that cannot bend, so these can never be paired.' });
  });

  /* ---- Activity --------------------------------------------------------- */
  let activity = [];
  try {
    activity = readTab_('Log').slice(-60).reverse().map(function (l) {
      return { when: l.when ? Utilities.formatDate(new Date(l.when), CFG.tz, 'd MMM HH:mm') : '',
               what: l.what || '', detail: String(l.detail || '').slice(0, 220) };
    });
  } catch (e) { /* none yet */ }

  const proposals = buildProposals_();
  const booked = allSessions.filter(function (s) {
    return ['scheduled', 'rescheduled'].indexOf(s.status) >= 0; });

  return {
    ok: true,
    today: prettyDate_(today),
    paused: automationIsPaused_(),
    cycle: {
      id: cycle.id,
      months: months.map(function (m) { return m.label; }).join(' and '),
      due: prettyDate_(cycle.dueBy),
      daysLeft: daysBetween_(today, cycle.dueBy),
      minPerMonth: CFG.minSlotsPerMonth, encourage: CFG.encourageSlots
    },
    rules: {
      sessionMinutes: CFG.sessionMinutes, maxReschedules: CFG.maxReschedules,
      remindDays: (CFG.remindDaysBefore || []).join(', '),
      chaseDays: (CFG.intakeChaseDays || []).map(function (d) {
        return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]; }).join(', '),
      dailyHour: CFG.dailyHour,
      cycles: CFG.cycles.map(function (c) {
        return { id: c.id, from: prettyDate_(c.collectFrom), due: prettyDate_(c.dueBy),
                 months: cycleMonths_(c).map(function (m) { return m.label; }).join(', ') };
      })
    },
    stats: {
      mentors: mentors.length,
      done: mentors.filter(function (m) { return m.stage === 'done'; }).length,
      started: mentors.filter(function (m) {
        return m.stage !== 'done' && m.stage !== 'not started'; }).length,
      mentees: mentees.length, pairs: pairs.length,
      booked: booked.length,
      unbooked: allSessions.filter(function (s) { return s.status === 'unscheduled'; }).length,
      offered: mentors.reduce(function (n, m) { return n + m.offered; }, 0),
      schools: sites.length
    },
    mentors: mentors, mentees: mentees, sites: sites, sessions: allSessions,
    templates: templates, feedback: feedback, feedbackAvg: avg,
    activity: activity, gaps: gaps,
    proposals: proposals.proposals, unmatched: proposals.unmatched, idle: proposals.idle
  };
}

/** Approving from the panel. The token is re-checked; the page is not trusted. */
function apiPanelApprove(token, picks) {
  if (!token || token !== coordinatorToken_()) return { ok: false, message: 'Not authorised.' };
  const message = approvePairs(picks);
  return { ok: true, message: message, data: panelData_(token) };
}

function apiPanelRefresh(token) {
  const d = panelData_(token);
  return d.error ? { ok: false, message: 'Not authorised.' } : { ok: true, data: d };
}
