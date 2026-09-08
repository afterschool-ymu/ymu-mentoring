/**
 * YMU Mentoring — the mentor booking page.
 *
 * Deployed as a web app with "Execute as: Me" and "Who has access: Anyone
 * with a Google account". Google handles the sign-in, so
 * Session.getActiveUser().getEmail() tells us which mentor is looking —
 * no passwords, no accounts to create, no way to see anyone else's student.
 *
 * If a mentor's Google address differs from the one on the roster, add it in
 * the "email" column or give them a second row; matching is on email only.
 */

/**
 * One URL, two audiences.
 *
 *   ?token=…            a student's private link  → student page
 *   ?as=student         force the student page (for testing)
 *   signed-in mentor    → mentor page
 *   signed-in student or guardian → student page
 *
 * Mentors are checked first: a mentor should never land on the student page by
 * accident, and no student address is on the mentor roster.
 */
function doGet(e) {
  e = e || {};
  const p = (e.parameter || {});
  const wantsStudent = !!p.token || p.as === 'student';

  let file = 'MentorPage', data = null;

  if (wantsStudent) {
    file = 'MenteePage';
    data = menteeData_(e);
  } else {
    data = mentorData_();
    // Not on the mentor roster? They may still be a student or a guardian.
    if (data.error === 'unknown' || data.error === 'signin') {
      const asStudent = menteeData_(e);
      if (asStudent.mode === 'mentee' || asStudent.mode === 'menteeWaiting') {
        file = 'MenteePage';
        data = asStudent;
      }
    }
  }

  const t = HtmlService.createTemplateFromFile(file);
  t.data = data;
  return t.evaluate()
    .setTitle(file === 'MenteePage' ? 'YMU Music Mentoring' : 'YMU Mentoring')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Everything the signed-in mentor is allowed to see, and nothing else. */
function mentorData_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return { error: 'signin' };

  const mentor = readTab_('Mentors').filter(function (m) {
    return String(m.email || '').toLowerCase() === email;
  })[0];
  if (!mentor) return { error: 'unknown', email: email, contact: CFG.coordinatorEmail };

  // Intake comes first. Until a mentor has told us where they travel from,
  // which schools they will go to, and when they are free, there is nothing
  // to show them but the form.
  const intake = intakeStatus(mentor.mentor_id);
  if (!intake.complete) return intakeData_(mentor, intake);

  const pair = readTab_('Pairs').filter(function (p) {
    return p.mentor_id === mentor.mentor_id && (p.approved === true || p.approved === 'TRUE');
  })[0];
  if (!pair) {
    return { mode: 'waiting', name: mentor.name, firstName: String(mentor.name).split(' ')[0],
             contact: CFG.coordinatorEmail,
             prefs: intake.perSite.map(function (p) { return p.name; }) };
  }

  const site = getSite_(pair.site_id);
  const mentee = getMentee_(pair.mentee_id);
  const today = todayIso_();

  const sessions = readTab_('Sessions')
    .filter(function (s) { return s.pair_id === pair.pair_id; })
    .sort(function (a, b) { return Number(a.session_no) - Number(b.session_no); })
    .map(function (s) {
      const closed = ['completed', 'missed'].indexOf(s.status) >= 0;
      const opts = closed ? [] : sessionOptions(pair.pair_id, s.session_no);
      const days = {};
      opts.forEach(function (o) {
        (days[o.date] = days[o.date] || []).push({ time: o.time, taken: o.taken });
      });
      // Same calendar the mentor used at intake, narrowed to what they offered.
      const grid = closed ? null : buildMonth(pair.site_id, s.session_no, {
        picked: pickedMap_(pair.mentor_id, pair.site_id),
        onlyPicked: true, checkTaken: true, excludeSessionId: s.session_id
      });
      return {
        id: s.session_id,
        no: Number(s.session_no),
        month: s.month,
        date: s.date || '',
        pretty: s.date ? prettyDate_(s.date) : '',
        time: s.time || '',
        status: s.status,
        moved: Number(s.reschedules || 0),
        past: !!(s.date && daysBetween_(today, s.date) < 0),
        needsCloseout: !!(s.date && daysBetween_(today, s.date) < 0 && !s.happened),
        happened: s.happened || '',
        minutes: s.minutes || '',
        workedOn: s.worked_on || '',
        followUp: s.follow_up || '',
        grid: grid,
        days: Object.keys(days).sort().map(function (d) {
          return { date: d, pretty: prettyDate_(d), times: days[d] };
        })
      };
    });

  return {
    mode: 'booking',
    name: mentor.name,
    firstName: String(mentor.name).split(' ')[0],
    mentee: mentee.name,
    instrument: pair.instrument,
    site: site.name,
    address: site.address || '',
    hours: readableHours_(site),
    coordinator: CFG.coordinatorEmail,
    total: sessions.length,
    unbooked: sessions.filter(function (s) { return s.status === 'unscheduled'; }).length,
    sessions: sessions
  };
}

/* ====================================================================
   Intake — where do you travel from, which schools, and when are you free
   ==================================================================== */

/** The state of the intake form for one mentor. */
function intakeData_(mentor, intake) {
  const today = todayIso_();
  const cyc = activeCycle_();
  const due = cyc ? cyc.dueBy : CFG.intakeDeadline;
  const daysLeft = daysBetween_(today, due);

  const d = {
    mode: 'intake',
    mentorId: mentor.mentor_id,
    name: mentor.name,
    firstName: String(mentor.name).split(' ')[0],
    ownSchool: mentor.school || '',
    contact: CFG.coordinatorEmail,
    deadline: prettyDate_(due),
    daysLeft: daysLeft,
    overdue: daysLeft < 0,
    step: 1,
    travelFrom: mentor.travel_from || '',
    travelKind: mentor.travel_kind || '',
    minPerMonth: CFG.minSlotsPerMonth,
    encourage: CFG.encourageSlots,
    suggestCount: CFG.suggestCount,
    maxPrefs: CFG.maxSitePrefs,
    sessionMinutes: CFG.sessionMinutes
  };

  if (!intake.hasAddress) { d.step = 1; return d; }

  // Step 2 — the schools, nearest first.
  d.step = intake.hasSites ? 3 : 2;
  d.sites = rankSitesFor(mentor.mentor_id, { withDriveTimes: true }).map(function (r) {
    return {
      site_id: r.site_id, name: r.name, address: r.address,
      hours: r.readableHours, miles: r.miles, driveMins: r.driveMins,
      isOwnSchool: r.isOwnSchool, suggested: r.suggested,
      chosen: intake.prefs.indexOf(r.site_id) >= 0
    };
  });

  // Step 3 — a real calendar per school, but only for the cycle in front of
  // them. Nobody is asked in September what they are doing in April.
  if (intake.hasSites) {
    const cyc = activeCycle_();
    d.minPerMonth = CFG.minSlotsPerMonth;
    d.encourage = CFG.encourageSlots;
    d.cycleId = cyc ? cyc.id : '';
    d.cycleLabel = cyc ? cycleMonths_(cyc).map(function (m) { return m.label; }).join(' and ') : '';
    d.cycleDue = cyc ? prettyDate_(cyc.dueBy) : '';
    d.months = cyc ? cycleMonths_(cyc).map(function (m) {
      return { n: m.n, label: m.label };
    }) : [];
    d.chosen = intake.prefs.map(function (siteId) {
      const site = getSite_(siteId);
      const st = intake.perSite.filter(function (p) { return p.site_id === siteId; })[0] || {};
      return {
        site_id: siteId, name: site.name, hours: readableHours_(site),
        total: st.total || 0, ok: !!st.ok,
        problems: st.problems || [], counts: st.counts || []
      };
    });
    // The calendar the page opens on: first school, first month still short.
    const first = d.chosen[0];
    if (first) {
      const short = (first.counts || []).filter(function (c) { return !c.ok; })[0];
      d.openSite = first.site_id;
      d.openMonth = short ? short.n : (d.months[0] ? d.months[0].n : 1);
      d.grid = buildMonth(first.site_id, d.openMonth,
                          { picked: pickedMap_(mentor.mentor_id, first.site_id) });
    }
  }
  return d;
}

/** The calendar for one school in one month, with this mentor's picks marked. */
function apiMonth(siteId, sessionNo) {
  const me = whoAmI_();
  if (!me.ok) return { ok: false, message: me.message };
  const prefs = String(me.mentor.site_prefs || '').split(',')
    .map(function (x) { return x.trim(); });
  if (prefs.indexOf(siteId) < 0) return { ok: false, message: 'Not one of your schools.' };
  const cyc = activeCycle_();
  if (cyc && cyc.covers.indexOf(Number(sessionNo)) < 0) {
    return { ok: false, message: 'We are only collecting ' +
      cycleMonths_(cyc).map(function (m) { return m.label; }).join(' and ') +
      ' at the moment. We will ask about the later months nearer the time.' };
  }
  clearClosureCache_();
  return {
    ok: true,
    grid: buildMonth(siteId, sessionNo, { picked: pickedMap_(me.mentor.mentor_id, siteId) }),
    counts: monthlyCounts(me.mentor.mentor_id, siteId)
  };
}

/**
 * Turns one specific date+time on or off. Saving per click rather than per
 * page means a mentor who wanders off halfway keeps everything they ticked.
 */
function apiToggleSlot(siteId, date, time, on) {
  const me = whoAmI_();
  if (!me.ok) return { ok: false, message: me.message };
  const prefs = String(me.mentor.site_prefs || '').split(',')
    .map(function (x) { return x.trim(); });
  if (prefs.indexOf(siteId) < 0) return { ok: false, message: 'Not one of your schools.' };

  if (on) {
    const bad = slotsAreLegal_(siteId, [{ date: date, time: time }]);
    if (bad.length) return { ok: false, message: bad[0] };
    const cyc = activeCycle_();
    if (cyc) {
      const inCycle = cycleMonths_(cyc).some(function (m) { return date.indexOf(m.prefix) === 0; });
      if (!inCycle) return { ok: false, message: 'That date is outside the months we are ' +
        'collecting right now (' + cycleMonths_(cyc).map(function (m) { return m.label; })
          .join(' and ') + ').' };
    }
  }
  // Never let a mentor un-offer a time their session is actually booked on.
  if (!on) {
    const clash = readTab_('Sessions').filter(function (ss) {
      if (isoOf_(ss.date) !== date || ss.time !== time) return false;
      if (['completed', 'missed'].indexOf(ss.status) >= 0) return false;
      const pr = getPair_(ss.pair_id);
      return pr.mentor_id === me.mentor.mentor_id;
    })[0];
    if (clash) {
      return { ok: false, message: 'Your ' + clash.month + ' session is booked for that time. ' +
        'Move the session first, then you can remove this.' };
    }
  }

  toggleSlot_(me.mentor.mentor_id, siteId, date, time, on);

  const counts = monthlyCounts(me.mentor.mentor_id, siteId);
  const after = intakeStatus(me.mentor.mentor_id);
  if (after.complete && !me.mentor.intake_done) {
    setCell_('Mentors', me.mentor._row, 'intake_done', todayIso_());
    notifyIntakeComplete_(me.mentor, after);
  }
  return { ok: true, counts: counts, complete: after.complete };
}

/** They say they are finished — checked properly before we believe it. */
function apiFinishIntake() {
  const me = whoAmI_();
  if (!me.ok) return { ok: false, message: me.message };
  const st = intakeStatus(me.mentor.mentor_id);
  if (!st.complete) {
    const gaps = [];
    st.perSite.forEach(function (p) { p.problems.forEach(function (x) { gaps.push(x); }); });
    return { ok: false, message: gaps.join(' ') || 'Still some months to fill in.' };
  }
  if (!me.mentor.intake_done) {
    setCell_('Mentors', me.mentor._row, 'intake_done', todayIso_());
    notifyIntakeComplete_(me.mentor, st);
  }
  return { ok: true, message: 'All done — thank you. We will let you know who you are paired with.',
           data: mentorData_() };
}

/** Step 1 — geocode where they'll be travelling from. */
function apiSaveAddress(address, kind) {
  const me = whoAmI_();
  if (!me.ok) return { ok: false, message: me.message };
  address = String(address || '').trim();
  if (address.length < 6) {
    return { ok: false, message: 'Please give a full address, including the city.' };
  }
  const pt = geocode_(address);
  if (!pt) {
    return { ok: false, message: "We couldn't find that address. Try adding the city and ZIP." };
  }
  setCell_('Mentors', me.mentor._row, 'travel_from', pt.formatted || address);
  setCell_('Mentors', me.mentor._row, 'travel_kind', kind === 'home' ? 'home' : 'school');
  setCell_('Mentors', me.mentor._row, 'travel_lat', pt.lat);
  setCell_('Mentors', me.mentor._row, 'travel_lng', pt.lng);
  log_('Intake', me.mentor.name + ' set travel origin (' + kind + ')');
  return { ok: true, message: 'Found it. Here are your nearest schools.', data: mentorData_() };
}

/** Step 2 — which schools they're willing to travel to. */
function apiSaveSites(siteIds) {
  const me = whoAmI_();
  if (!me.ok) return { ok: false, message: me.message };
  siteIds = (siteIds || []).filter(Boolean);
  if (!siteIds.length) return { ok: false, message: 'Choose at least one school.' };
  if (siteIds.length > CFG.maxSitePrefs) {
    return { ok: false, message: 'Please choose no more than ' + CFG.maxSitePrefs + ' schools.' };
  }
  setCell_('Mentors', me.mentor._row, 'site_prefs', siteIds.join(', '));
  log_('Intake', me.mentor.name + ' chose ' + siteIds.length + ' schools');
  return { ok: true, message: 'Saved. Now tell us when you are free.', data: mentorData_() };
}

function notifyIntakeComplete_(mentor, status) {
  MailApp.sendEmail({
    to: CFG.coordinatorEmail,
    subject: 'Intake complete: ' + mentor.name,
    name: CFG.coordinatorName,
    htmlBody: '<div style="font:14px/1.5 sans-serif"><p><b>' + mentor.name +
      '</b> has finished their availability form.</p><ul>' +
      status.perSite.map(function (p) {
        return '<li>' + p.name + ' — ' + p.total + ' times offered across the year</li>';
      }).join('') + '</ul>' +
      '<p style="color:#6b7280">Travelling from their ' + (mentor.travel_kind || 'address') +
      '. They can be matched now.</p></div>'
  });
}

/* ====================================================================
   Called from the page — booking
   ==================================================================== */

/**
 * A mentor moving one of their own sessions. The student normally does the
 * choosing, so this path is for genuine changes — and it is where the
 * two-hour reschedule rule bites.
 */
function apiBook(sessionId, date, time) {
  const guard = ownsSession_(sessionId);
  if (!guard.ok) return { ok: false, message: guard.message };
  if (!date || !time) {
    // Releasing a date without replacing it is the one thing a mentor cannot
    // do. A freed slot with nobody watching it is how a session gets lost.
    return { ok: false, message: 'To move this session, pick the new date first — ' +
      'you cannot cancel without a replacement. If nothing on the list works, ' +
      'use "None of these work" and we will sort it out with you.' };
  }
  const res = bookSession(sessionId, date, time, { pickedBy: 'mentor' });
  return { ok: res.ok, message: res.message,
           needsMoreAvailability: !!res.needsMoreAvailability, data: mentorData_() };
}

/** The escape hatch: no available date works, so a human takes over. */
function apiCannotMake(sessionId, reason) {
  const guard = ownsSession_(sessionId);
  if (!guard.ok) return { ok: false, message: guard.message };
  const s = guard.session, pair = guard.pair;

  setCell_('Sessions', s._row, 'notes',
    (s.notes ? s.notes + ' | ' : '') + todayIso_() + ': mentor cannot make any listed date — ' +
    (reason || 'no reason given'));

  MailApp.sendEmail({
    to: CFG.coordinatorEmail,
    subject: 'Needs rescheduling by hand: ' + guard.mentor.name + ' — ' + s.month,
    name: CFG.coordinatorName,
    htmlBody: '<div style="font:14px/1.5 sans-serif">' +
      '<p><b>' + guard.mentor.name + '</b> says none of the available ' + s.month +
      ' dates work for their session with ' + getMentee_(pair.mentee_id).name +
      ' at ' + getSite_(pair.site_id).name + '.</p>' +
      (s.date ? '<p>Currently booked for ' + prettyDate_(s.date) + ' at ' + s.time +
                ' — still held until you change it.</p>' : '<p>Not currently booked.</p>') +
      '<blockquote style="border-left:3px solid #3b4cca;padding-left:12px;color:#333">' +
      (reason || 'No reason given') + '</blockquote>' +
      '<p style="color:#6b7280">Their declared availability at that school: ' +
      availabilityFor(pair.mentor_id, pair.site_id).map(function (a) {
        return a.day + ' ' + a.time; }).join(', ') + '</p></div>'
  });
  log_('Escalation', guard.mentor.name + ' cannot make ' + s.month);
  return { ok: true, message: 'Thanks — we have been told and will be in touch. ' +
           'Your existing booking stays in place until we agree a new one.',
           data: mentorData_() };
}

/** Saves the four closeout answers. */
function apiCloseout(sessionId, happened, minutes, workedOn, followUp) {
  const guard = ownsSession_(sessionId);
  if (!guard.ok) return { ok: false, message: guard.message };

  const s = guard.session;
  setCell_('Sessions', s._row, 'happened', happened || '');
  setCell_('Sessions', s._row, 'minutes', minutes || '');
  setCell_('Sessions', s._row, 'worked_on', workedOn || '');
  setCell_('Sessions', s._row, 'follow_up', followUp || '');
  if (happened === 'yes') setCell_('Sessions', s._row, 'status', 'completed');
  if (happened === 'no')  setCell_('Sessions', s._row, 'status', 'missed');

  log_('Closeout', guard.mentor.name + ' ' + s.month + ': ' + happened +
       (followUp ? ' — FOLLOW UP: ' + followUp : ''));

  // A flagged concern should reach a human the same day, not wait for the digest.
  if (followUp) {
    MailApp.sendEmail({
      to: CFG.coordinatorEmail,
      subject: 'Follow-up flagged by ' + guard.mentor.name,
      name: CFG.coordinatorName,
      htmlBody: '<div style="font:14px/1.5 sans-serif">' +
        '<p><b>' + guard.mentor.name + '</b> flagged something after their ' + s.month +
        ' session:</p><blockquote style="border-left:3px solid #3b4cca;padding-left:12px;color:#333">' +
        followUp + '</blockquote>' +
        '<p style="color:#6b7280">Session ' + s.session_no + ' on ' + prettyDate_(s.date) +
        '. Worked on: ' + (workedOn || '—') + '</p></div>'
    });
  }
  return { ok: true, message: 'Thank you — saved.', data: mentorData_() };
}

/** Who is signed in, resolved against the roster. */
function whoAmI_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return { ok: false, message: 'Please sign in with your Google account.' };
  const mentor = readTab_('Mentors').filter(function (m) {
    return String(m.email || '').toLowerCase() === email;
  })[0];
  if (!mentor) return { ok: false, message: 'We do not recognise this account.' };
  return { ok: true, mentor: mentor, email: email };
}

/** Nobody may touch a session that is not theirs. */
function ownsSession_(sessionId) {
  const me = whoAmI_();
  if (!me.ok) return { ok: false, message: me.message };
  const mentor = me.mentor;

  const s = byId_(readTab_('Sessions'), 'session_id', sessionId);
  if (!s) return { ok: false, message: 'That session no longer exists.' };

  const pair = getPair_(s.pair_id);
  if (pair.mentor_id !== mentor.mentor_id) {
    log_('Blocked', me.email + ' tried to touch session ' + sessionId);
    return { ok: false, message: 'That session belongs to a different mentor.' };
  }
  return { ok: true, session: s, mentor: mentor, pair: pair };
}
