# YMU Mentoring — automation setup

About 25 minutes, all inside your own Google Workspace. Nothing to host, nothing to pay for.

---

## What you're building

| Piece | What it does |
|---|---|
| **Google Sheet** | The database. Sites, mentors, mentees, pairs, sessions. You can read and fix anything by hand. |
| **Mentor page** | Signed in with Google. Three-step form — where they travel from, which nearby schools, and when they're free **for the current two-month cycle only**. Then it becomes their own session list. |
| **Student page** | A separate page for the student and their guardian. They see the mentor's available days and **pick the time that works for them**. Private link, no login needed. |
| **Templates tab** | Every automated message, with its audience, timing and an on/off switch — editable by you in the sheet. |
| **Feedback form** | A Google Form sent a few minutes before each session ends. Responses land in the sheet, matched to the session automatically. |
| **Calendar invites** | Booking a date creates a calendar event and Google emails the invite to the mentor, their parents, the mentee's guardian, the site teacher, and you. Rescheduling updates everyone automatically. |
| **Daily job** | Runs once each morning at 6am. Sends week-ahead, day-before and day-of reminders, chases unbooked sessions, asks for closeouts, and emails you only when something needs a human. |

---

## Steps

### 1. Create the sheet

New Google Sheet in your YMU Drive. Name it **YMU Mentoring**.

### 2. Open the script editor

**Extensions → Apps Script.** It opens a project bound to this sheet.

### 3. Add the files

Delete the default `Code.gs`. Then, for each file below, click **+ → Script** (or **+ → HTML** for the last one) and paste the contents. The names must match exactly, without extensions for the script files.

| Add as | File to paste |
|---|---|
| Script → `Config` | `Config.gs` |
| Script → `Setup` | `Setup.gs` |
| Script → `Geo` | `Geo.gs` |
| Script → `Closures` | `Closures.gs` |
| Script → `Cycles` | `Cycles.gs` |
| Script → `Availability` | `Availability.gs` |
| Script → `Scheduling` | `Scheduling.gs` |
| Script → `Templates` | `Templates.gs` |
| Script → `Feedback` | `Feedback.gs` |
| Script → `MenteeApp` | `MenteeApp.gs` |
| Script → `Reminders` | `Reminders.gs` |
| Script → `WebApp` | `WebApp.gs` |
| **HTML** → `MentorPage` | `MentorPage.html` |
| **HTML** → `MenteePage` | `MenteePage.html` |

Save (⌘S).

### 4. Turn on the Calendar service

In the left sidebar, next to **Services**, click **+**. Choose **Google Calendar API**, leave the identifier as `Calendar`, click **Add**.

> This is required. Without it, booking fails. It's what lets the script pass `sendUpdates: 'all'`, which is how guests actually get emailed — the plain calendar service can't guarantee that on updates.

### 5. Set up the workbook

Reload the spreadsheet tab. A **YMU Mentoring** menu appears.

1. **1. Set up workbook** — creates the tabs and a calendar called "YMU Mentoring". Google will ask you to authorise the script; review the permissions and allow. The warning screen is normal for your own script — click *Advanced → Go to (unsafe)*.
2. **2. Load the 12 school sites**
3. **3. Load the 15 ambassadors**
4. **4. Locate the schools** — geocodes all 12 addresses so the tool can rank them by distance. Takes about a minute; safe to re-run.
5. **5. Load the school-year calendar** — the 28 days between October and April when MDCPS schools are shut. No session can be offered or booked on any of them.
6. **6. Load the message templates** — writes every automated email onto the Templates tab for you to edit.
7. **7. Create the feedback form** — builds the Google Form and links its responses to this spreadsheet.
8. Optionally **8. Import from the HTML tool**.

Then, once you have students on the Mentees tab: **Create student booking links**, and **Email students their links**.

### 6. Deploy the mentor page

**Deploy → New deployment → Web app.**

- Description: `Mentor booking`
- **Execute as: Me**
- **Who has access: Anyone with a Google account**

Click **Deploy** and copy the web app URL.

> "Execute as Me" is what lets the script write to the sheet on a mentor's behalf. "Anyone with a Google account" means Google handles sign-in — you never create passwords, and the code checks the signed-in email against the roster before showing anything.

### 7. Paste the URL back into Config

In `Config.gs`, set:

```js
webAppUrl: 'https://script.google.com/macros/s/……/exec'
```

Save. This puts a working "Book your session" button in every reminder email.

### 8. Install the automation

Menu → **Install automation**. Three triggers, and no more — Apps Script allows 20, so anything per-session would fall over:

- **daily at 6am** — reminders, chasing, cycle rollover, your summary
- **every 15 minutes** — checks whether a session is finishing and sends the feedback form
- **on form submit** — files each response against the right session

Run "Create the feedback form" *before* this, so the form trigger can attach.

### 9. Test before you trust it

- Menu → **Check my email quota**. You want to see 1,500 (Workspace). If it says 100, the script is running under a personal account — move it to your ymu.org account.
- Menu → **Run the daily job now**. You should get a summary email.
- Open the web app URL yourself. You won't have a mentor row, so you'll see the friendly "we don't recognise this account" screen — that's the security check working.
- Add yourself to the Mentors tab with a test pair and book a session. Check the calendar invite arrives.

---

## Filling in the data

**Sites tab** — the `hours` column drives everything. Format:

```
Tue 3:10-5:10; Wed 2:00-4:00; Thu 3:10-5:10
Mon-Fri 3:00-6:00; Wed 2:00-6:00
```

Day ranges work, and a later segment overrides an earlier one for the same day. Times are assumed PM. A site with blank hours offers mentors **no dates at all** — that's currently Miami Carol City Senior, Miami Central, and Booker T. Washington.

Also add a `staff_email` per site. That address goes on every invite and is who the day-of coverage check asks.

**Mentors tab** — `email` must be the Google account they'll sign in with. If a mentor's school email differs from their personal one, use whichever they actually log into. `instruments` is comma-separated.

**Pairs tab** — set `approved` to `TRUE`, then menu → **Create missing sessions**.

---

## Mentor intake

Mentors can't be matched until they've filled this in, and the page shows them nothing else until they do. Three steps:

**1. Where do you travel from?** They enter one address and say whether it's home or school. This is geocoded once. It is used only for distance and is never shown to students or families.

**2. Which schools could you get to?** Every school with programme hours on file, sorted nearest first, with a real driving estimate. Their own school — if it's also a YMU site — is pinned to the top, because zero travel beats everything. The closest three are badged as suggestions. They pick as many as they'd genuinely go to, up to five.

Why this matters: a sixteen-year-old crossing Miami on a school afternoon is the single likeliest reason a session quietly stops happening. Ranking by travel is the cheapest thing you can do to protect attendance.

**3. When are you free?** A month calendar, Calendly-style — but **only for the two months we're currently collecting**.

Availability is picked **date by date, not as a weekly pattern**. A teenager might be free Monday 12 October and then not again for a fortnight. A weekly pattern is already wrong by November and quietly generates sessions nobody can attend.

Days the school is shut are visible but greyed out and labelled — "Thanksgiving recess", "Teacher planning day" — so nobody wonders why 25 November won't click. Every tap saves immediately.

**The rule: at least 2 times in each month of the cycle.** They're asked for around 6. The Finish button appears once both months clear the minimum. A mentor can't un-tick a time their session is already booked on.

---

## Collection cycles

Availability is gathered two months at a time. Nobody is asked in September what they're doing next April.

| Cycle | Opens | Due | Covers |
|---|---|---|---|
| C1 | 1 Sept 2026 | 12 Sept 2026 | October, November |
| C2 | 2 Nov 2026 | 13 Nov 2026 | December, January |
| C3 | 4 Jan 2027 | 15 Jan 2027 | February, March |
| C4 | 1 Mar 2027 | 12 Mar 2027 | April |

A mentor is only ever shown, and only ever blocked by, the cycle in front of them. Dates outside it are refused with an explanation.

**Worth knowing:** the collecting cycle is not the cycle whose sessions are running. In early November, C1's November sessions are still happening while C2 is what mentors are being asked about. Menu → **Where is each cycle up to?** shows exactly who has done what.

**When a cycle opens**, the daily job emails every mentor asking for their times, and repeats weekly until the deadline. The email pushes them to keep the same days and times, because consistency is what makes the whole thing calm.

**If nobody replies by the deadline**, their existing pattern is carried forward onto the new cycle's valid dates — skipping holidays. They're told it happened and asked to check it.

**Then it's re-checked.** A Tuesday-3:30 pattern that gave four October dates gives three in December once winter recess is out. If a month falls below the minimum, that mentor gets a "your availability is short — school holidays" email. This is the case people forget, and it's the one that silently breaks a month.

---

## The student's side

A separate page, a separate audience, and a deliberately different look so nobody is confused about whose screen they're on.

The student sees their mentor's first name, their instrument, their school — and a calendar of **the days their mentor offered**. They pick the time. That's the normal way a session gets booked: the family chooses the hour that fits round pickup and homework, rather than being handed one.

**Keeping the same time.** The first booking sets the pair's usual day and time. Every later month then leads with *"Suggested: Tuesday 10 November at 3:30 — the same as your usual time"* and a one-tap button. Both sides are pushed towards consistency without being forced.

**Two ways in:**

- **Private link** — `?token=…`, emailed to the guardian. No Google account needed, which matters since many afterschool students don't have one. Treat these links like passwords.
- **Google sign-in** — works if the address matches `student_email` or `guardian_email` on the Mentees tab.

A student can only ever see and touch their own sessions; both paths are checked server-side.

---

## The reschedule rule

A mentor may only move a session if **at least 2 full hours remain on offer** for that month besides the one they're moving. Otherwise:

> *"Moving this session would leave only 1 other time on offer for October. We need at least 2 full hours available so there is somewhere to go if this one falls through too. Please add more availability for that month first."*

This is why the form asks for around 6 times a month rather than the bare 2. A student picking a time is never blocked by this rule — only a mentor moving one.

---

## Communication templates

Everything automated lives on the **Templates** tab: the wording, who receives it, when it fires, how often, and an on/off switch.

Edit the subject or body there and the next send uses your wording. No code change, no redeploy. Set `enabled` to `FALSE` to switch a message off entirely.

Menu → **Show the message schedule** lists every message with its audience, timing and frequency, plus the numbers from Config that control the actual cadence.

Placeholders you can use: `{{mentee}}` `{{mentor}}` `{{instrument}}` `{{site}}` `{{siteAddress}}` `{{month}}` `{{date}}` `{{time}}` `{{count}}` `{{booked}}` `{{unbooked}}` `{{cycleMonths}}` `{{cycleDue}}` `{{bookingLink}}` `{{menteeLink}}` `{{feedbackLink}}` `{{coordinator}}`. Anything unrecognised is left visible in the email rather than silently vanishing, so a typo shows up.

---

## The feedback form

Menu → **Create the feedback form** builds a Google Form and points its responses at this spreadsheet. It asks: who's filling it in, how the session went (1–5), how much progress the student is making (1–5), what they worked on, and anything YMU should follow up on.

It's sent **5 minutes before the session is due to end** (set by `feedbackMinutesBeforeEnd`), to the mentor and the student's guardian — which is when people will actually fill it in, while they're still in the room. That's what the every-15-minutes trigger is for; a daily job can't do it.

**How it matches up:** the link is pre-filled with a hidden session reference, so a response files itself against the right session and pair. Nobody types a reference number. A mentor's response also closes the session out, and anything in the follow-up box emails you immediately and appears on the dashboard.

Menu → **Feedback so far** gives average satisfaction and progress per pair, for end-of-year reporting.

Edit the questions in the Form itself — the matching only depends on the "Session reference" question, so leave that one alone.

---

## The school calendar

Menu item 5 loads the MDCPS **2026-2027** calendar — 28 non-student weekdays between October and April, from the Board-approved calendar of 23 January 2025. December loses 10 weekdays and March loses 6 in a row, since spring recess runs straight into the 29 March planning day. **October and April are completely clear.**

Nothing can be offered or booked on a closed day, in either the intake calendar or the booking calendar.

**To add a closure for one school only** — a hurricane day, testing week, a school event — add a row to the Closures tab and put that school's `site_id` in. Leave `site_id` blank for a district-wide day. Worth doing: individual schools add their own closures that the district calendar doesn't carry, so a call to each front office before October is time well spent.

**One thing to check:** every Wednesday, K-8 centres release grades 2–8 an hour early. That affects Fienberg/Fisher, West Little River and Henry Reeves. If it shortens their Wednesday afterschool programme, edit that site's `hours` — the calendar can't know it.

## Cancelling

A mentor can move a session but cannot simply drop one. Choosing a new date *is* the cancellation — there's no way to release a date and leave it empty, because a freed slot nobody is watching is how a session gets lost.

If genuinely nothing on the list works, **"None of these work"** asks them why and emails you. Their existing booking stays in place until you agree a new one, so nothing vanishes from anyone's calendar in the meantime.

## How the reminders behave

| Trigger | Goes to |
|---|---|
| A cycle opens, then weekly until the deadline | Mentor + their parents, you copied |
| Cycle deadline passed with no reply | Pattern carried forward, mentor told |
| Carried pattern short because of holidays | Mentor + their parents, you copied |
| Intake not finished | Mentor + their parents, you copied |
| Session unbooked as the month closes | Student's guardian, mentor and you copied |
| 5 min before a session ends | Mentor and student's guardian — the feedback form |
| Booking made or moved | Everyone, via the calendar invite — Google sends it |
| 7 days before (or on booking, if booked later than that) | Everyone |
| 1 day before | Everyone |
| Morning of | Everyone — the coverage check, with the three confirmations |
| Unbooked, 3 weeks before month end, then weekly | Mentor + their parents, you copied |
| 1 day after a session with no closeout | Mentor + parent, you copied |
| Reschedule count over 2 | You only |
| Follow-up flagged in a closeout | You, immediately |
| Every morning | You — one digest, only if something needs you |

Running the daily job twice never double-sends: each send is stamped in the sheet first. Moving a date clears those stamps so the new date gets its own reminders.

---

## Costs

Everything above is **$0** on Google Workspace for Nonprofits.

If you later want texts to parents, Twilio is roughly 1.5¢ per message, but US sending requires A2P 10DLC registration: about $4.50 one-off brand fee, $15 one-off campaign vetting, then $3/month on the 501(c)(3) charity rate — call it **$55 in year one**. Approval takes 10–15 days, so start it in September if you want texts running by October.

---

## Known limits

- **Guest reminders can't be forced.** Google treats reminder settings as private per-user data, so a "1 week before" reminder set by the organiser only fires for the organiser. That's exactly why the week/day/day-of reminders here are emails the script sends rather than calendar reminders. Don't be talked into replacing them with event reminders.
- **One room per site per time.** If a school can genuinely host two pairs at once, change `roomsPerSite` in Config.
- **Sessions are 1 hour.** Change `sessionMinutes` in Config if that's wrong. Note this changes which slots fit: Fienberg/Fisher's 3:10–5:10 window holds two one-hour slots (3:30 and 4:00), where it held three half-hour ones.
- **The calendar is for 2026-27 only.** Next school year, replace the dates in `Closures.gs` and update `schoolYearStart` and the `cycles` dates in Config.
- **Student links are secrets.** Anyone with the link sees that student's sessions. Re-issue by clearing `access_token` and running "Create student booking links" again.
- **A mentor with two students** isn't supported by the pages yet — each shows the first pair.
- **Distance uses Apps Script's built-in Maps service** — no API key, no billing, 10,000 geocodes and 10,000 direction lookups a day on Workspace. This whole programme uses about a hundred, once. Coordinates are stored in the Sites and Mentors tabs so they're not looked up twice.
- **Script runtime is 6 minutes per execution.** The daily job reads the whole Sessions tab, which is fine into the thousands of rows. If it ever times out, that's the thing to look at.
- **A mentor with two mentees** isn't supported by the booking page — it shows their first pair. Tell me if you need that.
