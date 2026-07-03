document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('site-header');
  const navCheck = document.getElementById('nav-check');
  const navLinks = document.querySelectorAll('.nav-links a');

  // The menu itself is CSS-only (checkbox); JS just closes it when a link is tapped
  navLinks.forEach(link => link.addEventListener('click', () => {
    navCheck.checked = false;
  }));

  // Header shadow + back-to-top visibility on scroll
  const backToTop = document.getElementById('back-to-top');
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
    backToTop.classList.toggle('visible', window.scrollY > 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Highlight the nav link for the section in view
  // (only sections that have a nav link, so e.g. #join doesn't clear the highlight)
  const navTargets = new Set([...navLinks].map(link => link.getAttribute('href')));
  const sections = [...document.querySelectorAll('section[id]')]
    .filter(section => navTargets.has(`#${section.id}`));
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(section => sectionObserver.observe(section));

  // Reveal-on-scroll animation, staggered for siblings revealed together
  const revealObserver = new IntersectionObserver(entries => {
    entries
      .filter(entry => entry.isIntersecting)
      .forEach((entry, i) => {
        entry.target.style.transitionDelay = `${Math.min(i, 5) * 110}ms`;
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // Animated hero counters
  const animateCount = el => {
    const target = parseInt(el.dataset.count, 10);
    const duration = 1400;
    const start = performance.now();
    const tick = now => {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const statObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.stat-number').forEach(el => statObserver.observe(el));

  // Contact form → FormSubmit relay (works on static hosting);
  // falls back to a pre-filled mailto: if the relay is unreachable.
  const form = document.getElementById('contact-form');
  const formNote = form.querySelector('.form-note');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const message = form.elements.message.value.trim();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    try {
      const res = await fetch('https://formsubmit.co/ajax/leamingtonmarathi@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name, email, message, _subject: 'Website enquiry — Leamington Marathi' }),
      });
      if (!res.ok) throw new Error(`relay responded ${res.status}`);
      form.reset();
      formNote.textContent = 'धन्यवाद! Message sent — we usually reply within a couple of days.';
      submitBtn.textContent = 'Sent ✓';
    } catch {
      // Relay unreachable: open the visitor's mail app with everything pre-filled
      const subject = encodeURIComponent(`Website enquiry from ${name}`);
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
      window.location.href = `mailto:leamingtonmarathi@gmail.com?subject=${subject}&body=${body}`;
      formNote.textContent = 'Opening your email app instead — or write to us at leamingtonmarathi@gmail.com.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    }
  });


  // ---- Festival-aware theming ----
  // Fixed-date festivals recur every year (recurring: true, MM-DD ranges).
  // Lunar festivals move: update their YYYY-MM-DD ranges each January.
  const FESTIVALS = [
    { name: 'Makar Sankranti', recurring: true, ranges: [['01-12', '01-16']],
      emojis: ['🪁', '✨'], greeting: '🪁 मकर संक्रांतीच्या हार्दिक शुभेच्छा! तिळगूळ घ्या, गोड गोड बोला!' },
    { name: 'Shiv Jayanti', recurring: true, ranges: [['02-18', '02-20']],
      emojis: ['🚩'], greeting: '🚩 छत्रपती शिवाजी महाराज जयंतीच्या शुभेच्छा! जय भवानी, जय शिवाजी!' },
    { name: 'Maharashtra Din', recurring: true, ranges: [['04-30', '05-02']],
      emojis: ['🚩'], greeting: '🚩 महाराष्ट्र दिनाच्या हार्दिक शुभेच्छा! जय महाराष्ट्र!' },
    { name: 'Ganeshotsav', ranges: [['2026-09-14', '2026-09-24']],
      emojis: ['🌺', '🌼', '🥁'], greeting: '🌺 गणपती बाप्पा मोरया! गणेशोत्सवाच्या हार्दिक शुभेच्छा!' },
    { name: 'Diwali', ranges: [['2026-11-06', '2026-11-11']],
      emojis: ['🪔', '✨'], greeting: '🪔 दिवाळीच्या हार्दिक शुभेच्छा! शुभ दीपावली!' },
  ];
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isoDate = `${now.getFullYear()}-${mmdd}`;
  const festival = FESTIVALS.find(f =>
    f.ranges.some(([s, e]) => f.recurring ? (mmdd >= s && mmdd <= e) : (isoDate >= s && isoDate <= e)));

  if (festival) {
    // greeting takes the first slot in the What's New ticker
    const tickerList = document.getElementById('ticker-items');
    tickerList.querySelector('.active')?.classList.remove('active');
    const greetItem = document.createElement('li');
    greetItem.className = 'active';
    greetItem.innerHTML = `<a href="#home" class="marathi" lang="mr"></a>`;
    greetItem.firstChild.textContent = festival.greeting;
    tickerList.prepend(greetItem);

    // gently falling festival decorations in the hero
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const float = document.createElement('div');
      float.className = 'festival-float';
      float.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 12; i++) {
        const s = document.createElement('span');
        s.textContent = festival.emojis[i % festival.emojis.length];
        s.style.left = `${i * 8.3 + Math.random() * 5}%`;
        s.style.fontSize = `${1.1 + Math.random() * 1.1}rem`;
        s.style.animationDuration = `${8 + Math.random() * 8}s`;
        s.style.animationDelay = `${Math.random() * 12}s`;
        float.appendChild(s);
      }
      document.querySelector('.hero').appendChild(float);
    }
  }

  // ---- What's New ticker rotation ----
  const tickerEls = document.querySelectorAll('#ticker-items li');
  if (tickerEls.length > 1) {
    let tickerIdx = [...tickerEls].findIndex(li => li.classList.contains('active'));
    setInterval(() => {
      tickerEls[tickerIdx].classList.remove('active');
      tickerIdx = (tickerIdx + 1) % tickerEls.length;
      tickerEls[tickerIdx].classList.add('active');
    }, 5000);
  }

  // Dhol photo grid: four tiles; every few seconds one tile springs to the next photo.
  // Off-screen photos wait in a queue, so no photo ever shows in two tiles at once.
  const dholGrid = document.getElementById('dhol-grid');
  if (dholGrid) {
    const tiles = [...dholGrid.querySelectorAll('.dhol-tile img')];
    const queue = [...dholGrid.querySelectorAll('.dhol-spare')]
      .map(im => ({ src: im.getAttribute('src'), alt: im.alt }));
    let tileIdx = 0;
    const advance = () => {
      const img = tiles[tileIdx];
      const next = queue.shift();
      queue.push({ src: img.getAttribute('src'), alt: img.alt });
      img.classList.add('tile-out');
      setTimeout(() => {
        img.src = next.src;
        img.alt = next.alt;
        void img.offsetWidth; // restart the transition so the new photo springs in
        img.classList.remove('tile-out');
      }, 260);
      tileIdx = (tileIdx + 1) % tiles.length;
    };
    let gridTimer = null;
    const gridReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gridStop = () => { clearInterval(gridTimer); gridTimer = null; };
    const gridStart = () => { if (!gridReduced && !gridTimer) gridTimer = setInterval(advance, 2600); };
    dholGrid.addEventListener('pointerenter', gridStop);
    dholGrid.addEventListener('pointerleave', gridStart);
    queue.forEach(entry => { const pre = new Image(); pre.src = entry.src; }); // warm the spare photos
    new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? gridStart() : gridStop());
    }, { threshold: 0.3 }).observe(dholGrid);
  }

  // Journey procession path: road drawn through the milestones, dhol marker
  // travels along it with scroll, lighting each milestone as it passes
  const procession = document.getElementById('procession');
  if (procession) {
    const roadBase = procession.querySelector('.road-base');
    const roadLine = procession.querySelector('.road-line');
    const marker = document.getElementById('procession-marker');
    const stones = [...procession.querySelectorAll('.p-stone')];
    const processionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let roadLength = 0;
    let waypointLengths = [];

    const buildRoad = () => {
      const width = procession.offsetWidth;
      // waypoint beside each stone, on the side facing the road
      const pts = stones.map((stone, i) => ({
        x: i % 2 === 0 ? stone.offsetLeft + stone.offsetWidth + 28 : stone.offsetLeft - 28,
        y: stone.offsetTop + stone.offsetHeight / 2,
      }));
      const start = { x: width / 2, y: -10 };
      const end = { x: width / 2, y: procession.offsetHeight + 10 };
      const all = [start, ...pts, end];
      let d = `M ${all[0].x} ${all[0].y}`;
      for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1];
        const curr = all[i];
        const midY = (prev.y + curr.y) / 2;
        d += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`;
      }
      roadBase.setAttribute('d', d);
      roadLine.setAttribute('d', d);
      roadLength = roadBase.getTotalLength();
      // map each waypoint to its distance along the road
      waypointLengths = pts.map(pt => {
        let best = 0, bestDist = Infinity;
        for (let s = 0; s <= 300; s++) {
          const len = (roadLength * s) / 300;
          const p = roadBase.getPointAtLength(len);
          const dist = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
          if (dist < bestDist) { bestDist = dist; best = len; }
        }
        return best;
      });
      roadBase.style.strokeDasharray = roadLength;
      roadLine.style.strokeDasharray = roadLength;
      paint();
    };

    const paint = () => {
      const rect = procession.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the section top reaches 80% of the viewport, 1 near its end
      let progress = (vh * 0.8 - rect.top) / (rect.height + vh * 0.3);
      progress = Math.max(0, Math.min(1, progress));
      if (processionReduced) progress = 1;
      const travelled = roadLength * progress;
      roadBase.style.strokeDashoffset = roadLength - travelled;
      roadLine.style.strokeDashoffset = roadLength - travelled;
      const pos = roadBase.getPointAtLength(travelled);
      marker.style.transform = `translate(${pos.x - 23}px, ${pos.y - 23}px)`;
      stones.forEach((stone, i) => stone.classList.toggle('passed', travelled >= waypointLengths[i] - 12));
    };

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { paint(); ticking = false; });
    }, { passive: true });
    let resizeDebounce;
    window.addEventListener('resize', () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(buildRoad, 200);
    });
    buildRoad();
    // rebuild once fonts/images have settled the layout
    window.addEventListener('load', buildRoad, { once: true });
  }

  // ---- Site search: index every section and card, jump-and-highlight on pick ----
  const searchToggle = document.getElementById('search-toggle');
  const searchPanel = document.getElementById('search-panel');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  if (searchToggle) {
    const searchIndex = [];
    document.querySelectorAll('section[id]').forEach(sec => {
      const secTitle = (sec.querySelector('h2')?.textContent
        || sec.id.charAt(0).toUpperCase() + sec.id.slice(1).replace(/-/g, ' ')).trim();
      searchIndex.push({ label: secTitle, text: sec.textContent.toLowerCase(), el: sec, section: secTitle });
      sec.querySelectorAll('h3').forEach(h3 => {
        const card = h3.closest('.timeline-card, .package, .value-card, .testimonial, .contact-info') || h3.parentElement;
        searchIndex.push({
          label: h3.textContent.trim(),
          text: (h3.textContent + ' ' + card.textContent).toLowerCase(),
          el: card,
          section: secTitle,
        });
      });
    });
    searchIndex.push({
      label: 'दिवाळी अंक २०२६ — Diwali Ank',
      text: 'diwali ank magazine articles poems recipes editorial दिवाळी अंक लेख कविता पाककृती बालविभाग संपादकीय',
      href: 'ank.html',
      section: 'Magazine',
    });

    const closeSearch = () => {
      searchPanel.hidden = true;
      searchToggle.setAttribute('aria-expanded', 'false');
    };
    const openSearch = () => {
      searchPanel.hidden = false;
      searchToggle.setAttribute('aria-expanded', 'true');
      searchInput.focus();
    };
    searchToggle.addEventListener('click', () => (searchPanel.hidden ? openSearch() : closeSearch()));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !searchPanel.hidden) closeSearch();
      if (e.key === '/' && searchPanel.hidden && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        openSearch();
      }
    });

    const jumpTo = entry => {
      if (entry.href) { window.location.href = entry.href; return; }
      closeSearch();
      entry.el.style.scrollMarginTop = '110px';
      entry.el.scrollIntoView({ block: entry.el.tagName === 'SECTION' ? 'start' : 'center' });
      entry.el.classList.add('search-highlight');
      setTimeout(() => entry.el.classList.remove('search-highlight'), 2600);
    };

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      searchResults.innerHTML = '';
      if (q.length < 2) return;
      const hits = searchIndex
        .map(entry => ({
          entry,
          score: entry.label.toLowerCase().includes(q) ? 2 : entry.text.includes(q) ? 1 : 0,
        }))
        .filter(h => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      if (!hits.length) {
        const li = document.createElement('li');
        li.className = 'search-empty';
        li.textContent = 'काही सापडलं नाही — nothing found for "' + searchInput.value.trim() + '"';
        searchResults.appendChild(li);
        return;
      }
      hits.forEach(({ entry }) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        const name = document.createElement('span');
        name.textContent = entry.label;
        const chip = document.createElement('span');
        chip.className = 'search-result-section';
        chip.textContent = entry.section;
        btn.append(name, chip);
        btn.addEventListener('click', () => jumpTo(entry));
        li.appendChild(btn);
        searchResults.appendChild(li);
      });
    });
  }

  // Flyer lightbox: tap a flyer to view it full size
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    const lightboxImg = lightbox.querySelector('img');
    document.querySelectorAll('.flyer-card').forEach(card => {
      card.addEventListener('click', () => {
        const img = card.querySelector('img');
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
      });
    });
    const closeLightbox = () => {
      lightbox.hidden = true;
      lightboxImg.src = '';
      document.body.style.overflow = '';
    };
    lightbox.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  // Countdown to the next event (date lives on the hero chip's data-event-date)
  const nextChip = document.querySelector('.hero-next');
  if (nextChip && nextChip.dataset.eventDate) {
    const days = Math.ceil((new Date(nextChip.dataset.eventDate) - Date.now()) / 86400000);
    if (days > 0 && days < 366) {
      const span = document.createElement('span');
      span.className = 'countdown';
      span.textContent = ` · ${days} ${days === 1 ? 'day' : 'days'} to go!`;
      nextChip.appendChild(span);
    }
  }

  // "Register interest" links pre-fill the contact form for that event
  document.querySelectorAll('.rsvp-link').forEach(link => {
    link.addEventListener('click', () => {
      const message = form.elements.message;
      message.value = `Namaskar! We would like to register our interest for ${link.dataset.event}. `
        + `Family of ___ (adults/children). Thank you!`;
    });
  });


  // "Ways to join" cards pre-select the matching option in the Get Involved form
  const wayCards = document.querySelectorAll('.way-card');
  wayCards.forEach(card => {
    card.addEventListener('click', () => {
      const select = document.querySelector('#involved-form select[name="interest"]');
      if (select) select.value = card.dataset.interest;
      wayCards.forEach(c => c.classList.toggle('selected', c === card));
    });
  });

  // Get Involved form → same relay, subject tagged with the chosen interest
  const involvedForm = document.getElementById('involved-form');
  const involvedNote = involvedForm.querySelector('.involved-note');
  involvedForm.addEventListener('submit', async e => {
    e.preventDefault();
    const interest = involvedForm.elements.interest.value;
    const name = involvedForm.elements.name.value.trim();
    const email = involvedForm.elements.email.value.trim();
    const phone = involvedForm.elements.phone.value.trim();
    const comment = involvedForm.elements.comment.value.trim();
    const btn = involvedForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch('https://formsubmit.co/ajax/leamingtonmarathi@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          interest, name, email, phone, comment,
          _subject: `Get Involved — ${interest}`,
        }),
      });
      if (!res.ok) throw new Error(`relay responded ${res.status}`);
      involvedForm.reset();
      involvedNote.textContent = 'धन्यवाद! We’ve got it — we’ll be in touch soon 🎉';
      btn.textContent = 'Sent ✓';
    } catch {
      const body = encodeURIComponent(`Interest: ${interest}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nComment: ${comment}`);
      window.location.href = `mailto:leamingtonmarathi@gmail.com?subject=${encodeURIComponent(`Get Involved — ${interest}`)}&body=${body}`;
      involvedNote.textContent = 'Opening your email app instead — just hit send.';
      btn.disabled = false;
      btn.textContent = 'Count Me In!';
    }
  });



  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();
});
