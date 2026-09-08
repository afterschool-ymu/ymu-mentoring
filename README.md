# YMU Mentoring

One-on-one music mentoring for Young Musicians Unite: matching Student Ambassadors to
afterschool students, letting families choose their own session times, sending every reminder
automatically, and tracking how each student is getting on.

---

## Read this before you deploy anything

**The working system cannot run on Vercel, Render, Railway or GitHub Pages.**

Those hosts serve static files or Node servers. This system's server *is* Google Apps Script,
and that is not an accident — Apps Script is what gives it, for free and with no accounts to
manage:

| It needs to | Apps Script provides |
|---|---|
| Send ~10 kinds of email | `MailApp`, 1,500/day on Workspace |
| Wake up at 6am with nobody logged in | Time-driven triggers |
| Know which mentor is looking | Google sign-in, no passwords to reset |
| Create and update calendar invites | Calendar API with `sendUpdates:'all'` |
| Store data you can fix by hand at 4pm on a Tuesday | The Sheet itself |

Rebuilding that on Vercel means a database, an auth provider, a mail provider, a cron worker
and a bill. For 15 pairs it buys you nothing.

**So what is this repository for?** Three things, all of which are worth having:

1. **Version control and backup** for the Apps Script code, which otherwise exists only inside
   one Google account.
2. **Two clean public links** (`/mentor/` and `/student/`) that forward to the web app — see
   below for why that indirection matters.
3. **The documentation and previews**, hosted so anyone can read them.

The static site goes on GitHub Pages. The actual app stays in Apps Script. Both are free.

---

## The two links

| Link | Who | How they get in |
|---|---|---|
| `https://<you>.github.io/ymu-mentoring/mentor/` | Student Ambassadors | Google sign-in, checked against the Mentors tab |
| `https://<you>.github.io/ymu-mentoring/student/?token=…` | Students and guardians | A private token in the link — no account needed |

Both forward to the same Apps Script `/exec` URL, which works out who is asking.

### Why not just hand out the `/exec` URL directly?

Because it changes. Every time you create a **New deployment**, Google issues a brand-new
`/exec` URL and the old one keeps serving the old code. With these shims, the address in
everyone's inbox is stable and you update one line in [`docs/config.js`](docs/config.js).

> When you change the code, use **Deploy → Manage deployments → ✏️ → New version**, which keeps
> the URL. Only use **New deployment** when you genuinely want a second, separate copy.

### The student link is a password

`?token=…` is the only secret in the system. Anyone holding one can see that student's sessions.

- Never commit tokens, never post one publicly, never put one in a shared doc.
- `/student/` with no token shows a help page — it does not list students.
- To revoke: clear `access_token` on the Mentees tab and run **Create student booking links**.

---

## Setting it up

Full walkthrough in [SETUP.md](SETUP.md). The short version:

1. New Google Sheet in the **YMU** Drive (not a personal account — personal caps email at 100/day).
2. **Extensions → Apps Script**, paste in the files from [`apps-script/`](apps-script/) plus your
   own `Roster.gs` (see below).
3. **Services → +** → Google Calendar API, identifier `Calendar`. Booking fails without it.
4. Reload the Sheet, work down the **YMU Mentoring** menu items 1–7 in order.
5. **Deploy → New deployment → Web app**: execute as *Me*, access *Anyone with a Google account*.
6. Paste the `/exec` URL into **both** `CFG.webAppUrl` in `Config.gs` **and**
   `webAppUrl` in `docs/config.js`.
7. Menu → **Install automation**.

Then publish the site: **Settings → Pages → Source: `main` / folder: `/docs`**.

---

## The roster is not in this repository

`Setup.gs` used to hardcode 15 Student Ambassadors with their phone numbers, their email
addresses, and their parents' names and email addresses. All of them are minors.

That has been pulled out. It now lives in a separate script file, `Roster.gs`, which
[`.gitignore`](.gitignore) excludes. Your working copy is in `private/Roster.gs`.

- **Paste `private/Roster.gs` into Apps Script as a script file named `Roster`.**
  Apps Script has no modules, so its top-level `const MENTORS_SEED` is visible to `Setup.gs`.
- [`apps-script/Roster.example.gs`](apps-script/Roster.example.gs) documents the shape with
  invented people. Do not paste that one in.

**If you ever push the real roster to a public repository, deleting it afterwards does not
undo it** — forks, caches and the GitHub Archive keep copies. Check before you push:

```bash
git ls-files | xargs grep -lE "[0-9]{3}-[0-9]{3}-[0-9]{4}"
```

That should print nothing.

A pre-commit hook enforces this. Git does not clone hooks, so on a fresh
checkout run once:

```bash
ln -sf ../../tools/pre-commit .git/hooks/pre-commit
```

---

## Layout

```
apps-script/          The system. Paste these into the Apps Script editor.
  Config.gs           Settings, cycles, tab layout — the only file you normally edit
  Setup.gs            Menu, seed data, triggers, reports
  WebApp.gs           Routes mentors and students, serves both pages
  MenteeApp.gs        The student's side, token access
  Availability.gs     Dates, calendars, the booking rules
  Scheduling.gs       Booking, calendar invites, the reschedule rule
  Cycles.gs           Two-month collection cycles, carry-forward
  Closures.gs         The 28 MDCPS closure days
  Reminders.gs        The 6am job
  Templates.gs        All ten messages
  Feedback.gs         Form, sending, matching responses to sessions
  Geo.gs              Geocoding and drive times
  MentorPage.html     Mentor screen
  MenteePage.html     Student screen
  Roster.example.gs   Shape of the roster, invented people

docs/                 GitHub Pages site — static, no data
  index.html          This system explained
  config.js           >>> THE ONE FILE YOU EDIT AFTER DEPLOYING <<<
  mentor/             Forwards to the mentor page
  student/            Forwards to a student's page, or explains how to find their link
  preview/            Both screens, runnable offline, with invented people
  matcher.html        The original standalone matching tool

private/              NOT IN GIT. Your real roster.
```

---

## Cost

$0. Apps Script, Sheets, Calendar, Forms and Maps geocoding are all included in Google
Workspace for Nonprofits. GitHub Pages is free. Nothing here has a renewal date.
