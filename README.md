# Leamington Marathi — Official Website

**लेमिंग्टन मराठी | "वारसा मराठी संस्कृतीचा"**

The website of Leamington Marathi, a volunteer-run, non-profit community group of 400+
Marathi families in Leamington Spa & Warwick, UK.

> **© 2026 Leamington Marathi. All rights reserved.** This code, design, text, photos and videos
> belong to Leamington Marathi and the people credited on the site. They are public so the
> website can be hosted here, not for reuse. Please do not copy, reuse or republish any part
> without written permission from leamingtonmarathi@gmail.com.

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

## Add to phone (PWA)

`manifest.webmanifest` and `sw.js` make the site installable (home screen icon, opens
like an app) and keep visited pages working offline. Pages are always fetched fresh
when online; other files are served from cache and refreshed in the background. Videos
are never cached. If you add a new page, add it to the `CORE` list in `sw.js` and bump
`VERSION` there so old caches are cleared. Icons live in `images/icons/`.

## Membership (member.html)

Free member accounts (sign up / sign in / forgot password / one-time email-link
sign-in) run on **Firebase Authentication** — free tier, no server needed.
The page shows a "launching soon" note until `member-config.js` is filled in;
the step-by-step switch-on checklist is written at the top of that file.
Member data stored: name + email only, in the community's own Firebase project.

## Copyright

© 2026 Leamington Marathi. All rights reserved. Do not reuse without permission.

The code, design, text, photos and videos in this repository are not open source and are not
licensed for reuse. Photos and videos by other people remain theirs and are credited on the
website (see `privacy.html`). To ask about using anything, email leamingtonmarathi@gmail.com.
