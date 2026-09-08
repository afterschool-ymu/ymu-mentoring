/**
 * YMU Mentoring — sessions, booking, and calendar invitations.
 *
 * The rule: a session may only land on a date and time the school's
 * afterschool program actually runs, and only one pair may use a site at
 * any one time. The mentor picks from what's left.
 */

/** Every approved pair owes 7 sessions. They start life unscheduled. */
function ensureSessions() {
  const pairs = readTab_('Pairs').filter(function (p) { return p.approved === true || p.approved === 'TRUE'; });
  const existing = {};
  readTab_('Sessions').forEach(function (s) {
    existing[s.pair_id + '#' + s.session_no] = true;
  });
  let made = 0;
  pairs.forEach(function (p) {
    CFG.sessionMonths.forEach(function (sm) {
      if (existing[p.pair_id + '#' + sm.n]) return;
      appendRow_('Sessions', {
        session_id: uid_('ses'), pair_id: p.pair_id, session_no: sm.n,
        month: sm.label, date: '', time: '', status: 'unscheduled',
        reschedules: 0
      });
      made++;
    });
  });
  log_('Sessions', 'Created ' + made + ' session rows');
  return made;
}

// sessionOptions() lives in Availability.gs — the dates a mentor is shown
// depend on what they declared at intake, not just the school's opening hours.

/** Map of "date#time" already in use at a site, for room-conflict checks. */
function takenSlots_(siteId, exceptSessionId) {
  const pairsAtSite = {};
  readTab_('Pairs').forEach(function (p) {
    if (p.site_id === siteId) pairsAtSite[p.pair_id] = true;
  });
  const out = {};
  readTab_('Sessions').forEach(function (s) {
    if (s.session_id === exceptSessionId) return;
    if (!s.date || !s.time) return;
    if (['missed', 'cancelled'].indexOf(s.status) >= 0) return;
    if (!pairsAtSite[s.pair_id]) return;
    out[s.date + '#' + s.time] = s.session_id;
  });
  return out;
}

/**
 * Book or move one session. This is the only place a date is written, so
 * it is also the only place a calendar invitation is created or updated.
 *
 * Returns {ok, message, escalated}.
 */
function bookSession(sessionId, date, time, opts) {
  opts = opts || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, message: 'Someone else is booking right now. Try again in a moment.' };
  }
  try {
    const rows = readTab_('Sessions');
    const s = byId_(rows, 'session_id', sessionId);
    if (!s) return { ok: false, message: 'That session no longer exists.' };
    if (['completed', 'missed'].indexOf(s.status) >= 0) {
      return { ok: false, message: 'That session is already closed out and cannot be moved.' };
    }
    const pair = getPair_(s.pair_id);

    // Clearing the booking
    if (!date || !time) {
      if (s.event_id) deleteEvent_(s.event_id);
      writeSession_(s._row, { date: '', time: '', status: 'unscheduled', event_id: '',
                              invite_sent: '', remind_week: '', remind_day: '', remind_dayof: '' });
      return { ok: true, message: 'Booking cleared.' };
    }

    // Is this date+time actually allowed at this school?
    const site = getSite_(pair.site_id);
    const allowed = openBlocksOn_(site, weekdayIndex_(date))
      .map(function (b) { return b + ' PM'; });
    if (allowed.indexOf(time) < 0) {
      return { ok: false, message: prettyDate_(date) + ' at ' + time +
               ' is outside ' + site.name + "'s afterschool hours." };
    }
    const sm = monthInfo_(s.session_no);
    if (isoParts_(date).m !== sm.m) {
      return { ok: false, message: 'Session ' + s.session_no + ' has to fall in ' + sm.label + '.' };
    }

    // Is the site free then?
    const taken = takenSlots_(pair.site_id, sessionId);
    if (taken[date + '#' + time]) {
      const other = byId_(rows, 'session_id', taken[date + '#' + time]);
      const otherPair = getPair_(other.pair_id);
      return { ok: false, message: 'That time at ' + site.name + ' is already taken by ' +
               getMentor_(otherPair.mentor_id).name + ' and ' +
               getMentee_(otherPair.mentee_id).name + '. Please pick another.' };
    }

    const moving = !!(isoOf_(s.date) && (isoOf_(s.date) !== date || s.time !== time));

    // The reschedule rule: moving a session must leave the mentee real choice.
    // A mentor whose only remaining option is the one they just vacated has
    // not rescheduled, they have cornered the family.
    if (moving && !opts.skipAlternativeCheck) {
      const alts = alternativesFor(s.pair_id, s.session_no, s.session_id)
        .filter(function (o) { return !(o.date === date && o.time === time); });
      if (alts.length < CFG.minAlternativesToReschedule) {
        return { ok: false, needsMoreAvailability: true,
          message: 'Moving this session would leave only ' + alts.length +
            ' other time' + (alts.length === 1 ? '' : 's') + ' on offer for ' +
            monthInfo_(s.session_no).label + '. We need at least ' +
            CFG.minAlternativesToReschedule + ' full hours available so there is ' +
            'somewhere to go if this one falls through too. Please add more ' +
            'availability for that month first, then move the session.' };
      }
    }

    const reschedules = Number(s.reschedules || 0) + (moving ? 1 : 0);

    // Calendar: create on first booking, patch on a move. Google emails
    // everyone either way, which costs nothing against the mail quota.
    let eventId = s.event_id;
    const patch = { date: date, time: time, reschedules: reschedules,
                    status: moving ? 'rescheduled' : 'scheduled',
                    picked_by: opts.pickedBy || 'manager' };
    try {
      if (eventId) {
        updateEvent_(eventId, s, pair, date, time);
      } else {
        eventId = createEvent_(s, pair, date, time);
        patch.event_id = eventId;
        patch.invite_sent = todayIso_();
      }
      // A fresh date means the old reminders no longer apply.
      patch.remind_week = ''; patch.remind_day = ''; patch.remind_dayof = '';
      patch.closeout_asked = '';
    } catch (err) {
      log_('Calendar error', err.message);
      return { ok: false, message: 'Saved nothing — the calendar refused the booking: ' + err.message };
    }

    writeSession_(s._row, patch);
    rememberUsualTime_(pair, date, time);
    log_('Booking', getMentor_(pair.mentor_id).name + ' ' + sm.label + ' → ' +
                    date + ' ' + time + (moving ? ' (move ' + reschedules + ')' : ''));

    const escalated = reschedules > CFG.maxReschedules;
    if (escalated) notifyManagerReschedule_(s, pair, reschedules);

    return {
      ok: true,
      escalated: escalated,
      message: 'Booked for ' + prettyDate_(date) + ' at ' + time +
               '. Calendar invitations are on their way to everyone.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Consistency is worth a lot here: the same afternoon every month is easier
 * for a family to remember, easier for site staff to staff, and produces far
 * fewer reschedules. So the first booking sets the pair's usual slot, and
 * later months default to it.
 */
function rememberUsualTime_(pair, date, time) {
  const mentee = getMentee_(pair.mentee_id);
  if (!mentee.mentee_id) return;
  if (mentee.usual_day && mentee.usual_time) return;   // already set
  const row = byId_(readTab_('Mentees'), 'mentee_id', pair.mentee_id);
  if (!row) return;
  setCell_('Mentees', row._row, 'usual_day', CFG.days[weekdayIndex_(date)]);
  setCell_('Mentees', row._row, 'usual_time', time);
}

/** The pair's usual weekday+time, if they have settled into one. */
function usualSlotFor_(pair) {
  const mentee = getMentee_(pair.mentee_id);
  if (!mentee.usual_day || !mentee.usual_time) return null;
  return { day: mentee.usual_day, time: mentee.usual_time };
}

/**
 * The option in a month that matches the pair's usual slot — what we suggest
 * first so both sides are nudged towards keeping the same time all year.
 */
function suggestedOption_(pairId, sessionNo) {
  const pair = getPair_(pairId);
  const usual = usualSlotFor_(pair);
  if (!usual) return null;
  const opts = sessionOptions(pairId, sessionNo).filter(function (o) { return !o.taken; });
  return opts.filter(function (o) {
    return CFG.days[weekdayIndex_(o.date)] === usual.day && o.time === usual.time;
  })[0] || null;
}

function writeSession_(row, patch) {
  const sh = sheet_('Sessions');
  Object.keys(patch).forEach(function (k) {
    const col = HEADERS.Sessions.indexOf(k) + 1;
    if (col > 0) sh.getRange(row, col).setValue(patch[k]);
  });
}

/* ====================================================================
   Calendar
   Uses the advanced Calendar service so we can pass sendUpdates:'all' and
   be certain guests are emailed on both creation and changes.
   ==================================================================== */

function eventBody_(s, pair, date, time) {
  const mentor = getMentor_(pair.mentor_id);
  const mentee = getMentee_(pair.mentee_id);
  const site = getSite_(pair.site_id);
  const start = toDate_(date, time);
  const end = new Date(start.getTime() + CFG.sessionMinutes * 60000);
  const sm = monthInfo_(s.session_no);

  return {
    summary: 'YMU mentoring: ' + mentee.name + ' + ' + mentor.name + ' (' + pair.instrument + ')',
    location: site.address || site.name,
    description:
      'Session ' + s.session_no + ' of ' + CFG.sessionMonths.length + ' — ' + sm.label + '\n\n' +
      'Student: ' + mentee.name + '\n' +
      'Student Ambassador: ' + mentor.name + '\n' +
      'Instrument: ' + pair.instrument + '\n' +
      'Where: ' + site.name + (site.address ? ', ' + site.address : '') + '\n\n' +
      'A supervising adult from the afterschool program must be present. If nobody ' +
      'from the school is there, the session does not go ahead — contact ' +
      CFG.coordinatorEmail + '.\n\n' +
      'To change this date, the mentor should use the booking page rather than ' +
      'replying here.' + (CFG.webAppUrl ? '\n' + CFG.webAppUrl : ''),
    start: { dateTime: Utilities.formatDate(start, CFG.tz, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: CFG.tz },
    end:   { dateTime: Utilities.formatDate(end,   CFG.tz, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: CFG.tz },
    attendees: recipients_(pair).map(function (e) { return { email: e }; }),
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,   // families do not see each other's addresses
    guestsCanModify: false,
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] }
  };
}

function createEvent_(s, pair, date, time) {
  const ev = Calendar.Events.insert(eventBody_(s, pair, date, time), calendarId_(),
                                    { sendUpdates: 'all' });
  return ev.id;
}

function updateEvent_(eventId, s, pair, date, time) {
  Calendar.Events.patch(eventBody_(s, pair, date, time), calendarId_(), eventId,
                        { sendUpdates: 'all' });
}

function deleteEvent_(eventId) {
  try {
    Calendar.Events.remove(calendarId_(), eventId, { sendUpdates: 'all' });
  } catch (e) {
    log_('Calendar delete failed', e.message);
  }
}
