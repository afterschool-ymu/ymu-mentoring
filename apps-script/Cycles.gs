/**
 * YMU Mentoring — collection cycles.
 *
 * Availability is gathered two months at a time, not for the whole year:
 *
 *   C1  collected in September  covers October and November
 *   C2  collected in November   covers December and January
 *   C3  collected in January    covers February and March
 *   C4  collected in March      covers April
 *
 * Asking a teenager in September what they are doing next April produces an
 * answer nobody should rely on. So a mentor is only ever asked about the
 * cycle in front of them, and only that cycle blocks them from being matched.
 *
 * When the next cycle opens they are asked to update. If they do not, we carry
 * the same weekdays and times forward — which is why the form pushes them to
 * keep a consistent pattern. Carried-forward availability is then re-checked
 * against the school calendar, because a pattern that gave three dates in
 * October can give one in December once winter recess is taken out.
 */

/** The cycle that covers a given session month. */
function cycleForMonth_(sessionNo) {
  for (let i = 0; i < CFG.cycles.length; i++) {
    if (CFG.cycles[i].covers.indexOf(Number(sessionNo)) >= 0) return CFG.cycles[i];
  }
  return null;
}

function cycleById_(id) {
  for (let i = 0; i < CFG.cycles.length; i++) {
    if (CFG.cycles[i].id === id) return CFG.cycles[i];
  }
  return null;
}

/** Last calendar day of the last month a cycle covers. */
function cycleEnd_(cycle) {
  const lastNo = cycle.covers[cycle.covers.length - 1];
  const sm = monthInfo_(lastNo);
  const year = CFG.schoolYearStart + sm.y;
  return year + '-' + (sm.m < 10 ? '0' : '') + sm.m + '-' + new Date(year, sm.m, 0).getDate();
}

/** First calendar day of the first month a cycle covers. */
function cycleStart_(cycle) {
  const sm = monthInfo_(cycle.covers[0]);
  const year = CFG.schoolYearStart + sm.y;
  return year + '-' + (sm.m < 10 ? '0' : '') + sm.m + '-01';
}

/**
 * The cycle we are COLLECTING availability for right now — the most recent one
 * whose collection window has opened.
 *
 * This is not the same as the cycle whose sessions are running, and conflating
 * the two is an easy mistake to make. In early November, C1's November sessions
 * are still happening, but the thing we need from mentors is their December and
 * January availability. So November collects C2.
 *
 * Before the season opens at all, this is C1 — that is what a new mentor fills in.
 */
function activeCycle_(today) {
  today = today || todayIso_();
  let found = null;
  for (let i = 0; i < CFG.cycles.length; i++) {
    if (CFG.cycles[i].collectFrom <= today) found = CFG.cycles[i];
  }
  return found || CFG.cycles[0];
}

/**
 * The cycle whose sessions are currently running — the earliest one whose
 * months have not all finished. Used for reporting, not for collection.
 */
function runningCycle_(today) {
  today = today || todayIso_();
  for (let i = 0; i < CFG.cycles.length; i++) {
    if (cycleEnd_(CFG.cycles[i]) >= today) return CFG.cycles[i];
  }
  return null;    // the whole year is behind us
}

/** True once we have started asking mentors about this cycle. */
function cycleIsOpen_(cycle, today) {
  today = today || todayIso_();
  return today >= cycle.collectFrom;
}

/** The cycle after this one, or null. */
function nextCycle_(cycle) {
  const i = CFG.cycles.map(function (c) { return c.id; }).indexOf(cycle.id);
  return (i >= 0 && i + 1 < CFG.cycles.length) ? CFG.cycles[i + 1] : null;
}
function prevCycle_(cycle) {
  const i = CFG.cycles.map(function (c) { return c.id; }).indexOf(cycle.id);
  return i > 0 ? CFG.cycles[i - 1] : null;
}

/** The session months inside a cycle, as {n, label, monthPrefix}. */
function cycleMonths_(cycle) {
  return cycle.covers.map(function (n) {
    const sm = monthInfo_(n);
    const year = CFG.schoolYearStart + sm.y;
    return {
      n: n, label: sm.label, year: year,
      prefix: year + '-' + (sm.m < 10 ? '0' : '') + sm.m + '-'
    };
  });
}

/* ====================================================================
   Per-mentor, per-cycle bookkeeping
   ==================================================================== */

function cycleLogFor_(mentorId, cycleId) {
  return readTab_('CycleLog').filter(function (r) {
    return r.mentor_id === mentorId && r.cycle_id === cycleId;
  })[0] || null;
}

function markCycle_(mentorId, cycleId, field, value) {
  const row = cycleLogFor_(mentorId, cycleId);
  if (row) {
    setCell_('CycleLog', row._row, field, value === undefined ? todayIso_() : value);
  } else {
    const o = { mentor_id: mentorId, cycle_id: cycleId };
    o[field] = value === undefined ? todayIso_() : value;
    appendRow_('CycleLog', o);
  }
}

/* ====================================================================
   Carrying a pattern forward
   ==================================================================== */

/**
 * The weekday+time pattern a mentor used in a cycle, e.g.
 * [{day:'Tue', time:'3:30 PM'}, {day:'Thu', time:'4:00 PM'}]
 */
function patternFrom_(mentorId, siteId, cycle) {
  const months = cycleMonths_(cycle);
  const seen = {}, out = [];
  availabilityFor(mentorId, siteId).forEach(function (a) {
    const inCycle = months.some(function (m) { return a.date.indexOf(m.prefix) === 0; });
    if (!inCycle) return;
    const day = CFG.days[weekdayIndex_(a.date)];
    const key = day + '|' + a.time;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ day: day, time: a.time });
  });
  return out;
}

/**
 * Applies a weekday+time pattern to every valid date in a cycle. Skips
 * closures, weekends, and anything outside the school's hours — which is
 * exactly how a carried-forward pattern quietly shrinks over the holidays.
 */
function applyPattern_(mentorId, siteId, cycle, pattern) {
  const site = getSite_(siteId);
  let added = 0;
  cycleMonths_(cycle).forEach(function (m) {
    const sm = monthInfo_(m.n);
    const last = new Date(m.year, sm.m, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const iso = m.prefix + (d < 10 ? '0' : '') + d;
      const wd = weekdayIndex_(iso);
      if (wd > 4) continue;
      const legal = openSlotsOnDate_(site, iso);
      if (!legal.length) continue;
      const dayName = CFG.days[wd];
      pattern.forEach(function (p) {
        if (p.day !== dayName) return;
        if (legal.indexOf(p.time) < 0) return;
        const already = availabilityFor(mentorId, siteId).some(function (a) {
          return a.date === iso && a.time === p.time;
        });
        if (already) return;
        appendRow_('Availability', {
          mentor_id: mentorId, site_id: siteId, date: iso, time: p.time,
          added: todayIso_() + ' (carried forward)'
        });
        added++;
      });
    }
  });
  return added;
}

/* ====================================================================
   Cycle-scoped validation
   ==================================================================== */

/** How many slots a mentor has offered in each month of one cycle. */
function cycleCounts(mentorId, siteId, cycle) {
  const mine = availabilityFor(mentorId, siteId);
  return cycleMonths_(cycle).map(function (m) {
    const n = mine.filter(function (a) { return a.date.indexOf(m.prefix) === 0; }).length;
    return { n: m.n, label: m.label, count: n, ok: n >= CFG.minSlotsPerMonth };
  });
}

/**
 * Is this mentor ready for this cycle at this school?
 * Only the cycle's own months are checked — never the whole year.
 */
function validateCycle(mentorId, siteId, cycle) {
  const counts = cycleCounts(mentorId, siteId, cycle);
  const short = counts.filter(function (c) { return !c.ok; });
  const problems = [];
  if (short.length) {
    problems.push('Every month in this cycle needs at least ' + CFG.minSlotsPerMonth +
      ' times at ' + getSite_(siteId).name + '. Still short: ' +
      short.map(function (c) { return c.label + ' (' + c.count + ')'; }).join(', ') + '.');
  }
  return {
    ok: problems.length === 0,
    problems: problems,
    counts: counts,
    total: counts.reduce(function (a, c) { return a + c.count; }, 0)
  };
}
