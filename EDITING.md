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
| "What's New" ticker announcements | `ticker-items` — each `<li>` is one rotating headline; add/remove/reorder freely |
| Next-event chip in the hero | `hero-next` — update the text AND `data-event-date="YYYY-MM-DD"` (drives the countdown) |
| Event details / participant counts | `timeline-card` |
| Stats (400+ families etc.) | `data-count` — change both the attribute and the visible number |
| Testimonial quotes | `testimonial` — replace the sample quotes with real ones |
| Sponsor logos | `supporter-slot` — swap a placeholder for `<img src="images/sponsor-name.png" alt="Sponsor Name">` |
| Social media links | `socials` |

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

## The animated photo stack (Dhol section)

Search `dhol-stack` — it's just a list of `<img>` lines; add, remove, or reorder them.
The first one in the list shows first.

## Festival decorations (once a year job)

During festival weeks the homepage automatically shows a greeting in the ticker and
falling decorations (diyas at Diwali, flowers at Ganeshotsav, kites at Sankranti).
Fixed-date festivals (Sankranti, Shiv Jayanti, Maharashtra Din) repeat every year by
themselves. **Lunar festivals move**: each January, open `script.js`, find `FESTIVALS`,
and update the Ganeshotsav and Diwali date ranges for the new year.

## If something breaks

Every change is saved in the **History** (clock icon on the file). Open the last good
version and click **Revert** — nothing is ever lost. When in doubt, ask before guessing.
