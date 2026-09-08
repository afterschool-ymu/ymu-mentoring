/**
 * YMU Mentoring — working out which schools are actually near a mentor.
 *
 * Uses the Maps service built into Apps Script. No API key and no billing:
 * Google Workspace allows 10,000 geocode calls and 10,000 direction queries a
 * day, and this whole programme needs roughly a hundred, once.
 *
 * The point of all this is to cut travel. A 16-year-old getting themselves
 * across Miami on a school afternoon is the thing most likely to make a
 * session quietly stop happening, so proximity is ranked before anything else.
 */

/* ====================================================================
   Geocoding
   ==================================================================== */

/**
 * Fills in lat/lng for every site that doesn't have them. Run once from the
 * menu after loading the sites; safe to re-run, it skips anything already done.
 */
function geocodeSites() {
  const rows = readTab_('Sites');
  let done = 0, failed = [];
  rows.forEach(function (s) {
    if (s.lat && s.lng) return;
    if (!s.address) { failed.push(s.name + ' (no address)'); return; }
    const pt = geocode_(s.address);
    if (!pt) { failed.push(s.name); return; }
    setCell_('Sites', s._row, 'lat', pt.lat);
    setCell_('Sites', s._row, 'lng', pt.lng);
    done++;
    Utilities.sleep(200);        // be gentle with the service
  });
  const msg = done + ' sites located.' +
    (failed.length ? '\n\nCould not locate: ' + failed.join(', ') +
     '\nCheck the address column for those.' : '');
  log_('Geocode', msg.replace(/\n/g, ' '));
  notify_(msg);
  return { done: done, failed: failed };
}

function geocode_(address) {
  try {
    const res = Maps.newGeocoder().setRegion('us').geocode(address);
    if (!res || res.status !== 'OK' || !res.results.length) {
      log_('Geocode failed', address + ' → ' + (res && res.status));
      return null;
    }
    const loc = res.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng, formatted: res.results[0].formatted_address };
  } catch (err) {
    log_('Geocode error', address + ' → ' + err.message);
    return null;
  }
}

/* ====================================================================
   Distance
   ==================================================================== */

/** Straight-line miles. Free, instant, and good enough to sort by. */
function milesBetween_(aLat, aLng, bLat, bLng) {
  const R = 3958.8;
  const toRad = function (d) { return d * Math.PI / 180; };
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Driving minutes. Straight-line distance is a poor guide in Miami — a site
 * three miles away across a causeway can take longer than one six miles down
 * a highway — so the shortlist gets real drive times.
 */
function driveMinutes_(fromLat, fromLng, toLat, toLng) {
  try {
    const d = Maps.newDirectionFinder()
      .setOrigin(fromLat, fromLng)
      .setDestination(toLat, toLng)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();
    if (!d || !d.routes || !d.routes.length) return null;
    const legs = d.routes[0].legs;
    let secs = 0;
    for (let i = 0; i < legs.length; i++) secs += legs[i].duration.value;
    return Math.round(secs / 60);
  } catch (err) {
    log_('Directions error', err.message);
    return null;   // fall back to straight-line ordering
  }
}

/* ====================================================================
   Ranking schools for one mentor
   ==================================================================== */

/**
 * Every active site that runs a programme, sorted nearest first.
 * The mentor's own school, if it is also a site, is pushed to the top —
 * zero travel beats everything.
 *
 * Returns [{site_id, name, address, hours, miles, driveMins, isOwnSchool, suggested}]
 */
function rankSitesFor(mentorId, opts) {
  opts = opts || {};
  const mentor = getMentor_(mentorId);
  const sites = readTab_('Sites').filter(function (s) {
    return (s.active === true || s.active === 'TRUE') && s.hours;
  });

  const from = { lat: Number(mentor.travel_lat), lng: Number(mentor.travel_lng) };
  const haveOrigin = !!(from.lat && from.lng);

  const ranked = sites.map(function (s) {
    const sameSchool = !!(mentor.school && s.name &&
      normaliseSchool_(mentor.school) === normaliseSchool_(s.name));
    return {
      site_id: s.site_id,
      name: s.name,
      address: s.address,
      hours: s.hours,
      readableHours: readableHours_(s),
      isOwnSchool: sameSchool,
      miles: (haveOrigin && s.lat && s.lng)
        ? Math.round(milesBetween_(from.lat, from.lng, Number(s.lat), Number(s.lng)) * 10) / 10
        : null,
      driveMins: null
    };
  });

  ranked.sort(function (a, b) {
    if (a.isOwnSchool !== b.isOwnSchool) return a.isOwnSchool ? -1 : 1;
    if (a.miles === null && b.miles === null) return a.name.localeCompare(b.name);
    if (a.miles === null) return 1;
    if (b.miles === null) return -1;
    return a.miles - b.miles;
  });

  // Real drive times, but only for the shortlist — each one is an API call.
  if (haveOrigin && opts.withDriveTimes !== false) {
    ranked.slice(0, CFG.suggestCount + 2).forEach(function (r) {
      if (r.isOwnSchool) { r.driveMins = 0; return; }
      const site = getSite_(r.site_id);
      if (!site.lat || !site.lng) return;
      r.driveMins = driveMinutes_(from.lat, from.lng, Number(site.lat), Number(site.lng));
    });
    // Re-sort the shortlist on drive time where we have it.
    const head = ranked.slice(0, CFG.suggestCount + 2).sort(function (a, b) {
      if (a.isOwnSchool !== b.isOwnSchool) return a.isOwnSchool ? -1 : 1;
      if (a.driveMins == null && b.driveMins == null) return (a.miles || 0) - (b.miles || 0);
      if (a.driveMins == null) return 1;
      if (b.driveMins == null) return -1;
      return a.driveMins - b.driveMins;
    });
    ranked.splice(0, head.length);
    head.forEach(function (h, i) { ranked.splice(i, 0, h); });
  }

  ranked.forEach(function (r, i) { r.suggested = i < CFG.suggestCount; });
  return ranked;
}

/** "Miami Beach Senior High School" and "Miami Beach Senior High" are the same place. */
function normaliseSchool_(name) {
  return String(name).toLowerCase()
    .replace(/\b(senior|high|school|center|centre|academy|k-8|middle)\b/g, '')
    .replace(/[^a-z]/g, '');
}

/** Turns a site's hours into "Tue 3:10–5:10, Wed 2:00–4:00". */
function readableHours_(site) {
  const h = parseHours_(site.hours);
  return CFG.days.filter(function (d) { return h[d]; }).map(function (d) {
    const fmt = function (x) {
      const hh = Math.floor(x), mm = Math.round((x - hh) * 60);
      return (hh > 12 ? hh - 12 : hh) + ':' + (mm < 10 ? '0' : '') + mm;
    };
    return d + ' ' + fmt(h[d][0]) + '–' + fmt(h[d][1]);
  }).join(', ');
}
