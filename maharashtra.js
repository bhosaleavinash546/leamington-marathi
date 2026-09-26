/* आपला महाराष्ट्र: draws the pins on the map, the filter chips, the cards and
   the detail panel from the data in maharashtra-data.js. */
document.addEventListener('DOMContentLoaded', () => {
  const places = window.LM_PLACES || [];
  const SVG = 'http://www.w3.org/2000/svg';
  // Same projection constants as the outline path in maharashtra.html
  const P = { lon0: 72.4, lat0: 22.3, s: 110, kx: 0.946 };
  const proj = (lon, lat) => [(lon - P.lon0) * P.s * P.kx, (P.lat0 - lat) * P.s];
  const CATS = {
    kille: { mr: 'किल्ले', en: 'Forts', icon: '🏯', color: '#a81607' },
    yugpurush: { mr: 'संत आणि युगपुरुष', en: 'Saints and great people', icon: '🙏', color: '#c2470a' },
    devasthan: { mr: 'देवस्थाने', en: 'Temples', icon: '🛕', color: '#a86a00' },
    paryatan: { mr: 'पर्यटन', en: 'Places to visit', icon: '🌄', color: '#1e6b2e' },
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pinsG = document.getElementById('mh-pins');
  const cardsEl = document.getElementById('mh-cards');
  const detail = document.getElementById('mh-detail');
  const chipsEl = document.getElementById('mh-chips');
  const outline = document.getElementById('mh-outline');
  let current = [];
  let activeIdx = -1;

  // the state outline draws itself once the page has loaded
  requestAnimationFrame(() => outline.classList.add('drawn'));

  const photoBlock = (p, small) => {
    const wrap = document.createElement('div');
    wrap.className = 'mh-photo';
    if (p.photo) {
      const img = document.createElement('img');
      img.src = p.photo;
      img.alt = `${p.en}, ${p.mr}`;
      img.loading = 'lazy';
      wrap.appendChild(img);
    } else {
      wrap.innerHTML = small
        ? '📷 <span lang="mr" class="marathi">फोटो लवकरच</span>'
        : '📷 Photo coming soon. Been here? Send us yours!<br><span lang="mr" class="marathi">इथला तुमचा फोटो आम्हाला पाठवा.</span>';
    }
    return wrap;
  };

  const fillDetail = p => {
    detail.innerHTML = '';
    detail.appendChild(photoBlock(p, false));
    if (p.photo && p.credit) {
      const c = document.createElement('p');
      c.className = 'mh-credit';
      c.textContent = `Photo: ${p.credit}`;
      detail.appendChild(c);
    }
    const body = document.createElement('div');
    body.className = 'mh-detail-body';
    body.innerHTML = `
      <p class="mh-name-mr marathi" lang="mr"></p>
      <p class="mh-name-en"></p>
      <p class="mh-dist"><span lang="mr" class="marathi">जिल्हा:</span> <span lang="mr" class="marathi mh-dist-val"></span></p>
      <p class="mh-text-mr marathi" lang="mr"></p>
      <p class="mh-text-en"></p>`;
    body.querySelector('.mh-name-mr').textContent = p.mr;
    body.querySelector('.mh-name-en').textContent = `${CATS[p.cat].icon} ${p.en}`;
    body.querySelector('.mh-dist-val').textContent = p.dist;
    body.querySelector('.mh-text-mr').textContent = p.tmr;
    body.querySelector('.mh-text-en').textContent = p.ten;
    detail.appendChild(body);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mh-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', () => select(-1));
    detail.appendChild(close);
  };

  const select = idx => {
    activeIdx = idx;
    pinsG.querySelectorAll('.mh-pin').forEach(g => g.classList.toggle('active', +g.dataset.i === idx));
    cardsEl.querySelectorAll('.mh-card').forEach(c => c.classList.toggle('active', +c.dataset.i === idx));
    if (idx < 0) {
      detail.innerHTML = '<div class="mh-photo">🗺️ Tap a pin on the map to see the place here.<br><span class="marathi" lang="mr">नकाशावरची खूण निवडा.</span></div>';
      return;
    }
    fillDetail(current[idx]);
    // on phones the panel sits below the map, so bring it into view
    if (window.matchMedia('(max-width: 900px)').matches) {
      detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    }
  };

  const render = cat => {
    current = places.filter(p => p.cat === cat);
    pinsG.innerHTML = '';
    cardsEl.innerHTML = '';
    current.forEach((p, i) => {
      const [x, y] = proj(p.lon, p.lat);
      const outer = document.createElementNS(SVG, 'g');
      outer.setAttribute('transform', `translate(${(x + (p.dx || 0)).toFixed(1)} ${(y + (p.dy || 0)).toFixed(1)})`);
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', 'mh-pin');
      g.dataset.i = i;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${p.mr}, ${p.en}`);
      if (!reduced) g.style.animationDelay = `${i * 55}ms`;
      const ring = document.createElementNS(SVG, 'circle');
      ring.setAttribute('class', 'ring');
      ring.setAttribute('r', '8');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', CATS[cat].color);
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('class', 'dot');
      dot.setAttribute('r', '7');
      dot.setAttribute('fill', CATS[cat].color);
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('y', '-13');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('lang', 'mr');
      label.textContent = p.mr;
      g.append(ring, dot, label);
      g.addEventListener('click', () => select(i));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
      outer.appendChild(g);
      pinsG.appendChild(outer);

      const card = document.createElement('article');
      card.className = 'mh-card';
      card.dataset.i = i;
      card.tabIndex = 0;
      card.appendChild(photoBlock(p, true));
      const body = document.createElement('div');
      body.className = 'mh-card-body';
      body.innerHTML = '<p class="mh-name-mr marathi" lang="mr"></p><p class="mh-name-en"></p><p class="mh-card-text"></p>';
      body.querySelector('.mh-name-mr').textContent = p.mr;
      body.querySelector('.mh-name-en').textContent = p.en;
      body.querySelector('.mh-card-text').textContent = p.ten;
      card.appendChild(body);
      card.addEventListener('click', () => { select(i); if (window.matchMedia('(max-width: 900px)').matches) detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); });
      card.addEventListener('keydown', e => { if (e.key === 'Enter') select(i); });
      cardsEl.appendChild(card);
    });
    select(-1);
    chipsEl.querySelectorAll('.mh-chip').forEach(b => {
      const on = b.dataset.cat === cat;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
  };

  Object.entries(CATS).forEach(([key, c]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mh-chip';
    b.dataset.cat = key;
    b.setAttribute('role', 'tab');
    b.innerHTML = `${c.icon} <span lang="mr" class="marathi"></span> <span class="count"></span>`;
    b.querySelector('.marathi').textContent = c.mr;
    b.querySelector('.count').textContent = places.filter(p => p.cat === key).length;
    b.title = c.en;
    b.addEventListener('click', () => render(key));
    chipsEl.appendChild(b);
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && activeIdx >= 0) select(-1); });
  render('kille');
});
