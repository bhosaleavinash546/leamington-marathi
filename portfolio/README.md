# Avinash Bhosale — Portfolio

A professional, animated personal portfolio for **Avinash Bhosale** — Senior Cost
Improvement Engineer (Propulsion) and builder of AI-powered cost-intelligence platforms.

Built with **React + Vite**, motion by **Framer Motion**, and data visualisations with
**Recharts**. Fonts are self-hosted (Inter + Sora) so the site is fully self-contained —
no runtime CDN calls.

## Highlights

- Animated hero with an orbiting skill badge and live scroll-progress bar
- Scroll-reveal motion on every section (respects `prefers-reduced-motion`)
- Count-up stat band
- Vertical career timeline (JLR → John Deere → Tata Technologies)
- **Charts:** tenure-by-organisation bar chart + core-competency radar
- AI platform showcase — BrainSpark, CostLens, CostVision
- Fully responsive with a mobile nav; refined dark "gold on navy" theme

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the built site
```

## Edit the content

Everything lives in **`src/data.js`** — profile, stats, experience, projects, skills,
certifications, awards, education, and the chart data. Change the text there and the whole
site updates. Colours are CSS variables at the top of `src/index.css` (`--accent` re-skins
the site).

## Deploy to GitHub Pages

The repo includes a ready-made workflow at `.github/workflows/deploy.yml`.

1. Create a new GitHub repository (e.g. `avinash-bhosale-portfolio`).
2. Put **the contents of this folder at the repository root** (so `package.json` and
   `.github/` sit at the top level).
3. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Push to `main`. The workflow builds the site and publishes it automatically.

Prefer a custom domain? Add a `public/CNAME` file containing just your domain, then point
the domain's DNS at GitHub Pages.

> Note: this folder currently lives inside the Leamington Marathi repo only as a staging
> area — it does not affect that live site. It is designed to move into its own repository.

## Tech

| Tool | Role |
|------|------|
| React 18 + Vite 6 | App framework & build |
| Framer Motion | Animation & scroll reveals |
| Recharts | Bar + radar charts |
| lucide-react | Icons |
| @fontsource | Self-hosted Inter & Sora fonts |
