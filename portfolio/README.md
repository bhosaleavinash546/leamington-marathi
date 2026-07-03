# Avinash Bhosale — Portfolio

A fast, single-page personal portfolio. Pure static HTML/CSS/JS — no build step, no
dependencies. Works on GitHub Pages, Netlify, or any static host.

## Files

| File | Purpose |
|------|---------|
| `index.html` | All the content and structure |
| `style.css` | Styling, colours, layout, dark/light theme |
| `script.js` | Theme toggle, mobile menu, scroll animations |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Personalise it (5 minutes)

All placeholder text is wrapped in double brackets like `[[ this ]]`.
Open `index.html`, search for `[[`, and replace each one with your real details:

- **Hero** — headline, tagline, location, role, social links
- **About** — your LinkedIn "About" summary + the three stat numbers
- **Experience** — one timeline block per role (title, company, dates, bullets)
- **Skills** — group names and skill chips
- **Projects** — name, description, tags, link per card
- **Contact** — email and LinkedIn URL

To add or remove an item (a job, a project, a skill), copy or delete the matching
block in `index.html`. The layout adjusts automatically.

## Deploy on GitHub Pages

1. Create a new repository (e.g. `avinash-bhosale-portfolio`).
2. Put these files in the repository **root** (not in a subfolder).
3. Repo **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Choose branch `main` and folder `/ (root)`, then **Save**.
5. Your site goes live at `https://<username>.github.io/<repo>/` within a minute or two.

Want a custom domain? Add a `CNAME` file containing just your domain, and point the
domain's DNS at GitHub Pages.

## Theme

The site follows the visitor's system light/dark preference and remembers the toggle
choice. Colours live at the top of `style.css` under `:root` — change `--accent` to
re-skin the whole site.
