/**
 * YMU Mentoring — the post-session feedback form.
 *
 * A Google Form, created by the script, with one hidden field carrying the
 * session id. The link we email is pre-filled with that id, so when somebody
 * answers we know exactly which session and which pair it belongs to — no
 * asking a 12-year-old to type a reference number, and no manual matching.
 *
 * Why a Form rather than a page inside the tool: a Form needs no sign-in, works
 * on any phone, and Google handles the submission. Responses land in a tab of
 * this same spreadsheet, and onFormSubmit copies them onto the Feedback tab
 * joined to the session.
 *
 * It goes out a few minutes before the session is due to end, which is when
 * people will actually fill it in — while they are still in the room.
 */

/**
 * Creates the form once and remembers it. Safe to re-run: it returns the
 * existing form rather than making a second one.
 */
function createFeedbackForm() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty('feedbackFormId');
  if (existing) {
    try {
      const f = FormApp.openById(existing);
      notify_('The feedback form already exists.\n\nEdit it: ' + f.getEditUrl() +
              '\n\nLive form: ' + f.getPublishedUrl());
      return { id: existing, edit: f.getEditUrl(), live: f.getPublishedUrl() };
    } catch (err) { /* deleted — fall through and make a new one */ }
  }

  const form = FormApp.create('YMU Mentoring — how did the session go?');
  form.setDescription(
    'Please fill this in at the end of your session, while it is fresh. ' +
    'It takes under two minutes and it is how we track how each student is getting on.');
  form.setCollectEmail(false);
  form.setProgressBar(false);
  form.setConfirmationMessage('Thank you — this goes straight to the YMU afterschool team.');

  // Hidden-ish: the session id, pre-filled from the link. Short text so it can
  // be pre-filled; people are told to leave it alone.
  const idItem = form.addTextItem()
    .setTitle('Session reference')
    .setHelpText('Please leave this exactly as it is — it tells us which session this is about.')
    .setRequired(true);

  const roleItem = form.addMultipleChoiceItem()
    .setTitle('Who is filling this in?')
    .setChoiceValues(['The Student Ambassador (mentor)', 'The student', 'A parent or guardian'])
    .setRequired(true);

  form.addTextItem().setTitle('Your name').setRequired(false);

  form.addScaleItem()
    .setTitle('How did the session go overall?')
    .setBounds(1, 5)
    .setLabels('Not great', 'Really well')
    .setRequired(true);

  form.addScaleItem()
    .setTitle('How much progress is the student making on their instrument?')
    .setBounds(1, 5)
    .setLabels('Not much yet', 'Big progress')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('What did you work on today?')
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Is there anything YMU should know or follow up on?')
    .setHelpText('Anything at all — equipment, timing, how the student is doing, ' +
                 'or something that worried you. Leave blank if all is well.')
    .setRequired(false);

  // Responses into this same spreadsheet, so everything lives in one file.
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss_().getId());

  props.setProperty('feedbackFormId', form.getId());
  props.setProperty('feedbackSessionItemId', String(idItem.getId()));

  log_('Feedback', 'Created form ' + form.getId());
  notify_(
    'Feedback form created.\n\n' +
    'Live form (what people fill in):\n' + form.getPublishedUrl() + '\n\n' +
    'Edit the questions here:\n' + form.getEditUrl() + '\n\n' +
    'Responses arrive in a new tab of this spreadsheet and are copied onto the ' +
    'Feedback tab, matched to the session automatically.\n\n' +
    'NEXT: install the form-submit trigger with menu → "Install daily automation" ' +
    '(it sets up both triggers), and paste nothing anywhere — the link is built ' +
    'per session by the script.');
  return { id: form.getId(), edit: form.getEditUrl(), live: form.getPublishedUrl() };
}

/** A pre-filled link for one specific session. */
function feedbackLink_(session, pair) {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty('feedbackFormId');
  const itemId = props.getProperty('feedbackSessionItemId');
  if (!formId || !itemId) return CFG.feedbackFormUrl || '';
  try {
    const form = FormApp.openById(formId);
    return form.getPublishedUrl() + '?usp=pp_url&entry.' + itemId + '=' +
           encodeURIComponent(session.session_id);
  } catch (err) {
    log_('Feedback link failed', err.message);
    return CFG.feedbackFormUrl || '';
  }
}

/* ====================================================================
   Sending it near the end of the session
   ==================================================================== */

/**
 * Runs every 15 minutes. Finds sessions finishing shortly and sends the form
 * once. A daily job cannot do this — the whole point is to catch people while
 * they are still in the room.
 */
function feedbackTick() {
  const now = new Date();
  const today = todayIso_();
  let sent = 0;

  readTab_('Sessions').forEach(function (s) {
    if (s.feedback_sent) return;
    if (isoOf_(s.date) !== today) return;
    if (['scheduled', 'rescheduled'].indexOf(s.status) < 0) return;
    if (!s.time) return;

    const start = toDate_(today, s.time);
    const end = new Date(start.getTime() + CFG.sessionMinutes * 60000);
    const target = new Date(end.getTime() - CFG.feedbackMinutesBeforeEnd * 60000);
    // Send once we are past the target, but not hours later.
    if (now < target) return;
    if (now.getTime() - end.getTime() > 3 * 60 * 60 * 1000) return;

    const pair = getPair_(s.pair_id);
    if (!pair.pair_id) return;
    const mentor = getMentor_(pair.mentor_id);
    const mentee = getMentee_(pair.mentee_id);

    const ok = sendTemplate_('feedback', pair, s, {
      to: [mentor.email, mentee.guardian_email, mentee.student_email],
      cc: [mentor.guardian1_email]
    });
    if (ok) {
      setCell_('Sessions', s._row, 'feedback_sent', Utilities.formatDate(now, CFG.tz, 'yyyy-MM-dd HH:mm'));
      sent++;
    }
  });

  if (sent) log_('Feedback', 'Sent ' + sent + ' feedback requests');
  return sent;
}

/* ====================================================================
   Responses back in
   ==================================================================== */

/**
 * Installable trigger: fires when somebody submits the form. Copies the
 * answers onto the Feedback tab, joined to the session, and alerts the
 * coordinator if a concern was raised.
 */
function onFeedbackSubmit(e) {
  try {
    const answers = {};
    if (e && e.response) {
      e.response.getItemResponses().forEach(function (ir) {
        answers[ir.getItem().getTitle()] = ir.getResponse();
      });
    } else if (e && e.namedValues) {
      Object.keys(e.namedValues).forEach(function (k) {
        answers[k] = String(e.namedValues[k]);
      });
    }

    const sessionId = String(answers['Session reference'] || '').trim();
    const role = String(answers['Who is filling this in?'] || '');
    const who = String(answers['Your name'] || '');
    const rating = answers['How did the session go overall?'] || '';
    const progress = answers['How much progress is the student making on their instrument?'] || '';
    const worked = String(answers['What did you work on today?'] || '');
    const concern = String(answers['Is there anything YMU should know or follow up on?'] || '');

    appendRow_('Feedback', {
      received: new Date(), session_id: sessionId,
      from_role: /mentor|Ambassador/i.test(role) ? 'mentor'
               : /guardian|parent/i.test(role) ? 'guardian' : 'student',
      from_name: who, rating: rating, progress: progress,
      worked_on: worked, concerns: concern,
      raw: JSON.stringify(answers).slice(0, 4000)
    });

    const s = byId_(readTab_('Sessions'), 'session_id', sessionId);
    if (!s) {
      log_('Feedback unmatched', 'No session for reference "' + sessionId + '"');
      MailApp.sendEmail({
        to: CFG.coordinatorEmail,
        subject: 'Feedback received but not matched to a session',
        name: CFG.coordinatorName,
        htmlBody: '<div style="font:14px/1.5 sans-serif"><p>Somebody submitted feedback with a ' +
          'session reference we do not recognise: <code>' + sessionId + '</code>.</p>' +
          '<p>It is on the Feedback tab. Most likely the reference was edited by hand.</p></div>'
      });
      return;
    }

    // A mentor answering the form also closes the session out.
    if (/mentor|Ambassador/i.test(role)) {
      if (!s.happened) setCell_('Sessions', s._row, 'happened', 'yes');
      if (!s.worked_on && worked) setCell_('Sessions', s._row, 'worked_on', worked);
      if (s.status !== 'completed') setCell_('Sessions', s._row, 'status', 'completed');
    }
    if (concern && !s.follow_up) {
      setCell_('Sessions', s._row, 'follow_up', concern);
    }

    const pair = getPair_(s.pair_id);
    log_('Feedback', (getMentee_(pair.mentee_id).name || '?') + ' ' + s.month +
         ' — rating ' + rating + ', progress ' + progress + (concern ? ' — CONCERN' : ''));

    if (concern) {
      MailApp.sendEmail({
        to: CFG.coordinatorEmail,
        subject: 'Feedback concern: ' + getMentee_(pair.mentee_id).name + ' + ' +
                 getMentor_(pair.mentor_id).name,
        name: CFG.coordinatorName,
        htmlBody: '<div style="font:14px/1.5 sans-serif">' +
          '<p>Raised on the ' + s.month + ' feedback form by ' + (who || role) + ':</p>' +
          '<blockquote style="border-left:3px solid #9a3412;padding-left:12px;color:#333">' +
          concern.replace(/</g, '&lt;') + '</blockquote>' +
          '<p style="color:#6b7280">Session went ' + rating + '/5, progress ' + progress + '/5.' +
          (worked ? ' Worked on: ' + worked.replace(/</g, '&lt;') : '') + '</p></div>'
      });
    }
  } catch (err) {
    log_('Feedback error', err.message);
  }
}

/* ====================================================================
   Reporting
   ==================================================================== */

/** Average satisfaction and progress per pair, for end-of-year reporting. */
function feedbackSummary() {
  const rows = readTab_('Feedback');
  const byPair = {};
  rows.forEach(function (f) {
    const s = byId_(readTab_('Sessions'), 'session_id', String(f.session_id).trim());
    if (!s) return;
    const pair = getPair_(s.pair_id);
    if (!pair.pair_id) return;
    const label = getMentee_(pair.mentee_id).name + ' + ' + getMentor_(pair.mentor_id).name;
    const b = byPair[label] = byPair[label] || { n: 0, rating: 0, progress: 0, concerns: 0 };
    b.n++;
    if (Number(f.rating)) b.rating += Number(f.rating);
    if (Number(f.progress)) b.progress += Number(f.progress);
    if (f.concerns) b.concerns++;
  });

  const names = Object.keys(byPair).sort();
  if (!names.length) { notify_('No feedback has come in yet.'); return byPair; }

  const lines = names.map(function (k) {
    const b = byPair[k];
    return k + '\n   ' + b.n + ' response' + (b.n === 1 ? '' : 's') +
      ' · session ' + (b.rating / b.n).toFixed(1) + '/5' +
      ' · progress ' + (b.progress / b.n).toFixed(1) + '/5' +
      (b.concerns ? ' · ' + b.concerns + ' concern' + (b.concerns === 1 ? '' : 's') : '');
  });
  notify_('FEEDBACK BY PAIR\n\n' + lines.join('\n\n'));
  return byPair;
}
