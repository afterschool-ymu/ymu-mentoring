/**
 * YMU Mentoring — every automated message, in one place you can edit.
 *
 * The Templates tab is the single source of truth for what gets sent. Each row
 * carries the wording, who receives it, when it fires, how often, and an
 * on/off switch. Change the text in the sheet and the next send uses it —
 * no code change, no redeploy.
 *
 * Placeholders in curly braces are filled in per session:
 *
 *   {{mentee}} {{mentor}} {{instrument}} {{site}} {{siteAddress}}
 *   {{month}} {{date}} {{time}} {{sessionNo}} {{count}}
 *   {{booked}} {{unbooked}} {{cycle}} {{cycleMonths}} {{cycleDue}}
 *   {{coordinator}} {{coordinatorName}} {{bookingLink}} {{menteeLink}}
 *
 * Anything you leave in that we don't recognise is left alone, so a typo shows
 * up in the email rather than silently vanishing.
 */

const TEMPLATE_SEED = [
  {
    key: 'confirm', label: 'Pairing confirmation',
    audience: 'Mentor + their parents, mentee guardian, site staff, you',
    when_it_sends: 'When a pair is approved and their first session is booked',
    frequency: 'Once per pair',
    subject: 'YMU music mentoring — {{mentee}} + {{mentor}} at {{site}}',
    body:
`Hello,

{{mentee}} has been paired with Student Ambassador {{mentor}} for one-on-one {{instrument}} coaching this year.

Location: {{site}}
Sessions: {{count}} between October and April, one a month
Booked so far: {{booked}} of {{count}}

{{mentee}} chooses each session's time from the days {{mentor}} has said they are free. You will get a calendar invitation for each one.

All scheduling questions go through {{coordinator}} — mentors and students should not arrange sessions privately between themselves.

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'remind_week', label: 'One week before the session',
    audience: 'Mentor + their parents, mentee guardian, site staff, you',
    when_it_sends: '7 days before a booked session (or on booking, if booked later than that)',
    frequency: 'Once per session',
    subject: 'Next week: {{mentee}} + {{mentor}} music session',
    body:
`Hello,

A reminder that the {{month}} mentoring session is coming up.

When: {{date}} at {{time}}
Where: {{site}}, {{siteAddress}}
Student: {{mentee}}
Ambassador: {{mentor}}

If either student cannot make it, the sooner we know the better.

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'remind_day', label: 'The day before',
    audience: 'Mentor + their parents, mentee guardian, site staff, you',
    when_it_sends: '1 day before a booked session',
    frequency: 'Once per session',
    subject: 'Tomorrow: {{mentee}} + {{mentor}} at {{time}}',
    body:
`Hello,

This session is tomorrow.

When: {{date}} at {{time}}
Where: {{site}}, {{siteAddress}}

Please reply if anything has changed.

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'remind_dayof', label: 'Day-of coverage check',
    audience: 'Mentor + their parents, mentee guardian, site staff, you',
    when_it_sends: 'The morning of a booked session',
    frequency: 'Once per session',
    subject: 'Today — please confirm coverage: {{mentee}} + {{mentor}}',
    body:
`Hello,

Today's session is at {{time}}, {{site}}.

Because afterschool coverage varies day to day, please confirm before it starts:

1. Site staff — is a supervising adult on site at {{time}}?
2. {{mentor}} — are you on your way?
3. Parent/guardian — is {{mentee}} at afterschool today?

If any of those is a no, reply to all and we will move the session. A session must not go ahead without a supervising adult present.

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'nudge_booking', label: 'Nobody has picked a time yet',
    audience: 'Mentee guardian, mentor copied, you copied',
    when_it_sends: 'When a session is unbooked and the month is closing',
    frequency: 'Weekly until booked',
    subject: 'Please pick a time for {{mentee}}\'s {{month}} session',
    body:
`Hello,

{{mentee}}'s {{month}} session with {{mentor}} at {{site}} has not been given a time yet.

Choose whichever of {{mentor}}'s available times suits you best:
{{menteeLink}}

It takes a minute, and picking early means more choice.

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'cycle_open', label: 'New availability cycle — please update',
    audience: 'Mentor + their parents, you copied',
    when_it_sends: 'When a new collection cycle opens',
    frequency: 'Once per cycle, then weekly until done',
    subject: 'Please add your {{cycleMonths}} availability',
    body:
`Hi {{mentor}},

It is time to tell us when you are free for {{cycleMonths}}.

Please add your times by {{cycleDue}}:
{{bookingLink}}

If you keep the same days and times you have been doing, everything stays simple for {{mentee}} and their family — and it means far fewer changes later. Please do check the calendar though: school holidays fall differently each month, so the same pattern can give you fewer dates than you expect.

If we do not hear from you by {{cycleDue}} we will carry your current days and times forward, and let you know if the holidays leave you short.

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'cycle_carried', label: 'We carried your availability forward',
    audience: 'Mentor + their parents, you copied',
    when_it_sends: 'The day after a cycle deadline passes with no update',
    frequency: 'Once per cycle',
    subject: 'We have carried your usual times into {{cycleMonths}}',
    body:
`Hi {{mentor}},

We did not hear from you about {{cycleMonths}}, so we have carried forward the same days and times you were already doing.

Please have a quick look and change anything that does not work:
{{bookingLink}}

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'cycle_short', label: 'Holidays left you short of times',
    audience: 'Mentor + their parents, you copied',
    when_it_sends: 'When a mentor has fewer than the minimum times in a month',
    frequency: 'Weekly until resolved',
    subject: 'Your {{month}} availability is short — school holidays',
    body:
`Hi {{mentor}},

Your usual days fall on school holidays in {{month}}, which leaves you with fewer than {{minPerMonth}} available times that month. That is not enough to give {{mentee}} a real choice, or to move a session if something comes up.

Could you add a couple more times for {{month}}?
{{bookingLink}}

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'feedback', label: 'Feedback form, near the end of the session',
    audience: 'Mentor and mentee guardian',
    when_it_sends: 'A few minutes before the session is due to finish',
    frequency: 'Once per session',
    subject: 'How did today\'s session go?',
    body:
`Hello,

Today's {{instrument}} session for {{mentee}} and {{mentor}} is nearly finished.

Please take a minute to fill this in while it is fresh — it takes less than two minutes and it is how we track how each student is getting on:

{{feedbackLink}}

Thank you,
{{coordinatorName}}`
  },
  {
    key: 'missed', label: 'Missed session follow-up',
    audience: 'Mentor + their parents, mentee guardian, you copied',
    when_it_sends: 'When a session is marked missed',
    frequency: 'Once per missed session',
    subject: 'Missed session — {{mentee}} + {{mentor}}',
    body:
`Hello,

The {{month}} session for {{mentee}} and {{mentor}} on {{date}} did not take place.

Could you let us know what got in the way? We would like to make it up before the next one comes around, and {{mentee}} can pick a new time here:
{{menteeLink}}

Thank you,
{{coordinatorName}}`
  }
];

/** Writes the default templates into the sheet. Never overwrites your edits. */
function loadTemplates() {
  const have = {};
  readTab_('Templates').forEach(function (t) { have[t.key] = true; });
  let added = 0;
  TEMPLATE_SEED.forEach(function (t) {
    if (have[t.key]) return;
    appendRow_('Templates', {
      key: t.key, label: t.label, audience: t.audience,
      when_it_sends: t.when_it_sends, frequency: t.frequency,
      enabled: true, subject: t.subject, body: t.body
    });
    added++;
  });
  const sh = sheet_('Templates');
  sh.setColumnWidth(HEADERS.Templates.indexOf('subject') + 1, 320);
  sh.setColumnWidth(HEADERS.Templates.indexOf('body') + 1, 520);
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), HEADERS.Templates.length)
    .setVerticalAlignment('top').setWrap(true);

  log_('Templates', 'Seeded ' + added + ' templates');
  notify_(added + ' message templates written to the Templates tab.\n\n' +
    'Edit the subject and body there and the next send uses your wording — no code change.\n' +
    'Set enabled to FALSE to switch a message off entirely.\n\n' +
    'The when_it_sends and frequency columns are documentation for you; the actual ' +
    'timing lives in Config (remindDaysBefore, renudgeEveryDays and so on). ' +
    'Menu → "Show the message schedule" lists it all.');
  return added;
}

/** One template, from the sheet if it is there, falling back to the default. */
function template_(key) {
  const row = readTab_('Templates').filter(function (t) { return t.key === key; })[0];
  if (row) {
    if (row.enabled === false || row.enabled === 'FALSE') return null;   // switched off
    return { key: key, subject: String(row.subject || ''), body: String(row.body || ''),
             label: row.label || key };
  }
  const seed = TEMPLATE_SEED.filter(function (t) { return t.key === key; })[0];
  return seed ? { key: key, subject: seed.subject, body: seed.body, label: seed.label } : null;
}

/** Fills the placeholders for one session. */
function fillTemplate_(text, ctx) {
  return String(text).replace(/\{\{(\w+)\}\}/g, function (whole, name) {
    return ctx[name] !== undefined && ctx[name] !== null ? String(ctx[name]) : whole;
  });
}

/** The values every template can use. */
function templateContext_(pair, session) {
  const mentor = getMentor_(pair.mentor_id) || {};
  const mentee = getMentee_(pair.mentee_id) || {};
  const site = getSite_(pair.site_id) || {};
  const mine = readTab_('Sessions').filter(function (s) { return s.pair_id === pair.pair_id; });
  const booked = mine.filter(function (s) { return isoOf_(s.date); }).length;
  const cyc = activeCycle_();
  const date = session ? isoOf_(session.date) : '';

  return {
    mentor: mentor.name || '', mentee: mentee.name || '',
    instrument: pair.instrument || '',
    site: site.name || '', siteAddress: site.address || '',
    month: session ? session.month : '',
    sessionNo: session ? session.session_no : '',
    date: date ? prettyDate_(date) : '(not booked yet)',
    time: session ? (session.time || '(no time yet)') : '',
    count: mine.length, booked: booked, unbooked: mine.length - booked,
    minPerMonth: CFG.minSlotsPerMonth,
    cycle: cyc ? cyc.id : '',
    cycleMonths: cyc ? cycleMonths_(cyc).map(function (m) { return m.label; }).join(' and ') : '',
    cycleDue: cyc ? prettyDate_(cyc.dueBy) : '',
    coordinator: CFG.coordinatorEmail, coordinatorName: CFG.coordinatorName,
    bookingLink: CFG.webAppUrl || '(booking page)',
    menteeLink: menteeLink_(mentee) || CFG.webAppUrl || '(booking page)',
    feedbackLink: session ? feedbackLink_(session, pair) : (CFG.feedbackFormUrl || '')
  };
}

/**
 * Sends one template. Returns true if it actually went out, so callers only
 * stamp the sheet when something was really sent.
 */
function sendTemplate_(key, pair, session, recipients) {
  const t = template_(key);
  if (!t) { log_('Template off', key); return false; }
  const to = (recipients.to || []).filter(function (e) { return e && /@/.test(e); });
  if (!to.length) { log_('No recipients', key + ' for pair ' + pair.pair_id); return false; }

  const ctx = templateContext_(pair, session);
  MailApp.sendEmail({
    to: to.join(','),
    cc: (recipients.cc || []).filter(function (e) { return e && /@/.test(e); }).join(','),
    subject: fillTemplate_(t.subject, ctx),
    htmlBody: shell_(textToHtml_(fillTemplate_(t.body, ctx))),
    name: CFG.coordinatorName
  });
  return true;
}

/** Plain text from the sheet becomes tidy HTML, with bare URLs made clickable. */
function textToHtml_(text) {
  const esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/(https?:\/\/[^\s<]+)/g,
             '<a href="$1" style="color:#3b4cca">$1</a>')
    .split(/\n{2,}/).map(function (p) {
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
}

/* ====================================================================
   The schedule, for the manager
   ==================================================================== */

/** A readable summary of everything that sends, and when. */
function showMessageSchedule() {
  const rows = readTab_('Templates');
  const lines = rows.map(function (t) {
    const on = (t.enabled === false || t.enabled === 'FALSE') ? 'OFF' : 'on';
    return '[' + on + ']  ' + t.label +
           '\n        to: ' + t.audience +
           '\n        when: ' + t.when_it_sends +
           '\n        how often: ' + t.frequency;
  });

  notify_(
    'AUTOMATED MESSAGES (' + rows.length + ')\n\n' + lines.join('\n\n') +
    '\n\n————\nAll of these are sent by the one daily job at 6am, except the ' +
    'feedback form, which needs the every-15-minutes trigger so it can land near ' +
    'the end of a session.\n\n' +
    'Timing lives in Config:\n' +
    '  one week before = ' + CFG.remindDaysBefore + ' days\n' +
    '  start chasing unbooked = ' + CFG.nudgeWithinDays + ' days before month end\n' +
    '  then re-chase every ' + CFG.renudgeEveryDays + ' days\n' +
    '  ask for closeout after ' + CFG.chaseCloseoutAfterDays + ' day\n' +
    '  feedback form ' + CFG.feedbackMinutesBeforeEnd + ' min before the session ends\n\n' +
    'Edit wording on the Templates tab. Set enabled to FALSE to switch one off.');
}
