/**
 * YMU Mentoring — the daily job.
 *
 * ONE time-driven trigger runs this once a morning. It is deliberately not a
 * trigger per session: Apps Script allows only 20 triggers per script, so a
 * per-session design breaks the moment you have more than a handful of pairs.
 *
 * Every send is recorded in the sheet before moving on, so running this twice
 * in a day cannot double-email anyone.
 *
 * Note on why reminders are emails rather than calendar reminders: Google
 * treats reminder overrides as private per-user data. A reminder the organiser
 * sets applies only to the organiser's copy of the event — guests get their own
 * defaults. So the only reliable way to reach a parent a week out is to send
 * them an email ourselves.
 */

function dailyTick() {
  const today = todayIso_();
  const sessions = readTab_('Sessions');
  const summary = { week: 0, day: 0, dayof: 0, nudge: 0, closeout: 0, intake: 0,
                    cycle: 0, carried: 0, short: 0, attention: [] };

  sessions.forEach(function (s) {
    const pair = getPair_(s.pair_id);
    if (!pair.pair_id) return;

    if (s.date && ['scheduled', 'rescheduled'].indexOf(s.status) >= 0) {
      const away = daysBetween_(today, s.date);

      // One week out. The range catches bookings made late, so a session
      // booked three days ahead still gets one reminder rather than none.
      if (away <= CFG.remindDaysBefore && away >= 2 && !s.remind_week) {
        sendReminder_(s, pair, 'week', away);
        setCell_('Sessions', s._row, 'remind_week', today);
        summary.week++;
      }
      // Day before.
      if (away === 1 && !s.remind_day) {
        sendReminder_(s, pair, 'day', away);
        setCell_('Sessions', s._row, 'remind_day', today);
        summary.day++;
      }
      // Morning of — this is the coverage check, the one that matters when a
      // school is closed or short-staffed.
      if (away === 0 && !s.remind_dayof) {
        sendReminder_(s, pair, 'dayof', away);
        setCell_('Sessions', s._row, 'remind_dayof', today);
        summary.dayof++;
      }
      // Session has passed with nothing logged — ask the mentor how it went.
      if (away <= -CFG.chaseCloseoutAfterDays && !s.happened && !s.closeout_asked) {
        askForCloseout_(s, pair);
        setCell_('Sessions', s._row, 'closeout_asked', today);
        summary.closeout++;
      }
      if (away <= -5 && !s.happened) {
        summary.attention.push(pairLabel_(pair) + ' — ' + s.month +
          ' session on ' + prettyDate_(s.date) + ' still has no closeout');
      }
    }

    // Not booked yet. Chase as the month closes, then keep chasing weekly.
    if (s.status === 'unscheduled') {
      const sm = monthInfo_(s.session_no);
      const year = CFG.schoolYearStart + sm.y;
      const monthEnd = year + '-' + (sm.m < 10 ? '0' : '') + sm.m + '-' +
                       new Date(year, sm.m, 0).getDate();
      const daysLeft = daysBetween_(today, monthEnd);

      if (daysLeft < 0) {
        summary.attention.push(pairLabel_(pair) + ' — ' + sm.label +
          ' was never booked and the month has passed');
      } else if (daysLeft <= CFG.nudgeWithinDays) {
        const since = s.last_nudge ? daysBetween_(String(s.last_nudge).slice(0, 10), today) : 999;
        if (since >= CFG.renudgeEveryDays) {
          nudgeMentor_(s, pair, daysLeft);
          setCell_('Sessions', s._row, 'last_nudge', today);
          summary.nudge++;
        }
        if (daysLeft <= 7) {
          summary.attention.push(pairLabel_(pair) + ' — still has not booked ' +
            sm.label + ', ' + daysLeft + ' days left');
        }
      }
    }

    if (Number(s.reschedules || 0) > CFG.maxReschedules) {
      summary.attention.push(pairLabel_(pair) + ' — ' + s.month + ' moved ' +
        s.reschedules + ' times, over the limit of ' + CFG.maxReschedules);
    }
    if (s.follow_up) {
      summary.attention.push(pairLabel_(pair) + ' — follow-up flagged: ' + s.follow_up);
    }
  });

  // Cycle rollover: open the next cycle, chase it, and carry patterns forward
  // for anyone who does not reply.
  runCycleRollover_(today, summary);

  // Intake. Nobody can be matched until they have told us where they can get
  // to and when, so this is the first thing that has to land.
  const cycNow = activeCycle_(today);
  const chasing = !!(cycNow && today >= cycNow.collectFrom);
  readTab_('Mentors').forEach(function (m) {
    if (m.active !== true && m.active !== 'TRUE') return;
    if (m.intake_done) return;
    const st = intakeStatus(m.mentor_id);

    // Availability can arrive without going through the booking page — you
    // might paste rows straight into the sheet. Notice that whatever the date,
    // otherwise a mentor who is actually ready sits in the chase list forever.
    if (st.complete) {
      setCell_('Mentors', m._row, 'intake_done', today);
      notifyIntakeComplete_(m, st);
      summary.attention.push(m.name + ' — availability now complete, ready to match');
      return;
    }

    if (!chasing) return;   // too early in the cycle to start nagging
    const left = daysBetween_(today, cycNow ? cycNow.dueBy : CFG.intakeDeadline);
    const since = m.last_intake_nudge
      ? daysBetween_(String(m.last_intake_nudge).slice(0, 10), today) : 999;
    if (since >= CFG.renudgeEveryDays) {
      chaseIntake_(m, st, left);
      summary.intake++;
    }
    if (left < 0) {
      summary.attention.push(m.name + ' — availability form still not done, ' +
        Math.abs(left) + ' days past the deadline');
    }
  });

  // Contact gaps mean somebody is silently not being told about sessions.
  readTab_('Pairs').forEach(function (p) {
    if (p.approved !== true && p.approved !== 'TRUE') return;
    const gaps = missingContacts_(p);
    if (gaps.length) summary.attention.push(pairLabel_(p) + ' — missing ' + gaps.join(', '));
  });

  if (CFG.managerDigest) sendManagerDigest_(summary);
  log_('Daily job', JSON.stringify({ week: summary.week, day: summary.day,
        dayof: summary.dayof, nudge: summary.nudge, closeout: summary.closeout,
        intake: summary.intake, cycle: summary.cycle, carried: summary.carried,
        short: summary.short, attention: summary.attention.length }));
  return summary;
}

/**
 * Everything cycle-related, once a day.
 *
 * 1. When a cycle opens, ask every mentor to add their times for it.
 * 2. Keep asking weekly until the deadline.
 * 3. Past the deadline with no answer, carry their existing pattern forward —
 *    which is why the form pushes them to keep a consistent one.
 * 4. Re-check the carried pattern against the school calendar. A pattern that
 *    gave four dates in October can give one in December, and that mentor
 *    needs to hear about it rather than discovering it in the moment.
 */
function runCycleRollover_(today, summary) {
  const cycle = activeCycle_(today);
  if (!cycle) return;

  const isOpen = cycleIsOpen_(cycle, today);
  const past = prevCycle_(cycle);
  const dueGone = daysBetween_(today, cycle.dueBy) < 0;

  readTab_('Mentors').forEach(function (m) {
    if (m.active !== true && m.active !== 'TRUE') return;
    const prefs = String(m.site_prefs || '').split(',')
      .map(function (x) { return x.trim(); }).filter(Boolean);
    if (!prefs.length) return;      // still on step 2, handled by the intake chase

    const logRow = cycleLogFor_(m.mentor_id, cycle.id) || {};
    const status = intakeStatus(m.mentor_id, cycle);

    // Already sorted for this cycle. Recorded whether or not the window is
    // open, so a mentor who filled in early is never chased later.
    if (status.complete) {
      if (!logRow.updated_on) markCycle_(m.mentor_id, cycle.id, 'updated_on');
      return;
    }

    if (!isOpen) return;    // too early to ask about this cycle at all

    // 1 & 2 — ask, then keep asking.
    const since = logRow.prompted_on
      ? daysBetween_(String(logRow.prompted_on).slice(0, 10), today) : 999;
    if (!dueGone && since >= CFG.renudgeEveryDays) {
      if (sendCycleMail_(m, cycle, 'cycle_open')) {
        markCycle_(m.mentor_id, cycle.id, 'prompted_on');
        summary.cycle++;
      }
    }

    // 3 — deadline gone, nothing from them: carry the pattern forward.
    if (dueGone && CFG.carryForwardIfSilent && !logRow.carried_on && past) {
      let carried = 0;
      prefs.forEach(function (siteId) {
        const pattern = patternFrom_(m.mentor_id, siteId, past);
        if (pattern.length) carried += applyPattern_(m.mentor_id, siteId, cycle, pattern);
      });
      markCycle_(m.mentor_id, cycle.id, 'carried_on');
      if (carried) {
        sendCycleMail_(m, cycle, 'cycle_carried');
        summary.carried++;
        log_('Cycle', 'Carried ' + carried + ' slots forward for ' + m.name);
      } else {
        summary.attention.push(m.name + ' — no ' +
          cycleMonths_(cycle).map(function (c) { return c.label; }).join('/') +
          ' availability and nothing to carry forward');
      }
    }

    // 4 — short after all that? The holidays are usually why.
    const after = intakeStatus(m.mentor_id, cycle);
    if (!after.complete && (logRow.carried_on || dueGone)) {
      const warnedSince = logRow.short_warned_on
        ? daysBetween_(String(logRow.short_warned_on).slice(0, 10), today) : 999;
      if (warnedSince >= CFG.renudgeEveryDays) {
        const shortMonth = (after.perSite[0] && after.perSite[0].counts || [])
          .filter(function (c) { return !c.ok; })[0];
        if (sendCycleMail_(m, cycle, 'cycle_short', shortMonth)) {
          markCycle_(m.mentor_id, cycle.id, 'short_warned_on');
          summary.short++;
        }
      }
      summary.attention.push(m.name + ' — short of times for ' +
        after.perSite.map(function (p) {
          return (p.counts || []).filter(function (c) { return !c.ok; })
            .map(function (c) { return c.label; }).join('/');
        }).filter(Boolean).join(', '));
    }
  });
}

/** Cycle mails are about a mentor, not a session, so they need their own sender. */
function sendCycleMail_(mentor, cycle, key, shortMonth) {
  const t = template_(key);
  if (!t) return false;
  const to = [mentor.email, mentor.guardian1_email, mentor.guardian2_email]
    .filter(function (e) { return e && /@/.test(e); });
  if (!to.length) return false;

  // A mentor may not have a pair yet, so build a light context by hand.
  const pair = readTab_('Pairs').filter(function (p) {
    return p.mentor_id === mentor.mentor_id && (p.approved === true || p.approved === 'TRUE');
  })[0];
  const ctx = pair ? templateContext_(pair, null) : {};
  ctx.mentor = mentor.name;
  ctx.mentee = ctx.mentee || 'your student';
  ctx.cycle = cycle.id;
  ctx.cycleMonths = cycleMonths_(cycle).map(function (m) { return m.label; }).join(' and ');
  ctx.cycleDue = prettyDate_(cycle.dueBy);
  ctx.month = shortMonth ? shortMonth.label : ctx.cycleMonths;
  ctx.minPerMonth = CFG.minSlotsPerMonth;
  ctx.coordinator = CFG.coordinatorEmail;
  ctx.coordinatorName = CFG.coordinatorName;
  ctx.bookingLink = CFG.webAppUrl || '(booking page)';

  MailApp.sendEmail({
    to: to.join(','), cc: CFG.coordinatorEmail,
    subject: fillTemplate_(t.subject, ctx),
    htmlBody: shell_(textToHtml_(fillTemplate_(t.body, ctx))),
    name: CFG.coordinatorName
  });
  return true;
}

function pairLabel_(pair) {
  return getMentor_(pair.mentor_id).name + ' & ' + getMentee_(pair.mentee_id).name;
}

/* ====================================================================
   The emails
   ==================================================================== */

function shell_(bodyHtml) {
  return '<div style="font:14px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
         'color:#16181d;max-width:560px">' + bodyHtml +
         '<hr style="border:0;border-top:1px solid #e3e6ea;margin:22px 0 12px">' +
         '<div style="font-size:12px;color:#6b7280">' + CFG.coordinatorName +
         ' &middot; <a href="mailto:' + CFG.coordinatorEmail + '" style="color:#3b4cca">' +
         CFG.coordinatorEmail + '</a>' +
         (CFG.webAppUrl ? ' &middot; <a href="' + CFG.webAppUrl + '" style="color:#3b4cca">Booking page</a>' : '') +
         '</div></div>';
}

function sendReminder_(s, pair, kind, away) {
  const mentor = getMentor_(pair.mentor_id);
  const mentee = getMentee_(pair.mentee_id);
  const site = getSite_(pair.site_id);
  const when = prettyDate_(s.date) + ' at ' + s.time;
  let subject, body;

  if (kind === 'week') {
    subject = 'In ' + away + ' days: ' + mentee.name + ' + ' + mentor.name + ' music session';
    body = '<p>A reminder that the ' + s.month + ' mentoring session is coming up.</p>' +
      detailBlock_(mentee, mentor, pair, site, when) +
      '<p>If either student cannot make it, the sooner we know the better — ' +
      mentor.name + ' can move the date on the booking page, or just reply to this email.</p>';
  } else if (kind === 'day') {
    subject = 'Tomorrow: ' + mentee.name + ' + ' + mentor.name + ' at ' + s.time;
    body = '<p>This session is <b>tomorrow</b>.</p>' +
      detailBlock_(mentee, mentor, pair, site, when) +
      '<p>Please reply if anything has changed.</p>';
  } else {
    subject = 'Today — please confirm coverage: ' + mentee.name + ' + ' + mentor.name;
    body = '<p>Today\'s session is at <b>' + s.time + '</b>.</p>' +
      detailBlock_(mentee, mentor, pair, site, when) +
      '<p><b>Because afterschool coverage varies day to day, please confirm before it starts:</b></p>' +
      '<ol>' +
      '<li><b>Site staff</b> — is a supervising adult on site at ' + s.time + '?</li>' +
      '<li><b>' + mentor.name + '</b> — are you on your way?</li>' +
      '<li><b>Parent/guardian</b> — is ' + mentee.name + ' at afterschool today?</li>' +
      '</ol>' +
      '<p>If any of those is a no, reply to all and we will move the session. ' +
      '<b>A session must not go ahead without a supervising adult present.</b></p>';
  }
  MailApp.sendEmail({ to: recipients_(pair).join(','), subject: subject,
                      htmlBody: shell_(body), name: CFG.coordinatorName });
}

function detailBlock_(mentee, mentor, pair, site, when) {
  return '<table cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:14px">' +
    row_('When', when) +
    row_('Student', mentee.name) +
    row_('Ambassador', mentor.name) +
    row_('Instrument', pair.instrument) +
    row_('Where', site.name + (site.address ? '<br><span style="color:#6b7280">' + site.address + '</span>' : '')) +
    '</table>';
}
function row_(k, v) {
  return '<tr><td style="padding:3px 14px 3px 0;color:#6b7280;vertical-align:top">' + k +
         '</td><td style="padding:3px 0"><b>' + v + '</b></td></tr>';
}

/** Nudge goes to the mentor and their parents only — not the whole invite list. */
function nudgeMentor_(s, pair, daysLeft) {
  const mentor = getMentor_(pair.mentor_id);
  const mentee = getMentee_(pair.mentee_id);
  const site = getSite_(pair.site_id);
  const to = [mentor.email, mentor.guardian1_email, mentor.guardian2_email]
    .filter(function (e) { return e && /@/.test(e); });
  if (!to.length) return;

  const unbooked = readTab_('Sessions').filter(function (x) {
    return x.pair_id === pair.pair_id && x.status === 'unscheduled';
  }).length;

  MailApp.sendEmail({
    to: to.join(','), cc: CFG.coordinatorEmail,
    subject: 'Action needed: book your ' + s.month + ' session with ' + mentee.name,
    name: CFG.coordinatorName,
    htmlBody: shell_(
      '<p>Hi ' + String(mentor.name).split(' ')[0] + ',</p>' +
      '<p>Your <b>' + s.month + '</b> session with ' + mentee.name + ' at ' + site.name +
      ' has not been booked yet — there ' + (daysLeft === 1 ? 'is 1 day' : 'are ' + daysLeft + ' days') +
      ' left in the month.</p>' +
      '<p>Pick whatever date and time suits you from the afterschool slots. It takes a minute, ' +
      'and booking early means you get first choice.</p>' +
      (CFG.webAppUrl ? '<p><a href="' + CFG.webAppUrl + '" style="background:#3b4cca;color:#fff;' +
        'padding:10px 18px;border-radius:7px;text-decoration:none;display:inline-block">' +
        'Book your session</a></p>' : '') +
      '<p style="color:#6b7280">Sessions you still need to book this year: ' + unbooked + '</p>')
  });
}

function askForCloseout_(s, pair) {
  const mentor = getMentor_(pair.mentor_id);
  const mentee = getMentee_(pair.mentee_id);
  const to = [mentor.email, mentor.guardian1_email]
    .filter(function (e) { return e && /@/.test(e); });
  if (!to.length) return;

  MailApp.sendEmail({
    to: to.join(','), cc: CFG.coordinatorEmail,
    subject: 'How did your session with ' + mentee.name + ' go?',
    name: CFG.coordinatorName,
    htmlBody: shell_(
      '<p>Hi ' + String(mentor.name).split(' ')[0] + ',</p>' +
      '<p>Your ' + s.month + ' session with ' + mentee.name + ' was down for ' +
      prettyDate_(s.date) + '. Four quick questions:</p>' +
      '<ol><li>Did the session happen?</li><li>Roughly how long was it?</li>' +
      '<li>What did you work on?</li>' +
      '<li>Anything YMU should know or follow up on?</li></ol>' +
      (CFG.webAppUrl ? '<p><a href="' + CFG.webAppUrl + '" style="background:#3b4cca;color:#fff;' +
        'padding:10px 18px;border-radius:7px;text-decoration:none;display:inline-block">' +
        'Answer on the booking page</a></p>' : '<p>Just reply to this email.</p>'))
  });
}

/**
 * The manager's daily email. Sent only when something actually needs a human,
 * so it stays an alert rather than becoming one more notification to ignore.
 */
function sendManagerDigest_(summary) {
  const cur = currentMonthNumber_();
  const st = cur ? statsForMonth_(cur) : null;
  const sent = summary.week + summary.day + summary.dayof + summary.nudge +
               summary.closeout + summary.intake + summary.cycle + summary.carried +
               summary.short;
  if (!summary.attention.length && !sent) return;

  const uniq = summary.attention.filter(function (v, i, a) { return a.indexOf(v) === i; });
  const pairCount = readTab_('Pairs').filter(function (p) {
    return p.approved === true || p.approved === 'TRUE';
  }).length;

  let body = '<p style="margin-top:0">';
  if (st) {
    body += '<b>' + monthInfo_(cur).label + ':</b> ' + pairCount + ' pairs &middot; ' +
      st.completed + ' completed &middot; ' + st.scheduled + ' scheduled &middot; ' +
      st.unscheduled + ' not scheduled &middot; ' + st.rescheduled + ' rescheduled &middot; ' +
      st.missed + ' missed';
  } else {
    body += pairCount + ' mentor pairs. No session month is running right now.';
  }
  body += '</p>';

  body += '<p style="color:#6b7280">Sent automatically this morning: ' +
    summary.week + ' week-ahead, ' + summary.day + ' day-before, ' + summary.dayof +
    ' day-of coverage checks, ' + summary.nudge + ' booking nudges, ' +
    summary.closeout + ' closeout requests, ' + summary.intake + ' intake chases, ' +
    summary.cycle + ' cycle requests, ' + summary.carried + ' patterns carried forward, ' +
    summary.short + ' short-of-times warnings.</p>';

  if (uniq.length) {
    body += '<h3 style="font-size:14px;margin:22px 0 8px">Needs you (' + uniq.length + ')</h3><ul>' +
      uniq.map(function (a) { return '<li style="margin-bottom:5px">' + a + '</li>'; }).join('') +
      '</ul>';
  } else {
    body += '<p><b>Nothing needs your attention today.</b></p>';
  }

  MailApp.sendEmail({
    to: CFG.coordinatorEmail,
    subject: 'YMU mentoring — ' + (uniq.length ? uniq.length + ' item' +
             (uniq.length > 1 ? 's need' : ' needs') + ' you' : 'all clear'),
    htmlBody: shell_(body), name: CFG.coordinatorName
  });
}

/** Chases a mentor who has not finished the availability form. */
function chaseIntake_(mentor, status, daysLeft) {
  const to = [mentor.email, mentor.guardian1_email, mentor.guardian2_email]
    .filter(function (e) { return e && /@/.test(e); });
  if (!to.length) return;

  let what;
  if (!status.hasAddress) what = 'we do not yet know where you would be travelling from';
  else if (!status.hasSites) what = 'you have not yet chosen which schools you could get to';
  else what = 'you still need to give us your available times';

  const urgency = daysLeft < 0
    ? 'This was due ' + prettyDate_(CFG.intakeDeadline) + '.'
    : daysLeft === 0 ? 'It is due today.'
    : 'It is due ' + prettyDate_(CFG.intakeDeadline) + ' — ' + daysLeft +
      ' day' + (daysLeft === 1 ? '' : 's') + ' left.';

  MailApp.sendEmail({
    to: to.join(','), cc: CFG.coordinatorEmail,
    subject: (daysLeft < 0 ? 'Overdue: ' : 'Please complete: ') +
             'your YMU mentoring availability',
    name: CFG.coordinatorName,
    htmlBody: shell_(
      '<p>Hi ' + String(mentor.name).split(' ')[0] + ',</p>' +
      '<p>Thank you for signing up as a Student Ambassador. Before we can pair you with a ' +
      'student, ' + what + '. ' + urgency + '</p>' +
      '<p>It takes about three minutes: your address so we can suggest the schools nearest ' +
      'you, which of those you could get to, and the times you are free.</p>' +
      (CFG.webAppUrl ? '<p><a href="' + CFG.webAppUrl + '" style="background:#3b4cca;color:#fff;' +
        'padding:10px 18px;border-radius:7px;text-decoration:none;display:inline-block">' +
        'Fill in your availability</a></p>' : '') +
      '<p style="color:#6b7280">If something is getting in the way, just reply to this email.</p>')
  });
  const row = byId_(readTab_('Mentors'), 'mentor_id', mentor.mentor_id);
  if (row) setCell_('Mentors', row._row, 'last_intake_nudge', todayIso_());
}

function notifyManagerReschedule_(s, pair, count) {
  MailApp.sendEmail({
    to: CFG.coordinatorEmail,
    subject: 'Reschedule limit passed: ' + pairLabel_(pair),
    name: CFG.coordinatorName,
    htmlBody: shell_('<p>' + pairLabel_(pair) + ' has now moved their <b>' + s.month +
      '</b> session <b>' + count + ' times</b>, past the limit of ' + CFG.maxReschedules + '.</p>' +
      '<p>Worth a conversation about whether the pairing or the time of day is working.</p>')
  });
}

/* ====================================================================
   Numbers for the digest and the dashboard
   ==================================================================== */

function currentMonthNumber_() {
  const now = new Date();
  const y = Number(Utilities.formatDate(now, CFG.tz, 'yyyy'));
  const m = Number(Utilities.formatDate(now, CFG.tz, 'M'));
  for (let i = 0; i < CFG.sessionMonths.length; i++) {
    const sm = CFG.sessionMonths[i];
    if (CFG.schoolYearStart + sm.y === y && sm.m === m) return sm.n;
  }
  return null;
}

function statsForMonth_(n) {
  const rows = readTab_('Sessions').filter(function (s) { return Number(s.session_no) === Number(n); });
  const count = function (fn) { return rows.filter(fn).length; };
  return {
    required: rows.length,
    scheduled: count(function (s) { return ['scheduled', 'rescheduled'].indexOf(s.status) >= 0; }),
    completed: count(function (s) { return s.status === 'completed'; }),
    unscheduled: count(function (s) { return s.status === 'unscheduled'; }),
    missed: count(function (s) { return s.status === 'missed'; }),
    rescheduled: count(function (s) { return Number(s.reschedules || 0) > 0; }),
    followUp: count(function (s) { return !!s.follow_up; })
  };
}
