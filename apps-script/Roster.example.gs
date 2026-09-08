/**
 * YMU Mentoring — roster template.
 *
 * This is the SHAPE of the roster, with invented people. The real one is not
 * in this repository, because it is names, phone numbers and email addresses
 * of minors and their parents.
 *
 * Your real copy lives in  private/Roster.gs  (gitignored).
 *
 * In Apps Script, paste the real one as a script file named `Roster`.
 * Apps Script has no modules, so this top-level const is visible to Setup.gs
 * and used by loadMentors().
 *
 * Columns, in order:
 *   0 name            full name of the ambassador
 *   1 instruments     must match a mentee's instrument exactly to pair
 *   2 phone           theirs, or their guardian's
 *   3 email           the Google account they will sign in with
 *   4 grade           '8th'…'12th' or 'Alumni' — drives inferred skill_level
 *   5 school          their own school (gets a "your school" flag at intake)
 *   6 guardian1_name
 *   7 guardian1_email  REQUIRED — a parent is on every message
 *   8 guardian2_name   optional
 *   9 guardian2_email  optional
 */

const MENTORS_SEED = [
  // name, instruments, phone, email, grade, school, g1name, g1email, g2name, g2email
  ['Ada Example',   'Voice',  '305-555-0100', 'ada@example.org',  '11th', 'Example High',
   'Parent Example', 'parent1@example.org', '', ''],
  ['Ben Example',   'Guitar', '305-555-0101', 'ben@example.org',  '10th', 'Example Charter',
   'Parent Example', 'parent2@example.org', 'Second Parent', 'parent3@example.org'],
  ['Cleo Example',  'Drums',  '305-555-0102', 'cleo@example.org', '12th', 'Example Academy',
   'Parent Example', 'parent4@example.org', '', '']
];
