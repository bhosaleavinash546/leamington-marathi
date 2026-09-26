# How to update the Leamington Marathi website

*A guide for volunteers — no coding tools needed, everything happens on the GitHub website.
You'll need a free GitHub account with access to this repository.*

## The golden rule

Everything visible on the site lives in **`index.html`**. Photos live in the **`images/`**
folder. You almost never need to touch `style.css` or `script.js`.

## Editing text (event dates, numbers, wording)

1. Open the repository on github.com and click **`index.html`**.
2. Click the **pencil icon** (✏️ top right of the file view).
3. Press `Ctrl+F` (or `Cmd+F`) and search for the text you want to change —
   e.g. search `Gudhi Padwa` to find that event's card.
4. Edit the text. Marathi text can be typed or pasted directly.
5. Scroll down, write a one-line description (e.g. "Updated Gudhi Padwa date"),
   and click **Commit changes**.
6. Wait 2–10 minutes — the live site updates automatically.

## Common updates and where to find them

| What | Search for this in `index.html` |
|------|--------------------------------|
| "What's New" ticker announcements | `ticker-items` — each `<li>` is one rotating headline; add/remove/reorder freely. Add `data-until="YYYY-MM-DD"` to a headline with a deadline and it disappears by itself the day after |
| Next-event chip in the hero | `hero-next` — update the text, `data-event-date` (drives the countdown) AND `data-until` (the chip hides itself the day after) |
| Event tickets on sale | `timeline-card` — there is a ready-made `ticket-link` snippet in a comment on the Shivrajyotsav card; it turns into "See the photos →" automatically after the event |
| Event details / participant counts | `timeline-card` |
| Stats (400+ families etc.) | `data-count` — change both the attribute and the visible number |
| Testimonial quotes | `testimonial` — replace the sample quotes with real ones |
| Sponsor logos | `supporter-slot` — swap a placeholder for `<img src="images/sponsor-name.png" alt="Sponsor Name">` |
| Social media links | `socials` |

## Keeping the site fresh (15 minutes, four times a year)

Dates carry on moving after the site is published. Anything marked `data-until` retires
itself, but a person still needs to add what comes next. After each big event, and at
least every quarter, run through this list:

1. **Hero chip** (`hero-next`) — point it at the next event with its date.
2. **Ticker** (`ticker-items`) — remove anything that has happened, add what's coming.
3. **Events timeline** — tickets link for the next event (snippet in the Shivrajyotsav card).
4. **Gallery & flyers** — add the latest event's best photos and poster.
5. **Journey** (`p-stones`) — add a milestone if something big happened.
6. **Festival dates** (`FESTIVALS` in `script.js`) — every January, update the lunar
   festival ranges (Ganeshotsav, Diwali) for the new year.
7. **Diwali Ank** (`ank.html`) — deadline and contents each autumn.
8. **Membership** (`member.html`) — once switched on, nothing to do; until then, see
   the checklist at the top of `member-config.js`.

## Adding or replacing photos

1. **Resize first!** Phone photos are huge. Use any free tool (e.g. iloveimg.com/resize-image)
   to make them roughly **800px wide** — the site stays fast that way.
2. In the repository, open the **`images/`** folder → **Add file → Upload files**.
3. Give the file a simple lowercase name, e.g. `ganeshotsav-2026.jpg`.
4. Edit `index.html` and change the relevant `<img src="images/...">` to your new filename.
   Keep the `width`/`height` numbers roughly matching the photo's real proportions.

## The Diwali Ank (दिवाळी अंक)

The magazine lives in **`ank.html`** — a separate page. As members send contributions,
paste each one into the matching section (लेख आणि कविता / पाककृती / बालविभाग), replacing
the dashed "waiting for your words" boxes. The editorial and the submission deadline
are marked with TODO comments for the committee to confirm.

## The photo grid (Dhol section)

Search `dhol-grid` — four visible photo tiles plus hidden `dhol-spare` photos that
rotate through them automatically. Add or swap the `<img>` lines; the four inside
`dhol-tile` boxes show first.

## Festival decorations (once a year job)

During festival weeks the homepage automatically shows a greeting in the ticker and
falling decorations (diyas at Diwali, flowers at Ganeshotsav, kites at Sankranti).
Fixed-date festivals (Sankranti, Shiv Jayanti, Maharashtra Din) repeat every year by
themselves. **Lunar festivals move**: each January, open `script.js`, find `FESTIVALS`,
and update the Ganeshotsav and Diwali date ranges for the new year.

## If something breaks

Every change is saved in the **History** (clock icon on the file). Open the last good
version and click **Revert** — nothing is ever lost. When in doubt, ask before guessing.
