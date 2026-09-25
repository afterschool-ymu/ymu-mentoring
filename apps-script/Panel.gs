/**
 * YMU Mentoring — the coordinator's panel.
 *
 * One screen answering the questions a spreadsheet makes you assemble by
 * hand: who has not filled in their form, who could be paired with whom,
 * which sessions have no time yet, and what data is missing that will bite
 * later. The Sheet stays the database and stays the place to fix anything
 * by typing in a cell; this is the view on top of it.
 *
 * Reached at ?panel=TOKEN with a token that is not any mentor's or student's,
 * so a leaked booking link can never open it.
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
  const param = CFG.publicPanelUrl ? 'token' : 'panel';
  return base + '?' + param + '=' + coordinatorToken_();
}

/** Menu: shows the link, and offers to start over if it ever leaks. */
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
    '<div class="warn">This link is yours alone and opens everything. It is not a ' +
    'mentor or student token, so a forwarded booking link can never reach it. ' +
    'If it does get out, run <b>Reset the panel link</b> from the menu.</div>';

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
  const isOn = function (r) { return r.active === true || r.active === 'TRUE'; };

  const mentors = readTab_('Mentors').filter(isOn);
  const mentees = readTab_('Mentees').filter(isOn);
  const sites   = readTab_('Sites').filter(isOn);
  const pairs   = readTab_('Pairs').filter(function (p) {
    return p.approved === true || p.approved === 'TRUE';
  });
  const sessions = readTab_('Sessions');

  // ---- Where each mentor has got to -------------------------------------
  const intake = mentors.map(function (m) {
    const st = intakeStatus(m.mentor_id, cycle);
    const offered = availabilityFor(m.mentor_id, null).filter(function (a) {
      return months.some(function (mo) { return String(a.date).indexOf(mo.prefix) === 0; });
    }).length;

    let stage = 'not started';
    if (st.complete) stage = 'done';
    else if (offered) stage = 'picking times';
    else if (st.hasSites) stage = 'chose schools';
    else if (st.hasAddress) stage = 'gave address';

    return {
      id: m.mentor_id, name: m.name, plays: m.instruments,
      stage: stage, offered: offered,
      schools: (st.prefs || []).map(function (id) { return getSite_(id).name || id; }),
      nudged: m.last_intake_nudge ? String(m.last_intake_nudge).slice(0, 10) : '',
      paired: pairs.some(function (p) { return p.mentor_id === m.mentor_id; })
    };
  }).sort(function (a, b) {
    const order = { 'done': 0, 'picking times': 1, 'chose schools': 2,
                    'gave address': 3, 'not started': 4 };
    return order[a.stage] - order[b.stage] || String(a.name).localeCompare(String(b.name));
  });

  // ---- Sessions worth looking at ----------------------------------------
  const upcoming = sessions.filter(function (s) {
    const d = isoOf_(s.date);
    return d && daysBetween_(today, d) >= 0 &&
           ['scheduled', 'rescheduled'].indexOf(s.status) >= 0;
  }).sort(function (a, b) {
    return String(isoOf_(a.date)).localeCompare(String(isoOf_(b.date)));
  }).slice(0, 12).map(function (s) {
    const pair = getPair_(s.pair_id);
    return {
      when: prettyDate_(isoOf_(s.date)) + ' at ' + s.time,
      away: daysBetween_(today, isoOf_(s.date)),
      mentee: getMentee_(pair.mentee_id).name || '?',
      mentor: getMentor_(pair.mentor_id).name || '?',
      site: getSite_(pair.site_id).name || '?',
      month: s.month
    };
  });

  const unbooked = sessions.filter(function (s) {
    return s.status === 'unscheduled';
  }).map(function (s) {
    const pair = getPair_(s.pair_id);
    return {
      month: s.month, no: Number(s.session_no),
      mentee: getMentee_(pair.mentee_id).name || '(pair deleted)',
      mentor: getMentor_(pair.mentor_id).name || '(pair deleted)',
      orphan: !pair.pair_id
    };
  }).sort(function (a, b) { return a.no - b.no; });

  // ---- The things that quietly break a month ----------------------------
  const gaps = [];
  const noStaff = sites.filter(function (s) { return !String(s.staff_email || '').trim(); });
  if (noStaff.length) {
    gaps.push({ level: 'bad', what: noStaff.length + ' of ' + sites.length +
      ' schools have no staff_email',
      why: 'That address goes on every calendar invitation and is who the day-of ' +
           'coverage check asks. Without it no adult at the school is told anything.' });
  }
  const noHours = sites.filter(function (s) { return !String(s.hours || '').trim(); });
  if (noHours.length) {
    gaps.push({ level: 'bad', what: noHours.length + ' schools have no programme hours: ' +
      noHours.map(function (s) { return s.name; }).join(', '),
      why: 'Those schools do not appear at all in a mentor’s form, so nobody can ' +
           'choose them.' });
  }
  const orphans = sessions.filter(function (s) { return !getPair_(s.pair_id).pair_id; });
  if (orphans.length) {
    gaps.push({ level: 'bad', what: orphans.length + ' sessions point at a pair that no ' +
      'longer exists',
      why: 'Delete those rows on the Sessions tab. The daily job will try to process ' +
           'them once they have a date.' });
  }
  pairs.forEach(function (p) {
    const missing = missingContacts_(p);
    if (missing.length) {
      gaps.push({ level: 'warn',
        what: (getMentee_(p.mentee_id).name || '?') + ' + ' +
              (getMentor_(p.mentor_id).name || '?') + ' — missing ' + missing.join(', '),
        why: 'Anyone missing here is silently left off invitations and reminders.' });
    }
  });
  const uncovered = {};
  mentees.forEach(function (m) {
    const any = mentors.some(function (mt) {
      return String(mt.instruments || '').split(',').map(function (x) { return x.trim(); })
        .indexOf(String(m.instrument).trim()) >= 0;
    });
    if (!any) uncovered[m.instrument] = (uncovered[m.instrument] || 0) + 1;
  });
  Object.keys(uncovered).forEach(function (inst) {
    gaps.push({ level: 'warn',
      what: uncovered[inst] + ' student(s) play ' + inst + ' and no ambassador does',
      why: 'Instrument is the one rule that cannot bend, so these can never be paired.' });
  });

  // ---- Feedback ----------------------------------------------------------
  const fb = readTab_('Feedback');
  const concerns = fb.filter(function (f) { return String(f.concerns || '').trim(); })
    .slice(-5).map(function (f) {
      return { who: f.from_name || f.from_role || '?', what: f.concerns,
               when: f.received ? String(f.received).slice(0, 10) : '' };
    });

  const proposals = buildProposals_();

  return {
    ok: true,
    today: prettyDate_(today),
    cycle: {
      id: cycle.id,
      months: months.map(function (m) { return m.label; }).join(' and '),
      due: prettyDate_(cycle.dueBy),
      daysLeft: daysBetween_(today, cycle.dueBy)
    },
    paused: automationIsPaused_(),
    stats: {
      mentors: mentors.length,
      done: intake.filter(function (m) { return m.stage === 'done'; }).length,
      started: intake.filter(function (m) {
        return m.stage !== 'done' && m.stage !== 'not started'; }).length,
      mentees: mentees.length,
      pairs: pairs.length,
      booked: sessions.filter(function (s) {
        return ['scheduled', 'rescheduled'].indexOf(s.status) >= 0; }).length,
      unbooked: unbooked.length
    },
    intake: intake,
    proposals: proposals.proposals,
    unmatched: proposals.unmatched,
    upcoming: upcoming,
    unbooked: unbooked.slice(0, 15),
    gaps: gaps,
    concerns: concerns
  };
}

/** Approving from the panel. The token is checked again here, not trusted. */
function apiPanelApprove(token, picks) {
  if (!token || token !== coordinatorToken_()) {
    return { ok: false, message: 'Not authorised.' };
  }
  const message = approvePairs(picks);
  return { ok: true, message: message, data: panelData_(token) };
}

/** Refresh without reloading the page. */
function apiPanelRefresh(token) {
  const d = panelData_(token);
  return d.error ? { ok: false, message: 'Not authorised.' } : { ok: true, data: d };
}
