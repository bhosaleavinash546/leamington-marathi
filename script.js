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

  // Photo reel pause/play (hover pause doesn't exist on touch screens)
  const reel = document.querySelector('.photo-marquee');
  const reelToggle = document.getElementById('marquee-toggle');
  reelToggle.addEventListener('click', () => {
    const paused = reel.classList.toggle('paused');
    reelToggle.setAttribute('aria-pressed', String(paused));
    reelToggle.textContent = paused ? '▶ Play' : '⏸ Pause';
  });

  // Clone the marquee group once for the seamless loop (single source list in HTML)
  const marqueeTrack = document.querySelector('.marquee-track');
  if (marqueeTrack) {
    const clone = marqueeTrack.querySelector('.marquee-group').cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    marqueeTrack.appendChild(clone);
  }

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();
});
