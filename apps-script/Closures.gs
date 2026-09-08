/**
 * YMU Mentoring — days the schools are shut.
 *
 * Source: Miami-Dade County Public Schools "2026-2027 School Calendar —
 * Elementary and Secondary", approved by the School Board on 23 January 2025.
 * Cross-checked against the district's Technical/Adult calendar and the
 * press release announcing approval; the published instructional-day counts
 * (45 + 46 + 42 + 47 = 180) reconcile exactly against this list, which is how
 * we know no non-student day in the window is missing.
 *
 * A wrong date here means offering a family a session on a day the school is
 * locked, so these are treated as hard blocks: no date on this list can be
 * offered or booked, and the mentor is told why.
 *
 * Individual schools sometimes add their own closures — hurricane make-up
 * days, testing, school events. Add those to the Closures tab with the
 * site_id filled in, and they apply to that school only.
 */

// Only the Oct–Apr window matters, because that is when sessions run.
// Weekdays only; weekends are excluded everywhere anyway.
const MDCPS_CLOSURES = [
  // October 2026 — clear, no closures at all.

  ['2026-11-03', 'Teacher planning day'],
  ['2026-11-11', 'Veterans Day'],
  ['2026-11-23', 'Thanksgiving recess'],
  ['2026-11-24', 'Thanksgiving recess'],
  ['2026-11-25', 'Thanksgiving recess'],
  ['2026-11-26', 'Thanksgiving Day'],
  ['2026-11-27', 'Recess day'],

  ['2026-12-18', 'Teacher planning day'],
  ['2026-12-21', 'Winter recess'],
  ['2026-12-22', 'Winter recess'],
  ['2026-12-23', 'Winter recess'],
  ['2026-12-24', 'Winter recess'],
  ['2026-12-25', 'Winter recess'],
  ['2026-12-28', 'Winter recess'],
  ['2026-12-29', 'Winter recess'],
  ['2026-12-30', 'Winter recess'],
  ['2026-12-31', 'Winter recess'],

  ['2027-01-01', 'Winter recess'],
  ['2027-01-15', 'Teacher planning day'],
  ['2027-01-18', 'Martin Luther King Jr. Day'],

  ['2027-02-15', 'Presidents Day'],

  ['2027-03-10', 'Teacher planning day'],
  ['2027-03-22', 'Spring recess'],
  ['2027-03-23', 'Spring recess'],
  ['2027-03-24', 'Spring recess'],
  ['2027-03-25', 'Spring recess'],
  ['2027-03-26', 'Spring recess'],
  ['2027-03-29', 'Teacher planning day']

  // April 2027 — clear, no closures at all.
];

/** Loads the district calendar into the Closures tab. Safe to re-run. */
function loadClosures() {
  const have = {};
  readTab_('Closures').forEach(function (c) {
    have[isoOf_(c.date) + '|' + (c.site_id || '')] = true;
  });
  let added = 0;
  MDCPS_CLOSURES.forEach(function (r) {
    if (have[r[0] + '|']) return;
    appendRow_('Closures', { date: r[0], reason: r[1], site_id: '', source: 'MDCPS 2026-27' });
    added++;
  });
  log_('Closures', 'Loaded ' + added + ' district closure days');
  notify_(
    added + ' closure days loaded from the MDCPS 2026-27 calendar.\n\n' +
    'December loses 10 weekdays and March loses 6 in a row (spring recess runs straight ' +
    'into the 29 March planning day). October and April are completely clear.\n\n' +
    'To add a closure for one school only — a hurricane day, testing, a school event — ' +
    'add a row and put that school\'s site_id in. Leave site_id blank for a district-wide day.\n\n' +
    'Note: every Wednesday, K-8 centres release grades 2-8 an hour early. If that shortens ' +
    'a site\'s Wednesday programme, edit that site\'s hours.');
}

/** Sheet dates can come back as Date objects; normalise to yyyy-MM-dd. */
function isoOf_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, CFG.tz, 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

/**
 * Closure lookup, built once per call chain and cached on the script's
 * execution so a month grid doesn't re-read the tab forty times.
 */
let _closureCache = null;
function closureMap_() {
  if (_closureCache) return _closureCache;
  const map = {};
  readTab_('Closures').forEach(function (c) {
    const iso = isoOf_(c.date);
    if (!iso) return;
    const key = iso + '|' + (c.site_id || '');
    map[key] = c.reason || 'School closed';
  });
  _closureCache = map;
  return map;
}
function clearClosureCache_() { _closureCache = null; }

/** Why a date is unavailable at a site, or null if it is fine. */
function closureReason_(iso, siteId) {
  const map = closureMap_();
  return map[iso + '|'] || map[iso + '|' + siteId] || null;
}
