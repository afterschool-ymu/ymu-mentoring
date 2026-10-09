/**
 * YMU Mentoring — pairing.
 *
 * Ported from the standalone matcher so the whole programme runs in one
 * place. Same rules: instrument is the one hard filter, then a score out of
 * 100 from how close the school is, how much the mentor has actually offered
 * there, and how the skill levels sit.
 *
 * One adaptation. The original scored the overlap between a mentor's and a
 * mentee's declared times. Here a student declares nothing — the mentor
 * offers, the student picks — so the time score is how many usable slots the
 * mentor has offered at that student's school in the cycle being collected.
 * A pair with none is still proposed, but flagged and marked unschedulable,
 * because that is a mentor who has not finished their form rather than a bad
 * match.
 *
 * Nothing here writes a pair. Proposals go on screen and a person approves
 * them: putting two named minors together is a judgement call, and the
 * things that make it a bad idea — a history, a personality clash, a
 * safeguarding note — are not in the spreadsheet.
 */

const MATCH = {
  maxMenteesPerMentor: 1,                      // 1:1 for now
  continuity: true,                            // approved pairs hold for the year
  weights: { location: 50, time: 30, skill: 20 },
  levels: ['Beginner', 'Intermediate', 'Advanced']
};

function levelIdx_(l) {
  const i = MATCH.levels.indexOf(String(l || '').trim());
  return i < 0 ? 1 : i;                        // unknown reads as Intermediate
}

function splitList_(v) {
  return String(v || '').split(',')
    .map(function (x) { return x.trim(); })
    .filter(Boolean);
}

/** Slots this mentor has offered at this school, inside the cycle's months. */
function offeredCount_(mentorId, siteId, cycle) {
  const months = cycleMonths_(cycle);
  return availabilityFor(mentorId, siteId).filter(function (a) {
    return months.some(function (m) { return String(a.date).indexOf(m.prefix) === 0; });
  }).length;
}

/**
 * One person can sit on both rosters: an ambassador who also receives coaching
 * on their own instrument. What must never happen is the two halves of that
 * person being paired with each other — the instrument rule alone would be
 * delighted to match a guitarist with themselves.
 *
 * Email is the identity we trust; names are the fallback for rows that have
 * none, and a name collision is worth a false positive here.
 */
function samePerson_(mentor, mentee) {
  const mEmail = String(mentor.email || '').trim().toLowerCase();
  const sEmail = String(mentee.student_email || '').trim().toLowerCase();
  if (mEmail && sEmail && mEmail === sEmail) return true;

  const mName = String(mentor.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const sName = String(mentee.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return !!mName && mName === sName;
}

/**
 * Scores one possible pair, or returns null when a hard rule forbids it.
 * Flags are the reasons a human might still say no.
 */
function scorePair_(mentor, mentee, cycle) {
  if (samePerson_(mentor, mentee)) return null;
  if (splitList_(mentor.instruments).indexOf(String(mentee.instrument).trim()) < 0) return null;

  const flags = [];
  let score = 0;

  // ---- School: where it sits in the mentor's own list of preferences ----
  const prefs = splitList_(mentor.site_prefs);
  const rank = prefs.indexOf(mentee.site_id);
  if (rank === 0) {
    score += MATCH.weights.location;
  } else if (rank > 0) {
    score += MATCH.weights.location * Math.max(0, 1 - rank * 0.25);
  } else {
    flags.push('Has not listed ' + (getSite_(mentee.site_id).name || 'that school'));
  }

  // ---- Time: what the mentor has actually offered there this cycle ----
  const offered = offeredCount_(mentor.mentor_id, mentee.site_id, cycle);
  if (offered === 0) {
    flags.push(prefs.length
      ? 'No times offered at that school yet'
      : 'Has not filled in their availability form');
  } else {
    score += MATCH.weights.time * Math.min(1, offered / 4);
  }

  const site = getSite_(mentee.site_id);
  if (!site.hours) flags.push('Programme hours not on file for ' + (site.name || 'that school'));

  // ---- Skill: one step ahead is the sweet spot ----
  const gap = levelIdx_(mentor.skill_level) - levelIdx_(mentee.skill_level);
  if (gap === 1)      score += MATCH.weights.skill;
  else if (gap === 0) score += MATCH.weights.skill * 0.7;
  else if (gap === 2) score += MATCH.weights.skill * 0.6;
  else                flags.push('Mentor is graded below this student');

  return { score: Math.round(score), flags: flags, offered: offered };
}

function reasonNoMatch_(mentee, mentors) {
  const same = mentors.filter(function (m) {
    return splitList_(m.instruments).indexOf(String(mentee.instrument).trim()) >= 0;
  });
  if (!same.length) {
    return 'No active ambassador plays ' + (mentee.instrument || '—');
  }
  return 'Every ' + mentee.instrument + ' ambassador is already paired';
}

/** Best-score-first assignment, holding anything already approved. */
function buildProposals_() {
  const cycle = activeCycle_();
  const isOn = function (r) { return r.active === true || r.active === 'TRUE'; };
  const mentors = readTab_('Mentors').filter(isOn);
  const mentees = readTab_('Mentees').filter(isOn);

  const usedMentors = {}, usedMentees = {}, load = {};
  const proposals = [];

  if (MATCH.continuity) {
    readTab_('Pairs').filter(function (p) {
      return p.approved === true || p.approved === 'TRUE';
    }).forEach(function (p) {
      const mentor = byId_(mentors, 'mentor_id', p.mentor_id);
      const mentee = byId_(mentees, 'mentee_id', p.mentee_id);
      if (!mentor || !mentee) return;          // someone left — free them to rematch
      const sc = scorePair_(mentor, mentee, cycle) ||
                 { score: 0, flags: ['No longer satisfies the matching rules'], offered: 0 };
      usedMentors[mentor.mentor_id] = true;
      usedMentees[mentee.mentee_id] = true;
      load[mentor.mentor_id] = (load[mentor.mentor_id] || 0) + 1;
      proposals.push({
        kind: 'continuing', mentorId: mentor.mentor_id, menteeId: mentee.mentee_id,
        mentor: mentor.name, mentee: mentee.name, instrument: p.instrument,
        siteId: p.site_id, site: getSite_(p.site_id).name || '',
        score: sc.score, flags: sc.flags, offered: sc.offered
      });
    });
  }

  const cands = [];
  mentors.forEach(function (mentor) {
    if (usedMentors[mentor.mentor_id]) return;
    mentees.forEach(function (mentee) {
      if (usedMentees[mentee.mentee_id]) return;
      const sc = scorePair_(mentor, mentee, cycle);
      if (sc) cands.push({ mentor: mentor, mentee: mentee, sc: sc });
    });
  });
  cands.sort(function (a, b) {
    return b.sc.score - a.sc.score || String(a.mentee.name).localeCompare(String(b.mentee.name));
  });

  cands.forEach(function (c) {
    if (usedMentees[c.mentee.mentee_id]) return;
    if ((load[c.mentor.mentor_id] || 0) >= MATCH.maxMenteesPerMentor) return;
    load[c.mentor.mentor_id] = (load[c.mentor.mentor_id] || 0) + 1;
    usedMentees[c.mentee.mentee_id] = true;
    proposals.push({
      kind: 'new', mentorId: c.mentor.mentor_id, menteeId: c.mentee.mentee_id,
      mentor: c.mentor.name, mentee: c.mentee.name,
      instrument: c.mentee.instrument, siteId: c.mentee.site_id,
      site: getSite_(c.mentee.site_id).name || '',
      score: c.sc.score, flags: c.sc.flags, offered: c.sc.offered
    });
  });

  // A pair with nothing offered cannot be scheduled yet, however well it scores.
  proposals.forEach(function (p) { p.viable = p.offered > 0; });
  proposals.sort(function (a, b) {
    return (b.viable ? 1 : 0) - (a.viable ? 1 : 0) || b.score - a.score;
  });

  const unmatched = mentees.filter(function (m) { return !usedMentees[m.mentee_id]; })
    .map(function (m) {
      return { name: m.name, what: m.instrument || '—', why: reasonNoMatch_(m, mentors) };
    });
  const idle = mentors.filter(function (m) { return !load[m.mentor_id]; })
    .map(function (m) {
      return { name: m.name, what: m.instruments || '—',
               why: 'No unpaired student plays ' + (m.instruments || 'their instrument') };
    });

  return { cycle: cycle, proposals: proposals, unmatched: unmatched, idle: idle };
}

/* ====================================================================
   Pairing two people on purpose

   The algorithm proposes; sometimes you already know. This makes that a
   first-class action rather than hand-typing two generated ids into the
   Pairs tab, which is where mismatched pairs come from.

   It still checks instrument and school, because a deliberate pair with no
   usable school is a pair that can never be scheduled — and that failure
   would not show up until somebody went looking for a session in October.
   ==================================================================== */

function showManualPair() {
  const on = function (r) { return r.active === true || r.active === 'TRUE'; };
  const mentors = readTab_('Mentors').filter(on);
  const mentees = readTab_('Mentees').filter(on);
  const sites   = readTab_('Sites').filter(on);
  const paired  = {};
  readTab_('Pairs').forEach(function (p) {
    if (p.approved === true || p.approved === 'TRUE') {
      paired['m' + p.mentor_id] = true; paired['s' + p.mentee_id] = true;
    }
  });

  if (!mentees.length) {
    notify_('No students on the Mentees tab yet.'); return;
  }

  const data = {
    mentors: mentors.map(function (m) {
      return { id: m.mentor_id, name: m.name, plays: String(m.instruments || ''),
               email: String(m.email || '').trim().toLowerCase(),
               level: m.skill_level || '', taken: !!paired['m' + m.mentor_id],
               prefs: String(m.site_prefs || '').split(',').map(function (x) { return x.trim(); })
                 .filter(Boolean) };
    }),
    mentees: mentees.map(function (m) {
      return { id: m.mentee_id, name: m.name, plays: String(m.instrument || ''),
               email: String(m.student_email || '').trim().toLowerCase(),
               level: m.skill_level || '', site: m.site_id || '',
               taken: !!paired['s' + m.mentee_id] };
    }),
    sites: sites.map(function (s) {
      return { id: s.site_id, name: s.name, hours: !!String(s.hours || '').trim() };
    })
  };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  const html =
    '<style>' +
    'body{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'margin:0;padding:18px;color:#16181d}' +
    'label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;' +
    'letter-spacing:.06em;color:#6b7280;margin:14px 0 5px}' +
    'select{width:100%;font-size:14px;padding:9px 10px;border:1px solid #e3e6ea;' +
    'border-radius:8px;background:#fff}' +
    '#chk{margin:15px 0 0;min-height:76px}' +
    '.ok{background:#e9f7ee;color:#15803d;border-radius:8px;padding:11px 13px;margin:0 0 8px}' +
    '.warn{background:#fdf5e3;color:#a16207;border-radius:8px;padding:11px 13px;margin:0 0 8px}' +
    '.bad{background:#fdecea;color:#b3261e;border-radius:8px;padding:11px 13px;margin:0 0 8px}' +
    'button{background:#3b4cca;color:#fff;border:0;border-radius:8px;padding:11px 20px;' +
    'font:inherit;font-weight:600;cursor:pointer;margin-top:14px}' +
    'button:disabled{opacity:.45;cursor:default}' +
    '#msg{margin-left:10px;color:#6b7280}' +
    '</style>' +
    '<label>Student Ambassador</label><select id="mentor"></select>' +
    '<label>Student</label><select id="mentee"></select>' +
    '<label>Where their sessions happen</label><select id="site"></select>' +
    '<div id="chk"></div>' +
    '<button id="go" disabled>Create this pair</button><span id="msg"></span>' +
    '<script>' +
    'var D = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';' +
    'function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){' +
    'return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}' +
    'function opt(v,t,d){return "<option value=\\""+esc(v)+"\\""+(d?" disabled":"")+">"+esc(t)+"</option>"}' +
    'document.getElementById("mentor").innerHTML = opt("","\\u2014 choose \\u2014") +' +
    ' D.mentors.map(function(m){return opt(m.id, m.name+"  ("+m.plays+(m.taken?", already paired":"")+")")}).join("");' +
    'document.getElementById("mentee").innerHTML = opt("","\\u2014 choose \\u2014") +' +
    ' D.mentees.map(function(m){return opt(m.id, m.name+"  ("+m.plays+(m.taken?", already paired":"")+")")}).join("");' +
    'document.getElementById("site").innerHTML = opt("","\\u2014 choose \\u2014") +' +
    ' D.sites.map(function(s){return opt(s.id, s.name+(s.hours?"":"  (no hours yet)"))}).join("");' +
    'function find(a,id){for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null}' +
    'function check(){' +
    ' var mt=find(D.mentors,document.getElementById("mentor").value);' +
    ' var me=find(D.mentees,document.getElementById("mentee").value);' +
    ' var st=find(D.sites,document.getElementById("site").value);' +
    ' var box=document.getElementById("chk"), go=document.getElementById("go"), h="", block=false;' +
    ' if(me && !document.getElementById("site").value && me.site){' +
    '   document.getElementById("site").value = me.site; st=find(D.sites,me.site); }' +
    ' if(!mt || !me){ box.innerHTML=""; go.disabled=true; return; }' +
    ' if((mt.email && me.email && mt.email===me.email) ||' +
    '    mt.name.trim().toLowerCase()===me.name.trim().toLowerCase()){' +
    '   box.innerHTML = "<div class=\\"bad\\"><b>That is the same person.</b> "+esc(mt.name)+' +
    '     " can both give mentoring and receive it, but not from themselves.</div>";' +
    '   go.disabled = true; return; }' +
    ' var plays = mt.plays.split(",").map(function(x){return x.trim()});' +
    ' if(plays.indexOf(me.plays.trim())<0){' +
    '   h += "<div class=\\"bad\\"><b>Different instruments.</b> "+esc(mt.name)+" plays "+esc(mt.plays)+' +
    '        ", "+esc(me.name)+" plays "+esc(me.plays)+". This is the one rule the matcher never bends.</div>"; }' +
    ' else { h += "<div class=\\"ok\\">Instrument matches: "+esc(me.plays)+"</div>"; }' +
    ' if(mt.taken) h += "<div class=\\"warn\\"><b>"+esc(mt.name)+" already has a student.</b> One ambassador per student is the current rule.</div>";' +
    ' if(me.taken){ h += "<div class=\\"bad\\"><b>"+esc(me.name)+" is already paired.</b></div>"; block=true; }' +
    ' if(!st){ h += "<div class=\\"bad\\">Pick where the sessions happen. Without a school there is nothing to schedule.</div>"; block=true; }' +
    ' else {' +
    '   if(!st.hours) h += "<div class=\\"bad\\"><b>"+esc(st.name)+" has no programme hours.</b> The pair can be created, but no session can ever be booked there until you add them.</div>";' +
    '   if(mt.prefs.indexOf(st.id)<0) h += "<div class=\\"warn\\"><b>"+esc(mt.name)+" did not choose that school</b>, so they have offered no times there. You will need them to add some.</div>";' +
    ' }' +
    ' box.innerHTML = h; go.disabled = block;' +
    '}' +
    '["mentor","mentee","site"].forEach(function(id){' +
    ' document.getElementById(id).addEventListener("change", check)});' +
    'document.getElementById("go").onclick = function(){' +
    ' this.disabled = true; document.getElementById("msg").textContent = "Saving\\u2026";' +
    ' google.script.run.withSuccessHandler(function(m){' +
    '   document.getElementById("msg").textContent = m;' +
    '   setTimeout(google.script.host.close, 1500);' +
    ' }).withFailureHandler(function(e){' +
    '   document.getElementById("msg").textContent = "Error: " + e.message;' +
    '   document.getElementById("go").disabled = false;' +
    ' }).apiManualPair(document.getElementById("mentor").value,' +
    '                  document.getElementById("mentee").value,' +
    '                  document.getElementById("site").value);' +
    '};' +
    '</script>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(560).setHeight(560),
    'Pair two people');
}

/** Creates one deliberate pair. Re-checked here; the dialog is not trusted. */
function apiManualPair(mentorId, menteeId, siteId) {
  if (!mentorId || !menteeId || !siteId) return 'Nothing selected.';

  const mentor = getMentor_(mentorId);
  const mentee = getMentee_(menteeId);
  if (!mentor.mentor_id || !mentee.mentee_id) return 'Could not find one of them.';

  if (samePerson_(mentor, mentee)) {
    return 'That is the same person. ' + mentor.name + ' can give mentoring and ' +
           'receive it, but not from themselves — pick a different ambassador.';
  }

  const already = readTab_('Pairs').filter(function (p) {
    return (p.approved === true || p.approved === 'TRUE') && p.mentee_id === menteeId;
  })[0];
  if (already) return mentee.name + ' is already paired.';

  appendRow_('Pairs', {
    pair_id: uid_('pair'), mentor_id: mentorId, mentee_id: menteeId,
    instrument: mentee.instrument, site_id: siteId, approved: true,
    notes: 'Paired by hand ' + todayIso_()
  });
  log_('Pairing', 'By hand: ' + mentor.name + ' + ' + mentee.name +
       ' at ' + (getSite_(siteId).name || siteId));
  return 'Paired ' + mentor.name + ' with ' + mentee.name + '. Nothing was emailed.';
}

/* ====================================================================
   The menu item
   ==================================================================== */

function suggestPairings() {
  const r = buildProposals_();
  const fresh = r.proposals.filter(function (p) { return p.kind === 'new'; });

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  const rows = r.proposals.map(function (p, i) {
    const cont = p.kind === 'continuing';
    return '<tr class="' + (p.viable ? '' : 'blocked') + '">' +
      '<td>' + (cont
        ? '<span class=tag>already paired</span>'
        : '<input type=checkbox class=pick data-i="' + i + '"' + (p.viable ? ' checked' : '') + '>') +
      '</td>' +
      '<td><b>' + esc(p.mentee) + '</b><div class=sub>' + esc(p.instrument) + '</div></td>' +
      '<td><b>' + esc(p.mentor) + '</b></td>' +
      '<td>' + esc(p.site) + '</td>' +
      '<td class=sc>' + p.score + '</td>' +
      '<td>' + (p.offered ? p.offered + ' times' : '<span class=bad>none yet</span>') + '</td>' +
      '<td class=fl>' + (p.flags.length ? p.flags.map(esc).join('<br>') : '—') + '</td>' +
      '</tr>';
  }).join('');

  function list(title, arr) {
    if (!arr.length) return '';
    return '<h3>' + esc(title) + ' <span class=n>' + arr.length + '</span></h3><ul>' +
      arr.map(function (x) {
        return '<li><b>' + esc(x.name) + '</b> (' + esc(x.what) + ') — ' + esc(x.why) + '</li>';
      }).join('') + '</ul>';
  }

  const html =
    '<style>' +
    'body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:16px;color:#16181d}' +
    'h3{font-size:14px;margin:18px 0 6px}.n{color:#6b7280;font-weight:400}' +
    'table{border-collapse:collapse;width:100%;font-size:12.5px}' +
    'th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;' +
    'color:#6b7280;border-bottom:1px solid #e3e6ea;padding:6px 8px}' +
    'td{padding:7px 8px;border-bottom:1px solid #f0f1f3;vertical-align:top}' +
    '.sub{color:#6b7280;font-size:11px}.sc{font-weight:700}.fl{color:#9a6200;font-size:11.5px}' +
    '.bad{color:#b3261e}.blocked{background:#fdf8ee}' +
    '.tag{background:#e8f6ee;color:#1a7f4b;border-radius:999px;padding:2px 8px;font-size:10.5px;font-weight:650}' +
    'ul{margin:4px 0 0;padding-left:18px;color:#6b7280}li{margin-bottom:3px}' +
    '.bar{position:sticky;bottom:0;background:#fff;border-top:1px solid #e3e6ea;padding:12px 0 0;margin-top:14px}' +
    'button{background:#3b4cca;color:#fff;border:0;border-radius:8px;padding:10px 18px;' +
    'font:inherit;font-weight:600;cursor:pointer}button:disabled{opacity:.5}' +
    '#msg{margin-left:10px;color:#6b7280}' +
    '.note{background:#eef0ff;color:#3b4cca;border-radius:8px;padding:11px 13px;margin:0 0 14px}' +
    '</style>' +
    '<div class=note>Nothing is saved and nobody is emailed until you press Approve. ' +
    'Rows shaded amber have no times offered yet, so they cannot be scheduled even once approved.</div>' +
    (r.proposals.length
      ? '<table><thead><tr><th></th><th>Student</th><th>Ambassador</th><th>School</th>' +
        '<th>Score</th><th>Offered</th><th>Worth knowing</th></tr></thead><tbody>' +
        rows + '</tbody></table>'
      : '<p>No possible pairs. Add students to the Mentees tab first.</p>') +
    list('Students with nobody to pair with', r.unmatched) +
    list('Ambassadors with nobody left', r.idle) +
    '<div class=bar><button id=go' + (fresh.length ? '' : ' disabled') + '>Approve selected</button>' +
    '<span id=msg></span></div>' +
    '<script>' +
    'var P = ' + JSON.stringify(r.proposals).replace(/</g, '\\u003c') + ';' +
    'document.getElementById("go").onclick = function(){' +
    ' var picks = [].slice.call(document.querySelectorAll(".pick:checked"))' +
    '   .map(function(c){ return P[+c.dataset.i]; });' +
    ' if(!picks.length){ document.getElementById("msg").textContent = "Nothing selected."; return; }' +
    ' this.disabled = true; document.getElementById("msg").textContent = "Saving\\u2026";' +
    ' google.script.run.withSuccessHandler(function(m){' +
    '   document.getElementById("msg").textContent = m;' +
    '   setTimeout(google.script.host.close, 1400);' +
    ' }).withFailureHandler(function(e){' +
    '   document.getElementById("msg").textContent = "Error: " + e.message;' +
    '   document.getElementById("go").disabled = false;' +
    ' }).approvePairs(picks);' +
    '};' +
    '</script>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(1000).setHeight(640),
    'Suggested pairings — ' + r.proposals.length + ' proposed, ' +
      r.unmatched.length + ' student(s) unmatched');
}

/** Writes the approved pairs. Re-checked here: the dialog is not trusted. */
function approvePairs(picks) {
  const existing = readTab_('Pairs');
  const taken = {};
  existing.forEach(function (p) {
    if (p.approved === true || p.approved === 'TRUE') taken[p.mentee_id] = true;
  });

  let made = 0, skipped = 0;
  (picks || []).forEach(function (p) {
    if (!p || !p.mentorId || !p.menteeId) { skipped++; return; }
    if (taken[p.menteeId]) { skipped++; return; }   // already paired since the dialog opened
    taken[p.menteeId] = true;
    appendRow_('Pairs', {
      pair_id: uid_('pair'), mentor_id: p.mentorId, mentee_id: p.menteeId,
      instrument: p.instrument, site_id: p.siteId, approved: true,
      notes: 'Matched ' + todayIso_() + ' (score ' + p.score + ')' +
             (p.flags && p.flags.length ? ' — ' + p.flags.join('; ') : '')
    });
    made++;
    log_('Pairing', p.mentor + ' + ' + p.mentee + ' at ' + p.site + ' (score ' + p.score + ')');
  });

  return made + ' pair' + (made === 1 ? '' : 's') + ' approved' +
    (skipped ? ', ' + skipped + ' skipped' : '') +
    '. Next: "Create missing sessions".';
}
