document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('site-header');
  const navCheck = document.getElementById('nav-check');
  const navLinks = document.querySelectorAll('.nav-links a');

  // The menu itself is CSS-only (checkbox); JS just closes it when a link is tapped
  navLinks.forEach(link => link.addEventListener('click', () => {
    navCheck.checked = false;
  }));

  // Header shadow on scroll
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
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

  // Newsletter signup → same relay as the contact form, tagged separately
  const newsForm = document.getElementById('newsletter-form');
  const newsNote = document.querySelector('.newsletter-note');
  newsForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = newsForm.elements.email.value.trim();
    const btn = newsForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Adding…';
    try {
      const res = await fetch('https://formsubmit.co/ajax/leamingtonmarathi@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, _subject: 'Newsletter signup — Leamington Marathi' }),
      });
      if (!res.ok) throw new Error(`relay responded ${res.status}`);
      newsForm.reset();
      newsNote.textContent = 'धन्यवाद! You’re on the list 🎉';
      btn.textContent = 'Done ✓';
    } catch {
      window.location.href = `mailto:leamingtonmarathi@gmail.com?subject=${encodeURIComponent('Newsletter signup')}&body=${encodeURIComponent(`Please add ${email} to the event updates list.`)}`;
      newsNote.textContent = 'Opening your email app instead — just hit send.';
      btn.disabled = false;
      btn.textContent = 'Notify Me';
    }
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

  // Photo reel pause/play (hover pause doesn't exist on touch screens)
  const reel = document.querySelector('.photo-marquee');
  const reelToggle = document.getElementById('marquee-toggle');
  reelToggle.addEventListener('click', () => {
    const paused = reel.classList.toggle('paused');
    reelToggle.setAttribute('aria-pressed', String(paused));
    reelToggle.textContent = paused ? '▶ Play' : '⏸ Pause';
  });

  // Clone each marquee group once for the seamless loop (single source list in HTML)
  document.querySelectorAll('.marquee-track').forEach(track => {
    const clone = track.querySelector('.marquee-group').cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
  });

  // Dhol carousel: auto-advance one photo at a time, right to left
  const carousel = document.getElementById('dhol-carousel');
  if (carousel) {
    const slides = [...carousel.children];
    const dotsWrap = document.getElementById('dhol-dots');
    const dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.setAttribute('aria-label', `Go to photo ${i + 1} of ${slides.length}`);
      dot.addEventListener('click', () => { goTo(i); restart(); });
      dotsWrap.appendChild(dot);
      return dot;
    });

    let index = 0;
    let timer = null;

    const goTo = i => {
      index = (i + slides.length) % slides.length;
      const slide = slides[index];
      carousel.scrollTo({
        left: slide.offsetLeft - (carousel.clientWidth - slide.clientWidth) / 2,
        behavior: 'smooth',
      });
      dots.forEach((d, j) => d.classList.toggle('active', j === index));
    };

    // keep the active dot in sync when the visitor swipes manually
    let scrollDebounce;
    carousel.addEventListener('scroll', () => {
      clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(() => {
        const centre = carousel.scrollLeft + carousel.clientWidth / 2;
        let nearest = 0, best = Infinity;
        slides.forEach((s, j) => {
          const dist = Math.abs(s.offsetLeft + s.clientWidth / 2 - centre);
          if (dist < best) { best = dist; nearest = j; }
        });
        index = nearest;
        dots.forEach((d, j) => d.classList.toggle('active', j === index));
      }, 120);
    }, { passive: true });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      if (reducedMotion || timer) return;
      timer = setInterval(() => goTo(index + 1), 3500);
    };
    const restart = () => { stop(); start(); };

    // pause while the visitor is looking closely or touching, resume after
    carousel.addEventListener('pointerenter', stop);
    carousel.addEventListener('pointerleave', start);
    carousel.addEventListener('touchstart', stop, { passive: true });
    carousel.addEventListener('touchend', () => setTimeout(start, 4000), { passive: true });

    // only auto-play while the carousel is on screen
    new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? start() : stop());
    }, { threshold: 0.3 }).observe(carousel);

    dots[0].classList.add('active');
  }

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();
});
