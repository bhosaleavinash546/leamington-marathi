interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  imageUrl?: string;
}

const NEWS_CATEGORIES = [
  '', 'Battery', 'EV Tech', 'EDU', 'BIW', 'Chassis', 'Suspension',
  'Casting', 'Forging', 'Machining', 'Sheet Metal', 'Composites', 'Plastics',
  'PCB / PCBA', 'Harness', 'Lightweighting', 'Materials', 'Robotics',
  'Sustainability', 'Cost & Commodity', 'Assembly',
];

const NEWS_CAT_LABELS: Record<string, string> = {
  '': 'All',
  'EDU': 'E-Drive / EDU',
};

const NEWS_CAT_COLORS: Record<string, string> = {
  'Battery':          '#22c55e',
  'EV Tech':          '#3b82f6',
  'EDU':              '#8b5cf6',
  'BIW':              '#f59e0b',
  'Chassis':          '#64748b',
  'Suspension':       '#94a3b8',
  'Casting':          '#f97316',
  'Forging':          '#ef4444',
  'Machining':        '#06b6d4',
  'Sheet Metal':      '#0ea5e9',
  'Composites':       '#84cc16',
  'Plastics':         '#a78bfa',
  'PCB / PCBA':       '#10b981',
  'Harness':          '#ec4899',
  'Lightweighting':   '#14b8a6',
  'Materials':        '#f59e0b',
  'Robotics':         '#6366f1',
  'Sustainability':   '#22c55e',
  'Cost & Commodity': '#fb923c',
  'Assembly':         '#60a5fa',
};

let _newsArticles: NewsArticle[] = [];
let _newsCategory = '';
let _newsRefreshTimer: ReturnType<typeof setInterval> | null = null;
let _newsLastFetch = 0;
let _newsSearch = '';

function _newsEscHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _newsTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function _newsReadMins(title: string, summary: string): number {
  const words = (title + ' ' + summary).trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function renderNewsCards(): void {
  const gridEl = document.getElementById('news-grid');
  const emptyEl = document.getElementById('news-empty');
  if (!gridEl) return;

  let filtered = _newsCategory
    ? _newsArticles.filter(a => a.category === _newsCategory)
    : _newsArticles;

  if (_newsSearch) {
    const q = _newsSearch.toLowerCase();
    filtered = filtered.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q)
    );
  }

  const countEl = document.getElementById('news-count');
  if (countEl) {
    countEl.textContent = _newsSearch || _newsCategory
      ? `${filtered.length} of ${_newsArticles.length} articles`
      : `${_newsArticles.length} articles`;
  }

  if (!filtered.length) {
    gridEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = '';
      const msgEl = emptyEl.querySelector('p');
      if (msgEl) msgEl.textContent = _newsSearch
        ? `No articles found for "${_newsSearch}". Try a different search term.`
        : 'No articles found. Try refreshing or selecting a different category.';
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  gridEl.innerHTML = filtered.map((a, idx) => {
    const color = NEWS_CAT_COLORS[a.category] ?? 'var(--accent)';
    const timeAgo = _newsTimeAgo(a.publishedAt);
    const readMins = _newsReadMins(a.title, a.summary);
    const isFeatured = idx === 0 && !_newsCategory && !_newsSearch;
    const imgHtml = a.imageUrl
      ? `<div class="news-card-img" style="background-image:url('${_newsEscHtml(a.imageUrl)}')"></div>`
      : '';
    const borderStyle = isFeatured ? `border-top-color:${color}` : `border-left-color:${color}`;
    const bodyContent = `
  <span class="news-card-cat" style="color:${color}">${_newsEscHtml(a.category)}</span>
  <h3 class="news-card-title">${_newsEscHtml(a.title)}</h3>
  <p class="news-card-summary">${_newsEscHtml(a.summary)}</p>
  <div class="news-card-footer">
    <span class="news-card-source">${_newsEscHtml(a.source)}</span>
    <span class="news-card-meta">
      <span class="news-card-readtime">~${readMins}m</span>
      <span class="news-card-date">${_newsEscHtml(timeAgo)}</span>
    </span>
  </div>`;
    if (isFeatured) {
      return `<a class="news-card news-card--featured" href="${_newsEscHtml(a.url)}" target="_blank" rel="noopener noreferrer" style="${borderStyle}">
  ${imgHtml}<div class="news-card-body">${bodyContent}</div>
</a>`;
    }
    return `<a class="news-card" href="${_newsEscHtml(a.url)}" target="_blank" rel="noopener noreferrer" style="${borderStyle}">
  ${imgHtml}${bodyContent}
</a>`;
  }).join('');
}

function updateNewsTicker(): void {
  const track = document.getElementById('news-ticker-track');
  const wrap = document.getElementById('news-ticker-wrap');
  if (!track || !_newsArticles.length) return;
  const top = _newsArticles.slice(0, 20);
  const makeItems = () => top.map(a => {
    const color = NEWS_CAT_COLORS[a.category] ?? 'var(--accent)';
    return `<a class="news-ticker-item" href="${_newsEscHtml(a.url)}" target="_blank" rel="noopener noreferrer">` +
      `<span class="news-ticker-cat" style="color:${color}">${_newsEscHtml(a.category)}</span>` +
      `<span>${_newsEscHtml(a.title)}</span>` +
      `</a><span class="news-ticker-sep" aria-hidden="true">◆</span>`;
  }).join('');
  track.innerHTML = makeItems() + makeItems();
  const dur = Math.max(40, top.length * 5);
  track.style.animationDuration = `${dur}s`;
  if (wrap) wrap.style.display = 'flex';
}

function initNewsCats(): void {
  const catsEl = document.getElementById('news-cats');
  if (!catsEl) return;
  const renderCats = () => {
    catsEl.innerHTML = NEWS_CATEGORIES.map(cat => {
      const label = NEWS_CAT_LABELS[cat] ?? (cat || 'All');
      const color = cat ? (NEWS_CAT_COLORS[cat] ?? 'var(--accent)') : '';
      const style = cat && color ? ` style="--cat-color:${color}"` : '';
      const count = cat ? _newsArticles.filter(a => a.category === cat).length : _newsArticles.length;
      const countBadge = count > 0 ? ` <span class="news-cat-count">${count}</span>` : '';
      return `<button class="news-cat${cat === _newsCategory ? ' active' : ''}" data-cat="${_newsEscHtml(cat)}"${style}>${_newsEscHtml(label)}${countBadge}</button>`;
    }).join('');
  };
  renderCats();
  catsEl.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.news-cat') as HTMLElement | null;
    if (!btn) return;
    _newsCategory = btn.dataset.cat ?? '';
    renderCats();
    renderNewsCards();
  });
}

async function fetchNews(force = false): Promise<void> {
  const now = Date.now();
  if (!force && _newsArticles.length > 0 && now - _newsLastFetch < 5 * 60 * 1000) {
    renderNewsCards();
    updateNewsTicker();
    return;
  }
  const loadEl = document.getElementById('news-loading');
  const gridEl = document.getElementById('news-grid');
  const emptyEl = document.getElementById('news-empty');
  if (loadEl) loadEl.style.display = '';
  if (gridEl) gridEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error('news api error');
    const data = (await res.json()) as { articles: NewsArticle[]; cached?: boolean; ageSeconds?: number };
    _newsArticles = data.articles ?? [];
    _newsLastFetch = Date.now();
    initNewsCats();
    const ageEl = document.getElementById('news-age');
    if (ageEl && data.ageSeconds !== undefined) {
      const mins = Math.round(data.ageSeconds / 60);
      ageEl.textContent = data.cached ? `· cached ${mins}m ago` : '· live';
    }
  } catch {
    // silently leave previous articles or show empty
  } finally {
    if (loadEl) loadEl.style.display = 'none';
    if (gridEl) gridEl.style.display = '';
    renderNewsCards();
    updateNewsTicker();
  }
}

export async function refreshNews(): Promise<void> {
  return fetchNews(true);
}

export function showNews(): void {
  document.getElementById('home-view')?.style.setProperty('display', 'none');
  document.getElementById('negotiation-view')?.style.setProperty('display', 'none');
  document.getElementById('commodity-picker-view')?.style.setProperty('display', 'none');
  const costingEl = document.getElementById('costing-view');
  if (costingEl) { costingEl.classList.remove('wf-panel','wf-panel--open'); costingEl.style.display = 'none'; }
  document.body.classList.remove('cv-new-costing');
  document.getElementById('wf-panel-header')?.style.setProperty('display','none');
  document.getElementById('picker-backdrop')?.style.setProperty('display','none');
  const newsEl = document.getElementById('news-view');
  if (newsEl) newsEl.style.display = '';
  // Wire search input
  const searchInput = document.getElementById('news-search') as HTMLInputElement | null;
  if (searchInput && !searchInput.dataset.wired) {
    searchInput.dataset.wired = '1';
    searchInput.addEventListener('input', () => {
      _newsSearch = searchInput.value.trim();
      renderNewsCards();
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchInput.value = ''; _newsSearch = ''; renderNewsCards(); }
    });
  }
  // Wire empty-state refresh button
  const emptyRefreshBtn = document.getElementById('news-empty-refresh-btn');
  if (emptyRefreshBtn && !emptyRefreshBtn.dataset.wired) {
    emptyRefreshBtn.dataset.wired = '1';
    emptyRefreshBtn.addEventListener('click', () => void fetchNews(true));
  }
  void fetchNews();
  if (_newsRefreshTimer) clearInterval(_newsRefreshTimer);
  _newsRefreshTimer = setInterval(() => {
    if (document.getElementById('news-view')?.style.display !== 'none') void fetchNews(true);
  }, 5 * 60 * 1000);
}
