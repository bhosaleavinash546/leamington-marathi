# Leamington Marathi — Official Website

**लेमिंगटन मराठी | "वारसा मराठी संस्कृतीचा"**

The website of Leamington Marathi, a volunteer-run, non-profit community group of 400+
Marathi families in Leamington Spa & Warwick, UK.

## What's here

| File | Purpose |
|------|---------|
| `index.html` | The whole website (single page) |
| `style.css` | All styling — colours, layout, animations |
| `script.js` | Interactivity — menus, carousel, forms, counters |
| `images/` | Logos and event photos |
| `404.html`, `robots.txt`, `sitemap.xml` | Hosting/search-engine support files |
| `EDITING.md` | **How to update the site — start here if you're a volunteer** |

## Hosting

The site is fully static — no server or database. It is designed for **GitHub Pages**
(Settings → Pages → Deploy from branch → `main` → `/ (root)`), free of charge.

## Contact form & newsletter

Both post to [FormSubmit](https://formsubmit.co) and arrive at the group inbox
(`leamingtonmarathi@gmail.com`). The very first submission triggers a one-time
activation email to that inbox — click the link in it once and everything flows.

## Updating content

See **[EDITING.md](EDITING.md)** — written for non-developers; everything can be done
from the GitHub website without installing anything.

## Membership (member.html)

Free member accounts (sign up / sign in / forgot password / one-time email-link
sign-in) run on **Firebase Authentication** — free tier, no server needed.
The page shows a "launching soon" note until `member-config.js` is filled in;
the step-by-step switch-on checklist is written at the top of that file.
Member data stored: name + email only, in the community's own Firebase project.
