/* आपला महाराष्ट्र: pins, filter chips, cards and the detail panel; the two
   animated journeys (the map zooms to the route, the road draws itself and a
   marker travels stop by stop); and the children's quiz. All the words live
   in maharashtra-data.js. */
document.addEventListener('DOMContentLoaded', () => {
  const places = window.LM_PLACES || [];
  const routes = window.LM_ROUTES || {};
  const quizPool = window.LM_QUIZ || [];
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('mh-map');
  // Longitude/latitude calibration lives on the svg element (set when the map was traced)
  const C = Object.fromEntries(['x0', 'y0', 'w', 'h', 'lon0', 'lon1', 'lat0', 'lat1'].map(k => [k, parseFloat(svg.dataset[k])]));
  const FULL = svg.dataset.vb.split(' ').map(Number);
  const proj = (lon, lat) => [C.x0 + (lon - C.lon0) / (C.lon1 - C.lon0) * C.w, C.y0 + (C.lat1 - lat) / (C.lat1 - C.lat0) * C.h];
  const CATS = {
    kille: { mr: 'किल्ले', en: 'Forts', icon: '🏯', color: '#a81607' },
    yugpurush: { mr: 'संत आणि युगपुरुष', en: 'Saints and great people', icon: '🙏', color: '#c2470a' },
    devasthan: { mr: 'देवस्थाने', en: 'Temples', icon: '🛕', color: '#a86a00' },
    paryatan: { mr: 'पर्यटन', en: 'Places to visit', icon: '🌄', color: '#1e6b2e' },
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
  const pinsG = document.getElementById('mh-pins');
  const cardsEl = document.getElementById('mh-cards');
  const detail = document.getElementById('mh-detail');
  const chipsEl = document.getElementById('mh-chips');
  const routesEl = document.getElementById('mh-routes');
  const routeBar = document.getElementById('mh-route-bar');
  const replayBtn = routeBar.querySelector('.mh-replay');
  const outline = document.getElementById('mh-outline');
  const MR_DIGITS = '०१२३४५६७८९';
  const mrNum = n => String(n).replace(/\d/g, d => MR_DIGITS[d]);
  // each place gets its own link: maharashtra.html#raigad, #sant-tukaram ...
  const slug = p => p.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const catOf = p => CATS[p.cat] || CATS.kille;

  let viewBox = FULL.slice();
  let current = [];
  let activeIdx = -1;
  let mode = 'cat';
  let route = null, routePath = null, routeBase = null, marker = null;
  let routeLen = 0, stopLens = [], travelRaf = null, vbRaf = null;

  requestAnimationFrame(() => outline.classList.add('drawn'));

  // ---- zooming the map (animated viewBox) ----
  const invScale = () => (viewBox[2] / FULL[2]).toFixed(3); // keeps pins the same size on screen when zoomed
  const rescale = () => {
    const inv = invScale();
    pinsG.querySelectorAll(':scope > g').forEach(g => g.setAttribute('transform', `translate(${g.dataset.x} ${g.dataset.y}) scale(${inv})`));
    if (marker) placeMarker(+marker.dataset.len || 0);
  };
  const setViewBox = vb => {
    viewBox = vb;
    svg.setAttribute('viewBox', vb.map(n => n.toFixed(1)).join(' '));
    rescale();
  };
  const animateViewBox = target => new Promise(resolve => {
    cancelAnimationFrame(vbRaf);
    if (reduced) { setViewBox(target); resolve(); return; }
    const from = viewBox.slice();
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / 750);
      const e = 1 - Math.pow(1 - t, 3);
      setViewBox(from.map((v, i) => v + (target[i] - v) * e));
      if (t < 1) vbRaf = requestAnimationFrame(step); else resolve();
    };
    vbRaf = requestAnimationFrame(step);
  });
  const fitViewBox = pts => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    const padX = (maxX - minX) * 0.3 + 60, padY = (maxY - minY) * 0.3 + 60;
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;
    let w = maxX - minX, h = maxY - minY;
    const ar = FULL[2] / FULL[3];
    if (w / h > ar) { const nh = w / ar; minY -= (nh - h) / 2; h = nh; } else { const nw = h * ar; minX -= (nw - w) / 2; w = nw; }
    return w >= FULL[2] ? FULL.slice() : [minX, minY, w, h];
  };

  // ---- detail panel ----
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
      if (small) {
        wrap.classList.add('mh-tile'); wrap.style.setProperty('--c', catOf(p).color);
        wrap.innerHTML = `<span class="mh-tile-icon">${p.icon || catOf(p).icon}</span>`;
        return wrap;
      }
      wrap.classList.add('mh-band');
      wrap.style.setProperty('--c', catOf(p).color);
      wrap.innerHTML = `<span class="mh-band-icon">${p.icon || catOf(p).icon}</span><span class="mh-band-text">📷 <span lang="mr" class="marathi">इथला तुमचा फोटो आमच्याकडे पाठवा</span><br>Been here? Send us your photo.</span>`;
    }
    return wrap;
  };
  const emptyDetail = () => {
    detail.innerHTML = '<div class="mh-empty"><span class="mh-empty-icon">👆</span><p class="marathi" lang="mr">नकाशावरच्या कुठल्याही खुणेवर किंवा खालच्या कार्डवर टॅप करा.</p><p>Tap any pin or card to read the full story of that place here.</p></div>';
    closeSheet();
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
      <p class="mh-dist"><span lang="mr" class="marathi mh-dist-label"></span> <span lang="mr" class="marathi mh-dist-val"></span></p>
      <p class="mh-text-mr marathi" lang="mr"></p>
      <p class="mh-text-en"></p>`;
    body.querySelector('.mh-name-mr').textContent = p.mr;
    body.querySelector('.mh-name-en').textContent = `${p.icon || CATS[p.cat].icon} ${p.en}`;
    body.querySelector('.mh-dist-label').textContent = p.distLabel || 'जिल्हा:';
    body.querySelector('.mh-dist-val').textContent = p.dist;
    body.querySelector('.mh-text-mr').textContent = p.tmr;
    body.querySelector('.mh-text-en').textContent = p.ten;
    // longer history and a facts strip, where a place has them (the forts do)
    if (p.hmr && p.hmr.length) {
      const more = document.createElement('div');
      more.className = 'mh-more';
      const h = document.createElement('h3');
      h.className = 'mh-more-title';
      h.innerHTML = '<span lang="mr" class="marathi">इतिहास</span> | History';
      more.appendChild(h);
      p.hmr.forEach((para, i) => {
        const pm = document.createElement('p');
        pm.className = 'mh-more-mr marathi';
        pm.lang = 'mr';
        pm.textContent = para;
        more.appendChild(pm);
        if (p.hen && p.hen[i]) {
          const pe = document.createElement('p');
          pe.className = 'mh-more-en';
          pe.textContent = p.hen[i];
          more.appendChild(pe);
        }
      });
      if (p.facts && p.facts.length) {
        const dl = document.createElement('dl');
        dl.className = 'mh-facts';
        p.facts.forEach(([k, v]) => {
          const dt = document.createElement('dt'); dt.lang = 'mr'; dt.className = 'marathi'; dt.textContent = k;
          const dd = document.createElement('dd'); dd.lang = 'mr'; dd.className = 'marathi'; dd.textContent = v;
          dl.append(dt, dd);
        });
        more.appendChild(dl);
      }
      body.appendChild(more);
    }
    detail.appendChild(body);
    // share this place: its own link, straight to WhatsApp
    const link = `https://leamingtonmarathi.com/maharashtra.html#${slug(p)}`;
    const share = document.createElement('div');
    share.className = 'mh-share';
    share.innerHTML = `<a class="mh-share-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(p.mr + ' | ' + p.en + ': ' + link)}">WhatsApp वर पाठवा</a><button type="button" class="mh-share-copy">🔗 लिंक कॉपी करा</button>`;
    share.querySelector('.mh-share-copy').addEventListener('click', e => {
      const b = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => { b.textContent = '✓ लिंक कॉपी झाली'; }, () => { prompt('Copy this link', link); });
    });
    detail.appendChild(share);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mh-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', () => select(-1));
    detail.prepend(close); // first, so on phones it stays pinned at the top of the sliding panel
  };
  // On phones (category view) the story slides up over the page instead of sitting far below the map
  const backdrop = document.createElement('div');
  backdrop.className = 'mh-backdrop';
  document.body.appendChild(backdrop);
  const sheetMode = () => isPhone() && mode === 'cat';
  function openSheet() {
    if (!sheetMode()) return;
    detail.classList.add('open'); backdrop.classList.add('on');
    document.documentElement.classList.add('mh-sheet-lock'); detail.scrollTop = 0;
  }
  function closeSheet() {
    detail.classList.remove('open'); backdrop.classList.remove('on');
    document.documentElement.classList.remove('mh-sheet-lock');
  }
  const hint = document.getElementById('mh-hint');
  const tapped = () => { if (hint) hint.classList.add('gone'); };
  const select = (idx, scroll = true, tap = false) => {
    activeIdx = idx;
    pinsG.querySelectorAll('.mh-pin').forEach(g => g.classList.toggle('active', +g.dataset.i === idx));
    cardsEl.querySelectorAll('.mh-card').forEach(c => c.classList.toggle('active', +c.dataset.i === idx));
    if (idx < 0) { emptyDetail(); if (mode === 'cat') history.replaceState(null, '', location.pathname + location.search); return; }
    fillDetail(current[idx]);
    if (tap) { tapped(); if (mode === 'cat') history.replaceState(null, '', '#' + slug(current[idx])); }
    if (sheetMode()) { if (tap) openSheet(); return; }
    if (scroll && isPhone()) detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  };
  backdrop.addEventListener('click', () => select(-1));

  // ---- pins and cards ----
  const buildPins = (list, color, numbered) => {
    pinsG.innerHTML = '';
    const inv = invScale();
    list.forEach((p, i) => {
      const [x, y] = proj(p.lon, p.lat);
      const outer = document.createElementNS(SVG, 'g');
      outer.dataset.x = (x + (p.dx || 0)).toFixed(1);
      outer.dataset.y = (y + (p.dy || 0)).toFixed(1);
      outer.setAttribute('transform', `translate(${outer.dataset.x} ${outer.dataset.y}) scale(${inv})`);
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', 'mh-pin' + (numbered ? ' numbered' : ''));
      g.dataset.i = i;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${p.mr}, ${p.en}`);
      if (!reduced) g.style.animationDelay = `${i * 55}ms`;
      const ring = document.createElementNS(SVG, 'circle');
      ring.setAttribute('class', 'ring');
      ring.setAttribute('r', '8');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color);
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('class', 'dot');
      dot.setAttribute('r', numbered ? '10' : '7');
      dot.setAttribute('fill', color);
      g.append(ring, dot);
      if (numbered) {
        const num = document.createElementNS(SVG, 'text');
        num.setAttribute('class', 'num');
        num.setAttribute('y', '4');
        num.setAttribute('text-anchor', 'middle');
        num.textContent = mrNum(i + 1);
        g.appendChild(num);
      }
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('class', 'label');
      label.setAttribute('y', numbered ? '-17' : '-13');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('lang', 'mr');
      label.textContent = p.mr;
      g.appendChild(label);
      const act = () => (mode === 'route' ? jumpTo(i) : select(i, true, true));
      g.addEventListener('click', act);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      outer.appendChild(g);
      pinsG.appendChild(outer);
    });
  };
  const buildCards = list => {
    cardsEl.innerHTML = '';
    list.forEach((p, i) => {
      const card = document.createElement('article');
      card.className = 'mh-card';
      card.dataset.i = i;
      card.tabIndex = 0;
      card.appendChild(photoBlock(p, true));
      const body = document.createElement('div');
      body.className = 'mh-card-body';
      body.innerHTML = '<p class="mh-name-mr marathi" lang="mr"></p><p class="mh-name-en"></p><p class="mh-card-text"></p>';
      body.querySelector('.mh-name-mr').textContent = (mode === 'route' ? `${mrNum(i + 1)}. ` : '') + p.mr;
      body.querySelector('.mh-name-en').textContent = p.en;
      body.querySelector('.mh-card-text').textContent = p.ten;
      if (p.hmr && p.hmr.length) {
        const more = document.createElement('p');
        more.className = 'mh-card-more';
        more.innerHTML = '<span lang="mr" class="marathi">पूर्ण इतिहास वाचा</span> →';
        body.appendChild(more);
      }
      card.appendChild(body);
      const act = () => {
        if (mode === 'route') { jumpTo(i); if (isPhone()) detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }
        else select(i, false, true);
      };
      card.addEventListener('click', act);
      card.addEventListener('keydown', e => { if (e.key === 'Enter') act(); });
      cardsEl.appendChild(card);
    });
  };
  const setChips = (catKey, routeKey) => {
    chipsEl.querySelectorAll('.mh-chip').forEach(b => { const on = b.dataset.cat === catKey; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    routesEl.querySelectorAll('.mh-chip').forEach(b => { const on = b.dataset.route === routeKey; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  };

  // ---- category mode ----
  const render = cat => {
    exitRoute();
    mode = 'cat';
    current = places.filter(p => p.cat === cat);
    detail.classList.add('sheet');
    buildPins(current, CATS[cat].color, false);
    buildCards(current);
    select(isPhone() ? -1 : 0, false);
    setChips(cat, null);
    routeBar.hidden = true; videoFig.querySelector('video').pause();
    if (viewBox.join() !== FULL.join()) animateViewBox(FULL.slice());
  };

  // ---- journeys ----
  const clearRouteLayer = () => {
    cancelAnimationFrame(travelRaf);
    [routeBase, routePath, marker].forEach(el => el && el.remove());
    routeBase = routePath = marker = null;
  };
  const exitRoute = () => { if (mode !== 'route') return; clearRouteLayer(); route = null; };
  const placeMarker = len => {
    if (!marker || !routePath) return;
    const L = Math.max(0, Math.min(routeLen, len));
    const pt = routePath.getPointAtLength(L);
    marker.dataset.len = len;
    marker.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) scale(${invScale()})`);
    // the procession turns to face the way it is walking
    const face = marker.querySelector('.mh-face');
    if (face) {
      const ahead = routePath.getPointAtLength(Math.min(routeLen, L + 4));
      const behind = routePath.getPointAtLength(Math.max(0, L - 4));
      face.setAttribute('transform', `scale(${ahead.x >= behind.x ? 1.6 : -1.6} 1.6)`);
    }
  };

  // A little dindi: flag bearers, a woman with the tulsi vrindavan, taal and mridang players.
  // Drawn facing right with the feet at y = 0; CSS makes them walk and the flags wave.
  const el = (tag, attrs) => { const e = document.createElementNS(SVG, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const warkari = (x, kind) => {
    const slot = el('g', { transform: `translate(${x} 0)` });
    const g = el('g', { class: 'mh-warkari' });
    g.append(
      el('path', { d: 'M0 -12 L-4 0 M0 -12 L4 0' }),          // legs
      el('path', { d: 'M0 -12 L0 -24' }),                       // body
      el('circle', { class: 'head', cx: 0, cy: -28, r: 3.4 }),
    );
    if (kind === 'flag') {
      g.append(el('path', { d: 'M0 -21 L5 -15 M5 -15 L5 -48' }), el('polygon', { class: 'flag', points: '5,-48 21,-43 5,-38' }));
    } else if (kind === 'tulsi') {
      g.append(el('path', { d: 'M0 -21 L4 -30 M0 -21 L-4 -30' }), el('rect', { class: 'pot', x: -4.5, y: -37, width: 9, height: 5.5, rx: 1 }), el('circle', { class: 'tulsi', cx: 0, cy: -40, r: 3.6 }));
    } else if (kind === 'taal') {
      g.append(el('path', { d: 'M0 -21 L5 -16 M0 -21 L-5 -16' }), el('circle', { class: 'taal', cx: 5.5, cy: -15.5, r: 2.4 }), el('circle', { class: 'taal', cx: -5.5, cy: -15.5, r: 2.4 }));
    } else if (kind === 'mridang') {
      g.append(el('ellipse', { class: 'mridang', cx: 4, cy: -16, rx: 6.5, ry: 3.6 }), el('path', { d: 'M0 -21 L7 -17 M0 -21 L1 -17' }));
    } else {
      g.append(el('path', { d: 'M0 -21 L4 -14 M0 -21 L-3 -14' }));
    }
    slot.appendChild(g);
    return slot;
  };
  const buildProcession = () => {
    const face = el('g', { class: 'mh-face' });
    [['flag', 34], ['walker', 22], ['tulsi', 10], ['taal', -2], ['mridang', -14], ['walker', -26], ['flag', -38]]
      .forEach(([kind, x]) => face.appendChild(warkari(x, kind)));
    return face;
  };
  const showProgress = len => {
    routePath.style.strokeDashoffset = routeLen - len;
    placeMarker(len);
    const pins = pinsG.querySelectorAll('.mh-pin');
    stopLens.forEach((L, i) => pins[i].classList.toggle('passed', len >= L - 0.5));
  };
  const travel = () => {
    cancelAnimationFrame(travelRaf);
    replayBtn.hidden = true;
    const ms = current.length * 1700;
    const t0 = performance.now();
    let lastStop = -1;
    const step = now => {
      const t = Math.min(1, (now - t0) / ms);
      const len = t * routeLen;
      showProgress(len);
      let reached = -1;
      stopLens.forEach((L, i) => { if (len >= L - 0.5) reached = i; });
      if (reached !== lastStop) { lastStop = reached; select(reached, false); }
      if (t < 1) travelRaf = requestAnimationFrame(step); else replayBtn.hidden = false;
    };
    travelRaf = requestAnimationFrame(step);
  };
  const jumpTo = i => {
    cancelAnimationFrame(travelRaf);
    showProgress(stopLens[i]);
    select(i, false);
    replayBtn.hidden = false;
  };
  // a short clip under the journey's intro (only the wari has one for now)
  const videoFig = routeBar.querySelector('.mh-route-video');
  const showRouteVideo = v => {
    const vid = videoFig.querySelector('video');
    vid.pause();
    videoFig.hidden = !v;
    if (!v) { vid.removeAttribute('src'); vid.load(); return; }
    vid.poster = v.poster;
    vid.src = v.src;
    videoFig.querySelector('figcaption').innerHTML = `<span class="marathi" lang="mr"></span> · Video: <span class="credit"></span>`;
    videoFig.querySelector('.marathi').textContent = v.mr;
    videoFig.querySelector('.credit').textContent = v.credit;
  };
  const renderRoute = async key => {
    clearRouteLayer();
    closeSheet(); detail.classList.remove('sheet');
    mode = 'route';
    route = routes[key];
    // a stop that is also a place on the map (Raigad, Jejuri...) carries that place's full history and facts
    const byName = Object.fromEntries(places.map(pl => [pl.en.toLowerCase(), pl]));
    current = route.stops.map(s => {
      const pl = byName[(s.en || '').toLowerCase().replace(/^back to /, '')] || places.find(pl => pl.mr === s.mr) || {};
      return { hmr: pl.hmr, hen: pl.hen, facts: pl.facts, photo: pl.photo, credit: pl.credit, ...s, icon: route.icon, distLabel: 'केव्हा:', dist: s.when, cat: 'kille' };
    });
    const pts = current.map(s => proj(s.lon, s.lat));
    buildPins(current, route.color, true);
    buildCards(current);
    setChips(null, key);
    routeBar.hidden = false;
    routeBar.querySelector('.mh-route-title').textContent = `${route.icon} ${route.mr} | ${route.en}`;
    routeBar.querySelector('.mh-route-intro').textContent = `${route.imr} ${route.ien}`;
    replayBtn.hidden = true;
    showRouteVideo(route.video);
    const d = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
    routeBase = document.createElementNS(SVG, 'path');
    routeBase.setAttribute('class', 'mh-route-base');
    routeBase.setAttribute('d', d);
    routePath = document.createElementNS(SVG, 'path');
    routePath.setAttribute('class', 'mh-route');
    routePath.setAttribute('d', d);
    routePath.setAttribute('stroke', route.color);
    pinsG.before(routeBase, routePath);
    routeLen = routePath.getTotalLength();
    routePath.style.strokeDasharray = routeLen;
    routePath.style.strokeDashoffset = routeLen;
    stopLens = [0];
    for (let i = 1; i < pts.length; i++) stopLens.push(stopLens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    marker = document.createElementNS(SVG, 'g');
    marker.setAttribute('id', 'mh-marker');
    if (route.marker === 'procession') {
      marker.classList.add('procession');
      marker.appendChild(buildProcession());
    } else {
      const mc = document.createElementNS(SVG, 'circle');
      mc.setAttribute('r', '14');
      mc.setAttribute('stroke', route.color);
      const mt = document.createElementNS(SVG, 'text');
      mt.setAttribute('y', '5');
      mt.setAttribute('text-anchor', 'middle');
      mt.textContent = route.icon;
      marker.append(mc, mt);
    }
    pinsG.after(marker);
    placeMarker(0);
    emptyDetail();
    await animateViewBox(fitViewBox(pts));
    if (mode !== 'route' || !routePath) return; // user switched away during the zoom
    if (reduced) { showProgress(routeLen); select(0, false); replayBtn.hidden = false; } else travel();
  };
  replayBtn.addEventListener('click', () => { if (mode === 'route') { showProgress(0); travel(); } });

  // ---- chips ----
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
  Object.entries(routes).forEach(([key, r]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mh-chip route';
    b.dataset.route = key;
    b.setAttribute('role', 'tab');
    b.innerHTML = `${r.icon} <span lang="mr" class="marathi"></span>`;
    b.querySelector('.marathi').textContent = r.mr;
    b.title = r.en;
    b.addEventListener('click', () => renderRoute(key));
    routesEl.appendChild(b);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && activeIdx >= 0 && mode === 'cat') select(-1); });
  // Opening a shared link (maharashtra.html#raigad) shows that place straight away
  const openFromHash = () => {
    const want = decodeURIComponent(location.hash.slice(1));
    // a whole section: maharashtra.html#kille, #yugpurush, #devasthan, #paryatan, or a journey: #shivaji, #ashtavinayak, #wari
    if (CATS[want] || routes[want]) {
      if (CATS[want]) render(want); else renderRoute(want);
      document.getElementById('mh-map').scrollIntoView({ block: 'start' });
      return true;
    }
    const p = want && places.find(x => slug(x) === want);
    if (!p) return false;
    render(p.cat);
    const i = current.indexOf(p);
    select(i, false, true);
    document.getElementById('mh-map').scrollIntoView({ block: 'start' });
    return true;
  };
  const askedForQuiz = location.hash === '#mh-quiz'; // read first: closing the phone sheet clears the hash
  if (!openFromHash()) render('kille');
  // the quiz is built after the browser's own jump to #mh-quiz, so jump again once it is there
  if (askedForQuiz) setTimeout(() => document.getElementById('mh-quiz')?.scrollIntoView({ block: 'start', behavior: 'instant' }), 150);
  addEventListener('hashchange', openFromHash);

  // ---- quiz ----
  const quizBody = document.getElementById('mh-quiz-body');
  if (quizBody && quizPool.length) {
    const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const startQuiz = () => {
      const qs = shuffle(quizPool).slice(0, 5);
      let i = 0, score = 0;
      const showQ = () => {
        const q = qs[i];
        quizBody.innerHTML = `
          <p class="mh-q-progress"><span lang="mr" class="marathi">प्रश्न ${mrNum(i + 1)} / ${mrNum(qs.length)}</span></p>
          <p class="mh-q-mr marathi" lang="mr"></p>
          <p class="mh-q-en"></p>
          <div class="mh-q-options"></div>
          <p class="mh-q-feedback" role="status" aria-live="polite" hidden></p>
          <button type="button" class="btn btn-primary mh-q-next" hidden></button>`;
        quizBody.querySelector('.mh-q-mr').textContent = q.qmr;
        quizBody.querySelector('.mh-q-en').textContent = q.qen;
        const opts = quizBody.querySelector('.mh-q-options');
        const fb = quizBody.querySelector('.mh-q-feedback');
        const next = quizBody.querySelector('.mh-q-next');
        q.options.forEach(([omr, oen], k) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'mh-q-opt';
          b.innerHTML = '<span lang="mr" class="marathi"></span><span class="mh-q-opt-en"></span>';
          b.querySelector('.marathi').textContent = omr;
          b.querySelector('.mh-q-opt-en').textContent = oen;
          b.addEventListener('click', () => {
            opts.querySelectorAll('button').forEach((x, n) => { x.disabled = true; x.classList.toggle('right', n === q.answer); });
            const ok = k === q.answer;
            if (!ok) b.classList.add('wrong'); else score++;
            fb.textContent = `${ok ? 'बरोबर! ✅' : 'चुकलं. ❌'} ${q.wmr} ${q.wen}`;
            fb.hidden = false;
            next.textContent = i + 1 < qs.length ? 'पुढचा प्रश्न →' : 'निकाल पहा →';
            next.hidden = false;
          });
          opts.appendChild(b);
        });
        next.addEventListener('click', () => { i++; if (i < qs.length) showQ(); else showResult(); });
      };
      const showResult = () => {
        const line = score === qs.length ? 'शाब्बास! सगळे बरोबर! 🎉' : score >= 3 ? 'छान! 👏' : 'हरकत नाही, पुन्हा प्रयत्न करा. 🙂';
        quizBody.innerHTML = `
          <p class="mh-q-score marathi" lang="mr">${mrNum(qs.length)} पैकी ${mrNum(score)}</p>
          <p class="mh-q-line marathi" lang="mr">${line}</p>
          <p class="mh-q-en">You got ${score} out of ${qs.length}.</p>
          <button type="button" class="btn btn-primary mh-q-again">पुन्हा खेळा · Play again</button>`;
        quizBody.querySelector('.mh-q-again').addEventListener('click', startQuiz);
      };
      showQ();
    };
    startQuiz();
  }
});
