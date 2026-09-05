/**
 * Build-time flag for the public shop-window build (`npm run build:site`).
 *
 * That build produces the landing page ALONE, hosted on GitHub Pages with no
 * server behind it — no API, no database, no Anthropic key. So every control
 * that would call the backend has to become an honest link instead of a button
 * that silently does nothing. `STATIC_SITE` is what the landing page branches
 * on; Vite folds it to `false` in the real app build, so the branches vanish.
 */
export const STATIC_SITE = import.meta.env.VITE_STATIC_SITE === '1';

/**
 * Where a visitor to the shop window is actually sent. The repo identity lives
 * in site/site.config.json — it is also the Vite base, the postbuild's URL
 * check and the deploy gate, and four hand-written copies is how they drift.
 */
import siteConfig from '../../site/site.config.json';

export const REPO_URL = `https://github.com/${siteConfig.owner}/${siteConfig.repo}`;
export const DEPLOY_DOC_URL = `${REPO_URL}/blob/main/docs/DEPLOYMENT.md`;
