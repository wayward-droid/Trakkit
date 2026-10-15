/* Lightweight interaction layer: pointer-responsive surfaces, reveal-on-scroll and menu ergonomics. */
(() => {
  const body = document.body;
  body.dataset.motionReady = 'true';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const surfaces = [...document.querySelectorAll('.metric, .panel, .auth-box')];
  surfaces.forEach((surface, index) => {
    surface.dataset.reveal = '';
    surface.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`;
    surface.addEventListener('pointermove', (event) => {
      if (reduceMotion || event.pointerType === 'touch') return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
      surface.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    }, { passive: true });
  });

  if ('IntersectionObserver' in window && !reduceMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    surfaces.forEach((surface) => observer.observe(surface));
  } else {
    surfaces.forEach((surface) => surface.classList.add('is-visible'));
  }

  // Keep action menus from staying open after choosing an item or clicking outside.
  document.querySelectorAll('.export-menu').forEach((menu) => {
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
    menu.querySelectorAll('.export-menu-panel button, .export-menu-panel a').forEach((item) => {
      item.addEventListener('click', () => menu.removeAttribute('open'));
    });
  });

  // Keyboard users can expand the icon rail using focus; Escape returns focus to the page.
  document.querySelectorAll('.sidebar a, .sidebar button').forEach((item) => {
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') item.blur();
    });
  });
})();
