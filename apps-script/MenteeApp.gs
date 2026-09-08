/**
 * YMU Mentoring — the student's side.
 *
 * A completely separate audience from the mentor. The mentor says when they
 * could come; the student (or their guardian) chooses which of those times
 * actually works. That way the family picks the hour that fits round pickup,
 * siblings and homework, instead of being handed one.
 *
 * Two ways in, because many afterschool students have no Google account:
 *   ?token=…  a private link, emailed to the guardian — no sign-in at all
 *   signed in with a Google address that matches student_email or guardian_email
 *
 * The token is the only secret. It is long, random, per-student, and grants
 * access to exactly one student's sessions — nothing else in the system.
 */

/** Creates access tokens for any mentee missing one. */
function issueMenteeTokens() {
  let made = 0;
  readTab_('Mentees').forEach(function (m) {
    if (m.access_token) return;
    setCell_('Mentees', m._row, 'access_token',
      Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
    made++;
  });
  log_('Tokens', 'Issued ' + made + ' mentee access links');
  notify_(made + ' private links created.\n\n' +
    'Each student now has an access_token on the Mentees tab. Their link is:\n\n' +
    (CFG.webAppUrl || '<your web app URL>') + '?token=THEIR_TOKEN\n\n' +
    'Use menu → "Email students their booking links" to send them, or copy one to test.\n\n' +
    'Treat these like passwords: the link is all somebody needs to see that ' +
    "student's sessions.");
  return made;
}

function menteeLink_(mentee) {
  if (!CFG.webAppUrl || !mentee.access_token) return '';
  return CFG.webAppUrl + '?token=' + mentee.access_token;
}

/** Resolves whoever is asking into a single mentee, or an error. */
function menteeFromRequest_(e) {
  const token = e && e.parameter && e.parameter.token ? String(e.parameter.token).trim() : '';
  const rows = readTab_('Mentees');

  if (token) {
    const hit = rows.filter(function (m) {
      return String(m.access_token || '').trim() === token;
    })[0];
    if (hit) return { ok: true, mentee: hit, via: 'link' };
    return { ok: false, error: 'badtoken' };
  }

  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return { ok: false, error: 'nosignin' };
  const hit = rows.filter(function (m) {
    return String(m.student_email || '').toLowerCase() === email ||
           String(m.guardian_email || '').toLowerCase() === email;
  })[0];
  if (hit) return { ok: true, mentee: hit, via: 'google' };
  return { ok: false, error: 'unknown', email: email };
}

/** Everything this student is allowed to see. Nothing about anyone else. */
function menteeData_(e) {
  const who = menteeFromRequest_(e);
  if (!who.ok) return { mode: 'menteeError', error: who.error, email: who.email || '',
                        contact: CFG.coordinatorEmail };

  const mentee = who.mentee;
  const pair = readTab_('Pairs').filter(function (p) {
    return p.mentee_id === mentee.mentee_id && (p.approved === true || p.approved === 'TRUE');
  })[0];

  if (!pair) {
    return { mode: 'menteeWaiting', firstName: String(mentee.name).split(' ')[0],
             name: mentee.name, contact: CFG.coordinatorEmail };
  }

  const mentor = getMentor_(pair.mentor_id);
  const site = getSite_(pair.site_id);
  const today = todayIso_();
  const usual = usualSlotFor_(pair);

  const sessions = readTab_('Sessions')
    .filter(function (s) { return s.pair_id === pair.pair_id; })
    .sort(function (a, b) { return Number(a.session_no) - Number(b.session_no); })
    .map(function (s) {
      const done = ['completed', 'missed'].indexOf(s.status) >= 0;
      const grid = done ? null : buildMonth(pair.site_id, s.session_no, {
        picked: pickedMap_(pair.mentor_id, pair.site_id),
        onlyPicked: true, checkTaken: true, excludeSessionId: s.session_id
      });
      const suggestion = done ? null : suggestedOption_(pair.pair_id, s.session_no);
      const date = isoOf_(s.date);
      return {
        id: s.session_id,
        no: Number(s.session_no),
        month: s.month,
        date: date,
        pretty: date ? prettyDate_(date) : '',
        time: s.time || '',
        status: s.status,
        past: !!(date && daysBetween_(today, date) < 0),
        grid: grid,
        suggestion: suggestion,
        matchesUsual: !!(usual && date &&
          CFG.days[weekdayIndex_(date)] === usual.day && s.time === usual.time)
      };
    });

  return {
    mode: 'mentee',
    name: mentee.name,
    firstName: String(mentee.name).split(' ')[0],
    mentorFirst: String(mentor.name || '').split(' ')[0],
    mentorName: mentor.name || '',
    instrument: pair.instrument,
    site: site.name,
    address: site.address || '',
    coordinator: CFG.coordinatorEmail,
    usual: usual,
    via: who.via,
    total: sessions.length,
    unbooked: sessions.filter(function (s) { return s.status === 'unscheduled'; }).length,
    sessions: sessions
  };
}

/* ====================================================================
   The student choosing a time
   ==================================================================== */

/** Confirms this session really belongs to the student who is asking. */
function menteeOwns_(token, email, sessionId) {
  const rows = readTab_('Mentees');
  let mentee = null;
  if (token) {
    mentee = rows.filter(function (m) {
      return String(m.access_token || '').trim() === String(token).trim();
    })[0];
  }
  if (!mentee) {
    const who = String(email || Session.getActiveUser().getEmail() || '').toLowerCase();
    if (who) {
      mentee = rows.filter(function (m) {
        return String(m.student_email || '').toLowerCase() === who ||
               String(m.guardian_email || '').toLowerCase() === who;
      })[0];
    }
  }
  if (!mentee) return { ok: false, message: 'We could not confirm who you are. ' +
    'Please reopen the link from your email.' };

  const s = byId_(readTab_('Sessions'), 'session_id', sessionId);
  if (!s) return { ok: false, message: 'That session no longer exists.' };
  const pair = getPair_(s.pair_id);
  if (pair.mentee_id !== mentee.mentee_id) {
    log_('Blocked', 'Mentee ' + mentee.mentee_id + ' tried to touch session ' + sessionId);
    return { ok: false, message: 'That session belongs to a different student.' };
  }
  return { ok: true, mentee: mentee, session: s, pair: pair };
}

/**
 * The student picks their time. This is the normal way a session gets booked.
 */
function apiMenteePick(token, sessionId, date, time) {
  const guard = menteeOwns_(token, null, sessionId);
  if (!guard.ok) return { ok: false, message: guard.message };

  if (!date || !time) {
    return { ok: false, message: 'Please choose a day and a time.' };
  }
  // The student may only choose from what the mentor actually offered.
  const offered = sessionOptions(guard.pair.pair_id, guard.session.session_no, sessionId)
    .filter(function (o) { return o.date === date && o.time === time && !o.taken; })[0];
  if (!offered) {
    return { ok: false, message: 'That time is not available any more. ' +
      'Please pick another from the calendar.' };
  }

  const res = bookSession(sessionId, date, time,
                          { pickedBy: 'mentee', skipAlternativeCheck: true });
  if (!res.ok) return { ok: false, message: res.message };

  notifyMentorOfPick_(guard.pair, guard.session, date, time);
  return { ok: true, message: 'Booked for ' + prettyDate_(date) + ' at ' + time +
    '. Everyone will get a calendar invitation.',
    data: menteeData_({ parameter: { token: token } }) };
}

function notifyMentorOfPick_(pair, session, date, time) {
  const mentor = getMentor_(pair.mentor_id);
  const mentee = getMentee_(pair.mentee_id);
  const to = [mentor.email, mentor.guardian1_email, mentor.guardian2_email]
    .filter(function (x) { return x && /@/.test(x); });
  if (!to.length) return;
  MailApp.sendEmail({
    to: to.join(','), cc: CFG.coordinatorEmail,
    subject: mentee.name + ' picked a time for your ' + session.month + ' session',
    name: CFG.coordinatorName,
    htmlBody: shell_('<p>Hi ' + String(mentor.name).split(' ')[0] + ',</p>' +
      '<p><b>' + mentee.name + '</b> has chosen <b>' + prettyDate_(date) + ' at ' + time +
      '</b> from the times you offered at ' + getSite_(pair.site_id).name + '.</p>' +
      '<p>A calendar invitation is on its way. Nothing more to do unless you need to move it.</p>')
  });
}
