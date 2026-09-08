/**
 * YMU Mentoring — when each mentor is free, to the day.
 *
 * Availability is stored as specific dates, not a repeating weekly pattern.
 * A teenager's life does not repeat: they might be free Monday 12 October and
 * then not again for a fortnight. Asking "which Tuesdays can you do?" produces
 * a pattern that is wrong by November and quietly generates sessions nobody
 * can attend. So the mentor picks real dates from a real calendar.
 *
 * Three things have to line up before a date can even be offered:
 *   the school's afterschool programme runs that weekday,
 *   the district calendar says the school is open that day,
 *   and nobody else has that room at that hour.
 */

/** Every specific date+time this mentor has offered, optionally at one school. */
function availabilityFor(mentorId, siteId) {
  return readTab_('Availability').filter(function (a) {
    return a.mentor_id === mentorId && (!siteId || a.site_id === siteId);
  }).map(function (a) {
    return { date: isoOf_(a.date), time: a.time, site_id: a.site_id, _row: a._row };
  });
}

/** The hours a school could run on one specific date — [] if shut. */
function openSlotsOnDate_(site, iso) {
  const wd = weekdayIndex_(iso);
  if (wd > 4) return [];                              // weekends
  if (closureReason_(iso, site.site_id)) return [];   // district or school closure
  return openBlocksOn_(site, wd).map(function (b) { return b + ' PM'; });
}

/**
 * A month of real dates for one school, laid out Monday to Friday, ready to
 * render as a calendar. Each day carries its own slot list.
 *
 * opts.picked   — {"2026-10-12|3:30 PM": true} to mark the mentor's choices
 * opts.onlyPicked — show only slots the mentor already offered (the booking view)
 * opts.excludeSessionId — ignore this session when checking room clashes
 */
function buildMonth(siteId, sessionNo, opts) {
  opts = opts || {};
  const site = getSite_(siteId);
  const sm = monthInfo_(sessionNo);
  if (!sm || !site.site_id) return null;

  const year = CFG.schoolYearStart + sm.y;
  const last = new Date(year, sm.m, 0).getDate();
  const pad = function (n) { return (n < 10 ? '0' : '') + n; };
  const taken = opts.checkTaken ? takenSlots_(siteId, opts.excludeSessionId) : {};
  const picked = opts.picked || {};
  const today = todayIso_();

  const days = [];
  let openDays = 0, pickedCount = 0;

  for (let d = 1; d <= last; d++) {
    const iso = year + '-' + pad(sm.m) + '-' + pad(d);
    const wd = weekdayIndex_(iso);
    if (wd > 4) continue;                       // Mon–Fri only

    const closure = closureReason_(iso, siteId);
    const runsToday = !closure && openBlocksOn_(site, wd).length > 0;
    const past = iso < today;

    let times = [];
    if (runsToday) {
      times = openSlotsOnDate_(site, iso).map(function (t) {
        return {
          time: t,
          picked: !!picked[iso + '|' + t],
          taken: !!taken[iso + '#' + t]
        };
      });
      if (opts.onlyPicked) times = times.filter(function (t) { return t.picked; });
    }
    if (times.length) openDays++;
    pickedCount += times.filter(function (t) { return t.picked; }).length;

    days.push({
      date: iso,
      dayNum: d,
      weekday: CFG.days[wd],
      col: wd,
      closed: !!closure,
      reason: closure || (runsToday ? '' : 'No programme this day'),
      past: past,
      available: times.length > 0 && !past,
      times: times,
      pickedHere: times.filter(function (t) { return t.picked; }).length
    });
  }

  // Pad into calendar weeks so the grid lines up under Mon–Fri headings.
  const weeks = [];
  let week = new Array(5).fill(null);
  days.forEach(function (day) {
    if (day.col === 0 && week.some(function (x) { return x; })) {
      weeks.push(week); week = new Array(5).fill(null);
    }
    week[day.col] = day;
  });
  if (week.some(function (x) { return x; })) weeks.push(week);

  return {
    sessionNo: sm.n,
    label: sm.label + ' ' + year,
    monthName: sm.label,
    siteName: site.name,
    weeks: weeks,
    openDays: openDays,
    picked: pickedCount,
    closedDays: days.filter(function (d) { return d.closed; }).length
  };
}

/** {"2026-10-12|3:30 PM": true} for one mentor at one school. */
function pickedMap_(mentorId, siteId) {
  const map = {};
  availabilityFor(mentorId, siteId).forEach(function (a) {
    map[a.date + '|' + a.time] = true;
  });
  return map;
}

/* ====================================================================
   The rules
   ==================================================================== */

/**
 * How many slots the mentor has offered in each month of the cycle we are
 * currently collecting. Deliberately NOT the whole year — see Cycles.gs.
 */
function monthlyCounts(mentorId, siteId, cycle) {
  cycle = cycle || activeCycle_();
  if (!cycle) return [];
  return cycleCounts(mentorId, siteId, cycle);
}

function validateAvailability(mentorId, siteId, cycle) {
  cycle = cycle || activeCycle_();
  if (!cycle) return { ok: true, problems: [], counts: [], total: 0 };
  return validateCycle(mentorId, siteId, cycle);
}

/** Adds or removes one specific date+time. */
function toggleSlot_(mentorId, siteId, date, time, on) {
  const existing = availabilityFor(mentorId, siteId).filter(function (a) {
    return a.date === date && a.time === time;
  })[0];

  if (on && !existing) {
    appendRow_('Availability', {
      mentor_id: mentorId, site_id: siteId, date: date, time: time, added: todayIso_()
    });
  } else if (!on && existing) {
    sheet_('Availability').deleteRow(existing._row);
  }
}

/** Saves a whole month at once — what the calendar page sends. */
function saveMonthSlots_(mentorId, siteId, monthPrefix, slots) {
  const sh = sheet_('Availability');
  // Clear this mentor's existing picks for this school in this month.
  availabilityFor(mentorId, siteId)
    .filter(function (a) { return a.date.indexOf(monthPrefix) === 0; })
    .sort(function (a, b) { return b._row - a._row; })
    .forEach(function (a) { sh.deleteRow(a._row); });

  const today = todayIso_();
  slots.forEach(function (s) {
    appendRow_('Availability', {
      mentor_id: mentorId, site_id: siteId, date: s.date, time: s.time, added: today
    });
  });
}

/** Rejects anything the school could not actually host. */
function slotsAreLegal_(siteId, slots) {
  const site = getSite_(siteId);
  const bad = [];
  slots.forEach(function (s) {
    const legal = openSlotsOnDate_(site, s.date);
    if (legal.indexOf(s.time) < 0) {
      const why = closureReason_(s.date, siteId);
      bad.push(prettyDate_(s.date) + ' ' + s.time + (why ? ' — ' + why : ' — outside programme hours'));
    }
  });
  return bad;
}

/* ====================================================================
   Intake progress
   ==================================================================== */

function intakeStatus(mentorId, cycle) {
  cycle = cycle || activeCycle_();
  const mentor = getMentor_(mentorId);
  const prefs = String(mentor.site_prefs || '').split(',')
    .map(function (x) { return x.trim(); }).filter(Boolean);

  const status = {
    cycle: cycle ? cycle.id : null,
    cycleMonths: cycle ? cycleMonths_(cycle).map(function (m) { return m.label; }) : [],
    hasAddress: !!(mentor.travel_lat && mentor.travel_lng),
    prefs: prefs,
    hasSites: prefs.length > 0,
    perSite: [],
    complete: false
  };

  prefs.forEach(function (siteId) {
    const v = validateAvailability(mentorId, siteId, cycle);
    status.perSite.push({
      site_id: siteId, name: getSite_(siteId).name,
      total: v.total, ok: v.ok, problems: v.problems, counts: v.counts
    });
  });

  // Only the cycle in front of them decides whether they are ready.
  status.complete = status.hasAddress && status.hasSites &&
    status.perSite.length > 0 &&
    status.perSite.every(function (p) { return p.ok; });
  return status;
}

/**
 * Usable alternatives for a session: dates the mentor offered, the school is
 * open, and nobody has the room — excluding whatever this session currently
 * holds. This is the number the reschedule rule is checked against.
 */
function alternativesFor(pairId, sessionNo, exceptSessionId) {
  const pair = getPair_(pairId);
  const s = exceptSessionId
    ? byId_(readTab_('Sessions'), 'session_id', exceptSessionId) : null;
  const held = s ? isoOf_(s.date) + '#' + s.time : '';
  return sessionOptions(pairId, sessionNo, exceptSessionId)
    .filter(function (o) { return !o.taken && (o.date + '#' + o.time) !== held; });
}

/* ====================================================================
   What a booked session may use
   ==================================================================== */

/**
 * The dates a session can actually be booked on: the mentor offered that exact
 * date and time, the school is open, and the room is free.
 */
function sessionOptions(pairId, sessionNo, exceptSessionId) {
  const pair = getPair_(pairId);
  const site = getSite_(pair.site_id);
  const sm = monthInfo_(sessionNo);
  if (!sm || !site.site_id) return [];

  const year = CFG.schoolYearStart + sm.y;
  const prefix = year + '-' + (sm.m < 10 ? '0' : '') + sm.m + '-';
  const taken = takenSlots_(pair.site_id, exceptSessionId);

  return availabilityFor(pair.mentor_id, pair.site_id)
    .filter(function (a) { return a.date.indexOf(prefix) === 0; })
    .filter(function (a) { return openSlotsOnDate_(site, a.date).indexOf(a.time) >= 0; })
    .sort(function (a, b) { return a.date.localeCompare(b.date) || a.time.localeCompare(b.time); })
    .map(function (a) {
      return {
        date: a.date, time: a.time, label: prettyDate_(a.date),
        taken: !!taken[a.date + '#' + a.time]
      };
    });
}
